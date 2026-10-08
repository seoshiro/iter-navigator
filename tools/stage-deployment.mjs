import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, realpath, readdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const cloudTests = args.at(-1) === '--cloud-tests';
if (cloudTests) args.pop();
const [rawTarget, rawRender, rawPublic, ...extra] = args;
if (!rawTarget || extra.length || !isAbsolute(rawTarget)) throw new Error('Usage: node tools/stage-deployment.mjs <new-absolute-directory> [verified-Render-origin verified-public-origin] [--cloud-tests]');
const target = resolve(rawTarget);
if (target === root || target.startsWith(root + sep) || root.startsWith(target + sep)) throw new Error('Snapshot must be outside the source repository.');
let targetPresent = false;
try { await stat(target); targetPresent = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (targetPresent) throw new Error('Snapshot target must not exist.');
function origin(raw, suffix) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.hostname.includes('*') || url.origin !== raw || url.pathname !== '/' || url.search || url.hash || url.username || url.password || url.port || (suffix && !url.hostname.endsWith(suffix))) throw new Error('Only an exact verified HTTPS origin is accepted.');
  return url.origin;
}
if (Boolean(rawRender) !== Boolean(rawPublic)) throw new Error('Both verified origins are required together.');
const render = rawRender ? origin(rawRender, '.onrender.com') : null;
const publicOrigin = rawPublic ? origin(rawPublic) : null;
const exactFiles = ['index.html', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vite.config.ts', 'render.yaml', 'shared/report-contract.ts', 'server/http.ts', 'server/paths.ts', 'server/validation.ts', 'server/report-store.ts', 'server/public-boundary.ts', 'server/postgres-repository.ts', 'server/postgres-schema.sql', 'server/public-main.ts', 'docs/deployment.md'];
if (cloudTests) exactFiles.push('server/postgres.test.ts', 'server/postgres-test-worker.ts', 'tools/test-postgres.mjs', 'tools/stage-deployment.mjs', 'tools/vercel-proxy.mjs');
const directories = ['src', 'public'];
const files = [...exactFiles];
async function collect(directory) {
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = directory + '/' + entry.name;
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) throw new Error('Snapshot refuses links or hidden source entries.');
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile() && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
  }
}
for (const directory of directories) await collect(directory);
files.sort();
const records = [];
// Audit everything before creating the target; copying cannot include hidden local state.
for (const path of files) {
  const source = resolve(root, path); const canonical = await realpath(source);
  if (!canonical.startsWith(await realpath(root) + sep)) throw new Error('Snapshot source escaped repository.');
  const data = await readFile(source);
  let scanned = data.toString('utf8');
  if (cloudTests && path === 'server/postgres.test.ts') {
    // Preserve only the existing obvious synthetic URI fixtures; real credentials still fail.
    scanned = scanned.replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g, value => {
      try {
        const fixture = new URL(value);
        if (fixture.username === 'synthetic' && fixture.password === 'synthetic' && ['ep-example.neon.tech', '127.0.0.1'].includes(fixture.hostname) && fixture.pathname === '/iter_synthetic_unit') return '__SYNTHETIC_UNIT_FIXTURE__';
      } catch { /* Invalid fixture text remains subject to the credential scan. */ }
      return value;
    });
  }
  if (/\.(?:ts|tsx|js|mjs|json|html|yaml|md)$/.test(path) && /postgres(?:ql)?:\/\/|(?:sk|ghp|gho|github_pat)_[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|NAVIGATOR_PROXY_SECRET\s*[:=]\s*['"][A-Za-z0-9_-]{43,}/.test(scanned)) throw new Error(`Credential-like content refused in ${path}`);
  records.push({ path, sha256: createHash('sha256').update(data).digest('hex') });
}
await mkdir(target);
for (const path of files) { await mkdir(dirname(resolve(target, path)), { recursive: true }); await cp(resolve(root, path), resolve(target, path), { dereference: false, force: false, errorOnExist: true }); }
// A deployment manifest and package contain only deployable scripts and dependencies.
const packagePath = resolve(target, 'package.json'); const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
packageJson.scripts = { build: 'node node_modules/typescript7/bin/tsc --noEmit && vite build', 'start:public': 'node server/public-main.ts' };
if (cloudTests) packageJson.scripts['test:postgres'] = 'node tools/test-postgres.mjs';
await writeFile(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
const tsconfigPath = resolve(target, 'tsconfig.json'); const tsconfig = JSON.parse(await readFile(tsconfigPath, 'utf8')); tsconfig.include = ['src', 'shared', 'server', 'vite.config.ts'];
await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
if (render) {
  await mkdir(resolve(target, 'api'));
  const proxy = (await readFile(resolve(root, 'tools/vercel-proxy.mjs'), 'utf8')).replace('__VERIFIED_RENDER_ORIGIN__', render);
  await writeFile(resolve(target, 'api/[...path].mjs'), proxy);
  await writeFile(resolve(target, 'vercel.json'), JSON.stringify({ framework: 'vite', env: { NODEJS_HELPERS: '0' }, buildCommand: 'npx --yes pnpm@11.19.0 run build', installCommand: 'npx --yes pnpm@11.19.0 install --frozen-lockfile', outputDirectory: 'dist', functions: { 'api/[...path].mjs': { maxDuration: 10 } }, headers: [{ source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Frame-Options', value: 'DENY' }] }] }, null, 2) + '\n');
}
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
const staged = [];
async function recordStaged(directory = '') {
  for (const entry of await readdir(resolve(target, directory), { withFileTypes: true })) {
    const path = directory ? directory + '/' + entry.name : entry.name;
    if (entry.isDirectory()) await recordStaged(path);
    else staged.push({ path, sha256: createHash('sha256').update(await readFile(resolve(target, path))).digest('hex') });
  }
}
await recordStaged();
await writeFile(resolve(target, 'deployment-snapshot.json'), JSON.stringify({ sourceRevision: revision.status === 0 ? revision.stdout.trim() : null, generatedAt: new Date().toISOString(), renderOrigin: render, publicOrigin, hostedConfiguration: Boolean(render), cloudTests, sourceFiles: records, snapshotFiles: staged.sort((a,b) => a.path.localeCompare(b.path)) }, null, 2) + '\n');
await writeFile(resolve(target, '.gitignore'), 'node_modules/\ndist/\n.env*\n.vercel/\n');
for (const args of [['init', '--initial-branch=main'], ['add', '.'], ['-c', 'user.name=Iter deployment snapshot', '-c', 'user.email=iter-snapshot@localhost', 'commit', '-m', 'Initial allowlisted Iter public demo snapshot']]) {
  const result = spawnSync('git', args, { cwd: target, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Fresh deployment history creation failed.');
}
console.log(JSON.stringify({ snapshot: target, files: records.length, hostedConfiguration: Boolean(render), cloudTests, privateHistoryCopied: false, credentialsCopied: false }));

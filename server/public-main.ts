import { createJournalServer } from './http.ts';
import { PostgresReportRepository } from './postgres-repository.ts';
import { publicBoundary } from './public-boundary.ts';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major !== 24 || minor! < 19) { console.error('unsupported_runtime'); process.exit(1); }
const rawPort = process.env.PORT;
if (!rawPort || !/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65_535) { console.error('invalid_port'); process.exit(1); }
let boundary: ReturnType<typeof publicBoundary>;
let repository: PostgresReportRepository;
try {
  if (process.env.NAVIGATOR_DEDICATED_DATABASE !== 'iter-public-demo') throw new Error();
  boundary = publicBoundary({ renderOrigin: process.env.RENDER_EXTERNAL_URL ?? '', publicOrigin: process.env.NAVIGATOR_PUBLIC_ORIGIN ?? '', proxySecret: process.env.NAVIGATOR_PROXY_SECRET ?? '' });
  repository = await PostgresReportRepository.open(process.env.DATABASE_URL);
} catch { console.error('public_configuration_or_storage_unavailable'); process.exit(1); }
const server = createJournalServer({ repository, hostedBoundary: boundary });
server.on('error', () => { console.error('server_unavailable'); void repository.close().finally(() => { process.exitCode = 1; }); });
server.listen(Number(rawPort), '0.0.0.0', () => console.log('Iter public demonstration service ready.'));
let closing = false;
function shutdown() {
  if (closing) return; closing = true;
  server.close(() => { void repository.close().finally(() => { process.exitCode = 0; }); });
  const timer = setTimeout(() => server.closeAllConnections(), 2_000); timer.unref();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

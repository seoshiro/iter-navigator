import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { REPORT_BUILDING_ID, REPORT_ERRORS, REPORT_LIMITS, REPORT_SERVICE_META_NAME, REPORT_SERVICE_META_VALUE } from '../shared/report-contract.ts';
import type { ReportStore } from './report-store.ts';
import type { IncomingMessage as BoundaryRequest } from 'node:http';
import { JournalError, safeError, validateCreate, validatePage } from './validation.ts';
import { DIST_ROOT } from './paths.ts';

export function allowedHosts(port: number): ReadonlySet<string> { return new Set([`127.0.0.1:${port}`, `localhost:${port}`]); }
function headerValues(request: IncomingMessage, name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) if (request.rawHeaders[index]?.toLowerCase() === name) values.push(request.rawHeaders[index + 1]!);
  return values;
}
export function checkBoundary(request: IncomingMessage, port: number, mutation: boolean, api: boolean): void {
  const hosts = headerValues(request, 'host');
  if (hosts.length !== 1 || !allowedHosts(port).has(hosts[0]!)) throw new JournalError('forbidden');
  if (!api) return;
  const sites = headerValues(request, 'sec-fetch-site');
  if (sites.length > 1 || (sites.length === 1 && !['same-origin', 'none'].includes(sites[0]!))) throw new JournalError('forbidden');
  const origins = headerValues(request, 'origin');
  if ((mutation && origins.length !== 1) || origins.length > 1 || (origins.length === 1 && origins[0] !== `http://${hosts[0]}`)) throw new JournalError('forbidden');
}
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
}
function failure(response: ServerResponse, error: unknown): void {
  if (response.headersSent || response.destroyed) return;
  const { code } = safeError(error);
  response.setHeader('Connection', 'close');
  if (code === 'rate_limited') response.setHeader('Retry-After', '60');
  json(response, REPORT_ERRORS[code].status, { error: { code, message: REPORT_ERRORS[code].message } });
}
async function readBody(request: IncomingMessage): Promise<unknown> {
  const types = headerValues(request, 'content-type');
  if (types.length !== 1 || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(types[0]!)) throw new JournalError('unsupported_media_type');
  if (headerValues(request, 'content-encoding').length) throw new JournalError('unsupported_media_type');
  const length = request.headers['content-length'];
  if (length && (!/^\d+$/.test(length) || Number(length) > REPORT_LIMITS.bodyBytes)) throw new JournalError('payload_too_large');
  const bytes = await new Promise<Buffer>((accept, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    const timeout = setTimeout(() => { cleanup(); reject(new JournalError('invalid_input')); }, 5_000);
    function cleanup() { clearTimeout(timeout); request.off('data', data); request.off('end', end); request.off('aborted', aborted); request.off('error', aborted); }
    function data(chunk: Buffer) {
      size += chunk.length;
      if (size > REPORT_LIMITS.bodyBytes) { cleanup(); request.pause(); reject(new JournalError('payload_too_large')); return; }
      chunks.push(chunk);
    }
    function end() { cleanup(); accept(Buffer.concat(chunks, size)); }
    function aborted() { cleanup(); reject(new JournalError('invalid_input')); }
    request.on('data', data); request.once('end', end); request.once('aborted', aborted); request.once('error', aborted);
  });
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new JournalError('invalid_input'); }
}
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
async function staticFile(request: IncomingMessage, response: ServerResponse, pathname: string, distRoot: string): Promise<void> {
  if (!['GET', 'HEAD'].includes(request.method ?? '')) throw new JournalError('method_not_allowed');
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { throw new JournalError('not_found'); }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').some(segment => segment.startsWith('.'))) throw new JournalError('not_found');
  const relative = decoded === '/' ? 'index.html' : decoded.slice(1);
  try {
    const root = await realpath(distRoot);
    const target = await realpath(resolve(root, relative));
    const extension = extname(target).toLowerCase();
    if (!target.startsWith(root + sep) || !mime[extension]) throw new JournalError('not_found');
    const canonicalIndex = await realpath(resolve(root, 'index.html'));
    const index = process.platform === 'win32' ? target.toLowerCase() === canonicalIndex.toLowerCase() : target === canonicalIndex;
    const bytes = await readFile(target);
    const body = index ? Buffer.from(bytes.toString('utf8').replace('</head>', `<meta name="${REPORT_SERVICE_META_NAME}" content="${REPORT_SERVICE_META_VALUE}"></head>`)) : bytes;
    response.writeHead(200, { 'Content-Type': mime[extension]!, 'Cache-Control': index ? 'no-store' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', ...(extension === '.html' ? { 'X-Frame-Options': 'DENY' } : {}), 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) { if (error instanceof JournalError) throw error; throw new JournalError('not_found'); }
}
export function createJournalServer(options: { repository: ReportStore | null; distRoot?: string; hostedBoundary?: (request: BoundaryRequest, mutation: boolean) => void }) {
  let readers = 0; const writes: number[] = [];
  const allowNew = () => {
    const now = Date.now(); while (writes[0] !== undefined && writes[0] <= now - 60_000) writes.shift();
    if (writes.length >= REPORT_LIMITS.writesPerMinute) return false;
    writes.push(now); return true;
  };
  const server = createServer({ headersTimeout: 5_000, requestTimeout: 10_000, keepAliveTimeout: 2_000, connectionsCheckingInterval: 1_000, maxHeaderSize: 8_192 }, (request, response) => {
    void (async () => {
      const address = server.address(); if (!address || typeof address === 'string') throw new JournalError('forbidden');
      if (!request.url?.startsWith('/') || request.url.startsWith('//')) throw new JournalError('invalid_input');
      const url = new URL(request.url, 'http://127.0.0.1');
      const api = url.pathname === '/api' || url.pathname.startsWith('/api/');
      if (options.hostedBoundary) {
        if (url.pathname === '/healthz' && request.method === 'GET' && !url.search) { json(response, 200, { ready: true }); return; }
        options.hostedBoundary(request, request.method !== 'GET' && request.method !== 'HEAD');
        if (!api) throw new JournalError('not_found');
      } else checkBoundary(request, address.port, request.method !== 'GET' && request.method !== 'HEAD', api);
      if (!api) { await staticFile(request, response, url.pathname, options.distRoot ?? DIST_ROOT); return; }
      if (url.pathname === '/api/health') {
        if (request.method !== 'GET') throw new JournalError('method_not_allowed');
        if (url.search) throw new JournalError('invalid_input');
        json(response, 200, { mode: options.hostedBoundary ? 'public-demo' : 'local-demo', buildingId: REPORT_BUILDING_ID }); return;
      }
      if (url.pathname !== '/api/reports') throw new JournalError('not_found');
      if (request.method === 'GET') {
        const query = validatePage(url.searchParams);
        if (!options.repository) throw new JournalError('storage_unavailable');
        json(response, 200, await options.repository.list(query)); return;
      }
      if (request.method !== 'POST') throw new JournalError('method_not_allowed');
      if (url.search) throw new JournalError('invalid_input');
      if (readers >= REPORT_LIMITS.bodyReaders) throw new JournalError('rate_limited');
      readers++;
      let payload: unknown;
      try { payload = validateCreate(await readBody(request)); } finally { readers--; }
      if (!options.repository) throw new JournalError('storage_unavailable');
      const result = await options.repository.create(payload, options.hostedBoundary ? undefined : allowNew);
      json(response, result.replayed ? 200 : 201, result);
    })().catch(error => failure(response, error));
  });
  server.maxConnections = REPORT_LIMITS.connections;
  server.maxRequestsPerSocket = 100;
  server.on('clientError', (_error, socket) => {
    if (socket.writable) {
      const body = JSON.stringify({ error: { code: 'invalid_input', message: REPORT_ERRORS.invalid_input.message } });
      socket.end(`HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    } else socket.destroy();
  });
  return server;
}

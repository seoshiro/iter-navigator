// Replaced only by stage-deployment.mjs after the Render URL is verified.
const RENDER_ORIGIN = '__VERIFIED_RENDER_ORIGIN__';
const errors = {
  forbidden: [403, 'Request is not allowed.'],
  invalid_input: [400, 'Invalid report input.'],
  not_found: [404, 'Resource not found.'],
  method_not_allowed: [405, 'Method is not allowed.'],
  payload_too_large: [413, 'Request body is too large.'],
  unsupported_media_type: [415, 'JSON content type is required.'],
  storage_unavailable: [503, 'Local report storage is unavailable.'],
};
function fail(response, code) {
  const [status, message] = errors[code];
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify({ error: { code, message } }));
}
function header(request, name) {
  const values = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) if (request.rawHeaders[index].toLowerCase() === name) values.push(request.rawHeaders[index + 1]);
  if (values.length > 1) throw new Error('forbidden');
  return values[0];
}
async function boundedBody(request) {
  return new Promise((accept, reject) => {
    const chunks = []; let size = 0;
    const timer = setTimeout(() => { cleanup(); request.pause(); reject(new Error('invalid_input')); }, 5_000);
    function cleanup() { clearTimeout(timer); request.off('data', data); request.off('end', end); request.off('aborted', aborted); request.off('error', aborted); }
    function data(chunk) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 4096) { cleanup(); request.pause(); reject(new Error('payload_too_large')); return; } chunks.push(bytes); }
    function end() { cleanup(); accept(Buffer.concat(chunks)); }
    function aborted() { cleanup(); reject(new Error('invalid_input')); }
    request.on('data', data); request.once('end', end); request.once('aborted', aborted); request.once('error', aborted);
  });
}
export default async function proxy(request, response) {
  try {
    const publicUrl = new URL(process.env.NAVIGATOR_PUBLIC_ORIGIN ?? '');
    const secret = process.env.NAVIGATOR_PROXY_SECRET ?? '';
    if (publicUrl.protocol !== 'https:' || publicUrl.hostname.includes('*') || publicUrl.origin !== process.env.NAVIGATOR_PUBLIC_ORIGIN || !/^[A-Za-z0-9_-]{43,128}$/.test(secret)) throw new Error('storage_unavailable');
    if (header(request, 'host') !== publicUrl.host) throw new Error('forbidden');
    const origin = header(request, 'origin'); const site = header(request, 'sec-fetch-site');
    if ((request.method === 'POST' && origin === undefined) || (origin !== undefined && origin !== publicUrl.origin) || (site !== undefined && !['same-origin', 'none'].includes(site))) throw new Error('forbidden');
    // Client-supplied proxy authorization is never forwarded or accepted.
    if (header(request, 'x-iter-proxy-key') !== undefined || header(request, 'x-iter-public-host') !== undefined || header(request, 'forwarded') !== undefined) throw new Error('forbidden');
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) throw new Error('invalid_input');
    const url = new URL(request.url, 'http://127.0.0.1');
    // Match the handler's route, method and query precedence before reading a body.
    if (url.pathname !== '/api/reports' && url.pathname !== '/api/health') throw new Error('not_found');
    if (url.pathname === '/api/health' ? request.method !== 'GET' : !['GET', 'POST'].includes(request.method)) throw new Error('method_not_allowed');
    if (url.search && (url.pathname === '/api/health' || request.method === 'POST')) throw new Error('invalid_input');
    const headers = { 'x-iter-proxy-key': secret, 'x-iter-public-host': publicUrl.host };
    if (origin !== undefined) headers.origin = origin;
    if (site !== undefined) headers['sec-fetch-site'] = site;
    let body;
    if (request.method === 'POST') {
      const type = header(request, 'content-type');
      if (!type || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type) || header(request, 'content-encoding') !== undefined) throw new Error('unsupported_media_type');
      const length = header(request, 'content-length');
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > 4096)) throw new Error('payload_too_large');
      body = await boundedBody(request); headers['content-type'] = 'application/json';
    }
    const upstream = await fetch(RENDER_ORIGIN + request.url, { method: request.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(7_000), cache: 'no-store' });
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(upstream.headers.get('content-type') ?? '')) throw new Error('storage_unavailable');
    const length = Number(upstream.headers.get('content-length') ?? 0);
    if (length > 150_000) throw new Error('storage_unavailable');
    const chunks = []; let size = 0;
    for await (const chunk of upstream.body ?? []) { size += chunk.length; if (size > 150_000) throw new Error('storage_unavailable'); chunks.push(Buffer.from(chunk)); }
    response.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(upstream.status === 429 ? { 'Retry-After': '60' } : {}) });
    response.end(Buffer.concat(chunks));
  } catch (error) {
    if (error?.message === 'forbidden') console.warn('iter_proxy_boundary', { hostMatches: request.headers.host === new URL(process.env.NAVIGATOR_PUBLIC_ORIGIN).host, originMatches: request.headers.origin === undefined || request.headers.origin === process.env.NAVIGATOR_PUBLIC_ORIGIN, siteMatches: request.headers['sec-fetch-site'] === undefined || ['same-origin', 'none'].includes(request.headers['sec-fetch-site']), proxyHeadersPresent: request.headers['x-iter-proxy-key'] !== undefined || request.headers['x-iter-public-host'] !== undefined, forwardedPresent: request.headers.forwarded !== undefined });
    fail(response, Object.hasOwn(errors, error?.message) ? error.message : 'storage_unavailable');
  }
}
// The generated deployment sets NODEJS_HELPERS=0 for the original IncomingMessage stream.

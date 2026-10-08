import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { JournalError } from './validation.ts';

export function singleHeader(request: IncomingMessage, name: string): string | undefined {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) values.push(request.rawHeaders[index + 1]!);
  }
  if (values.length > 1) throw new JournalError('forbidden');
  return values[0];
}
export function httpsOrigin(raw: string | undefined, suffix?: string): URL {
  try {
    const url = new URL(raw ?? '');
    if (url.protocol !== 'https:' || url.hostname.includes('*') || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || url.origin !== raw || (suffix && !url.hostname.endsWith(suffix))) throw new Error();
    return url;
  } catch { throw new JournalError('forbidden'); }
}
export interface PublicBoundary { renderOrigin: string; publicOrigin: string; proxySecret: string }
export function publicBoundary(options: PublicBoundary) {
  const render = httpsOrigin(options.renderOrigin, '.onrender.com');
  const frontend = httpsOrigin(options.publicOrigin);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(options.proxySecret)) throw new JournalError('forbidden');
  const expected = Buffer.from(options.proxySecret);
  return (request: IncomingMessage, mutation: boolean) => {
    if (singleHeader(request, 'host') !== render.host) throw new JournalError('forbidden');
    const supplied = Buffer.from(singleHeader(request, 'x-iter-proxy-key') ?? '');
    // Compare a fixed-size candidate even when the supplied value has the wrong length.
    const candidate = Buffer.alloc(expected.length); supplied.copy(candidate, 0, 0, expected.length);
    if (!timingSafeEqual(candidate, expected) || supplied.length !== expected.length) throw new JournalError('forbidden');
    if (singleHeader(request, 'x-iter-public-host') !== frontend.host || singleHeader(request, 'x-forwarded-proto') !== 'https') throw new JournalError('forbidden');
    // These are not part of the authenticated proxy protocol. Never infer origins from them.
    for (const name of ['forwarded', 'x-forwarded-host', 'x-original-host', 'x-original-url', 'x-rewrite-url']) if (singleHeader(request, name) !== undefined) throw new JournalError('forbidden');
    const origin = singleHeader(request, 'origin');
    if ((mutation && origin === undefined) || (origin !== undefined && origin !== frontend.origin)) throw new JournalError('forbidden');
    const site = singleHeader(request, 'sec-fetch-site');
    if (site !== undefined && !['same-origin', 'none'].includes(site)) throw new JournalError('forbidden');
  };
}

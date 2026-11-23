import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createJournalServer } from '../server/http.ts';
import { JournalError } from '../server/validation.ts';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { login, moderatorConfiguration, requireModerator } from '../server/moderator-auth.ts';
import proxy from '../server/vercel-proxy.mjs';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('moderator credentials', () => {
  it('reports only fixed private configuration states without changing the key requirements', () => {
    const owner = randomBytes(32).toString('hex');
    const proxyKey = randomBytes(32).toString('base64url');
    expect(moderatorConfiguration(undefined, proxyKey)).toBe('missing');
    expect(moderatorConfiguration('', proxyKey)).toBe('missing');
    for (const invalid of ['short', 'a'.repeat(129), ' ' + owner, owner + '=', '\x22' + owner + '\x22']) {
      expect(moderatorConfiguration(invalid, proxyKey)).toBe('invalid_format');
    }
    expect(moderatorConfiguration(proxyKey, proxyKey)).toBe('not_distinct');
    expect(moderatorConfiguration(owner, proxyKey)).toBe('ready');
  });

  it('is disabled without a strong key and rejects a key as a session token', () => {
    const key = randomBytes(32).toString('base64url');
    for (const secret of [undefined, '', 'short']) expect(() => login(secret, 'Bearer ' + secret)).toThrow();
    expect(() => login(key, undefined)).toThrow();
    expect(() => requireModerator(key, 'Bearer ' + key)).toThrow();
    const session = login(key, 'Bearer ' + key);
    requireModerator(key, 'Bearer ' + session.token);
    expect(() => requireModerator(randomBytes(32).toString('base64url'), 'Bearer ' + session.token)).toThrow();
    vi.useFakeTimers(); vi.setSystemTime(session.expiresAt);
    expect(() => requireModerator(key, 'Bearer ' + session.token)).toThrow();
  });

  it('keeps diagnostics private and preserves identical forbidden responses at each stage', async () => {
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => {});
    const key = randomBytes(32).toString('hex');
    const server = createJournalServer({ repository: null, moderatorSecret: key, hostedBoundary(request) {
      if (request.headers.origin !== 'https://fixture.example') throw new JournalError('forbidden');
    } });
    server.listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No test port');
      const url = 'http://127.0.0.1:' + address.port + '/api/moderation-session';
      const attempt = (headers: Record<string, string>) => fetch(url, { method: 'POST',
        headers: { origin: 'https://fixture.example', 'content-type': 'application/json', ...headers }, body: '{}' });
      const rejected = [await attempt({ origin: 'https://other.invalid' }), await attempt({}),
        await attempt({ authorization: 'Bearer ' + randomBytes(32).toString('hex') })];
      for (const response of rejected) {
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: { code: 'forbidden', message: 'Request is not allowed.' } });
      }
      expect((await attempt({ authorization: 'Bearer ' + key })).status).toBe(200);
      expect(diagnostic.mock.calls).toEqual([['moderator_denied=render_boundary'],
        ['moderator_denied=authorization_absent'], ['moderator_denied=credential_check']]);
    } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); diagnostic.mockRestore(); }
  });

  it('only forwards moderator authorization on protected routes through the fixed upstream', async () => {
    const origin = 'https://iter-fixture.example';
    const key = randomBytes(32).toString('base64url');
    const authorization = 'Bearer ' + randomBytes(32).toString('base64url');
    vi.stubEnv('NAVIGATOR_PUBLIC_ORIGIN', origin);
    vi.stubEnv('NAVIGATOR_PROXY_SECRET', key);
    const upstream = vi.fn(async () => Response.json({}));
    vi.stubGlobal('fetch', upstream);
    async function call(url: string, method: string, extra: string[] = []) {
      const req = Object.assign(Readable.from(method === 'POST' ? [Buffer.from('{}')] : []), {
        url, method, rawHeaders: ['Host', 'iter-fixture.example', 'Origin', origin, 'Authorization', authorization,
          'Content-Type', 'application/json', ...extra],
      });
      const res = { writeHead: vi.fn(), end: vi.fn() };
      await proxy(req, res);
      return res.writeHead.mock.calls[0]?.[0];
    }
    for (const [path, method, auth] of [
      ['/api/moderation?limit=10', 'GET', true], ['/api/moderation', 'POST', true],
      ['/api/moderation-session', 'POST', true], ['/api/closures', 'GET', false], ['/api/reports', 'GET', false],
    ] as const) {
      expect(await call(path, method)).toBe(200);
      expect(upstream).toHaveBeenLastCalledWith(expect.stringMatching(/^https:\/\/[^/]+\.onrender\.com\/api\//), expect.objectContaining({
        redirect: 'error', headers: expect.objectContaining({ 'x-iter-proxy-key': key }),
      }));
      const init = (upstream.mock.lastCall as unknown as [string, RequestInit])[1];
      expect(new Headers(init.headers).has('authorization')).toBe(auth);
      if (auth) expect(new Headers(init.headers).get('authorization') === authorization).toBe(true);
    }
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      expect(await call('/api/moderation-session', 'POST', ['Origin', 'https://foreign.example'])).toBe(403);
      expect(diagnostic.mock.calls).toEqual([['moderator_denied=vercel_boundary']]);
    } finally { diagnostic.mockRestore(); }
    const total = upstream.mock.calls.length;
    expect(await call('/api/moderation', 'GET', ['Authorization', authorization])).toBe(403);
    expect(await call('/api/moderation', 'POST', ['Origin', 'https://foreign.example'])).toBe(403);
    expect(await call('/api/closures', 'POST')).toBe(405);
    expect(await call('/api/moderation-session?key=stripped', 'POST')).toBe(400);
    expect(upstream.mock.calls.length).toBe(total);
  });
});

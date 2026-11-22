import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { login, requireModerator } from '../server/moderator-auth.ts';
import proxy from '../server/vercel-proxy.mjs';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('moderator credentials', () => {
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
    const total = upstream.mock.calls.length;
    expect(await call('/api/moderation', 'GET', ['Authorization', authorization])).toBe(403);
    expect(await call('/api/moderation', 'POST', ['Origin', 'https://foreign.example'])).toBe(403);
    expect(await call('/api/closures', 'POST')).toBe(405);
    expect(await call('/api/moderation-session?key=stripped', 'POST')).toBe(400);
    expect(upstream.mock.calls.length).toBe(total);
  });
});

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { moderatorSessionLifetimeMs } from '../shared/moderation.ts';
import { JournalError } from './validation.ts';

const digest = (text: string) => createHash('sha256').update(text).digest();
function configured(secret?: string): string {
  if (!secret || !/^[A-Za-z0-9_-]{43,128}$/.test(secret)) throw new JournalError('forbidden');
  return secret;
}
function signature(secret: string, value: string) {
  return createHmac('sha256', secret).update('iter/moderator/v1/' + value).digest('base64url');
}
export function login(secret: string | undefined, authorization: string | undefined) {
  const key = configured(secret);
  if (!timingSafeEqual(digest(authorization ?? ''), digest('Bearer ' + key))) throw new JournalError('forbidden');
  const expiresAt = Date.now() + moderatorSessionLifetimeMs;
  const payload = expiresAt + '.' + randomBytes(18).toString('base64url');
  return { token: payload + '.' + signature(key, payload), expiresAt };
}
export function requireModerator(secret: string | undefined, authorization: string | undefined) {
  const key = configured(secret);
  const match = /^Bearer (\d{13})\.([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{43})$/.exec(authorization ?? '');
  if (!match || Number(match[1]) <= Date.now() || !timingSafeEqual(Buffer.from(match[3]!), Buffer.from(signature(key, match[1] + '.' + match[2])))) throw new JournalError('forbidden');
}

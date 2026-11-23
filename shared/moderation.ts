import { exactKeys, isRecord, positiveInteger, REPORT_PASSAGES, UUID_V4 } from './report-contract.ts';
import type { Report } from './report-contract.ts';

export const moderatorSessionLifetimeMs = 15 * 60_000;
export const closureDurations = [1, 8, 24] as const;
export type ModerationCommand = { id: string; version: number } & (
  { action: 'review' | 'reject' | 'reopen' } | { action: 'close'; hours: number | null }
);
export interface ModerationItem {
  report: Report;
  closure: { state: 'active' | 'reopened' | 'expired'; expiresAt: string | null } | null;
}
export interface ModerationPage { items: ModerationItem[]; nextCursor: number | null }
export interface PassageUpdates { closed: string[]; warnings: string[] }

export function isModerationCommand(value: unknown): value is ModerationCommand {
  if (!isRecord(value) || typeof value.id !== 'string' || !UUID_V4.test(value.id) || !positiveInteger(value.version)) return false;
  if (value.action === 'close') return exactKeys(value, ['id', 'version', 'action', 'hours']) &&
    (value.hours === null || closureDurations.some(hours => hours === value.hours));
  return exactKeys(value, ['id', 'version', 'action']) && typeof value.action === 'string' && ['review', 'reject', 'reopen'].includes(value.action);
}
const passageIds = new Set(REPORT_PASSAGES.map(passage => passage.id));
export function isPassageUpdates(value: unknown): value is PassageUpdates {
  const validIds = (ids: unknown) => Array.isArray(ids) && ids.length <= passageIds.size &&
    ids.every(id => passageIds.has(id)) && new Set(ids).size === ids.length;
  return isRecord(value) && exactKeys(value, ['closed', 'warnings']) && validIds(value.closed) && validIds(value.warnings);
}

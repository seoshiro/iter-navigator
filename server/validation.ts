import { exactKeys, isRecord, normalizeMessage, positiveInteger, REPORT_BUILDING_ID, REPORT_ERRORS, REPORT_LIMITS, UUID_V4, validTarget } from '../shared/report-contract.ts';
import type { CreateReport, ReportErrorCode, ReportKind } from '../shared/report-contract.ts';

export class JournalError extends Error {
  readonly code: ReportErrorCode;
  constructor(code: ReportErrorCode) { super(REPORT_ERRORS[code].message); this.code = code; }
}
export function safeError(error: unknown): JournalError { return error instanceof JournalError ? error : new JournalError('storage_unavailable'); }
export function validateCreate(value: unknown): CreateReport {
  if (!isRecord(value) || !exactKeys(value, ['buildingId', 'passageId', 'kind', 'message', 'clientRequestId'])) throw new JournalError('invalid_input');
  const message = normalizeMessage(value.message);
  if (value.buildingId !== REPORT_BUILDING_ID || !validTarget(value.kind, value.passageId) || message === null || typeof value.clientRequestId !== 'string' || !UUID_V4.test(value.clientRequestId)) throw new JournalError('invalid_input');
  return { buildingId: REPORT_BUILDING_ID, passageId: value.passageId as string | null, kind: value.kind as ReportKind, message, clientRequestId: value.clientRequestId };
}
export interface PageQuery { limit: number; before: number | null }
export function validatePage(query: URLSearchParams): PageQuery {
  for (const key of query.keys()) if (!['limit', 'before'].includes(key) || query.getAll(key).length !== 1) throw new JournalError('invalid_input');
  const integer = (raw: string | null, fallback: number | null) => {
    if (raw === null) return fallback;
    if (!/^[1-9]\d*$/.test(raw) || !positiveInteger(Number(raw))) throw new JournalError('invalid_input');
    return Number(raw);
  };
  const limit = integer(query.get('limit'), 10)!;
  if (limit > REPORT_LIMITS.page) throw new JournalError('invalid_input');
  return { limit, before: integer(query.get('before'), null) };
}
export function validateReview(id: unknown, status: unknown, version: unknown): asserts status is 'reviewed' | 'rejected' {
  if (typeof id !== 'string' || !UUID_V4.test(id) || !['reviewed', 'rejected'].includes(String(status)) || !positiveInteger(version)) throw new JournalError('invalid_input');
}

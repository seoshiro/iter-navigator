import fixture from '../src/data/building.json' with { type: 'json' };

export const REPORT_BUILDING_ID = 'demo-prosvet-v1' as const;
export const REPORT_SERVICE_META_NAME = 'navigator-report-service';
export const REPORT_SERVICE_META_VALUE = 'local-demo-v1';
export const REPORT_PUBLIC_META_VALUE = 'public-demo-v1';
export type ReportServiceMode = 'static' | 'local-demo' | 'public-demo';
export const REPORT_LIMITS = { bodyBytes: 4096, messageCodePoints: 500, page: 50, records: 1000, bodyReaders: 4, writesPerMinute: 30, connections: 32 } as const;
// The catalog consumes accepted edge IDs. It never supplies inputs to the router.
export const REPORT_PASSAGES = fixture.edges.map(edge => ({ id: edge.id, type: edge.type, from: edge.from, to: edge.to, label: `${fixture.nodes.find(node => node.id === edge.from)!.label} → ${fixture.nodes.find(node => node.id === edge.to)!.label}` }));
export const REPORT_KINDS = ['lift_unavailable', 'blocked_passage', 'note'] as const;
export const REPORT_STATUSES = ['pending', 'reviewed', 'rejected'] as const;
export type ReportKind = typeof REPORT_KINDS[number];
export type ReportStatus = typeof REPORT_STATUSES[number];
export interface CreateReport {
  buildingId: typeof REPORT_BUILDING_ID;
  passageId: string | null;
  kind: ReportKind;
  message: string;
  clientRequestId: string;
}
export interface Report {
  id: string;
  buildingId: typeof REPORT_BUILDING_ID;
  passageId: string | null;
  kind: ReportKind;
  message: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export interface CreateReportResult { report: Report; replayed: boolean }
export interface ReportPage { reports: Report[]; nextCursor: number | null }
export const REPORT_ERRORS = {
  invalid_input: { status: 400, message: 'Invalid report input.' },
  forbidden: { status: 403, message: 'Request is not allowed.' },
  not_found: { status: 404, message: 'Resource not found.' },
  method_not_allowed: { status: 405, message: 'Method is not allowed.' },
  request_conflict: { status: 409, message: 'Request identity was already used for different content.' },
  version_conflict: { status: 409, message: 'Report version has changed.' },
  transition_conflict: { status: 409, message: 'Report is already in another final state.' },
  payload_too_large: { status: 413, message: 'Request body is too large.' },
  unsupported_media_type: { status: 415, message: 'JSON content type is required.' },
  rate_limited: { status: 429, message: 'Local journal request limit reached. Try again later.' },
  storage_unavailable: { status: 503, message: 'Local report storage is unavailable.' },
  journal_full: { status: 507, message: 'Local journal is full.' },
} as const;
export type ReportErrorCode = keyof typeof REPORT_ERRORS;
export interface ReportFailure { error: { code: ReportErrorCode; message: string } }
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export function normalizeMessage(value: unknown): string | null {
  if (typeof value !== 'string' || !value.isWellFormed()) return null;
  // Permit line breaks and tabs; reject other C0/C1 and bidirectional controls.
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if ((point < 32 && ![9, 10, 13].includes(point)) || (point >= 127 && point <= 159) || (point >= 0x202a && point <= 0x202e) || (point >= 0x2066 && point <= 0x2069)) return null;
  }
  const message = value.normalize('NFC').trim();
  const size = [...message].length;
  return size >= 1 && size <= REPORT_LIMITS.messageCodePoints ? message : null;
}
export function validTarget(kind: unknown, passageId: unknown): boolean {
  if (!REPORT_KINDS.includes(kind as ReportKind)) return false;
  if (passageId === null) return kind === 'note';
  if (typeof passageId !== 'string') return false;
  const passage = REPORT_PASSAGES.find(item => item.id === passageId);
  return !!passage && (kind !== 'lift_unavailable' || passage.type === 'lift');
}
function isoUtc(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function isReport(value: unknown): value is Report {
  if (!isRecord(value) || !exactKeys(value, ['id', 'buildingId', 'passageId', 'kind', 'message', 'status', 'createdAt', 'updatedAt', 'version'])) return false;
  if (typeof value.id !== 'string' || !UUID_V4.test(value.id) || value.buildingId !== REPORT_BUILDING_ID || !validTarget(value.kind, value.passageId)) return false;
  if (typeof value.message !== 'string' || normalizeMessage(value.message) !== value.message || !REPORT_STATUSES.includes(value.status as ReportStatus) || !isoUtc(value.createdAt) || !isoUtc(value.updatedAt)) return false;
  return value.status === 'pending' ? value.version === 1 && value.updatedAt === value.createdAt : value.version === 2 && value.updatedAt >= value.createdAt;
}
export function reportMatchesAttempt(report: Report, attempt: CreateReport): boolean {
  return report.buildingId === attempt.buildingId && report.passageId === attempt.passageId && report.kind === attempt.kind && report.message === normalizeMessage(attempt.message);
}

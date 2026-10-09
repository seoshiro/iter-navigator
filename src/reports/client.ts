import { exactKeys, isRecord, isReport, positiveInteger, REPORT_ERRORS, REPORT_SERVICE_META_NAME, REPORT_SERVICE_META_VALUE, REPORT_PUBLIC_META_VALUE, reportMatchesAttempt } from '../../shared/report-contract.ts';
import type { CreateReport, CreateReportResult, ReportErrorCode, ReportPage, ReportServiceMode } from '../../shared/report-contract.ts';

export function reportServiceMode(document: Pick<Document, 'querySelectorAll'>): ReportServiceMode {
  const markers = document.querySelectorAll(`meta[name="${REPORT_SERVICE_META_NAME}"]`);
  if (markers.length !== 1) return 'static';
  const content = markers[0]?.getAttribute('content');
  return content === REPORT_SERVICE_META_VALUE ? 'local-demo' : content === REPORT_PUBLIC_META_VALUE ? 'public-demo' : 'static';
}
export function hasLocalReportService(document: Pick<Document, 'querySelectorAll'>): boolean { return reportServiceMode(document) === 'local-demo'; }
export class ReportClientError extends Error {
  readonly definite: boolean;
  readonly code: ReportErrorCode | 'ambiguous';
  constructor(code: ReportErrorCode | 'ambiguous', definite = false) { super(code); this.code = code; this.definite = definite; }
}
async function request(path: string, options: RequestInit, signal?: AbortSignal): Promise<{ response: Response; value: unknown }> {
  try {
    const timeout = AbortSignal.timeout(options.method === 'GET' ? 70_000 : 8_000);
    const response = await fetch(path, { ...options, credentials: 'omit', mode: 'same-origin', cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') ?? '')) throw new ReportClientError('ambiguous');
    const text = await response.text();
    if (text.length > 150_000) throw new ReportClientError('ambiguous');
    const value: unknown = JSON.parse(text);
    if (!response.ok) {
      if (!isRecord(value) || !exactKeys(value, ['error']) || !isRecord(value.error) || !exactKeys(value.error, ['code', 'message']) || typeof value.error.code !== 'string' || !Object.hasOwn(REPORT_ERRORS, value.error.code)) throw new ReportClientError('ambiguous');
      const code = value.error.code as ReportErrorCode;
      if (response.status !== REPORT_ERRORS[code].status || value.error.message !== REPORT_ERRORS[code].message) throw new ReportClientError('ambiguous');
      throw new ReportClientError(code, code !== 'storage_unavailable');
    }
    return { response, value };
  } catch (error) { if (error instanceof ReportClientError) throw error; throw new ReportClientError('ambiguous'); }
}
export async function createReport(payload: CreateReport, signal?: AbortSignal): Promise<CreateReportResult> {
  const { response, value } = await request('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, signal);
  if (!isRecord(value) || !exactKeys(value, ['report', 'replayed']) || !isReport(value.report) || !reportMatchesAttempt(value.report, payload) || typeof value.replayed !== 'boolean' || response.status !== (value.replayed ? 200 : 201)) throw new ReportClientError('ambiguous');
  return { report: value.report, replayed: value.replayed };
}
export async function listReports(before: number | null = null, signal?: AbortSignal): Promise<ReportPage> {
  const { response, value } = await request(`/api/reports?limit=10${before === null ? '' : `&before=${before}`}`, { method: 'GET' }, signal);
  if (response.status !== 200 || !isRecord(value) || !exactKeys(value, ['reports', 'nextCursor']) || !Array.isArray(value.reports) || value.reports.length > 10 || !value.reports.every(isReport) || (value.nextCursor !== null && !positiveInteger(value.nextCursor)) || new Set(value.reports.map(report => report.id)).size !== value.reports.length) throw new ReportClientError('ambiguous');
  if (value.nextCursor !== null && (value.reports.length !== 10 || (before !== null && value.nextCursor >= before))) throw new ReportClientError('ambiguous');
  return { reports: value.reports, nextCursor: value.nextCursor };
}

import type { ReportErrorCode, ReportKind, ReportStatus } from '../../shared/report-contract.ts';
import type { reportRu } from './report-ru';

export const reportEn: typeof reportRu = {
  publicSubtitle: 'Public journal for the demo building',
  publicPrivacy: 'Reports are publicly accessible on the internet. Use fictional examples only. Do not include names, contact details, your location, or health information. This is an unmoderated public demo. Reports do not change routes.',
  publicSaved: 'Saved to the public journal. The report is visible to everyone, remains unverified, and does not change routes.',
  publicUnavailable: 'The public journal is unavailable. The free service may be waking up or may have reached its limit. Displayed reports may be out of date. Try again later. Route planning still works.',
  publicAmbiguous: 'No confirmation was received. Your report may have been saved. The free service may be waking up or unavailable. If browser storage is available, your draft and original request ID are saved on this device. Nothing will be sent automatically. Retry the same report manually later, or explicitly abandon this attempt.',
  title: 'Obstacle reports', subtitle: 'Separate journal for the demo building',
  unverified: 'All reports are unverified visitor text. Even after review, they do not change routes or confirm accessibility.',
  privacy: 'Do not include your name, contact details, location, or health information. Describe only an obstacle in the fictional building.',
  static: 'The journal is available only when the local service is running. Reports are not sent here. Route planning still works.',
  loading: 'Loading journal…', refreshStale: 'Displayed reports may be out of date until the refresh finishes.',
  empty: 'There are no reports yet.', loaded: 'Journal refreshed. Reports remain unverified and do not change routes.',
  publicLoading: 'Loading journal… The free service may take about a minute to wake up. You can continue planning your route. If loading fails, refresh the journal manually.',
  unavailable: 'The journal is unavailable. Displayed reports may be out of date. Route planning still works.',
  ambiguous: 'No confirmation was received. Your report may have been saved. If browser storage is available, your draft and original request ID are saved on this device. Nothing will be sent automatically. Retry the same request manually, or explicitly abandon this attempt.',
  retryRejected: 'The retry was rejected, but the earlier submission is still unresolved: your report may have been saved. If browser storage is available, your draft and original request ID are saved on this device. Nothing will be sent automatically. Retry the same request manually later, or explicitly abandon this attempt.',
  abandoned: 'Attempt abandoned. A report already saved may remain in the journal. You can edit the draft before submitting it again.',
  saved: 'Saved to the local journal. The text remains unverified and does not change routes.',
  invalid: 'Choose an appropriate passage and enter between 1 and 500 characters without control characters.',
  dates: 'Dates show when a report was submitted and reviewed, not when the building was surveyed.',
};
export const reportKindEn: Record<ReportKind, string> = { lift_unavailable: 'Elevator unavailable', blocked_passage: 'Blocked passage', note: 'Note' };
export const reportStatusEn: Record<ReportStatus, string> = { pending: 'Awaiting review', reviewed: 'Reviewed in the demo', rejected: 'Rejected in the demo' };
export const reportErrorEn: Record<ReportErrorCode, string> = {
  invalid_input: 'The server rejected the data. Your report was not saved. Check the fields.',
  forbidden: 'The local service rejected the request. Your report was not saved.',
  not_found: 'The journal resource was not found. Your report was not saved.',
  method_not_allowed: 'This submission method is not supported. Your report was not saved.',
  request_conflict: 'This request ID is already associated with different content. This submission was not saved.',
  version_conflict: 'The report version has changed. This submission was not saved.',
  transition_conflict: 'The report status has already changed. This submission was not saved.',
  payload_too_large: 'The request is too large. Your report was not saved.',
  unsupported_media_type: 'The request format was rejected. Your report was not saved.',
  rate_limited: 'The local journal’s request limit has been reached. Your report was not saved. Try again later.',
  storage_unavailable: reportEn.ambiguous,
  journal_full: 'The local journal is full. Your report was not saved.',
};
export const publicReportErrorEn: Partial<Record<ReportErrorCode, string>> = {
  rate_limited: 'The public journal’s request limit has been reached. Your report was not saved. Try again later.',
  journal_full: 'The public journal is full. Your report was not saved.',
};

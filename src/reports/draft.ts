import { exactKeys, isRecord, normalizeMessage, REPORT_BUILDING_ID, UUID_V4, validTarget } from '../../shared/report-contract.ts';
import type { CreateReport, ReportKind, ReportServiceMode } from '../../shared/report-contract.ts';

export interface ReportDraft { kind: ReportKind; passageId: string | null; message: string }
export interface JournalDraft { version: 1; draft: ReportDraft; pending: CreateReport | null }
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type DraftRead = { state: JournalDraft; issue: 'unavailable' | 'corrupt' | null; restored: boolean };

export const journalDraftKey = (mode: ReportServiceMode) => `iter:report-draft:v1:${REPORT_BUILDING_ID}:${mode}`;
export const emptyJournalDraft = (): JournalDraft => ({
  version: 1, draft: { kind: 'lift_unavailable', passageId: 'lift-a-01', message: '' }, pending: null,
});
export function browserDraftStorage(): DraftStorage | null {
  try { return window.localStorage; } catch { return null; }
}
function isDraft(value: unknown): value is ReportDraft {
  return isRecord(value) && exactKeys(value, ['kind', 'passageId', 'message']) &&
    validTarget(value.kind, value.passageId) && typeof value.message === 'string' &&
    value.message.length <= 5000;
}
export function isPendingReport(value: unknown): value is CreateReport {
  return isRecord(value) &&
    exactKeys(value, ['buildingId', 'passageId', 'kind', 'message', 'clientRequestId']) &&
    value.buildingId === REPORT_BUILDING_ID && validTarget(value.kind, value.passageId) &&
    typeof value.message === 'string' && normalizeMessage(value.message) === value.message &&
    typeof value.clientRequestId === 'string' && UUID_V4.test(value.clientRequestId);
}
export function isJournalDraft(value: unknown): value is JournalDraft {
  if (!isRecord(value) || !exactKeys(value, ['version', 'draft', 'pending']) ||
    value.version !== 1 || !isDraft(value.draft)) return false;
  return value.pending === null || isPendingReport(value.pending) &&
    value.pending.kind === value.draft.kind && value.pending.passageId === value.draft.passageId &&
    value.pending.message === normalizeMessage(value.draft.message);
}
export function readJournalDraft(storage: DraftStorage | null, mode: ReportServiceMode): DraftRead {
  // Static deployments must not load or overwrite an unrelated connected journal.
  if (mode === 'static') return { state: emptyJournalDraft(), issue: null, restored: false };
  if (!storage) return { state: emptyJournalDraft(), issue: 'unavailable', restored: false };
  let raw: string | null;
  try { raw = storage.getItem(journalDraftKey(mode)); }
  catch { return { state: emptyJournalDraft(), issue: 'unavailable', restored: false }; }
  if (raw === null) return { state: emptyJournalDraft(), issue: null, restored: false };
  try {
    if (raw.length > 20_000) throw new Error('oversize');
    const state: unknown = JSON.parse(raw);
    if (!isJournalDraft(state)) throw new Error('invalid');
    return { state, issue: null, restored: state.pending !== null || state.draft.message.length > 0 };
  } catch {
    // Do not overwrite damaged/unknown data: it may contain a previously dispatched UUID.
    return { state: emptyJournalDraft(), issue: 'corrupt', restored: false };
  }
}
export function writeJournalDraft(storage: DraftStorage | null, mode: ReportServiceMode, state: JournalDraft): boolean {
  if (!storage || mode === 'static' || !isJournalDraft(state)) return false;
  // If the prior identity cannot be read, writing could silently replace an uncertain request.
  if (readJournalDraft(storage, mode).issue !== null) return false;
  try { storage.setItem(journalDraftKey(mode), JSON.stringify(state)); return true; }
  catch { return false; }
}
export function removeJournalDraft(storage: DraftStorage | null, mode: ReportServiceMode): boolean {
  if (!storage || mode === 'static') return false;
  try { storage.removeItem(journalDraftKey(mode)); return true; } catch { return false; }
}

export type DraftCompletion =
  | { status: 'written' | 'changed'; state: JournalDraft }
  | { status: 'unavailable' | 'corrupt' };
function sameDraftRevision(left: JournalDraft, right: JournalDraft): boolean {
  if (left.draft.kind !== right.draft.kind || left.draft.passageId !== right.draft.passageId ||
    left.draft.message !== right.draft.message) return false;
  if (left.pending === null || right.pending === null) return left.pending === right.pending;
  return left.pending.clientRequestId === right.pending.clientRequestId &&
    left.pending.buildingId === right.pending.buildingId && left.pending.kind === right.pending.kind &&
    left.pending.passageId === right.pending.passageId && left.pending.message === right.pending.message;
}
/** A late result may finish only its own immutable request and raw draft revision.
 * In particular, another tab can explicitly abandon that attempt and start a new draft
 * while its POST is still in flight. Never clear or restore that newer draft.
 */
export function completeJournalDraft(
  storage: DraftStorage | null, mode: ReportServiceMode, submitted: JournalDraft, next: JournalDraft,
): DraftCompletion {
  if (!storage || mode === 'static' || !isJournalDraft(submitted) || submitted.pending === null ||
    !isJournalDraft(next) || next.pending !== null) return { status: 'unavailable' };
  const latest = readJournalDraft(storage, mode);
  if (latest.issue) return { status: latest.issue };
  if (!sameDraftRevision(latest.state, submitted)) return { status: 'changed', state: latest.state };
  // No await between the final read/compare and this write.
  try { storage.setItem(journalDraftKey(mode), JSON.stringify(next)); return { status: 'written', state: next }; }
  catch { return { status: 'unavailable' }; }
}

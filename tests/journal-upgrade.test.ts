import { afterEach, describe, expect, it, vi } from 'vitest';
import { REPORT_BUILDING_ID, REPORT_ERRORS } from '../shared/report-contract.ts';
import type { CreateReport, Report } from '../shared/report-contract.ts';
import { createReport, listReports, ReportClientError, reportServiceMode } from '../src/reports/client';
import { completeJournalDraft, emptyJournalDraft, isJournalDraft, journalDraftKey, readJournalDraft, removeJournalDraft, writeJournalDraft } from '../src/reports/draft';
import type { DraftStorage } from '../src/reports/draft';
import { journalCopy } from '../src/reports/copy';

const payload: CreateReport = { buildingId: REPORT_BUILDING_ID, passageId: 'lift-a-01', kind: 'lift_unavailable', message: 'Синтетический пример', clientRequestId: '11111111-1111-4111-8111-111111111111' };
const report: Report = { id: '22222222-2222-4222-8222-222222222222', buildingId: payload.buildingId, passageId: payload.passageId, kind: payload.kind, message: payload.message, status: 'pending', createdAt: '2026-11-09T10:00:00.000Z', updatedAt: '2026-11-09T10:00:00.000Z', version: 1 };
function memoryStorage(): DraftStorage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
const pendingState = () => ({ version: 1 as const, draft: { kind: payload.kind, passageId: payload.passageId, message: '  ' + payload.message + '  ' }, pending: { ...payload } });
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('journal draft durability', () => {
  it('preserves exact raw draft and immutable normalized payload/UUID across a new load', () => {
    const storage = memoryStorage();
    expect(writeJournalDraft(storage, 'public-demo', pendingState())).toBe(true);
    const restored = readJournalDraft(storage, 'public-demo');
    expect(restored.issue).toBeNull();
    expect(restored.restored).toBe(true);
    expect(restored.state).toEqual(pendingState());
    expect(restored.state.pending?.clientRequestId).toBe(payload.clientRequestId);
  });
  it('persists editable, incomplete text without normalizing away the user draft', () => {
    const storage = memoryStorage();
    const state = emptyJournalDraft(); state.draft.message = '  Нобай\n ';
    expect(writeJournalDraft(storage, 'public-demo', state)).toBe(true);
    expect(readJournalDraft(storage, 'public-demo').state.draft.message).toBe('  Нобай\n ');
  });
  it('keeps local and hosted journal identities separate', () => {
    const storage = memoryStorage();
    writeJournalDraft(storage, 'local-demo', pendingState());
    expect(readJournalDraft(storage, 'public-demo').restored).toBe(false);
    expect(readJournalDraft(storage, 'local-demo').state.pending).toEqual(payload);
  });
  it('static mode never reads, writes, or removes connected journal data', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    readJournalDraft(storage, 'static');
    expect(writeJournalDraft(storage, 'static', pendingState())).toBe(false);
    expect(removeJournalDraft(storage, 'static')).toBe(false);
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
  });
  it('fails safely when reading or writing storage is denied', () => {
    const storage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); } };
    expect(readJournalDraft(storage, 'public-demo').issue).toBe('unavailable');
    expect(writeJournalDraft(storage, 'public-demo', pendingState())).toBe(false);
    expect(removeJournalDraft(storage, 'public-demo')).toBe(false);
    expect(readJournalDraft(null, 'public-demo').issue).toBe('unavailable');
  });
  it.each(['{', '{"version":2}', 'x'.repeat(20_001)])('does not overwrite damaged or future-version data', raw => {
    const storage = memoryStorage(); storage.setItem(journalDraftKey('public-demo'), raw);
    expect(readJournalDraft(storage, 'public-demo').issue).toBe('corrupt');
    expect(storage.getItem(journalDraftKey('public-demo'))).toBe(raw);
  });
  it('rejects a pending UUID/payload that does not match its locked draft', () => {
    const state = pendingState();
    expect(isJournalDraft({ ...state, pending: { ...payload, clientRequestId: 'not-a-uuid' } })).toBe(false);
    expect(isJournalDraft({ ...state, draft: { ...state.draft, message: 'Changed after dispatch' } })).toBe(false);
    expect(isJournalDraft({ ...state, pending: { ...payload, unexpected: true } })).toBe(false);
    expect(isJournalDraft({ ...state, pending: { ...payload, buildingId: 'another-building' } })).toBe(false);
  });
  it('clears only the explicitly selected journal draft', () => {
    const storage = memoryStorage(); writeJournalDraft(storage, 'public-demo', pendingState()); writeJournalDraft(storage, 'local-demo', pendingState());
    expect(removeJournalDraft(storage, 'public-demo')).toBe(true);
    expect(readJournalDraft(storage, 'public-demo').restored).toBe(false);
    expect(readJournalDraft(storage, 'local-demo').restored).toBe(true);
  });
  it('all journal-only text has a nonempty Russian and Kazakh translation', () => {
    expect(Object.keys(journalCopy.kk).sort()).toEqual(Object.keys(journalCopy.ru).sort());
    for (const dictionary of Object.values(journalCopy)) for (const value of Object.values(dictionary)) {
      expect(value.trim().length).toBeGreaterThan(0); expect(value).not.toContain('\ufffd');
    }
  });
});

describe('report client transport safety (synthetic fetch only)', () => {
  it('submits the exact same payload for an explicit idempotent replay', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ report, replayed: false }, 201)).mockResolvedValueOnce(json({ report, replayed: true }, 200));
    vi.stubGlobal('fetch', fetch);
    await expect(createReport(payload)).resolves.toEqual({ report, replayed: false });
    await expect(createReport(payload)).resolves.toEqual({ report, replayed: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1].body).toBe(JSON.stringify(payload));
    expect(fetch.mock.calls[1]?.[1].body).toBe(fetch.mock.calls[0]?.[1].body);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', cache: 'no-store', mode: 'same-origin' });
  });
  it('treats a network rejection as ambiguous without automatic retry', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')); vi.stubGlobal('fetch', fetch);
    await expect(createReport(payload)).rejects.toMatchObject({ code: 'ambiguous', definite: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('uses an 8-second write timeout and treats it as ambiguous', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('timeout', 'TimeoutError')), { once: true });
    })));
    const request = createReport(payload); controller.abort();
    await expect(request).rejects.toMatchObject({ code: 'ambiguous', definite: false });
    expect(timeout).toHaveBeenCalledWith(8_000);
  });
  it('only accepts a contract-matching definite rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'rate_limited', message: REPORT_ERRORS.rate_limited.message } }, 429)));
    await expect(createReport(payload)).rejects.toMatchObject({ code: 'rate_limited', definite: true });
  });
  it('storage unavailable remains ambiguous even with a valid error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'storage_unavailable', message: REPORT_ERRORS.storage_unavailable.message } }, 503)));
    await expect(createReport(payload)).rejects.toMatchObject({ code: 'storage_unavailable', definite: false });
  });
  it.each([
    () => new Response('<html>gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }),
    () => json({ error: { code: 'rate_limited', message: 'Unexpected upstream error' } }, 429),
    () => json({ report: { ...report, message: 'Wrong request response' }, replayed: false }, 201),
    () => json({ report, replayed: false }, 200),
  ])('does not call uncertain responses a successful or definitively rejected write', async response => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    await expect(createReport(payload)).rejects.toBeInstanceOf(ReportClientError);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    await expect(createReport(payload)).rejects.toMatchObject({ definite: false });
  });
  it('validates list responses and de-duplicates identities at the boundary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ reports: [report, report], nextCursor: null })));
    await expect(listReports()).rejects.toMatchObject({ code: 'ambiguous' });
  });
  it('fails closed when the service marker is missing or duplicated', () => {
    const marker = { getAttribute: () => 'public-demo-v1' };
    expect(reportServiceMode({ querySelectorAll: () => [] } as unknown as Document)).toBe('static');
    expect(reportServiceMode({ querySelectorAll: () => [marker, marker] } as unknown as Document)).toBe('static');
    expect(reportServiceMode({ querySelectorAll: () => [marker] } as unknown as Document)).toBe('public-demo');
  });
});

describe('storage read-before-write protection', () => {
  it('does not write when the previous request identity cannot be read', () => {
    const storage = { getItem: () => { throw new Error('denied'); }, setItem: vi.fn(), removeItem: vi.fn() };
    expect(writeJournalDraft(storage, 'public-demo', pendingState())).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('does not overwrite corrupt or future-version persisted data', () => {
    const storage = memoryStorage();
    storage.setItem(journalDraftKey('public-demo'), '{"version":999}');
    expect(writeJournalDraft(storage, 'public-demo', pendingState())).toBe(false);
    expect(storage.getItem(journalDraftKey('public-demo'))).toBe('{"version":999}');
  });
});

describe('late completion identity and draft-revision protection', () => {
  const completed = (submitted = pendingState()) => ({ ...submitted, draft: { ...submitted.draft, message: '' }, pending: null });
  it('clears the matching submitted revision after a confirmed save', () => {
    const storage = memoryStorage(); const submitted = pendingState(); writeJournalDraft(storage, 'public-demo', submitted);
    expect(completeJournalDraft(storage, 'public-demo', submitted, completed(submitted))).toEqual({ status: 'written', state: completed(submitted) });
    expect(readJournalDraft(storage, 'public-demo').state).toEqual(completed(submitted));
  });
  it('unlocks the matching draft unchanged after a definite first rejection', () => {
    const storage = memoryStorage(); const submitted = pendingState(); writeJournalDraft(storage, 'public-demo', submitted);
    const next = { ...submitted, pending: null };
    expect(completeJournalDraft(storage, 'public-demo', submitted, next)).toEqual({ status: 'written', state: next });
    expect(readJournalDraft(storage, 'public-demo').state.draft.message).toBe(submitted.draft.message);
  });
  it('preserves a newer editable draft after the old request is abandoned', () => {
    const storage = memoryStorage(); const submitted = pendingState();
    const newer = { ...submitted, draft: { ...submitted.draft, message: 'New draft in another tab' }, pending: null };
    writeJournalDraft(storage, 'public-demo', newer);
    expect(completeJournalDraft(storage, 'public-demo', submitted, completed(submitted))).toEqual({ status: 'changed', state: newer });
    expect(readJournalDraft(storage, 'public-demo').state).toEqual(newer);
  });
  it('preserves a newer pending UUID even if its content is the same', () => {
    const storage = memoryStorage(); const submitted = pendingState();
    const newer = { ...submitted, pending: { ...payload, clientRequestId: '33333333-3333-4333-8333-333333333333' } };
    writeJournalDraft(storage, 'public-demo', newer);
    expect(completeJournalDraft(storage, 'public-demo', submitted, completed(submitted))).toEqual({ status: 'changed', state: newer });
    expect(readJournalDraft(storage, 'public-demo').state).toEqual(newer);
  });
  it('compares the exact raw draft, not just the normalized payload and UUID', () => {
    const storage = memoryStorage(); const submitted = pendingState();
    const newer = { ...submitted, draft: { ...submitted.draft, message: '\n' + payload.message } };
    writeJournalDraft(storage, 'public-demo', newer);
    expect(completeJournalDraft(storage, 'public-demo', submitted, completed(submitted))).toEqual({ status: 'changed', state: newer });
    expect(readJournalDraft(storage, 'public-demo').state).toEqual(newer);
  });
  it('does not resurrect a draft explicitly removed in another tab', () => {
    const storage = memoryStorage(); const submitted = pendingState();
    expect(completeJournalDraft(storage, 'public-demo', submitted, completed(submitted))).toEqual({ status: 'changed', state: emptyJournalDraft() });
    expect(storage.getItem(journalDraftKey('public-demo'))).toBeNull();
  });
  it('leaves unreadable or corrupt storage untouched on completion', () => {
    const storage = memoryStorage(); const submitted = pendingState();
    storage.setItem(journalDraftKey('public-demo'), '{"version":999}');
    expect(completeJournalDraft(storage, 'public-demo', submitted, completed(submitted))).toEqual({ status: 'corrupt' });
    expect(storage.getItem(journalDraftKey('public-demo'))).toBe('{"version":999}');
    expect(completeJournalDraft(null, 'public-demo', submitted, completed(submitted))).toEqual({ status: 'unavailable' });
  });
});

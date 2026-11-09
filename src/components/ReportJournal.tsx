import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { normalizeMessage, REPORT_BUILDING_ID, REPORT_KINDS, REPORT_PASSAGES, validTarget } from '../../shared/report-contract.ts';
import type { CreateReport, Report, ReportErrorCode, ReportKind } from '../../shared/report-contract.ts';
import { createReport, reportServiceMode, listReports, ReportClientError } from '../reports/client';
import { browserDraftStorage, completeJournalDraft, emptyJournalDraft, journalDraftKey, readJournalDraft, removeJournalDraft, writeJournalDraft } from '../reports/draft';
import type { JournalDraft, ReportDraft } from '../reports/draft';
import { journalCopy } from '../reports/copy';
import { useI18n } from '../i18n/locale';

type Feedback =
  | { type: 'copy'; key: keyof typeof journalCopy.ru }
  | { type: 'report'; key: 'invalid' | 'publicSaved' | 'saved' | 'retryRejected' | 'publicAmbiguous' | 'ambiguous' | 'abandoned' }
  | { type: 'error'; code: ReportErrorCode }
  | null;

export function ReportJournal() {
  const { locale, reportRu, reportKindRu, reportStatusRu, reportErrorRu, publicReportErrorRu, passageLabelRu, ru } = useI18n();
  const copy = journalCopy[locale];
  const [mode] = useState(() => reportServiceMode(document));
  const connected = mode !== 'static';
  const hosted = mode === 'public-demo';
  const [restoration] = useState(() => readJournalDraft(browserDraftStorage(), mode));
  const [journal, setJournal] = useState(restoration.state);
  const stateRef = useRef(journal);
  const [storageIssue, setStorageIssue] = useState(restoration.issue);
  const storageIssueRef = useRef(storageIssue);
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [reconnected, setReconnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(() => restoration.state.pending
    ? { type: 'copy', key: 'pendingRestored' }
    : restoration.restored ? { type: 'copy', key: 'restored' } : null);
  const [records, setRecords] = useState<Report[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [readStarted, setReadStarted] = useState(false);
  const mounted = useRef(false);
  const busy = useRef(false);
  const readGeneration = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const writeController = useRef<AbortController | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const { kind, passageId, message } = journal.draft;
  const attempt = journal.pending;
  const feedbackText = !feedback ? '' : feedback.type === 'copy' ? copy[feedback.key]
    : feedback.type === 'report' ? reportRu[feedback.key]
      : (hosted ? publicReportErrorRu[feedback.code] : undefined) ?? reportErrorRu[feedback.code];
  const dateText = (value: string) => new Date(value).toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU', { timeZone: 'UTC', timeZoneName: 'short' });

  function setIssue(value: typeof storageIssue) { storageIssueRef.current = value; setStorageIssue(value); }
  function replaceState(next: JournalDraft) { stateRef.current = next; setJournal(next); }
  function persist(next: JournalDraft): boolean {
    const saved = storageIssueRef.current !== 'corrupt' && writeJournalDraft(browserDraftStorage(), mode, next);
    if (storageIssueRef.current !== 'corrupt') setIssue(saved ? null : 'unavailable');
    return saved;
  }
  // A pending request created in another tab must never be silently replaced by a new UUID.
  function reconcilePending(): boolean {
    const latest = readJournalDraft(browserDraftStorage(), mode);
    if (latest.issue === 'corrupt') { setIssue('corrupt'); return false; }
    if (latest.state.pending && latest.state.pending.clientRequestId !== stateRef.current.pending?.clientRequestId) {
      replaceState(latest.state); setIssue(null); setFeedback({ type: 'copy', key: 'changedElsewhere' }); return false;
    }
    return true;
  }

  useLayoutEffect(() => {
    const element = feedbackRef.current;
    if (!feedbackText || !element || document.activeElement !== element) return;
    const bounds = element.getBoundingClientRect();
    const viewportHeight = document.documentElement.clientHeight;
    if (bounds.top < 0 || bounds.bottom > viewportHeight) {
      const offset = bounds.top < 0 ? Math.floor(bounds.top) - 4 : Math.ceil(bounds.bottom - viewportHeight) + 4;
      window.scrollBy({ top: offset, behavior: 'instant' });
    }
  }, [feedbackText]);

  useEffect(() => {
    const generation = readGeneration;
    mounted.current = true;
    const offline = () => { setOnline(false); setReconnected(false); };
    // Connectivity changes only update UI. They never send or retry a report.
    const onlineAgain = () => { setOnline(true); setReconnected(true); };
    window.addEventListener('offline', offline);
    window.addEventListener('online', onlineAgain);
    return () => {
      mounted.current = false; generation.current++;
      readController.current?.abort(); writeController.current?.abort();
      window.removeEventListener('offline', offline); window.removeEventListener('online', onlineAgain);
    };
  }, []);

  useEffect(() => {
    if (!connected) return;
    const changed = (event: StorageEvent) => {
      if (event.key !== journalDraftKey(mode) || busy.current) return;
      const latest = readJournalDraft(browserDraftStorage(), mode);
      // Preserve this tab's unsaved text if storage is unavailable or another tab merely deleted its copy.
      if (latest.issue || !latest.restored) return;
      if (latest.state.pending) {
        stateRef.current = latest.state; setJournal(latest.state);
        setFeedback({ type: 'copy', key: 'changedElsewhere' });
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [connected, mode]);

  const refresh = useCallback(async (before: number | null = null) => {
    if (!connected) return;
    const generation = ++readGeneration.current;
    readController.current?.abort();
    const controller = new AbortController(); readController.current = controller;
    setReadStarted(true); setLoading(true);
    try {
      const page = await listReports(before, controller.signal);
      if (!mounted.current || generation !== readGeneration.current) return;
      setRecords(previous => before === null ? page.reports : [...previous, ...page.reports.filter(record => !previous.some(item => item.id === record.id))]);
      setCursor(page.nextCursor); setStale(false);
    } catch {
      if (!mounted.current || generation !== readGeneration.current) return;
      setStale(true);
    } finally { if (mounted.current && generation === readGeneration.current) setLoading(false); }
  }, [connected]);

  // Opening is the read trigger. Static mode never probes, including StrictMode replay.
  useEffect(() => {
    const generation = readGeneration;
    if (open && connected) void refresh();
    return () => { generation.current++; readController.current?.abort(); };
  }, [open, connected, refresh]);

  const frozen = sending || attempt !== null || storageIssue === 'corrupt';
  const passageOptions = REPORT_PASSAGES.filter(item => kind !== 'lift_unavailable' || item.type === 'lift');
  function changeDraft(nextDraft: ReportDraft) {
    if (busy.current || stateRef.current.pending || !reconcilePending()) return;
    const next: JournalDraft = { version: 1, draft: nextDraft, pending: null };
    replaceState(next); persist(next); setFeedback(null);
  }
  function changeKind(value: ReportKind) {
    const current = stateRef.current.draft;
    const nextPassage = validTarget(value, current.passageId) ? current.passageId
      : value === 'note' ? null : REPORT_PASSAGES.find(item => value !== 'lift_unavailable' || item.type === 'lift')!.id;
    changeDraft({ ...current, kind: value, passageId: nextPassage });
  }
  async function send(payload: CreateReport, retry: boolean) {
    if (busy.current || !connected || !navigator.onLine || storageIssueRef.current === 'corrupt') return;
    busy.current = true;
    try {
      // Serialize explicit sends across tabs where Web Locks is available. The UUID remains
      // the server-side protection on every browser, including retries after a tab closes.
      if (navigator.locks) {
        await navigator.locks.request(journalDraftKey(mode), { ifAvailable: true }, async lock => {
          if (!lock) {
            reconcilePending(); setFeedback({ type: 'copy', key: 'busyElsewhere' }); return;
          }
          await performSend(payload, retry);
        });
      } else await performSend(payload, retry);
    } catch {
      if (mounted.current) setFeedback(stateRef.current.pending
        ? { type: 'report', key: hosted ? 'publicAmbiguous' : 'ambiguous' }
        : { type: 'copy', key: 'storageBlocked' });
    } finally {
      busy.current = false;
      if (mounted.current) { setSending(false); feedbackRef.current?.focus({ preventScroll: true }); }
    }
  }
  async function performSend(payload: CreateReport, retry: boolean) {
    if (!mounted.current) return;
    // Persist the complete normalized payload and UUID before fetch. A reload always treats it as uncertain.
    if (!reconcilePending()) return;
    const submitted: JournalDraft = { ...stateRef.current, pending: payload };
    if (!persist(submitted)) {
      if (!stateRef.current.pending) setFeedback({ type: 'copy', key: 'storageBlocked' });
      return;
    }
    replaceState(submitted);
    setSending(true); setFeedback({ type: 'copy', key: 'sending' });
    feedbackRef.current?.focus({ preventScroll: true });
    const controller = new AbortController(); writeController.current = controller;
    try {
      await createReport(payload, controller.signal);
      if (!mounted.current) return;
      finishAttempt(submitted, true);
      setFeedback({ type: 'report', key: hosted ? 'publicSaved' : 'saved' }); void refresh();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ReportClientError && error.definite && !retry) {
        finishAttempt(submitted, false);
        setFeedback({ type: 'error', code: error.code as ReportErrorCode });
      } else {
        // A definite retry rejection cannot resolve whether the original request committed.
        setFeedback({ type: 'report', key: error instanceof ReportClientError && error.definite
          ? 'retryRejected' : hosted ? 'publicAmbiguous' : 'ambiguous' });
        setStale(true);
      }
    }
  }
  function finishAttempt(submitted: JournalDraft, saved: boolean) {
    const next: JournalDraft = { version: 1, draft: { ...submitted.draft, message: saved ? '' : submitted.draft.message }, pending: null };
    const completion = completeJournalDraft(browserDraftStorage(), mode, submitted, next);
    if (completion.status === 'written' || completion.status === 'changed') {
      // Adopt a newer revision as-is; finishing the old request must not rewrite it.
      replaceState(completion.state); setIssue(null);
    } else {
      replaceState(next); setIssue(completion.status);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || stateRef.current.pending || frozen) return;
    const current = stateRef.current.draft;
    const normalized = normalizeMessage(current.message);
    if (normalized === null || !validTarget(current.kind, current.passageId)) {
      setFeedback({ type: 'report', key: 'invalid' }); feedbackRef.current?.focus({ preventScroll: true }); return;
    }
    let clientRequestId: string;
    try { clientRequestId = crypto.randomUUID(); }
    catch { setFeedback({ type: 'copy', key: 'unavailableId' }); return; }
    void send({ buildingId: REPORT_BUILDING_ID, passageId: current.passageId, kind: current.kind, message: normalized, clientRequestId }, false);
  }
  function abandon() {
    if (busy.current || !window.confirm(copy.abandonConfirm)) return;
    const next = { ...stateRef.current, pending: null };
    // Only unlock after the durable pending identity is explicitly removed.
    if (persist(next)) { replaceState(next); setFeedback({ type: 'report', key: 'abandoned' }); }
  }
  function clearDraft(corrupt = false) {
    if (busy.current || !window.confirm(corrupt ? copy.corruptConfirm : copy.clearConfirm)) return;
    if (!removeJournalDraft(browserDraftStorage(), mode)) { setIssue(corrupt ? 'corrupt' : 'unavailable'); return; }
    replaceState(emptyJournalDraft()); setIssue(null); setFeedback({ type: 'copy', key: 'cleared' });
  }
  return <section className="report-journal" aria-label={reportRu.title} data-testid="report-journal" data-mode={mode}>
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary><strong>{reportRu.title}</strong><span>{hosted ? reportRu.publicSubtitle : reportRu.subtitle}</span></summary>
      <div className="journal-content">
        <p>{reportRu.unverified}</p>
        {!connected ? <p className="journal-notice">{reportRu.static}</p> : <>
          <p id="report-privacy">{hosted ? reportRu.publicPrivacy : reportRu.privacy}</p>
          {(!online || reconnected) && <p className="journal-notice" role="status" data-testid="report-network-status">{online ? copy.online : copy.offline}</p>}
          {storageIssue && <div className="journal-notice" role="alert" data-testid="report-storage-warning">
            <p>{storageIssue === 'corrupt' ? copy.corrupt : copy.storageWarning}</p>
            {storageIssue === 'corrupt'
              ? <button type="button" disabled={sending} onClick={() => clearDraft(true)}>{copy.discardCorrupt}</button>
              : <button type="button" disabled={sending} onClick={() => { if (reconcilePending() && persist(stateRef.current)) setFeedback({ type: 'copy', key: 'draftSaved' }); }}>{copy.storageRetry}</button>}
          </div>}
          <form onSubmit={submit} aria-label={copy.form} noValidate>
            <fieldset disabled={frozen} aria-describedby="report-privacy report-message-help">
              <legend>{copy.newReport}</legend>
              <div className="journal-fields"><label>{copy.kind}<select value={kind} onChange={event => changeKind(event.target.value as ReportKind)}>{REPORT_KINDS.map(value => <option key={value} value={value}>{reportKindRu[value]}</option>)}</select></label>
                <label>{copy.passage}<select value={passageId ?? ''} onChange={event => changeDraft({ ...stateRef.current.draft, passageId: event.target.value || null })}>{kind === 'note' && <option value="">{copy.building}</option>}{passageOptions.map(item => <option key={item.id} value={item.id}>{passageLabelRu(item.id, item.label)}</option>)}</select>{passageId === 'door-205' && <small>{ru.room205}</small>}</label></div>
              <label htmlFor="report-message">{copy.message}</label>
              <textarea id="report-message" value={message} onChange={event => changeDraft({ ...stateRef.current.draft, message: event.target.value })} rows={4} maxLength={1000} aria-describedby="report-message-help" aria-invalid={feedback?.type === 'report' && feedback.key === 'invalid'} required />
              <small id="report-message-help">{copy.help}</small>
              <button type="submit" disabled={!online}>{hosted ? copy.submitPublic : copy.submitLocal}</button>
            </fieldset>
          </form>
          <p ref={feedbackRef} tabIndex={-1} className="journal-feedback" role="status" aria-live="polite" aria-atomic="true" data-testid="report-feedback">{feedbackText}</p>
          {attempt && <small data-testid="report-request-id">{copy.requestId}: {attempt.clientRequestId}</small>}
          {attempt && !sending && <div className="journal-actions"><button type="button" disabled={!online || storageIssue === 'corrupt'} onClick={() => void send(attempt, true)}>{copy.retry}</button><button type="button" disabled={storageIssue === 'corrupt'} onClick={abandon}>{copy.abandon}</button></div>}
          {!attempt && !sending && storageIssue !== 'corrupt' && message && <button type="button" onClick={() => clearDraft()}>{copy.clearDraft}</button>}
          <div className="journal-list-heading"><h3>{copy.saved}</h3><button type="button" disabled={loading} onClick={() => void refresh()}>{copy.refresh}</button></div>
          <p className="journal-dates">{reportRu.dates}</p>
          <p className={stale && !loading ? 'journal-notice' : ''} role="status" aria-live="polite" aria-atomic="true" data-testid="report-read-status">{!readStarted || loading ? <>{hosted ? reportRu.publicLoading : reportRu.loading}{records.length > 0 && ` ${reportRu.refreshStale}`}</> : stale ? <span data-testid="report-stale">{hosted ? reportRu.publicUnavailable : reportRu.unavailable}</span> : records.length === 0 ? reportRu.empty : reportRu.loaded}</p>
          <ol className="journal-records" data-stale={stale || loading && records.length > 0}>{records.map(record => <li key={record.id} data-report-id={record.id}>
            <div className="journal-record-title"><strong>{reportKindRu[record.kind]} · {passageLabelRu(record.passageId, REPORT_PASSAGES.find(item => item.id === record.passageId)?.label ?? copy.building)}</strong><span>{reportStatusRu[record.status]}</span></div>
            <p className="journal-message">{record.message}</p>
            <small>{copy.sent}: <time dateTime={record.createdAt}>{dateText(record.createdAt)}</time>. {copy.updated}: <time dateTime={record.updatedAt}>{dateText(record.updatedAt)}</time>. {copy.version} {record.version}.</small>
            <small>{copy.unverified} · ID: {record.id}</small>
          </li>)}</ol>
          {cursor !== null && <button type="button" disabled={loading || stale} onClick={() => void refresh(cursor)}>{copy.earlier}</button>}
        </>}
      </div>
    </details>
  </section>;
}

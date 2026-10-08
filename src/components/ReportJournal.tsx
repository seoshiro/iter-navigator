import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { normalizeMessage, REPORT_BUILDING_ID, REPORT_KINDS, REPORT_PASSAGES, validTarget } from '../../shared/report-contract.ts';
import type { CreateReport, Report, ReportKind } from '../../shared/report-contract.ts';
import { createReport, reportServiceMode, listReports, ReportClientError } from '../reports/client';
import { reportErrorRu, publicReportErrorRu, reportKindRu, reportRu, reportStatusRu } from '../i18n/report-ru';
import { passageLabelRu, ru } from '../i18n/ru';

const dateText = (value: string) => new Date(value).toLocaleString('ru-RU', { timeZone: 'UTC', timeZoneName: 'short' });
export function ReportJournal() {
  const [mode] = useState(() => reportServiceMode(document));
  const connected = mode !== 'static';
  const hosted = mode === 'public-demo';
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReportKind>('lift_unavailable');
  const [passage, setPassage] = useState('lift-a-01');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState<CreateReport | null>(null);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [records, setRecords] = useState<Report[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const mounted = useRef(false);
  const busy = useRef(false);
  const uncertainAttempt = useRef(false);
  const readGeneration = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const writeController = useRef<AbortController | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const element = feedbackRef.current;
    if (!feedback || !element || document.activeElement !== element) return;
    const bounds = element.getBoundingClientRect();
    const viewportHeight = document.documentElement.clientHeight;
    if (bounds.top < 0 || bounds.bottom > viewportHeight) {
      const offset = bounds.top < 0 ? Math.floor(bounds.top) - 4 : Math.ceil(bounds.bottom - viewportHeight) + 4;
      window.scrollBy({ top: offset, behavior: 'instant' });
    }
  }, [feedback]);
  useEffect(() => {
    const generation = readGeneration;
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; readController.current?.abort(); writeController.current?.abort(); };
  }, []);
  const refresh = useCallback(async (before: number | null = null) => {
    const generation = ++readGeneration.current;
    readController.current?.abort(); const controller = new AbortController(); readController.current = controller;
    setLoading(true);
    try {
      const page = await listReports(before, controller.signal);
      if (!mounted.current || generation !== readGeneration.current) return;
      setRecords(previous => before === null ? page.reports : [...previous, ...page.reports.filter(record => !previous.some(item => item.id === record.id))]);
      setCursor(page.nextCursor); setStale(false);
    } catch {
      if (!mounted.current || generation !== readGeneration.current) return;
      setStale(true);
    } finally { if (mounted.current && generation === readGeneration.current) setLoading(false); }
  }, []);
  // Opening is the read trigger. Static mode never probes, including StrictMode replay.
  useEffect(() => {
    const generation = readGeneration;
    if (open && connected) void refresh();
    return () => { generation.current++; readController.current?.abort(); };
  }, [open, connected, refresh]);
  const frozen = sending || attempt !== null;
  const passageOptions = REPORT_PASSAGES.filter(item => kind !== 'lift_unavailable' || item.type === 'lift');
  function changeKind(value: ReportKind) {
    setKind(value);
    if (!validTarget(value, passage || null)) setPassage(value === 'note' ? '' : REPORT_PASSAGES.find(item => value !== 'lift_unavailable' || item.type === 'lift')!.id);
  }
  async function send(payload: CreateReport) {
    if (busy.current || !connected) return;
    busy.current = true; setSending(true); setAttempt(payload); setFeedback('Отправка…'); feedbackRef.current?.focus({ preventScroll: true });
    const controller = new AbortController(); writeController.current = controller;
    try {
      await createReport(payload, controller.signal);
      if (!mounted.current) return;
      uncertainAttempt.current = false; setAttempt(null); setMessage(''); setFeedback(hosted ? reportRu.publicSaved : reportRu.saved); void refresh();
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ReportClientError && error.definite && !uncertainAttempt.current) { setAttempt(null); setFeedback((hosted ? publicReportErrorRu[error.code as keyof typeof reportErrorRu] : undefined) ?? reportErrorRu[error.code as keyof typeof reportErrorRu]); }
      else { uncertainAttempt.current = true; setFeedback(error instanceof ReportClientError && error.definite ? reportRu.retryRejected : (hosted ? reportRu.publicAmbiguous : reportRu.ambiguous)); setStale(true); }
    } finally { busy.current = false; if (mounted.current) { setSending(false); feedbackRef.current?.focus({ preventScroll: true }); } }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeMessage(message);
    if (normalized === null || !validTarget(kind, passage || null)) { setFeedback(reportRu.invalid); return; }
    if (!frozen) void send({ buildingId: REPORT_BUILDING_ID, passageId: passage || null, kind, message: normalized, clientRequestId: crypto.randomUUID() });
  }
  return <section className="report-journal" aria-label={reportRu.title} data-testid="report-journal" data-mode={mode}>
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary><strong>{reportRu.title}</strong><span>{hosted ? reportRu.publicSubtitle : reportRu.subtitle}</span></summary>
      <div className="journal-content">
        <p>{reportRu.unverified}</p>
        {!connected ? <p className="journal-notice">{reportRu.static}</p> : <>
          <p id="report-privacy">{hosted ? reportRu.publicPrivacy : reportRu.privacy}</p>
          <form onSubmit={submit} aria-label="Отправить сообщение о препятствии">
            <fieldset disabled={frozen} aria-describedby="report-privacy report-message-help">
              <legend>Новое сообщение</legend>
              <div className="journal-fields"><label>Тип сообщения<select value={kind} onChange={event => changeKind(event.target.value as ReportKind)}>{REPORT_KINDS.map(value => <option key={value} value={value}>{reportKindRu[value]}</option>)}</select></label>
                <label>Проход в учебной модели<select value={passage} onChange={event => setPassage(event.target.value)}>{kind === 'note' && <option value="">Здание в целом</option>}{passageOptions.map(item => <option key={item.id} value={item.id}>{passageLabelRu(item.id, item.label)}</option>)}</select>{passage === 'door-205' && <small>{ru.room205}</small>}</label></div>
              <label htmlFor="report-message">Описание препятствия</label><textarea id="report-message" value={message} onChange={event => setMessage(event.target.value)} rows={4} aria-describedby="report-message-help" required />
              <small id="report-message-help">1–500 символов. Только текст. Черновик хранится в этой открытой вкладке до отправки или перезагрузки.</small>
              <button type="submit">{hosted ? 'Отправить в публичный журнал' : 'Отправить в локальный журнал'}</button>
            </fieldset>
          </form>
          <p ref={feedbackRef} tabIndex={-1} className="journal-feedback" role="status" aria-live="polite" aria-atomic="true" data-testid="report-feedback">{feedback}</p>
          {attempt && !sending && <div className="journal-actions"><button type="button" onClick={() => void send(attempt)}>Повторить тот же запрос</button><button type="button" onClick={() => { uncertainAttempt.current = false; setAttempt(null); setFeedback(reportRu.abandoned); }}>Завершить попытку и разрешить правку</button></div>}
          <div className="journal-list-heading"><h3>Сохранённые сообщения</h3><button type="button" onClick={() => void refresh()}>Обновить журнал</button></div>
          <p className="journal-dates">{reportRu.dates}</p>
          {loading && <p role="status">{reportRu.loading}</p>}
          {stale && <p className="journal-notice" role="status" data-testid="report-stale">{hosted ? reportRu.publicUnavailable : reportRu.unavailable}</p>}
          {!loading && !stale && records.length === 0 && <p>В журнале пока нет сообщений.</p>}
          <ol className="journal-records" data-stale={stale}>{records.map(record => <li key={record.id} data-report-id={record.id}>
            <div className="journal-record-title"><strong>{reportKindRu[record.kind]} · {passageLabelRu(record.passageId, REPORT_PASSAGES.find(item => item.id === record.passageId)?.label ?? 'Здание в целом')}</strong><span>{reportStatusRu[record.status]}</span></div>
            <p className="journal-message">{record.message}</p>
            <small>Отправлено: <time dateTime={record.createdAt}>{dateText(record.createdAt)}</time>. Обновлено: <time dateTime={record.updatedAt}>{dateText(record.updatedAt)}</time>. Версия {record.version}.</small>
            <small>Непроверенное сообщение · ID: {record.id}</small>
          </li>)}</ol>
          {cursor !== null && <button type="button" disabled={loading || stale} onClick={() => void refresh(cursor)}>Показать более ранние сообщения</button>}
        </>}
      </div>
    </details>
  </section>;
}

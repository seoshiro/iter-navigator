import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { closureDurations, moderatorSessionLifetimeMs } from '../../shared/moderation.ts';
import type { ModerationCommand, ModerationItem, ModerationPage } from '../../shared/moderation.ts';
import { REPORT_PASSAGES } from '../../shared/report-contract.ts';
import { useI18n } from '../i18n/locale';
import { moderationCopy } from '../reports/moderation-copy';
import { refreshPassages } from '../reports/use-passage-updates';

interface Session { token: string; discardAt: number }
class RequestFailure extends Error {
  readonly status: number;
  constructor(status: number) { super(); this.status = status; }
}
async function request<T>(path: string, bearer: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(12_000);
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + bearer, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', mode: 'same-origin',
    credentials: 'omit', redirect: 'error', signal: signal ? AbortSignal.any([timeout, signal]) : timeout });
  if (!response.ok) throw new RequestFailure(response.status);
  return await response.json() as T;
}

function Item({ item: { report, closure }, disabled, act }: {
  item: ModerationItem; disabled: boolean; act: (command: ModerationCommand) => void;
}) {
  const { locale, language, reportKindRu, reportStatusRu, passageLabelRu } = useI18n();
  const copy = moderationCopy[locale];
  const [duration, setDuration] = useState('');
  const passage = REPORT_PASSAGES.find(p => p.id === report.passageId);
  const identity = { id: report.id, version: report.version };
  return <li data-moderation-id={report.id}>
    <strong>{reportKindRu[report.kind]}{passage && ' · ' + passageLabelRu(passage.id, passage.label)}</strong>
    <small>{reportStatusRu[report.status]} · <time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString(language)}</time></small>
    <p className="journal-message">{report.message}</p>
    {closure && <p><strong>{copy[closure.state]}</strong>{closure.state === 'active' && closure.expiresAt && ' · ' + new Date(closure.expiresAt).toLocaleString(language)}</p>}
    <div className="moderator-actions">
      {report.status === 'pending' && <>
        <button disabled={disabled} onClick={() => act({ ...identity, action: 'review' })}>{copy.review}</button>
        <button disabled={disabled} onClick={() => act({ ...identity, action: 'reject' })}>{copy.reject}</button>
      </>}
      {passage && !closure && report.status !== 'rejected' && <>
        <label>{copy.duration}<select value={duration} disabled={disabled} onChange={e => setDuration(e.target.value)}>
          <option value="">{copy.manual}</option>{closureDurations.map(h => <option key={h} value={h}>{h} {copy.hours}</option>)}
        </select></label>
        <button disabled={disabled} onClick={() => act({ ...identity, action: 'close', hours: duration ? Number(duration) : null })}>{copy.close}</button>
      </>}
      {closure?.state === 'active' && <button disabled={disabled} onClick={() => act({ ...identity, action: 'reopen' })}>{copy.reopen}</button>}
    </div>
  </li>;
}

function Inbox({ session, end }: { session: Session; end: (expired: boolean) => void }) {
  const { locale } = useI18n();
  const copy = moderationCopy[locale];
  const [history, setHistory] = useState<(number | null)[]>([null]);
  const before = history.at(-1);
  const [page, setPage] = useState<ModerationPage | null>(null);
  const [revision, setRevision] = useState(0);
  const [writing, setWriting] = useState(false);
  const [notice, setNotice] = useState<'saved' | 'error' | 'changed' | null>(null);
  const [readError, setReadError] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => end(true), Math.max(0, session.discardAt - performance.now()));
    return () => clearTimeout(timer);
  }, [session, end]);
  useEffect(() => {
    const controller = new AbortController();
    setPage(null); setReadError(false);
    request<ModerationPage>('/api/moderation?limit=10' + (before ? '&before=' + before : ''), session.token, undefined, controller.signal)
      .then(value => { if (!controller.signal.aborted) setPage(value); })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (error instanceof RequestFailure && error.status === 403) end(true);
        else setReadError(true);
      });
    return () => controller.abort();
  }, [before, revision, session, end]);
  async function act(command: ModerationCommand) {
    if (writing) return;
    setWriting(true); setNotice(null);
    try {
      await request('/api/moderation', session.token, command);
      setNotice('saved'); refreshPassages();
    } catch (error) {
      if (error instanceof RequestFailure && error.status === 403) { end(true); return; }
      setNotice(error instanceof RequestFailure && error.status === 409 ? 'changed' : 'error');
    } finally { setWriting(false); setRevision(v => v + 1); }
  }
  return <>
    <div className="moderator-actions"><button disabled={writing} onClick={() => { setHistory([null]); setRevision(v => v + 1); setNotice(null); }}>{copy.refresh}</button>
      <button onClick={() => end(false)}>{copy.logout}</button></div>
    <p role="status">{notice && copy[notice]} {readError ? copy.error : !page ? copy.working : !page.items.length ? copy.empty : ''}</p>
    <ol className="journal-records">{page?.items.map(item => <Item key={item.report.id} item={item} disabled={writing} act={act}/>)}</ol>
    <div className="moderator-actions">{history.length > 1 && <button disabled={writing} onClick={() => setHistory(h => h.slice(0, -1))}>{copy.previous}</button>}
      {page?.nextCursor && <button disabled={writing} onClick={() => setHistory(h => [...h, page.nextCursor])}>{copy.next}</button>}</div>
  </>;
}

function ModeratorAccess() {
  const { locale } = useI18n();
  const copy = moderationCopy[locale];
  const key = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [feedback, setFeedback] = useState<'loginDenied' | 'sessionEnded' | 'error' | null>(null);
  const [busy, setBusy] = useState(false);
  const end = useCallback((expired: boolean) => { setSession(null); setFeedback(expired ? 'sessionEnded' : null); }, []);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!key.current || busy) return;
    const credential = key.current.value;
    key.current.value = ''; setBusy(true); setFeedback(null);
    // The server validates expiration. Measure the local display timeout from the request
    // using elapsed time, so an incorrectly set device clock cannot end a fresh session.
    const discardAt = performance.now() + moderatorSessionLifetimeMs;
    try {
      const { token } = await request<{ token: string }>('/api/moderation-session', credential, {});
      setSession({ token, discardAt });
    }
    catch (error) { setFeedback(error instanceof RequestFailure && error.status === 403 ? 'loginDenied' : 'error'); }
    finally { setBusy(false); }
  }
  return session ? <Inbox session={session} end={end}/> : <form onSubmit={signIn}>
    <label>{copy.key}<input type="password" ref={key} required maxLength={128} autoComplete="off" spellCheck={false}/></label>
    <button disabled={busy}>{copy.login}</button><p role="status">{feedback && copy[feedback]}</p>
  </form>;
}

export function ModerationPanel() {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  return <section className="report-journal moderation-panel"><details onToggle={e => setOpen(e.currentTarget.open)}>
    <summary><strong>{moderationCopy[locale].title}</strong></summary>
    {open && <div className="journal-content"><ModeratorAccess/></div>}
  </details></section>;
}

import { useEffect, useState } from 'react';
import { isPassageUpdates } from '../../shared/moderation.ts';
import type { PassageUpdates } from '../../shared/moderation.ts';
import { reportServiceMode } from './client';

const empty: PassageUpdates = { closed: [], warnings: [] };
export const refreshPassages = () => window.dispatchEvent(new Event('iter-passage-update'));

export function usePassageUpdates() {
  const [connected] = useState(() => reportServiceMode(document) !== 'static');
  const [snapshot, setSnapshot] = useState<PassageUpdates | null>(connected ? null : empty);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!connected) return;
    let latest: AbortController | undefined;
    async function refresh() {
      latest?.abort();
      const controller = new AbortController();
      latest = controller;
      try {
        const response = await fetch('/api/closures', { credentials: 'omit', mode: 'same-origin', redirect: 'error',
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        if (!response.ok) throw new Error();
        const value: unknown = await response.json();
        if (!isPassageUpdates(value)) throw new Error();
        if (!controller.signal.aborted) { setSnapshot(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value); setFailed(false); }
      } catch { if (!controller.signal.aborted) setFailed(true); }
    }
    const visible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    const timer = window.setInterval(visible, 15_000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    window.addEventListener('online', refresh);
    window.addEventListener('iter-passage-update', refresh);
    return () => {
      latest?.abort(); clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
      window.removeEventListener('online', refresh);
      window.removeEventListener('iter-passage-update', refresh);
    };
  }, [connected]);
  return { snapshot: snapshot ?? empty, ready: !!snapshot && !failed, failed, connected };
}

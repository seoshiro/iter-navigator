import { useEffect, useRef, useState } from 'react';
import { introMedia } from './introMedia';
import type { PresentationLanguage } from './content';

export function IntroFilm({ active, reduced, lang, onComplete }: { active: boolean; reduced: boolean; lang: PresentationLanguage; onComplete(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (!active || reduced || !introMedia) { element?.pause(); return; }
    let cancelled = false;
    const onVisibility = () => { if (document.hidden) { element?.pause(); onComplete(); } };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { element?.pause(); onComplete(); } };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    void element?.play().catch(() => { if (!cancelled) onComplete(); });
    // No blocked navigation or indefinite poster when a media server is unavailable.
    const timer = window.setTimeout(() => { if (!element || element.readyState < 2) onComplete(); }, 2200);
    return () => { cancelled = true; element?.pause(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('keydown', onKey); };
  }, [active, reduced, onComplete]);
  if (!introMedia || !active || reduced) return null;
  return <div className="pres-intro-film" data-playing={visible} data-testid="presentation-intro-film">
    <video ref={video} src={introMedia.src} poster={introMedia.poster} muted playsInline preload="metadata" onPlaying={() => setVisible(true)} onEnded={onComplete} onError={onComplete} aria-label={lang === 'kk' ? 'ITER ғимаратының кіріспе бейнесі' : 'Вступительный ролик здания ITER'} />
    <button onClick={() => { video.current?.pause(); onComplete(); }}>{lang === 'kk' ? 'Өткізіп жіберу' : 'Пропустить вступление'} <span>Esc</span></button>
  </div>;
}

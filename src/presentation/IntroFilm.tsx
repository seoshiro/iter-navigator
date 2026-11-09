import { useEffect, useRef, useState } from 'react';
import { introMedia } from './introMedia';
import type { PresentationLanguage } from './content';

export function IntroFilm({ active, reduced, ready, lang, onComplete }: { active: boolean; reduced: boolean; ready: boolean; lang: PresentationLanguage; onComplete(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [finished, setFinished] = useState(false);
  useEffect(() => { if (finished && ready && active) onComplete(); }, [finished, ready, active, onComplete]);
  useEffect(() => {
    const element = video.current;
    if (!active || reduced || !introMedia) { element?.pause(); return; }
    let cancelled = false;
    if (element) element.playbackRate = 1.2;
    let frame = 0;
    const crop = () => {
      if (!element || cancelled) return;
      const progress = Number.isFinite(element.duration) && element.duration > 0 ? Math.min(1, element.currentTime / element.duration) : 0;
      element.style.transform = `scale(${1 + .35 * (1 - progress) ** 2})`;
      frame = requestAnimationFrame(crop);
    };
    crop();
    const onVisibility = () => { if (document.hidden) { element?.pause(); onComplete(); } };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { element?.pause(); onComplete(); } };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    void element?.play().catch(() => { if (!cancelled) setFinished(true); });
    // No blocked navigation or indefinite poster when a media server is unavailable.
    const timer = window.setTimeout(() => { if (!element || element.readyState < 2) setFinished(true); }, 2200);
    return () => { cancelled = true; element?.pause(); cancelAnimationFrame(frame); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('keydown', onKey); };
  }, [active, reduced, onComplete]);
  if (!introMedia || !active || reduced) return null;
  return <div className="pres-intro-film" data-playing={visible} data-testid="presentation-intro-film">
    <video ref={video} src={introMedia.src} poster={introMedia.poster} muted playsInline preload="metadata" onPlaying={() => setVisible(true)} onEnded={() => { if (video.current) video.current.style.transform = 'scale(1)'; setFinished(true); }} onError={() => setFinished(true)} aria-label={lang === 'kk' ? 'ITER ғимаратының кіріспе бейнесі' : 'Вступительный ролик здания ITER'} />
    <button onClick={() => { video.current?.pause(); onComplete(); }}>{lang === 'kk' ? 'Өткізіп жіберу' : 'Пропустить вступление'} <span>Esc</span></button>
  </div>;
}

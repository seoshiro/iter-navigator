import { useState } from 'react';
import type { PresentationLanguage } from './content';

/** This commissioned concept is deliberately separate from the real ITER route model. */
export function PilotConcept({ lang }: { lang: PresentationLanguage }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const t = (ru: string, kk: string) => lang === 'kk' ? kk : ru;
  return <figure className="pres-pilot-concept" data-testid="presentation-pilot-concept" data-artwork-loaded={loaded}>
    <div className="pres-pilot-art">
      {failed ? <div className="pres-pilot-art-fallback"><strong>1</strong><span>{t('этаж будущего пилота', 'болашақ пилот қабаты')}</span><small>{t('Художественный образ недоступен', 'Көркем бейне қолжетімсіз')}</small></div> : <img src="/presentation/media/pilot-concept.webp" width={1600} height={1195} alt={t('Художественный макет будущего пилота: светлый камень, стекло приглушённого бирюзового оттенка и входной проход. Это не реальная планировка ITER.', 'Болашақ пилоттың көркем макеті: ашық түсті тас, бәсең көгілдір шыны және кіреберіс өткел. Бұл ITER-дің нақты жоспары емес.')} loading="eager" decoding="sync" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
      {!failed && <span className="pres-pilot-floor-badge">1 <span>{t('этаж', 'қабат')}</span></span>}
    </div>
    <figcaption>{t('Художественный образ будущего пилота · Higgsfield', 'Болашақ пилоттың көркем бейнесі · Higgsfield')}</figcaption>
  </figure>;
}

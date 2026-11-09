import { useState } from 'react';
import type { Building, Scenario } from '../domain/model';
import { defaultScenario } from '../domain/storage';
import { serializeRouteLink } from '../domain/share';
import { useI18n } from '../i18n/locale';
export function RouteShare({ building, scenario }: { building: Building; scenario: Scenario }) {
  const { locale, nodeLabelRu } = useI18n();
  const t = (ru: string, kk: string) => locale === 'kk' ? kk : ru;
  const [shared, setShared] = useState('');
  const [copyStatus, setCopyStatus] = useState<'none'|'copied'|'manual'|'invalid'>('none');
  const [qrCodes, setQrCodes] = useState<{id:string;url:string;image:string}[]>([]);
  const [qrState, setQrState] = useState<'idle'|'loading'|'error'|'ready'>('idle');
  async function share() {
    const result = serializeRouteLink(window.location.href, building, scenario);
    if (!result.valid) { setCopyStatus('invalid'); return; }
    setShared(result.value);
    try { await navigator.clipboard.writeText(result.value); setCopyStatus('copied'); }
    catch { setCopyStatus('manual'); }
  }
  async function showQR() {
    if (qrState === 'loading' || qrState === 'ready') return;
    setQrState('loading');
    try {
      const QRCode = await import('qrcode');
      const values = await Promise.all(['entrance','hall-1','room-library'].map(async id => {
        const result = serializeRouteLink(window.location.origin + window.location.pathname, building, { ...defaultScenario(), start: id });
        if (!result.valid) throw new Error('invalid start');
        return { id, url: result.value, image: await QRCode.toDataURL(result.value, { width: 360, margin: 4, errorCorrectionLevel: 'M' }) };
      }));
      setQrCodes(values); setQrState('ready');
    } catch { setQrState('error'); }
  }
  return <details className="share-panel"><summary>{t('Поделиться маршрутом и QR-точки', 'Бағытты бөлісу және QR-нүктелер')}</summary><p>{t('Ссылка передаёт старт, цель и условия. При открытии маршрут рассчитывается заново. Закрытия из симуляции не передаются.', 'Сілтемеде бастау нүктесі, мақсат және шарттар беріледі. Ашқанда бағыт қайта есептеледі. Модельдегі уақытша жабылулар берілмейді.')}</p><button type="button" onClick={() => void share()}>{t('Скопировать ссылку на маршрут', 'Бағыт сілтемесін көшіру')}</button>
    {copyStatus !== 'none' && <p role="status">{copyStatus === 'copied' ? t('Ссылка скопирована.', 'Сілтеме көшірілді.') : copyStatus === 'manual' ? t('Автокопирование недоступно. Скопируйте ссылку из поля ниже.', 'Автоматты көшіру қолжетімсіз. Төмендегі сілтемені көшіріңіз.') : t('Нельзя создать ссылку с этими параметрами.', 'Бұл параметрлермен сілтеме жасау мүмкін емес.')}</p>}
    {shared && <label>{t('Ссылка на маршрут', 'Бағыт сілтемесі')}<input aria-label={t('Ссылка на маршрут', 'Бағыт сілтемесі')} value={shared} readOnly onFocus={event => event.currentTarget.select()} /></label>}
    <button type="button" onClick={() => void showQR()} disabled={qrState==='loading'}>{qrState==='loading' ? t('Готовим QR…', 'QR дайындалуда…') : t('Показать три QR-точки', 'Үш QR-нүктені көрсету')}</button><p>{t('QR задаёт известную точку старта, а не отслеживает положение. Это примеры для вымышленного здания.', 'QR белгілі бастау нүктесін таңдайды, адамның орнын бақыламайды. Бұл — ойдан шығарылған ғимарат мысалдары.')}</p>
    {qrState==='error' && <p role="alert">{t('Не удалось создать QR. Повторите попытку; ссылки работают без QR.', 'QR жасау мүмкін болмады. Қайталап көріңіз; сілтемелер QR-сыз да жұмыс істейді.')}</p>}
    <div className="qr-grid">{qrCodes.map(qr => { const node=building.nodes.find(node=>node.id===qr.id)!;const name=nodeLabelRu(node.id,node.label,node.labelKk);return <figure key={qr.id}><img src={qr.image} width="180" height="180" alt={t(`QR: старт ${name}`, `QR: бастау нүктесі ${name}`)}/><figcaption>{name}</figcaption><a href={qr.url}>{t('Открыть ссылку', 'Сілтемені ашу')}</a><a href={qr.image} download={`ITER-QR-${qr.id}.png`}>{t('Скачать QR', 'QR жүктеу')}</a></figure>;})}</div>
  </details>;
}

import { useState } from 'react';
import type { Building, Scenario } from '../domain/model';
import { defaultScenario } from '../domain/storage';
import { serializeRouteLink } from '../domain/share';
import { useI18n } from '../i18n/locale';
export function RouteShare({ building, scenario }: { building: Building; scenario: Scenario }) {
  const { locale, nodeLabelRu } = useI18n();
  const t = (ru: string, kk: string, en: string) => locale === 'en' ? en : locale === 'kk' ? kk : ru;
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
  return <details className="share-panel"><summary>{t('Поделиться маршрутом и QR-точки', 'Бағытты бөлісу және QR-нүктелер', "Share route and QR starting points")}</summary><p>{t('Ссылка передаёт старт, цель и условия. При открытии маршрут рассчитывается заново. Закрытия из симуляции не передаются.', 'Сілтемеде бастау нүктесі, мақсат және шарттар беріледі. Ашқанда бағыт қайта есептеледі. Модельдегі уақытша жабылулар берілмейді.', "The link includes the start, destination and requirements. The route is recalculated when opened. Simulated closures are not included.")}</p><button type="button" onClick={() => void share()}>{t('Скопировать ссылку на маршрут', 'Бағыт сілтемесін көшіру', "Copy route link")}</button>
    {copyStatus !== 'none' && <p role="status">{copyStatus === 'copied' ? t('Ссылка скопирована.', 'Сілтеме көшірілді.', "Link copied.") : copyStatus === 'manual' ? t('Автокопирование недоступно. Скопируйте ссылку из поля ниже.', 'Автоматты көшіру қолжетімсіз. Төмендегі сілтемені көшіріңіз.', "Automatic copying is unavailable. Copy the link from the field below.") : t('Нельзя создать ссылку с этими параметрами.', 'Бұл параметрлермен сілтеме жасау мүмкін емес.', "A link cannot be created with these parameters.")}</p>}
    {shared && <label>{t('Ссылка на маршрут', 'Бағыт сілтемесі', "Route link")}<input aria-label={t('Ссылка на маршрут', 'Бағыт сілтемесі', "Route link")} value={shared} readOnly onFocus={event => event.currentTarget.select()} /></label>}
    <button type="button" onClick={() => void showQR()} disabled={qrState==='loading'}>{qrState==='loading' ? t('Готовим QR…', 'QR дайындалуда…', "Preparing QR codes…") : t('Показать три QR-точки', 'Үш QR-нүктені көрсету', "Show three QR starting points")}</button><p>{t('QR задаёт известную точку старта, а не отслеживает положение. Это примеры для вымышленного здания.', 'QR белгілі бастау нүктесін таңдайды, адамның орнын бақыламайды. Бұл — ойдан шығарылған ғимарат мысалдары.', "Each QR code sets a known starting point. It does not track your location. These examples are for a fictional building.")}</p>
    {qrState==='error' && <p role="alert">{t('Не удалось создать QR. Повторите попытку; ссылки работают без QR.', 'QR жасау мүмкін болмады. Қайталап көріңіз; сілтемелер QR-сыз да жұмыс істейді.', "QR codes could not be created. Try again. The links work without QR codes.")}</p>}
    <div className="qr-grid">{qrCodes.map(qr => { const node=building.nodes.find(node=>node.id===qr.id)!;const name=nodeLabelRu(node.id,node.label,node.labelKk);return <figure key={qr.id}><img src={qr.image} width="180" height="180" alt={t(`QR: старт ${name}`, `QR: бастау нүктесі ${name}`, `QR code: start at ${name}`)}/><figcaption>{name}</figcaption><a href={qr.url}>{t('Открыть ссылку', 'Сілтемені ашу', "Open link")}</a><a href={qr.image} download={`ITER-QR-${qr.id}.png`}>{t('Скачать QR', 'QR жүктеу', "Download QR code")}</a></figure>;})}</div>
  </details>;
}

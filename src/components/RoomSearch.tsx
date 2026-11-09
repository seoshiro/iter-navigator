import { useState } from 'react';
import type { Building, BuildingNode } from '../domain/model';
import { useI18n } from '../i18n/locale';
export function RoomSearch({ building, selected, onSelect, onStart, onDestination }: { building: Building; selected: string | null; onSelect: (id: string | null) => void; onStart: (id: string) => void; onDestination: (id: string) => void }) {
  const { locale, nodeLabelRu } = useI18n();
  const [query, setQuery] = useState('');
  const t = (ru: string, kk: string) => locale === 'kk' ? kk : ru;
  const label = (node: BuildingNode) => nodeLabelRu(node.id, node.label, node.labelKk);
  const normalized = query.trim().toLocaleLowerCase(locale === 'kk' ? 'kk-KZ' : 'ru-RU');
  const matches = normalized ? building.nodes.filter(node => node.selectable && `${node.label} ${node.labelKk ?? ''} ${node.id}`.toLocaleLowerCase().includes(normalized)) : [];
  const chosen = building.nodes.find(node => node.id === selected && node.selectable);
  return <div className="room-search">
    <label htmlFor="room-search">{t('Найти помещение', 'Бөлмені іздеу')}</label>
    <input id="room-search" type="search" autoComplete="off" placeholder={t('Номер или название на RU / KK', 'Нөмірі не атауы: RU / KK')} value={query} onChange={event => setQuery(event.target.value)} aria-describedby="room-search-help" />
    <small id="room-search-help">{t('Поиск на двух языках. Можно также выбрать точку на 2D-схеме.', 'Екі тілде іздеуге немесе 2D-схемадан нүктені таңдауға болады.')}</small>
    {normalized && <><p className="sr-only" role="status">{t(`Найдено: ${matches.length}`, `Табылды: ${matches.length}`)}</p><ul className="room-results">{matches.length ? matches.map(node => <li key={node.id}><button type="button" aria-pressed={selected === node.id} onClick={() => onSelect(node.id)}>{label(node)}<small>{node.floor + 1} {t('этаж', 'қабат')}</small></button></li>) : <li>{t('Ничего не найдено. Попробуйте номер или другое название.', 'Ештеңе табылмады. Нөмірін не басқа атауын енгізіңіз.')}</li>}</ul></>}
    {chosen && <section className="room-selection" aria-label={t('Выбранное помещение', 'Таңдалған бөлме')} data-testid="room-card"><strong>{label(chosen)}</strong><p>{chosen.floor + 1} {t('этаж · учебная точка', 'қабат · оқу үлгісінің нүктесі')}</p><div className="guidance-actions"><button type="button" onClick={() => onStart(chosen.id)}>{t('Начать отсюда', 'Осы жерден бастау')}</button><button type="button" onClick={() => onDestination(chosen.id)}>{t('Проложить маршрут сюда', 'Осы жерге бағыт құру')}</button><button type="button" onClick={() => onSelect(null)}>{t('Закрыть карточку', 'Карточканы жабу')}</button></div></section>}
  </div>;
}

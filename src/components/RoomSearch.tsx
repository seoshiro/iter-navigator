import { useState } from 'react';
import type { Building, BuildingNode } from '../domain/model';
import { useI18n } from '../i18n/locale';
export function RoomSearch({ building, selected, onSelect, onStart, onDestination }: { building: Building; selected: string | null; onSelect: (id: string | null) => void; onStart: (id: string) => void; onDestination: (id: string) => void }) {
  const { locale, language, nodeLabelRu, nodeSearchText } = useI18n();
  const [query, setQuery] = useState('');
  const t = (ru: string, kk: string, en: string) => locale === 'en' ? en : locale === 'kk' ? kk : ru;
  const label = (node: BuildingNode) => nodeLabelRu(node.id, node.label, node.labelKk);
  const normalized = query.trim().toLocaleLowerCase(language);
  const matches = normalized ? building.nodes.filter(node => node.selectable && nodeSearchText(node.id, node.label, node.labelKk).toLocaleLowerCase(language).includes(normalized)) : [];
  const chosen = building.nodes.find(node => node.id === selected && node.selectable);
  return <div className="room-search">
    <label htmlFor="room-search">{t('Найти помещение', 'Бөлмені іздеу', "Find a room")}</label>
    <input id="room-search" type="search" autoComplete="off" placeholder={t('Номер или название на RU / KK / EN', 'Нөмірі не атауы: RU / KK / EN', "Room number or name in RU / KK / EN")} value={query} onChange={event => setQuery(event.target.value)} aria-describedby="room-search-help" />
    <small id="room-search-help">{t('Поиск на трёх языках. Можно также выбрать точку на 2D-схеме.', 'Үш тілде іздеуге немесе 2D-схемадан нүктені таңдауға болады.', "Search in Russian, Kazakh or English, or select a location on the 2D floor plan.")}</small>
    {normalized && <><p className="sr-only" role="status">{t(`Найдено: ${matches.length}`, `Табылды: ${matches.length}`, `Found: ${matches.length}`)}</p><ul className="room-results">{matches.length ? matches.map(node => <li key={node.id}><button type="button" aria-pressed={selected === node.id} onClick={() => onSelect(node.id)}>{label(node)}<small>{locale === 'en' ? `Floor ${node.floor + 1}` : <>{node.floor + 1} {t('этаж', 'қабат', 'floor')}</>}</small></button></li>) : <li>{t('Ничего не найдено. Попробуйте номер или другое название.', 'Ештеңе табылмады. Нөмірін не басқа атауын енгізіңіз.', "No rooms found. Try a room number or another name.")}</li>}</ul></>}
    {chosen && <section className="room-selection" aria-label={t('Выбранное помещение', 'Таңдалған бөлме', "Selected room")} data-testid="room-card"><strong>{label(chosen)}</strong><p>{locale === 'en' ? `Floor ${chosen.floor + 1} · demo location` : <>{chosen.floor + 1} {t('этаж · учебная точка', 'қабат · оқу үлгісінің нүктесі', 'floor · demo location')}</>}</p><div className="guidance-actions"><button type="button" onClick={() => onStart(chosen.id)}>{t('Начать отсюда', 'Осы жерден бастау', "Start here")}</button><button type="button" onClick={() => onDestination(chosen.id)}>{t('Проложить маршрут сюда', 'Осы жерге бағыт құру', "Route here")}</button><button type="button" onClick={() => onSelect(null)}>{t('Закрыть карточку', 'Карточканы жабу', "Close details")}</button></div></section>}
  </div>;
}

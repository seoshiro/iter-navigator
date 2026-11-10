import { useLayoutEffect, useRef } from 'react';
import type { Building, BuildingEdge, Evidence } from '../domain/model';
import type { UsableRoute } from '../domain/alternatives';
import { useI18n } from '../i18n/locale';
import type { SpeechStatus } from '../ui/speech';

function EvidenceSource({ attribute }: { attribute: Evidence<unknown> }) {
  const { locale } = useI18n();
  const sources: Record<string, string> = {
    'Авторская вымышленная модель «Просвет», версия 1; реального обследования не было': '«Просвет» авторлық ойдан шығарылған моделі, 1-нұсқа; нақты тексеру жүргізілген жоқ',
    'Вымышленный учебный пример ITER, версия 1; не результат обследования': 'Ойдан шығарылған ITER оқу мысалы, 1-нұсқа; тексеру нәтижесі емес',
    'Учебный пример: характеристика не задана; обследования не было': 'Оқу мысалы: сипат берілмеген; тексеру жүргізілген жоқ',
  };
  const englishSources: Record<string, string> = {
    'Авторская вымышленная модель «Просвет», версия 1; реального обследования не было': 'Authored fictional Prosvet model, version 1; no real survey was conducted',
    'Вымышленный учебный пример ITER, версия 1; не результат обследования': 'Fictional ITER educational example, version 1; not survey data',
    'Учебный пример: характеристика не задана; обследования не было': 'Educational example: this attribute is not defined; no survey was conducted',
  };
  if (locale === 'en') return <small className="attribute-source">Source: {englishSources[attribute.source] ?? attribute.source}. Survey date: {attribute.checkedOn ?? 'not available'}.</small>;
  return <small className="attribute-source">{locale === 'kk' ? 'Дереккөз' : 'Источник'}: {locale === 'kk' ? sources[attribute.source] ?? attribute.source : attribute.source}. {locale === 'kk' ? 'Тексеру күні' : 'Дата обследования'}: {attribute.checkedOn ?? (locale === 'kk' ? 'жоқ' : 'отсутствует')}.</small>;
}
function EdgeEvidence({ edge }: { edge: BuildingEdge }) {
  const { locale, numberRu } = useI18n();
  const t = (ru: string, kk: string, en: string) => locale === 'en' ? en : locale === 'kk' ? kk : ru;
  const evidenceText = <T,>(attribute: Evidence<T>, format: (value: T) => string) => attribute.status === 'unknown' ? t('неизвестно', 'белгісіз', "unknown") : `${format(attribute.value)} · ${t('задано в модели', 'модельде берілген', "defined in the model")}`;
  const inactive = ['lift', 'stairs'].includes(edge.type) ? t(' · не влияет на отбор', ' · таңдауға әсер етпейді', " · does not affect route filtering") : '';
  return <dl className="edge-evidence">
    <div data-attribute="widthM"><dt>{t('Ширина', 'Ені', "Width")}</dt><dd>{evidenceText(edge.widthM, value => `${numberRu(value * 100)} ${t('см', 'см', "cm")}`)}<EvidenceSource attribute={edge.widthM} /></dd></div>
    <div data-attribute="stepFree"><dt>{t('Без ступеней', 'Сатыларсыз', "Step-free")}</dt><dd>{evidenceText(edge.stepFree, value => value ? t('да', 'иә', "yes") : t('нет', 'жоқ', "no"))}<EvidenceSource attribute={edge.stepFree} /></dd></div>
    <div data-attribute="slopePercent"><dt>{t('Уклон', 'Еңіс', "Slope")}</dt><dd>{evidenceText(edge.slopePercent, value => `${numberRu(value)} %`)}{inactive}<EvidenceSource attribute={edge.slopePercent} /></dd></div>
    <div data-attribute="surface"><dt>{t('Покрытие', 'Жабын', "Surface")}</dt><dd>{evidenceText(edge.surface, value => value === 'smooth' ? t('ровное', 'тегіс', "smooth") : t('неровное', 'тегіс емес', "uneven"))}{inactive}<EvidenceSource attribute={edge.surface} /></dd></div>
  </dl>;
}
export function RouteVariants({ building, routes, selected, onSelect, expanded, onExpandedChange }: { building: Building; routes: UsableRoute[]; selected: number; onSelect: (index: number) => void; expanded: boolean; onExpandedChange: (expanded: boolean) => void }) {
  const { locale, guidanceRu, numberRu, nodeLabelRu, ru } = useI18n();
  const t = (ru: string, kk: string, en: string) => locale === 'en' ? en : locale === 'kk' ? kk : ru;
  if (!routes.length) return null;
  if (routes.length === 1) {
    const floors=routes[0]!.nodeIds.map(id=>building.nodes.find(node=>node.id===id)!.floor);
    const transitions=floors.reduce((sum,floor,index)=>sum+Number(index>0&&floor!==floors[index-1]),0);
    return <><p className="no-alternatives" data-testid="no-alternatives">{routes[0]!.edgeIds.length ? guidanceRu.noAdditional : guidanceRu.noAdditionalZero}</p>{transitions>Math.abs(floors.at(-1)!-floors[0]!)&&<p className="detour-note">{t('Этот путь проходит через дополнительный этаж, чтобы связать допустимые проходы. Ограничения не ослаблены.', 'Бұл жол қолжетімді өткелдерді байланыстыру үшін қосымша қабат арқылы өтеді. Шектеулер жеңілдетілген жоқ.', "This route goes through an extra floor to connect eligible passages. Your requirements have not been relaxed.")}</p>}</>;
  }
  const nodes = new Map(building.nodes.map(node => [node.id, node]));
  const edges = new Map(building.edges.map(edge => [edge.id, edge]));
  return <details className="variant-disclosure" open={expanded}><summary aria-label={guidanceRu.compare} onClick={event => { event.preventDefault(); onExpandedChange(!expanded); }}>{guidanceRu.compareCompact}</summary><fieldset className="route-variants"><legend>{guidanceRu.compare}</legend><p className="field-help">{guidanceRu.comparisonHint}</p>
    {routes.map((route, index) => {
      const floors = route.nodeIds.map(id => nodes.get(id)!.floor);
      const transitions = floors.reduce((total, floor, i) => total + Number(i > 0 && floor !== floors[i - 1]), 0);
      const lifts = [...new Set(route.edgeIds.flatMap(id => {
        const edge = edges.get(id)!;
        if (edge.type !== 'lift') return [];
        const node = nodes.get(edge.from)!;
        return [nodeLabelRu(node.id, node.label, node.labelKk).split(' · ')[0]!];
      }))];
      return <button key={route.edgeIds.join(',')} type="button" className="variant-card" aria-pressed={index === selected} onClick={() => onSelect(index)} data-variant-index={index} data-route-ids={route.edgeIds.join(',')}>
        <span className="variant-title"><strong>{index === 0 ? guidanceRu.primary : guidanceRu.variant(index)}</strong>{index === selected && <span>{t('Выбран', 'Таңдалған', "Selected")}</span>}</span>
        <dl className="variant-metrics">
          <div><dt>{t('Расстояние', 'Қашықтық', "Distance")}</dt><dd>{numberRu(route.distanceM)} {t('м', 'м', "m")}</dd></div>
          <div><dt>{t('Лифт', 'Лифт', "Elevator")}</dt><dd>{lifts.join(', ') || t('Не нужен', 'Қажет емес', "Not needed")}</dd></div>
          <div><dt>{t('Переходы между этажами', 'Қабаттар арасындағы ауысу', "Floor transitions")}</dt><dd>{transitions}</dd></div>
          <div><dt>{t('Неподтверждённые участки', 'Расталмаған бөліктер', "Unverified segments")}</dt><dd>{route.uncertainEdgeIds.length}</dd></div>
        </dl>
        {transitions > Math.abs(floors.at(-1)! - floors[0]!) && <p className="detour-note">{t('Этот вариант проходит через дополнительный этаж, чтобы связать выбранные доступные проходы. Ограничения не ослаблены.', 'Бұл нұсқа таңдалған қолжетімді өткелдерді байланыстыру үшін қосымша қабат арқылы өтеді. Шектеулер жеңілдетілген жоқ.', "This alternative goes through an extra floor to connect the selected eligible passages. Your requirements have not been relaxed.")}</p>}
        <small>{ru.route.floors(floors.filter((floor, i) => i === 0 || floor !== floors[i - 1]))}. {route.uncertainEdgeIds.length ? guidanceRu.incomplete(route.uncertainEdgeIds.length) : guidanceRu.complete}</small>
      </button>;
    })}
  </fieldset></details>;
}
interface Props { building: Building; result: UsableRoute; selected: number | null; onSelect: (index: number | null, focus?: boolean) => void; onReadStep: () => void; onStop: () => void; speechStatus: SpeechStatus; expandedStepIds: string[]; onToggleEvidence: (id: string) => void; compact?: boolean }
export function RouteGuidance({ building, result, selected, onSelect, onReadStep, onStop, speechStatus, expandedStepIds, onToggleEvidence, compact = false }: Props) {
  const { locale, ru, guidanceRu, speechRu, stepTextRu, numberRu, nodeLabelRu, edgeNames } = useI18n();
  const t = (ru: string, kk: string, en: string) => locale === 'en' ? en : locale === 'kk' ? kk : ru;
  const listRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('.selected-step');
    if (!list) return;
    if (!row) { list.scrollTop = 0; return; }
    const viewport = list.getBoundingClientRect(); const bounds = row.getBoundingClientRect();
    const top = viewport.top + list.clientTop + 8; const bottom = viewport.top + list.clientTop + list.clientHeight - 8;
    if (bounds.top < top || bounds.height > bottom - top) list.scrollTop += bounds.top - top;
    else if (bounds.bottom > bottom) list.scrollTop += bounds.bottom - bottom;
  }, [selected, result, compact]);
  const nodes = new Map(building.nodes.map(node => [node.id, node]));
  const edges = new Map(building.edges.map(edge => [edge.id, edge]));
  const label = (id: string) => { const node = nodes.get(id)!; return nodeLabelRu(id, node.label, node.labelKk); };
  // The parent owns the only route and step state. Compact mode changes presentation only.
  const current = selected !== null && selected >= 0 && selected < result.edgeIds.length ? selected : null;
  const stepName = (index: number) => t(`Шаг ${index + 1}`, `${index + 1}-қадам`, `Step ${index + 1}`);
  const floorName = (floor: number) => t(`${floor + 1} этаж`, `${floor + 1}-қабат`, `Floor ${floor + 1}`);
  const steps = <ol ref={listRef} className="route-steps" aria-label={t('Шаги выбранного маршрута', 'Таңдалған маршруттың қадамдары', "Steps of the selected route")} tabIndex={0} data-testid="route-steps"><li className="start-step"><span className="step-marker" aria-hidden="true">●</span><div><strong>{label(result.nodeIds[0]!)}</strong><small>{t('Начальная точка', 'Бастапқы нүкте', "Starting point")} · {floorName(nodes.get(result.nodeIds[0]!)!.floor)}</small></div></li>{result.edgeIds.map((id, index) => {
    const edge = edges.get(id)!; const from = nodes.get(result.nodeIds[index]!)!; const to = nodes.get(result.nodeIds[index + 1]!)!;
    return <li key={id} data-edge-id={id} aria-current={current === index ? 'step' : undefined} className={[result.uncertainEdgeIds.includes(id) ? 'uncertain-step' : '', current === index ? 'selected-step' : ''].join(' ')}><span className="step-marker">{index + 1}</span><div><strong>{label(to.id)}</strong><button type="button" aria-label={`${ru.camera.focus}: ${stepName(index)}, ${label(to.id)}`} aria-pressed={current === index} onClick={() => onSelect(index, true)}>{ru.camera.focus}</button><small>{edgeNames[edge.type]} · {numberRu(edge.lengthM)} {t('м', 'м', 'm')} · {from.floor !== to.floor ? `${floorName(from.floor)} → ${floorName(to.floor)}` : floorName(to.floor)}{result.uncertainEdgeIds.includes(id) ? ` · ${t('Не подтверждено', 'Расталмаған', "Unverified")}` : ''}</small><details open={expandedStepIds.includes(id)}><summary onClick={event => { event.preventDefault(); onToggleEvidence(id); }}>{t('Характеристики участка', 'Бөліктің сипаттары', "Segment details")}</summary><EdgeEvidence edge={edge} /></details></div></li>;
  })}</ol>;
  const stepOptions = <>
    <label>{guidanceRu.stepReview}<select aria-label={guidanceRu.stepReview} value={current === null ? 'all' : current} onChange={event => onSelect(event.target.value === 'all' ? null : Number(event.target.value))}><option value="all">{guidanceRu.all}</option>{result.edgeIds.map((id, index) => <option key={id} value={index}>{stepName(index)}: {edgeNames[edges.get(id)!.type]} → {label(result.nodeIds[index + 1]!)}</option>)}</select></label>
    <div className="guidance-actions guidance-speech-actions"><button type="button" disabled={current === null} aria-describedby={speechStatus === 'ready' ? undefined : 'step-speech-feedback'} onClick={onReadStep}>{guidanceRu.readStep}</button><button type="button" aria-describedby={speechStatus === 'ready' ? undefined : 'step-speech-feedback'} onClick={onStop}>{guidanceRu.stop}</button></div>
    {speechStatus !== 'ready' && <p id="step-speech-feedback" className="speech-feedback">{speechRu[speechStatus]}</p>}
  </>;
  return <>
    {result.edgeIds.length > 0 && <div className={`step-review${compact ? ' step-review--compact' : ''}`} data-testid="step-review" data-step-index={current ?? ''}>
      <div className="current-instruction">
        <div className="step-progress-label"><strong>{current === null ? guidanceRu.all : t(`Шаг ${current + 1} из ${result.edgeIds.length}`, `${result.edgeIds.length} қадамның ${current + 1}-қадамы`, `Step ${current + 1} of ${result.edgeIds.length}`)}</strong><span>{t('Вручную', 'Қолмен', "Manual")}</span></div>
        <progress aria-label={t('Выбранный шаг маршрута', 'Маршруттың таңдалған қадамы', "Selected route step")} max={result.edgeIds.length} value={current === null ? 0 : current + 1} />
        <p className="current-step-text" role="status" aria-live="polite" aria-atomic="true">{current === null ? guidanceRu.allSelected : stepTextRu(building, result, current)}</p>
        {!compact && <small>{t('Переключайте шаги вручную. Ваше положение не определяется.', 'Қадамдарды қолмен ауыстырыңыз. Сіздің орналасқан жеріңіз анықталмайды.', "Advance through the steps manually. Your location is not tracked.")}</small>}
      </div>
      <div className="guidance-actions guidance-primary-actions"><button type="button" disabled={current === 0} aria-disabled={current === 0} onClick={() => onSelect(current === null ? 0 : Math.max(0, current - 1))}>{guidanceRu.previous}</button><button type="button" disabled={current === result.edgeIds.length - 1} aria-disabled={current === result.edgeIds.length - 1} onClick={() => onSelect(current === null ? 0 : Math.min(result.edgeIds.length - 1, current + 1))}>{current === null ? t('Начать просмотр', 'Қарауды бастау', "Start reviewing") : guidanceRu.next}</button><button type="button" onClick={() => onSelect(null)}>{guidanceRu.all}</button></div>
      {compact ? <details className="compact-guidance-options"><summary>{t('Выбор шага и озвучивание', 'Қадамды таңдау және дауыстап оқу', "Select a step and read aloud")}</summary>{stepOptions}</details> : stepOptions}
    </div>}
    {compact ? <details className="compact-step-list"><summary>{t('Все шаги и характеристики', 'Барлық қадамдар мен сипаттар', "All steps and segment details")}</summary>{steps}</details> : steps}
  </>;
}
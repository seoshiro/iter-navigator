import { useLayoutEffect, useRef } from 'react';
import type { Building, BuildingEdge, Evidence } from '../domain/model';
import type { UsableRoute } from '../domain/alternatives';
import { edgeNames, nodeLabelRu, numberRu, ru } from '../i18n/ru';
import { guidanceRu, speechRu, stepTextRu } from '../i18n/guidance-ru';
import type { SpeechStatus } from '../ui/speech';

function evidenceText<T>(attribute: Evidence<T>, format: (v: T) => string) {
  return attribute.status === 'unknown' ? 'неизвестно' : `${format(attribute.value)} · задано в модели`;
}
function EvidenceSource({ attribute }: { attribute: Evidence<unknown> }) {
  return <small className="attribute-source">Источник: {attribute.source}. Дата обследования: {attribute.checkedOn ?? 'отсутствует'}.</small>;
}
function EdgeEvidence({ edge }: { edge: BuildingEdge }) {
  return <dl className="edge-evidence">
    <div data-attribute="widthM"><dt>Ширина</dt><dd>{evidenceText(edge.widthM, v => `${numberRu(v * 100)} см`)}<EvidenceSource attribute={edge.widthM} /></dd></div>
    <div data-attribute="stepFree"><dt>Без ступеней</dt><dd>{evidenceText(edge.stepFree, v => v ? 'да' : 'нет')}<EvidenceSource attribute={edge.stepFree} /></dd></div>
    <div data-attribute="slopePercent"><dt>Уклон</dt><dd>{evidenceText(edge.slopePercent, v => `${numberRu(v)} %`)}{['lift', 'stairs'].includes(edge.type) && ' · не влияет на отбор'}<EvidenceSource attribute={edge.slopePercent} /></dd></div>
    <div data-attribute="surface"><dt>Покрытие</dt><dd>{evidenceText(edge.surface, v => v === 'smooth' ? 'ровное' : 'неровное')}{['lift', 'stairs'].includes(edge.type) && ' · не влияет на отбор'}<EvidenceSource attribute={edge.surface} /></dd></div>
  </dl>;
}
export function RouteVariants({ building, routes, selected, onSelect, expanded, onExpandedChange }: { building: Building; routes: UsableRoute[]; selected: number; onSelect: (index: number) => void; expanded: boolean; onExpandedChange: (expanded: boolean) => void }) {
  if (routes.length === 1) return <p className="no-alternatives" data-testid="no-alternatives">{routes[0]!.edgeIds.length ? guidanceRu.noAdditional : guidanceRu.noAdditionalZero}</p>;
  return <details className="variant-disclosure" open={expanded}><summary aria-label={guidanceRu.compare} onClick={event => { event.preventDefault(); onExpandedChange(!expanded); }}>{guidanceRu.compareCompact}</summary><fieldset className="route-variants"><legend>{guidanceRu.compare}</legend><p className="field-help">{guidanceRu.comparisonHint}</p>
    {routes.map((route, index) => <button key={route.edgeIds.join(',')} type="button" aria-pressed={index === selected} onClick={() => onSelect(index)} data-variant-index={index} data-route-ids={route.edgeIds.join(',')}>
      {index === 0 ? guidanceRu.primary : guidanceRu.variant(index)} · {numberRu(route.distanceM)} м{route.uncertainEdgeIds.length ? ' · неподтверждённый' : ''}
      <small>{[...new Set(route.edgeIds.flatMap(id => { const edge = building.edges.find(item => item.id === id)!; return edge.type === 'stairs' ? ['Лестница'] : edge.type === 'lift' ? [building.nodes.find(node => node.id === edge.from)!.label.split(' · ')[0]!] : []; }))].join(', ') || guidanceRu.noTransition} · {ru.route.floors(route.nodeIds.map(id => building.nodes.find(node => node.id === id)!.floor).filter((floor, i, floors) => i === 0 || floor !== floors[i - 1]))}. {route.uncertainEdgeIds.length ? guidanceRu.incomplete(route.uncertainEdgeIds.length) : guidanceRu.complete}</small>
    </button>)}
  </fieldset></details>;
}
interface Props { building: Building; result: UsableRoute; selected: number | null; onSelect: (index: number | null, focus?: boolean) => void; onReadStep: () => void; onStop: () => void; speechStatus: SpeechStatus; expandedStepIds: string[]; onToggleEvidence: (id: string) => void }
export function RouteGuidance({ building, result, selected, onSelect, onReadStep, onStop, speechStatus, expandedStepIds, onToggleEvidence }: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('.selected-step');
    if (!list) return;
    if (!row) { list.scrollTop = 0; return; }
    const viewport = list.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    const top = viewport.top + list.clientTop + 8;
    const bottom = viewport.top + list.clientTop + list.clientHeight - 8;
    if (bounds.top < top || bounds.height > bottom - top) list.scrollTop += bounds.top - top;
    else if (bounds.bottom > bottom) list.scrollTop += bounds.bottom - bottom;
  }, [selected, result]);
  const nodes = new Map(building.nodes.map(node => [node.id, node]));
  const edges = new Map(building.edges.map(edge => [edge.id, edge]));
  const label = (id: string) => nodeLabelRu(id, nodes.get(id)!.label);
  return <>
    {result.edgeIds.length > 0 && <div className="step-review" data-testid="step-review" data-step-index={selected ?? ''}>
      <label>{guidanceRu.stepReview}<select aria-label={guidanceRu.stepReview} value={selected === null ? 'all' : selected} onChange={event => onSelect(event.target.value === 'all' ? null : Number(event.target.value))}><option value="all">{guidanceRu.all}</option>{result.edgeIds.map((id, index) => <option key={id} value={index}>Шаг {index + 1}: {edgeNames[edges.get(id)!.type]} — {label(result.nodeIds[index + 1]!)}</option>)}</select></label>
      <div className="guidance-actions"><button type="button" aria-disabled={selected === 0} onClick={() => { if (selected !== 0) onSelect(selected === null ? 0 : selected - 1); }}>{guidanceRu.previous}</button><button type="button" aria-disabled={selected === result.edgeIds.length - 1} onClick={() => { if (selected !== result.edgeIds.length - 1) onSelect(selected === null ? 0 : selected + 1); }}>{guidanceRu.next}</button><button type="button" onClick={() => onSelect(null)}>{guidanceRu.all}</button><button type="button" disabled={selected === null} aria-describedby={speechStatus === 'ready' ? undefined : 'step-speech-feedback'} onClick={onReadStep}>{guidanceRu.readStep}</button><button type="button" aria-describedby={speechStatus === 'ready' ? undefined : 'step-speech-feedback'} onClick={onStop}>{guidanceRu.stop}</button></div>
      {speechStatus !== 'ready' && <p id="step-speech-feedback" className="speech-feedback">{speechRu[speechStatus]}</p>}
      <p role="status" aria-live="polite" aria-atomic="true">{selected === null ? guidanceRu.allSelected : stepTextRu(building, result, selected)}</p>
    </div>}
    <ol ref={listRef} className="route-steps" aria-label="Шаги выбранного маршрута" tabIndex={0} data-testid="route-steps"><li className="start-step"><span className="step-marker">●</span><div><strong>{label(result.nodeIds[0]!)}</strong><small>Начальная точка · {nodes.get(result.nodeIds[0]!)!.floor + 1} этаж</small></div></li>{result.edgeIds.map((id, index) => {
      const edge = edges.get(id)!; const from = nodes.get(result.nodeIds[index]!)!; const to = nodes.get(result.nodeIds[index + 1]!)!;
      return <li key={id} data-edge-id={id} className={[result.uncertainEdgeIds.includes(id) ? 'uncertain-step' : '', selected === index ? 'selected-step' : ''].join(' ')}><span className="step-marker">{index + 1}</span><div><strong>{label(to.id)}</strong><button type="button" aria-label={`${ru.camera.focus}: шаг ${index + 1}, ${label(to.id)}`} aria-pressed={selected === index} onClick={() => onSelect(index, true)}>{ru.camera.focus}</button><small>{edgeNames[edge.type]} · {numberRu(edge.lengthM)} м · {from.floor !== to.floor ? `${from.floor + 1} → ${to.floor + 1} этаж` : `${to.floor + 1} этаж`}{result.uncertainEdgeIds.includes(id) ? ' · ? не подтверждено' : ''}</small><details open={expandedStepIds.includes(id)}><summary onClick={event => { event.preventDefault(); onToggleEvidence(id); }}>Характеристики участка</summary><EdgeEvidence edge={edge} /></details></div></li>;
    })}</ol>
  </>;
}

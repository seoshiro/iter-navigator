import { useEffect, useRef, useState } from 'react';
import type { Building, BuildingEdge, Evidence } from '../domain/model';
import type { UsableRoute } from '../domain/alternatives';
import { edgeNames, nodeLabelRu, numberRu, ru } from '../i18n/ru';
import { guidanceRu, stepTextRu } from '../i18n/guidance-ru';

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
export function RouteVariants({ building, routes, selected, onSelect, desktop }: { building: Building; routes: UsableRoute[]; selected: number; onSelect: (index: number) => void; desktop: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!desktop && disclosure.current?.contains(document.activeElement) && !disclosure.current.querySelector('summary')?.contains(document.activeElement)) setExpanded(true);
  }, [desktop]);
  if (routes.length === 1) return <p className="no-alternatives" data-testid="no-alternatives">{routes[0]!.edgeIds.length ? guidanceRu.noAdditional : guidanceRu.noAdditionalZero}</p>;
  return <details ref={disclosure} className="variant-disclosure" open={desktop || expanded}><summary aria-label={guidanceRu.compare} tabIndex={desktop ? -1 : 0} onClick={event => { event.preventDefault(); if (!desktop) setExpanded(open => !open); }}>{desktop ? guidanceRu.compare : guidanceRu.compareCompact}</summary><fieldset className="route-variants"><legend>{guidanceRu.compare}</legend><p className="field-help">{guidanceRu.comparisonHint}</p>
    {routes.map((route, index) => <button key={route.edgeIds.join(',')} type="button" aria-pressed={index === selected} onClick={() => onSelect(index)} data-variant-index={index} data-route-ids={route.edgeIds.join(',')}>
      {index === 0 ? guidanceRu.primary : guidanceRu.variant(index)} · {numberRu(route.distanceM)} м{route.uncertainEdgeIds.length ? ' · неподтверждённый' : ''}
      <small>{[...new Set(route.edgeIds.flatMap(id => { const edge = building.edges.find(item => item.id === id)!; return edge.type === 'stairs' ? ['Лестница'] : edge.type === 'lift' ? [building.nodes.find(node => node.id === edge.from)!.label.split(' · ')[0]!] : []; }))].join(', ') || guidanceRu.noTransition} · {ru.route.floors(route.nodeIds.map(id => building.nodes.find(node => node.id === id)!.floor).filter((floor, i, floors) => i === 0 || floor !== floors[i - 1]))}. {route.uncertainEdgeIds.length ? guidanceRu.incomplete(route.uncertainEdgeIds.length) : guidanceRu.complete}</small>
    </button>)}
  </fieldset></details>;
}
interface Props { building: Building; result: UsableRoute; selected: number | null; onSelect: (index: number | null, focus?: boolean) => void; onReadStep: () => void; onStop: () => void }
export function RouteGuidance({ building, result, selected, onSelect, onReadStep, onStop }: Props) {
  const nodes = new Map(building.nodes.map(node => [node.id, node]));
  const edges = new Map(building.edges.map(edge => [edge.id, edge]));
  const label = (id: string) => nodeLabelRu(id, nodes.get(id)!.label);
  return <>
    {result.edgeIds.length > 0 && <div className="step-review" data-testid="step-review" data-step-index={selected ?? ''}>
      <label>{guidanceRu.stepReview}<select aria-label={guidanceRu.stepReview} value={selected === null ? 'all' : selected} onChange={event => onSelect(event.target.value === 'all' ? null : Number(event.target.value))}><option value="all">{guidanceRu.all}</option>{result.edgeIds.map((id, index) => <option key={id} value={index}>Шаг {index + 1}: {edgeNames[edges.get(id)!.type]} — {label(result.nodeIds[index + 1]!)}</option>)}</select></label>
      <div className="guidance-actions"><button type="button" disabled={selected === 0} onClick={() => onSelect(selected === null ? 0 : selected - 1)}>{guidanceRu.previous}</button><button type="button" disabled={selected === result.edgeIds.length - 1} onClick={() => onSelect(selected === null ? 0 : selected + 1)}>{guidanceRu.next}</button><button type="button" onClick={() => onSelect(null)}>{guidanceRu.all}</button><button type="button" disabled={selected === null} onClick={onReadStep}>{guidanceRu.readStep}</button><button type="button" onClick={onStop}>{guidanceRu.stop}</button></div>
      <p role="status" aria-live="polite" aria-atomic="true">{selected === null ? guidanceRu.allSelected : stepTextRu(building, result, selected)}</p>
    </div>}
    <ol className="route-steps" data-testid="route-steps"><li className="start-step"><span className="step-marker">●</span><div><strong>{label(result.nodeIds[0]!)}</strong><small>Начальная точка · {nodes.get(result.nodeIds[0]!)!.floor + 1} этаж</small></div></li>{result.edgeIds.map((id, index) => {
      const edge = edges.get(id)!; const from = nodes.get(result.nodeIds[index]!)!; const to = nodes.get(result.nodeIds[index + 1]!)!;
      return <li key={id} data-edge-id={id} className={[result.uncertainEdgeIds.includes(id) ? 'uncertain-step' : '', selected === index ? 'selected-step' : ''].join(' ')}><span className="step-marker">{index + 1}</span><div><strong>{label(to.id)}</strong><p className="step-action">{stepTextRu(building, result, index)}</p><button type="button" aria-label={`${ru.camera.focus}: шаг ${index + 1}, ${label(to.id)}`} aria-pressed={selected === index} onClick={() => onSelect(index, true)}>{ru.camera.focus}</button><small>{edgeNames[edge.type]} · {numberRu(edge.lengthM)} м{from.floor !== to.floor ? ` · ${from.floor + 1} → ${to.floor + 1} этаж` : ''}{result.uncertainEdgeIds.includes(id) ? ' · ? не подтверждено' : ''}</small><details><summary>Характеристики участка</summary><EdgeEvidence edge={edge} /></details></div></li>;
    })}</ol>
  </>;
}

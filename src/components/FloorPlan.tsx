import { useId, useLayoutEffect, useRef } from 'react';
import type { Building, RouteResult } from '../domain/model';
import { useI18n } from '../i18n/locale';
import { createFloorArchitecture } from '../ui/architecture';

interface Props { building: Building; result: RouteResult; floor: 'all' | number; closedEdgeIds: string[]; highlight?: { nodeId: string; edgeId?: string } | null; selectedNodeId?: string | null; zoom?: number; resetToken?: number; onSelectNode?: (id: string) => void }
export function FloorPlan({ building, result, floor, closedEdgeIds, highlight, selectedNodeId, zoom = 1, resetToken = 0, onSelectNode }: Props) {
  const { locale, nodeLabelRu } = useI18n();
  const t = (ru: string, kk: string, en: string) => locale === 'en' ? en : locale === 'kk' ? kk : ru;
  const floorLabel = (id: number) => locale === 'en' ? `Floor ${id + 1}` : locale === 'kk' ? building.floors.find(f => f.id === id)?.labelKk ?? `${id + 1} қабат` : building.floors.find(f => f.id === id)!.label;
  const roomShort: Record<string, [string, string, string]> = { 'room-library': ['Библиотека', 'Кітапхана', 'Library'], 'room-dean': ['Деканат', 'Деканат', 'Dean'], 'room-canteen': ['Столовая', 'Асхана', 'Cafeteria'], 'room-medical': ['Мед.', 'Мед.', 'First aid'], 'room-toilets': ['WC', 'WC', 'WC'], 'room-wardrobe': ['Гардер.', 'Гардер.', 'Cloakroom'] };
  const prefix = useId();
  const collectionRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const collection = collectionRef.current;
    if (!collection) return;
    for (const element of [collection, ...collection.querySelectorAll<HTMLElement>('.floor-viewport')]) { element.scrollTop = 0; element.scrollLeft = 0; }
  }, [resetToken]);
  const floors = building.floors.filter(f => floor === 'all' || f.id === floor);
  const nodeMap = new Map(building.nodes.map(n => [n.id, n]));
  const routed = new Set(result.status === 'ok' ? result.edgeIds : []);
  const uncertain = new Set(result.status === 'ok' ? result.uncertainEdgeIds : []);
  const closed = new Set(closedEdgeIds);
  const highlightedEdge = building.edges.find(edge => edge.id === highlight?.edgeId);
  const transitionNodes = highlightedEdge && nodeMap.get(highlightedEdge.from)!.floor !== nodeMap.get(highlightedEdge.to)!.floor ? [highlightedEdge.from, highlightedEdge.to] : [];
  const routeFloors = new Set(result.status === 'ok' ? result.nodeIds.map(id => nodeMap.get(id)!.floor) : []);
  const x = (v: number) => 24 + v * 9;
  const y = (v: number) => 35 + v * 9;
  return <div ref={collectionRef} className="floor-plans" role="region" aria-label={t('Схема этажей учебного корпуса', 'Оқу корпусының қабат сызбалары', "Floor plans of the demo building")} tabIndex={0} data-testid="floor-plan" data-highlight-node={highlight?.nodeId ?? ''} data-highlight-edge={highlight?.edgeId ?? ''} data-route-ids={result.status === 'ok' ? result.edgeIds.join(',') : ''}>
    {floors.map(f => {
      const architecture = createFloorArchitecture(building, f.id);
      return <figure className="floor-card" key={f.id} data-floor-id={f.id}>
        <figcaption><span>{floorLabel(f.id)}{routeFloors.has(f.id) ? t(' · на маршруте', ' · маршрутта', " · on this route") : ''}</span><span className="tiny muted">{t('Условный план', 'Шартты жоспар', "Illustrative floor plan")}</span></figcaption>
        <div className="floor-viewport" role="region" aria-label={`${floorLabel(f.id)}: ${t('прокручиваемая схема', 'айналдыруға болатын сызба', "scrollable floor plan")}`} tabIndex={0}><svg viewBox="0 0 336 262" style={{ width: `calc(min(100%, var(--floor-height) * 336 / 262) * ${zoom})` }} role="group" tabIndex={-1} aria-labelledby={`${prefix}-${f.id}`}>
          <title id={`${prefix}-${f.id}`}>{`${floorLabel(f.id)}: ${t('условный архитектурный план и текущий маршрут', 'шартты сәулет жоспары және ағымдағы маршрут', "illustrative floor plan and current route")}`}</title>
          <rect x="26" y="40" width="288" height="204" rx="3" className="plan-shell" />
          <g aria-hidden="true" data-testid="plan-architecture">
            {architecture.rooms.map(room => <rect key={room.id} data-room-id={room.id} x={x(room.x - room.width / 2)} y={y(room.z - room.depth / 2)} width={room.width * 9} height={room.depth * 9} className={`plan-room${selectedNodeId === room.id ? ' selected' : ''}`} stroke="none" />)}
            {architecture.walls.map((wall, index) => <line key={index} x1={x(wall.x1)} y1={y(wall.z1)} x2={x(wall.x2)} y2={y(wall.z2)} className="plan-wall" />)}
            {architecture.doors.map((door, index) => <path key={index} className="plan-door" d={door.axis === 'x' ? `M ${x(door.x - door.width / 2)} ${y(door.z)} l 0 -9 q 9 0 9 9` : `M ${x(door.x)} ${y(door.z - door.width / 2)} l 9 0 q 0 9 -9 9`} />)}
            <text x={x(16)} y={y(14.4)} textAnchor="middle" className="plan-corridor-label">{t('КОРИДОР', 'ДӘЛІЗ', "CORRIDOR")}</text>
          </g>
          {building.edges.toSorted((a, b) => Number(nodeMap.get(a.from)!.floor !== nodeMap.get(a.to)!.floor) - Number(nodeMap.get(b.from)!.floor !== nodeMap.get(b.to)!.floor)).map(edge => {
            const from = nodeMap.get(edge.from)!; const to = nodeMap.get(edge.to)!;
            if (from.floor !== f.id && to.floor !== f.id) return null;
            const active = routed.has(edge.id); const isClosed = closed.has(edge.id);
            const orderedIndex = result.status === 'ok' ? result.edgeIds.indexOf(edge.id) : -1;
            const directionFrom = result.status === 'ok' && orderedIndex >= 0 ? nodeMap.get(result.nodeIds[orderedIndex]!) : undefined;
            const directionTo = result.status === 'ok' && orderedIndex >= 0 ? nodeMap.get(result.nodeIds[orderedIndex + 1]!) : undefined;
            const edgeName = `${nodeLabelRu(from.id, from.label, from.labelKk)} → ${nodeLabelRu(to.id, to.label, to.labelKk)}`;
            if (from.floor !== to.floor) {
              const node = from.floor === f.id ? from : to; const other = from.floor === f.id ? to : from;
              const transitions = building.edges.filter(e => (e.from === node.id || e.to === node.id) && nodeMap.get(e.from)!.floor !== nodeMap.get(e.to)!.floor).length;
              const markerX = x(node.x) + (transitions > 1 ? (other.floor < node.floor ? -12 : 12) : 0);
              const relation = directionFrom && directionTo ? `${directionFrom.floor + 1} → ${directionTo.floor + 1}` : `${node.floor + 1} ↔ ${other.floor + 1}`;
              return <g key={edge.id} data-edge-id={edge.id} data-route={active ? 'true' : 'false'} className={`${isClosed ? 'transition closed' : active ? 'transition active' : 'transition'}${uncertain.has(edge.id) ? ' uncertain' : ''}${highlight?.edgeId === edge.id ? ' selected' : ''}`} aria-label={edgeName}>
                <title>{edgeName}{isClosed ? t(' · закрыто', ' · жабық', " · closed") : uncertain.has(edge.id) ? t(' · данные не проверены', ' · деректер тексерілмеген', " · unverified data") : ''}</title>
                <rect data-direction-from={directionFrom?.id} data-direction-to={directionTo?.id} x={markerX - 10} y={y(node.z) - 12} width="20" height="24" rx="3" />
                <text x={markerX} y={y(node.z) + 4} textAnchor="middle" style={!active && !isClosed ? { fontSize: 11 } : undefined}>{isClosed ? '×' : uncertain.has(edge.id) ? '?' : directionFrom && directionTo ? directionTo.floor > directionFrom.floor ? '↑' : '↓' : `${other.floor > node.floor ? '↑' : '↓'}${other.floor + 1}`}</text>
                {active && <text x={x(node.x)} y={y(node.z) + 26} textAnchor="middle" className={`transition-label${active ? '' : ' non-route'}`}>
                  {edge.type === 'lift' ? `${t('Лифт', 'Лифт', "Elevator")} ${edge.id.includes('-a-') ? 'A' : 'B'}` : t('Лестница', 'Баспалдақ', "Stairs")} {relation}{isClosed ? ' ×' : ''}
                </text>}
              </g>;
            }
            return <g key={edge.id} data-edge-id={edge.id} data-route={active ? 'true' : 'false'} data-direction-from={directionFrom?.id} data-direction-to={directionTo?.id} aria-label={highlight?.edgeId === edge.id ? edgeName : undefined}>
              <title>{edgeName}</title>
              {highlight?.edgeId === edge.id && <line x1={x(from.x)} y1={y(from.z)} x2={x(to.x)} y2={y(to.z)} className={`plan-highlight-edge ${uncertain.has(edge.id) ? 'uncertain' : ''}`} />}
              <line x1={x(from.x)} y1={y(from.z)} x2={x(to.x)} y2={y(to.z)} className={`plan-edge ${active ? 'routed' : ''} ${uncertain.has(edge.id) ? 'uncertain' : ''} ${isClosed ? 'closed' : ''}`} />
              {directionFrom && directionTo && <path className={`plan-direction ${uncertain.has(edge.id) ? 'uncertain' : ''}`} d="M -4 -4 L 4 0 L -4 4 Z" transform={`translate(${x(directionFrom.x + (directionTo.x - directionFrom.x) * .65)} ${y(directionFrom.z + (directionTo.z - directionFrom.z) * .65)}) rotate(${Math.atan2(directionTo.z - directionFrom.z, directionTo.x - directionFrom.x) * 180 / Math.PI})`} />}
              {isClosed && <text className="closed-mark" x={(x(from.x) + x(to.x)) / 2} y={(y(from.z) + y(to.z)) / 2}>×</text>}
              {uncertain.has(edge.id) && <text className="uncertain-mark" x={(x(from.x) + x(to.x)) / 2 + 7} y={(y(from.z) + y(to.z)) / 2}>?</text>}
            </g>;
          })}
          {building.nodes.filter(n => n.floor === f.id).map(n => {
            const start = result.status === 'ok' && result.nodeIds[0] === n.id;
            const destination = result.status === 'ok' && result.nodeIds.at(-1) === n.id;
            const service = n.kind === 'lift' || n.kind === 'stairs';
            const selectable = n.selectable && !!onSelectNode;
            return <g key={n.id} data-node-id={n.id} className={selectable ? 'selectable-node' : undefined} role={selectable ? 'button' : undefined} tabIndex={selectable ? 0 : undefined} aria-label={nodeLabelRu(n.id, n.label, n.labelKk)} aria-pressed={selectable ? selectedNodeId === n.id : undefined} onClick={() => { if (n.selectable) onSelectNode?.(n.id); }} onKeyDown={event => { if (selectable && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelectNode?.(n.id); } }} data-endpoint={start ? 'start' : destination ? 'destination' : undefined}>
              <title>{nodeLabelRu(n.id, n.label, n.labelKk)}</title>
              {selectable && <circle className="node-hit-target" cx={x(n.x)} cy={y(n.z)} r="16" />}
              {(highlight?.nodeId === n.id || selectedNodeId === n.id || transitionNodes.includes(n.id)) && <circle cx={x(n.x)} cy={y(n.z)} r={n.kind === 'room' ? 8 : 11} className="plan-highlight-node" />}
              {destination && !start ? <rect x={x(n.x) - 6} y={y(n.z) - 6} width="12" height="12" rx="1" className="plan-endpoint-destination" /> : !service && <circle cx={x(n.x)} cy={y(n.z)} r={start ? 7 : n.selectable ? 4 : 2} className={`plan-node ${result.status === 'ok' && result.nodeIds.includes(n.id) ? 'on-route' : ''}`} />}
              {service && !building.edges.some(e => routed.has(e.id) && (e.from === n.id || e.to === n.id) && nodeMap.get(e.from)!.floor !== nodeMap.get(e.to)!.floor) && <text x={x(n.x)} y={y(n.z) + 26} textAnchor="middle" className="plan-service-label">{n.kind === 'lift' ? `${t('Лифт', 'Лифт', "Elevator")} ${n.id.includes('-a-') ? 'A' : 'B'}` : t('Лестница', 'Баспалдақ', "Stairs")}</text>}
              {n.kind === 'room' && <text x={x(n.x)} y={y(n.z) - 9} textAnchor="middle" className="plan-room-label">{roomShort[n.id]?.[locale === 'en' ? 2 : locale === 'kk' ? 1 : 0] ?? n.id.replace('room-', '')}</text>}
              {n.kind === 'entrance' && <text x={x(n.x) + 12} y={y(n.z) + 15} className="plan-service-label">{t('Вход', 'Кіру', "Entrance")} ↑</text>}
            </g>;
          })}
        </svg></div>
      </figure>;
    })}
  </div>;
}

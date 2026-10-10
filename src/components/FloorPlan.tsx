import { useId, useLayoutEffect, useRef } from 'react';
import type { Building, RouteResult } from '../domain/model';

interface Props { building: Building; result: RouteResult; floor: 'all' | number; closedEdgeIds: string[]; highlight?: { nodeId: string; edgeId?: string } | null; zoom?: number; resetToken?: number }
export function FloorPlan({ building, result, floor, closedEdgeIds, highlight, zoom = 1, resetToken = 0 }: Props) {
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
  return <div ref={collectionRef} className="floor-plans" role="region" aria-label="Схемы этажей учебной модели" tabIndex={0} data-testid="floor-plan" data-highlight-node={highlight?.nodeId ?? ''} data-highlight-edge={highlight?.edgeId ?? ''} data-route-ids={result.status === 'ok' ? result.edgeIds.join(',') : ''}>
    {floors.map(f => <figure className="floor-card" key={f.id} data-floor-id={f.id}>
      <figcaption><span>{f.label}{routeFloors.has(f.id) ? ' · На маршруте' : ''}</span><span className="tiny muted">Схема условная</span></figcaption>
      <div className="floor-viewport" role="region" aria-label={`${f.label}: прокручиваемая схема`} tabIndex={0}><svg viewBox="0 0 336 262" style={{ width: `calc(min(100%, var(--floor-height) * 336 / 262) * ${zoom})` }} role="img" tabIndex={-1} aria-labelledby={`${prefix}-${f.id}`}>
        <title id={`${prefix}-${f.id}`}>{`${f.label}: схема вымышленного здания и текущий маршрут`}</title>
        <rect x="25" y="40" width="286" height="197" rx="8" className="plan-shell" />
        {[5, 13, 21].map(roomX => <rect key={roomX} x={x(roomX)} y={y(1)} width="59" height="45" rx="3" className="plan-room" />)}
        {building.edges.map(edge => {
          const from = nodeMap.get(edge.from)!; const to = nodeMap.get(edge.to)!;
          if (from.floor !== f.id && to.floor !== f.id) return null;
          const active = routed.has(edge.id); const isClosed = closed.has(edge.id);
          const orderedIndex = result.status === 'ok' ? result.edgeIds.indexOf(edge.id) : -1;
          const directionFrom = result.status === 'ok' && orderedIndex >= 0 ? nodeMap.get(result.nodeIds[orderedIndex]!) : undefined;
          const directionTo = result.status === 'ok' && orderedIndex >= 0 ? nodeMap.get(result.nodeIds[orderedIndex + 1]!) : undefined;
          if (from.floor !== to.floor) {
            const node = from.floor === f.id ? from : to; const other = from.floor === f.id ? to : from;
            const transitions = building.edges.filter(e => (e.from === node.id || e.to === node.id) && nodeMap.get(e.from)!.floor !== nodeMap.get(e.to)!.floor).length;
            const markerX = x(node.x) + (transitions > 1 ? (other.floor < node.floor ? -12 : 12) : 0);
            return <g key={edge.id} data-edge-id={edge.id} data-route={active ? 'true' : 'false'} className={`${isClosed ? 'transition closed' : active ? 'transition active' : 'transition'}${uncertain.has(edge.id) ? ' uncertain' : ''}${highlight?.edgeId === edge.id ? ' selected' : ''}`}>
              <rect data-direction-from={directionFrom?.id} data-direction-to={directionTo?.id} x={markerX - 10} y={y(node.z) - 12} width="20" height="24" rx="4" />
              <text x={markerX} y={y(node.z) + 4} textAnchor="middle">{isClosed ? '×' : uncertain.has(edge.id) ? '?' : directionFrom && directionTo ? directionTo.floor > directionFrom.floor ? '↑' : '↓' : edge.type === 'lift' ? '↕' : '≋'}</text>
              <text x={markerX} y={y(node.z) + (other.floor > node.floor && transitions > 1 ? 34 : -19)} textAnchor="middle" className="transition-label">
                {edge.type === 'lift' ? `Лифт ${edge.id.includes('-a-') ? 'A' : 'B'}` : 'Лестница'} {directionFrom && directionTo ? `${directionFrom.floor + 1} → ${directionTo.floor + 1}` : `→ ${other.floor + 1}`} эт.{isClosed ? ' ×' : ''}
              </text>
            </g>;
          }
          return <g key={edge.id} data-edge-id={edge.id} data-route={active ? 'true' : 'false'} data-direction-from={directionFrom?.id} data-direction-to={directionTo?.id}>
            {highlight?.edgeId === edge.id && <line x1={x(from.x)} y1={y(from.z)} x2={x(to.x)} y2={y(to.z)} className={`plan-highlight-edge ${uncertain.has(edge.id) ? 'uncertain' : ''}`} />}
            <line x1={x(from.x)} y1={y(from.z)} x2={x(to.x)} y2={y(to.z)} className={`plan-edge ${active ? 'routed' : ''} ${uncertain.has(edge.id) ? 'uncertain' : ''} ${isClosed ? 'closed' : ''}`} />
            {directionFrom && directionTo && <path className={`plan-direction ${uncertain.has(edge.id) ? 'uncertain' : ''}`} d="M -5 -5 L 5 0 L -5 5 Z" transform={`translate(${x(directionFrom.x + (directionTo.x - directionFrom.x) * .65)} ${y(directionFrom.z + (directionTo.z - directionFrom.z) * .65)}) rotate(${Math.atan2(directionTo.z - directionFrom.z, directionTo.x - directionFrom.x) * 180 / Math.PI})`} />}
            {isClosed && <text className="closed-mark" x={(x(from.x) + x(to.x)) / 2} y={(y(from.z) + y(to.z)) / 2}>×</text>}
            {uncertain.has(edge.id) && <text className="uncertain-mark" x={(x(from.x) + x(to.x)) / 2 + 7} y={(y(from.z) + y(to.z)) / 2}>?</text>}
          </g>;
        })}
        {building.nodes.filter(n => n.floor === f.id).map(n => <g key={n.id} data-node-id={n.id} data-endpoint={result.status === 'ok' && result.nodeIds[0] === n.id ? 'start' : result.status === 'ok' && result.nodeIds.at(-1) === n.id ? 'destination' : undefined}>
          {(highlight?.nodeId === n.id || transitionNodes.includes(n.id)) && <circle cx={x(n.x)} cy={y(n.z)} r="11" className="plan-highlight-node" />}
          {result.status === 'ok' && result.nodeIds.at(-1) === n.id && result.nodeIds.length > 1 ? <rect x={x(n.x) - 6} y={y(n.z) - 6} width="12" height="12" rx="1" className="plan-endpoint-destination" /> : <circle cx={x(n.x)} cy={y(n.z)} r={result.status === 'ok' && result.nodeIds[0] === n.id ? 7 : n.selectable ? 5 : 2.5} className={`plan-node ${result.status === 'ok' && result.nodeIds.includes(n.id) ? 'on-route' : ''}`} />}
          {(n.kind === 'room' || n.kind === 'entrance' || n.id === 'lobby-0') && <text x={x(n.x)} y={y(n.z) + (n.kind === 'room' ? -9 : 17)} textAnchor="middle" className="room-label">{n.kind === 'room' ? n.id.replace('room-', '') : n.kind === 'entrance' ? 'Вход' : 'Холл'}</text>}
        </g>)}
      </svg></div>
    </figure>)}
  </div>;
}

import type { BuildingEdge, Evidence, ExclusionReason, Requirements, RouteResult } from './model';
import { validateBuilding, validateClosedEdgeIds, validateRequirements } from './validation';

export function inspectEdge(edge: BuildingEdge, requirements: Requirements, closed: ReadonlySet<string>) {
  const reasons: ExclusionReason[] = [];
  let uncertain = false;
  const check = <T>(attribute: Evidence<T>, passes: (v: T) => boolean, known: ExclusionReason, unknown: ExclusionReason) => {
    if (attribute.status === 'unknown') {
      uncertain = true;
      if (!requirements.allowUnknown) reasons.push(unknown);
    } else if (!passes(attribute.value)) reasons.push(known);
  };
  if (closed.has(edge.id)) reasons.push('closed');
  check(edge.widthM, v => v >= requirements.minWidthM, 'width', 'unknown-width');
  if (requirements.avoidStairs) {
    if (edge.type === 'stairs') reasons.push('stairs');
    else check(edge.stepFree, v => v, 'step-free', 'unknown-step-free');
  }
  if (['corridor', 'door', 'ramp'].includes(edge.type)) {
    check(edge.slopePercent, v => v <= requirements.maxSlopePercent, 'slope', 'unknown-slope');
    if (requirements.smoothOnly) check(edge.surface, v => v === 'smooth', 'surface', 'unknown-surface');
  }
  return { reasons, uncertain };
}

export function findRoute(buildingInput: unknown, start: string, destination: string, requirements: Requirements, closedEdgeIds: string[]): RouteResult {
  const validation = validateBuilding(buildingInput);
  if (!validation.valid) return { status: 'invalid', message: validation.message };
  const building = validation.value;
  if (!validateRequirements(requirements)) return { status: 'invalid', message: 'Требования вне допустимого диапазона.' };
  const nodes = new Set(building.nodes.map(n => n.id));
  if (!nodes.has(start) || !nodes.has(destination)) return { status: 'invalid', message: 'Начальная или конечная точка не существует.' };
  if (!validateClosedEdgeIds(closedEdgeIds, building))
    return { status: 'invalid', message: 'Неизвестный идентификатор закрытого прохода.' };
  if (start === destination) return { status: 'ok', nodeIds: [start], edgeIds: [], distanceM: 0, uncertainEdgeIds: [] };
  const closed = new Set(closedEdgeIds);
  const inspections = new Map(building.edges.map(e => [e.id, inspectEdge(e, requirements, closed)]));
  const adjacency = new Map(building.nodes.map(n => [n.id, [] as { node: string; edge: BuildingEdge }[]]));
  for (const edge of [...building.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    if (inspections.get(edge.id)!.reasons.length) continue;
    adjacency.get(edge.from)!.push({ node: edge.to, edge });
    adjacency.get(edge.to)!.push({ node: edge.from, edge });
  }
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, { node: string; edgeId: string }>();
  const remaining = new Set(nodes);
  while (remaining.size) {
    const current = [...remaining].sort((a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity) || a.localeCompare(b))[0]!;
    const distance = distances.get(current) ?? Infinity;
    if (!Number.isFinite(distance)) break;
    remaining.delete(current);
    if (current === destination) break;
    for (const neighbor of adjacency.get(current)!) {
      if (!remaining.has(neighbor.node)) continue;
      const candidate = distance + neighbor.edge.lengthM;
      if (candidate < (distances.get(neighbor.node) ?? Infinity)) {
        distances.set(neighbor.node, candidate);
        previous.set(neighbor.node, { node: current, edgeId: neighbor.edge.id });
      }
    }
  }
  if (!previous.has(destination)) return { status: 'no-route', excluded: building.edges.filter(e => inspections.get(e.id)!.reasons.length).map(e => ({ edgeId: e.id, reasons: inspections.get(e.id)!.reasons })) };
  const nodeIds = [destination];
  const edgeIds: string[] = [];
  let cursor = destination;
  while (cursor !== start) {
    const parent = previous.get(cursor)!;
    nodeIds.unshift(parent.node); edgeIds.unshift(parent.edgeId); cursor = parent.node;
  }
  return { status: 'ok', nodeIds, edgeIds, distanceM: distances.get(destination)!, uncertainEdgeIds: edgeIds.filter(id => inspections.get(id)!.uncertain) };
}

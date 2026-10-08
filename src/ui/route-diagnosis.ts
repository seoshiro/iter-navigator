import type { Building, ExclusionReason, RouteResult, Scenario } from '../domain/model';
import { findRoute, inspectEdge } from '../domain/routing';

export interface RouteDiagnosis {
  kind: 'model-fit' | 'uncertain' | 'insufficient' | 'no-route' | 'invalid';
  details: { edgeId: string; reasons: ExclusionReason[] }[];
  floors: number[];
  stepFree: boolean | null;
  connected: boolean;
}

// Presentation-only counterfactuals: no candidate from this function is a navigable route.
export function diagnoseRoute(building: Building, scenario: Scenario, result: RouteResult): RouteDiagnosis {
  const edges = new Map(building.edges.map(edge => [edge.id, edge]));
  const nodes = new Map(building.nodes.map(node => [node.id, node]));
  const closed = new Set(scenario.closedEdgeIds);
  const describe = (ids: string[], strict = true) => ids.flatMap(edgeId => {
    const reasons = inspectEdge(edges.get(edgeId)!, strict ? { ...scenario.requirements, allowUnknown: false } : scenario.requirements, closed).reasons;
    return reasons.length ? [{ edgeId, reasons }] : [];
  });
  if (result.status === 'invalid') return { kind: 'invalid', details: [], floors: [], stepFree: null, connected: false };
  if (result.status === 'ok') {
    const routeEdges = result.edgeIds.map(id => edges.get(id)!);
    const stepFree = routeEdges.some(edge => edge.type === 'stairs' || edge.stepFree.status === 'checked' && !edge.stepFree.value) ? false
      : routeEdges.some(edge => edge.stepFree.status === 'unknown') ? null : true;
    return { kind: result.uncertainEdgeIds.length ? 'uncertain' : 'model-fit', details: describe(result.uncertainEdgeIds),
      floors: result.nodeIds.map(id => nodes.get(id)!.floor).filter((floor, index, ordered) => index === 0 || floor !== ordered[index - 1]), stepFree, connected: true };
  }
  const relaxed = findRoute(building, scenario.start, scenario.destination, { ...scenario.requirements, allowUnknown: true }, scenario.closedEdgeIds);
  if (relaxed.status === 'ok') return { kind: 'insufficient', details: describe(relaxed.edgeIds), floors: [], stepFree: null, connected: true };

  // Find one topology path with the fewest obstructed edges, then shortest distance.
  // Its inspected obstacles explain this candidate only; they are never claimed as a global cut.
  const costs = new Map<string, [number, number]>([[scenario.start, [0, 0]]]);
  const previous = new Map<string, { node: string; edgeId: string }>();
  const remaining = new Set(nodes.keys());
  const compare = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];
  while (remaining.size) {
    const current = [...remaining].sort((a, b) => compare(costs.get(a) ?? [Infinity, Infinity], costs.get(b) ?? [Infinity, Infinity]) || a.localeCompare(b))[0]!;
    const cost = costs.get(current); if (!cost) break;
    remaining.delete(current); if (current === scenario.destination) break;
    for (const edge of [...building.edges].sort((a, b) => a.id.localeCompare(b.id))) {
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : undefined;
      if (!next || !remaining.has(next)) continue;
      const obstructed = inspectEdge(edge, scenario.requirements, closed).reasons.length > 0;
      const candidate: [number, number] = [cost[0] + Number(obstructed), cost[1] + edge.lengthM];
      if (compare(candidate, costs.get(next) ?? [Infinity, Infinity]) < 0) { costs.set(next, candidate); previous.set(next, { node: current, edgeId: edge.id }); }
    }
  }
  const ids: string[] = []; let cursor = scenario.destination;
  while (previous.has(cursor)) { const parent = previous.get(cursor)!; ids.unshift(parent.edgeId); cursor = parent.node; }
  return { kind: 'no-route', details: cursor === scenario.start ? describe(ids, false) : [], floors: [], stepFree: null, connected: cursor === scenario.start };
}

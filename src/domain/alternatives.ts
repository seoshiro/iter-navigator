import type { Building, BuildingEdge, Requirements, RouteResult } from './model';
import { findRoute, inspectEdge } from './routing';

export type UsableRoute = Extract<RouteResult, { status: 'ok' }>;
const orderedKey = (route: UsableRoute) => JSON.stringify([route.edgeIds, route.nodeIds]);
const compareIds = (a: UsableRoute, b: UsableRoute) => orderedKey(a) < orderedKey(b) ? -1 : orderedKey(a) > orderedKey(b) ? 1 : 0;

export function findRouteVariants(building: Building, start: string, destination: string, requirements: Requirements, closedEdgeIds: string[]) {
  const primary = findRoute(building, start, destination, requirements, closedEdgeIds);
  if (primary.status !== 'ok' || start === destination) return { primary, alternatives: [] as UsableRoute[] };
  const closed = new Set(closedEdgeIds);
  const inspections = new Map(building.edges.map(edge => [edge.id, inspectEdge(edge, requirements, closed)]));
  const adjacent = new Map(building.nodes.map(node => [node.id, [] as { node: string; edge: BuildingEdge }[]]));
  for (const edge of building.edges) {
    if (inspections.get(edge.id)!.reasons.length) continue;
    adjacent.get(edge.from)!.push({ node: edge.to, edge });
    adjacent.get(edge.to)!.push({ node: edge.from, edge });
  }
  const paths: UsableRoute[] = [];
  // shortcut: enumerate simple paths in this small fictional graph; use k-shortest paths if the graph grows.
  const visit = (nodeIds: string[], edgeIds: string[], distanceM: number) => {
    const current = nodeIds.at(-1)!;
    if (current === destination) {
      paths.push({ status: 'ok', nodeIds, edgeIds, distanceM, uncertainEdgeIds: edgeIds.filter(id => inspections.get(id)!.uncertain) });
      return;
    }
    for (const next of adjacent.get(current)!) {
      const distance = distanceM + next.edge.lengthM;
      if (!nodeIds.includes(next.node) && Number.isFinite(distance)) visit([...nodeIds, next.node], [...edgeIds, next.edge.id], distance);
    }
  };
  visit([start], [], 0);
  const alternatives = paths.filter(path => orderedKey(path) !== orderedKey(primary))
    .sort((a, b) => a.distanceM - b.distanceM || compareIds(a, b)).slice(0, 2);
  return { primary, alternatives };
}

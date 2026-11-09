import type { Building, BuildingEdge, Requirements, RouteResult } from './model';
import { findRoute, inspectEdge } from './routing';

export type UsableRoute = Extract<RouteResult, { status: 'ok' }>;
export interface RouteVariants { primary: RouteResult; alternatives: UsableRoute[] }
const orderedKey = (route: UsableRoute) => JSON.stringify([route.edgeIds, route.nodeIds]);
const compareIds = (a: UsableRoute, b: UsableRoute) => orderedKey(a) < orderedKey(b) ? -1 : orderedKey(a) > orderedKey(b) ? 1 : 0;
const compareRoutes = (a: UsableRoute, b: UsableRoute) => a.distanceM - b.distanceM || compareIds(a, b);
// A bounded Yen search avoids enumerating every simple path as the demo grows.
const MAX_CANDIDATE_ROUTES = 64;

export function findRouteVariants(building: Building, start: string, destination: string, requirements: Requirements, closedEdgeIds: string[]): RouteVariants {
  // Eligibility is applied first. Display diversity never changes the shortest-distance primary.
  const primary = findRoute(building, start, destination, requirements, closedEdgeIds);
  if (primary.status !== 'ok' || start === destination) return { primary, alternatives: [] };
  const closed = new Set(closedEdgeIds);
  const inspections = new Map(building.edges.map(edge => [edge.id, inspectEdge(edge, requirements, closed)]));
  const edges = new Map(building.edges.map(edge => [edge.id, edge]));
  const nodes = new Map(building.nodes.map(node => [node.id, node]));
  const adjacent = new Map(building.nodes.map(node => [node.id, [] as { node: string; edge: BuildingEdge }[]]));
  for (const edge of [...building.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    if (inspections.get(edge.id)!.reasons.length) continue;
    adjacent.get(edge.from)!.push({ node: edge.to, edge });
    adjacent.get(edge.to)!.push({ node: edge.from, edge });
  }
  const route = (nodeIds: string[], edgeIds: string[]): UsableRoute => ({
    status: 'ok', nodeIds, edgeIds,
    distanceM: edgeIds.reduce((sum, id) => sum + edges.get(id)!.lengthM, 0),
    uncertainEdgeIds: edgeIds.filter(id => inspections.get(id)!.uncertain),
  });
  const shortestSpur = (spur: string, blockedNodes: Set<string>, blockedEdges: Set<string>): UsableRoute | null => {
    const distances = new Map([[spur, 0]]);
    const pathEdges = new Map<string, string[]>([[spur, []]]);
    const pathKeys = new Map([[spur, '[]']]);
    const previous = new Map<string, { node: string; edgeId: string }>();
    const remaining = new Set([...nodes.keys()].filter(id => !blockedNodes.has(id)));
    while (remaining.size) {
      const current = [...remaining].sort((a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity) || (pathKeys.get(a) ?? '').localeCompare(pathKeys.get(b) ?? '') || a.localeCompare(b))[0]!;
      const distance = distances.get(current) ?? Infinity;
      if (!Number.isFinite(distance)) break;
      remaining.delete(current);
      if (current === destination) break;
      for (const next of adjacent.get(current)!) {
        if (blockedEdges.has(next.edge.id) || !remaining.has(next.node)) continue;
        const candidate = distance + next.edge.lengthM;
        const nextPath = [...pathEdges.get(current)!, next.edge.id];
        const nextKey = JSON.stringify(nextPath);
        const knownDistance = distances.get(next.node) ?? Infinity;
        if (candidate < knownDistance || (candidate === knownDistance && nextKey < (pathKeys.get(next.node) ?? '\uffff'))) {
          distances.set(next.node, candidate);
          pathEdges.set(next.node, nextPath);
          pathKeys.set(next.node, nextKey);
          previous.set(next.node, { node: current, edgeId: next.edge.id });
        }
      }
    }
    if (spur !== destination && !previous.has(destination)) return null;
    const nodeIds = [destination];
    const edgeIds: string[] = [];
    for (let cursor = destination; cursor !== spur;) {
      const parent = previous.get(cursor)!;
      nodeIds.unshift(parent.node); edgeIds.unshift(parent.edgeId); cursor = parent.node;
    }
    return route(nodeIds, edgeIds);
  };
  const verticalProfile = (path: UsableRoute) => {
    const verticalEdges = path.edgeIds.map(id => edges.get(id)!).filter(edge => edge.type === 'lift' || edge.type === 'stairs');
    const resources = new Set(verticalEdges.map(edge => {
      const group = building.closureGroups.find(item => item.edgeIds.includes(edge.id));
      if (group) return `${edge.type}:${group.id}`;
      const from = nodes.get(edge.from)!; const to = nodes.get(edge.to)!;
      return `${edge.type}:${[`${from.x},${from.z}`, `${to.x},${to.z}`].sort().join('|')}`;
    }));
    return { resources, transitions: verticalEdges.length };
  };
  const redundant = (candidate: UsableRoute, shorter: UsableRoute) => {
    if (shorter.distanceM > candidate.distanceM || shorter.uncertainEdgeIds.length > candidate.uncertainEdgeIds.length) return false;
    const a = verticalProfile(shorter); const b = verticalProfile(candidate);
    const subset = [...a.resources].every(resource => b.resources.has(resource));
    // A longer route adding vertical travel and dependencies offers no new choice.
    // This does NOT ban extra floors: a necessary detour is retained when no simpler eligible path dominates it.
    if (subset && a.transitions < b.transitions) return true;
    const sameResources = subset && a.resources.size === b.resources.size;
    // Keep the best route for a particular lift/stair choice, unless a longer one has less uncertainty.
    if (sameResources && a.resources.size > 0 && a.transitions === b.transitions) return true;
    if (!sameResources) return false;
    const shared = new Set(shorter.edgeIds);
    const commonDistance = candidate.edgeIds.filter(id => shared.has(id)).reduce((sum, id) => sum + edges.get(id)!.lengthM, 0);
    // For horizontal choices, retain genuinely separate corridors, not tiny variations of one route.
    return commonDistance / Math.min(shorter.distanceM, candidate.distanceM) >= 0.8;
  };
  const examined = [primary];
  const seen = new Set([orderedKey(primary)]);
  const pending = new Map<string, UsableRoute>();
  const alternatives: UsableRoute[] = [];
  while (examined.length < MAX_CANDIDATE_ROUTES && alternatives.length < 2) {
    const previous = examined.at(-1)!;
    for (let index = 0; index < previous.nodeIds.length - 1; index++) {
      const rootNodes = previous.nodeIds.slice(0, index + 1);
      const rootEdges = previous.edgeIds.slice(0, index);
      const blockedEdges = new Set(examined.filter(path =>
        rootNodes.every((id, i) => path.nodeIds[i] === id) && rootEdges.every((id, i) => path.edgeIds[i] === id))
        .map(path => path.edgeIds[index]!).filter(Boolean));
      const spur = shortestSpur(rootNodes.at(-1)!, new Set(rootNodes.slice(0, -1)), blockedEdges);
      if (!spur) continue;
      const candidate = route([...rootNodes.slice(0, -1), ...spur.nodeIds], [...rootEdges, ...spur.edgeIds]);
      const key = orderedKey(candidate);
      if (!seen.has(key)) pending.set(key, candidate);
    }
    const next = [...pending.values()].sort(compareRoutes)[0];
    if (!next) break;
    const key = orderedKey(next);
    pending.delete(key); seen.add(key);
    if (!examined.some(shorter => redundant(next, shorter))) alternatives.push(next);
    examined.push(next);
  }
  return { primary, alternatives: alternatives.sort(compareRoutes) };
}

import { describe, expect, it } from 'vitest';
import fixture from '../data/building.json';
import type { Building, BuildingEdge } from './model';
import { findRouteVariants } from './alternatives';
import { findRoute } from './routing';
import { defaultScenario } from './storage';

const building = fixture as Building;
const requirements = defaultScenario().requirements;
const a = ['entry', 'approach-a', 'lift-a-01', 'gallery-a-1', 'door-204'];
const b = ['entry', 'approach-b', 'lift-b-01', 'gallery-b-1', 'east-1', 'door-204'];
describe('eligible deterministic route alternatives', () => {
  it('keeps the authoritative primary and the meaningful direct lift alternative', () => {
    const result = findRouteVariants(building, 'entrance', 'room-204', requirements, []);
    expect(result.primary).toEqual(findRoute(building, 'entrance', 'room-204', requirements, []));
    expect(result.primary).toMatchObject({ edgeIds: a, distanceM: 40 });
    // The former 70 m route adds an unnecessary trip to floor 3 and back via another lift.
    expect(result.alternatives.map(route => route.distanceM)).toEqual([54]);
    expect(result.alternatives[0]!.edgeIds).toEqual(b);
    for (const route of result.alternatives) {
      expect(new Set(route.nodeIds).size).toBe(route.nodeIds.length);
      expect(route.edgeIds).not.toContain('narrow-204');
      route.edgeIds.forEach((id, index) => { const edge = building.edges.find(item => item.id === id)!; expect([edge.from, edge.to].sort()).toEqual([route.nodeIds[index], route.nodeIds[index + 1]].sort()); });
    }
    expect(findRouteVariants({ ...building, edges: [...building.edges].reverse(), nodes: [...building.nodes].reverse() }, 'entrance', 'room-204', requirements, [])).toEqual(result);
  });
  it('preserves closure, unknown and known-failure policy for every candidate', () => {
    const closedA = building.closureGroups[0]!.edgeIds;
    const closedB = building.closureGroups[1]!.edgeIds;
    const closed = findRouteVariants(building, 'entrance', 'room-204', requirements, closedA);
    expect(closed.primary).toMatchObject({ edgeIds: b, distanceM: 54 });
    expect(closed.alternatives).toEqual([]);
    expect(findRouteVariants(building, 'entrance', 'room-204', requirements, [...closedA, ...closedB])).toMatchObject({ primary: { status: 'no-route' }, alternatives: [] });
    expect(findRouteVariants(building, 'entrance', 'room-205', requirements, [])).toMatchObject({ primary: { status: 'no-route' }, alternatives: [] });
    const opted = findRouteVariants(building, 'entrance', 'room-205', { ...requirements, allowUnknown: true }, []);
    expect(opted.primary).toMatchObject({ distanceM: 46, uncertainEdgeIds: ['door-205'] });
    for (const route of [opted.primary, ...opted.alternatives]) if (route.status === 'ok') { expect(route.uncertainEdgeIds).toEqual(['door-205']); expect(route.edgeIds).not.toContain('narrow-204'); }
    const knownFailure = structuredClone(building); knownFailure.edges.find(edge => edge.id === 'door-205')!.stepFree = { status: 'checked', value: false, source: 'fictional test', checkedOn: null };
    expect(findRouteVariants(knownFailure, 'entrance', 'room-205', { ...requirements, allowUnknown: true }, []).alternatives).toEqual([]);
  });
  it('supports reverse, zero, invalid input and stable lexicographic ties', () => {
    expect(findRouteVariants(building, 'room-204', 'entrance', requirements, []).primary).toMatchObject({ edgeIds: [...a].reverse(), distanceM: 40 });
    expect(findRouteVariants(building, 'entrance', 'entrance', requirements, [])).toEqual({ primary: { status: 'ok', nodeIds: ['entrance'], edgeIds: [], distanceM: 0, uncertainEdgeIds: [] }, alternatives: [] });
    expect(findRouteVariants(building, 'absent', 'room-204', requirements, [])).toMatchObject({ primary: { status: 'invalid' }, alternatives: [] });
    expect(findRouteVariants(null as unknown as Building, 'entrance', 'room-204', requirements, [])).toMatchObject({ primary: { status: 'invalid' }, alternatives: [] });
    const nodes = building.nodes.slice(0, 5).map((node, index) => ({ ...node, id: String(index), floor: 0 }));
    const edge = (id: string, from: string, to: string): BuildingEdge => ({ ...building.edges[0]!, id, from, to, lengthM: 1 });
    const tied: Building = { ...building, nodes, floors: [building.floors[0]!], closureGroups: [], edges: [edge('z0', '0', '1'), edge('z1', '1', '4'), edge('b0', '0', '2'), edge('b1', '2', '4'), edge('a0', '0', '3'), edge('a1', '3', '4')] };
    // Dijkstra chooses node 1 first; alternative ordering is by the ordered edge IDs.
    expect(findRouteVariants(tied, '0', '4', requirements, []).primary).toMatchObject({ edgeIds: ['z0', 'z1'] });
    expect(findRouteVariants(tied, '0', '4', requirements, []).alternatives.map(route => route.edgeIds)).toEqual([['a0', 'a1'], ['b0', 'b1']]);
  });
});

import { describe, expect, it } from 'vitest';
import fixture from '../data/building.json';
import type { Building, BuildingEdge, Evidence, Requirements } from './model';
import { findRoute, inspectEdge } from './routing';
import { defaultScenario } from './storage';
import { validateBuilding } from './validation';

const building = fixture as Building;
const requirements = defaultScenario().requirements;
const route = (r: Requirements = requirements, closed: string[] = [], destination = 'room-204', start = 'entrance', input: unknown = building) => findRoute(input, start, destination, r, closed);
const checked = <T>(value: T): Evidence<T> => ({ status: 'checked', value, source: 'fictional test', checkedOn: null });

describe('fictional routing contract', () => {
  it('validates the full fixture and returns the exact default ordered route and sum', () => {
    expect(validateBuilding(building).valid).toBe(true);
    expect(route()).toEqual({ status: 'ok', nodeIds: ['entrance', 'lobby-0', 'lift-a-0', 'lift-a-1', 'hall-1', 'room-204'],
      edgeIds: ['entry', 'approach-a', 'lift-a-01', 'gallery-a-1', 'door-204'], distanceM: 40, uncertainEdgeIds: [] });
  });
  it('uses B when A closes, excludes both closed lifts, then restores without stale edges', () => {
    const a = building.closureGroups[0]!.edgeIds;
    const both = [...a, ...building.closureGroups[1]!.edgeIds];
    const result = route(requirements, a);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') { expect(result.edgeIds).toContain('lift-b-01'); expect(result.distanceM).toBe(54); expect(result.edgeIds.some(id => a.includes(id))).toBe(false); }
    const blocked = route(requirements, both);
    expect(blocked.status).toBe('no-route');
    if (blocked.status === 'no-route') {
      expect(blocked.excluded).toEqual(expect.arrayContaining([
        { edgeId: 'lift-a-01', reasons: ['closed'] }, { edgeId: 'lift-b-01', reasons: ['closed'] },
        { edgeId: 'stairs-01', reasons: ['stairs'] },
      ]));
    }
    expect(route()).toEqual(route(requirements, []));
  });
  it('excludes unknown active evidence by default and identifies opted-in used edges', () => {
    const strict = route(requirements, [], 'room-205');
    expect(strict.status).toBe('no-route');
    if (strict.status === 'no-route') expect(strict.excluded).toContainEqual({ edgeId: 'door-205', reasons: ['unknown-width', 'unknown-surface'] });
    const result = route({ ...requirements, allowUnknown: true }, [], 'room-205');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.uncertainEdgeIds).toEqual(['door-205']);
    const bad = structuredClone(building);
    bad.edges.find(e => e.id === 'door-205')!.stepFree = checked(false);
    expect(route({ ...requirements, allowUnknown: true }, [], 'room-205', 'entrance', bad).status).toBe('no-route');
  });
  it('known narrow, stairs, rough and sloped edges remain excluded with unknown opt-in', () => {
    const permissiveUnknown = { ...requirements, allowUnknown: true };
    for (const [id, reason] of [['narrow-204', 'width'], ['stairs-01', 'stairs'], ['rough-0', 'surface'], ['ramp-0', 'slope']] as const)
      expect(inspectEdge(building.edges.find(e => e.id === id)!, permissiveUnknown, new Set()).reasons).toContain(reason);
    expect(route({ ...requirements, minWidthM: 1.5, allowUnknown: true }).status).toBe('no-route');
  });
  it('fails closed for each active unknown attribute and retains known failures on the same edge', () => {
    const baseline = building.edges.find(e => e.id === 'entry')!;
    const attributes = [['widthM', 'unknown-width'], ['slopePercent', 'unknown-slope'], ['surface', 'unknown-surface'], ['stepFree', 'unknown-step-free']] as const;
    for (const [key, reason] of attributes) {
      const edge = structuredClone(baseline);
      edge[key] = { status: 'unknown', value: null, source: 'fictional unknown test', checkedOn: null };
      expect(inspectEdge(edge, requirements, new Set()).reasons).toEqual([reason]);
      expect(inspectEdge(edge, { ...requirements, allowUnknown: true }, new Set())).toEqual({ reasons: [], uncertain: true });
      expect(inspectEdge(edge, { ...requirements, allowUnknown: true }, new Set([edge.id])).reasons).toContain('closed');
    }
  });
  it('uses exact threshold equality and does not activate slope/surface on lifts/stairs', () => {
    const lift = structuredClone(building.edges.find(e => e.id === 'lift-a-01')!);
    lift.slopePercent = { status: 'unknown', value: null, source: 'fictional', checkedOn: null };
    lift.surface = { status: 'unknown', value: null, source: 'fictional', checkedOn: null };
    expect(inspectEdge(lift, { ...requirements, minWidthM: 1.1, maxSlopePercent: 0 }, new Set())).toEqual({ reasons: [], uncertain: false });
    const ramp = building.edges.find(e => e.id === 'ramp-0')!;
    expect(inspectEdge(ramp, { ...requirements, maxSlopePercent: 8, minWidthM: 1.2 }, new Set()).reasons).toEqual([]);
    expect(inspectEdge(building.edges.find(e => e.id === 'stairs-01')!, { ...requirements, avoidStairs: false }, new Set())).toEqual({ reasons: [], uncertain: false });
  });
  it('covers zero length routes, invalid IDs, graph references, enums, values and requirements', () => {
    expect(route(requirements, [], 'entrance')).toEqual({ status: 'ok', nodeIds: ['entrance'], edgeIds: [], distanceM: 0, uncertainEdgeIds: [] });
    expect(route(requirements, [], 'absent').status).toBe('invalid');
    expect(route(requirements, ['absent']).status).toBe('invalid');
    expect(route({ ...requirements, minWidthM: NaN }).status).toBe('invalid');
    expect(route({ ...requirements, maxSlopePercent: 21 }).status).toBe('invalid');
    const mutations = [
      (b: Building) => { b.nodes[0]!.x = Infinity; }, (b: Building) => { b.nodes[0]!.id = b.nodes[1]!.id; },
      (b: Building) => { b.edges[0]!.to = 'absent'; }, (b: Building) => { b.edges[0]!.lengthM = -1; },
      (b: Building) => { b.edges[0]!.type = 'teleport' as BuildingEdge['type']; },
      (b: Building) => { b.edges[0]!.widthM = { status: 'unknown', value: 1, source: 'fiction', checkedOn: null } as unknown as Evidence<number>; },
      (b: Building) => { b.closureGroups[0]!.edgeIds = ['absent']; },
    ];
    for (const mutate of mutations) { const input = structuredClone(building); mutate(input); expect(route(requirements, [], 'room-204', 'entrance', input).status).toBe('invalid'); }
    expect(route(requirements, [], 'room-204', 'entrance', null).status).toBe('invalid');
  });
  it('rejects coerced enums, holes in every graph collection and overflowing aggregate length', () => {
    for (const mutate of [
      (b: Building) => { b.nodes[0]!.kind = ['entrance'] as unknown as Building['nodes'][number]['kind']; },
      (b: Building) => { b.edges[0]!.type = ['corridor'] as unknown as BuildingEdge['type']; },
      (b: Building) => { delete b.floors[0]; }, (b: Building) => { delete b.nodes[0]; },
      (b: Building) => { delete b.edges[0]; }, (b: Building) => { delete b.closureGroups[0]; },
      (b: Building) => { delete b.closureGroups[0]!.edgeIds[0]; },
      (b: Building) => { b.edges[0]!.lengthM = Number.MAX_VALUE; b.edges[1]!.lengthM = Number.MAX_VALUE; },
    ]) {
      const input = structuredClone(building); mutate(input);
      expect(validateBuilding(input).valid).toBe(false);
      expect(route(requirements, [], 'room-204', 'entrance', input).status).toBe('invalid');
    }
    // Large irrelevant edges do not invalidate a finite aggregate or the eligible alternate path.
    const large = structuredClone(building);
    large.edges.find(e => e.id === 'rough-0')!.lengthM = 8e307;
    large.edges.find(e => e.id === 'ramp-0')!.lengthM = 8e307;
    expect(validateBuilding(large).valid).toBe(true);
    expect(route(requirements, [], 'room-204', 'entrance', large)).toEqual(route());
  });
  it('rejects finite inputs whose SVG or world coordinates exceed rendering range', () => {
    for (const mutate of [
      (b: Building) => { b.nodes[0]!.x = 1e308; }, (b: Building) => { b.nodes[0]!.z = 1e308; },
      (b: Building) => { b.floorHeightM = 1e308; },
      (b: Building) => { b.floors.push({ id: 1e308, label: 'Unused oversized floor' }); },
      (b: Building) => { b.nodes[0]!.x = 4e37; },
    ]) {
      const input = structuredClone(building); mutate(input);
      expect(validateBuilding(input).valid).toBe(false);
      expect(route(requirements, [], 'room-204', 'entrance', input).status).toBe('invalid');
    }
  });
  it('rejects an edge whose finite Float32 endpoints yield an unrepresentable segment length', () => {
    const input: Building = { ...building, floorHeightM: 1.65e38, floors: [building.floors[0]!, building.floors[2]!], closureGroups: [],
      nodes: [{ ...building.nodes[0]!, id: 'from', floor: 0, x: -3e37, z: -3e37 },
        { ...building.nodes[1]!, id: 'to', floor: 2, x: 3e37, z: 3e37 }],
      edges: [{ ...building.edges[0]!, id: 'segment', from: 'from', to: 'to' }] };
    for (const node of input.nodes) {
      for (const value of [node.x, node.z, node.floor * input.floorHeightM + 0.45, 24 + node.x * 9, 35 + node.z * 9])
        expect(Number.isFinite(Math.fround(value))).toBe(true);
    }
    const length = Math.hypot(6e37, 3.3e38, 6e37);
    expect(Number.isFinite(length)).toBe(true);
    expect(Number.isFinite(Math.fround(length))).toBe(false);
    expect(validateBuilding(input)).toEqual({ valid: false, message: 'Геометрия связей вне диапазона отображения.' });
    expect(findRoute(input, 'from', 'to', requirements, []).status).toBe('invalid');
  });
  it('rejects sparse and non-string routing closures while allowing individual edges and duplicate set members', () => {
    const sparse = ['entry']; delete sparse[0];
    expect(route(requirements, sparse).status).toBe('invalid');
    expect(route(requirements, [['entry']] as unknown as string[]).status).toBe('invalid');
    const individual = route(requirements, ['lift-a-01']);
    expect(individual.status).toBe('ok');
    expect(route(requirements, ['lift-a-01', 'lift-a-01'])).toEqual(individual);
  });
  it('skips an overflowing relaxation candidate instead of rejecting an available finite route', () => {
    const tiny = 2 ** 969;
    const nodes = building.nodes.slice(0, 9).map((node, index) => ({ ...node, id: String(index), floor: 0 }));
    const edge = (id: string, from: string, to: string, lengthM: number): BuildingEdge => ({ ...structuredClone(building.edges[0]!), id, from, to, lengthM });
    const edges = [edge('huge', '3', '4', Number.MAX_VALUE), edge('branch-0', '0', '1', tiny), edge('branch-1', '1', '2', tiny), edge('branch-2', '2', '3', tiny),
      edge('route-0', '0', '5', tiny), edge('route-1', '5', '6', tiny), edge('route-2', '6', '7', tiny), edge('route-3', '7', '8', tiny)];
    const input: Building = { ...building, nodes, edges, floors: [building.floors[0]!], closureGroups: [] };
    expect(Number.isFinite(edges.reduce((sum, item) => sum + item.lengthM, 0))).toBe(true);
    expect(3 * tiny + Number.MAX_VALUE).toBe(Infinity);
    expect(findRoute(input, '0', '8', requirements, [])).toEqual({ status: 'ok', nodeIds: ['0', '5', '6', '7', '8'], edgeIds: ['route-0', 'route-1', 'route-2', 'route-3'], distanceM: 4 * tiny, uncertainEdgeIds: [] });
  });
});

// Independent exhaustive simple-path oracle. It shares neither Dijkstra nor inspectEdge.
function oracle(b: Building, start: string, end: string, r: Requirements, closed: string[]) {
  const eligible = b.edges.filter(e => {
    if (closed.includes(e.id) || (r.avoidStairs && e.type === 'stairs')) return false;
    const attributes: [Evidence<unknown>, (v: unknown) => boolean][] = [[e.widthM, v => Number(v) >= r.minWidthM]];
    if (r.avoidStairs) attributes.push([e.stepFree, v => v === true]);
    if (e.type !== 'lift' && e.type !== 'stairs') {
      attributes.push([e.slopePercent, v => Number(v) <= r.maxSlopePercent]);
      if (r.smoothOnly) attributes.push([e.surface, v => v === 'smooth']);
    }
    return attributes.every(([a, test]) => a.status === 'unknown' ? r.allowUnknown : test(a.value));
  });
  let best = Infinity;
  const visit = (id: string, seen: Set<string>, distance: number) => {
    if (id === end) { best = Math.min(best, distance); return; }
    for (const edge of eligible) {
      const next = edge.from === id ? edge.to : edge.to === id ? edge.from : null;
      if (next && !seen.has(next)) visit(next, new Set([...seen, next]), distance + edge.lengthM);
    }
  };
  visit(start, new Set([start]), 0);
  return best;
}
it('matches an exhaustive independent oracle across all small-graph topologies and policies', () => {
  const nodes = building.nodes.slice(0, 4).map((n, i) => ({ ...n, id: String(i), floor: 0 }));
  const pairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  for (let mask = 0; mask < 64; mask++) {
    const edges: BuildingEdge[] = pairs.flatMap(([from, to], i) => (mask & (1 << i)) ? [{ ...structuredClone(building.edges[0]!),
      id: `e${i}`, from: String(from), to: String(to), lengthM: (i % 3) + 1, widthM: i === 4 ? { status: 'unknown', value: null, source: 'fixture', checkedOn: null } : checked(i === 1 ? 0.7 : 1.2),
      type: i === 2 ? 'stairs' : 'corridor', stepFree: checked(i !== 2) }] : []);
    const b: Building = { ...building, nodes, edges, floors: [building.floors[0]!], closureGroups: [] };
    for (const policy of [requirements, { ...requirements, allowUnknown: true }, { ...requirements, avoidStairs: false, minWidthM: 0.5 }]) {
      for (const closed of [[], ['e0'].filter(id => edges.some(e => e.id === id))]) {
        const expected = oracle(b, '0', '3', policy, closed);
        const actual = findRoute(b, '0', '3', policy, closed);
        expect(actual.status).toBe(Number.isFinite(expected) ? 'ok' : 'no-route');
        if (actual.status === 'ok') {
          expect(actual.distanceM).toBe(expected);
          expect(actual.edgeIds.reduce((sum, id) => sum + edges.find(e => e.id === id)!.lengthM, 0)).toBe(expected);
          actual.edgeIds.forEach((id, i) => { const e = edges.find(e => e.id === id)!; expect([e.from, e.to].sort()).toEqual([actual.nodeIds[i], actual.nodeIds[i + 1]].sort()); });
          expect(findRoute({ ...b, edges: [...edges].reverse(), nodes: [...nodes].reverse() }, '0', '3', policy, closed)).toEqual(actual);
        }
      }
    }
  }
});

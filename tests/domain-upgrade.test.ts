import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import data from '../src/data/building.json';
import originalData from '../src/data/building.original.json';
import type { Building, BuildingEdge, Requirements, Scenario } from '../src/domain/model';
import { findRoute, inspectEdge } from '../src/domain/routing';
import { findRouteVariants } from '../src/domain/alternatives';
import { defaultScenario } from '../src/domain/storage';
import { parseRouteLink, serializeRouteLink, SHARE_MODEL_ID } from '../src/domain/share';
import { validateBuilding } from '../src/domain/validation';

const building = data as Building;
const original = originalData as Building;
const strict = defaultScenario().requirements;
const aClosed = building.closureGroups.find(group => group.id === 'lift-a')!.edgeIds;
const bothClosed = building.closureGroups.filter(group => group.id.startsWith('lift-')).flatMap(group => group.edgeIds);
const baseUrl = 'https://iter.example/demo';
const copy = <T>(value: T): T => structuredClone(value);
function urlFor(scenario: Scenario = defaultScenario()) {
  const result = serializeRouteLink(baseUrl, building, scenario);
  if (!result.valid) throw new Error(result.message);
  return new URL(result.value);
}
function tinyBuilding(spec: { id: string; floor?: number; x?: number }[], links: [string, string, string, number, BuildingEdge['type']][]): Building {
  const known = <T>(value: T) => ({ status: 'checked' as const, value, source: 'Fictional test fixture, not surveyed', checkedOn: null });
  return {
    version: 1, fictional: true, surveyedOn: null, source: 'Fictional test fixture', floorHeightM: 5,
    floors: [0, 1, 2].map(id => ({ id, label: `Floor ${id}` })), closureGroups: [],
    nodes: spec.map((node, i) => ({ id: node.id, floor: node.floor ?? 0, x: node.x ?? i, z: 0, label: node.id, kind: 'junction', selectable: true })),
    edges: links.map(([id, from, to, lengthM, type]) => ({ id, from, to, lengthM, type,
      widthM: known(1.2), slopePercent: known(0), surface: known('smooth' as const), stepFree: known(true) })),
  };
}

describe('fictional model expansion and invariant routing', () => {
  it('preserves the original fixture content across platform line endings', () => {
    const bytes = readFileSync(new URL('../src/data/building.original.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('e47bd7d1def030c292df432011785c34ec1f57eb2b12616782d29113c9898e98');
    expect(original.nodes).toHaveLength(17);
    expect(original.edges).toHaveLength(22);
    expect(building.edges.slice(0, original.edges.length)).toEqual(original.edges);
  });
  it('keeps both models valid, fictional, unsurveyed, and all bilingual labels nonempty', () => {
    expect(validateBuilding(original).valid).toBe(true);
    expect(validateBuilding(building).valid).toBe(true);
    expect(building.fictional).toBe(true);
    expect(building.surveyedOn).toBeNull();
    for (const entity of [...building.nodes, ...building.floors, ...building.closureGroups]) expect(entity.labelKk?.trim()).toBeTruthy();
    for (const node of building.nodes.slice(original.nodes.length)) {
      expect(node.x).toBeGreaterThanOrEqual(1); expect(node.x).toBeLessThanOrEqual(31);
      expect(node.z).toBeGreaterThanOrEqual(1); expect(node.z).toBeLessThanOrEqual(22);
    }
  });
  it.each(['library', 'dean', 'canteen', 'medical', 'toilets', 'wardrobe'])('adds reachable selectable %s as a leaf, without creating bypasses', id => {
    const target = `room-${id}`;
    expect(building.nodes.find(node => node.id === target)).toMatchObject({ selectable: true, kind: 'room' });
    expect(building.edges.filter(edge => edge.from === target || edge.to === target)).toHaveLength(1);
    expect(findRoute(building, 'entrance', target, strict, []).status).toBe('ok');
  });
  it.each([['original', original], ['expanded', building]] as const)('retains all four safety invariants in %s fixture', (_, model) => {
    expect(findRoute(model, 'entrance', 'room-204', strict, [])).toMatchObject({ status: 'ok', distanceM: 40 });
    expect(findRoute(model, 'entrance', 'room-204', strict, aClosed)).toMatchObject({ status: 'ok', distanceM: 54 });
    expect(findRoute(model, 'entrance', 'room-204', strict, bothClosed).status).toBe('no-route');
    expect(findRoute(model, 'entrance', 'room-205', strict, []).status).toBe('no-route');
  });
  it('allows the unknown 205 door only explicitly and marks the uncertainty', () => {
    const result = findRoute(building, 'entrance', 'room-205', { ...strict, allowUnknown: true }, []);
    expect(result).toMatchObject({ status: 'ok', uncertainEdgeIds: ['door-205'] });
    expect(strict.allowUnknown).toBe(false);
  });
  it('never turns known failure into unknown permission', () => {
    const narrow = building.edges.find(edge => edge.id === 'narrow-204')!;
    expect(inspectEdge(narrow, { ...strict, allowUnknown: true }, new Set()).reasons).toContain('width');
    const stairs = building.edges.find(edge => edge.id === 'stairs-01')!;
    expect(inspectEdge(stairs, { ...strict, allowUnknown: true }, new Set()).reasons).toContain('stairs');
    const closed = inspectEdge(narrow, { ...strict, minWidthM: 0.5, allowUnknown: true }, new Set([narrow.id]));
    expect(closed.reasons).toContain('closed');
  });
  it('changes shortest distance only through explicit requirements, not penalties', () => {
    expect(findRoute(building, 'entrance', 'room-204', { ...strict, minWidthM: 0.7 }, [])).toMatchObject({ status: 'ok', distanceM: 27 });
    expect(defaultScenario().requirements).toEqual(strict);
  });
  it('does not mutate scenarios or graph inputs and validates optional translations', () => {
    const before = JSON.stringify(building);
    findRouteVariants(building, 'entrance', 'room-204', strict, []);
    expect(JSON.stringify(building)).toBe(before);
    const broken = copy(building); broken.nodes[0]!.labelKk = ' ';
    expect(validateBuilding(broken).valid).toBe(false);
  });
});

describe('meaningful alternatives', () => {
  it('shows direct lift B, not a longer lift A to floor 3 and back detour', () => {
    const variants = findRouteVariants(building, 'entrance', 'room-204', strict, []);
    expect(variants.primary).toEqual(findRoute(building, 'entrance', 'room-204', strict, []));
    expect(variants.alternatives).toHaveLength(1);
    expect(variants.alternatives[0]).toMatchObject({ distanceM: 54 });
    expect(variants.alternatives[0]!.edgeIds).toContain('lift-b-01');
    expect(variants.alternatives[0]!.edgeIds).not.toContain('lift-a-12');
  });
  it('does not suggest blocked or constraint-failing alternatives', () => {
    const variants = findRouteVariants(building, 'entrance', 'room-204', strict, aClosed);
    expect(variants.primary).toMatchObject({ status: 'ok', distanceM: 54 });
    for (const route of variants.alternatives) for (const id of route.edgeIds) {
      expect(inspectEdge(building.edges.find(edge => edge.id === id)!, strict, new Set(aClosed)).reasons).toEqual([]);
    }
    expect(findRouteVariants(building, 'entrance', 'room-204', strict, bothClosed).alternatives).toEqual([]);
    expect(findRouteVariants(building, 'entrance', 'room-205', strict, []).alternatives).toEqual([]);
  });
  it('retains necessary extra-floor travel instead of imposing a floor-range ban', () => {
    const result = findRouteVariants(building, 'entrance', 'room-204', strict, ['gallery-a-1', 'lift-b-01']);
    expect(result.primary).toMatchObject({ status: 'ok', distanceM: 70 });
    if (result.primary.status === 'ok') expect(result.primary.nodeIds).toContain('hall-2');
  });
  it('can retain an extra-floor alternative with a genuinely different vertical choice', () => {
    const graph = tinyBuilding([
      { id: 's', x: 0 }, { id: 'b0', x: 1 }, { id: 'b1', x: 1, floor: 1 }, { id: 't', x: 3, floor: 1 },
      { id: 'a0', x: 4 }, { id: 'a2', x: 4, floor: 2 }, { id: 'c2', x: 6, floor: 2 }, { id: 'c1', x: 6, floor: 1 },
    ], [
      ['sb', 's', 'b0', 2, 'corridor'], ['b', 'b0', 'b1', 3, 'lift'], ['bt', 'b1', 't', 2, 'corridor'],
      ['sa', 's', 'a0', 2, 'corridor'], ['a', 'a0', 'a2', 3, 'lift'], ['ac', 'a2', 'c2', 2, 'corridor'],
      ['c', 'c2', 'c1', 3, 'lift'], ['ct', 'c1', 't', 2, 'corridor'],
    ]);
    const variants = findRouteVariants(graph, 's', 't', strict, []);
    expect(variants.primary).toMatchObject({ distanceM: 7 });
    expect(variants.alternatives).toHaveLength(1);
    expect(variants.alternatives[0]).toMatchObject({ distanceM: 12 });
    expect(variants.alternatives[0]!.nodeIds).toContain('a2');
  });
  it('keeps at most two genuinely separate same-floor alternatives in distance order', () => {
    const graph = tinyBuilding(['s', 'a', 'b', 'c', 'd', 't'].map(id => ({ id })),
      ['a', 'b', 'c', 'd'].flatMap((id, i) => [[`s${id}`, 's', id, i + 1, 'corridor'], [`${id}t`, id, 't', i + 1, 'corridor']] as [string, string, string, number, BuildingEdge['type']][]));
    const variants = findRouteVariants(graph, 's', 't', strict, []);
    expect(variants.primary).toMatchObject({ distanceM: 2 });
    expect(variants.alternatives.map(route => route.distanceM)).toEqual([4, 6]);
  });
  it('suppresses a near-identical horizontal detour', () => {
    const graph = tinyBuilding(['s', 'j', 'k', 'x', 't'].map(id => ({ id })), [
      ['sj', 's', 'j', 40, 'corridor'], ['jk', 'j', 'k', 1, 'corridor'], ['kt', 'k', 't', 40, 'corridor'],
      ['jx', 'j', 'x', 2, 'corridor'], ['xk', 'x', 'k', 2, 'corridor'],
    ]);
    expect(findRouteVariants(graph, 's', 't', strict, []).alternatives).toEqual([]);
  });
  it('keeps a longer same-lift route when it reduces uncertainty', () => {
    const graph = tinyBuilding([{ id: 's' }, { id: 'a' }, { id: 'x' }, { id: 'l0', x: 4 }, { id: 't', x: 4, floor: 1 }], [
      ['sa', 's', 'a', 1, 'corridor'], ['al', 'a', 'l0', 1, 'corridor'],
      ['sx', 's', 'x', 2, 'corridor'], ['xl', 'x', 'l0', 2, 'corridor'], ['lift', 'l0', 't', 4, 'lift'],
    ]);
    graph.edges[0]!.widthM = { status: 'unknown', value: null, source: 'Unmeasured fictional attribute', checkedOn: null };
    const variants = findRouteVariants(graph, 's', 't', { ...strict, allowUnknown: true }, []);
    expect(variants.primary).toMatchObject({ distanceM: 6, uncertainEdgeIds: ['sa'] });
    expect(variants.alternatives).toHaveLength(1);
    expect(variants.alternatives[0]).toMatchObject({ distanceM: 8, uncertainEdgeIds: [] });
  });
  it('is deterministic, handles no travel, and keeps distances equal to actual edge sums', () => {
    const variants = findRouteVariants(building, 'entrance', 'room-301', strict, []);
    expect(findRouteVariants(building, 'entrance', 'room-301', strict, [])).toEqual(variants);
    const routes = variants.primary.status === 'ok' ? [variants.primary, ...variants.alternatives] : variants.alternatives;
    for (const route of routes) {
      expect(new Set(route.nodeIds).size).toBe(route.nodeIds.length);
      expect(route.distanceM).toBe(route.edgeIds.reduce((sum, id) => sum + building.edges.find(edge => edge.id === id)!.lengthM, 0));
    }
    expect(findRouteVariants(building, 'entrance', 'entrance', strict, [])).toMatchObject({ primary: { distanceM: 0 }, alternatives: [] });
  });
});

describe('validated route sharing without simulations', () => {
  it('round-trips every requirement, model and endpoint, but no local state', () => {
    const scenario = { ...defaultScenario(), start: 'hall-1', destination: 'room-library',
      requirements: { avoidStairs: false, minWidthM: 1.05, maxSlopePercent: 7.5, smoothOnly: false, allowUnknown: true },
      closedEdgeIds: [...bothClosed], floor: 2 };
    const url = urlFor(scenario);
    expect(url.searchParams.get('model')).toBe(SHARE_MODEL_ID);
    expect([...url.searchParams.keys()]).toHaveLength(8);
    expect(parseRouteLink(url, building)).toEqual({ status: 'ok', scenario: { ...scenario, closedEdgeIds: [], floor: 'all' } });
    expect(scenario.closedEdgeIds).toEqual(bothClosed);
  });
  it('explicitly strips preexisting queries, closure state, and fragments when sharing', () => {
    const serialized = serializeRouteLink(`${baseUrl}?closedEdgeIds=lift-a-01&simulation=true#private`, building, defaultScenario());
    expect(serialized.valid).toBe(true);
    if (serialized.valid) {
      expect(serialized.value).not.toMatch(/closedEdgeIds|simulation|private/);
      expect(new URL(serialized.value).pathname).toBe('/demo');
      expect(parseRouteLink(serialized.value, building).status).toBe('ok');
    }
  });
  it.each(['entrance', 'hall-1', 'room-library'])('supports fixed-start QR route for %s', start => {
    const result = parseRouteLink(urlFor({ ...defaultScenario(), start }), building);
    expect(result).toMatchObject({ status: 'ok', scenario: { start, closedEdgeIds: [] } });
  });
  it('leaves ordinary URLs alone and does not partially apply incomplete links', () => {
    expect(parseRouteLink(baseUrl, building)).toEqual({ status: 'none' });
    expect(parseRouteLink(`${baseUrl}?utm_source=demo`, building)).toEqual({ status: 'none' });
    expect(parseRouteLink(`${baseUrl}?start=entrance`, building).status).toBe('invalid');
    const url = urlFor(); url.searchParams.delete('allowUnknown');
    expect(parseRouteLink(url, building).status).toBe('invalid');
  });
  it.each([
    ['model', 'iter-live-campus'], ['model', ''], ['start', 'missing'], ['start', 'lift-a-0'], ['target', 'missing'],
    ['avoidStairs', 'true'], ['smoothOnly', '2'], ['allowUnknown', 'false'],
    ['minWidthM', '0.49'], ['minWidthM', '1.51'], ['minWidthM', 'NaN'], ['minWidthM', 'Infinity'],
    ['minWidthM', '0x1'], ['minWidthM', '1e'], ['minWidthM', ''], ['minWidthM', ' 1'], ['minWidthM', '+1'],
    ['maxSlopePercent', '1e+'], ['maxSlopePercent', '1e-7junk'], ['maxSlopePercent', '1e999'], ['maxSlopePercent', '-1'], ['maxSlopePercent', '20.01'], ['maxSlopePercent', 'Infinity'],
    ['closedEdgeIds', 'lift-a-01'], ['simulation', 'true'], ['floor', '2'], ['extra', '1'],
  ])('rejects invalid or unsupported %s=%s', (key, value) => {
    const url = urlFor(); url.searchParams.set(key, value);
    expect(parseRouteLink(url, building).status).toBe('invalid');
  });
  it.each(['model', 'start', 'target', 'avoidStairs', 'minWidthM', 'maxSlopePercent', 'smoothOnly', 'allowUnknown'])('rejects duplicate %s even when identical', key => {
    const url = urlFor(); url.searchParams.append(key, url.searchParams.get(key)!);
    expect(parseRouteLink(url, building).status).toBe('invalid');
  });
  it.each(['javascript:alert(1)', 'data:text/html,test', 'file:///C:/test', 'not a URL', 'https://name:password@iter.example'])('rejects unsafe or malformed base %s', base => {
    expect(serializeRouteLink(base, building, defaultScenario()).valid).toBe(false);
    expect(parseRouteLink(base, building).status).toBe('invalid');
  });
  it('rejects oversized URLs, bad endpoints, bad requirements, and invalid model objects', () => {
    expect(parseRouteLink(`${baseUrl}?${'a'.repeat(4096)}`, building).status).toBe('invalid');
    expect(serializeRouteLink(baseUrl, building, { ...defaultScenario(), start: 'lift-a-0' }).valid).toBe(false);
    expect(serializeRouteLink(baseUrl, building, { ...defaultScenario(), requirements: { ...strict, minWidthM: NaN } }).valid).toBe(false);
    const invalidBuilding = copy(building); invalidBuilding.nodes[0]!.x = Infinity;
    expect(serializeRouteLink(baseUrl, invalidBuilding, defaultScenario()).valid).toBe(false);
    expect(parseRouteLink(urlFor(), invalidBuilding).status).toBe('invalid');
  });
  it.each([1e-7, 1e-20, 1.2345678901234567e-100, Number.MIN_VALUE, -0])('round-trips tiny finite slope %s exactly', maxSlopePercent => {
    const requirements = { ...strict, maxSlopePercent };
    const parsed = parseRouteLink(urlFor({ ...defaultScenario(), requirements }), building);
    expect(parsed).toMatchObject({ status: 'ok', scenario: { requirements } });
    if (parsed.status === 'ok') expect(Object.is(parsed.scenario.requirements.maxSlopePercent, maxSlopePercent)).toBe(true);
  });
  it('accepts strict exponent notation without weakening numeric bounds', () => {
    const url = urlFor(); url.searchParams.set('minWidthM', '1e0'); url.searchParams.set('maxSlopePercent', '2E+1');
    expect(parseRouteLink(url, building)).toMatchObject({ status: 'ok', scenario: { requirements: { minWidthM: 1, maxSlopePercent: 20 } } });
  });
  it.each([{ ...strict, minWidthM: 0.5, maxSlopePercent: 0 }, { ...strict, minWidthM: 1.5, maxSlopePercent: 20 }])('accepts supported numeric bounds', (requirements: Requirements) => {
    expect(parseRouteLink(urlFor({ ...defaultScenario(), requirements }), building)).toMatchObject({ status: 'ok', scenario: { requirements } });
  });
});

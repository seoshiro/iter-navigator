import { expect, it } from 'vitest';
import fixture from '../data/building.json';
import type { Building } from './model';
import { defaultScenario, loadScenario, saveScenario, STORAGE_KEY } from './storage';

const building = fixture as Building;
it('round-trips a validated versioned scenario including closures and floor', () => {
  let value: string | null = null;
  const store = { getItem: (key: string) => { expect(key).toBe(STORAGE_KEY); return value; }, setItem: (key: string, text: string) => { expect(key).toBe(STORAGE_KEY); value = text; } };
  const scenario = { ...defaultScenario(), floor: 1, closedEdgeIds: ['lift-a-01', 'lift-a-12'] };
  expect(saveScenario(scenario, building, store)).toBe(true);
  expect(loadScenario(building, store)).toEqual({ scenario, restored: true, warning: false });
});
it('defaults entirely on malformed, incompatible, invalid, duplicate or missing data', () => {
  const s = defaultScenario();
  for (const raw of ['{', 'null', '[]', JSON.stringify({ version: 2, scenario: s }), JSON.stringify({ version: 1, scenario: s, unrelated: true }), JSON.stringify({ version: 1, scenario: { ...s, start: 'absent' } }),
    JSON.stringify({ version: 1, scenario: { ...s, floor: 99 } }), JSON.stringify({ version: 1, scenario: { ...s, closedEdgeIds: ['entry', 'entry'] } }),
    JSON.stringify({ version: 1, scenario: { ...s, requirements: { ...s.requirements, minWidthM: 0 } } })])
    expect(loadScenario(building, { getItem: () => raw, setItem: () => {} })).toEqual({ scenario: defaultScenario(), restored: false, warning: true });
  expect(loadScenario(building, { getItem: () => null, setItem: () => {} }).warning).toBe(false);
});
it('survives unavailable storage and rejects invalid writes', () => {
  const denied = { getItem: (): string | null => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  expect(loadScenario(building, denied).scenario).toEqual(defaultScenario());
  expect(saveScenario(defaultScenario(), building, denied)).toBe(false);
  expect(saveScenario({ ...defaultScenario(), destination: 'absent' }, building, denied)).toBe(false);
});
it('requires saved closure groups to be wholly open or closed and reports malformed partial groups', () => {
  for (const closedEdgeIds of [['lift-a-01'], ['lift-a-12'], ['lift-b-01', 'lift-a-01', 'lift-a-12']]) {
    const scenario = { ...defaultScenario(), closedEdgeIds };
    const store = { getItem: () => JSON.stringify({ version: 1, scenario }), setItem: () => {} };
    expect(loadScenario(building, store)).toEqual({ scenario: defaultScenario(), restored: false, warning: true });
    expect(saveScenario(scenario, building, store)).toBe(false);
  }
  const sparse = new Array<string>(1);
  expect(saveScenario({ ...defaultScenario(), closedEdgeIds: sparse }, building, { getItem: () => null, setItem: () => {} })).toBe(false);
  const full = { ...defaultScenario(), closedEdgeIds: ['lift-a-01', 'lift-a-12', 'east-1'] };
  expect(loadScenario(building, { getItem: () => JSON.stringify({ version: 1, scenario: full }), setItem: () => {} }).scenario).toEqual(full);
});

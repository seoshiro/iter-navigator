import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import fixture from '../data/building.json';
import type { Building } from '../domain/model';
import { findRoute } from '../domain/routing';
import { defaultScenario } from '../domain/storage';
import { FloorPlan } from './FloorPlan';

it('marks an opted-in unknown lift transition with a question and dashed class at both floor endpoints', () => {
  const building = structuredClone(fixture) as Building;
  building.edges.find(edge => edge.id === 'lift-a-01')!.widthM = { status: 'unknown', value: null, source: 'fictional unknown lift', checkedOn: null };
  const result = findRoute(building, 'entrance', 'room-204', { ...defaultScenario().requirements, allowUnknown: true }, []);
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error('Expected opted-in route');
  expect(result.uncertainEdgeIds).toEqual(['lift-a-01']);
  const markup = renderToStaticMarkup(createElement(FloorPlan, { building, result, floor: 'all', closedEdgeIds: [] }));
  const transitions = [...markup.matchAll(/<g data-edge-id="lift-a-01" data-route="true" class="transition active uncertain">([\s\S]*?)<\/g>/g)];
  expect(transitions).toHaveLength(2);
  for (const [, contents] of transitions) expect(contents).toMatch(/>\?<\/text>/);
  expect(transitions[0]?.[1]).toContain('Лифт A 1 → 2 эт.');
  expect(transitions[1]?.[1]).toContain('Лифт A 1 → 2 эт.');
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import fixture from '../data/building.json';
import type { Building } from '../domain/model';
import { findRoute } from '../domain/routing';
import { defaultScenario } from '../domain/storage';
import { createFloorArchitecture } from '../ui/architecture';
import { FloorPlan } from './FloorPlan';

it('marks an opted-in unknown lift transition at both floor endpoints without losing floor direction', () => {
  const building = structuredClone(fixture) as Building;
  building.edges.find(edge => edge.id === 'lift-a-01')!.widthM = { status: 'unknown', value: null, source: 'fictional unknown lift', checkedOn: null };
  const result = findRoute(building, 'entrance', 'room-204', { ...defaultScenario().requirements, allowUnknown: true }, []);
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error('Expected opted-in route');
  expect(result.uncertainEdgeIds).toEqual(['lift-a-01']);
  const markup = renderToStaticMarkup(createElement(FloorPlan, { building, result, floor: 'all', closedEdgeIds: [] }));
  const transitions = [...markup.matchAll(/<g data-edge-id="lift-a-01" data-route="true" class="transition active uncertain"[^>]*>([\s\S]*?)<\/g>/g)];
  expect(transitions).toHaveLength(2);
  for (const [, contents] of transitions) {
    expect(contents).toMatch(/>\?<\/text>/);
    expect(contents).toContain('Лифт A 1 → 2');
  }
});

it('uses shared room geometry and exposes selection independently of route highlights', () => {
  const building = fixture as Building;
  const result = findRoute(building, 'entrance', 'room-204', defaultScenario().requirements, []);
  const markup = renderToStaticMarkup(createElement(FloorPlan, { building, result, floor: 1, closedEdgeIds: [], selectedNodeId: 'room-library', onSelectNode: () => {} }));
  expect(markup).toContain('data-floor-id="1"');
  expect(markup).not.toContain('data-floor-id="0"');
  expect(markup.match(/data-room-id=/g)).toHaveLength(createFloorArchitecture(building, 1).rooms.length);
  expect(markup).toContain('class="plan-wall"');
  expect(markup).toContain('class="plan-door"');
  expect(markup).toMatch(/data-node-id="room-library"[^>]*role="button"[^>]*tabindex="0"[^>]*aria-pressed="true"/);
  expect(markup).toContain('Библиотека');
  if (result.status === 'ok') expect(markup).toContain(`data-route-ids="${result.edgeIds.join(',')}"`);
});

it('uses an explicit cross for closed transitions and preserves directed route arrows', () => {
  const building = fixture as Building;
  const result = findRoute(building, 'entrance', 'room-204', defaultScenario().requirements, ['lift-a-01']);
  const markup = renderToStaticMarkup(createElement(FloorPlan, { building, result, floor: 'all', closedEdgeIds: ['lift-a-01'] }));
  expect(markup).toMatch(/class="transition closed"[^>]*>[\s\S]*?>×<\/text>/);
  expect(markup).toContain('class="plan-direction ');
  expect(markup).toContain('data-direction-from=');
});

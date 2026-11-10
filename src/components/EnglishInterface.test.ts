import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../data/building.json';
import type { Building } from '../domain/model';
import { findRouteVariants } from '../domain/alternatives';
import { defaultScenario } from '../domain/storage';
import { LanguageProvider } from '../i18n/locale';
import { journalCopy } from '../reports/copy';
import { Brand } from './Brand';
import { FloorPlan } from './FloorPlan';
import { RoomSearch } from './RoomSearch';
import { RouteGuidance, RouteVariants } from './RouteGuidance';
import { RouteShare } from './RouteShare';

const building = fixture as Building;
const scenario = defaultScenario();
const variants = findRouteVariants(building, scenario.start, scenario.destination, scenario.requirements, []);
if (variants.primary.status !== 'ok') throw new Error('Expected a route in the demo fixture');
const result = variants.primary;
const noop = () => {};
const renderEnglish = (element: ReactElement) => renderToStaticMarkup(createElement(LanguageProvider, { children: element }));

beforeEach(() => vi.stubGlobal('window', { localStorage: { getItem: () => 'en' } }));
afterEach(() => vi.unstubAllGlobals());

describe('English navigator presentation layer', () => {
  it('translates the brand and its accessible name', () => {
    const html = renderEnglish(createElement(Brand));
    expect(html).toContain('DEMO NAVIGATOR');
    expect(html).toContain('back to top');
    expect(html).not.toMatch(/[А-Яа-яЁё]/u);
  });

  it('translates room labels, floor captions and 2D accessible descriptions without changing route IDs', () => {
    const html = renderEnglish(createElement(FloorPlan, { building, result, floor: 'all', closedEdgeIds: [], onSelectNode: noop }));
    expect(html).toContain('Library');
    expect(html).toContain('Floor 2');
    expect(html).toContain('scrollable floor plan');
    expect(html).toContain(`data-route-ids="${result.edgeIds.join(',')}"`);
    expect(html).not.toMatch(/[А-Яа-яЁё]/u);
  });

  it('translates route steps, units, evidence disclosures and source qualifications', () => {
    const html = renderEnglish(createElement(RouteGuidance, {
      building, result, selected: 1, onSelect: noop, onReadStep: noop, onStop: noop,
      speechStatus: 'ready', expandedStepIds: result.edgeIds, onToggleEvidence: noop,
    }));
    expect(html).toContain('Step 2 of');
    expect(html).toContain('Segment details');
    expect(html).toContain('no real survey was conducted');
    expect(html).toContain(' m ·');
    expect(html).not.toMatch(/[А-Яа-яЁё]/u);
  });

  it('translates route comparison while retaining the selected alternative', () => {
    const html = renderEnglish(createElement(RouteVariants, {
      building, routes: [result, ...variants.alternatives], selected: 1, expanded: true, onSelect: noop, onExpandedChange: noop,
    }));
    expect(html).toContain('Distance');
    expect(html).toContain('Selected');
    expect(html).toContain('data-variant-index="1"');
    expect(html).not.toMatch(/[А-Яа-яЁё]/u);
  });

  it('translates search and selected-room actions', () => {
    const html = renderEnglish(createElement(RoomSearch, { building, selected: 'room-library', onSelect: noop, onStart: noop, onDestination: noop }));
    expect(html).toContain('Find a room');
    expect(html).toContain('Library');
    expect(html).toContain('Floor 2 · demo location');
    expect(html).toContain('RU / KK / EN');
    expect(html).not.toMatch(/[А-Яа-яЁё]/u);
  });

  it('translates share/QR labels and preserves the fictional-building and no-tracking disclosures', () => {
    const html = renderEnglish(createElement(RouteShare, { building, scenario }));
    expect(html).toContain('Copy route link');
    expect(html).toContain('Show three QR starting points');
    expect(html).toContain('does not track your location');
    expect(html).toContain('fictional building');
    expect(html).not.toMatch(/[А-Яа-яЁё]/u);
  });

  it('covers every journal state in English without changing recovery semantics', () => {
    expect(Object.keys(journalCopy.en).sort()).toEqual(Object.keys(journalCopy.ru).sort());
    expect(Object.keys(journalCopy.en).sort()).toEqual(Object.keys(journalCopy.kk).sort());
    for (const text of Object.values(journalCopy.en)) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/[А-Яа-яЁё]/u);
    }
    expect(journalCopy.en.abandonConfirm).toContain('may already have been saved');
    expect(journalCopy.en.pendingRestored).toContain('without creating a duplicate');
    expect(journalCopy.en.online).toContain('Nothing has been sent automatically');
  });
});

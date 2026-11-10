import { describe, expect, it } from 'vitest';
import { getLocaleStrings, loadLocale, localeLanguage, localeTitle, LOCALE_STORAGE_KEY } from './locale';
import { nodeLabelsEn, passageLabelsEn } from './en';
import fixture from '../data/building.json';
import { validateBuilding } from '../domain/validation';
import { findRoute } from '../domain/routing';
import { diagnoseRoute } from '../ui/route-diagnosis';
import { defaultScenario } from '../domain/storage';
import type { RouteResult, Scenario } from '../domain/model';
import { REPORT_ERRORS, REPORT_KINDS, REPORT_STATUSES } from '../../shared/report-contract';

function shape(value: unknown): unknown {
  if (typeof value === 'function') return 'function';
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]));
  return typeof value;
}
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
}
const validated = validateBuilding(fixture);
if (!validated.valid) throw new Error(validated.message);
const building = validated.value;
const english = getLocaleStrings('en');
const cyrillic = /\p{Script=Cyrillic}/u;

describe('complete English localization', () => {
  it('matches the entire Russian and Kazakh dictionary contracts without untranslated static text', () => {
    expect(shape(english)).toEqual(shape(getLocaleStrings('ru')));
    expect(shape(english)).toEqual(shape(getLocaleStrings('kk')));
    for (const text of strings(english)) { expect(text.length).toBeGreaterThan(0); expect(text).not.toMatch(cyrillic); }
    expect(Object.keys(english.reportErrorRu).sort()).toEqual(Object.keys(REPORT_ERRORS).sort());
    expect(Object.keys(english.reportKindRu).sort()).toEqual([...REPORT_KINDS].sort());
    expect(Object.keys(english.reportStatusRu).sort()).toEqual([...REPORT_STATUSES].sort());
  });
  it('restores persisted English using the existing language key and gives English document metadata', () => {
    const requested: string[] = [];
    expect(loadLocale({ getItem: key => { requested.push(key); return 'en'; } })).toEqual({ locale: 'en', storageWarning: false });
    expect(requested).toEqual([LOCALE_STORAGE_KEY]);
    expect(localeLanguage('en')).toBe('en-US');
    expect(localeTitle('en')).toBe('Iter — Accessible route navigator');
  });
  it('keeps presentation storage independent and restricts its supported locales without rewriting navigator English', () => {
    const saved = new Map([[LOCALE_STORAGE_KEY, 'en'], ['iter-presentation-language-v1', 'kk']]);
    const storage = { getItem: (key: string) => saved.get(key) ?? null };
    expect(loadLocale(storage, 'iter-presentation-language-v1', ['ru', 'kk'])).toEqual({ locale: 'kk', storageWarning: false });
    saved.set('iter-presentation-language-v1', 'en');
    expect(loadLocale(storage, 'iter-presentation-language-v1', ['ru', 'kk'])).toEqual({ locale: 'ru', storageWarning: false });
    expect(loadLocale(storage)).toEqual({ locale: 'en', storageWarning: false });
    expect(saved.get(LOCALE_STORAGE_KEY)).toBe('en');
  });
  it('covers every node, passage and closure by stable IDs without mutating the graph', () => {
    const before = JSON.stringify(fixture);
    expect(Object.keys(nodeLabelsEn).sort()).toEqual(fixture.nodes.map(node => node.id).sort());
    expect(Object.keys(passageLabelsEn).sort()).toEqual(fixture.edges.map(edge => edge.id).sort());
    for (const node of fixture.nodes) {
      const label = english.nodeLabelRu(node.id, node.label, node.labelKk);
      expect(label).toBe(nodeLabelsEn[node.id]); expect(label).not.toMatch(cyrillic);
    }
    for (const edge of fixture.edges) {
      const label = english.passageLabelRu(edge.id, 'Исходное название');
      expect(label).not.toMatch(/undefined|\p{Script=Cyrillic}/u);
      expect(label.length).toBeGreaterThan(5);
    }
    for (const group of fixture.closureGroups) expect(english.closureGroupLabel(group.id, group.label, group.labelKk)).not.toMatch(cyrillic);
    expect(english.nodeLabelRu('room-205', '')).toBe('Classroom 205 · width and surface unknown');
    expect(english.passageLabelRu('door-205', '')).toBe('Door to classroom 205 · width and surface unknown');
    expect(english.nodeLabelRu('missing', 'Неизвестно')).toBe('Unknown location');
    expect(english.passageLabelRu('missing', 'Неизвестно')).toBe('Unspecified passage');
    expect(JSON.stringify(fixture)).toBe(before);
  });
  it('supports English room synonyms as well as existing Russian and Kazakh searches in every locale', () => {
    const cases = [['room-toilets', 'restroom', 'toilet', 'bathroom'], ['room-medical', 'medical', 'first aid', 'nurse'],
      ['room-wardrobe', 'cloakroom', 'wardrobe', 'coat check'], ['room-canteen', 'cafeteria', 'canteen', 'dining'],
      ['room-library', 'library', 'books'], ['room-dean', 'dean', 'office'], ['room-204', 'room', 'classroom', '204'],
      ['room-301', 'reading', 'study', '301'], ['lift-a-0', 'lift', 'elevator']];
    for (const locale of ['ru', 'kk', 'en'] as const) for (const [id, ...synonyms] of cases) {
      const node = fixture.nodes.find(item => item.id === id)!;
      const text = getLocaleStrings(locale).nodeSearchText(node.id, node.label, node.labelKk).toLowerCase();
      for (const synonym of synonyms) expect(text).toContain(synonym);
      expect(text).toContain(node.label.toLowerCase()); expect(text).toContain(node.labelKk.toLowerCase());
    }
  });
  it('uses English numbers, plurals, floors and accessible action feedback', () => {
    expect(english.numberRu(1.25)).toBe('1.25');
    expect(english.countRu(1, ['участок', 'участка', 'участков'])).toBe('1 section');
    expect(english.countRu(3, ['участок', 'участка', 'участков'])).toBe('3 sections');
    expect(english.countRu(2, ['неподтверждённый участок', 'неподтверждённых участка', 'неподтверждённых участков'])).toBe('2 unconfirmed sections');
    expect(english.ru.route.floors([0, 2, 1])).toBe('Route floors: 1 → 3 → 2');
    expect(english.ru.route.stepFree(null)).toContain('not specified');
    expect(english.guidanceRu.closure('Elevator A', false)).toBe('Elevator A: closed in the simulation.');
    expect(english.speechRu.unavailable).toContain('Russian and Kazakh voices will not be used');
  });
});

describe('English route directions and safety messages', () => {
  function route(scenario: Scenario) {
    const result = findRoute(building, scenario.start, scenario.destination, scenario.requirements, scenario.closedEdgeIds);
    const diagnosis = diagnoseRoute(building, scenario, result);
    return { result, diagnosis, text: english.routeSpeechRu(building, result, diagnosis).join(' ') };
  }
  it('follows the same ordered route with English labels, distance units and floor transitions', () => {
    const { result, diagnosis, text } = route(defaultScenario());
    expect(result.status).toBe('ok');
    expect(text).toContain('40 meters'); expect(text).toContain('Main entrance'); expect(text).toContain('Classroom 204');
    expect(text).toContain('From floor 1 to floor 2'); expect(text).not.toMatch(cyrillic);
    expect(text).toContain('does not confirm the accessibility or safety of a real building');
    expect(english.routeOutcomeRu(result, diagnosis)).not.toMatch(cyrillic);
    if (result.status === 'ok') {
      result.edgeIds.forEach((_, index) => expect(text).toContain(english.stepTextRu(building, result, index)));
      expect(english.routeSpeechRu(building, result, diagnosis).filter(line => line.startsWith('Step '))).toHaveLength(result.edgeIds.length);
    }
  });
  it('translates every passage type without changing passage direction or identity', () => {
    for (const edge of building.edges) {
      const result: Extract<RouteResult, { status: 'ok' }> = { status: 'ok', nodeIds: [edge.to, edge.from], edgeIds: [edge.id], distanceM: edge.lengthM, uncertainEdgeIds: [] };
      const step = english.stepTextRu(building, result, 0);
      expect(step).toContain(`${nodeLabelsEn[edge.to]} to ${nodeLabelsEn[edge.from]}`);
      expect(step).toContain(english.edgeNames[edge.type]); expect(step).not.toMatch(cyrillic);
    }
  });
  it('explains missing data without reading diagnostic paths as navigable directions', () => {
    const { result, text } = route({ ...defaultScenario(), destination: 'room-205' });
    expect(result.status).toBe('no-route'); expect(text).toContain('Not enough data');
    expect(text).toContain('width unknown'); expect(text).toContain('surface unknown');
    expect(text).not.toContain('Step 1'); expect(text).not.toMatch(cyrillic);
  });
  it('marks uncertain forward and reverse routes and gives warnings before directions', () => {
    for (const [start, destination] of [['entrance', 'room-205'], ['room-205', 'entrance']]) {
      const scenario = { ...defaultScenario(), start: start!, destination: destination!, requirements: { ...defaultScenario().requirements, allowUnknown: true } };
      const { result, diagnosis, text } = route(scenario);
      expect(result.status).toBe('ok'); expect(diagnosis.kind).toBe('uncertain');
      expect(text).toContain(english.ru.room205Label); expect(text).not.toMatch(cyrillic);
      expect(text.indexOf('Unconfirmed step')).toBeLessThan(text.indexOf('Step 1'));
      expect(text).toContain('46 meters');
    }
  });
  it('handles closed routes, same-point routes and invalid data entirely in English', () => {
    const closed = route({ ...defaultScenario(), closedEdgeIds: building.closureGroups.filter(group => group.id.startsWith('lift-')).flatMap(group => group.edgeIds) });
    expect(closed.result.status).toBe('no-route'); expect(closed.text).not.toMatch(cyrillic); expect(closed.text).not.toContain('Step 1');
    const zero = route({ ...defaultScenario(), start: 'room-205', destination: 'room-205' });
    expect(zero.text).toContain('same location'); expect(zero.text).toContain('zero meters'); expect(zero.text).not.toMatch(cyrillic);
    const invalid: RouteResult = { status: 'invalid', message: 'Служебное сообщение <raw-id>' };
    const diagnosis = diagnoseRoute(building, defaultScenario(), invalid);
    expect(english.routeSpeechRu(building, invalid, diagnosis)).toEqual(['Invalid data', 'Choose locations and valid requirements in the form.']);
  });
});

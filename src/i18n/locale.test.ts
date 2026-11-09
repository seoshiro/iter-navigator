import { describe, expect, it } from 'vitest';
import { getLocaleStrings, loadLocale, localeLanguage, LOCALE_STORAGE_KEY } from './locale';
import fixture from '../data/building.json';
import { validateBuilding } from '../domain/validation';
import { findRoute } from '../domain/routing';
import { diagnoseRoute } from '../ui/route-diagnosis';
import { defaultScenario } from '../domain/storage';
function shape(value: unknown): unknown {
  if (typeof value === 'function') return 'function';
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]));
  return typeof value;
}
describe('Russian and Kazakh localization', () => {
  it('keeps complete matching dictionary contracts', () => {
    expect(shape(getLocaleStrings('kk'))).toEqual(shape(getLocaleStrings('ru')));
    expect(localeLanguage('ru')).toBe('ru-RU'); expect(localeLanguage('kk')).toBe('kk-KZ');
  });
  it('restores only supported persisted languages and handles denied or damaged storage', () => {
    expect(loadLocale({ getItem: key => key === LOCALE_STORAGE_KEY ? 'kk' : null })).toEqual({ locale: 'kk', storageWarning: false });
    expect(loadLocale({ getItem: () => null })).toEqual({ locale: 'ru', storageWarning: false });
    expect(loadLocale({ getItem: () => 'fr' })).toEqual({ locale: 'ru', storageWarning: true });
    expect(loadLocale({ getItem: () => { throw new Error('denied'); } })).toEqual({ locale: 'ru', storageWarning: true });
  });
  it('uses consistent Kazakh labels for nodes and journal passages without changing IDs', () => {
    const strings = getLocaleStrings('kk'); const before = JSON.stringify(fixture);
    for (const node of fixture.nodes) expect(strings.nodeLabelRu(node.id, node.label)).toBe(node.id === 'room-205' ? strings.ru.room205Label : node.labelKk);
    const edge = fixture.edges.find(item => item.to === 'room-toilets')!;
    expect(strings.passageLabelRu(edge.id, 'Санузел')).toContain('Дәретхана');
    expect(strings.passageLabelRu('door-205', 'ignored')).toContain('ені мен жабыны белгісіз');
    expect(JSON.stringify(fixture)).toBe(before);
  });
  it('generates Kazakh directions and explicit unavailable-voice feedback for the same route', () => {
    const validated = validateBuilding(fixture); if (!validated.valid) throw new Error(validated.message);
    const scenario = defaultScenario();
    const result = findRoute(validated.value, scenario.start, scenario.destination, scenario.requirements, scenario.closedEdgeIds);
    expect(result.status).toBe('ok'); if (result.status !== 'ok') return;
    const strings = getLocaleStrings('kk');
    const text = strings.routeSpeechRu(validated.value, result, diagnoseRoute(validated.value, scenario, result)).join(' ');
    expect(text).toContain('қадам'); expect(text).toContain('204-аудитория');
    expect(text).not.toMatch(/Шаг|Пройдите|Главный вход|этаж|Аудитория/);
    expect(strings.speechRu.unavailable).toContain('Орысша дауыс қолданылмайды');
    expect(strings.countRu(3, ['участок', 'участка', 'участков'])).toBe('3 бөлік');
  });
});
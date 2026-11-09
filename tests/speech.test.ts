import { describe, expect, it, vi } from 'vitest';
import { SpeechController } from '../src/ui/speech';
import type { LocalVoice, SpeechPhrase, SpeechPort } from '../src/ui/speech';
import { defaultSpeechPreferences, loadSpeechPreferences, saveSpeechPreferences, SPEECH_PREFERENCES_KEY } from '../src/ui/speech-preferences';
import fixture from '../src/data/building.json';
import type { Building } from '../src/domain/model';
import { defaultScenario } from '../src/domain/storage';
import { findRoute } from '../src/domain/routing';
import { diagnoseRoute } from '../src/ui/route-diagnosis';
import { routeSpeechRu, stepTextRu } from '../src/i18n/guidance-ru';
import { ru } from '../src/i18n/ru';

const local: LocalVoice = { voiceURI: 'local-ru', name: 'Russian', lang: 'ru-RU', localService: true };
function mock() {
  let voices: LocalVoice[] = []; let changed = () => {}; let cancellations = 0;
  const spoken: SpeechPhrase[] = [];
  const port: SpeechPort = { getVoices: () => voices, cancel: () => { cancellations++; }, speak: phrase => spoken.push(phrase), makePhrase: text => ({ text, lang: '', rate: 1, voice: null, onend: null, onerror: null }), addEventListener: (_, listener) => { changed = listener; }, removeEventListener: () => { changed = () => {}; } };
  const controller = new SpeechController(port, defaultSpeechPreferences());
  const disconnect = controller.connect();
  return { controller, spoken, port, disconnect, voices: (value: LocalVoice[]) => { voices = value; changed(); }, cancelled: () => cancellations };
}
describe('voluntary local speech lifecycle', () => {
  it('ends initial loading within five seconds, accepts late voices silently and never re-enters loading', () => {
    vi.useFakeTimers();
    const m = mock();
    try {
      vi.advanceTimersByTime(4999); expect(m.controller.getSnapshot().status).toBe('loading');
      vi.advanceTimersByTime(1); expect(m.controller.getSnapshot().status).toBe('unavailable');
      m.voices([]); expect(m.controller.getSnapshot().status).toBe('unavailable');
      m.voices([local]); expect(m.controller.getSnapshot().status).toBe('ready'); expect(m.spoken).toEqual([]);
      m.voices([]); expect(m.controller.getSnapshot().status).toBe('unavailable');
    } finally { m.disconnect(); vi.useRealTimers(); }
  });
  it('voice deadline preserves speaking/errors and cleanup cancels the timer', () => {
    vi.useFakeTimers();
    const speaking = mock(); const error = mock(); const detached = mock();
    try {
      speaking.voices([local]); speaking.controller.setEnabled(true); speaking.controller.read(['active', 'queued']);
      error.voices([local]); error.controller.setEnabled(true); error.controller.read(['error']); error.spoken[0]!.onerror!();
      detached.disconnect(); const detachedState = detached.controller.getSnapshot();
      vi.advanceTimersByTime(5000);
      expect(speaking.controller.getSnapshot().status).toBe('speaking'); expect(speaking.spoken).toHaveLength(1);
      expect(error.controller.getSnapshot().status).toBe('error'); error.voices([local]); expect(error.controller.getSnapshot().status).toBe('error');
      expect(detached.controller.getSnapshot()).toBe(detachedState); expect(vi.getTimerCount()).toBe(0);
    } finally { speaking.disconnect(); error.disconnect(); vi.useRealTimers(); }
  });
  it('loads silently, filters by Russian language and local service, and never queues delayed voices', () => {
    const m = mock(); expect(m.spoken).toEqual([]); expect(m.controller.getSnapshot().enabled).toBe(false); expect(m.controller.getSnapshot().status).toBe('loading');
    m.voices([{ ...local, localService: false }, { ...local, lang: 'en-US' }]);
    m.controller.setEnabled(true); m.controller.read(['not available']); expect(m.spoken).toEqual([]); expect(m.controller.getSnapshot().status).toBe('unavailable');
    m.voices([local]); expect(m.spoken).toEqual([]); m.controller.read(['first', 'second']);
    expect(m.spoken.map(phrase => phrase.text)).toEqual(['first']); expect(m.spoken[0]!.voice).toEqual(local);
    m.spoken[0]!.onend!(); expect(m.spoken.map(phrase => phrase.text)).toEqual(['first', 'second']); m.spoken[0]!.onend!(); m.spoken[0]!.onerror!(); expect(m.spoken).toHaveLength(2); expect(m.controller.getSnapshot().status).toBe('speaking'); m.spoken[1]!.onend!(); m.spoken[1]!.onerror!(); expect(m.controller.getSnapshot().status).toBe('ready');
  });
  it('generation cancellation defeats old end/error callbacks after rapid reads, stop, disable and unmount', () => {
    const m = mock(); m.voices([local]); m.controller.setEnabled(true); m.controller.read(['old', 'stale']);
    const old = m.spoken[0]!; m.controller.read(['new', 'current']); old.onend!(); old.onerror!();
    expect(m.spoken.map(phrase => phrase.text)).toEqual(['old', 'new']); expect(m.controller.getSnapshot().status).toBe('speaking');
    const current = m.spoken[1]!; m.controller.stop(); current.onend!(); expect(m.spoken).toHaveLength(2);
    m.voices([local]); expect(m.spoken).toHaveLength(2);
    m.controller.read(['disable', 'never']); const disable = m.spoken.at(-1)!; m.controller.setEnabled(false); disable.onend!(); expect(m.spoken).toHaveLength(3);
    m.controller.setEnabled(true); m.controller.read(['unmount', 'never']); const unmount = m.spoken.at(-1)!; m.disconnect(); unmount.onend!(); expect(m.spoken).toHaveLength(4); expect(m.cancelled()).toBeGreaterThan(4);
  });
  it('reports unsupported and native errors without continuing and uses independent voice/rate preferences', () => {
    const unsupported = new SpeechController(null, defaultSpeechPreferences()); unsupported.setEnabled(true); unsupported.read(['text']); expect(unsupported.getSnapshot().status).toBe('unsupported');
    const m = mock(); const second = { ...local, voiceURI: 'second', name: 'Second' }; m.voices([local, second]); m.controller.setEnabled(true); m.controller.setPreferences({ rate: 1.3, voiceURI: 'second' }); m.controller.read(['chosen', 'never']);
    expect(m.spoken[0]).toMatchObject({ voice: second, rate: 1.3, lang: 'ru-RU' }); m.spoken[0]!.onerror!(); m.spoken[0]!.onend!(); expect(m.spoken).toHaveLength(1); expect(m.controller.getSnapshot().status).toBe('error');
    const broken = new SpeechController({ ...m.port, getVoices: () => { throw new Error('native failure'); } }, defaultSpeechPreferences()); expect(() => broken.connect()).not.toThrow(); expect(broken.getSnapshot().status).toBe('error');
  });
});
it('separate preference storage validates corrupt/denied values and never stores enabled state', () => {
  const values = new Map([['navigator-display-v1', 'original display bytes']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  expect(saveSpeechPreferences({ rate: .7, voiceURI: 'local' }, storage)).toBe(true); expect(values.get('navigator-display-v1')).toBe('original display bytes');
  expect(values.get(SPEECH_PREFERENCES_KEY)).not.toContain('enabled'); expect(loadSpeechPreferences(storage)).toEqual({ preferences: { rate: .7, voiceURI: 'local' }, warning: false });
  for (const value of ['{', JSON.stringify({ version: 1, preferences: { rate: 0, voiceURI: '' } }), JSON.stringify({ version: 1, preferences: { rate: 1, voiceURI: '', enabled: true } })]) { values.set(SPEECH_PREFERENCES_KEY, value); expect(loadSpeechPreferences(storage).warning).toBe(true); }
  const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } }; expect(loadSpeechPreferences(denied).warning).toBe(true); expect(saveSpeechPreferences(defaultSpeechPreferences(), denied)).toBe(false);
});
it('narration follows actual ordered names/units and warnings without exposing diagnostic paths as usable', () => {
  const building = fixture as Building; const scenario = defaultScenario();
  const route = findRoute(building, scenario.start, scenario.destination, scenario.requirements, []);
  const phrases = routeSpeechRu(building, route, diagnoseRoute(building, scenario, route));
  expect(phrases.join(' ')).toContain('40 метров'); expect(phrases.join(' ')).toContain('Главный вход'); expect(phrases.join(' ')).not.toContain('lift-a-01');
  if (route.status === 'ok') expect(stepTextRu(building, route, 2)).toContain('с 1 на 2 этаж');
  const strict = { ...scenario, destination: 'room-205' }; const blocked = findRoute(building, strict.start, strict.destination, strict.requirements, []);
  const denied = routeSpeechRu(building, blocked, diagnoseRoute(building, strict, blocked)).join(' '); expect(denied).toContain('неизвестная ширина'); expect(denied).not.toContain('Шаг 1');
  const opted = { ...strict, requirements: { ...strict.requirements, allowUnknown: true } }; const uncertain = findRoute(building, opted.start, opted.destination, opted.requirements, []);
  const reading = routeSpeechRu(building, uncertain, diagnoseRoute(building, opted, uncertain)); expect(reading.join(' ')).toContain('46 метров'); expect(reading.join(' ')).toContain('Неподтверждённый шаг 5'); expect(reading.findIndex(text => text.startsWith('Неподтверждённый'))).toBeLessThan(reading.findIndex(text => text.startsWith('Шаг 1')));
  const zero = findRoute(building, 'entrance', 'entrance', scenario.requirements, []); expect(routeSpeechRu(building, zero, diagnoseRoute(building, scenario, zero))[0]).toContain('одна выбранная точка');
  expect(routeSpeechRu(building, { status: 'invalid', message: 'raw-id <draft>' }, { kind: 'invalid', details: [], floors: [], stepFree: null, connected: false }).join(' ')).not.toContain('raw-id');
});
it('narration uses the factual room205 label in exclusions, forward/reverse steps and same-point results', () => {
  const building = fixture as Building;
  for (const [start, destination, allowUnknown] of [['entrance', 'room-205', false], ['entrance', 'room-205', true], ['room-205', 'entrance', true], ['room-205', 'room-205', false]] as const) {
    const scenario = { ...defaultScenario(), start, destination, requirements: { ...defaultScenario().requirements, allowUnknown } };
    const result = findRoute(building, start, destination, scenario.requirements, []);
    const phrases = routeSpeechRu(building, result, diagnoseRoute(building, scenario, result));
    expect(phrases.join(' ')).toContain(ru.room205Label);
    expect(phrases.join(' ')).not.toContain('Аудитория 205 · неизвестная дверь');
    if (result.status === 'ok' && result.edgeIds.length) {
      const doorIndex = result.edgeIds.indexOf('door-205');
      expect(stepTextRu(building, result, doorIndex)).toContain(ru.room205Label);
    }
  }
});

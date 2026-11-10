import { describe, expect, it, vi } from 'vitest';
import { SpeechController, matchesLocalLanguage } from './speech';
import type { LocalVoice, SpeechPhrase, SpeechPort } from './speech';
import { defaultSpeechPreferences, loadSpeechPreferences, saveSpeechPreferences, SPEECH_PREFERENCES_KEY } from './speech-preferences';

const english: LocalVoice = { voiceURI: 'en-local', name: 'Local English', lang: 'en-US', localService: true };
const british: LocalVoice = { ...english, voiceURI: 'en-gb-local', name: 'Local British English', lang: 'en-GB' };
const russian: LocalVoice = { ...english, voiceURI: 'ru-local', name: 'Local Russian', lang: 'ru-RU' };
const kazakh: LocalVoice = { ...english, voiceURI: 'kk-local', name: 'Local Kazakh', lang: 'kk-KZ' };
function harness(voices: LocalVoice[]) {
  const state = { voices, said: [] as SpeechPhrase[], cancellations: 0 };
  const port: SpeechPort = {
    getVoices: () => state.voices, cancel: () => { state.cancellations++; }, speak: phrase => { state.said.push(phrase); },
    makePhrase: text => ({ text, lang: '', rate: 1, voice: null, onend: null, onerror: null }),
    addEventListener: () => {}, removeEventListener: () => {},
  };
  return { state, port };
}

describe('English speech uses only local English voices', () => {
  it('accepts English dialects and rejects remote, Russian, Kazakh and falsely prefixed voices', () => {
    for (const lang of ['en-US', 'en_GB', 'EN-AU', 'en']) expect(matchesLocalLanguage({ ...english, lang }, 'en')).toBe(true);
    for (const voice of [russian, kazakh, { ...english, localService: false }, { ...english, lang: 'eng-US' }, { ...english, lang: 'english' }]) {
      expect(matchesLocalLanguage(voice, 'en')).toBe(false);
    }
  });
  it('never substitutes another language or a remote voice, including a saved foreign voice', () => {
    const { state, port } = harness([russian, kazakh, { ...english, localService: false }]);
    const controller = new SpeechController(port, { rate: 1.2, voiceURI: russian.voiceURI }, 'en');
    const disconnect = controller.connect();
    try {
      controller.setEnabled(true); controller.read(['Main entrance']);
      expect(controller.getSnapshot().status).toBe('unavailable'); expect(controller.getSnapshot().voices).toEqual([]); expect(state.said).toHaveLength(0);
      state.voices.push(english); controller.refreshVoices();
      expect(state.said).toHaveLength(0);
      controller.read(['Main entrance']);
      expect(state.said).toHaveLength(1); expect(state.said[0]).toMatchObject({ voice: english, lang: 'en-US', rate: 1.2 });
    } finally { disconnect(); }
  });
  it('does not auto-read on setup or enable, and applies the selected local English voice to every en-US utterance', () => {
    const { state, port } = harness([russian, english, kazakh, british]);
    const controller = new SpeechController(port, { rate: .9, voiceURI: british.voiceURI }, 'en');
    const disconnect = controller.connect();
    try {
      expect(controller.getSnapshot().voices).toEqual([english, british]);
      controller.setEnabled(true); expect(state.said).toEqual([]);
      controller.read(['First step', 'Second step']); expect(state.said).toHaveLength(1);
      state.said[0]!.onend!(); expect(state.said).toHaveLength(2);
      for (const phrase of state.said) expect(phrase).toMatchObject({ voice: british, lang: 'en-US', rate: .9 });
      state.said[1]!.onend!(); expect(controller.getSnapshot().status).toBe('ready');
    } finally { disconnect(); }
  });
  it('cancels each old queue on RU → EN → KK → EN changes and rejects stale end/error callbacks', () => {
    const { state, port } = harness([russian, english, kazakh]);
    const controller = new SpeechController(port, defaultSpeechPreferences(), 'ru');
    const disconnect = controller.connect();
    try {
      controller.setEnabled(true); controller.read(['Первый шаг', 'Не читать']);
      const oldRussian = state.said[0]!; const cancellations = state.cancellations;
      controller.setLocale('en'); expect(state.cancellations).toBeGreaterThan(cancellations);
      oldRussian.onend!(); oldRussian.onerror!(); expect(state.said).toHaveLength(1);
      expect(controller.getSnapshot().status).toBe('ready');
      controller.read(['First step', 'Do not read']); const oldEnglish = state.said[1]!;
      expect(oldEnglish).toMatchObject({ lang: 'en-US', voice: english });
      controller.setLocale('kk'); oldEnglish.onend!(); oldEnglish.onerror!();
      expect(state.said).toHaveLength(2); expect(controller.getSnapshot().voices).toEqual([kazakh]);
      controller.read(['Бірінші қадам', 'Оқуға болмайды']); const oldKazakh = state.said[2]!;
      controller.setLocale('en'); oldKazakh.onend!(); oldKazakh.onerror!();
      expect(state.said).toHaveLength(3); expect(controller.getSnapshot().voices).toEqual([english]);
      controller.read(['Current route']); expect(state.said[3]).toMatchObject({ lang: 'en-US', voice: english });
    } finally { disconnect(); }
  });
  it('stops immediately if English is unavailable after a language switch', () => {
    const { state, port } = harness([russian, kazakh]);
    const controller = new SpeechController(port, defaultSpeechPreferences(), 'ru');
    const disconnect = controller.connect();
    try {
      controller.setEnabled(true); controller.read(['Первый', 'Второй']); const stale = state.said[0]!;
      controller.setLocale('en'); stale.onend!(); controller.read(['First']);
      expect(state.said).toHaveLength(1); expect(controller.getSnapshot().status).toBe('unavailable');
    } finally { disconnect(); }
  });
  it('ends English voice loading and accepts late local voices without queuing earlier requests', () => {
    vi.useFakeTimers();
    const { state, port } = harness([]); const controller = new SpeechController(port, defaultSpeechPreferences(), 'en');
    const disconnect = controller.connect();
    try {
      expect(controller.getSnapshot().status).toBe('loading');
      vi.advanceTimersByTime(5000); expect(controller.getSnapshot().status).toBe('unavailable');
      controller.setEnabled(true); controller.read(['Do not queue']);
      state.voices.push(english); controller.refreshVoices();
      expect(controller.getSnapshot().status).toBe('ready'); expect(state.said).toEqual([]);
    } finally { disconnect(); vi.useRealTimers(); }
  });
});

describe('English voice preference isolation', () => {
  it('persists English rate and voice independently of Russian, Kazakh, display and scenario settings', () => {
    const values = new Map([['navigator-scenario-v1', 'scenario bytes'], ['navigator-display-v1', 'display bytes']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const preferences = { ru: { rate: 1.2, voiceURI: russian.voiceURI }, kk: { rate: .9, voiceURI: kazakh.voiceURI }, en: { rate: 1.1, voiceURI: british.voiceURI } };
    for (const locale of ['ru', 'kk', 'en'] as const) expect(saveSpeechPreferences(preferences[locale], storage, locale)).toBe(true);
    for (const locale of ['ru', 'kk', 'en'] as const) expect(loadSpeechPreferences(storage, locale)).toEqual({ preferences: preferences[locale], warning: false });
    expect(JSON.parse(values.get(`${SPEECH_PREFERENCES_KEY}-en`)!)).toEqual({ version: 1, preferences: preferences.en });
    expect(values.get(`${SPEECH_PREFERENCES_KEY}-en`)).not.toContain('enabled');
    expect(values.get('navigator-scenario-v1')).toBe('scenario bytes'); expect(values.get('navigator-display-v1')).toBe('display bytes');
  });
  it('uses English defaults rather than borrowing another language when English storage is absent, corrupt or denied', () => {
    const values = new Map([[SPEECH_PREFERENCES_KEY, JSON.stringify({ version: 1, preferences: { rate: 1.3, voiceURI: russian.voiceURI } })]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(loadSpeechPreferences(storage, 'en')).toEqual({ preferences: defaultSpeechPreferences(), warning: false });
    values.set(`${SPEECH_PREFERENCES_KEY}-en`, '{bad json');
    expect(loadSpeechPreferences(storage, 'en')).toEqual({ preferences: defaultSpeechPreferences(), warning: true });
    const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadSpeechPreferences(denied, 'en')).toEqual({ preferences: defaultSpeechPreferences(), warning: true });
    expect(saveSpeechPreferences(defaultSpeechPreferences(), denied, 'en')).toBe(false);
  });
});

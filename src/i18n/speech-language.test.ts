import { describe, expect, it } from 'vitest';
import { SpeechController, matchesLocalLanguage } from '../ui/speech';
import type { LocalVoice, SpeechPhrase, SpeechPort } from '../ui/speech';
import { defaultSpeechPreferences, loadSpeechPreferences, saveSpeechPreferences } from '../ui/speech-preferences';
const ru: LocalVoice = { voiceURI: 'ru-local', name: 'Russian', lang: 'ru-RU', localService: true };
const kk: LocalVoice = { voiceURI: 'kk-local', name: 'Kazakh', lang: 'kk-KZ', localService: true };
function harness(voices: LocalVoice[]) {
  const state = { voices, said: [] as SpeechPhrase[], cancellations: 0 };
  const port: SpeechPort = {
    getVoices: () => state.voices, cancel: () => { state.cancellations++; }, speak: phrase => { state.said.push(phrase); },
    makePhrase: text => ({ text, lang: '', rate: 1, voice: null, onend: null, onerror: null }),
    addEventListener: () => {}, removeEventListener: () => {},
  };
  return { state, port };
}
describe('local language speech safety', () => {
  it('rejects remote voices and voices from the other language', () => {
    expect(matchesLocalLanguage(ru, 'kk')).toBe(false);
    expect(matchesLocalLanguage({ ...kk, localService: false }, 'kk')).toBe(false);
    expect(matchesLocalLanguage({ ...kk, lang: 'kk_KZ' }, 'kk')).toBe(true);
  });
  it('never substitutes Russian when a local Kazakh voice is unavailable', () => {
    const { state, port } = harness([ru, { ...kk, voiceURI: 'remote', localService: false }]);
    const controller = new SpeechController(port, { rate: 1, voiceURI: ru.voiceURI }, 'kk'); const disconnect = controller.connect();
    try {
      controller.setEnabled(true); controller.read(['Басты кіреберіс']);
      expect(controller.getSnapshot().status).toBe('unavailable'); expect(state.said).toHaveLength(0);
      state.voices.push(kk); controller.refreshVoices(); controller.read(['Басты кіреберіс']);
      expect(state.said).toHaveLength(1); expect(state.said[0]!.lang).toBe('kk-KZ'); expect(state.said[0]!.voice).toBe(kk);
    } finally { disconnect(); }
  });
  it('cancels old queues on language changes and ignores stale callbacks', () => {
    const { state, port } = harness([ru, kk]);
    const controller = new SpeechController(port, defaultSpeechPreferences()); const disconnect = controller.connect();
    try {
      controller.setEnabled(true); controller.read(['Первый шаг', 'Второй шаг']); const staleEnd = state.said[0]!.onend!;
      controller.setLocale('kk'); staleEnd(); expect(state.said).toHaveLength(1);
      controller.read(['Бірінші қадам', 'Екінші қадам']);
      expect(state.said[1]!.voice).toBe(kk); expect(state.said[1]!.lang).toBe('kk-KZ');
      state.said[1]!.onend!(); expect(state.said[2]!.lang).toBe('kk-KZ');
      state.said[2]!.onend!(); expect(controller.getSnapshot().status).toBe('ready');
      expect(state.cancellations).toBeGreaterThan(0);
    } finally { disconnect(); }
  });
  it('stores speed and voice separately for each language', () => {
    const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(saveSpeechPreferences({ rate: 1.2, voiceURI: ru.voiceURI }, storage, 'ru')).toBe(true);
    expect(saveSpeechPreferences({ rate: .9, voiceURI: kk.voiceURI }, storage, 'kk')).toBe(true);
    expect(loadSpeechPreferences(storage, 'ru').preferences).toEqual({ rate: 1.2, voiceURI: ru.voiceURI });
    expect(loadSpeechPreferences(storage, 'kk').preferences).toEqual({ rate: .9, voiceURI: kk.voiceURI });
  });
});
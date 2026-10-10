import { useEffect, useState, useSyncExternalStore } from 'react';
import { loadSpeechPreferences, defaultSpeechPreferences, saveSpeechPreferences } from './speech-preferences';
import type { SpeechPreferences } from './speech-preferences';

export interface LocalVoice { voiceURI: string; name: string; lang: string; localService: boolean }
export interface SpeechPhrase { text: string; lang: string; rate: number; voice: LocalVoice | null; onend: (() => void) | null; onerror: (() => void) | null }
export interface SpeechPort {
  getVoices(): LocalVoice[]; cancel(): void; speak(phrase: SpeechPhrase): void;
  makePhrase(text: string): SpeechPhrase;
  addEventListener(type: 'voiceschanged', listener: () => void): void;
  removeEventListener(type: 'voiceschanged', listener: () => void): void;
}
export type SpeechStatus = 'unsupported' | 'loading' | 'unavailable' | 'ready' | 'speaking' | 'stopped' | 'error';
export class SpeechController {
  private generation = 0;
  private loadingExpired = false;
  private listeners = new Set<() => void>();
  private state: { enabled: boolean; status: SpeechStatus; voices: LocalVoice[] };
  constructor(private port: SpeechPort | null, private preferences: SpeechPreferences) {
    this.state = { enabled: false, status: port ? 'loading' : 'unsupported', voices: [] };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(value: Partial<typeof this.state>) { this.state = { ...this.state, ...value }; this.listeners.forEach(listener => listener()); }
  refreshVoices = () => {
    try {
      const available = this.port?.getVoices() ?? [];
      const voices = available.filter(voice => voice.localService && /^ru(?:[-_]|$)/i.test(voice.lang));
      const status = this.state.status;
      this.update({ voices, status: status === 'speaking' || status === 'error' ? status : voices.length ? 'ready' : !available.length && status === 'loading' && !this.loadingExpired ? 'loading' : 'unavailable' });
    } catch { this.stop(); this.update({ status: 'error' }); }
  };
  connect() {
    if (!this.port) return () => {};
    try { this.port.addEventListener('voiceschanged', this.refreshVoices); } catch { this.update({ status: 'error' }); return () => { this.stop(); }; }
    this.refreshVoices();
    const deadline = setTimeout(() => {
      this.loadingExpired = true;
      if (this.state.status === 'loading') this.update({ status: 'unavailable' });
    }, 5000);
    return () => { clearTimeout(deadline); try { this.port?.removeEventListener('voiceschanged', this.refreshVoices); } catch { /* A failed native cleanup must not break the planner. */ } this.stop(); };
  }
  setEnabled(enabled: boolean) { this.stop(); this.update({ enabled }); }
  setPreferences(preferences: SpeechPreferences) { this.stop(); this.preferences = preferences; }
  stop = () => { this.generation++; try { this.port?.cancel(); if (this.state.status === 'speaking') this.update({ status: 'stopped' }); } catch { this.update({ status: 'error' }); } };
  read = (texts: string[]) => {
    this.stop();
    if (!this.state.enabled || !this.port) return;
    const voice = this.state.voices.find(item => item.voiceURI === this.preferences.voiceURI) ?? this.state.voices[0];
    if (!voice) { this.update({ status: 'unavailable' }); return; }
    const generation = this.generation;
    let index = 0;
    let segment = 0;
    const next = () => {
      if (generation !== this.generation || !this.state.enabled) return;
      if (index >= texts.length) { this.update({ status: 'ready' }); return; }
      let phrase: SpeechPhrase;
      try { phrase = this.port!.makePhrase(texts[index++]!); } catch { this.stop(); this.update({ status: 'error' }); return; }
      const current = ++segment;
      phrase.lang = 'ru-RU'; phrase.rate = this.preferences.rate; phrase.voice = voice;
      phrase.onend = () => { if (generation === this.generation && current === segment) { segment++; next(); } };
      phrase.onerror = () => { if (generation === this.generation && current === segment) { this.stop(); this.update({ status: 'error' }); } };
      this.update({ status: 'speaking' });
      try { this.port!.speak(phrase); } catch { phrase.onerror(); }
    };
    next();
  };
}

function nativePort(): SpeechPort | null {
  try {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return null;
    const synth = window.speechSynthesis;
    return { getVoices: () => synth.getVoices(), cancel: () => synth.cancel(),
      speak: phrase => synth.speak(phrase as SpeechSynthesisUtterance),
      makePhrase: text => new SpeechSynthesisUtterance(text) as unknown as SpeechPhrase,
      addEventListener: (_, listener) => synth.addEventListener('voiceschanged', listener),
      removeEventListener: (_, listener) => synth.removeEventListener('voiceschanged', listener) };
  } catch { return null; }
}
export function useLocalSpeech() {
  const [initial] = useState(() => { try { return loadSpeechPreferences(window.localStorage); } catch { return { preferences: defaultSpeechPreferences(), warning: true }; } });
  const [preferences, setPreferences] = useState(initial.preferences);
  const [warning, setWarning] = useState(initial.warning);
  const [controller] = useState(() => new SpeechController(nativePort(), initial.preferences));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    const disconnect = controller.connect();
    const hidden = () => { if (document.hidden) controller.stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); disconnect(); };
  }, [controller]);
  const changePreferences = (value: SpeechPreferences) => {
    controller.setPreferences(value); setPreferences(value);
    try { if (!saveSpeechPreferences(value, window.localStorage)) setWarning(true); } catch { setWarning(true); }
  };
  return { ...state, controller, preferences, changePreferences, warning };
}
export type LocalSpeech = ReturnType<typeof useLocalSpeech>;

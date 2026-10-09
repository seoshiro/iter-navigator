export interface SpeechPreferences { rate: number; voiceURI: string }
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const SPEECH_PREFERENCES_KEY = 'navigator-speech-v1';
export const defaultSpeechPreferences = (): SpeechPreferences => ({ rate: 1, voiceURI: '' });
export function validSpeechPreferences(value: unknown): value is SpeechPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 2 && typeof item.rate === 'number' && Number.isFinite(item.rate) && item.rate >= .7 && item.rate <= 1.5 && typeof item.voiceURI === 'string' && item.voiceURI.length <= 500;
}
export function loadSpeechPreferences(storage: Storage) {
  try {
    const raw = storage.getItem(SPEECH_PREFERENCES_KEY);
    if (raw === null) return { preferences: defaultSpeechPreferences(), warning: false };
    const saved: unknown = JSON.parse(raw);
    if (saved && typeof saved === 'object' && 'version' in saved && saved.version === 1 && 'preferences' in saved && validSpeechPreferences(saved.preferences)) return { preferences: saved.preferences, warning: false };
  } catch { /* Independent defaults also cover denied storage. */ }
  return { preferences: defaultSpeechPreferences(), warning: true };
}
export function saveSpeechPreferences(preferences: SpeechPreferences, storage: Storage) {
  if (!validSpeechPreferences(preferences)) return false;
  try { storage.setItem(SPEECH_PREFERENCES_KEY, JSON.stringify({ version: 1, preferences })); return true; }
  catch { return false; }
}

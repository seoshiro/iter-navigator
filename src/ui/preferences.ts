export interface DisplayPreferences { theme: 'dark' | 'light'; largerText: boolean; reduceMotion: boolean }
export const PREFERENCES_KEY = 'navigator-display-v1';
export const defaultPreferences = (systemTheme: 'dark' | 'light' = 'dark'): DisplayPreferences => ({ theme: systemTheme, largerText: false, reduceMotion: false });
interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function validPreferences(value: unknown): value is DisplayPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Object.keys(candidate).length === 3 && (candidate.theme === 'dark' || candidate.theme === 'light') && typeof candidate.largerText === 'boolean' && typeof candidate.reduceMotion === 'boolean';
}
export function loadPreferences(storage: PreferenceStorage, systemTheme: 'dark' | 'light' = 'dark'): { preferences: DisplayPreferences; warning: boolean } {
  try {
    const raw = storage.getItem(PREFERENCES_KEY);
    if (raw === null) return { preferences: defaultPreferences(systemTheme), warning: false };
    const saved: unknown = JSON.parse(raw);
    if (saved && typeof saved === 'object' && 'version' in saved && saved.version === 1 && 'preferences' in saved && validPreferences(saved.preferences)) return { preferences: saved.preferences, warning: false };
  } catch { /* Storage and corrupt JSON both safely use independent defaults. */ }
  return { preferences: defaultPreferences(systemTheme), warning: true };
}
export function savePreferences(preferences: DisplayPreferences, storage: PreferenceStorage): boolean {
  if (!validPreferences(preferences)) return false;
  try { storage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, preferences })); return true; }
  catch { return false; }
}

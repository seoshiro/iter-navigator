import type { Building, Scenario } from './model';
import { validateScenario } from './validation';

export const STORAGE_KEY = 'navigator-scenario-v1';
export function defaultScenario(): Scenario {
  return { start: 'entrance', destination: 'room-204', requirements: { avoidStairs: true, minWidthM: 0.9, maxSlopePercent: 5, smoothOnly: true, allowUnknown: false }, closedEdgeIds: [], floor: 'all' };
}
export interface StorageAccess { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function loadScenario(building: Building, storage: StorageAccess): { scenario: Scenario; restored: boolean; warning: boolean } {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { scenario: defaultScenario(), restored: false, warning: false };
    const saved: unknown = JSON.parse(raw);
    if (typeof saved === 'object' && saved !== null && Object.keys(saved).length === 2 && 'version' in saved && saved.version === 1 && 'scenario' in saved && validateScenario(saved.scenario, building))
      return { scenario: saved.scenario, restored: true, warning: false };
    return { scenario: defaultScenario(), restored: false, warning: true };
  } catch { return { scenario: defaultScenario(), restored: false, warning: true }; }
}
export function saveScenario(scenario: Scenario, building: Building, storage: StorageAccess): boolean {
  if (!validateScenario(scenario, building)) return false;
  try { storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, scenario })); return true; }
  catch { return false; }
}

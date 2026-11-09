import { describe, expect, it } from 'vitest';
import { defaultPreferences, loadPreferences, PREFERENCES_KEY, savePreferences } from '../src/ui/preferences';
import { boundCamera, dragCamera, fitRouteCamera, focusNodeCamera, panCamera, wheelCamera, INITIAL_CAMERA } from '../src/ui/camera';
import fixture from '../src/data/building.json';
import type { Building } from '../src/domain/model';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
describe('independent display preferences', () => {
  it('restores independent choices without reading or writing the scenario', () => {
    const storage = new MemoryStorage(); storage.setItem('navigator-scenario-v1', 'unchanged scenario');
    const preferences = { theme: 'light' as const, largerText: true, reduceMotion: false };
    expect(savePreferences(preferences, storage)).toBe(true);
    expect(loadPreferences(storage)).toEqual({ preferences, warning: false });
    expect(storage.getItem('navigator-scenario-v1')).toBe('unchanged scenario');
    expect([...storage.values.keys()]).toEqual(['navigator-scenario-v1', PREFERENCES_KEY]);
  });
  it('defaults safely when no preferences were saved', () => {
    expect(loadPreferences(new MemoryStorage())).toEqual({ preferences: defaultPreferences(), warning: false });
  });
  it('uses the initial system theme and gives a valid saved choice precedence', () => {
    const storage = new MemoryStorage();
    expect(loadPreferences(storage, 'light').preferences.theme).toBe('light');
    savePreferences(defaultPreferences('dark'), storage);
    expect(loadPreferences(storage, 'light').preferences.theme).toBe('dark');
    storage.setItem(PREFERENCES_KEY, 'broken');
    expect(loadPreferences(storage, 'light')).toEqual({ preferences: defaultPreferences('light'), warning: true });
  });
  it.each(['not JSON', 'null', '[]', '{"version":2,"preferences":{"theme":"light","largerText":true,"reduceMotion":false}}', '{"version":1,"preferences":{"theme":"pink","largerText":true,"reduceMotion":false}}', '{"version":1,"preferences":{"theme":"light","largerText":"true","reduceMotion":false}}', '{"version":1,"preferences":{"theme":"dark","largerText":false}}', '{"version":1,"preferences":{"theme":"dark","largerText":false,"reduceMotion":false,"extra":1}}'])('rejects incompatible or corrupt preferences: %s', raw => {
    const storage = new MemoryStorage(); storage.setItem(PREFERENCES_KEY, raw);
    expect(loadPreferences(storage)).toEqual({ preferences: defaultPreferences(), warning: true });
  });
  it('explains unavailable persistence and rejects invalid writes', () => {
    const unavailable = { getItem: () => { throw new Error('unavailable'); }, setItem: () => { throw new Error('quota'); } };
    expect(loadPreferences(unavailable)).toEqual({ preferences: defaultPreferences(), warning: true });
    expect(savePreferences(defaultPreferences(), unavailable)).toBe(false);
    expect(savePreferences({ ...defaultPreferences(), theme: 'invalid' } as never, new MemoryStorage())).toBe(false);
  });
});
describe('bounded transient camera', () => {
  it('bounds gestures and controls while keeping settled baseline defaults', () => {
    expect(boundCamera(INITIAL_CAMERA)).toEqual(INITIAL_CAMERA);
    expect(boundCamera({ preset: 'front', yaw: 9999, zoom: 9, panX: -20, panY: 20 })).toEqual({ preset: 'front', yaw: 180, zoom: 1.8, panX: -8, panY: 8 });
    expect(boundCamera({ preset: 'bad', yaw: NaN, zoom: Infinity, panX: NaN, panY: Infinity } as never)).toEqual(INITIAL_CAMERA);
  });
  it('orbits without flipping, pans in screen units and bounds wheel zoom', () => {
    expect(dragCamera(INITIAL_CAMERA, 100, 100)).toEqual({ ...INITIAL_CAMERA, yaw: -13, tilt: 18 });
    expect(dragCamera(INITIAL_CAMERA, -100000, 100000)).toEqual({ ...INITIAL_CAMERA, yaw: -180, tilt: 25 });
    expect(panCamera(INITIAL_CAMERA, 100, 100, 480)).toEqual({ ...INITIAL_CAMERA, panX: -8, panY: 8 });
    expect(wheelCamera(INITIAL_CAMERA, -200).zoom).toBeGreaterThan(1);
    expect(wheelCamera({ ...INITIAL_CAMERA, zoom: 1.8 }, -200).zoom).toBe(1.8);
    expect(wheelCamera(INITIAL_CAMERA, NaN)).toEqual(INITIAL_CAMERA);
  });
  it('frames route extents and focuses graph coordinates without mutating inputs', () => {
    const building = fixture as Building; const before = JSON.stringify(building);
    const nodes = ['entrance', 'lift-a-0', 'lift-a-2', 'room-301'];
    const narrow = fitRouteCamera(building, nodes, .2); const wide = fitRouteCamera(building, nodes, 2);
    expect(narrow.zoom).toBeLessThan(wide.zoom); expect(narrow.target).toBeDefined();
    const node = building.nodes.find(candidate => candidate.id === 'room-205')!;
    expect(focusNodeCamera(building, node.id).target).toEqual({ x: node.x, y: node.floor * building.floorHeightM + .45, z: node.z });
    expect(focusNodeCamera(building, 'missing')).toEqual(INITIAL_CAMERA); expect(fitRouteCamera(building, [], 1)).toEqual(INITIAL_CAMERA);
    expect(JSON.stringify(building)).toBe(before);
  });
});

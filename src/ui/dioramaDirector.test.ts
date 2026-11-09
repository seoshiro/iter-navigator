import { describe, expect, it } from 'vitest';
import buildingJson from '../data/building.json';
import type { Building, Requirements } from '../domain/model';
import { findRoute } from '../domain/routing';
import { directorDoorAnchor, directorGraphEdges, createDioramaPose, routeElementProgress, snapshotDioramaPose, unitProgress } from './dioramaDirector';

describe('presentation director channels', () => {
  it('omits the circular GSAP target cache from snapshots', () => {
    const pose = createDioramaPose();
    Object.assign(pose, { _gsap: { target: pose } });
    expect(JSON.parse(JSON.stringify(snapshotDioramaPose(pose)))).toEqual(createDioramaPose());
  });
  it('makes independent poses for an identical intro/live handoff', () => {
    const first = createDioramaPose({ zoom: .9 });
    const second = createDioramaPose({ zoom: .9 });
    expect(first).toEqual(second);
    first.yaw += 360;
    expect(second.yaw).toBe(-38);
    expect(second.labels).toBe(0);
    expect(second.routeProgress).toBe(0);
  });
  it('reveals only consecutive segments and supports backwards scrubbing', () => {
    const at = (progress: number) => [0, 1, 2, 3].map(i => routeElementProgress(progress, i, 4));
    expect(at(0)).toEqual([0, 0, 0, 0]);
    expect(at(.375)).toEqual([1, .5, 0, 0]);
    expect(at(1)).toEqual([1, 1, 1, 1]);
    expect(at(.125)).toEqual([.5, 0, 0, 0]);
  });
  it('bounds effect channels without restricting continuous camera yaw', () => {
    expect(unitProgress(-1)).toBe(0);
    expect(unitProgress(2)).toBe(1);
    expect(unitProgress(NaN)).toBe(0);
    expect(createDioramaPose({ yaw: 410 }).yaw).toBe(410);
  });
});

const building = buildingJson as Building;
const requirements: Requirements = { avoidStairs: true, minWidthM: .9, maxSlopePercent: 8, smoothOnly: true, allowUnknown: false };
describe('presentation evidence overlays', () => {
  it('uses zero defaults and whitelists every new channel', () => {
    const pose = createDioramaPose();
    expect([pose.door205, pose.graphOpacity, pose.graphFilter]).toEqual([0, 0, 0]);
    pose.door205 = .8; pose.graphOpacity = .5; pose.graphFilter = .4;
    expect(snapshotDioramaPose(pose)).toEqual(pose);
  });
  it('anchors door 205 on its actual architectural crossing', () => {
    expect(directorDoorAnchor(building, 'door-205')).toEqual({ x: 24, y: 5.53, z: 5, floor: 1 });
    expect(directorDoorAnchor(building, 'missing')).toBeNull();
    expect(building.edges.find(e => e.id === 'door-205')?.widthM.status).toBe('unknown');
    expect(building.edges.find(e => e.id === 'door-205')?.surface.status).toBe('unknown');
  });
  it('filters with solver evidence and never labels unknown as a measured failure', () => {
    const strict = directorGraphEdges(building, requirements);
    const permissive = directorGraphEdges(building, { ...requirements, allowUnknown: true });
    expect(strict.find(e => e.edge.id === 'door-205')).toMatchObject({ excluded: true, uncertain: true });
    expect(permissive.find(e => e.edge.id === 'door-205')).toMatchObject({ excluded: false, uncertain: true });
    const result = findRoute(building, 'entrance', 'room-204', requirements, []);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') for (const id of result.edgeIds) expect(strict.find(e => e.edge.id === id)?.excluded).toBe(false);
    expect(directorGraphEdges(building, undefined, ['door-204']).find(e => e.edge.id === 'door-204')?.excluded).toBe(true);
  });
});

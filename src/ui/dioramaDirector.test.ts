import { describe, expect, it } from 'vitest';
import buildingJson from '../data/building.json';
import type { Building, Requirements } from '../domain/model';
import { findRoute } from '../domain/routing';
import { directorDoorAnchor, directorGraphEdges, directorGraphRejection, directorIntroProgress, createDioramaPose, routeElementProgress, snapshotDioramaPose, unitProgress } from './dioramaDirector';

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

describe('concrete presentation explanations', () => {
  it('identifies a real measured-width violation without fabricating 205 evidence', () => {
    expect(directorGraphRejection(building, requirements)).toEqual({edgeId:'narrow-204',widthM:.72,minWidthM:.9});
    expect(directorGraphRejection(building, {...requirements,minWidthM:.7})).toBeNull();
    expect(directorGraphRejection(building)).toBeNull();
    const unknown = {...building,edges:building.edges.map(edge=>({...edge,widthM:{status:'unknown' as const,value:null,source:'unknown',checkedOn:null}}))};
    expect(directorGraphRejection(unknown,requirements)).toBeNull();
  });
  it('clips the intro to a consecutive two-edge prefix, including reverse scrubbing', () => {
    expect(directorIntroProgress(1,8)).toBe(.25);
    expect(directorIntroProgress(.5,8)).toBe(.125);
    expect(directorIntroProgress(0,8)).toBe(0);
    expect(directorIntroProgress(1,1)).toBe(1);
    expect(directorIntroProgress(1,0)).toBe(0);
    const route=findRoute(building,'entrance','room-204',requirements,[]);
    expect(route.status).toBe('ok');
    if(route.status==='ok') {
      const progress=directorIntroProgress(1,route.edgeIds.length);
      expect(route.edgeIds.filter((_,i)=>routeElementProgress(progress,i,route.edgeIds.length)>0)).toEqual(route.edgeIds.slice(0,2));
    }
  });
  it('starts all new overlay channels at zero and includes them in safe snapshots', () => {
    const pose=createDioramaPose();
    expect([pose.introGoal,pose.introRoute,pose.graphReject]).toEqual([0,0,0]);
    Object.assign(pose,{introGoal:1,introRoute:.5,graphReject:.8});
    expect(snapshotDioramaPose(pose)).toMatchObject({introGoal:1,introRoute:.5,graphReject:.8});
  });
});

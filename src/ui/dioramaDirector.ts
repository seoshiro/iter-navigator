import type { Building, Requirements } from '../domain/model';
import { inspectEdge } from '../domain/routing';
import { createFloorArchitecture } from './architecture';

/** Mutable numeric channel for a single external timeline. No internal interpolation. */
export interface DioramaPose {
  yaw: number; zoom: number; tilt: number; panX: number; panY: number;
  targetX: number; targetY: number; targetZ: number;
  spread: number; cutaway: number; routeProgress: number; labels: number;
  focusFloor0: number; focusFloor1: number; focusFloor2: number;
  entrance: number; stairs: number; door: number; lift: number;
  door205: number; graphOpacity: number; graphFilter: number;
}
export const createDioramaPose = (overrides: Partial<DioramaPose> = {}): DioramaPose => ({
  yaw: -38, zoom: 1, tilt: 0, panX: 0, panY: 0,
  targetX: 16, targetY: 4, targetZ: 11,
  spread: 0, cutaway: 0, routeProgress: 0, labels: 0,
  focusFloor0: 0, focusFloor1: 0, focusFloor2: 0,
  entrance: 0, stairs: 0, door: 0, lift: 0,
  door205: 0, graphOpacity: 0, graphFilter: 0, ...overrides,
});
/** GSAP adds a circular _gsap cache. Never serialize/copy timeline internals. */
export const snapshotDioramaPose = (pose: DioramaPose): DioramaPose => {
  const snapshot = createDioramaPose();
  for (const key of Object.keys(snapshot) as (keyof DioramaPose)[]) snapshot[key] = pose[key];
  return snapshot;
};
export interface DioramaCapture {
  dataUrl: string; width: number; height: number; pose: DioramaPose; background: string;
}
export interface DioramaDirectorController {
  apply(): void;
  capture(options?: { width?: number; height?: number; clean?: boolean; background?: string }): DioramaCapture;
  project(nodeId: string): { x: number; y: number; visible: boolean } | null;
}
export interface DioramaDirector {
  pose: DioramaPose;
  /** The same requirements used by findRoute; no inferred accessibility defaults. */
  requirements?: Requirements;
  bind(controller: DioramaDirectorController | null): void;
}
export const unitProgress = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
/** Each route element reveals in route traversal order, including reverse scrubbing. */
export const routeElementProgress = (progress: number, index: number, count: number) =>
  unitProgress(unitProgress(progress) * Math.max(1, count) - index);

/** Locate the actual architectural opening on a graph door edge, not a nearby room.
 * Opening width is illustrative architecture, never measured accessibility evidence. */
export function directorDoorAnchor(building: Building, edgeId: string) {
  const edge = building.edges.find(e => e.id === edgeId && e.type === 'door');
  if (!edge) return null;
  const from = building.nodes.find(n => n.id === edge.from);
  const to = building.nodes.find(n => n.id === edge.to);
  if (!from || !to || from.floor !== to.floor) return null;
  const dx = to.x - from.x, dz = to.z - from.z, lengthSq = dx * dx + dz * dz;
  if (!lengthSq) return null;
  const opening = createFloorArchitecture(building, to.floor).doors.filter(d => {
    const t = ((d.x - from.x) * dx + (d.z - from.z) * dz) / lengthSq;
    return t >= 0 && t <= 1 && Math.abs((d.x - from.x) * dz - (d.z - from.z) * dx) < .0001;
  }).sort((a, b) => Math.hypot(a.x - to.x, a.z - to.z) - Math.hypot(b.x - to.x, b.z - to.z))[0];
  return opening ? { x: opening.x, y: to.floor * building.floorHeightM + .53, z: opening.z, floor: to.floor } : null;
}

/** Presentation filtering uses precisely the route solver's evidence policy. */
export function directorGraphEdges(building: Building, requirements?: Requirements, closedEdgeIds: readonly string[] = []) {
  const closed = new Set(closedEdgeIds);
  return building.edges.map(edge => {
    const inspection = requirements ? inspectEdge(edge, requirements, closed) : {
      reasons: closed.has(edge.id) ? ['closed'] : [],
      uncertain: [edge.widthM, edge.surface, edge.slopePercent, edge.stepFree].some(e => e.status === 'unknown'),
    };
    return { edge, excluded: inspection.reasons.length > 0, uncertain: inspection.uncertain };
  });
}

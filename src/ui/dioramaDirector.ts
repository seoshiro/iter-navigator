/** Mutable numeric channel for a single external timeline. No internal interpolation. */
export interface DioramaPose {
  yaw: number; zoom: number; tilt: number; panX: number; panY: number;
  targetX: number; targetY: number; targetZ: number;
  spread: number; cutaway: number; routeProgress: number; labels: number;
  focusFloor0: number; focusFloor1: number; focusFloor2: number;
  entrance: number; stairs: number; door: number; lift: number;
}
export const createDioramaPose = (overrides: Partial<DioramaPose> = {}): DioramaPose => ({
  yaw: -38, zoom: 1, tilt: 0, panX: 0, panY: 0,
  targetX: 16, targetY: 4, targetZ: 11,
  spread: 0, cutaway: 0, routeProgress: 0, labels: 0,
  focusFloor0: 0, focusFloor1: 0, focusFloor2: 0,
  entrance: 0, stairs: 0, door: 0, lift: 0, ...overrides,
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
  bind(controller: DioramaDirectorController | null): void;
}
export const unitProgress = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
/** Each route element reveals in route traversal order, including reverse scrubbing. */
export const routeElementProgress = (progress: number, index: number, count: number) =>
  unitProgress(unitProgress(progress) * Math.max(1, count) - index);

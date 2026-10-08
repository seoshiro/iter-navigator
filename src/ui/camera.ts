import type { Building } from '../domain/model';

export interface CameraState {
  preset: 'overview' | 'front' | 'top'; yaw: number; zoom: number; panX: number; panY: number;
  tilt?: number; target?: { x: number; y: number; z: number };
}
export const INITIAL_CAMERA: CameraState = { preset: 'overview', yaw: -38, zoom: 1, panX: 0, panY: 0 };
const bounded = (value: number, min: number, max: number, fallback: number) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export function boundCamera(camera: CameraState): CameraState {
  return { preset: ['overview', 'front', 'top'].includes(camera.preset) ? camera.preset : 'overview', yaw: bounded(camera.yaw, -180, 180, -38), zoom: bounded(camera.zoom, 0.6, 1.8, 1), panX: bounded(camera.panX, -8, 8, 0), panY: bounded(camera.panY, -8, 8, 0),
    ...(camera.tilt === undefined ? {} : { tilt: bounded(camera.tilt, -20, 25, 0) }),
    ...(camera.target === undefined ? {} : { target: { x: bounded(camera.target.x, 0, 32, 16), y: bounded(camera.target.y, 0, 24, 4), z: bounded(camera.target.z, 0, 23, 11) } }) };
}
export function dragCamera(camera: CameraState, dx: number, dy: number): CameraState {
  return boundCamera({ ...camera, yaw: camera.yaw + dx * 0.25, tilt: (camera.tilt ?? 0) + dy * .18 });
}
export function panCamera(camera: CameraState, dx: number, dy: number, height: number): CameraState {
  const units = 48 / Math.max(1, height) / camera.zoom;
  return boundCamera({ ...camera, panX: camera.panX - dx * units, panY: camera.panY + dy * units });
}
export function wheelCamera(camera: CameraState, delta: number): CameraState {
  return boundCamera({ ...camera, zoom: camera.zoom * Math.exp(-bounded(delta, -200, 200, 0) * .002) });
}
export function fitRouteCamera(building: Building, ids: string[], aspect: number): CameraState {
  const routeNodes = building.nodes.filter(node => ids.includes(node.id));
  if (!routeNodes.length) return { ...INITIAL_CAMERA };
  const points = routeNodes.map(node => ({ x: node.x, y: node.floor * building.floorHeightM + .45, z: node.z }));
  const range = (axis: 'x' | 'y' | 'z') => [Math.min(...points.map(point => point[axis])), Math.max(...points.map(point => point[axis]))] as const;
  const x = range('x'); const y = range('y'); const z = range('z');
  const target = { x: (x[0] + x[1]) / 2, y: (y[0] + y[1]) / 2, z: (z[0] + z[1]) / 2 };
  const angle = INITIAL_CAMERA.yaw * Math.PI / 180; const elevation = Math.atan2(38, 52);
  const projected = points.map(point => ({ x: Math.cos(angle) * (point.x - target.x) - Math.sin(angle) * (point.z - target.z),
    y: Math.cos(elevation) * (point.y - target.y) - Math.sin(elevation) * (Math.sin(angle) * (point.x - target.x) + Math.cos(angle) * (point.z - target.z)) }));
  // Fit every ordered node with a generous margin for route strokes, endpoints and labels.
  const extentX = Math.max(...projected.map(point => Math.abs(point.x))) + 3;
  const extentY = Math.max(...projected.map(point => Math.abs(point.y))) + 3;
  return boundCamera({ ...INITIAL_CAMERA, target, zoom: Math.min(1.6, 24 * Math.max(.1, aspect) / extentX, 24 / extentY) });
}
export function focusNodeCamera(building: Building, id: string): CameraState {
  const node = building.nodes.find(candidate => candidate.id === id);
  return node ? boundCamera({ ...INITIAL_CAMERA, zoom: 1.5, target: { x: node.x, y: node.floor * building.floorHeightM + .45, z: node.z } }) : { ...INITIAL_CAMERA };
}

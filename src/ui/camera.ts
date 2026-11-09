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
export const CAMERA_HALF_HEIGHT = 21;
export function fitRouteCamera(building: Building, ids: string[], aspect: number, current:CameraState=INITIAL_CAMERA): CameraState {
  const routeNodes=building.nodes.filter(n=>ids.includes(n.id));if(!routeNodes.length)return {...INITIAL_CAMERA};
  const orientation=boundCamera(current);
  // Fit the expanded model as context, not merely the unexpanded route centerline.
  const top=Math.max(...building.floors.map(f=>f.id*(building.floorHeightM+5)))+3;
  const points=[-5,37].flatMap(x=>[-3,27].flatMap(z=>[-1,top].map(y=>({x,y,z}))));
  points.push(...routeNodes.map(n=>({x:n.x,y:n.floor*(building.floorHeightM+5)+.45,z:n.z})));
  const worldTarget={x:16,y:(top-1)/2,z:12};
  const yaw=orientation.yaw*Math.PI/180;
  const height=orientation.preset==='top'?70:orientation.preset==='front'?21:38;
  const radius=orientation.preset==='top'?.1:52;
  const elevation=Math.max(.18,Math.min(1.55,Math.atan2(height,radius)+(orientation.tilt??0)*Math.PI/180));
  const projected=points.map(p=>({x:Math.cos(yaw)*(p.x-worldTarget.x)-Math.sin(yaw)*(p.z-worldTarget.z),y:Math.cos(elevation)*(p.y-worldTarget.y)-Math.sin(elevation)*(Math.sin(yaw)*(p.x-worldTarget.x)+Math.cos(yaw)*(p.z-worldTarget.z))}));
  const extentX=Math.max(...projected.map(p=>Math.abs(p.x)))+1.5,extentY=Math.max(...projected.map(p=>Math.abs(p.y)))+1.5;
  return boundCamera({...orientation,panX:0,panY:0,target:{...worldTarget,y:worldTarget.y-5},zoom:Math.min(1.6,CAMERA_HALF_HEIGHT*Math.max(.1,aspect)/extentX,CAMERA_HALF_HEIGHT/extentY)});
}
export function focusNodeCamera(building: Building, id: string): CameraState {
  const node = building.nodes.find(candidate => candidate.id === id);
  return node ? boundCamera({ ...INITIAL_CAMERA, zoom: 1.5, target: { x: node.x, y: node.floor * building.floorHeightM + .45, z: node.z } }) : { ...INITIAL_CAMERA };
}

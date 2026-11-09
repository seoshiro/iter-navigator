import { Box3, Mesh, Vector3 } from 'three';
import type { Camera, Group } from 'three';

export interface DirectorBounds { left: number; top: number; right: number; bottom: number }
export interface CachedFloorBounds { group: Group; corners: Vector3[] }
/** One assembly-time traversal. Sprites and overlays do not define the building silhouette. */
export function cacheDirectorFloorBounds(group: Group): CachedFloorBounds {
  const bounds = new Box3();
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert();
  group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.geometry.computeBoundingBox();
    if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld)));
  });
  const corners: Vector3[] = [];
  if (!bounds.isEmpty()) for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) corners.push(new Vector3(x,y,z));
  return {group,corners};
}
/** At most eight corners per visible floor; no geometry traversal in animation frames.
 * Conservative host-normalized bounds, deliberately unclamped when offscreen. */
export function projectDirectorBounds(floors: readonly CachedFloorBounds[], camera: Camera): DirectorBounds | null {
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  const point=new Vector3();
  camera.updateMatrixWorld();
  for(const {group,corners} of floors) {
    if(!group.visible) continue;
    group.updateWorldMatrix(true,false);
    for(const corner of corners) {
      point.copy(corner).applyMatrix4(group.matrixWorld).project(camera);
      const x=(point.x+1)/2,y=(1-point.y)/2;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
  }
  return Number.isFinite(left) ? {left,top,right,bottom} : null;
}

import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, OrthographicCamera, Sprite } from 'three';
import { cacheDirectorFloorBounds, projectDirectorBounds } from './directorBounds';
const fixture=()=>{const group=new Group();group.add(new Mesh(new BoxGeometry(2,2,2),new MeshBasicMaterial()));const camera=new OrthographicCamera(-2,2,2,-2,.1,100);camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateProjectionMatrix();return {group,camera,cached:cacheDirectorFloorBounds(group)};};
describe('cached production director bounds',()=>{
  it('projects visible geometry and excludes distant labels',()=>{
    const {group,camera}=fixture();const label=new Sprite();label.position.x=100;group.add(label);
    expect(projectDirectorBounds([cacheDirectorFloorBounds(group)],camera)).toEqual({left:.25,right:.75,top:.25,bottom:.75});
  });
  it('tracks current camera aspect and zoom without rebuilding cached geometry',()=>{
    const {cached,camera}=fixture();camera.left=-4;camera.right=4;camera.updateProjectionMatrix();
    expect(projectDirectorBounds([cached],camera)).toEqual({left:.375,right:.625,top:.25,bottom:.75});
    camera.zoom=2;camera.updateProjectionMatrix();
    expect(projectDirectorBounds([cached],camera)).toEqual({left:.25,right:.75,top:0,bottom:1});
  });
  it('tracks spread/floor transforms, ignores hidden floors, and returns unclamped values',()=>{
    const {group,cached,camera}=fixture();group.position.y=3;
    expect(projectDirectorBounds([cached],camera)).toEqual({left:.25,right:.75,top:-.5,bottom:0});
    group.visible=false;expect(projectDirectorBounds([cached],camera)).toBeNull();
    group.visible=true;group.position.y=0;expect(projectDirectorBounds([cached],camera)?.top).toBe(.25);
  });
  it('does not reread changed geometry during projection',()=>{
    const {group,cached,camera}=fixture();(group.children[0] as Mesh).geometry.computeBoundingBox=()=>{throw new Error('Unexpected geometry traversal');};
    expect(projectDirectorBounds([cached],camera)?.left).toBe(.25);
    expect(projectDirectorBounds([],camera)).toBeNull();
  });
});

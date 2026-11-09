import { expect, it } from 'vitest';
import fixture from '../src/data/building.json';
import type { Building } from '../src/domain/model';
import { fitRouteCamera, INITIAL_CAMERA, CAMERA_HALF_HEIGHT } from '../src/ui/camera';
it('fits expanded scene corners at phone/desktop aspects across orbit angles',()=>{
 const building=fixture as Building;
 for(const aspect of [349/310,364/310,814/360])for(const yaw of [-150,-38,0,75,180])for(const tilt of [-20,0,25]){
 const camera=fitRouteCamera(building,['entrance','lift-a-0','lift-a-1','room-204'],aspect,{...INITIAL_CAMERA,yaw,tilt});
 const target={...camera.target!,y:camera.target!.y+5};const angle=yaw*Math.PI/180,elevation=Math.max(.18,Math.min(1.55,Math.atan2(38,52)+tilt*Math.PI/180));
 for(const x of [-5,37])for(const y of [-1,23])for(const z of [-3,27]){
 const sx=(Math.cos(angle)*(x-target.x)-Math.sin(angle)*(z-target.z))*camera.zoom/(CAMERA_HALF_HEIGHT*aspect);
 const sy=(Math.cos(elevation)*(y-target.y)-Math.sin(elevation)*(Math.sin(angle)*(x-target.x)+Math.cos(angle)*(z-target.z)))*camera.zoom/CAMERA_HALF_HEIGHT;
 expect(Math.abs(sx)).toBeLessThan(1);expect(Math.abs(sy)).toBeLessThan(1);
 }
 expect(camera.yaw).toBe(yaw);expect(camera.tilt).toBe(tilt);
 }
});

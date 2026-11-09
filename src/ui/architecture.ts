import type { Building } from '../domain/model';
export interface WallSegment { x1:number; z1:number; x2:number; z2:number }
export interface DoorOpening { x:number; z:number; width:number; axis:'x'|'z' }
export interface RoomRegion { id:string; x:number; z:number; width:number; depth:number }
/** Controlled room envelopes; graph crossings are cut out, never painted over. */
export function createFloorArchitecture(building:Building, floor:number) {
 const rooms:RoomRegion[]=building.nodes.filter(n=>n.floor===floor&&n.kind==='room').map(n=>({id:n.id,x:n.x,z:n.z,width: n.x<5||n.x>28?4:6,depth:4}));
 const walls:WallSegment[]=[]; const doors:DoorOpening[]=[];
 const nodes=new Map(building.nodes.map(n=>[n.id,n]));
 const envelopes=[...rooms,...building.nodes.filter(n=>n.floor===floor&&n.kind==='lift').map(n=>({id:n.id,x:n.x,z:n.z,width:2.8,depth:2.8}))];
 for(const r of envelopes){
 const left=r.x-r.width/2,right=r.x+r.width/2,top=r.z-r.depth/2,bottom=r.z+r.depth/2;
 for(const [x1,z1,x2,z2] of [[left,top,right,top],[left,bottom,right,bottom],[left,top,left,bottom],[right,top,right,bottom]] as [number,number,number,number][]){
 const horizontal=z1===z2; const low=horizontal?x1:z1, high=horizontal?x2:z2; const cuts:[number,number][]=[];
 for(const edge of building.edges){const a=nodes.get(edge.from)!,b=nodes.get(edge.to)!;if(a.floor!==floor||b.floor!==floor)continue;
 const delta=horizontal?b.z-a.z:b.x-a.x;if(Math.abs(delta)<.0001)continue;
 const t=((horizontal?z1:x1)-(horizontal?a.z:a.x))/delta;if(t<0||t>1)continue;
 const c=horizontal?a.x+t*(b.x-a.x):a.z+t*(b.z-a.z);if(c<low||c>high)continue;
 cuts.push([Math.max(low,c-1),Math.min(high,c+1)]);doors.push({x:horizontal?c:x1,z:horizontal?z1:c,width:2,axis:horizontal?'x':'z'});
 }
 cuts.sort((a,b)=>a[0]-b[0]);let start=low;
 const add=(a:number,b:number)=>{if(b-a>.05)walls.push(horizontal?{x1:a,z1,x2:b,z2}:{x1,z1:a,x2,z2:b});};
 for(const [a,b] of cuts){add(start,a);start=Math.max(start,b);}add(start,high);
 }
 }
 return {walls,doors,rooms};
}

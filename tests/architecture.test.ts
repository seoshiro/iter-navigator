import { describe, expect, it } from 'vitest';
import data from '../src/data/building.json';
import type { Building } from '../src/domain/model';
import { createFloorArchitecture } from '../src/ui/architecture';
const building=data as Building;
describe('controlled architecture',()=>{
 it('is deterministic and preserves source graph',()=>{const before=JSON.stringify(building);expect(createFloorArchitecture(building,1)).toEqual(createFloorArchitecture(building,1));expect(JSON.stringify(building)).toBe(before);});
 it('leaves a real opening at every route crossing',()=>{
 const nodes=new Map(building.nodes.map(n=>[n.id,n]));
 for(const f of building.floors){const model=createFloorArchitecture(building,f.id);expect(model.rooms.length).toBeGreaterThan(0);expect(model.doors.length).toBeGreaterThan(0);
 for(const w of model.walls)for(const e of building.edges){const a=nodes.get(e.from)!,b=nodes.get(e.to)!;if(a.floor!==f.id||b.floor!==f.id)continue;
 const horizontal=w.z1===w.z2;const delta=horizontal?b.z-a.z:b.x-a.x;if(Math.abs(delta)<.0001)continue;const t=((horizontal?w.z1:w.x1)-(horizontal?a.z:a.x))/delta;if(t<0||t>1)continue;const c=horizontal?a.x+t*(b.x-a.x):a.z+t*(b.z-a.z);const low=horizontal?w.x1:w.z1,high=horizontal?w.x2:w.z2;expect(c<=low||c>=high).toBe(true);
 }
 }
 });
});

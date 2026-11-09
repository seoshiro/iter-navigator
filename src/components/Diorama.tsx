import { useEffect, useLayoutEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { useI18n } from '../i18n/locale';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Building, RouteResult } from '../domain/model';
import { boundCamera, dragCamera, panCamera, wheelCamera, CAMERA_HALF_HEIGHT } from '../ui/camera';
import { createFloorArchitecture } from '../ui/architecture';
import type { CameraState } from '../ui/camera';

interface VisualState { routeReveal?:boolean; expanded?: boolean; cameraTransitionId?: number; result: RouteResult; floor: 'all' | number; closedEdgeIds: string[]; camera: CameraState; motionAllowed: boolean; theme: 'dark' | 'light'; largerText: boolean; highlight: { nodeId: string; edgeId?: string } | null; gesturesEnabled: boolean }
interface Props extends VisualState { onSelectNode?: (id:string)=>void; building: Building; gestureReset: number; onFailure: () => void; onCameraChange: (value: CameraState) => void }
interface Resources { geometries: THREE.BufferGeometry[]; materials: THREE.Material[]; textures: THREE.Texture[] }
const resources = (): Resources => ({ geometries: [], materials: [], textures: [] });
const disposeResources = (value: Resources) => { value.geometries.forEach(item => item.dispose()); value.materials.forEach(item => item.dispose()); value.textures.forEach(item => item.dispose()); };

export default function Diorama({ building, result, floor, closedEdgeIds, camera, motionAllowed, theme, largerText, highlight, gesturesEnabled, gestureReset, expanded = false, routeReveal = false, cameraTransitionId = 0, onFailure, onCameraChange }: Props) {
  const {locale,nodeLabelRu}=useI18n();
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<{ update: (next: VisualState) => void; interrupt: () => void } | null>(null);
  const latest = useRef<VisualState>({ result, floor, closedEdgeIds, camera, motionAllowed, theme, largerText, highlight, gesturesEnabled, expanded, routeReveal, cameraTransitionId });
  const pointers = useRef(new Map<number, { x: number; y: number; startX: number; startY: number; touch: boolean; button: number; axis: 'pending' | 'rotate' }>());
  useLayoutEffect(() => {
    const container = host.current; const ids = [...pointers.current.keys()]; pointers.current.clear();
    for (const id of ids) if (container?.hasPointerCapture(id)) container.releasePointerCapture(id);
    if (container) container.dataset.dragging = 'false';
  }, [gestureReset, gesturesEnabled]);
  useLayoutEffect(() => {
    latest.current = { result, floor, closedEdgeIds, camera, motionAllowed, theme, largerText, highlight, gesturesEnabled, expanded, routeReveal, cameraTransitionId };
    runtime.current?.update(latest.current);
    if (host.current) host.current.dataset.dragging = String(pointers.current.size > 0);
  }, [result, floor, closedEdgeIds, camera, motionAllowed, theme, largerText, highlight, gesturesEnabled, expanded, routeReveal, cameraTransitionId]);
  useEffect(() => {
    const container = host.current; if (!container) return;
    const wheel = (event: WheelEvent) => {
      if (!latest.current.gesturesEnabled) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      runtime.current?.interrupt();
      const next = wheelCamera(latest.current.camera, delta); latest.current = {...latest.current, camera:next}; onCameraChange(next);
    };
    container.addEventListener('wheel', wheel, { passive: false });
    return () => container.removeEventListener('wheel', wheel);
  }, [onCameraChange]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer | undefined;
    let failureStage='initialization';
    let resize: ResizeObserver | undefined;
    let intersection: IntersectionObserver | undefined;
    let disposed = false;
    let frame = 0;
    let renderCount = 0;
    let visible = true;
    let dirty = true;
    let burstStart = 0;
    let burstEnd = 0;
    let floorStart = 0;
    let floorEnd = 0;
    let state = latest.current;
    let shadow: THREE.DirectionalLight['shadow'] | undefined;
    const scene = new THREE.Scene();
    const structureResources = resources();
    let routeResources = resources();
    let allocation = structureResources;
    let parent = new THREE.Group(); scene.add(parent);
    const floorGroups = new Map<number, THREE.Group>();
    const floorSlabs = new Map<number, THREE.MeshStandardMaterial>();
    const structureLabels: THREE.Sprite[] = [];
    const routes = new THREE.Group(); scene.add(routes);
    const nodes = new Map(building.nodes.map(node => [node.id, node]));
    const edges = new Map(building.edges.map(edge => [edge.id, edge]));
    const offsets = building.floors.map(f=>state.floor==='all'?(state.expanded?f.id*5:0):(f.id>state.floor?14:0));
    const floorAlpha:number[]=building.floors.map(f=>state.floor!=='all'&&f.id!==state.floor?0:state.routeReveal?.24:1);let alphaFrom=[...floorAlpha],alphaTo=[...floorAlpha];
    const floorMaterials=new Map<number,{material:THREE.Material;base:number;depth?:THREE.MeshDepthMaterial}[]>();
    const applyFloorAppearance=()=>{floorGroups.forEach((group,id)=>{const alpha=floorAlpha[id]??1;group.visible=alpha>.0001;
      for(const entry of floorMaterials.get(id)??[]){const m=entry.material;m.opacity=entry.base*alpha;const transparent=m instanceof THREE.SpriteMaterial||m.opacity<.999;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.depthWrite=!transparent;if(entry.depth){entry.depth.userData.fade.value=alpha*alpha;}}
      group.children.forEach(object=>{if(object instanceof THREE.Sprite)object.visible=!state.routeReveal;});
    });container.dataset.floorOpacity=JSON.stringify(floorAlpha);};
    let revealEnd = 0; let revealStart = 0; let offsetFrom = [...offsets]; let offsetTo = [...offsets];
    const floorOffset = (id:number) => offsets[id] ?? 0;
    const continuousOffset = (y:number) => {const level=Math.max(0,Math.min(offsets.length-1,(y-.45)/building.floorHeightM));const lo=Math.floor(level),hi=Math.ceil(level);return floorOffset(lo)*(1-(level-lo))+floorOffset(hi)*(level-lo);};
    const position = (id: string) => { const node = nodes.get(id)!; return new THREE.Vector3(node.x, node.floor * building.floorHeightM + .45, node.z); };
    const initialTarget = boundCamera(state.camera).target;
    const target = new THREE.Vector3(initialTarget?.x ?? 16, (initialTarget?.y ?? (state.floor === 'all' ? 4 : state.floor * building.floorHeightM)) + (state.floor === 'all' && state.expanded ? 5 : 0), initialTarget?.z ?? 11);
    const floorFrom = target.clone(); const floorTo = target.clone();
    const view = new THREE.OrthographicCamera(-27, 27, 22, -22, .1, 250);
    const material = (color: string, opacity = 1) => {
      const value = new THREE.MeshStandardMaterial({ color, roughness: .85, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
      allocation.materials.push(value); return value;
    };
    const routeMaterial = (color: string) => {
      const value = new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: true, depthWrite: true, toneMapped: false });
      allocation.materials.push(value); return value;
    };
    const ivory = material('#ede6d4'); const wall = material('#faf5e8'); const wood = material('#aa8660');
    const green = material('#577d62'); const roomFinish = material('#d9dfd5'); const trim = material('#506962'); const circulation = material('#d3d4c8'); const glazing = material('#a9c7c4', .48); const metal = material('#8c9992');
    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, value: THREE.Material) => {
      const geometry = new THREE.BoxGeometry(sx, sy, sz); allocation.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, value); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    const label = (text: string, x: number, y: number, z: number, color = '#233237', active=false) => {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
      const context = canvas.getContext('2d'); if (!context) return;
      context.clearRect(0, 0, 512, 128); if(active){context.fillStyle='#173d3d';context.roundRect(4,12,504,104,18);context.fill();} context.fillStyle = active?'#ffffff':color; context.font = 'bold 64px system-ui'; if(active){const font=Math.max(28,Math.min(64,64*470/Math.max(1,context.measureText(text).width)));context.font=`bold ${font}px system-ui`;} context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 256, 64);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; allocation.textures.push(texture);
      const value = new THREE.SpriteMaterial({ map: texture, depthTest: !active, depthWrite: false, toneMapped: !active }); allocation.materials.push(value);
      const sprite = new THREE.Sprite(value); sprite.position.set(x, y, z); sprite.scale.set(6.3 * (state.largerText ? 1.35 : 1), 1.6 * (state.largerText ? 1.35 : 1), 1); parent.add(sprite);
      sprite.userData.activeBadge=active;sprite.renderOrder=active?30:0; if (allocation === structureResources) structureLabels.push(sprite);
    };
    const segment = (from: THREE.Vector3, to: THREE.Vector3, value: THREE.Material, radius = .2) => {
      const distance = from.distanceTo(to); if (!distance) return;
      const geometry = new THREE.CylinderGeometry(radius, radius, distance, 10); allocation.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, value); mesh.position.copy(from).add(to).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()); mesh.userData.routeEndpoints = [from.y, to.y]; mesh.userData.routeLength = distance; mesh.renderOrder = value === amber ? 12 : 10; parent.add(mesh);
    };
    allocation = routeResources;
    let cyan = routeMaterial('#066b73'); let amber = routeMaterial('#a85d08');
    let moving: THREE.Mesh | undefined;
    let orderedSegments: { from: THREE.Vector3; to: THREE.Vector3; uncertain: boolean; visible: boolean }[] = [];
    let routeSignature = '';
    let liveCamera = boundCamera(state.camera); let cameraFrom = liveCamera; let cameraTo = liveCamera; let cameraStart = 0; let cameraEnd = 0;
    const deformRoutes = () => {
      const offsetAt = (y:number) => {const level=Math.max(0,Math.min(offsets.length-1,(y-.45)/building.floorHeightM)); const lo=Math.floor(level), hi=Math.ceil(level);return (offsets[lo]??0)*(1-(level-lo))+(offsets[hi]??0)*(level-lo);};
      routes.children.forEach(object => {
        if (object === moving) return;
        if (object instanceof THREE.Mesh) {
          if (!object.userData.base) {
            const attribute=object.geometry.attributes.position!;
            const endpoints=object.userData.routeEndpoints as [number,number] | undefined;
            const weights=new Float32Array(attribute.count);
            const anchor=object.position.y;
            for(let i=0;i<attribute.count;i++) {
              if(endpoints) {
                const t=Math.max(0,Math.min(1,attribute.getY(i)/object.userData.routeLength+.5));
                weights[i]=(endpoints[0]+t*(endpoints[1]-endpoints[0])-.45)/building.floorHeightM;
              } else weights[i]=object.userData.anchorLevel ?? Math.round((anchor-.45)/building.floorHeightM);
            }
            object.userData.floorWeights=weights;
            object.updateMatrix(); object.geometry.applyMatrix4(object.matrix); object.position.set(0,0,0); object.quaternion.identity(); object.scale.set(1,1,1); object.updateMatrix(); object.userData.base = Float32Array.from(attribute.array);
          }
          const attribute=object.geometry.attributes.position!; const base=object.userData.base as Float32Array;const weights=object.userData.floorWeights as Float32Array;
          for(let i=0;i<attribute.count;i++) attribute.setY(i,base[i*3+1]!+offsetAt(weights[i]!*building.floorHeightM+.45)); attribute.needsUpdate=true; object.geometry.computeBoundingSphere();
        } else {object.userData.baseY ??= object.position.y; object.position.y=object.userData.baseY+floorOffset(object.userData.anchorLevel??Math.round((object.userData.baseY-.45)/building.floorHeightM));}
      });
    };
    const canRender = () => !disposed && visible && document.visibilityState !== 'hidden';
    const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; container.dataset.animating = 'false'; };
    const cleanup = () => {
      if (disposed) return;
      disposed = true; stop(); resize?.disconnect(); intersection?.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
      renderer?.domElement.removeEventListener('webglcontextlost', contextLost);
      for (const id of pointers.current.keys()) if (container.hasPointerCapture(id)) container.releasePointerCapture(id);
      pointers.current.clear(); runtime.current = null;
      shadow?.dispose(); disposeResources(structureResources); disposeResources(routeResources);
      renderer?.dispose();
      if (renderer && !renderer.getContext().isContextLost()) renderer.forceContextLoss();
      renderer?.domElement.remove();
    };
    const fail = () => { if (!disposed) { document.documentElement.dataset.webglFailure=failureStage; cleanup(); onFailure(); } };
    const contextLost = (event: Event) => { event.preventDefault(); failureStage='context-lost'; fail(); };
    const applyCamera = () => {
      const settings = liveCamera; const angle = settings.yaw * Math.PI / 180;
      const k=cameraEnd?1-(1-Math.min(1,(performance.now()-cameraStart)/(cameraEnd-cameraStart)))**3:1;
      const oldHeight=cameraFrom.preset==='top'?70:cameraFrom.preset==='front'?21:38;
      const newHeight=settings.preset==='top'?70:settings.preset==='front'?21:38;
      const baseHeight=oldHeight+(newHeight-oldHeight)*k;
      const oldRadius=cameraFrom.preset==='top'?.1:52; const newRadius=settings.preset==='top'?.1:52; const baseRadius=oldRadius+(newRadius-oldRadius)*k;
      const baselineElevation = Math.atan2(baseHeight, baseRadius);
      const elevation = !settings.tilt ? baselineElevation : Math.max(.18, Math.min(1.55, baselineElevation + settings.tilt * Math.PI / 180));
      const distance = Math.hypot(baseHeight, baseRadius);
      const height = Math.sin(elevation) * distance; const radius = Math.cos(elevation) * distance;
      view.position.copy(target).add(new THREE.Vector3(Math.sin(angle) * radius, height, Math.cos(angle) * radius));
      view.lookAt(target);
      // Pan in the camera's screen plane so native up/down controls also work in the top preset.
      const offset = new THREE.Vector3(settings.panX, settings.panY, 0).applyQuaternion(view.quaternion);
      view.position.add(offset); view.zoom = settings.zoom; view.lookAt(target.clone().add(offset)); view.updateProjectionMatrix();
      view.updateMatrixWorld();
      const screenPoint=(point:THREE.Vector3)=>{const p=point.project(view);return {x:(p.x+1)*container.clientWidth/2,y:(1-p.y)*container.clientHeight/2};};
      const routePixels=state.result.status==='ok'?state.result.nodeIds.map(id=>{const p=position(id);p.y+=floorOffset(nodes.get(id)!.floor);return screenPoint(p);}):[];
      const intersects=(a:{x:number;y:number},b:{x:number;y:number},r:{x:number;y:number})=>{let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;const ps=[-dx,dx,-dy,dy],qs=[a.x-r.x,r.x+142-a.x,a.y-r.y,r.y+44-a.y];for(let i=0;i<4;i++){if(Math.abs(ps[i]!)<.00001){if(qs[i]!<0)return false;}else{const t=qs[i]!/ps[i]!;if(ps[i]!<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}}return true;};
      const occupied:{x:number;y:number}[]=[];
      for(const child of routes.children)if(child instanceof THREE.Sprite&&child.userData.activeBadge){
        const unit=(view.top-view.bottom)/view.zoom/Math.max(1,container.clientHeight);child.scale.set(130*unit,32*unit,1);const node=nodes.get(child.userData.badgeNode);if(!node)continue;
        child.position.copy(position(node.id));child.position.y+=floorOffset(node.floor);const anchor=screenPoint(child.position.clone());
        const candidates=[[90,0],[-90,0],[0,-44],[0,44],[90,-44],[-90,-44],[90,44],[-90,44]];
        let best=candidates[0]!,score=Infinity;
        for(const candidate of candidates){const r={x:anchor.x+candidate[0]!-71,y:anchor.y-candidate[1]!-22};let cost=candidates.indexOf(candidate);
          if(r.x<4||r.x+142>container.clientWidth-4||r.y<4||r.y+44>container.clientHeight-4)cost+=10000;
          for(let i=1;i<routePixels.length;i++)if(intersects(routePixels[i-1]!,routePixels[i]!,r))cost+=1000;
          for(const other of occupied)if(Math.abs(other.x-r.x)<142&&Math.abs(other.y-r.y)<44)cost+=1000;
          if(cost<score){score=cost;best=candidate;}
        }
        occupied.push({x:anchor.x+best[0]!-71,y:anchor.y-best[1]!-22});child.position.add(new THREE.Vector3(best[0]!*unit,best[1]!*unit,0).applyQuaternion(view.quaternion));
      }
      container.dataset.camera = JSON.stringify(settings); container.dataset.cameraTarget = JSON.stringify(target.toArray());
    };
    const draw = () => {
      if (!renderer || !canRender()) return;
      try { failureStage='render'; applyCamera(); renderer.render(scene, view);
        if(import.meta.env.DEV && !cameraEnd && !revealEnd && !floorEnd && performance.now()>=burstEnd){
        const projectedBounds=(objects:THREE.Object3D[])=>{let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const object of objects){if(!object.visible)continue;const bounds=new THREE.Box3().setFromObject(object);if(bounds.isEmpty())continue;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new THREE.Vector3(x,y,z).project(view);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}}return {minX,minY,maxX,maxY};};
        container.dataset.routeScreenBounds=JSON.stringify(projectedBounds(routes.children));
        container.dataset.routeScreenPoints=JSON.stringify(state.result.status==='ok'?state.result.nodeIds.map(id=>{const node=nodes.get(id)!;const p=position(id);p.y+=floorOffset(node.floor);p.project(view);return {id,x:(p.x+1)*container.clientWidth/2,y:(1-p.y)*container.clientHeight/2};}):[]);
        container.dataset.activeBadgeBounds=JSON.stringify(routes.children.filter(o=>o instanceof THREE.Sprite&&o.userData.activeBadge).map(o=>{const p=o.position.clone().project(view);return {id:o.userData.badgeNode,x:(p.x+1)*container.clientWidth/2-65,y:(1-p.y)*container.clientHeight/2-16,width:130,height:32};}));
        container.dataset.modelScreenBounds=JSON.stringify(projectedBounds([...floorGroups.values()]));
        }
        container.dataset.renderStats = JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,dpr:renderer.getPixelRatio(),shadowMap:1024}); container.dataset.renderCount = String(++renderCount); dirty = false; }
      catch { fail(); }
    };
    const settleFloor = (time: number) => {
      if (!floorEnd) return false;
      const progress = Math.max(0, Math.min(1, (time - floorStart) / (floorEnd - floorStart)));
      target.copy(floorFrom).lerp(floorTo, 1 - (1 - progress) ** 3);
      if (progress === 1) floorEnd = 0;
      return floorEnd > 0;
    };
    const animate = (time: number) => {
      frame = 0;
      if (!canRender()) return;
      let easing = settleFloor(time);
      if(cameraEnd){const t=Math.min(1,(time-cameraStart)/(cameraEnd-cameraStart)); const k=1-(1-t)**3;
        liveCamera={...cameraTo,yaw:cameraFrom.yaw+(cameraTo.yaw-cameraFrom.yaw)*k,zoom:cameraFrom.zoom+(cameraTo.zoom-cameraFrom.zoom)*k,panX:cameraFrom.panX+(cameraTo.panX-cameraFrom.panX)*k,panY:cameraFrom.panY+(cameraTo.panY-cameraFrom.panY)*k,tilt:(cameraFrom.tilt??0)+((cameraTo.tilt??0)-(cameraFrom.tilt??0))*k};if(t===1)cameraEnd=0;else easing=true;
      }
      if(revealEnd){const t=Math.min(1,(time-revealStart)/(revealEnd-revealStart)),k=1-(1-t)**3;
        offsets.forEach((_,i)=>offsets[i]=offsetFrom[i]!+(offsetTo[i]!-offsetFrom[i]!)*k);
        floorAlpha.forEach((_,i)=>floorAlpha[i]=alphaFrom[i]!+(alphaTo[i]!-alphaFrom[i]!)*k);
        floorGroups.forEach((group,id)=>{group.position.y=floorOffset(id);});applyFloorAppearance();deformRoutes();
        container.dataset.floorOffsets=JSON.stringify(offsets);if(t===1)revealEnd=0;else easing=true;
      }
      const running = state.motionAllowed && time < burstEnd && orderedSegments.length > 0;
      if (moving) {
        moving.visible = running;
        if (running) {
          const progress = Math.min(.999999, Math.max(0, (time - burstStart) / (burstEnd - burstStart))) * orderedSegments.length;
          const part = orderedSegments[Math.floor(progress)]!;
          // An explanatory direction marker follows ordered result nodes, never edge.from/to or a real position.
          moving.position.copy(part.from).lerp(part.to, progress % 1); moving.position.y += .6 + continuousOffset(moving.position.y);
          moving.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), part.to.clone().sub(part.from).normalize());
          moving.material = part.uncertain ? amber : cyan; moving.visible = part.visible;
        }
      }
      draw();
      if (!disposed && (easing || running)) { container.dataset.animating = 'true'; frame = requestAnimationFrame(animate); }
      else { container.dataset.animating = 'false'; }
    };
    const schedule = () => {
      if (!canRender() || frame) return;
      const now = performance.now();
      if (state.motionAllowed && (floorEnd > now || burstEnd > now || revealEnd > now || cameraEnd > now)) { container.dataset.animating = 'true'; frame = requestAnimationFrame(animate); }
      else { if (moving) moving.visible = false; if (dirty) draw(); container.dataset.animating = 'false'; }
    };
    const suspend = () => {
      stop(); burstEnd = 0; floorEnd = 0; cameraEnd = 0; liveCamera = cameraTo; revealEnd = 0; offsets.forEach((_,i)=>offsets[i]=offsetTo[i]!); floorAlpha.forEach((_,i)=>floorAlpha[i]=alphaTo[i]!); floorGroups.forEach((group,id)=>{group.position.y=floorOffset(id);}); applyFloorAppearance(); deformRoutes(); target.copy(floorTo); if (moving) moving.visible = false; dirty = true;
      for (const id of pointers.current.keys()) if (container.hasPointerCapture(id)) container.releasePointerCapture(id);
      pointers.current.clear(); container.dataset.dragging = 'false';
    };
    const visibilityChanged = () => { if (document.visibilityState === 'hidden') suspend(); else schedule(); };
    const rebuildRoutes = () => {
      routes.clear(); disposeResources(routeResources); routeResources = resources(); allocation = routeResources; parent = routes;
      cyan = routeMaterial('#066b73'); amber = routeMaterial('#a85d08');
      const direction = routeMaterial('#233237'); const selected = routeMaterial('#f5f2e9');
      const uncertain = new Set(state.result.status === 'ok' ? state.result.uncertainEdgeIds : []);
      orderedSegments = [];
      if (state.result.status === 'ok') {
        for (const [index, id] of state.result.edgeIds.entries()) {
          const from = nodes.get(state.result.nodeIds[index]!)!; const to = nodes.get(state.result.nodeIds[index + 1]!)!;
          const start = position(from.id); const end = position(to.id);
          const included = state.floor === 'all' || from.floor === state.floor || to.floor === state.floor;
          orderedSegments.push({ from: start, to: end, uncertain: uncertain.has(id), visible: included });
          if (!included) continue;
          if (uncertain.has(id)) {
            // Keep baseline dashed geometry and gaps; direction arrows sit on the known adjacent segments.
            const edge = edges.get(id)!; const baselineStart = position(edge.from); const baselineEnd = position(edge.to);
            for (let part = 0; part < 12; part += 2) {
              const dashFrom = baselineStart.clone().lerp(baselineEnd, part / 12); const dashTo = baselineStart.clone().lerp(baselineEnd, (part + 1) / 12);
              if (state.highlight?.edgeId === id) segment(dashFrom, dashTo, selected, state.largerText ? .48 : .34);
              segment(dashFrom, dashTo, amber, state.largerText ? .32 : .2);
            }
          } else {
            if (state.highlight?.edgeId === id) segment(start, end, selected, state.largerText ? .48 : .34);
            segment(start, end, cyan, state.largerText ? .32 : .2);
            const geometry = new THREE.ConeGeometry(.42, 1, 3); allocation.geometries.push(geometry);
            const arrow = new THREE.Mesh(geometry, direction); arrow.position.copy(start).lerp(end, .72); arrow.position.y += .55; arrow.userData.anchorLevel=(start.y*.28+end.y*.72-.45)/building.floorHeightM;
            arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()); arrow.renderOrder = 14; routes.add(arrow);
          }
        }
        for (const [index, id] of state.result.nodeIds.entries()) {
          const node = nodes.get(id)!; if (state.floor !== 'all' && node.floor !== state.floor) continue;
          const destination = index === state.result.nodeIds.length - 1 && index > 0;
          const geometry = destination ? new THREE.BoxGeometry(.9, .9, .9) : new THREE.SphereGeometry(index === 0 ? .5 : .25, 12, 8); allocation.geometries.push(geometry);
          const point = new THREE.Mesh(geometry, destination ? direction : cyan); point.position.copy(position(id)); point.renderOrder = 13; routes.add(point);
        }
      }
      const highlightedEdge = state.highlight?.edgeId ? edges.get(state.highlight.edgeId) : undefined;
      const highlightedNodes = highlightedEdge && nodes.get(highlightedEdge.from)!.floor !== nodes.get(highlightedEdge.to)!.floor ? [highlightedEdge.from, highlightedEdge.to] : state.highlight ? [state.highlight.nodeId] : [];
      for (const id of highlightedNodes) {
        const node = nodes.get(id)!;
        if (state.floor === 'all' || node.floor === state.floor) {
          const geometry = new THREE.TorusGeometry(.85, .14, 8, 24); allocation.geometries.push(geometry);
          const ring = new THREE.Mesh(geometry, direction); ring.position.copy(position(node.id)); ring.rotation.x = Math.PI / 2; ring.renderOrder = 16; routes.add(ring);
        }
      }
      for (const id of state.closedEdgeIds) {
        const edge = edges.get(id)!; const from = nodes.get(edge.from)!; const to = nodes.get(edge.to)!;
        if (state.floor !== 'all' && from.floor !== state.floor && to.floor !== state.floor) continue;
        const middle = position(edge.from).add(position(edge.to)).multiplyScalar(.5); label('×', middle.x, middle.y + 1, middle.z, '#ffc777');
      }
      const badgeIds=state.routeReveal&&state.result.status==='ok'?[state.result.nodeIds[0]!,state.result.nodeIds.at(-1)!]:state.highlight?[state.highlight.nodeId]:[];
      for(const id of new Set(badgeIds)){const node=nodes.get(id);if(!node)continue;label(nodeLabelRu(node.id,node.label,node.labelKk),node.x,node.floor*building.floorHeightM+2.8,node.z,'#fff',true);const badge=routes.children.at(-1)!;badge.userData.anchorLevel=node.floor;badge.userData.badgeNode=id;}
      const geometry = new THREE.ConeGeometry(.3, .8, 3); allocation.geometries.push(geometry);
      moving = new THREE.Mesh(geometry, cyan); moving.renderOrder = 15; moving.visible = false; routes.add(moving);
      container.dataset.directionNodes = state.result.status === 'ok' ? state.result.nodeIds.join(',') : '';
      container.dataset.highlightNode = state.highlight?.nodeId ?? ''; container.dataset.highlightEdge = state.highlight?.edgeId ?? '';
      container.dataset.routeRadius = String(state.largerText ? .32 : .2);
    };
    const update = (next: VisualState) => {
      if (disposed) return;
      const now = performance.now(); settleFloor(now);
      const floorChanged = state.floor !== next.floor || state.expanded !== next.expanded || state.cameraTransitionId !== next.cameraTransitionId || JSON.stringify(state.camera.target) !== JSON.stringify(next.camera.target);
      const revealChanged = state.floor !== next.floor || state.expanded !== next.expanded || state.routeReveal !== next.routeReveal;
      const autoCamera = state.cameraTransitionId !== next.cameraTransitionId;
      const cameraChanged = JSON.stringify(state.camera)!==JSON.stringify(next.camera);
      state = next;
      if(autoCamera && state.motionAllowed){cameraFrom=liveCamera;cameraTo=boundCamera(state.camera);cameraStart=now;cameraEnd=now+420;}
      else if(cameraChanged || !state.motionAllowed){liveCamera=boundCamera(state.camera);cameraEnd=0;}
      if(revealChanged){alphaFrom=[...floorAlpha];alphaTo=building.floors.map(f=>state.floor!=='all'&&f.id!==state.floor?0:state.routeReveal?.24:1);offsetFrom=[...offsets];offsetTo=building.floors.map(f=>state.floor==='all'?(state.expanded?f.id*5:0):(f.id>state.floor?14:0));revealStart=now;revealEnd=state.motionAllowed&&canRender()?now+460:0;if(!revealEnd){offsets.forEach((_,i)=>offsets[i]=offsetTo[i]!);floorAlpha.forEach((_,i)=>floorAlpha[i]=alphaTo[i]!);}}

      for (const sprite of structureLabels) sprite.scale.set(6.3 * (state.largerText ? 1.35 : 1), 1.6 * (state.largerText ? 1.35 : 1), 1);
      if (floorChanged) {
        floorFrom.copy(target);
        const center = boundCamera(state.camera).target;
        floorTo.set(center?.x ?? 16, (center?.y ?? (state.floor === 'all' ? 4 : state.floor * building.floorHeightM)) + (state.floor === 'all' && state.expanded ? 5 : 0), center?.z ?? 11);
        floorStart = now; floorEnd = state.motionAllowed && canRender() && autoCamera ? now + 420 : 0;
        if (!floorEnd) target.copy(floorTo);
      }
      floorGroups.forEach((group, id) => { group.position.y = floorOffset(id); });
      applyFloorAppearance();
      const signature = JSON.stringify([state.result.status === 'ok' ? [state.result.nodeIds, state.result.uncertainEdgeIds] : [], state.floor, state.expanded, state.routeReveal, state.closedEdgeIds, state.highlight, state.largerText]);
      if (signature !== routeSignature) {
        routeSignature = signature; rebuildRoutes(); deformRoutes(); burstStart = now;
        burstEnd = state.motionAllowed && canRender() && orderedSegments.length ? now + 1600 : 0;
      }
      if (!state.motionAllowed) { stop(); revealEnd=0; offsets.forEach((_,i)=>offsets[i]=offsetTo[i]!); floorAlpha.forEach((_,i)=>floorAlpha[i]=alphaTo[i]!); floorGroups.forEach((group,id)=>{group.position.y=floorOffset(id);}); applyFloorAppearance(); deformRoutes(); floorEnd = 0; target.copy(floorTo); burstEnd = 0; if (moving) moving.visible = false; }
      scene.background = new THREE.Color(state.theme === 'dark' ? '#222e32' : '#e2e9e5');
      container.dataset.routeReveal=String(Boolean(state.routeReveal)); container.dataset.floor = String(state.floor); container.dataset.floorMode = state.floor !== 'all' ? 'focused' : state.expanded ? 'expanded' : 'assembled'; container.dataset.floorOffsets = JSON.stringify(building.floors.map(f => floorOffset(f.id))); container.dataset.cameraTransition = String(state.cameraTransitionId); dirty = true; schedule();
    };
    try {
      failureStage='context-creation'; renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.domElement.setAttribute('aria-hidden', 'true'); renderer.domElement.dataset.testid = 'diorama-canvas';
      renderer.domElement.addEventListener('webglcontextlost', contextLost); container.append(renderer.domElement);
      scene.add(new THREE.HemisphereLight('#f7f2df', '#384b53', 1.8));
      const sun = new THREE.DirectionalLight('#fff4dc', 2.1); sun.position.set(-10, 45, 25); sun.castShadow = true; shadow = sun.shadow;
      sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias=-.0005; sun.shadow.normalBias=.035; Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 }); scene.add(sun);
      allocation = structureResources;
      const surroundings = parent = new THREE.Group(); scene.add(surroundings);
      box(42, .6, 31, 16, -.75, 12, material('#374747'));
      for (const level of building.floors) {
        const group = parent = new THREE.Group(); scene.add(group); floorGroups.set(level.id, group);
        const h = level.id * building.floorHeightM;
        const slab = material('#eee8d9', 1); floorSlabs.set(level.id, slab);
        if(level.id===0) box(32,.38,23,16,h-.22,11.5,slab);
        else {
          // Physical shaft voids in upper slabs, including the stair landing/return flight.
          const outline=new THREE.Shape();outline.moveTo(0,0);outline.lineTo(32,0);outline.lineTo(32,23);outline.lineTo(0,23);outline.closePath();
          const holes=building.nodes.filter(n=>n.floor===level.id&&n.kind==='lift').map(n=>({x:n.x-1.2,z:n.z-1.2,w:2.4,d:2.4}));
          const stairNode=building.nodes.find(n=>n.floor===level.id&&n.kind==='stairs');if(stairNode)holes.push({x:stairNode.x-1.45,z:stairNode.z-.3,w:2.9,d:4.9});
          for(const r of holes){const hole=new THREE.Path();hole.moveTo(r.x,r.z);hole.lineTo(r.x,r.z+r.d);hole.lineTo(r.x+r.w,r.z+r.d);hole.lineTo(r.x+r.w,r.z);hole.closePath();outline.holes.push(hole);}
          const geometry=new THREE.ExtrudeGeometry(outline,{depth:.38,bevelEnabled:false,steps:1});geometry.rotateX(Math.PI/2);geometry.translate(0,h-.03,0);allocation.geometries.push(geometry);
          const mesh=new THREE.Mesh(geometry,slab);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
        }
        box(32,.08,.12,16,h-.42,23,trim);
        // Thin inset circulation ribbons follow only existing graph edges.
        for(const edge of building.edges){const a=nodes.get(edge.from)!,b=nodes.get(edge.to)!;if(a.floor!==level.id||b.floor!==level.id)continue;
          const length=Math.hypot(b.x-a.x,b.z-a.z); const ux=(b.x-a.x)/length,uz=(b.z-a.z)/length;
          const inset=(n:typeof a)=>level.id>0&&(n.kind==='lift'||n.kind==='stairs')?1.8:0;
          const start=inset(a),end=inset(b); const span=Math.max(.01,length-start-end);
          const ribbon=box(span,.018,1.65,(a.x+b.x)/2+ux*(start-end)/2,h+.025,(a.z+b.z)/2+uz*(start-end)/2,circulation);ribbon.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);
          for(const side of [-1,1]){const border=box(Math.max(.01,span-2.4),.012,.035,ribbon.position.x-uz*side*.825,h+.04,ribbon.position.z+ux*side*.825,wood);border.rotation.y=ribbon.rotation.y;}
        }
        // Rear glazed elevation creates a readable architectural silhouette; open front remains a cutaway.
        for(let bay=0;bay<8;bay++) {const x=2+bay*4;
          box(3.65,1.45,.07,x,h+1.6,.13,glazing);
          box(.12,2.45,.25,x-1.9,h+1.22,.13,trim);
          box(3.8,.12,.26,x,h+2.45,.13,ivory);
        }
        box(32,.16,.3,16,h+2.55,.13,ivory);
        for(const x of [0,32])for(const z of [4,10,16,22]){box(.23,2.5,.23,x,h+1.25,z,ivory);}

        box(32, .6, .25, 16, h + .22, 0, ivory); box(.25, .6, 23, 0, h + .22, 11.5, ivory); box(.25, .6, 23, 32, h + .22, 11.5, ivory);
        const architecture = createFloorArchitecture(building, level.id);
        for (const room of architecture.rooms) box(room.width,.06,room.depth,room.x,h+.02,room.z,roomFinish);
        for (const w of architecture.walls) {box(Math.max(.16,Math.abs(w.x2-w.x1)),1.65,Math.max(.16,Math.abs(w.z2-w.z1)),(w.x1+w.x2)/2,h+.825,(w.z1+w.z2)/2,wall);box(Math.max(.19,Math.abs(w.x2-w.x1)),.08,Math.max(.19,Math.abs(w.z2-w.z1)),(w.x1+w.x2)/2,h+.06,(w.z1+w.z2)/2,wood);}
        for (const door of architecture.doors) {
          const horizontal=door.axis==='x';
          box(horizontal?door.width:.18,.035,horizontal?.18:door.width,door.x,h+.09,door.z,wood);
          for(const side of [-1,1])box(.12,1.9,.12,door.x+(horizontal?side*door.width/2:0),h+.95,door.z+(horizontal?0:side*door.width/2),trim);
          box(horizontal?door.width+.12:.16,.14,horizontal?.16:door.width+.12,door.x,h+1.95,door.z,trim);
        }
        for (const lift of ['a','b']) { const node=nodes.get(`lift-${lift}-${level.id}`)!;

          for(const side of [-1,1]){box(2.9,.1,.12,node.x,h+2.35,node.z+side*1.39,trim);box(.12,.1,2.9,node.x+side*1.39,h+2.35,node.z,trim);}
          if(level.id===0)box(2.25,.04,2.25,node.x,h+.08,node.z,metal);
          box(.5,.22,.06,node.x,h+1.98,node.z-1.45,trim);
          label(lift.toUpperCase(),node.x,h+2.65,node.z,'#344a4a');
        }
        const stair=building.nodes.find(n=>n.floor===level.id&&n.kind==='stairs');
        if(stair && level.id<building.floors.length-1){
          // A two-flight stair occupies its declared graph node and extends away from the approach.
          const rise=building.floorHeightM/20;
          const slope=Math.atan2(building.floorHeightM/2,4); const run=Math.hypot(building.floorHeightM/2,4);
          const lowerSupport=box(1.2,.12,run,stair.x-.7,h+building.floorHeightM/4-.14,stair.z+1.8,ivory);lowerSupport.rotation.x=-slope;
          if(level.id<building.floors.length-1){const upperSupport=box(1.2,.12,run,stair.x+.7,h+building.floorHeightM*.75-.14,stair.z+1.8,ivory);upperSupport.rotation.x=slope;}

          for(let step=0;step<10;step++){
            box(1.25,rise,.4,stair.x-.7,h+rise*(step+.5),stair.z+step*.4,ivory);
            if(level.id<building.floors.length-1)box(1.25,rise,.4,stair.x+.7,h+rise*(19.5-step),stair.z+step*.4,ivory);
          }
          box(2.8,.18,.8,stair.x,h+building.floorHeightM/2,stair.z+4.1,ivory);
          box(.06,1.15,4.6,stair.x-1.4,h+.65,stair.z+2,metal);
          label('↗',stair.x,h+1.7,stair.z-.7,'#344a4a');
        }
        if(stair && level.id===building.floors.length-1){
          // Final landing only: there is no fictitious staircase above the top storey.
          for(const side of [-1,1]){box(.06,.95,4.6,stair.x+side*1.45,h+.5,stair.z+2.05,metal);}
          box(2.9,.1,.12,stair.x,h+1,stair.z+4.5,trim);
          label('↘',stair.x,h+1.4,stair.z-.7,'#344a4a');
        }
        if(level.id===0){const entry=nodes.get('entrance');if(entry){
          box(4.6,.14,2.2,entry.x,h+2.7,23.6,trim);
          for(const side of [-1,1])box(.16,2.7,.16,entry.x+side*2,h+1.35,24.3,trim);
          box(3.4,.06,2.5,entry.x,h+.01,23.6,circulation);
          label('ITER',entry.x,h+3.25,24,'#344a4a');
        }}
        label(`${level.id + 1} ${locale==='kk'?'ҚАБАТ':'ЭТАЖ'}`, -2.6, h + .7, 18, '#d3e3dc');
        for (const node of building.nodes.filter(item => item.floor === level.id && item.kind === 'room')) label(/^room-\d+$/.test(node.id)?node.id.replace('room-', ''):nodeLabelRu(node.id,node.label,node.labelKk), node.x, h + 1.2, node.z);
      }
      parent = surroundings;
      for (const [x, z] of [[-2, 5], [-2, 14], [35, 7], [35, 19], [2, 26], [26, 26]]) {
        box(.3, 1.8, .3, x!, .5, z!, wood); const geometry = new THREE.IcosahedronGeometry(1.3, 1); allocation.geometries.push(geometry);
        const canopy = new THREE.Mesh(geometry, green); canopy.position.set(x!, 2, z!); canopy.castShadow = true; surroundings.add(canopy);
      }
      // One Higgsfield-generated, low-contrast albedo. Geometry and route data stay controlled.
      // Normalize slab UVs to an 8m architectural material scale, including shaft-cut upper slabs.
      floorGroups.forEach((group,id)=>group.traverse(object=>{
        if (!(object instanceof THREE.Mesh) || object.material !== floorSlabs.get(id)) return;
        const positions=object.geometry.getAttribute('position'); const uv=new Float32Array(positions.count*2);
        for(let i=0;i<positions.count;i++){uv[i*2]=positions.getX(i)/8;uv[i*2+1]=positions.getZ(i)/8;}
        object.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
      }));
      // Batch static architecture within each animated floor, never across floors or route objects.
      // Keep transparent panes separately sortable and retain original material identities for async textures.
      const compact = (group:THREE.Group) => {
        const batches=new Map<string,THREE.Mesh[]>();
        for(const object of group.children){
          if(!(object instanceof THREE.Mesh)||Array.isArray(object.material)||object.material.transparent)continue;
          const key=object.material.uuid+':'+object.castShadow+':'+object.receiveShadow;
          const batch=batches.get(key)??[];batch.push(object);batches.set(key,batch);
        }
        for(const meshes of batches.values()){
          if(meshes.length<2)continue;
          const prepared=meshes.map(mesh=>{mesh.updateMatrix();const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geometry.applyMatrix4(mesh.matrix);geometry.clearGroups();return geometry;});
          const merged=mergeGeometries(prepared,false);prepared.forEach(g=>g.dispose());if(!merged)continue;
          const first=meshes[0]!;const mesh=new THREE.Mesh(merged,first.material);mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;group.add(mesh);structureResources.geometries.push(merged);
          for(const old of meshes){group.remove(old);const i=structureResources.geometries.indexOf(old.geometry);if(i>=0)structureResources.geometries.splice(i,1);old.geometry.dispose();}
        }
      };
      floorGroups.forEach(compact);compact(surroundings);
      floorGroups.forEach((group,id)=>{const clones=new Map<THREE.Material,THREE.Material>();const entries:{material:THREE.Material;base:number;depth?:THREE.MeshDepthMaterial}[]=[];
        group.children.forEach(object=>{if(object instanceof THREE.Sprite){entries.push({material:object.material,base:object.material.opacity});return;}if(!(object instanceof THREE.Mesh)||Array.isArray(object.material))return;const original=object.material;const clone:THREE.Material=clones.get(original)??original.clone();if(!clones.has(original)){clones.set(original,clone);structureResources.materials.push(clone);}object.material=clone;
          if(original===floorSlabs.get(id))floorSlabs.set(id,clone as THREE.MeshStandardMaterial);
          const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});depth.alphaHash=true;depth.userData.fade={value:1};depth.onBeforeCompile=shader=>{shader.uniforms.uFloorFade=depth.userData.fade;shader.fragmentShader='uniform float uFloorFade;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <alphahash_fragment>','diffuseColor.a *= uFloorFade;\n#include <alphahash_fragment>');};depth.customProgramCacheKey=()=> 'floor-shadow-fade-v1';object.customDepthMaterial=depth;structureResources.materials.push(depth);entries.push({material:clone,base:clone.opacity,depth});
        });floorMaterials.set(id,entries);
      });
      container.dataset.materialSource='procedural-loading';
      const stone=new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/iter-limestone.webp`,texture=>{
        if(disposed){texture.dispose();return;}
        texture.colorSpace=THREE.SRGBColorSpace; texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
        texture.anisotropy=Math.min(4,renderer?.capabilities.getMaxAnisotropy()??1);
        floorSlabs.forEach(slab=>{slab.map=texture;slab.color.set('#ffffff');slab.roughness=.88;slab.needsUpdate=true;});
        container.dataset.materialSource='higgsfield-limestone'; dirty=true;schedule();
      },undefined,()=>{if(!disposed)container.dataset.materialSource='procedural-fallback';});
      structureResources.textures.push(stone);
      const resizeScene = () => {
        if (disposed || !renderer) return;
        try {
          const width = Math.max(container.clientWidth, 1); const height = Math.max(container.clientHeight, 1);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.setSize(width, height, false); const aspect = width / height;
          view.left = -CAMERA_HALF_HEIGHT * aspect; view.right = CAMERA_HALF_HEIGHT * aspect; view.top = CAMERA_HALF_HEIGHT; view.bottom = -CAMERA_HALF_HEIGHT; view.updateProjectionMatrix(); dirty = true; schedule();
        } catch { fail(); }
      };
      resize = new ResizeObserver(resizeScene); resize.observe(container);
      intersection = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); if (!visible) suspend(); else schedule(); }); intersection.observe(container);
      document.addEventListener('visibilitychange', visibilityChanged);
      runtime.current = { update, interrupt: () => { cameraEnd=0; floorEnd=0; floorTo.copy(target); const snapshot={...liveCamera,target:{x:target.x,y:target.y-(state.floor==='all'&&state.expanded?5:0),z:target.z}}; latest.current={...latest.current,camera:snapshot}; onCameraChange(snapshot); } }; resizeScene(); update(latest.current);
    } catch { fail(); }
    return cleanup;
  }, [building, onFailure, onCameraChange, locale, nodeLabelRu]);
  const endGesture = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    for (const pointer of pointers.current.values()) { pointer.startX=pointer.x; pointer.startY=pointer.y; pointer.axis=gesturesEnabled?'rotate':'pending'; }
    event.currentTarget.dataset.dragging = String(pointers.current.size > 0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div ref={host} className="diorama" tabIndex={-1} style={{ touchAction: gesturesEnabled ? 'none' : 'pan-y' }} data-gestures={String(gesturesEnabled)} role="img" aria-label={locale==='kk'?'Ойдан шығарылған ғимараттың үшөлшемді моделі. Көрсеткілер адамның орнын емес, бағыт ретін көрсетеді. Барлық әрекет батырмалар арқылы қолжетімді.':'Авторская трёхмерная модель вымышленного здания. Стрелки показывают порядок маршрута, не положение человека. Все действия доступны кнопками, маршрут — в тексте и на схеме.'} data-route-ids={result.status === 'ok' ? result.edgeIds.join(',') : ''}
    onContextMenu={event => event.preventDefault()}
    onPointerDown={event => {
      const touch = event.pointerType === 'touch';
      if (touch ? pointers.current.size >= 2 : !event.isPrimary || ![0, 1, 2].includes(event.button)) return;
      if (!touch || gesturesEnabled || pointers.current.size > 0) runtime.current?.interrupt();
      pointers.current.set(event.pointerId, { x:event.clientX, y:event.clientY, startX:event.clientX, startY:event.clientY, touch, button:event.button, axis:touch&&!gesturesEnabled?'pending':'rotate' });
      if (!touch || gesturesEnabled) event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.dragging = 'true';
    }}
    onPointerMove={event => {
      const pointer = pointers.current.get(event.pointerId); if (!pointer) return;
      const before = [...pointers.current.values()].map(point => ({ ...point }));
      const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y;
      pointer.x = event.clientX; pointer.y = event.clientY;
      if (pointer.touch && before.length === 1 && !gesturesEnabled && pointer.axis === 'pending') {
        const totalX=event.clientX-pointer.startX, totalY=event.clientY-pointer.startY;
        if (Math.hypot(totalX,totalY)<7) return;
        if (Math.abs(totalY)>Math.abs(totalX)) { endGesture(event); return; }
        pointer.axis='rotate'; runtime.current?.interrupt();
      }
      const after = [...pointers.current.values()]; const current = latest.current.camera;
      let next: CameraState;
      if (pointer.touch && before.length === 2) {
        const oldCenter = { x:(before[0]!.x+before[1]!.x)/2, y:(before[0]!.y+before[1]!.y)/2 };
        const center = { x:(after[0]!.x+after[1]!.x)/2, y:(after[0]!.y+after[1]!.y)/2 };
        const distance = (points:typeof before) => Math.hypot(points[0]!.x-points[1]!.x,points[0]!.y-points[1]!.y);
        const previousDistance=distance(before); const ratio=previousDistance>1?distance(after)/previousDistance:1;
        next=boundCamera({...panCamera(current,center.x-oldCenter.x,center.y-oldCenter.y,event.currentTarget.clientHeight),zoom:current.zoom*ratio});
      } else next=pointer.button===1||pointer.button===2?panCamera(current,dx,dy,event.currentTarget.clientHeight):dragCamera(current,dx,pointer.touch&&!gesturesEnabled?0:dy);
      latest.current={...latest.current,camera:next}; onCameraChange(next);
    }} onPointerUp={endGesture} onPointerCancel={endGesture} onLostPointerCapture={endGesture} />;
}

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { useI18n } from '../i18n/locale';
import * as THREE from 'three';
import type { Building, RouteResult } from '../domain/model';
import { boundCamera, dragCamera, panCamera, wheelCamera } from '../ui/camera';
import { createFloorArchitecture } from '../ui/architecture';
import type { CameraState } from '../ui/camera';

interface VisualState { expanded?: boolean; cameraTransitionId?: number; result: RouteResult; floor: 'all' | number; closedEdgeIds: string[]; camera: CameraState; motionAllowed: boolean; theme: 'dark' | 'light'; largerText: boolean; highlight: { nodeId: string; edgeId?: string } | null; gesturesEnabled: boolean }
interface Props extends VisualState { onSelectNode?: (id:string)=>void; building: Building; gestureReset: number; onFailure: () => void; onCameraChange: (value: CameraState) => void }
interface Resources { geometries: THREE.BufferGeometry[]; materials: THREE.Material[]; textures: THREE.Texture[] }
const resources = (): Resources => ({ geometries: [], materials: [], textures: [] });
const disposeResources = (value: Resources) => { value.geometries.forEach(item => item.dispose()); value.materials.forEach(item => item.dispose()); value.textures.forEach(item => item.dispose()); };

export default function Diorama({ building, result, floor, closedEdgeIds, camera, motionAllowed, theme, largerText, highlight, gesturesEnabled, gestureReset, expanded = false, cameraTransitionId = 0, onFailure, onCameraChange }: Props) {
  const {locale,nodeLabelRu}=useI18n();
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<{ update: (next: VisualState) => void; interrupt: () => void } | null>(null);
  const latest = useRef<VisualState>({ result, floor, closedEdgeIds, camera, motionAllowed, theme, largerText, highlight, gesturesEnabled, expanded, cameraTransitionId });
  const pointers = useRef(new Map<number, { x: number; y: number; touch: boolean; button: number }>());
  useLayoutEffect(() => {
    const container = host.current; const ids = [...pointers.current.keys()]; pointers.current.clear();
    for (const id of ids) if (container?.hasPointerCapture(id)) container.releasePointerCapture(id);
    if (container) container.dataset.dragging = 'false';
  }, [gestureReset]);
  useLayoutEffect(() => {
    latest.current = { result, floor, closedEdgeIds, camera, motionAllowed, theme, largerText, highlight, gesturesEnabled, expanded, cameraTransitionId };
    runtime.current?.update(latest.current);
    if (!gesturesEnabled) for (const [id, pointer] of pointers.current) if (pointer.touch) {
      pointers.current.delete(id); if (host.current?.hasPointerCapture(id)) host.current.releasePointerCapture(id);
    }
    if (host.current) host.current.dataset.dragging = String(pointers.current.size > 0);
  }, [result, floor, closedEdgeIds, camera, motionAllowed, theme, largerText, highlight, gesturesEnabled, expanded, cameraTransitionId]);
  useEffect(() => {
    const container = host.current; if (!container) return;
    const wheel = (event: WheelEvent) => {
      if (!latest.current.gesturesEnabled) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      onCameraChange(wheelCamera(latest.current.camera, delta));
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
    const offsets = building.floors.map(() => 0);
    let revealEnd = 0; let revealStart = 0; let offsetFrom = [...offsets]; let offsetTo = [...offsets];
    const floorOffset = (id:number) => offsets[id] ?? 0;
    const continuousOffset = (y:number) => {const level=Math.max(0,Math.min(offsets.length-1,(y-.45)/building.floorHeightM));const lo=Math.floor(level),hi=Math.ceil(level);return floorOffset(lo)*(1-(level-lo))+floorOffset(hi)*(level-lo);};
    const position = (id: string) => { const node = nodes.get(id)!; return new THREE.Vector3(node.x, node.floor * building.floorHeightM + .45, node.z); };
    const initialTarget = boundCamera(state.camera).target;
    const target = new THREE.Vector3(initialTarget?.x ?? 16, initialTarget?.y ?? (state.floor === 'all' ? 4 : state.floor * building.floorHeightM), initialTarget?.z ?? 11);
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
    const green = material('#577d62'); const roomFinish = material('#d9dfd5');
    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, value: THREE.Material) => {
      const geometry = new THREE.BoxGeometry(sx, sy, sz); allocation.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, value); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    const label = (text: string, x: number, y: number, z: number, color = '#233237') => {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
      const context = canvas.getContext('2d'); if (!context) return;
      context.clearRect(0, 0, 512, 128); context.fillStyle = color; context.font = 'bold 64px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 256, 64);
      const texture = new THREE.CanvasTexture(canvas); allocation.textures.push(texture);
      const value = new THREE.SpriteMaterial({ map: texture, depthTest: true }); allocation.materials.push(value);
      const sprite = new THREE.Sprite(value); sprite.position.set(x, y, z); sprite.scale.set(6.3 * (state.largerText ? 1.35 : 1), 1.6 * (state.largerText ? 1.35 : 1), 1); parent.add(sprite);
      if (allocation === structureResources) structureLabels.push(sprite);
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
        } else {object.userData.baseY ??= object.position.y; object.position.y=object.userData.baseY+floorOffset(Math.round((object.userData.baseY-.45)/building.floorHeightM));}
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
      container.dataset.camera = JSON.stringify(settings); container.dataset.cameraTarget = JSON.stringify(target.toArray());
    };
    const draw = () => {
      if (!renderer || !canRender()) return;
      try { failureStage='render'; applyCamera(); renderer.render(scene, view); container.dataset.renderStats = JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,dpr:renderer.getPixelRatio(),shadowMap:1024}); container.dataset.renderCount = String(++renderCount); dirty = false; }
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
        floorGroups.forEach((group,id)=>{group.position.y=floorOffset(id);group.visible=state.floor==='all'||id===state.floor||t<1;});deformRoutes();
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
      stop(); burstEnd = 0; floorEnd = 0; cameraEnd = 0; liveCamera = cameraTo; revealEnd = 0; offsets.forEach((_,i)=>offsets[i]=offsetTo[i]!); floorGroups.forEach((group,id)=>{group.position.y=floorOffset(id);group.visible=state.floor==='all'||id===state.floor;}); deformRoutes(); target.copy(floorTo); if (moving) moving.visible = false; dirty = true;
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
      const revealChanged = state.floor !== next.floor || state.expanded !== next.expanded;
      const autoCamera = state.cameraTransitionId !== next.cameraTransitionId;
      const cameraChanged = JSON.stringify(state.camera)!==JSON.stringify(next.camera);
      state = next;
      if(autoCamera && state.motionAllowed){cameraFrom=liveCamera;cameraTo=boundCamera(state.camera);cameraStart=now;cameraEnd=now+420;}
      else if(cameraChanged || !state.motionAllowed){liveCamera=boundCamera(state.camera);cameraEnd=0;}
      if(revealChanged){offsetFrom=[...offsets];offsetTo=building.floors.map(f=>state.floor==='all'?(state.expanded?f.id*5:0):(f.id>state.floor?14:0));revealStart=now;revealEnd=state.motionAllowed&&canRender()?now+460:0;if(!revealEnd)offsets.forEach((_,i)=>offsets[i]=offsetTo[i]!);}

      for (const sprite of structureLabels) sprite.scale.set(6.3 * (state.largerText ? 1.35 : 1), 1.6 * (state.largerText ? 1.35 : 1), 1);
      if (floorChanged) {
        floorFrom.copy(target);
        const center = boundCamera(state.camera).target;
        floorTo.set(center?.x ?? 16, (center?.y ?? (state.floor === 'all' ? 4 : state.floor * building.floorHeightM)) + (state.floor === 'all' && state.expanded ? 5 : 0), center?.z ?? 11);
        floorStart = now; floorEnd = state.motionAllowed && canRender() && autoCamera ? now + 420 : 0;
        if (!floorEnd) target.copy(floorTo);
      }
      floorGroups.forEach((group, id) => { group.visible = state.floor === 'all' || id === state.floor || revealEnd > now; group.position.y = floorOffset(id); });
      floorSlabs.forEach(slab => { slab.opacity = 1; });
      const signature = JSON.stringify([state.result.status === 'ok' ? [state.result.nodeIds, state.result.uncertainEdgeIds] : [], state.floor, state.expanded, state.closedEdgeIds, state.highlight, state.largerText]);
      if (signature !== routeSignature) {
        routeSignature = signature; rebuildRoutes(); deformRoutes(); burstStart = now;
        burstEnd = state.motionAllowed && canRender() && orderedSegments.length ? now + 1600 : 0;
      }
      if (!state.motionAllowed) { stop(); revealEnd=0; offsets.forEach((_,i)=>offsets[i]=offsetTo[i]!); floorGroups.forEach((group,id)=>{group.position.y=floorOffset(id);group.visible=state.floor==='all'||id===state.floor;}); deformRoutes(); floorEnd = 0; target.copy(floorTo); burstEnd = 0; if (moving) moving.visible = false; }
      scene.background = new THREE.Color(state.theme === 'dark' ? '#222e32' : '#e2e9e5');
      container.dataset.floor = String(state.floor); container.dataset.floorMode = state.floor !== 'all' ? 'focused' : state.expanded ? 'expanded' : 'assembled'; container.dataset.floorOffsets = JSON.stringify(building.floors.map(f => floorOffset(f.id))); container.dataset.cameraTransition = String(state.cameraTransitionId); dirty = true; schedule();
    };
    try {
      failureStage='context-creation'; renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.domElement.setAttribute('aria-hidden', 'true'); renderer.domElement.dataset.testid = 'diorama-canvas';
      renderer.domElement.addEventListener('webglcontextlost', contextLost); container.append(renderer.domElement);
      scene.add(new THREE.HemisphereLight('#f7f2df', '#384b53', 1.8));
      const sun = new THREE.DirectionalLight('#fff4dc', 2.1); sun.position.set(-10, 45, 25); sun.castShadow = true; shadow = sun.shadow;
      sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 }); scene.add(sun);
      allocation = structureResources;
      const surroundings = parent = new THREE.Group(); scene.add(surroundings);
      box(42, .6, 31, 16, -.75, 12, material('#374747'));
      for (const level of building.floors) {
        const group = parent = new THREE.Group(); scene.add(group); floorGroups.set(level.id, group);
        const h = level.id * building.floorHeightM;
        const slab = material('#eee8d9', 1); floorSlabs.set(level.id, slab);
        box(32, .22, 23, 16, h - .14, 11.5, slab);
        box(32, .6, .25, 16, h + .22, 0, ivory); box(.25, .6, 23, 0, h + .22, 11.5, ivory); box(.25, .6, 23, 32, h + .22, 11.5, ivory);
        const architecture = createFloorArchitecture(building, level.id);
        for (const room of architecture.rooms) box(room.width,.06,room.depth,room.x,h+.02,room.z,roomFinish);
        for (const w of architecture.walls) box(Math.max(.16,Math.abs(w.x2-w.x1)),1.65,Math.max(.16,Math.abs(w.z2-w.z1)),(w.x1+w.x2)/2,h+.825,(w.z1+w.z2)/2,wall);
        for (const door of architecture.doors) box(door.axis==='x'?door.width:.18,.035,door.axis==='z'?door.width:.18,door.x,h+.09,door.z,wood);
        for (const lift of ['a','b']) { const node=nodes.get(`lift-${lift}-${level.id}`)!;

          label(lift.toUpperCase(),node.x,h+2.1,node.z-1.35,'#344a4a');
        }
        for (let index = 0; index < 5; index++) box(2.6, .12 + index * .15, .55, 28, h + .05 + index * .075, 14.8 + index * .55, ivory);
        label(`${level.id + 1} ${locale==='kk'?'ҚАБАТ':'ЭТАЖ'}`, -2.6, h + .7, 18, '#d3e3dc');
        for (const node of building.nodes.filter(item => item.floor === level.id && item.kind === 'room')) label(/^room-\d+$/.test(node.id)?node.id.replace('room-', ''):nodeLabelRu(node.id,node.label,node.labelKk), node.x, h + 1.2, node.z);
      }
      parent = surroundings;
      for (const [x, z] of [[-2, 5], [-2, 14], [35, 7], [35, 19], [2, 26], [26, 26]]) {
        box(.3, 1.8, .3, x!, .5, z!, wood); const geometry = new THREE.IcosahedronGeometry(1.3, 1); allocation.geometries.push(geometry);
        const canopy = new THREE.Mesh(geometry, green); canopy.position.set(x!, 2, z!); canopy.castShadow = true; surroundings.add(canopy);
      }
      const resizeScene = () => {
        if (disposed || !renderer) return;
        try {
          const width = Math.max(container.clientWidth, 1); const height = Math.max(container.clientHeight, 1);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.setSize(width, height, false); const aspect = width / height;
          view.left = -21 * aspect; view.right = 21 * aspect; view.top = 21; view.bottom = -21; view.updateProjectionMatrix(); dirty = true; schedule();
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
    pointers.current.delete(event.pointerId); event.currentTarget.dataset.dragging = String(pointers.current.size > 0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div ref={host} className="diorama" tabIndex={-1} style={{ touchAction: gesturesEnabled ? 'none' : 'pan-y pinch-zoom' }} data-gestures={String(gesturesEnabled)} role="img" aria-label={locale==='kk'?'Ойдан шығарылған ғимараттың үшөлшемді моделі. Көрсеткілер адамның орнын емес, бағыт ретін көрсетеді. Барлық әрекет батырмалар арқылы қолжетімді.':'Авторская трёхмерная модель вымышленного здания. Стрелки показывают порядок маршрута, не положение человека. Все действия доступны кнопками, маршрут — в тексте и на схеме.'} data-route-ids={result.status === 'ok' ? result.edgeIds.join(',') : ''}
    onContextMenu={event => event.preventDefault()}
    onPointerDown={event => {
      const touch = event.pointerType === 'touch';
      if (touch ? !gesturesEnabled || pointers.current.size >= 2 : !event.isPrimary || ![0, 1, 2].includes(event.button)) return;
      runtime.current?.interrupt();
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY, touch, button: event.button });
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.dragging = 'true';
    }}
    onPointerMove={event => {
      const pointer = pointers.current.get(event.pointerId); if (!pointer) return;
      const before = [...pointers.current.values()].map(point => ({ ...point }));
      const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y;
      pointer.x = event.clientX; pointer.y = event.clientY;
      const after = [...pointers.current.values()]; const current = latest.current.camera;
      if (pointer.touch && before.length === 2) {
        const oldCenter = { x: (before[0]!.x + before[1]!.x) / 2, y: (before[0]!.y + before[1]!.y) / 2 };
        const center = { x: (after[0]!.x + after[1]!.x) / 2, y: (after[0]!.y + after[1]!.y) / 2 };
        const distance = (points: typeof before) => Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);
        const previousDistance = distance(before); const ratio = previousDistance > 1 ? distance(after) / previousDistance : 1;
        onCameraChange(boundCamera({ ...panCamera(current, center.x - oldCenter.x, center.y - oldCenter.y, event.currentTarget.clientHeight), zoom: current.zoom * ratio }));
      } else onCameraChange(pointer.button === 1 || pointer.button === 2 ? panCamera(current, dx, dy, event.currentTarget.clientHeight) : dragCamera(current, dx, dy));
    }} onPointerUp={endGesture} onPointerCancel={endGesture} onLostPointerCapture={endGesture} />;
}

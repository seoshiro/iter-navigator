import { createDioramaPose } from '../ui/dioramaDirector';
import type { DioramaPose } from '../ui/dioramaDirector';

/** Every gesture targets a complete stable pose; GSAP starts from the live values. */
export function scenePose(scene: number, phase = 4, condition = 0, compact = false, systemStep = 0, unknown = false): DioramaPose {
  const base = createDioramaPose({ zoom: .9 });
  if (scene === 0 || scene === 9) return base;
  if (scene === 1) return { ...base, yaw: 52, zoom: .86, panX: -1.5, entrance: 1 };
  if (scene === 2) {
    const close = { ...base, zoom: compact ? 1.2 : 1.6, cutaway: 1, spread: .35 };
    if (condition === 1) return { ...close, yaw: -28, targetX: 16, targetY: 7, targetZ: 5, door: 1, focusFloor1: 1 };
    if (condition === 2) return { ...close, yaw: -42, targetX: 8, targetY: 1.5, targetZ: 8, lift: 1, focusFloor0: 1 };
    return { ...close, yaw: 22, targetX: 26, targetY: 1.5, targetZ: 16, stairs: 1, focusFloor0: 1 };
  }
  if (scene === 3 || scene === 4) {
    if (scene === 3 && phase === 0) return base;
    if (scene === 3 && phase === 2) return { ...base, yaw: -28, zoom: 1.05, targetY: 10, spread: 1, cutaway: 1, focusFloor1: 1 };
    if (scene === 3 && phase === 3) return { ...base, yaw: -28, zoom: 1.75, targetY: 10, targetZ: 5, spread: 1, cutaway: 1, focusFloor1: 1, door: 1 };
    return { ...base, yaw: -28, zoom: .82,
      targetY: 6, targetZ: 11, spread: 1, cutaway: 1, labels: 1,
      routeProgress: scene === 4 || phase === 4 ? 1 : 0,
      lift: scene === 4 ? 1 : 0 };
  }
  if (scene === 5) return { ...base, yaw: 135, tilt:25, zoom: compact ? 1.15 : 1.5, targetX:24, targetY:7, targetZ:5, spread:.35, cutaway:1, focusFloor1:1, door205:1, routeProgress:unknown ? 1 : 0 };
  if (scene === 6) return { ...base, yaw: -28, spread: .6, cutaway: .8, routeProgress: 1, targetY: 6 };
  if (scene === 7) return { ...base, yaw:-28, zoom:compact ? .82 : .82, spread:1, cutaway:1, targetY:6, graphOpacity: systemStep < 3 ? 1 : .2, graphFilter:systemStep > 0 ? 1 : 0, routeProgress:systemStep > 1 ? 1 : 0 };
  if (scene === 8) return { ...base, yaw: -12, spread: 0, cutaway: 0 };
  return base;
}

export function stageTransform(scene: number, compact: boolean) {
  if (compact) return { xPercent:0, yPercent:0, scale:1 };
  if (scene === 5) return { xPercent:0, yPercent:-50, scale:1 };
  if (scene === 6) return { xPercent: -30, yPercent: -43, scale: .52 };
  if (scene === 7) return { xPercent:0, yPercent:-50, scale:1 };
  if (scene === 8) return { xPercent:12, yPercent:-45, scale:.65 };
  return { xPercent: scene === 1 ? -43 : 0, yPercent: -50, scale: 1 };
}

import { describe, expect, it } from 'vitest';
import { createDioramaPose, routeElementProgress, snapshotDioramaPose, unitProgress } from './dioramaDirector';

describe('presentation director channels', () => {
  it('omits the circular GSAP target cache from snapshots', () => {
    const pose = createDioramaPose();
    Object.assign(pose, { _gsap: { target: pose } });
    expect(JSON.parse(JSON.stringify(snapshotDioramaPose(pose)))).toEqual(createDioramaPose());
  });
  it('makes independent poses for an identical intro/live handoff', () => {
    const first = createDioramaPose({ zoom: .9 });
    const second = createDioramaPose({ zoom: .9 });
    expect(first).toEqual(second);
    first.yaw += 360;
    expect(second.yaw).toBe(-38);
    expect(second.labels).toBe(0);
    expect(second.routeProgress).toBe(0);
  });
  it('reveals only consecutive segments and supports backwards scrubbing', () => {
    const at = (progress: number) => [0, 1, 2, 3].map(i => routeElementProgress(progress, i, 4));
    expect(at(0)).toEqual([0, 0, 0, 0]);
    expect(at(.375)).toEqual([1, .5, 0, 0]);
    expect(at(1)).toEqual([1, 1, 1, 1]);
    expect(at(.125)).toEqual([.5, 0, 0, 0]);
  });
  it('bounds effect channels without restricting continuous camera yaw', () => {
    expect(unitProgress(-1)).toBe(0);
    expect(unitProgress(2)).toBe(1);
    expect(unitProgress(NaN)).toBe(0);
    expect(createDioramaPose({ yaw: 410 }).yaw).toBe(410);
  });
});

import { describe, expect, it } from 'vitest';
import fixture from '../src/data/building.json';
import type { Building, Scenario } from '../src/domain/model';
import { findRoute } from '../src/domain/routing';
import { defaultScenario } from '../src/domain/storage';
import { diagnoseRoute } from '../src/ui/route-diagnosis';

const building = fixture as Building;
const diagnose = (scenario: Scenario, input = building) => {
  const result = findRoute(input, scenario.start, scenario.destination, scenario.requirements, scenario.closedEdgeIds);
  return { result, diagnosis: diagnoseRoute(input, scenario, result) };
};
describe('presentation diagnosis uses active graph evidence', () => {
  it('distinguishes default model fit and actual traversed floors from global exclusions', () => {
    const { diagnosis } = diagnose(defaultScenario());
    expect(diagnosis).toMatchObject({ kind: 'model-fit', details: [], floors: [0, 1], stepFree: true });
  });
  it('proves insufficient evidence without returning a strict route; smooth off removes only surface', () => {
    const scenario = { ...defaultScenario(), destination: 'room-205' };
    const strict = diagnose(scenario);
    expect(strict.result.status).toBe('no-route');
    expect(strict.diagnosis).toMatchObject({ kind: 'insufficient', details: [{ edgeId: 'door-205', reasons: ['unknown-width', 'unknown-surface'] }], floors: [] });
    scenario.requirements = { ...scenario.requirements, smoothOnly: false };
    expect(diagnose(scenario).diagnosis.details).toEqual([{ edgeId: 'door-205', reasons: ['unknown-width'] }]);
  });
  it('names opted-in incomplete edges and never calls them checked', () => {
    const scenario = { ...defaultScenario(), destination: 'room-205', requirements: { ...defaultScenario().requirements, allowUnknown: true } };
    const { result, diagnosis } = diagnose(scenario);
    expect(result.status).toBe('ok'); expect(diagnosis.kind).toBe('uncertain');
    expect(diagnosis.details).toEqual([{ edgeId: 'door-205', reasons: ['unknown-width', 'unknown-surface'] }]);
  });
  it('retains the return to a floor when a same-floor closure requires a lift detour', () => {
    const scenario = { ...defaultScenario(), start: 'room-205', destination: 'room-204', closedEdgeIds: ['east-1'], requirements: { ...defaultScenario().requirements, allowUnknown: true } };
    const { result, diagnosis } = diagnose(scenario);
    expect(result.status).toBe('ok'); expect(diagnosis.floors).toHaveLength(3);
    expect(diagnosis.floors[0]).toBe(1); expect(diagnosis.floors[2]).toBe(1); expect(diagnosis.floors[1]).not.toBe(1);
  });
  it('known failure on the unknown edge cannot become insufficient or eligible', () => {
    const input = structuredClone(building); input.edges.find(edge => edge.id === 'door-205')!.stepFree = { status: 'checked', value: false, source: 'fictional test', checkedOn: null };
    for (const allowUnknown of [false, true]) {
      const { result, diagnosis } = diagnose({ ...defaultScenario(), destination: 'room-205', requirements: { ...defaultScenario().requirements, allowUnknown } }, input);
      expect(result.status).toBe('no-route'); expect(diagnosis.kind).toBe('no-route');
      expect(diagnosis.details.find(item => item.edgeId === 'door-205')!.reasons).toContain('step-free');
    }
  });
  it('opted-in missing evidence is not an obstacle when known width violations prevent a route', () => {
    const { result, diagnosis } = diagnose({ ...defaultScenario(), destination: 'room-205', requirements: { ...defaultScenario().requirements, minWidthM: 1.5, allowUnknown: true } });
    expect(result.status).toBe('no-route'); expect(diagnosis.kind).toBe('no-route');
    expect(diagnosis.details.length).toBeGreaterThan(0);
    expect(diagnosis.details.flatMap(item => item.reasons)).toContain('width');
    expect(diagnosis.details.flatMap(item => item.reasons)).not.toContain('unknown-width');
    expect(diagnosis.details.flatMap(item => item.reasons)).not.toContain('unknown-surface');
  });
  it('closure alternate is an actual route; blockage details omit irrelevant global exclusions', () => {
    const scenario = { ...defaultScenario(), closedEdgeIds: building.closureGroups[0]!.edgeIds };
    expect(diagnose(scenario).diagnosis.kind).toBe('model-fit');
    scenario.closedEdgeIds = [...scenario.closedEdgeIds, ...building.closureGroups[1]!.edgeIds];
    const { diagnosis } = diagnose(scenario); expect(diagnosis.kind).toBe('no-route'); expect(diagnosis.connected).toBe(true);
    expect(diagnosis.details.length).toBeGreaterThan(0);
    expect(diagnosis.details.map(item => item.edgeId)).not.toContain('door-205');
    expect(diagnosis.details.map(item => item.edgeId)).not.toContain('rough-0');
  });
  it('disconnected endpoints have no guessed obstacle; invalid endpoints remain invalid', () => {
    const input = structuredClone(building); input.edges = input.edges.filter(edge => edge.from !== 'room-204' && edge.to !== 'room-204');
    const { diagnosis } = diagnose(defaultScenario(), input);
    expect(diagnosis).toMatchObject({ kind: 'no-route', connected: false, details: [] });
    expect(diagnose({ ...defaultScenario(), destination: 'missing' }).diagnosis.kind).toBe('invalid');
  });
  it('stairs summary is factual even when stairs are allowed; diagnosis does not mutate inputs', () => {
    const before = JSON.stringify(building);
    const scenario = defaultScenario(); scenario.requirements = { ...scenario.requirements, avoidStairs: false, minWidthM: .7, smoothOnly: false };
    scenario.closedEdgeIds = [...building.closureGroups[0]!.edgeIds, ...building.closureGroups[1]!.edgeIds];
    expect(diagnose(scenario).diagnosis.stepFree).toBe(false); expect(JSON.stringify(building)).toBe(before);
  });
});

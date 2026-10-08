import type { Building, Requirements, Scenario, Validation } from './model';

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const renderable = (v: number) => Number.isFinite(v) && Number.isFinite(Math.fround(v));
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const unique = (values: unknown[]) => new Set(values).size === values.length;
const dense = (values: unknown[]) => {
  for (let index = 0; index < values.length; index++) if (!Object.hasOwn(values, index)) return false;
  return true;
};
const fail = (message: string): Validation<never> => ({ valid: false, message });
function evidence(v: unknown, predicate: (v: unknown) => boolean): boolean {
  return object(v) && text(v.source) && v.checkedOn === null &&
    (v.status === 'unknown' ? v.value === null : v.status === 'checked' && predicate(v.value));
}

export function validateBuilding(input: unknown): Validation<Building> {
  if (!object(input) || input.version !== 1 || input.fictional !== true || !text(input.source) ||
      input.surveyedOn !== null || !finite(input.floorHeightM) || input.floorHeightM <= 0 ||
      !Array.isArray(input.floors) || !Array.isArray(input.nodes) || !Array.isArray(input.edges) ||
      !Array.isArray(input.closureGroups) || !dense(input.floors) || !dense(input.nodes) || !dense(input.edges) || !dense(input.closureGroups)) return fail('Неверный формат учебной модели.');
  const { floors, nodes, edges, closureGroups, floorHeightM } = input;
  if (!floors.length || !nodes.length || !floors.every(f => object(f) && Number.isInteger(f.id) && finite(f.id) && f.id >= 0 && text(f.label)) ||
      !unique(floors.map(f => f.id))) return fail('Неверные этажи модели.');
  if (!floors.every(f => renderable(f.id * floorHeightM) && renderable(f.id * floorHeightM + 0.45)))
    return fail('Координаты этажей вне диапазона отображения.');
  const floorIds = new Set(floors.map(f => f.id));
  if (!nodes.every(n => object(n) && text(n.id) && text(n.label) && floorIds.has(n.floor) && finite(n.x) && finite(n.z) &&
      typeof n.kind === 'string' && ['entrance', 'room', 'junction', 'lift', 'stairs'].includes(n.kind) && typeof n.selectable === 'boolean') ||
      !unique(nodes.map(n => n.id))) return fail('Неверные узлы или повторяющиеся идентификаторы.');
  if (!nodes.every(n => renderable(n.x) && renderable(n.z) && renderable(n.floor * floorHeightM + 0.45) &&
      renderable(24 + n.x * 9) && renderable(35 + n.z * 9))) return fail('Координаты узлов вне диапазона отображения.');
  const nodeIds = new Set(nodes.map(n => n.id));
  if (!edges.every(e => object(e) && text(e.id) && nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to &&
      typeof e.type === 'string' && ['corridor', 'door', 'ramp', 'lift', 'stairs'].includes(e.type) && finite(e.lengthM) && e.lengthM > 0 &&
      evidence(e.widthM, v => finite(v) && v > 0 && v <= 10) &&
      evidence(e.slopePercent, v => finite(v) && v >= 0 && v <= 100) &&
      evidence(e.surface, v => v === 'smooth' || v === 'rough') && evidence(e.stepFree, v => typeof v === 'boolean')) ||
      !unique(edges.map(e => e.id))) return fail('Неверные связи, измерения или свидетельства модели.');
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  if (!edges.every(e => {
    const from = nodeMap.get(e.from)!; const to = nodeMap.get(e.to)!;
    const dx = to.x - from.x; const dy = (to.floor * floorHeightM + 0.45) - (from.floor * floorHeightM + 0.45); const dz = to.z - from.z;
    return renderable(dx) && renderable(dy) && renderable(dz) && renderable(Math.hypot(dx, dy, dz));
  })) return fail('Геометрия связей вне диапазона отображения.');
  if (!Number.isFinite(edges.reduce((sum, edge) => sum + edge.lengthM, 0))) return fail('Суммарная длина связей вне конечного диапазона.');
  const edgeIds = new Set(edges.map(e => e.id));
  if (!closureGroups.every(g => object(g) && text(g.id) && text(g.label) && Array.isArray(g.edgeIds) && g.edgeIds.length > 0 &&
      dense(g.edgeIds) && unique(g.edgeIds) && g.edgeIds.every(id => typeof id === 'string' && edgeIds.has(id))) || !unique(closureGroups.map(g => g.id)))
    return fail('Неверные группы симуляции закрытий.');
  return { valid: true, value: input as unknown as Building };
}

export function validateRequirements(input: unknown): input is Requirements {
  return object(input) && typeof input.avoidStairs === 'boolean' && finite(input.minWidthM) && input.minWidthM >= 0.5 && input.minWidthM <= 1.5 &&
    finite(input.maxSlopePercent) && input.maxSlopePercent >= 0 && input.maxSlopePercent <= 20 && typeof input.smoothOnly === 'boolean' &&
    typeof input.allowUnknown === 'boolean';
}

export function validateClosedEdgeIds(input: unknown, building: Building): input is string[] {
  const edgeIds = new Set(building.edges.map(edge => edge.id));
  return Array.isArray(input) && dense(input) && input.every(id => typeof id === 'string' && edgeIds.has(id));
}

export function validateScenario(input: unknown, building: Building): input is Scenario {
  const choices = new Set(building.nodes.filter(n => n.selectable).map(n => n.id));
  const closedEdgeIds = object(input) ? input.closedEdgeIds : null;
  return object(input) && typeof input.start === 'string' && typeof input.destination === 'string' && choices.has(input.start) && choices.has(input.destination) && validateRequirements(input.requirements) &&
    validateClosedEdgeIds(closedEdgeIds, building) && unique(closedEdgeIds) &&
    building.closureGroups.every(group => group.edgeIds.every(id => closedEdgeIds.includes(id)) || group.edgeIds.every(id => !closedEdgeIds.includes(id))) &&
    (input.floor === 'all' || building.floors.some(f => f.id === input.floor));
}

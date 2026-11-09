import type { Building, Requirements, Scenario, Validation } from './model';
import { validateBuilding, validateRequirements } from './validation';

/** The public demo identity, not a surveyed campus or a simulation state. */
export const SHARE_MODEL_ID = 'iter-demo-v1';
const KEYS = ['model', 'start', 'target', 'avoidStairs', 'minWidthM', 'maxSlopePercent', 'smoothOnly', 'allowUnknown'] as const;
const ROUTE_KEYS = new Set<string>(KEYS);
const SIMULATION_KEYS = new Set(['closedEdgeIds', 'closed', 'closures', 'simulation', 'floor']);
const MAX_URL_LENGTH = 4096;
const invalid = (message: string): Validation<never> => ({ valid: false, message });
export type ParsedRouteLink = { status: 'none' } | { status: 'invalid'; message: string } | { status: 'ok'; scenario: Scenario };

function httpUrl(input: string | URL): URL | null {
  try {
    const url = new URL(input.toString());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.href.length <= MAX_URL_LENGTH ? url : null;
  } catch { return null; }
}

/** Deliberately serializes a whitelist, never closures, local simulation, or the visible floor. */
export function serializeRouteLink(baseUrl: string, building: Building, scenario: Scenario): Validation<string> {
  const url = httpUrl(baseUrl);
  if (!url) return invalid('Invalid HTTP(S) base URL.');
  if (!validateBuilding(building).valid) return invalid('Invalid building model.');
  const choices = new Set(building.nodes.filter(node => node.selectable).map(node => node.id));
  if (!scenario || !choices.has(scenario.start) || !choices.has(scenario.destination) || !validateRequirements(scenario.requirements))
    return invalid('Invalid route endpoints or requirements.');
  url.search = '';
  url.hash = '';
  url.searchParams.set('model', SHARE_MODEL_ID);
  url.searchParams.set('start', scenario.start);
  url.searchParams.set('target', scenario.destination);
  const requirements = scenario.requirements;
  url.searchParams.set('avoidStairs', requirements.avoidStairs ? '1' : '0');
  url.searchParams.set('minWidthM', String(requirements.minWidthM));
  url.searchParams.set('maxSlopePercent', Object.is(requirements.maxSlopePercent, -0) ? '-0' : String(requirements.maxSlopePercent));
  url.searchParams.set('smoothOnly', requirements.smoothOnly ? '1' : '0');
  url.searchParams.set('allowUnknown', requirements.allowUnknown ? '1' : '0');
  return url.href.length <= MAX_URL_LENGTH ? { valid: true, value: url.href } : invalid('Route URL is too long.');
}

/** Invalid links never partially override a scenario or loosen requirements. */
export function parseRouteLink(input: string | URL, building: Building): ParsedRouteLink {
  const url = httpUrl(input);
  if (!url) return { status: 'invalid', message: 'Invalid route URL.' };
  const params = url.searchParams;
  const hasRouteData = [...params.keys()].some(key => ROUTE_KEYS.has(key) || SIMULATION_KEYS.has(key));
  if (!hasRouteData) return { status: 'none' };
  const fail = (message: string): ParsedRouteLink => ({ status: 'invalid', message });
  if (!validateBuilding(building).valid) return fail('Invalid building model.');
  if ([...params.keys()].some(key => !ROUTE_KEYS.has(key)) || KEYS.some(key => params.getAll(key).length !== 1))
    return fail('Route parameters are missing, duplicated, or unsupported.');
  if (params.get('model') !== SHARE_MODEL_ID) return fail('Unsupported building model.');
  const start = params.get('start')!;
  const destination = params.get('target')!;
  const choices = new Set(building.nodes.filter(node => node.selectable).map(node => node.id));
  if (!choices.has(start) || !choices.has(destination)) return fail('Unknown route endpoint.');
  const boolean = (key: string) => params.get(key) === '1' ? true : params.get(key) === '0' ? false : null;
  const number = (key: string) => {
    const raw = params.get(key)!;
    // JSON number grammar includes exponents produced by String() for tiny valid slopes.
    // Numeric bounds and finiteness are still enforced by validateRequirements below.
    return /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw) ? Number(raw) : NaN;
  };
  const requirements = {
    avoidStairs: boolean('avoidStairs'), minWidthM: number('minWidthM'), maxSlopePercent: number('maxSlopePercent'),
    smoothOnly: boolean('smoothOnly'), allowUnknown: boolean('allowUnknown'),
  };
  if (!validateRequirements(requirements)) return fail('Invalid route requirements.');
  return { status: 'ok', scenario: { start, destination, requirements: { ...requirements } as Requirements, closedEdgeIds: [], floor: 'all' } };
}

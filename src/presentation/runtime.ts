import fixture from '../data/building.json';
import { validateBuilding } from '../domain/validation';
import { defaultScenario } from '../domain/storage';
import { findRoute } from '../domain/routing';
import { serializeRouteLink } from '../domain/share';
import type { Requirements, RouteResult } from '../domain/model';

const validated = validateBuilding(fixture);
if (!validated.valid) throw new Error('The presentation needs the validated ITER demo building.');
export const presentationBuilding = validated.value;
export const presentationRequirements = defaultScenario().requirements;
export const liftAEdges = presentationBuilding.closureGroups.find(group => group.id === 'lift-a')!.edgeIds;
export const route204 = findRoute(presentationBuilding, 'entrance', 'room-204', presentationRequirements, []);
export const detour204 = findRoute(presentationBuilding, 'entrance', 'room-204', presentationRequirements, liftAEdges);
export const route205Strict = findRoute(presentationBuilding, 'entrance', 'room-205', presentationRequirements, []);
export const route205Unknown = findRoute(presentationBuilding, 'entrance', 'room-205', { ...presentationRequirements, allowUnknown: true }, []);
export const noVisibleRoute: RouteResult = { status: 'no-route', excluded: [] };
export const PUBLIC_NAVIGATOR_URL = 'https://iter-navigator.vercel.app/';
export const SCENE_IDS = ['intro', 'barriers', 'route', 'building', 'detour', 'uncertainty', 'mobile', 'system', 'pilot', 'finish'] as const;
export const MODEL_SCENES = new Set([0, 3, 4, 9]);

export function readScene(search = window.location.search): number {
  const value = new URLSearchParams(search).get('scene');
  const named = SCENE_IDS.indexOf(value as typeof SCENE_IDS[number]);
  if (named >= 0) return named;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= SCENE_IDS.length ? number - 1 : 0;
}
export function navigatorLink(destination = 'room-204', requirements: Requirements = presentationRequirements): string {
  const link = serializeRouteLink(PUBLIC_NAVIGATOR_URL, presentationBuilding, { ...defaultScenario(), destination, requirements });
  return link.valid ? link.value : PUBLIC_NAVIGATOR_URL;
}
export function posterForScene(index: number, lang: 'ru' | 'kk' = 'ru'): string {
  return `/presentation/media/${index === 3 ? 'route-204' : index === 4 ? 'detour-204' : 'building'}${lang === 'kk' ? '-kk' : ''}.webp`;
}

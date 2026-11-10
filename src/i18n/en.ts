import fixture from '../data/building.json';
import type { EdgeType, ExclusionReason } from '../domain/model';
import type { ru } from './ru';

const room205Uncertainty = 'width and surface unknown';

export const en: typeof ru = {
  brand: 'Iter', tagline: 'Know the conditions along your route',
  fiction: 'Educational demo · fictional building',
  fictionDetail: 'All dimensions and properties are examples. No real building survey has been carried out. This route does not confirm the accessibility or safety of a real building.',
  evidenceSource: 'Source: an original fictional model. Survey date: none.',
  modelGeometry: 'Illustrative geometry',
  start: 'From', destination: 'To', requirements: 'Route requirements',
  width: 'Minimum width, cm', slope: 'Maximum slope, %',
  noStairs: 'No stairs or steps', smooth: 'Smooth surfaces only', unknown: 'Allow sections with incomplete data',
  unknownHint: 'Routes using these sections will be marked as unconfirmed.',
  reset: 'Reset scenario',
  room205: 'Door to classroom 205: width and surface are unknown. Step-free access and slope are defined in the fictional model. There is no survey date.',
  room205Label: `Classroom 205 · ${room205Uncertainty}`,
  invalidEndpointLabel: 'Unknown location',
  invalidEndpointDescription: 'This location is not in the demo model. Choose a location from the list.',
  endpointFloor: (floor: number) => `Floor ${floor + 1} · model location`,
  sceneHelp3d: 'Mouse: drag with the left button to rotate, or the right or middle button to pan. Phone: swipe horizontally to rotate, pinch to zoom, and swipe vertically to scroll the page. Camera gestures enable free tilting, panning, and mouse-wheel zoom. Zoom and reset buttons are also available. The camera does not show your location.',
  route: {
    insufficient: 'Not enough data to confirm a route',
    noRoute: 'No matching route', invalid: 'Invalid data',
    insufficientHint: 'The model has a path with no known violations, but data is missing for the active requirements. To use it, explicitly allow sections with incomplete data.',
    blockedHint: 'No route was found with the selected requirements and closures. The obstacles below describe one possible path, not every possible path.',
    disconnectedHint: 'The selected locations are not connected in the demo graph. Changing requirements or closures cannot create a missing passage.',
    missing: 'Missing data for active requirements', obstacles: 'Obstacles on one possible path',
    uncertainty: 'Some properties are unknown',
    floors: (floors: number[]) => `Route floors: ${floors.map(floor => floor + 1).join(' → ')}`,
    stepFree: (value: boolean | null): string => value === true ? 'Step-free according to the model' : value === false ? 'Includes stairs or steps according to the model' : 'Step-free access is not specified for the entire path',
  },
  camera: { swap: 'Swap start and destination', fit: 'Show the entire route', focus: 'Show on the model', destinationFocus: 'Show destination on the model', gestures: 'Camera gestures', clearFocus: 'Clear selection', tiltUp: 'Tilt view up', tiltDown: 'Tilt view down' },
  sceneHelp2d: 'The plan shows the selected floors and the same route as the text directions. Arrows indicate the order of travel, not a person’s location. Use the buttons to switch floors.',
  display: {
    entry: 'View, text, and voice',
    title: 'Display', theme: 'Theme', dark: 'Dark', light: 'Light', largerText: 'Larger text', reduceMotion: 'Reduce motion',
    systemReduced: 'Your system setting turns motion off. Your personal preference is saved separately.',
    motionHint: 'Arrows show the order of travel, not your location. Motion is brief, and the route is usable without it.',
    storageWarning: 'Display preferences could not be restored or saved. They apply in this tab but may not persist after a reload.',
  },
};

export const edgeNamesEn: Record<EdgeType, string> = { corridor: 'Passage', door: 'Door', ramp: 'Ramp', lift: 'Elevator', stairs: 'Stairs' };
export const reasonNamesEn: Record<ExclusionReason, string> = {
  closed: 'closed in the simulation', stairs: 'stairs excluded', 'step-free': 'steps present', width: 'insufficient width',
  slope: 'slope exceeds the limit', surface: 'uneven surface', 'unknown-step-free': 'presence of steps unknown',
  'unknown-width': 'width unknown', 'unknown-slope': 'slope unknown', 'unknown-surface': 'surface unknown',
};

// English is a presentation layer keyed by stable IDs, not a migration of the model or journal.
export const nodeLabelsEn: Record<string, string> = {
  entrance: 'Main entrance', 'lobby-0': 'Lobby · Floor 1',
  'lift-a-0': 'Elevator A · Floor 1', 'lift-b-0': 'Elevator B · Floor 1', 'stairs-0': 'Stairs · Floor 1',
  'lift-a-1': 'Elevator A · Floor 2', 'lift-b-1': 'Elevator B · Floor 2', 'stairs-1': 'Stairs · Floor 2',
  'hall-1': 'Lobby · Floor 2', 'east-1-node': 'East passage · Floor 2',
  'room-204': 'Classroom 204', 'room-205': en.room205Label,
  'lift-a-2': 'Elevator A · Floor 3', 'lift-b-2': 'Elevator B · Floor 3', 'stairs-2': 'Stairs · Floor 3',
  'hall-2': 'Gallery · Floor 3', 'room-301': 'Reading room 301',
  'room-wardrobe': 'Cloakroom', 'room-medical': 'First-aid room', 'room-canteen': 'Cafeteria',
  'room-toilets': 'Restrooms', 'room-library': 'Library', 'room-dean': 'Dean’s office',
};
export const closureLabelsEn: Record<string, string> = { 'lift-a': 'Elevator A', 'lift-b': 'Elevator B', 'east-passage': 'East passage · Floor 2' };
export const passageLabelsEn: Record<string, string> = Object.fromEntries(fixture.edges.map(edge => [edge.id,
  edge.id === 'door-205' ? `Door to classroom 205 · ${room205Uncertainty}` : `${nodeLabelsEn[edge.from]} → ${nodeLabelsEn[edge.to]}`,
]));
export function nodeLabelEn(id: string, label: string, _labelKk?: string): string {
  void _labelKk;
  return nodeLabelsEn[id] ?? (/\p{Script=Cyrillic}/u.test(label) ? en.invalidEndpointLabel : label);
}
export function passageLabelEn(id: string | null, label: string, _labelKk?: string): string {
  void _labelKk;
  return (id === null ? undefined : passageLabelsEn[id]) ?? (/\p{Script=Cyrillic}/u.test(label) ? 'Unspecified passage' : label);
}
export const closureGroupLabelEn = (id: string, label: string, _labelKk?: string) => { void _labelKk; return closureLabelsEn[id] ?? (/\p{Script=Cyrillic}/u.test(label) ? 'Unspecified closure' : label); };

const searchAliases: Record<string, string> = {
  entrance: 'entry exit main entrance front door', 'lobby-0': 'hall lobby reception',
  'room-204': 'room classroom lecture teaching 204', 'room-205': 'room classroom lecture teaching 205',
  'room-301': 'reading study room hall 301', 'room-wardrobe': 'coat check cloakroom wardrobe coats',
  'room-medical': 'medical first aid first-aid health infirmary nurse', 'room-canteen': 'canteen cafeteria dining food lunch',
  'room-toilets': 'toilet toilets restroom restrooms bathroom washroom wc',
  'room-library': 'library books', 'room-dean': 'dean dean’s office dean office administration',
};
const fixtureNodes = new Map(fixture.nodes.map(node => [node.id, node]));
/** Search is multilingual even when the display language changes. */
export function nodeSearchText(id: string, label: string, labelKk?: string): string {
  const node = fixtureNodes.get(id);
  const aliases = searchAliases[id] ?? (id.startsWith('lift-') ? 'lift elevator' : id.startsWith('stairs-') ? 'stairs staircase stairway' : '');
  return [label, labelKk, node?.label, node?.labelKk, nodeLabelsEn[id], aliases, id].filter(Boolean).join(' ');
}

export const numberEn = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
const countWords: Record<string, [string, string]> = {
  'участок': ['section', 'sections'], 'неподтверждённый участок': ['unconfirmed section', 'unconfirmed sections'],
  'метр': ['meter', 'meters'], 'этаж': ['floor', 'floors'], 'шаг': ['step', 'steps'], 'переход': ['transition', 'transitions'],
};
export function countEn(value: number, forms: [string, string, string]): string {
  const words = countWords[forms[0]] ?? [forms[0], forms[2]];
  return `${numberEn(value)} ${words[value === 1 ? 0 : 1]}`;
}

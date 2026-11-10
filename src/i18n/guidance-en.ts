import type { Building, RouteResult } from '../domain/model';
import type { RouteDiagnosis } from '../ui/route-diagnosis';
import type { SpeechStatus } from '../ui/speech';
import type { guidanceRu } from './guidance-ru';
import { countEn, edgeNamesEn, en, nodeLabelEn, numberEn, reasonNamesEn } from './en';

export const speechEn: Record<SpeechStatus, string> = {
  unsupported: 'This browser does not support reading aloud. Text directions are available.',
  loading: 'Waiting for the browser’s voice list. Reading starts only when you choose it.',
  unavailable: 'No local English voice is available yet. You can install one in your system. Russian and Kazakh voices will not be used. Text directions are available.',
  ready: 'A local English voice is ready. Reading aloud is optional and does not use your microphone.',
  speaking: 'Reading the selected route or action.', stopped: 'Reading stopped. Press a read button to start again.',
  error: 'The browser could not read the text. Try again manually. Text directions are still available.',
};
export const guidanceEn: typeof guidanceRu = {
  enable: 'Enable reading aloud', stop: 'Stop reading', readRoute: 'Read route', readStep: 'Read current step',
  rate: 'Reading speed', voice: 'Local English voice', defaultVoice: 'First available local voice',
  storageWarning: 'Reading speed and voice preferences could not be restored or saved. They apply in this tab.',
  compare: 'Compare paths under the model’s conditions', compareCompact: 'Compare paths', comparisonHint: 'The main path is the shortest. Alternative paths use the same requirements and closures.',
  primary: 'Main path', variant: (index: number) => `Alternative ${index + 1}`, stepReview: 'Review a step', all: 'Entire route', previous: 'Previous step', next: 'Next step',
  allSelected: 'The entire route is shown. Steps change only when you choose them.',
  noTransition: 'No change of floor', complete: 'No missing data for active requirements.', incomplete: (count: number) => `Sections with missing data for active requirements: ${count}.`,
  noAdditional: 'There are no alternative paths with the current requirements and closures.',
  noAdditionalZero: 'The start and destination are the same. No alternative path is needed.',
  floorShown: (floor: 'all' | number) => floor === 'all' ? 'All model floors are shown.' : `Floor ${floor + 1} of the model is shown.`,
  floorLabel: 'Floor', floorsCompact: (floors: number[]) => `Floors: ${floors.map(floor => floor + 1).join(' → ')}`,
  routeChanged: (start: string, end: string) => `Route: ${start} to ${end}.`,
  closure: (label: string, open: boolean) => `${label}: ${open ? 'open' : 'closed'} in the simulation.`,
  preset: (label: string) => `Selected requirements: ${label}.`, reset: 'Scenario reset. From the entrance to classroom 204.',
  stairs: (excluded: boolean): string => excluded ? 'Stairs and steps are excluded.' : 'Stairs are allowed under the selected requirements.',
  surface: (smooth: boolean): string => smooth ? 'Only smooth surfaces are allowed.' : 'Any surface is allowed under the selected requirements.',
  unknown: (allowed: boolean): string => allowed ? 'Unconfirmed sections are allowed. Known violations are still excluded.' : 'Sections with missing data for active requirements are excluded.',
  width: (value: string) => `Minimum width: ${value} centimeters.`, slope: (value: string) => `Maximum slope: ${value} percent.`,
  selected: (index: number) => index === 0 ? 'Main path selected.' : `Alternative ${index + 1} selected.`,
  allShown: 'The entire selected route is shown.',
  stepWarning: (reasons: string[]) => `Unconfirmed step. ${reasons.join('; ')}.`,
  cameraActions: '3D view controls', zoom2d: '2D plan zoom', zoomOut2d: 'Zoom out of the plan', zoomIn2d: 'Zoom in on the plan', reset2d: 'Reset plan zoom',
};

export function routeOutcomeEn(result: RouteResult, diagnosis: RouteDiagnosis): string {
  const reasons = [...new Set(diagnosis.details.flatMap(detail => detail.reasons))].map(reason => reasonNamesEn[reason]).join('; ');
  if (result.status === 'invalid') return en.route.invalid;
  if (result.status === 'no-route') return `${diagnosis.kind === 'insufficient' ? en.route.insufficient : en.route.noRoute}${reasons ? `. ${reasons}` : ''}.`;
  if (!result.edgeIds.length) return 'The start and destination are the same location. Distance: zero meters.';
  return `${diagnosis.kind === 'uncertain' ? 'Unconfirmed route' : 'Route meeting the model’s conditions'}. ${numberEn(result.distanceM)} meters in the demo graph${reasons ? `. ${reasons}` : ''}.`;
}
const actionsEn = { corridor: 'Continue', door: 'Go through the door', ramp: 'Use the ramp', lift: 'Take the elevator', stairs: 'Take the stairs' };
export function stepTextEn(building: Building, result: Extract<RouteResult, { status: 'ok' }>, index: number): string {
  const edge = building.edges.find(item => item.id === result.edgeIds[index])!;
  const from = building.nodes.find(item => item.id === result.nodeIds[index])!;
  const to = building.nodes.find(item => item.id === result.nodeIds[index + 1])!;
  const floors = from.floor === to.floor ? `Floor ${to.floor + 1}` : `From floor ${from.floor + 1} to floor ${to.floor + 1}`;
  return `Step ${index + 1}. ${actionsEn[edge.type]}: ${nodeLabelEn(from.id, from.label)} to ${nodeLabelEn(to.id, to.label)}. ${edgeNamesEn[edge.type]}, ${countEn(edge.lengthM, ['meter', 'meters', 'meters'])} in the demo graph. ${floors}.`;
}
export function routeSpeechEn(building: Building, result: RouteResult, diagnosis: RouteDiagnosis): string[] {
  if (result.status === 'invalid') return [en.route.invalid, 'Choose locations and valid requirements in the form.'];
  if (result.status === 'no-route') return [diagnosis.kind === 'insufficient' ? en.route.insufficient : en.route.noRoute,
    diagnosis.kind === 'insufficient' ? en.route.insufficientHint : diagnosis.connected ? en.route.blockedHint : en.route.disconnectedHint,
    ...diagnosis.details.map(detail => {
      const edge = building.edges.find(item => item.id === detail.edgeId)!;
      const from = building.nodes.find(node => node.id === edge.from)!;
      const to = building.nodes.find(node => node.id === edge.to)!;
      return `${edgeNamesEn[edge.type]}: ${nodeLabelEn(from.id, from.label)} to ${nodeLabelEn(to.id, to.label)}. ${detail.reasons.map(reason => reasonNamesEn[reason]).join('; ')}.`;
    })];
  const start = building.nodes.find(node => node.id === result.nodeIds[0])!;
  const end = building.nodes.find(node => node.id === result.nodeIds.at(-1))!;
  const warnings = diagnosis.details.map(detail => {
    const index = result.edgeIds.indexOf(detail.edgeId);
    return `Unconfirmed step ${index + 1}: ${detail.reasons.map(reason => reasonNamesEn[reason]).join('; ')}.`;
  });
  return [result.edgeIds.length ? `${routeOutcomeEn(result, diagnosis)} ${nodeLabelEn(start.id, start.label)} to ${nodeLabelEn(end.id, end.label)}. ${en.route.floors(diagnosis.floors)}. ${en.route.stepFree(diagnosis.stepFree)}.` : `The start and destination are the same location: ${nodeLabelEn(start.id, start.label)}. Distance: zero meters.`,
    en.fictionDetail, ...(warnings.length ? [en.route.uncertainty, ...warnings] : []),
    ...result.edgeIds.map((_, index) => stepTextEn(building, result, index))];
}

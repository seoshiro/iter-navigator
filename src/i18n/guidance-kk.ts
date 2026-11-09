import type { Building, RouteResult } from '../domain/model';
import type { RouteDiagnosis } from '../ui/route-diagnosis';
import type { SpeechStatus } from '../ui/speech';
import type { guidanceRu } from './guidance-ru';
import { edgeNamesKk, nodeLabelKk, numberKk, reasonNamesKk, kk } from './kk';

export const speechKk: Record<SpeechStatus, string> = {
  unsupported: 'Браузер дауыстап оқуды қолдамайды. Маршрут мәтіні қолжетімді.',
  loading: 'Браузердегі дауыстар тізімін күтіп тұрмыз. Оқу тек сіздің әрекетіңізден кейін басталады.',
  unavailable: 'Құрылғыда қазақша оқитын жергілікті дауыс жоқ. Оны жүйеге орнатуға болады. Орысша дауыс қолданылмайды; маршрут мәтіні қолжетімді.',
  ready: 'Қазақша оқитын жергілікті дауыс дайын. Дауыстап оқу міндетті емес; микрофон қолданылмайды.',
  speaking: 'Таңдалған маршрут немесе әрекет оқылып жатыр.', stopped: 'Оқу тоқтатылды. Жалғастыру үшін оқу батырмасын басыңыз.',
  error: 'Браузер мәтінді оқи алмады. Оқуды қолмен қайта бастаңыз; маршрут мәтіні қолжетімді.',
};
export const guidanceKk: typeof guidanceRu = {
  enable: 'Дауыстап оқуды қосу', stop: 'Дауыстап оқуды тоқтату', readRoute: 'Маршрутты оқу', readStep: 'Қазіргі қадамды оқу',
  rate: 'Оқу жылдамдығы', voice: 'Қазақша жергілікті дауыс', defaultVoice: 'Бірінші қолжетімді жергілікті дауыс',
  storageWarning: 'Оқу жылдамдығы мен дауысты қалпына келтіру немесе сақтау мүмкін болмады. Баптаулар осы бетте қолданылады.',
  compare: 'Модель шарттары бойынша жолдарды салыстыру', compareCompact: 'Жолдарды салыстыру', comparisonHint: 'Негізгі жол ең қысқа. Балама жолдарға бірдей талаптар мен жабылулар қолданылады.',
  primary: 'Негізгі жол', variant: (index: number) => `${index + 1}-нұсқа`, stepReview: 'Қадамды қарау', all: 'Бүкіл маршрут', previous: 'Алдыңғы қадам', next: 'Келесі қадам',
  allSelected: 'Бүкіл маршрут көрсетілген. Қадамдар тек сіздің әрекетіңізбен ауысады.',
  noTransition: 'Қабаттар арасында ауысу жоқ', complete: 'Қолданылған талаптар бойынша деректер толық.', incomplete: (count: number) => `Қолданылған талаптар бойынша ${count} бөліктің дерегі толық емес.`,
  noAdditional: 'Қазіргі талаптар мен жабылулар бойынша балама жол жоқ.',
  noAdditionalZero: 'Бастапқы және соңғы нүктелер бірдей. Бұл нүкте үшін балама жол қажет емес.',
  floorShown: (floor: 'all' | number) => floor === 'all' ? 'Модельдің барлық қабаттары көрсетілген.' : `Модельдің ${floor + 1}-қабаты көрсетілген.`,
  floorLabel: 'Қабат', floorsCompact: (floors: number[]) => `Қабаттар: ${floors.map(floor => floor + 1).join(' → ')}`,
  routeChanged: (start: string, end: string) => `Маршрут: ${start} → ${end}.`,
  closure: (label: string, open: boolean) => `${label}: симуляцияда ${open ? 'ашық' : 'жабық'}.`,
  preset: (label: string) => `Таңдалған шарттар: ${label}.`, reset: 'Сценарий бастапқы күйге келтірілді. Кіреберістен 204-аудиторияға.',
  stairs: (excluded: boolean) => excluded ? 'Баспалдақтар мен сатылар алынып тасталды.' : 'Таңдалған шарттар бойынша баспалдақтарға рұқсат етілген.',
  surface: (smooth: boolean) => smooth ? 'Тек тегіс жабын таңдалды.' : 'Таңдалған шарттар бойынша кез келген жабынға рұқсат етілген.',
  unknown: (allowed: boolean) => allowed ? 'Расталмаған бөліктерге рұқсат берілді. Белгілі талап бұзушылықтары бар бөліктер әлі де қолданылмайды.' : 'Қолданылған талаптар бойынша дерегі толық емес бөліктер алынып тасталды.',
  width: (value: string) => `Ең аз ені ${value} сантиметр.`, slope: (value: string) => `Ең үлкен еңіс ${value} пайыз.`,
  selected: (index: number) => `${index === 0 ? 'Негізгі жол' : `${index + 1}-нұсқа`} таңдалды.`, allShown: 'Таңдалған маршрут толығымен көрсетілген.',
  stepWarning: (reasons: string[]) => `Расталмаған қадам. ${reasons.join('; ')}.`,
  cameraActions: '3D көрінісін басқару', zoom2d: '2D сызбасының масштабы', zoomOut2d: 'Сызбаны кішірейту', zoomIn2d: 'Сызбаны үлкейту', reset2d: 'Сызба масштабын қалпына келтіру',
};
export function routeOutcomeKk(result: RouteResult, diagnosis: RouteDiagnosis) {
  const reasons = [...new Set(diagnosis.details.flatMap(detail => detail.reasons))].map(reason => reasonNamesKk[reason]).join('; ');
  if (result.status === 'invalid') return kk.route.invalid;
  if (result.status === 'no-route') return `${diagnosis.kind === 'insufficient' ? kk.route.insufficient : kk.route.noRoute}${reasons ? `. ${reasons}` : ''}.`;
  if (!result.edgeIds.length) return 'Бастапқы және соңғы нүктелер бірдей. Қашықтық нөл метр.';
  return `${diagnosis.kind === 'uncertain' ? 'Расталмаған маршрут' : 'Модель шарттарына сәйкес маршрут'}. Оқу графы бойынша ${numberKk(result.distanceM)} метр${reasons ? `. ${reasons}` : ''}.`;
}
const actionKk = { corridor: 'Өтіңіз', door: 'Есіктен өтіңіз', ramp: 'Пандуспен өтіңіз', lift: 'Лифтіні пайдаланыңыз', stairs: 'Баспалдақпен жүріңіз' };
export function stepTextKk(building: Building, result: Extract<RouteResult, { status: 'ok' }>, index: number) {
  const edge = building.edges.find(item => item.id === result.edgeIds[index]);
  const from = building.nodes.find(item => item.id === result.nodeIds[index]);
  const to = building.nodes.find(item => item.id === result.nodeIds[index + 1]);
  if (!edge || !from || !to) return kk.route.invalid;
  const floors = from.floor === to.floor ? `${to.floor + 1}-қабат` : `${from.floor + 1}-қабаттан ${to.floor + 1}-қабатқа`;
  return `${index + 1}-қадам. ${actionKk[edge.type]}: ${nodeLabelKk(from.id, from.label, from.labelKk)} → ${nodeLabelKk(to.id, to.label, to.labelKk)}. ${edgeNamesKk[edge.type]}, оқу графы бойынша ${numberKk(edge.lengthM)} метр. ${floors}.`;
}
export function routeSpeechKk(building: Building, result: RouteResult, diagnosis: RouteDiagnosis): string[] {
  if (result.status === 'invalid') return [kk.route.invalid, 'Нысаннан нүктелерді және рұқсат етілген талаптарды таңдаңыз.'];
  if (result.status === 'no-route') return [diagnosis.kind === 'insufficient' ? kk.route.insufficient : kk.route.noRoute,
    diagnosis.kind === 'insufficient' ? kk.route.insufficientHint : diagnosis.connected ? kk.route.blockedHint : kk.route.disconnectedHint,
    ...diagnosis.details.map(detail => {
      const edge = building.edges.find(item => item.id === detail.edgeId)!;
      const from = building.nodes.find(node => node.id === edge.from)!;
      const to = building.nodes.find(node => node.id === edge.to)!;
      return `${edgeNamesKk[edge.type]}: ${nodeLabelKk(from.id, from.label, from.labelKk)} → ${nodeLabelKk(to.id, to.label, to.labelKk)}. ${detail.reasons.map(reason => reasonNamesKk[reason]).join('; ')}.`;
    })];
  const start = building.nodes.find(node => node.id === result.nodeIds[0])!;
  const end = building.nodes.find(node => node.id === result.nodeIds.at(-1))!;
  const warnings = diagnosis.details.map(detail => `Расталмаған ${result.edgeIds.indexOf(detail.edgeId) + 1}-қадам: ${detail.reasons.map(reason => reasonNamesKk[reason]).join('; ')}.`);
  return [result.edgeIds.length ? `${routeOutcomeKk(result, diagnosis)} ${nodeLabelKk(start.id, start.label, start.labelKk)} → ${nodeLabelKk(end.id, end.label, end.labelKk)}. ${kk.route.floors(diagnosis.floors)}. ${kk.route.stepFree(diagnosis.stepFree)}.` : `Бастапқы және соңғы нүктелер бірдей: ${nodeLabelKk(start.id, start.label, start.labelKk)}. Қашықтық нөл метр.`,
    kk.fictionDetail, ...(warnings.length ? [kk.route.uncertainty, ...warnings] : []),
    ...result.edgeIds.map((_, index) => stepTextKk(building, result, index))];
}
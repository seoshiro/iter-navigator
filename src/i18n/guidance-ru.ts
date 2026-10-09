import type { Building, RouteResult } from '../domain/model';
import type { RouteDiagnosis } from '../ui/route-diagnosis';
import type { SpeechStatus } from '../ui/speech';
import { countRu, edgeNames, nodeLabelRu, numberRu, reasonNames, ru } from './ru';

export const speechRu: Record<SpeechStatus, string> = {
  unsupported: 'Браузер не поддерживает чтение голосом. Текст маршрута доступен.',
  loading: 'Ожидаем список голосов браузера. Чтение начнётся только по вашему действию.',
  unavailable: 'Локальный русский голос пока недоступен. Можно установить его в системе; текст маршрута доступен.',
  ready: 'Локальный русский голос готов. Чтение добровольное; микрофон не используется.',
  speaking: 'Читаем выбранный маршрут или действие.', stopped: 'Чтение остановлено. Для продолжения нажмите кнопку чтения.',
  error: 'Браузер не смог прочитать текст. Повторите чтение вручную; маршрут доступен в тексте.',
};
export const guidanceRu = {
  enable: 'Включить озвучивание', stop: 'Остановить озвучивание', readRoute: 'Прочитать маршрут', readStep: 'Прочитать текущий шаг',
  rate: 'Скорость чтения', voice: 'Локальный русский голос', defaultVoice: 'Первый доступный локальный голос',
  storageWarning: 'Не удалось восстановить или сохранить скорость и голос. Настройки действуют в этой вкладке.',
  compare: 'Сравнить пути по условиям модели', compareCompact: 'Сравнить пути', comparisonHint: 'Основной путь — кратчайший. Дополнительные пути используют те же требования и закрытия.',
  primary: 'Основной путь', variant: (index: number) => `Вариант ${index + 1}`, stepReview: 'Просмотр шага', all: 'Весь маршрут', previous: 'Предыдущий шаг', next: 'Следующий шаг',
  allSelected: 'Показан весь маршрут. Шаги переключаются только по вашему действию.',
  noTransition: 'Без межэтажного перехода', complete: 'Без неполных активных данных.', incomplete: (count: number) => `Неполные активные данные: участков ${count}.`,
  noAdditional: 'При текущих требованиях и закрытиях дополнительных путей нет.',
  noAdditionalZero: 'Начало и цель совпадают. Дополнительный путь для этой точки не требуется.',
  floorShown: (floor: 'all' | number) => floor === 'all' ? 'Показаны все этажи модели.' : `Показан ${floor + 1} этаж модели.`,
  floorLabel: 'Этаж',
  floorsCompact: (floors: number[]) => `Этажи: ${floors.map(floor => floor + 1).join(' → ')}`,
  routeChanged: (start: string, end: string) => `Маршрут: ${start} — ${end}.`,
  closure: (label: string, open: boolean) => `${label}: ${open ? 'открыто' : 'закрыто'} в симуляции.`,
  preset: (label: string) => `Выбраны условия: ${label}.`, reset: 'Сценарий сброшен. От входа к аудитории 204.',
  stairs: (excluded: boolean) => excluded ? 'Лестницы и ступени исключены.' : 'Лестницы допустимы по выбранным условиям.',
  surface: (smooth: boolean) => smooth ? 'Выбрано только ровное покрытие.' : 'Допустимо любое покрытие по выбранным условиям.',
  unknown: (allowed: boolean) => allowed ? 'Разрешены неподтверждённые участки. Известные нарушения по-прежнему исключены.' : 'Участки с неполными активными данными исключены.',
  width: (value: string) => `Минимальная ширина ${value} сантиметров.`, slope: (value: string) => `Максимальный уклон ${value} процентов.`,
  selected: (index: number) => `Выбран ${index === 0 ? 'основной путь' : `вариант ${index + 1}`}.`,
  allShown: 'Показан весь выбранный маршрут.',
  stepWarning: (reasons: string[]) => `Неподтверждённый шаг. ${reasons.join('; ')}.`,
  cameraActions: 'Действия с 3D видом', zoom2d: 'Масштаб 2D схемы', zoomOut2d: 'Уменьшить масштаб схемы', zoomIn2d: 'Увеличить масштаб схемы', reset2d: 'Сброс масштаба схемы',
};
export function routeOutcomeRu(result: RouteResult, diagnosis: RouteDiagnosis) {
  const reasons = [...new Set(diagnosis.details.flatMap(detail => detail.reasons))].map(reason => reasonNames[reason]).join('; ');
  if (result.status === 'invalid') return ru.route.invalid;
  if (result.status === 'no-route') return `${diagnosis.kind === 'insufficient' ? ru.route.insufficient : ru.route.noRoute}${reasons ? `. ${reasons}` : ''}.`;
  if (!result.edgeIds.length) return 'Начало и цель — одна выбранная точка. Расстояние ноль метров.';
  return `${diagnosis.kind === 'uncertain' ? 'Неподтверждённый маршрут' : 'Маршрут по условиям модели'}. ${numberRu(result.distanceM)} метров по учебному графу${reasons ? `. ${reasons}` : ''}.`;
}
const actionRu = { corridor: 'Пройдите', door: 'Пройдите через дверь', ramp: 'Пройдите по пандусу', lift: 'Воспользуйтесь лифтом', stairs: 'Пройдите по лестнице' };
export function stepTextRu(building: Building, result: Extract<RouteResult, { status: 'ok' }>, index: number) {
  const edge = building.edges.find(item => item.id === result.edgeIds[index])!;
  const from = building.nodes.find(item => item.id === result.nodeIds[index])!;
  const to = building.nodes.find(item => item.id === result.nodeIds[index + 1])!;
  const floors = from.floor === to.floor ? `${to.floor + 1} этаж` : `с ${from.floor + 1} на ${to.floor + 1} этаж`;
  return `Шаг ${index + 1}. ${actionRu[edge.type]}: ${nodeLabelRu(from.id, from.label)} — ${nodeLabelRu(to.id, to.label)}. ${edgeNames[edge.type]}, ${numberRu(edge.lengthM)} ${countRu(edge.lengthM, ['метр', 'метра', 'метров']).split(' ').slice(1).join(' ')} по учебному графу. ${floors}.`;
}
export function routeSpeechRu(building: Building, result: RouteResult, diagnosis: RouteDiagnosis): string[] {
  if (result.status === 'invalid') return [ru.route.invalid, 'Выберите точки и допустимые требования из формы.'];
  if (result.status === 'no-route') return [diagnosis.kind === 'insufficient' ? ru.route.insufficient : ru.route.noRoute,
    diagnosis.kind === 'insufficient' ? ru.route.insufficientHint : diagnosis.connected ? ru.route.blockedHint : ru.route.disconnectedHint,
    ...diagnosis.details.map(detail => {
      const edge = building.edges.find(item => item.id === detail.edgeId)!;
      const from = building.nodes.find(node => node.id === edge.from)!;
      const to = building.nodes.find(node => node.id === edge.to)!;
      return `${edgeNames[edge.type]}: ${nodeLabelRu(from.id, from.label)} — ${nodeLabelRu(to.id, to.label)}. ${detail.reasons.map(reason => reasonNames[reason]).join('; ')}.`;
    })];
  const start = building.nodes.find(node => node.id === result.nodeIds[0])!;
  const end = building.nodes.find(node => node.id === result.nodeIds.at(-1))!;
  const warnings = diagnosis.details.map(detail => {
    const index = result.edgeIds.indexOf(detail.edgeId);
    return `Неподтверждённый шаг ${index + 1}: ${detail.reasons.map(reason => reasonNames[reason]).join('; ')}.`;
  });
  return [result.edgeIds.length ? `${routeOutcomeRu(result, diagnosis)} ${nodeLabelRu(start.id, start.label)} — ${nodeLabelRu(end.id, end.label)}. ${ru.route.floors(diagnosis.floors)}. ${ru.route.stepFree(diagnosis.stepFree)}.` : `Начало и цель — одна выбранная точка: ${nodeLabelRu(start.id, start.label)}. Расстояние ноль метров.`,
    ru.fictionDetail, ...(warnings.length ? [ru.route.uncertainty, ...warnings] : []),
    ...result.edgeIds.map((_, index) => stepTextRu(building, result, index))];
}

import type { EdgeType, ExclusionReason } from '../domain/model';

const room205Uncertainty = 'ширина и покрытие неизвестны';

export const ru = {
  brand: 'Iter', tagline: 'Путь с понятными условиями',
  fiction: 'Учебная демонстрация · вымышленное здание',
  fictionDetail: 'Все размеры и свойства заданы для примера. Реального обследования не было. Этот маршрут не подтверждает доступность или безопасность реального здания.',
  evidenceSource: 'Источник: авторская вымышленная модель. Дата обследования: отсутствует.',
  modelGeometry: 'Условная геометрия',
  start: 'Откуда', destination: 'Куда', requirements: 'Требования к маршруту',
  width: 'Минимальная ширина, см', slope: 'Максимальный уклон, %',
  noStairs: 'Без лестниц и ступеней', smooth: 'Только ровное покрытие', unknown: 'Разрешить участки с неполными данными',
  unknownHint: 'Маршрут с такими участками будет помечен как неподтверждённый.',
  reset: 'Сбросить сценарий',
  room205: 'Дверь 205: ширина и покрытие неизвестны. Отсутствие ступеней и уклон заданы в вымышленной модели. Даты обследования нет.',
  room205Label: `Аудитория 205 · ${room205Uncertainty}`,
  invalidEndpointLabel: 'Неизвестная точка',
  invalidEndpointDescription: 'Точка отсутствует в учебной модели. Выберите значение из списка.',
  endpointFloor: (floor: number) => `${floor + 1} этаж · условная точка`,
  sceneHelp3d: 'Перетяните модель левой кнопкой для поворота, правой или средней — для смещения. Включите «Жесты камеры» для колеса и сенсорного управления: один палец поворачивает, два масштабируют и смещают. Без включения страница прокручивается как обычно. Все действия доступны кнопками. Камера не показывает ваше положение.',
  route: {
    insufficient: 'Недостаточно данных для подтверждения маршрута',
    noRoute: 'Нет подходящего маршрута', invalid: 'Некорректные данные',
    insufficientHint: 'В модели есть путь без известных нарушений, но не хватает данных об активных требованиях. Для такого пути нужно явно разрешить участки с неполными данными.',
    blockedHint: 'При выбранных требованиях и закрытиях путь не найден. Ниже указаны препятствия на одном из возможных путей; они не описывают все возможные пути.',
    disconnectedHint: 'Выбранные точки не соединены в учебном графе. Изменение требований или закрытий не создаёт отсутствующий проход.',
    missing: 'Недостающие активные данные', obstacles: 'Препятствия на одном из путей',
    uncertainty: 'Не все характеристики известны',
    floors: (floors: number[]) => `Этажи маршрута: ${floors.map(floor => floor + 1).join(' → ')}`,
    stepFree: (value: boolean | null) => value === true ? 'Без ступеней по данным модели' : value === false ? 'Есть лестница или ступени по данным модели' : 'Отсутствие ступеней не задано для всего пути',
  },
  camera: { swap: 'Поменять начало и цель', fit: 'Показать весь маршрут', focus: 'Показать на модели', destinationFocus: 'Показать цель на модели', gestures: 'Жесты камеры', clearFocus: 'Снять выделение', tiltUp: 'Поднять ракурс', tiltDown: 'Опустить ракурс' },
  sceneHelp2d: 'Схема показывает выбранные этажи и тот же маршрут, что и текст. Стрелки указывают порядок прохода, не положение человека. Этажи можно переключать кнопками.',
  display: {
    entry: 'Вид и текст',
    title: 'Отображение', theme: 'Тема', dark: 'Тёмная', light: 'Светлая', largerText: 'Крупный текст', reduceMotion: 'Уменьшить движение',
    systemReduced: 'Движение отключено настройкой вашей системы. Личная настройка сохраняется отдельно.',
    motionHint: 'Стрелки показывают порядок пути, а не ваше положение. Движение краткое; маршрут доступен без него.',
    storageWarning: 'Не удалось восстановить или сохранить настройки отображения. Они действуют в этой вкладке; сохранение после перезагрузки не гарантировано.',
  },
};
// Presentation labels leave the graph, canonical journal passage catalog and stored IDs unchanged.
export const nodeLabelRu = (id: string, label: string) => id === 'room-205' ? ru.room205Label : label;
export const passageLabelRu = (id: string | null, label: string) => id === 'door-205' ? `Дверь в аудиторию 205 · ${room205Uncertainty}` : label;
export const edgeNames: Record<EdgeType, string> = { corridor: 'Проход', door: 'Дверь', ramp: 'Пандус', lift: 'Лифт', stairs: 'Лестница' };
export const reasonNames: Record<ExclusionReason, string> = {
  closed: 'закрыто в симуляции', stairs: 'лестница запрещена', 'step-free': 'есть ступени', width: 'недостаточная ширина',
  slope: 'уклон выше заданного', surface: 'неровное покрытие', 'unknown-step-free': 'неизвестно наличие ступеней',
  'unknown-width': 'неизвестная ширина', 'unknown-slope': 'неизвестный уклон', 'unknown-surface': 'неизвестное покрытие',
};
export const numberRu = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
export function countRu(value: number, forms: [string, string, string]) {
  const last = value % 10; const lastTwo = value % 100;
  return `${value} ${forms[lastTwo >= 11 && lastTwo <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2]}`;
}

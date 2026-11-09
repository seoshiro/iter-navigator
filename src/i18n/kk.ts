import fixture from '../data/building.json';
import type { EdgeType, ExclusionReason } from '../domain/model';
import type { ru } from './ru';

const room205Uncertainty = 'ені мен жабыны белгісіз';
export const kk: typeof ru = {
  brand: 'Iter', tagline: 'Жолдың шарттары түсінікті',
  fiction: 'Оқу демонстрациясы · ойдан шығарылған ғимарат',
  fictionDetail: 'Барлық өлшемдер мен сипаттар мысал үшін берілген. Нақты тексеру жүргізілген жоқ. Бұл маршрут нақты ғимараттың қолжетімді немесе қауіпсіз екенін растамайды.',
  evidenceSource: 'Дереккөз: авторлық ойдан шығарылған модель. Тексеру күні: жоқ.',
  modelGeometry: 'Шартты геометрия', start: 'Қайдан', destination: 'Қайда', requirements: 'Маршрутқа қойылатын талаптар',
  width: 'Ең аз ені, см', slope: 'Ең үлкен еңіс, %',
  noStairs: 'Баспалдақсыз және сатыларсыз', smooth: 'Тек тегіс жабын', unknown: 'Дерегі толық емес бөліктерге рұқсат беру',
  unknownHint: 'Мұндай бөліктері бар маршрут расталмаған деп белгіленеді.', reset: 'Сценарийді бастапқы күйге келтіру',
  room205: '205-аудиторияның есігі: ені мен жабыны белгісіз. Сатылардың жоқтығы мен еңісі ойдан шығарылған модельде берілген. Тексеру күні жоқ.',
  room205Label: `205-аудитория · ${room205Uncertainty}`,
  invalidEndpointLabel: 'Белгісіз нүкте', invalidEndpointDescription: 'Бұл нүкте оқу моделінде жоқ. Тізімнен нүкте таңдаңыз.',
  endpointFloor: (floor: number) => `${floor + 1}-қабат · шартты нүкте`,
  sceneHelp3d: 'Үлгіні бұру үшін тінтуірдің сол жақ батырмасымен, жылжыту үшін оң немесе ортаңғы батырмасымен сүйреңіз. Дөңгелекпен және сенсорлық экранмен басқару үшін «Камера қимылдарын» қосыңыз: бір саусақ бұрады, екеуі масштабтайды және жылжытады. Қосылмаса, бет әдеттегідей айналдырылады. Барлық әрекеттерді батырмалармен орындауға болады. Камера сіздің орныңызды көрсетпейді.',
  route: {
    insufficient: 'Маршрутты растауға дерек жеткіліксіз', noRoute: 'Сәйкес маршрут жоқ', invalid: 'Деректер дұрыс емес',
    insufficientHint: 'Модельде белгілі талаптарды бұзбайтын жол бар, бірақ қолданылған талаптар бойынша дерек жеткіліксіз. Бұл жол үшін дерегі толық емес бөліктерге рұқсат беру қажет.',
    blockedHint: 'Таңдалған талаптар мен жабылулар бойынша жол табылмады. Төменде ықтимал жолдардың біріндегі кедергілер көрсетілген; олар барлық жолдарды сипаттамайды.',
    disconnectedHint: 'Таңдалған нүктелер оқу графында қосылмаған. Талаптарды немесе жабылуларды өзгерту жоқ өткелді жасамайды.',
    missing: 'Қолданылған талаптар бойынша жетіспейтін деректер', obstacles: 'Жолдардың біріндегі кедергілер', uncertainty: 'Барлық сипаттар белгілі емес',
    floors: (floors: number[]) => `Маршрут қабаттары: ${floors.map(floor => floor + 1).join(' → ')}`,
    stepFree: (value: boolean | null) => value === true ? 'Модель деректері бойынша сатылар жоқ' : value === false ? 'Модель деректері бойынша баспалдақ немесе сатылар бар' : 'Жолдың барлық бөлігінде сатылардың жоқтығы көрсетілмеген',
  },
  camera: { swap: 'Бастапқы және соңғы нүктелерді ауыстыру', fit: 'Бүкіл маршрутты көрсету', focus: 'Модельден көрсету', destinationFocus: 'Мақсатты модельден көрсету', gestures: 'Камера қимылдары', clearFocus: 'Бөлектеуді алып тастау', tiltUp: 'Көру бұрышын көтеру', tiltDown: 'Көру бұрышын түсіру' },
  sceneHelp2d: 'Сызба таңдалған қабаттарды және мәтіндегі маршрутты көрсетеді. Бағыттамалар адамның орнын емес, жүру ретін көрсетеді. Қабаттарды батырмалармен ауыстыруға болады.',
  display: {
    entry: 'Көрініс, мәтін және дауыс', title: 'Көрсету баптаулары', theme: 'Тақырып', dark: 'Қараңғы', light: 'Жарық', largerText: 'Ірі мәтін', reduceMotion: 'Қозғалысты азайту',
    systemReduced: 'Жүйе баптауы бойынша қозғалыс өшірілген. Жеке баптау бөлек сақталады.',
    motionHint: 'Бағыттамалар орныңызды емес, жолдың ретін көрсетеді. Қозғалыс қысқа; маршрут онсыз да қолжетімді.',
    storageWarning: 'Көрсету баптауларын қалпына келтіру немесе сақтау мүмкін болмады. Олар осы бетте қолданылады; қайта жүктегеннен кейін сақталмауы мүмкін.',
  },
};
export const edgeNamesKk: Record<EdgeType, string> = { corridor: 'Өткел', door: 'Есік', ramp: 'Пандус', lift: 'Лифт', stairs: 'Баспалдақ' };
export const reasonNamesKk: Record<ExclusionReason, string> = {
  closed: 'симуляцияда жабық', stairs: 'баспалдаққа рұқсат жоқ', 'step-free': 'сатылар бар', width: 'ені жеткіліксіз',
  slope: 'еңісі белгіленгеннен артық', surface: 'жабыны тегіс емес', 'unknown-step-free': 'сатылардың бар-жоғы белгісіз',
  'unknown-width': 'ені белгісіз', 'unknown-slope': 'еңісі белгісіз', 'unknown-surface': 'жабыны белгісіз',
};
const labels: Record<string, string> = {
  entrance: 'Басты кіреберіс', 'room-204': '204-аудитория', 'room-301': '301-оқу залы',
  'room-library': 'Кітапхана', 'room-dean': 'Деканат', 'room-canteen': 'Асхана',
  'room-medical': 'Медициналық пункт', 'room-toilets': 'Дәретхана', 'room-wardrobe': 'Киім ілетін орын',
};
/** Translate known fixture labels only; graph and journal identities never change. */
export function modelTextKk(label: string): string {
  return label
    .replace(/Главный вход/g, 'Басты кіреберіс').replace(/Восточный проход/g, 'Шығыс өткелі')
    .replace(/Читальный зал (\d+)/g, '$1-оқу залы').replace(/Аудитория (\d+)/g, '$1-аудитория')
    .replace(/Дверь в аудиторию (\d+)/g, '$1-аудиторияның есігі')
    .replace(/Лестница/g, 'Баспалдақ').replace(/Галерея/g, 'Галерея').replace(/Холл/g, 'Холл')
    .replace(/Библиотека/g, 'Кітапхана').replace(/Деканат/g, 'Деканат').replace(/Столовая/g, 'Асхана')
    .replace(/Медпункт/g, 'Медициналық пункт').replace(/Медицинский пункт/g, 'Медициналық пункт')
    .replace(/Санузел/g, 'Дәретхана').replace(/Лифт ([AB])/g, '$1 лифті').replace(/Туалеты?/g, 'Дәретхана').replace(/Гардероб/g, 'Киім ілетін орын')
    .replace(/(\d+) этаж/g, '$1-қабат').replace(/неизвестная дверь/g, 'есік деректері белгісіз')
    .replace(/ширина и покрытие неизвестны/g, room205Uncertainty);
}
const fixtureLabels: Record<string, string> = Object.fromEntries(fixture.nodes.map(node => [node.id, node.labelKk]));
export const nodeLabelKk = (id: string, label: string, labelKk?: string) => id === 'room-205' ? kk.room205Label : labelKk ?? fixtureLabels[id] ?? labels[id] ?? modelTextKk(label);
export function passageLabelKk(id: string | null, label: string, labelKk?: string) {
  if (id === 'door-205') return `205-аудиторияның есігі · ${room205Uncertainty}`;
  if (labelKk) return labelKk;
  const edge = fixture.edges.find(item => item.id === id);
  return edge ? `${nodeLabelKk(edge.from, '')} → ${nodeLabelKk(edge.to, '')}` : modelTextKk(label);
}
export const numberKk = (value: number) => new Intl.NumberFormat('kk-KZ', { maximumFractionDigits: 2 }).format(value);
const countWords: Record<string, string> = { 'участок': 'бөлік', 'неподтверждённый участок': 'расталмаған бөлік', 'метр': 'метр', 'этаж': 'қабат', 'шаг': 'қадам', 'переход': 'ауысу' };
export const countKk = (value: number, forms: [string, string, string]) => `${numberKk(value)} ${countWords[forms[0]] ?? forms[0]}`;
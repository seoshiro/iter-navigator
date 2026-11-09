import type { ReactNode } from 'react';
import type { PresentationLanguage } from './content';
import { presentationCopy } from './content';
import { RouteInterface } from './RouteInterface';
import { route204, route205Strict, route205Unknown } from './runtime';
import './printRevision.css';

const ignoreSelection = (value: number | null) => { void value; };
const asset = (name: string, lang: PresentationLanguage) => `/presentation/media/${name}${lang === 'kk' ? '-kk' : ''}.webp`;

/** Static counterparts of the actual model and shared navigation components. */
export function PrintScene({ index, lang, heading, note }: { index: number; lang: PresentationLanguage; heading: ReactNode; note: ReactNode }) {
  const t = (ru: string, kk: string) => lang === 'kk' ? kk : ru;
  const copy = presentationCopy[lang].scenes[index]!;
  const routeDistance = route204.status === 'ok' ? route204.distanceM : 0;
  return <section className={`pres-slide pres-slide-${copy.id} pres-revised-print`} data-testid="presentation-scene" data-scene={copy.id} data-scene-number={index + 1} data-print-revision="actual-model-v2" aria-labelledby={`pres-title-${index}`}>
    {index === 5 && <>
      <div className="pres-copy-column">{heading}
        <div className="pres-print-policies">
          <div data-route-status={route205Strict.status}><strong>{t('Строго', 'Қатаң')}</strong><p>{t('Путь к 205 не подтверждён: не хватает данных.', '205-ке жол расталмады: дерек жеткіліксіз.')}</p></div>
          <div className="pres-print-policy-unknown" data-route-status={route205Unknown.status} data-uncertain-edges={route205Unknown.status === 'ok' ? route205Unknown.uncertainEdgeIds.join(',') : ''}><strong>{t('Если разрешить неизвестное', 'Белгісізге рұқсат берілсе')}</strong><p>{t('Путь найден, но остаётся неподтверждённым.', 'Жол табылды, бірақ расталмаған күйде қалады.')}</p></div>
        </div>
        <p className="pres-rule">{t('Другой проход шириной 72 см по-прежнему исключён: 72 см < 90 см.', 'Ені 72 см басқа өткел әлі де алынып тасталады: 72 см < 90 см.')}</p>{note}
      </div>
      <figure className="pres-print-door-focus" data-testid="print-door205-figure">
        <div className="pres-print-figure-title"><span>205</span><strong>{t('Реальный проём в модели', 'Модельдегі нақты есік ойығы')}</strong></div>
        <img width="1920" height="1080" src={asset('door205-focus', lang)} alt={t('Крупный план реального проёма двери 205, выделенного в учебной 3D-модели', 'Оқу 3D-моделінде белгіленген 205 есігінің нақты ойығының ірі көрінісі')} />
        <figcaption>{t('Ширина и покрытие неизвестны. Видимая геометрия не заменяет измерения.', 'Ені мен жабыны белгісіз. Көрінетін геометрия өлшемнің орнына жүрмейді.')}</figcaption>
      </figure>
    </>}
    {index === 6 && <>
      <div className="pres-copy-column">{heading}
        <ol className="pres-print-guidance-points">
          <li><span>01</span><p>{t('Настоящая схема и текст одного маршрута.', 'Бір маршруттың нақты сызбасы мен мәтіні.')}</p></li>
          <li><span>02</span><p>{t('Шаги переключаются вручную. Положение не отслеживается.', 'Қадамдар қолмен ауыстырылады. Орналасу бақыланбайды.')}</p></li>
          <li><span>03</span><p>{t('Тот же интерфейс на русском и казахском.', 'Сол интерфейс орысша және қазақша.')}</p></li>
        </ol>
        <p className="pres-scene-note">{t('Компоненты работающего навигатора. Здесь показан третий шаг маршрута к 204.', 'Жұмыс істейтін навигатор компоненттері. Мұнда 204-ке маршруттың үшінші қадамы көрсетілген.')}</p>
      </div>
      <div className="pres-print-guidance" data-testid="print-shared-guidance"><RouteInterface lang={lang} selected={2} onSelect={ignoreSelection} /></div>
    </>}
    {index === 7 && <>
      <div className="pres-wide-heading">{heading}</div>
      <div className="pres-print-graph-comparison" data-testid="print-graph-comparison">
        <figure><div className="pres-print-figure-title"><span>01</span><strong>{t('Исходный граф здания', 'Ғимараттың бастапқы графы')}</strong></div><img width="1920" height="1080" src={asset('graph-source', lang)} alt={t('Настоящие узлы и связи учебной модели до отбора проходов', 'Өткелдерді іріктеуге дейінгі оқу моделінің нақты түйіндері мен байланыстары')} /><figcaption>{t('Точки и проходы из тех же данных, что использует навигатор.', 'Навигатор қолданатын деректердегі нүктелер мен өткелдер.')}</figcaption></figure>
        <figure><div className="pres-print-figure-title"><span>02</span><strong>{t(`После требований: путь ${routeDistance} м`, `Талаптардан кейін: ${routeDistance} м жол`)}</strong></div><img width="1920" height="1080" src={asset('graph-filtered-route', lang)} alt={t('Допустимые связи и настоящий маршрут к 204 через лифт A после применения требований', 'Талаптар қолданылғаннан кейінгі жарамды байланыстар және A лифті арқылы 204-ке нақты маршрут')} /><figcaption>{t('Отбор проходов → алгоритм Дейкстры → один результат в 2D, 3D и тексте.', 'Өткелдерді іріктеу → Дейкстра алгоритмі → 2D, 3D және мәтіндегі бір нәтиже.')}</figcaption></figure>
      </div>
      <div className="pres-print-graph-rules"><span>{t('Без ступеней', 'Сатысыз')}</span><span>{t('Ширина ≥ 90 см', 'Ені ≥ 90 см')}</span><span>{t('Уклон ≤ 5%', 'Көлбеу ≤ 5%')}</span><span>{t('Ровное покрытие', 'Тегіс жабын')}</span><span>{t('Неизвестное исключено', 'Белгісізі алынған')}</span></div>
      {note}
    </>}
  </section>;
}

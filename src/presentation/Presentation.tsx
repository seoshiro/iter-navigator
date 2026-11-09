import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, TouchEvent } from 'react';
import { flushSync } from 'react-dom';
import { useI18n } from '../i18n/locale';
import { FloorPlan } from '../components/FloorPlan';
import { findRoute } from '../domain/routing';
import { fitRouteCamera, focusNodeCamera, INITIAL_CAMERA } from '../ui/camera';
import type { CameraState } from '../ui/camera';
import type { Requirements, RouteResult } from '../domain/model';
import { presentationCopy } from './content';
import type { PresentationLanguage } from './content';
import {
  presentationBuilding as building, presentationRequirements as requirements,
  route204, detour204, route205Strict, route205Unknown, liftAEdges, noVisibleRoute,
  PUBLIC_NAVIGATOR_URL, SCENE_IDS, MODEL_SCENES, navigatorLink, readScene, posterForScene,
} from './runtime';
import './presentation.css';
import './choreography.css';
import './laterScenes.css';
import './compositionRevision.css';
import { RouteInterface } from './RouteInterface';
import { PrintScene } from './PrintScenes';
import { gsap } from 'gsap';
import { createDioramaPose } from '../ui/dioramaDirector';
import type { DioramaDirectorController } from '../ui/dioramaDirector';
import { scenePose, stageTransform } from './choreography';
import { IntroFilm } from './IntroFilm';
import { PilotConcept } from './PilotConcept';

const Diorama = lazy(() => import('../components/Diorama'));
const EMPTY_EDGES: string[] = [];
const ignoreCameraChange = (_camera: CameraState) => { void _camera; };
const distance = (route: RouteResult) => route.status === 'ok' ? route.distanceM : null;
const isInput = (target: EventTarget | null) => target instanceof Element && !!target.closest('input, select, textarea, video, audio, [contenteditable="true"], [role="slider"]');
const isInteractive = (target: EventTarget | null) => target instanceof Element && !!target.closest('button, a, input, select, textarea, summary, video, audio, [contenteditable="true"]');

class ModelBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
function Poster({ index, lang, className = '' }: { index: number; lang: PresentationLanguage; className?: string }) {
  const [failed, setFailed] = useState(false);
  const result = index === 4 ? detour204 : index === 3 ? route204 : noVisibleRoute;
  return <div className={`pres-poster ${className}`} data-testid="presentation-poster" data-media-fallback={failed}>
    {failed ? <><FloorPlan building={building} result={result} floor={1} closedEdgeIds={index === 4 ? liftAEdges : EMPTY_EDGES} /><span className="pres-media-note">{lang === 'kk' ? 'Модельдің орнына ғимарат сызбасы' : 'Схема здания вместо модели'}</span></> : <img src={posterForScene(index, lang)} alt={presentationCopy[lang].scenes[index]!.visualLabel} loading="eager" decoding="sync" onError={() => setFailed(true)} />}
  </div>;
}
function RouteLine({ result, lang }: { result: RouteResult; lang: PresentationLanguage }) {
  const { nodeLabelRu } = useI18n();
  if (result.status !== 'ok') return <div className="pres-route-output pres-warning" role="status">{lang === 'kk' ? 'Берілген талаптарға сай маршрут жоқ.' : 'При этих требованиях маршрут не найден.'}</div>;
  const important = result.nodeIds.filter(id => id === result.nodeIds[0] || id === result.nodeIds.at(-1) || id.startsWith('lift-') || id.startsWith('stairs-'));
  return <div className="pres-route-output" role="status" data-testid="presentation-route-result" data-distance={result.distanceM} data-route-ids={result.edgeIds.join(',')}><strong>{result.distanceM}<small> м</small></strong><div><span>{lang === 'kk' ? 'Граф бойынша есептелді' : 'Рассчитано по графу'}</span><p>{important.map(id => { const node = building.nodes.find(n => n.id === id)!; return nodeLabelRu(node.id, node.label, node.labelKk); }).join(' → ')}</p></div></div>;
}
function BarrierDiagram({ lang }: { lang: PresentationLanguage }) {
  const t = (ru: string, kk: string) => lang === 'kk' ? kk : ru;
  return <div className="pres-barriers" aria-label={t('Три барьера на пути: лестница, узкий проход и закрытый лифт. Условная схема.', 'Жолдағы үш кедергі: баспалдақ, тар өткел және жабық лифт. Шартты сызба.')}><div className="pres-barrier-line" aria-hidden="true" />{[
    { name: t('Лестница', 'Баспалдақ'), detail: t('Нужен путь без ступеней', 'Сатысыз жол қажет'), icon: <path d="M10 58h16V43h16V28h16V13h16" /> },
    { name: t('Узкий проход', 'Тар өткел'), detail: t('Ширина имеет значение', 'Ені маңызды'), icon: <><path d="M19 65V12h46v53M34 60V23h16v37" /><path d="m8 38 10 8-10 8m68-16-10 8 10 8" /></> },
    { name: t('Закрытый лифт', 'Жабық лифт'), detail: t('Нужен другой переход', 'Басқа өткел қажет'), icon: <><rect x="18" y="12" width="48" height="54" rx="3" /><path d="M42 13v53M30 31l24 24m0-24L30 55" /></> },
  ].map((item, index) => <div className="pres-barrier" key={index}><span className="pres-small-number">0{index + 1}</span><svg viewBox="0 0 84 80" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{item.icon}</svg><h3>{item.name}</h3><p>{item.detail}</p></div>)}<div className="pres-barrier-destination"><span>204</span><small>{t('Цель та же. Путь зависит от условий.', 'Мақсат бір. Жол талаптарға байланысты.')}</small></div></div>;
}
function DoorDiagram({ allowed, lang }: { allowed: boolean; lang: PresentationLanguage }) {
  const t = (ru: string, kk: string) => lang === 'kk' ? kk : ru;
  const items = [
    { id: 'door-204', number: '204', width: '105', state: t('Известно', 'Белгілі'), detail: t('Основная дверь', 'Негізгі есік'), status: 'known' },
    { id: 'door-205', number: '205', width: '?', state: t('Неизвестно', 'Белгісіз'), detail: t('Ширина и покрытие', 'Ені мен жабыны'), status: 'unknown' },
    { id: 'narrow-204', number: '204', width: '72', state: t('Исключён', 'Алып тасталды'), detail: t('Боковой проход', 'Бүйір өткел'), status: 'excluded' },
  ];
  return <div className="pres-doors" data-allow-unknown={allowed}>{items.map(item => <div className={`pres-door pres-door-${item.status}`} key={item.id}><div className="pres-door-drawing" aria-hidden="true"><span>{item.number}</span><i /></div><strong>{item.width}<small>{item.width !== '?' ? ' см' : ''}</small></strong><b>{item.state}</b><p>{item.detail}</p></div>)}<p className="pres-door-caption">{t('Схема без масштаба · порог требования ≥ 90 см', 'Масштабсыз сызба · талап шегі ≥ 90 см')}</p></div>;
}
function PhoneCapture({ lang, print = false }: { lang: PresentationLanguage; print?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<'steps' | 'qr'>('steps');
  const [startQr, setStartQr] = useState('');
  useEffect(() => { let alive = true; void import('qrcode').then(module => module.toDataURL(navigatorLink(), { width: 520, margin: 4, errorCorrectionLevel: 'M' })).then(value => { if (alive) setStartQr(value); }).catch(() => {}); return () => { alive = false; }; }, []);
  return <figure className="pres-phone-figure">{!print && <div className="pres-mobile-tabs"><button aria-pressed={mode === 'steps'} onClick={() => setMode('steps')}>{lang === 'kk' ? 'Қадамдар' : 'Шаги'}</button><button aria-pressed={mode === 'qr'} onClick={() => setMode('qr')}>{lang === 'kk' ? 'Бастау QR-коды' : 'QR точки старта'}</button></div>}<div className={mode === 'qr' ? 'pres-phone pres-phone-qr' : 'pres-phone'}><div className="pres-phone-speaker" aria-hidden="true" />{mode === 'qr' ? <div className="pres-start-qr">{startQr && <img src={startQr} alt={lang === 'kk' ? 'Негізгі кіреберістен 204-ке маршрут QR-коды' : 'QR маршрута от главного входа к 204'} />}<strong>{lang === 'kk' ? 'Негізгі кіреберіс → 204' : 'Главный вход → 204'}</strong><p>{lang === 'kk' ? 'QR тек бастау нүктесін береді. Орныңыз бақыланбайды.' : 'QR задаёт точку старта. Положение не отслеживается.'}</p><a href={navigatorLink()}>{lang === 'kk' ? 'Маршрутты ашу' : 'Открыть маршрут'} ↗</a></div> : failed ? <div className="pres-phone-fallback"><span>ITER</span><FloorPlan building={building} result={route204} floor={1} closedEdgeIds={EMPTY_EDGES} /><p>{lang === 'kk' ? 'Маршрут қадамдары навигаторда қолжетімді.' : 'Шаги маршрута доступны в навигаторе.'}</p><a href={navigatorLink()}>{lang === 'kk' ? 'Навигаторды ашу' : 'Открыть навигатор'}</a></div> : <img width={780} height={1688} src={`/presentation/media/mobile-steps${lang === 'kk' ? '-kk' : ''}.webp`} alt={lang === 'kk' ? 'ITER навигаторындағы маршрутпен жүру режимінің нақты скриншоты' : 'Настоящий скриншот режима прохождения маршрута в ITER'} loading="eager" decoding="sync" onError={() => setFailed(true)} />}</div><figcaption>{lang === 'kk' ? 'Браузердегі мобильді эмуляция, нақты телефон емес' : 'Мобильная эмуляция в браузере, не физический телефон'}</figcaption></figure>;
}

interface SceneProps {
  index: number; lang: PresentationLanguage; print?: boolean; qr: string;
  closed: boolean; setClosed: (closed: boolean) => void;
  unknown: boolean; setUnknown: (unknown: boolean) => void;
  condition: number; setCondition: (condition: number) => void;
  routeSettled: boolean; systemStep: number; setSystemStep(value: number): void; guidanceStep: number | null; setGuidanceStep(value: number | null): void;
  reveal: boolean; setReveal: (reveal: boolean) => void; phase: number; setPhase: (phase: number) => void; setRecording: (value: boolean) => void; modelFailed: boolean;
}
function Scene({ index, lang, print = false, qr, closed, setClosed, unknown, setUnknown, phase, setPhase, setRecording, modelFailed, condition, setCondition, routeSettled, systemStep, setSystemStep, guidanceStep, setGuidanceStep }: SceneProps) {
  const { nodeLabelRu } = useI18n();
  const t = (ru: string, kk: string) => lang === 'kk' ? kk : ru;
  const copy = presentationCopy[lang].scenes[index]!;
  const [room, setRoom] = useState('room-204');
  const [preset, setPreset] = useState('step-free');
  const [calculation, setCalculation] = useState({ room: 'room-204', preset: 'step-free' });
  const [calculatedExplicitly, setCalculatedExplicitly] = useState(false);
  const selectedRequirements: Requirements = useMemo(() => calculation.preset === 'wide' ? { ...requirements, minWidthM: 1 } : calculation.preset === 'walking' ? { ...requirements, avoidStairs: false, minWidthM: .7, smoothOnly: false } : requirements, [calculation.preset]);
  const calculated = useMemo(() => findRoute(building, 'entrance', calculation.room, selectedRequirements, EMPTY_EDGES), [calculation.room, selectedRequirements]);
  const floor = building.nodes.find(node => node.id === calculation.room)?.floor ?? 1;
  const blocked = print || closed;
  const uncertainty = print || unknown;
  const result205 = uncertainty ? route205Unknown : route205Strict;
  const heading = <div className="pres-copy"><p className="pres-eyebrow"><span>{String(index + 1).padStart(2, '0')}</span>{copy.eyebrow}</p><h1 id={`pres-title-${index}`}>{copy.title}</h1><p className="pres-body">{index === 2 && !print ? t('Проверим три условия: лестницу, ширину двери и переход между этажами.', 'Үш шартты тексерейік: баспалдақ, есік ені және қабаттар арасындағы өткел.') : index === 4 && !print ? t('Закрываем лифт A в симуляции. Требования те же, проверяем другой путь.', 'Симуляцияда A лифтін жабамыз. Талаптар өзгермейді, басқа жолды тексереміз.') : copy.body}</p></div>;
  const note = <p className="pres-scene-note">{index === 2 ? t("Геометрия схематична. Размеры и условия — из данных учебной модели.", "Геометрия сызбалық. Өлшемдер мен шарттар оқу моделінің деректерінен.") : copy.note}</p>;
  const bullets = <ul className="pres-feature-list">{copy.bullets.map((bullet, i) => <li key={i}><span>{String(i + 1).padStart(2, '0')}</span><p>{bullet}</p></li>)}</ul>;
  if (print && index >= 5 && index <= 7) return <PrintScene index={index} lang={lang} heading={heading} note={note} />;
  return <section className={`pres-slide pres-slide-${copy.id}${MODEL_SCENES.has(index) && (!print || [0, 3, 4, 9].includes(index)) ? ' pres-slide-model' : ''}`} data-testid="presentation-scene" data-scene={copy.id} data-scene-number={index + 1} aria-labelledby={`pres-title-${index}`}>
    {index === 0 && <><div className="pres-copy-column">{heading}<div className="pres-intro-mark" aria-hidden="true">ITER<span>↗</span></div><div className="pres-capabilities"><span>RU / KK</span><span>2D + 3D</span><span>WEB</span></div>{note}</div>{print && <Poster index={index} lang={lang} className="pres-static-model" />}</>}
    {index === 1 && (print ? <><div className="pres-wide-heading">{heading}</div><BarrierDiagram lang={lang} />{note}</> : <><div className="pres-copy-column">{heading}<p className="pres-question">{t("Как попасть в аудиторию 204 без лестниц?", "204-аудиторияға баспалдақсыз қалай жетуге болады?")}</p><div className="pres-condition-tags"><span>{t("Лестница", "Баспалдақ")}</span><span>{t("Ширина двери", "Есіктің ені")}</span><span>{t("Лифт", "Лифт")}</span></div>{note}</div></>)}
    {index === 2 && <><div className="pres-copy-column">{heading}{!print && <><div className="pres-condition-actions" role="group" aria-label={t('Проверить условия прохода', 'Өту шарттарын тексеру')}>{[t('Лестница', 'Баспалдақ'), t('Дверь', 'Есік'), t('Лифт A', 'A лифті')].map((label, i) => <button key={i} data-testid={`condition-${i}`} aria-pressed={condition === i} onClick={() => setCondition(i)}><span>0{i + 1}</span>{label}<b aria-hidden="true">↗</b></button>)}</div><div className="pres-condition-explanation" role="status">{condition === 0 ? <><strong>{t('Без ступеней', 'Сатысыз')}</strong><p>{t('Лестница исключена. Нужен другой переход между этажами.', 'Баспалдақ алынған. Қабаттар арасында басқа өткел қажет.')}</p></> : condition === 1 ? <><strong>{t('105 см ≥ 90 см', '105 см ≥ 90 см')}</strong><p>{t('По данным модели основная дверь 204 шириной 105 см соответствует требованию 90 см.', 'Модель деректері бойынша 204 негізгі есігінің ені 105 см, 90 см талабына сай.')}</p></> : <><strong>{t('Подъём через лифт A', 'A лифтімен көтерілу')}</strong><p>{t('В модели лифт соединяет этажи без ступеней. Теперь можно строить путь.', 'Модельде лифт қабаттарды сатысыз байланыстырады. Енді жолды есептеуге болады.')}</p></>}</div></>}<details className="pres-route-disclosure" open={print || undefined}><summary>{t('Изменить цель и требования', 'Мақсат пен талаптарды өзгерту')}</summary><form className="pres-route-form" onSubmit={event => { event.preventDefault(); setCalculation({ room, preset }); setCalculatedExplicitly(true); }}><label>{t('Куда', 'Қайда')}<select aria-label={t('Аудитория или помещение', 'Аудитория немесе бөлме')} value={room} onChange={event => setRoom(event.target.value)} disabled={print}>{building.nodes.filter(node => node.selectable && node.kind === 'room').map(node => <option key={node.id} value={node.id}>{nodeLabelRu(node.id, node.label, node.labelKk)}</option>)}</select></label><label>{t('Требования', 'Талаптар')}<select aria-label={t('Требования к маршруту', 'Маршрут талаптары')} value={preset} onChange={event => setPreset(event.target.value)} disabled={print}><option value="step-free">{t('Без ступеней · ширина ≥ 90 см', 'Сатысыз · ені ≥ 90 см')}</option><option value="wide">{t('Широкий проход · ≥ 100 см', 'Кең өткел · ≥ 100 см')}</option><option value="walking">{t('Лестницы допустимы · ≥ 70 см', 'Баспалдаққа рұқсат · ≥ 70 см')}</option></select></label>{!print && <button className="pres-primary" type="submit">{t('Рассчитать маршрут', 'Маршрутты есептеу')} <span aria-hidden="true">↗</span></button>}</form>{(print || calculatedExplicitly) && <RouteLine result={calculated} lang={lang} />}{(print || calculatedExplicitly) && <a className="pres-text-link" href={navigatorLink(calculation.room, selectedRequirements)}>{t('Открыть этот маршрут в ITER', 'Осы маршрутты ITER-де ашу')} ↗</a>}</details>{note}</div><div className="pres-plan-panel"><span className="pres-panel-caption">{t('Настоящий расчёт · настоящая схема', 'Нақты есептеу · нақты сызба')}</span><FloorPlan building={building} result={calculated} floor={floor} closedEdgeIds={EMPTY_EDGES} selectedNodeId={calculation.room} /><p>{t('Старт: главный вход. Уклон ≤ 5%. Неизвестные параметры запрещены.', 'Бастау: негізгі кіреберіс. Көлбеу ≤ 5%. Белгісіз параметрлерге рұқсат жоқ.')}</p></div></>}
    {index === 3 && <><div className="pres-copy-column">{heading}<div className="pres-room-number">204<span>{t('АУДИТОРИЯ', 'АУДИТОРИЯ')}</span></div>{(print || phase === 4) && <div className="pres-route-meta"><strong>{distance(route204)} м</strong><span>{t('Через лифт A · без ступеней', 'A лифті арқылы · сатысыз')}</span></div>}{!print && <><div className="pres-model-phases" role="group" aria-label={t('Состояния модели', 'Модель күйлері')}><select disabled={modelFailed} aria-label={t('Состояние модели', 'Модель күйі')} value={phase} onChange={event => setPhase(Number(event.target.value))}>{[t('Общий вид', 'Жалпы көрініс'), t('Раскрыть этажи', 'Қабаттарды ашу'), t('Второй этаж', 'Екінші қабат'), t('Аудитория 204', '204-аудитория'), t('Показать путь', 'Жолды көрсету')].map((label, i) => <option key={i} value={i}>{label}</option>)}</select>{[t('Общий вид', 'Жалпы көрініс'), t('Раскрыть этажи', 'Қабаттарды ашу'), t('Второй этаж', 'Екінші қабат'), t('Аудитория 204', '204-аудитория'), t('Показать путь', 'Жолды көрсету')].map((label, i) => <button key={i} disabled={modelFailed} aria-pressed={phase === i} onClick={() => setPhase(i)}>{label}</button>)}</div><button className="pres-video-trigger" onClick={() => setRecording(true)}>{t('Смотреть запись приложения · 15 с', 'Қолданба жазбасын көру · 15 с')} ▷</button></>}{note}</div>{print && <Poster index={index} lang={lang} className="pres-static-model" />}</>}
    {index === 4 && <><div className="pres-copy-column">{heading}<span className="pres-pill pres-amber">{t('Локальная симуляция', 'Жергілікті симуляция')}</span><div className="pres-detour-numbers" data-ready={print || routeSettled}>{(print || routeSettled) ? <><strong>{distance(blocked ? detour204 : route204)}<small> м</small></strong><span className="pres-detour-via">{blocked ? t('через лифт B', 'B лифті арқылы') : t('через лифт A', 'A лифті арқылы')}</span></> : <span className="pres-detour-working">{t('Показываем обход…', 'Айналма жолды көрсетеміз…')}</span>}</div><p className="pres-detour-status" role="status" data-testid="presentation-detour-result" data-distance={print || routeSettled ? distance(blocked ? detour204 : route204) : undefined}>{!print && !routeSettled ? (closed ? t('Лифт A закрыт. Перестраиваем маршрут.', 'A лифті жабық. Маршрутты қайта құрамыз.') : t('Лифт A открыт. Возвращаем исходный путь.', 'A лифті ашық. Бастапқы жолды қайтарамыз.')) : blocked ? t('Лифт A закрыт. Маршрут идёт через B.', 'A лифті жабық. Маршрут B арқылы өтеді.') : t('Лифт A доступен. Исходный маршрут.', 'A лифті қолжетімді. Бастапқы маршрут.')}</p>{!print && <button className="pres-primary" data-testid="presentation-lift-toggle" aria-pressed={closed} onClick={() => setClosed(!closed)}>{closed ? t('Вернуть лифт A', 'A лифтін қайтару') : t('Закрыть лифт A', 'A лифтін жабу')}<span aria-hidden="true">↻</span></button>}{note}</div>{print && <Poster index={index} lang={lang} className="pres-static-model" />}</>}
    {index === 5 && <><div className="pres-copy-column">{heading}<div className="pres-segmented" role="group" aria-label={t('Политика неизвестных данных', 'Белгісіз деректер саясаты')}><button disabled={print} aria-pressed={!uncertainty} onClick={() => setUnknown(false)}>{t('Строго', 'Қатаң')}</button><button disabled={print} data-testid="presentation-unknown-toggle" aria-pressed={uncertainty} onClick={() => setUnknown(true)}>{t('Разрешить неизвестное', 'Белгісізге рұқсат')}</button></div><div className="pres-uncertain-result" role="status" data-testid="presentation-uncertainty-result" data-route-status={result205.status} data-uncertain-edges={result205.status === 'ok' ? result205.uncertainEdgeIds.join(',') : ''}><span className="pres-status-dot" />{uncertainty ? t('Дверь 205: ширина и покрытие неизвестны. Путь разрешён явно.', '205 есігі: ені мен жабыны белгісіз. Жолға айқын рұқсат берілді.') : t('Дверь 205: ширина и покрытие неизвестны. Путь исключён.', '205 есігі: ені мен жабыны белгісіз. Жол алынып тасталды.')}</div><p className="pres-rule">{t('Известное нарушение остаётся запретом: 72 см < 90 см.', 'Белгілі сәйкессіздікке тыйым сақталады: 72 см < 90 см.')}</p>{note}</div>{print && <DoorDiagram allowed={uncertainty} lang={lang} />}</>}
    {index === 6 && <><div className="pres-copy-column">{heading}{bullets}<a className="pres-text-link" href={navigatorLink()}>{t('Открыть работающий навигатор', 'Жұмыс істейтін навигаторды ашу')} ↗</a>{note}</div>{print ? <PhoneCapture lang={lang} print /> : <RouteInterface lang={lang} selected={guidanceStep} onSelect={setGuidanceStep} />}</>}
    {index === 7 && <><div className="pres-wide-heading">{heading}</div><div className="pres-pipeline">{[
      [t('Данные', 'Деректер'), t('Узлы, проходы, свойства', 'Түйіндер, өткелдер, қасиеттер'), '01'],
      [t('Фильтрация', 'Сүзу'), t('Требования и закрытия', 'Талаптар мен жабылулар'), '02'],
      [t('Поиск пути', 'Жолды іздеу'), t('Алгоритм Дейкстры', 'Дейкстра алгоритмі'), '03'],
      [t('Представление', 'Көрсету'), '2D · 3D · ' + t('текст', 'мәтін'), '04'],
    ].map(([title, body, number], i) => <button type="button" className="pres-pipeline-step" key={number} aria-pressed={systemStep === i} disabled={print} onClick={() => setSystemStep(i)}><span>{number}</span><h3>{title}</h3><p>{body}</p>{i < 3 && <i aria-hidden="true">→</i>}</button>)}</div><div className="pres-system-aside"><span className="pres-pill">{t('Не AI', 'AI емес')}</span><p>{t('Один граф. Одни требования. Проверяемый результат.', 'Бір граф. Бірдей талаптар. Тексерілетін нәтиже.')}</p><div><b>{t('Журнал сообщений', 'Хабарламалар журналы')}</b><span>{t('Отдельно от графа. Сообщение не меняет маршрут автоматически.', 'Графтан бөлек. Хабарлама маршрутты автоматты өзгертпейді.')}</span></div></div>{note}</>}
    {index === 8 && <><div className="pres-pilot-heading"><span className="pres-pill pres-amber">{t('Следующий шаг · план', 'Келесі қадам · жоспар')}</span>{heading}</div><div className="pres-pilot-layout"><PilotConcept lang={lang} /><ol className="pres-pilot-steps">{copy.bullets.map((item, i) => <li key={i}><span>{String(i + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol></div>{note}</>}
    {index === 9 && <><div className="pres-copy-column">{heading}<div className="pres-finish-brand" aria-hidden="true">ITER<span>↗</span></div><a className="pres-primary pres-open-navigator" href={PUBLIC_NAVIGATOR_URL}>{t('Открыть навигатор', 'Навигаторды ашу')}<span aria-hidden="true">↗</span></a><div className="pres-qr"><a href={PUBLIC_NAVIGATOR_URL} aria-label={t('Открыть ITER по адресу QR-кода', 'QR-код мекенжайы бойынша ITER-ді ашу')}>{qr ? <img src={qr} width="168" height="168" alt={t('QR-код: открыть ITER', 'QR-код: ITER-ді ашу')} /> : <span className="pres-qr-placeholder">ITER ↗</span>}</a><div><strong>{t('Продолжить на своём экране', 'Өз экраныңызда жалғастыру')}</strong><a href={PUBLIC_NAVIGATOR_URL}>iter-navigator.vercel.app</a></div></div>{note}</div>{print && <Poster index={index} lang={lang} className="pres-static-model" />}</>}
  </section>;
}

export default function Presentation() {
  const { locale, setLocale } = useI18n();
  const lang = locale as PresentationLanguage;
  const t = (ru: string, kk: string) => lang === 'kk' ? kk : ru;
  const [print] = useState(() => new URLSearchParams(window.location.search).get('print') === '1');
  const [scene, setScene] = useState(readScene);
  const sceneRef = useRef(scene);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLButtonElement>(null);
  const notesTriggerRef = useRef<HTMLButtonElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const [modelMounted, setModelMounted] = useState(() => MODEL_SCENES.has(readScene()));
  const [modelFailed, setModelFailed] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelAspect, setModelAspect] = useState(1.4);
  const pose = useRef(createDioramaPose({ zoom: .9 }));
  const controller = useRef<DioramaDirectorController | null>(null);
  const [directorReady, setDirectorReady] = useState(false);
  const [settled, setSettled] = useState(true);
  const [readyMediaKey, setReadyMediaKey] = useState('');
  const [introDone, setIntroDone] = useState(() => readScene() !== 0);
  const finishIntro = useCallback(() => setIntroDone(true), []);
  const bindDirector = useCallback((value: DioramaDirectorController | null) => { controller.current = value; setDirectorReady(!!value); value?.apply(); if (import.meta.env.DEV) (window as unknown as { __ITER_DIRECTOR__: unknown }).__ITER_DIRECTOR__ = value ? { pose: pose.current, controller: value } : null; }, []);
  const director = useMemo(() => ({ pose: pose.current, bind: bindDirector, requirements: { ...requirements } }), [bindDirector]);
  const [closed, setClosed] = useState(false);
  const [renderedClosed, setRenderedClosed] = useState(false);
  const renderedClosedRef = useRef(false);
  const changeClosure = useCallback((value: boolean) => { setSettled(false); setClosed(value); }, []);
  const [condition, setCondition] = useState(0);
  const [systemStep, setSystemStep] = useState(0);
  const [guidanceStep, setGuidanceStep] = useState<number | null>(0);
  const transitionScene = useRef<number | null>(null);
  const sceneEntrancePending = useRef(false);
  const [unknown, setUnknown] = useState(false);
  const [reveal, setReveal] = useState(true);
  const [phase, setPhase] = useState(4);
  const [recording, setRecording] = useState(false);
  const [recordingFailed, setRecordingFailed] = useState(false);
  const recordingRef = useRef<HTMLVideoElement>(null);
  const [largeText, setLargeText] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [compactStage, setCompactStage] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const [contents, setContents] = useState(false);
  const [notes, setNotes] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const [qr, setQr] = useState('');
  const touch = useRef<{ x: number; y: number } | null>(null);
  const modelVisible = MODEL_SCENES.has(scene) && !print;
  const presentationMotionAllowed = !systemReduced && !reduceMotion && !largeText && !print;
  useEffect(() => { if (systemReduced || reduceMotion || largeText) setIntroDone(true); }, [systemReduced, reduceMotion, largeText]);
  const motionAllowed = presentationMotionAllowed && modelVisible && !recording;
  const copy = presentationCopy[lang];
  const result = scene === 5 ? (unknown ? route205Unknown : route205Strict) : scene === 4 ? (renderedClosed ? detour204 : route204) : route204;
  const modelFloor = 'all';
  const modelExpanded = scene === 4 || (scene === 3 && (phase === 1 || phase === 4));
  const modelCamera = useMemo(() => scene === 3 && phase === 3 ? focusNodeCamera(building, 'room-204') : modelExpanded ? fitRouteCamera(building, route204.status === 'ok' ? route204.nodeIds : [], modelAspect) : { ...INITIAL_CAMERA, zoom: Math.min(.94, Math.max(.6, modelAspect * .57)) }, [scene, phase, modelExpanded, modelAspect]);
  const modelFailure = useCallback(() => setModelFailed(true), []);
  const go = useCallback((target: number, replace = false) => {
    const next = Math.max(0, Math.min(SCENE_IDS.length - 1, target));
    if (document.activeElement?.closest('.pres-contents')) pickerRef.current?.focus();
    if ((sceneRef.current === 4 || next === 4) && renderedClosedRef.current) { pose.current.routeProgress = 0; controller.current?.apply(); }
    sceneRef.current = next; setSettled(false); setScene(next); if (next !== 0) setIntroDone(true);
    if (MODEL_SCENES.has(next)) setModelMounted(true);
    setContents(false); setNotes(false); setRecording(false);
    const url = new URL(window.location.href); url.searchParams.set('scene', SCENE_IDS[next]!);
    if (replace) window.history.replaceState(null, '', url); else window.history.pushState(null, '', url);
    if (document.scrollingElement && document.scrollingElement.scrollTop > 0) window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  const chooseLanguage = useCallback((next: PresentationLanguage) => {
    setLocale(next);
    const url = new URL(window.location.href); url.searchParams.set('lang', next); window.history.replaceState(null, '', url);
  }, [setLocale]);
  useEffect(() => {
    const initialLanguage = new URLSearchParams(window.location.search).get('lang');
    if (initialLanguage === 'ru' || initialLanguage === 'kk') setLocale(initialLanguage);
    const onPop = () => { const next = readScene(); if ((sceneRef.current === 4 || next === 4) && renderedClosedRef.current) { pose.current.routeProgress = 0; controller.current?.apply(); } sceneRef.current = next; setSettled(false); setScene(next); if(next !== 0) setIntroDone(true); setContents(false); setNotes(false); setRecording(false); if (MODEL_SCENES.has(next)) setModelMounted(true); const nextLang = new URLSearchParams(window.location.search).get('lang'); if (nextLang === 'ru' || nextLang === 'kk') setLocale(nextLang); };
    window.addEventListener('popstate', onPop);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setSystemReduced(media.matches); media.addEventListener('change', onMotion);
    const layoutMedia = window.matchMedia('(max-width: 700px)');
    const onLayout = () => setCompactStage(layoutMedia.matches); layoutMedia.addEventListener('change', onLayout);
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', onFullscreen);
    return () => { window.removeEventListener('popstate', onPop); media.removeEventListener('change', onMotion); layoutMedia.removeEventListener('change', onLayout); document.removeEventListener('fullscreenchange', onFullscreen); };
  }, [setLocale]);
  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.presentation = 'true';
    document.documentElement.dataset.presentationReady = 'false';
    return () => { delete document.documentElement.dataset.presentation; delete document.documentElement.dataset.presentationReady; };
  }, []);
  useLayoutEffect(() => {
    if (print || !compactStage || largeText) return;
    const stage = rootRef.current?.querySelector<HTMLElement>('.pres-stage');
    const slide = stage?.querySelector<HTMLElement>('.pres-slide');
    if (!stage || !slide) return;
    const layout = () => {
      const height = scene === 0 ? stage.clientWidth * 9 / 16 : scene === 6 ? 185 : Math.max(150, Math.min(300, stage.clientHeight - slide.offsetHeight - 20));
      const initialModelTop = scene === 6 ? (slide.querySelector<HTMLElement>('.pres-copy-column')?.offsetHeight ?? 70) + 24 : slide.offsetHeight + 10;
      stage.style.setProperty('--model-top', `${initialModelTop}px`);
      stage.style.setProperty('--model-height', `${height}px`);
      stage.style.setProperty('--stage-reserve', `${height + 20}px`);
      // Posters/film are visible before lazy WebGL initialization. Direct URLs
      // need the final host composition before paint, never a tween from y=0.
      if (transitionScene.current === null || (scene === 0 && !introDone)) gsap.set(modelRef.current, { top: initialModelTop, x: 0, y: 0, xPercent: 0, yPercent: 0, scale: 1 });
    };
    layout();
    const observer = new ResizeObserver(layout); observer.observe(slide);
    return () => observer.disconnect();
  }, [scene, compactStage, largeText, print, lang, introDone]);
  useLayoutEffect(() => {
    if (print || (!directorReady && !modelFailed)) return;
    director.requirements = { ...requirements, allowUnknown: scene === 5 && unknown };
    const target = scenePose(scene, phase, condition, compactStage || largeText, systemStep, unknown);
    const changingScene = transitionScene.current !== scene;
    if (changingScene) sceneEntrancePending.current = true;
    transitionScene.current = scene;
    const host = modelRef.current;
    const copyElements = rootRef.current?.querySelectorAll('.pres-slide .pres-copy-column, .pres-slide .pres-wide-heading');
    const routeMeta = rootRef.current?.querySelector('.pres-route-meta');
    const secondary = rootRef.current?.querySelectorAll('.pres-doors, .pres-route-interface, .pres-pipeline, .pres-system-aside, .pres-pilot-layout, .pres-slide .pres-copy-column > :not(.pres-copy), .pres-object-annotations');
    const compact = compactStage || largeText;
    const mobileTop = scene === 6 ? (rootRef.current?.querySelector<HTMLElement>('.pres-copy-column')?.offsetHeight ?? 70) + 24 : (rootRef.current?.querySelector<HTMLElement>('.pres-slide')?.offsetHeight ?? 260) + 10;
    const composition = { ...stageTransform(scene, compact), left: compact ? '0%' : scene === 5 || scene === 7 ? '40%' : '30%', width: compact ? '100%' : scene === 5 || scene === 7 ? '60%' : '70%', top: compactStage && !largeText ? `${mobileTop}px` : largeText ? 'auto' : '50%' };
    // GSAP may parse CSS translateY(-50%) as a pixel offset at fractional heights.
    // Our composition owns percentage translation; never retain that pixel residual.
    gsap.set(host, { x: 0, y: 0 });
    if (modelFailed) {
      Object.assign(pose.current, target);
      gsap.set(host, composition);
      if (host) { host.dataset.routeProgress = String(target.routeProgress); host.dataset.yaw = String(target.yaw); }
      if (copyElements) gsap.set(copyElements, { opacity: 1, y: 0 });
      if (routeMeta) gsap.set(routeMeta, { opacity: 1, y: 0 });
      if (secondary) gsap.set(secondary, { autoAlpha: 1 });
      if (scene === 4) { renderedClosedRef.current = closed; setRenderedClosed(closed); }
      sceneEntrancePending.current = false;
      setSettled(true);
      return;
    }
    const apply = () => {
      controller.current?.apply();
      if (host) {
        host.dataset.routeProgress = String(pose.current.routeProgress); host.dataset.yaw = String(pose.current.yaw);
        host.querySelectorAll<HTMLElement>('[data-anchor]').forEach(label => {
          const point = controller.current?.project(label.dataset.anchor!);
          label.style.visibility = point?.visible ? 'visible' : 'hidden';
          if (point) { label.style.left = `${point.x * 100}%`; label.style.top = `${point.y * 100}%`; }
        });
      }
    };
    setSettled(false);
    const timeline = gsap.timeline({ onComplete: () => { sceneEntrancePending.current = false; setSettled(true); } });
    if (!presentationMotionAllowed) {
      if (scene === 4) { renderedClosedRef.current = closed; setRenderedClosed(closed); }
      Object.assign(pose.current, target); apply(); gsap.set(host, composition);
      if (copyElements) gsap.set(copyElements, { opacity: 1, y: 0 });
      if (routeMeta) gsap.set(routeMeta, { opacity: 1, y: 0 });
      if (secondary) gsap.set(secondary, { autoAlpha: 1 });
      sceneEntrancePending.current = false;
      setSettled(true);
    } else {
      timeline.to(host, { ...composition, duration: 1.05, ease: 'power3.inOut' }, 0);
      const routeProgress = target.routeProgress;
      const { routeProgress: _progress, ...geometry } = target;
      void _progress;
      timeline.to(pose.current, { ...geometry, ...(routeProgress ? {} : { routeProgress: 0 }), duration: 1.05, ease: 'power3.inOut', onUpdate: apply }, 0);
      if (copyElements) gsap.set(copyElements, { opacity: 1, y: 0 });
      if (secondary && (changingScene || sceneEntrancePending.current)) {
        // Spatial safety and route-result completion are different milestones.
        // Once controls can appear, a click must never restart their entrance.
        timeline.call(() => { sceneEntrancePending.current = false; }, [], 1.05);
        timeline.fromTo(secondary, { autoAlpha: 0 }, { autoAlpha: 1, duration: .25 }, 1.05);
      }
      else if (secondary) gsap.set(secondary, { autoAlpha: 1 });
      if (scene === 4 && closed !== renderedClosedRef.current) {
        timeline.to(pose.current, { routeProgress: 0, duration: .28, ease: 'power2.in', onUpdate: apply }, 0);
        timeline.call(() => {
          pose.current.routeProgress = 0; apply();
          renderedClosedRef.current = closed;
          flushSync(() => setRenderedClosed(closed));
          controller.current?.apply();
        }, [], .29);
        timeline.to(pose.current, { routeProgress: 1, duration: .85, ease: 'none', onUpdate: apply }, .34);
      } else if (routeProgress) timeline.to(pose.current, { routeProgress: 1, duration: .8, ease: 'none', onUpdate: apply }, .85);
      if (routeMeta) timeline.fromTo(routeMeta, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .25 }, routeProgress ? 1.65 : .8);
    }
    const onVisibility = () => { if (document.hidden) timeline.progress(1); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { timeline.kill(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [scene, phase, condition, closed, print, directorReady, modelFailed, presentationMotionAllowed, largeText, compactStage, systemStep, unknown, lang, director]);
  useEffect(() => { document.title = `ITER · ${lang === 'kk' ? 'Таныстырылым' : 'Презентация'} · ${scene + 1}/10`; }, [lang, scene]);
  useEffect(() => {
    if (print) return;
    let cancelled = false;
    const key = `${scene}:${lang}`;
    const images = Array.from(rootRef.current?.querySelectorAll<HTMLImageElement>('.pres-slide img') ?? []);
    void Promise.all(images.map(image => image.decode().catch(() => undefined))).then(() => {
      if (!cancelled) setReadyMediaKey(key);
    });
    return () => { cancelled = true; };
  }, [scene, lang, print]);
  useEffect(() => {
    if (print) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isInput(event.target)) return;
      if (event.key === 'Escape') { if (contents) pickerRef.current?.focus(); else if (notes) notesTriggerRef.current?.focus(); setContents(false); setNotes(false); setRecording(false); setIntroDone(true); return; }
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault(); go(sceneRef.current + (event.key === 'ArrowRight' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [go, print, contents, notes]);
  useEffect(() => {
    const host = modelRef.current; if (!host || print) return;
    const observer = new ResizeObserver(entries => { const box = entries[0]?.contentRect; if (box && box.width > 0 && box.height > 0) setModelAspect(box.width / box.height); });
    observer.observe(host); return () => observer.disconnect();
  }, [print]);
  useEffect(() => {
    const host = modelRef.current; if (!host || print) return;
    const check = () => { const rendered = Number(host.querySelector('.diorama')?.getAttribute('data-render-count') ?? 0); setModelReady(rendered > 0); };
    const observer = new MutationObserver(check); observer.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-render-count'] }); check();
    return () => observer.disconnect();
  }, [print, lang]);
  useEffect(() => {
    let cancelled = false;
    void import('qrcode').then(module => module.toDataURL(PUBLIC_NAVIGATOR_URL, { width: 336, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#153e3c', light: '#ffffff' } })).then(value => { if (!cancelled) setQr(value); }).catch(() => { /* The visible URL remains available without QR. */ });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (print) return;
    const images = [scene - 1, scene, scene + 1].filter(index => index >= 0 && index < 10).map(index => { const image = new Image(); image.src = index === 8 ? '/presentation/media/pilot-concept.webp' : index === 6 ? `/presentation/media/mobile-steps${lang === 'kk' ? '-kk' : ''}.webp` : posterForScene(index, lang); return image; });
    return () => { images.forEach(image => { image.onload = null; image.onerror = null; }); };
  }, [scene, lang, print]);
  useEffect(() => {
    if (!print || !qr) return;
    let cancelled = false;
    const images = Array.from(rootRef.current?.querySelectorAll('img') ?? []);
    void Promise.all([document.fonts.ready, ...images.map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => { image.addEventListener('load', () => resolve(), { once: true }); image.addEventListener('error', () => resolve(), { once: true }); }))]).then(() => { if (!cancelled) document.documentElement.dataset.presentationReady = 'true'; });
    return () => { cancelled = true; };
  }, [print, qr, lang]);
  useEffect(() => { const video = recordingRef.current; const onVisibility = () => { if (document.hidden) video?.pause(); }; document.addEventListener('visibilitychange', onVisibility); return () => { video?.pause(); document.removeEventListener('visibilitychange', onVisibility); }; }, [recording, scene]);
  async function toggleFullscreen() {
    setFullscreenMessage('');
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (rootRef.current?.requestFullscreen) await rootRef.current.requestFullscreen(); else setFullscreenMessage(t('Этот браузер не поддерживает полноэкранный режим.', 'Бұл браузер толық экран режимін қолдамайды.')); }
    catch { setFullscreenMessage(t('Браузер не разрешил полноэкранный режим. Презентация работает в окне.', 'Браузер толық экран режиміне рұқсат бермеді. Презентация терезеде жұмыс істейді.')); }
  }
  function touchStart(event: TouchEvent) { if (event.touches.length !== 1 || isInteractive(event.target)) { touch.current = null; return; } const point = event.touches[0]!; touch.current = { x: point.clientX, y: point.clientY }; }
  function touchEnd(event: TouchEvent) { const origin = touch.current; touch.current = null; const point = event.changedTouches[0]; if (!origin || !point) return; const dx = point.clientX - origin.x, dy = point.clientY - origin.y; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(sceneRef.current + (dx < 0 ? 1 : -1)); }
  const shared = { lang, qr, closed, setClosed: changeClosure, unknown, setUnknown, reveal, setReveal, phase, setPhase, setRecording, modelFailed, condition, setCondition, systemStep, setSystemStep, guidanceStep, setGuidanceStep, routeSettled: settled || modelFailed };
  if (print) return <div ref={rootRef} className="pres-root pres-print" data-testid="presentation-root" data-print="true" lang={lang === 'kk' ? 'kk-KZ' : 'ru-RU'}>{copy.scenes.map((item, index) => <div className="pres-print-page" key={item.id}><div className="pres-print-brand">ITER <span>{t('Навигация с учётом условий', 'Шарттарды ескеретін навигация')}</span><b>RU / KK</b></div><Scene {...shared} index={index} print /><div className="pres-print-footer"><a href={PUBLIC_NAVIGATOR_URL}>iter-navigator.vercel.app</a><span>{t('Учебный прототип · вымышленное здание', 'Оқу прототипі · ойдан шығарылған ғимарат')}</span><b>{String(index + 1).padStart(2, '0')} / 10</b></div></div>)}</div>;
  return <div ref={rootRef} className={`pres-root pres-choreographed${largeText ? ' pres-large-text' : ''}`} data-testid="presentation-root" data-current-scene={SCENE_IDS[scene]} data-settled={settled && (directorReady || modelFailed) && readyMediaKey === String(scene) + ':' + lang} data-motion={presentationMotionAllowed ? 'on' : 'off'} lang={lang === 'kk' ? 'kk-KZ' : 'ru-RU'}>
    <a className="pres-skip-link" href="#presentation-controls">{t('К управлению показом', 'Көрсетілім басқаруына')}</a>
    <header className="pres-header"><a className="pres-wordmark" href="/" aria-label={t('ITER: открыть навигатор', 'ITER: навигаторды ашу')}>ITER<span aria-hidden="true">↗</span></a><span className="pres-header-label">{t('МАРШРУТ НАЧИНАЕТСЯ С УСЛОВИЙ', 'МАРШРУТ ШАРТТАРДАН БАСТАЛАДЫ')}</span><div className="pres-header-tools"><div className="pres-languages" role="group" aria-label={t('Язык презентации', 'Презентация тілі')}><button data-testid="presentation-language-ru" lang="ru" aria-pressed={lang === 'ru'} onClick={() => chooseLanguage('ru')}>RU</button><button data-testid="presentation-language-kk" lang="kk" aria-pressed={lang === 'kk'} onClick={() => chooseLanguage('kk')}>ҚАЗ</button></div><button className="pres-icon-button" data-testid="presentation-fullscreen" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? copy.labels.exitFullscreen : copy.labels.fullscreen} title={fullscreen ? copy.labels.exitFullscreen : copy.labels.fullscreen}>{fullscreen ? '↙' : '⛶'}</button></div></header>
    <main className="pres-stage" onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchCancel={() => { touch.current = null; }}>
      <div ref={modelRef} className="pres-model" data-testid="presentation-model" data-visible={modelVisible} data-live={modelVisible && !modelFailed && !recording} data-ready={modelReady} data-model-scene={SCENE_IDS[scene]} aria-hidden={!modelVisible} style={{ display: modelVisible ? undefined : 'none' }}>
        <Poster key={scene === 4 && !closed ? 3 : scene} index={scene === 4 && !closed ? 3 : scene} lang={lang} />
        {modelMounted && !modelFailed && <div className="pres-live-model" style={{ opacity: modelReady ? 1 : 0, display: recording ? 'none' : undefined }}><ModelBoundary onFailure={modelFailure}><Suspense fallback={null}><Diorama director={director} building={building} result={result} floor={modelFloor} closedEdgeIds={scene === 4 && renderedClosed ? liftAEdges : EMPTY_EDGES} camera={modelCamera} cameraTransitionId={scene * 100 + Number(closed) * 10 + phase} motionAllowed={motionAllowed} theme="light" largerText={false} highlight={scene === 6 && guidanceStep !== null && route204.status === 'ok' ? { nodeId:route204.nodeIds[guidanceStep]!, edgeId:route204.edgeIds[guidanceStep] } : scene === 3 && phase === 3 ? { nodeId: 'room-204' } : null} gesturesEnabled={false} gestureReset={0} expanded={modelExpanded} routeReveal={scene === 4 || (scene === 3 && phase === 4)} onFailure={modelFailure} onCameraChange={ignoreCameraChange} /></Suspense></ModelBoundary></div>}
        {recording && scene === 3 && <div className="pres-recording">{recordingFailed ? <><Poster index={3} lang={lang} /><p role="status">{t('Запись не загрузилась. Показан конечный вид маршрута.', 'Жазба жүктелмеді. Маршруттың соңғы көрінісі көрсетілді.')}</p></> : <video ref={recordingRef} data-testid="presentation-video" src="/presentation/media/model-reveal.mp4" poster="/presentation/media/model-reveal-poster.webp" controls autoPlay playsInline preload="metadata" onError={() => setRecordingFailed(true)} />}<p>{t('Запись реального приложения · интерфейс на русском · без звука', 'Нақты қолданба жазбасы · интерфейс орыс тілінде · дыбыссыз')}</p><button onClick={() => { recordingRef.current?.pause(); setRecording(false); }}>{t('Вернуться к живой модели', 'Тірі модельге оралу')}</button></div>}
        {modelFailed && <p className="pres-model-fallback" data-testid="presentation-fallback">{t('Статичный вид модели · WebGL недоступен', 'Модельдің статикалық көрінісі · WebGL қолжетімсіз')}</p>}
        {scene === 2 && !modelFailed && directorReady && <div className="pres-object-annotations" aria-label={t("Условия прохода", "Өту шарттары")}><span key={condition} data-anchor={condition === 0 ? 'stairs-0' : condition === 1 ? 'door-204' : 'lift-a-0'}>{condition === 0 ? t('Лестница · не подходит', 'Баспалдақ · жарамсыз') : condition === 1 ? t('Дверь 204 · 105 см', '204 есігі · 105 см') : t('Лифт A · без ступеней', 'A лифті · сатысыз')}</span></div>}
        {scene === 5 && !modelFailed && directorReady && <div className="pres-object-annotations"><span data-anchor="door-205">{t('Дверь 205 · ширина неизвестна', '205 есігі · ені белгісіз')}</span></div>}
        {scene === 4 && !modelFailed && directorReady && <div className="pres-object-annotations"><span data-anchor="lift-a-0">{closed ? t('Лифт A закрыт · симуляция', 'A лифті жабық · симуляция') : t('Лифт A доступен', 'A лифті қолжетімді')}</span></div>}
        {scene === 3 && phase === 3 && !modelFailed && directorReady && <div className="pres-object-annotations"><span data-anchor="door-204">{t('Аудитория 204 · 2 этаж', '204-аудитория · 2-қабат')}</span></div>}
        <IntroFilm active={scene === 0 && !introDone} reduced={!presentationMotionAllowed} ready={(directorReady && modelReady) || modelFailed} lang={lang} onComplete={finishIntro} />
        <span className="pres-model-caption">{t('АВТОРСКАЯ МОДЕЛЬ · УЧЕБНЫЙ КОРПУС', 'АВТОРЛЫҚ МОДЕЛЬ · ОҚУ КОРПУСЫ')}</span>
      </div>
      <Scene {...shared} key={scene} index={scene} />
    </main>
    <footer className="pres-controls" id="presentation-controls"><div className="pres-progress" data-testid="presentation-progress" role="progressbar" aria-label={t('Прогресс презентации', 'Презентация барысы')} aria-valuemin={1} aria-valuemax={10} aria-valuenow={scene + 1}><span style={{ width: `${(scene + 1) * 10}%` }} /></div><div className="pres-controls-left"><button ref={pickerRef} data-testid="presentation-picker" aria-expanded={contents} onClick={() => { setContents(!contents); setNotes(false); }} aria-label={copy.labels.contents}><span className="pres-dots-icon" aria-hidden="true">▦</span><span>{String(scene + 1).padStart(2, '0')} <i>/ 10</i></span></button><span className="pres-manual-label">{t('Ручной показ · 3–5 мин', 'Қолмен көрсету · 3–5 мин')}</span></div><div className="pres-utilities"><button aria-pressed={largeText} onClick={() => setLargeText(!largeText)} aria-label={copy.labels.largeText} title={copy.labels.largeText}>Aа+</button><button aria-pressed={reduceMotion || systemReduced} onClick={() => setReduceMotion(!reduceMotion)} title={copy.labels.reduceMotion}>{t('Движение', 'Қозғалыс')}: {reduceMotion || systemReduced ? t('выкл.', 'өшірулі') : t('вкл.', 'қосулы')}</button><button ref={notesTriggerRef} data-testid="presentation-notes" aria-expanded={notes} onClick={() => { setNotes(!notes); setContents(false); }}>{copy.labels.notes}</button><a href={`/presentation/ITER-Presentation-${lang.toUpperCase()}.pdf`} target="_blank" rel="noopener" aria-label={t('Открыть PDF презентации на русском языке', 'Таныстырылымның қазақша PDF нұсқасын ашу')}>PDF ↗</a></div><div className="pres-navigation"><button data-testid="presentation-prev" disabled={scene === 0} aria-label={copy.labels.previous} onClick={() => go(sceneRef.current - 1)}>←</button><button data-testid="presentation-next" disabled={scene === 9} aria-label={copy.labels.next} onClick={() => go(sceneRef.current + 1)}>→</button></div></footer>
    <div className="pres-sr-only" role="status" aria-live="polite">{scene + 1} / 10. {copy.scenes[scene]!.title}</div>
    {fullscreenMessage && <div className="pres-toast" role="status">{fullscreenMessage}<button onClick={() => setFullscreenMessage('')}>{copy.labels.close}</button></div>}
    {contents && <aside className="pres-popover pres-contents" aria-label={copy.labels.contents}><div className="pres-popover-heading"><strong>{copy.labels.contents}</strong><button onClick={() => { pickerRef.current?.focus(); setContents(false); }} aria-label={copy.labels.close}>×</button></div><ol>{copy.scenes.map((item, index) => <li key={item.id}><button aria-current={scene === index ? 'step' : undefined} onClick={() => go(index)}><span>{String(index + 1).padStart(2, '0')}</span>{item.title}</button></li>)}</ol></aside>}
    {notes && <aside className="pres-popover pres-notes" aria-label={copy.labels.notes}><div className="pres-popover-heading"><strong>{copy.labels.notes} · {copy.scenes[scene]!.durationSeconds} {t('сек', 'сек')}</strong><button onClick={() => { notesTriggerRef.current?.focus(); setNotes(false); }} aria-label={copy.labels.close}>×</button></div>{copy.scenes[scene]!.speakerNotes.map((text, index) => <p key={index}>{text}</p>)}<div className="pres-note-settings"><button aria-pressed={largeText} onClick={() => setLargeText(!largeText)}>{copy.labels.largeText}</button><button aria-pressed={reduceMotion || systemReduced} onClick={() => setReduceMotion(!reduceMotion)}>{copy.labels.reduceMotion}</button></div><p className="pres-note-help">{t('← → переключают сцены. Горизонтальный свайп работает на мобильном. Автопереход отключён.', '← → көріністерді ауыстырады. Мобильдіде көлденең сырғыту жұмыс істейді. Автоауысу өшірулі.')}</p></aside>}
  </div>;
}

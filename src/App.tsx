import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import fixture from './data/building.json';
import type { Building, BuildingEdge, Evidence, Requirements, Scenario } from './domain/model';
import { validateBuilding } from './domain/validation';
import { findRoute } from './domain/routing';
import { defaultScenario, loadScenario, saveScenario } from './domain/storage';
import { FloorPlan } from './components/FloorPlan';
import { ReportJournal } from './components/ReportJournal';
import { DisplaySettings } from './components/DisplaySettings';
import { Brand } from './components/Brand';
import { boundCamera, fitRouteCamera, focusNodeCamera, INITIAL_CAMERA } from './ui/camera';
import { diagnoseRoute } from './ui/route-diagnosis';
import type { CameraState } from './ui/camera';
import { defaultPreferences, loadPreferences, savePreferences } from './ui/preferences';
import { countRu, edgeNames, nodeLabelRu, numberRu, reasonNames, ru } from './i18n/ru';

const Diorama = lazy(() => import('./components/Diorama'));
const checkedBuilding = validateBuilding(fixture);
const presets: { id: string; label: string; requirements: Requirements }[] = [
  { id: 'step-free', label: 'Без ступеней', requirements: defaultScenario().requirements },
  { id: 'wide', label: 'Шире проход', requirements: { ...defaultScenario().requirements, minWidthM: 1 } },
  { id: 'walking', label: 'Лестницы допустимы', requirements: { ...defaultScenario().requirements, avoidStairs: false, minWidthM: 0.7, smoothOnly: false } },
];

class VisualBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
function evidenceText<T>(attribute: Evidence<T>, format: (v: T) => string) {
  return attribute.status === 'unknown' ? 'неизвестно' : `${format(attribute.value)} · задано в модели`;
}
function EvidenceSource({ attribute }: { attribute: Evidence<unknown> }) {
  return <small className="attribute-source">Источник: {attribute.source}. Дата обследования: {attribute.checkedOn ?? 'отсутствует'}.</small>;
}
function EdgeEvidence({ edge }: { edge: BuildingEdge }) {
  return <dl className="edge-evidence">
    <div data-attribute="widthM"><dt>Ширина</dt><dd>{evidenceText(edge.widthM, v => `${numberRu(v * 100)} см`)}<EvidenceSource attribute={edge.widthM} /></dd></div>
    <div data-attribute="stepFree"><dt>Без ступеней</dt><dd>{evidenceText(edge.stepFree, v => v ? 'да' : 'нет')}<EvidenceSource attribute={edge.stepFree} /></dd></div>
    <div data-attribute="slopePercent"><dt>Уклон</dt><dd>{evidenceText(edge.slopePercent, v => `${numberRu(v)} %`)}{['lift', 'stairs'].includes(edge.type) && ' · не влияет на отбор'}<EvidenceSource attribute={edge.slopePercent} /></dd></div>
    <div data-attribute="surface"><dt>Покрытие</dt><dd>{evidenceText(edge.surface, v => v === 'smooth' ? 'ровное' : 'неровное')}{['lift', 'stairs'].includes(edge.type) && ' · не влияет на отбор'}<EvidenceSource attribute={edge.surface} /></dd></div>
  </dl>;
}
function requirementNumberRu(value: number, centimeters = false) {
  // Shift the stored decimal unit without losing significant digits to display rounding.
  return String(centimeters ? Number(`${value}e2`) : value).replace('.', ',');
}

function Planner({ building }: { building: Building }) {
  const [initial] = useState(() => {
    try { return loadScenario(building, window.localStorage); }
    catch { return { scenario: defaultScenario(), restored: false, warning: true }; }
  });
  const [scenario, setScenario] = useState<Scenario>(initial.scenario);
  const [storageWarning, setStorageWarning] = useState(initial.warning);
  const [displayInitial] = useState(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    try { return loadPreferences(window.localStorage, systemTheme); }
    catch { return { preferences: defaultPreferences(systemTheme), warning: true }; }
  });
  const [preferences, setPreferences] = useState(displayInitial.preferences);
  const [displayWarning, setDisplayWarning] = useState(displayInitial.warning);
  const subscribeToMotion = useCallback((onChange: () => void) => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', onChange); return () => media.removeEventListener('change', onChange);
  }, []);
  const systemReduced = useSyncExternalStore(subscribeToMotion, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const motionAllowed = !systemReduced && !preferences.reduceMotion && !preferences.largerText;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = preferences.theme;
    root.dataset.textSize = preferences.largerText ? 'large' : 'normal';
    root.dataset.motion = motionAllowed ? 'on' : 'off';
    try { if (!savePreferences(preferences, window.localStorage)) setDisplayWarning(true); }
    catch { setDisplayWarning(true); }
  }, [preferences, motionAllowed]);
  const [camera, setCamera] = useState<CameraState>(INITIAL_CAMERA);
  const [gestureReset, setGestureReset] = useState(0);
  const [gesturesEnabled, setGesturesEnabled] = useState(false);
  const [highlight, setHighlight] = useState<{ nodeId: string; edgeId?: string } | null>(null);
  const visualRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [webglFailed, setWebglFailed] = useState(false);
  // Capture summary activation directly; delayed native toggle events also report forced desktop writes.
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [closuresOpen, setClosuresOpen] = useState(false);
  const [fictionOpen, setFictionOpen] = useState(false);
  const requirementsRef = useRef<HTMLDetailsElement>(null);
  const closuresRef = useRef<HTMLDetailsElement>(null);
  const directionsRef = useRef<HTMLElement>(null);
  const subscribeToLayout = useCallback((onChange: () => void) => {
    const media = window.matchMedia('(min-width: 701px)');
    const synchronize = () => {
      if (!media.matches) {
        if (requirementsRef.current?.contains(document.activeElement) && !requirementsRef.current.querySelector('summary')?.contains(document.activeElement)) setRequirementsOpen(true);
        if (closuresRef.current?.contains(document.activeElement) && !closuresRef.current.querySelector('summary')?.contains(document.activeElement)) setClosuresOpen(true);
      }
      onChange();
    };
    media.addEventListener('change', synchronize);
    synchronize();
    return () => media.removeEventListener('change', synchronize);
  }, []);
  const desktop = useSyncExternalStore(subscribeToLayout, () => window.matchMedia('(min-width: 701px)').matches);
  const [numericDraft, setNumericDraft] = useState({ minWidthM: String(initial.scenario.requirements.minWidthM * 100), maxSlopePercent: String(initial.scenario.requirements.maxSlopePercent) });
  const widthInvalid = numericDraft.minWidthM === '' || !Number.isFinite(Number(numericDraft.minWidthM)) || Number(numericDraft.minWidthM) < 50 || Number(numericDraft.minWidthM) > 150;
  const slopeInvalid = numericDraft.maxSlopePercent === '' || !Number.isFinite(Number(numericDraft.maxSlopePercent)) || Number(numericDraft.maxSlopePercent) < 0 || Number(numericDraft.maxSlopePercent) > 20;
  const result = useMemo(() => findRoute(building, scenario.start, scenario.destination, scenario.requirements, scenario.closedEdgeIds), [building, scenario]);
  const diagnosis = useMemo(() => diagnoseRoute(building, scenario, result), [building, scenario, result]);
  const onFailure = useCallback(() => { setWebglFailed(true); setView('2d'); }, []);
  useEffect(() => {
    try { if (!saveScenario(scenario, building, window.localStorage)) setStorageWarning(true); }
    catch { setStorageWarning(true); }
  }, [scenario, building]);
  const selectable = building.nodes.filter(n => n.selectable);
  const nodeMap = new Map(building.nodes.map(n => [n.id, n]));
  const labelForNode = (id: string | undefined) => {
    const node = id === undefined ? undefined : nodeMap.get(id);
    return node ? nodeLabelRu(node.id, node.label) : ru.invalidEndpointLabel;
  };
  const endpointDescription = (id: string) => {
    const node = nodeMap.get(id);
    if (!node) return ru.invalidEndpointDescription;
    return node.id === 'room-205' ? ru.room205 : ru.endpointFloor(node.floor);
  };
  const edgeMap = new Map(building.edges.map(e => [e.id, e]));
  const patch = (values: Partial<Scenario>) => {
    if (values.start !== undefined || values.destination !== undefined) { setHighlight(null); setCamera(INITIAL_CAMERA); }
    if (values.floor !== undefined) { setHighlight(null); setCamera(previous => { const next = { ...previous }; delete next.target; return next; }); }
    setScenario(previous => ({ ...previous, ...values }));
  };
  const requirement = (values: Partial<Requirements>) => setScenario(previous => ({ ...previous, requirements: { ...previous.requirements, ...values } }));
  const numericRequirement = (key: 'minWidthM' | 'maxSlopePercent', value: string) => {
    setNumericDraft(previous => ({ ...previous, [key]: value }));
    const numeric = Number(value); const next = key === 'minWidthM' ? numeric / 100 : numeric;
    const valid = value !== '' && Number.isFinite(next) && (key === 'minWidthM' ? next >= 0.5 && next <= 1.5 : next >= 0 && next <= 20);
    if (valid) requirement({ [key]: next });
  };
  const toggleGroup = (edgeIds: string[]) => setScenario(previous => {
    const closed = edgeIds.every(id => previous.closedEdgeIds.includes(id));
    return { ...previous, closedEdgeIds: closed ? previous.closedEdgeIds.filter(id => !edgeIds.includes(id)) : [...new Set([...previous.closedEdgeIds, ...edgeIds])] };
  });
  const applyPreset = (values: Requirements) => { requirement(values); setNumericDraft({ minWidthM: String(values.minWidthM * 100), maxSlopePercent: String(values.maxSlopePercent) }); };
  const reset = () => { setGestureReset(value => value + 1); setScenario(defaultScenario()); setCamera(INITIAL_CAMERA); setHighlight(null); setGesturesEnabled(false); setNumericDraft({ minWidthM: '90', maxSlopePercent: '5' }); setRequirementsOpen(false); setClosuresOpen(false); };
  const updateCamera = useCallback((value: CameraState) => setCamera(boundCamera(value)), []);
  const good = result.status === 'ok';
  const uncertain = good && result.uncertainEdgeIds.length > 0;
  const activeHighlight = highlight && (highlight.edgeId === undefined || good && result.edgeIds.includes(highlight.edgeId)) ? highlight : null;
  const focusNode = (nodeId: string, edgeId?: string) => {
    const node = nodeMap.get(nodeId); if (!node) return;
    setHighlight({ nodeId, edgeId }); setCamera(focusNodeCamera(building, nodeId));
    setScenario(previous => ({ ...previous, floor: node.floor }));
    requestAnimationFrame(() => {
      const target = visualRef.current?.querySelector<HTMLElement | SVGSVGElement>(view === '3d' && !webglFailed ? '.diorama' : '.primary-plan .floor-card svg');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  };
  const fitRoute = () => {
    if (!good) return;
    const scene = visualRef.current?.querySelector('.diorama');
    const bounds = scene?.getBoundingClientRect();
    setCamera(fitRouteCamera(building, result.nodeIds, bounds ? bounds.width / bounds.height : 1));
    setHighlight(null); setScenario(previous => ({ ...previous, floor: 'all' }));
  };
  const requirementsDescription = `${scenario.requirements.avoidStairs ? 'Без ступеней' : 'Лестницы допустимы'} · от ${requirementNumberRu(scenario.requirements.minWidthM, true)} см · уклон до ${requirementNumberRu(scenario.requirements.maxSlopePercent)} % · ${scenario.requirements.smoothOnly ? 'ровное покрытие' : 'любое покрытие'} · неизвестные ${scenario.requirements.allowUnknown ? 'разрешены' : 'исключены'}`;
  const closedGroups = building.closureGroups.filter(group => group.edgeIds.every(id => scenario.closedEdgeIds.includes(id))).length;
  const openSettings = (section: 'requirements' | 'closures') => {
    if (section === 'requirements') setRequirementsOpen(true); else setClosuresOpen(true);
    requestAnimationFrame(() => (section === 'requirements' ? requirementsRef : closuresRef).current?.querySelector('summary')?.focus());
  };
  return <>
    <a className="skip-link" href="#route-controls">К настройке маршрута</a>
    <header className="site-header"><Brand /><a className="display-jump" href="#display-settings" onClick={event => { event.preventDefault(); const section = document.getElementById('display-settings'); const details = section?.querySelector('details'); if (details) details.open = true; section?.focus(); section?.scrollIntoView({ block: 'start' }); }}>{ru.display.entry}</a><span className="header-note"><i aria-hidden="true" />Локальный сценарий</span></header>
    <main>
      <div className="intro"><div><h1>Навигатор доступных маршрутов</h1><p className="intro-copy">Выберите начало, цель и условия прохода.</p></div><details className="fiction-note" open={desktop || fictionOpen}><summary tabIndex={desktop ? -1 : 0} onClick={event => { event.preventDefault(); if (!desktop) setFictionOpen(open => !open); }}><span className="fiction-icon" aria-hidden="true">i</span><strong>{ru.fiction}</strong></summary><p>{ru.fictionDetail}</p></details></div>
      <div className="workspace">
        <section className="controls-panel endpoints-panel" id="route-controls" aria-label="Настройка маршрута" tabIndex={-1}>
          <div className="panel-title"><span className="section-index">01</span><h2>Ваш маршрут</h2></div>
          <div className="endpoint-fields"><label>{ru.start}<select aria-label={ru.start} aria-describedby="start-description" value={scenario.start} onChange={e => patch({ start: e.target.value })}>{selectable.map(n => <option key={n.id} value={n.id}>{labelForNode(n.id)}</option>)}</select><span id="start-description" className="endpoint-caption">{endpointDescription(scenario.start)}</span></label><div className="endpoint-link" aria-hidden="true">↓</div><label>{ru.destination}<select aria-label={ru.destination} aria-describedby="destination-description" value={scenario.destination} onChange={e => patch({ destination: e.target.value })}>{selectable.map(n => <option key={n.id} value={n.id}>{labelForNode(n.id)}</option>)}</select><span id="destination-description" className="endpoint-caption">{endpointDescription(scenario.destination)}</span></label></div>
          <button className="endpoint-swap" type="button" aria-label={ru.camera.swap} title={ru.camera.swap} onClick={() => patch({ start: scenario.destination, destination: scenario.start })}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M7 20V4M3 8L7 4L11 8M17 4V20M13 16L17 20L21 16" /></svg></button>
        </section>
        <section className="route-panel outcome-panel" aria-label="Результат маршрута">
          <div className="panel-title"><span className="section-index">02</span><h2>Результат маршрута</h2></div>
          <div className={`route-summary ${uncertain || !good ? 'caution' : ''}`} role="status" aria-live="polite" aria-atomic="true" data-testid="route-result" data-route-state={diagnosis.kind} data-route-ids={good ? result.edgeIds.join(',') : ''}>
            <span className="status-kicker">{good ? uncertain ? 'НЕПОДТВЕРЖДЁННЫЙ ПУТЬ' : 'ПОДХОДИТ УСЛОВИЯМ МОДЕЛИ' : 'ПУТЬ НЕ ПОСТРОЕН'}</span>
            {good ? <><div className="distance">{numberRu(result.distanceM)}<span>м</span></div><p>{result.edgeIds.length === 0 ? 'Начало и цель — одна выбранная точка.' : countRu(result.edgeIds.length, ['участок', 'участка', 'участков'])} · {ru.route.floors(diagnosis.floors)}</p><p>{ru.route.stepFree(diagnosis.stepFree)}</p><small>Расстояние по учебному графу.</small></> : <><h3>{diagnosis.kind === 'invalid' ? ru.route.invalid : diagnosis.kind === 'insufficient' ? ru.route.insufficient : ru.route.noRoute}</h3><p>{result.status === 'invalid' ? result.message : diagnosis.kind === 'insufficient' ? ru.route.insufficientHint : diagnosis.connected ? ru.route.blockedHint : ru.route.disconnectedHint}</p>{diagnosis.kind === 'insufficient' && <p>{[...new Set(diagnosis.details.flatMap(detail => detail.reasons))].map(reason => reasonNames[reason]).join('; ')}.</p>}</>}
          </div>
          {uncertain && <div className="uncertain-warning" role="alert"><strong>{ru.route.uncertainty}</strong><p>{countRu(result.uncertainEdgeIds.length, ['неподтверждённый участок', 'неподтверждённых участка', 'неподтверждённых участков'])}: {diagnosis.details.map(detail => { const edge = edgeMap.get(detail.edgeId)!; const index = result.edgeIds.indexOf(detail.edgeId); return `${edgeNames[edge.type]}: ${labelForNode(result.nodeIds[index])} → ${labelForNode(result.nodeIds[index + 1])} — ${detail.reasons.map(reason => reasonNames[reason]).join(', ')}`; }).join('; ')}. Известные нарушения условий по-прежнему исключены.</p></div>}
          {!good && <div className="settings-shortcuts"><button type="button" onClick={() => openSettings('requirements')}>Изменить условия</button><button type="button" onClick={() => openSettings('closures')}>Открыть закрытия</button></div>}
          <a className="directions-jump" href="#route-directions" onClick={event => { event.preventDefault(); directionsRef.current?.focus(); directionsRef.current?.scrollIntoView({ block: 'start' }); }}>{good ? 'К полным шагам маршрута ↓' : 'К причинам исключения ↓'}</a>
        </section>

        <section ref={visualRef} className="visual-panel" aria-label="Визуализация здания">
          <div className="visual-toolbar"><div><span className="section-index">03</span><h2>Здание «{ru.brand}»</h2></div><div className="view-switch" role="group" aria-label="Вид здания"><button type="button" aria-pressed={view === '3d'} disabled={webglFailed} onClick={() => setView('3d')}>3D модель</button><button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>2D схема</button></div></div>
          <div className="model-meta"><span>3 этажа · 2 лифта</span><span>{ru.modelGeometry}</span></div>
          <div className="floor-toolbar"><span>Показать этаж</span><div role="group" aria-label="Этажи"><button type="button" aria-pressed={scenario.floor === 'all'} onClick={() => patch({ floor: 'all' })}>Все</button>{building.floors.map(f => <button type="button" key={f.id} aria-pressed={scenario.floor === f.id} onClick={() => patch({ floor: f.id })}>{f.id + 1}</button>)}</div></div>
          {webglFailed && <p className="fallback-note" role="status">3D недоступно: автоматически показана 2D схема. Маршрут и настройки сохранены.</p>}
          {view === '3d' && !webglFailed ? <div className="diorama-wrap"><VisualBoundary onFailure={onFailure}><Suspense fallback={<div className="visual-loading" role="status">Загружаем авторскую модель…</div>}><Diorama building={building} result={result} floor={scenario.floor} closedEdgeIds={scenario.closedEdgeIds} camera={camera} onCameraChange={updateCamera} motionAllowed={motionAllowed} theme={preferences.theme} largerText={preferences.largerText} highlight={activeHighlight} gesturesEnabled={gesturesEnabled} gestureReset={gestureReset} onFailure={onFailure} /></Suspense></VisualBoundary><span className="model-caption">Вымышленное здание / масштаб условный</span></div> : <div className="primary-plan"><FloorPlan building={building} result={result} floor={scenario.floor} closedEdgeIds={scenario.closedEdgeIds} highlight={activeHighlight} /></div>}
          <div className="camera-controls" aria-label="Управление камерой"><label>Ракурс<select aria-label="Ракурс" value={camera.preset} onChange={e => setCamera(c => boundCamera({ ...c, preset: e.target.value as CameraState['preset'] }))} disabled={view !== '3d'}><option value="overview">Общий вид</option><option value="front">Спереди</option><option value="top">Сверху</option></select></label><div role="group" aria-label="Поворот и масштаб камеры"><button type="button" disabled={view !== '3d'} aria-label="Повернуть влево" onClick={() => setCamera(c => boundCamera({ ...c, yaw: c.yaw - 20 }))}>↶</button><button type="button" disabled={view !== '3d'} aria-label="Повернуть вправо" onClick={() => setCamera(c => boundCamera({ ...c, yaw: c.yaw + 20 }))}>↷</button><button type="button" disabled={view !== '3d'} aria-label="Уменьшить масштаб" onClick={() => setCamera(c => boundCamera({ ...c, zoom: c.zoom - 0.15 }))}>−</button><button type="button" disabled={view !== '3d'} aria-label="Увеличить масштаб" onClick={() => setCamera(c => boundCamera({ ...c, zoom: c.zoom + 0.15 }))}>+</button><button type="button" disabled={view !== '3d'} onClick={() => { setGestureReset(value => value + 1); setCamera(INITIAL_CAMERA); setHighlight(null); setGesturesEnabled(false); }}>Сброс камеры</button></div><div role="group" aria-label="Смещение камеры">{([{ label: 'Сместить вид влево', text: '←', x: -1, y: 0 }, { label: 'Сместить вид вправо', text: '→', x: 1, y: 0 }, { label: 'Сместить вид вверх', text: '↑', x: 0, y: -1 }, { label: 'Сместить вид вниз', text: '↓', x: 0, y: 1 }]).map(control => <button key={control.label} type="button" disabled={view !== '3d'} aria-label={control.label} onClick={() => setCamera(c => boundCamera({ ...c, panX: c.panX + control.x, panY: c.panY + control.y }))}>{control.text}</button>)}</div></div>
          <div className="framing-controls"><button type="button" disabled={!nodeMap.has(scenario.destination)} onClick={() => focusNode(scenario.destination)}>{ru.camera.destinationFocus}</button><button type="button" disabled={!good} onClick={fitRoute}>{ru.camera.fit}</button><button type="button" disabled={!activeHighlight} onClick={() => setHighlight(null)}>{ru.camera.clearFocus}</button>{view === '3d' && !webglFailed && <><button type="button" aria-pressed={gesturesEnabled} onClick={() => setGesturesEnabled(enabled => !enabled)}>{ru.camera.gestures}</button><button type="button" aria-label={ru.camera.tiltUp} onClick={() => setCamera(c => boundCamera({ ...c, tilt: (c.tilt ?? 0) + 5 }))}>Ракурс ↑</button><button type="button" aria-label={ru.camera.tiltDown} onClick={() => setCamera(c => boundCamera({ ...c, tilt: (c.tilt ?? 0) - 5 }))}>Ракурс ↓</button></>}</div>
          <p className="scene-help">{view === '3d' && !webglFailed ? ru.sceneHelp3d : ru.sceneHelp2d}</p>
          <div className="legend"><span><i className="endpoint-start" />Начало маршрута</span><span><i className="endpoint-destination" />Цель маршрута</span><span><i className="route-key" />Маршрут · стрелки показывают порядок</span><span><i className="unknown-key" />? Неподтверждённый участок</span><span><b>×</b> Закрыто в симуляции</span></div>
          {view === '3d' && <details className="always-plan"><summary>Открыть ту же дорогу на 2D схеме</summary><FloorPlan building={building} result={result} floor={scenario.floor} closedEdgeIds={scenario.closedEdgeIds} highlight={activeHighlight} /></details>}
        </section>
        <aside className="controls-panel advanced-panel" aria-label="Дополнительные настройки">
          <details ref={requirementsRef} id="requirements-settings" className="settings-disclosure" open={desktop || requirementsOpen}>
            <summary tabIndex={desktop ? -1 : 0} onClick={event => { event.preventDefault(); if (!desktop) setRequirementsOpen(open => !open); }}><strong>{ru.requirements}</strong><span>{requirementsDescription}</span>{(widthInvalid || slopeInvalid) && <span className="warning">Ошибки: {[widthInvalid && 'ширина', slopeInvalid && 'уклон'].filter(Boolean).join(', ')}. Действуют последние допустимые значения.</span>}</summary>
            <fieldset><legend>{ru.requirements}</legend><p className="field-help">Пресеты — редактируемые учебные значения.</p><div className="presets">{presets.map(p => <button key={p.id} type="button" onClick={() => applyPreset(p.requirements)}>{p.label}</button>)}</div>
            <label className="check-row"><input type="checkbox" checked={scenario.requirements.avoidStairs} onChange={e => requirement({ avoidStairs: e.target.checked })} />{ru.noStairs}</label>
            <div className="numeric-fields"><label>{ru.width}<input type="number" min="50" max="150" step="any" aria-invalid={widthInvalid} aria-describedby={widthInvalid ? 'width-error' : undefined} value={numericDraft.minWidthM} onChange={e => numericRequirement('minWidthM', e.target.value)} /></label><label>{ru.slope}<input type="number" min="0" max="20" step="any" aria-invalid={slopeInvalid} aria-describedby={slopeInvalid ? 'slope-error' : undefined} value={numericDraft.maxSlopePercent} onChange={e => numericRequirement('maxSlopePercent', e.target.value)} /></label></div>
            {widthInvalid && <p id="width-error" role="alert" className="warning small">Ширина: 50–150 см. Сохранено последнее допустимое значение.</p>}
            {slopeInvalid && <p id="slope-error" role="alert" className="warning small">Уклон: 0–20 %. Сохранено последнее допустимое значение.</p>}
            <label className="check-row"><input type="checkbox" checked={scenario.requirements.smoothOnly} onChange={e => requirement({ smoothOnly: e.target.checked })} />{ru.smooth}</label>
            <label className="check-row unknown-choice"><input type="checkbox" aria-label={ru.unknown} aria-describedby="unknown-policy-hint" checked={scenario.requirements.allowUnknown} onChange={e => requirement({ allowUnknown: e.target.checked })} /><span>{ru.unknown}<small id="unknown-policy-hint">{ru.unknownHint}</small></span></label>
            </fieldset>
          </details>
          <details ref={closuresRef} id="closure-settings" className="settings-disclosure" open={desktop || closuresOpen}>
            <summary tabIndex={desktop ? -1 : 0} onClick={event => { event.preventDefault(); if (!desktop) setClosuresOpen(open => !open); }}><strong>Симуляция закрытий</strong><span>Закрыто групп: {closedGroups} из {building.closureGroups.length}</span></summary>
            <fieldset className="closures"><legend>Симуляция закрытий</legend><p className="field-help">Изменения действуют только в этом браузере.</p>{building.closureGroups.map(group => {
            const closed = group.edgeIds.every(id => scenario.closedEdgeIds.includes(id));
            return <label key={group.id} className={`closure-row ${closed ? 'is-closed' : ''}`}><span><input type="checkbox" aria-label={group.label} checked={closed} onChange={() => toggleGroup(group.edgeIds)} />{group.label}</span><b>{closed ? '× закрыт' : 'открыт'}</b></label>;
            })}</fieldset>
          </details>
          <button className="reset-button" type="button" onClick={reset}>↺ {ru.reset}</button>
          <p className="storage-note" role="status">{storageWarning ? 'Сохранение недоступно или данные повреждены. Сценарий работает; при ошибке загрузки взяты исходные значения.' : initial.restored ? 'Настройки восстановлены и сохраняются в браузере.' : 'Настройки сохраняются в этом браузере.'}</p>
        </aside>
        <section ref={directionsRef} id="route-directions" className="route-panel directions-panel" aria-label="Полные шаги и причины исключения" tabIndex={-1}>
          <div className="panel-title"><span className="section-index">04</span><h2>Путь по шагам</h2></div>
          {good && <ol className="route-steps" data-testid="route-steps"><li className="start-step"><span className="step-marker">●</span><div><strong>{labelForNode(result.nodeIds[0])}</strong><small>Начальная точка · {nodeMap.get(result.nodeIds[0]!)!.floor + 1} этаж</small></div></li>{result.edgeIds.map((id, i) => {
            const edge = edgeMap.get(id)!; const from = nodeMap.get(result.nodeIds[i]!)!; const to = nodeMap.get(result.nodeIds[i + 1]!)!;
            return <li key={id} data-edge-id={id} className={[result.uncertainEdgeIds.includes(id) ? 'uncertain-step' : '', activeHighlight?.edgeId === id ? 'selected-step' : ''].join(' ')}><span className="step-marker">{i + 1}</span><div><strong>{labelForNode(to.id)}</strong><button type="button" aria-label={`${ru.camera.focus}: шаг ${i + 1}, ${labelForNode(to.id)}`} aria-pressed={activeHighlight?.edgeId === id} onClick={() => focusNode(to.id, id)}>{ru.camera.focus}</button><small>{edgeNames[edge.type]} · {numberRu(edge.lengthM)} м{from.floor !== to.floor ? ` · ${from.floor + 1} → ${to.floor + 1} этаж` : ''}{result.uncertainEdgeIds.includes(id) ? ' · ? не подтверждено' : ''}</small><details><summary>Характеристики участка</summary><EdgeEvidence edge={edge} /></details></div></li>;
          })}</ol>}
          {result.status === 'no-route' && diagnosis.details.length > 0 && <details className="excluded-details" open><summary>{diagnosis.kind === 'insufficient' ? ru.route.missing : ru.route.obstacles}</summary><ul>{diagnosis.details.map(item => <li key={item.edgeId} data-edge-id={item.edgeId}><strong>{edgeNames[edgeMap.get(item.edgeId)!.type]}: {labelForNode(edgeMap.get(item.edgeId)!.from)} ↔ {labelForNode(edgeMap.get(item.edgeId)!.to)}</strong><span>{item.reasons.map(reason => reasonNames[reason]).join('; ')}</span></li>)}</ul></details>}
          <div className="evidence-note"><span aria-hidden="true">◇</span><p><strong>Прозрачные исходные данные</strong>{ru.evidenceSource} «Задано в модели» означает свойство учебного примера.</p></div>
        </section>
      </div>
      <DisplaySettings preferences={preferences} onChange={setPreferences} systemReduced={systemReduced} warning={displayWarning} />
      <ReportJournal />
      <footer><span>{ru.brand.toUpperCase()} / учебный прототип</span><span>Условия меняют путь. Ракурс — только изображение.</span></footer>
    </main>
  </>;
}

export default function App() {
  return checkedBuilding.valid ? <Planner building={checkedBuilding.value} /> : <main><h1>Модель не загружена</h1><p role="alert">{checkedBuilding.message}</p><p>{ru.fiction}</p></main>;
}

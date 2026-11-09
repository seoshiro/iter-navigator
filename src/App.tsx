import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import fixture from './data/building.json';
import type { Building, Requirements, Scenario } from './domain/model';
import { validateBuilding } from './domain/validation';
import { findRouteVariants } from './domain/alternatives';
import { findRoute } from './domain/routing';
import { defaultScenario, loadScenario, saveScenario } from './domain/storage';
import { FloorPlan } from './components/FloorPlan';
import { ReportJournal } from './components/ReportJournal';
import { DisplaySettings } from './components/DisplaySettings';
import { Brand } from './components/Brand';
import { RouteGuidance, RouteVariants } from './components/RouteGuidance';
import { useLocalSpeech } from './ui/speech';
import { useI18n } from './i18n/locale';
import { parseRouteLink } from './domain/share';
import { RoomSearch } from './components/RoomSearch';
import { RouteShare } from './components/RouteShare';
import { boundCamera, fitRouteCamera, focusNodeCamera, INITIAL_CAMERA } from './ui/camera';
import { loadModelView, saveModelView } from './ui/view-preferences';
import { diagnoseRoute } from './ui/route-diagnosis';
import type { CameraState } from './ui/camera';
import { defaultPreferences, loadPreferences, savePreferences } from './ui/preferences';


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
function requirementNumberRu(value: number, centimeters = false) {
  // Shift the stored decimal unit without losing significant digits to display rounding.
  return String(centimeters ? Number(`${value}e2`) : value).replace('.', ',');
}

function Planner({ building }: { building: Building }) {
  const { locale, setLocale, storageWarning: localeStorageWarning, ru, guidanceRu, speechRu, stepTextRu, routeOutcomeRu, routeSpeechRu, edgeNames, reasonNames, nodeLabelRu, numberRu, countRu } = useI18n();
  const t = (ruText: string, kkText: string) => locale === 'kk' ? kkText : ruText;
  const speech = useLocalSpeech(locale);
  const [linkInitial] = useState(() => parseRouteLink(window.location.href, building));
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const walkRef = useRef<HTMLElement>(null);
  const walkTrigger = useRef<HTMLButtonElement>(null);
  const [initial] = useState(() => {
    if (linkInitial.status === 'ok') return { scenario: linkInitial.scenario, restored: false, warning: false };
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
  const [cameraTransitionId,setCameraTransitionId]=useState(0);
  const [expanded,setExpanded]=useState(false);
  const automaticCamera=(value:CameraState)=>{setCamera(boundCamera(value));setCameraTransitionId(id=>id+1);};
  const [gestureReset, setGestureReset] = useState(0);
  const [gesturesEnabled, setGesturesEnabled] = useState(false);
  const [highlight, setHighlight] = useState<{ nodeId: string; edgeId?: string } | null>(null);
  const visualRef = useRef<HTMLElement>(null);
  const [initialView]=useState(()=>{try{return loadModelView(window.localStorage,window.matchMedia('(max-width:700px)').matches);}catch{return {view:window.matchMedia('(max-width:700px)').matches?'2d' as const:'3d' as const,warning:true};}});
  const [view, setView] = useState<'3d' | '2d'>(initialView.view);
  const [viewWarning,setViewWarning]=useState(initialView.warning);
  const chooseView=(next:'2d'|'3d')=>{setView(next);try{setViewWarning(!saveModelView(window.localStorage,next));}catch{setViewWarning(true);}};
  const [planZoom, setPlanZoom] = useState(1);
  const [planReset, setPlanReset] = useState(0);
  const resetPlan = () => { setPlanZoom(1); setPlanReset(value => value + 1); };
  const [webglFailed, setWebglFailed] = useState(false);
  // Capture summary activation directly; delayed native toggle events also report forced desktop writes.
  const [roomToolsOpen,setRoomToolsOpen]=useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [closuresOpen, setClosuresOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [inlinePlanOpen, setInlinePlanOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState<string[]>([]);
  const requirementsRef = useRef<HTMLDetailsElement>(null);
  const closuresRef = useRef<HTMLDetailsElement>(null);
  const directionsRef = useRef<HTMLElement>(null);
  const pendingFocus = useRef<{ panel: string; index: number; x: number; y: number } | null>(null);
  const subscribeToLayout = useCallback((onChange: () => void) => {
    const media = window.matchMedia('(min-width: 701px)');
    const wide = window.matchMedia('(min-width: 1251px)');
    const synchronize = () => {
      const active = document.activeElement;
      const panel = active?.closest<HTMLElement>('[data-workspace-panel]');
      pendingFocus.current = panel ? { panel: panel.dataset.workspacePanel!, index: [...panel.querySelectorAll('button,input,select,summary,a,[tabindex]')].indexOf(active!), x: window.scrollX, y: window.scrollY } : null;
      if (!media.matches) {
        if (requirementsRef.current?.contains(document.activeElement) && !requirementsRef.current.querySelector('summary')?.contains(document.activeElement)) setRequirementsOpen(true);
        if (closuresRef.current?.contains(document.activeElement) && !closuresRef.current.querySelector('summary')?.contains(document.activeElement)) setClosuresOpen(true);
        if (active?.closest('.variant-disclosure') && !active.closest('summary')) setVariantsOpen(true);
      }
      onChange();
    };
    media.addEventListener('change', synchronize);
    wide.addEventListener('change', synchronize);
    return () => { media.removeEventListener('change', synchronize); wide.removeEventListener('change', synchronize); };
  }, []);
  const layout = useSyncExternalStore(subscribeToLayout, () => window.matchMedia('(min-width: 1251px)').matches ? 'wide' : window.matchMedia('(min-width: 701px)').matches ? 'compact' : 'mobile');
  const desktop = layout !== 'mobile';
  const wideWorkspace = layout === 'wide';
  useLayoutEffect(() => {
    const focus = pendingFocus.current;
    if (!focus) return;
    pendingFocus.current = null;
    const panel = document.querySelector<HTMLElement>(`[data-workspace-panel="${focus.panel}"]`);
    const target = focus.index < 0 ? panel : panel?.querySelectorAll<HTMLElement>('button,input,select,summary,a,[tabindex]')[focus.index];
    target?.focus({ preventScroll: true });
    window.scrollTo({ left: focus.x, top: focus.y, behavior: 'instant' });
  }, [layout]);
  const [numericDraft, setNumericDraft] = useState({ minWidthM: String(initial.scenario.requirements.minWidthM * 100), maxSlopePercent: String(initial.scenario.requirements.maxSlopePercent) });
  const numericEdited = useRef({ minWidthM: false, maxSlopePercent: false });
  const widthInvalid = numericDraft.minWidthM === '' || !Number.isFinite(Number(numericDraft.minWidthM)) || Number(numericDraft.minWidthM) < 50 || Number(numericDraft.minWidthM) > 150;
  const slopeInvalid = numericDraft.maxSlopePercent === '' || !Number.isFinite(Number(numericDraft.maxSlopePercent)) || Number(numericDraft.maxSlopePercent) < 0 || Number(numericDraft.maxSlopePercent) > 20;
  const routingKey = JSON.stringify([scenario.start, scenario.destination, scenario.requirements, scenario.closedEdgeIds]);
  const variants = useMemo(() => findRouteVariants(building, scenario.start, scenario.destination, scenario.requirements, scenario.closedEdgeIds), [building, scenario.start, scenario.destination, scenario.requirements, scenario.closedEdgeIds]);
  const [guidance, setGuidance] = useState<{ key: string; variant: number; step: number | null } | null>(null);
  const selectedVariant = guidance?.key === routingKey ? guidance.variant : 0;
  const selectedStep = guidance?.key === routingKey ? guidance.step : null;
  const routes = variants.primary.status === 'ok' ? [variants.primary, ...variants.alternatives] : [];
  const result = routes[selectedVariant] ?? variants.primary;
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
    return node ? nodeLabelRu(node.id, node.label, node.labelKk) : ru.invalidEndpointLabel;
  };
  const endpointDescription = (id: string) => {
    const node = nodeMap.get(id);
    if (!node) return ru.invalidEndpointDescription;
    return node.id === 'room-205' ? ru.room205 : ru.endpointFloor(node.floor);
  };
  const edgeMap = new Map(building.edges.map(e => [e.id, e]));
  const clearGuidance = () => { speech.controller.stop(); setGuidance(null); setHighlight(null); };
  const confirm = (text: string, nextScenario?: Scenario, selectedResult = result) => {
    if (!speech.enabled) return;
    const nextResult = nextScenario ? findRoute(building, nextScenario.start, nextScenario.destination, nextScenario.requirements, nextScenario.closedEdgeIds) : selectedResult;
    speech.controller.read([`${text} ${routeOutcomeRu(nextResult, diagnoseRoute(building, nextScenario ?? scenario, nextResult))}`]);
  };
  const patch = (values: Partial<Scenario>) => {
    let nextValues={...values};
    if (values.start !== undefined || values.destination !== undefined) {
      clearGuidance();
      const id=values.destination??values.start!;const selected=nodeMap.get(id);
      if(selected){setSelectedRoom(id);setHighlight({nodeId:id});nextValues={...nextValues,floor:selected.floor};automaticCamera(focusNodeCamera(building,id));}
      confirm(guidanceRu.routeChanged(labelForNode(values.start??scenario.start),labelForNode(values.destination??scenario.destination)),{...scenario,...nextValues});
    }
    if (values.floor !== undefined) {
      speech.controller.stop();if(speech.enabled)speech.controller.read([guidanceRu.floorShown(values.floor)]);
      automaticCamera(values.floor==='all'?INITIAL_CAMERA:{...INITIAL_CAMERA,zoom:1.15,target:{x:16,y:values.floor*building.floorHeightM+.45,z:11}});
    }
    setScenario(previous=>({...previous,...nextValues}));
  };
  const requirement = (values: Partial<Requirements>, confirmation?: string) => { clearGuidance(); setScenario(previous => ({ ...previous, requirements: { ...previous.requirements, ...values } })); if (confirmation) confirm(confirmation, { ...scenario, requirements: { ...scenario.requirements, ...values } }); };
  const numericRequirement = (key: 'minWidthM' | 'maxSlopePercent', value: string) => {
    numericEdited.current[key] = true;
    clearGuidance();
    setNumericDraft(previous => ({ ...previous, [key]: value }));
    const numeric = Number(value); const next = key === 'minWidthM' ? numeric / 100 : numeric;
    const valid = value !== '' && Number.isFinite(next) && (key === 'minWidthM' ? next >= 0.5 && next <= 1.5 : next >= 0 && next <= 20);
    if (valid) requirement({ [key]: next });
  };
  const toggleGroup = (edgeIds: string[], label: string) => { clearGuidance(); const closed = edgeIds.every(id => scenario.closedEdgeIds.includes(id));
    const next = { ...scenario, closedEdgeIds: closed ? scenario.closedEdgeIds.filter(id => !edgeIds.includes(id)) : [...new Set([...scenario.closedEdgeIds, ...edgeIds])] };
    confirm(guidanceRu.closure(label, closed), next); setScenario(next);
  };
  const applyPreset = (values: Requirements, label: string) => { requirement(values, guidanceRu.preset(label)); setNumericDraft({ minWidthM: String(values.minWidthM * 100), maxSlopePercent: String(values.maxSlopePercent) }); };
  const reset = () => { clearGuidance(); resetPlan(); confirm(guidanceRu.reset, defaultScenario()); setGestureReset(value => value + 1); setScenario(defaultScenario()); automaticCamera(INITIAL_CAMERA); setExpanded(false); setSelectedRoom(null); setGesturesEnabled(false); setNumericDraft({ minWidthM: '90', maxSlopePercent: '5' }); setRequirementsOpen(false); setClosuresOpen(false); };
  const updateCamera = useCallback((value: CameraState) => setCamera(boundCamera(value)), []);
  const good = result.status === 'ok';
  const uncertain = good && result.uncertainEdgeIds.length > 0;
  const activeHighlight = good && selectedStep !== null ? { nodeId: result.nodeIds[selectedStep + 1]!, edgeId: result.edgeIds[selectedStep]! } : highlight && (highlight.edgeId === undefined || good && result.edgeIds.includes(highlight.edgeId)) ? highlight : null;
  const focusNode = (nodeId: string, edgeId?: string) => {
    const node = nodeMap.get(nodeId); if (!node) return;
    speech.controller.stop(); setGuidance({ key: routingKey, variant: selectedVariant, step: null });
    setHighlight({ nodeId, edgeId }); automaticCamera(focusNodeCamera(building, nodeId));
    setScenario(previous => ({ ...previous, floor: node.floor }));
    requestAnimationFrame(() => {
      const target = visualRef.current?.querySelector<HTMLElement | SVGSVGElement>(view === '3d' && !webglFailed ? '.diorama' : '.primary-plan .floor-card svg');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  };
  const fitRoute = () => {
    if (!good) return;
    speech.controller.stop(); resetPlan();
    const scene = visualRef.current?.querySelector('.diorama');
    const bounds = scene?.getBoundingClientRect();
    setExpanded(true); automaticCamera(fitRouteCamera(building, result.nodeIds, bounds ? bounds.width / bounds.height : 1));
    setGuidance({ key: routingKey, variant: selectedVariant, step: null }); setHighlight(null); setScenario(previous => ({ ...previous, floor: 'all' }));
  };
  const selectRoom=(id:string|null)=>{if(id===null){setSelectedRoom(null);return;}const node=nodeMap.get(id);if(!node)return;setSelectedRoom(id);speech.controller.stop();setGuidance({key:routingKey,variant:selectedVariant,step:null});setHighlight({nodeId:id});setScenario(previous=>({...previous,floor:node.floor}));automaticCamera(focusNodeCamera(building,id));};
  const wholeBuilding=()=>{speech.controller.stop();setExpanded(false);setHighlight(null);setGuidance({key:routingKey,variant:selectedVariant,step:null});setScenario(previous=>({...previous,floor:'all'}));automaticCamera(INITIAL_CAMERA);resetPlan();};
  const expandFloors=()=>{speech.controller.stop();setExpanded(true);setScenario(previous=>({...previous,floor:'all'}));automaticCamera(INITIAL_CAMERA);};
  const readRoute = () => { speech.controller.setEnabled(true); speech.controller.read(routeSpeechRu(building, result, diagnosis)); };
  const readStep = (index = selectedStep) => {
    if (!good || index === null) return;
    const detail = diagnosis.details.find(item => item.edgeId === result.edgeIds[index]);
    speech.controller.read([...(detail ? [guidanceRu.stepWarning(detail.reasons.map(reason => reasonNames[reason]))] : []), stepTextRu(building, result, index)]);
  };
  const selectStep = (step: number | null, focus = false) => {
    speech.controller.stop(); setHighlight(null); setGuidance({ key: routingKey, variant: selectedVariant, step });
    if (!good) return;
    if (step === null) { fitRoute(); confirm(guidanceRu.allShown); return; }
    const from = nodeMap.get(result.nodeIds[step]!)!; const to = nodeMap.get(result.nodeIds[step + 1]!)!;
    if(from.floor!==to.floor)setExpanded(true); automaticCamera(from.floor !== to.floor ? fitRouteCamera(building, [from.id, to.id], 1) : focusNodeCamera(building, to.id));
    setScenario(previous => ({ ...previous, floor: from.floor !== to.floor ? 'all' : to.floor }));
    if (speech.enabled) readStep(step);
    if (focus) requestAnimationFrame(() => { const target = visualRef.current?.querySelector<HTMLElement | SVGSVGElement>(view === '3d' && !webglFailed ? '.diorama' : '.primary-plan .floor-card svg'); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'center', behavior: 'instant' }); });
  };
  const requirementsDescription = `${scenario.requirements.avoidStairs ? t('Без ступеней', 'Баспалдақсыз') : t('Лестницы допустимы', 'Баспалдаққа рұқсат')} · ${requirementNumberRu(scenario.requirements.minWidthM, true)} ${t('см минимум', 'см кем емес')} · ${requirementNumberRu(scenario.requirements.maxSlopePercent)} % ${t('максимальный уклон', 'ең үлкен еңіс')} · ${scenario.requirements.smoothOnly ? t('ровное покрытие', 'тегіс жабын') : t('любое покрытие', 'кез келген жабын')} · ${t('неизвестные', 'белгісіз деректер')} ${scenario.requirements.allowUnknown ? t('разрешены', 'рұқсат етілген') : t('исключены', 'алынып тасталған')}`;
  const closedGroups = building.closureGroups.filter(group => group.edgeIds.every(id => scenario.closedEdgeIds.includes(id))).length;
  const openSettings = (section: 'requirements' | 'closures') => {
    if (section === 'requirements') setRequirementsOpen(true); else setClosuresOpen(true);
    requestAnimationFrame(() => (section === 'requirements' ? requirementsRef : closuresRef).current?.querySelector('summary')?.focus());
  };
  const closeWalk = () => { speech.controller.stop(); setWalking(false); requestAnimationFrame(() => walkTrigger.current?.focus()); };
  const beginWalk = () => { if (!good) return; setWalking(true); selectStep(selectedStep ?? 0); requestAnimationFrame(() => { walkRef.current?.focus(); walkRef.current?.scrollIntoView({block:'start'}); }); };
  const localizedPresets = presets.map((preset, index) => ({...preset, label: [t('Без ступеней','Баспалдақсыз'),t('Шире проход','Кеңірек өткел'),t('Лестницы допустимы','Баспалдаққа рұқсат')][index]!}));
  const chosenRoom = selectedRoom ? nodeMap.get(selectedRoom) : null;
  const roomCard = chosenRoom && <section className="room-selection" aria-label={t('Выбранное помещение','Таңдалған бөлме')} data-testid="map-room-card"><strong>{labelForNode(chosenRoom.id)}</strong><p>{chosenRoom.floor+1} {t('этаж · учебная точка','қабат · оқу үлгісінің нүктесі')}</p><div className="guidance-actions"><button onClick={()=>patch({start:chosenRoom.id})}>{t('Начать отсюда','Осы жерден бастау')}</button><button onClick={()=>patch({destination:chosenRoom.id})}>{t('Проложить маршрут сюда','Осы жерге бағыт құру')}</button><button onClick={()=>setSelectedRoom(null)}>{t('Закрыть карточку','Карточканы жабу')}</button></div></section>;
  const guidanceView = (compact = false) => good && <RouteGuidance compact={compact} building={building} result={result} selected={selectedStep} onSelect={selectStep} onReadStep={() => { speech.controller.setEnabled(true); readStep(); }} onStop={speech.controller.stop} speechStatus={speech.status} expandedStepIds={expandedStepIds} onToggleEvidence={id => setExpandedStepIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id])} />;
  const endpointsPanel = <section className="controls-panel endpoints-panel" id="route-controls" data-workspace-panel="endpointsPanel" aria-label={t('Настройка маршрута','Бағытты баптау')} tabIndex={-1}>
    <div className="panel-title"><span className="section-index">01</span><h2>{t('Ваш маршрут','Сіздің бағытыңыз')}</h2></div>
    <div className="endpoint-fields"><label>{ru.start}<select aria-label={ru.start} aria-describedby="start-description" value={scenario.start} onChange={e => patch({ start: e.target.value })}>{selectable.map(n => <option key={n.id} value={n.id}>{labelForNode(n.id)}</option>)}</select><span id="start-description" className="endpoint-caption">{endpointDescription(scenario.start)}</span></label><div className="endpoint-link" aria-hidden="true">↓</div><label>{ru.destination}<select aria-label={ru.destination} aria-describedby="destination-description" value={scenario.destination} onChange={e => patch({ destination: e.target.value })}>{selectable.map(n => <option key={n.id} value={n.id}>{labelForNode(n.id)}</option>)}</select><span id="destination-description" className="endpoint-caption">{endpointDescription(scenario.destination)}</span></label></div>
    <button className="endpoint-swap" type="button" aria-label={ru.camera.swap} title={ru.camera.swap} onClick={() => patch({ start: scenario.destination, destination: scenario.start })}>⇅</button>
<details className="room-tools" open={desktop||roomToolsOpen}><summary onClick={event=>{event.preventDefault();if(!desktop)setRoomToolsOpen(value=>!value);}}>{t("Поиск помещений и QR","Бөлмелерді іздеу және QR")}</summary><RoomSearch building={building} selected={selectedRoom} onSelect={selectRoom} onStart={id=>patch({start:id})} onDestination={id=>patch({destination:id})} />
    <RouteShare building={building} scenario={scenario} /></details>
  </section>;
  const requirementsPanel = <aside className="controls-panel advanced-panel" data-workspace-panel="requirementsPanel" aria-label={t('Дополнительные настройки','Қосымша баптаулар')}><details ref={requirementsRef} id="requirements-settings" className="settings-disclosure" open={requirementsOpen}><summary tabIndex={0} onClick={event=>{event.preventDefault();setRequirementsOpen(open=>!open);}}><strong>{ru.requirements}</strong><span>{requirementsDescription}</span>{(widthInvalid||slopeInvalid)&&<span className="warning">{t('Есть ошибка. Действуют последние допустимые значения.','Қате бар. Соңғы жарамды мәндер қолданылады.')}</span>}</summary><fieldset><legend>{ru.requirements}</legend><p className="field-help">{t('Пресеты — редактируемые учебные значения.','Дайын баптаулар — өзгертуге болатын оқу мәндері.')}</p><div className="presets">{localizedPresets.map(p=><button key={p.id} type="button" onClick={()=>applyPreset(p.requirements,p.label)}>{p.label}</button>)}</div>
    <label className="check-row"><input type="checkbox" checked={scenario.requirements.avoidStairs} onChange={e=>requirement({avoidStairs:e.target.checked},guidanceRu.stairs(e.target.checked))}/>{ru.noStairs}</label>
    <div className="numeric-fields"><label>{ru.width}<input type="number" min="50" max="150" step="any" aria-invalid={widthInvalid} aria-describedby={widthInvalid?'width-error':undefined} value={numericDraft.minWidthM} onChange={e=>numericRequirement('minWidthM',e.target.value)} onBlur={()=>{if(numericEdited.current.minWidthM&&!widthInvalid)confirm(guidanceRu.width(requirementNumberRu(scenario.requirements.minWidthM,true)));numericEdited.current.minWidthM=false;}}/></label><label>{ru.slope}<input type="number" min="0" max="20" step="any" aria-invalid={slopeInvalid} aria-describedby={slopeInvalid?'slope-error':undefined} value={numericDraft.maxSlopePercent} onChange={e=>numericRequirement('maxSlopePercent',e.target.value)} onBlur={()=>{if(numericEdited.current.maxSlopePercent&&!slopeInvalid)confirm(guidanceRu.slope(requirementNumberRu(scenario.requirements.maxSlopePercent)));numericEdited.current.maxSlopePercent=false;}}/></label></div>
    {widthInvalid&&<p id="width-error" role="alert" className="warning small">{t('Ширина: 50–150 см. Сохранено последнее допустимое значение.','Ені: 50–150 см. Соңғы жарамды мән сақталды.')}</p>}{slopeInvalid&&<p id="slope-error" role="alert" className="warning small">{t('Уклон: 0–20 %. Сохранено последнее допустимое значение.','Еңіс: 0–20 %. Соңғы жарамды мән сақталды.')}</p>}
    <label className="check-row"><input type="checkbox" checked={scenario.requirements.smoothOnly} onChange={e=>requirement({smoothOnly:e.target.checked},guidanceRu.surface(e.target.checked))}/>{ru.smooth}</label><label className="check-row unknown-choice"><input type="checkbox" aria-label={ru.unknown} aria-describedby="unknown-policy-hint" checked={scenario.requirements.allowUnknown} onChange={e=>requirement({allowUnknown:e.target.checked},guidanceRu.unknown(e.target.checked))}/><span>{ru.unknown}<small id="unknown-policy-hint">{ru.unknownHint}</small></span></label>
  </fieldset></details></aside>;
  const outcomePanel = <section className="route-panel outcome-panel" data-workspace-panel="outcomePanel" aria-label={t('Результат маршрута','Бағыт нәтижесі')}><div className="panel-title"><span className="section-index">04</span><h2>{t('Результат маршрута','Бағыт нәтижесі')}</h2></div>
    <div className={`route-summary ${uncertain||!good?'caution':''}`} data-testid="route-result" data-route-state={diagnosis.kind} data-route-ids={good?result.edgeIds.join(','):''}><span className="status-kicker">{good?uncertain?t('НЕПОДТВЕРЖДЁННЫЙ ПУТЬ','РАСТАЛМАҒАН ЖОЛ'):t('ПОДХОДИТ УСЛОВИЯМ МОДЕЛИ','МОДЕЛЬ ШАРТТАРЫНА САЙ'):t('ПУТЬ НЕ ПОСТРОЕН','БАҒЫТ ҚҰРЫЛМАДЫ')}</span>{good?<><div className="distance">{numberRu(result.distanceM)}<span>м</span></div><p>{result.edgeIds.length===0?t('Начало и цель — одна выбранная точка.','Бастау мен мақсат — бір нүкте.'):countRu(result.edgeIds.length,['участок','участка','участков'])} · {ru.route.floors(diagnosis.floors)}</p><p>{ru.route.stepFree(diagnosis.stepFree)}</p><small>{t('Расстояние по учебному графу.','Қашықтық оқу графы бойынша есептелген.')}</small></>:<><h3>{diagnosis.kind==='invalid'?ru.route.invalid:diagnosis.kind==='insufficient'?ru.route.insufficient:ru.route.noRoute}</h3><p>{result.status==='invalid'?t('Проверьте выбранные точки и условия.','Таңдалған нүктелер мен шарттарды тексеріңіз.'):diagnosis.kind==='insufficient'?ru.route.insufficientHint:diagnosis.connected?ru.route.blockedHint:ru.route.disconnectedHint}</p>{diagnosis.kind==='insufficient'&&<p>{[...new Set(diagnosis.details.flatMap(detail=>detail.reasons))].map(reason=>reasonNames[reason]).join('; ')}.</p>}</>}</div>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{routeOutcomeRu(result,diagnosis)}</p>
    {uncertain&&<div className="uncertain-warning"><strong>{ru.route.uncertainty}</strong><p>{countRu(result.uncertainEdgeIds.length,['неподтверждённый участок','неподтверждённых участка','неподтверждённых участков'])}: {diagnosis.details.map(detail=>{const edge=edgeMap.get(detail.edgeId)!;const index=result.edgeIds.indexOf(detail.edgeId);return `${edgeNames[edge.type]}: ${labelForNode(result.nodeIds[index])} → ${labelForNode(result.nodeIds[index+1])} — ${detail.reasons.map(reason=>reasonNames[reason]).join(', ')}`;}).join('; ')}. {t('Известные нарушения условий по-прежнему исключены.','Белгілі шектеу бұзушылықтары бұрынғыдай алынып тасталады.')}</p></div>}
    {good&&<RouteVariants building={building} routes={routes} selected={selectedVariant} expanded={variantsOpen} onExpandedChange={setVariantsOpen} onSelect={variant=>{speech.controller.stop();setHighlight(null);setGuidance({key:routingKey,variant,step:null});confirm(guidanceRu.selected(variant),undefined,routes[variant]!);}}/>}
    <div className="guidance-actions"><button type="button" onClick={readRoute}>{guidanceRu.readRoute}</button><button type="button" onClick={speech.controller.stop}>{guidanceRu.stop}</button></div>{speech.status!=='ready'&&<p id="route-speech-feedback" className="speech-feedback">{speechRu[speech.status]}</p>}
    {good&&result.edgeIds.length>0&&<button ref={walkTrigger} className="walk-start" type="button" onClick={beginWalk}>{t('Проходить маршрут по шагам','Бағытпен қадамдап жүру')}</button>}
    {!good&&<div className="settings-shortcuts"><button onClick={()=>openSettings('requirements')}>{t('Изменить условия','Шарттарды өзгерту')}</button><button onClick={()=>openSettings('closures')}>{t('Открыть закрытия','Жабылуларды ашу')}</button></div>}
    <a className="directions-jump" href="#route-directions" onClick={event=>{event.preventDefault();directionsRef.current?.focus();directionsRef.current?.scrollIntoView({block:'start'});}}>{good?t('К полным шагам маршрута ↓','Бағыттың толық қадамдарына ↓'):t('К причинам исключения ↓','Алып тастау себептеріне ↓')}</a>
  </section>;
  const visualPanel = <section ref={visualRef} className="visual-panel" data-workspace-panel="visualPanel" aria-label={t('Визуализация здания','Ғимарат көрінісі')}><div className="visual-toolbar"><div><span className="section-index">03</span><h2>{t('Здание','Ғимарат')} «{ru.brand}»</h2></div><div className="view-switch" role="group" aria-label={t('Вид здания','Ғимараттың көрсетілімі')}><button aria-label={t('3D модель','3D модель')} aria-pressed={view==='3d'} disabled={webglFailed} onClick={()=>chooseView('3d')}>3D</button><button aria-label={t('2D схема','2D сызба')} aria-pressed={view==='2d'} onClick={()=>chooseView('2d')}>2D</button></div></div>
    <div className="model-meta"><span>{t('3 этажа · 2 лифта','3 қабат · 2 лифт')}</span><span>{ru.modelGeometry}</span></div><div className="floor-toolbar"><span>{guidanceRu.floorLabel}</span><div role="group" aria-label={t('Этажи','Қабаттар')}><button aria-pressed={scenario.floor==='all'} onClick={()=>patch({floor:'all'})}>{t('Все','Барлығы')}</button>{building.floors.map(f=><button key={f.id} aria-pressed={scenario.floor===f.id} onClick={()=>patch({floor:f.id})}>{f.id+1}</button>)}</div></div>
    {viewWarning&&<p className="storage-note">{t('Режим выбран, но сохранить его в браузере не удалось.','Көрсетілім таңдалды, бірақ оны браузерде сақтау мүмкін болмады.')}</p>}
    {view==='3d'&&!webglFailed&&<div className="architecture-toolbar" role="group" aria-label={t('Раскрытие здания','Ғимаратты ашып көрсету')}><button type="button" aria-pressed={scenario.floor==='all'&&!expanded} onClick={wholeBuilding}>{t('Целое здание','Тұтас ғимарат')}</button>{view==='3d'&&!webglFailed&&<button type="button" aria-pressed={scenario.floor==='all'&&expanded} onClick={expandFloors}>{t('Раскрыть этажи','Қабаттарды ашу')}</button>}<span className="architecture-status" role="status">{scenario.floor==='all'?(expanded&&view==='3d'?t('Этажи раздвинуты · расстояния не меняются','Қабаттар ашылды · қашықтық өзгермейді'):t('Общий вид · выберите помещение','Жалпы көрініс · бөлмені таңдаңыз')):t(`Выделен ${scenario.floor+1} этаж`,`${scenario.floor+1}-қабат бөлектелді`)}</span></div>}
    {webglFailed&&<p className="fallback-note" role="status">{t('3D недоступно: показана 2D-схема. Маршрут и настройки сохранены. Не удалось создать или продолжить 3D-рендер.','3D қолжетімсіз: 2D-сызба көрсетілді. Бағыт пен баптаулар сақталды. 3D көрінісін жасау немесе жалғастыру мүмкін болмады.')}</p>}
    {view==='3d'&&!webglFailed?<div className="diorama-wrap"><VisualBoundary onFailure={onFailure}><Suspense fallback={<div className="visual-loading" role="status"><div className="model-loading-plan" aria-hidden="true"><i className="loading-slab"/><i className="loading-slab"/><i className="loading-slab"/></div><strong>{t('Готовим архитектурный макет','Сәулеттік макет дайындалуда')}</strong><p>{t('Маршрут уже рассчитан. 2D-схема доступна сразу.','Бағыт есептелді. 2D-сызба бірден қолжетімді.')}</p></div>}><Diorama building={building} result={result} floor={scenario.floor} closedEdgeIds={scenario.closedEdgeIds} camera={camera} cameraTransitionId={cameraTransitionId} expanded={expanded} onSelectNode={selectRoom} onCameraChange={updateCamera} motionAllowed={motionAllowed} theme={preferences.theme} largerText={preferences.largerText} highlight={activeHighlight} gesturesEnabled={gesturesEnabled} gestureReset={gestureReset} onFailure={onFailure}/></Suspense></VisualBoundary><span className="model-caption">{t('Вымышленное здание / масштаб условный','Ойдан шығарылған ғимарат / шартты масштаб')}</span></div>:<div className="primary-plan"><FloorPlan selectedNodeId={selectedRoom} building={building} result={result} floor={scenario.floor} closedEdgeIds={scenario.closedEdgeIds} highlight={activeHighlight} zoom={planZoom} resetToken={planReset} onSelectNode={selectRoom}/></div>}
    {roomCard}
    {view==='3d'&&!webglFailed&&<details className="camera-disclosure"><summary>{guidanceRu.cameraActions}</summary><div className="camera-controls"><label>{t('Ракурс','Көру бұрышы')}<select aria-label={t('Ракурс','Көру бұрышы')} value={camera.preset} onChange={e=>setCamera(c=>boundCamera({...c,preset:e.target.value as CameraState['preset']}))}><option value="overview">{t('Общий вид','Жалпы көрініс')}</option><option value="front">{t('Спереди','Алдынан')}</option><option value="top">{t('Сверху','Үстінен')}</option></select></label><div role="group" aria-label={t('Поворот и масштаб камеры','Камераны бұру және масштабтау')}><button aria-label={t('Повернуть влево','Солға бұру')} onClick={()=>setCamera(c=>boundCamera({...c,yaw:c.yaw-20}))}>↶</button><button aria-label={t('Повернуть вправо','Оңға бұру')} onClick={()=>setCamera(c=>boundCamera({...c,yaw:c.yaw+20}))}>↷</button><button aria-label={t('Уменьшить масштаб','Кішірейту')} onClick={()=>setCamera(c=>boundCamera({...c,zoom:c.zoom-.15}))}>−</button><button aria-label={t('Увеличить масштаб','Үлкейту')} onClick={()=>setCamera(c=>boundCamera({...c,zoom:c.zoom+.15}))}>+</button><button onClick={()=>{setGestureReset(v=>v+1);wholeBuilding();setGesturesEnabled(false);}}>{t('Сброс камеры','Камераны қалпына келтіру')}</button></div><div role="group" aria-label={t('Смещение камеры','Камераны жылжыту')}>{[{label:t('Сместить вид влево','Көріністі солға жылжыту'),text:'←',x:-1,y:0},{label:t('Сместить вид вправо','Көріністі оңға жылжыту'),text:'→',x:1,y:0},{label:t('Сместить вид вверх','Көріністі жоғары жылжыту'),text:'↑',x:0,y:1},{label:t('Сместить вид вниз','Көріністі төмен жылжыту'),text:'↓',x:0,y:-1}].map(c=><button key={c.text} aria-label={c.label} onClick={()=>setCamera(v=>boundCamera({...v,panX:v.panX+c.x,panY:v.panY+c.y}))}>{c.text}</button>)}</div></div></details>}
    <div className="framing-controls"><button onClick={()=>focusNode(scenario.destination)}>{ru.camera.destinationFocus}</button><button disabled={!good} onClick={fitRoute}>{ru.camera.fit}</button><button disabled={!activeHighlight} onClick={()=>{speech.controller.stop();setHighlight(null);setGuidance({key:routingKey,variant:selectedVariant,step:null});}}>{ru.camera.clearFocus}</button>{view==='3d'&&!webglFailed&&<><button aria-pressed={gesturesEnabled} onClick={()=>setGesturesEnabled(v=>!v)}>{ru.camera.gestures}</button><button aria-label={ru.camera.tiltUp} onClick={()=>setCamera(c=>boundCamera({...c,tilt:(c.tilt??0)+5}))}>↗</button><button aria-label={ru.camera.tiltDown} onClick={()=>setCamera(c=>boundCamera({...c,tilt:(c.tilt??0)-5}))}>↙</button></>}</div>
    {view==='2d'&&<div className="framing-controls" role="group" aria-label={guidanceRu.zoom2d}><button aria-label={guidanceRu.zoomOut2d} disabled={planZoom<=1} onClick={()=>setPlanZoom(v=>Math.max(1,v-.25))}>−</button><button aria-label={guidanceRu.zoomIn2d} disabled={planZoom>=2} onClick={()=>setPlanZoom(v=>Math.min(2,v+.25))}>+</button><button onClick={resetPlan}>{guidanceRu.reset2d}</button></div>}
    <p className="scene-help">{view==='3d'&&!webglFailed?ru.sceneHelp3d:ru.sceneHelp2d}</p><div className="legend"><span><i className="endpoint-start"/>{t('Начало маршрута','Бағыттың басы')}</span><span><i className="endpoint-destination"/>{t('Цель маршрута','Бағыттың мақсаты')}</span><span><i className="route-key"/>{t('Стрелки показывают порядок','Көрсеткілер жүру ретін көрсетеді')}</span><span><i className="unknown-key"/>{t('? Неподтверждённый участок','? Расталмаған бөлік')}</span><span><b>×</b>{t('Закрыто в симуляции','Модельде жабық')}</span></div>
    {view==='3d'&&<details className="always-plan" open={inlinePlanOpen}><summary onClick={e=>{e.preventDefault();setInlinePlanOpen(v=>!v);}}>{t('Выбрать помещение на 2D-схеме','2D-сызбадан бөлмені таңдау')}</summary><FloorPlan selectedNodeId={selectedRoom} building={building} result={result} floor={scenario.floor} closedEdgeIds={scenario.closedEdgeIds} highlight={activeHighlight} onSelectNode={selectRoom}/></details>}
  </section>;
  const directionsPanel=<section ref={directionsRef} id="route-directions" className="route-panel directions-panel" data-workspace-panel="directionsPanel" aria-label={t('Полные шаги и причины исключения','Толық қадамдар және алып тастау себептері')} tabIndex={-1}><div className="panel-title"><span className="section-index">02</span><h2>{t('Путь по шагам','Бағыт қадамдары')}</h2></div>{guidanceView(true)}{result.status==='no-route'&&diagnosis.details.length>0&&<details className="excluded-details" open><summary>{diagnosis.kind==='insufficient'?ru.route.missing:ru.route.obstacles}</summary><ul>{diagnosis.details.map(item=><li key={item.edgeId} data-edge-id={item.edgeId}><strong>{edgeNames[edgeMap.get(item.edgeId)!.type]}: {labelForNode(edgeMap.get(item.edgeId)!.from)} ↔ {labelForNode(edgeMap.get(item.edgeId)!.to)}</strong><span>{item.reasons.map(reason=>reasonNames[reason]).join('; ')}</span></li>)}</ul></details>}<details className="evidence-note" open={evidenceOpen}><summary onClick={e=>{e.preventDefault();setEvidenceOpen(v=>!v);}}>{t('Прозрачные исходные данные','Ашық бастапқы деректер')}</summary><p>{ru.evidenceSource}</p></details></section>;
  const closuresPanel=<aside className="controls-panel simulation-panel" data-workspace-panel="closuresPanel" aria-label={t('Симуляция закрытий','Жабылуларды модельдеу')}><details ref={closuresRef} id="closure-settings" className="settings-disclosure" open={closuresOpen}><summary tabIndex={0} onClick={e=>{e.preventDefault();setClosuresOpen(v=>!v);}}><strong>{t('Симуляция закрытий','Жабылуларды модельдеу')}</strong><span>{t('Закрыто групп','Жабық топтар')}: {closedGroups} / {building.closureGroups.length}</span></summary><fieldset className="closures"><legend>{t('Симуляция закрытий','Жабылуларды модельдеу')}</legend><p className="field-help">{t('Изменения действуют только в этом браузере.','Өзгерістер тек осы браузерде қолданылады.')}</p>{building.closureGroups.map(group=>{const closed=group.edgeIds.every(id=>scenario.closedEdgeIds.includes(id));const name=locale==='kk'?(group.labelKk??group.label):group.label;return <label key={group.id} className={`closure-row ${closed?'is-closed':''}`}><span><input type="checkbox" aria-label={name} checked={closed} onChange={()=>toggleGroup(group.edgeIds,name)}/>{name}</span><b>{closed?t('× закрыт','× жабық'):t('открыт','ашық')}</b></label>;})}</fieldset></details><button className="reset-button" onClick={reset}>↺ {ru.reset}</button><p className="storage-note">{storageWarning?t('Сохранение недоступно или данные повреждены. Сценарий работает в этой вкладке.','Сақтау қолжетімсіз немесе деректер бүлінген. Сценарий осы қойындыда жұмыс істейді.'):t('Настройки сохраняются в этом браузере.','Баптаулар осы браузерде сақталады.')}</p></aside>;
  const displayPanel=<DisplaySettings preferences={preferences} onChange={setPreferences} systemReduced={systemReduced} warning={displayWarning} speech={speech} expanded={displayOpen} onExpandedChange={setDisplayOpen}/>;
  return <><a className="skip-link" href={walking?'#walk-mode':'#route-controls'}>{t('К настройке маршрута','Бағыт баптауларына')}</a><header className="site-header"><Brand/><div className="language-switch" role="group" aria-label={t('Язык интерфейса','Интерфейс тілі')}><button lang="kk-KZ" aria-pressed={locale==='kk'} onClick={()=>{speech.controller.stop();setLocale('kk');}}>Қазақша</button><button lang="ru-RU" aria-pressed={locale==='ru'} onClick={()=>{speech.controller.stop();setLocale('ru');}}>Русский</button></div>{!walking&&<a className="display-jump" href="#display-settings" onClick={event=>{event.preventDefault();setDisplayOpen(true);const section=document.getElementById('display-settings');section?.focus();section?.scrollIntoView({block:'start'});}}>{ru.display.entry}</a>}</header><main>{localeStorageWarning&&<p className="storage-note" role="status">{t("Выбранный язык работает в этой вкладке, но сохранить его в браузере не удалось.","Таңдалған тіл осы қойындыда жұмыс істейді, бірақ оны браузерде сақтау мүмкін болмады.")}</p>}
    {walking?<section id="walk-mode" ref={walkRef} className="walk-mode" tabIndex={-1} aria-label={t('Прохождение маршрута','Бағытпен жүру')}><div className="walk-header"><h1>{t('По маршруту','Бағыт бойымен')}</h1><button onClick={closeWalk}>{t('Вернуться к планировщику','Жоспарлаушыға оралу')}</button></div><p className="manual-note">{t('Переключайте шаги вручную. Приложение не определяет ваше положение.','Қадамдарды қолмен ауыстырыңыз. Қолданба сіздің орныңызды анықтамайды.')}</p><FloorPlan selectedNodeId={selectedRoom} building={building} result={result} floor={good&&selectedStep!==null?nodeMap.get(result.nodeIds[selectedStep]!)!.floor:scenario.floor} closedEdgeIds={scenario.closedEdgeIds} highlight={activeHighlight}/>{good?guidanceView(true):<p role="status">{t('Маршрут изменился. Вернитесь к выбору условий.','Бағыт өзгерді. Шарттарды таңдауға оралыңыз.')}</p>}</section>:<>
    <div className="intro"><h1>{t('Навигатор доступных маршрутов','Қолжетімді бағыттар навигаторы')}</h1><p className="intro-copy">{t('Выберите начало, цель и условия прохода.','Бастау нүктесін, мақсат пен өту шарттарын таңдаңыз.')}</p><p className="fiction-banner">{ru.fiction}. {t('Это не данные обследования реального здания.','Бұл нақты ғимаратты тексеру деректері емес.')}</p></div>
    {linkInitial.status==='invalid'&&<p role="alert" className="link-warning">{t('Ссылка содержит неверные или неподдерживаемые параметры. Они не применены; проверьте условия ниже.','Сілтемеде қате немесе қолдау көрсетілмейтін параметрлер бар. Олар қолданылмады; төмендегі шарттарды тексеріңіз.')}</p>}{linkInitial.status==='ok'&&<p className="link-info">{t('Открыт маршрут из ссылки. Расчёт выполнен заново; локальные закрытия не перенесены.','Сілтемедегі бағыт ашылды. Бағыт қайта есептелді; жергілікті жабылулар тасымалданбады.')}</p>}
    <div className="workspace">{desktop?<><div className="control-stack">{endpointsPanel}{requirementsPanel}{!wideWorkspace&&directionsPanel}{closuresPanel}</div><div className="model-stack">{visualPanel}{displayPanel}</div>{wideWorkspace?<div className="route-stack">{directionsPanel}{outcomePanel}</div>:outcomePanel}</>:<>{endpointsPanel}{visualPanel}{outcomePanel}{directionsPanel}{requirementsPanel}{closuresPanel}</>}</div>{!desktop&&displayPanel}
    </>}<div hidden={walking}><ReportJournal/></div><footer><span>ITER / {t('учебный прототип','оқу прототипі')}</span><span>{t('Условия меняют путь. Ракурс — только изображение.','Шарттар жолды өзгертеді. Көру бұрышы тек көрініске әсер етеді.')}</span></footer></main></>;
}
export default function App() {
  const {locale,ru}=useI18n();
  return checkedBuilding.valid?<Planner building={checkedBuilding.value}/>:<main><h1>{locale==='kk'?'Модель жүктелмеді':'Модель не загружена'}</h1><p role="alert">{locale==='kk'?'Оқу моделінің деректерін тексеру қажет.':'Требуется проверка данных учебной модели.'}</p><p>{ru.fiction}</p></main>;
}

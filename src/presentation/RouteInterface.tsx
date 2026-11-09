import { useState } from 'react';
import { FloorPlan } from '../components/FloorPlan';
import { RouteGuidance } from '../components/RouteGuidance';
import { useI18n } from '../i18n/locale';
import { useLocalSpeech } from '../ui/speech';
import { presentationBuilding as building, route204, navigatorLink } from './runtime';
import type { PresentationLanguage } from './content';

/** Live application map component and actual route nodes, not a nested phone screenshot. */
export function RouteInterface({ lang, selected, onSelect }: { lang: PresentationLanguage; selected: number | null; onSelect(index: number | null): void }) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const speech = useLocalSpeech();
  const { stepTextRu } = useI18n();
  const t = (ru: string, kk: string) => lang === 'kk' ? kk : ru;
  if (route204.status !== 'ok') return null;
  const route = route204;
  const node = building.nodes.find(node => node.id === route.nodeIds[selected ?? 0])!;
  const edgeId = selected === null ? undefined : route204.edgeIds[selected];
  return <div className="pres-route-interface" data-testid="presentation-live-interface">
    <div className="pres-interface-heading"><b>ITER</b><span>{t('Маршрут 204 · 40 м', '204 маршруты · 40 м')}</span></div>
    <FloorPlan building={building} result={route204} floor={node.floor} closedEdgeIds={[]} highlight={selected === null ? null : { nodeId: node.id, edgeId }} />
    <RouteGuidance building={building} result={route} compact selected={selected} onSelect={onSelect} speechStatus={speech.status} onReadStep={() => { if (selected !== null) { speech.controller.setEnabled(true); speech.controller.read([stepTextRu(building, route, selected)]); } }} onStop={speech.controller.stop} expandedStepIds={expanded} onToggleEvidence={id => setExpanded(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])} />
    <a href={navigatorLink()}>{t('Открыть полный навигатор', 'Толық навигаторды ашу')} ↗</a>
  </div>;
}

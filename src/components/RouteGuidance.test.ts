import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import fixture from '../data/building.json';
import { validateBuilding } from '../domain/validation';
import { RouteVariants } from './RouteGuidance';
import type { UsableRoute } from '../domain/alternatives';
const checked=validateBuilding(fixture);
if(!checked.valid) throw new Error('Invalid test fixture');
const building=checked.value;
const ground=building.nodes.filter(node=>node.floor===0);
const upper=building.nodes.find(node=>node.floor===1)!;
const render=(nodeIds:string[])=>renderToStaticMarkup(createElement(RouteVariants,{building,routes:[{status:'ok',nodeIds,edgeIds:['display-edge-a','display-edge-b'],distanceM:20,uncertainEdgeIds:[]} as UsableRoute],selected:0,onSelect:()=>{},expanded:true,onExpandedChange:()=>{}}));
describe('single route explanation',()=>{
  test('explains an extra-floor detour even when no alternatives exist',()=>{
    const html=render([ground[0]!.id,upper.id,ground[1]!.id]);
    expect(html).toContain('через дополнительный этаж');expect(html).toContain('Ограничения не ослаблены');
  });
  test('does not describe ordinary ascent as an extra-floor detour',()=>{
    expect(render([ground[0]!.id,ground[1]!.id,upper.id])).not.toContain('detour-note');
  });
});

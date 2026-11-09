import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';

// Read-only fixture boundary: these tests must never send public backend writes.
test.beforeEach(async ({context,baseURL}) => {
 await context.route('**/*', route => {
  const request=route.request(); const url=new URL(request.url());
  if (!['GET','HEAD'].includes(request.method()) || url.origin!==new URL(baseURL!).origin) return route.abort();
  if(url.pathname.startsWith('/api/')) return route.fulfill({json:{status:'ok',mode:'public-demo',reports:[],items:[]}});
  return route.continue();
 });
});
async function settled(page:Page) {
 await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true',{timeout:15000});
}
async function startVisibilityProbe(page:Page, selectors:string[]) {
 await page.evaluate(selectors => {
  const state={running:true,samples:[] as unknown[]};
  (window as unknown as {compositionProbe:typeof state}).compositionProbe=state;
  const frame=()=>{
   state.samples.push({time:performance.now(),elements:selectors.map(selector=>{
    const element=document.querySelector<HTMLElement>(selector);
    if(!element)return {selector,visible:false,opacity:0};
    let opacity=1,visible=true;const ancestors=[];
    for(let node:HTMLElement|null=element;node;node=node.parentElement){const style=getComputedStyle(node);opacity*=Number(style.opacity);visible &&=style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse';ancestors.push({tag:node.tagName,classes:node.className,opacity:style.opacity});}
    const rect=element.getBoundingClientRect();visible &&=rect.width>0&&rect.height>0&&rect.top>=0&&rect.bottom<=innerHeight&&rect.left>=0&&rect.right<=innerWidth;
    return {selector,visible,opacity,rect:rect.toJSON(),ancestors:(state.samples.length===0||!visible||opacity<0.98)?ancestors:undefined};
   })});
   if(state.running) requestAnimationFrame(frame);
  };frame();
 },selectors);
}
async function endVisibilityProbe(page:Page,info:TestInfo,name:string){
 const samples=await page.evaluate(()=>{const state=(window as unknown as {compositionProbe:{running:boolean,samples:{time:number,elements:{selector:string,visible:boolean,opacity:number}[]}[]}}).compositionProbe;state.running=false;return state.samples;});
 writeFileSync(info.outputPath(`${name}-visibility.json`),JSON.stringify(samples,null,2));
 expect(samples.length).toBeGreaterThan(5);
 const failures=samples.flatMap(s=>s.elements.filter(e=>!e.visible||e.opacity<0.98).map(e=>({time:s.time,...e})));
 expect(failures, 'Heading and controls must remain visible, including all parent opacity').toEqual([]);
}
async function frames(page:Page,info:TestInfo,label:string){
 const start=Date.now();const evidence=[];
 for(const target of [0,100,250,450,700,1000,1400,1900]){
  await page.waitForTimeout(Math.max(0,target-(Date.now()-start)));
  const geometry=await page.evaluate(()=>({time:performance.now(),scene:document.querySelector<HTMLElement>('[data-testid=presentation-scene]')?.dataset.scene,settled:document.querySelector<HTMLElement>('[data-testid=presentation-root]')?.dataset.settled,diorama:document.querySelector<HTMLElement>('.pres-model .diorama')?.dataset,rects:[...document.querySelectorAll<HTMLElement>('.pres-model,.pres-copy,.pres-doors,.pres-pipeline,.pres-phone-figure,.pres-route-interface,.pres-condition-explanation')].map(e=>({class:e.className,rect:e.getBoundingClientRect().toJSON(),opacity:getComputedStyle(e).opacity}))}));
  evidence.push({targetMs:target,actualElapsedMs:Date.now()-start,...geometry});
  await page.screenshot({path:info.outputPath(`${label}-${target}.png`)});
 }
 writeFileSync(info.outputPath(`${label}-geometry.json`),JSON.stringify({warning:'DEV director bounds are current only when directorBoundsFrame matches renderCount. Anchor bounds describe accent rings, not whole doors. Canvas rectangles alone do not prove silhouette intersection; rendered PNG review is mandatory.',evidence},null,2));
}
for(const [width,height] of [[375,667],[390,844],[1366,768],[1536,864]])for(const lang of ['ru','kk']){
 test(`persistent controls ${width} ${lang}`,async({page},info)=>{
  await page.setViewportSize({width,height});await page.goto(`/presentation?scene=route&lang=${lang}`);await settled(page);
  await startVisibilityProbe(page,['.pres-copy h1','[data-testid=condition-0]','[data-testid=condition-1]','[data-testid=condition-2]']);
  for(const condition of [1,2,0]){await page.getByTestId(`condition-${condition}`).click();await frames(page,info,`condition-${condition}`);await settled(page);}
  await page.getByTestId('condition-1').click();await page.waitForTimeout(130);await page.getByTestId('condition-2').click();await page.waitForTimeout(90);await page.getByTestId('condition-0').click();await settled(page);
  await endVisibilityProbe(page,info,'conditions');
  await page.goto(`/presentation?scene=detour&lang=${lang}`);await settled(page);
  const result=page.getByTestId('presentation-detour-result'),toggle=page.getByTestId('presentation-lift-toggle');
  await expect(result).toHaveAttribute('data-distance','40');
  await startVisibilityProbe(page,['.pres-copy h1','[data-testid=presentation-lift-toggle]']);
  await toggle.click();await frames(page,info,'close-A');await expect(result).toHaveAttribute('data-distance','54',{timeout:15000});await expect(page.locator('.pres-model .diorama')).toHaveAttribute('data-route-ids',/lift-b/);await page.waitForTimeout(2000);
  await toggle.click();await expect(result).toHaveAttribute('data-distance','40');await toggle.click();await page.waitForTimeout(120);await toggle.click();await expect(result).toHaveAttribute('data-distance','40');await settled(page);
  await endVisibilityProbe(page,info,'detour');
 });
 test(`intermediate scenes five to eight ${width} ${lang}`,async({page},info)=>{
  await page.setViewportSize({width,height});await page.goto(`/presentation?scene=detour&lang=${lang}`);await settled(page);
  for(const scene of ['uncertainty','mobile','system']){await page.keyboard.press('ArrowRight');await frames(page,info,`forward-${scene}`);await settled(page);}
  for(const scene of ['mobile','uncertainty','detour']){await page.keyboard.press('ArrowLeft');await frames(page,info,`reverse-${scene}`);await settled(page);}
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(140);await page.keyboard.press('ArrowLeft');await page.waitForTimeout(100);await page.keyboard.press('ArrowRight');await frames(page,info,'rapid-retarget');await settled(page);
  await expect(page.getByTestId('presentation-scene')).toHaveAttribute('data-scene','uncertainty');
 });
}


for(const target of ['mobile','system'])test(`secondary reveal survives reduced motion and language interruption ${target}`,async({page},info)=>{
 await page.goto(`/presentation?scene=${target==='mobile'?'uncertainty':'mobile'}&lang=ru`);await settled(page);
 await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByTestId('presentation-language-kk').click();await settled(page);
 const secondary=page.locator(target==='mobile'?'.pres-route-interface':'.pres-pipeline');
 await expect(secondary).toBeVisible();await expect(secondary).toHaveCSS('opacity','1');await expect(secondary).toHaveCSS('visibility','visible');
 await page.screenshot({path:info.outputPath('reduced-language-interrupt.png')});
 await page.emulateMedia({reducedMotion:'no-preference'});await page.keyboard.press('ArrowLeft');await page.waitForTimeout(100);await page.getByTestId('presentation-language-ru').click();await settled(page);
 await page.screenshot({path:info.outputPath('reverse-language-interrupt.png')});
});

for(const scene of ['route','detour'])test(`newly revealed control does not restart entrance ${scene}`,async({page},info)=>{
 await page.goto(`/presentation?scene=${scene==='route'?'barriers':'building'}&lang=ru`);await settled(page);
 await page.keyboard.press('ArrowRight');
 const selector=scene==='route'?'[data-testid=condition-1]':'[data-testid=presentation-lift-toggle]';
 await page.waitForFunction(selector=>{const e=document.querySelector<HTMLElement>(selector);if(!e)return false;let alpha=1;for(let n:HTMLElement|null=e;n;n=n.parentElement)alpha*=Number(getComputedStyle(n).opacity);return alpha>=.99&&getComputedStyle(e).visibility==='visible';},selector,{polling:'raf'});
 const pre=await page.getByTestId('presentation-root').getAttribute('data-settled');
 await info.attach('settled-at-first-visible-control',{body:String(pre),contentType:'text/plain'});
 await startVisibilityProbe(page,['.pres-copy h1',selector]);await page.locator(selector).click();await frames(page,info,'immediate-control');await settled(page);await endVisibilityProbe(page,info,'immediate-control');
});

for(const width of [1366,390])for(const scenario of ['conditions','chapters','detour',...(width===390?['intro']:[])])test(`delivery continuous ${scenario} ${width}`,async({page,browser},info)=>{
 test.skip(process.env.COMPOSITION_RECORD!=='1','Only after parent production GO, no parallel browsers');
 const started=Date.now();const events:{name:string,ms:number}[]=[];const mark=(name:string)=>events.push({name,ms:Date.now()-started});
 const lang=width===390?'kk':'ru';await page.setViewportSize({width,height:width===390?844:768});
 mark('before-navigation');
 await page.goto(`/presentation?scene=${scenario==='conditions'?'route':scenario==='chapters'?'detour':scenario==='detour'?'building':'intro'}&lang=${lang}`);
 if(scenario==='intro'){
  const film=page.getByTestId('presentation-intro-film');await expect(film).toBeVisible();mark('film-visible');await page.waitForTimeout(500);await page.screenshot({path:info.outputPath('intro-playing.png')});
  await expect(film).toHaveCount(0,{timeout:15000});await settled(page);mark('live-ready');await page.waitForTimeout(2000);await page.screenshot({path:info.outputPath('intro-live.png')});
 }else{
  await settled(page);await page.waitForTimeout(1200);mark('initial-ready');
  if(scenario==='conditions'){
   for(const c of [0,1,2]){await page.getByTestId(`condition-${c}`).click();mark(`condition-${c}`);await settled(page);await page.waitForTimeout(1800);}
   await page.getByTestId('condition-0').click();await page.waitForTimeout(150);await page.getByTestId('condition-2').click();mark('rapid-retarget');await settled(page);await page.waitForTimeout(2000);
  }else if(scenario==='chapters'){
   for(const scene of ['uncertainty','mobile','system']){await page.keyboard.press('ArrowRight');mark(scene);await settled(page);await page.waitForTimeout(2200);if(scene==='mobile'){await page.locator('[data-testid=step-review] .guidance-primary-actions button').nth(1).click();await settled(page);await page.waitForTimeout(1800);}}
   for(const stage of [1,2,3]){await page.locator('.pres-pipeline-step').nth(stage).click();mark(`graph-${stage}`);await settled(page);await page.waitForTimeout(1500);}
   await page.keyboard.press('ArrowLeft');await page.waitForTimeout(180);await page.keyboard.press('ArrowRight');mark('rapid-retarget');await settled(page);await page.waitForTimeout(2000);
  }else{
   await page.keyboard.press('ArrowRight');await settled(page);await expect(page.getByTestId('presentation-detour-result')).toHaveAttribute('data-distance','40');await page.waitForTimeout(1600);mark('40-complete');
   await page.getByTestId('presentation-lift-toggle').click();mark('close-A');await expect(page.getByTestId('presentation-detour-result')).toHaveAttribute('data-distance','54',{timeout:15000});await expect(page.locator('.diorama')).toHaveAttribute('data-route-ids',/lift-b/);await settled(page);mark('54-complete');await page.waitForTimeout(2200);await page.screenshot({path:info.outputPath('54-complete.png')});mark('54-held');
  }
 }
 mark('end');writeFileSync(info.outputPath('recording-sidecar.json'),JSON.stringify({browser:browser.version(),url:page.url(),startedUtc:new Date(started).toISOString(),viewport:page.viewportSize(),dpr:await page.evaluate(()=>devicePixelRatio),events,note:'Windows Chrome, mobile viewport emulation only. Continuous normal speed, no internal edits. Callback offsets are not exact encoded PTS. Intro source plays at app-selected 1.2x, recording itself remains 1x.'},null,2));
});




test('door205 room-side opening strict and allow focused viewports',async({page},info)=>{
 for(const [width,height,lang] of [[375,667,'ru'],[375,667,'kk'],[390,844,'kk'],[1366,768,'ru'],[1366,768,'kk']] as const){
  await page.setViewportSize({width,height});await page.goto(`/presentation?scene=uncertainty&lang=${lang}`);await settled(page);
  await expect(page.getByTestId('presentation-uncertainty-result')).toHaveAttribute('data-route-status','no-route');await expect(page.locator('[data-anchor=door-205]')).toBeVisible();
  await page.screenshot({path:info.outputPath(`door205-${width}-${lang}-strict.png`)});
  const crop=await page.locator('.pres-model .diorama').evaluate((e:HTMLElement)=>{const a=JSON.parse(e.dataset.directorAnchors||'[]').find((x:{id:string})=>x.id==='door-205');const r=e.getBoundingClientRect();return {x:Math.max(0,Math.min(innerWidth-200,r.x+a.x*r.width-100)),y:Math.max(0,Math.min(innerHeight-160,r.y+a.y*r.height-80)),width:200,height:160};});
  await page.screenshot({path:info.outputPath(`door205-${width}-${lang}-opening.png`),clip:crop});
  await page.getByTestId('presentation-unknown-toggle').click();await settled(page);await expect(page.getByTestId('presentation-uncertainty-result')).toHaveAttribute('data-route-status','ok');await expect(page.getByTestId('presentation-uncertainty-result')).toHaveAttribute('data-uncertain-edges','door-205');await expect(page.locator('[data-anchor=door-205]')).toBeVisible();
  await page.screenshot({path:info.outputPath(`door205-${width}-${lang}-allow.png`)});
 }
});

test('revised fallback door205 and graph posters RU KK',async({page},info)=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type.includes('webgl'))return null;return original.apply(this,[type,...args] as never);} as typeof original;});
 for(const [width,height] of [[375,667],[1366,768]])for(const lang of ['ru','kk'])for(const scene of ['uncertainty','system']){
  await page.setViewportSize({width,height});
  await page.goto(`/presentation?scene=${scene}&lang=${lang}`);await expect(page.getByTestId('presentation-fallback')).toBeVisible();await settled(page);
  const expected=scene==='uncertainty'?'door205-focus':'graph-filtered-route';const img=page.getByTestId('presentation-model').locator('img');await expect(img).toHaveAttribute('src',new RegExp(`${expected}${lang==='kk'?'-kk':''}\\.webp`));
  await expect.poll(()=>img.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true);
  await page.screenshot({path:info.outputPath(`fallback-${width}-${scene}-${lang}.png`)});
  if(scene==='uncertainty'){await page.getByTestId('presentation-unknown-toggle').click();await settled(page);await expect(page.getByTestId('presentation-uncertainty-result')).toHaveAttribute('data-route-status','ok');}
 }
});

test('fresh compact skip reduced initial placement',async({page},info)=>{
 for(const mode of ['skip','reduce']){
  await page.setViewportSize(mode==='skip'?{width:375,height:667}:{width:390,height:844});await page.emulateMedia({reducedMotion:mode==='reduce'?'reduce':'no-preference'});
  await page.addInitScript(()=>{const state={frames:[] as {t:number,gap:number}[],running:true};(window as unknown as {initialPlacement:typeof state}).initialPlacement=state;const start=performance.now();const sample=()=>{const h=document.querySelector<HTMLElement>('.pres-model'),c=document.querySelector<HTMLElement>('.pres-slide .pres-copy-column');if(h&&c&&h.querySelector('canvas,video')){const hs=getComputedStyle(h);if(hs.visibility!=='hidden'&&Number(hs.opacity)>0)state.frames.push({t:performance.now(),gap:h.getBoundingClientRect().top-c.getBoundingClientRect().bottom});}if(performance.now()-start<4500)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  await page.goto(`/presentation?scene=intro&lang=${mode==='skip'?'ru':'kk'}`);if(mode==='skip'){await expect(page.getByTestId('presentation-intro-film')).toBeVisible();await page.keyboard.press('Escape');}await settled(page);await page.waitForTimeout(1500);
  const data=await page.evaluate(()=>(window as unknown as {initialPlacement:{frames:{t:number,gap:number}[]}}).initialPlacement.frames);writeFileSync(info.outputPath(`first-visible-${mode}.json`),JSON.stringify(data,null,2));expect(data.length).toBeGreaterThan(0);expect(Math.min(...data.map(x=>x.gap))).toBeGreaterThanOrEqual(-1);await page.screenshot({path:info.outputPath(`first-visible-${mode}.png`)});
 }
});

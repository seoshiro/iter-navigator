import {test,expect} from '@playwright/test';
test.beforeEach(async({context,baseURL})=>{
 await context.route('**/*',r=>{
  const q=r.request();
  if(!['GET','HEAD'].includes(q.method())||new URL(q.url()).origin!==new URL(baseURL!).origin)return r.abort();
  if(new URL(q.url()).pathname.startsWith('/api/'))return r.fulfill({json:{status:'ok',mode:'public-demo',reports:[],items:[]}});
  return r.continue();
 });
});
test('continuous first slice - separate opt-in recording',async({page})=>{
 test.skip(process.env.MOTION_RECORD!=='1','Requires parent go signal and actual asset');
 await page.goto('/presentation?scene=intro');
 const film=page.getByTestId('presentation-intro-film');
 await expect(film).toBeVisible();
 await expect(film.locator('video')).toHaveJSProperty('paused',false);
 await expect(film).toHaveCount(0,{timeout:12000});
 await page.waitForTimeout(1200);
 for(let i=0;i<3;i++){await page.keyboard.press('ArrowRight');await page.waitForTimeout(3200);if(i===1){for(let condition=0;condition<3;condition++){await page.getByTestId('condition-'+condition).click();await page.waitForTimeout(1800);}}}
 await page.waitForTimeout(1500);
});
test('persistent canvas and real intermediate pose',async({page},info)=>{
 await page.goto('/presentation?scene=intro');
 const model=page.getByTestId('presentation-model');
 await expect(model).toHaveAttribute('data-ready','true');
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true');
 await model.locator('canvas').evaluate(e=>e.setAttribute('data-qa-original','true'));
 const start=Number(await model.getAttribute('data-yaw'));
 await page.keyboard.press('ArrowRight');
 const samples=await page.evaluate(async()=>{
  const samples=[];const start=performance.now();
  while(performance.now()-start<1800){const m=document.querySelector<HTMLElement>('[data-testid="presentation-model"]')!;samples.push({t:performance.now()-start,yaw:Number(m.dataset.yaw),route:Number(m.dataset.routeProgress),persistent:!!m.querySelector('canvas[data-qa-original]')});await new Promise(requestAnimationFrame);}
  return samples;
 });
 const end=Number(await model.getAttribute('data-yaw'));
 await info.attach('pose-samples',{body:JSON.stringify(samples),contentType:'application/json'});
 expect(Math.abs(end-start)).toBeGreaterThan(60);
 expect(samples.some(s=>s.yaw!==start&&s.yaw!==end)).toBe(true);
 expect(samples.every(s=>s.persistent)).toBe(true);
});
for(const size of [{width:1366,height:768},{width:1536,height:864},{width:375,height:667},{width:390,height:844}])for(const lang of ['ru','kk'])test(`first scenes ${size.width} ${lang}`,async({page},info)=>{
 await page.setViewportSize(size);await page.goto(`/presentation?scene=intro&lang=${lang}`);
 await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready','true');await page.keyboard.press('Escape');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(let i=0;i<4;i++){
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true',{timeout:15000});
  for(const img of await page.locator('img').filter({visible:true}).all()) await expect.poll(()=>img.evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBeGreaterThan(0);await page.screenshot({path:info.outputPath(`scene-${i}.png`)});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(i<3){await page.keyboard.press('ArrowRight');await page.waitForTimeout(300);await page.screenshot({path:info.outputPath(`intermediate-${i}.png`)});}
 }
 await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-route-progress','1');
 await page.keyboard.press('ArrowLeft');await page.waitForTimeout(150);await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');
 await expect(page.getByTestId('presentation-scene')).toHaveAttribute('data-scene','route');
 await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true',{timeout:15000});
 await page.goBack();await expect(page.getByTestId('presentation-scene')).toHaveAttribute('data-scene','building');
 expect(errors).toEqual([]);
});
test('render pose route progression and interruption continuity',async({page},info)=>{
 await page.goto('/presentation?scene=route');await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready','true');
 await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true');
 await page.keyboard.press('ArrowRight');
 const samples=await page.evaluate(async()=>{const out=[];const start=performance.now();while(performance.now()-start<2600){const d=document.querySelector<HTMLElement>('.pres-model .diorama')!;out.push({t:performance.now()-start,pose:JSON.parse(d.dataset.directorPose||'{}'),host:Number(document.querySelector<HTMLElement>('.pres-model')!.dataset.routeProgress)});await new Promise(requestAnimationFrame);}return out;});
 await info.attach('render-pose-samples',{body:JSON.stringify(samples),contentType:'application/json'});
 expect(samples.some(s=>s.pose.routeProgress>0&&s.pose.routeProgress<1)).toBe(true);
 expect(samples.some(s=>s.pose.spread>0&&s.pose.spread<1)).toBe(true);
 expect(samples.every(s=>Math.abs(s.pose.routeProgress-s.host)<.15)).toBe(true);
 await page.keyboard.press('ArrowLeft');await page.waitForTimeout(200);
 const before=JSON.parse((await page.locator('.pres-model .diorama').getAttribute('data-director-pose'))!);
 await page.keyboard.press('ArrowRight');
 const after=JSON.parse((await page.locator('.pres-model .diorama').getAttribute('data-director-pose'))!);
 expect(Math.abs(after.yaw-before.yaw)).toBeLessThan(15);
 await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true');
});
test('accepted Kling source and skip button no replay',async({page})=>{
 await page.goto('/presentation?scene=intro');
 const film=page.getByTestId('presentation-intro-film');await expect(film).toBeVisible();
 await expect(film.locator('video')).toHaveAttribute('src','/presentation/media/intro-kling.mp4');
 await film.locator('button').click();await expect(film).toHaveCount(0);
 await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');await expect(film).toHaveCount(0);
});
test('intro Escape early-next reduced and unavailable media',async({page})=>{
 await page.goto('/presentation?scene=intro');await expect(page.getByTestId('presentation-intro-film')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0);
 await page.reload();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.route('**/intro-kling.mp4',r=>r.abort());await page.reload();
 await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0,{timeout:6000});await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready','true');
});
test('condition choices expose correct anchors and secondary form',async({page})=>{
 await page.goto('/presentation?scene=route');await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready','true');
 for(const [i,anchor] of ['stairs-0','door-204','lift-a-0'].entries()){
  await page.getByTestId(`condition-${i}`).click();await expect(page.getByTestId(`condition-${i}`)).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.pres-object-annotations span')).toHaveAttribute('data-anchor',anchor);
 }
 await page.getByTestId('condition-1').click();await expect(page.locator('.pres-condition-explanation')).toContainText('105');
 await expect(page.getByTestId('presentation-route-result')).toHaveCount(0);
});

test('rendered endpoint handoff and hidden media',async({page},info)=>{
 await page.goto('/presentation?scene=intro');
 const video=page.getByTestId('presentation-intro-film').locator('video');
 await expect(video).toHaveJSProperty('paused',false);
 await video.evaluate(async(v:HTMLVideoElement)=>{v.pause();await new Promise<void>(resolve=>{v.addEventListener('seeked',()=>resolve(),{once:true});v.currentTime=v.duration-.06;});});
 await page.screenshot({path:info.outputPath('clip-end-rendered.png')});
 await page.keyboard.press('Escape');await page.waitForTimeout(350);
 await page.screenshot({path:info.outputPath('live-start-rendered.png')});
 await page.reload();await expect(video).toHaveJSProperty('paused',false);
 const paused=await video.evaluate((v:HTMLVideoElement)=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));return v.paused;});
 expect(paused).toBe(true);
});
test('isolated RAF interval telemetry',async({page,browser},info)=>{
 await page.goto('/presentation?scene=intro');await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready','true');await page.keyboard.press('Escape');
 await page.keyboard.press('ArrowRight');
 const stats=await page.evaluate(async()=>{const d=document.querySelector<HTMLElement>('.pres-model .diorama')!;const canvas=d.querySelector('canvas')!;const gl=canvas.getContext('webgl2');const ext=gl?.getExtension('WEBGL_debug_renderer_info');const start=Number(d.dataset.renderCount);const times:number[]=[];const frames:{t:number,interval:number,settled:string|undefined,scene:string|undefined,counter:number}[]=[];let prev=performance.now();const end=prev+2200;while(performance.now()<end){await new Promise(requestAnimationFrame);const now=performance.now();times.push(now-prev);frames.push({t:now,interval:now-prev,settled:document.querySelector<HTMLElement>('[data-testid=presentation-root]')?.dataset.settled,scene:document.querySelector<HTMLElement>('[data-testid=presentation-scene]')?.dataset.scene,counter:Number(d.dataset.renderCount)});prev=now;}return {times,frames,renderDelta:Number(d.dataset.renderCount)-start,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],renderer:ext&&gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL),vendor:ext&&gl?.getParameter(ext.UNMASKED_VENDOR_WEBGL)};});
 await info.attach('raf-telemetry',{body:JSON.stringify({browser:browser.version(),platform:'Windows desktop; viewport emulation, not mobile hardware',...stats}),contentType:'application/json'});
 const {writeFileSync}=await import('node:fs');writeFileSync(info.outputPath('raf-timing.json'),JSON.stringify({browser:browser.version(),...stats},null,2));
});
for(const [width,height] of [[375,667],[390,844],[1366,768],[1536,864]])for(const lang of ['ru','kk'])test(`final matrix ${width} ${lang}`,async({page},info)=>{
 await page.setViewportSize({width,height});await page.goto(`/presentation?scene=intro&lang=${lang}`);await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready','true');await page.keyboard.press('Escape');
 for(let i=0;i<10;i++){
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true',{timeout:15000});for(const img of await page.locator('img').filter({visible:true}).all()) await expect.poll(()=>img.evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBeGreaterThan(0);await page.screenshot({path:info.outputPath(`scene-${i}.png`)});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(i===9){await expect(page.locator('.pres-qr img')).toBeVisible();expect(await page.locator('.pres-qr img').evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBeGreaterThan(0);}else await page.getByTestId('presentation-next').click();
 }
});
test('final detour toggles and reverse never retain stale route',async({page})=>{
 await page.goto('/presentation?scene=detour');const result=page.getByTestId('presentation-detour-result');const toggle=page.getByTestId('presentation-lift-toggle');const d=page.locator('.pres-model .diorama');
 await expect(result).toHaveAttribute('data-distance','40');await expect(d).toHaveAttribute('data-route-ids',/lift-a/);
 await toggle.click();await expect(result).toHaveAttribute('data-distance','54');await expect(d).toHaveAttribute('data-route-ids',/lift-b/);
 await toggle.click();await toggle.click();await toggle.click();await expect(result).toHaveAttribute('data-distance','40');await expect(d).toHaveAttribute('data-route-ids',/lift-a/);
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowRight');await expect(result).toHaveAttribute('data-distance','40');await expect(d).toHaveAttribute('data-route-ids',/lift-a/);
});
for(const width of [1366,390])test(`final continuous chain ${width}`,async({page,browser},info)=>{
 test.skip(process.env.MOTION_FULL_RECORD!=='1','Separate explicit full-chain recording');
 const {writeFileSync}=await import('node:fs');const started=Date.now();const events:{event:string,elapsedMs:number}[]=[];const stamp=(event:string)=>events.push({event,elapsedMs:Date.now()-started});stamp('before-navigation');
 await page.setViewportSize({width,height:width===390?844:768});await page.goto(`/presentation?scene=intro&lang=${width===390?'kk':'ru'}`);await expect(page.getByTestId('presentation-intro-film')).toBeVisible();stamp('intro-visible');await expect.poll(()=>page.locator('.pres-intro-film video').evaluate((v:HTMLVideoElement)=>v.duration)).toBeGreaterThan(0);const mediaDuration=await page.locator('.pres-intro-film video').evaluate((v:HTMLVideoElement)=>v.duration);await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0,{timeout:15000});stamp('intro-ended-live');await page.waitForTimeout(1500);await page.screenshot({path:info.outputPath('delivery-intro-'+width+'.png')});
 for(let i=1;i<10;i++){stamp('next-'+i);await page.getByTestId('presentation-next').click();await page.waitForTimeout(2600);if(i===2)for(let c=0;c<3;c++){await page.getByTestId('condition-'+c).click();await page.waitForTimeout(1500);}if(i===3){await page.keyboard.press('ArrowLeft');await page.waitForTimeout(220);await page.keyboard.press('ArrowRight');await page.waitForTimeout(2400);}if(i===4){await page.getByTestId('presentation-lift-toggle').click();await page.waitForTimeout(2400);}if([4,6,8].includes(i))await page.screenshot({path:info.outputPath(`delivery-${width}-${i}.png`)});}
 await page.waitForTimeout(2000);stamp('finish-hold-ended');const gpu=await page.locator('.pres-model canvas').evaluate((c:HTMLCanvasElement)=>{const gl=c.getContext('webgl2');const ext=gl?.getExtension('WEBGL_debug_renderer_info');return {dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],renderer:ext&&gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL),vendor:ext&&gl?.getParameter(ext.UNMASKED_VENDOR_WEBGL)};});writeFileSync(info.outputPath('recording-sidecar.json'),JSON.stringify({browser:browser.version(),testStartedUtc:new Date(started).toISOString(),note:'Page video recording may start before test callback; offsets are from callback, not exact encoded PTS. Ordinary speed, no internal cuts. Windows desktop viewport emulation.',mediaDuration,events,...gpu},null,2));
});
test('isolated render counter interval telemetry',async({page,browser},info)=>{
 const {writeFileSync}=await import('node:fs');
 await page.goto('/presentation?scene=intro');await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready','true');await page.keyboard.press('Escape');
 await page.evaluate(()=>{const d=document.querySelector<HTMLElement>('.pres-model .diorama')!;const w=window as unknown as {renderEvents:{t:number,count:number}[],observer:MutationObserver};w.renderEvents=[];w.observer=new MutationObserver(()=>w.renderEvents.push({t:performance.now(),count:Number(d.dataset.renderCount),settled:document.querySelector<HTMLElement>('[data-testid=presentation-root]')?.dataset.settled,scene:document.querySelector<HTMLElement>('[data-testid=presentation-scene]')?.dataset.scene}));w.observer.observe(d,{attributes:true,attributeFilter:['data-render-count']});});
 await page.keyboard.press('ArrowRight');await page.waitForTimeout(2000);
 const data=await page.evaluate(()=>{const w=window as unknown as {renderEvents:{t:number,count:number}[],observer:MutationObserver};w.observer.disconnect();const gl=document.querySelector<HTMLCanvasElement>('.pres-model canvas')!.getContext('webgl2');const ext=gl?.getExtension('WEBGL_debug_renderer_info');return {events:w.renderEvents,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],renderer:ext&&gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL),vendor:ext&&gl?.getParameter(ext.UNMASKED_VENDOR_WEBGL)};});
 writeFileSync(info.outputPath('render-counter-timing.json'),JSON.stringify({browser:browser.version(),platform:'Windows desktop; renderCount mutation timing, not GPU timings or physical mobile',...data},null,2));
});


test('diagnostic bounds readiness and fallback',async({browser},info)=>{
 const {writeFileSync}=await import('node:fs');const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const events:unknown[]=[];page.on('pageerror',e=>events.push({error:e.message}));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')events.push({type:m.type(),text:m.text()});});
 await page.goto('http://127.0.0.1:5380/presentation?scene=intro&lang=kk');
 const readiness=[];for(let i=0;i<16;i++){readiness.push(await page.evaluate(()=>({t:performance.now(),ready:document.querySelector('.pres-model')?.getAttribute('data-ready'),fallback:!!document.querySelector('[data-testid=presentation-fallback]'),diorama:document.querySelector<HTMLElement>('.diorama')?.dataset})));await page.waitForTimeout(500);}
 await page.keyboard.press('Escape');const bounds=[];
 for(const size of [{width:390,height:844},{width:375,height:667},{width:1366,height:768},{width:1536,height:864}])for(const scene of ['building','detour']){await page.setViewportSize(size);await page.goto(`http://127.0.0.1:5380/presentation?scene=${scene}`);await page.waitForTimeout(2500);bounds.push({size,scene,...await page.locator('.diorama').evaluate((e:HTMLElement)=>({bounds:e.dataset.modelScreenBounds,route:e.dataset.routeScreenBounds,pose:e.dataset.directorPose}))});await page.screenshot({path:info.outputPath(`bounds-${size.width}-${scene}.png`)});}
 writeFileSync(info.outputPath('diagnostic.json'),JSON.stringify({events,readiness,bounds},null,2));console.log(JSON.stringify({events,bounds}));await context.close();
 const fallback=await browser.newContext();await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type.includes('webgl'))return null;return original.apply(this,[type,...args] as never);} as typeof original;});const p=await fallback.newPage();await p.goto('http://127.0.0.1:5380/presentation?scene=intro');await p.waitForTimeout(2000);await p.keyboard.press('Escape');await p.keyboard.press('ArrowRight');await p.waitForTimeout(2000);console.log('FALLBACK_SETTLED',await p.getByTestId('presentation-root').getAttribute('data-settled'));await p.screenshot({path:info.outputPath('fallback-next.png')});await fallback.close();
});


test('fallback next settles with unavailable WebGL',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type.includes('webgl'))return null;return original.apply(this,[type,...args] as never);} as typeof original;});
 await page.goto('/presentation?scene=intro');await expect(page.getByTestId('presentation-fallback')).toBeVisible();await page.keyboard.press('Escape');await page.getByTestId('presentation-next').click();
 await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true',{timeout:10000});await expect(page.getByTestId('presentation-scene')).toHaveAttribute('data-scene','barriers');
});
test('phase poses visibly distinct and context loss settles',async({page},info)=>{
 await page.goto('/presentation?scene=building');await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready','true');
 const poses=[];for(const i of [0,2,3,4]){await page.locator('.pres-model-phases button').nth(i).click();await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true');poses.push(await page.locator('.diorama').getAttribute('data-director-pose'));await page.screenshot({path:info.outputPath(`phase-${i}.png`)});}
 expect(new Set(poses).size).toBe(4);
 const lost=await page.locator('.diorama canvas').evaluate((c:HTMLCanvasElement)=>{const gl=c.getContext('webgl2');const ext=gl?.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});expect(lost).toBe(true);
 await page.waitForTimeout(300);await page.keyboard.press('ArrowRight');await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true',{timeout:10000});
});

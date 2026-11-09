/* eslint-disable @typescript-eslint/no-explicit-any -- Serialized browser diagnostic snapshots intentionally retain evolving renderer fields. */
import {test,expect,type Page,type TestInfo} from '@playwright/test';
import {writeFileSync} from 'node:fs';

test.beforeEach(async({context,baseURL})=>{await context.route('**/*',r=>{const q=r.request(),u=new URL(q.url());if(!['GET','HEAD'].includes(q.method())||u.origin!==new URL(baseURL!).origin)return r.abort();if(u.pathname.startsWith('/api/'))return r.fulfill({json:{status:'ok',mode:'public-demo',reports:[],items:[]}});return r.continue();});});
const settled=async(p:Page)=>expect(p.getByTestId('presentation-root')).toHaveAttribute('data-settled','true',{timeout:15000});
async function installProbe(page:Page){await page.evaluate(()=>{
 const w=window as any;w.continuity={samples:[],events:[],running:true};
 const rgba=(s:string)=>{const a=s.match(/[\d.]+/g)?.map(Number)||[0,0,0];return [a[0],a[1],a[2],a[3]??1];};
 const composite=(a:number[],b:number[])=>[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])).concat(1);
 const lum=(a:number[])=>a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
 w.continuitySample=()=>{const d=document.querySelector<HTMLElement>('.pres-model .diorama'),host=document.querySelector<HTMLElement>('.pres-model');if(!d||!host)return null;const r=d.getBoundingClientRect(),b=JSON.parse(d.dataset.modelScreenBounds||'null'),cam=JSON.parse(d.dataset.directorCamera||'null');
 const controls=[...document.querySelectorAll<HTMLElement>('.pres-copy h1,.pres-condition-actions button,.pres-condition-actions button span,.pres-unknown-actions button,.pres-header button,.pres-controls button')].filter(e=>e.textContent?.trim()).map(e=>{const style=getComputedStyle(e);const chain:HTMLElement[]=[];for(let n:HTMLElement|null=e;n;n=n.parentElement)chain.unshift(n);let bg=[255,255,255,1],opacity=1,visible=true;for(const n of chain){const s=getComputedStyle(n);bg=composite(rgba(s.backgroundColor),bg);opacity*=Number(s.opacity);visible&&=s.display!=='none'&&s.visibility!=='hidden';}visible &&= e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0;const foreground=rgba(style.color);foreground[3]*=opacity;const fg=composite(foreground,bg);const a=lum(fg),b=lum(bg);return {required:e.matches('.pres-condition-actions button,.pres-copy h1'),tag:e.tagName,text:e.textContent?.trim(),color:style.color,fg,bg,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),opacity,visible};});
 const out={t:performance.now(),scene:document.querySelector<HTMLElement>('[data-testid=presentation-scene]')?.dataset.scene,settled:document.querySelector<HTMLElement>('[data-testid=presentation-root]')?.dataset.settled,host:host.getBoundingClientRect().toJSON(),rect:r.toJSON(),render:Number(d.dataset.renderCount),boundsFrame:Number(d.dataset.directorBoundsFrame),camera:cam,pose:JSON.parse(d.dataset.directorPose||'{}'),bounds:b,projected:b?{x:r.x+(b.minX+1)*r.width/2,y:r.y+(1-b.maxY)*r.height/2,width:(b.maxX-b.minX)*r.width/2,height:(b.maxY-b.minY)*r.height/2}:null,secondary:[...document.querySelectorAll<HTMLElement>('.pres-route-interface,.pres-pipeline-step,.pres-system-aside > *, .pres-copy-column > *')].map(e=>({class:e.className,ready:e.dataset.compositionReady,text:e.textContent?.slice(0,80),opacity:Number(getComputedStyle(e).opacity),visibility:getComputedStyle(e).visibility,rect:e.getBoundingClientRect().toJSON()})),controls};w.continuity.samples.push(out);return out;};
 const tick=()=>{w.continuitySample();if(w.continuity.running)requestAnimationFrame(tick);};requestAnimationFrame(tick);
});}
async function key(page:Page,key:string){await page.evaluate(key=>{const w=window as any;const before=w.continuitySample();w.continuity.events.push({t:performance.now(),key,before});window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));queueMicrotask(()=>w.continuitySample());},key);}
async function save(page:Page,info:TestInfo,name:string){const data=await page.evaluate(()=>{const w=window as any;w.continuity.running=false;return w.continuity;});writeFileSync(info.outputPath(name+'.json'),JSON.stringify(data,null,2));return data;}
for(const [width,height] of [[375,667],[390,844],[1366,768],[1536,864]])for(const lang of ['ru','kk'])test(`render continuity ${width} ${lang}`,async({page},info)=>{
 await page.setViewportSize({width,height});await page.goto(`/presentation?scene=uncertainty&lang=${lang}`);await settled(page);await installProbe(page);
 for(const [i,k] of ['ArrowRight','ArrowRight','ArrowLeft','ArrowLeft'].entries()){await key(page,k);await page.waitForTimeout(220);await page.screenshot({path:info.outputPath(`transition-${i}-220ms.png`)});await settled(page);}
 for(const k of ['ArrowRight','ArrowRight','ArrowLeft','ArrowLeft','ArrowRight','ArrowRight','ArrowLeft','ArrowLeft']){await key(page,k);await page.waitForTimeout(115);}await settled(page);
 const data=await save(page,info,'render-continuity');const failures:any[]=[];const evidence:any[]=[];
 for(const e of data.events){const after=data.samples.find((s:any)=>s.t>=e.t&&s.render>e.before.render);if(!after){failures.push({reason:'no render after event',e});continue;}const dt=after.t-e.before.t;const ratio=after.projected.height/e.before.projected.height;const delta={dt,ratio,hostDelta:after.host.height-e.before.host.height,poseDelta:after.pose.zoom-e.before.pose.zoom,scene:after.scene,camera:after.camera};evidence.push(delta);if(dt<80&&(Math.abs(ratio-1)>.15||Math.abs(delta.hostDelta)>30))failures.push(delta);expect(after.boundsFrame).toBe(after.render);expect(after.camera,'render camera diagnostics required').not.toBeNull();}
 let prior:any=null;for(const s of data.samples){if(!s.camera||!s.projected||s.render===prior?.render)continue;if(prior){const dt=s.t-prior.t,scale=s.rect.height*s.camera.zoom/(s.camera.top-s.camera.bottom),oldScale=prior.rect.height*prior.camera.zoom/(prior.camera.top-prior.camera.bottom),ratio=scale/oldScale;if(dt<60&&Math.abs(s.pose.yaw-prior.pose.yaw)<.5&&Math.abs(s.pose.zoom-prior.pose.zoom)<.005&&Math.abs(ratio-1)>.06)failures.push({reason:'Late frame scale snap with stable pose',dt,ratio,t:s.t,scene:s.scene});}prior=s;}writeFileSync(info.outputPath('first-render-summary.json'),JSON.stringify(evidence,null,2));expect(failures,'No instantaneous container or projected geometry scale jumps').toEqual([]);expect(await page.getByTestId('presentation-scene').getAttribute('data-scene')).toBe('uncertainty');
});
for(const [width,height] of [[375,667],[390,844],[1366,768],[1536,864]])for(const lang of ['ru','kk'])test(`sampled contrast ${width} ${lang}`,async({page},info)=>{
 await page.setViewportSize({width,height});await page.goto(`/presentation?scene=route&lang=${lang}`);await settled(page);await installProbe(page);
 for(const i of [1,2,0,2,1]){await page.getByTestId(`condition-${i}`).click();await page.waitForTimeout(170);}await settled(page);await page.waitForTimeout(200);
 const data=await save(page,info,'contrast');const failures=data.samples.flatMap((s:any)=>s.controls.filter((c:any)=>(c.required&&!c.visible)||(c.visible&&(c.contrast<4.5||(c.tag==='BUTTON'&&c.opacity<.98)))).map((c:any)=>({t:s.t,...c})));expect(failures.slice(0,10)).toEqual([]);
});
test('reduced motion fresh entry skip and large text',async({page},info)=>{
 for(const [width,height] of [[375,667],[1536,864]])for(const lang of ['ru','kk']){
 await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(`/presentation?scene=intro&lang=${lang}`);await settled(page);await page.screenshot({path:info.outputPath(`reduced-intro-${width}-${lang}.png`)});
 await page.goto(`/presentation?scene=uncertainty&lang=${lang}`);await settled(page);await page.locator('.pres-utilities > button').first().click();for(const k of ['ArrowRight','ArrowRight','ArrowLeft','ArrowLeft']){await page.keyboard.press(k);await settled(page);await page.screenshot({path:info.outputPath(`large-${width}-${lang}-${k}-${Date.now()}.png`)});}expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.goto(`/presentation?scene=intro&lang=${lang}`);await expect(page.getByTestId('presentation-intro-film')).toBeVisible();await page.keyboard.press('Escape');await settled(page);await page.screenshot({path:info.outputPath(`skip-${width}-${lang}.png`)});
 }
});

for(const [width,height,lang] of [[1366,768,'ru'],[390,844,'kk']] as const)test(`delivery uninterrupted emulation ${width}`,async({browser},info)=>{
 test.skip(process.env.CONTINUITY_RECORD!=='1','Final recording requires parent GO');
 const context=await browser.newContext({viewport:{width,height},recordVideo:{dir:info.outputPath('video'),size:{width,height}}});const page=await context.newPage();
 await context.route('**/*',r=>{if(!['GET','HEAD'].includes(r.request().method()))return r.abort();return r.continue();});
 const events:{name:string,ms:number}[]=[];const start=Date.now();const mark=(name:string)=>events.push({name,ms:Date.now()-start});
 await page.goto(`${process.env.CONTINUITY_BASE_URL||'http://127.0.0.1:5380'}/presentation?scene=uncertainty&lang=${lang}`);await settled(page);await page.waitForTimeout(1600);mark('scene6-held');
 for(const [scene,key] of [[7,'ArrowRight'],[8,'ArrowRight'],[7,'ArrowLeft'],[6,'ArrowLeft']] as const){mark(`to-scene${scene}`);await page.keyboard.press(key);await settled(page);await page.waitForTimeout(1700);if(scene===8){await page.locator('.pres-pipeline-step').nth(1).click();mark('filter-known-edge-reason');await settled(page);await page.waitForTimeout(1800);await page.locator('.pres-pipeline-step').nth(2).click();mark('search-path-result');await settled(page);await page.waitForTimeout(1400);}}
 for(const [scene,key] of [[7,'ArrowRight'],[8,'ArrowRight'],[7,'ArrowLeft'],[6,'ArrowLeft']] as const){mark(`rapid-to-scene${scene}`);await page.keyboard.press(key);await page.waitForTimeout(180);}
 await settled(page);await page.waitForTimeout(1800);mark('rapid-scene6-settled');
 for(const [scene,key] of [[7,'ArrowRight'],[8,'ArrowRight'],[7,'ArrowLeft'],[6,'ArrowLeft']] as const){mark(`replay-to-scene${scene}`);await page.keyboard.press(key);await settled(page);await page.waitForTimeout(1000);}
 mark('end');const video=page.video()!;writeFileSync(info.outputPath('recording-sidecar.json'),JSON.stringify({url:page.url(),browser:browser.version(),viewport:{width,height},dpr:await page.evaluate(()=>devicePixelRatio),events,note:'Continuous unedited 1x Windows Chrome viewport emulation. Mobile is emulation, not physical device. Event callback offsets are not exact encoded PTS.'},null,2));await context.close();await video.saveAs(info.outputPath(`ITER-continuity-${width===390?'mobile-emulation-KK':'desktop-emulation-RU'}.webm`));
});



test('read-only navigator and semantic evidence smoke',async({page},info)=>{
 await page.goto('/');await expect(page.getByTestId('route-result')).toContainText('40');await page.locator('#closure-settings summary').click();const closures=page.locator('#closure-settings input[type=checkbox]');await closures.nth(0).check();await expect(page.getByTestId('route-result')).toContainText('54');await closures.nth(1).check();await expect(page.getByTestId('route-result')).not.toContainText('54');await expect(page.getByTestId('route-result')).toHaveAttribute('data-route-ids','');await page.screenshot({path:info.outputPath('both-lifts-closed.png')});
 for(const [width,height]of [[375,667],[1366,768]])for(const lang of ['ru','kk']){
 await page.setViewportSize({width,height});await page.goto(`/presentation?scene=uncertainty&lang=${lang}`);await settled(page);await expect(page.getByTestId('presentation-uncertainty-result')).toHaveAttribute('data-route-status','no-route');await expect(page.locator('[data-anchor=door-205]')).toBeVisible();await page.screenshot({path:info.outputPath(`205-strict-${width}-${lang}.png`)});await page.getByTestId('presentation-unknown-toggle').click();await settled(page);await expect(page.getByTestId('presentation-uncertainty-result')).toHaveAttribute('data-uncertain-edges','door-205');await page.screenshot({path:info.outputPath(`205-allowed-${width}-${lang}.png`)});
 await page.goto(`/presentation?scene=system&lang=${lang}`);await settled(page);await page.locator('.pres-pipeline-step').nth(1).click();await settled(page);await expect(page.locator('.pres-model .diorama')).toHaveAttribute('data-graph-rejected-edge','narrow-204');await page.screenshot({path:info.outputPath(`filtered-${width}-${lang}.png`)});
 }
});


test('delivery uninterrupted intro and conditions mobile emulation',async({browser},info)=>{
 test.skip(process.env.CONTINUITY_RECORD!=='1','Recording requires parent GO');const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir:info.outputPath('video'),size:{width:390,height:844}}});const page=await context.newPage();await context.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());const start=Date.now(),events:{name:string,ms:number}[]=[];const mark=(name:string)=>events.push({name,ms:Date.now()-start});
 await page.goto(`${process.env.CONTINUITY_BASE_URL||'http://127.0.0.1:5380'}/presentation?scene=intro&lang=kk`);await expect(page.getByTestId('presentation-intro-film')).toBeVisible();mark('intro-film');await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0,{timeout:15000});await settled(page);mark('live-intro');await page.waitForTimeout(2400);await page.getByTestId('presentation-picker').click();await page.locator('.pres-contents li button').nth(2).click();await settled(page);mark('conditions');await page.waitForTimeout(1400);for(const c of [1,2,0]){await page.getByTestId(`condition-${c}`).click();mark(`condition-${c}`);await page.waitForTimeout(1700);}await page.getByTestId('condition-1').click();await page.waitForTimeout(160);await page.getByTestId('condition-2').click();mark('rapid-conditions');await settled(page);await page.waitForTimeout(1800);mark('end');const video=page.video()!;writeFileSync(info.outputPath('recording-sidecar.json'),JSON.stringify({browser:browser.version(),url:page.url(),viewport:{width:390,height:844},dpr:await page.evaluate(()=>devicePixelRatio),events,note:'Continuous unedited 1x Windows Chrome mobile viewport emulation, not a physical device. App intro source playback uses its own configured rate.'},null,2));await context.close();await video.saveAs(info.outputPath('ITER-intro-conditions-mobile-emulation-KK.webm'));
});


test('narrow delta long204 label and intro fallback375',async({page},info)=>{
 await page.setViewportSize({width:375,height:667});
 for(const lang of ['ru','kk']){await page.goto(`/presentation?scene=system&lang=${lang}`);await settled(page);await page.locator('.pres-pipeline-step').nth(1).click();await settled(page);const label=page.locator('[data-anchor=narrow-204]');await expect(label).toBeVisible();await expect(label).toContainText('204');const metrics=await label.evaluate(e=>{const r=e.getBoundingClientRect(),footer=document.querySelector('.pres-controls')!.getBoundingClientRect();return {text:e.textContent,rect:r.toJSON(),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,footerTop:footer.top};});writeFileSync(info.outputPath(`long-label-${lang}.json`),JSON.stringify(metrics,null,2));expect(metrics.rect.left).toBeGreaterThanOrEqual(0);expect(metrics.rect.right).toBeLessThanOrEqual(375);expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth+1);expect(metrics.rect.bottom).toBeLessThan(metrics.footerTop);await page.screenshot({path:info.outputPath(`long-label-${lang}.png`)});}
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type.includes('webgl'))return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;});await page.emulateMedia({reducedMotion:'reduce'});
 for(const lang of ['ru','kk']){await page.goto(`/presentation?scene=intro&lang=${lang}`);await expect(page.getByTestId('presentation-fallback')).toBeVisible();await settled(page);const img=page.getByTestId('presentation-model').locator('img');await expect(img).toHaveAttribute('src',new RegExp(`intro-purpose${lang==='kk'?'-kk':''}\\.webp`));await expect.poll(()=>img.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true);await page.screenshot({path:info.outputPath(`intro-fallback-${lang}.png`)});}
});

for(const [width,height] of [[375,667],[390,844]])for(const lang of ['ru','kk'])test(`anchor containment ${width} ${lang}`,async({page},info)=>{
 await page.setViewportSize({width,height});await page.goto(`/presentation?scene=route&lang=${lang}`);await settled(page);
 await page.evaluate(()=>{
  const w=window as any;w.anchorSamples=[];w.anchorProbe=true;
  const sample=()=>{
   const host=document.querySelector<HTMLElement>('.pres-model')!,frame=host.getBoundingClientRect(),style=getComputedStyle(host),scaleX=frame.width/parseFloat(style.width),scaleY=frame.height/parseFloat(style.height);
   for(const label of document.querySelectorAll<HTMLElement>('[data-anchor]')){
    const css=getComputedStyle(label);if(css.visibility==='hidden'||Number(css.opacity)<.05)continue;
    const box=label.getBoundingClientRect(),leader=getComputedStyle(label,'::after'),matrix=new DOMMatrix(leader.transform),length=parseFloat(leader.height);
    const anchor={x:frame.left+parseFloat(label.style.left)*frame.width/100,y:frame.top+parseFloat(label.style.top)*frame.height/100};
    const endpoint={x:box.left+box.width/2+matrix.c*length*scaleX,y:box.bottom-parseFloat(css.borderBottomWidth)*scaleY+matrix.d*length*scaleY};
    w.anchorSamples.push({t:performance.now(),anchor:label.dataset.anchor,scene:document.querySelector<HTMLElement>('[data-testid=presentation-scene]')?.dataset.scene,left:box.left,right:box.right,viewport:innerWidth,shift:parseFloat(css.getPropertyValue('--annotation-shift-x')),overflow:label.scrollWidth-label.clientWidth,leaderError:Math.hypot(endpoint.x-anchor.x,endpoint.y-anchor.y),scaleX});
   }
   if(w.anchorProbe)requestAnimationFrame(sample);
  };requestAnimationFrame(sample);
 });
 for(const condition of [1,2,0]){
  await page.getByTestId(`condition-${condition}`).click();
  if(condition===0){await page.waitForTimeout(220);await page.screenshot({path:info.outputPath('lift-to-stairs-220ms.png')});await page.waitForTimeout(180);await page.screenshot({path:info.outputPath('lift-to-stairs-400ms.png')});}
  await settled(page);await expect(page.locator('[data-anchor]')).toBeVisible();
 }
 for(const condition of [2,0,1,2,0,1,0]){await page.getByTestId(`condition-${condition}`).click();await page.waitForTimeout(115);}await settled(page);
 const go=async(index:number)=>{await page.getByTestId('presentation-picker').click();await page.locator('.pres-contents li button').nth(index).click();await settled(page);};
 await go(5);await expect(page.locator('[data-anchor=door-205]')).toBeVisible();await page.getByTestId('presentation-unknown-toggle').click();await settled(page);await page.screenshot({path:info.outputPath('door-205.png')});
 await page.keyboard.press('ArrowRight');await page.waitForTimeout(160);await page.keyboard.press('ArrowRight');await settled(page);
 await page.locator('.pres-pipeline-step').nth(1).click();await settled(page);await expect(page.locator('[data-anchor=narrow-204]')).toBeVisible();await page.screenshot({path:info.outputPath('narrow-204.png')});
 await page.emulateMedia({reducedMotion:'reduce'});await go(2);for(const condition of [1,2,0]){await page.getByTestId(`condition-${condition}`).click();await settled(page);await expect(page.locator('[data-anchor]')).toBeVisible();await page.waitForTimeout(50);}
 const samples=await page.evaluate(()=>{const w=window as any;w.anchorProbe=false;return w.anchorSamples;});
 writeFileSync(info.outputPath('anchor-containment.json'),JSON.stringify(samples,null,2));
 expect(samples.length).toBeGreaterThan(30);
 expect(samples.filter((s:any)=>s.left<7.5||s.right>s.viewport-7.5||s.overflow>1||s.leaderError>1).slice(0,15),'Every visible sampled badge stays on screen and its leader ends on the object').toEqual([]);
 for(const anchor of ['stairs-0','lift-a-0','door-204','door-205','narrow-204'])expect(samples.some((s:any)=>s.anchor===anchor),anchor).toBe(true);
});

import { test, expect } from '@playwright/test';
test.beforeEach(async({context})=>{await context.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());});

test('published desktop RU/KK, actual WebGL, routing, room search and links',async({page,context},testInfo)=>{
  await page.goto('/');await expect(page.getByTestId('route-result')).toContainText('40');
  await expect(page.locator('.diorama')).toHaveAttribute('data-render-count',/[1-9]\d*/);
  await page.screenshot({path:testInfo.outputPath('desktop-ru.png'),fullPage:true});
  await page.locator('#closure-settings summary').click();
  await page.getByRole('checkbox',{name:'Лифт A',exact:true}).check();await expect(page.getByTestId('route-result')).toContainText('54');
  await page.getByRole('button',{name:'Қазақша',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('lang','kk-KZ');
  await expect(page.getByTestId('route-result')).toContainText('54');await page.screenshot({path:testInfo.outputPath('desktop-kk.png'),fullPage:true});
  await page.getByRole('searchbox').fill('библиотека');await expect(page.locator('.room-results button')).toHaveCount(1);
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','kk-KZ');
  await page.getByRole('button',{name:'Русский',exact:true}).click();await page.locator('.share-panel summary').click();await page.getByRole('button',{name:'Показать три QR-точки'}).click();await expect(page.locator('.qr-grid img')).toHaveCount(3);
  for(const anchor of await page.locator('.qr-grid a').filter({hasText:'Открыть ссылку'}).all()) {const url=(await anchor.getAttribute('href'))!;const next=await context.newPage();await next.goto(url);await expect(next.getByRole('combobox',{name:'Откуда',exact:true})).toHaveValue(new URL(url).searchParams.get('start')!);await next.close();}
});
for(const width of [375,390]) test(`published manual steps ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:width===375?667:844});await page.goto('/');await page.getByRole('button',{name:'Проходить маршрут по шагам'}).click();await page.getByRole('button',{name:'Следующий шаг',exact:true}).click();await page.getByRole('button',{name:'Қазақша',exact:true}).click();await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index','1');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);const buttons=await page.locator('.guidance-primary-actions').boundingBox();expect(buttons!.y+buttons!.height).toBeLessThanOrEqual(width===375?667:844);await page.screenshot({path:testInfo.outputPath(`mobile-${width}-kk.png`),fullPage:true});await page.getByRole('button',{name:'Жоспарлаушыға оралу'}).click();await expect(page.getByTestId('route-result')).toContainText('40');
});
test('published read-only backend and invalid-link/fallback routing',async({page,request})=>{
  const health=await request.get('/api/health',{timeout:75000});expect(health.status()).toBe(200);
  const reports=await request.get('/api/reports?limit=1',{timeout:75000});expect(reports.status()).toBe(200);
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type.startsWith('webgl'))return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;});
  await page.goto('/?model=iter-demo-v1&start=bad');await expect(page.locator('.link-warning')).toBeVisible();await expect(page.locator('.primary-plan')).toBeVisible();await expect(page.getByTestId('route-result')).toContainText('40');
});

import { test, expect } from '@playwright/test';
const mockJournal = async (page: import('@playwright/test').Page) => {
  await page.route('**/api/health', route=>route.fulfill({json:{status:'ok',mode:'public-demo'}}));
  await page.route('**/api/reports**', route=>route.fulfill({json:{items:[],nextCursor:null}}));
};
test.beforeEach(async({page})=>{await mockJournal(page);});
test('original controls, strict unknown, zero distance and shared result IDs',async({page})=>{
  await page.goto('/');
  const result=page.getByTestId('route-result');
  await expect(result).toContainText('40');
  await page.locator('#closure-settings summary').click();
  await page.getByRole('checkbox',{name:'Лифт A',exact:true}).check();await expect(result).toContainText('54');
  await page.getByRole('checkbox',{name:'Лифт B',exact:true}).check();await expect(result).toHaveAttribute('data-route-state','no-route');
  await page.getByRole('checkbox',{name:'Лифт A',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Лифт B',exact:true}).uncheck();
  await page.getByRole('combobox',{name:'Куда',exact:true}).selectOption('room-205');await expect(result).toHaveAttribute('data-route-state','insufficient');
  await page.locator('#requirements-settings summary').click();
  await page.getByRole('checkbox',{name:'Разрешить участки с неполными данными',exact:true}).check();await expect(result).toHaveAttribute('data-route-state','uncertain');
  await page.getByRole('combobox',{name:'Откуда',exact:true}).selectOption('room-205');await expect(result.locator('.distance')).toHaveText('0м');
});
test('language retains route variant, endpoints, requirements and current step',async({page})=>{
  await page.goto('/');
  await page.locator('.variant-disclosure summary').click();await page.locator('[data-variant-index="1"]').click();
  await page.locator('.compact-guidance-options summary').click();
  await page.getByRole('combobox',{name:'Просмотр шага',exact:true}).selectOption('1');
  const before=await page.getByTestId('route-result').getAttribute('data-route-ids');
  await page.getByRole('button',{name:'Қазақша',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','kk-KZ');await expect(page.getByTestId('route-result')).toHaveAttribute('data-route-ids',before!);await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index','1');
  await expect(page.locator('[data-variant-index="1"]')).toHaveAttribute('aria-pressed','true');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','kk-KZ');
  await expect(page.getByRole('heading',{name:'Қолжетімді бағыттар навигаторы'})).toBeVisible();
});
test('search both languages, map selection, links, QR and invalid links',async({page,context})=>{
  await page.goto('/');await page.getByRole('searchbox').fill('кітапхана');await expect(page.locator('.room-results button')).toHaveCount(1);await page.locator('.room-results button').click();
  await page.getByTestId('room-card').getByRole('button',{name:'Проложить маршрут сюда'}).click();await expect(page.getByRole('combobox',{name:'Куда',exact:true})).toHaveValue('room-library');
  await page.getByRole('button',{name:'2D схема',exact:true}).click();await page.locator('.primary-plan [data-node-id="hall-1"]').click();await expect(page.getByTestId('map-room-card')).toContainText('Холл');
  await page.locator('.share-panel summary').click();await page.getByRole('button',{name:'Скопировать ссылку на маршрут'}).click();const url=await page.getByRole('textbox',{name:'Ссылка на маршрут',exact:true}).inputValue();
  const next=await context.newPage();await mockJournal(next);await next.goto(url);await expect(next.getByRole('combobox',{name:'Куда',exact:true})).toHaveValue('room-library');await next.close();
  await page.getByRole('button',{name:'Показать три QR-точки'}).click();await expect(page.locator('.qr-grid img')).toHaveCount(3);
  const starts=[];for(const link of await page.locator('.qr-grid a').filter({hasText:'Открыть ссылку'}).all()){const href=(await link.getAttribute('href'))!; const start=new URL(href).searchParams.get('start')!; starts.push(start); const qrPage=await context.newPage(); await mockJournal(qrPage); await qrPage.goto(href); await expect(qrPage.getByRole('combobox',{name:'Откуда',exact:true})).toHaveValue(start); await qrPage.close();}expect(starts).toEqual(['entrance','hall-1','room-library']);
  await page.goto('/?model=iter-demo-v1&start=bad');await expect(page.locator('.link-warning')).toBeVisible();await expect(page.getByTestId('route-result')).toBeVisible();
});
test('WebGL actually renders, route IDs agree and forced context loss preserves routing',async({page},testInfo)=>{
  await page.goto('/');const diorama=page.locator('.diorama');
  await expect(diorama).toHaveAttribute('data-render-count',/[1-9]\d*/);expect(await page.locator('[data-testid="diorama-canvas"]').count()).toBe(1);
  await page.screenshot({path:testInfo.outputPath('desktop-webgl-ru.png'),fullPage:true});
  await page.getByRole('button',{name:'Қазақша',exact:true}).click();
  await expect(diorama).toHaveAttribute('data-render-count',/[1-9]\d*/);
  await page.screenshot({path:testInfo.outputPath('desktop-webgl-kk.png'),fullPage:true});
  const ids=await page.getByTestId('route-result').getAttribute('data-route-ids');await expect(diorama).toHaveAttribute('data-route-ids',ids!);
  await page.evaluate(()=>{const canvas=document.querySelector<HTMLCanvasElement>('[data-testid="diorama-canvas"]')!;canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));});
  await expect(page.locator('.primary-plan')).toBeVisible();await expect(page.getByTestId('route-result')).toHaveAttribute('data-route-ids',ids!);await expect(page.getByTestId('floor-plan')).toHaveAttribute('data-route-ids',ids!);
});
for(const width of [375,390]) test(`manual walk mobile ${width} RU/KK keeps instruction and controls accessible`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:width===375?667:844});await page.goto('/');await page.getByRole('button',{name:'Проходить маршрут по шагам'}).click();
  await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index','0');
  await page.getByRole('button',{name:'Следующий шаг',exact:true}).click();await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index','1');
  await page.getByRole('button',{name:'Қазақша',exact:true}).click();await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index','1');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('mobile-walk-kk.png'),fullPage:true});
  await page.getByRole('button',{name:'Жоспарлаушыға оралу'}).click();await expect(page.getByTestId('route-result')).toContainText('40');
});
test('no WebGL and reduced motion, keyboard, enlarged text at narrow 200% equivalent viewport',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type.startsWith('webgl'))return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;});
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:640,height:480});await page.goto('/');await expect(page.locator('.primary-plan')).toBeVisible();await expect(page.getByTestId('route-result')).toContainText('40');
  await page.keyboard.press('Tab');await expect(page.locator('.skip-link')).toBeFocused();
  await page.getByRole('button',{name:'Қазақша',exact:true}).click();await page.locator('.display-jump').click();await page.getByRole('checkbox',{name:'Ірі мәтін',exact:true}).check();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

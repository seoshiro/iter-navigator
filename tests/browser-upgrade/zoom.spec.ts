import { test, expect, chromium } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Chrome actual page zoom 200 percent in isolated profile', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  const profile=await mkdtemp(join(tmpdir(),'iter-zoom-'));
  await mkdir(join(profile,'Default'));
  await writeFile(join(profile,'Default','Preferences'),JSON.stringify({partition:{default_zoom_level:Math.log(2)/Math.log(1.2)}}));
  const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:null,args:['--window-size=1366,900']});
  try {
    const page=context.pages()[0]!;
    await page.route('**/api/**',route=>route.fulfill({json:{items:[],nextCursor:null}}));
    await page.goto('chrome://settings/appearance');
    await page.evaluate(() => new Promise<void>(resolve => (window as unknown as {chrome:{settingsPrivate:{setDefaultZoom:(zoom:number,callback:()=>void)=>void}}}).chrome.settingsPrivate.setDefaultZoom(2,resolve)));
    await page.goto('http://127.0.0.1:5269/');
    const dimensions=await page.evaluate(()=>({innerWidth,outerWidth,dpr:devicePixelRatio,scale:visualViewport?.scale,screenWidth:screen.width}));
    console.log('ZOOM_METRICS',JSON.stringify(dimensions));
    expect(dimensions.outerWidth / dimensions.innerWidth).toBeGreaterThan(1.9);
    expect(dimensions.outerWidth / dimensions.innerWidth).toBeLessThan(2.2);
    await expect(page.getByTestId('route-result')).toContainText('40');
    await page.getByRole('button',{name:'Қазақша',exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await testInfo.attach('page-zoom-metrics',{body:JSON.stringify(dimensions),contentType:'application/json'});
    for (const selector of ['h1','.language-switch','.walk-start']) { const bounds=await page.locator(selector).first().boundingBox(); expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(dimensions.innerWidth+1); }
    await page.getByRole('button',{name:'Бағытпен қадамдап жүру'}).click();
    await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index','0');
    await page.getByRole('button',{name:'Келесі қадам',exact:true}).click();
    await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index','1');
    await page.getByRole('button',{name:'Жоспарлаушыға оралу'}).click();
    await expect(page.getByTestId('route-result')).toContainText('40');
  } finally { await context.close(); }
});

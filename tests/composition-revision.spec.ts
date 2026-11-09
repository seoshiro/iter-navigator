import { test, expect } from '@playwright/test';

test('continuous conditions keep title and controls visible', async ({ page }, info) => {
  await page.goto('/presentation?scene=route');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true');
  await page.evaluate(() => {
    const state = window as unknown as { hiddenCopy: number }; state.hiddenCopy = 0;
    const begin = performance.now();
    const check = () => { for (const e of document.querySelectorAll('.pres-copy-column,h1,.pres-condition-actions button')) { if (Number(getComputedStyle(e).opacity) < .99 || getComputedStyle(e).visibility === 'hidden') state.hiddenCopy++; } if (performance.now()-begin < 9000) requestAnimationFrame(check); }; check();
  });
  for (const index of [1,2,0,2]) { await page.getByTestId(`condition-${index}`).click(); await page.waitForTimeout(250); await page.screenshot({path:info.outputPath(`condition-${index}-moving.png`)}); await page.waitForTimeout(1150); }
  expect(await page.evaluate(() => (window as unknown as {hiddenCopy:number}).hiddenCopy)).toBe(0);
});

test('continuous chapters five through eight and interrupted secondary reveal', async ({ page }, info) => {
  await page.goto('/presentation?scene=detour');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true');
  for(const scene of ['uncertainty','mobile','system']) { await page.keyboard.press('ArrowRight'); for(const delay of [200,400,650]) { await page.waitForTimeout(delay); await page.screenshot({path:info.outputPath(`${scene}-${delay}.png`)}); } await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true'); }
  for(let i=0;i<4;i++){ await page.locator('.pres-pipeline-step').nth(i).click(); await page.waitForTimeout(1700); }
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(100); await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.pres-route-interface')).toHaveCSS('visibility','visible');
  await expect(page.locator('.pres-route-interface')).toHaveCSS('opacity','1');
});

test('mobile complete detour reaches 54 metres without fading controls', async ({ page }, info) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/presentation?scene=building&lang=kk');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true');
  await page.keyboard.press('ArrowRight'); await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled','true');
  await page.getByTestId('presentation-lift-toggle').click();
  await page.waitForTimeout(200); await expect(page.locator('.pres-copy-column')).toHaveCSS('opacity','1');
  await expect(page.getByTestId('presentation-detour-result')).toHaveAttribute('data-distance','54');
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-route-progress','1');
  await page.screenshot({path:info.outputPath('complete-54.png')}); await page.waitForTimeout(1500);
});

test('mobile intro actual crop and endpoint handoff', async ({ page }, info) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/presentation?scene=intro&lang=kk');
  const film=page.getByTestId('presentation-intro-film');
  await expect(film).toBeVisible(); await page.waitForTimeout(700); await page.screenshot({path:info.outputPath('intro-crop.png')});
  await expect(film).toHaveCount(0,{timeout:12000});
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready','true');
  await page.screenshot({path:info.outputPath('intro-live.png')}); await page.waitForTimeout(1200);
});

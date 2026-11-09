import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
const result = (page: Page) => page.getByTestId('route-result');
const ids = (page: Page) => result(page).getAttribute('data-route-ids');
const scene = (page: Page) => page.locator('.diorama');
const floor = (page: Page, value: string) => page.locator('.floor-toolbar').getByRole('button', { name: value, exact: true });
async function settled(page: Page) { await expect(scene(page)).toHaveAttribute('data-animating', 'false'); }
async function chooseLibrary(page: Page) {
  await page.getByRole('searchbox').fill('кітапхана');
  await page.locator('.room-results button').focus(); await page.keyboard.press('Enter');
  await expect(page.getByTestId('map-room-card')).toContainText('Библиотека');
}
test.beforeEach(async ({ page, context }) => {
  errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === 'http://127.0.0.1:5369' ? route.continue() : route.abort('blockedbyclient');
  });
  await page.route('**/api/**', route => route.fulfill({ json: { status: 'ok', mode: 'public-demo', reports: [], items: [], nextCursor: null } }));
  await page.addInitScript(() => { if (!localStorage.getItem('iter-language-v1')) localStorage.setItem('iter-language-v1', 'ru'); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page), 'Unexpected page errors').toEqual([]); });

test('keyboard room selection focuses floor without changing route; explicit route and manual steps keep IDs across language and views', async ({ page }) => {
  await page.goto('/'); await expect(scene(page)).toHaveAttribute('data-render-count', /[1-9]\d*/);
  const original = await ids(page); await chooseLibrary(page);
  await expect(result(page)).toHaveAttribute('data-route-ids', original!);
  await expect(scene(page)).toHaveAttribute('data-floor', '1');
  await page.getByTestId('room-card').getByRole('button', { name: 'Проложить маршрут сюда' }).click();
  await expect(page.getByRole('combobox', { name: 'Куда', exact: true })).toHaveValue('room-library');
  const route = await ids(page); expect(route).not.toBe(original);
  await page.locator('.guidance-primary-actions button').nth(1).click();
  await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', '0');
  await page.locator('.guidance-primary-actions button').nth(1).click();
  await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', '1');
  await settled(page); const transition = await scene(page).getAttribute('data-camera-transition');
  await page.getByRole('button', { name: 'Қазақша', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-camera-transition', transition!);
  await expect(result(page)).toHaveAttribute('data-route-ids', route!);
  await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', '1');
  await expect(page.locator('.room-results button')).toHaveAttribute('aria-pressed', 'true');
  await expect(scene(page)).toHaveAttribute('data-route-ids', route!);
  await page.locator('.view-switch button').nth(1).click();
  await expect(page.locator('.primary-plan [data-testid="floor-plan"]')).toHaveAttribute('data-route-ids', route!);
  await page.locator('.view-switch button').first().click();
  await expect(scene(page)).toHaveAttribute('data-route-ids', route!);
});

test('lift closure A changes 40 to B 54 and restores 40 without weakening requirements', async ({ page }) => {
  await page.goto('/'); await expect(result(page).locator('.distance')).toHaveText('40м');
  const original = await ids(page);
  await expect(page.locator('#closure-settings')).not.toHaveAttribute('open', '');
  await page.locator('#closure-settings summary').click();
  await page.getByRole('checkbox', { name: 'Лифт A', exact: true }).check();
  await expect(result(page).locator('.distance')).toHaveText('54м');
  expect(await ids(page)).toContain('lift-b');
  await page.getByRole('checkbox', { name: 'Лифт A', exact: true }).uncheck();
  await expect(result(page).locator('.distance')).toHaveText('40м');
  await expect(result(page)).toHaveAttribute('data-route-ids', original!);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('navigator-scenario-v1')!).scenario);
  expect(saved.requirements).toEqual({ avoidStairs: true, minWidthM: .9, maxSlopePercent: 5, smoothOnly: true, allowUnknown: false });
});

test('expand, focus, manual camera interruption, whole building and actual frame observations', async ({ page }, info) => {
  await page.goto('/'); await expect(scene(page)).toHaveAttribute('data-render-count', /[1-9]\d*/); await settled(page);
  const original = await ids(page);
  await page.evaluate(() => {
    const state = window as unknown as { qaFrames: { at: number; count: string | undefined; offsets: string | undefined }[] };
    state.qaFrames = []; const until = performance.now() + 2000;
    const frame = (at: number) => { const s = document.querySelector<HTMLElement>('.diorama'); state.qaFrames.push({ at, count: s?.dataset.renderCount, offsets: s?.dataset.floorOffsets }); if (at < until) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  await page.getByRole('button', { name: 'Раскрыть этажи', exact: true }).click();
  for (let i = 0; i < 3; i++) { await page.screenshot({ path: info.outputPath(`reveal-${i}.png`) }); }
  await expect(scene(page)).toHaveAttribute('data-floor-mode', 'expanded'); await settled(page);
  const offsets = JSON.parse((await scene(page).getAttribute('data-floor-offsets'))!);
  expect(offsets[1]).toBeGreaterThan(offsets[0]); expect(offsets[2]).toBeGreaterThan(offsets[1]);
  await floor(page, '2').click(); await expect(scene(page)).toHaveAttribute('data-floor', '1');
  await page.getByRole('button', { name: 'Жесты камеры', exact: true }).click();
  await scene(page).scrollIntoViewIfNeeded();
  const bounds = (await scene(page).boundingBox())!;
  const cameraBefore = await scene(page).getAttribute('data-camera');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 65, bounds.y + bounds.height / 2 + 20, { steps: 8 }); await page.mouse.up();
  await expect(scene(page)).toHaveAttribute('data-dragging', 'false');
  expect(await scene(page).getAttribute('data-camera')).not.toBe(cameraBefore);
  await settled(page);
  await page.screenshot({ path: info.outputPath('focused-floor-route.png'), fullPage: true });
  await page.locator('.camera-disclosure summary').click();
  const transition = await scene(page).getAttribute('data-camera-transition');
  await page.getByRole('button', { name: 'Повернуть вправо', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-camera-transition', transition!);
  await page.getByRole('button', { name: 'Целое здание', exact: true }).click();
  await settled(page); await expect(scene(page)).toHaveAttribute('data-floor-mode', 'assembled');
  await expect(result(page)).toHaveAttribute('data-route-ids', original!);
  await page.screenshot({ path: info.outputPath('whole-final.png'), fullPage: true });
  const frames = await page.evaluate(() => (window as unknown as { qaFrames: { at: number; count?: string; offsets?: string }[] }).qaFrames);
  await info.attach('raf-observations', { body: JSON.stringify(frames), contentType: 'application/json' });
  expect(frames.length).toBeGreaterThan(3);
  const intervals = frames.slice(1).map((frame, index) => frame.at - frames[index]!.at).sort((a, b) => a - b);
  const observations = { samples: frames.length, renderCounts: new Set(frames.map(frame => frame.count)).size, floorOffsetStates: new Set(frames.map(frame => frame.offsets)).size, medianMs: intervals[Math.floor(intervals.length / 2)], p95Ms: intervals[Math.floor(intervals.length * .95)], maxMs: intervals.at(-1) };
  console.log('Headless Chrome Windows rAF observations (not physical-device FPS):', JSON.stringify(observations));
  expect(observations.renderCounts).toBeGreaterThan(3);
  expect(observations.floorOffsetStates).toBeGreaterThan(3);
});

test('rapid floor, focus, route, language and resize actions settle on latest intent', async ({ page }) => {
  await page.goto('/'); await expect(scene(page)).toHaveAttribute('data-render-count', /[1-9]\d*/);
  await page.getByRole('button', { name: 'Раскрыть этажи', exact: true }).click();
  await floor(page, '3').click(); await floor(page, '1').click();
  await chooseLibrary(page);
  await page.getByTestId('room-card').getByRole('button', { name: 'Проложить маршрут сюда' }).click();
  const route = await ids(page);
  await page.getByRole('button', { name: 'Қазақша', exact: true }).click();
  await page.setViewportSize({ width: 720, height: 800 }); await page.setViewportSize({ width: 1366, height: 900 });
  await settled(page); await expect(scene(page)).toHaveAttribute('data-floor', '1');
  await expect(result(page)).toHaveAttribute('data-route-ids', route!);
  await expect(page.locator('.room-results button')).toHaveAttribute('aria-pressed', 'true');
});

test('mobile default 2D and explicit 3D survive reload and width changes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); await page.goto('/');
  await expect(page.locator('.primary-plan')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('iter-model-view-v1'))).toBeNull();
  await page.locator('.view-switch button').first().click();
  await expect(scene(page)).toHaveAttribute('data-render-count', /[1-9]\d*/);
  const preference = await page.evaluate(() => localStorage.getItem('iter-model-view-v1'));
  expect(preference).toContain('3d'); await page.reload();
  await expect(scene(page)).toHaveAttribute('data-render-count', /[1-9]\d*/);
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect(page.locator('.view-switch button').first()).toHaveAttribute('aria-pressed', 'true');
});

test('context loss preserves route, selected room, step, restrictions and explicit view preference', async ({ page }) => {
  await page.goto('/'); await page.locator('.view-switch button').first().click();
  await chooseLibrary(page); await page.locator('#closure-settings summary').click();
  await page.getByRole('checkbox', { name: 'Лифт A', exact: true }).check();
  await page.locator('.guidance-primary-actions button').nth(1).click();
  const route = await ids(page); const saved = await page.evaluate(() => ({ scenario: localStorage.getItem('navigator-scenario-v1'), view: localStorage.getItem('iter-model-view-v1') }));
  await page.getByTestId('diorama-canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.locator('.primary-plan')).toBeVisible();
  await expect(result(page)).toHaveAttribute('data-route-ids', route!);
  await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', '0');
  await expect(page.getByTestId('map-room-card')).toContainText('Библиотека');
  expect(await page.evaluate(() => ({ scenario: localStorage.getItem('navigator-scenario-v1'), view: localStorage.getItem('iter-model-view-v1') }))).toEqual(saved);
});

test('invalid WebGL startup automatically falls back without overwriting explicit 3D', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('iter-model-view-v1', '3d');
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) { if (type.startsWith('webgl')) return null; return Reflect.apply(original, this, [type, ...args]); } as typeof original;
  });
  await page.goto('/'); await expect(page.locator('.fallback-note')).toBeVisible();
  await expect(result(page).locator('.distance')).toHaveText('40м');
  await expect(page.locator('.primary-plan [data-testid="floor-plan"]')).toHaveAttribute('data-route-ids', (await ids(page))!);
  expect(await page.evaluate(() => localStorage.getItem('iter-model-view-v1'))).toContain('3d');
});

test('reduced motion snaps floors and camera with no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(scene(page)).toHaveAttribute('data-render-count', /[1-9]\d*/);
  await page.getByRole('button', { name: 'Раскрыть этажи', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-animating', 'false');
  await floor(page, '3').click(); await expect(scene(page)).toHaveAttribute('data-floor', '2');
  await expect(scene(page)).toHaveAttribute('data-animating', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
});

for (const width of [375, 390]) for (const theme of ['dark', 'light']) test(`manual instruction fits ${width} ${theme} KK enlarged text`, async ({ page }, info) => {
  const height = width === 375 ? 667 : 844;
  await page.setViewportSize({ width, height });
  await page.addInitScript(theme => { localStorage.setItem('navigator-display-v1', JSON.stringify({ version: 1, preferences: { theme, largerText: true, reduceMotion: false } })); }, theme);
  await page.goto('/'); await page.getByRole('button', { name: 'Проходить маршрут по шагам' }).click();
  await page.getByRole('button', { name: 'Следующий шаг', exact: true }).click();
  await page.getByRole('button', { name: 'Қазақша', exact: true }).click();
  await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (let step = 1; step < 5; step++) {
    for (const selector of ['.current-instruction', '.guidance-primary-actions']) {
      const bounds = await page.locator(selector).boundingBox(); expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      expect(bounds!.y + bounds!.height, `Step ${step + 1}: ${selector}`).toBeLessThanOrEqual(height + 1);
    }
    if (step < 4) { await page.locator('.guidance-primary-actions button').nth(1).click(); await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', String(step + 1)); }
  }
  await page.screenshot({ path: info.outputPath(`walk-${width}-${theme}-kk-large.png`), fullPage: true });
  await page.locator('.guidance-primary-actions button').nth(2).click();
  await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', '');
  const allStepsBounds = (await page.locator('.guidance-primary-actions').boundingBox())!;
  expect(allStepsBounds.y + allStepsBounds.height, 'Whole-route review controls').toBeLessThanOrEqual(height + 1);
});

test('real material loads without blocking the route; missing texture keeps the working 3D fallback', async ({ page }) => {
  await page.goto('/'); await expect(scene(page)).toHaveAttribute('data-material-source','higgsfield-limestone');
  await expect(result(page).locator('.distance')).toHaveText('40м'); await settled(page);
  const stats=JSON.parse((await scene(page).getAttribute('data-render-stats'))!);
  expect(stats.calls).toBeLessThan(200);
  await page.route('**/textures/iter-limestone.webp',route=>route.abort('failed'));
  await page.reload(); await expect(scene(page)).toHaveAttribute('data-material-source','procedural-fallback');
  await expect(scene(page)).toHaveAttribute('data-render-count',/[1-9]\d*/);
  await expect(result(page).locator('.distance')).toHaveText('40м');
});

import { test, expect } from '@playwright/test';
import type { Page, CDPSession } from '@playwright/test';
import { presentationCopy } from '../src/presentation/content';
import { readFileSync } from 'node:fs';
import { validateBuilding } from '../src/domain/validation';
import { defaultScenario } from '../src/domain/storage';
import { findRoute } from '../src/domain/routing';

const fixture = validateBuilding(JSON.parse(readFileSync(new URL('../src/data/building.json', import.meta.url), 'utf8')));
if (!fixture.valid) throw new Error(fixture.message);
const presentationBuilding = fixture.value;
const presentationRequirements = defaultScenario().requirements;
const route204 = findRoute(presentationBuilding, 'entrance', 'room-204', presentationRequirements, []);
const detour204 = findRoute(presentationBuilding, 'entrance', 'room-204', presentationRequirements, presentationBuilding.closureGroups.find(group => group.id === 'lift-a')!.edgeIds);
const route205Strict = findRoute(presentationBuilding, 'entrance', 'room-205', presentationRequirements, []);
const route205Unknown = findRoute(presentationBuilding, 'entrance', 'room-205', { ...presentationRequirements, allowUnknown: true }, []);

const scenes = ['intro', 'barriers', 'route', 'building', 'detour', 'uncertainty', 'mobile', 'system', 'pilot', 'finish'];
const active = (page: Page) => page.getByTestId('presentation-scene');
const errors = new WeakMap<Page, string[]>();
const writes = new WeakMap<Page, string[]>();

async function open(page: Page, scene = 'intro', lang = 'ru') {
  await page.goto(`/presentation?scene=${scene}&lang=${lang}`);
  await expect(page.getByTestId('presentation-root')).toBeVisible();
  await expect(active(page)).toHaveAttribute('data-scene', scene);
}
async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y, id: 1, radiusX: 5, radiusY: 5, force: 1 }] });
}
async function swipe(page: Page, cdp: CDPSession, dx: number, dy: number) {
  const box = await active(page).boundingBox();
  expect(box).not.toBeNull();
  const x = Math.min(page.viewportSize()!.width - 70, box!.x + box!.width * .7);
  const y = Math.min(page.viewportSize()!.height - 150, Math.max(180, box!.y + 150));
  await touch(cdp, 'touchStart', x, y);
  for (let i = 1; i <= 10; i++) { await touch(cdp, 'touchMove', x + dx * i / 10, y + dy * i / 10); await frames(page); }
  await touch(cdp, 'touchEnd');
}
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth })))
    .toEqual(expect.objectContaining({ viewport: page.viewportSize()!.width }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function chooseScene(page: Page, index: number) {
  const picker = page.getByTestId('presentation-picker');
  if (await picker.evaluate(element => element.tagName === 'SELECT')) {
    const options = await picker.locator('option').evaluateAll(elements => elements.map(option => (option as HTMLOptionElement).value));
    await picker.selectOption(options[index]!);
  } else {
    await picker.click();
    await page.locator('.pres-contents li button').nth(index).click();
  }
  await expect(active(page)).toHaveAttribute('data-scene', scenes[index]!);
}

test.beforeEach(async ({ page, context, baseURL }) => {
  errors.set(page, []); writes.set(page, []);
  page.on('pageerror', error => errors.get(page)!.push(error.message));
  await context.route('**/*', route => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method())) {
      writes.get(page)!.push(`${request.method()} ${new URL(request.url()).pathname}`);
      return route.abort('blockedbyclient');
    }
    if (new URL(request.url()).origin !== new URL(baseURL!).origin) return route.abort('blockedbyclient');
    return route.continue();
  });
  // Local frontend fixture only; never POST to a live or test backend.
  if (new URL(baseURL!).hostname === '127.0.0.1') {
    await page.route('**/api/**', route => route.fulfill({ json: { status: 'ok', mode: 'public-demo', reports: [], items: [], nextCursor: null } }));
  }
});
test.afterEach(async ({ page }) => {
  expect(writes.get(page), 'No backend writes are allowed during presentation QA').toEqual([]);
  expect(errors.get(page), 'Unexpected page errors').toEqual([]);
});

test('presentation facts match the actual fictional routing model and a three to five minute script', async () => {
  expect(presentationBuilding.fictional).toBe(true);
  expect(presentationBuilding.surveyedOn).toBeNull();
  expect(route204).toMatchObject({ status: 'ok', distanceM: 40 });
  expect(detour204).toMatchObject({ status: 'ok', distanceM: 54 });
  if (route204.status === 'ok') expect(route204.edgeIds.join(' ')).toContain('lift-a');
  if (detour204.status === 'ok') expect(detour204.edgeIds.join(' ')).toContain('lift-b');
  const closed = presentationBuilding.closureGroups.filter(group => ['lift-a', 'lift-b'].includes(group.id)).flatMap(group => group.edgeIds);
  expect(findRoute(presentationBuilding, 'entrance', 'room-204', presentationRequirements, closed).status).toBe('no-route');
  expect(presentationRequirements).toEqual({ avoidStairs: true, minWidthM: .9, maxSlopePercent: 5, smoothOnly: true, allowUnknown: false });
  const unknown = presentationBuilding.edges.find(edge => edge.id === 'door-205')!;
  expect(unknown.widthM).toMatchObject({ status: 'unknown', value: null });
  expect(unknown.surface).toMatchObject({ status: 'unknown', value: null });
  expect(unknown.slopePercent.status).toBe('checked'); expect(unknown.stepFree.status).toBe('checked');
  expect(presentationBuilding.edges.find(edge => edge.widthM.value === .72)?.id).not.toBe('door-205');
  expect(route205Strict.status).toBe('no-route');
  expect(route205Unknown).toMatchObject({ status: 'ok', uncertainEdgeIds: ['door-205'] });
  if (route205Unknown.status === 'ok') expect(route205Unknown.edgeIds).not.toContain(presentationBuilding.edges.find(edge => edge.widthM.value === .72)!.id);
  for (const language of ['ru', 'kk'] as const) {
    expect(presentationCopy[language].scenes.map(scene => scene.id)).toEqual(scenes);
    const duration = presentationCopy[language].scenes.reduce((total, scene) => total + scene.durationSeconds, 0);
    expect(duration).toBeGreaterThanOrEqual(180); expect(duration).toBeLessThanOrEqual(300);
  }
});

test('manual navigation, boundaries, rapid keys, direct URL, reload and browser history', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('presentation-prev')).toBeDisabled();
  await page.waitForTimeout(1600);
  await expect(active(page)).toHaveAttribute('data-scene', 'intro');
  await page.getByTestId('presentation-next').click();
  await expect(active(page)).toHaveAttribute('data-scene', 'barriers');
  await page.keyboard.press('ArrowRight'); await expect(active(page)).toHaveAttribute('data-scene', 'route');
  await page.reload(); await expect(active(page)).toHaveAttribute('data-scene', 'route');
  await page.goBack(); await expect(active(page)).toHaveAttribute('data-scene', 'barriers');
  await page.goForward(); await expect(active(page)).toHaveAttribute('data-scene', 'route');
  await page.getByTestId('presentation-next').focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(active(page)).toHaveAttribute('data-scene', 'system');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  await expect(active(page)).toHaveAttribute('data-scene', 'detour');
  await chooseScene(page, 9); await expect(page.getByTestId('presentation-next')).toBeDisabled();
  await page.keyboard.press('ArrowRight'); await expect(active(page)).toHaveAttribute('data-scene', 'finish');
  await page.goto('/presentation?scene=4&lang=ru'); await expect(active(page)).toHaveAttribute('data-scene', 'building');
  await page.goto('/presentation/?scene=building&lang=kk'); await expect(active(page)).toHaveAttribute('data-scene', 'building');
  await page.reload(); await expect(active(page)).toHaveAttribute('data-scene', 'building');
});

test('language survives transitions, direct URL and reload without losing scene', async ({ page }) => {
  await open(page, 'building');
  await page.getByTestId('presentation-next').click();
  await page.getByTestId('presentation-language-kk').click();
  await expect(active(page)).toHaveAttribute('data-scene', 'detour');
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk-KZ');
  expect(new URL(page.url()).searchParams.get('lang')).toBe('kk');
  expect(await page.evaluate(() => localStorage.getItem('iter-language-v1'))).toBe('kk');
  await page.reload(); await expect(active(page)).toHaveAttribute('data-scene', 'detour');
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk-KZ');
  await page.goto('/presentation?scene=uncertainty');
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk-KZ');
  await page.getByTestId('presentation-language-ru').click();
  await expect(active(page)).toHaveAttribute('data-scene', 'uncertainty');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru-RU');
});

test('live route, closure and unknown-data controls use model results without changing the navigator scenario', async ({ page }) => {
  await open(page, 'route');
  const route = page.getByTestId('presentation-route-result');
  await expect(route).toHaveAttribute('data-distance', '40');
  await expect(route).toHaveAttribute('data-route-ids', /lift-a/);
  const navigatorState = await page.evaluate(() => localStorage.getItem('navigator-scenario-v1'));
  await active(page).locator('select').first().selectOption('room-205');
  await active(page).locator('button[type="submit"]').click();
  await expect(active(page).locator('.pres-route-output')).toContainText('не найден');
  await active(page).locator('select').first().selectOption('room-204');
  await active(page).locator('button[type="submit"]').click();
  await expect(route).toHaveAttribute('data-distance', '40');
  await chooseScene(page, 4);
  await expect(page.getByTestId('presentation-detour-result')).toHaveAttribute('data-distance', '40');
  await page.getByTestId('presentation-lift-toggle').click();
  await expect(page.getByTestId('presentation-detour-result')).toHaveAttribute('data-distance', '54');
  await page.getByTestId('presentation-lift-toggle').click();
  await expect(page.getByTestId('presentation-detour-result')).toHaveAttribute('data-distance', '40');
  await chooseScene(page, 5);
  await expect(page.getByTestId('presentation-uncertainty-result')).toHaveAttribute('data-route-status', 'no-route');
  await page.getByTestId('presentation-unknown-toggle').click();
  await expect(page.getByTestId('presentation-uncertainty-result')).toHaveAttribute('data-route-status', 'ok');
  await expect(page.getByTestId('presentation-uncertainty-result')).toHaveAttribute('data-uncertain-edges', 'door-205');
  await expect(active(page).locator('.pres-doors')).toHaveAttribute('data-allow-unknown', 'true');
  await expect(active(page).locator('.pres-door-excluded')).toContainText('72');
  expect(await page.evaluate(() => localStorage.getItem('navigator-scenario-v1'))).toBe(navigatorState);
});

test('real browser fullscreen action, focus visibility and keyboard controls', async ({ page }) => {
  await open(page);
  const fullscreen = page.getByTestId('presentation-fullscreen');
  await fullscreen.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await fullscreen.click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.getByTestId('presentation-next').focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  const ring = await page.evaluate(() => { const style = getComputedStyle(document.activeElement!); return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow }; });
  expect((ring.outline !== 'none' && ring.width !== '0px') || ring.shadow !== 'none').toBe(true);
  await page.keyboard.press('Enter'); await expect(active(page)).toHaveAttribute('data-scene', 'barriers');
});

test('fullscreen rejection is explained and does not block navigation', async ({ page }) => {
  await page.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Fullscreen denied for QA', 'NotAllowedError')); });
  await open(page);
  await page.getByTestId('presentation-fullscreen').click();
  await expect(page.locator('.pres-toast')).toContainText('не разрешил');
  await page.getByTestId('presentation-next').click();
  await expect(active(page)).toHaveAttribute('data-scene', 'barriers');
});

test('scene picker can be used from the keyboard and Escape returns focus', async ({ page }) => {
  await open(page);
  const picker = page.getByTestId('presentation-picker');
  await picker.focus(); await page.keyboard.press('Enter');
  await expect(picker).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.pres-contents li button').nth(4).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pres-contents')).toHaveCount(0);
  await expect(picker).toBeFocused();
  await page.keyboard.press('Enter');
  await page.locator('.pres-contents li button').nth(4).focus();
  await page.keyboard.press('Enter');
  await expect(active(page)).toHaveAttribute('data-scene', 'detour');
});

test('a single live model stops rendering when hidden; no automatic media navigation', async ({ page }) => {
  await open(page, 'building');
  const model = page.locator('.diorama');
  await expect(model).toHaveCount(1);
  await expect(model).toHaveAttribute('data-render-count', /[1-9]\d*/);
  await expect(model).toHaveAttribute('data-animating', 'false');
  await page.getByTestId('presentation-next').click(); await page.getByTestId('presentation-next').click();
  await expect(active(page)).toHaveAttribute('data-scene', 'uncertainty');
  await page.waitForTimeout(500);
  const before = await model.getAttribute('data-render-count');
  await page.waitForTimeout(600);
  expect(await model.getAttribute('data-render-count')).toBe(before);
  expect(await page.locator('.diorama canvas').count()).toBeLessThanOrEqual(1);
  expect(await page.locator('video').evaluateAll(elements => elements.every(element => (element as HTMLVideoElement).paused))).toBe(true);
  await expect(active(page)).toHaveAttribute('data-scene', 'uncertainty');
});

test('reduced motion navigation and model use no continuous transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await open(page, 'building');
  await expect(page.locator('.diorama')).toHaveAttribute('data-animating', 'false');
  await page.getByTestId('presentation-next').click(); await page.getByTestId('presentation-language-kk').click();
  await expect(active(page)).toHaveAttribute('data-scene', 'detour');
  await expect(page.locator('.diorama')).toHaveAttribute('data-animating', 'false');
  const running = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').map(animation => animation.effect?.getTiming()));
  expect(running).toEqual([]);
});

test('five building phases control the real model and reset to the route', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await open(page, 'building');
  const model = page.locator('.diorama'); const phases = page.locator('.pres-model-phases button');
  await expect(phases).toHaveCount(5);
  await phases.nth(0).click(); await expect(model).toHaveAttribute('data-floor-mode', 'assembled'); await expect(model).toHaveAttribute('data-route-ids', '');
  await phases.nth(1).click(); await expect(model).toHaveAttribute('data-floor-mode', 'expanded');
  await phases.nth(2).click(); await expect(model).toHaveAttribute('data-floor', '1');
  await phases.nth(3).click(); await expect(model).toHaveAttribute('data-floor', '1');
  await phases.nth(4).click(); await expect(model).toHaveAttribute('data-floor-mode', 'expanded'); await expect(model).toHaveAttribute('data-route-ids', /lift-a/);
});

test('explicit real video playback pauses when left and hidden Three rendering stops', async ({ page }, info) => {
  await open(page, 'building'); await expect(page.getByTestId('presentation-video')).toHaveCount(0);
  await page.getByRole('button', { name: /Смотреть запись приложения/ }).click();
  const video = page.getByTestId('presentation-video'); await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('poster', /model-reveal-poster/);
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false);
  await page.waitForTimeout(400);
  const count = await page.locator('.diorama').getAttribute('data-render-count');
  await page.waitForTimeout(400);
  expect(await page.locator('.diorama').getAttribute('data-render-count')).toBe(count);
  await page.screenshot({ path: info.outputPath('explicit-video-playback.png'), fullPage: true });
  const element = await video.elementHandle();
  await page.getByTestId('presentation-next').click();
  await expect(active(page)).toHaveAttribute('data-scene', 'detour');
  expect(await element!.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
  await expect(video).toHaveCount(0);
});

test('video request failure explains the problem and retains a useful poster', async ({ page }, info) => {
  await page.route('**/model-reveal.mp4', route => route.abort('failed'));
  await open(page, 'building');
  await page.getByRole('button', { name: /Смотреть запись приложения/ }).click();
  await expect(page.locator('.pres-recording')).toContainText('не загрузилась');
  const poster = page.locator('.pres-recording img');
  await expect.poll(() => poster.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(400);
  await page.screenshot({ path: info.outputPath('video-failure.png'), fullPage: true });
  await page.getByRole('button', { name: 'Вернуться к живой модели', exact: true }).click();
  await expect(page.locator('.pres-live-model')).toBeVisible();
});

test('WebGL unavailable retains an actual image and usable presentation', async ({ page }, info) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.startsWith('webgl')) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await open(page, 'building');
  await expect(page.getByTestId('presentation-fallback')).toBeVisible();
  const poster = page.getByTestId('presentation-poster').filter({ visible: true }).locator('img');
  await expect(poster).toBeVisible();
  await expect.poll(() => poster.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(400);
  await page.screenshot({ path: info.outputPath('webgl-unavailable.png'), fullPage: true });
  await page.getByTestId('presentation-next').click(); await expect(active(page)).toHaveAttribute('data-scene', 'detour');
});

test('poster failure and no WebGL retain a meaningful 2D fallback', async ({ page }, info) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.startsWith('webgl')) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.route(/\.(?:webp|png|jpe?g)(?:\?.*)?$/, route => route.abort('failed'));
  await open(page, 'building');
  await expect(page.locator('[data-media-fallback="true"]')).toBeVisible();
  await expect(page.getByTestId('floor-plan')).toBeVisible();
  await page.screenshot({ path: info.outputPath('all-media-fallback.png'), fullPage: true });
});

for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844], [375, 667]]) for (const lang of ['ru', 'kk']) {
  test(`visual composition ${width}x${height} ${lang}: all ten scenes`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: width!, height: height! });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'intro', lang);
    for (const [index, scene] of scenes.entries()) {
      await expect(active(page)).toHaveAttribute('data-scene', scene);
      for (const image of await page.locator('img').filter({ visible: true }).all()) {
        await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
      await frames(page);
      await noHorizontalOverflow(page);
      await expect(active(page).getByRole('heading').first()).toBeVisible();
      const heading = await active(page).getByRole('heading').first().boundingBox();
      expect(heading!.x).toBeGreaterThanOrEqual(0);
      expect(heading!.x + heading!.width).toBeLessThanOrEqual(width! + 1);
      await page.screenshot({ path: info.outputPath(`${index + 1}-${scene}.png`), fullPage: true });
      if (['intro', 'building', 'detour', 'finish'].includes(scene)) {
        await info.attach(`${scene}-viewport-geometry`, { body: JSON.stringify({ viewport: page.viewportSize(), model: await page.getByTestId('presentation-model').boundingBox(), footer: await page.locator('.pres-controls').boundingBox(), scene: await active(page).boundingBox() }), contentType: 'application/json' });
      }
      if (index < scenes.length - 1) await page.getByTestId('presentation-next').click();
    }
  });
}

for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844], [375, 667]]) test(`model viewport gate ${width}x${height} KK`, async ({ page }, info) => {
  await page.setViewportSize({ width: width!, height: height! });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'intro', 'kk');
  for (const index of [0, 3, 4, 9]) {
    if (index !== 0) await chooseScene(page, index);
    await page.evaluate(() => scrollTo(0, 0));
    await expect(page.locator('.diorama')).toHaveAttribute('data-animating', 'false');
    const model = (await page.getByTestId('presentation-model').boundingBox())!;
    const footer = (await page.locator('.pres-controls').boundingBox())!;
    const header = (await page.locator('.pres-header').boundingBox())!;
    expect(model.y, `${scenes[index]} model begins below header`).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(model.y + model.height, `${scenes[index]} model stays above footer within border rounding`).toBeLessThanOrEqual(footer.y + 2);
    expect(model.y + model.height, `${scenes[index]} model inside viewport`).toBeLessThanOrEqual(height!);
    expect(model.x).toBeGreaterThanOrEqual(-1); expect(model.x + model.width).toBeLessThanOrEqual(width! + 1);
    const points = JSON.parse((await page.locator('.diorama').getAttribute('data-route-screen-points')) || '[]') as { x: number; y: number }[];
    for (const point of points) { expect(point.x).toBeGreaterThanOrEqual(0); expect(point.x).toBeLessThanOrEqual(model.width); expect(point.y).toBeGreaterThanOrEqual(0); expect(point.y).toBeLessThanOrEqual(model.height); }
    for (const button of await active(page).locator('button').filter({ visible: true }).all()) {
      const box = (await button.boundingBox())!;
      expect(box.y + box.height, `${scenes[index]} action '${await button.innerText()}' above footer`).toBeLessThanOrEqual(footer.y + 1);
    }
    await page.screenshot({ path: info.outputPath(`${scenes[index]}-viewport.png`) });
    if (index === 4) {
      await page.getByTestId('presentation-lift-toggle').click();
      await expect(page.getByTestId('presentation-detour-result')).toHaveAttribute('data-distance', '54');
      await expect(page.locator('.diorama')).toHaveAttribute('data-route-ids', /lift-b/);
      await frames(page);
      const detourPoints = JSON.parse((await page.locator('.diorama').getAttribute('data-route-screen-points')) || '[]') as { x: number; y: number }[];
      expect(detourPoints.length).toBeGreaterThan(3);
      for (const point of detourPoints) { expect(point.x, 'B54 route x inside canvas').toBeGreaterThanOrEqual(0); expect(point.x, 'B54 route x inside canvas').toBeLessThanOrEqual(model.width); expect(point.y, 'B54 route y inside canvas').toBeGreaterThanOrEqual(0); expect(point.y, 'B54 route y inside canvas').toBeLessThanOrEqual(model.height); }
      await page.screenshot({ path: info.outputPath('detour-B54-viewport.png') });
    }
  }
});

for (const [width, height] of [[390, 844], [375, 667]]) for (const lang of ['ru', 'kk']) test(`ordinary mobile slide gate ${width}x${height} ${lang}`, async ({ page }, info) => {
  await page.setViewportSize({ width: width!, height: height! }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'intro', lang);
  const visualSelectors = ['[data-testid="presentation-model"]', '.pres-barriers', '.pres-plan-panel', '[data-testid="presentation-model"]', '[data-testid="presentation-model"]', '.pres-doors', '.pres-phone-figure', '.pres-pipeline', '.pres-pilot-layout', '[data-testid="presentation-model"]'];
  for (const [index, scene] of scenes.entries()) {
    await expect(active(page)).toHaveAttribute('data-scene', scene);
    await page.evaluate(() => scrollTo(0, 0)); await frames(page);
    expect(await page.evaluate(() => document.documentElement.scrollHeight), `${scene} should be a single normal mobile slide`).toBeLessThanOrEqual(height! + 2);
    const visual = (await page.locator(visualSelectors[index]!).boundingBox())!;
    const footer = (await page.locator('.pres-controls').boundingBox())!;
    expect(visual.y + visual.height, `${scene} significant visual stays above footer`).toBeLessThanOrEqual(footer.y + 1);
    if (scene === 'building') {
      const meta = (await active(page).locator('.pres-route-meta').boundingBox())!;
      expect(meta.y, 'Route metadata must not overlap the model or its caption').toBeGreaterThanOrEqual(visual.y + visual.height - 1);
    }
    const title = (await active(page).getByRole('heading').first().boundingBox())!;
    expect(title.y + title.height).toBeLessThanOrEqual(footer.y);
    await page.screenshot({ path: info.outputPath(`${scene}-phone-viewport.png`) });
    if (index < 9) await page.getByTestId('presentation-next').click();
  }
});

test('mobile CDP horizontal swipe navigates; vertical touch scroll and select input remain native', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const base = test.info().project.use.baseURL as string;
  await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) && new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  await page.goto(`${base}/presentation?scene=barriers&lang=kk`);
  await expect(active(page)).toHaveAttribute('data-scene', 'barriers');
  const cdp = await context.newCDPSession(page);
  await swipe(page, cdp, -160, 2); await expect(active(page)).toHaveAttribute('data-scene', 'route');
  const select = active(page).locator('select').first();
  await select.focus(); await page.keyboard.press('ArrowDown');
  await expect(active(page)).toHaveAttribute('data-scene', 'route');
  await page.goto(`${base}/presentation?scene=pilot&lang=kk`);
  await page.getByRole('button', { name: 'Ірі мәтін', exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  const before = await page.evaluate(() => scrollY);
  await swipe(page, cdp, 0, -130);
  await expect(active(page)).toHaveAttribute('data-scene', 'pilot');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  await page.screenshot({ path: info.outputPath('mobile-native-touch.png'), fullPage: true });
  await context.close();
});

test('Kazakh built-in large text remains readable without horizontal clipping', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await open(page, 'uncertainty', 'kk');
  const before = await active(page).locator('.pres-body').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  await page.getByRole('button', { name: 'Ірі мәтін', exact: true }).click();
  await expect(page.getByTestId('presentation-root')).toHaveClass(/pres-large-text/);
  expect(await active(page).locator('.pres-body').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(before);
  for (const scene of ['uncertainty', 'mobile', 'system', 'pilot', 'finish']) {
    await expect(active(page)).toHaveAttribute('data-scene', scene);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`large-${scene}.png`), fullPage: true });
    if (scene !== 'finish') await page.getByTestId('presentation-next').click();
  }
});

for (const lang of ['ru', 'kk']) test(`print mode ${lang} contains ten static complete scenes and real links`, async ({ page, request }, info) => {
  await page.goto(`/presentation?print=1&lang=${lang}`);
  await expect(active(page)).toHaveCount(10);
  expect(await active(page).evaluateAll(elements => elements.map(element => element.getAttribute('data-scene')))).toEqual(scenes);
  await expect(page.locator('canvas, video')).toHaveCount(0);
  for (const section of await active(page).all()) await expect(section.getByRole('heading').first()).toBeVisible();
  for (const image of await page.locator('img').all()) await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const links = await page.locator('a[href]').evaluateAll(elements => elements.map(element => (element as HTMLAnchorElement).href));
  expect(links.some(link => new URL(link).pathname === '/')).toBe(true);
  for (const link of [...new Set(links)].filter(link => new URL(link).origin === new URL(page.url()).origin)) {
    const response = await request.get(link); expect(response.status(), link).toBeLessThan(400);
  }
  await page.screenshot({ path: info.outputPath(`print-${lang}.png`), fullPage: true });
});

test('navigator retains A40, B54, strict both-lifts closure, RU/KK, 2D/3D and read-only journal', async ({ page, baseURL }, info) => {
  await page.goto('/');
  const result = page.getByTestId('route-result');
  await expect(result.locator('.distance')).toHaveText('40м');
  expect(await result.getAttribute('data-route-ids')).toContain('lift-a');
  const requirements = await page.evaluate(() => JSON.parse(localStorage.getItem('navigator-scenario-v1')!).scenario.requirements);
  await page.locator('#closure-settings summary').click();
  await page.getByRole('checkbox', { name: 'Лифт A', exact: true }).check();
  await expect(result.locator('.distance')).toHaveText('54м');
  const detour = await result.getAttribute('data-route-ids'); expect(detour).toContain('lift-b');
  await page.getByRole('button', { name: 'Қазақша', exact: true }).click();
  await expect(result).toHaveAttribute('data-route-ids', detour!);
  await page.locator('.view-switch button').nth(1).click(); await expect(page.locator('.primary-plan')).toBeVisible();
  await page.locator('.view-switch button').first().click(); await expect(page.locator('.diorama')).toHaveAttribute('data-render-count', /[1-9]\d*/);
  await page.getByRole('button', { name: 'Русский', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Лифт B', exact: true }).check();
  await expect(result).not.toContainText('54м');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('navigator-scenario-v1')!).scenario.requirements)).toEqual(requirements);
  await expect(page.getByTestId('report-journal')).toBeVisible();
  if (new URL(baseURL!).hostname !== '127.0.0.1') {
    const health = await page.request.get('/api/health', { timeout: 75_000 }); expect(health.status()).toBe(200);
    const journal = await page.request.get('/api/reports?limit=1', { timeout: 75_000 }); expect(journal.status()).toBe(200);
  }
  await page.screenshot({ path: info.outputPath('navigator-readonly-regression.png'), fullPage: true });
});

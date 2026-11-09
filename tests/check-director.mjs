import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', route => route.fulfill({ json: { items: [], nextCursor: null, status: 'ok', mode: 'public-demo' } }));
  await page.goto('http://127.0.0.1:5380/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Number(document.querySelector('.diorama')?.getAttribute('data-render-count')) > 0);
  const navigator = await page.locator('.diorama').evaluate(el => ({ renders: el.dataset.renderCount, hasDirector: 'directorPose' in el.dataset, ids: el.dataset.routeIds }));
  assert.equal(navigator.hasDirector, false);
  await page.evaluate(() => document.querySelector('[data-testid="diorama-canvas"]').dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await page.waitForSelector('.primary-plan');
  assert.equal(await page.locator('[data-testid="diorama-canvas"]').count(), 0);
  await page.goto('http://127.0.0.1:5380/presentation?scene=building', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ITER_DIRECTOR__?.controller));
  const result = await page.evaluate(() => {
    const { pose, controller } = window.__ITER_DIRECTOR__;
    const el = document.querySelector('.diorama');
    Object.assign(pose, { spread: .8, routeProgress: .37, cutaway: .5 }); controller.apply();
    const before = JSON.parse(el.dataset.renderStats);
    const canvas = el.querySelector('canvas'); const dimensions = [canvas.width, canvas.height];
    const capture = controller.capture();
    const after = JSON.parse(el.dataset.renderStats);
    pose.routeProgress = .12; controller.apply();
    return { before, after, dimensions, restored: [canvas.width, canvas.height], pose: JSON.parse(el.dataset.directorPose), capturePose: capture.pose, hasPNG: capture.dataUrl.startsWith('data:image/png;base64,') };
  });
  assert.deepEqual(result.dimensions, result.restored);
  assert.equal(result.before.geometries, result.after.geometries);
  assert.equal(result.before.textures, result.after.textures);
  assert.equal(result.pose.routeProgress, .12);
  assert.equal(result.capturePose.routeProgress, .37);
  assert.equal(result.hasPNG, true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ navigator, director: result, errors }, null, 2));
} finally { await browser.close(); }

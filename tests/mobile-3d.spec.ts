import { test, expect } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
type Camera = { yaw: number; zoom: number; panX: number; panY: number; tilt?: number };
type Point = { x: number; y: number; id: number };
const scene = (page: Page) => page.locator('.diorama');
const camera = async (page: Page): Promise<Camera> => JSON.parse((await scene(page).getAttribute('data-camera'))!);
const failures = new WeakMap<Page, string[]>();
async function center(page: Page) {
  await scene(page).evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  const bounds = (await scene(page).boundingBox())!;
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
async function frames(page: Page) { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points: Point[]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(point => ({ ...point, radiusX: 5, radiusY: 5, force: 1 })) });
}
async function swipe(page: Page, cdp: CDPSession, dx: number, dy: number) {
  const c = await center(page); await touch(cdp, 'touchStart', [{ ...c, id: 1 }]);
  for (let i = 1; i <= 8; i++) { await touch(cdp, 'touchMove', [{ x: c.x + dx * i / 8, y: c.y + dy * i / 8, id: 1 }]); await frames(page); }
  await touch(cdp, 'touchEnd', []); await frames(page);
}
async function pinch(page: Page, cdp: CDPSession, start: number, finish: number, pan = 0) {
  const c = await center(page);
  const points = (distance: number, fraction: number) => [{ x: c.x - distance / 2 + pan * fraction, y: c.y, id: 1 }, { x: c.x + distance / 2 + pan * fraction, y: c.y, id: 2 }];
  await touch(cdp, 'touchStart', points(start, 0));
  for (let i = 1; i <= 10; i++) { await touch(cdp, 'touchMove', points(start + (finish - start) * i / 10, i / 10)); await frames(page); }
  await touch(cdp, 'touchEnd', []); await frames(page);
}
async function open3d(page: Page) {
  await page.goto('/'); await expect(page.locator('.primary-plan')).toBeVisible();
  await page.locator('.view-switch button').first().click();
  await expect(scene(page)).toHaveAttribute('data-render-count', /[1-9]\d*/);
  await expect(scene(page)).toHaveAttribute('data-animating', 'false');
}
test.beforeEach(async ({ page, context, baseURL }) => {
  failures.set(page, []); page.on('pageerror', error => failures.get(page)!.push(error.message));
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin && ['GET','HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
  if(new URL(baseURL!).hostname==='127.0.0.1') await page.route('**/api/**', route => route.fulfill({ json: { status: 'ok', mode: 'public-demo', reports: [], items: [], nextCursor: null } }));
  await page.addInitScript(() => localStorage.setItem('iter-language-v1', 'ru'));
});
test.afterEach(async ({ page }) => expect(failures.get(page), 'Unexpected page errors').toEqual([]));

test('default mobile horizontal touch rotates and two-finger pinch zooms with limits while route survives RU/KK', async ({ page, context }, info) => {
  await open3d(page); const cdp = await context.newCDPSession(page);
  const route = await page.getByTestId('route-result').getAttribute('data-route-ids');
  const initial = await camera(page); await swipe(page, cdp, 85, 2);
  await expect.poll(async () => (await camera(page)).yaw).not.toBe(initial.yaw);
  const beforePinch = (await camera(page)).zoom; await pinch(page, cdp, 70, 160);
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(beforePinch);
  await pinch(page, cdp, 45, 220); expect((await camera(page)).zoom).toBeCloseTo(1.8, 2);
  await pinch(page, cdp, 240, 25); expect((await camera(page)).zoom).toBeCloseTo(.6, 2);
  expect(await page.evaluate(() => window.visualViewport!.scale)).toBeCloseTo(1, 2);
  await page.getByRole('button', { name: 'Қазақша', exact: true }).click();
  await expect(page.getByTestId('route-result')).toHaveAttribute('data-route-ids', route!);
  await expect(scene(page)).toHaveAttribute('data-route-ids', route!);
  await swipe(page, cdp, -65, 0); await expect(scene(page)).toHaveAttribute('data-dragging', 'false');
  await page.screenshot({ path: info.outputPath('touch-rotate-pinch-kk.png'), fullPage: true });
});

test('vertical touch scrolls normally; explicit capture enables pan then disable/reset release it', async ({ page, context }) => {
  await open3d(page); const cdp = await context.newCDPSession(page);
  await center(page); const y = await page.evaluate(() => scrollY); const initial = await camera(page);
  await swipe(page, cdp, 0, -90);
  await expect.poll(async () => page.evaluate(() => scrollY)).toBeGreaterThan(y + 25);
  expect((await camera(page)).yaw).toBeCloseTo(initial.yaw, 1);
  await page.getByRole('button', { name: 'Жесты камеры', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-gestures', 'true');
  await center(page); const lockedY = await page.evaluate(() => scrollY);
  await swipe(page, cdp, 0, -70); expect(await page.evaluate(() => scrollY)).toBeCloseTo(lockedY, 0);
  const beforePan = await camera(page); await pinch(page, cdp, 100, 100, 40);
  expect((await camera(page)).panX).not.toBe(beforePan.panX);
  await page.getByRole('button', { name: 'Жесты камеры', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-gestures', 'false');
  await center(page); const releasedY = await page.evaluate(() => scrollY); await swipe(page, cdp, 0, -80);
  await expect.poll(async () => page.evaluate(() => scrollY)).toBeGreaterThan(releasedY + 25);
  await page.getByRole('button', { name: 'Жесты камеры', exact: true }).click();
  await page.locator('.camera-disclosure summary').click(); await page.getByRole('button', { name: 'Сброс камеры', exact: true }).click();
  await expect(scene(page)).toHaveAttribute('data-gestures', 'false'); await expect(scene(page)).toHaveAttribute('data-dragging', 'false');
  await center(page); const resetY = await page.evaluate(() => scrollY); await swipe(page, cdp, 0, -80);
  await expect.poll(async () => page.evaluate(() => scrollY)).toBeGreaterThan(resetY + 25);
});

test('accessible buttons, touch cancellation, resize and 2D/3D switching keep route and usable gestures', async ({ page, context }) => {
  await open3d(page); const cdp = await context.newCDPSession(page);
  const route = await page.getByTestId('route-result').getAttribute('data-route-ids');
  await page.locator('.camera-disclosure summary').click(); const before = await camera(page);
  await page.getByRole('button', { name: 'Увеличить масштаб', exact: true }).click();
  expect((await camera(page)).zoom).toBeGreaterThan(before.zoom);
  await page.getByRole('button', { name: 'Уменьшить масштаб', exact: true }).click();
  expect((await camera(page)).zoom).toBeCloseTo(before.zoom, 2);
  const c = await center(page); await touch(cdp, 'touchStart', [{ ...c, id: 1 }]);
  await touch(cdp, 'touchMove', [{ x: c.x + 45, y: c.y, id: 1 }]); await touch(cdp, 'touchCancel', []);
  await expect(scene(page)).toHaveAttribute('data-dragging', 'false');
  const two = await center(page);
  await touch(cdp, 'touchStart', [{ x: two.x - 45, y: two.y, id: 1 }, { x: two.x + 45, y: two.y, id: 2 }]);
  await touch(cdp, 'touchMove', [{ x: two.x - 60, y: two.y, id: 1 }, { x: two.x + 60, y: two.y, id: 2 }]);
  await touch(cdp, 'touchCancel', []); await expect(scene(page)).toHaveAttribute('data-dragging', 'false');
  const size = page.viewportSize()!; await page.setViewportSize({ width: size.width, height: size.height - 80 });
  await swipe(page, cdp, 50, 0); await expect(scene(page)).toHaveAttribute('data-dragging', 'false');
  await page.locator('.view-switch button').nth(1).click();
  await expect(page.locator('.primary-plan')).toBeVisible(); await expect(page.getByTestId('route-result')).toHaveAttribute('data-route-ids', route!);
  await page.locator('.view-switch button').first().click(); await expect(scene(page)).toHaveAttribute('data-render-count', /[1-9]\d*/);
  const resumed = await camera(page); await swipe(page, cdp, -55, 0);
  await expect.poll(async () => (await camera(page)).yaw).not.toBe(resumed.yaw);
  await expect(scene(page)).toHaveAttribute('data-route-ids', route!);
});

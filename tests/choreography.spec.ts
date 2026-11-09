import { test, expect } from '@playwright/test';

test('fallback settles after navigation and context loss during motion', async ({ page }) => {
  await page.goto('/presentation?scene=building');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
  await page.keyboard.press('ArrowLeft');
  await page.locator('.pres-live-model canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.getByTestId('presentation-fallback')).toBeVisible();
  for (const scene of ['building', 'detour', 'uncertainty']) {
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('presentation-scene')).toHaveAttribute('data-scene', scene);
    await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
    await expect(page.locator('.pres-copy-column')).toHaveCSS('opacity', '1');
  }
  await page.addInitScript(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) { return String(args[0]).includes('webgl') ? null : original.apply(this, args); } as typeof original; });
  await page.goto('/presentation?scene=intro');
  await expect(page.getByTestId('presentation-fallback')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
});

test('host percentage positioning has no extra pixel offset at all target sizes', async ({ page }) => {
  for (const [width, height] of [[1366, 768], [1536, 864], [390, 844], [375, 667]]) {
    await page.setViewportSize({ width, height });
    for (const scene of ['intro', 'route', 'building', 'detour']) {
      await page.goto(`/presentation?scene=${scene}`);
      await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
      const boxes = await page.locator('.pres-model').evaluate(host => ({ host: host.getBoundingClientRect().toJSON(), stage: host.parentElement!.getBoundingClientRect().toJSON() }));
      expect(boxes.host.top).toBeGreaterThanOrEqual(boxes.stage.top - 1);
      expect(boxes.host.bottom).toBeLessThanOrEqual(boxes.stage.bottom + 1);
    }
  }
});

test('one canvas survives forward, reverse, rapid keys and history', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/presentation?scene=intro');
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
  await page.locator('.pres-live-model canvas').evaluate(element => element.setAttribute('data-persistent-test', 'original'));
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-yaw', '52');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('presentation-scene')).toHaveAttribute('data-scene', 'building');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-route-progress', '1');
  await expect(page.locator('.pres-route-meta')).toHaveCSS('opacity', '1');
  await expect(page.locator('.pres-live-model canvas')).toHaveAttribute('data-persistent-test', 'original');
  await page.goBack(); await expect(page.getByTestId('presentation-scene')).toHaveAttribute('data-scene', 'route');
  expect(errors).toEqual([]);
});

test('reduced motion settles immediately and never plays intro', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/presentation?scene=intro');
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0);
  await page.getByTestId('presentation-next').click();
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-yaw', '52');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
});

test('mobile uses the same 16:9 model and film rectangle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/presentation?scene=intro');
  const box = await page.getByTestId('presentation-model').boundingBox();
  expect(box).not.toBeNull(); expect(box!.width / box!.height).toBeCloseTo(16 / 9, 2);
  await expect(page.getByTestId('presentation-next')).toBeVisible();
});

test('conditions isolate one real feature and calculate only on request', async ({ page }) => {
  await page.goto('/presentation?scene=route');
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-yaw', '22');
  await expect(page.getByTestId('presentation-route-result')).toHaveCount(0);
  for (const [index, anchor, yaw] of [[0, 'stairs-0', '22'], [1, 'door-204', '-28'], [2, 'lift-a-0', '-42']] as const) {
    await page.getByTestId(`condition-${index}`).click();
    await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-yaw', yaw);
    await expect(page.locator('.pres-object-annotations span')).toHaveCount(1);
    await expect(page.locator('.pres-object-annotations span')).toHaveAttribute('data-anchor', anchor);
    await expect(page.locator('.pres-object-annotations span')).toBeVisible();
    await expect(page.getByTestId(`condition-${index}`)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.locator('.pres-route-disclosure summary').click();
  await expect(page.getByTestId('presentation-route-result')).toHaveCount(0);
  await page.getByRole('button', { name: 'Рассчитать маршрут' }).click();
  await expect(page.getByTestId('presentation-route-result')).toHaveAttribute('data-distance', '40');
});

test('short phone conditions keep RU and KK copy above the model', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  for (const lang of ['ru', 'kk']) {
    await page.goto(`/presentation?scene=route&lang=${lang}`);
    await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-yaw', '22');
    for (const condition of [0, 1, 2]) {
      await page.getByTestId(`condition-${condition}`).click();
      await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
      const note = await page.locator('.pres-scene-note').boundingBox();
      const model = await page.getByTestId('presentation-model').boundingBox();
      expect(note!.y + note!.height).toBeLessThan(model!.y);
      await expect(page.locator('.pres-object-annotations span')).toBeVisible();
    }
    await page.locator('.pres-route-disclosure summary').click();
    await expect(page.getByRole('button', { name: lang === 'kk' ? 'Маршрутты есептеу' : 'Рассчитать маршрут' })).toBeVisible();
  }
});

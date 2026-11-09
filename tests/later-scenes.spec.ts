import { test, expect } from '@playwright/test';

test('detour swaps route only at zero, reveals B, then reports 54 metres', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/presentation?scene=detour');
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-route-progress', '1');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
  await page.evaluate(() => {
    const state = window as unknown as { detourSamples: { route: string; progress: number; distance: string | null }[] };
    state.detourSamples = [];
    const started = performance.now();
    const record = () => {
      state.detourSamples.push({ route: document.querySelector<HTMLElement>('.pres-model .diorama')?.dataset.directionNodes ?? '', progress: Number(document.querySelector<HTMLElement>('.pres-model')?.dataset.routeProgress), distance: document.querySelector('[data-testid="presentation-detour-result"]')?.getAttribute('data-distance') ?? null });
      if (performance.now() - started < 2100) requestAnimationFrame(record);
    }; record();
  });
  await page.getByTestId('presentation-lift-toggle').click();
  await expect(page.getByTestId('presentation-detour-result')).toHaveAttribute('data-distance', '54');
  const samples = await page.evaluate(() => (window as unknown as { detourSamples: { route: string; progress: number; distance: string | null }[] }).detourSamples);
  const firstB = samples.find(sample => sample.route.includes('lift-b-0'));
  expect(firstB).toBeDefined(); expect(firstB!.progress).toBeLessThan(.2);
  expect(samples.filter(sample => sample.distance === '54').every(sample => sample.progress >= .999)).toBe(true);
  await page.getByTestId('presentation-lift-toggle').click();
  await page.waitForTimeout(90);
  await page.getByTestId('presentation-lift-toggle').click();
  await page.waitForTimeout(80);
  await page.getByTestId('presentation-lift-toggle').click();
  await expect(page.getByTestId('presentation-detour-result')).toHaveAttribute('data-distance', '40');
  await page.getByTestId('presentation-lift-toggle').click();
  await expect(page.getByTestId('presentation-detour-result')).toHaveAttribute('data-distance', '54');
  const atDeparture = await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    return JSON.parse(document.querySelector('.diorama')!.getAttribute('data-director-pose')!).routeProgress;
  });
  expect(atDeparture).toBe(0);
  await expect(page.getByTestId('presentation-scene')).toHaveAttribute('data-scene', 'building');
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-route-progress', '1');
  expect(errors).toEqual([]);
});

test('floor and room phases have distinct focused states and final building reassembles', async ({ page }) => {
  await page.goto('/presentation?scene=building');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
  await page.getByRole('button', { name: 'Второй этаж', exact: true }).click();
  await expect.poll(async () => JSON.parse((await page.locator('.diorama').getAttribute('data-director-pose'))!).focusFloor1).toBe(1);
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
  const floor = JSON.parse((await page.locator('.diorama').getAttribute('data-director-pose'))!);
  await page.getByRole('button', { name: 'Аудитория 204', exact: true }).click();
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
  const room = JSON.parse((await page.locator('.diorama').getAttribute('data-director-pose'))!);
  expect(room.zoom).toBeGreaterThan(floor.zoom); expect(room.targetZ).not.toBe(floor.targetZ);
  await page.locator('.pres-live-model canvas').evaluate(element => element.setAttribute('data-survives', 'yes'));
  for (let i = 0; i < 6; i++) await page.getByTestId('presentation-next').click();
  await expect(page.getByTestId('presentation-scene')).toHaveAttribute('data-scene', 'finish');
  await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
  const final = JSON.parse((await page.locator('.diorama').getAttribute('data-director-pose'))!);
  expect(final.spread).toBe(0); expect(final.cutaway).toBe(0); expect(final.yaw).toBe(-38);
  await expect(page.locator('.pres-live-model canvas')).toHaveAttribute('data-survives', 'yes');
});

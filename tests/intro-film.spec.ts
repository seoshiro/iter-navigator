import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import type { DioramaDirectorController } from '../src/ui/dioramaDirector';

test('real Kling intro hands off to one live canvas, then first four scenes', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/presentation?scene=intro');
  const film = page.getByTestId('presentation-intro-film');
  await expect(film).toBeVisible();
  await expect(film.locator('video')).toHaveAttribute('src', '/presentation/media/intro-kling.mp4');
  await page.locator('.pres-live-model canvas').evaluate(element => element.setAttribute('data-intro-canvas', 'original'));
  await expect(film).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready', 'true');
  await page.screenshot({ path: testInfo.outputPath('live-after-intro.png') });
  for (const scene of ['barriers', 'route', 'building']) {
    await page.getByTestId('presentation-next').click();
    await expect(page.getByTestId('presentation-scene')).toHaveAttribute('data-scene', scene);
    await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
    await page.waitForTimeout(350);
  }
  await expect(page.locator('.pres-live-model canvas')).toHaveAttribute('data-intro-canvas', 'original');
  await expect(page.locator('.pres-route-meta')).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

for (const method of ['button', 'escape', 'leave'] as const) test(`intro ${method} stops playback and never replays on return`, async ({ page }) => {
  await page.goto('/presentation?scene=intro');
  await expect(page.getByTestId('presentation-intro-film')).toHaveAttribute('data-playing', 'true');
  await page.evaluate(() => { (window as unknown as { oldIntro: HTMLVideoElement }).oldIntro = document.querySelector('.pres-intro-film video')!; });
  if (method === 'button') await page.getByRole('button', { name: /Пропустить вступление/ }).click();
  if (method === 'escape') await page.keyboard.press('Escape');
  if (method === 'leave') await page.getByTestId('presentation-next').click();
  await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { oldIntro: HTMLVideoElement }).oldIntro.paused)).toBe(true);
  if (method !== 'leave') await page.getByTestId('presentation-next').click();
  await page.getByTestId('presentation-prev').click();
  await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0);
});

test('failed media and reduced motion keep navigation immediate', async ({ page }) => {
  await page.route('**/intro-kling.mp4', route => route.abort());
  await page.goto('/presentation?scene=intro');
  await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0);
  await page.getByTestId('presentation-next').click();
  await expect(page.getByTestId('presentation-scene')).toHaveAttribute('data-scene', 'barriers');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/presentation?scene=intro');
  await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0);
  await expect(page.getByTestId('presentation-model')).toHaveAttribute('data-ready', 'true');
});

test('hidden document stops and retires the intro', async ({ page }) => {
  await page.goto('/presentation?scene=intro');
  await expect(page.getByTestId('presentation-intro-film')).toHaveAttribute('data-playing', 'true');
  const stopped = await page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>('.pres-intro-film video')!;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    return video.paused;
  });
  expect(stopped).toBe(true);
  await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0);
});

test('desktop and mobile film end/live reference share the exact projection rectangle', async ({ page }, testInfo) => {
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await page.goto('/presentation?scene=intro');
    const film = page.getByTestId('presentation-intro-film');
    await expect(film).toHaveAttribute('data-playing', 'true');
    await expect(page.getByTestId('presentation-root')).toHaveAttribute('data-settled', 'true');
    await page.locator('.pres-intro-film video').evaluate(async (video: HTMLVideoElement) => {
      video.pause(); video.currentTime = video.duration - .08;
      await new Promise<void>(resolve => video.addEventListener('seeked', () => resolve(), { once: true }));
    });
    const filmBox = await film.locator('video').boundingBox();
    const liveBox = await page.locator('.pres-live-model canvas').boundingBox();
    expect(filmBox).toEqual(liveBox);
    await page.screenshot({ path: testInfo.outputPath(`handoff-${width}-film.png`) });
    const captured = await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('.pres-intro-film video')!;
      const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
      canvas.getContext('2d')!.drawImage(video, 0, 0, 1920, 1080);
      const director = (window as unknown as { __ITER_DIRECTOR__: { controller: DioramaDirectorController } }).__ITER_DIRECTOR__;
      return { film: canvas.toDataURL('image/png'), live: director.controller.capture({ width: 1920, height: 1080, clean: true }).dataUrl };
    });
    for (const [kind, data] of Object.entries(captured)) writeFileSync(testInfo.outputPath(`handoff-${width}-${kind}-clean.png`), Buffer.from(data.split(',')[1]!, 'base64'));
    await page.getByRole('button', { name: /Пропустить вступление/ }).click();
    await page.screenshot({ path: testInfo.outputPath(`handoff-${width}-live.png`) });
  }
});

test('loading film shows start poster and allows an immediate skip', async ({ page }) => {
  await page.route('**/intro-kling.mp4', async route => { await new Promise(resolve => setTimeout(resolve, 1500)); await route.continue().catch(() => {}); });
  await page.goto('/presentation?scene=intro', { waitUntil: 'domcontentloaded' });
  const state = await page.locator('.pres-intro-film').evaluate(element => {
    const video = element.querySelector('video')!;
    const state = { poster: video.getAttribute('poster'), opacity: getComputedStyle(element).opacity, readyState: video.readyState };
    element.querySelector('button')!.click();
    return state;
  });
  expect(state.poster).toBe('/presentation/media/intro-start.png');
  expect(state.opacity).toBe('1');
  expect(state.readyState).toBeLessThan(3);
  await expect(page.getByTestId('presentation-intro-film')).toHaveCount(0);
});

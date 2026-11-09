import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = '.local/director-reference';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5380/presentation?scene=intro', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__ITER_DIRECTOR__?.controller), { timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('.diorama')?.getAttribute('data-material-source') === 'higgsfield-limestone', { timeout: 30000 });
  const captures = await page.evaluate(() => {
    const { pose, controller } = window.__ITER_DIRECTOR__;
    const saved = Object.fromEntries(Object.entries(pose).filter(([key]) => key !== '_gsap'));
    const canvas = document.querySelector('[data-testid="diorama-canvas"]');
    const originalSize = [canvas.width, canvas.height];
    Object.assign(pose, { yaw: -38, zoom: .9, tilt: 0, panX: 0, panY: 0, targetX: 16, targetY: 4, targetZ: 11, spread: 0, cutaway: 0, routeProgress: 0, labels: 0, entrance: 0, stairs: 0, door: 0, lift: 0 });
    const end = controller.capture();
    pose.yaw = -50;
    const start = controller.capture();
    Object.assign(pose, saved); controller.apply();
    return { start, end, originalSize, restoredSize: [canvas.width, canvas.height], restoredPose: saved };
  });
  for (const name of ['start', 'end']) {
    const capture = captures[name];
    await writeFile(`${directory}/${name}.png`, Buffer.from(capture.dataUrl.split(',')[1], 'base64'));
    delete capture.dataUrl;
  }
  if (JSON.stringify(captures.originalSize) !== JSON.stringify(captures.restoredSize)) throw new Error('Capture changed canvas dimensions');
  await writeFile(`${directory}/metadata.json`, JSON.stringify(captures, null, 2));
  console.log(JSON.stringify(captures, null, 2));
} finally { await browser.close(); }

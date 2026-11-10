import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CreateReport, Report } from '../shared/report-contract';

const origin = 'http://127.0.0.1:5276';
const localeKey = 'iter-language-v1';
const reportKey = 'iter:report-draft:v1:demo-prosvet-v1:public-demo';
const json = (route: Route, data: unknown, status = 200) => route.fulfill({ status, json: data });
const start = (page: Page) => page.locator('select[aria-describedby="start-description"]');
const goal = (page: Page) => page.locator('select[aria-describedby="destination-description"]');

async function isolate(context: BrowserContext) {
  // This suite must never read or mutate the public journal or any other remote service.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/api/')) return json(route, { status: 'ok', mode: 'public-demo', reports: [], items: [], nextCursor: null });
    return route.continue();
  });
}

async function openEnglish(page: Page, view: '2d' | '3d' = '2d') {
  await page.addInitScript(({ localeKey, view }) => {
    if (!localStorage.getItem(localeKey)) localStorage.setItem(localeKey, 'en');
    if (!localStorage.getItem('iter-model-view-v1')) localStorage.setItem('iter-model-view-v1', view);
  }, { localeKey, view });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveAttribute('aria-pressed', 'true');
}

async function openDetails(page: Page, selector: string) {
  const details = page.locator(selector).first();
  if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator(':scope > summary').click();
}

async function englishLeaks(page: Page) {
  return page.evaluate(() => {
    const leaks: string[] = [];
    const cyrillic = /\p{Script=Cyrillic}/u;
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      if (element.closest('.language-switch') || element.tagName === 'SCRIPT' || element.tagName === 'STYLE') continue;
      const visible = element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
      if (!visible && element.tagName !== 'OPTION') continue;
      const text = Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(' ').trim();
      for (const value of [text, element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('placeholder'), element.getAttribute('alt')]) {
        if (value && cyrillic.test(value)) leaks.push(`${element.tagName.toLowerCase()}: ${value}`);
      }
    }
    return [...new Set(leaks)];
  });
}

type MockVoice = { voiceURI: string; name: string; lang: string; localService: boolean };
type Spoken = { text: string; lang: string; rate: number; voice: MockVoice | null };
type InstrumentedSpeech = { spoken: Spoken[]; cancellations: number; voices: MockVoice[]; finish: () => void; changeVoices: (voices: MockVoice[]) => void };
declare global { interface Window { __iterEnglishSpeech: InstrumentedSpeech } }

async function mockSpeech(page: Page) {
  await page.addInitScript(() => {
    let last: SpeechSynthesisUtterance | null = null;
    const listeners = new Set<() => void>();
    const state: InstrumentedSpeech = {
      spoken: [], cancellations: 0,
      voices: [
        { voiceURI: 'local-ru', name: 'Russian local fixture', lang: 'ru-RU', localService: true },
        { voiceURI: 'local-kk', name: 'Kazakh local fixture', lang: 'kk-KZ', localService: true },
        { voiceURI: 'remote-en', name: 'English remote fixture', lang: 'en-US', localService: false },
        { voiceURI: 'local-en-us', name: 'English US local fixture', lang: 'en-US', localService: true },
        { voiceURI: 'local-en-gb', name: 'English UK local fixture', lang: 'en-GB', localService: true },
      ],
      finish: () => last?.onend?.(new Event('end') as SpeechSynthesisEvent),
      changeVoices: voices => { state.voices = voices; listeners.forEach(listener => listener()); },
    };
    window.__iterEnglishSpeech = state;
    class Utterance {
      text: string; lang = ''; rate = 1; voice: MockVoice | null = null;
      onend: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => state.voices,
      cancel: () => { state.cancellations++; },
      speak: (phrase: SpeechSynthesisUtterance) => {
        last = phrase;
        state.spoken.push({ text: phrase.text, lang: phrase.lang, rate: phrase.rate, voice: phrase.voice });
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    } });
  });
}

test.beforeEach(async ({ context }) => { await isolate(context); });

test('English covers expanded navigator, room search in all three languages, and reload', async ({ page }, info) => {
  await openEnglish(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/accessible|route|navigator/i);
  for (const query of ['Library', 'библиотека', 'кітапхана']) {
    await page.getByRole('searchbox').fill(query);
    await expect(page.locator('.room-results button')).toHaveCount(1);
    await expect(page.locator('.room-results button')).toContainText('Library');
  }
  await page.getByRole('searchbox').fill('Library');
  await page.locator('.room-results button').click();
  await expect(page.getByTestId('room-card')).toContainText('Library');
  await page.getByTestId('room-card').getByRole('button').nth(1).click();
  await expect(goal(page)).toHaveValue('room-library');
  for (const summary of await page.locator('details > summary').all()) {
    if (!(await summary.evaluate(element => (element.parentElement as HTMLDetailsElement).open))) await summary.click();
  }
  expect(await englishLeaks(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('english-expanded-library.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(goal(page)).toHaveValue('room-library');
});

test('RU to KK to EN preserves endpoints, requirements, alternative, current step and display settings', async ({ page }) => {
  await openEnglish(page);
  await page.getByRole('button', { name: 'Русский', exact: true }).click();
  await start(page).selectOption('room-204');
  await goal(page).selectOption('entrance');
  await openDetails(page, '#requirements-settings');
  await page.locator('#requirements-settings input[type=number]').first().fill('95');
  await page.locator('#requirements-settings input[type=number]').last().fill('4');
  await openDetails(page, '#display-settings details');
  await page.locator('#display-settings select').first().selectOption('light');
  await page.locator('#display-settings fieldset input[type=checkbox]').first().check();
  await page.locator('#display-settings fieldset input[type=checkbox]').last().check();
  await openDetails(page, '.variant-disclosure');
  await page.locator('[data-variant-index="1"]').click();
  await openDetails(page, '.compact-guidance-options');
  await page.locator('.compact-guidance-options select').selectOption('1');
  const before = await page.getByTestId('route-result').getAttribute('data-route-ids');
  const saved = await page.evaluate(() => ({ scenario: localStorage.getItem('navigator-scenario-v1'), display: localStorage.getItem('navigator-display-v1') }));
  expect(saved.scenario).not.toBeNull();
  for (const [name, language] of [['Қазақша', 'kk-KZ'], ['English', 'en-US']] as const) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(start(page)).toHaveValue('room-204');
    await expect(goal(page)).toHaveValue('entrance');
    await expect(page.locator('#requirements-settings input[type=number]').first()).toHaveValue('95');
    await expect(page.locator('#requirements-settings input[type=number]').last()).toHaveValue('4');
    await expect(page.getByTestId('route-result')).toHaveAttribute('data-route-ids', before!);
    await expect(page.locator('[data-variant-index="1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', '1');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
    expect(await page.evaluate(() => ({ scenario: localStorage.getItem('navigator-scenario-v1'), display: localStorage.getItem('navigator-display-v1') }))).toEqual(saved);
  }
  expect(await englishLeaks(page)).toEqual([]);
});

test('English preserves 40 m via A, 54 m via B, blocked, strict unknown, opted unknown and same-point routes', async ({ page }) => {
  await openEnglish(page);
  const result = page.getByTestId('route-result');
  await expect(result.locator('.distance')).toHaveText(/40\s*m/);
  await expect(result).toHaveAttribute('data-route-ids', /lift-a/);
  await openDetails(page, '#closure-settings');
  const closures = page.locator('#closure-settings input[type=checkbox]');
  await closures.nth(0).check();
  await expect(result.locator('.distance')).toHaveText(/54\s*m/);
  await expect(result).toHaveAttribute('data-route-ids', /lift-b/);
  await closures.nth(1).check();
  await expect(result).toHaveAttribute('data-route-state', 'no-route');
  expect(await englishLeaks(page)).toEqual([]);
  await closures.nth(0).uncheck(); await closures.nth(1).uncheck();
  await goal(page).selectOption('room-205');
  await expect(result).toHaveAttribute('data-route-state', 'insufficient');
  expect(await englishLeaks(page)).toEqual([]);
  await openDetails(page, '#requirements-settings');
  await page.locator('.unknown-choice input').check();
  await expect(result).toHaveAttribute('data-route-state', 'uncertain');
  await expect(result.locator('.distance')).toHaveText(/46\s*m/);
  await start(page).selectOption('room-205');
  await expect(result.locator('.distance')).toHaveText(/0\s*m/);
  expect(await englishLeaks(page)).toEqual([]);
});

test('English share, local QR points and invalid links stay safe and translated', async ({ page, context }) => {
  await openEnglish(page);
  await goal(page).selectOption('room-library');
  await openDetails(page, '#requirements-settings');
  await page.locator('#requirements-settings input[type=number]').first().fill('100');
  await openDetails(page, '.share-panel');
  await page.locator('.share-panel > button').first().click();
  const link = await page.locator('.share-panel input[readonly]').inputValue();
  const shared = await context.newPage();
  await shared.goto(link);
  await expect(goal(shared)).toHaveValue('room-library');
  await openDetails(shared, '#requirements-settings');
  await expect(shared.locator('#requirements-settings input[type=number]').first()).toHaveValue('100');
  await shared.close();
  await page.locator('.share-panel > button').last().click();
  await expect(page.locator('.qr-grid img')).toHaveCount(3);
  const links = await page.locator('.qr-grid a:not([download])').evaluateAll(elements => elements.map(element => (element as HTMLAnchorElement).href));
  expect(links.map(link => new URL(link).searchParams.get('start'))).toEqual(['entrance', 'hall-1', 'room-library']);
  for (const link of links) {
    const qr = await context.newPage(); await qr.goto(link);
    await expect(start(qr)).toHaveValue(new URL(link).searchParams.get('start')!);
    await qr.close();
  }
  expect(await englishLeaks(page)).toEqual([]);
  await page.goto('/?model=iter-demo-v1&start=bad');
  await expect(page.locator('.link-warning')).toBeVisible();
  expect(await englishLeaks(page)).toEqual([]);
});

test('English WebGL context loss switches to an equivalent working 2D route', async ({ page }, info) => {
  await openEnglish(page, '3d');
  const scene = page.locator('.diorama');
  await expect(scene).toHaveAttribute('data-render-count', /[1-9]\d*/);
  const ids = await page.getByTestId('route-result').getAttribute('data-route-ids');
  await expect(scene).toHaveAttribute('data-route-ids', ids!);
  await page.screenshot({ path: info.outputPath('english-desktop-1366.png'), fullPage: true });
  await page.getByTestId('diorama-canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.locator('.primary-plan')).toBeVisible();
  await expect(page.getByTestId('route-result')).toHaveAttribute('data-route-ids', ids!);
  await expect(page.locator('.primary-plan').getByTestId('floor-plan')).toHaveAttribute('data-route-ids', ids!);
  expect(await englishLeaks(page)).toEqual([]);
});

test('English initial WebGL unavailability and invalid numeric requirements have usable translated recovery', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type.startsWith('webgl') ? null : Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await openEnglish(page, '3d');
  await expect(page.locator('.primary-plan')).toBeVisible();
  await expect(page.getByTestId('route-result').locator('.distance')).toHaveText(/40\s*m/);
  await openDetails(page, '#requirements-settings');
  const width = page.locator('#requirements-settings input[type=number]').first();
  const slope = page.locator('#requirements-settings input[type=number]').last();
  await width.fill('20'); await slope.fill('40');
  await expect(page.locator('#width-error')).toBeVisible();
  await expect(page.locator('#slope-error')).toBeVisible();
  await expect(page.getByTestId('route-result').locator('.distance')).toHaveText(/40\s*m/);
  expect(await englishLeaks(page)).toEqual([]);
  await width.fill('90'); await slope.fill('5');
  await expect(page.locator('#width-error')).toHaveCount(0);
  await expect(page.locator('#slope-error')).toHaveCount(0);
});

test('English mobile keyboard, reduced motion, walking and closed panels remain usable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openEnglish(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#route-controls')).toBeFocused();
  await page.locator('.walk-start').click();
  await expect(page.locator('#walk-mode')).toBeFocused();
  await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', '0');
  await page.locator('.guidance-primary-actions button').nth(1).click();
  await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', '1');
  expect(await englishLeaks(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('english-mobile-walk-390.png'), fullPage: true });
  await page.locator('.walk-header button').click();
  await expect(page.locator('.walk-start')).toBeFocused();
  await openDetails(page, '.room-tools');
  await page.getByRole('searchbox').fill('Library');
  await expect(page.locator('.room-results button')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('English journal lost response and manual retry preserve the exact UUID and payload across locales and reload', async ({ page }) => {
  const posts: string[] = [];
  let saved: Report | null = null;
  await page.route('**/api/reports**', async route => {
    if (route.request().method() === 'GET') return json(route, { reports: saved ? [saved] : [], nextCursor: null });
    posts.push(route.request().postData()!);
    const payload = route.request().postDataJSON() as CreateReport;
    if (!saved) {
      saved = { id: '22222222-2222-4222-8222-222222222222', buildingId: payload.buildingId, passageId: payload.passageId, kind: payload.kind, message: payload.message, status: 'pending', createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z', version: 1 };
      await route.abort('failed');
    } else {
      await new Promise(resolve => setTimeout(resolve, 150));
      await json(route, { report: saved, replayed: true });
    }
  });
  await openEnglish(page);
  await openDetails(page, '[data-testid="report-journal"] details');
  await page.locator('#report-message').fill('  Synthetic English QA obstacle  ');
  await page.locator('[data-testid="report-journal"] button[type=submit]').click();
  await expect(page.getByRole('button', { name: /retry.*same/i })).toBeVisible();
  const initial = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), reportKey);
  expect(initial.pending.clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(initial.pending.message).toBe('Synthetic English QA obstacle');
  await expect(page.locator('#report-message')).toBeDisabled();
  expect(await englishLeaks(page)).toEqual([]);
  await page.getByRole('button', { name: 'Қазақша', exact: true }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.reload(); await openDetails(page, '[data-testid="report-journal"] details');
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), reportKey)).pending).toEqual(initial.pending);
  expect(posts).toHaveLength(1);
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
  await expect(page.getByTestId('report-network-status')).toContainText(/nothing.*automatically|not.*automatically/i);
  expect(posts).toHaveLength(1);
  await page.getByRole('button', { name: /retry.*same/i }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByTestId('report-feedback')).toContainText(/saved.*public/i);
  expect(posts).toHaveLength(2); expect(posts[1]).toBe(posts[0]);
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), reportKey)).pending).toBeNull();
  await expect(page.locator('[data-report-id]')).toHaveCount(1);
});

test('English speech selects local English voices only, cancels stale queues and keeps per-language preferences', async ({ page }, info) => {
  await mockSpeech(page); await openEnglish(page);
  await openDetails(page, '#display-settings details');
  const voices = page.locator('#display-settings select').last();
  await expect(voices.locator('option')).toHaveCount(3);
  expect(await voices.locator('option').allTextContents()).not.toContain('English remote fixture');
  await voices.selectOption('local-en-gb');
  await page.locator('#display-settings input[type=number]').fill('0.9');
  await page.getByRole('button', { name: /read.*route/i }).first().click();
  await expect.poll(() => page.evaluate(() => window.__iterEnglishSpeech.spoken.length)).toBe(1);
  const spoken = await page.evaluate(() => window.__iterEnglishSpeech.spoken[0]);
  expect(spoken).toMatchObject({ lang: 'en-US', rate: 0.9, voice: { voiceURI: 'local-en-gb', localService: true } });
  expect(spoken!.text).not.toMatch(/\p{Script=Cyrillic}/u);
  await page.getByRole('button', { name: 'Русский', exact: true }).click();
  await page.evaluate(() => window.__iterEnglishSpeech.finish());
  expect(await page.evaluate(() => window.__iterEnglishSpeech.spoken.length)).toBe(1);
  await voices.selectOption('local-ru');
  await page.locator('#display-settings input[type=number]').fill('1.2');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(voices).toHaveValue('local-en-gb');
  await expect(page.locator('#display-settings input[type=number]')).toHaveValue('0.9');
  await page.evaluate(() => window.__iterEnglishSpeech.changeVoices(window.__iterEnglishSpeech.voices.filter(voice => !voice.localService || !voice.lang.startsWith('en'))));
  await expect(voices.locator('option')).toHaveCount(1);
  await page.getByRole('button', { name: /read.*route/i }).first().click();
  expect(await page.evaluate(() => window.__iterEnglishSpeech.spoken.length)).toBe(1);
  await expect(page.getByTestId('speech-status')).toContainText(/English|matching|local/i);
  await page.reload();
  await expect(page.locator('#display-settings .speech-controls input')).not.toBeChecked();
  await openDetails(page, '#display-settings details');
  await expect(voices).toHaveValue('local-en-gb');
  await expect(page.locator('#display-settings input[type=number]')).toHaveValue('0.9');
  await info.attach('instrumented-speech', { body: JSON.stringify({ spoken, tested: 'Mock voices only. This does not verify audible output.' }), contentType: 'application/json' });
});

test('records actual Chrome local voice availability without speaking or claiming native audio validation', async ({ page }, info) => {
  await openEnglish(page);
  const voices = await page.evaluate(async () => {
    if (!window.speechSynthesis) return { supported: false, voices: [] };
    const synth = window.speechSynthesis;
    if (!synth.getVoices().length) await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', done); resolve(); };
      const timer = setTimeout(done, 5200); synth.addEventListener('voiceschanged', done);
    });
    return { supported: true, voices: synth.getVoices().map(voice => ({ name: voice.name, lang: voice.lang, localService: voice.localService })) };
  });
  console.log('ACTUAL_CHROME_VOICES', JSON.stringify(voices));
  await info.attach('actual-chrome-voice-inventory', { body: JSON.stringify(voices, null, 2), contentType: 'application/json' });
  await expect(page.locator('#display-settings .speech-controls input')).not.toBeChecked();
});

test('presentation remains RU or KK without replacing the saved English navigator locale', async ({ page }) => {
  await openEnglish(page);
  await page.locator('footer a[href*="presentation"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', /^(ru-RU|kk-KZ)$/);
  await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), localeKey)).toBe('en');
  await page.goto('/presentation?lang=kk');
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk-KZ');
  expect(await page.evaluate(key => localStorage.getItem(key), localeKey)).toBe('en');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('English actual Chrome page zoom 200 percent in an isolated profile', async ({ browserName }, info) => {
  expect(browserName).toBe('chromium');
  const profile = await mkdtemp(join(tmpdir(), 'iter-en-zoom-'));
  await mkdir(join(profile, 'Default'));
  await writeFile(join(profile, 'Default', 'Preferences'), JSON.stringify({ partition: { default_zoom_level: Math.log(2) / Math.log(1.2) } }));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: null, args: ['--window-size=1366,900'] });
  try {
    await isolate(context);
    const page = context.pages()[0]!;
    await page.goto('chrome://settings/appearance');
    await page.evaluate(() => new Promise<void>(resolve => (window as unknown as { chrome: { settingsPrivate: { setDefaultZoom: (zoom: number, callback: () => void) => void } } }).chrome.settingsPrivate.setDefaultZoom(2, resolve)));
    await page.addInitScript(() => localStorage.setItem('iter-language-v1', 'en'));
    await page.goto(origin);
    const metrics = await page.evaluate(() => ({ innerWidth, outerWidth, dpr: devicePixelRatio, scrollWidth: document.documentElement.scrollWidth }));
    expect(metrics.outerWidth / metrics.innerWidth).toBeGreaterThan(1.9);
    expect(metrics.outerWidth / metrics.innerWidth).toBeLessThan(2.2);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await page.locator('.walk-start').click();
    await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', '0');
    await page.locator('.guidance-primary-actions button').nth(1).click();
    await expect(page.getByTestId('step-review')).toHaveAttribute('data-step-index', '1');
    const walkingMetrics = await page.evaluate(() => ({
      innerWidth, scrollWidth: document.documentElement.scrollWidth,
      bounds: ['h1', '.language-switch', '.walk-header button', '.step-review'].map(selector => {
        const bounds = document.querySelector(selector)!.getBoundingClientRect();
        return { selector, x: bounds.x, right: bounds.right };
      }),
    }));
    expect(walkingMetrics.scrollWidth).toBeLessThanOrEqual(walkingMetrics.innerWidth + 1);
    for (const bounds of walkingMetrics.bounds) {
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(walkingMetrics.innerWidth + 1);
    }
    expect(await englishLeaks(page)).toEqual([]);
    await page.screenshot({ path: info.outputPath('english-actual-200-percent.png'), fullPage: true });
    await page.screenshot({ path: info.outputPath('english-actual-200-percent-viewport.png') });
    // Chromium page zoom can make Playwright's CSS clip cover half the physical viewport.
    // Capture the actual composited viewport without an explicit CSS clip for visual review.
    const session = await context.newCDPSession(page);
    const capture = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    await writeFile(info.outputPath('english-actual-200-percent-composited.png'), Buffer.from(capture.data, 'base64'));
    await session.detach();
    await info.attach('actual-zoom-metrics', { body: JSON.stringify({ planner: metrics, walking: walkingMetrics }), contentType: 'application/json' });
  } finally { await context.close(); }
});

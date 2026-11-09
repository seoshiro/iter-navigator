import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { REPORT_ERRORS } from '../shared/report-contract.ts';
import type { CreateReport, Report } from '../shared/report-contract.ts';

const storageKey = 'iter:report-draft:v1:demo-prosvet-v1:public-demo';
const originalText = '  Синтетическое препятствие для проверки  ';
const reportFor = (payload: CreateReport): Report => ({
  id: '22222222-2222-4222-8222-222222222222', buildingId: payload.buildingId,
  passageId: payload.passageId, kind: payload.kind, message: payload.message,
  status: 'pending', createdAt: '2026-11-09T10:00:00.000Z', updatedAt: '2026-11-09T10:00:00.000Z', version: 1,
});
const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
async function openJournal(page: Page) {
  await page.goto('/');
  await page.getByTestId('report-journal').locator('summary').click();
  await expect(page.getByTestId('report-journal')).toHaveAttribute('data-mode', 'public-demo');
}
async function readStored(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), storageKey);
}

test.beforeEach(async ({ page, context }) => {
  // No production endpoint is permitted in this suite.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === 'http://127.0.0.1:5264' ? route.continue() : route.abort('blockedbyclient');
  });
  await page.route('**/api/**', route => json(route, { reports: [], nextCursor: null }));
  await page.addInitScript(() => {
    if (!localStorage.getItem('iter-language-v1')) localStorage.setItem('iter-language-v1', 'ru');
  });
});

test('editable draft survives reload without sending and can be explicitly cleared', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/reports**', route => {
    if (route.request().method() === 'POST') posts++;
    return json(route, { reports: [], nextCursor: null });
  });
  await openJournal(page);
  await page.locator('#report-message').fill(originalText);
  await page.reload(); await page.getByTestId('report-journal').locator('summary').click();
  await expect(page.locator('#report-message')).toHaveValue(originalText);
  await expect(page.getByTestId('report-feedback')).toContainText('Черновик восстановлен');
  expect(posts).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Очистить черновик на устройстве', exact: true }).click();
  expect(await readStored(page)).toBeNull();
  await expect(page.locator('#report-message')).toHaveValue('');
});

test('lost confirmation survives reload and manual retry replays the original UUID and payload exactly once', async ({ page }) => {
  const requests: string[] = [];
  let saved: Report | null = null;
  await page.route('**/api/reports**', async route => {
    if (route.request().method() === 'GET') return json(route, { reports: saved ? [saved] : [], nextCursor: null });
    requests.push(route.request().postData()!);
    const payload = route.request().postDataJSON() as CreateReport;
    if (!saved) { saved = reportFor(payload); await route.abort('failed'); }
    else { await new Promise(resolve => setTimeout(resolve, 150)); await json(route, { report: saved, replayed: true }); }
  });
  await openJournal(page);
  await page.locator('#report-message').fill(originalText);
  await page.getByRole('button', { name: 'Отправить в публичный журнал', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Повторить тот же запрос', exact: true })).toBeVisible();
  const initial = await readStored(page);
  expect(initial.pending.message).toBe(originalText.trim());
  expect(initial.draft.message).toBe(originalText);
  await expect(page.locator('#report-message')).toBeDisabled();
  await page.reload(); await page.getByTestId('report-journal').locator('summary').click();
  await expect(page.getByTestId('report-feedback')).toContainText('Восстановлена незавершённая отправка');
  expect((await readStored(page)).pending).toEqual(initial.pending);
  expect(requests).toHaveLength(1);
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); window.dispatchEvent(new Event('online')); });
  await expect(page.getByTestId('report-network-status')).toContainText('Ничего не отправлено автоматически');
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Повторить тот же запрос', exact: true }).evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(page.getByTestId('report-feedback')).toContainText('Сохранено в публичном журнале');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
  expect((await readStored(page)).pending).toBeNull();
  await expect(page.locator('#report-message')).toHaveValue('');
  await expect(page.locator('#report-message')).toBeEnabled();
  await expect(page.locator('[data-report-id]')).toHaveCount(1);
});

test('a definite first rejection retains editable raw text and does not keep an uncertain request', async ({ page }) => {
  await page.route('**/api/reports**', route => route.request().method() === 'POST'
    ? json(route, { error: { code: 'rate_limited', message: REPORT_ERRORS.rate_limited.message } }, 429)
    : json(route, { reports: [], nextCursor: null }));
  await openJournal(page); await page.locator('#report-message').fill(originalText);
  await page.getByRole('button', { name: 'Отправить в публичный журнал', exact: true }).click();
  await expect(page.getByTestId('report-feedback')).toContainText('лимит');
  await expect(page.locator('#report-message')).toBeEnabled();
  expect((await readStored(page)).pending).toBeNull();
  await page.reload(); await page.getByTestId('report-journal').locator('summary').click();
  await expect(page.locator('#report-message')).toHaveValue(originalText);
});

test('a rejection of a retry never discards an earlier uncertain payload', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/reports**', route => {
    if (route.request().method() === 'GET') return json(route, { reports: [], nextCursor: null });
    posts++;
    return posts === 1 ? route.abort('failed') : json(route, { error: { code: 'rate_limited', message: REPORT_ERRORS.rate_limited.message } }, 429);
  });
  await openJournal(page); await page.locator('#report-message').fill(originalText);
  await page.getByRole('button', { name: 'Отправить в публичный журнал', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Повторить тот же запрос', exact: true })).toBeVisible();
  const original = (await readStored(page)).pending;
  await page.getByRole('button', { name: 'Повторить тот же запрос', exact: true }).click();
  await expect(page.getByTestId('report-feedback')).toContainText('неопределённость');
  expect((await readStored(page)).pending).toEqual(original);
  await expect(page.locator('#report-message')).toBeDisabled();
});

test('timeout keeps the draft and original UUID without an automatic retry', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = milliseconds => original(milliseconds === 8_000 ? 60 : milliseconds);
  });
  let posts = 0;
  await page.route('**/api/reports**', async route => {
    if (route.request().method() === 'GET') return json(route, { reports: [], nextCursor: null });
    posts++;
    await new Promise(resolve => setTimeout(resolve, 200));
    await route.abort('failed');
  });
  await openJournal(page); await page.locator('#report-message').fill(originalText);
  await page.getByRole('button', { name: 'Отправить в публичный журнал', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Повторить тот же запрос', exact: true })).toBeVisible();
  await expect(page.locator('#report-message')).toHaveValue(originalText);
  expect((await readStored(page)).pending.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(posts).toBe(1);
});

test('denied durable storage retains text and blocks a POST before it can become uncertain', async ({ page }) => {
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('blocked', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, storageKey);
  let posts = 0;
  await page.route('**/api/reports**', route => { if (route.request().method() === 'POST') posts++; return json(route, { reports: [], nextCursor: null }); });
  await openJournal(page); await page.locator('#report-message').fill(originalText);
  await expect(page.getByTestId('report-storage-warning')).toContainText('Не удалось сохранить');
  await page.getByRole('button', { name: 'Отправить в публичный журнал', exact: true }).click();
  await expect(page.getByTestId('report-feedback')).toContainText('Сообщение не отправлено');
  await expect(page.locator('#report-message')).toHaveValue(originalText);
  expect(posts).toBe(0);
});

test('corrupt persisted identity fails closed until explicitly discarded', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{"version":999}'), storageKey);
  await openJournal(page);
  await expect(page.getByTestId('report-storage-warning')).toContainText('повреждён');
  await expect(page.locator('#report-message')).toBeDisabled();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Удалить повреждённый черновик', exact: true }).click();
  await expect(page.locator('#report-message')).toBeEnabled();
  expect(await readStored(page)).toBeNull();
});

test('offline edits remain in the device draft and reconnect never submits them', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/reports**', route => { if (route.request().method() === 'POST') posts++; return json(route, { reports: [], nextCursor: null }); });
  await openJournal(page);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.locator('#report-message').fill(originalText);
  await expect(page.getByRole('button', { name: 'Отправить в публичный журнал', exact: true })).toBeDisabled();
  expect((await readStored(page)).draft.message).toBe(originalText);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('button', { name: 'Отправить в публичный журнал', exact: true })).toBeEnabled();
  expect(posts).toBe(0);
});

test('Kazakh labels, validation, empty state, and persisted draft feedback are localized', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('iter-language-v1', 'kk'));
  await openJournal(page);
  await expect(page.getByRole('form', { name: 'Кедергі туралы хабарлама жіберу', exact: true })).toBeVisible();
  await expect(page.locator('label[for="report-message"]')).toHaveText('Кедергінің сипаттамасы');
  await page.getByRole('button', { name: 'Ашық журналға жіберу', exact: true }).click();
  await expect(page.getByTestId('report-feedback')).toContainText('500');
  await page.locator('#report-message').fill('Синтетикалық нобай');
  await page.reload(); await page.getByTestId('report-journal').locator('summary').click();
  await expect(page.getByTestId('report-feedback')).toContainText('Нобай құрылғыдан қалпына келтірілді');
  await expect(page.getByTestId('report-read-status')).not.toContainText('сообщени');
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk-KZ');
});

test('stale reads preserve prior text records and render report content as text', async ({ page }) => {
  const record = reportFor({ buildingId: 'demo-prosvet-v1', kind: 'note', passageId: null, message: '<img src=x onerror=alert(1)>', clientRequestId: '11111111-1111-4111-8111-111111111111' });
  let reads = 0;
  await page.route('**/api/reports**', route => ++reads === 1
    ? json(route, { reports: [record], nextCursor: null }) : route.abort('failed'));
  await openJournal(page);
  await expect(page.locator('.journal-message')).toHaveText(record.message);
  await expect(page.locator('.journal-message img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Обновить журнал', exact: true }).click();
  await expect(page.getByTestId('report-stale')).toBeVisible();
  await expect(page.locator('.journal-message')).toHaveText(record.message);
});

test('reload during the first in-flight POST preserves the UUID and cancelling abandon keeps it locked', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/reports**', async route => {
    if (route.request().method() === 'GET') return json(route, { reports: [], nextCursor: null });
    posts++;
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.abort('failed').catch(() => {});
  });
  await openJournal(page); await page.locator('#report-message').fill(originalText);
  const dispatched = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/reports'));
  await page.getByRole('button', { name: 'Отправить в публичный журнал', exact: true }).click();
  await dispatched;
  const before = await readStored(page);
  expect(before.pending).not.toBeNull();
  await page.reload(); await page.getByTestId('report-journal').locator('summary').click();
  expect((await readStored(page)).pending).toEqual(before.pending);
  await expect(page.locator('#report-message')).toHaveValue(originalText);
  await expect(page.locator('#report-message')).toBeDisabled();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Завершить попытку и разрешить правку', exact: true }).click();
  expect((await readStored(page)).pending).toEqual(before.pending);
  await expect(page.locator('#report-message')).toBeDisabled();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Завершить попытку и разрешить правку', exact: true }).click();
  expect((await readStored(page)).pending).toBeNull();
  await expect(page.locator('#report-message')).toHaveValue(originalText);
  await expect(page.locator('#report-message')).toBeEnabled();
  expect(posts).toBe(1);
});

test('storage read failure cannot overwrite an existing identity even if writes would succeed', async ({ page }) => {
  await page.addInitScript(key => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function(name) {
      if (name === key) throw new DOMException('blocked', 'SecurityError');
      return original.call(this, name);
    };
  }, storageKey);
  let posts = 0;
  await page.route('**/api/reports**', route => { if (route.request().method() === 'POST') posts++; return json(route, { reports: [], nextCursor: null }); });
  await openJournal(page); await page.locator('#report-message').fill(originalText);
  await page.getByRole('button', { name: 'Отправить в публичный журнал', exact: true }).click();
  await expect(page.getByTestId('report-feedback')).toContainText('Сообщение не отправлено');
  await expect(page.locator('#report-message')).toHaveValue(originalText);
  expect(posts).toBe(0);
});

test('a second tab cannot dispatch concurrently with the active request', async ({ page, context }) => {
  let posts = 0;
  let release!: () => void;
  const responseReady = new Promise<void>(resolve => { release=resolve; });
  const respond = async (route: Route) => {
    if (route.request().method() === 'GET') return json(route, { reports: [], nextCursor: null });
    posts++;
    // Keep the first request actually in flight until the concurrency assertion.
    await responseReady;
    await route.abort('failed');
  };
  await page.route('**/api/reports**', respond);
  await openJournal(page); await page.locator('#report-message').fill(originalText);
  const other = await context.newPage();
  await other.route('**/api/reports**', respond);
  await openJournal(other);
  const dispatched = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/reports'));
  await page.getByRole('button', { name: 'Отправить в публичный журнал', exact: true }).click(); await dispatched;
  await expect(other.getByRole('button', { name: 'Повторить тот же запрос', exact: true })).toBeVisible();
  await other.getByRole('button', { name: 'Повторить тот же запрос', exact: true }).click();
  try {
    await expect(other.getByTestId('report-feedback')).toContainText('Отправка уже идёт в другой вкладке');
    expect(posts).toBe(1);
    expect((await readStored(other)).pending.clientRequestId).toBe((await readStored(page)).pending.clientRequestId);
  } finally { release(); }
  await other.close();
});

for (const outcome of ['saved', 'rejected'] as const) {
  test(`a late ${outcome} result cannot overwrite a newer draft edited in another tab`, async ({ page, context }) => {
    let release!: () => void;
    const responseReady = new Promise<void>(resolve => { release = resolve; });
    const respond = async (route: Route) => {
      if (route.request().method() === 'GET') return json(route, { reports: [], nextCursor: null });
      const payload = route.request().postDataJSON() as CreateReport;
      await responseReady;
      return outcome === 'saved' ? json(route, { report: reportFor(payload), replayed: false }, 201)
        : json(route, { error: { code: 'rate_limited', message: REPORT_ERRORS.rate_limited.message } }, 429);
    };
    await page.route('**/api/reports**', respond);
    await openJournal(page); await page.locator('#report-message').fill(originalText);
    const other = await context.newPage();
    await other.route('**/api/reports**', respond);
    await openJournal(other);
    const dispatched = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/reports'));
    await page.getByRole('button', { name: 'Отправить в публичный журнал', exact: true }).click();
    await dispatched;
    await expect(other.getByRole('button', { name: 'Завершить попытку и разрешить правку', exact: true })).toBeVisible();
    other.once('dialog', dialog => dialog.accept());
    await other.getByRole('button', { name: 'Завершить попытку и разрешить правку', exact: true }).click();
    const newerText = '  Другой незавершённый черновик во второй вкладке  ';
    await other.locator('#report-message').fill(newerText);
    const newerDraft = await readStored(other);
    expect(newerDraft.pending).toBeNull();
    expect(newerDraft.draft.message).toBe(newerText);
    release();
    await expect(page.getByTestId('report-feedback')).toContainText(outcome === 'saved' ? 'Сохранено в публичном журнале' : 'лимит');
    expect(await readStored(page)).toEqual(newerDraft);
    await expect(page.locator('#report-message')).toHaveValue(newerText);
    await other.reload(); await other.getByTestId('report-journal').locator('summary').click();
    await expect(other.locator('#report-message')).toHaveValue(newerText);
    await other.close();
  });
}

test('a storage-denied in-memory draft survives entering walking mode and returning', async ({ page }) => {
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('blocked', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, storageKey);
  await openJournal(page); await page.locator('#report-message').fill(originalText);
  await expect(page.getByTestId('report-storage-warning')).toBeVisible();
  await page.getByRole('button', { name: 'Проходить маршрут по шагам', exact: true }).click();
  await expect(page.locator('#walk-mode')).toBeVisible();
  await expect(page.getByTestId('report-journal')).toBeHidden();
  await page.getByRole('button', { name: 'Вернуться к планировщику', exact: true }).click();
  await expect(page.getByTestId('report-journal')).toBeVisible();
  await expect(page.locator('#report-message')).toHaveValue(originalText);
  await expect(page.getByTestId('report-storage-warning')).toBeVisible();
});

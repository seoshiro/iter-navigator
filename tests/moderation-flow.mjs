// Runs only against a new, empty, explicitly synthetic loopback database.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import pg from 'pg';
import { PostgresReportRepository, postgresConfiguration } from '../server/postgres-repository.ts';
import { createJournalServer } from '../server/http.ts';

test('phone moderation with a real database and independent route planners', { timeout: 120_000 }, async () => {
  const raw = process.env.NAVIGATOR_PG_TEST_URL;
  assert.equal(process.env.NAVIGATOR_PG_TEST_LOCAL, '1');
  assert.match(new URL(raw).pathname, /^\/iter_synthetic_[a-z0-9_]+$/);
  const probe = new pg.Client(postgresConfiguration(raw, true));
  await probe.connect();
  try { assert.equal((await probe.query("SELECT to_regnamespace('iter_journal') AS existing")).rows[0].existing, null); }
  finally { await probe.end(); }
  const repository = await PostgresReportRepository.open(raw, { testOnly: true });
  const key = randomBytes(32).toString('base64url');
  const server = createJournalServer({ repository, moderatorSecret: key });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    const post = (endpoint, body, authorization, site = origin) => fetch(origin + endpoint, { method: 'POST',
      headers: { origin: site, 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body) });
    assert.equal((await fetch(origin + '/api/moderation')).status, 403);
    assert.equal((await post('/api/moderation', { action: 'close' })).status, 403);
    assert.equal((await post('/api/moderation-session', {}, 'Bearer ' + randomBytes(32).toString('base64url'))).status, 403);
    assert.equal((await post('/api/moderation-session', {}, 'Bearer ' + key, 'https://example.invalid')).status, 403);
    const browserErrors = [];
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    async function planner() {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      // Exercise the public-build UI on loopback. Only its HTML service marker is substituted.
      // Every API call reaches the real HTTP handler and PostgreSQL database.
      await context.route(origin + '/', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace('content="local-demo-v1"', 'content="public-demo-v1"') });
      });
      await context.addInitScript(() => { localStorage.setItem('iter-language-v1', 'en'); localStorage.setItem('iter-model-view-v1', '2d'); });
      const page = await context.newPage();
      page.on('pageerror', e => browserErrors.push(e.message));
      await page.goto(origin);
      return page;
    }
    const visitor = await planner();
    const result = page => page.getByTestId('route-result');
    const through = (page, lift) => expect(result(page)).toHaveAttribute('data-route-ids', new RegExp(lift));
    await through(visitor, 'lift-a-01');
    const journal = visitor.getByTestId('report-journal');
    await journal.locator('summary').click();
    await expect(journal).toHaveAttribute('data-mode', 'public-demo');
    await expect(journal.getByRole('button', { name: /public journal/i })).toBeVisible();
    async function submit(passage, message) {
      await journal.locator('select').nth(0).selectOption('lift_unavailable');
      await journal.locator('select').nth(1).selectOption(passage);
      await journal.locator('textarea').fill(message);
      const reply = visitor.waitForResponse(r => r.url() === origin + '/api/reports' && r.request().method() === 'POST');
      await journal.locator('button[type=submit]').click();
      const response = await reply; assert.equal(response.status(), 201);
      const { report } = await response.json(); return report.id;
    }
    const first = await submit('lift-a-01', 'Synthetic lift A fault');
    await expect(visitor.getByTestId('passage-warnings')).toBeVisible();
    await through(visitor, 'lift-a-01');

    const moderator = await planner();
    // A phone's clock can be ahead of the service. Only the service determines token validity.
    await moderator.clock.setFixedTime(new Date(Date.now() + 60 * 60_000));
    const panel = moderator.locator('.moderation-panel');
    await panel.locator('summary').click();
    await panel.getByLabel('Moderator access key').fill(key);
    const issued = moderator.waitForResponse(r => r.url() === origin + '/api/moderation-session');
    await panel.getByRole('button', { name: 'Sign in' }).click();
    assert.equal((await issued).status(), 200);
    await expect(panel.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(panel.locator('[data-moderation-id]')).toHaveCount(1);
    const row = id => panel.locator('[data-moderation-id="' + id + '"]');
    async function decide(id, name) {
      const reply = moderator.waitForResponse(r => r.url() === origin + '/api/moderation' && r.request().method() === 'POST');
      await row(id).getByRole('button', { name, exact: true }).click();
      assert.equal((await reply).status(), 200);
      await expect(panel.getByRole('status')).toContainText('Decision saved');
    }
    await decide(first, 'Mark reviewed');
    assert.deepEqual(await (await fetch(origin + '/api/closures')).json(), { closed: [], warnings: [] });
    await decide(first, 'Confirm passage closure');
    const fresh = await planner();
    await through(fresh, 'lift-b-01');
    await expect(fresh.getByTestId('confirmed-closures')).toContainText('moderator');
    const alternatives = await fresh.locator('[data-variant-index]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-route-ids')));
    assert.ok(alternatives.every(ids => !ids?.split(',').includes('lift-a-01')));
    const sim = await fresh.evaluate(() => JSON.parse(localStorage.getItem('navigator-scenario-v1')).scenario.closedEdgeIds);
    assert.deepEqual(sim, []);
    // Existing tabs also synchronize without reload or a shared browser profile.
    await expect(result(visitor)).toHaveAttribute('data-route-ids', /lift-b-01/, { timeout: 25_000 });
    const duplicate = await submit('lift-a-01', 'Second synthetic observation');
    const other = await submit('lift-b-01', 'Synthetic lift B fault');
    const dismiss = await submit('lift-b-01', 'Incorrect synthetic observation');
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    await decide(dismiss, 'Dismiss report');
    await decide(duplicate, 'Confirm passage closure');
    await decide(first, 'Reopen after repair');
    assert.deepEqual(await (await fetch(origin + '/api/closures')).json(), { closed: ['lift-a-01'], warnings: ['lift-b-01'] });
    await decide(other, 'Confirm passage closure');
    const blocked = await planner();
    await expect(result(blocked)).toHaveAttribute('data-route-state', 'no-route');
    await expect(result(blocked)).toContainText('No matching route');
    await expect(blocked.getByRole('button', { name: 'Follow the route step by step' })).toHaveCount(0);
    await decide(duplicate, 'Reopen after repair');
    await decide(other, 'Reopen after repair');
    await through(await planner(), 'lift-a-01');
    assert.deepEqual(await (await fetch(origin + '/api/closures')).json(), { closed: [], warnings: [] });
    const list = await (await fetch(origin + '/api/reports')).json();
    assert.equal(list.reports.length, 4);
    assert.ok(list.reports.every(r => !('closure' in r) && !('clientRequestId' in r)));
    assert.ok(await moderator.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await panel.getByRole('button', { name: 'Sign out' }).click();
    await expect(panel.getByLabel('Moderator access key')).toHaveValue('');
    // The operator can distinguish a refused login from a session that ended after login.
    await panel.getByLabel('Moderator access key').fill(randomBytes(32).toString('hex'));
    await panel.getByRole('button', { name: 'Sign in' }).click();
    await expect(panel.getByRole('status')).toContainText('A moderator session was not opened');
    await moderator.route('**/api/moderation?limit=10', route => route.fulfill({ status: 403, body: '{}' }));
    await panel.getByLabel('Moderator access key').fill(key);
    await panel.getByRole('button', { name: 'Sign in' }).click();
    await expect(panel.getByRole('status')).toContainText('Your moderator session has ended');
    await moderator.unroute('**/api/moderation?limit=10');
    await moderator.locator('.language-switch button[lang="ru-RU"]').click();
    await expect(panel.getByLabel('Ключ модератора')).toBeVisible();
    await moderator.locator('.language-switch button[lang="kk-KZ"]').click();
    await expect(panel.getByLabel('Модератор кілті')).toBeVisible();

    const offline = await planner();
    await offline.route('**/api/closures', route => route.abort());
    await offline.reload();
    await expect(offline.getByTestId('closures-unchecked')).toContainText('Route guidance is paused');
    // The locally computed route stays visible as unchecked, but guidance is locked until closures are known.
    await expect(result(offline)).toHaveAttribute('data-closures-checked', 'false');
    await through(offline, 'lift-a-01');
    await expect(offline.getByRole('button', { name: 'Follow the route step by step' })).toBeDisabled();
    await offline.unroute('**/api/closures');
    await offline.getByRole('button', { name: 'Check again' }).click();
    await expect(result(offline)).toHaveAttribute('data-closures-checked', 'true');
    await expect(offline.getByTestId('closures-unchecked')).toHaveCount(0);
    await expect(offline.getByRole('button', { name: 'Follow the route step by step' })).toBeEnabled();
    assert.deepEqual(browserErrors, []);
  } finally {
    await browser?.close(); await new Promise(ok => server.close(ok)); await repository.close();
  }
});

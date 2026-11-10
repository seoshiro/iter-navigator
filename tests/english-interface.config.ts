import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: 'english-interface.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../.local/english-upgrade/results.json', import.meta.url)) }]],
  outputDir: '../.local/english-upgrade/test-results',
  use: {
    baseURL: 'http://127.0.0.1:5276', browserName: 'chromium', channel: 'chrome',
    headless: true, viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5276 --strictPort',
    url: 'http://127.0.0.1:5276', reuseExistingServer: false,
    cwd: '..', env: { NAVIGATOR_HOSTED_BUILD: 'public-demo' },
  },
});

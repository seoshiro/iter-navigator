import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: '.', testMatch: 'journal-upgrade.spec.ts', fullyParallel: false, workers: 1,
  timeout: 30_000, reporter: 'list', outputDir: join(tmpdir(), 'iter-journal-upgrade-results'),
  use: { baseURL: 'http://127.0.0.1:5264', headless: true, viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5264 --strictPort',
    url: 'http://127.0.0.1:5264', reuseExistingServer: false,
    cwd: '..', env: { NAVIGATOR_HOSTED_BUILD: 'public-demo' },
  },
});

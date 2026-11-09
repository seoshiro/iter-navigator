import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: ['choreography.spec.ts', 'intro-film.spec.ts', 'later-scenes.spec.ts'], workers: 1,
  timeout: 45000, expect: { timeout: 12000 }, outputDir: '../.local/choreography-qa',
  use: { baseURL: 'http://127.0.0.1:5380', channel: 'chrome', headless: true, viewport: { width: 1366, height: 768 }, screenshot: 'only-on-failure', video: 'on' } });

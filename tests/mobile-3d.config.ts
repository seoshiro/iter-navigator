import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'mobile-3d.spec.ts', timeout: 60000, expect: { timeout: 12000 }, workers: 1,
  outputDir: '../.local/mobile-3d-results', reporter: [['list'], ['json', { outputFile: '.local/mobile-3d-report.json' }]],
  use: { baseURL: process.env.ITER_TEST_BASE_URL ?? 'http://127.0.0.1:5369', browserName: 'chromium', channel: 'chrome', headless: true,
    isMobile: true, hasTouch: true, deviceScaleFactor: 2, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'touch-390', use: { viewport: { width: 390, height: 844 } } }, { name: 'touch-375', use: { viewport: { width: 375, height: 667 } } }],
});

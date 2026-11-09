import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'architecture.spec.ts', timeout: 60000,
  expect: { timeout: 15000 }, workers: 1, fullyParallel: false,
  outputDir: '../.local/architecture-results', reporter: [['list'], ['json', { outputFile: '.local/architecture-report.json' }]],
  webServer: {command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5369 --strictPort',url:'http://127.0.0.1:5369',reuseExistingServer:!process.env.CI,cwd:'..',env:{NAVIGATOR_HOSTED_BUILD:'public-demo'}},
  use: { baseURL: 'http://127.0.0.1:5369', browserName: 'chromium', channel: 'chrome',
    headless: true, viewport: { width: 1366, height: 900 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});

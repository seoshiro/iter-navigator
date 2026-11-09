import { defineConfig } from '@playwright/test';

const external = process.env.PRESENTATION_BASE_URL;
const run = process.env.PRESENTATION_QA_RUN || (external ? 'production' : 'local');
export default defineConfig({
  testDir: '.',
  testMatch: 'presentation.spec.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  outputDir: `../.local/presentation-qa/${run}/test-results`,
  reporter: [['list'], ['json', { outputFile: `../.local/presentation-qa/${run}/results.json` }]],
  use: {
    baseURL: external || 'http://127.0.0.1:5372',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: external ? undefined : {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5372 --strictPort',
    url: 'http://127.0.0.1:5372',
    reuseExistingServer: !process.env.CI,
    cwd: '..',
    env: { NAVIGATOR_HOSTED_BUILD: 'public-demo' },
  },
});

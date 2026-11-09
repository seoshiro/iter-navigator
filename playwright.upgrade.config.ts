import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser-upgrade', timeout: 45000, expect: { timeout: 12000 }, fullyParallel: false, workers: 1,
  reporter: [['list'], ['html', {open:'never'}]],
  use: { baseURL: 'http://127.0.0.1:5269', browserName:'chromium', channel:'chrome', headless:true, viewport:{width:1366,height:768}, trace:'retain-on-failure', screenshot:'only-on-failure' },
  webServer: { command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5269', port:5269, reuseExistingServer: !process.env.CI, env:{ NAVIGATOR_HOSTED_BUILD:'public-demo' } },
});

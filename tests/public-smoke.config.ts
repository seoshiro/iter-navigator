import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'public-smoke.spec.ts', workers: 1, timeout: 90000, expect:{timeout:15000}, reporter:'list', outputDir:'../.local/public-qa',
  use:{baseURL:'https://iter-navigator.vercel.app',channel:'chrome',headless:true,viewport:{width:1366,height:768},screenshot:'only-on-failure'},
});

import { defineConfig } from '@playwright/test';
const run = new Date().toISOString().replace(/[:.]/g, '-');
const mobile = process.env.COMPOSITION_MOBILE === '1';
export default defineConfig({
 testDir: '.', testMatch: 'presentation-composition.spec.ts', workers: 1, fullyParallel: false,
 timeout: 60000, outputDir: `../.local/composition-revision/${run}`, reporter: [['list']],
 use: { baseURL: process.env.MOTION_BASE_URL || 'http://127.0.0.1:5380', channel: 'chrome',
 viewport: mobile ? {width:390,height:844} : {width:1366,height:768}, trace: 'retain-on-failure',
 video: process.env.COMPOSITION_RECORD === '1' ? {mode:'on',size:mobile?{width:390,height:844}:{width:1366,height:768}} : 'off' }
});

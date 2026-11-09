import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'.', testMatch:'composition-revision.spec.ts', workers:1, timeout:60000, expect:{timeout:15000}, outputDir:'../.local/composition-revision/tests', use:{baseURL:'http://127.0.0.1:5380',channel:'chrome',headless:true,viewport:{width:1366,height:768},video:'on',screenshot:'only-on-failure'} });

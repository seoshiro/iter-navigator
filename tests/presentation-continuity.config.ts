import {defineConfig} from '@playwright/test';
const run=process.env.CONTINUITY_RUN||new Date().toISOString().replace(/[:.]/g,'-');
export default defineConfig({testDir:'.',testMatch:'presentation-continuity.spec.ts',workers:1,fullyParallel:false,timeout:120000,outputDir:"../.local/continuity-revision/"+run,reporter:[['list'],['json',{outputFile:'../.local/continuity-revision/'+run+'.json'}]],use:{baseURL:process.env.CONTINUITY_BASE_URL||'http://127.0.0.1:5380',actionTimeout:12000,channel:'chrome',viewport:{width:390,height:844},video:'off',trace:'off'}});




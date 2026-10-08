import { spawnSync } from 'node:child_process';
if (!process.env.NAVIGATOR_PG_TEST_URL) { console.error('real_postgres_test_configuration_required'); process.exit(1); }
const result = spawnSync(process.execPath, ['--test', 'server/postgres.test.ts'], { stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;

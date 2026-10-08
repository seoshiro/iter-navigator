import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const DIST_ROOT = resolve(REPOSITORY_ROOT, 'dist');
export function reportDatabasePath(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.NAVIGATOR_REPORT_DB;
  if (configured !== undefined && !configured.trim()) throw new Error('invalid_database_configuration');
  return resolve(REPOSITORY_ROOT, configured ?? '.local-data/reports.sqlite');
}

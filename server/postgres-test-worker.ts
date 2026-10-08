import { PostgresReportRepository } from './postgres-repository.ts';
import { safeError } from './validation.ts';
const inputs: unknown = JSON.parse(process.env.NAVIGATOR_PG_TEST_PAYLOAD ?? 'null');
if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 10) throw new Error('invalid_synthetic_batch');
const repository = await PostgresReportRepository.open(process.env.NAVIGATOR_PG_TEST_URL, { testOnly: process.env.NAVIGATOR_PG_TEST_LOCAL === '1', initialize: false });
try {
  const run = new Promise<void>(accept => { process.once('message', message => { if (message === 'run') accept(); }); });
  process.send?.('ready'); await run;
  const results = [];
  for (const input of inputs) {
    try {
      const result = await repository.create(input);
      results.push({ status: result.replayed ? 200 : 201, report: result.report });
    } catch (error) { results.push({ code: safeError(error).code }); }
  }
  process.send?.({ results });
} finally { await repository.close(); }

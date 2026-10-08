import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import pg from 'pg';
import { PostgresReportRepository, postgresConfiguration } from './postgres-repository.ts';
import { REPORT_BUILDING_ID, REPORT_LIMITS } from '../shared/report-contract.ts';
import { JournalError } from './validation.ts';

const raw = process.env.NAVIGATOR_PG_TEST_URL;
const testOnly = process.env.NAVIGATOR_PG_TEST_LOCAL === '1';
const payload = () => ({ buildingId: REPORT_BUILDING_ID, passageId: null, kind: 'note', message: 'Synthetic isolated PostgreSQL witness', clientRequestId: randomUUID() });
const hasCode = (code: string) => (error: unknown) => error instanceof JournalError && error.code === code;
test('PostgreSQL configuration has bounded pools/timeouts and verified Neon TLS', () => {
  const config = postgresConfiguration('postgresql://synthetic:synthetic@ep-example.neon.tech/iter_synthetic_unit?sslmode=require&channel_binding=require');
  assert.equal(config.max, 4); assert.equal(config.statement_timeout, 3000); assert.deepEqual(config.ssl, { rejectUnauthorized: true, servername: 'ep-example.neon.tech' });
  for (const url of ['postgresql://synthetic:synthetic@ep-example.neon.tech/iter_synthetic_unit?sslmode=disable', 'postgresql://synthetic:synthetic@ep-example.neon.tech/iter_synthetic_unit?sslmode=no-verify', 'postgresql://synthetic:synthetic@ep-example.neon.tech/iter_synthetic_unit?sslrootcert=/private', 'postgresql://synthetic:synthetic@127.0.0.1/iter_synthetic_unit']) assert.throws(() => postgresConfiguration(url), hasCode('storage_unavailable'));
});

test('real PostgreSQL synthetic matrix: transactions, processes, persistence, limits and fail-closed storage', { skip: !raw ? 'NAVIGATOR_PG_TEST_URL required; real engine not available' : false, timeout: 120_000 }, async context => {
  // Never drop or seed a database unless its name explicitly denotes synthetic tests.
  let url: URL;
  try { url = new URL(raw!); } catch { throw new Error('Invalid synthetic test configuration.'); }
  assert.match(url.pathname, /^\/iter_synthetic_[a-z0-9_]+$/);
  const admin = new pg.Pool(postgresConfiguration(raw, testOnly)); admin.on('error', () => {});
  const repositories: PostgresReportRepository[] = [];
  async function open(initialize = true) { const repository = await PostgresReportRepository.open(raw, { testOnly, initialize }); repositories.push(repository); return repository; }
  async function reset() {
    await Promise.all(repositories.splice(0).map(repository => repository.close()));
    await admin.query('DROP SCHEMA IF EXISTS iter_journal CASCADE');
  }
  interface ProcessResult { status?: number; report?: { id: string }; code?: string }
  async function processContention(batches: ReturnType<typeof payload>[][]): Promise<ProcessResult[][]> {
    assert.ok(batches.length > 0 && batches.length <= 4 && batches.every(batch => batch.length > 0 && batch.length <= 10));
    const workers: { child: ReturnType<typeof fork>; result: Promise<ProcessResult[]> }[] = [];
    try {
      // Initialization is outside measured write contention. Start writes at an IPC barrier.
      for (const batch of batches) {
        const child = fork(new URL('./postgres-test-worker.ts', import.meta.url), [], { env: { ...process.env, NAVIGATOR_PG_TEST_PAYLOAD: JSON.stringify(batch) }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
        let readyAccept!: () => void; let readyReject!: (error: Error) => void;
        const ready = new Promise<void>((accept, reject) => { readyAccept = accept; readyReject = reject; });
        let resultAccept!: (result: ProcessResult[]) => void; let resultReject!: (error: Error) => void;
        const result = new Promise<ProcessResult[]>((accept, reject) => { resultAccept = accept; resultReject = reject; });
        void result.catch(() => {});
        let reported: ProcessResult[] | undefined;
        const failed = () => { const error = new Error('Synthetic worker failed.'); readyReject(error); resultReject(error); };
        const timer = setTimeout(() => { child.kill(); failed(); }, 25_000);
        child.on('message', message => {
          if (message === 'ready') readyAccept();
          else if (message && typeof message === 'object' && 'results' in message && Array.isArray(message.results)) reported = message.results as ProcessResult[];
        });
        child.on('error', () => { clearTimeout(timer); failed(); });
        child.on('exit', code => { clearTimeout(timer); if (code === 0 && reported?.length === batch.length) resultAccept(reported); else failed(); });
        workers.push({ child, result }); await ready;
      }
      for (const worker of workers) worker.child.send('run');
      return await Promise.all(workers.map(worker => worker.result));
    } finally { for (const worker of workers) if (worker.child.exitCode === null) worker.child.kill(); }
  }
  async function processCreate(input: ReturnType<typeof payload>): Promise<ProcessResult> { return (await processContention([[input]]))[0]![0]!; }
  try {
    await reset();
    await context.test('retries from independent processes commit once and changes conflict', async () => {
      const repository = await open(); const input = payload();
      const results = (await processContention(Array.from({ length: 4 }, () => [input]))).flat();
      assert.equal(results.filter(result => result.status === 201).length, 1); assert.equal(results.filter(result => result.status === 200).length, 3);
      assert.equal(new Set(results.map(result => result.report?.id)).size, 1);
      await assert.rejects(() => repository.create({ ...input, message: 'Changed synthetic content' }), hasCode('request_conflict'));
      const before = await repository.list(); await repository.close(); repositories.splice(repositories.indexOf(repository), 1);
      const restarted = await open(false); assert.deepEqual(await restarted.list(), before); assert.equal((await restarted.create(input)).replayed, true);
    });
    await reset();
    await context.test('persistent rate limit serializes 35 requests across four processes; fresh-process replay bypasses it', async () => {
      const first = await open(); const input = payload(); const original = await first.create(input);
      const batches = [9,9,9,8].map(size => Array.from({ length: size }, () => payload()));
      const requests = (await processContention(batches)).flat();
      assert.equal(requests.length, 35); assert.equal(requests.filter(result => result.status === 201).length, REPORT_LIMITS.writesPerMinute - 1);
      const rejected = requests.filter(result => result.code !== undefined); assert.equal(rejected.length, 6); assert.ok(rejected.every(result => result.code === 'rate_limited'));
      assert.equal((await processCreate(payload())).code, 'rate_limited'); const replay = await processCreate(input); assert.equal(replay.status, 200); assert.equal(replay.report?.id, original.report.id);
      assert.equal((await first.list({ limit: 50, before: null })).reports.length, 30);
      const third = await open(false); await assert.rejects(() => third.create(payload()), hasCode('rate_limited')); assert.equal((await third.create(input)).replayed, true);
      await admin.query('UPDATE iter_journal.write_window SET committed_at=ARRAY[(floor(extract(epoch FROM clock_timestamp())*1000)-60000)::bigint]');
      assert.equal((await third.create(payload())).replayed, false);
    });
    await reset();
    await context.test('capacity admits one concurrent final row; full journal still replays', async () => {
      const first = await open(); const input = payload(); const original = await first.create(input);
      await admin.query("INSERT INTO iter_journal.reports(id,client_request_id,building_id,passage_id,kind,message,status,created_at,updated_at,version) SELECT gen_random_uuid()::text,gen_random_uuid()::text,$1,NULL,'note','Synthetic capacity seed','pending','2026-10-08T00:00:00.000Z','2026-10-08T00:00:00.000Z',1 FROM generate_series(1,998)", [REPORT_BUILDING_ID]);
      const results = (await processContention([[payload()], [payload()]])).flat(); assert.equal(results.filter(result => result.status === 201).length, 1);
      const rejected = results.filter(result => result.code !== undefined); assert.equal(rejected.length, 1); assert.equal(rejected[0]?.code, 'journal_full');
      const replay = await processCreate(input); assert.equal(replay.status, 200); assert.equal(replay.report?.id, original.report.id);
      assert.equal((await first.create(input)).replayed, true); assert.equal((await admin.query('SELECT count(*)::integer AS total FROM iter_journal.reports')).rows[0]?.total, 1000);
      await assert.rejects(() => admin.query("INSERT INTO iter_journal.reports(id,client_request_id,building_id,passage_id,kind,message,status,created_at,updated_at,version) VALUES (gen_random_uuid()::text,gen_random_uuid()::text,$1,NULL,'note','overflow','pending','2026-10-08T00:00:00.000Z','2026-10-08T00:00:00.000Z',1)", [REPORT_BUILDING_ID]));
    });
    await reset();
    await context.test('stable cursor/status/content, parameterized hostile text and database immutability', async () => {
      const repository = await open(); const input = { ...payload(), message: "Synthetic '; DROP TABLE reports; -- <script>" }; const created = await repository.create(input);
      for (let index = 0; index < 11; index++) await repository.create({ ...payload(), message: `Synthetic page ${index}` });
      const first = await repository.list(); assert.equal(first.reports.length, 10); assert.ok(first.nextCursor);
      const next = await repository.list({ limit: 10, before: first.nextCursor }); assert.equal(next.reports.length, 2); assert.equal(next.reports[1]?.id, created.report.id); assert.equal(next.reports[1]?.message, input.message);
      await assert.rejects(() => admin.query('UPDATE iter_journal.reports SET message=$1 WHERE id=$2', ['tampered', created.report.id]));
      await assert.rejects(() => admin.query('DELETE FROM iter_journal.reports WHERE id=$1', [created.report.id])); await assert.rejects(() => admin.query('TRUNCATE iter_journal.reports'));
      await admin.query("UPDATE iter_journal.reports SET status='reviewed',version=2,updated_at=created_at WHERE id=$1", [created.report.id]);
      assert.equal((await repository.create(input)).report.status, 'reviewed');
      const reopened = await open(false); assert.deepEqual(await reopened.list({ limit: 10, before: first.nextCursor }), await repository.list({ limit: 10, before: first.nextCursor }));
      await assert.rejects(() => repository.create({ ...payload(), passageId: 'door-205', kind: 'lift_unavailable' }), hasCode('invalid_input'));
      await assert.rejects(() => repository.list({ limit: 51, before: null }), hasCode('invalid_input'));
    });
    await reset();
    await context.test('failed insert rolls back its persistent rate allowance', async () => {
      const repository = await open();
      await admin.query("CREATE FUNCTION iter_journal.synthetic_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END; $$");
      await admin.query('CREATE TRIGGER synthetic_failure BEFORE INSERT ON iter_journal.reports FOR EACH ROW EXECUTE FUNCTION iter_journal.synthetic_failure()');
      await assert.rejects(() => repository.create(payload()), hasCode('storage_unavailable'));
      assert.equal((await repository.list()).reports.length, 0); assert.deepEqual((await admin.query('SELECT committed_at FROM iter_journal.write_window')).rows[0]?.committed_at, []);
    });
    await reset();
    await context.test('foreign tables, schema drift, wrong catalog and corrupt rows fail closed', async () => {
      await admin.query('CREATE TABLE public.synthetic_foreign(id integer)'); await assert.rejects(() => open(), hasCode('storage_unavailable')); await admin.query('DROP TABLE public.synthetic_foreign');
      await open(); await admin.query('ALTER TABLE iter_journal.reports ADD COLUMN synthetic_extra integer'); await assert.rejects(() => open(false), hasCode('storage_unavailable'));
      await reset(); await open(); await admin.query("UPDATE iter_journal.passage_catalog SET type='door' WHERE id='lift-a-01'"); await assert.rejects(() => open(false), hasCode('storage_unavailable'));
      await reset(); const repository = await open(); await admin.query("INSERT INTO iter_journal.reports(id,client_request_id,building_id,passage_id,kind,message,status,created_at,updated_at,version) VALUES (gen_random_uuid()::text,gen_random_uuid()::text,$1,NULL,'note',' synthetic unnormalized ','pending','2026-10-08T00:00:00.000Z','2026-10-08T00:00:00.000Z',1)", [REPORT_BUILDING_ID]);
      await assert.rejects(() => repository.list(), hasCode('storage_unavailable')); await assert.rejects(() => open(false), hasCode('storage_unavailable'));
    });
  } finally { await reset(); await admin.end(); }
});

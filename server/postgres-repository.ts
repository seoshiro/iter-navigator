import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { PoolClient, PoolConfig } from 'pg';
import { isReport, REPORT_BUILDING_ID, REPORT_LIMITS, REPORT_PASSAGES } from '../shared/report-contract.ts';
import type { CreateReportResult, Report, ReportPage } from '../shared/report-contract.ts';
import type { ReportStore } from './report-store.ts';
import { JournalError, safeError, validateCreate, validatePage } from './validation.ts';
import type { PageQuery } from './validation.ts';

const SCHEMA = 'iter_journal';
const COLUMNS = 'id, building_id AS "buildingId", passage_id AS "passageId", kind, message, status, created_at AS "createdAt", updated_at AS "updatedAt", version';
const LOCK = 'SELECT pg_advisory_xact_lock(1312904786, 1)';

export function postgresConfiguration(raw: string | undefined, testOnly = false): PoolConfig {
  try {
    const url = new URL(raw ?? '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname) || url.hash) throw new Error();
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.port && (!/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535)) || (!testOnly && !url.password)) throw new Error();
    if (testOnly ? !local : !url.hostname.endsWith('.neon.tech')) throw new Error();
    // Explicit fields prevent sslmode in a supplied URL from overriding TLS verification.
    for (const key of url.searchParams.keys()) if (!['sslmode', 'channel_binding'].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error();
    if (url.searchParams.has('sslmode') && !['require', 'verify-full'].includes(url.searchParams.get('sslmode')!)) throw new Error();
    if (url.searchParams.has('channel_binding') && url.searchParams.get('channel_binding') !== 'require') throw new Error();
    return {
      host: url.hostname, port: url.port ? Number(url.port) : 5432,
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1),
      ssl: testOnly ? false : { rejectUnauthorized: true, servername: url.hostname },
      enableChannelBinding: true, max: 4, connectionTimeoutMillis: 3_000, idleTimeoutMillis: 10_000,
      statement_timeout: 3_000, query_timeout: 4_000, lock_timeout: 2_000,
      application_name: 'iter-public-demo', options: '-c search_path=pg_catalog',
    };
  } catch { throw new JournalError('storage_unavailable'); }
}

// Compare live database definitions with a freshly created reference on the same engine.
// OIDs and PostgreSQL-version formatting do not enter the comparison.
async function signature(client: PoolClient, schema: string): Promise<string> {
  const result = await client.query(`
    SELECT jsonb_build_object(
      'relations', (SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1),
      'columns', (SELECT jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped),
      'constraints', (SELECT jsonb_agg(jsonb_build_array(c.relname,k.conname,k.convalidated,pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1),
      'indexes', (SELECT jsonb_agg(jsonb_build_array(c.relname,i.indisvalid,pg_get_indexdef(i.indexrelid)) ORDER BY c.relname) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1),
      'triggers', (SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND NOT t.tgisinternal),
      'functions', (SELECT jsonb_agg(pg_get_functiondef(p.oid) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1),
      'sequences', (SELECT jsonb_agg(jsonb_build_array(c.relname,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle) ORDER BY c.relname) FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1)
    ) AS signature`, [schema]);
  return JSON.stringify(result.rows[0]?.signature).replaceAll(schema, '__SCHEMA__');
}

export class PostgresReportRepository implements ReportStore {
  private readonly pool: pg.Pool;
  private constructor(config: PoolConfig) {
    this.pool = new pg.Pool(config);
    // Idle socket failures are contained; future operations return the stable 503 contract.
    this.pool.on('error', () => {});
  }
  static async open(raw: string | undefined, options: { testOnly?: boolean; initialize?: boolean } = {}): Promise<PostgresReportRepository> {
    const repository = new PostgresReportRepository(postgresConfiguration(raw, options.testOnly));
    try { await repository.initialize(options.initialize !== false); return repository; }
    catch (error) { await repository.close(); throw safeError(error); }
  }
  private async initialize(initialize: boolean): Promise<void> {
    const sql = await readFile(new URL('./postgres-schema.sql', import.meta.url), 'utf8');
    await this.transaction(async client => {
      await client.query(LOCK);
      const foreign = await client.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema',$1) AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%' AND c.relkind IN ('r','p','v','m','f','S') LIMIT 1", [SCHEMA]);
      if (foreign.rowCount) throw new JournalError('storage_unavailable');
      const present = await client.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [SCHEMA]);
      if (!present.rowCount) {
        if (!initialize) throw new JournalError('storage_unavailable');
        await client.query(sql.replaceAll('__SCHEMA__', SCHEMA));
        for (const passage of REPORT_PASSAGES) await client.query(`INSERT INTO ${SCHEMA}.passage_catalog(id,type) VALUES ($1,$2)`, [passage.id, passage.type]);
      }
      const reference = `iter_reference_${randomUUID().replaceAll('-', '')}`;
      await client.query(sql.replaceAll('__SCHEMA__', reference));
      if (await signature(client, SCHEMA) !== await signature(client, reference)) throw new JournalError('storage_unavailable');
      await client.query(`DROP SCHEMA "${reference}" CASCADE`);
      const catalog = await client.query(`SELECT id,type FROM ${SCHEMA}.passage_catalog ORDER BY id`);
      const expected = [...REPORT_PASSAGES].sort((a, b) => a.id.localeCompare(b.id));
      if (catalog.rows.length !== expected.length || catalog.rows.some((row, index) => row.id !== expected[index]?.id || row.type !== expected[index]?.type)) throw new JournalError('storage_unavailable');
      const metadata = await client.query(`SELECT singleton,schema_version,building_id FROM ${SCHEMA}.journal_metadata`);
      if (metadata.rows.length !== 1 || metadata.rows[0]?.singleton !== 1 || metadata.rows[0]?.schema_version !== 1 || metadata.rows[0]?.building_id !== REPORT_BUILDING_ID) throw new JournalError('storage_unavailable');
      const window = await client.query(`SELECT singleton,committed_at FROM ${SCHEMA}.write_window`);
      if (window.rows.length !== 1 || window.rows[0]?.singleton !== 1 || !Array.isArray(window.rows[0]?.committed_at) || window.rows[0].committed_at.length > REPORT_LIMITS.writesPerMinute) throw new JournalError('storage_unavailable');
      const rows = await client.query(`SELECT ${COLUMNS} FROM ${SCHEMA}.reports ORDER BY sequence LIMIT $1`, [REPORT_LIMITS.records + 1]);
      if (rows.rows.length > REPORT_LIMITS.records) throw new JournalError('storage_unavailable');
      for (const row of rows.rows) this.dto(row);
    });
  }
  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    let discard = false;
    try {
      client = await this.pool.connect(); await client.query('BEGIN');
      try {
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { discard = true; }
        throw error;
      }
    } catch (error) { throw safeError(error); }
    finally { client?.release(discard); }
  }
  private dto(row: unknown): Report {
    if (!isReport(row)) throw new JournalError('storage_unavailable');
    return { ...row };
  }
  async create(input: unknown): Promise<CreateReportResult> {
    const payload = validateCreate(input);
    return this.transaction(async client => {
      await client.query(LOCK);
      const existing = await client.query(`SELECT ${COLUMNS} FROM ${SCHEMA}.reports WHERE client_request_id=$1`, [payload.clientRequestId]);
      if (existing.rows.length) {
        const report = this.dto(existing.rows[0]);
        if (report.buildingId !== payload.buildingId || report.passageId !== payload.passageId || report.kind !== payload.kind || report.message !== payload.message) throw new JournalError('request_conflict');
        return { report, replayed: true };
      }
      const count = await client.query(`SELECT count(*)::integer AS total FROM ${SCHEMA}.reports`);
      if (count.rows[0]?.total >= REPORT_LIMITS.records) throw new JournalError('journal_full');
      // Use the database clock after acquiring the lock. Rate history commits with the row.
      const clock = await client.query('SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now');
      const now = Number(clock.rows[0]?.now);
      if (!Number.isSafeInteger(now)) throw new JournalError('storage_unavailable');
      const window = await client.query(`SELECT committed_at FROM ${SCHEMA}.write_window WHERE singleton=1 FOR UPDATE`);
      if (window.rows.length !== 1 || !Array.isArray(window.rows[0]?.committed_at)) throw new JournalError('storage_unavailable');
      const times = window.rows[0].committed_at.map(Number);
      if (times.length > REPORT_LIMITS.writesPerMinute || times.some((time: number) => !Number.isSafeInteger(time) || time < 0 || time > now)) throw new JournalError('storage_unavailable');
      const recent = times.filter((time: number) => time > now - 60_000);
      if (recent.length >= REPORT_LIMITS.writesPerMinute) throw new JournalError('rate_limited');
      const timestamp = new Date(now).toISOString();
      const inserted = await client.query(`INSERT INTO ${SCHEMA}.reports(id,client_request_id,building_id,passage_id,kind,message,status,created_at,updated_at,version) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$7,1) RETURNING ${COLUMNS}`, [randomUUID(), payload.clientRequestId, REPORT_BUILDING_ID, payload.passageId, payload.kind, payload.message, timestamp]);
      await client.query(`UPDATE ${SCHEMA}.write_window SET committed_at=$1::bigint[] WHERE singleton=1`, [[...recent, now]]);
      return { report: this.dto(inserted.rows[0]), replayed: false };
    });
  }
  async list(query: PageQuery = { limit: 10, before: null }): Promise<ReportPage> {
    const checked = validatePage(new URLSearchParams({ limit: String(query.limit), ...(query.before === null ? {} : { before: String(query.before) }) }));
    try {
      const result = await this.pool.query(`SELECT ${COLUMNS}, sequence FROM ${SCHEMA}.reports WHERE ($1::bigint IS NULL OR sequence<$1) ORDER BY sequence DESC LIMIT $2`, [checked.before, checked.limit + 1]);
      const page = result.rows.slice(0, checked.limit);
      const reports = page.map(row => { const dto = { ...row }; delete dto.sequence; return this.dto(dto); });
      const nextCursor = result.rows.length > checked.limit ? Number(page.at(-1)?.sequence) : null;
      if (nextCursor !== null && (!Number.isSafeInteger(nextCursor) || nextCursor <= 0)) throw new JournalError('storage_unavailable');
      return { reports, nextCursor };
    } catch (error) { throw safeError(error); }
  }
  async close(): Promise<void> { await this.pool.end(); }
}

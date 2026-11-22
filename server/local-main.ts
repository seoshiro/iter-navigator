import { createJournalServer } from './http.ts';
import { PostgresReportRepository } from './postgres-repository.ts';

// A distinct loopback entry point for the full UI with its own local journal.
const raw = process.env.NAVIGATOR_LOCAL_DATABASE_URL;
let repository: PostgresReportRepository;
try {
  if (!/^\/iter_local_[a-z0-9_]+$/.test(new URL(raw ?? '').pathname)) throw new Error();
  repository = await PostgresReportRepository.open(raw, { testOnly: true });
} catch { console.error('local_dedicated_database_unavailable'); process.exit(1); }

const server = createJournalServer({ repository, moderatorSecret: process.env.NAVIGATOR_MODERATOR_SECRET });
server.on('error', () => { console.error('local_server_unavailable'); void repository.close().finally(() => { process.exitCode = 1; }); });
server.listen(4280, '127.0.0.1', () => console.log('ITER local journal: http://127.0.0.1:4280'));
function stop() {
  server.close(() => { void repository.close(); });
  server.closeAllConnections();
}
process.once('SIGINT', stop); process.once('SIGTERM', stop);

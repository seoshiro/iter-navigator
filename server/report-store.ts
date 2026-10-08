import type { CreateReportResult, ReportPage } from '../shared/report-contract.ts';
import type { PageQuery } from './validation.ts';

// SQLite remains synchronous. Hosted storage commits asynchronously before replying.
export interface ReportStore {
  create(input: unknown, allowNew?: () => boolean): CreateReportResult | Promise<CreateReportResult>;
  list(query?: PageQuery): ReportPage | Promise<ReportPage>;
  close(): void | Promise<void>;
}

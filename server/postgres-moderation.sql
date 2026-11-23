-- Add one extension table; the original journal and its version constraint stay intact.
CREATE TABLE "__SCHEMA__".report_closures (
  report_id text PRIMARY KEY REFERENCES "__SCHEMA__".reports(id),
  closed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz CHECK (expires_at > closed_at AND expires_at <= closed_at + interval '24 hours'),
  reopened_at timestamptz CHECK (reopened_at >= closed_at)
);

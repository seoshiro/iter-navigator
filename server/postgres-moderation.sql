-- Applied transactionally only after verifying the existing v1 schema.
ALTER TABLE "__SCHEMA__".journal_metadata DROP CONSTRAINT journal_metadata_schema_version_check;
ALTER TABLE "__SCHEMA__".journal_metadata ADD CHECK (schema_version = 2) NOT VALID;
UPDATE "__SCHEMA__".journal_metadata SET schema_version = 2 WHERE schema_version = 1;
ALTER TABLE "__SCHEMA__".journal_metadata VALIDATE CONSTRAINT journal_metadata_schema_version_check;

-- The report owns one closure for its immutable passage. Separate reports can overlap.
CREATE TABLE "__SCHEMA__".report_closures (
  report_id text PRIMARY KEY REFERENCES "__SCHEMA__".reports(id),
  closed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz CHECK (expires_at > closed_at AND expires_at <= closed_at + interval '24 hours'),
  reopened_at timestamptz CHECK (reopened_at >= closed_at)
);

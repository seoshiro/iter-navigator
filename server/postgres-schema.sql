CREATE SCHEMA "__SCHEMA__";
CREATE TABLE "__SCHEMA__".passage_catalog (
  id text PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('corridor','ramp','lift','stairs','door'))
);
CREATE TABLE "__SCHEMA__".journal_metadata (
  singleton integer PRIMARY KEY CHECK (singleton = 1),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  building_id text NOT NULL CHECK (building_id = 'demo-prosvet-v1')
);
INSERT INTO "__SCHEMA__".journal_metadata VALUES (1, 1, 'demo-prosvet-v1');
CREATE TABLE "__SCHEMA__".write_window (
  singleton integer PRIMARY KEY CHECK (singleton = 1),
  committed_at bigint[] NOT NULL DEFAULT '{}'
);
INSERT INTO "__SCHEMA__".write_window (singleton) VALUES (1);
CREATE TABLE "__SCHEMA__".reports (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY CHECK (sequence BETWEEN 1 AND 9007199254740991),
  id text NOT NULL UNIQUE CHECK (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  client_request_id text NOT NULL UNIQUE CHECK (client_request_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  building_id text NOT NULL CHECK (building_id = 'demo-prosvet-v1'),
  passage_id text REFERENCES "__SCHEMA__".passage_catalog(id),
  kind text NOT NULL CHECK (kind IN ('lift_unavailable','blocked_passage','note')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  status text NOT NULL CHECK (status IN ('pending','reviewed','rejected')),
  created_at text NOT NULL CHECK (created_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'),
  updated_at text NOT NULL CHECK (updated_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' AND updated_at >= created_at),
  version integer NOT NULL CHECK ((status = 'pending' AND version = 1 AND updated_at = created_at) OR (status IN ('reviewed','rejected') AND version = 2)),
  CHECK (passage_id IS NOT NULL OR kind = 'note')
);
CREATE FUNCTION "__SCHEMA__".guard_report() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'immutable_report'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.sequence, NEW.id, NEW.client_request_id, NEW.building_id, NEW.passage_id, NEW.kind, NEW.message, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.sequence, OLD.id, OLD.client_request_id, OLD.building_id, OLD.passage_id, OLD.kind, OLD.message, OLD.created_at)
       OR OLD.status <> 'pending' OR NEW.status = 'pending' OR NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'immutable_report';
    END IF;
  ELSE
    -- Same database-wide lock as the repository; protects direct inserts and separate processes.
    PERFORM pg_advisory_xact_lock(1312904786, 1);
    IF (SELECT count(*) FROM "__SCHEMA__".reports) >= 1000 THEN RAISE EXCEPTION 'journal_full'; END IF;
    IF NEW.kind = 'lift_unavailable' AND NOT EXISTS (SELECT 1 FROM "__SCHEMA__".passage_catalog WHERE id = NEW.passage_id AND type = 'lift') THEN
      RAISE EXCEPTION 'invalid_target';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reports_guard BEFORE INSERT OR UPDATE OR DELETE ON "__SCHEMA__".reports FOR EACH ROW EXECUTE FUNCTION "__SCHEMA__".guard_report();
CREATE FUNCTION "__SCHEMA__".guard_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable_report'; END;
$$;
CREATE TRIGGER reports_no_truncate BEFORE TRUNCATE ON "__SCHEMA__".reports FOR EACH STATEMENT EXECUTE FUNCTION "__SCHEMA__".guard_truncate();

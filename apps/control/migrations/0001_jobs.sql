CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  batch_name TEXT NOT NULL,
  brief TEXT NOT NULL,
  target_seconds INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT NOT NULL DEFAULT 'queued',
  message TEXT NOT NULL DEFAULT '',
  project_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  attempt INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX one_active_batch ON jobs(batch_id) WHERE status IN ('queued', 'running');
CREATE INDEX job_queue ON jobs(status, created_at);
CREATE TABLE worker_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  last_seen INTEGER NOT NULL,
  batches_json TEXT NOT NULL DEFAULT '[]',
  message TEXT NOT NULL DEFAULT ''
);

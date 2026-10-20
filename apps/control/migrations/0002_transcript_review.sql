ALTER TABLE jobs ADD COLUMN phase TEXT NOT NULL DEFAULT 'legacy';
DROP INDEX one_active_batch;
CREATE UNIQUE INDEX one_active_batch ON jobs(batch_id) WHERE status IN ('queued', 'running', 'awaiting_review');
CREATE TABLE transcript_reviews (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id),
  revision INTEGER NOT NULL DEFAULT 1,
  document TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  approved_at INTEGER
);

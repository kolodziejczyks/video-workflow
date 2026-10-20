CREATE TABLE upload_observations (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id),
  status TEXT NOT NULL,
  completed_at TEXT,
  checked_at INTEGER NOT NULL
);

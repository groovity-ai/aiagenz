-- Create metrics table for historical monitoring (Postgres)
CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cpu_percent REAL NOT NULL,
    memory_percent REAL NOT NULL,
    memory_usage_mb REAL NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Improve query performance for time-range lookups
CREATE INDEX IF NOT EXISTS idx_metrics_project_timestamp ON metrics(project_id, timestamp);

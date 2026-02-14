-- Create metrics table for historical monitoring
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    cpu_percent REAL NOT NULL,
    memory_percent REAL NOT NULL,
    memory_usage_mb REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Improve query performance for time-range lookups
CREATE INDEX IF NOT EXISTS idx_metrics_project_timestamp ON metrics(project_id, timestamp);

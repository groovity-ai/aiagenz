-- Add plan column to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'starter';

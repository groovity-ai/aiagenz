-- Add GitHub integration fields to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

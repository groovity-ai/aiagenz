-- Add image_name column to track which Docker image each project uses
ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_name TEXT DEFAULT 'aiagenz-agent:latest';

-- AiAgenz Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,              -- bcrypt hash
    role       TEXT NOT NULL DEFAULT 'user', -- user, admin
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    name           TEXT NOT NULL,
    type           TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'stopped',
    container_id   TEXT,
    container_name TEXT,
    config         TEXT,  -- AES-GCM encrypted JSON
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

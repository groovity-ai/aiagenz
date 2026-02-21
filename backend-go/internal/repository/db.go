package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewDB creates a new PostgreSQL connection pool.
func NewDB(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	config.MaxConns = 10
	config.MinConns = 2

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return pool, nil
}

// RunMigrations executes the initial schema migration.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	query := `
		CREATE TABLE IF NOT EXISTS users (
			id         TEXT PRIMARY KEY,
			email      TEXT NOT NULL UNIQUE,
			password   TEXT NOT NULL,
			role       TEXT NOT NULL DEFAULT 'user',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

		CREATE TABLE IF NOT EXISTS projects (
			id             TEXT PRIMARY KEY,
			user_id        TEXT NOT NULL,
			name           TEXT NOT NULL,
			type           TEXT NOT NULL,
			plan           TEXT NOT NULL DEFAULT 'starter',
			status         TEXT NOT NULL DEFAULT 'stopped',
			container_id   TEXT,
			container_name TEXT,
			config         TEXT,
			created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

		-- Add plan column if it doesn't exist (migration for existing dbs)
		ALTER TABLE projects ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'starter';
	`
	_, err := pool.Exec(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}
	// Add GitHub fields
	if _, err := pool.Exec(ctx, `
		ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_url TEXT;
		ALTER TABLE projects ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
	`); err != nil {
		return fmt.Errorf("failed to run github migrations: %w", err)
	}

	// Add Subscriptions table
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS subscriptions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			plan TEXT NOT NULL,
			status TEXT NOT NULL,
			current_period_start TIMESTAMPTZ,
			current_period_end TIMESTAMPTZ,
			payment_provider_id TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
	`); err != nil {
		return fmt.Errorf("failed to run subscription migrations: %w", err)
	}

	// Add updated_at trigger for subscriptions
	if _, err := pool.Exec(ctx, `
		CREATE OR REPLACE FUNCTION update_updated_at()
		RETURNS TRIGGER AS $$
		BEGIN
			NEW.updated_at = NOW();
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql;

		DO $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM pg_trigger WHERE tgname = 'trg_subscriptions_updated_at'
			) THEN
				CREATE TRIGGER trg_subscriptions_updated_at
					BEFORE UPDATE ON subscriptions
					FOR EACH ROW
					EXECUTE FUNCTION update_updated_at();
			END IF;
		END;
		$$;
	`); err != nil {
		return fmt.Errorf("failed to create updated_at trigger: %w", err)
	}

	// Add Metrics table
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS metrics (
			id SERIAL PRIMARY KEY,
			project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			cpu_percent REAL NOT NULL,
			memory_percent REAL NOT NULL,
			memory_usage_mb REAL NOT NULL,
			timestamp TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_metrics_project_timestamp ON metrics(project_id, timestamp);
	`); err != nil {
		return fmt.Errorf("failed to run metrics migrations: %w", err)
	}

	// Add System Cache table
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS system_cache (
			key TEXT PRIMARY KEY,
			data JSONB NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`); err != nil {
		return fmt.Errorf("failed to run system cache migrations: %w", err)
	}

	return nil
}

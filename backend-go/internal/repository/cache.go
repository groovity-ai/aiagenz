package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CacheEntry represents an entry in the system_cache table.
type CacheEntry struct {
	Key       string      `json:"key"`
	Data      interface{} `json:"data"`
	UpdatedAt time.Time   `json:"updatedAt"`
}

// CacheRepository handles database operations for the global system cache.
type CacheRepository struct {
	db *pgxpool.Pool
}

// NewCacheRepository creates a new CacheRepository.
func NewCacheRepository(db *pgxpool.Pool) *CacheRepository {
	return &CacheRepository{db: db}
}

// Get retrieves a cache entry by key.
func (r *CacheRepository) Get(ctx context.Context, key string) (*CacheEntry, error) {
	query := `SELECT key, data, updated_at FROM system_cache WHERE key = $1`
	row := r.db.QueryRow(ctx, query, key)

	var entry CacheEntry
	err := row.Scan(&entry.Key, &entry.Data, &entry.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // Cache miss
		}
		return nil, fmt.Errorf("failed to scan system_cache entry: %w", err)
	}
	return &entry, nil
}

// Set inserts or updates a cache entry.
func (r *CacheRepository) Set(ctx context.Context, key string, data interface{}) error {
	query := `
		INSERT INTO system_cache (key, data, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (key) DO UPDATE
		SET data = EXCLUDED.data, updated_at = NOW()
	`
	_, err := r.db.Exec(ctx, query, key, data)
	if err != nil {
		return fmt.Errorf("failed to set system_cache entry: %w", err)
	}
	return nil
}

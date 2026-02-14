package repository

import (
	"context"
	"fmt"

	"github.com/aiagenz/backend/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SubscriptionRepository struct {
	db *pgxpool.Pool
}

func NewSubscriptionRepository(db *pgxpool.Pool) *SubscriptionRepository {
	return &SubscriptionRepository{db: db}
}

func (r *SubscriptionRepository) Create(ctx context.Context, sub *domain.Subscription) error {
	query := `
		INSERT INTO subscriptions (id, user_id, plan, status, current_period_start, current_period_end, payment_provider_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.db.Exec(ctx, query,
		sub.ID, sub.UserID, sub.Plan, sub.Status,
		sub.CurrentPeriodStart, sub.CurrentPeriodEnd, sub.PaymentProviderID,
		sub.CreatedAt, sub.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create subscription: %w", err)
	}
	return nil
}

func (r *SubscriptionRepository) FindByUserID(ctx context.Context, userID string) (*domain.Subscription, error) {
	query := `
		SELECT id, user_id, plan, status, current_period_start, current_period_end, payment_provider_id, created_at, updated_at
		FROM subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1
	`
	row := r.db.QueryRow(ctx, query, userID)
	var sub domain.Subscription
	err := row.Scan(
		&sub.ID, &sub.UserID, &sub.Plan, &sub.Status,
		&sub.CurrentPeriodStart, &sub.CurrentPeriodEnd, &sub.PaymentProviderID,
		&sub.CreatedAt, &sub.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // No active subscription
		}
		return nil, fmt.Errorf("failed to find subscription: %w", err)
	}
	return &sub, nil
}

func (r *SubscriptionRepository) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, "UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE id = $2", status, id)
	return err
}

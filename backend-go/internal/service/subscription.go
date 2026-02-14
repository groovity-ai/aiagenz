package service

import (
	"context"
	"fmt"
	"time"

	"github.com/aiagenz/backend/internal/domain"
	"github.com/aiagenz/backend/internal/repository"
	"github.com/aiagenz/backend/pkg/payment"
	"github.com/google/uuid"
)

type SubscriptionService struct {
	repo     *repository.SubscriptionRepository
	userRepo *repository.UserRepository
	payment  payment.PaymentGateway
}

func NewSubscriptionService(repo *repository.SubscriptionRepository, userRepo *repository.UserRepository, payment payment.PaymentGateway) *SubscriptionService {
	return &SubscriptionService{
		repo:     repo,
		userRepo: userRepo,
		payment:  payment,
	}
}

// GetCurrentSubscription returns the active subscription for a user.
func (s *SubscriptionService) GetCurrentSubscription(ctx context.Context, userID string) (*domain.Subscription, error) {
	return s.repo.FindByUserID(ctx, userID)
}

// CreateCheckout creates a payment link for upgrading a plan.
func (s *SubscriptionService) CreateCheckout(ctx context.Context, userID, planID string) (*domain.PaymentLinkResponse, error) {
	// 1. Validate plan
	plan := domain.GetPlan(planID)
	if plan.ID == "" || plan.PriceUSD == 0 {
		return nil, domain.ErrBadRequest("invalid plan or free plan")
	}

	// 2. Generate Order ID
	orderID := uuid.New().String()

	// 3. Create Payment Link (Midtrans/Stripe)
	paymentURL, err := s.payment.CreatePaymentLink(userID, planID, orderID, int64(plan.PriceUSD))
	if err != nil {
		return nil, domain.ErrInternal("failed to create payment link", err)
	}

	// Note: In a real app, we might save a "pending" transaction here.
	// For simplicity, we trust the Webhook to create/update the subscription.

	return &domain.PaymentLinkResponse{
		PaymentURL: paymentURL,
		OrderID:    orderID,
	}, nil
}

// HandlePaymentWebhook processes payment notifications.
// This is called by the payment gateway (e.g., Midtrans Notif).
func (s *SubscriptionService) HandlePaymentWebhook(ctx context.Context, userID, planID, status string) error {
	// This is a simplified handler.
	// In reality, the webhook payload contains orderID, transaction status, etc.
	// We assume the caller (Handler) has parsed it and extracted userID/planID from metadata or orderID lookup.

	if status == payment.StatusSuccess {
		// Create or Update Subscription
		now := time.Now()
		sub := &domain.Subscription{
			ID:                 uuid.New().String(),
			UserID:             userID,
			Plan:               planID,
			Status:             "active",
			CurrentPeriodStart: now,
			CurrentPeriodEnd:   now.AddDate(0, 1, 0), // 1 month
			CreatedAt:          now,
			UpdatedAt:          now,
		}

		if err := s.repo.Create(ctx, sub); err != nil {
			return fmt.Errorf("failed to create subscription: %w", err)
		}

		// Also update User role/plan if needed?
		// We handle logic via subscription check usually.
	}

	return nil
}

// SimulateUpgrade is a dev-only helper to instantly upgrade a user (bypassing payment).
func (s *SubscriptionService) SimulateUpgrade(ctx context.Context, userID, planID string) error {
	now := time.Now()
	sub := &domain.Subscription{
		ID:                 uuid.New().String(),
		UserID:             userID,
		Plan:               planID,
		Status:             "active",
		CurrentPeriodStart: now,
		CurrentPeriodEnd:   now.AddDate(0, 1, 0),
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	return s.repo.Create(ctx, sub)
}

package payment

import "time"

// PaymentGateway defines the interface for payment providers.
type PaymentGateway interface {
	// CreatePaymentLink creates a checkout session/link for a plan.
	CreatePaymentLink(userID, plan, orderID string, price int64) (string, error)
	// VerifySignature verifies the webhook signature (implementation specific).
	VerifySignature(payload []byte, signature string) bool
}

// MockGateway is a dummy implementation for testing.
type MockGateway struct{}

func NewMockGateway() *MockGateway {
	return &MockGateway{}
}

func (g *MockGateway) CreatePaymentLink(userID, plan, orderID string, price int64) (string, error) {
	// In a real app, this would call Midtrans/Stripe API.
	// For now, return a dummy success URL that hits our own callback?
	// Or just a fake link.
	return "https://example.com/pay?order_id=" + orderID, nil
}

func (g *MockGateway) VerifySignature(payload []byte, signature string) bool {
	return true
}

// TransactionStatus constants
const (
	StatusPending = "pending"
	StatusSuccess = "success"
	StatusFailed  = "failed"
)

// Transaction represents a payment transaction.
type Transaction struct {
	ID        string
	OrderID   string
	Amount    int64
	Status    string
	CreatedAt time.Time
}

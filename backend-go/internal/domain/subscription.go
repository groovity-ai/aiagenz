package domain

import "time"

// Subscription represents a user's subscription to a plan.
type Subscription struct {
	ID                 string    `json:"id"`
	UserID             string    `json:"userId"`
	Plan               string    `json:"plan"`
	Status             string    `json:"status"` // active, trailing, canceled, expired
	CurrentPeriodStart time.Time `json:"currentPeriodStart"`
	CurrentPeriodEnd   time.Time `json:"currentPeriodEnd"`
	PaymentProviderID  string    `json:"paymentProviderId"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

// CreateSubscriptionRequest is the input for creating a subscription.
type CreateSubscriptionRequest struct {
	Plan string `json:"plan" validate:"required,oneof=starter pro business"`
}

// PaymentLinkResponse returns the URL to redirect the user to for payment.
type PaymentLinkResponse struct {
	PaymentURL string `json:"paymentUrl"`
	OrderID    string `json:"orderId"`
}

package handler

import (
	"net/http"

	"github.com/aiagenz/backend/internal/contextkeys"
	"github.com/aiagenz/backend/internal/domain"
	"github.com/aiagenz/backend/internal/service"
)

type PaymentHandler struct {
	svc *service.SubscriptionService
}

func NewPaymentHandler(svc *service.SubscriptionService) *PaymentHandler {
	return &PaymentHandler{svc: svc}
}

// CreateCheckout handles POST /api/payment/checkout.
func (h *PaymentHandler) CreateCheckout(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextkeys.UserID).(string)
	if !ok || userID == "" {
		JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req domain.CreateSubscriptionRequest
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	resp, err := h.svc.CreateCheckout(r.Context(), userID, req.Plan)
	if err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, resp)
}

// Webhook handles POST /api/payment/webhook.
func (h *PaymentHandler) Webhook(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement real webhook signature verification & parsing logic (Midtrans specific).
	// For now, this endpoint is a placeholder.
	w.WriteHeader(http.StatusOK)
}

// Simulate handles POST /api/payment/simulate (ADMIN ONLY — gated in router).
func (h *PaymentHandler) Simulate(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextkeys.UserID).(string)
	if !ok || userID == "" {
		JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req domain.CreateSubscriptionRequest
	if err := DecodeJSON(r, &req); err != nil {
		Error(w, err)
		return
	}

	if err := h.svc.SimulateUpgrade(r.Context(), userID, req.Plan); err != nil {
		Error(w, err)
		return
	}

	JSON(w, http.StatusOK, map[string]bool{"success": true})
}

// GetSubscription handles GET /api/payment/subscription.
func (h *PaymentHandler) GetSubscription(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(contextkeys.UserID).(string)
	if !ok || userID == "" {
		JSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	sub, err := h.svc.GetCurrentSubscription(r.Context(), userID)
	if err != nil {
		Error(w, err)
		return
	}

	if sub == nil {
		JSON(w, http.StatusOK, map[string]interface{}{"status": "none"})
		return
	}

	JSON(w, http.StatusOK, sub)
}

package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/aiagenz/backend/internal/domain"
)

// JSON writes a JSON response with the given status code.
func JSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			log.Printf("failed to encode JSON response: %v", err)
		}
	}
}

// Error writes an error JSON response, using AppError status codes when available.
func Error(w http.ResponseWriter, err error) {
	if appErr, ok := domain.AsAppError(err); ok {
		JSON(w, appErr.Code, map[string]string{"error": appErr.Message})
		return
	}
	log.Printf("unhandled error: %v", err)
	JSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
}

// DecodeJSON decodes a JSON request body into the given struct.
func DecodeJSON(r *http.Request, v interface{}) error {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		return domain.ErrBadRequest("invalid JSON body")
	}
	return nil
}

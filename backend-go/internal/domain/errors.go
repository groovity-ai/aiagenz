package domain

import (
	"errors"
	"fmt"
	"net/http"
)

// AppError is a structured application error with HTTP status code.
type AppError struct {
	Code    int    `json:"code"`
	Message string `json:"error"`
	Err     error  `json:"-"`
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

func (e *AppError) Unwrap() error {
	return e.Err
}

// Common error constructors.

func ErrNotFound(msg string) *AppError {
	return &AppError{Code: http.StatusNotFound, Message: msg}
}

func ErrUnauthorized(msg string) *AppError {
	return &AppError{Code: http.StatusUnauthorized, Message: msg}
}

func ErrBadRequest(msg string) *AppError {
	return &AppError{Code: http.StatusBadRequest, Message: msg}
}

func ErrValidation(msg string) *AppError {
	return &AppError{Code: http.StatusUnprocessableEntity, Message: msg}
}

func ErrInternal(msg string, err error) *AppError {
	return &AppError{Code: http.StatusInternalServerError, Message: msg, Err: err}
}

// AsAppError attempts to extract an AppError from an error chain.
func AsAppError(err error) (*AppError, bool) {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr, true
	}
	return nil, false
}

package controllers

import "mina.local/mina/internal/models"

// Error is a domain/controller error with a stable API error code.
type Error struct {
	Code    models.ErrorCode
	Message string
}

func (e *Error) Error() string {
	return e.Message
}

func invalidRequest(message string) *Error {
	return &Error{Code: models.ErrorCodeInvalidRequest, Message: message}
}

func notFound(message string) *Error {
	return &Error{Code: models.ErrorCodeNotFound, Message: message}
}

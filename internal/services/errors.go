package services

import "errors"

var (
	// ErrNotFound identifies a missing repository row.
	ErrNotFound = errors.New("not found")
	// ErrConflict identifies a repository uniqueness or state conflict.
	ErrConflict = errors.New("conflict")
	// ErrInvalidReference identifies a missing or inactive referenced row.
	ErrInvalidReference = errors.New("invalid reference")
)

// ErrorCode identifies app-layer use-case failures.
type ErrorCode string

const (
	// ErrorCodeInvalidRequest identifies semantically invalid input.
	ErrorCodeInvalidRequest ErrorCode = "invalid_request"
	// ErrorCodeNotFound identifies a missing domain resource.
	ErrorCodeNotFound ErrorCode = "not_found"
	// ErrorCodeConflict identifies a request that conflicts with existing state.
	ErrorCodeConflict ErrorCode = "conflict"
)

// Error is an app-layer use-case error.
type Error struct {
	Code    ErrorCode
	Message string
}

func (e *Error) Error() string {
	return e.Message
}

// InvalidRequest returns a domain validation error.
func InvalidRequest(message string) *Error {
	return &Error{Code: ErrorCodeInvalidRequest, Message: message}
}

// NotFound returns a missing-resource error.
func NotFound(message string) *Error {
	return &Error{Code: ErrorCodeNotFound, Message: message}
}

// Conflict returns a state-conflict error.
func Conflict(message string) *Error {
	return &Error{Code: ErrorCodeConflict, Message: message}
}

package models

// ErrorCode is a stable machine-readable API error identifier.
type ErrorCode string

const (
	// ErrorCodeInvalidRequest identifies malformed or semantically invalid input.
	ErrorCodeInvalidRequest ErrorCode = "invalid_request"
	// ErrorCodeNotFound identifies a missing API resource.
	ErrorCodeNotFound ErrorCode = "not_found"
	// ErrorCodeMethodNotAllowed identifies an unsupported method for a path.
	ErrorCodeMethodNotAllowed ErrorCode = "method_not_allowed"
	// ErrorCodeInternal identifies unexpected server failures.
	ErrorCodeInternal ErrorCode = "internal_error"
)

// APIError is the stable machine-readable error object returned by REST APIs.
type APIError struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
}

// ErrorResponse wraps an APIError for HTTP responses.
type ErrorResponse struct {
	Error APIError `json:"error"`
}

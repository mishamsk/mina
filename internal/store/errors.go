package store

import (
	"errors"
	"strings"
)

var (
	// ErrNotFound identifies a missing durable row.
	ErrNotFound = errors.New("not found")
	// ErrConflict identifies a durable uniqueness or state conflict.
	ErrConflict = errors.New("conflict")
	// ErrInvalidReference identifies a request that points at a missing or inactive referenced row.
	ErrInvalidReference = errors.New("invalid reference")
)

func isUniqueConstraintError(err error) bool {
	return strings.Contains(strings.ToLower(err.Error()), "constraint")
}

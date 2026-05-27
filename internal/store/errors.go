package store

import "errors"

var (
	// ErrNotFound identifies a missing durable row.
	ErrNotFound = errors.New("not found")
	// ErrConflict identifies a durable uniqueness or state conflict.
	ErrConflict = errors.New("conflict")
)

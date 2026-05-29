package store

import (
	"errors"
	"strings"

	duckdb "github.com/duckdb/duckdb-go/v2"
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
	if !isDuckDBConstraintError(err) {
		return false
	}
	message := strings.ToLower(err.Error())

	return strings.Contains(message, "unique") || strings.Contains(message, "duplicate")
}

func isForeignKeyConstraintError(err error) bool {
	if !isDuckDBConstraintError(err) {
		return false
	}

	return strings.Contains(strings.ToLower(err.Error()), "foreign key")
}

func isDuckDBConstraintError(err error) bool {
	var duckErr *duckdb.Error
	return errors.As(err, &duckErr) && duckErr.Type == duckdb.ErrorTypeConstraint
}

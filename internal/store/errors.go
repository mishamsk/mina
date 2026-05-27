package store

import (
	"errors"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

var (
	// ErrNotFound identifies a missing durable row.
	ErrNotFound = errors.New("not found")
	// ErrConflict identifies a durable uniqueness or state conflict.
	ErrConflict = errors.New("conflict")
)

func isUniqueConstraintError(err error) bool {
	var sqliteErr *sqlite.Error
	return errors.As(err, &sqliteErr) && sqliteErr.Code() == sqlite3.SQLITE_CONSTRAINT_UNIQUE
}

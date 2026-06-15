package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type sqlQueryer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// WithTx runs fn with repositories bound to one database transaction.
// Transaction-scoped AppDB handles reuse their active transaction.
func (s *AppDB) WithTx(ctx context.Context, opts *sql.TxOptions, fn func(*AppDB) error) error {
	if s.tx != nil {
		return fn(s)
	}

	return withSQLTx(ctx, s.db, opts, func(tx *sql.Tx) error {
		txAccounting := *s
		txAccounting.tx = tx

		return fn(&txAccounting)
	})
}

// withTx runs store-local SQL mutations in a transaction.
// Transaction-scoped AppDB handles reuse their active transaction.
func (s *AppDB) withTx(ctx context.Context, opts *sql.TxOptions, fn func(*sql.Tx) error) error {
	if s.tx != nil {
		return fn(s.tx)
	}

	return withSQLTx(ctx, s.db, opts, fn)
}

// withSQLTx starts a transaction on a raw process DB and owns commit/rollback.
func withSQLTx(ctx context.Context, db *sql.DB, opts *sql.TxOptions, fn func(*sql.Tx) error) (err error) {
	tx, err := db.BeginTx(ctx, opts)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	committed := false
	defer func() {
		if committed {
			return
		}

		rollbackErr := tx.Rollback()
		if rollbackErr == nil || errors.Is(rollbackErr, sql.ErrTxDone) {
			return
		}
		if err != nil {
			err = fmt.Errorf("%w; rollback transaction: %w", err, rollbackErr)
			return
		}
		err = fmt.Errorf("rollback transaction: %w", rollbackErr)
	}()

	if err := fn(tx); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	committed = true

	return nil
}

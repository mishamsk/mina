package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// WithTx runs fn inside a database transaction and commits only when fn succeeds.
func WithTx(ctx context.Context, db *sql.DB, opts *sql.TxOptions, fn func(*sql.Tx) error) (err error) {
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

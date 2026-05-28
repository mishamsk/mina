package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"mina.local/mina/internal/models"
)

// CreditLimitHistoryListOptions controls credit limit history list visibility.
type CreditLimitHistoryListOptions struct {
	IncludeTombstoned bool
	List              models.ListOptions
}

// CreditLimitHistoryStore persists account credit limit history.
type CreditLimitHistoryStore struct {
	db *sql.DB
}

// NewCreditLimitHistoryStore creates a credit limit history store using db.
func NewCreditLimitHistoryStore(db *sql.DB) *CreditLimitHistoryStore {
	return &CreditLimitHistoryStore{db: db}
}

// Create persists a new credit limit history entry for an active account.
func (s *CreditLimitHistoryStore) Create(ctx context.Context, accountID int64, req models.CreateCreditLimitHistoryRequest) (models.CreditLimitHistory, error) {
	var history models.CreditLimitHistory
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		accountExists, err := activeAccountExists(ctx, tx, accountID)
		if err != nil {
			return err
		}
		if !accountExists {
			return ErrNotFound
		}

		exists, err := activeCreditLimitHistoryExists(ctx, tx, accountID, req.EffectiveDate)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active credit limit history already exists for account and effective date", ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO credit_limit_history (account_id, credit_limit, effective_date)
VALUES (?, ?, ?)
RETURNING credit_limit_history_id, account_id, credit_limit, effective_date, created_at, tombstoned_at`,
			accountID,
			req.CreditLimit,
			req.EffectiveDate,
		)
		history, err = scanCreditLimitHistory(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active credit limit history already exists for account and effective date", ErrConflict)
			}
			return fmt.Errorf("insert credit limit history: %w", err)
		}

		return nil
	})
	if err != nil {
		return models.CreditLimitHistory{}, err
	}

	return history, nil
}

// Get returns a credit limit history entry by ID.
func (s *CreditLimitHistoryStore) Get(ctx context.Context, id int64, includeTombstoned bool) (models.CreditLimitHistory, error) {
	query := `SELECT credit_limit_history_id, account_id, credit_limit, effective_date, created_at, tombstoned_at
FROM credit_limit_history
WHERE credit_limit_history_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	history, err := scanCreditLimitHistory(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return models.CreditLimitHistory{}, ErrNotFound
	}
	if err != nil {
		return models.CreditLimitHistory{}, fmt.Errorf("get credit limit history: %w", err)
	}

	return history, nil
}

// ListByAccount returns credit limit history for an active account in effective-date order.
func (s *CreditLimitHistoryStore) ListByAccount(ctx context.Context, accountID int64, opts CreditLimitHistoryListOptions) ([]models.CreditLimitHistory, error) {
	accountExists, err := activeAccountExists(ctx, s.db, accountID)
	if err != nil {
		return nil, err
	}
	if !accountExists {
		return nil, ErrNotFound
	}

	query := `SELECT credit_limit_history_id, account_id, credit_limit, effective_date, created_at, tombstoned_at
FROM credit_limit_history
WHERE account_id = ?`
	args := []any{accountID}
	if !opts.IncludeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}
	query, args = appendListOrderAndPage(query, args, opts.List, creditLimitHistorySortColumns, models.SortKeyEffectiveDate, "credit_limit_history_id")

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list credit limit history: %w", err)
	}

	history := []models.CreditLimitHistory{}
	for rows.Next() {
		entry, err := scanCreditLimitHistory(rows)
		if err != nil {
			return nil, fmt.Errorf("scan credit limit history: %w", err)
		}
		history = append(history, entry)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate credit limit history: %w; close credit limit history rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate credit limit history: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close credit limit history rows: %w", err)
	}

	return history, nil
}

// Tombstone marks a credit limit history entry deleted without removing its historical row.
func (s *CreditLimitHistoryStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE credit_limit_history
SET tombstoned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE credit_limit_history_id = ? AND tombstoned_at IS NULL`,
		id,
	)
	if err != nil {
		return fmt.Errorf("tombstone credit limit history: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read tombstone affected rows: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}

	return nil
}

type creditLimitHistoryScanner interface {
	Scan(dest ...any) error
}

func scanCreditLimitHistory(scanner creditLimitHistoryScanner) (models.CreditLimitHistory, error) {
	var history models.CreditLimitHistory
	var tombstonedAt sql.NullString
	if err := scanner.Scan(
		&history.ID,
		&history.AccountID,
		&history.CreditLimit,
		&history.EffectiveDate,
		&history.CreatedAt,
		&tombstonedAt,
	); err != nil {
		return models.CreditLimitHistory{}, err
	}
	if tombstonedAt.Valid {
		history.TombstonedAt = &tombstonedAt.String
	}

	return history, nil
}

type rowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func activeAccountExists(ctx context.Context, queryer rowQuerier, accountID int64) (bool, error) {
	var id int64
	err := queryer.QueryRowContext(
		ctx,
		"SELECT account_id FROM account WHERE account_id = ? AND tombstoned_at IS NULL LIMIT 1",
		accountID,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check active account: %w", err)
	}

	return true, nil
}

func activeCreditLimitHistoryExists(ctx context.Context, queryer rowQuerier, accountID int64, effectiveDate string) (bool, error) {
	var id int64
	err := queryer.QueryRowContext(
		ctx,
		`SELECT credit_limit_history_id
FROM credit_limit_history
WHERE account_id = ? AND effective_date = ? AND tombstoned_at IS NULL
LIMIT 1`,
		accountID,
		effectiveDate,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check active credit limit history: %w", err)
	}

	return true, nil
}

var creditLimitHistorySortColumns = map[models.SortKey][]string{
	models.SortKeyCreatedAt:     {"created_at"},
	models.SortKeyEffectiveDate: {"effective_date"},
}

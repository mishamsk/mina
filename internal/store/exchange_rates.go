package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"mina.local/mina/internal/models"
)

// ExchangeRateListOptions controls exchange rate list filters and visibility.
type ExchangeRateListOptions struct {
	FromCurrency      *string
	ToCurrency        *string
	EffectiveDate     *string
	IncludeTombstoned bool
	List              models.ListOptions
}

// ExchangeRateStore persists exchange rates.
type ExchangeRateStore struct {
	db *sql.DB
}

// NewExchangeRateStore creates an exchange rate store using db.
func NewExchangeRateStore(db *sql.DB) *ExchangeRateStore {
	return &ExchangeRateStore{db: db}
}

// Create persists a new exchange rate.
func (s *ExchangeRateStore) Create(ctx context.Context, req models.CreateExchangeRateRequest) (models.ExchangeRate, error) {
	var rate models.ExchangeRate
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		exists, err := activeExchangeRateExists(ctx, tx, req.FromCurrency, req.ToCurrency, req.EffectiveDate)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active exchange rate already exists for currency pair and effective date", ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO exchange_rate (from_currency, to_currency, rate, effective_date)
VALUES (?, ?, ?, ?)
RETURNING exchange_rate_id, from_currency, to_currency, rate, effective_date, created_at, tombstoned_at`,
			req.FromCurrency,
			req.ToCurrency,
			req.Rate,
			req.EffectiveDate,
		)
		rate, err = scanExchangeRate(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active exchange rate already exists for currency pair and effective date", ErrConflict)
			}
			return fmt.Errorf("insert exchange rate: %w", err)
		}

		return nil
	})
	if err != nil {
		return models.ExchangeRate{}, err
	}

	return rate, nil
}

// Get returns an exchange rate by ID.
func (s *ExchangeRateStore) Get(ctx context.Context, id int64, includeTombstoned bool) (models.ExchangeRate, error) {
	query := `SELECT exchange_rate_id, from_currency, to_currency, rate, effective_date, created_at, tombstoned_at
FROM exchange_rate
WHERE exchange_rate_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	rate, err := scanExchangeRate(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return models.ExchangeRate{}, ErrNotFound
	}
	if err != nil {
		return models.ExchangeRate{}, fmt.Errorf("get exchange rate: %w", err)
	}

	return rate, nil
}

// List returns exchange rates using explicit filters and deterministic ordering.
func (s *ExchangeRateStore) List(ctx context.Context, opts ExchangeRateListOptions) ([]models.ExchangeRate, error) {
	query := `SELECT exchange_rate_id, from_currency, to_currency, rate, effective_date, created_at, tombstoned_at
FROM exchange_rate
WHERE 1 = 1`
	args := []any{}
	if opts.FromCurrency != nil {
		query += " AND from_currency = ?"
		args = append(args, *opts.FromCurrency)
	}
	if opts.ToCurrency != nil {
		query += " AND to_currency = ?"
		args = append(args, *opts.ToCurrency)
	}
	if opts.EffectiveDate != nil {
		query += " AND effective_date = ?"
		args = append(args, *opts.EffectiveDate)
	}
	if !opts.IncludeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}
	query, args = appendListOrderAndPage(query, args, opts.List, exchangeRateSortColumns, models.SortKeyCurrencyPair, "exchange_rate_id")

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list exchange rates: %w", err)
	}

	rates := []models.ExchangeRate{}
	for rows.Next() {
		rate, err := scanExchangeRate(rows)
		if err != nil {
			return nil, fmt.Errorf("scan exchange rate: %w", err)
		}
		rates = append(rates, rate)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate exchange rates: %w; close exchange rate rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate exchange rates: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close exchange rate rows: %w", err)
	}

	return rates, nil
}

// UpdateRate updates an active exchange rate value.
func (s *ExchangeRateStore) UpdateRate(ctx context.Context, id int64, rate string) (models.ExchangeRate, error) {
	row := s.db.QueryRowContext(
		ctx,
		`UPDATE exchange_rate
SET rate = ?
WHERE exchange_rate_id = ? AND tombstoned_at IS NULL
RETURNING exchange_rate_id, from_currency, to_currency, rate, effective_date, created_at, tombstoned_at`,
		rate,
		id,
	)
	updated, err := scanExchangeRate(row)
	if errors.Is(err, sql.ErrNoRows) {
		return models.ExchangeRate{}, ErrNotFound
	}
	if err != nil {
		return models.ExchangeRate{}, fmt.Errorf("update exchange rate: %w", err)
	}

	return updated, nil
}

// Tombstone marks an exchange rate deleted without removing its historical row.
func (s *ExchangeRateStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE exchange_rate
SET tombstoned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE exchange_rate_id = ? AND tombstoned_at IS NULL`,
		id,
	)
	if err != nil {
		return fmt.Errorf("tombstone exchange rate: %w", err)
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

type exchangeRateScanner interface {
	Scan(dest ...any) error
}

func scanExchangeRate(scanner exchangeRateScanner) (models.ExchangeRate, error) {
	var rate models.ExchangeRate
	var tombstonedAt sql.NullString
	if err := scanner.Scan(
		&rate.ID,
		&rate.FromCurrency,
		&rate.ToCurrency,
		&rate.Rate,
		&rate.EffectiveDate,
		&rate.CreatedAt,
		&tombstonedAt,
	); err != nil {
		return models.ExchangeRate{}, err
	}
	if tombstonedAt.Valid {
		rate.TombstonedAt = &tombstonedAt.String
	}

	return rate, nil
}

func activeExchangeRateExists(ctx context.Context, tx *sql.Tx, fromCurrency string, toCurrency string, effectiveDate string) (bool, error) {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		`SELECT exchange_rate_id
FROM exchange_rate
WHERE from_currency = ? AND to_currency = ? AND effective_date = ? AND tombstoned_at IS NULL
LIMIT 1`,
		fromCurrency,
		toCurrency,
		effectiveDate,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check active exchange rate: %w", err)
	}

	return true, nil
}

var exchangeRateSortColumns = map[models.SortKey][]string{
	models.SortKeyCreatedAt:     {"created_at"},
	models.SortKeyCurrencyPair:  {"from_currency", "to_currency", "effective_date"},
	models.SortKeyEffectiveDate: {"effective_date"},
	models.SortKeyFromCurrency:  {"from_currency"},
	models.SortKeyToCurrency:    {"to_currency"},
}

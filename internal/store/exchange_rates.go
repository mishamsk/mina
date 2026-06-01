package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/exchangerates"
	"github.com/mishamsk/mina/internal/services/values"
)

// ExchangeRateStore persists exchange rates.
type ExchangeRateStore struct {
	accounting *AccountingDB
}

var _ exchangerates.Repository = (*ExchangeRateStore)(nil)

// NewExchangeRateStore creates an exchange rate store using accounting.
func NewExchangeRateStore(accounting *AccountingDB) *ExchangeRateStore {
	return &ExchangeRateStore{accounting: accounting}
}

// Create persists a new exchange rate.
func (s *ExchangeRateStore) Create(ctx context.Context, input exchangerates.CreateInput) (exchangerates.ExchangeRate, error) {
	var rate exchangerates.ExchangeRate
	err := s.accounting.withTx(ctx, nil, func(tx *sql.Tx) error {
		exists, err := activeExchangeRateExists(ctx, tx, s.accounting, input.FromCurrency, input.ToCurrency, input.EffectiveDate)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active exchange rate already exists for currency pair and effective date", services.ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.accounting.location.mustQualifiedName("exchange_rate")+` (from_currency, to_currency, rate, effective_date)
VALUES (?, ?, ?, ?)
RETURNING exchange_rate_id, from_currency, to_currency, rate, effective_date, created_at, tombstoned_at`,
			input.FromCurrency,
			input.ToCurrency,
			input.Rate.LibraryDecimal(),
			timestampArg(input.EffectiveDate),
		)
		rate, err = scanExchangeRate(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active exchange rate already exists for currency pair and effective date", services.ErrConflict)
			}
			return fmt.Errorf("insert exchange rate: %w", err)
		}

		return nil
	})
	if err != nil {
		return exchangerates.ExchangeRate{}, err
	}

	return rate, nil
}

// Get returns an exchange rate by ID.
func (s *ExchangeRateStore) Get(ctx context.Context, id int64, includeTombstoned bool) (exchangerates.ExchangeRate, error) {
	query := `SELECT exchange_rate_id, from_currency, to_currency, rate, effective_date, created_at, tombstoned_at
FROM ` + s.accounting.location.mustQualifiedName("exchange_rate") + `
WHERE exchange_rate_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	rate, err := scanExchangeRate(s.accounting.query().QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return exchangerates.ExchangeRate{}, services.ErrNotFound
	}
	if err != nil {
		return exchangerates.ExchangeRate{}, fmt.Errorf("get exchange rate: %w", err)
	}

	return rate, nil
}

// List returns exchange rates using explicit filters and deterministic ordering.
func (s *ExchangeRateStore) List(ctx context.Context, opts exchangerates.ListOptions) ([]exchangerates.ExchangeRate, error) {
	query := `SELECT exchange_rate_id, from_currency, to_currency, rate, effective_date, created_at, tombstoned_at
FROM ` + s.accounting.location.mustQualifiedName("exchange_rate") + `
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
		args = append(args, timestampArg(*opts.EffectiveDate))
	}
	if !opts.IncludeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}
	query, args = appendServiceListOrderAndPage(query, args, opts.List, exchangeRateSortColumns, services.SortKeyCurrencyPair, "exchange_rate_id")

	rows, err := s.accounting.query().QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list exchange rates: %w", err)
	}

	rates := []exchangerates.ExchangeRate{}
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
func (s *ExchangeRateStore) UpdateRate(ctx context.Context, id int64, rate values.Decimal) (exchangerates.ExchangeRate, error) {
	row := s.accounting.query().QueryRowContext(
		ctx,
		`UPDATE `+s.accounting.location.mustQualifiedName("exchange_rate")+`
SET rate = ?
WHERE exchange_rate_id = ? AND tombstoned_at IS NULL
RETURNING exchange_rate_id, from_currency, to_currency, rate, effective_date, created_at, tombstoned_at`,
		rate.LibraryDecimal(),
		id,
	)
	updated, err := scanExchangeRate(row)
	if errors.Is(err, sql.ErrNoRows) {
		return exchangerates.ExchangeRate{}, services.ErrNotFound
	}
	if err != nil {
		return exchangerates.ExchangeRate{}, fmt.Errorf("update exchange rate: %w", err)
	}

	return updated, nil
}

// Tombstone marks an exchange rate deleted without removing its historical row.
func (s *ExchangeRateStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.accounting.query().ExecContext(
		ctx,
		`UPDATE `+s.accounting.location.mustQualifiedName("exchange_rate")+`
SET tombstoned_at = CURRENT_TIMESTAMP
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
		return services.ErrNotFound
	}

	return nil
}

type exchangeRateScanner interface {
	Scan(dest ...any) error
}

func scanExchangeRate(scanner exchangeRateScanner) (exchangerates.ExchangeRate, error) {
	var rate exchangerates.ExchangeRate
	var rateValue duckdb.Decimal
	var effectiveDate time.Time
	var createdAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&rate.ID,
		&rate.FromCurrency,
		&rate.ToCurrency,
		&rateValue,
		&effectiveDate,
		&createdAt,
		&tombstonedAt,
	); err != nil {
		return exchangerates.ExchangeRate{}, err
	}
	parsedRate, err := decimalFromDuckDB(rateValue)
	if err != nil {
		return exchangerates.ExchangeRate{}, fmt.Errorf("scan exchange rate decimal: %w", err)
	}
	rate.Rate = parsedRate
	rate.EffectiveDate = effectiveDate.UTC()
	rate.CreatedAt = createdAt.UTC()
	rate.TombstonedAt = nullableTimeFromSQL(tombstonedAt)

	return rate, nil
}

func activeExchangeRateExists(ctx context.Context, tx *sql.Tx, accounting *AccountingDB, fromCurrency string, toCurrency string, effectiveDate time.Time) (bool, error) {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		`SELECT exchange_rate_id
FROM `+accounting.location.mustQualifiedName("exchange_rate")+`
WHERE from_currency = ? AND to_currency = ? AND effective_date = ? AND tombstoned_at IS NULL
LIMIT 1`,
		fromCurrency,
		toCurrency,
		timestampArg(effectiveDate),
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check active exchange rate: %w", err)
	}

	return true, nil
}

var exchangeRateSortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt:     {"created_at"},
	services.SortKeyCurrencyPair:  {"from_currency", "to_currency", "effective_date"},
	services.SortKeyEffectiveDate: {"effective_date"},
	services.SortKeyFromCurrency:  {"from_currency"},
	services.SortKeyToCurrency:    {"to_currency"},
}

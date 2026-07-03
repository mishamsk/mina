package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/exchangerateloading"
	"github.com/mishamsk/mina/internal/services/exchangerates"
	"github.com/mishamsk/mina/internal/services/values"
)

// ExchangeRateStore persists exchange rates.
type ExchangeRateStore struct {
	db *AppDB
}

var _ exchangerates.Repository = (*ExchangeRateStore)(nil)
var _ exchangerateloading.Repository = (*ExchangeRateStore)(nil)

// NewExchangeRateStore creates an exchange rate store using AppDB.
func NewExchangeRateStore(db *AppDB) *ExchangeRateStore {
	return &ExchangeRateStore{db: db}
}

// NeededCurrencies returns tracked currencies: all non-USD currencies seen in active journal records.
func (s *ExchangeRateStore) NeededCurrencies(ctx context.Context) ([]exchangerateloading.NeededCurrency, error) {
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT DISTINCT jr.currency
FROM `+s.db.accountingName("journal_record")+` AS jr
JOIN `+s.db.accountingName("transaction")+` AS t
  ON t.transaction_id = jr.transaction_id
WHERE jr.tombstoned_at IS NULL
  AND t.tombstoned_at IS NULL
  AND jr.currency <> 'USD'
ORDER BY jr.currency`,
	)
	if err != nil {
		return nil, fmt.Errorf("query needed exchange-rate currencies: %w", err)
	}

	needed := []exchangerateloading.NeededCurrency{}
	for rows.Next() {
		var currency string
		if err := rows.Scan(&currency); err != nil {
			return nil, fmt.Errorf("scan needed exchange-rate currency: %w", err)
		}
		needed = append(needed, exchangerateloading.NeededCurrency{
			Currency: currency,
		})
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate needed exchange-rate currencies: %w; close rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate needed exchange-rate currencies: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close needed exchange-rate currency rows: %w", err)
	}

	return needed, nil
}

// LatestActiveUSDRateDates returns the latest active USD pair date for each currency.
func (s *ExchangeRateStore) LatestActiveUSDRateDates(ctx context.Context, currencies []string) (map[string]values.CivilDate, error) {
	result := make(map[string]values.CivilDate)
	if len(currencies) == 0 {
		return result, nil
	}

	query := `SELECT to_currency, MAX(CAST(effective_date AS DATE))
FROM ` + s.db.accountingName("exchange_rate") + `
WHERE tombstoned_at IS NULL
  AND from_currency = 'USD'
  AND to_currency IN (` + placeholders(len(currencies)) + `)
GROUP BY to_currency`
	args := make([]any, 0, len(currencies))
	for _, currency := range currencies {
		args = append(args, currency)
	}
	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query latest USD exchange-rate dates: %w", err)
	}

	for rows.Next() {
		var currency string
		var latest time.Time
		if err := rows.Scan(&currency, &latest); err != nil {
			return nil, fmt.Errorf("scan latest USD exchange-rate date: %w", err)
		}
		result[currency] = values.CivilDateFromTime(latest)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate latest USD exchange-rate dates: %w; close rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate latest USD exchange-rate dates: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close latest USD exchange-rate rows: %w", err)
	}

	return result, nil
}

// EarliestMissingActiveUSDRateDates returns demand-driven backfill dates for unresolved journal records without exact active USD rates.
func (s *ExchangeRateStore) EarliestMissingActiveUSDRateDates(
	ctx context.Context,
	currencies []string,
) (map[string]values.CivilDate, error) {
	result := make(map[string]values.CivilDate)
	if len(currencies) == 0 {
		return result, nil
	}

	query := `WITH needed_record AS (
	SELECT jr.currency, COALESCE(CAST(jr.posted_date AS DATE), t.initiated_date) AS needed_date
	FROM ` + s.db.accountingName("journal_record") + ` AS jr
	JOIN ` + s.db.accountingName("transaction") + ` AS t
	  ON t.transaction_id = jr.transaction_id
	WHERE jr.tombstoned_at IS NULL
	  AND t.tombstoned_at IS NULL
	  AND jr.currency <> 'USD'
	  AND jr.amount_usd IS NULL
	  AND jr.currency IN (` + placeholders(len(currencies)) + `)
)
SELECT needed_record.currency, MIN(needed_record.needed_date)
FROM needed_record
LEFT JOIN ` + s.db.accountingName("exchange_rate") + ` AS er
  ON er.tombstoned_at IS NULL
 AND er.from_currency = 'USD'
 AND er.to_currency = needed_record.currency
 AND CAST(er.effective_date AS DATE) = needed_record.needed_date
WHERE er.exchange_rate_id IS NULL
GROUP BY needed_record.currency`
	args := make([]any, 0, len(currencies))
	for _, currency := range currencies {
		args = append(args, currency)
	}
	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query missing USD exchange-rate dates: %w", err)
	}

	for rows.Next() {
		var currency string
		var earliest time.Time
		if err := rows.Scan(&currency, &earliest); err != nil {
			return nil, fmt.Errorf("scan missing USD exchange-rate date: %w", err)
		}
		result[currency] = values.CivilDateFromTime(earliest)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate missing USD exchange-rate dates: %w; close rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate missing USD exchange-rate dates: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close missing USD exchange-rate rows: %w", err)
	}

	return result, nil
}

// UpsertActiveUSDRates creates or updates active USD exchange rates.
func (s *ExchangeRateStore) UpsertActiveUSDRates(ctx context.Context, rates []exchangerates.UpsertRate) error {
	if len(rates) == 0 {
		return nil
	}

	sourceRows := make([]string, 0, len(rates))
	args := make([]any, 0, len(rates)*3)
	for _, rate := range rates {
		sourceRows = append(sourceRows, "(?, ?, ?)")
		args = append(args, rate.ToCurrency, rate.Rate.LibraryDecimal(), timestampArg(rate.EffectiveDate.Time()))
	}

	_, err := s.db.query().ExecContext(
		ctx,
		`MERGE INTO `+s.db.accountingName("exchange_rate")+` AS target
USING (VALUES `+strings.Join(sourceRows, ", ")+`) AS source(to_currency, rate, effective_date)
ON target.from_currency = 'USD'
 AND target.to_currency = source.to_currency
 AND target.effective_date = source.effective_date
 AND target.tombstoned_at IS NULL
WHEN MATCHED THEN UPDATE SET rate = source.rate
WHEN NOT MATCHED THEN INSERT (from_currency, to_currency, rate, effective_date)
VALUES ('USD', source.to_currency, source.rate, source.effective_date)`,
		args...,
	)
	if err != nil {
		return fmt.Errorf("upsert active USD exchange rates: %w", err)
	}

	return nil
}

// BracketingActiveUSDRates returns the nearest active USD rates around date.
func (s *ExchangeRateStore) BracketingActiveUSDRates(
	ctx context.Context,
	currency string,
	date values.CivilDate,
) (exchangerates.USDRateBracket, error) {
	before, err := s.bracketingActiveUSDRate(ctx, currency, date, "<=", "DESC")
	if err != nil {
		return exchangerates.USDRateBracket{}, err
	}
	after, err := s.bracketingActiveUSDRate(ctx, currency, date, ">=", "ASC")
	if err != nil {
		return exchangerates.USDRateBracket{}, err
	}

	return exchangerates.USDRateBracket{AtOrBefore: before, AtOrAfter: after}, nil
}

func (s *ExchangeRateStore) bracketingActiveUSDRate(
	ctx context.Context,
	currency string,
	date values.CivilDate,
	operator string,
	direction string,
) (*exchangerates.ExchangeRate, error) {
	rate, err := scanExchangeRate(s.db.query().QueryRowContext(
		ctx,
		`SELECT exchange_rate_id, from_currency, to_currency, rate, effective_date, created_at, tombstoned_at
FROM `+s.db.accountingName("exchange_rate")+`
WHERE tombstoned_at IS NULL
  AND from_currency = 'USD'
  AND to_currency = ?
  AND CAST(effective_date AS DATE) `+operator+` ?
ORDER BY CAST(effective_date AS DATE) `+direction+`, effective_date `+direction+`, exchange_rate_id `+direction+`
LIMIT 1`,
		currency,
		civilDateArg(date),
	))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query bracketing active USD exchange rate: %w", err)
	}

	return &rate, nil
}

// Create persists a new exchange rate.
func (s *ExchangeRateStore) Create(ctx context.Context, input exchangerates.CreateInput) (exchangerates.ExchangeRate, error) {
	var rate exchangerates.ExchangeRate
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		exists, err := activeExchangeRateExists(ctx, tx, s.db, input.FromCurrency, input.ToCurrency, input.EffectiveDate)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active exchange rate already exists for currency pair and effective date", services.ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.db.accountingName("exchange_rate")+` (from_currency, to_currency, rate, effective_date)
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
FROM ` + s.db.accountingName("exchange_rate") + `
WHERE exchange_rate_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	rate, err := scanExchangeRate(s.db.query().QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return exchangerates.ExchangeRate{}, services.ErrNotFound
	}
	if err != nil {
		return exchangerates.ExchangeRate{}, fmt.Errorf("get exchange rate: %w", err)
	}

	return rate, nil
}

// List returns exchange rates using explicit filters and deterministic ordering.
func (s *ExchangeRateStore) List(ctx context.Context, opts exchangerates.ListOptions) (services.PaginatedList[exchangerates.ExchangeRate], error) {
	filterQuery := `FROM ` + s.db.accountingName("exchange_rate") + `
WHERE 1 = 1`
	args := []any{}
	if opts.FromCurrency != nil {
		filterQuery += " AND from_currency = ?"
		args = append(args, *opts.FromCurrency)
	}
	if opts.ToCurrency != nil {
		filterQuery += " AND to_currency = ?"
		args = append(args, *opts.ToCurrency)
	}
	if opts.EffectiveDate != nil {
		filterQuery += " AND effective_date = ?"
		args = append(args, timestampArg(*opts.EffectiveDate))
	}
	if !opts.IncludeTombstoned {
		filterQuery += " AND tombstoned_at IS NULL"
	}

	totalCount, err := countMatchingRows(ctx, s.db.query(), "SELECT COUNT(*) "+filterQuery, args, "exchange rates", opts.List.IncludeTotalCount)
	if err != nil {
		return services.PaginatedList[exchangerates.ExchangeRate]{}, err
	}

	query := `SELECT exchange_rate_id, from_currency, to_currency, rate, effective_date, created_at, tombstoned_at
` + filterQuery
	query, args = appendServiceListOrderAndPage(query, args, opts.List, exchangeRateSortColumns, services.SortKeyCurrencyPair, "exchange_rate_id")

	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return services.PaginatedList[exchangerates.ExchangeRate]{}, fmt.Errorf("list exchange rates: %w", err)
	}

	rates := []exchangerates.ExchangeRate{}
	for rows.Next() {
		rate, err := scanExchangeRate(rows)
		if err != nil {
			return services.PaginatedList[exchangerates.ExchangeRate]{}, fmt.Errorf("scan exchange rate: %w", err)
		}
		rates = append(rates, rate)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return services.PaginatedList[exchangerates.ExchangeRate]{}, fmt.Errorf("iterate exchange rates: %w; close exchange rate rows: %w", err, closeErr)
		}
		return services.PaginatedList[exchangerates.ExchangeRate]{}, fmt.Errorf("iterate exchange rates: %w", err)
	}
	if err := rows.Close(); err != nil {
		return services.PaginatedList[exchangerates.ExchangeRate]{}, fmt.Errorf("close exchange rate rows: %w", err)
	}

	return services.PaginatedList[exchangerates.ExchangeRate]{
		Items:      rates,
		TotalCount: totalCount,
	}, nil
}

// UpdateRate updates an active exchange rate value.
func (s *ExchangeRateStore) UpdateRate(ctx context.Context, id int64, rate values.Decimal) (exchangerates.ExchangeRate, error) {
	row := s.db.query().QueryRowContext(
		ctx,
		`UPDATE `+s.db.accountingName("exchange_rate")+`
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
	result, err := s.db.query().ExecContext(
		ctx,
		`UPDATE `+s.db.accountingName("exchange_rate")+`
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

func activeExchangeRateExists(ctx context.Context, tx *sql.Tx, db *AppDB, fromCurrency string, toCurrency string, effectiveDate time.Time) (bool, error) {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		`SELECT exchange_rate_id
FROM `+db.accountingName("exchange_rate")+`
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

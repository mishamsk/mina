package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/exchangeratecache"
	"github.com/mishamsk/mina/internal/services/values"
)

const (
	denseExchangeRateTableName         = "dense_exchange_rates"
	denseExchangeRateBuildTableName    = "dense_exchange_rates_rebuild"
	denseExchangeRatePreviousTableName = "dense_exchange_rates_previous"
)

// DenseExchangeRateStore rebuilds and reads an app's runtime daily rates.
type DenseExchangeRateStore struct {
	db *AppDB
}

var _ exchangeratecache.Repository = (*DenseExchangeRateStore)(nil)

// NewDenseExchangeRateStore prepares dense daily exchange-rate persistence.
func NewDenseExchangeRateStore(ctx context.Context, db *AppDB) (*DenseExchangeRateStore, error) {
	store := &DenseExchangeRateStore{db: db}
	if err := store.prepare(ctx); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *DenseExchangeRateStore) prepare(ctx context.Context) error {
	if _, err := s.db.query().ExecContext(ctx, `CREATE TABLE `+s.db.runtimeName(denseExchangeRateTableName)+` (
	from_currency TEXT NOT NULL,
	to_currency TEXT NOT NULL,
	effective_date DATE NOT NULL,
	rate DECIMAL(18,8) NOT NULL,
	interpolated BOOLEAN NOT NULL
)`); err != nil {
		return fmt.Errorf("create dense exchange-rate table: %w", err)
	}

	return nil
}

// Rebuild stages a dense snapshot, then transactionally swaps it into service.
func (s *DenseExchangeRateStore) Rebuild(ctx context.Context) (err error) {
	if _, err := s.db.query().ExecContext(ctx, "DROP TABLE IF EXISTS "+s.db.runtimeName(denseExchangeRateBuildTableName)); err != nil {
		return fmt.Errorf("drop stale dense exchange-rate build table: %w", err)
	}
	defer func() {
		if _, cleanupErr := s.db.query().ExecContext(
			context.Background(),
			"DROP TABLE IF EXISTS "+s.db.runtimeName(denseExchangeRateBuildTableName),
		); cleanupErr != nil {
			err = errors.Join(err, fmt.Errorf("drop dense exchange-rate build table: %w", cleanupErr))
		}
	}()

	_, err = s.db.query().ExecContext(ctx, `CREATE TABLE `+s.db.runtimeName(denseExchangeRateBuildTableName)+` AS
WITH source_rate AS MATERIALIZED (
	SELECT
		to_currency,
		CAST(effective_date AS DATE) AS effective_date,
		effective_date AS effective_timestamp,
		exchange_rate_id,
		rate
	FROM `+s.db.accountingName("exchange_rate")+`
	WHERE tombstoned_at IS NULL
	  AND from_currency = 'USD'
),
currency_bounds AS (
	SELECT to_currency, MIN(effective_date) AS first_date, MAX(effective_date) AS last_date
	FROM source_rate
	GROUP BY to_currency
),
dense_date AS (
	SELECT bounds.to_currency, CAST(series.effective_date AS DATE) AS effective_date
	FROM currency_bounds AS bounds
	CROSS JOIN LATERAL generate_series(bounds.first_date, bounds.last_date, INTERVAL 1 DAY) AS series(effective_date)
),
resolved AS (
	SELECT
		dense_date.to_currency,
		dense_date.effective_date,
		exact.rate AS exact_rate,
		prior.effective_date AS prior_date,
		prior.rate AS prior_rate,
		following.effective_date AS following_date,
		following.rate AS following_rate
	FROM dense_date
	LEFT JOIN LATERAL (
		SELECT source_rate.rate
		FROM source_rate
		WHERE source_rate.to_currency = dense_date.to_currency
		  AND source_rate.effective_date = dense_date.effective_date
		ORDER BY source_rate.effective_timestamp DESC, source_rate.exchange_rate_id DESC
		LIMIT 1
	) AS exact ON true
	LEFT JOIN LATERAL (
		SELECT source_rate.effective_date, source_rate.rate
		FROM source_rate
		WHERE source_rate.to_currency = dense_date.to_currency
		  AND source_rate.effective_date < dense_date.effective_date
		ORDER BY source_rate.effective_date DESC, source_rate.effective_timestamp DESC, source_rate.exchange_rate_id DESC
		LIMIT 1
	) AS prior ON true
	LEFT JOIN LATERAL (
		SELECT source_rate.effective_date, source_rate.rate
		FROM source_rate
		WHERE source_rate.to_currency = dense_date.to_currency
		  AND source_rate.effective_date > dense_date.effective_date
		ORDER BY source_rate.effective_date ASC, source_rate.effective_timestamp ASC, source_rate.exchange_rate_id ASC
		LIMIT 1
	) AS following ON true
),
scaled AS (
	SELECT
		*,
		CAST(prior_rate * 100000000::HUGEINT AS HUGEINT) AS prior_scaled,
		CAST(following_rate * 100000000::HUGEINT AS HUGEINT) AS following_scaled,
		date_diff('day', prior_date, effective_date)::HUGEINT AS elapsed_days,
		date_diff('day', prior_date, following_date)::HUGEINT AS total_days
	FROM resolved
),
interpolation_division AS (
	SELECT
		*,
		(following_scaled - prior_scaled) * elapsed_days AS numerator,
		((following_scaled - prior_scaled) * elapsed_days) // total_days AS quotient,
		((following_scaled - prior_scaled) * elapsed_days) % total_days AS remainder
	FROM scaled
)
SELECT
	CAST('USD' AS TEXT) AS from_currency,
	to_currency,
	effective_date,
	CAST(CASE
		WHEN exact_rate IS NOT NULL THEN exact_rate
		ELSE TRY_CAST((
			prior_scaled + quotient + CASE
				WHEN abs(remainder) * 2 > total_days OR (
					abs(remainder) * 2 = total_days AND abs(quotient) % 2 = 1
				) THEN sign(numerator)
				ELSE 0
			END
		) * CAST(0.00000001 AS DECIMAL(9,8)) AS DECIMAL(18,8))
	END AS DECIMAL(18,8)) AS rate,
	CAST(exact_rate IS NULL AS BOOLEAN) AS interpolated
FROM interpolation_division
WHERE exact_rate IS NOT NULL OR (prior_rate IS NOT NULL AND following_rate IS NOT NULL)`)
	if err != nil {
		return fmt.Errorf("populate dense exchange-rate build table: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	err = s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "DROP TABLE IF EXISTS "+s.db.runtimeName(denseExchangeRatePreviousTableName)); err != nil {
			return fmt.Errorf("drop stale previous dense exchange-rate table: %w", err)
		}
		if _, err := tx.ExecContext(
			ctx,
			"ALTER TABLE "+s.db.runtimeName(denseExchangeRateTableName)+" RENAME TO "+QuoteIdentifier(denseExchangeRatePreviousTableName),
		); err != nil {
			return fmt.Errorf("retire dense exchange-rate snapshot: %w", err)
		}
		if _, err := tx.ExecContext(
			ctx,
			"ALTER TABLE "+s.db.runtimeName(denseExchangeRateBuildTableName)+" RENAME TO "+QuoteIdentifier(denseExchangeRateTableName),
		); err != nil {
			return fmt.Errorf("publish dense exchange-rate snapshot: %w", err)
		}
		if _, err := tx.ExecContext(ctx, "DROP TABLE "+s.db.runtimeName(denseExchangeRatePreviousTableName)); err != nil {
			return fmt.Errorf("drop previous dense exchange-rate snapshot: %w", err)
		}

		return nil
	})
	if err != nil {
		return fmt.Errorf("rebuild dense exchange-rate snapshot: %w", err)
	}

	return nil
}

// List returns one deterministic page from the committed snapshot.
func (s *DenseExchangeRateStore) List(
	ctx context.Context,
	opts exchangeratecache.ListOptions,
) (services.PaginatedList[exchangeratecache.DailyRate], error) {
	filterQuery := "FROM " + s.db.runtimeName(denseExchangeRateTableName) + " WHERE 1 = 1"
	args := []any{}
	if opts.ToCurrency != nil {
		filterQuery += " AND to_currency = ?"
		args = append(args, *opts.ToCurrency)
	}
	if opts.EffectiveDateFrom != nil {
		filterQuery += " AND effective_date >= ?"
		args = append(args, civilDateArg(*opts.EffectiveDateFrom))
	}
	if opts.EffectiveDateTo != nil {
		filterQuery += " AND effective_date <= ?"
		args = append(args, civilDateArg(*opts.EffectiveDateTo))
	}

	var result services.PaginatedList[exchangeratecache.DailyRate]
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		totalCount, err := countMatchingRows(ctx, tx, "SELECT COUNT(*) "+filterQuery, args, "daily exchange rates", true)
		if err != nil {
			return err
		}

		query := `SELECT from_currency, to_currency, effective_date, rate, interpolated
` + filterQuery + `
ORDER BY to_currency ASC, effective_date ASC`
		query, pageArgs := appendLimitOffset(query, args, opts.Limit, opts.Offset)
		rows, err := tx.QueryContext(ctx, query, pageArgs...)
		if err != nil {
			return fmt.Errorf("list daily exchange rates: %w", err)
		}

		rates := []exchangeratecache.DailyRate{}
		for rows.Next() {
			rate, err := scanDailyExchangeRate(rows)
			if err != nil {
				return fmt.Errorf("scan daily exchange rate: %w", err)
			}
			rates = append(rates, rate)
		}
		if err := rows.Err(); err != nil {
			if closeErr := rows.Close(); closeErr != nil {
				return fmt.Errorf("iterate daily exchange rates: %w; close rows: %w", err, closeErr)
			}
			return fmt.Errorf("iterate daily exchange rates: %w", err)
		}
		if err := rows.Close(); err != nil {
			return fmt.Errorf("close daily exchange-rate rows: %w", err)
		}

		result = services.PaginatedList[exchangeratecache.DailyRate]{Items: rates, TotalCount: totalCount}

		return nil
	})
	if err != nil {
		return services.PaginatedList[exchangeratecache.DailyRate]{}, err
	}

	return result, nil
}

func scanDailyExchangeRate(scanner exchangeRateScanner) (exchangeratecache.DailyRate, error) {
	var rate exchangeratecache.DailyRate
	var effectiveDate time.Time
	var rateValue duckdb.Decimal
	if err := scanner.Scan(
		&rate.FromCurrency,
		&rate.ToCurrency,
		&effectiveDate,
		&rateValue,
		&rate.Interpolated,
	); err != nil {
		return exchangeratecache.DailyRate{}, err
	}
	parsedRate, err := decimalFromDuckDB(rateValue)
	if err != nil {
		return exchangeratecache.DailyRate{}, fmt.Errorf("scan daily exchange-rate decimal: %w", err)
	}
	rate.EffectiveDate = values.CivilDateFromTime(effectiveDate)
	rate.Rate = parsedRate

	return rate, nil
}

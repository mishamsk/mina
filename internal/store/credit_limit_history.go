package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/creditlimits"
	"github.com/mishamsk/mina/internal/services/values"
)

// CreditLimitHistoryStore persists account credit limit history.
type CreditLimitHistoryStore struct {
	db *AppDB
}

var _ creditlimits.Repository = (*CreditLimitHistoryStore)(nil)

// NewCreditLimitHistoryStore creates a credit limit history store using AppDB.
func NewCreditLimitHistoryStore(db *AppDB) *CreditLimitHistoryStore {
	return &CreditLimitHistoryStore{db: db}
}

// Create persists a new credit limit history entry for an active account.
func (s *CreditLimitHistoryStore) Create(ctx context.Context, accountID int64, input creditlimits.CreateInput) (creditlimits.CreditLimitHistory, error) {
	var history creditlimits.CreditLimitHistory
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		exists, err := activeCreditLimitHistoryExists(ctx, tx, s.db, accountID, input.EffectiveDate)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active credit limit history already exists for account and effective date", services.ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.db.accountingName("credit_limit_history")+` (account_id, credit_limit, effective_date)
VALUES (?, ?, ?)
RETURNING credit_limit_history_id, account_id, credit_limit, effective_date, created_at, tombstoned_at`,
			accountID,
			input.CreditLimit.LibraryDecimal(),
			civilDateArg(input.EffectiveDate),
		)
		history, err = scanCreditLimitHistory(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active credit limit history already exists for account and effective date", services.ErrConflict)
			}
			return fmt.Errorf("insert credit limit history: %w", err)
		}

		return nil
	})
	if err != nil {
		return creditlimits.CreditLimitHistory{}, err
	}

	return history, nil
}

// Get returns a credit limit history entry by ID.
func (s *CreditLimitHistoryStore) Get(ctx context.Context, id int64, includeTombstoned bool) (creditlimits.CreditLimitHistory, error) {
	query := `SELECT credit_limit_history_id, account_id, credit_limit, effective_date, created_at, tombstoned_at
FROM ` + s.db.accountingName("credit_limit_history") + `
WHERE credit_limit_history_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	history, err := scanCreditLimitHistory(s.db.query().QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return creditlimits.CreditLimitHistory{}, services.ErrNotFound
	}
	if err != nil {
		return creditlimits.CreditLimitHistory{}, fmt.Errorf("get credit limit history: %w", err)
	}

	return history, nil
}

// ListByAccount returns credit limit history for an active account in effective-date order.
func (s *CreditLimitHistoryStore) ListByAccount(ctx context.Context, accountID int64, opts creditlimits.ListOptions) (services.PaginatedList[creditlimits.CreditLimitHistory], error) {
	filterQuery := `FROM ` + s.db.accountingName("credit_limit_history") + `
WHERE account_id = ?`
	args := []any{accountID}
	if !opts.IncludeTombstoned {
		filterQuery += " AND tombstoned_at IS NULL"
	}

	totalCount, err := countMatchingRows(ctx, s.db.query(), "SELECT COUNT(*) "+filterQuery, args, "credit limit history", opts.List.IncludeTotalCount)
	if err != nil {
		return services.PaginatedList[creditlimits.CreditLimitHistory]{}, err
	}

	query := `SELECT credit_limit_history_id, account_id, credit_limit, effective_date, created_at, tombstoned_at
` + filterQuery
	query, args = appendServiceListOrderAndPage(query, args, opts.List, creditLimitHistorySortColumns, services.SortKeyEffectiveDate, "credit_limit_history_id")

	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return services.PaginatedList[creditlimits.CreditLimitHistory]{}, fmt.Errorf("list credit limit history: %w", err)
	}

	history := []creditlimits.CreditLimitHistory{}
	for rows.Next() {
		entry, err := scanCreditLimitHistory(rows)
		if err != nil {
			return services.PaginatedList[creditlimits.CreditLimitHistory]{}, fmt.Errorf("scan credit limit history: %w", err)
		}
		history = append(history, entry)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return services.PaginatedList[creditlimits.CreditLimitHistory]{}, fmt.Errorf("iterate credit limit history: %w; close credit limit history rows: %w", err, closeErr)
		}
		return services.PaginatedList[creditlimits.CreditLimitHistory]{}, fmt.Errorf("iterate credit limit history: %w", err)
	}
	if err := rows.Close(); err != nil {
		return services.PaginatedList[creditlimits.CreditLimitHistory]{}, fmt.Errorf("close credit limit history rows: %w", err)
	}

	return services.PaginatedList[creditlimits.CreditLimitHistory]{
		Items:      history,
		TotalCount: totalCount,
	}, nil
}

// CurrentByAccounts returns the latest active credit limit on or before asOf for each account.
func (s *CreditLimitHistoryStore) CurrentByAccounts(ctx context.Context, accountIDs []int64, asOf values.CivilDate) (map[int64]values.Decimal, error) {
	if len(accountIDs) == 0 {
		return map[int64]values.Decimal{}, nil
	}

	rows, err := s.db.query().QueryContext(
		ctx,
		`WITH ranked_limits AS (
	SELECT account_id,
	       credit_limit,
	       ROW_NUMBER() OVER (
	           PARTITION BY account_id
	           ORDER BY effective_date DESC, credit_limit_history_id DESC
	       ) AS row_number
	FROM `+s.db.accountingName("credit_limit_history")+`
	WHERE tombstoned_at IS NULL
	  AND effective_date <= ?
	  AND account_id IN (`+placeholders(len(accountIDs))+`)
)
SELECT account_id, credit_limit
FROM ranked_limits
WHERE row_number = 1
ORDER BY account_id ASC`,
		append([]any{civilDateArg(asOf)}, int64Args(accountIDs)...)...,
	)
	if err != nil {
		return nil, fmt.Errorf("list current credit limits: %w", err)
	}

	limits := make(map[int64]values.Decimal, len(accountIDs))
	for rows.Next() {
		var accountID int64
		var creditLimit duckdb.Decimal
		if err := rows.Scan(&accountID, &creditLimit); err != nil {
			return nil, fmt.Errorf("scan current credit limit: %w", err)
		}
		parsedLimit, err := decimalFromDuckDB(creditLimit)
		if err != nil {
			return nil, fmt.Errorf("scan current credit limit decimal: %w", err)
		}
		limits[accountID] = parsedLimit
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate current credit limits: %w; close current credit limit rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate current credit limits: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close current credit limit rows: %w", err)
	}

	return limits, nil
}

// Tombstone marks a credit limit history entry deleted without removing its historical row.
func (s *CreditLimitHistoryStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.query().ExecContext(
		ctx,
		`UPDATE `+s.db.accountingName("credit_limit_history")+`
SET tombstoned_at = CURRENT_TIMESTAMP
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
		return services.ErrNotFound
	}

	return nil
}

type creditLimitHistoryScanner interface {
	Scan(dest ...any) error
}

func scanCreditLimitHistory(scanner creditLimitHistoryScanner) (creditlimits.CreditLimitHistory, error) {
	var history creditlimits.CreditLimitHistory
	var creditLimit duckdb.Decimal
	var effectiveDate time.Time
	var createdAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&history.ID,
		&history.AccountID,
		&creditLimit,
		&effectiveDate,
		&createdAt,
		&tombstonedAt,
	); err != nil {
		return creditlimits.CreditLimitHistory{}, err
	}
	parsedLimit, err := decimalFromDuckDB(creditLimit)
	if err != nil {
		return creditlimits.CreditLimitHistory{}, fmt.Errorf("scan credit limit decimal: %w", err)
	}
	history.CreditLimit = parsedLimit
	history.EffectiveDate = values.CivilDateFromTime(effectiveDate)
	history.CreatedAt = createdAt.UTC()
	history.TombstonedAt = nullableTimeFromSQL(tombstonedAt)

	return history, nil
}

type rowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func activeCreditLimitHistoryExists(ctx context.Context, queryer rowQuerier, db *AppDB, accountID int64, effectiveDate values.CivilDate) (bool, error) {
	var id int64
	err := queryer.QueryRowContext(
		ctx,
		`SELECT credit_limit_history_id
FROM `+db.accountingName("credit_limit_history")+`
WHERE account_id = ? AND effective_date = ? AND tombstoned_at IS NULL
LIMIT 1`,
		accountID,
		civilDateArg(effectiveDate),
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check active credit limit history: %w", err)
	}

	return true, nil
}

var creditLimitHistorySortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt:     {"created_at"},
	services.SortKeyEffectiveDate: {"effective_date"},
}

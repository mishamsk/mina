package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/values"
)

// TransactionStore persists transactions and journal records.
type TransactionStore struct {
	db *AppDB
}

var _ transactions.Repository = (*TransactionStore)(nil)

// NewTransactionStore creates a transaction store using AppDB.
func NewTransactionStore(db *AppDB) *TransactionStore {
	return &TransactionStore{db: db}
}

// Create persists a transaction and all journal records atomically.
func (s *TransactionStore) Create(ctx context.Context, req transactions.PersistInput) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.db.accountingName("transaction")+` (initiated_date, recurring_occurrence_id, lifecycle_status)
VALUES (?, ?, CAST(? AS `+s.db.accountingName("transaction_lifecycle_status")+`))
RETURNING transaction_id, initiated_date, recurring_occurrence_id, CAST(lifecycle_status AS VARCHAR), created_at, tombstoned_at`,
			civilDateArg(req.InitiatedDate),
			req.RecurringOccurrenceID,
			enumValue(req.LifecycleStatus),
		)
		var err error
		transaction, err = scanTransaction(row)
		if err != nil {
			return fmt.Errorf("insert transaction: %w", err)
		}

		for _, recordReq := range req.Records {
			if err := insertJournalRecord(ctx, tx, s.db, transaction.ID, recordReq); err != nil {
				return err
			}
		}
		records, err := recordsByTransactionIDs(ctx, tx, s.db, []int64{transaction.ID})
		if err != nil {
			return err
		}
		transaction.Records = records[transaction.ID]

		return nil
	})
	if err != nil {
		return transactions.Transaction{}, err
	}

	return transaction, nil
}

// Replace atomically replaces a transaction's metadata and active journal records.
func (s *TransactionStore) Replace(ctx context.Context, id int64, req transactions.PersistInput) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		row := tx.QueryRowContext(
			ctx,
			`UPDATE `+s.db.accountingName("transaction")+`
SET initiated_date = ?, lifecycle_status = CAST(? AS `+s.db.accountingName("transaction_lifecycle_status")+`)
WHERE transaction_id = ? AND tombstoned_at IS NULL
RETURNING transaction_id, initiated_date, recurring_occurrence_id, CAST(lifecycle_status AS VARCHAR), created_at, tombstoned_at`,
			civilDateArg(req.InitiatedDate),
			enumValue(req.LifecycleStatus),
			id,
		)
		var err error
		transaction, err = scanTransaction(row)
		if errors.Is(err, sql.ErrNoRows) {
			return services.ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("update transaction: %w", err)
		}

		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("journal_record")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE transaction_id = ? AND tombstoned_at IS NULL`,
			id,
		); err != nil {
			return fmt.Errorf("tombstone replaced journal records: %w", err)
		}

		for _, recordReq := range req.Records {
			if err := insertJournalRecord(ctx, tx, s.db, transaction.ID, recordReq); err != nil {
				return err
			}
		}
		records, err := recordsByTransactionIDs(ctx, tx, s.db, []int64{transaction.ID})
		if err != nil {
			return err
		}
		transaction.Records = records[transaction.ID]

		return nil
	})
	if err != nil {
		return transactions.Transaction{}, err
	}

	return transaction, nil
}

// MonthTotals returns spend and income aggregates for active records in one civil month.
func (s *TransactionStore) MonthTotals(ctx context.Context, monthRange transactions.MonthTotalsRange) (transactions.MonthActivityTotals, error) {
	row := s.db.query().QueryRowContext(
		ctx,
		`WITH classified_records AS (
	SELECT
		CASE
			WHEN c.economic_intent = CAST('EXPENSE' AS `+s.db.accountingName("category_economic_intent")+`) THEN 'spend'
			WHEN c.economic_intent = CAST('INCOME' AS `+s.db.accountingName("category_economic_intent")+`) THEN 'income'
			ELSE NULL
		END AS total_kind,
		CASE
			WHEN c.economic_intent = CAST('INCOME' AS `+s.db.accountingName("category_economic_intent")+`) THEN -jr.amount_usd
			ELSE jr.amount_usd
		END AS signed_amount_usd,
		jr.amount_usd
	FROM `+s.db.accountingName("journal_record")+` jr
	JOIN `+s.db.accountingName("transaction")+` tx ON tx.transaction_id = jr.transaction_id
	JOIN `+s.db.accountingName("category")+` c ON c.category_id = jr.category_id
	JOIN `+s.db.accountingName("account")+` a ON a.account_id = jr.account_id
	WHERE jr.tombstoned_at IS NULL
	  AND tx.tombstoned_at IS NULL
	  AND tx.lifecycle_status = CAST('ACTIVE' AS `+s.db.accountingName("transaction_lifecycle_status")+`)
	  AND a.account_type = CAST('FLOW' AS `+s.db.accountingName("account_type")+`)
	  AND tx.initiated_date >= ?
	  AND tx.initiated_date < ?
)
SELECT
	COALESCE(CAST(SUM(CASE
		WHEN total_kind = 'spend' AND amount_usd IS NOT NULL THEN signed_amount_usd
		ELSE CAST(0 AS DECIMAL(18,8))
	END) AS DECIMAL(18,8)), CAST(0 AS DECIMAL(18,8))) AS spend_amount_usd,
	COALESCE(CAST(SUM(CASE WHEN total_kind = 'spend' AND amount_usd IS NULL THEN 1 ELSE 0 END) AS BIGINT), 0) AS spend_unconverted_count,
	COALESCE(CAST(SUM(CASE
		WHEN total_kind = 'income' AND amount_usd IS NOT NULL THEN signed_amount_usd
		ELSE CAST(0 AS DECIMAL(18,8))
	END) AS DECIMAL(18,8)), CAST(0 AS DECIMAL(18,8))) AS income_amount_usd,
	COALESCE(CAST(SUM(CASE WHEN total_kind = 'income' AND amount_usd IS NULL THEN 1 ELSE 0 END) AS BIGINT), 0) AS income_unconverted_count
FROM classified_records
WHERE total_kind IS NOT NULL`,
		civilDateArg(monthRange.Start),
		civilDateArg(monthRange.End),
	)

	var spendAmount duckdb.Decimal
	var incomeAmount duckdb.Decimal
	var totals transactions.MonthActivityTotals
	totals.Month = monthRange.Month
	if err := row.Scan(&spendAmount, &totals.Spend.UnconvertedCount, &incomeAmount, &totals.Income.UnconvertedCount); err != nil {
		return transactions.MonthActivityTotals{}, fmt.Errorf("query month totals: %w", err)
	}

	parsedSpend, err := decimalFromDuckDB(spendAmount)
	if err != nil {
		return transactions.MonthActivityTotals{}, fmt.Errorf("scan month spend total: %w", err)
	}
	parsedIncome, err := decimalFromDuckDB(incomeAmount)
	if err != nil {
		return transactions.MonthActivityTotals{}, fmt.Errorf("scan month income total: %w", err)
	}
	totals.Spend.AmountUSD = parsedSpend
	totals.Income.AmountUSD = parsedIncome

	return totals, nil
}

// BackfillMissingAmountUSD fills every currently resolvable active record in one update.
func (s *TransactionStore) BackfillMissingAmountUSD(ctx context.Context) error {
	if _, err := s.db.query().ExecContext(ctx, `WITH candidate AS (
	SELECT
		jr.record_id,
		jr.currency,
		jr.amount,
		CAST(jr.amount * 100000000::HUGEINT AS HUGEINT) * 100000000::HUGEINT AS division_numerator,
		CAST(dense.rate * 100000000::HUGEINT AS HUGEINT) AS division_denominator
	FROM `+s.db.accountingName("journal_record")+` AS jr
	JOIN `+s.db.accountingName("transaction")+` AS t
	  ON t.transaction_id = jr.transaction_id
	LEFT JOIN `+s.db.runtimeName(denseExchangeRateTableName)+` AS dense
	  ON dense.from_currency = 'USD'
	 AND dense.to_currency = jr.currency
	 AND dense.effective_date = COALESCE(CAST(jr.posted_date AS DATE), t.initiated_date)
	WHERE jr.tombstoned_at IS NULL
	  AND t.tombstoned_at IS NULL
	  AND jr.amount_usd IS NULL
),
division AS (
	SELECT
		record_id,
		currency,
		amount,
		division_numerator,
		division_denominator,
		division_numerator // division_denominator AS quotient,
		division_numerator % division_denominator AS remainder
	FROM candidate
),
resolved AS (
	SELECT
		record_id,
		currency,
		CASE
			WHEN currency = 'USD' THEN amount
			ELSE TRY_CAST((
				quotient + CASE
					WHEN abs(remainder) * 2 > division_denominator OR (
						abs(remainder) * 2 = division_denominator AND abs(quotient) % 2 = 1
					) THEN sign(division_numerator)
					ELSE 0
				END
			) * CAST(0.00000001 AS DECIMAL(9,8)) AS DECIMAL(18,8))
		END AS amount_usd
	FROM division
),
nonzero AS (
	SELECT record_id, amount_usd
	FROM resolved
	WHERE amount_usd IS NOT NULL
	  AND (currency = 'USD' OR amount_usd <> CAST(0 AS DECIMAL(18,8)))
)
UPDATE `+s.db.accountingName("journal_record")+` AS target
SET amount_usd = nonzero.amount_usd,
    updated_at = CURRENT_TIMESTAMP
FROM nonzero
WHERE target.record_id = nonzero.record_id
  AND target.tombstoned_at IS NULL
  AND target.amount_usd IS NULL`); err != nil {
		return fmt.Errorf("backfill missing amount_usd from dense rates: %w", err)
	}

	return nil
}

// Get returns a transaction with nested journal records.
func (s *TransactionStore) Get(ctx context.Context, id int64) (transactions.Transaction, error) {
	transaction, err := scanTransaction(s.db.query().QueryRowContext(
		ctx,
		`SELECT transaction_id, initiated_date, recurring_occurrence_id, CAST(lifecycle_status AS VARCHAR), created_at, tombstoned_at
FROM `+s.db.accountingName("transaction")+`
WHERE transaction_id = ? AND tombstoned_at IS NULL`,
		id,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return transactions.Transaction{}, services.ErrNotFound
	}
	if err != nil {
		return transactions.Transaction{}, fmt.Errorf("get transaction: %w", err)
	}

	records, err := s.recordsByTransactionIDs(ctx, []int64{id})
	if err != nil {
		return transactions.Transaction{}, err
	}
	transaction.Records = records[id]

	return transaction, nil
}

// List returns transactions with nested journal records in deterministic date order.
func (s *TransactionStore) List(ctx context.Context, opts transactions.ListOptions) (transactions.ListResult, error) {
	predicate := s.transactionListPredicate(opts)
	query := `SELECT tx.transaction_id, tx.initiated_date, tx.recurring_occurrence_id, CAST(tx.lifecycle_status AS VARCHAR), tx.created_at, tx.tombstoned_at
` + predicate.query
	totalCount, err := countMatchingRows(ctx, s.db.query(), "SELECT COUNT(*) "+predicate.query, predicate.args, "transactions", opts.IncludeTotalCount)
	if err != nil {
		return transactions.ListResult{}, err
	}
	effectiveOffset := opts.Offset
	if opts.AnchorDate != nil {
		effectiveOffset, err = s.transactionAnchorOffset(ctx, *opts.AnchorDate, opts.Limit, predicate)
		if err != nil {
			return transactions.ListResult{}, err
		}
	}
	sortColumns, ok := transactionSortColumns[opts.SortKey]
	if !ok {
		sortColumns = transactionSortColumns[services.SortKeyInitiatedDate]
	}
	direction := serviceListDirection(opts.ListOptions)
	query += " ORDER BY "
	for index, column := range sortColumns {
		if index > 0 {
			query += ", "
		}
		query += column + " " + direction
	}
	query += ", transaction_id " + direction
	query, args := appendLimitOffset(query, slices.Clone(predicate.args), opts.Limit, effectiveOffset)

	rows, err := s.db.query().QueryContext(
		ctx,
		query,
		args...,
	)
	if err != nil {
		return transactions.ListResult{}, fmt.Errorf("list transactions: %w", err)
	}

	transactionItems := []transactions.Transaction{}
	transactionIDs := []int64{}
	for rows.Next() {
		transaction, err := scanTransaction(rows)
		if err != nil {
			return transactions.ListResult{}, fmt.Errorf("scan transaction: %w", err)
		}
		transactionItems = append(transactionItems, transaction)
		transactionIDs = append(transactionIDs, transaction.ID)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return transactions.ListResult{}, fmt.Errorf("iterate transactions: %w; close transactions rows: %w", err, closeErr)
		}
		return transactions.ListResult{}, fmt.Errorf("iterate transactions: %w", err)
	}
	if err := rows.Close(); err != nil {
		return transactions.ListResult{}, fmt.Errorf("close transactions rows: %w", err)
	}

	records, err := s.recordsByTransactionIDs(ctx, transactionIDs)
	if err != nil {
		return transactions.ListResult{}, err
	}
	for index := range transactionItems {
		transactionItems[index].Records = records[transactionItems[index].ID]
	}

	return transactions.ListResult{
		Items:      transactionItems,
		Offset:     effectiveOffset,
		TotalCount: totalCount,
	}, nil
}

type transactionListPredicate struct {
	query string
	args  []any
}

func (s *TransactionStore) transactionListPredicate(opts transactions.ListOptions) transactionListPredicate {
	query := `FROM ` + s.db.accountingName("transaction") + ` tx
WHERE tx.tombstoned_at IS NULL`
	args := []any{}
	if !slices.Contains(opts.LifecycleStatuses, transactions.LifecycleStatusExpected) {
		query += " AND tx.lifecycle_status <> CAST('EXPECTED' AS " + s.db.accountingName("transaction_lifecycle_status") + ")"
	}
	if opts.InitiatedDateFrom != nil {
		query += " AND tx.initiated_date >= ?"
		args = append(args, civilDateArg(*opts.InitiatedDateFrom))
	}
	if opts.InitiatedDateTo != nil {
		query += " AND tx.initiated_date <= ?"
		args = append(args, civilDateArg(*opts.InitiatedDateTo))
	}
	if len(opts.AccountIDs) > 0 {
		query += " AND " + s.transactionListRecordExists("jr.account_id IN ("+placeholders(len(opts.AccountIDs))+")")
		args = append(args, int64Args(opts.AccountIDs)...)
	}
	if len(opts.CategoryIDs) > 0 {
		query += " AND " + s.transactionListRecordExists("jr.category_id IN ("+placeholders(len(opts.CategoryIDs))+")")
		args = append(args, int64Args(opts.CategoryIDs)...)
	}
	if opts.CategoryFQNPrefix != nil {
		query += ` AND EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("journal_record") + ` jr
	JOIN ` + s.db.accountingName("category") + ` c ON c.category_id = jr.category_id
	WHERE jr.transaction_id = tx.transaction_id
	  AND jr.tombstoned_at IS NULL
	  AND c.tombstoned_at IS NULL
	  AND (c.fqn = ? OR starts_with(c.fqn, ? || ':'))
)`
		args = append(args, *opts.CategoryFQNPrefix, *opts.CategoryFQNPrefix)
	}
	if len(opts.MemberIDs) > 0 {
		query += " AND " + s.transactionListRecordExists("jr.member_id IN ("+placeholders(len(opts.MemberIDs))+")")
		args = append(args, int64Args(opts.MemberIDs)...)
	}
	if len(opts.TagIDs) > 0 {
		tagConditions := make([]string, 0, len(opts.TagIDs))
		for range opts.TagIDs {
			tagConditions = append(tagConditions, "list_contains(jr.tag_ids, ?)")
		}
		query += " AND " + s.transactionListRecordExists("("+strings.Join(tagConditions, " OR ")+")")
		args = append(args, int64Args(opts.TagIDs)...)
	}
	if opts.TagFQNPrefix != nil {
		query += ` AND EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("journal_record") + ` jr
	CROSS JOIN unnest(jr.tag_ids) AS matched_tag(tag_id)
	JOIN ` + s.db.accountingName("tag") + ` tg ON tg.tag_id = matched_tag.tag_id
	WHERE jr.transaction_id = tx.transaction_id
	  AND jr.tombstoned_at IS NULL
	  AND tg.tombstoned_at IS NULL
	  AND (tg.fqn = ? OR starts_with(tg.fqn, ? || ':'))
)`
		args = append(args, *opts.TagFQNPrefix, *opts.TagFQNPrefix)
	}
	if len(opts.LifecycleStatuses) > 0 {
		query += " AND tx.lifecycle_status IN (" + placeholders(len(opts.LifecycleStatuses)) + ")"
		for _, status := range opts.LifecycleStatuses {
			args = append(args, enumValue(status))
		}
	}
	if len(opts.Settlements) > 0 {
		query += " AND " + s.transactionSettlementExpression() + " IN (" + placeholders(len(opts.Settlements)) + ")"
		for _, settlement := range opts.Settlements {
			args = append(args, string(settlement))
		}
	}
	if len(opts.TransactionClasses) > 0 {
		query += " AND " + s.transactionListClassExpression() + " IN (" + placeholders(len(opts.TransactionClasses)) + ")"
		for _, class := range opts.TransactionClasses {
			args = append(args, string(class))
		}
	}
	if len(opts.TransactionShapes) > 0 {
		shapeConditions := make([]string, 0, len(opts.TransactionShapes))
		for _, shape := range opts.TransactionShapes {
			shapeConditions = append(shapeConditions, s.transactionListShapeCondition(shape))
		}
		query += " AND (" + strings.Join(shapeConditions, " OR ") + ")"
	}
	if len(opts.RecordRoles) > 0 {
		roleCondition := s.recordRoleExpression() + " IN (" + placeholders(len(opts.RecordRoles)) + ")"
		query += " AND " + s.transactionListSemanticRecordExists(roleCondition)
		for _, role := range opts.RecordRoles {
			args = append(args, string(role))
		}
	}
	if opts.AmountMin != nil || opts.AmountMax != nil {
		conditions := []string{}
		if opts.AmountMin != nil {
			conditions = append(conditions, "jr.amount >= ?")
			args = append(args, opts.AmountMin.LibraryDecimal())
		}
		if opts.AmountMax != nil {
			conditions = append(conditions, "jr.amount <= ?")
			args = append(args, opts.AmountMax.LibraryDecimal())
		}
		query += " AND " + s.transactionListRecordExists(strings.Join(conditions, " AND "))
	}
	if opts.AmountUSDMin != nil || opts.AmountUSDMax != nil {
		conditions := []string{}
		if opts.AmountUSDMin != nil {
			conditions = append(conditions, "jr.amount_usd >= ?")
			args = append(args, opts.AmountUSDMin.LibraryDecimal())
		}
		if opts.AmountUSDMax != nil {
			conditions = append(conditions, "jr.amount_usd <= ?")
			args = append(args, opts.AmountUSDMax.LibraryDecimal())
		}
		query += " AND " + s.transactionListRecordExists(strings.Join(conditions, " AND "))
	}
	if opts.PendingDateFrom != nil || opts.PendingDateTo != nil {
		conditions := []string{}
		if opts.PendingDateFrom != nil {
			conditions = append(conditions, "jr.pending_date >= ?")
			args = append(args, timestampArg(*opts.PendingDateFrom))
		}
		if opts.PendingDateTo != nil {
			conditions = append(conditions, "jr.pending_date <= ?")
			args = append(args, timestampArg(*opts.PendingDateTo))
		}
		query += " AND " + s.transactionListRecordExists(strings.Join(conditions, " AND "))
	}
	if opts.PostedDateFrom != nil || opts.PostedDateTo != nil {
		conditions := []string{}
		if opts.PostedDateFrom != nil {
			conditions = append(conditions, "jr.posted_date >= ?")
			args = append(args, timestampArg(*opts.PostedDateFrom))
		}
		if opts.PostedDateTo != nil {
			conditions = append(conditions, "jr.posted_date <= ?")
			args = append(args, timestampArg(*opts.PostedDateTo))
		}
		query += " AND " + s.transactionListRecordExists(strings.Join(conditions, " AND "))
	}
	if opts.Search != nil {
		searchTerm := strings.ToLower(*opts.Search)
		searchPattern := "%" + escapeLikePattern(searchTerm) + "%"
		query += ` AND EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("journal_record") + ` jr
	LEFT JOIN ` + s.db.accountingName("category") + ` c ON c.category_id = jr.category_id
	JOIN ` + s.db.accountingName("account") + ` a ON a.account_id = jr.account_id
	LEFT JOIN ` + s.db.accountingName("member") + ` m ON m.member_id = jr.member_id
	WHERE jr.transaction_id = tx.transaction_id
	  AND jr.tombstoned_at IS NULL
	  AND (
		  lower(COALESCE(jr.memo, '')) LIKE ? ESCAPE '\'
		  OR lower(a.fqn) LIKE ? ESCAPE '\'
		  OR lower(c.fqn) LIKE ? ESCAPE '\'
		  OR lower(COALESCE(m.name, '')) LIKE ? ESCAPE '\'
		  OR lower(jr.currency) = ?
		  OR lower(COALESCE(a.external_id, '')) LIKE ? ESCAPE '\'
		  OR EXISTS (
			  SELECT 1
			  FROM unnest(jr.tag_ids) AS jr_tag(tag_id)
			  JOIN ` + s.db.accountingName("tag") + ` tg ON tg.tag_id = jr_tag.tag_id
			  WHERE lower(tg.fqn) LIKE ? ESCAPE '\'
		  )
	  )
)`
		args = append(args,
			searchPattern,
			searchPattern,
			searchPattern,
			searchPattern,
			searchTerm,
			searchPattern,
			searchPattern,
		)
	}

	return transactionListPredicate{query: query, args: args}
}

func (s *TransactionStore) transactionSettlementExpression() string {
	accountType := s.db.accountingName("account_type")
	return `(SELECT CASE
	WHEN COUNT(*) FILTER (WHERE a.account_type IN (CAST('OWNED' AS ` + accountType + `), CAST('PARTY' AS ` + accountType + `))) = 0 THEN 'not_applicable'
	WHEN COUNT(*) FILTER (WHERE a.account_type IN (CAST('OWNED' AS ` + accountType + `), CAST('PARTY' AS ` + accountType + `)) AND (jr.pending_date IS NOT NULL OR jr.posted_date IS NOT NULL)) = 0 THEN 'not_applicable'
	WHEN BOOL_AND(jr.posted_date IS NULL) FILTER (WHERE a.account_type IN (CAST('OWNED' AS ` + accountType + `), CAST('PARTY' AS ` + accountType + `))) THEN 'pending'
	WHEN BOOL_AND(jr.posted_date IS NOT NULL) FILTER (WHERE a.account_type IN (CAST('OWNED' AS ` + accountType + `), CAST('PARTY' AS ` + accountType + `))) THEN 'posted'
	ELSE 'mixed'
END
FROM ` + s.db.accountingName("journal_record") + ` jr
JOIN ` + s.db.accountingName("account") + ` a ON a.account_id = jr.account_id
WHERE jr.transaction_id = tx.transaction_id AND jr.tombstoned_at IS NULL)`
}

func (s *TransactionStore) transactionListRecordExists(condition string) string {
	return `EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("journal_record") + ` jr
	WHERE jr.transaction_id = tx.transaction_id
	  AND jr.tombstoned_at IS NULL
	  AND ` + condition + `
)`
}

func (s *TransactionStore) transactionListSemanticRecordExists(condition string) string {
	return `EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("journal_record") + ` jr
	JOIN ` + s.db.accountingName("account") + ` a ON a.account_id = jr.account_id
	LEFT JOIN ` + s.db.accountingName("category") + ` c ON c.category_id = jr.category_id
	WHERE jr.transaction_id = tx.transaction_id
	  AND jr.tombstoned_at IS NULL
	  AND ` + condition + `
)`
}

func (s *TransactionStore) recordRoleExpression() string {
	accountType := s.db.accountingName("account_type")
	intentType := s.db.accountingName("category_economic_intent")

	return `CASE
	WHEN a.account_type = CAST('FLOW' AS ` + accountType + `)
	  AND c.economic_intent = CAST('EXPENSE' AS ` + intentType + `)
	  AND jr.amount > 0 THEN 'expense'
	WHEN a.account_type = CAST('FLOW' AS ` + accountType + `)
	  AND c.economic_intent = CAST('EXPENSE' AS ` + intentType + `)
	  AND jr.amount < 0 THEN 'refund'
	WHEN a.account_type = CAST('FLOW' AS ` + accountType + `)
	  AND c.economic_intent = CAST('INCOME' AS ` + intentType + `)
	  AND jr.amount < 0 THEN 'income'
	WHEN a.account_type = CAST('FLOW' AS ` + accountType + `)
	  AND c.economic_intent = CAST('INCOME' AS ` + intentType + `)
	  AND jr.amount > 0 THEN 'clawback'
	WHEN a.account_type = CAST('SYSTEM' AS ` + accountType + `)
	  AND a.fqn = 'system:exchange' THEN 'exchange'
	WHEN a.account_type = CAST('SYSTEM' AS ` + accountType + `) THEN 'adjustment'
	WHEN a.account_type IN (
		CAST('OWNED' AS ` + accountType + `),
		CAST('PARTY' AS ` + accountType + `)
	) THEN 'balance'
	ELSE NULL
END`
}

func (s *TransactionStore) transactionListShapeCondition(shape transactions.TransactionShapeType) string {
	switch shape {
	case transactions.TransactionShapeSpend:
		return s.transactionListSemanticRecordExists(s.recordRoleExpression() + " = 'expense'")
	case transactions.TransactionShapeRefund:
		return s.transactionListSemanticRecordExists(s.recordRoleExpression() + " = 'refund'")
	case transactions.TransactionShapeIncome:
		return s.transactionListSemanticRecordExists(s.recordRoleExpression() + " = 'income'")
	case transactions.TransactionShapeClawback:
		return s.transactionListSemanticRecordExists(s.recordRoleExpression() + " = 'clawback'")
	case transactions.TransactionShapeAdjustment:
		return s.transactionListSemanticRecordExists(s.recordRoleExpression() + " = 'adjustment'")
	case transactions.TransactionShapeExchange:
		return s.transactionListSemanticRecordExists(s.recordRoleExpression() + " = 'exchange'")
	case transactions.TransactionShapeTransfer:
		return s.transactionListSemanticRecordExists(s.recordRoleExpression()+" = 'balance' AND jr.amount > 0") +
			" AND " + s.transactionListSemanticRecordExists(s.recordRoleExpression()+" = 'balance' AND jr.amount < 0") +
			" AND NOT " + s.transactionListSemanticRecordExists(s.recordRoleExpression()+" = 'exchange'")
	default:
		return "FALSE"
	}
}

func (s *TransactionStore) transactionListClassExpression() string {
	return `(SELECT CASE
	WHEN economic_count > 1 THEN 'mixed'
	WHEN has_expense THEN 'spend'
	WHEN has_refund THEN 'refund'
	WHEN has_income THEN 'income'
	WHEN has_clawback THEN 'clawback'
	WHEN has_adjustment THEN 'adjustment'
	WHEN has_exchange THEN 'currency_exchange'
	ELSE 'transfer'
END
FROM (
	SELECT
		CAST(has_expense AS INTEGER) + CAST(has_refund AS INTEGER) +
		CAST(has_income AS INTEGER) + CAST(has_clawback AS INTEGER) +
		CAST(has_adjustment AS INTEGER) + CAST(has_exchange AS INTEGER) AS economic_count,
		has_expense,
		has_refund,
		has_income,
		has_clawback,
		has_adjustment,
		has_exchange
	FROM (
		SELECT
			COALESCE(bool_or(role = 'expense'), false) AS has_expense,
			COALESCE(bool_or(role = 'refund'), false) AS has_refund,
			COALESCE(bool_or(role = 'income'), false) AS has_income,
			COALESCE(bool_or(role = 'clawback'), false) AS has_clawback,
			COALESCE(bool_or(role = 'adjustment'), false) AS has_adjustment,
			COALESCE(bool_or(role = 'exchange'), false) AS has_exchange
		FROM (
			SELECT ` + s.recordRoleExpression() + ` AS role
			FROM ` + s.db.accountingName("journal_record") + ` jr
			JOIN ` + s.db.accountingName("account") + ` a ON a.account_id = jr.account_id
			LEFT JOIN ` + s.db.accountingName("category") + ` c ON c.category_id = jr.category_id
			WHERE jr.transaction_id = tx.transaction_id
			  AND jr.tombstoned_at IS NULL
		) classified_records
	) economic_presence
) classification)`
}

func (s *TransactionStore) transactionAnchorOffset(ctx context.Context, anchor values.CivilDate, limit *int, predicate transactionListPredicate) (int, error) {
	var totalCount int64
	if err := s.db.query().QueryRowContext(
		ctx,
		`SELECT COUNT(*) `+predicate.query,
		predicate.args...,
	).Scan(&totalCount); err != nil {
		return 0, fmt.Errorf("count transactions for anchor offset: %w", err)
	}
	if totalCount == 0 {
		return 0, nil
	}

	var anchorIndex int64
	anchorArgs := append(slices.Clone(predicate.args), civilDateArg(anchor))
	err := s.db.query().QueryRowContext(
		ctx,
		`SELECT COUNT(*) `+predicate.query+` AND tx.initiated_date > ?`,
		anchorArgs...,
	).Scan(&anchorIndex)
	if err != nil {
		return 0, fmt.Errorf("compute transaction anchor offset: %w", err)
	}
	if anchorIndex >= totalCount {
		anchorIndex = totalCount - 1
	}

	if limit != nil && *limit > 0 {
		anchorIndex = (anchorIndex / int64(*limit)) * int64(*limit)
	}

	return int(anchorIndex), nil
}

// Tombstone marks a transaction and its active journal records deleted.
func (s *TransactionStore) Tombstone(ctx context.Context, id int64) error {
	return s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("transaction")+`
SET tombstoned_at = CURRENT_TIMESTAMP
WHERE transaction_id = ? AND tombstoned_at IS NULL`,
			id,
		)
		if err != nil {
			return fmt.Errorf("tombstone transaction: %w", err)
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read tombstone affected rows: %w", err)
		}
		if affected == 0 {
			return services.ErrNotFound
		}

		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("journal_record")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE transaction_id = ? AND tombstoned_at IS NULL`,
			id,
		); err != nil {
			return fmt.Errorf("tombstone transaction journal records: %w", err)
		}

		return nil
	})
}

// HasExpectedRecurringOccurrenceTransaction reports whether a transaction belongs to a still-expected recurring occurrence.
func (s *TransactionStore) HasExpectedRecurringOccurrenceTransaction(ctx context.Context, id int64) (bool, error) {
	var count int
	if err := s.db.query().QueryRowContext(
		ctx,
		`SELECT COUNT(*)
FROM `+s.db.accountingName("transaction")+` AS t
JOIN `+s.db.accountingName("recurring_occurrence")+` AS o
  ON o.recurring_occurrence_id = t.recurring_occurrence_id
WHERE t.transaction_id = ?
  AND t.tombstoned_at IS NULL
  AND o.status = CAST('EXPECTED' AS `+s.db.accountingName("recurring_occurrence_status")+`)`,
		id,
	).Scan(&count); err != nil {
		return false, fmt.Errorf("check expected recurring occurrence transaction: %w", err)
	}

	return count > 0, nil
}

// HasExpectedRecurringOccurrenceRecords reports whether any selected active record belongs to a still-expected recurring occurrence.
func (s *TransactionStore) HasExpectedRecurringOccurrenceRecords(ctx context.Context, recordIDs []int64) (bool, error) {
	if len(recordIDs) == 0 {
		return false, nil
	}

	var count int
	if err := s.db.query().QueryRowContext(
		ctx,
		`SELECT COUNT(DISTINCT jr.record_id)
FROM `+s.db.accountingName("journal_record")+` AS jr
JOIN `+s.db.accountingName("transaction")+` AS t
  ON t.transaction_id = jr.transaction_id
JOIN `+s.db.accountingName("recurring_occurrence")+` AS o
  ON o.recurring_occurrence_id = t.recurring_occurrence_id
WHERE jr.record_id IN (`+placeholders(len(recordIDs))+`)
  AND jr.tombstoned_at IS NULL
  AND t.tombstoned_at IS NULL
  AND o.status = CAST('EXPECTED' AS `+s.db.accountingName("recurring_occurrence_status")+`)`,
		int64Args(recordIDs)...,
	).Scan(&count); err != nil {
		return false, fmt.Errorf("check expected recurring occurrence records: %w", err)
	}

	return count > 0, nil
}

// Cancel changes transaction lifecycle to cancelled without changing records.
func (s *TransactionStore) Cancel(ctx context.Context, id int64) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		var err error
		transaction, err = scanTransaction(tx.QueryRowContext(
			ctx,
			`UPDATE `+s.db.accountingName("transaction")+`
SET lifecycle_status = CAST('CANCELLED' AS `+s.db.accountingName("transaction_lifecycle_status")+`)
WHERE transaction_id = ? AND tombstoned_at IS NULL
RETURNING transaction_id, initiated_date, recurring_occurrence_id, CAST(lifecycle_status AS VARCHAR), created_at, tombstoned_at`,
			id,
		))
		if errors.Is(err, sql.ErrNoRows) {
			return services.ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("get transaction for cancel: %w", err)
		}

		records, err := recordsByTransactionIDs(ctx, tx, s.db, []int64{id})
		if err != nil {
			return err
		}
		transaction.Records = records[id]

		return nil
	})
	if err != nil {
		return transactions.Transaction{}, err
	}

	return transaction, nil
}

// Restore changes transaction lifecycle to active without changing records.
func (s *TransactionStore) Restore(ctx context.Context, id int64) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		var err error
		transaction, err = scanTransaction(tx.QueryRowContext(
			ctx,
			`UPDATE `+s.db.accountingName("transaction")+`
SET lifecycle_status = CAST('ACTIVE' AS `+s.db.accountingName("transaction_lifecycle_status")+`)
WHERE transaction_id = ? AND tombstoned_at IS NULL
RETURNING transaction_id, initiated_date, recurring_occurrence_id, CAST(lifecycle_status AS VARCHAR), created_at, tombstoned_at`,
			id,
		))
		if errors.Is(err, sql.ErrNoRows) {
			return services.ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("restore transaction: %w", err)
		}
		records, err := recordsByTransactionIDs(ctx, tx, s.db, []int64{id})
		if err != nil {
			return err
		}
		transaction.Records = records[id]
		return nil
	})
	if err != nil {
		return transactions.Transaction{}, err
	}
	return transaction, nil
}

// SearchRecords returns active journal records matching filters.
func (s *TransactionStore) SearchRecords(ctx context.Context, opts transactions.RecordSearchOptions) (services.PaginatedList[transactions.JournalRecord], error) {
	withQuery := ""
	runningBalanceSelect := "CAST(NULL AS DECIMAL(18,8)) AS running_balance"
	runningBalanceJoin := ""
	runningBalanceArgs := []any{}
	if opts.IncludeRunningBalance {
		withQuery = `WITH running_balances AS (
	SELECT jr.record_id,
	       SUM(CAST(CASE
	           WHEN tx.lifecycle_status = CAST('ACTIVE' AS ` + s.db.accountingName("transaction_lifecycle_status") + `) THEN jr.amount
	           ELSE CAST(0 AS DECIMAL(18,8))
	       END AS DECIMAL(18,8))) OVER (
	           PARTITION BY jr.account_id, jr.currency
	           ORDER BY tx.initiated_date ASC, jr.transaction_id ASC, jr.record_id ASC
	           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
	       ) AS running_balance
	FROM ` + s.db.accountingName("journal_record") + ` jr
	JOIN ` + s.db.accountingName("transaction") + ` tx ON tx.transaction_id = jr.transaction_id
	WHERE jr.tombstoned_at IS NULL AND tx.tombstoned_at IS NULL AND jr.account_id = ?
)
`
		runningBalanceSelect = "rb.running_balance"
		runningBalanceJoin = "JOIN running_balances rb ON rb.record_id = jr.record_id"
		runningBalanceArgs = append(runningBalanceArgs, *opts.AccountID)
	}

	fromQuery := `FROM ` + s.db.accountingName("journal_record") + ` jr
JOIN ` + s.db.accountingName("transaction") + ` tx ON tx.transaction_id = jr.transaction_id
JOIN ` + s.db.accountingName("account") + ` a ON a.account_id = jr.account_id
LEFT JOIN ` + s.db.accountingName("category") + ` c ON c.category_id = jr.category_id`
	whereQuery := `WHERE jr.tombstoned_at IS NULL AND tx.tombstoned_at IS NULL`
	args := []any{}
	if opts.LifecycleStatus == nil {
		whereQuery += " AND tx.lifecycle_status <> CAST('EXPECTED' AS " + s.db.accountingName("transaction_lifecycle_status") + ")"
	}
	if opts.AccountID != nil {
		whereQuery += " AND jr.account_id = ?"
		args = append(args, *opts.AccountID)
	}
	if opts.AccountFQNPrefix != nil {
		whereQuery += " AND (a.fqn = ? OR a.fqn LIKE ? ESCAPE '\\')"
		args = append(args, *opts.AccountFQNPrefix, escapeLikePattern(*opts.AccountFQNPrefix)+":%")
	}
	if opts.CategoryID != nil {
		whereQuery += " AND jr.category_id = ?"
		args = append(args, *opts.CategoryID)
	}
	if opts.MemberID != nil {
		whereQuery += " AND jr.member_id = ?"
		args = append(args, *opts.MemberID)
	}
	if opts.TagID != nil {
		whereQuery += " AND list_contains(jr.tag_ids, ?)"
		args = append(args, *opts.TagID)
	}
	if opts.LifecycleStatus != nil {
		whereQuery += " AND tx.lifecycle_status = CAST(? AS " + s.db.accountingName("transaction_lifecycle_status") + ")"
		args = append(args, enumValue(*opts.LifecycleStatus))
	}
	if opts.Settlement != nil {
		whereQuery += " AND a.account_type IN (CAST('OWNED' AS " + s.db.accountingName("account_type") + "), CAST('PARTY' AS " + s.db.accountingName("account_type") + "))"
		if *opts.Settlement == transactions.SettlementStatusPosted {
			whereQuery += " AND jr.posted_date IS NOT NULL"
		} else {
			whereQuery += " AND jr.posted_date IS NULL AND jr.pending_date IS NOT NULL"
		}
	}
	if opts.ReconciliationStatus != nil {
		whereQuery += " AND jr.reconciliation_status = CAST(? AS " + s.db.accountingName("reconciliation_status") + ")"
		args = append(args, enumValue(*opts.ReconciliationStatus))
	}
	if opts.RecordRole != nil {
		whereQuery += " AND " + s.recordRoleExpression() + " = ?"
		args = append(args, string(*opts.RecordRole))
	}
	if opts.AmountMin != nil {
		whereQuery += " AND jr.amount >= ?"
		args = append(args, opts.AmountMin.LibraryDecimal())
	}
	if opts.AmountMax != nil {
		whereQuery += " AND jr.amount <= ?"
		args = append(args, opts.AmountMax.LibraryDecimal())
	}
	if opts.AmountUSDMin != nil {
		whereQuery += " AND jr.amount_usd >= ?"
		args = append(args, opts.AmountUSDMin.LibraryDecimal())
	}
	if opts.AmountUSDMax != nil {
		whereQuery += " AND jr.amount_usd <= ?"
		args = append(args, opts.AmountUSDMax.LibraryDecimal())
	}
	if opts.InitiatedDateFrom != nil {
		whereQuery += " AND tx.initiated_date >= ?"
		args = append(args, civilDateArg(*opts.InitiatedDateFrom))
	}
	if opts.InitiatedDateTo != nil {
		whereQuery += " AND tx.initiated_date <= ?"
		args = append(args, civilDateArg(*opts.InitiatedDateTo))
	}
	if opts.PendingDateFrom != nil {
		whereQuery += " AND jr.pending_date >= ?"
		args = append(args, timestampArg(*opts.PendingDateFrom))
	}
	if opts.PendingDateTo != nil {
		whereQuery += " AND jr.pending_date <= ?"
		args = append(args, timestampArg(*opts.PendingDateTo))
	}
	if opts.PostedDateFrom != nil {
		whereQuery += " AND jr.posted_date >= ?"
		args = append(args, timestampArg(*opts.PostedDateFrom))
	}
	if opts.PostedDateTo != nil {
		whereQuery += " AND jr.posted_date <= ?"
		args = append(args, timestampArg(*opts.PostedDateTo))
	}
	if opts.MemoContains != nil {
		whereQuery += " AND jr.memo LIKE ? ESCAPE '\\'"
		args = append(args, "%"+escapeLikePattern(*opts.MemoContains)+"%")
	}
	filterQuery := fromQuery + "\n" + whereQuery
	totalCount, err := countMatchingRows(ctx, s.db.query(), "SELECT COUNT(*) "+filterQuery, args, "journal records", opts.IncludeTotalCount)
	if err != nil {
		return services.PaginatedList[transactions.JournalRecord]{}, err
	}

	query := `SELECT jr.record_id, jr.transaction_id, jr.account_id, jr.member_id, jr.currency, jr.amount, jr.amount_usd, jr.category_id,
	` + runningBalanceSelect + `, jr.tag_ids, jr.memo, jr.pending_date, jr.posted_date, CAST(tx.lifecycle_status AS VARCHAR), jr.reconciliation_status, jr.source, jr.external_id, jr.external_system,
	tx.initiated_date, jr.created_at, jr.updated_at, jr.tombstoned_at, a.account_type, a.display_label, a.fqn, c.economic_intent
` + fromQuery + "\n" + runningBalanceJoin + "\n" + whereQuery
	sortColumns, ok := recordSortColumns[opts.SortKey]
	if !ok {
		sortColumns = recordSortColumns[services.SortKeyInitiatedDate]
	}
	direction := serviceListDirection(opts.ListOptions)
	query += " ORDER BY "
	for index, column := range sortColumns {
		if index > 0 {
			query += ", "
		}
		query += column + " " + direction
	}
	query, args = appendLimitOffset(query, args, opts.Limit, opts.Offset)

	queryArgs := append(append([]any{}, runningBalanceArgs...), args...)
	rows, err := s.db.query().QueryContext(ctx, withQuery+query, queryArgs...)
	if err != nil {
		return services.PaginatedList[transactions.JournalRecord]{}, fmt.Errorf("search journal records: %w", err)
	}

	records := []transactions.JournalRecord{}
	for rows.Next() {
		record, err := scanJournalRecord(rows)
		if err != nil {
			return services.PaginatedList[transactions.JournalRecord]{}, fmt.Errorf("scan searched journal record: %w", err)
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return services.PaginatedList[transactions.JournalRecord]{}, fmt.Errorf("iterate searched journal records: %w; close searched journal record rows: %w", err, closeErr)
		}
		return services.PaginatedList[transactions.JournalRecord]{}, fmt.Errorf("iterate searched journal records: %w", err)
	}
	if err := rows.Close(); err != nil {
		return services.PaginatedList[transactions.JournalRecord]{}, fmt.Errorf("close searched journal record rows: %w", err)
	}

	return services.PaginatedList[transactions.JournalRecord]{
		Items:      records,
		TotalCount: totalCount,
	}, nil
}

// TransactionsByRecordIDs returns active transactions containing selected active records.
func (s *TransactionStore) TransactionsByRecordIDs(ctx context.Context, recordIDs []int64) ([]transactions.Transaction, error) {
	return transactionsByRecordIDs(ctx, s.db.query(), s.db, recordIDs)
}

// TransactionsByAccountID returns active transactions containing active records
// for accountID, including all active records in each transaction.
func (s *TransactionStore) TransactionsByAccountID(ctx context.Context, accountID int64) ([]transactions.Transaction, error) {
	return transactionsByAccountID(ctx, s.db.query(), s.db, accountID)
}

// BulkCategorize assigns one active category to active journal records atomically.
func (s *TransactionStore) BulkCategorize(ctx context.Context, recordIDs []int64, categoryID int64) (int, error) {
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}

		args := append([]any{categoryID}, int64Args(recordIDs)...)
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("journal_record")+`
SET category_id = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE record_id IN (`+placeholders(len(recordIDs))+`)`,
			args...,
		); err != nil {
			return fmt.Errorf("bulk categorize journal records: %w", err)
		}

		return nil
	})
	if err != nil {
		return 0, err
	}

	return len(recordIDs), nil
}

// BulkReassignAccount assigns one active account to active journal records atomically.
func (s *TransactionStore) BulkReassignAccount(ctx context.Context, recordIDs []int64, accountID int64, pendingDates []*time.Time, postedDates []*time.Time) (int, error) {
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}

		valuesSQL, valuesArgs := explicitRecordDateValues(recordIDs, pendingDates, postedDates)
		args := append(valuesArgs, accountID)
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("journal_record")+` AS jr
SET account_id = ?,
	 pending_date = changes.pending_date,
	 posted_date = changes.posted_date,
    updated_at = CURRENT_TIMESTAMP
FROM (`+valuesSQL+`) AS changes(record_id, pending_date, posted_date)
WHERE jr.record_id = changes.record_id`,
			args...,
		); err != nil {
			return fmt.Errorf("bulk reassign journal record accounts: %w", err)
		}

		return nil
	})
	if err != nil {
		return 0, err
	}

	return len(recordIDs), nil
}

// BulkUpdateTags adds and removes active tags on active journal records atomically.
func (s *TransactionStore) BulkUpdateTags(ctx context.Context, recordIDs []int64, addTagIDs []int64, removeTagIDs []int64) (int, error) {
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}

		for _, recordID := range recordIDs {
			tagIDs, err := tagIDsByRecordID(ctx, tx, s.db, recordID)
			if err != nil {
				return err
			}
			tagIDs = updatedTagIDs(tagIDs, addTagIDs, removeTagIDs)
			tagListExpr, tagListArgs := tagListExpression(tagIDs)
			args := append(tagListArgs, recordID)
			if _, err := tx.ExecContext(
				ctx,
				`UPDATE `+s.db.accountingName("journal_record")+`
SET tag_ids = `+tagListExpr+`,
    updated_at = CURRENT_TIMESTAMP
WHERE record_id = ?`,
				args...,
			); err != nil {
				return fmt.Errorf("bulk update journal record tags: %w", err)
			}
		}

		return nil
	})
	if err != nil {
		return 0, err
	}

	return len(recordIDs), nil
}

// BulkSetMember sets or clears one member on active journal records atomically.
func (s *TransactionStore) BulkSetMember(ctx context.Context, recordIDs []int64, memberID *int64) (int, error) {
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}
		args := append([]any{memberID}, int64Args(recordIDs)...)
		if _, err := tx.ExecContext(ctx, `UPDATE `+s.db.accountingName("journal_record")+`
SET member_id = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE record_id IN (`+placeholders(len(recordIDs))+`)`, args...); err != nil {
			return fmt.Errorf("bulk update journal record members: %w", err)
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return len(recordIDs), nil
}

// BulkSetSettlement applies explicit per-record settlement timestamps atomically.
func (s *TransactionStore) BulkSetSettlement(ctx context.Context, recordIDs []int64, pendingDates []*time.Time, postedDates []*time.Time) (int, error) {
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}
		valuesSQL, args := explicitRecordDateValues(recordIDs, pendingDates, postedDates)
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("journal_record")+` AS jr
SET pending_date = changes.pending_date,
    posted_date = changes.posted_date,
    updated_at = CURRENT_TIMESTAMP
FROM (`+valuesSQL+`) AS changes(record_id, pending_date, posted_date)
WHERE jr.record_id = changes.record_id`,
			args...,
		); err != nil {
			return fmt.Errorf("bulk update journal record settlement: %w", err)
		}

		return nil
	})
	if err != nil {
		return 0, err
	}

	return len(recordIDs), nil
}

// BulkSetReconciliation applies one reconciliation status atomically.
func (s *TransactionStore) BulkSetReconciliation(ctx context.Context, recordIDs []int64, status transactions.ReconciliationStatus) (int, error) {
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}
		args := append([]any{enumValue(status)}, int64Args(recordIDs)...)
		if _, err := tx.ExecContext(ctx, `UPDATE `+s.db.accountingName("journal_record")+`
SET reconciliation_status = CAST(? AS `+s.db.accountingName("reconciliation_status")+`),
    updated_at = CURRENT_TIMESTAMP
WHERE record_id IN (`+placeholders(len(recordIDs))+`)`, args...); err != nil {
			return fmt.Errorf("bulk update journal record reconciliation: %w", err)
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return len(recordIDs), nil
}

func explicitRecordDateValues(recordIDs []int64, pendingDates []*time.Time, postedDates []*time.Time) (string, []any) {
	rows := make([]string, 0, len(recordIDs))
	args := make([]any, 0, len(recordIDs)*3)
	for index, recordID := range recordIDs {
		rows = append(rows, "(CAST(? AS BIGINT), CAST(? AS TIMESTAMP), CAST(? AS TIMESTAMP))")
		args = append(args, recordID, nullableTimestampArg(pendingDates[index]), nullableTimestampArg(postedDates[index]))
	}
	return "VALUES " + strings.Join(rows, ", "), args
}

type transactionScanner interface {
	Scan(dest ...any) error
}

func scanTransaction(scanner transactionScanner) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	var initiatedDate time.Time
	var recurringOccurrenceID sql.NullInt64
	var lifecycleStatus string
	var createdAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&transaction.ID,
		&initiatedDate,
		&recurringOccurrenceID,
		&lifecycleStatus,
		&createdAt,
		&tombstonedAt,
	); err != nil {
		return transactions.Transaction{}, err
	}
	transaction.InitiatedDate = values.CivilDateFromTime(initiatedDate)
	transaction.LifecycleStatus = transactions.LifecycleStatus(strings.ToLower(lifecycleStatus))
	if recurringOccurrenceID.Valid {
		transaction.RecurringOccurrenceID = &recurringOccurrenceID.Int64
	}
	transaction.CreatedAt = createdAt.UTC()
	transaction.TombstonedAt = nullableTimeFromSQL(tombstonedAt)
	transaction.Records = []transactions.JournalRecord{}

	return transaction, nil
}

func insertJournalRecord(ctx context.Context, tx *sql.Tx, db *AppDB, transactionID int64, req transactions.PersistJournalRecordInput) error {
	tagListExpr, tagListArgs := tagListExpression(req.TagIDs)
	args := []any{
		transactionID,
		req.AccountID,
		req.MemberID,
		req.Currency,
		req.Amount.LibraryDecimal(),
		nullableDecimalArg(req.AmountUSD),
		req.CategoryID,
	}
	args = append(args, tagListArgs...)
	args = append(args,
		req.Memo,
		nullableTimestampArg(req.PendingDate),
		nullableTimestampArg(req.PostedDate),
		enumValue(req.ReconciliationStatus),
		enumValue(req.Source),
		req.ExternalID,
		req.ExternalSystem,
	)

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO `+db.accountingName("journal_record")+` (
	transaction_id, account_id, member_id, currency, amount, amount_usd, category_id, tag_ids, memo,
	pending_date, posted_date, reconciliation_status, source, external_id, external_system
)
VALUES (?, ?, ?, ?, ?, ?, ?, `+tagListExpr+`, ?, ?, ?, CAST(? AS `+db.accountingName("reconciliation_status")+`), CAST(? AS `+db.accountingName("source")+`), ?, ?)`,
		args...,
	); err != nil {
		if isForeignKeyConstraintError(err) {
			return services.ErrInvalidReference
		}
		return fmt.Errorf("insert journal record: %w", err)
	}

	return nil
}

type journalRecordScanner interface {
	Scan(dest ...any) error
}

func scanJournalRecord(scanner journalRecordScanner) (transactions.JournalRecord, error) {
	var record transactions.JournalRecord
	var memberID sql.NullInt64
	var amount duckdb.Decimal
	var amountUSD sql.Null[duckdb.Decimal]
	var runningBalance sql.Null[duckdb.Decimal]
	var tagIDs []any
	var memo sql.NullString
	var pendingDate sql.NullTime
	var postedDate sql.NullTime
	var lifecycleStatus string
	var reconciliationStatus string
	var source string
	var externalID sql.NullString
	var externalSystem sql.NullString
	var initiatedDate time.Time
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	var accountType sql.NullString
	var accountDisplayLabelOverride sql.NullString
	var accountFQN sql.NullString
	var economicIntent sql.NullString
	if err := scanner.Scan(
		&record.ID,
		&record.TransactionID,
		&record.AccountID,
		&memberID,
		&record.Currency,
		&amount,
		&amountUSD,
		&record.CategoryID,
		&runningBalance,
		&tagIDs,
		&memo,
		&pendingDate,
		&postedDate,
		&lifecycleStatus,
		&reconciliationStatus,
		&source,
		&externalID,
		&externalSystem,
		&initiatedDate,
		&createdAt,
		&updatedAt,
		&tombstonedAt,
		&accountType,
		&accountDisplayLabelOverride,
		&accountFQN,
		&economicIntent,
	); err != nil {
		return transactions.JournalRecord{}, err
	}
	parsedAmount, err := decimalFromDuckDB(amount)
	if err != nil {
		return transactions.JournalRecord{}, fmt.Errorf("scan journal record amount: %w", err)
	}
	record.Amount = parsedAmount
	if amountUSD.Valid {
		parsedAmountUSD, err := decimalFromDuckDB(amountUSD.V)
		if err != nil {
			return transactions.JournalRecord{}, fmt.Errorf("scan journal record amount_usd: %w", err)
		}
		record.AmountUSD = &parsedAmountUSD
	}
	if runningBalance.Valid {
		parsedRunningBalance, err := decimalFromDuckDB(runningBalance.V)
		if err != nil {
			return transactions.JournalRecord{}, fmt.Errorf("scan journal record running_balance: %w", err)
		}
		record.RunningBalance = &parsedRunningBalance
	}
	if memberID.Valid {
		record.MemberID = &memberID.Int64
	}
	if memo.Valid {
		record.Memo = &memo.String
	}
	record.PendingDate = nullableTimeFromSQL(pendingDate)
	record.PostedDate = nullableTimeFromSQL(postedDate)
	parsedTagIDs, err := int64ListFromDuckDB(tagIDs)
	if err != nil {
		return transactions.JournalRecord{}, fmt.Errorf("scan journal record tag_ids: %w", err)
	}
	slices.Sort(parsedTagIDs)
	record.TagIDs = parsedTagIDs
	if externalID.Valid {
		record.ExternalID = &externalID.String
	}
	if externalSystem.Valid {
		record.ExternalSystem = &externalSystem.String
	}
	record.InitiatedDate = values.CivilDateFromTime(initiatedDate)
	record.CreatedAt = createdAt.UTC()
	record.UpdatedAt = updatedAt.UTC()
	record.TombstonedAt = nullableTimeFromSQL(tombstonedAt)
	record.LifecycleStatus = transactions.LifecycleStatus(strings.ToLower(lifecycleStatus))
	record.ReconciliationStatus = transactions.ReconciliationStatus(strings.ToLower(reconciliationStatus))
	record.Source = transactions.Source(strings.ToLower(source))
	if accountType.Valid {
		record.AccountType = accounts.AccountType(strings.ToLower(accountType.String))
	}
	if accountDisplayLabelOverride.Valid {
		record.AccountDisplayLabelOverride = &accountDisplayLabelOverride.String
	}
	if accountFQN.Valid {
		record.AccountFQN = accountFQN.String
	}
	if economicIntent.Valid {
		record.EconomicIntent = categories.CategoryEconomicIntent(strings.ToLower(economicIntent.String))
	}

	return record, nil
}

func recordsByTransactionIDs(ctx context.Context, queryer rowsQuerier, db *AppDB, transactionIDs []int64) (map[int64][]transactions.JournalRecord, error) {
	recordsByTransactionID := map[int64][]transactions.JournalRecord{}
	for _, id := range transactionIDs {
		recordsByTransactionID[id] = []transactions.JournalRecord{}
	}
	if len(transactionIDs) == 0 {
		return recordsByTransactionID, nil
	}

	rows, err := queryer.QueryContext(
		ctx,
		`SELECT jr.record_id, jr.transaction_id, jr.account_id, jr.member_id, jr.currency, jr.amount, jr.amount_usd, jr.category_id,
	CAST(NULL AS DECIMAL(18,8)) AS running_balance,
	jr.tag_ids, jr.memo, jr.pending_date, jr.posted_date, CAST(tx.lifecycle_status AS VARCHAR), jr.reconciliation_status, jr.source, jr.external_id, jr.external_system,
	tx.initiated_date, jr.created_at, jr.updated_at, jr.tombstoned_at, a.account_type, a.display_label, a.fqn, c.economic_intent
FROM `+db.accountingName("journal_record")+` jr
JOIN `+db.accountingName("transaction")+` tx ON tx.transaction_id = jr.transaction_id
JOIN `+db.accountingName("account")+` a ON a.account_id = jr.account_id
LEFT JOIN `+db.accountingName("category")+` c ON c.category_id = jr.category_id
WHERE jr.transaction_id IN (`+placeholders(len(transactionIDs))+`) AND jr.tombstoned_at IS NULL
ORDER BY jr.transaction_id ASC, jr.record_id ASC`,
		int64Args(transactionIDs)...,
	)
	if err != nil {
		return nil, fmt.Errorf("list journal records: %w", err)
	}

	for rows.Next() {
		record, err := scanJournalRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("scan journal record: %w", err)
		}
		recordsByTransactionID[record.TransactionID] = append(recordsByTransactionID[record.TransactionID], record)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate journal records: %w; close journal record rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate journal records: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close journal record rows: %w", err)
	}

	return recordsByTransactionID, nil
}

func (s *TransactionStore) recordsByTransactionIDs(ctx context.Context, transactionIDs []int64) (map[int64][]transactions.JournalRecord, error) {
	return recordsByTransactionIDs(ctx, s.db.query(), s.db, transactionIDs)
}

type rowsQuerier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

func tagIDsByRecordID(ctx context.Context, queryer rowsQuerier, db *AppDB, recordID int64) ([]int64, error) {
	rows, err := queryer.QueryContext(
		ctx,
		`SELECT unnest(tag_ids) AS tag_id
FROM `+db.accountingName("journal_record")+`
WHERE record_id = ?
ORDER BY tag_id ASC`,
		recordID,
	)
	if err != nil {
		return nil, fmt.Errorf("list journal record tags: %w", err)
	}

	tagIDs := []int64{}
	for rows.Next() {
		var tagID int64
		if err := rows.Scan(&tagID); err != nil {
			return nil, fmt.Errorf("scan journal record tag: %w", err)
		}
		tagIDs = append(tagIDs, tagID)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate journal record tags: %w; close journal record tag rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate journal record tags: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close journal record tag rows: %w", err)
	}

	return tagIDs, nil
}

func transactionsByRecordIDs(ctx context.Context, queryer rowsQuerier, db *AppDB, recordIDs []int64) ([]transactions.Transaction, error) {
	transactionIDs, err := transactionIDsByRecordIDs(ctx, queryer, db, recordIDs)
	if err != nil {
		return nil, err
	}
	if len(transactionIDs) == 0 {
		return nil, services.ErrInvalidReference
	}

	records, err := recordsByTransactionIDs(ctx, queryer, db, transactionIDs)
	if err != nil {
		return nil, err
	}
	affected := make([]transactions.Transaction, 0, len(transactionIDs))
	for _, transactionID := range transactionIDs {
		transactionRecords := records[transactionID]
		transaction := transactions.Transaction{ID: transactionID, Records: transactionRecords}
		if len(transactionRecords) > 0 {
			transaction.InitiatedDate = transactionRecords[0].InitiatedDate
			transaction.LifecycleStatus = transactionRecords[0].LifecycleStatus
		}
		affected = append(affected, transaction)
	}

	return affected, nil
}

func transactionsByAccountID(ctx context.Context, queryer rowsQuerier, db *AppDB, accountID int64) ([]transactions.Transaction, error) {
	transactionIDs, err := transactionIDsByAccountID(ctx, queryer, db, accountID)
	if err != nil {
		return nil, err
	}
	if len(transactionIDs) == 0 {
		return []transactions.Transaction{}, nil
	}

	records, err := recordsByTransactionIDs(ctx, queryer, db, transactionIDs)
	if err != nil {
		return nil, err
	}
	affected := make([]transactions.Transaction, 0, len(transactionIDs))
	for _, transactionID := range transactionIDs {
		transactionRecords := records[transactionID]
		transaction := transactions.Transaction{ID: transactionID, Records: transactionRecords}
		if len(transactionRecords) > 0 {
			transaction.InitiatedDate = transactionRecords[0].InitiatedDate
			transaction.LifecycleStatus = transactionRecords[0].LifecycleStatus
		}
		affected = append(affected, transaction)
	}

	return affected, nil
}

func transactionIDsByRecordIDs(ctx context.Context, queryer rowsQuerier, db *AppDB, recordIDs []int64) ([]int64, error) {
	rows, err := queryer.QueryContext(
		ctx,
		`SELECT DISTINCT jr.transaction_id
FROM `+db.accountingName("journal_record")+` jr
JOIN `+db.accountingName("transaction")+` tr ON tr.transaction_id = jr.transaction_id
WHERE jr.record_id IN (`+placeholders(len(recordIDs))+`)
  AND jr.tombstoned_at IS NULL
  AND tr.tombstoned_at IS NULL
ORDER BY jr.transaction_id ASC`,
		int64Args(recordIDs)...,
	)
	if err != nil {
		return nil, fmt.Errorf("list affected transaction ids: %w", err)
	}

	transactionIDs := []int64{}
	for rows.Next() {
		var transactionID int64
		if err := rows.Scan(&transactionID); err != nil {
			return nil, fmt.Errorf("scan affected transaction id: %w", err)
		}
		transactionIDs = append(transactionIDs, transactionID)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate affected transaction ids: %w; close transaction id rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate affected transaction ids: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close affected transaction id rows: %w", err)
	}

	return transactionIDs, nil
}

func transactionIDsByAccountID(ctx context.Context, queryer rowsQuerier, db *AppDB, accountID int64) ([]int64, error) {
	rows, err := queryer.QueryContext(
		ctx,
		`SELECT DISTINCT jr.transaction_id
FROM `+db.accountingName("journal_record")+` jr
JOIN `+db.accountingName("transaction")+` tr ON tr.transaction_id = jr.transaction_id
WHERE jr.account_id = ?
  AND jr.tombstoned_at IS NULL
  AND tr.tombstoned_at IS NULL
ORDER BY jr.transaction_id ASC`,
		accountID,
	)
	if err != nil {
		return nil, fmt.Errorf("list account transaction ids: %w", err)
	}

	transactionIDs := []int64{}
	for rows.Next() {
		var transactionID int64
		if err := rows.Scan(&transactionID); err != nil {
			return nil, fmt.Errorf("scan account transaction id: %w", err)
		}
		transactionIDs = append(transactionIDs, transactionID)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate account transaction ids: %w; close account transaction rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate account transaction ids: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close account transaction rows: %w", err)
	}

	return transactionIDs, nil
}

func validateActiveJournalRecords(ctx context.Context, queryer rowQuerier, db *AppDB, recordIDs []int64) error {
	if len(recordIDs) == 0 {
		return services.ErrInvalidReference
	}

	var count int
	err := queryer.QueryRowContext(
		ctx,
		`SELECT COUNT(DISTINCT jr.record_id)
FROM `+db.accountingName("journal_record")+` jr
JOIN `+db.accountingName("transaction")+` tr ON tr.transaction_id = jr.transaction_id
WHERE jr.record_id IN (`+placeholders(len(recordIDs))+`)
  AND jr.tombstoned_at IS NULL
  AND tr.tombstoned_at IS NULL`,
		int64Args(recordIDs)...,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("check active journal records: %w", err)
	}
	if count != len(recordIDs) {
		return services.ErrInvalidReference
	}

	return nil
}

func tagListExpression(tagIDs []int64) (string, []any) {
	if len(tagIDs) == 0 {
		return "CAST([] AS INTEGER[])", nil
	}

	return "CAST([" + placeholders(len(tagIDs)) + "] AS INTEGER[])", int64Args(tagIDs)
}

func updatedTagIDs(current []int64, add []int64, remove []int64) []int64 {
	selected := map[int64]struct{}{}
	for _, tagID := range current {
		selected[tagID] = struct{}{}
	}
	for _, tagID := range add {
		selected[tagID] = struct{}{}
	}
	for _, tagID := range remove {
		delete(selected, tagID)
	}

	next := make([]int64, 0, len(selected))
	for tagID := range selected {
		next = append(next, tagID)
	}
	slices.Sort(next)

	return next
}

func enumValue(value any) string {
	return strings.ToUpper(fmt.Sprint(value))
}

func int64ListFromDuckDB(values []any) ([]int64, error) {
	converted := make([]int64, 0, len(values))
	for _, value := range values {
		switch typed := value.(type) {
		case int32:
			converted = append(converted, int64(typed))
		case int64:
			converted = append(converted, typed)
		default:
			return nil, fmt.Errorf("unsupported integer list value %T", value)
		}
	}

	return converted, nil
}

func escapeLikePattern(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `%`, `\%`)
	value = strings.ReplaceAll(value, `_`, `\_`)

	return value
}

func placeholders(count int) string {
	if count <= 0 {
		return ""
	}

	return strings.TrimSuffix(strings.Repeat("?,", count), ",")
}

func int64Args(values []int64) []any {
	args := make([]any, 0, len(values))
	for _, value := range values {
		args = append(args, value)
	}

	return args
}

var transactionSortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt:     {"created_at"},
	services.SortKeyInitiatedDate: {"initiated_date"},
}

var recordSortColumns = map[services.SortKey][]string{
	services.SortKeyInitiatedDate: {"tx.initiated_date", "jr.transaction_id", "jr.record_id"},
}

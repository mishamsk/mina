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
RETURNING transaction_id, initiated_date, recurring_occurrence_id, CAST(lifecycle_status AS VARCHAR), created_at, updated_at, tombstoned_at`,
			civilDateArg(req.InitiatedDate),
			req.RecurringOccurrenceID,
			enumValue(req.LifecycleStatus),
		)
		var err error
		transaction, err = scanTransaction(row)
		if err != nil {
			return fmt.Errorf("insert transaction: %w", err)
		}

		if err := insertJournalRecords(ctx, tx, s.db, transaction.ID, req.Records); err != nil {
			return err
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

// Replace atomically compares the transaction precondition and reconciles journal-record identities.
func (s *TransactionStore) Replace(ctx context.Context, id int64, req transactions.PersistInput) (transactions.Transaction, error) {
	if req.ExpectedUpdatedAt == nil {
		return transactions.Transaction{}, errors.New("replace transaction: expected updated timestamp is required")
	}
	var transaction transactions.Transaction
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		row := tx.QueryRowContext(
			ctx,
			`SELECT transaction_id, initiated_date, recurring_occurrence_id, CAST(lifecycle_status AS VARCHAR), created_at, updated_at, tombstoned_at
FROM `+s.db.accountingName("transaction")+`
WHERE transaction_id = ? AND tombstoned_at IS NULL`,
			id,
		)
		var err error
		transaction, err = scanTransaction(row)
		if errors.Is(err, sql.ErrNoRows) {
			return services.ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("read transaction update precondition: %w", err)
		}
		if !transaction.UpdatedAt.Equal(req.ExpectedUpdatedAt.UTC()) {
			return services.ErrPreconditionFailed
		}

		currentByTransaction, err := recordsByTransactionIDs(ctx, tx, s.db, []int64{id})
		if err != nil {
			return err
		}
		currentRecords := currentByTransaction[id]
		currentByID := make(map[int64]transactions.JournalRecord, len(currentRecords))
		for _, record := range currentRecords {
			currentByID[record.ID] = record
		}
		retained := make(map[int64]struct{}, len(req.Records))
		createdRecords := make([]transactions.PersistJournalRecordInput, 0, len(req.Records))
		updatedRecords := make([]journalRecordUpdate, 0, len(req.Records))
		material := transaction.InitiatedDate != req.InitiatedDate || transaction.LifecycleStatus != req.LifecycleStatus

		for _, recordReq := range req.Records {
			if recordReq.RecordID == nil {
				createdRecords = append(createdRecords, recordReq)
				material = true
				continue
			}
			current, ok := currentByID[*recordReq.RecordID]
			if !ok {
				return services.ErrInvalidReference
			}
			retained[current.ID] = struct{}{}
			if journalRecordMatchesPersist(current, recordReq) {
				continue
			}
			updatedRecords = append(updatedRecords, journalRecordUpdate{recordID: current.ID, input: recordReq})
			material = true
		}
		if err := insertJournalRecords(ctx, tx, s.db, transaction.ID, createdRecords); err != nil {
			return err
		}
		if err := updateJournalRecords(ctx, tx, s.db, updatedRecords); err != nil {
			return err
		}

		omitted := make([]int64, 0, len(currentRecords))
		for _, record := range currentRecords {
			if _, ok := retained[record.ID]; !ok {
				omitted = append(omitted, record.ID)
			}
		}
		if err := guardJournalRecordRemovals(ctx, tx, s.db, omitted); err != nil {
			return err
		}
		if len(omitted) > 0 {
			args := int64Args(omitted)
			if _, err := tx.ExecContext(ctx, `UPDATE `+s.db.accountingName("journal_record")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE record_id IN (`+placeholders(len(omitted))+`) AND tombstoned_at IS NULL`, args...); err != nil {
				return fmt.Errorf("tombstone omitted journal records: %w", err)
			}
			material = true
		}

		if material {
			transaction, err = scanTransaction(tx.QueryRowContext(ctx, `UPDATE `+s.db.accountingName("transaction")+`
SET initiated_date = ?,
    lifecycle_status = CAST(? AS `+s.db.accountingName("transaction_lifecycle_status")+`),
    updated_at = CURRENT_TIMESTAMP
WHERE transaction_id = ? AND tombstoned_at IS NULL AND updated_at = ?
RETURNING transaction_id, initiated_date, recurring_occurrence_id, CAST(lifecycle_status AS VARCHAR), created_at, updated_at, tombstoned_at`, civilDateArg(req.InitiatedDate), enumValue(req.LifecycleStatus), id, timestampArg(*req.ExpectedUpdatedAt)))
			if errors.Is(err, sql.ErrNoRows) {
				return services.ErrPreconditionFailed
			}
			if err != nil {
				return fmt.Errorf("update reconciled transaction: %w", err)
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
		if isDuckDBTransactionConflictError(err) {
			return transactions.Transaction{}, services.ErrPreconditionFailed
		}
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
	return s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx, `WITH candidate AS (
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
  AND target.amount_usd IS NULL
RETURNING transaction_id`)
		if err != nil {
			return fmt.Errorf("backfill missing amount_usd from dense rates: %w", err)
		}
		transactionIDs := []int64{}
		seenTransactionIDs := map[int64]struct{}{}
		for rows.Next() {
			var transactionID int64
			if err := rows.Scan(&transactionID); err != nil {
				return fmt.Errorf("scan amount_usd backfill transaction: %w", err)
			}
			if _, ok := seenTransactionIDs[transactionID]; ok {
				continue
			}
			seenTransactionIDs[transactionID] = struct{}{}
			transactionIDs = append(transactionIDs, transactionID)
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return fmt.Errorf("iterate amount_usd backfill transactions: %w", err)
		}
		if err := rows.Close(); err != nil {
			return fmt.Errorf("close amount_usd backfill transactions: %w", err)
		}

		return touchTransactionsByIDs(ctx, tx, s.db, transactionIDs)
	})
}

// Get returns a transaction with nested journal records.
func (s *TransactionStore) Get(ctx context.Context, id int64) (transactions.Transaction, error) {
	transaction, err := scanTransaction(s.db.query().QueryRowContext(
		ctx,
		`SELECT transaction_id, initiated_date, recurring_occurrence_id, CAST(lifecycle_status AS VARCHAR), created_at, updated_at, tombstoned_at
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
	query := `SELECT tx.transaction_id, tx.initiated_date, tx.recurring_occurrence_id, CAST(tx.lifecycle_status AS VARCHAR), tx.created_at, tx.updated_at, tx.tombstoned_at
` + predicate.query
	position, err := s.transactionListPosition(ctx, opts, predicate)
	if err != nil {
		return transactions.ListResult{}, err
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
	query, args := appendLimitOffset(query, slices.Clone(predicate.args), opts.Limit, position.Offset)

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
		Offset:     position.Offset,
		TotalCount: position.TotalCount,
	}, nil
}

// ListPosition returns an anchored transaction page's effective offset and total without hydrating rows.
func (s *TransactionStore) ListPosition(ctx context.Context, opts transactions.ListOptions) (transactions.PagePosition, error) {
	return s.transactionListPosition(ctx, opts, s.transactionListPredicate(opts))
}

func (s *TransactionStore) transactionListPosition(ctx context.Context, opts transactions.ListOptions, predicate transactionListPredicate) (transactions.PagePosition, error) {
	totalCount, err := countMatchingRows(ctx, s.db.query(), "SELECT COUNT(*) "+predicate.query, predicate.args, "transactions", opts.IncludeTotalCount)
	if err != nil {
		return transactions.PagePosition{}, err
	}
	effectiveOffset := opts.Offset
	if opts.AnchorDate != nil {
		effectiveOffset, err = s.transactionAnchorOffset(ctx, *opts.AnchorDate, opts.Limit, predicate)
		if err != nil {
			return transactions.PagePosition{}, err
		}
	}
	return transactions.PagePosition{Offset: effectiveOffset, TotalCount: totalCount}, nil
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
	if len(opts.Currencies) > 0 {
		query += " AND " + s.transactionListRecordExists("jr.currency IN ("+placeholders(len(opts.Currencies))+")")
		for _, currency := range opts.Currencies {
			args = append(args, currency)
		}
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
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateTransactionNotExpected(ctx, tx, s.db, id); err != nil {
			return err
		}
		survivingParentIDs, err := linkedSurvivingTransactionIDs(ctx, tx, s.db, id)
		if err != nil {
			return err
		}
		result, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("transaction")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
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

		if _, err := tx.ExecContext(ctx, `UPDATE `+s.db.accountingName("record_link")+` AS link
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE link.tombstoned_at IS NULL
  AND (
    link.origin_record_id IN (
      SELECT record_id FROM `+s.db.accountingName("journal_record")+` WHERE transaction_id = ? AND tombstoned_at IS NULL
    )
    OR link.settlement_record_id IN (
      SELECT record_id FROM `+s.db.accountingName("journal_record")+` WHERE transaction_id = ? AND tombstoned_at IS NULL
    )
  )`, id, id); err != nil {
			return fmt.Errorf("tombstone transaction record links: %w", err)
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

		return touchTransactionsByIDs(ctx, tx, s.db, survivingParentIDs)
	})
	return err
}

// Cancel changes transaction lifecycle to cancelled without changing records.
func (s *TransactionStore) Cancel(ctx context.Context, id int64) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		var err error
		transaction, err = scanTransaction(tx.QueryRowContext(
			ctx,
			`UPDATE `+s.db.accountingName("transaction")+`
SET lifecycle_status = CAST('CANCELLED' AS `+s.db.accountingName("transaction_lifecycle_status")+`),
    updated_at = CURRENT_TIMESTAMP
WHERE transaction_id = ?
  AND tombstoned_at IS NULL
  AND lifecycle_status = CAST('ACTIVE' AS `+s.db.accountingName("transaction_lifecycle_status")+`)
  AND NOT EXISTS (
	SELECT 1
	FROM `+s.db.accountingName("journal_record")+` AS jr
	WHERE jr.transaction_id = ?
	  AND jr.tombstoned_at IS NULL
	  AND jr.posted_date IS NOT NULL
  )
RETURNING transaction_id, initiated_date, recurring_occurrence_id, CAST(lifecycle_status AS VARCHAR), created_at, updated_at, tombstoned_at`,
			id,
			id,
		))
		if errors.Is(err, sql.ErrNoRows) {
			current, lookupErr := scanTransaction(tx.QueryRowContext(ctx, `SELECT transaction_id, initiated_date, recurring_occurrence_id,
	CAST(lifecycle_status AS VARCHAR), created_at, updated_at, tombstoned_at
FROM `+s.db.accountingName("transaction")+`
WHERE transaction_id = ? AND tombstoned_at IS NULL`, id))
			if errors.Is(lookupErr, sql.ErrNoRows) {
				return services.ErrNotFound
			} else if lookupErr != nil {
				return fmt.Errorf("inspect rejected transaction cancellation: %w", lookupErr)
			}
			if current.LifecycleStatus == transactions.LifecycleStatusCancelled {
				records, recordsErr := recordsByTransactionIDs(ctx, tx, s.db, []int64{id})
				if recordsErr != nil {
					return recordsErr
				}
				current.Records = records[id]
				transaction = current
				return nil
			}
			if current.LifecycleStatus != transactions.LifecycleStatusActive {
				return transactions.ErrInactiveTransactionMutation
			}
			return transactions.ErrTransactionNotPending
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
		if isDuckDBTransactionConflictError(err) {
			current, getErr := s.Get(ctx, id)
			if getErr != nil {
				if errors.Is(getErr, services.ErrNotFound) {
					return transactions.Transaction{}, getErr
				}
				return transactions.Transaction{}, services.ErrConflict
			}
			if current.LifecycleStatus == transactions.LifecycleStatusCancelled {
				return current, nil
			}
			if current.LifecycleStatus != transactions.LifecycleStatusActive {
				return transactions.Transaction{}, transactions.ErrInactiveTransactionMutation
			}
			for _, record := range current.Records {
				if record.PostedDate != nil {
					return transactions.Transaction{}, transactions.ErrTransactionNotPending
				}
			}
			return transactions.Transaction{}, services.ErrConflict
		}
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
SET lifecycle_status = CAST('ACTIVE' AS `+s.db.accountingName("transaction_lifecycle_status")+`),
    updated_at = CURRENT_TIMESTAMP
WHERE transaction_id = ?
  AND tombstoned_at IS NULL
  AND lifecycle_status = CAST('CANCELLED' AS `+s.db.accountingName("transaction_lifecycle_status")+`)
RETURNING transaction_id, initiated_date, recurring_occurrence_id, CAST(lifecycle_status AS VARCHAR), created_at, updated_at, tombstoned_at`,
			id,
		))
		if errors.Is(err, sql.ErrNoRows) {
			current, lookupErr := scanTransaction(tx.QueryRowContext(ctx, `SELECT transaction_id, initiated_date, recurring_occurrence_id,
	CAST(lifecycle_status AS VARCHAR), created_at, updated_at, tombstoned_at
FROM `+s.db.accountingName("transaction")+`
WHERE transaction_id = ? AND tombstoned_at IS NULL`, id))
			if errors.Is(lookupErr, sql.ErrNoRows) {
				return services.ErrNotFound
			}
			if lookupErr != nil {
				return fmt.Errorf("inspect rejected transaction restoration: %w", lookupErr)
			}
			if current.LifecycleStatus != transactions.LifecycleStatusActive {
				return transactions.ErrInactiveTransactionMutation
			}
			records, recordsErr := recordsByTransactionIDs(ctx, tx, s.db, []int64{id})
			if recordsErr != nil {
				return recordsErr
			}
			current.Records = records[id]
			transaction = current
			return nil
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
		if isDuckDBTransactionConflictError(err) {
			current, getErr := s.Get(ctx, id)
			if getErr != nil {
				if errors.Is(getErr, services.ErrNotFound) {
					return transactions.Transaction{}, getErr
				}
				return transactions.Transaction{}, services.ErrConflict
			}
			if current.LifecycleStatus == transactions.LifecycleStatusActive {
				return current, nil
			}
			if current.LifecycleStatus != transactions.LifecycleStatusCancelled {
				return transactions.Transaction{}, transactions.ErrInactiveTransactionMutation
			}
			return transactions.Transaction{}, services.ErrConflict
		}
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
	updatedCount := 0
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateMutableJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}

		args := append([]any{categoryID}, int64Args(recordIDs)...)
		args = append(args, categoryID)
		changedRecordIDs, err := queryChangedRecordIDs(ctx, tx,
			`UPDATE `+s.db.accountingName("journal_record")+`
SET category_id = ?,
    updated_at = CURRENT_TIMESTAMP
	WHERE record_id IN (`+placeholders(len(recordIDs))+`)
	  AND category_id IS DISTINCT FROM ?
	RETURNING record_id`,
			args...,
		)
		if err != nil {
			return fmt.Errorf("bulk categorize journal records: %w", err)
		}
		updatedCount = len(changedRecordIDs)

		return touchTransactionsByRecordIDs(ctx, tx, s.db, changedRecordIDs)
	})
	if err != nil {
		if isDuckDBTransactionConflictError(err) {
			return 0, services.ErrConflict
		}
		return 0, err
	}

	return updatedCount, nil
}

// BulkReassignAccount assigns one active account to active journal records atomically.
func (s *TransactionStore) BulkReassignAccount(ctx context.Context, recordIDs []int64, accountID int64, pendingDates []*time.Time, postedDates []*time.Time) (int, error) {
	updatedCount := 0
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}

		valuesSQL, valuesArgs := explicitRecordDateValues(recordIDs, pendingDates, postedDates)
		args := append(valuesArgs, accountID)
		changedRecordIDs, err := queryChangedRecordIDs(ctx, tx,
			`UPDATE `+s.db.accountingName("journal_record")+` AS jr
SET account_id = ?,
	 pending_date = changes.pending_date,
	 posted_date = changes.posted_date,
    updated_at = CURRENT_TIMESTAMP
FROM (`+valuesSQL+`) AS changes(record_id, pending_date, posted_date)
	WHERE jr.record_id = changes.record_id
	  AND (
	    jr.account_id IS DISTINCT FROM ?
	    OR jr.pending_date IS DISTINCT FROM changes.pending_date
	    OR jr.posted_date IS DISTINCT FROM changes.posted_date
	  )
	RETURNING jr.record_id`,
			append(args, accountID)...,
		)
		if err != nil {
			return fmt.Errorf("bulk reassign journal record accounts: %w", err)
		}
		updatedCount = len(changedRecordIDs)

		return touchTransactionsByRecordIDs(ctx, tx, s.db, changedRecordIDs)
	})
	if err != nil {
		return 0, s.classifyActiveJournalRecordConflict(ctx, recordIDs, err)
	}

	return updatedCount, nil
}

// BulkReplaceAccount substitutes one common account across selected active transactions atomically.
func (s *TransactionStore) BulkReplaceAccount(ctx context.Context, targets []transactions.BulkAccountReplaceTarget, sourceAccountID int64, replacementAccountID int64) (int, error) {
	updatedRecordCount := 0
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateBulkAccountReplaceRevisions(ctx, tx, s.db, targets); err != nil {
			return err
		}

		transactionIDs := make([]int64, 0, len(targets))
		for _, target := range targets {
			transactionIDs = append(transactionIDs, target.TransactionID)
		}
		inputSQL, args := int64InputValues(transactionIDs)
		args = append(args, replacementAccountID, sourceAccountID)
		changedRecordIDs, err := queryChangedRecordIDs(ctx, tx,
			`UPDATE `+s.db.accountingName("journal_record")+` AS jr
SET account_id = ?,
    updated_at = CURRENT_TIMESTAMP
FROM (`+inputSQL+`) AS input(transaction_id)
WHERE jr.transaction_id = input.transaction_id
  AND jr.account_id = ?
  AND jr.tombstoned_at IS NULL
RETURNING jr.record_id`,
			args...,
		)
		if err != nil {
			return fmt.Errorf("bulk replace transaction account: %w", err)
		}
		updatedRecordCount = len(changedRecordIDs)

		return touchTransactionsByIDs(ctx, tx, s.db, transactionIDs)
	})
	if err != nil {
		if isDuckDBTransactionConflictError(err) {
			return 0, services.ErrConflict
		}
		return 0, err
	}

	return updatedRecordCount, nil
}

// BulkUpdateTags adds and removes active tags on active journal records atomically.
func (s *TransactionStore) BulkUpdateTags(ctx context.Context, recordIDs []int64, addTagIDs []int64, removeTagIDs []int64) (int, error) {
	updatedCount := 0
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateMutableJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}

		inputSQL, args := int64InputValues(recordIDs)
		addTagsSQL, addTagsArgs := tagListExpression(addTagIDs)
		removeTagsSQL, removeTagsArgs := tagListExpression(removeTagIDs)
		args = append(args, addTagsArgs...)
		args = append(args, removeTagsArgs...)
		changedRecordIDs, err := queryChangedRecordIDs(ctx, tx, `WITH input AS (
	SELECT record_id
	FROM (`+inputSQL+`) AS requested(record_id)
), tag_changes AS (
	SELECT `+addTagsSQL+` AS add_tag_ids, `+removeTagsSQL+` AS remove_tag_ids
), changes AS (
	SELECT input.record_id,
		list_sort(list_distinct(list_concat(
			list_filter(jr.tag_ids, lambda tag_id: NOT list_contains(tag_changes.remove_tag_ids, tag_id)),
			tag_changes.add_tag_ids
		))) AS tag_ids
	FROM input
	JOIN `+s.db.accountingName("journal_record")+` AS jr ON jr.record_id = input.record_id
	CROSS JOIN tag_changes
)
UPDATE `+s.db.accountingName("journal_record")+` AS target
SET tag_ids = changes.tag_ids,
    updated_at = CURRENT_TIMESTAMP
FROM changes
WHERE target.record_id = changes.record_id
  AND list_sort(target.tag_ids) IS DISTINCT FROM changes.tag_ids
RETURNING target.record_id`, args...)
		if err != nil {
			return fmt.Errorf("bulk update journal record tags: %w", err)
		}
		updatedCount = len(changedRecordIDs)

		return touchTransactionsByRecordIDs(ctx, tx, s.db, changedRecordIDs)
	})
	if err != nil {
		if isDuckDBTransactionConflictError(err) {
			return 0, services.ErrConflict
		}
		return 0, err
	}

	return updatedCount, nil
}

// BulkSetMember sets or clears one member on active journal records atomically.
func (s *TransactionStore) BulkSetMember(ctx context.Context, recordIDs []int64, memberID *int64) (int, error) {
	updatedCount := 0
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateMutableJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}
		args := append([]any{memberID}, int64Args(recordIDs)...)
		args = append(args, memberID)
		changedRecordIDs, err := queryChangedRecordIDs(ctx, tx, `UPDATE `+s.db.accountingName("journal_record")+`
SET member_id = ?,
    updated_at = CURRENT_TIMESTAMP
	WHERE record_id IN (`+placeholders(len(recordIDs))+`)
	  AND member_id IS DISTINCT FROM ?
	RETURNING record_id`, args...)
		if err != nil {
			return fmt.Errorf("bulk update journal record members: %w", err)
		}
		updatedCount = len(changedRecordIDs)
		return touchTransactionsByRecordIDs(ctx, tx, s.db, changedRecordIDs)
	})
	if err != nil {
		if isDuckDBTransactionConflictError(err) {
			return 0, services.ErrConflict
		}
		return 0, err
	}
	return updatedCount, nil
}

// BulkSetSettlement applies explicit per-record settlement timestamps atomically.
func (s *TransactionStore) BulkSetSettlement(ctx context.Context, recordIDs []int64, pendingDates []*time.Time, postedDates []*time.Time) (int, error) {
	updatedCount := 0
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		valuesSQL, args := explicitRecordDateValues(recordIDs, pendingDates, postedDates)
		touchedTransactionIDs, err := queryChangedRecordIDs(ctx, tx,
			`UPDATE `+s.db.accountingName("transaction")+` AS target
SET updated_at = CURRENT_TIMESTAMP
WHERE target.lifecycle_status = CAST('ACTIVE' AS `+s.db.accountingName("transaction_lifecycle_status")+`)
  AND EXISTS (
	SELECT 1
	FROM `+s.db.accountingName("journal_record")+` AS jr
	JOIN (`+valuesSQL+`) AS changes(record_id, pending_date, posted_date) ON jr.record_id = changes.record_id
	WHERE jr.transaction_id = target.transaction_id
	  AND jr.tombstoned_at IS NULL
	  AND (
	    jr.pending_date IS DISTINCT FROM changes.pending_date
	    OR jr.posted_date IS DISTINCT FROM changes.posted_date
	  )
  )
RETURNING transaction_id`,
			args...,
		)
		if err != nil {
			return fmt.Errorf("touch active journal record transactions: %w", err)
		}
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}

		changedRecordIDs, err := queryChangedRecordIDs(ctx, tx, `UPDATE `+s.db.accountingName("journal_record")+` AS jr
SET pending_date = changes.pending_date,
    posted_date = changes.posted_date,
    updated_at = CURRENT_TIMESTAMP
FROM (`+valuesSQL+`) AS changes(record_id, pending_date, posted_date)
	WHERE jr.record_id = changes.record_id
	  AND (
	    jr.pending_date IS DISTINCT FROM changes.pending_date
	    OR jr.posted_date IS DISTINCT FROM changes.posted_date
	  )
	RETURNING jr.record_id`,
			args...,
		)
		if err != nil {
			return fmt.Errorf("bulk update journal record settlement: %w", err)
		}
		changedTransactionIDs := []int64{}
		if len(changedRecordIDs) > 0 {
			changedTransactionIDs, err = transactionIDsByRecordIDs(ctx, tx, s.db, changedRecordIDs)
			if err != nil {
				return err
			}
		}
		if !slices.Equal(uniqueSortedInt64s(touchedTransactionIDs), changedTransactionIDs) {
			return services.ErrConflict
		}
		updatedCount = len(changedRecordIDs)
		return nil
	})
	if err != nil {
		return 0, s.classifyActiveJournalRecordConflict(ctx, recordIDs, err)
	}

	return updatedCount, nil
}

// BulkSetReconciliation applies one reconciliation status atomically.
func (s *TransactionStore) BulkSetReconciliation(ctx context.Context, recordIDs []int64, status transactions.ReconciliationStatus) (int, error) {
	updatedCount := 0
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}
		args := append([]any{enumValue(status)}, int64Args(recordIDs)...)
		args = append(args, enumValue(status))
		changedRecordIDs, err := queryChangedRecordIDs(ctx, tx, `UPDATE `+s.db.accountingName("journal_record")+`
SET reconciliation_status = CAST(? AS `+s.db.accountingName("reconciliation_status")+`),
    updated_at = CURRENT_TIMESTAMP
	WHERE record_id IN (`+placeholders(len(recordIDs))+`)
	  AND reconciliation_status IS DISTINCT FROM CAST(? AS `+s.db.accountingName("reconciliation_status")+`)
	RETURNING record_id`, args...)
		if err != nil {
			return fmt.Errorf("bulk update journal record reconciliation: %w", err)
		}
		updatedCount = len(changedRecordIDs)
		return touchTransactionsByRecordIDs(ctx, tx, s.db, changedRecordIDs)
	})
	if err != nil {
		return 0, s.classifyActiveJournalRecordConflict(ctx, recordIDs, err)
	}
	return updatedCount, nil
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

func queryChangedRecordIDs(ctx context.Context, tx *sql.Tx, query string, args ...any) ([]int64, error) {
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = rows.Close()
	}()

	recordIDs := []int64{}
	for rows.Next() {
		var recordID int64
		if err := rows.Scan(&recordID); err != nil {
			return nil, err
		}
		recordIDs = append(recordIDs, recordID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return recordIDs, nil
}

func touchTransactionsByRecordIDs(ctx context.Context, tx *sql.Tx, db *AppDB, recordIDs []int64) error {
	if len(recordIDs) == 0 {
		return nil
	}

	valuesSQL, args := int64InputValues(recordIDs)
	if _, err := tx.ExecContext(ctx, `UPDATE `+db.accountingName("transaction")+` AS target
SET updated_at = CURRENT_TIMESTAMP
FROM (
	SELECT DISTINCT jr.transaction_id
	FROM (`+valuesSQL+`) AS input(record_id)
	JOIN `+db.accountingName("journal_record")+` AS jr ON jr.record_id = input.record_id
) AS input
WHERE target.transaction_id = input.transaction_id`, args...); err != nil {
		return fmt.Errorf("touch journal record transactions: %w", err)
	}
	return nil
}

func touchTransactionsByIDs(ctx context.Context, tx *sql.Tx, db *AppDB, transactionIDs []int64) error {
	if len(transactionIDs) == 0 {
		return nil
	}

	valuesSQL, args := int64InputValues(transactionIDs)
	if _, err := tx.ExecContext(ctx, `UPDATE `+db.accountingName("transaction")+` AS target
SET updated_at = CURRENT_TIMESTAMP
FROM (
	SELECT DISTINCT transaction_id
	FROM (`+valuesSQL+`) AS input(transaction_id)
) AS input
WHERE target.transaction_id = input.transaction_id`, args...); err != nil {
		return fmt.Errorf("touch transactions: %w", err)
	}
	return nil
}

func touchTransactionsFromInput(ctx context.Context, tx *sql.Tx, db *AppDB, inputTable string) error {
	if _, err := tx.ExecContext(ctx, `UPDATE `+db.accountingName("transaction")+` AS target
SET updated_at = CURRENT_TIMESTAMP
FROM `+QuoteIdentifier(inputTable)+` AS input
WHERE target.transaction_id = input.transaction_id`); err != nil {
		return fmt.Errorf("touch transactions: %w", err)
	}
	return nil
}

func int64InputValues(values []int64) (string, []any) {
	rows := make([]string, 0, len(values))
	for range values {
		rows = append(rows, "(CAST(? AS BIGINT))")
	}
	return "VALUES " + strings.Join(rows, ", "), int64Args(values)
}

func uniqueSortedInt64s(values []int64) []int64 {
	unique := make(map[int64]struct{}, len(values))
	for _, value := range values {
		unique[value] = struct{}{}
	}
	result := make([]int64, 0, len(unique))
	for value := range unique {
		result = append(result, value)
	}
	slices.Sort(result)
	return result
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
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&transaction.ID,
		&initiatedDate,
		&recurringOccurrenceID,
		&lifecycleStatus,
		&createdAt,
		&updatedAt,
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
	transaction.UpdatedAt = updatedAt.UTC()
	transaction.TombstonedAt = nullableTimeFromSQL(tombstonedAt)
	transaction.Records = []transactions.JournalRecord{}

	return transaction, nil
}

func journalRecordMatchesPersist(record transactions.JournalRecord, desired transactions.PersistJournalRecordInput) bool {
	return record.AccountID == desired.AccountID &&
		optionalEqual(record.MemberID, desired.MemberID) &&
		record.Currency == desired.Currency &&
		record.Amount.Cmp(desired.Amount) == 0 &&
		optionalDecimalEqual(record.AmountUSD, desired.AmountUSD) &&
		optionalEqual(record.CategoryID, desired.CategoryID) &&
		equalInt64Sets(record.TagIDs, desired.TagIDs) &&
		optionalEqual(record.Memo, desired.Memo) &&
		optionalTimeEqual(record.PendingDate, desired.PendingDate) &&
		optionalTimeEqual(record.PostedDate, desired.PostedDate) &&
		record.ReconciliationStatus == desired.ReconciliationStatus &&
		record.Source == desired.Source &&
		optionalEqual(record.ExternalID, desired.ExternalID) &&
		optionalEqual(record.ExternalSystem, desired.ExternalSystem)
}

func equalInt64Sets(left []int64, right []int64) bool {
	if len(left) != len(right) {
		return false
	}
	left = slices.Clone(left)
	right = slices.Clone(right)
	slices.Sort(left)
	slices.Sort(right)
	return slices.Equal(left, right)
}

func optionalEqual[T comparable](left *T, right *T) bool {
	return left == nil && right == nil || left != nil && right != nil && *left == *right
}

func optionalTimeEqual(left *time.Time, right *time.Time) bool {
	return left == nil && right == nil || left != nil && right != nil && left.Equal(right.Truncate(time.Microsecond))
}

func optionalDecimalEqual(left *values.Decimal, right *values.Decimal) bool {
	return left == nil && right == nil || left != nil && right != nil && left.Cmp(*right) == 0
}

type journalRecordUpdate struct {
	recordID int64
	input    transactions.PersistJournalRecordInput
}

func updateJournalRecords(ctx context.Context, tx *sql.Tx, db *AppDB, updates []journalRecordUpdate) error {
	if len(updates) == 0 {
		return nil
	}

	rows := make([]string, 0, len(updates))
	args := []any{}
	for _, update := range updates {
		tagListExpr, tagListArgs := tagListExpression(update.input.TagIDs)
		rows = append(rows, "(?, ?, ?, ?, ?, ?, ?, "+tagListExpr+", ?, ?, ?, ?)")
		args = append(args,
			update.recordID,
			update.input.AccountID,
			update.input.MemberID,
			update.input.Currency,
			update.input.Amount.LibraryDecimal(),
			nullableDecimalArg(update.input.AmountUSD),
			update.input.CategoryID,
		)
		args = append(args, tagListArgs...)
		args = append(args,
			update.input.Memo,
			nullableTimestampArg(update.input.PendingDate),
			nullableTimestampArg(update.input.PostedDate),
			enumValue(update.input.ReconciliationStatus),
		)
	}

	if _, err := tx.ExecContext(ctx, `UPDATE `+db.accountingName("journal_record")+` AS target
SET account_id = input.account_id,
    member_id = input.member_id,
    currency = input.currency,
    amount = input.amount,
    amount_usd = input.amount_usd,
    category_id = input.category_id,
    tag_ids = input.tag_ids,
    memo = input.memo,
    pending_date = input.pending_date,
    posted_date = input.posted_date,
    reconciliation_status = CAST(input.reconciliation_status AS `+db.accountingName("reconciliation_status")+`),
    updated_at = CURRENT_TIMESTAMP
FROM (VALUES `+strings.Join(rows, ", ")+`) AS input(
	record_id, account_id, member_id, currency, amount, amount_usd, category_id, tag_ids, memo,
	pending_date, posted_date, reconciliation_status
)
WHERE target.record_id = input.record_id AND target.tombstoned_at IS NULL`, args...); err != nil {
		return fmt.Errorf("update retained journal records: %w", err)
	}
	return nil
}

func guardJournalRecordRemovals(ctx context.Context, tx *sql.Tx, db *AppDB, recordIDs []int64) error {
	if len(recordIDs) == 0 {
		return nil
	}
	var blocker string
	args := int64Args(recordIDs)
	err := tx.QueryRowContext(ctx, `SELECT blocker
FROM (
	SELECT CASE
		WHEN jr.source = CAST('IMPORTED' AS `+db.accountingName("source")+`) OR EXISTS (
			SELECT 1 FROM `+db.accountingName("imported_record_metadata")+` AS metadata
			WHERE metadata.record_id = jr.record_id AND metadata.tombstoned_at IS NULL
		) THEN 'imported'
		WHEN EXISTS (
			SELECT 1 FROM `+db.accountingName("record_link")+` AS link
			WHERE link.tombstoned_at IS NULL
			  AND (link.origin_record_id = jr.record_id OR link.settlement_record_id = jr.record_id)
		) THEN 'linked'
	END AS blocker
	FROM `+db.accountingName("journal_record")+` AS jr
	WHERE jr.record_id IN (`+placeholders(len(recordIDs))+`)
	  AND jr.tombstoned_at IS NULL
) AS blocked
WHERE blocker IS NOT NULL
ORDER BY CASE blocker WHEN 'imported' THEN 0 ELSE 1 END
LIMIT 1`, args...).Scan(&blocker)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("guard journal record removals: %w", err)
	}
	if blocker == "imported" {
		return transactions.ErrImportedRecordRemoval
	}
	return transactions.ErrLinkedRecordRemoval
}

func insertJournalRecords(ctx context.Context, tx *sql.Tx, db *AppDB, transactionID int64, records []transactions.PersistJournalRecordInput) error {
	if len(records) == 0 {
		return nil
	}

	rows := make([]string, 0, len(records))
	args := []any{}
	for _, record := range records {
		tagListExpr, tagListArgs := tagListExpression(record.TagIDs)
		rows = append(rows, "(?, ?, ?, ?, ?, ?, ?, "+tagListExpr+", ?, ?, ?, CAST(? AS "+db.accountingName("reconciliation_status")+"), CAST(? AS "+db.accountingName("source")+"), ?, ?)")
		args = append(args,
			transactionID,
			record.AccountID,
			record.MemberID,
			record.Currency,
			record.Amount.LibraryDecimal(),
			nullableDecimalArg(record.AmountUSD),
			record.CategoryID,
		)
		args = append(args, tagListArgs...)
		args = append(args,
			record.Memo,
			nullableTimestampArg(record.PendingDate),
			nullableTimestampArg(record.PostedDate),
			enumValue(record.ReconciliationStatus),
			enumValue(record.Source),
			record.ExternalID,
			record.ExternalSystem,
		)
	}

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO `+db.accountingName("journal_record")+` (
	transaction_id, account_id, member_id, currency, amount, amount_usd, category_id, tag_ids, memo,
	pending_date, posted_date, reconciliation_status, source, external_id, external_system
)
VALUES `+strings.Join(rows, ", "),
		args...,
	); err != nil {
		return fmt.Errorf("insert journal records: %w", err)
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

func validateMutableJournalRecords(ctx context.Context, queryer rowQuerier, db *AppDB, recordIDs []int64) error {
	return validateJournalRecordsForMutation(ctx, queryer, db, recordIDs, false)
}

func validateActiveJournalRecords(ctx context.Context, queryer rowQuerier, db *AppDB, recordIDs []int64) error {
	return validateJournalRecordsForMutation(ctx, queryer, db, recordIDs, true)
}

func validateBulkAccountReplaceRevisions(ctx context.Context, queryer rowQuerier, db *AppDB, targets []transactions.BulkAccountReplaceTarget) error {
	if len(targets) == 0 {
		return services.ErrInvalidReference
	}
	valuesSQL, args := bulkAccountReplaceTargetValues(targets)
	var matching int
	if err := queryer.QueryRowContext(ctx, `SELECT COUNT(*)
FROM (`+valuesSQL+`) AS input(transaction_id, updated_at)
JOIN `+db.accountingName("transaction")+` AS tr
  ON tr.transaction_id = input.transaction_id
 AND tr.updated_at = input.updated_at
 AND tr.tombstoned_at IS NULL`, args...).Scan(&matching); err != nil {
		return fmt.Errorf("validate bulk account replace revisions: %w", err)
	}
	if matching != len(targets) {
		return services.ErrConflict
	}
	return nil
}

func bulkAccountReplaceTargetValues(targets []transactions.BulkAccountReplaceTarget) (string, []any) {
	rows := make([]string, 0, len(targets))
	args := make([]any, 0, len(targets)*2)
	for _, target := range targets {
		rows = append(rows, "(CAST(? AS BIGINT), CAST(? AS TIMESTAMP))")
		args = append(args, target.TransactionID, timestampArg(target.UpdatedAt))
	}
	return "VALUES " + strings.Join(rows, ", "), args
}

func validateJournalRecordsForMutation(ctx context.Context, queryer rowQuerier, db *AppDB, recordIDs []int64, requireActiveTransaction bool) error {
	if len(recordIDs) == 0 {
		return services.ErrInvalidReference
	}

	var found int
	var expected int
	var inactive int
	err := queryer.QueryRowContext(
		ctx,
		`SELECT
	COUNT(DISTINCT jr.record_id),
	COUNT(*) FILTER (WHERE o.status = CAST('EXPECTED' AS `+db.accountingName("recurring_occurrence_status")+`)),
	COUNT(*) FILTER (WHERE tr.lifecycle_status <> CAST('ACTIVE' AS `+db.accountingName("transaction_lifecycle_status")+`))
FROM `+db.accountingName("journal_record")+` AS jr
JOIN `+db.accountingName("transaction")+` AS tr ON tr.transaction_id = jr.transaction_id
LEFT JOIN `+db.accountingName("recurring_occurrence")+` AS o ON o.recurring_occurrence_id = tr.recurring_occurrence_id
WHERE jr.record_id IN (`+placeholders(len(recordIDs))+`)
  AND jr.tombstoned_at IS NULL
  AND tr.tombstoned_at IS NULL`,
		int64Args(recordIDs)...,
	).Scan(&found, &expected, &inactive)
	if err != nil {
		return fmt.Errorf("validate mutable journal records: %w", err)
	}
	if found != len(recordIDs) {
		return services.ErrInvalidReference
	}
	if expected > 0 {
		return transactions.ErrExpectedRecurringMutation
	}
	if requireActiveTransaction && inactive > 0 {
		return transactions.ErrInactiveTransactionMutation
	}
	return nil
}

func (s *TransactionStore) classifyActiveJournalRecordConflict(ctx context.Context, recordIDs []int64, err error) error {
	if !isDuckDBTransactionConflictError(err) {
		return err
	}
	if validationErr := validateActiveJournalRecords(ctx, s.db.query(), s.db, recordIDs); errors.Is(validationErr, transactions.ErrInactiveTransactionMutation) {
		return validationErr
	}
	return services.ErrConflict
}

func validateTransactionNotExpected(ctx context.Context, queryer rowQuerier, db *AppDB, transactionID int64) error {
	var expected bool
	err := queryer.QueryRowContext(ctx, `SELECT COALESCE(
	o.status = CAST('EXPECTED' AS `+db.accountingName("recurring_occurrence_status")+`),
	FALSE
)
FROM `+db.accountingName("transaction")+` AS tr
LEFT JOIN `+db.accountingName("recurring_occurrence")+` AS o ON o.recurring_occurrence_id = tr.recurring_occurrence_id
WHERE tr.transaction_id = ? AND tr.tombstoned_at IS NULL`, transactionID).Scan(&expected)
	if errors.Is(err, sql.ErrNoRows) {
		return services.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("validate transaction recurring occurrence state: %w", err)
	}
	if expected {
		return transactions.ErrExpectedRecurringMutation
	}
	return nil
}

func linkedSurvivingTransactionIDs(ctx context.Context, queryer rowsQuerier, db *AppDB, transactionID int64) ([]int64, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT DISTINCT peer.transaction_id
FROM `+db.accountingName("record_link")+` AS link
JOIN `+db.accountingName("journal_record")+` AS target
  ON target.record_id = link.origin_record_id OR target.record_id = link.settlement_record_id
JOIN `+db.accountingName("journal_record")+` AS peer
  ON peer.record_id = link.origin_record_id OR peer.record_id = link.settlement_record_id
JOIN `+db.accountingName("transaction")+` AS peer_transaction ON peer_transaction.transaction_id = peer.transaction_id
WHERE link.tombstoned_at IS NULL
  AND target.transaction_id = ?
  AND target.tombstoned_at IS NULL
  AND peer.transaction_id <> ?
  AND peer.tombstoned_at IS NULL
  AND peer_transaction.tombstoned_at IS NULL
ORDER BY peer.transaction_id`, transactionID, transactionID)
	if err != nil {
		return nil, fmt.Errorf("resolve surviving linked transactions: %w", err)
	}
	defer func() { _ = rows.Close() }()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan surviving linked transaction: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate surviving linked transactions: %w", err)
	}
	return ids, nil
}

func tagListExpression(tagIDs []int64) (string, []any) {
	if len(tagIDs) == 0 {
		return "CAST([] AS INTEGER[])", nil
	}

	return "CAST([" + placeholders(len(tagIDs)) + "] AS INTEGER[])", int64Args(tagIDs)
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
	services.SortKeyUpdatedAt:     {"updated_at"},
}

var recordSortColumns = map[services.SortKey][]string{
	services.SortKeyInitiatedDate: {"tx.initiated_date", "jr.transaction_id", "jr.record_id"},
	services.SortKeyUpdatedAt:     {"jr.updated_at", "jr.record_id"},
}

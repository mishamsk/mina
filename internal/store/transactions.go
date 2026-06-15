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
func (s *TransactionStore) Create(ctx context.Context, req transactions.CreateInput) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateTransactionReferences(ctx, tx, s.db, req); err != nil {
			return err
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.db.accountingName("transaction")+` (initiated_date)
VALUES (?)
RETURNING transaction_id, initiated_date, created_at, tombstoned_at`,
			civilDateArg(req.InitiatedDate),
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
func (s *TransactionStore) Replace(ctx context.Context, id int64, req transactions.CreateInput) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		row := tx.QueryRowContext(
			ctx,
			`UPDATE `+s.db.accountingName("transaction")+`
SET initiated_date = ?
WHERE transaction_id = ? AND tombstoned_at IS NULL
RETURNING transaction_id, initiated_date, created_at, tombstoned_at`,
			civilDateArg(req.InitiatedDate),
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

		if err := validateTransactionReferences(ctx, tx, s.db, req); err != nil {
			if errors.Is(err, services.ErrNotFound) {
				return fmt.Errorf("%w: %v", services.ErrInvalidReference, err)
			}
			return err
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

// Get returns a transaction with nested journal records.
func (s *TransactionStore) Get(ctx context.Context, id int64) (transactions.Transaction, error) {
	transaction, err := scanTransaction(s.db.query().QueryRowContext(
		ctx,
		`SELECT transaction_id, initiated_date, created_at, tombstoned_at
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
func (s *TransactionStore) List(ctx context.Context) ([]transactions.Transaction, error) {
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT transaction_id, initiated_date, created_at, tombstoned_at
FROM `+s.db.accountingName("transaction")+`
WHERE tombstoned_at IS NULL
ORDER BY initiated_date ASC, transaction_id ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list transactions: %w", err)
	}

	transactions := []transactions.Transaction{}
	transactionIDs := []int64{}
	for rows.Next() {
		transaction, err := scanTransaction(rows)
		if err != nil {
			return nil, fmt.Errorf("scan transaction: %w", err)
		}
		transactions = append(transactions, transaction)
		transactionIDs = append(transactionIDs, transaction.ID)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate transactions: %w; close transactions rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate transactions: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close transactions rows: %w", err)
	}

	records, err := s.recordsByTransactionIDs(ctx, transactionIDs)
	if err != nil {
		return nil, err
	}
	for index := range transactions {
		transactions[index].Records = records[transactions[index].ID]
	}

	return transactions, nil
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

// SearchRecords returns active journal records matching filters.
func (s *TransactionStore) SearchRecords(ctx context.Context, opts transactions.RecordSearchOptions) ([]transactions.JournalRecord, error) {
	query := `SELECT jr.record_id, jr.transaction_id, jr.account_id, jr.member_id, jr.currency, jr.amount, jr.amount_usd, jr.category_id,
	jr.tag_ids, jr.memo, jr.pending_date, jr.posted_date, jr.posting_status, jr.reconciliation_status, jr.source, jr.external_id, jr.external_system,
	jr.created_at, jr.updated_at, jr.tombstoned_at, a.account_type, c.economic_intent
FROM ` + s.db.accountingName("journal_record") + ` jr
JOIN ` + s.db.accountingName("transaction") + ` tx ON tx.transaction_id = jr.transaction_id
JOIN ` + s.db.accountingName("account") + ` a ON a.account_id = jr.account_id
JOIN ` + s.db.accountingName("category") + ` c ON c.category_id = jr.category_id
WHERE jr.tombstoned_at IS NULL AND tx.tombstoned_at IS NULL`
	args := []any{}
	if opts.AccountID != nil {
		query += " AND jr.account_id = ?"
		args = append(args, *opts.AccountID)
	}
	if opts.CategoryID != nil {
		query += " AND jr.category_id = ?"
		args = append(args, *opts.CategoryID)
	}
	if opts.MemberID != nil {
		query += " AND jr.member_id = ?"
		args = append(args, *opts.MemberID)
	}
	if opts.TagID != nil {
		query += " AND list_contains(jr.tag_ids, ?)"
		args = append(args, *opts.TagID)
	}
	if opts.PostingStatus != nil {
		query += " AND jr.posting_status = CAST(? AS " + s.db.accountingName("posting_status") + ")"
		args = append(args, enumValue(*opts.PostingStatus))
	}
	if opts.ReconciliationStatus != nil {
		query += " AND jr.reconciliation_status = CAST(? AS " + s.db.accountingName("reconciliation_status") + ")"
		args = append(args, enumValue(*opts.ReconciliationStatus))
	}
	if opts.AmountMin != nil {
		query += " AND jr.amount >= ?"
		args = append(args, opts.AmountMin.LibraryDecimal())
	}
	if opts.AmountMax != nil {
		query += " AND jr.amount <= ?"
		args = append(args, opts.AmountMax.LibraryDecimal())
	}
	if opts.AmountUSDMin != nil {
		query += " AND jr.amount_usd >= ?"
		args = append(args, opts.AmountUSDMin.LibraryDecimal())
	}
	if opts.AmountUSDMax != nil {
		query += " AND jr.amount_usd <= ?"
		args = append(args, opts.AmountUSDMax.LibraryDecimal())
	}
	if opts.InitiatedDateFrom != nil {
		query += " AND tx.initiated_date >= ?"
		args = append(args, civilDateArg(*opts.InitiatedDateFrom))
	}
	if opts.InitiatedDateTo != nil {
		query += " AND tx.initiated_date <= ?"
		args = append(args, civilDateArg(*opts.InitiatedDateTo))
	}
	if opts.PendingDateFrom != nil {
		query += " AND jr.pending_date >= ?"
		args = append(args, timestampArg(*opts.PendingDateFrom))
	}
	if opts.PendingDateTo != nil {
		query += " AND jr.pending_date <= ?"
		args = append(args, timestampArg(*opts.PendingDateTo))
	}
	if opts.PostedDateFrom != nil {
		query += " AND jr.posted_date >= ?"
		args = append(args, timestampArg(*opts.PostedDateFrom))
	}
	if opts.PostedDateTo != nil {
		query += " AND jr.posted_date <= ?"
		args = append(args, timestampArg(*opts.PostedDateTo))
	}
	if opts.MemoContains != nil {
		query += " AND jr.memo LIKE ? ESCAPE '\\'"
		args = append(args, "%"+escapeLikePattern(*opts.MemoContains)+"%")
	}
	query += " ORDER BY tx.initiated_date ASC, jr.transaction_id ASC, jr.record_id ASC"

	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("search journal records: %w", err)
	}

	records := []transactions.JournalRecord{}
	for rows.Next() {
		record, err := scanJournalRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("scan searched journal record: %w", err)
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate searched journal records: %w; close searched journal record rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate searched journal records: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close searched journal record rows: %w", err)
	}

	return records, nil
}

// TransactionsByRecordIDs returns active transactions containing selected active records.
func (s *TransactionStore) TransactionsByRecordIDs(ctx context.Context, recordIDs []int64) ([]transactions.Transaction, error) {
	return transactionsByRecordIDs(ctx, s.db.query(), s.db, recordIDs)
}

// BulkCategorize assigns one active category to active journal records atomically.
func (s *TransactionStore) BulkCategorize(ctx context.Context, recordIDs []int64, categoryID int64) (int, error) {
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}
		exists, err := activeCategoryExists(ctx, tx, s.db, categoryID)
		if err != nil {
			return err
		}
		if !exists {
			return services.ErrInvalidReference
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
func (s *TransactionStore) BulkReassignAccount(ctx context.Context, recordIDs []int64, accountID int64) (int, error) {
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}
		exists, err := activeAccountExists(ctx, tx, s.db, accountID)
		if err != nil {
			return err
		}
		if !exists {
			return services.ErrInvalidReference
		}

		args := append([]any{accountID}, int64Args(recordIDs)...)
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("journal_record")+`
SET account_id = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE record_id IN (`+placeholders(len(recordIDs))+`)`,
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
		if err := validateActiveTags(ctx, tx, s.db, append(append([]int64{}, addTagIDs...), removeTagIDs...)); err != nil {
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

// BulkUpdateStatuses updates posting and reconciliation statuses on active journal records atomically.
func (s *TransactionStore) BulkUpdateStatuses(
	ctx context.Context,
	recordIDs []int64,
	postingStatus *transactions.PostingStatus,
	reconciliationStatus *transactions.ReconciliationStatus,
) (int, error) {
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, s.db, recordIDs); err != nil {
			return err
		}

		setClauses := []string{}
		args := []any{}
		if postingStatus != nil {
			setClauses = append(setClauses, "posting_status = CAST(? AS "+s.db.accountingName("posting_status")+")")
			args = append(args, enumValue(*postingStatus))
		}
		if reconciliationStatus != nil {
			setClauses = append(setClauses, "reconciliation_status = CAST(? AS "+s.db.accountingName("reconciliation_status")+")")
			args = append(args, enumValue(*reconciliationStatus))
		}
		setClauses = append(setClauses, "updated_at = CURRENT_TIMESTAMP")
		args = append(args, int64Args(recordIDs)...)

		if _, err := tx.ExecContext(
			ctx,
			"UPDATE "+s.db.accountingName("journal_record")+" SET "+strings.Join(setClauses, ", ")+" WHERE record_id IN ("+placeholders(len(recordIDs))+")",
			args...,
		); err != nil {
			return fmt.Errorf("bulk update journal record statuses: %w", err)
		}

		return nil
	})
	if err != nil {
		return 0, err
	}

	return len(recordIDs), nil
}

type transactionScanner interface {
	Scan(dest ...any) error
}

func scanTransaction(scanner transactionScanner) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	var initiatedDate time.Time
	var createdAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&transaction.ID,
		&initiatedDate,
		&createdAt,
		&tombstonedAt,
	); err != nil {
		return transactions.Transaction{}, err
	}
	transaction.InitiatedDate = values.CivilDateFromTime(initiatedDate)
	transaction.CreatedAt = createdAt.UTC()
	transaction.TombstonedAt = nullableTimeFromSQL(tombstonedAt)
	transaction.Records = []transactions.JournalRecord{}

	return transaction, nil
}

func insertJournalRecord(ctx context.Context, tx *sql.Tx, db *AppDB, transactionID int64, req transactions.JournalRecordInput) error {
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
		enumValue(req.PostingStatus),
		enumValue(req.ReconciliationStatus),
		enumValue(req.Source),
		req.ExternalID,
		req.ExternalSystem,
	)

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO `+db.accountingName("journal_record")+` (
	transaction_id, account_id, member_id, currency, amount, amount_usd, category_id, tag_ids, memo,
	pending_date, posted_date, posting_status, reconciliation_status, source, external_id, external_system
)
VALUES (?, ?, ?, ?, ?, ?, ?, `+tagListExpr+`, ?, ?, ?, CAST(? AS `+db.accountingName("posting_status")+`), CAST(? AS `+db.accountingName("reconciliation_status")+`), CAST(? AS `+db.accountingName("source")+`), ?, ?)`,
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
	var tagIDs []any
	var memo sql.NullString
	var pendingDate time.Time
	var postedDate sql.NullTime
	var postingStatus string
	var reconciliationStatus string
	var source string
	var externalID sql.NullString
	var externalSystem sql.NullString
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	var accountType sql.NullString
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
		&tagIDs,
		&memo,
		&pendingDate,
		&postedDate,
		&postingStatus,
		&reconciliationStatus,
		&source,
		&externalID,
		&externalSystem,
		&createdAt,
		&updatedAt,
		&tombstonedAt,
		&accountType,
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
	if memberID.Valid {
		record.MemberID = &memberID.Int64
	}
	if memo.Valid {
		record.Memo = &memo.String
	}
	record.PendingDate = pendingDate.UTC()
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
	record.CreatedAt = createdAt.UTC()
	record.UpdatedAt = updatedAt.UTC()
	record.TombstonedAt = nullableTimeFromSQL(tombstonedAt)
	record.PostingStatus = transactions.PostingStatus(strings.ToLower(postingStatus))
	record.ReconciliationStatus = transactions.ReconciliationStatus(strings.ToLower(reconciliationStatus))
	record.Source = transactions.Source(strings.ToLower(source))
	if accountType.Valid {
		record.AccountType = accounts.AccountType(strings.ToLower(accountType.String))
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
	jr.tag_ids, jr.memo, jr.pending_date, jr.posted_date, jr.posting_status, jr.reconciliation_status, jr.source, jr.external_id, jr.external_system,
	jr.created_at, jr.updated_at, jr.tombstoned_at, a.account_type, c.economic_intent
FROM `+db.accountingName("journal_record")+` jr
JOIN `+db.accountingName("account")+` a ON a.account_id = jr.account_id
JOIN `+db.accountingName("category")+` c ON c.category_id = jr.category_id
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

func validateTransactionReferences(ctx context.Context, tx *sql.Tx, db *AppDB, req transactions.CreateInput) error {
	for _, record := range req.Records {
		exists, err := activeAccountExists(ctx, tx, db, record.AccountID)
		if err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("%w: active account not found", services.ErrNotFound)
		}

		exists, err = activeCategoryExists(ctx, tx, db, record.CategoryID)
		if err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("%w: active category not found", services.ErrNotFound)
		}

		if record.MemberID != nil {
			exists, err = activeMemberExists(ctx, tx, db, *record.MemberID)
			if err != nil {
				return err
			}
			if !exists {
				return fmt.Errorf("%w: active member not found", services.ErrNotFound)
			}
		}

		for _, tagID := range record.TagIDs {
			exists, err = activeTagExists(ctx, tx, db, tagID)
			if err != nil {
				return err
			}
			if !exists {
				return fmt.Errorf("%w: active tag not found", services.ErrNotFound)
			}
		}
	}

	return nil
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
		affected = append(affected, transactions.Transaction{
			ID:      transactionID,
			Records: records[transactionID],
		})
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

func validateActiveTags(ctx context.Context, queryer rowQuerier, db *AppDB, tagIDs []int64) error {
	if len(tagIDs) == 0 {
		return nil
	}

	var count int
	err := queryer.QueryRowContext(
		ctx,
		`SELECT COUNT(DISTINCT tag_id)
FROM `+db.accountingName("tag")+`
WHERE tag_id IN (`+placeholders(len(tagIDs))+`)
  AND tombstoned_at IS NULL`,
		int64Args(tagIDs)...,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("check active tags: %w", err)
	}
	if count != len(tagIDs) {
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

func activeCategoryExists(ctx context.Context, queryer rowQuerier, db *AppDB, categoryID int64) (bool, error) {
	var id int64
	err := queryer.QueryRowContext(
		ctx,
		"SELECT category_id FROM "+db.accountingName("category")+" WHERE category_id = ? AND tombstoned_at IS NULL LIMIT 1",
		categoryID,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check active category: %w", err)
	}

	return true, nil
}

func activeMemberExists(ctx context.Context, queryer rowQuerier, db *AppDB, memberID int64) (bool, error) {
	var id int64
	err := queryer.QueryRowContext(
		ctx,
		"SELECT member_id FROM "+db.accountingName("member")+" WHERE member_id = ? AND tombstoned_at IS NULL LIMIT 1",
		memberID,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check active member: %w", err)
	}

	return true, nil
}

func activeTagExists(ctx context.Context, queryer rowQuerier, db *AppDB, tagID int64) (bool, error) {
	var id int64
	err := queryer.QueryRowContext(
		ctx,
		"SELECT tag_id FROM "+db.accountingName("tag")+" WHERE tag_id = ? AND tombstoned_at IS NULL LIMIT 1",
		tagID,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check active tag: %w", err)
	}

	return true, nil
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

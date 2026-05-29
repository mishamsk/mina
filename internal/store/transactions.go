package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"mina.local/mina/internal/services"
	"mina.local/mina/internal/services/transactions"
)

// TransactionStore persists transactions and journal records.
type TransactionStore struct {
	db *sql.DB
}

var _ transactions.Repository = (*TransactionStore)(nil)

// NewTransactionStore creates a transaction store using db.
func NewTransactionStore(db *sql.DB) *TransactionStore {
	return &TransactionStore{db: db}
}

// Create persists a transaction and all journal records atomically.
func (s *TransactionStore) Create(ctx context.Context, req transactions.CreateInput) (transactions.Transaction, error) {
	var transaction transactions.Transaction
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		if err := validateTransactionReferences(ctx, tx, req); err != nil {
			return err
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO "transaction" (initiated_date)
VALUES (?)
RETURNING transaction_id, initiated_date, created_at, tombstoned_at`,
			req.InitiatedDate,
		)
		var err error
		transaction, err = scanTransaction(row)
		if err != nil {
			return fmt.Errorf("insert transaction: %w", err)
		}

		for _, recordReq := range req.Records {
			record, err := insertJournalRecord(ctx, tx, transaction.ID, recordReq)
			if err != nil {
				return err
			}
			transaction.Records = append(transaction.Records, record)
		}

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
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		row := tx.QueryRowContext(
			ctx,
			`UPDATE "transaction"
SET initiated_date = ?
WHERE transaction_id = ? AND tombstoned_at IS NULL
RETURNING transaction_id, initiated_date, created_at, tombstoned_at`,
			req.InitiatedDate,
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

		if err := validateTransactionReferences(ctx, tx, req); err != nil {
			if errors.Is(err, services.ErrNotFound) {
				return fmt.Errorf("%w: %v", services.ErrInvalidReference, err)
			}
			return err
		}

		if _, err := tx.ExecContext(
			ctx,
			`UPDATE journal_record
SET tombstoned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE transaction_id = ? AND tombstoned_at IS NULL`,
			id,
		); err != nil {
			return fmt.Errorf("tombstone replaced journal records: %w", err)
		}

		for _, recordReq := range req.Records {
			record, err := insertJournalRecord(ctx, tx, transaction.ID, recordReq)
			if err != nil {
				return err
			}
			transaction.Records = append(transaction.Records, record)
		}

		return nil
	})
	if err != nil {
		return transactions.Transaction{}, err
	}

	return transaction, nil
}

// Get returns a transaction with nested journal records.
func (s *TransactionStore) Get(ctx context.Context, id int64) (transactions.Transaction, error) {
	transaction, err := scanTransaction(s.db.QueryRowContext(
		ctx,
		`SELECT transaction_id, initiated_date, created_at, tombstoned_at
FROM "transaction"
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
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT transaction_id, initiated_date, created_at, tombstoned_at
FROM "transaction"
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
	return WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(
			ctx,
			`UPDATE "transaction"
SET tombstoned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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
			`UPDATE journal_record
SET tombstoned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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
	jr.memo, jr.pending_date, jr.posted_date, jr.posting_status, jr.reconciliation_status, jr.source, jr.external_id, jr.external_system,
	jr.created_at, jr.updated_at, jr.tombstoned_at
FROM journal_record jr
JOIN "transaction" tx ON tx.transaction_id = jr.transaction_id
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
		query += " AND EXISTS (SELECT 1 FROM journal_record_tag jrt WHERE jrt.record_id = jr.record_id AND jrt.tag_id = ?)"
		args = append(args, *opts.TagID)
	}
	if opts.PostingStatus != nil {
		query += " AND jr.posting_status = ?"
		args = append(args, *opts.PostingStatus)
	}
	if opts.ReconciliationStatus != nil {
		query += " AND jr.reconciliation_status = ?"
		args = append(args, *opts.ReconciliationStatus)
	}
	if opts.InitiatedDateFrom != nil {
		query += " AND tx.initiated_date >= ?"
		args = append(args, *opts.InitiatedDateFrom)
	}
	if opts.InitiatedDateTo != nil {
		query += " AND tx.initiated_date <= ?"
		args = append(args, *opts.InitiatedDateTo)
	}
	if opts.PendingDateFrom != nil {
		query += " AND jr.pending_date >= ?"
		args = append(args, *opts.PendingDateFrom)
	}
	if opts.PendingDateTo != nil {
		query += " AND jr.pending_date <= ?"
		args = append(args, *opts.PendingDateTo)
	}
	if opts.PostedDateFrom != nil {
		query += " AND jr.posted_date >= ?"
		args = append(args, *opts.PostedDateFrom)
	}
	if opts.PostedDateTo != nil {
		query += " AND jr.posted_date <= ?"
		args = append(args, *opts.PostedDateTo)
	}
	if opts.MemoContains != nil {
		query += " AND jr.memo LIKE ? ESCAPE '\\'"
		args = append(args, "%"+escapeLikePattern(*opts.MemoContains)+"%")
	}
	query += " ORDER BY tx.initiated_date ASC, jr.transaction_id ASC, jr.record_id ASC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("search journal records: %w", err)
	}

	records := []transactions.JournalRecord{}
	for rows.Next() {
		record, err := scanJournalRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("scan searched journal record: %w", err)
		}
		matchesAmount, err := recordMatchesAmountRanges(record, opts)
		if err != nil {
			return nil, err
		}
		if !matchesAmount {
			continue
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

	for index := range records {
		tagIDs, err := s.tagIDsByRecordID(ctx, records[index].ID)
		if err != nil {
			return nil, err
		}
		records[index].TagIDs = tagIDs
	}

	return records, nil
}

// BulkCategorize assigns one active category to active journal records atomically.
func (s *TransactionStore) BulkCategorize(ctx context.Context, recordIDs []int64, categoryID int64) (int, error) {
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, recordIDs); err != nil {
			return err
		}
		exists, err := activeCategoryExists(ctx, tx, categoryID)
		if err != nil {
			return err
		}
		if !exists {
			return services.ErrInvalidReference
		}

		args := append([]any{categoryID}, int64Args(recordIDs)...)
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE journal_record
SET category_id = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, recordIDs); err != nil {
			return err
		}
		exists, err := activeAccountExists(ctx, tx, accountID)
		if err != nil {
			return err
		}
		if !exists {
			return services.ErrInvalidReference
		}

		args := append([]any{accountID}, int64Args(recordIDs)...)
		if _, err := tx.ExecContext(
			ctx,
			`UPDATE journal_record
SET account_id = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, recordIDs); err != nil {
			return err
		}
		if err := validateActiveTags(ctx, tx, append(append([]int64{}, addTagIDs...), removeTagIDs...)); err != nil {
			return err
		}

		for _, recordID := range recordIDs {
			for _, tagID := range addTagIDs {
				if _, err := tx.ExecContext(
					ctx,
					"INSERT OR IGNORE INTO journal_record_tag (record_id, tag_id) VALUES (?, ?)",
					recordID,
					tagID,
				); err != nil {
					return fmt.Errorf("bulk add journal record tag: %w", err)
				}
			}
		}

		if len(removeTagIDs) > 0 {
			args := append(int64Args(recordIDs), int64Args(removeTagIDs)...)
			if _, err := tx.ExecContext(
				ctx,
				`DELETE FROM journal_record_tag
WHERE record_id IN (`+placeholders(len(recordIDs))+`)
  AND tag_id IN (`+placeholders(len(removeTagIDs))+`)`,
				args...,
			); err != nil {
				return fmt.Errorf("bulk remove journal record tags: %w", err)
			}
		}

		if _, err := tx.ExecContext(
			ctx,
			`UPDATE journal_record
SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE record_id IN (`+placeholders(len(recordIDs))+`)`,
			int64Args(recordIDs)...,
		); err != nil {
			return fmt.Errorf("bulk update journal record tag timestamps: %w", err)
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
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		if err := validateActiveJournalRecords(ctx, tx, recordIDs); err != nil {
			return err
		}

		setClauses := []string{}
		args := []any{}
		if postingStatus != nil {
			setClauses = append(setClauses, "posting_status = ?")
			args = append(args, *postingStatus)
		}
		if reconciliationStatus != nil {
			setClauses = append(setClauses, "reconciliation_status = ?")
			args = append(args, *reconciliationStatus)
		}
		setClauses = append(setClauses, "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
		args = append(args, int64Args(recordIDs)...)

		if _, err := tx.ExecContext(
			ctx,
			"UPDATE journal_record SET "+strings.Join(setClauses, ", ")+" WHERE record_id IN ("+placeholders(len(recordIDs))+")",
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
	var tombstonedAt sql.NullString
	if err := scanner.Scan(
		&transaction.ID,
		&transaction.InitiatedDate,
		&transaction.CreatedAt,
		&tombstonedAt,
	); err != nil {
		return transactions.Transaction{}, err
	}
	if tombstonedAt.Valid {
		transaction.TombstonedAt = &tombstonedAt.String
	}
	transaction.Records = []transactions.JournalRecord{}

	return transaction, nil
}

func insertJournalRecord(ctx context.Context, tx *sql.Tx, transactionID int64, req transactions.JournalRecordInput) (transactions.JournalRecord, error) {
	row := tx.QueryRowContext(
		ctx,
		`INSERT INTO journal_record (
	transaction_id, account_id, member_id, currency, amount, amount_usd, category_id, memo,
	pending_date, posted_date, posting_status, reconciliation_status, source, external_id, external_system
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING record_id, transaction_id, account_id, member_id, currency, amount, amount_usd, category_id,
	memo, pending_date, posted_date, posting_status, reconciliation_status, source, external_id, external_system,
	created_at, updated_at, tombstoned_at`,
		transactionID,
		req.AccountID,
		req.MemberID,
		req.Currency,
		req.Amount,
		req.AmountUSD,
		req.CategoryID,
		req.Memo,
		req.PendingDate,
		req.PostedDate,
		req.PostingStatus,
		req.ReconciliationStatus,
		req.Source,
		req.ExternalID,
		req.ExternalSystem,
	)

	record, err := scanJournalRecord(row)
	if err != nil {
		return transactions.JournalRecord{}, fmt.Errorf("insert journal record: %w", err)
	}
	for _, tagID := range req.TagIDs {
		if _, err := tx.ExecContext(
			ctx,
			"INSERT INTO journal_record_tag (record_id, tag_id) VALUES (?, ?)",
			record.ID,
			tagID,
		); err != nil {
			return transactions.JournalRecord{}, fmt.Errorf("insert journal record tag: %w", err)
		}
	}
	record.TagIDs = append([]int64{}, req.TagIDs...)

	return record, nil
}

type journalRecordScanner interface {
	Scan(dest ...any) error
}

func scanJournalRecord(scanner journalRecordScanner) (transactions.JournalRecord, error) {
	var record transactions.JournalRecord
	var memberID sql.NullInt64
	var memo sql.NullString
	var pendingDate sql.NullString
	var postedDate sql.NullString
	var externalID sql.NullString
	var externalSystem sql.NullString
	var tombstonedAt sql.NullString
	if err := scanner.Scan(
		&record.ID,
		&record.TransactionID,
		&record.AccountID,
		&memberID,
		&record.Currency,
		&record.Amount,
		&record.AmountUSD,
		&record.CategoryID,
		&memo,
		&pendingDate,
		&postedDate,
		&record.PostingStatus,
		&record.ReconciliationStatus,
		&record.Source,
		&externalID,
		&externalSystem,
		&record.CreatedAt,
		&record.UpdatedAt,
		&tombstonedAt,
	); err != nil {
		return transactions.JournalRecord{}, err
	}
	if memberID.Valid {
		record.MemberID = &memberID.Int64
	}
	if memo.Valid {
		record.Memo = &memo.String
	}
	if pendingDate.Valid {
		record.PendingDate = &pendingDate.String
	}
	if postedDate.Valid {
		record.PostedDate = &postedDate.String
	}
	if externalID.Valid {
		record.ExternalID = &externalID.String
	}
	if externalSystem.Valid {
		record.ExternalSystem = &externalSystem.String
	}
	if tombstonedAt.Valid {
		record.TombstonedAt = &tombstonedAt.String
	}
	record.TagIDs = []int64{}

	return record, nil
}

func (s *TransactionStore) recordsByTransactionIDs(ctx context.Context, transactionIDs []int64) (map[int64][]transactions.JournalRecord, error) {
	recordsByTransactionID := map[int64][]transactions.JournalRecord{}
	for _, id := range transactionIDs {
		recordsByTransactionID[id] = []transactions.JournalRecord{}
	}
	if len(transactionIDs) == 0 {
		return recordsByTransactionID, nil
	}

	for _, transactionID := range transactionIDs {
		rows, err := s.db.QueryContext(
			ctx,
			`SELECT record_id, transaction_id, account_id, member_id, currency, amount, amount_usd, category_id,
	memo, pending_date, posted_date, posting_status, reconciliation_status, source, external_id, external_system,
	created_at, updated_at, tombstoned_at
FROM journal_record
WHERE transaction_id = ? AND tombstoned_at IS NULL
ORDER BY record_id ASC`,
			transactionID,
		)
		if err != nil {
			return nil, fmt.Errorf("list journal records: %w", err)
		}

		transactionRecords := []transactions.JournalRecord{}
		for rows.Next() {
			record, err := scanJournalRecord(rows)
			if err != nil {
				return nil, fmt.Errorf("scan journal record: %w", err)
			}
			transactionRecords = append(transactionRecords, record)
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

		for index := range transactionRecords {
			tagIDs, err := s.tagIDsByRecordID(ctx, transactionRecords[index].ID)
			if err != nil {
				return nil, err
			}
			transactionRecords[index].TagIDs = tagIDs
		}
		recordsByTransactionID[transactionID] = transactionRecords
	}

	return recordsByTransactionID, nil
}

func (s *TransactionStore) tagIDsByRecordID(ctx context.Context, recordID int64) ([]int64, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT tag_id
FROM journal_record_tag
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

func validateTransactionReferences(ctx context.Context, tx *sql.Tx, req transactions.CreateInput) error {
	for _, record := range req.Records {
		exists, err := activeAccountExists(ctx, tx, record.AccountID)
		if err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("%w: active account not found", services.ErrNotFound)
		}

		exists, err = activeCategoryExists(ctx, tx, record.CategoryID)
		if err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("%w: active category not found", services.ErrNotFound)
		}

		if record.MemberID != nil {
			exists, err = activeMemberExists(ctx, tx, *record.MemberID)
			if err != nil {
				return err
			}
			if !exists {
				return fmt.Errorf("%w: active member not found", services.ErrNotFound)
			}
		}

		for _, tagID := range record.TagIDs {
			exists, err = activeTagExists(ctx, tx, tagID)
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

func validateActiveJournalRecords(ctx context.Context, queryer rowQuerier, recordIDs []int64) error {
	if len(recordIDs) == 0 {
		return services.ErrInvalidReference
	}

	var count int
	err := queryer.QueryRowContext(
		ctx,
		`SELECT COUNT(DISTINCT jr.record_id)
FROM journal_record jr
JOIN "transaction" tr ON tr.transaction_id = jr.transaction_id
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

func validateActiveTags(ctx context.Context, queryer rowQuerier, tagIDs []int64) error {
	if len(tagIDs) == 0 {
		return nil
	}

	var count int
	err := queryer.QueryRowContext(
		ctx,
		`SELECT COUNT(DISTINCT tag_id)
FROM tag
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

func activeCategoryExists(ctx context.Context, queryer rowQuerier, categoryID int64) (bool, error) {
	var id int64
	err := queryer.QueryRowContext(
		ctx,
		"SELECT category_id FROM category WHERE category_id = ? AND tombstoned_at IS NULL LIMIT 1",
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

func activeMemberExists(ctx context.Context, queryer rowQuerier, memberID int64) (bool, error) {
	var id int64
	err := queryer.QueryRowContext(
		ctx,
		"SELECT member_id FROM member WHERE member_id = ? AND tombstoned_at IS NULL LIMIT 1",
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

func activeTagExists(ctx context.Context, queryer rowQuerier, tagID int64) (bool, error) {
	var id int64
	err := queryer.QueryRowContext(
		ctx,
		"SELECT tag_id FROM tag WHERE tag_id = ? AND tombstoned_at IS NULL LIMIT 1",
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

func escapeLikePattern(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `%`, `\%`)
	value = strings.ReplaceAll(value, `_`, `\_`)

	return value
}

func recordMatchesAmountRanges(record transactions.JournalRecord, opts transactions.RecordSearchOptions) (bool, error) {
	matches, err := decimalStringInRange(record.Amount, opts.AmountMin, opts.AmountMax)
	if err != nil || !matches {
		return matches, err
	}

	return decimalStringInRange(record.AmountUSD, opts.AmountUSDMin, opts.AmountUSDMax)
}

func decimalStringInRange(value string, minValue *string, maxValue *string) (bool, error) {
	decimal, ok := new(big.Rat).SetString(value)
	if !ok {
		return false, fmt.Errorf("parse stored decimal %q", value)
	}
	if minValue != nil {
		minDecimal, ok := new(big.Rat).SetString(*minValue)
		if !ok {
			return false, fmt.Errorf("parse decimal filter %q", *minValue)
		}
		if decimal.Cmp(minDecimal) < 0 {
			return false, nil
		}
	}
	if maxValue != nil {
		maxDecimal, ok := new(big.Rat).SetString(*maxValue)
		if !ok {
			return false, fmt.Errorf("parse decimal filter %q", *maxValue)
		}
		if decimal.Cmp(maxDecimal) > 0 {
			return false, nil
		}
	}

	return true, nil
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

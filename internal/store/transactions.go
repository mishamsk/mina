package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"mina.local/mina/internal/models"
)

// TransactionStore persists transactions and journal records.
type TransactionStore struct {
	db *sql.DB
}

// NewTransactionStore creates a transaction store using db.
func NewTransactionStore(db *sql.DB) *TransactionStore {
	return &TransactionStore{db: db}
}

// Create persists a transaction and all journal records atomically.
func (s *TransactionStore) Create(ctx context.Context, req models.CreateTransactionRequest) (models.Transaction, error) {
	var transaction models.Transaction
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
		return models.Transaction{}, err
	}

	return transaction, nil
}

// Get returns a transaction with nested journal records.
func (s *TransactionStore) Get(ctx context.Context, id int64) (models.Transaction, error) {
	transaction, err := scanTransaction(s.db.QueryRowContext(
		ctx,
		`SELECT transaction_id, initiated_date, created_at, tombstoned_at
FROM "transaction"
WHERE transaction_id = ? AND tombstoned_at IS NULL`,
		id,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return models.Transaction{}, ErrNotFound
	}
	if err != nil {
		return models.Transaction{}, fmt.Errorf("get transaction: %w", err)
	}

	records, err := s.recordsByTransactionIDs(ctx, []int64{id})
	if err != nil {
		return models.Transaction{}, err
	}
	transaction.Records = records[id]

	return transaction, nil
}

// List returns transactions with nested journal records in deterministic date order.
func (s *TransactionStore) List(ctx context.Context) ([]models.Transaction, error) {
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

	transactions := []models.Transaction{}
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

type transactionScanner interface {
	Scan(dest ...any) error
}

func scanTransaction(scanner transactionScanner) (models.Transaction, error) {
	var transaction models.Transaction
	var tombstonedAt sql.NullString
	if err := scanner.Scan(
		&transaction.ID,
		&transaction.InitiatedDate,
		&transaction.CreatedAt,
		&tombstonedAt,
	); err != nil {
		return models.Transaction{}, err
	}
	if tombstonedAt.Valid {
		transaction.TombstonedAt = &tombstonedAt.String
	}
	transaction.Records = []models.JournalRecord{}

	return transaction, nil
}

func insertJournalRecord(ctx context.Context, tx *sql.Tx, transactionID int64, req models.CreateJournalRecordRequest) (models.JournalRecord, error) {
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
		return models.JournalRecord{}, fmt.Errorf("insert journal record: %w", err)
	}
	for _, tagID := range req.TagIDs {
		if _, err := tx.ExecContext(
			ctx,
			"INSERT INTO journal_record_tag (record_id, tag_id) VALUES (?, ?)",
			record.ID,
			tagID,
		); err != nil {
			return models.JournalRecord{}, fmt.Errorf("insert journal record tag: %w", err)
		}
	}
	record.TagIDs = append([]int64{}, req.TagIDs...)

	return record, nil
}

type journalRecordScanner interface {
	Scan(dest ...any) error
}

func scanJournalRecord(scanner journalRecordScanner) (models.JournalRecord, error) {
	var record models.JournalRecord
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
		return models.JournalRecord{}, err
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

func (s *TransactionStore) recordsByTransactionIDs(ctx context.Context, transactionIDs []int64) (map[int64][]models.JournalRecord, error) {
	recordsByTransactionID := map[int64][]models.JournalRecord{}
	for _, id := range transactionIDs {
		recordsByTransactionID[id] = []models.JournalRecord{}
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

		transactionRecords := []models.JournalRecord{}
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

func validateTransactionReferences(ctx context.Context, tx *sql.Tx, req models.CreateTransactionRequest) error {
	for _, record := range req.Records {
		exists, err := activeAccountExists(ctx, tx, record.AccountID)
		if err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("%w: active account not found", ErrNotFound)
		}

		exists, err = activeCategoryExists(ctx, tx, record.CategoryID)
		if err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("%w: active category not found", ErrNotFound)
		}

		if record.MemberID != nil {
			exists, err = activeMemberExists(ctx, tx, *record.MemberID)
			if err != nil {
				return err
			}
			if !exists {
				return fmt.Errorf("%w: active member not found", ErrNotFound)
			}
		}

		for _, tagID := range record.TagIDs {
			exists, err = activeTagExists(ctx, tx, tagID)
			if err != nil {
				return err
			}
			if !exists {
				return fmt.Errorf("%w: active tag not found", ErrNotFound)
			}
		}
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

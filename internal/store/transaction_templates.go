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
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/transactiontemplates"
)

// TransactionTemplateStore persists transaction templates and their record defaults.
type TransactionTemplateStore struct {
	db *AppDB
}

var _ transactiontemplates.Repository = (*TransactionTemplateStore)(nil)

// NewTransactionTemplateStore creates a transaction-template store using AppDB.
func NewTransactionTemplateStore(db *AppDB) *TransactionTemplateStore {
	return &TransactionTemplateStore{db: db}
}

// Create persists a transaction template and all record defaults atomically.
func (s *TransactionTemplateStore) Create(ctx context.Context, input transactiontemplates.WriteInput) (transactiontemplates.Template, error) {
	var template transactiontemplates.Template
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.db.accountingName("transaction_template")+` (fqn)
VALUES (?)
RETURNING transaction_template_id, fqn, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
			input.FQN,
		)
		created, scanErr := scanTransactionTemplate(row)
		if scanErr != nil {
			if isUniqueConstraintError(scanErr) {
				return fmt.Errorf("%w: active transaction template fqn already exists", services.ErrConflict)
			}
			return fmt.Errorf("insert transaction template: %w", scanErr)
		}
		template = created

		for _, record := range input.Records {
			if err := insertTransactionTemplateRecord(ctx, tx, s.db, template.ID, record); err != nil {
				return err
			}
		}
		records, err := transactionTemplateRecordsByTemplateIDs(ctx, tx, s.db, []int64{template.ID})
		if err != nil {
			return err
		}
		template.Records = records[template.ID]

		return nil
	})
	if err != nil {
		return transactiontemplates.Template{}, err
	}

	return template, nil
}

// Get returns an active transaction template with nested active record defaults.
func (s *TransactionTemplateStore) Get(ctx context.Context, id int64) (transactiontemplates.Template, error) {
	template, err := scanTransactionTemplate(s.db.query().QueryRowContext(
		ctx,
		`SELECT transaction_template_id, fqn, parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM `+s.db.accountingName("transaction_template")+`
WHERE transaction_template_id = ? AND tombstoned_at IS NULL`,
		id,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return transactiontemplates.Template{}, services.ErrNotFound
	}
	if err != nil {
		return transactiontemplates.Template{}, fmt.Errorf("get transaction template: %w", err)
	}

	records, err := s.recordsByTemplateIDs(ctx, []int64{id})
	if err != nil {
		return transactiontemplates.Template{}, err
	}
	template.Records = records[id]

	return template, nil
}

// List returns active transaction templates with nested active record defaults.
func (s *TransactionTemplateStore) List(ctx context.Context, opts services.ListOptions) (services.PaginatedList[transactiontemplates.Template], error) {
	filterQuery := `FROM ` + s.db.accountingName("transaction_template") + `
WHERE tombstoned_at IS NULL`
	args := []any{}
	totalCount, err := countMatchingRows(ctx, s.db.query(), "SELECT COUNT(*) "+filterQuery, args, "transaction templates", opts.IncludeTotalCount)
	if err != nil {
		return services.PaginatedList[transactiontemplates.Template]{}, err
	}

	query := `SELECT transaction_template_id, fqn, parent_fqn, name, level, created_at, updated_at, tombstoned_at
` + filterQuery
	query, args = appendServiceListOrderAndPage(query, args, opts, transactionTemplateSortColumns, services.SortKeyFQN, "transaction_template_id")

	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return services.PaginatedList[transactiontemplates.Template]{}, fmt.Errorf("list transaction templates: %w", err)
	}

	templates := []transactiontemplates.Template{}
	templateIDs := []int64{}
	for rows.Next() {
		template, err := scanTransactionTemplate(rows)
		if err != nil {
			return services.PaginatedList[transactiontemplates.Template]{}, fmt.Errorf("scan transaction template: %w", err)
		}
		templates = append(templates, template)
		templateIDs = append(templateIDs, template.ID)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return services.PaginatedList[transactiontemplates.Template]{}, fmt.Errorf("iterate transaction templates: %w; close transaction template rows: %w", err, closeErr)
		}
		return services.PaginatedList[transactiontemplates.Template]{}, fmt.Errorf("iterate transaction templates: %w", err)
	}
	if err := rows.Close(); err != nil {
		return services.PaginatedList[transactiontemplates.Template]{}, fmt.Errorf("close transaction template rows: %w", err)
	}

	records, err := s.recordsByTemplateIDs(ctx, templateIDs)
	if err != nil {
		return services.PaginatedList[transactiontemplates.Template]{}, err
	}
	for index := range templates {
		templates[index].Records = records[templates[index].ID]
	}

	return services.PaginatedList[transactiontemplates.Template]{
		Items:      templates,
		TotalCount: totalCount,
	}, nil
}

// ListActiveFQNs returns active template IDs and FQNs in deterministic FQN order.
func (s *TransactionTemplateStore) ListActiveFQNs(ctx context.Context) ([]transactiontemplates.ActiveFQN, error) {
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT transaction_template_id, fqn
FROM `+s.db.accountingName("transaction_template")+`
WHERE tombstoned_at IS NULL
ORDER BY fqn ASC, transaction_template_id ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list active transaction template fqns: %w", err)
	}

	refs := []transactiontemplates.ActiveFQN{}
	for rows.Next() {
		var ref transactiontemplates.ActiveFQN
		if err := rows.Scan(&ref.ID, &ref.FQN); err != nil {
			return nil, fmt.Errorf("scan active transaction template fqn: %w", err)
		}
		refs = append(refs, ref)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate active transaction template fqns: %w; close active transaction template fqn rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate active transaction template fqns: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close active transaction template fqn rows: %w", err)
	}

	return refs, nil
}

// Replace atomically replaces a transaction template's metadata and active record defaults.
func (s *TransactionTemplateStore) Replace(ctx context.Context, id int64, input transactiontemplates.WriteInput) (transactiontemplates.Template, error) {
	var template transactiontemplates.Template
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		active, err := activeTransactionTemplateExists(ctx, tx, s.db, id)
		if err != nil {
			return err
		}
		if !active {
			return services.ErrNotFound
		}

		row := tx.QueryRowContext(
			ctx,
			`UPDATE `+s.db.accountingName("transaction_template")+`
SET fqn = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE transaction_template_id = ? AND tombstoned_at IS NULL
RETURNING transaction_template_id, fqn, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
			input.FQN,
			id,
		)
		replaced, scanErr := scanTransactionTemplate(row)
		if errors.Is(scanErr, sql.ErrNoRows) {
			return services.ErrNotFound
		}
		if scanErr != nil {
			if isUniqueConstraintError(scanErr) {
				return fmt.Errorf("%w: active transaction template fqn already exists", services.ErrConflict)
			}
			return fmt.Errorf("update transaction template: %w", scanErr)
		}
		template = replaced

		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("transaction_template_record")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE transaction_template_id = ? AND tombstoned_at IS NULL`,
			id,
		); err != nil {
			return fmt.Errorf("tombstone replaced transaction template records: %w", err)
		}

		for _, record := range input.Records {
			if err := insertTransactionTemplateRecord(ctx, tx, s.db, template.ID, record); err != nil {
				return err
			}
		}
		records, err := transactionTemplateRecordsByTemplateIDs(ctx, tx, s.db, []int64{template.ID})
		if err != nil {
			return err
		}
		template.Records = records[template.ID]

		return nil
	})
	if err != nil {
		return transactiontemplates.Template{}, err
	}

	return template, nil
}

// Tombstone marks a transaction template and its active record defaults deleted.
func (s *TransactionTemplateStore) Tombstone(ctx context.Context, id int64) error {
	return s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("transaction_template")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE transaction_template_id = ? AND tombstoned_at IS NULL`,
			id,
		)
		if err != nil {
			return fmt.Errorf("tombstone transaction template: %w", err)
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
			`UPDATE `+s.db.accountingName("transaction_template_record")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE transaction_template_id = ? AND tombstoned_at IS NULL`,
			id,
		); err != nil {
			return fmt.Errorf("tombstone transaction template records: %w", err)
		}

		return nil
	})
}

type transactionTemplateScanner interface {
	Scan(dest ...any) error
}

func scanTransactionTemplate(scanner transactionTemplateScanner) (transactiontemplates.Template, error) {
	var template transactiontemplates.Template
	var parentFQN sql.NullString
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&template.ID,
		&template.FQN,
		&parentFQN,
		&template.Name,
		&template.Level,
		&createdAt,
		&updatedAt,
		&tombstonedAt,
	); err != nil {
		return transactiontemplates.Template{}, err
	}
	if parentFQN.Valid {
		template.ParentFQN = &parentFQN.String
	}
	template.CreatedAt = createdAt.UTC()
	template.UpdatedAt = updatedAt.UTC()
	template.TombstonedAt = nullableTimeFromSQL(tombstonedAt)
	template.Records = []transactiontemplates.TemplateRecord{}

	return template, nil
}

func insertTransactionTemplateRecord(
	ctx context.Context,
	tx *sql.Tx,
	db *AppDB,
	templateID int64,
	record transactiontemplates.TemplateRecordInput,
) error {
	tagListExpr, tagListArgs := tagListExpression(record.TagIDs)
	args := []any{
		templateID,
		record.CategoryID,
		record.AccountID,
		record.MemberID,
		record.Currency,
		nullableDecimalArg(record.Amount),
	}
	args = append(args, tagListArgs...)
	args = append(args,
		record.Memo,
		nullableEnumValue(record.PostingStatus),
		nullableEnumValue(record.ReconciliationStatus),
	)

	if _, err := tx.ExecContext(
		ctx,
		`INSERT INTO `+db.accountingName("transaction_template_record")+` (
	transaction_template_id, category_id, account_id, member_id, currency, amount, tag_ids, memo, posting_status, reconciliation_status
)
VALUES (?, ?, ?, ?, ?, ?, `+tagListExpr+`, ?, CAST(? AS `+db.accountingName("posting_status")+`), CAST(? AS `+db.accountingName("reconciliation_status")+`))`,
		args...,
	); err != nil {
		return fmt.Errorf("insert transaction template record: %w", err)
	}

	return nil
}

type transactionTemplateRecordScanner interface {
	Scan(dest ...any) error
}

func scanTransactionTemplateRecord(scanner transactionTemplateRecordScanner) (transactiontemplates.TemplateRecord, error) {
	var record transactiontemplates.TemplateRecord
	var accountID sql.NullInt64
	var memberID sql.NullInt64
	var currency sql.NullString
	var amount sql.Null[duckdb.Decimal]
	var tagIDs []any
	var memo sql.NullString
	var postingStatus sql.NullString
	var reconciliationStatus sql.NullString
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&record.ID,
		&record.TemplateID,
		&record.CategoryID,
		&accountID,
		&memberID,
		&currency,
		&amount,
		&tagIDs,
		&memo,
		&postingStatus,
		&reconciliationStatus,
		&createdAt,
		&updatedAt,
		&tombstonedAt,
	); err != nil {
		return transactiontemplates.TemplateRecord{}, err
	}
	if accountID.Valid {
		record.AccountID = &accountID.Int64
	}
	if memberID.Valid {
		record.MemberID = &memberID.Int64
	}
	if currency.Valid {
		record.Currency = &currency.String
	}
	if amount.Valid {
		parsed, err := decimalFromDuckDB(amount.V)
		if err != nil {
			return transactiontemplates.TemplateRecord{}, fmt.Errorf("scan transaction template record amount: %w", err)
		}
		record.Amount = &parsed
	}
	parsedTagIDs, err := int64ListFromDuckDB(tagIDs)
	if err != nil {
		return transactiontemplates.TemplateRecord{}, fmt.Errorf("scan transaction template record tag_ids: %w", err)
	}
	slices.Sort(parsedTagIDs)
	record.TagIDs = parsedTagIDs
	if memo.Valid {
		record.Memo = &memo.String
	}
	if postingStatus.Valid {
		status := transactions.PostingStatus(strings.ToLower(postingStatus.String))
		record.PostingStatus = &status
	}
	if reconciliationStatus.Valid {
		status := transactions.ReconciliationStatus(strings.ToLower(reconciliationStatus.String))
		record.ReconciliationStatus = &status
	}
	record.CreatedAt = createdAt.UTC()
	record.UpdatedAt = updatedAt.UTC()
	record.TombstonedAt = nullableTimeFromSQL(tombstonedAt)

	return record, nil
}

func transactionTemplateRecordsByTemplateIDs(
	ctx context.Context,
	queryer rowsQuerier,
	db *AppDB,
	templateIDs []int64,
) (map[int64][]transactiontemplates.TemplateRecord, error) {
	recordsByTemplateID := map[int64][]transactiontemplates.TemplateRecord{}
	for _, id := range templateIDs {
		recordsByTemplateID[id] = []transactiontemplates.TemplateRecord{}
	}
	if len(templateIDs) == 0 {
		return recordsByTemplateID, nil
	}

	rows, err := queryer.QueryContext(
		ctx,
		`SELECT transaction_template_record_id, transaction_template_id, category_id, account_id, member_id, currency, amount,
	tag_ids, memo, posting_status, reconciliation_status, created_at, updated_at, tombstoned_at
FROM `+db.accountingName("transaction_template_record")+`
WHERE transaction_template_id IN (`+placeholders(len(templateIDs))+`) AND tombstoned_at IS NULL
ORDER BY transaction_template_id ASC, transaction_template_record_id ASC`,
		int64Args(templateIDs)...,
	)
	if err != nil {
		return nil, fmt.Errorf("list transaction template records: %w", err)
	}

	for rows.Next() {
		record, err := scanTransactionTemplateRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("scan transaction template record: %w", err)
		}
		recordsByTemplateID[record.TemplateID] = append(recordsByTemplateID[record.TemplateID], record)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate transaction template records: %w; close transaction template record rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate transaction template records: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close transaction template record rows: %w", err)
	}

	return recordsByTemplateID, nil
}

func (s *TransactionTemplateStore) recordsByTemplateIDs(ctx context.Context, templateIDs []int64) (map[int64][]transactiontemplates.TemplateRecord, error) {
	return transactionTemplateRecordsByTemplateIDs(ctx, s.db.query(), s.db, templateIDs)
}

func activeTransactionTemplateExists(ctx context.Context, queryer rowQuerier, db *AppDB, id int64) (bool, error) {
	var foundID int64
	err := queryer.QueryRowContext(
		ctx,
		"SELECT transaction_template_id FROM "+db.accountingName("transaction_template")+" WHERE transaction_template_id = ? AND tombstoned_at IS NULL LIMIT 1",
		id,
	).Scan(&foundID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check active transaction template: %w", err)
	}

	return true, nil
}

func nullableEnumValue[T ~string](value *T) any {
	if value == nil {
		return nil
	}

	return enumValue(*value)
}

var transactionTemplateSortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt: {"created_at"},
	services.SortKeyFQN:       {"fqn"},
	services.SortKeyUpdatedAt: {"updated_at"},
}

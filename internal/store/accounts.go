package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
)

// AccountStore persists accounts.
type AccountStore struct {
	db *AppDB
}

var _ accounts.Repository = (*AccountStore)(nil)

// NewAccountStore creates an account store using AppDB.
func NewAccountStore(db *AppDB) *AccountStore {
	return &AccountStore{db: db}
}

// Create persists a new account.
func (s *AccountStore) Create(ctx context.Context, input accounts.CreateInput) (accounts.Account, error) {
	var account accounts.Account
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		exists, err := accountFQNExists(ctx, tx, s.db, input.FQN)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active account fqn already exists", services.ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.db.accountingName("account")+` (fqn, account_type, is_hidden, is_featured, currency, external_id, external_system)
VALUES (?, ?, ?, ?, ?, ?, ?)
RETURNING account_id, fqn, account_type, is_hidden, is_featured, currency, external_id, external_system, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
			input.FQN,
			enumValue(input.AccountType),
			input.IsHidden,
			input.IsFeatured,
			input.Currency,
			input.ExternalID,
			input.ExternalSystem,
		)
		account, err = scanAccount(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active account fqn already exists", services.ErrConflict)
			}
			return fmt.Errorf("insert account: %w", err)
		}

		return nil
	})
	if err != nil {
		return accounts.Account{}, err
	}

	return account, nil
}

// Get returns an account by ID.
func (s *AccountStore) Get(ctx context.Context, id int64, includeTombstoned bool) (accounts.Account, error) {
	query := `SELECT account_id, fqn, account_type, is_hidden, is_featured, currency, external_id, external_system, parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM ` + s.db.accountingName("account") + `
WHERE account_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	account, err := scanAccount(s.db.query().QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return accounts.Account{}, services.ErrNotFound
	}
	if err != nil {
		return accounts.Account{}, fmt.Errorf("get account: %w", err)
	}

	return account, nil
}

// List returns accounts in deterministic hierarchy order.
func (s *AccountStore) List(ctx context.Context, opts accounts.ListOptions) ([]accounts.Account, error) {
	query := `SELECT account_id, fqn, account_type, is_hidden, is_featured, currency, external_id, external_system, parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM ` + s.db.accountingName("account") + `
WHERE 1 = 1`
	args := []any{}
	if !opts.IncludeHidden {
		query += " AND is_hidden = 0"
	}
	if !opts.IncludeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}
	if opts.AccountType != nil {
		query += " AND account_type = CAST(? AS " + s.db.accountingName("account_type") + ")"
		args = append(args, enumValue(*opts.AccountType))
	}
	if opts.IsFeatured != nil {
		query += " AND is_featured = ?"
		args = append(args, *opts.IsFeatured)
	}
	query, args = appendServiceListOrderAndPage(query, args, opts.List, accountSortColumns, services.SortKeyFQN, "account_id")

	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list accounts: %w", err)
	}

	accounts := []accounts.Account{}
	for rows.Next() {
		account, err := scanAccount(rows)
		if err != nil {
			return nil, fmt.Errorf("scan account: %w", err)
		}
		accounts = append(accounts, account)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate accounts: %w; close accounts rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate accounts: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close accounts rows: %w", err)
	}

	return accounts, nil
}

// UpdateMutable updates account mutable metadata and external identifiers.
func (s *AccountStore) UpdateMutable(ctx context.Context, id int64, input accounts.UpdateInput) (accounts.Account, error) {
	setClauses := []string{}
	args := []any{}
	partialExternalIdentifierUpdate := input.ExternalID.Specified != input.ExternalSystem.Specified
	if input.IsHidden != nil {
		setClauses = append(setClauses, "is_hidden = ?")
		args = append(args, *input.IsHidden)
	}
	if input.IsFeatured != nil {
		setClauses = append(setClauses, "is_featured = ?")
		args = append(args, *input.IsFeatured)
	}
	if input.ExternalID.Specified {
		setClauses = append(setClauses, "external_id = ?")
		args = append(args, input.ExternalID.Value)
	}
	if input.ExternalSystem.Specified {
		setClauses = append(setClauses, "external_system = ?")
		args = append(args, input.ExternalSystem.Value)
	}
	setClauses = append(setClauses, "updated_at = CURRENT_TIMESTAMP")
	args = append(args, id)

	query := `UPDATE ` + s.db.accountingName("account") + `
SET ` + strings.Join(setClauses, ",\n    ") + `
WHERE account_id = ? AND tombstoned_at IS NULL`
	if input.ExternalID.Specified && !input.ExternalSystem.Specified {
		query += " AND external_system IS NOT NULL"
	}
	if input.ExternalSystem.Specified && !input.ExternalID.Specified {
		query += " AND external_id IS NOT NULL"
	}
	query += `
RETURNING account_id, fqn, account_type, is_hidden, is_featured, currency, external_id, external_system, parent_fqn, name, level, created_at, updated_at, tombstoned_at`

	row := s.db.query().QueryRowContext(ctx, query, args...)
	account, err := scanAccount(row)
	if errors.Is(err, sql.ErrNoRows) {
		if partialExternalIdentifierUpdate {
			exists, existsErr := activeAccountIDExists(ctx, s.db.query(), s.db, id)
			if existsErr != nil {
				return accounts.Account{}, existsErr
			}
			if exists {
				return accounts.Account{}, services.ErrConflict
			}
		}
		return accounts.Account{}, services.ErrNotFound
	}
	if err != nil {
		return accounts.Account{}, fmt.Errorf("update account mutable fields: %w", err)
	}

	return account, nil
}

// Tombstone marks an account deleted without removing its historical row.
func (s *AccountStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.query().ExecContext(
		ctx,
		`UPDATE `+s.db.accountingName("account")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE account_id = ? AND tombstoned_at IS NULL`,
		id,
	)
	if err != nil {
		return fmt.Errorf("tombstone account: %w", err)
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

type accountScanner interface {
	Scan(dest ...any) error
}

func scanAccount(scanner accountScanner) (accounts.Account, error) {
	var account accounts.Account
	var accountType string
	var currency sql.NullString
	var externalID sql.NullString
	var externalSystem sql.NullString
	var parentFQN sql.NullString
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&account.ID,
		&account.FQN,
		&accountType,
		&account.IsHidden,
		&account.IsFeatured,
		&currency,
		&externalID,
		&externalSystem,
		&parentFQN,
		&account.Name,
		&account.Level,
		&createdAt,
		&updatedAt,
		&tombstonedAt,
	); err != nil {
		return accounts.Account{}, err
	}
	account.AccountType = accounts.AccountType(strings.ToLower(accountType))
	account.CreatedAt = createdAt.UTC()
	account.UpdatedAt = updatedAt.UTC()
	if currency.Valid {
		account.Currency = &currency.String
	}
	if externalID.Valid {
		account.ExternalID = &externalID.String
	}
	if externalSystem.Valid {
		account.ExternalSystem = &externalSystem.String
	}
	if parentFQN.Valid {
		account.ParentFQN = &parentFQN.String
	}
	account.TombstonedAt = nullableTimeFromSQL(tombstonedAt)

	return account, nil
}

func accountFQNExists(ctx context.Context, tx *sql.Tx, db *AppDB, fqn string) (bool, error) {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		"SELECT account_id FROM "+db.accountingName("account")+" WHERE fqn = ? AND tombstoned_at IS NULL LIMIT 1",
		fqn,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check account fqn: %w", err)
	}

	return true, nil
}

func activeAccountIDExists(ctx context.Context, queryer sqlQueryer, db *AppDB, id int64) (bool, error) {
	var foundID int64
	err := queryer.QueryRowContext(
		ctx,
		"SELECT account_id FROM "+db.accountingName("account")+" WHERE account_id = ? AND tombstoned_at IS NULL LIMIT 1",
		id,
	).Scan(&foundID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check account id: %w", err)
	}

	return true, nil
}

var accountSortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt: {"created_at"},
	services.SortKeyFQN:       {"fqn"},
	services.SortKeyUpdatedAt: {"updated_at"},
}

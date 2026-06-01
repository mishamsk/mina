package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/accounts"
)

// AccountStore persists accounts.
type AccountStore struct {
	accounting *AccountingDB
}

var _ accounts.Repository = (*AccountStore)(nil)

// NewAccountStore creates an account store using accounting.
func NewAccountStore(accounting *AccountingDB) *AccountStore {
	return &AccountStore{accounting: accounting}
}

// Create persists a new account.
func (s *AccountStore) Create(ctx context.Context, input accounts.CreateInput) (accounts.Account, error) {
	var account accounts.Account
	err := s.accounting.withTx(ctx, nil, func(tx *sql.Tx) error {
		exists, err := accountFQNExists(ctx, tx, s.accounting, input.FQN)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active account fqn already exists", services.ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.accounting.location.mustQualifiedName("account")+` (fqn, is_hidden, currency, external_id, external_system)
VALUES (?, ?, ?, ?, ?)
RETURNING account_id, fqn, kind, is_hidden, currency, external_id, external_system, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
			input.FQN,
			input.IsHidden,
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
	query := `SELECT account_id, fqn, kind, is_hidden, currency, external_id, external_system, parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM ` + s.accounting.location.mustQualifiedName("account") + `
WHERE account_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	account, err := scanAccount(s.accounting.query().QueryRowContext(ctx, query, args...))
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
	query := `SELECT account_id, fqn, kind, is_hidden, currency, external_id, external_system, parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM ` + s.accounting.location.mustQualifiedName("account") + `
WHERE 1 = 1`
	args := []any{}
	if !opts.IncludeHidden {
		query += " AND is_hidden = 0"
	}
	if !opts.IncludeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}
	query, args = appendServiceListOrderAndPage(query, args, opts.List, accountSortColumns, services.SortKeyFQN, "account_id")

	rows, err := s.accounting.query().QueryContext(ctx, query, args...)
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

// UpdateMutable updates account hidden state and external identifiers.
func (s *AccountStore) UpdateMutable(ctx context.Context, id int64, input accounts.UpdateInput) (accounts.Account, error) {
	row := s.accounting.query().QueryRowContext(
		ctx,
		`UPDATE `+s.accounting.location.mustQualifiedName("account")+`
SET is_hidden = ?,
    external_id = ?,
    external_system = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE account_id = ? AND tombstoned_at IS NULL
RETURNING account_id, fqn, kind, is_hidden, currency, external_id, external_system, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
		*input.IsHidden,
		input.ExternalID,
		input.ExternalSystem,
		id,
	)
	account, err := scanAccount(row)
	if errors.Is(err, sql.ErrNoRows) {
		return accounts.Account{}, services.ErrNotFound
	}
	if err != nil {
		return accounts.Account{}, fmt.Errorf("update account mutable fields: %w", err)
	}

	return account, nil
}

// Tombstone marks an account deleted without removing its historical row.
func (s *AccountStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.accounting.query().ExecContext(
		ctx,
		`UPDATE `+s.accounting.location.mustQualifiedName("account")+`
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
		&account.Kind,
		&account.IsHidden,
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

func accountFQNExists(ctx context.Context, tx *sql.Tx, accounting *AccountingDB, fqn string) (bool, error) {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		"SELECT account_id FROM "+accounting.location.mustQualifiedName("account")+" WHERE fqn = ? AND tombstoned_at IS NULL LIMIT 1",
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

var accountSortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt: {"created_at"},
	services.SortKeyFQN:       {"fqn"},
	services.SortKeyUpdatedAt: {"updated_at"},
}

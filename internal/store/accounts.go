package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"mina.local/mina/internal/models"
)

// AccountListOptions controls account list visibility.
type AccountListOptions struct {
	IncludeHidden     bool
	IncludeTombstoned bool
}

// AccountStore persists accounts.
type AccountStore struct {
	db *sql.DB
}

// NewAccountStore creates an account store using db.
func NewAccountStore(db *sql.DB) *AccountStore {
	return &AccountStore{db: db}
}

// Create persists a new account.
func (s *AccountStore) Create(ctx context.Context, req models.CreateAccountRequest) (models.Account, error) {
	var account models.Account
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		exists, err := accountFQNExists(ctx, tx, req.FQN)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active account fqn already exists", ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO account (fqn, is_hidden, currency, external_id, external_system)
VALUES (?, ?, ?, ?, ?)
RETURNING account_id, fqn, is_hidden, currency, external_id, external_system, created_at, updated_at, tombstoned_at`,
			req.FQN,
			req.IsHidden != nil && *req.IsHidden,
			req.Currency,
			req.ExternalID,
			req.ExternalSystem,
		)
		account, err = scanAccount(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active account fqn already exists", ErrConflict)
			}
			return fmt.Errorf("insert account: %w", err)
		}

		return nil
	})
	if err != nil {
		return models.Account{}, err
	}

	return account, nil
}

// Get returns an account by ID.
func (s *AccountStore) Get(ctx context.Context, id int64, includeTombstoned bool) (models.Account, error) {
	query := `SELECT account_id, fqn, is_hidden, currency, external_id, external_system, created_at, updated_at, tombstoned_at
FROM account
WHERE account_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	account, err := scanAccount(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return models.Account{}, ErrNotFound
	}
	if err != nil {
		return models.Account{}, fmt.Errorf("get account: %w", err)
	}

	return account, nil
}

// List returns accounts in deterministic hierarchy order.
func (s *AccountStore) List(ctx context.Context, opts AccountListOptions) ([]models.Account, error) {
	query := `SELECT account_id, fqn, is_hidden, currency, external_id, external_system, created_at, updated_at, tombstoned_at
FROM account
WHERE 1 = 1`
	if !opts.IncludeHidden {
		query += " AND is_hidden = 0"
	}
	if !opts.IncludeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}
	query += " ORDER BY fqn ASC, account_id ASC"

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list accounts: %w", err)
	}

	accounts := []models.Account{}
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
func (s *AccountStore) UpdateMutable(ctx context.Context, id int64, req models.UpdateAccountRequest) (models.Account, error) {
	row := s.db.QueryRowContext(
		ctx,
		`UPDATE account
SET is_hidden = ?,
    external_id = ?,
    external_system = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE account_id = ? AND tombstoned_at IS NULL
RETURNING account_id, fqn, is_hidden, currency, external_id, external_system, created_at, updated_at, tombstoned_at`,
		*req.IsHidden,
		req.ExternalID,
		req.ExternalSystem,
		id,
	)
	account, err := scanAccount(row)
	if errors.Is(err, sql.ErrNoRows) {
		return models.Account{}, ErrNotFound
	}
	if err != nil {
		return models.Account{}, fmt.Errorf("update account mutable fields: %w", err)
	}

	return account, nil
}

// Tombstone marks an account deleted without removing its historical row.
func (s *AccountStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE account
SET tombstoned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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
		return ErrNotFound
	}

	return nil
}

type accountScanner interface {
	Scan(dest ...any) error
}

func scanAccount(scanner accountScanner) (models.Account, error) {
	var account models.Account
	var currency sql.NullString
	var externalID sql.NullString
	var externalSystem sql.NullString
	var tombstonedAt sql.NullString
	if err := scanner.Scan(
		&account.ID,
		&account.FQN,
		&account.IsHidden,
		&currency,
		&externalID,
		&externalSystem,
		&account.CreatedAt,
		&account.UpdatedAt,
		&tombstonedAt,
	); err != nil {
		return models.Account{}, err
	}
	if currency.Valid {
		account.Currency = &currency.String
	}
	if externalID.Valid {
		account.ExternalID = &externalID.String
	}
	if externalSystem.Valid {
		account.ExternalSystem = &externalSystem.String
	}
	if tombstonedAt.Valid {
		account.TombstonedAt = &tombstonedAt.String
	}

	account.ParentFQN, account.Name, account.Level = models.HierarchyFields(account.FQN)
	account.Kind = strings.Split(account.FQN, ":")[0]

	return account, nil
}

func accountFQNExists(ctx context.Context, tx *sql.Tx, fqn string) (bool, error) {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		"SELECT account_id FROM account WHERE fqn = ? AND tombstoned_at IS NULL LIMIT 1",
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

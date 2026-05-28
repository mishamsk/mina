package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"mina.local/mina/internal/models"
)

// MemberListOptions controls member list visibility.
type MemberListOptions struct {
	IncludeTombstoned bool
}

// MemberStore persists household members.
type MemberStore struct {
	db *sql.DB
}

// NewMemberStore creates a member store using db.
func NewMemberStore(db *sql.DB) *MemberStore {
	return &MemberStore{db: db}
}

// Create persists a new member.
func (s *MemberStore) Create(ctx context.Context, req models.CreateMemberRequest) (models.Member, error) {
	var member models.Member
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		exists, err := memberNameExists(ctx, tx, req.Name)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active member name already exists", ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO member (name)
VALUES (?)
RETURNING member_id, name, created_at, updated_at, tombstoned_at`,
			req.Name,
		)
		member, err = scanMember(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active member name already exists", ErrConflict)
			}
			return fmt.Errorf("insert member: %w", err)
		}

		return nil
	})
	if err != nil {
		return models.Member{}, err
	}

	return member, nil
}

// Get returns a member by ID.
func (s *MemberStore) Get(ctx context.Context, id int64, includeTombstoned bool) (models.Member, error) {
	query := `SELECT member_id, name, created_at, updated_at, tombstoned_at
FROM member
WHERE member_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	member, err := scanMember(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return models.Member{}, ErrNotFound
	}
	if err != nil {
		return models.Member{}, fmt.Errorf("get member: %w", err)
	}

	return member, nil
}

// List returns members in deterministic name order.
func (s *MemberStore) List(ctx context.Context, opts MemberListOptions) ([]models.Member, error) {
	query := `SELECT member_id, name, created_at, updated_at, tombstoned_at
FROM member
WHERE 1 = 1`
	if !opts.IncludeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}
	query += " ORDER BY name ASC, member_id ASC"

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}

	members := []models.Member{}
	for rows.Next() {
		member, err := scanMember(rows)
		if err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		members = append(members, member)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate members: %w; close members rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate members: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close members rows: %w", err)
	}

	return members, nil
}

// UpdateName updates a member's name.
func (s *MemberStore) UpdateName(ctx context.Context, id int64, name string) (models.Member, error) {
	row := s.db.QueryRowContext(
		ctx,
		`UPDATE member
SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE member_id = ? AND tombstoned_at IS NULL
RETURNING member_id, name, created_at, updated_at, tombstoned_at`,
		name,
		id,
	)
	member, err := scanMember(row)
	if errors.Is(err, sql.ErrNoRows) {
		return models.Member{}, ErrNotFound
	}
	if err != nil {
		if isUniqueConstraintError(err) {
			return models.Member{}, fmt.Errorf("%w: active member name already exists", ErrConflict)
		}
		return models.Member{}, fmt.Errorf("update member name: %w", err)
	}

	return member, nil
}

// Tombstone marks a member deleted without removing its historical row.
func (s *MemberStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE member
SET tombstoned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE member_id = ? AND tombstoned_at IS NULL`,
		id,
	)
	if err != nil {
		return fmt.Errorf("tombstone member: %w", err)
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

type memberScanner interface {
	Scan(dest ...any) error
}

func scanMember(scanner memberScanner) (models.Member, error) {
	var member models.Member
	var tombstonedAt sql.NullString
	if err := scanner.Scan(
		&member.ID,
		&member.Name,
		&member.CreatedAt,
		&member.UpdatedAt,
		&tombstonedAt,
	); err != nil {
		return models.Member{}, err
	}
	if tombstonedAt.Valid {
		member.TombstonedAt = &tombstonedAt.String
	}

	return member, nil
}

func memberNameExists(ctx context.Context, tx *sql.Tx, name string) (bool, error) {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		"SELECT member_id FROM member WHERE name = ? AND tombstoned_at IS NULL LIMIT 1",
		name,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check member name: %w", err)
	}

	return true, nil
}

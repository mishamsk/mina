package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/members"
)

// MemberStore persists household members.
type MemberStore struct {
	db *AppDB
}

var _ members.Repository = (*MemberStore)(nil)

// NewMemberStore creates a member store using AppDB.
func NewMemberStore(db *AppDB) *MemberStore {
	return &MemberStore{db: db}
}

// Create persists a new member.
func (s *MemberStore) Create(ctx context.Context, input members.CreateInput) (members.Member, error) {
	var member members.Member
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		exists, err := memberNameExists(ctx, tx, s.db, input.Name)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active member name already exists", services.ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.db.accountingName("member")+` (name)
VALUES (?)
RETURNING member_id, name, created_at, updated_at, tombstoned_at`,
			input.Name,
		)
		member, err = scanMember(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active member name already exists", services.ErrConflict)
			}
			return fmt.Errorf("insert member: %w", err)
		}

		return nil
	})
	if err != nil {
		return members.Member{}, err
	}

	return member, nil
}

// Get returns a member by ID.
func (s *MemberStore) Get(ctx context.Context, id int64, includeTombstoned bool) (members.Member, error) {
	query := `SELECT member_id, name, created_at, updated_at, tombstoned_at
FROM ` + s.db.accountingName("member") + `
WHERE member_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	member, err := scanMember(s.db.query().QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return members.Member{}, services.ErrNotFound
	}
	if err != nil {
		return members.Member{}, fmt.Errorf("get member: %w", err)
	}

	return member, nil
}

// List returns members in deterministic name order.
func (s *MemberStore) List(ctx context.Context, opts members.ListOptions) (services.PaginatedList[members.Member], error) {
	filterQuery := `FROM ` + s.db.accountingName("member") + `
WHERE 1 = 1`
	args := []any{}
	if !opts.IncludeTombstoned {
		filterQuery += " AND tombstoned_at IS NULL"
	}
	totalCount, err := countMatchingRows(ctx, s.db.query(), "SELECT COUNT(*) "+filterQuery, args, "members", opts.List.IncludeTotalCount)
	if err != nil {
		return services.PaginatedList[members.Member]{}, err
	}

	query := `SELECT member_id, name, created_at, updated_at, tombstoned_at
` + filterQuery
	query, args = appendServiceListOrderAndPage(query, args, opts.List, memberSortColumns, services.SortKeyName, "member_id")

	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return services.PaginatedList[members.Member]{}, fmt.Errorf("list members: %w", err)
	}

	memberItems := []members.Member{}
	for rows.Next() {
		member, err := scanMember(rows)
		if err != nil {
			return services.PaginatedList[members.Member]{}, fmt.Errorf("scan member: %w", err)
		}
		memberItems = append(memberItems, member)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return services.PaginatedList[members.Member]{}, fmt.Errorf("iterate members: %w; close members rows: %w", err, closeErr)
		}
		return services.PaginatedList[members.Member]{}, fmt.Errorf("iterate members: %w", err)
	}
	if err := rows.Close(); err != nil {
		return services.PaginatedList[members.Member]{}, fmt.Errorf("close members rows: %w", err)
	}

	return services.PaginatedList[members.Member]{
		Items:      memberItems,
		TotalCount: totalCount,
	}, nil
}

// UpdateName updates a member's name.
func (s *MemberStore) UpdateName(ctx context.Context, id int64, name string) (members.Member, error) {
	var member members.Member
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		exists, err := activeMemberNameExistsForOtherID(ctx, tx, s.db, id, name)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active member name already exists", services.ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`UPDATE `+s.db.accountingName("member")+`
SET name = ?, updated_at = CURRENT_TIMESTAMP
WHERE member_id = ? AND tombstoned_at IS NULL
RETURNING member_id, name, created_at, updated_at, tombstoned_at`,
			name,
			id,
		)
		member, err = scanMember(row)
		if errors.Is(err, sql.ErrNoRows) {
			return services.ErrNotFound
		}
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active member name already exists", services.ErrConflict)
			}
			return fmt.Errorf("update member name: %w", err)
		}

		return nil
	})
	if errors.Is(err, sql.ErrNoRows) {
		return members.Member{}, services.ErrNotFound
	}
	if err != nil {
		return members.Member{}, err
	}

	return member, nil
}

// Tombstone marks a member deleted without removing its historical row.
func (s *MemberStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.query().ExecContext(
		ctx,
		`UPDATE `+s.db.accountingName("member")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
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
		return services.ErrNotFound
	}

	return nil
}

type memberScanner interface {
	Scan(dest ...any) error
}

func scanMember(scanner memberScanner) (members.Member, error) {
	var member members.Member
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&member.ID,
		&member.Name,
		&createdAt,
		&updatedAt,
		&tombstonedAt,
	); err != nil {
		return members.Member{}, err
	}
	member.CreatedAt = createdAt.UTC()
	member.UpdatedAt = updatedAt.UTC()
	member.TombstonedAt = nullableTimeFromSQL(tombstonedAt)

	return member, nil
}

func memberNameExists(ctx context.Context, tx *sql.Tx, db *AppDB, name string) (bool, error) {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		"SELECT member_id FROM "+db.accountingName("member")+" WHERE name = ? AND tombstoned_at IS NULL LIMIT 1",
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

func activeMemberNameExistsForOtherID(ctx context.Context, tx *sql.Tx, db *AppDB, id int64, name string) (bool, error) {
	var otherID int64
	err := tx.QueryRowContext(
		ctx,
		`SELECT member_id
FROM `+db.accountingName("member")+`
WHERE name = ? AND member_id <> ? AND tombstoned_at IS NULL
LIMIT 1`,
		name,
		id,
	).Scan(&otherID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check active member name for other id: %w", err)
	}

	return true, nil
}

var memberSortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt: {"created_at"},
	services.SortKeyName:      {"name"},
	services.SortKeyUpdatedAt: {"updated_at"},
}

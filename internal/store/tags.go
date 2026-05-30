package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/tags"
)

// TagStore persists tags.
type TagStore struct {
	db       *sql.DB
	location AccountingLocation
}

var _ tags.Repository = (*TagStore)(nil)

// NewTagStore creates a tag store using db.
func NewTagStore(db *sql.DB, location AccountingLocation) *TagStore {
	return &TagStore{db: db, location: location}
}

// Create persists a new tag.
func (s *TagStore) Create(ctx context.Context, input tags.CreateInput) (tags.Tag, error) {
	var tag tags.Tag
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		exists, err := tagFQNExists(ctx, tx, input.FQN)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active tag fqn already exists", services.ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO tag (fqn, is_hidden)
VALUES (?, ?)
RETURNING tag_id, fqn, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
			input.FQN,
			input.IsHidden,
		)
		tag, err = scanTag(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active tag fqn already exists", services.ErrConflict)
			}
			return fmt.Errorf("insert tag: %w", err)
		}

		return nil
	})
	if err != nil {
		return tags.Tag{}, err
	}

	return tag, nil
}

// Get returns a tag by ID.
func (s *TagStore) Get(ctx context.Context, id int64, includeTombstoned bool) (tags.Tag, error) {
	query := `SELECT tag_id, fqn, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM tag
WHERE tag_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	tag, err := scanTag(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return tags.Tag{}, services.ErrNotFound
	}
	if err != nil {
		return tags.Tag{}, fmt.Errorf("get tag: %w", err)
	}

	return tag, nil
}

// List returns tags in deterministic hierarchy order.
func (s *TagStore) List(ctx context.Context, opts tags.ListOptions) ([]tags.Tag, error) {
	query := `SELECT tag_id, fqn, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM tag
WHERE 1 = 1`
	args := []any{}
	if !opts.IncludeHidden {
		query += " AND is_hidden = 0"
	}
	if !opts.IncludeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}
	query, args = appendServiceListOrderAndPage(query, args, opts.List, tagSortColumns, services.SortKeyFQN, "tag_id")

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}

	tags := []tags.Tag{}
	for rows.Next() {
		tag, err := scanTag(rows)
		if err != nil {
			return nil, fmt.Errorf("scan tag: %w", err)
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate tags: %w; close tags rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate tags: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close tags rows: %w", err)
	}

	return tags, nil
}

// UpdateHidden updates a tag's hidden state.
func (s *TagStore) UpdateHidden(ctx context.Context, id int64, isHidden bool) (tags.Tag, error) {
	row := s.db.QueryRowContext(
		ctx,
		`UPDATE tag
SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP
WHERE tag_id = ? AND tombstoned_at IS NULL
RETURNING tag_id, fqn, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
		isHidden,
		id,
	)
	tag, err := scanTag(row)
	if errors.Is(err, sql.ErrNoRows) {
		return tags.Tag{}, services.ErrNotFound
	}
	if err != nil {
		return tags.Tag{}, fmt.Errorf("update tag hidden state: %w", err)
	}

	return tag, nil
}

// Tombstone marks a tag deleted without removing its historical row.
func (s *TagStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE tag
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE tag_id = ? AND tombstoned_at IS NULL`,
		id,
	)
	if err != nil {
		return fmt.Errorf("tombstone tag: %w", err)
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

type tagScanner interface {
	Scan(dest ...any) error
}

func scanTag(scanner tagScanner) (tags.Tag, error) {
	var tag tags.Tag
	var parentFQN sql.NullString
	var tombstonedAt sql.NullString
	if err := scanner.Scan(
		&tag.ID,
		&tag.FQN,
		&tag.IsHidden,
		&parentFQN,
		&tag.Name,
		&tag.Level,
		&tag.CreatedAt,
		&tag.UpdatedAt,
		&tombstonedAt,
	); err != nil {
		return tags.Tag{}, err
	}
	if parentFQN.Valid {
		tag.ParentFQN = &parentFQN.String
	}
	if tombstonedAt.Valid {
		tag.TombstonedAt = &tombstonedAt.String
	}

	return tag, nil
}

func tagFQNExists(ctx context.Context, tx *sql.Tx, fqn string) (bool, error) {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		"SELECT tag_id FROM tag WHERE fqn = ? AND tombstoned_at IS NULL LIMIT 1",
		fqn,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check tag fqn: %w", err)
	}

	return true, nil
}

var tagSortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt: {"created_at"},
	services.SortKeyFQN:       {"fqn"},
	services.SortKeyUpdatedAt: {"updated_at"},
}

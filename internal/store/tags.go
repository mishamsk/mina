package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"mina.local/mina/internal/models"
)

// TagListOptions controls tag list visibility.
type TagListOptions struct {
	IncludeHidden     bool
	IncludeTombstoned bool
}

// TagStore persists tags.
type TagStore struct {
	db *sql.DB
}

// NewTagStore creates a tag store using db.
func NewTagStore(db *sql.DB) *TagStore {
	return &TagStore{db: db}
}

// Create persists a new tag.
func (s *TagStore) Create(ctx context.Context, req models.CreateTagRequest) (models.Tag, error) {
	var tag models.Tag
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		exists, err := tagFQNExists(ctx, tx, req.FQN)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active tag fqn already exists", ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO tag (fqn, is_hidden)
VALUES (?, ?)
RETURNING tag_id, fqn, is_hidden, created_at, updated_at, tombstoned_at`,
			req.FQN,
			req.IsHidden != nil && *req.IsHidden,
		)
		tag, err = scanTag(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active tag fqn already exists", ErrConflict)
			}
			return fmt.Errorf("insert tag: %w", err)
		}

		return nil
	})
	if err != nil {
		return models.Tag{}, err
	}

	return tag, nil
}

// Get returns a tag by ID.
func (s *TagStore) Get(ctx context.Context, id int64, includeTombstoned bool) (models.Tag, error) {
	query := `SELECT tag_id, fqn, is_hidden, created_at, updated_at, tombstoned_at
FROM tag
WHERE tag_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	tag, err := scanTag(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return models.Tag{}, ErrNotFound
	}
	if err != nil {
		return models.Tag{}, fmt.Errorf("get tag: %w", err)
	}

	return tag, nil
}

// List returns tags in deterministic hierarchy order.
func (s *TagStore) List(ctx context.Context, opts TagListOptions) ([]models.Tag, error) {
	query := `SELECT tag_id, fqn, is_hidden, created_at, updated_at, tombstoned_at
FROM tag
WHERE 1 = 1`
	if !opts.IncludeHidden {
		query += " AND is_hidden = 0"
	}
	if !opts.IncludeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}
	query += " ORDER BY fqn ASC, tag_id ASC"

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}

	tags := []models.Tag{}
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
func (s *TagStore) UpdateHidden(ctx context.Context, id int64, isHidden bool) (models.Tag, error) {
	row := s.db.QueryRowContext(
		ctx,
		`UPDATE tag
SET is_hidden = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE tag_id = ? AND tombstoned_at IS NULL
RETURNING tag_id, fqn, is_hidden, created_at, updated_at, tombstoned_at`,
		isHidden,
		id,
	)
	tag, err := scanTag(row)
	if errors.Is(err, sql.ErrNoRows) {
		return models.Tag{}, ErrNotFound
	}
	if err != nil {
		return models.Tag{}, fmt.Errorf("update tag hidden state: %w", err)
	}

	return tag, nil
}

// Tombstone marks a tag deleted without removing its historical row.
func (s *TagStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE tag
SET tombstoned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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
		return ErrNotFound
	}

	return nil
}

type tagScanner interface {
	Scan(dest ...any) error
}

func scanTag(scanner tagScanner) (models.Tag, error) {
	var tag models.Tag
	var tombstonedAt sql.NullString
	if err := scanner.Scan(
		&tag.ID,
		&tag.FQN,
		&tag.IsHidden,
		&tag.CreatedAt,
		&tag.UpdatedAt,
		&tombstonedAt,
	); err != nil {
		return models.Tag{}, err
	}
	if tombstonedAt.Valid {
		tag.TombstonedAt = &tombstonedAt.String
	}

	tag.ParentFQN, tag.Name, tag.Level = models.HierarchyFields(tag.FQN)
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

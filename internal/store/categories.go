package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"mina.local/mina/internal/models"
)

// CategoryListOptions controls category list visibility.
type CategoryListOptions struct {
	IncludeHidden     bool
	IncludeTombstoned bool
	List              models.ListOptions
}

// CategoryStore persists categories.
type CategoryStore struct {
	db *sql.DB
}

// NewCategoryStore creates a category store using db.
func NewCategoryStore(db *sql.DB) *CategoryStore {
	return &CategoryStore{db: db}
}

// Create persists a new category.
func (s *CategoryStore) Create(ctx context.Context, req models.CreateCategoryRequest) (models.Category, error) {
	var category models.Category
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		exists, err := categoryFQNExists(ctx, tx, req.FQN)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active category fqn already exists", ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO category (fqn, is_hidden)
VALUES (?, ?)
RETURNING category_id, fqn, is_hidden, created_at, updated_at, tombstoned_at`,
			req.FQN,
			req.IsHidden != nil && *req.IsHidden,
		)
		category, err = scanCategory(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active category fqn already exists", ErrConflict)
			}
			return fmt.Errorf("insert category: %w", err)
		}

		return nil
	})
	if err != nil {
		return models.Category{}, err
	}

	return category, nil
}

// Get returns a category by ID.
func (s *CategoryStore) Get(ctx context.Context, id int64, includeTombstoned bool) (models.Category, error) {
	query := `SELECT category_id, fqn, is_hidden, created_at, updated_at, tombstoned_at
FROM category
WHERE category_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	category, err := scanCategory(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return models.Category{}, ErrNotFound
	}
	if err != nil {
		return models.Category{}, fmt.Errorf("get category: %w", err)
	}

	return category, nil
}

// List returns categories in deterministic hierarchy order.
func (s *CategoryStore) List(ctx context.Context, opts CategoryListOptions) ([]models.Category, error) {
	query := `SELECT category_id, fqn, is_hidden, created_at, updated_at, tombstoned_at
FROM category
WHERE 1 = 1`
	args := []any{}
	if !opts.IncludeHidden {
		query += " AND is_hidden = 0"
	}
	if !opts.IncludeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}
	query, args = appendListOrderAndPage(query, args, opts.List, categorySortColumns, models.SortKeyFQN, "category_id")

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}

	categories := []models.Category{}
	for rows.Next() {
		category, err := scanCategory(rows)
		if err != nil {
			return nil, fmt.Errorf("scan category: %w", err)
		}
		categories = append(categories, category)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return nil, fmt.Errorf("iterate categories: %w; close categories rows: %w", err, closeErr)
		}
		return nil, fmt.Errorf("iterate categories: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close categories rows: %w", err)
	}

	return categories, nil
}

// UpdateHidden updates a category's hidden state.
func (s *CategoryStore) UpdateHidden(ctx context.Context, id int64, isHidden bool) (models.Category, error) {
	row := s.db.QueryRowContext(
		ctx,
		`UPDATE category
SET is_hidden = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE category_id = ? AND tombstoned_at IS NULL
RETURNING category_id, fqn, is_hidden, created_at, updated_at, tombstoned_at`,
		isHidden,
		id,
	)
	category, err := scanCategory(row)
	if errors.Is(err, sql.ErrNoRows) {
		return models.Category{}, ErrNotFound
	}
	if err != nil {
		return models.Category{}, fmt.Errorf("update category hidden state: %w", err)
	}

	return category, nil
}

// Tombstone marks a category deleted without removing its historical row.
func (s *CategoryStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE category
SET tombstoned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE category_id = ? AND tombstoned_at IS NULL`,
		id,
	)
	if err != nil {
		return fmt.Errorf("tombstone category: %w", err)
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

type categoryScanner interface {
	Scan(dest ...any) error
}

func scanCategory(scanner categoryScanner) (models.Category, error) {
	var category models.Category
	var tombstonedAt sql.NullString
	if err := scanner.Scan(
		&category.ID,
		&category.FQN,
		&category.IsHidden,
		&category.CreatedAt,
		&category.UpdatedAt,
		&tombstonedAt,
	); err != nil {
		return models.Category{}, err
	}
	if tombstonedAt.Valid {
		category.TombstonedAt = &tombstonedAt.String
	}

	category.ParentFQN, category.Name, category.Level = models.HierarchyFields(category.FQN)
	return category, nil
}

func categoryFQNExists(ctx context.Context, tx *sql.Tx, fqn string) (bool, error) {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		"SELECT category_id FROM category WHERE fqn = ? AND tombstoned_at IS NULL LIMIT 1",
		fqn,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check category fqn: %w", err)
	}

	return true, nil
}

var categorySortColumns = map[models.SortKey][]string{
	models.SortKeyCreatedAt: {"created_at"},
	models.SortKeyFQN:       {"fqn"},
	models.SortKeyUpdatedAt: {"updated_at"},
}

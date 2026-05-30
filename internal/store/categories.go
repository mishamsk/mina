package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/categories"
)

// CategoryStore persists categories.
type CategoryStore struct {
	db       *sql.DB
	location AccountingLocation
}

var _ categories.Repository = (*CategoryStore)(nil)

// NewCategoryStore creates a category store using db.
func NewCategoryStore(db *sql.DB, location AccountingLocation) *CategoryStore {
	return &CategoryStore{db: db, location: location}
}

// Create persists a new category.
func (s *CategoryStore) Create(ctx context.Context, input categories.CreateInput) (categories.Category, error) {
	var category categories.Category
	err := WithTx(ctx, s.db, nil, func(tx *sql.Tx) error {
		exists, err := categoryFQNExists(ctx, tx, s.location, input.FQN)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: active category fqn already exists", services.ErrConflict)
		}

		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.location.mustQualifiedName("category")+` (fqn, is_hidden)
VALUES (?, ?)
RETURNING category_id, fqn, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
			input.FQN,
			input.IsHidden,
		)
		category, err = scanCategory(row)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active category fqn already exists", services.ErrConflict)
			}
			return fmt.Errorf("insert category: %w", err)
		}

		return nil
	})
	if err != nil {
		return categories.Category{}, err
	}

	return category, nil
}

// Get returns a category by ID.
func (s *CategoryStore) Get(ctx context.Context, id int64, includeTombstoned bool) (categories.Category, error) {
	query := `SELECT category_id, fqn, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM ` + s.location.mustQualifiedName("category") + `
WHERE category_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	category, err := scanCategory(s.db.QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return categories.Category{}, services.ErrNotFound
	}
	if err != nil {
		return categories.Category{}, fmt.Errorf("get category: %w", err)
	}

	return category, nil
}

// List returns categories in deterministic hierarchy order.
func (s *CategoryStore) List(ctx context.Context, opts categories.ListOptions) ([]categories.Category, error) {
	query := `SELECT category_id, fqn, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM ` + s.location.mustQualifiedName("category") + `
WHERE 1 = 1`
	args := []any{}
	if !opts.IncludeHidden {
		query += " AND is_hidden = 0"
	}
	if !opts.IncludeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}
	query, args = appendServiceListOrderAndPage(query, args, opts.List, categorySortColumns, services.SortKeyFQN, "category_id")

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}

	categories := []categories.Category{}
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
func (s *CategoryStore) UpdateHidden(ctx context.Context, id int64, isHidden bool) (categories.Category, error) {
	row := s.db.QueryRowContext(
		ctx,
		`UPDATE `+s.location.mustQualifiedName("category")+`
SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP
WHERE category_id = ? AND tombstoned_at IS NULL
RETURNING category_id, fqn, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
		isHidden,
		id,
	)
	category, err := scanCategory(row)
	if errors.Is(err, sql.ErrNoRows) {
		return categories.Category{}, services.ErrNotFound
	}
	if err != nil {
		return categories.Category{}, fmt.Errorf("update category hidden state: %w", err)
	}

	return category, nil
}

// Tombstone marks a category deleted without removing its historical row.
func (s *CategoryStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE `+s.location.mustQualifiedName("category")+`
SET tombstoned_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
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
		return services.ErrNotFound
	}

	return nil
}

type categoryScanner interface {
	Scan(dest ...any) error
}

func scanCategory(scanner categoryScanner) (categories.Category, error) {
	var category categories.Category
	var parentFQN sql.NullString
	var tombstonedAt sql.NullString
	if err := scanner.Scan(
		&category.ID,
		&category.FQN,
		&category.IsHidden,
		&parentFQN,
		&category.Name,
		&category.Level,
		&category.CreatedAt,
		&category.UpdatedAt,
		&tombstonedAt,
	); err != nil {
		return categories.Category{}, err
	}
	if parentFQN.Valid {
		category.ParentFQN = &parentFQN.String
	}
	if tombstonedAt.Valid {
		category.TombstonedAt = &tombstonedAt.String
	}

	return category, nil
}

func categoryFQNExists(ctx context.Context, tx *sql.Tx, location AccountingLocation, fqn string) (bool, error) {
	var id int64
	err := tx.QueryRowContext(
		ctx,
		"SELECT category_id FROM "+location.mustQualifiedName("category")+" WHERE fqn = ? AND tombstoned_at IS NULL LIMIT 1",
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

var categorySortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt: {"created_at"},
	services.SortKeyFQN:       {"fqn"},
	services.SortKeyUpdatedAt: {"updated_at"},
}

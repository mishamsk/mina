package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/categories"
)

// CategoryStore persists categories.
type CategoryStore struct {
	db *AppDB
}

var _ categories.Repository = (*CategoryStore)(nil)

// NewCategoryStore creates a category store using AppDB.
func NewCategoryStore(db *AppDB) *CategoryStore {
	return &CategoryStore{db: db}
}

// Create persists a new category.
func (s *CategoryStore) Create(ctx context.Context, input categories.CreateInput) (categories.Category, error) {
	var category categories.Category
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		row := tx.QueryRowContext(
			ctx,
			`INSERT INTO `+s.db.accountingName("category")+` (fqn, economic_intent, is_hidden)
VALUES (?, ?, ?)
RETURNING category_id, fqn, economic_intent, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
			input.FQN,
			enumValue(input.EconomicIntent),
			input.IsHidden,
		)
		created, scanErr := scanCategory(row)
		if scanErr != nil {
			if isUniqueConstraintError(scanErr) {
				return fmt.Errorf("%w: active category fqn already exists", services.ErrConflict)
			}
			return fmt.Errorf("insert category: %w", scanErr)
		}
		category = created

		return nil
	})
	if err != nil {
		return categories.Category{}, err
	}

	return category, nil
}

// Get returns a category by ID.
func (s *CategoryStore) Get(ctx context.Context, id int64, includeTombstoned bool) (categories.Category, error) {
	query := `SELECT category_id, fqn, economic_intent, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at
FROM ` + s.db.accountingName("category") + `
WHERE category_id = ?`
	args := []any{id}
	if !includeTombstoned {
		query += " AND tombstoned_at IS NULL"
	}

	category, err := scanCategory(s.db.query().QueryRowContext(ctx, query, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return categories.Category{}, services.ErrNotFound
	}
	if err != nil {
		return categories.Category{}, fmt.Errorf("get category: %w", err)
	}

	return category, nil
}

// List returns categories in deterministic hierarchy order.
func (s *CategoryStore) List(ctx context.Context, opts categories.ListOptions) (services.PaginatedList[categories.Category], error) {
	filterQuery := `FROM ` + s.db.accountingName("category") + `
WHERE 1 = 1`
	args := []any{}
	if !opts.IncludeHidden {
		filterQuery += " AND is_hidden = 0"
	}
	if !opts.IncludeTombstoned {
		filterQuery += " AND tombstoned_at IS NULL"
	}
	if len(opts.EconomicIntents) > 0 {
		filterQuery += " AND economic_intent IN (" + placeholders(len(opts.EconomicIntents)) + ")"
		for _, intent := range opts.EconomicIntents {
			args = append(args, enumValue(intent))
		}
	}
	totalCount, err := countMatchingRows(ctx, s.db.query(), "SELECT COUNT(*) "+filterQuery, args, "categories", opts.List.IncludeTotalCount)
	if err != nil {
		return services.PaginatedList[categories.Category]{}, err
	}

	query := `SELECT category_id, fqn, economic_intent, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at
` + filterQuery
	query, args = appendServiceListOrderAndPage(query, args, opts.List, categorySortColumns, services.SortKeyFQN, "category_id")

	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return services.PaginatedList[categories.Category]{}, fmt.Errorf("list categories: %w", err)
	}

	categoryItems := []categories.Category{}
	for rows.Next() {
		category, err := scanCategory(rows)
		if err != nil {
			return services.PaginatedList[categories.Category]{}, fmt.Errorf("scan category: %w", err)
		}
		categoryItems = append(categoryItems, category)
	}
	if err := rows.Err(); err != nil {
		if closeErr := rows.Close(); closeErr != nil {
			return services.PaginatedList[categories.Category]{}, fmt.Errorf("iterate categories: %w; close categories rows: %w", err, closeErr)
		}
		return services.PaginatedList[categories.Category]{}, fmt.Errorf("iterate categories: %w", err)
	}
	if err := rows.Close(); err != nil {
		return services.PaginatedList[categories.Category]{}, fmt.Errorf("close categories rows: %w", err)
	}

	return services.PaginatedList[categories.Category]{
		Items:      categoryItems,
		TotalCount: totalCount,
	}, nil
}

// UpdateHidden updates a category's hidden state.
func (s *CategoryStore) UpdateHidden(ctx context.Context, id int64, isHidden bool) (categories.Category, error) {
	row := s.db.query().QueryRowContext(
		ctx,
		`UPDATE `+s.db.accountingName("category")+`
SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP
WHERE category_id = ? AND tombstoned_at IS NULL
RETURNING category_id, fqn, economic_intent, is_hidden, parent_fqn, name, level, created_at, updated_at, tombstoned_at`,
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

// RestructureFQNs rewrites active category FQNs and matching active budget paths.
func (s *CategoryStore) RestructureFQNs(ctx context.Context, from string, to string) (int64, error) {
	var affected int64
	err := s.db.withTx(ctx, nil, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("category")+`
SET fqn = ? || substr(fqn, length(?) + 1),
    updated_at = CURRENT_TIMESTAMP
WHERE tombstoned_at IS NULL
  AND (fqn = ? OR starts_with(fqn, ? || ':'))`,
			to,
			from,
			from,
			from,
		)
		if err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active category fqn rewrite conflicts with existing category hierarchy", services.ErrConflict)
			}
			return fmt.Errorf("restructure category fqns: %w", err)
		}

		affected, err = result.RowsAffected()
		if err != nil {
			return fmt.Errorf("read restructure category affected rows: %w", err)
		}

		if _, err := tx.ExecContext(
			ctx,
			`UPDATE `+s.db.accountingName("budget")+`
SET category_fqn = ? || substr(category_fqn, length(?) + 1),
    updated_at = CURRENT_TIMESTAMP
WHERE tombstoned_at IS NULL
  AND (category_fqn = ? OR starts_with(category_fqn, ? || ':'))`,
			to,
			from,
			from,
			from,
		); err != nil {
			if isUniqueConstraintError(err) {
				return fmt.Errorf("%w: active budget category/month rewrite conflicts with existing budget", services.ErrConflict)
			}
			return fmt.Errorf("restructure budget category fqns: %w", err)
		}

		return nil
	})
	if err != nil {
		return 0, err
	}

	return affected, nil
}

// Tombstone marks a category deleted without removing its historical row.
func (s *CategoryStore) Tombstone(ctx context.Context, id int64) error {
	result, err := s.db.query().ExecContext(
		ctx,
		`UPDATE `+s.db.accountingName("category")+`
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
	var economicIntent string
	var parentFQN sql.NullString
	var createdAt time.Time
	var updatedAt time.Time
	var tombstonedAt sql.NullTime
	if err := scanner.Scan(
		&category.ID,
		&category.FQN,
		&economicIntent,
		&category.IsHidden,
		&parentFQN,
		&category.Name,
		&category.Level,
		&createdAt,
		&updatedAt,
		&tombstonedAt,
	); err != nil {
		return categories.Category{}, err
	}
	category.EconomicIntent = categories.CategoryEconomicIntent(strings.ToLower(economicIntent))
	category.CreatedAt = createdAt.UTC()
	category.UpdatedAt = updatedAt.UTC()
	if parentFQN.Valid {
		category.ParentFQN = &parentFQN.String
	}
	category.TombstonedAt = nullableTimeFromSQL(tombstonedAt)

	return category, nil
}

var categorySortColumns = map[services.SortKey][]string{
	services.SortKeyCreatedAt: {"created_at"},
	services.SortKeyFQN:       {"fqn"},
	services.SortKeyUpdatedAt: {"updated_at"},
}

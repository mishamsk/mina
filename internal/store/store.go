package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	_ "github.com/duckdb/duckdb-go/v2"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	db *sql.DB
}

type Item struct {
	ID        int64
	Name      string
	Note      *string
	CreatedAt time.Time
}

func Open(ctx context.Context, dsn string) (*Store, error) {
	db, err := sql.Open("duckdb", dsn)
	if err != nil {
		return nil, fmt.Errorf("open duckdb: %w", err)
	}
	db.SetMaxOpenConns(1)

	s := &Store{db: db}
	if err := s.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate(ctx context.Context) error {
	stmts := []string{
		`CREATE SEQUENCE IF NOT EXISTS items_id_seq START 1`,
		`CREATE TABLE IF NOT EXISTS items (
			id BIGINT PRIMARY KEY DEFAULT nextval('items_id_seq'),
			name TEXT NOT NULL,
			note TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp
		)`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("migrate duckdb: %w", err)
		}
	}
	return nil
}

func (s *Store) CreateItem(ctx context.Context, name string, note *string) (Item, error) {
	row := s.db.QueryRowContext(ctx, `
		INSERT INTO items (name, note)
		VALUES (?, ?)
		RETURNING id, name, note, created_at
	`, name, note)
	return scanItem(row)
}

func (s *Store) ListItems(ctx context.Context) ([]Item, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, note, created_at
		FROM items
		ORDER BY created_at ASC, id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list items: %w", err)
	}
	defer rows.Close()

	var items []Item
	for rows.Next() {
		item, err := scanItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list items: %w", err)
	}
	return items, nil
}

func (s *Store) GetItem(ctx context.Context, id int64) (Item, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, name, note, created_at
		FROM items
		WHERE id = ?
	`, id)
	item, err := scanItem(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Item{}, ErrNotFound
	}
	return item, err
}

func (s *Store) DeleteItem(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM items WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete item: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete item: %w", err)
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

type itemScanner interface {
	Scan(dest ...any) error
}

func scanItem(scanner itemScanner) (Item, error) {
	var item Item
	var note sql.NullString
	if err := scanner.Scan(&item.ID, &item.Name, &note, &item.CreatedAt); err != nil {
		return Item{}, fmt.Errorf("scan item: %w", err)
	}
	if note.Valid {
		item.Note = &note.String
	}
	return item, nil
}

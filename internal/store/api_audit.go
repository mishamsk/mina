package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/apiaudit"
)

// APIAuditStore persists API audit entries in portable accounting state.
type APIAuditStore struct {
	db *AppDB
}

// NewAPIAuditStore creates audit persistence for the selected accounting schema.
func NewAPIAuditStore(db *AppDB) *APIAuditStore {
	return &APIAuditStore{db: db}
}

// Insert stores one API audit entry.
func (s *APIAuditStore) Insert(ctx context.Context, entry apiaudit.Entry) error {
	if _, err := s.db.query().ExecContext(
		ctx,
		`INSERT INTO `+s.db.accountingName("api_audit_entry")+` (
	occurred_at,
	operation_id,
	method,
	request_uri,
	response_status,
	duration_microseconds,
	client_surface,
	request_json,
	response_json
) VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON))`,
		entry.OccurredAt,
		entry.OperationID,
		entry.Method,
		entry.RequestURI,
		entry.ResponseStatus,
		entry.DurationMicroseconds,
		entry.ClientSurface,
		nullableJSONText(entry.RequestJSON),
		nullableJSONText(entry.ResponseJSON),
	); err != nil {
		return fmt.Errorf("insert API audit entry: %w", err)
	}

	return nil
}

// List returns one newest-first page of API audit entries.
func (s *APIAuditStore) List(ctx context.Context, opts apiaudit.ListOptions) (services.PaginatedList[apiaudit.Entry], error) {
	where, args := auditEntryFilters(opts)
	var totalCount int64
	if err := s.db.query().QueryRowContext(
		ctx,
		`SELECT COUNT(*) FROM `+s.db.accountingName("api_audit_entry")+where,
		args...,
	).Scan(&totalCount); err != nil {
		return services.PaginatedList[apiaudit.Entry]{}, fmt.Errorf("count API audit entries: %w", err)
	}

	query := `SELECT
	api_audit_entry_id,
	occurred_at,
	operation_id,
	method,
	request_uri,
	response_status,
	duration_microseconds,
	client_surface,
	CAST(request_json AS VARCHAR),
	CAST(response_json AS VARCHAR)
FROM ` + s.db.accountingName("api_audit_entry") + where + `
ORDER BY occurred_at DESC, api_audit_entry_id DESC`
	query, args = appendLimitOffset(query, args, opts.Limit, opts.Offset)
	rows, err := s.db.query().QueryContext(ctx, query, args...)
	if err != nil {
		return services.PaginatedList[apiaudit.Entry]{}, fmt.Errorf("list API audit entries: %w", err)
	}
	defer func() { _ = rows.Close() }()

	entries := []apiaudit.Entry{}
	for rows.Next() {
		entry := apiaudit.Entry{}
		var surface string
		var requestJSON sql.NullString
		var responseJSON sql.NullString
		if err := rows.Scan(
			&entry.ID,
			&entry.OccurredAt,
			&entry.OperationID,
			&entry.Method,
			&entry.RequestURI,
			&entry.ResponseStatus,
			&entry.DurationMicroseconds,
			&surface,
			&requestJSON,
			&responseJSON,
		); err != nil {
			return services.PaginatedList[apiaudit.Entry]{}, fmt.Errorf("scan API audit entry: %w", err)
		}
		entry.ClientSurface = apiaudit.ClientSurface(surface)
		entry.RequestJSON = rawJSONFromNullString(requestJSON)
		entry.ResponseJSON = rawJSONFromNullString(responseJSON)
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return services.PaginatedList[apiaudit.Entry]{}, fmt.Errorf("iterate API audit entries: %w", err)
	}
	if err := rows.Close(); err != nil {
		return services.PaginatedList[apiaudit.Entry]{}, fmt.Errorf("close API audit entries: %w", err)
	}

	return services.PaginatedList[apiaudit.Entry]{Items: entries, TotalCount: totalCount}, nil
}

// DeleteOlderThan deletes API audit entries whose timestamp precedes cutoff.
func (s *APIAuditStore) DeleteOlderThan(ctx context.Context, cutoff time.Time) error {
	if _, err := s.db.query().ExecContext(
		ctx,
		`DELETE FROM `+s.db.accountingName("api_audit_entry")+` WHERE occurred_at < ?`,
		cutoff.UTC(),
	); err != nil {
		return fmt.Errorf("delete compacted API audit entries: %w", err)
	}

	return nil
}

func auditEntryFilters(opts apiaudit.ListOptions) (string, []any) {
	clauses := []string{}
	args := []any{}
	if opts.Method != nil {
		clauses = append(clauses, "method = ?")
		args = append(args, *opts.Method)
	}
	if opts.OperationID != nil {
		clauses = append(clauses, "operation_id = ?")
		args = append(args, *opts.OperationID)
	}
	if opts.ClientSurface != nil {
		clauses = append(clauses, "client_surface = ?")
		args = append(args, *opts.ClientSurface)
	}
	if len(clauses) == 0 {
		return "", args
	}

	return " WHERE " + strings.Join(clauses, " AND "), args
}

func nullableJSONText(value *json.RawMessage) any {
	if value == nil {
		return nil
	}

	return string(*value)
}

func rawJSONFromNullString(value sql.NullString) *json.RawMessage {
	if !value.Valid {
		return nil
	}
	raw := json.RawMessage(value.String)

	return &raw
}

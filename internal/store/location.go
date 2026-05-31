package store

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strings"
)

var unquotedIdentifierPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// AccountingLocationConfig names the DuckDB database and schema that hold accounting state.
type AccountingLocationConfig struct {
	Database string
	Schema   string
}

// AccountingLocation identifies the resolved DuckDB database and schema that hold accounting state.
type AccountingLocation struct {
	database           string
	schema             string
	databaseIdentifier string
	schemaIdentifier   string
}

// NewAccountingLocation resolves SQL-safe identifier strings for an accounting location.
func NewAccountingLocation(ctx context.Context, db *sql.DB, config AccountingLocationConfig) (AccountingLocation, error) {
	databaseIdentifier, err := accountingIdentifier(ctx, db, "database", config.Database)
	if err != nil {
		return AccountingLocation{}, err
	}
	schemaIdentifier, err := accountingIdentifier(ctx, db, "schema", config.Schema)
	if err != nil {
		return AccountingLocation{}, err
	}

	return AccountingLocation{
		database:           config.Database,
		schema:             config.Schema,
		databaseIdentifier: databaseIdentifier,
		schemaIdentifier:   schemaIdentifier,
	}, nil
}

// Database returns the DuckDB database name holding accounting state.
func (l AccountingLocation) Database() string {
	return l.database
}

// Schema returns the DuckDB schema name holding accounting state.
func (l AccountingLocation) Schema() string {
	return l.schema
}

// QuoteIdentifier quotes one DuckDB SQL identifier.
func QuoteIdentifier(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}

// QualifiedName returns a quoted three-part accounting object name.
func (l AccountingLocation) QualifiedName(object string) (string, error) {
	return strings.Join([]string{
		l.databaseIdentifier,
		l.schemaIdentifier,
		QuoteIdentifier(object),
	}, "."), nil
}

func (l AccountingLocation) mustQualifiedName(object string) string {
	name, err := l.QualifiedName(object)
	if err != nil {
		panic(err)
	}

	return name
}

func accountingIdentifier(ctx context.Context, db *sql.DB, kind string, name string) (string, error) {
	if name == "" {
		return "", fmt.Errorf("%s identifier is required", kind)
	}
	if !unquotedIdentifierPattern.MatchString(name) {
		return QuoteIdentifier(name), nil
	}

	reserved, err := reservedKeyword(ctx, db, name)
	if err != nil {
		return "", err
	}
	if reserved {
		return QuoteIdentifier(name), nil
	}

	return name, nil
}

func reservedKeyword(ctx context.Context, db *sql.DB, name string) (bool, error) {
	var reserved bool
	err := db.QueryRowContext(
		ctx,
		`SELECT EXISTS (
	SELECT 1
	FROM duckdb_keywords()
	WHERE keyword_category = 'reserved'
	  AND lower(keyword_name) = lower(?)
)`,
		name,
	).Scan(&reserved)
	if err != nil {
		return false, fmt.Errorf("check DuckDB keyword %q: %w", name, err)
	}

	return reserved, nil
}

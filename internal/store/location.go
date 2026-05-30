package store

import (
	"fmt"
	"regexp"
	"strings"
)

// Fixed accounting-state locations owned by the store layer.
const (
	InMemoryAccountingCatalog = "memory"
	InMemoryAccountingSchema  = "mina"
	AttachedAccountingCatalog = "accounting"
	AttachedAccountingSchema  = "main"
)

var identifierNamePattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// AccountingLocation identifies the DuckDB catalog and schema that hold accounting state.
type AccountingLocation struct {
	Catalog string
	Schema  string
}

// InMemoryAccountingLocation returns the fixed in-memory accounting-state location.
func InMemoryAccountingLocation() AccountingLocation {
	return AccountingLocation{
		Catalog: InMemoryAccountingCatalog,
		Schema:  InMemoryAccountingSchema,
	}
}

// AttachedDatabaseAccountingLocation returns the fixed attached-database accounting-state location.
func AttachedDatabaseAccountingLocation() AccountingLocation {
	return AccountingLocation{
		Catalog: AttachedAccountingCatalog,
		Schema:  AttachedAccountingSchema,
	}
}

// Validate checks that the accounting location can be safely rendered as SQL identifiers.
func (l AccountingLocation) Validate() error {
	if err := ValidateIdentifierName("catalog", l.Catalog); err != nil {
		return err
	}
	if err := ValidateIdentifierName("schema", l.Schema); err != nil {
		return err
	}

	return nil
}

// ValidateIdentifierName checks a catalog, schema, or object name used in rendered SQL.
func ValidateIdentifierName(kind string, name string) error {
	if !identifierNamePattern.MatchString(name) {
		return fmt.Errorf("invalid %s identifier %q", kind, name)
	}

	return nil
}

// QuoteIdentifier quotes one DuckDB SQL identifier.
func QuoteIdentifier(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}

// QualifiedName returns a quoted three-part accounting object name.
func (l AccountingLocation) QualifiedName(object string) (string, error) {
	if err := l.Validate(); err != nil {
		return "", err
	}
	if err := ValidateIdentifierName("object", object); err != nil {
		return "", err
	}

	return strings.Join([]string{
		QuoteIdentifier(l.Catalog),
		QuoteIdentifier(l.Schema),
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

func (l AccountingLocation) sequenceLiteral(sequence string) string {
	if err := l.Validate(); err != nil {
		panic(err)
	}
	if err := ValidateIdentifierName("sequence", sequence); err != nil {
		panic(err)
	}

	return quoteStringLiteral(l.Catalog + "." + l.Schema + "." + sequence)
}

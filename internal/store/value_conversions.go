package store

import (
	"database/sql"
	"fmt"

	duckdb "github.com/duckdb/duckdb-go/v2"
	"github.com/govalues/decimal"
	"github.com/mishamsk/mina/internal/services/values"
)

func nullableAuditTimestampFromSQL(value sql.NullTime) *values.AuditTimestamp {
	if !value.Valid {
		return nil
	}

	timestamp := values.AuditTimestampFromTime(value.Time)

	return &timestamp
}

func nullableCivilDateArg(value *values.CivilDate) any {
	if value == nil {
		return nil
	}

	return civilDateArg(*value)
}

func civilDateArg(value values.CivilDate) any {
	return duckdb.Typed(value.Time(), duckdb.TYPE_DATE)
}

func nullableCivilDateFromSQL(value sql.NullTime) *values.CivilDate {
	if !value.Valid {
		return nil
	}

	date := values.CivilDateFromTime(value.Time)

	return &date
}

func decimalFromDuckDB(value duckdb.Decimal) (values.Decimal, error) {
	if !value.Value.IsInt64() {
		return values.Decimal{}, fmt.Errorf("duckdb decimal coefficient exceeds int64")
	}

	parsed, err := decimal.New(value.Value.Int64(), int(value.Scale))
	if err != nil {
		return values.Decimal{}, fmt.Errorf("convert duckdb decimal: %w", err)
	}

	return values.DecimalFromLibrary(parsed)
}

package store

import (
	"database/sql"
	"fmt"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"
	"github.com/govalues/decimal"
	"github.com/mishamsk/mina/internal/services/values"
)

func nullableTimeFromSQL(value sql.NullTime) *time.Time {
	if !value.Valid {
		return nil
	}

	timestamp := value.Time.UTC()

	return &timestamp
}

func civilDateArg(value values.CivilDate) any {
	return duckdb.Typed(value.Time(), duckdb.TYPE_DATE)
}

func nullableTimestampArg(value *time.Time) any {
	if value == nil {
		return nil
	}

	return timestampArg(*value)
}

func timestampArg(value time.Time) any {
	return duckdb.Typed(value.UTC(), duckdb.TYPE_TIMESTAMP)
}

func nullableDecimalArg(value *values.Decimal) any {
	if value == nil {
		return nil
	}

	return value.LibraryDecimal()
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

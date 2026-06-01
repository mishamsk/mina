package httpapi

import (
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/values"
	openapi_types "github.com/oapi-codegen/runtime/types"
)

func civilDateFromOpenAPI(value openapi_types.Date) values.CivilDate {
	return values.CivilDateFromTime(value.Time)
}

func nullableCivilDateFromOpenAPI(value *openapi_types.Date) *values.CivilDate {
	if value == nil {
		return nil
	}

	date := civilDateFromOpenAPI(*value)

	return &date
}

func openAPIDate(value values.CivilDate) openapi_types.Date {
	return openapi_types.Date{Time: value.Time()}
}

func nullableOpenAPICivilDate(value *values.CivilDate) *openapi_types.Date {
	if value == nil {
		return nil
	}

	date := openAPIDate(*value)

	return &date
}

func decimalField(name string, value string) (values.Decimal, error) {
	decimal, err := values.ParseDecimal(value)
	if err != nil {
		return values.Decimal{}, services.InvalidRequest(name + " must be a decimal with at most 10 integer digits and 8 fractional digits")
	}

	return decimal, nil
}

func optionalDecimalField(name string, value *string) (*values.Decimal, error) {
	if value == nil {
		return nil, nil
	}

	parsed, err := decimalField(name, *value)
	if err != nil {
		return nil, err
	}

	return &parsed, nil
}

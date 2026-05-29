package openapi_test

import (
	"context"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	"mina.local/mina/internal/httpapi/openapi"
)

func TestGeneratedOpenAPISpecLoadsAndValidates(t *testing.T) {
	spec, err := openapi.GetSpec()
	if err != nil {
		t.Fatalf("load generated OpenAPI spec: %v", err)
	}
	if err := spec.Validate(context.Background()); err != nil {
		t.Fatalf("validate generated OpenAPI spec: %v", err)
	}
}

func TestGeneratedOpenAPISpecMatchesDTOTypeContract(t *testing.T) {
	spec, err := openapi.GetSpec()
	if err != nil {
		t.Fatalf("load generated OpenAPI spec: %v", err)
	}

	const unsignedDecimal = `^[0-9]{1,10}(\.[0-9]{1,8})?$`
	const signedDecimal = `^-?[0-9]{1,10}(\.[0-9]{1,8})?$`
	const zeroDecimal = `^0{1,10}(\.0{1,8})?$`
	assertStringPattern(t, spec.Components.Schemas["CreateCreditLimitHistoryRequest"].Value.Properties["credit_limit"], unsignedDecimal, 19)
	assertStringPattern(t, spec.Components.Schemas["CreditLimitHistory"].Value.Properties["credit_limit"], unsignedDecimal, 19)
	assertPositiveDecimalPattern(t, spec.Components.Schemas["CreateExchangeRateRequest"].Value.Properties["rate"], unsignedDecimal, zeroDecimal, 19)
	assertPositiveDecimalPattern(t, spec.Components.Schemas["UpdateExchangeRateRequest"].Value.Properties["rate"], unsignedDecimal, zeroDecimal, 19)
	assertPositiveDecimalPattern(t, spec.Components.Schemas["ExchangeRate"].Value.Properties["rate"], unsignedDecimal, zeroDecimal, 19)
	assertStringPattern(t, spec.Components.Schemas["CreateJournalRecordRequest"].Value.Properties["amount"], signedDecimal, 20)
	assertStringPattern(t, spec.Components.Schemas["CreateJournalRecordRequest"].Value.Properties["amount_usd"], signedDecimal, 20)
	assertStringPattern(t, spec.Components.Schemas["JournalRecord"].Value.Properties["amount"], signedDecimal, 20)
	assertStringPattern(t, spec.Components.Schemas["JournalRecord"].Value.Properties["amount_usd"], signedDecimal, 20)

	sourceEnum := spec.Components.Schemas["Source"].Value.Enum
	if len(sourceEnum) != 1 || sourceEnum[0] != "manual" {
		t.Fatalf("Source enum = %#v, want [manual]", sourceEnum)
	}
	for path := range spec.Paths.Map() {
		if strings.Contains(path, "budget") {
			t.Fatalf("unexpected Stage 1 budget API path %q", path)
		}
	}
}

func assertStringPattern(t *testing.T, schemaRef *openapi3.SchemaRef, pattern string, maxLength uint64) {
	t.Helper()

	if schemaRef == nil || schemaRef.Value == nil {
		t.Fatal("schema reference missing")
	}
	if schemaRef.Value.Pattern != pattern {
		t.Fatalf("pattern = %q, want %q", schemaRef.Value.Pattern, pattern)
	}
	if schemaRef.Value.MaxLength == nil || *schemaRef.Value.MaxLength != maxLength {
		t.Fatalf("maxLength = %v, want %d", schemaRef.Value.MaxLength, maxLength)
	}
}

func assertPositiveDecimalPattern(t *testing.T, schemaRef *openapi3.SchemaRef, pattern string, zeroPattern string, maxLength uint64) {
	t.Helper()

	assertStringPattern(t, schemaRef, pattern, maxLength)
	if schemaRef.Value.Not == nil || schemaRef.Value.Not.Value == nil {
		t.Fatal("positive decimal schema is missing zero-value exclusion")
	}
	if schemaRef.Value.Not.Value.Pattern != zeroPattern {
		t.Fatalf("zero exclusion pattern = %q, want %q", schemaRef.Value.Not.Value.Pattern, zeroPattern)
	}
}

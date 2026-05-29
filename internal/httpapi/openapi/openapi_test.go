package openapi_test

import (
	"context"
	"testing"

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

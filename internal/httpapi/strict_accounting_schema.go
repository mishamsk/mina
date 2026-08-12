package httpapi

import (
	"context"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
)

func (s *strictServer) GetAccountingSchema(context.Context, openapi.GetAccountingSchemaRequestObject) (openapi.GetAccountingSchemaResponseObject, error) {
	return openapi.GetAccountingSchema200JSONResponse{
		Ddl: s.deps.AccountingSchema.DDL(),
	}, nil
}

package httpapi

import (
	"context"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
)

func (s *strictServer) GetHealth(context.Context, openapi.GetHealthRequestObject) (openapi.GetHealthResponseObject, error) {
	return openapi.GetHealth200JSONResponse{Status: openapi.Ok}, nil
}

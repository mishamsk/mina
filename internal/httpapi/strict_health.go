package httpapi

import (
	"context"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
)

func (s *strictServer) GetHealth(ctx context.Context, _ openapi.GetHealthRequestObject) (openapi.GetHealthResponseObject, error) {
	health, err := s.deps.Health.Check(ctx)
	if err != nil {
		return nil, err
	}

	return openapi.GetHealth200JSONResponse{
		Status:        openapi.HealthResponseStatus(health.Status),
		SchemaVersion: health.SchemaVersion,
	}, nil
}

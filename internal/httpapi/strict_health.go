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
	version := openapi.Version{}
	if err := version.FromDevelopmentBuild(openapi.DevelopmentBuild{
		CommitSha: health.Version.CommitSHA,
		RepoUrl:   health.Version.RepoURL,
	}); err != nil {
		return nil, err
	}

	return openapi.GetHealth200JSONResponse{
		DatabaseEncrypted:     health.DatabaseEncrypted,
		DatabaseFileSizeBytes: health.DatabaseFileSizeBytes,
		Status:                openapi.HealthResponseStatus(health.Status),
		SchemaVersion:         health.SchemaVersion,
		Version:               version,
	}, nil
}

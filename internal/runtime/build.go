package runtime

import (
	"strings"

	"github.com/mishamsk/mina/internal/services/health"
)

const (
	developmentVersion = "0.0.0-dev"
	unknownCommitSHA   = "unknown"
	unknownRepoURL     = "unknown"
)

var (
	buildCommitHash    string
	buildRepositoryURL string
)

// BuildMetadata identifies the Mina build serving the process.
type BuildMetadata struct {
	Version   string
	CommitSHA string
	RepoURL   string
}

// CurrentBuildMetadata returns the metadata for the running Mina binary.
func CurrentBuildMetadata() BuildMetadata {
	commitSHA := strings.TrimSpace(buildCommitHash)
	if commitSHA == "" {
		commitSHA = unknownCommitSHA
	}
	repoURL := strings.TrimSpace(buildRepositoryURL)
	if repoURL == "" {
		repoURL = unknownRepoURL
	}

	return BuildMetadata{
		Version:   developmentVersion,
		CommitSHA: commitSHA,
		RepoURL:   repoURL,
	}
}

func newHealthService(repo health.Repository) *health.Service {
	build := CurrentBuildMetadata()
	return health.NewService(repo, health.DevelopmentBuild{
		CommitSHA: build.CommitSHA,
		RepoURL:   build.RepoURL,
	})
}

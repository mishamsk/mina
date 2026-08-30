package tags

import (
	"context"

	"github.com/mishamsk/mina/internal/services"
)

// CreationAvailability reports whether one proposed tag FQN can be created.
func (s *Service) CreationAvailability(ctx context.Context, fqn string) (services.CreationAvailability, error) {
	states, err := s.cache.Snapshot(ctx)
	if err != nil {
		return services.CreationAvailability{}, err
	}
	return tagFQNAvailability(fqn, states).availability, nil
}

type tagFQNAvailabilityResult struct {
	availability   services.CreationAvailability
	conflictingFQN string
}

func tagFQNAvailability(fqn string, states map[int64]tagReferenceState) tagFQNAvailabilityResult {
	if err := services.ValidateFQN(fqn); err != nil {
		return tagFQNAvailabilityResult{
			availability: services.UnavailableCreation(services.CreationUnavailableInvalidFQN),
		}
	}
	var conflictingFQN string
	for _, state := range states {
		if !state.active || !services.FQNPathConflict(fqn, state.fqn) {
			continue
		}
		if fqn == state.fqn {
			return tagFQNAvailabilityResult{
				availability:   services.UnavailableCreation(services.CreationUnavailablePathConflict),
				conflictingFQN: state.fqn,
			}
		}
		conflictingFQN = state.fqn
	}
	if conflictingFQN != "" {
		return tagFQNAvailabilityResult{
			availability:   services.UnavailableCreation(services.CreationUnavailablePathConflict),
			conflictingFQN: conflictingFQN,
		}
	}
	return tagFQNAvailabilityResult{availability: services.CreationAvailability{Available: true}}
}

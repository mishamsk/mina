package categories

import (
	"context"

	"github.com/mishamsk/mina/internal/services"
)

// CreationAvailability reports whether one proposed category FQN can be created.
func (s *Service) CreationAvailability(ctx context.Context, fqn string) (services.CreationAvailability, error) {
	states, err := s.cache.Snapshot(ctx)
	if err != nil {
		return services.CreationAvailability{}, err
	}
	return categoryFQNAvailability(fqn, states).availability, nil
}

type categoryFQNAvailabilityResult struct {
	availability   services.CreationAvailability
	conflictingFQN string
}

func categoryFQNAvailability(fqn string, states map[int64]categoryReferenceState) categoryFQNAvailabilityResult {
	if err := services.ValidateFQN(fqn); err != nil {
		return categoryFQNAvailabilityResult{
			availability: services.UnavailableCreation(services.CreationUnavailableInvalidFQN),
		}
	}
	var conflictingFQN string
	for _, state := range states {
		if !state.active || !services.FQNPathConflict(fqn, state.fqn) {
			continue
		}
		if fqn == state.fqn {
			return categoryFQNAvailabilityResult{
				availability:   services.UnavailableCreation(services.CreationUnavailablePathConflict),
				conflictingFQN: state.fqn,
			}
		}
		conflictingFQN = state.fqn
	}
	if conflictingFQN != "" {
		return categoryFQNAvailabilityResult{
			availability:   services.UnavailableCreation(services.CreationUnavailablePathConflict),
			conflictingFQN: conflictingFQN,
		}
	}
	return categoryFQNAvailabilityResult{availability: services.CreationAvailability{Available: true}}
}

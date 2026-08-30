package accounts

import (
	"context"

	"github.com/mishamsk/mina/internal/services"
)

// CreationAvailability reports whether one proposed account FQN can be created.
func (s *Service) CreationAvailability(ctx context.Context, fqn string) (services.CreationAvailability, error) {
	states, err := s.cache.Snapshot(ctx)
	if err != nil {
		return services.CreationAvailability{}, err
	}
	return accountFQNAvailability(fqn, states).availability, nil
}

type accountFQNAvailabilityResult struct {
	availability   services.CreationAvailability
	conflictingFQN string
}

func accountFQNAvailability(fqn string, states map[int64]accountReferenceState) accountFQNAvailabilityResult {
	if err := services.ValidateFQN(fqn); err != nil {
		return accountFQNAvailabilityResult{
			availability: services.UnavailableCreation(services.CreationUnavailableInvalidFQN),
		}
	}
	if services.FQNAtOrUnder(fqn, "system") {
		return accountFQNAvailabilityResult{
			availability: services.UnavailableCreation(services.CreationUnavailableReservedNamespace),
		}
	}
	var conflictingFQN string
	for _, state := range states {
		if !state.active || !services.FQNPathConflict(fqn, state.reference.FQN) {
			continue
		}
		if fqn == state.reference.FQN {
			return accountFQNAvailabilityResult{
				availability:   services.UnavailableCreation(services.CreationUnavailablePathConflict),
				conflictingFQN: state.reference.FQN,
			}
		}
		conflictingFQN = state.reference.FQN
	}
	if conflictingFQN != "" {
		return accountFQNAvailabilityResult{
			availability:   services.UnavailableCreation(services.CreationUnavailablePathConflict),
			conflictingFQN: conflictingFQN,
		}
	}
	return accountFQNAvailabilityResult{availability: services.CreationAvailability{Available: true}}
}

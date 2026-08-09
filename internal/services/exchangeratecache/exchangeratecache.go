package exchangeratecache

import (
	"context"
	"sync/atomic"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/values"
)

// DailyRate is one committed dense daily USD exchange rate.
type DailyRate struct {
	FromCurrency  string
	ToCurrency    string
	EffectiveDate values.CivilDate
	Rate          values.Decimal
	Interpolated  bool
}

// ListOptions controls dense daily exchange-rate filters and pagination.
type ListOptions struct {
	ToCurrency        *string
	EffectiveDateFrom *values.CivilDate
	EffectiveDateTo   *values.CivilDate
	Limit             *int
	Offset            int
}

// Repository rebuilds and reads the committed dense daily snapshot.
type Repository interface {
	Rebuild(context.Context) error
	List(context.Context, ListOptions) (services.PaginatedList[DailyRate], error)
}

// Service owns dense daily snapshot rebuild orchestration and reads.
type Service struct {
	repo       Repository
	rebuilding atomic.Bool
}

// NewService creates a dense exchange-rate cache service.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Rebuild requests a snapshot rebuild. An overlapping request is a successful no-op.
func (s *Service) Rebuild(ctx context.Context) error {
	if !s.rebuilding.CompareAndSwap(false, true) {
		return nil
	}
	defer s.rebuilding.Store(false)

	return s.repo.Rebuild(ctx)
}

// List returns the current committed daily snapshot in currency/date order.
func (s *Service) List(ctx context.Context, opts ListOptions) (services.PaginatedList[DailyRate], error) {
	if opts.ToCurrency != nil && !values.ValidCurrencyCode(*opts.ToCurrency) {
		return services.PaginatedList[DailyRate]{}, services.InvalidRequest("to_currency must be an ISO 4217 code or crypto code prefixed with C::")
	}
	if opts.EffectiveDateFrom != nil && opts.EffectiveDateTo != nil &&
		opts.EffectiveDateFrom.Time().After(opts.EffectiveDateTo.Time()) {
		return services.PaginatedList[DailyRate]{}, services.InvalidRequest("effective_date_from must be on or before effective_date_to")
	}

	return s.repo.List(ctx, opts)
}

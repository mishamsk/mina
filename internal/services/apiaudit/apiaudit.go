// Package apiaudit coordinates portable API audit-entry persistence, listing, and compaction decisions.
package apiaudit

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/mishamsk/mina/internal/services"
)

// ClientSurface identifies the caller-declared interactive API surface.
type ClientSurface string

const (
	// ClientSurfaceREST is the default for requests without explicit attribution.
	ClientSurfaceREST ClientSurface = "rest"
	// ClientSurfaceWebUI identifies browser application requests.
	ClientSurfaceWebUI ClientSurface = "web-ui"
	// ClientSurfaceCLI identifies generated CLI client requests.
	ClientSurfaceCLI ClientSurface = "cli"
	// ClientSurfaceMCP identifies MCP-dispatched REST requests.
	ClientSurfaceMCP ClientSurface = "mcp"
)

// Entry is one matched mutating OpenAPI request and its outcome.
type Entry struct {
	ID                   int64
	OccurredAt           time.Time
	OperationID          string
	Method               string
	RequestURI           string
	ResponseStatus       int
	DurationMicroseconds int64
	ClientSurface        ClientSurface
	RequestJSON          *json.RawMessage
	ResponseJSON         *json.RawMessage
}

// ListOptions controls audit-entry filters and page position.
type ListOptions struct {
	Method        *string
	OperationID   *string
	ClientSurface *ClientSurface
	Limit         *int
	Offset        int
}

// Repository persists portable audit entries.
type Repository interface {
	Insert(context.Context, Entry) error
	List(context.Context, ListOptions) (services.PaginatedList[Entry], error)
	DeleteOlderThan(context.Context, time.Time) error
}

// Service owns audit-entry use cases.
type Service struct {
	repo        Repository
	pendingMu   sync.Mutex
	pendingCond *sync.Cond
	pending     int
}

// NewService creates an API audit service backed by repo.
func NewService(repo Repository) *Service {
	service := &Service{repo: repo}
	service.pendingCond = sync.NewCond(&service.pendingMu)

	return service
}

// RecordAsync prepares and persists one entry asynchronously and reports its eventual outcome.
func (s *Service) RecordAsync(ctx context.Context, prepare func(context.Context) Entry, complete func(error)) {
	s.pendingMu.Lock()
	s.pending++
	s.pendingMu.Unlock()
	go func() {
		entry := prepare(ctx)
		err := s.repo.Insert(ctx, entry)

		s.pendingMu.Lock()
		s.pending--
		s.pendingCond.Broadcast()
		s.pendingMu.Unlock()

		complete(err)
	}()
}

// WaitForPendingRecords joins all audit inserts handed off so far.
func (s *Service) WaitForPendingRecords() {
	s.pendingMu.Lock()
	defer s.pendingMu.Unlock()
	for s.pending > 0 {
		s.pendingCond.Wait()
	}
}

// List returns a bounded newest-first page of audit entries.
func (s *Service) List(ctx context.Context, opts ListOptions) (services.PaginatedList[Entry], error) {
	s.WaitForPendingRecords()
	if opts.Method != nil {
		method := strings.ToUpper(strings.TrimSpace(*opts.Method))
		if method == "" {
			return services.PaginatedList[Entry]{}, services.InvalidRequest("method must not be empty")
		}
		opts.Method = &method
	}
	if opts.OperationID != nil && strings.TrimSpace(*opts.OperationID) == "" {
		return services.PaginatedList[Entry]{}, services.InvalidRequest("operation_id must not be empty")
	}
	if opts.ClientSurface != nil && !ValidClientSurface(*opts.ClientSurface) {
		return services.PaginatedList[Entry]{}, services.InvalidRequest("client_surface is not supported")
	}
	if opts.Offset < 0 {
		return services.PaginatedList[Entry]{}, services.InvalidRequest("offset must be non-negative")
	}
	if opts.Limit == nil {
		limit := 100
		opts.Limit = &limit
	}
	if *opts.Limit <= 0 || *opts.Limit > 500 {
		return services.PaginatedList[Entry]{}, services.InvalidRequest("limit must be from 1 through 500")
	}

	return s.repo.List(ctx, opts)
}

// Compact deletes entries strictly older than the retained calendar-month boundary.
func (s *Service) Compact(ctx context.Context, now time.Time, retentionMonths int) error {
	s.WaitForPendingRecords()
	if retentionMonths <= 0 {
		return services.InvalidRequest("audit-log retention months must be positive")
	}
	now = now.UTC()
	currentMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	monthsSinceYearOne := int64(currentMonth.Year()-1)*12 + int64(currentMonth.Month()-1)
	cutoff := time.Date(1, time.January, 1, 0, 0, 0, 0, time.UTC)
	if int64(retentionMonths) <= monthsSinceYearOne {
		cutoffMonth := monthsSinceYearOne - int64(retentionMonths)
		cutoff = time.Date(int(cutoffMonth/12)+1, time.Month(cutoffMonth%12)+1, 1, 0, 0, 0, 0, time.UTC)
	}

	return s.repo.DeleteOlderThan(ctx, cutoff)
}

// ValidClientSurface reports whether value is a complete public attribution value.
func ValidClientSurface(value ClientSurface) bool {
	switch value {
	case ClientSurfaceREST, ClientSurfaceWebUI, ClientSurfaceCLI, ClientSurfaceMCP:
		return true
	default:
		return false
	}
}

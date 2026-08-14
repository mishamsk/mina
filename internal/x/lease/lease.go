// Package lease provides context-aware re-entrant coordination leases.
package lease

import (
	"context"
	"errors"
	"sync"
)

// ErrUpgrade reports an unsupported attempt to upgrade a shared lease to an exclusive lease.
var ErrUpgrade = errors.New("cannot upgrade a shared lease to an exclusive lease")

// Capability selects whether a lease permits concurrent shared holders.
type Capability bool

const (
	// ExclusiveOnly configures a lease backed by a mutex.
	ExclusiveOnly Capability = false
	// SharedCapable configures a lease backed by a read/write mutex.
	SharedCapable Capability = true
)

// Lease owns one re-entrant coordination boundary.
type Lease struct {
	exclusive         sync.Locker
	shared            sync.Locker
	sharedIsExclusive bool
}

// New creates a lease with the requested capability.
func New(capability Capability) *Lease {
	if capability == SharedCapable {
		mutex := &sync.RWMutex{}
		return &Lease{exclusive: mutex, shared: mutex.RLocker()}
	}

	mutex := &sync.Mutex{}
	return &Lease{exclusive: mutex, shared: mutex, sharedIsExclusive: true}
}

// WithSharedLease holds a shared lease while fn runs.
// The context passed to fn must not outlive fn.
func (l *Lease) WithSharedLease(ctx context.Context, fn func(context.Context) error) error {
	return l.with(ctx, l.sharedIsExclusive, l.shared, fn)
}

// WithExclusiveLease holds an exclusive lease while fn runs.
// The context passed to fn must not outlive fn.
func (l *Lease) WithExclusiveLease(ctx context.Context, fn func(context.Context) error) error {
	return l.with(ctx, true, l.exclusive, fn)
}

func (l *Lease) with(ctx context.Context, exclusive bool, lock sync.Locker, fn func(context.Context) error) error {
	if heldExclusive, ok := ctx.Value(l).(bool); ok {
		if exclusive && !heldExclusive {
			return ErrUpgrade
		}
		return fn(ctx)
	}

	lock.Lock()
	defer lock.Unlock()

	return fn(context.WithValue(ctx, l, exclusive))
}

// Func wraps a context-aware closure in one coordination lease.
type Func func(context.Context, func(context.Context) error) error

// Combine acquires leases in order around fn and propagates their ownership context.
func Combine(ctx context.Context, leases []Func, fn func(context.Context) error) error {
	if len(leases) == 0 {
		return fn(ctx)
	}
	return leases[0](ctx, func(ctx context.Context) error {
		return Combine(ctx, leases[1:], fn)
	})
}

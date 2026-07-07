package refcache

import (
	"context"
	"sync"

	"golang.org/x/sync/singleflight"
)

const loadKey = "load"

// Dictionary is a lazily loaded reference snapshot keyed by comparable values.
//
// A Dictionary treats loaded absence as authoritative: GetMany returns only
// keys present in the loaded snapshot and never loads individual misses.
type Dictionary[K comparable, V any] struct {
	loader func(context.Context) (map[K]V, error)

	mu      sync.RWMutex
	loaded  bool
	entries map[K]V
	version uint64
	group   singleflight.Group
}

// NewDictionary constructs a Dictionary backed by loader.
func NewDictionary[K comparable, V any](loader func(context.Context) (map[K]V, error)) *Dictionary[K, V] {
	return &Dictionary[K, V]{
		loader: loader,
	}
}

// GetMany ensures the dictionary snapshot is loaded and returns present keys.
func (d *Dictionary[K, V]) GetMany(ctx context.Context, keys []K) (map[K]V, error) {
	for {
		if err := d.ensureLoaded(ctx); err != nil {
			return nil, err
		}

		d.mu.RLock()
		// An Invalidate between ensureLoaded and this lock would otherwise
		// read an empty snapshot as authoritative absence.
		if !d.loaded {
			d.mu.RUnlock()
			continue
		}

		values := make(map[K]V, len(keys))
		for _, key := range keys {
			value, ok := d.entries[key]
			if ok {
				values[key] = value
			}
		}
		d.mu.RUnlock()

		return values, nil
	}
}

// Snapshot ensures the dictionary snapshot is loaded and returns all entries.
func (d *Dictionary[K, V]) Snapshot(ctx context.Context) (map[K]V, error) {
	for {
		if err := d.ensureLoaded(ctx); err != nil {
			return nil, err
		}

		d.mu.RLock()
		// An Invalidate between ensureLoaded and this lock would otherwise
		// read an empty snapshot as authoritative absence.
		if !d.loaded {
			d.mu.RUnlock()
			continue
		}

		values := make(map[K]V, len(d.entries))
		for key, value := range d.entries {
			values[key] = value
		}
		d.mu.RUnlock()

		return values, nil
	}
}

// Put writes key to the loaded snapshot.
//
// Put is a no-op when the snapshot is not currently loaded.
func (d *Dictionary[K, V]) Put(key K, value V) {
	d.mu.Lock()
	defer d.mu.Unlock()

	// The version bump must precede the loaded check: even while unloaded it
	// forces an in-flight load that may have queried before this write to
	// discard its result instead of publishing a snapshot missing the write.
	d.version++
	if !d.loaded {
		return
	}
	d.entries[key] = value
}

// Modify updates key in the loaded snapshot using fn.
//
// Modify is a no-op when the snapshot is not currently loaded.
// fn runs while the dictionary lock is held and must not call back into the
// Dictionary.
func (d *Dictionary[K, V]) Modify(key K, fn func(value V, ok bool) V) {
	d.mu.Lock()
	defer d.mu.Unlock()

	// The version bump must precede the loaded check: even while unloaded it
	// forces an in-flight load that may have queried before this write to
	// discard its result instead of publishing a snapshot missing the write.
	d.version++
	if !d.loaded {
		return
	}

	value, ok := d.entries[key]
	d.entries[key] = fn(value, ok)
}

// Invalidate drops the loaded snapshot.
func (d *Dictionary[K, V]) Invalidate() {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.version++
	d.loaded = false
	d.entries = nil
}

func (d *Dictionary[K, V]) ensureLoaded(ctx context.Context) error {
	for {
		d.mu.RLock()
		loaded := d.loaded
		d.mu.RUnlock()
		if loaded {
			return nil
		}

		_, err, _ := d.group.Do(loadKey, func() (any, error) {
			d.mu.RLock()
			loaded := d.loaded
			loadVersion := d.version
			d.mu.RUnlock()
			if loaded {
				return nil, nil
			}

			entries, err := d.loader(ctx)
			if err != nil {
				return nil, err
			}

			loadedEntries := make(map[K]V, len(entries))
			for key, value := range entries {
				loadedEntries[key] = value
			}

			d.mu.Lock()
			defer d.mu.Unlock()
			if d.version != loadVersion {
				return nil, nil
			}
			d.entries = loadedEntries
			d.loaded = true

			return nil, nil
		})
		if err != nil {
			return err
		}
	}
}

// Value is a lazily loaded cached value.
type Value[T any] struct {
	loader func(context.Context) (T, error)

	mu      sync.RWMutex
	loaded  bool
	value   T
	version uint64
	group   singleflight.Group
}

// NewValue constructs a Value backed by loader.
func NewValue[T any](loader func(context.Context) (T, error)) *Value[T] {
	return &Value[T]{
		loader: loader,
	}
}

// Get ensures the value is loaded and returns it.
//
// The loaded value is returned as is: callers must not mutate reference types
// reachable from it.
func (v *Value[T]) Get(ctx context.Context) (T, error) {
	for {
		if err := v.ensureLoaded(ctx); err != nil {
			var zero T
			return zero, err
		}

		v.mu.RLock()
		// An Invalidate between ensureLoaded and this lock would otherwise
		// return the zero value as a loaded result.
		if !v.loaded {
			v.mu.RUnlock()
			continue
		}
		value := v.value
		v.mu.RUnlock()

		return value, nil
	}
}

// Invalidate drops the loaded value.
func (v *Value[T]) Invalidate() {
	v.mu.Lock()
	defer v.mu.Unlock()

	var zero T
	v.version++
	v.value = zero
	v.loaded = false
}

func (v *Value[T]) ensureLoaded(ctx context.Context) error {
	for {
		v.mu.RLock()
		loaded := v.loaded
		v.mu.RUnlock()
		if loaded {
			return nil
		}

		_, err, _ := v.group.Do(loadKey, func() (any, error) {
			v.mu.RLock()
			loaded := v.loaded
			loadVersion := v.version
			v.mu.RUnlock()
			if loaded {
				return nil, nil
			}

			value, err := v.loader(ctx)
			if err != nil {
				return nil, err
			}

			v.mu.Lock()
			defer v.mu.Unlock()
			if v.version != loadVersion {
				return nil, nil
			}
			v.value = value
			v.loaded = true

			return nil, nil
		})
		if err != nil {
			return err
		}
	}
}

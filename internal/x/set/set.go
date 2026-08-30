// Package set provides typed in-memory membership sets.
package set

// Set stores unique comparable values for constant-time membership checks.
type Set[T comparable] map[T]struct{}

// From builds a set from values, collapsing duplicates.
func From[T comparable](values []T) Set[T] {
	result := make(Set[T], len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

// Contains reports whether value belongs to the set.
func (s Set[T]) Contains(value T) bool {
	_, ok := s[value]
	return ok
}

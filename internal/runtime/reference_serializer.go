package runtime

import "sync"

type referenceSerializer struct {
	mu sync.Mutex
}

func (s *referenceSerializer) SerializeReferenceOperation(fn func() error) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return fn()
}

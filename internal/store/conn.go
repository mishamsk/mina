package store

import (
	"context"
)

type connectionScopeError struct {
	message string
}

func (e *connectionScopeError) Error() string {
	return e.message
}

// withConn runs fn on one database connection without starting a transaction.
// Transaction-scoped AppDB handles are rejected. The queryer must not be retained
// after fn returns.
func (s *AppDB) withConn(ctx context.Context, fn func(sqlQueryer) error) error {
	if s.tx != nil {
		return &connectionScopeError{message: "connection-scoped operation unavailable inside active transaction"}
	}

	conn, err := s.db.Conn(ctx)
	if err != nil {
		return &connectionScopeError{message: "acquire database connection"}
	}
	defer func() {
		_ = conn.Close()
	}()

	return fn(conn)
}

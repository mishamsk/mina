package accountingschema

import _ "embed"

//go:embed schema.sql
var ddl string

// Service exposes the immutable current target accounting DDL.
type Service struct{}

// NewService creates a read-only accounting-schema service.
func NewService() *Service {
	return &Service{}
}

// DDL returns the current target accounting schema generated from pristine migrations.
func (*Service) DDL() string {
	return ddl
}

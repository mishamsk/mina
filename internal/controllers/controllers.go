package controllers

import (
	"database/sql"
)

// Controllers groups domain use cases wired into routers.
type Controllers struct {
	Transactions *TransactionController
}

// New creates the Stage 1 controller registry.
func New(db *sql.DB) *Controllers {
	return &Controllers{
		Transactions: NewTransactionController(db),
	}
}

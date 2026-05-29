package controllers

import (
	"database/sql"
)

// Controllers groups domain use cases wired into routers.
type Controllers struct {
	Accounts           *AccountController
	CreditLimitHistory *CreditLimitHistoryController
	ExchangeRates      *ExchangeRateController
	Transactions       *TransactionController
}

// New creates the Stage 1 controller registry.
func New(db *sql.DB) *Controllers {
	return &Controllers{
		Accounts:           NewAccountController(db),
		CreditLimitHistory: NewCreditLimitHistoryController(db),
		ExchangeRates:      NewExchangeRateController(db),
		Transactions:       NewTransactionController(db),
	}
}

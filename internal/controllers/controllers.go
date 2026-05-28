package controllers

import "database/sql"

// Controllers groups domain use cases wired into routers.
type Controllers struct {
	Categories         *CategoryController
	Tags               *TagController
	Members            *MemberController
	Accounts           *AccountController
	CreditLimitHistory *CreditLimitHistoryController
	ExchangeRates      *ExchangeRateController
	Transactions       *TransactionController
}

// New creates the Stage 1 controller registry.
func New(db *sql.DB) *Controllers {
	return &Controllers{
		Categories:         NewCategoryController(db),
		Tags:               NewTagController(db),
		Members:            NewMemberController(db),
		Accounts:           NewAccountController(db),
		CreditLimitHistory: NewCreditLimitHistoryController(db),
		ExchangeRates:      NewExchangeRateController(db),
		Transactions:       NewTransactionController(db),
	}
}

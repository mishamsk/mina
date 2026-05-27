package controllers

import "database/sql"

// Controllers groups domain use cases wired into routers.
type Controllers struct {
	Categories *CategoryController
	Tags       *TagController
}

// New creates the Stage 1 controller registry.
func New(db *sql.DB) *Controllers {
	return &Controllers{
		Categories: NewCategoryController(db),
		Tags:       NewTagController(db),
	}
}

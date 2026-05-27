package models

// Category is a hierarchical category used to classify journal records.
type Category struct {
	ID           int64   `json:"category_id"`
	FQN          string  `json:"fqn"`
	IsHidden     bool    `json:"is_hidden"`
	ParentFQN    *string `json:"parent_fqn"`
	Name         string  `json:"name"`
	Level        int     `json:"level"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
	TombstonedAt *string `json:"tombstoned_at,omitempty"`
}

// CreateCategoryRequest is the request body for creating a category.
type CreateCategoryRequest struct {
	FQN      string `json:"fqn"`
	IsHidden *bool  `json:"is_hidden,omitempty"`
}

// UpdateCategoryRequest is the request body for updating category mutable fields.
type UpdateCategoryRequest struct {
	IsHidden *bool `json:"is_hidden"`
}

// CategoryListResponse is the response body for category list endpoints.
type CategoryListResponse struct {
	Categories []Category `json:"categories"`
}

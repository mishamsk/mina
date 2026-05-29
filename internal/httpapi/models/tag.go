package models

// Tag is a hierarchical label used for flexible journal record grouping.
type Tag struct {
	ID           int64   `json:"tag_id"`
	FQN          string  `json:"fqn"`
	IsHidden     bool    `json:"is_hidden"`
	ParentFQN    *string `json:"parent_fqn"`
	Name         string  `json:"name"`
	Level        int     `json:"level"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
	TombstonedAt *string `json:"tombstoned_at,omitempty"`
}

// CreateTagRequest is the request body for creating a tag.
type CreateTagRequest struct {
	FQN      string `json:"fqn"`
	IsHidden *bool  `json:"is_hidden,omitempty"`
}

// UpdateTagRequest is the request body for updating tag mutable fields.
type UpdateTagRequest struct {
	IsHidden *bool `json:"is_hidden"`
}

// TagListResponse is the response body for tag list endpoints.
type TagListResponse struct {
	Tags []Tag `json:"tags"`
}

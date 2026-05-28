package models

// Member is a household member used for journal record attribution.
type Member struct {
	ID           int64   `json:"member_id"`
	Name         string  `json:"name"`
	CreatedAt    string  `json:"created_at"`
	UpdatedAt    string  `json:"updated_at"`
	TombstonedAt *string `json:"tombstoned_at,omitempty"`
}

// CreateMemberRequest is the request body for creating a household member.
type CreateMemberRequest struct {
	Name string `json:"name"`
}

// UpdateMemberRequest is the request body for updating a household member.
type UpdateMemberRequest struct {
	Name string `json:"name"`
}

// MemberListResponse is the response body for member list endpoints.
type MemberListResponse struct {
	Members []Member `json:"members"`
}

package httpapi

import (
	"net/http"

	"mina.local/mina/internal/models"
	"mina.local/mina/internal/services/members"
)

func registerMemberRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /members", func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateMemberRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		member, err := deps.Members.Create(r.Context(), members.CreateInput{Name: req.Name})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, memberResponse(member))
	})

	mux.HandleFunc("GET /members", func(w http.ResponseWriter, r *http.Request) {
		query, ok := parseListQuery(w, r, listQueryContract{
			AllowTombstoned: true,
			SortKeys: map[models.SortKey]struct{}{
				models.SortKeyCreatedAt: {},
				models.SortKeyName:      {},
				models.SortKeyUpdatedAt: {},
			},
			DefaultSortKey: models.SortKeyName,
		})
		if !ok {
			return
		}

		memberList, err := deps.Members.List(r.Context(), members.ListOptions{
			IncludeTombstoned: query.IncludeTombstoned,
			List:              serviceListOptions(query.List),
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.MemberListResponse{Members: memberResponses(memberList)})
	})

	mux.HandleFunc("GET /members/{member_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/members/", "member_id")
		if !ok {
			return
		}
		includeTombstoned, ok := parseBoolQuery(w, r, "include_tombstoned")
		if !ok {
			return
		}

		member, err := deps.Members.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, memberResponse(member))
	})

	mux.HandleFunc("PATCH /members/{member_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/members/", "member_id")
		if !ok {
			return
		}

		var req models.UpdateMemberRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		member, err := deps.Members.UpdateName(r.Context(), id, members.UpdateInput{Name: req.Name})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, memberResponse(member))
	})

	mux.HandleFunc("DELETE /members/{member_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/members/", "member_id")
		if !ok {
			return
		}

		if err := deps.Members.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}

func memberResponse(member members.Member) models.Member {
	return models.Member{
		ID:           member.ID,
		Name:         member.Name,
		CreatedAt:    member.CreatedAt,
		UpdatedAt:    member.UpdatedAt,
		TombstonedAt: member.TombstonedAt,
	}
}

func memberResponses(members []members.Member) []models.Member {
	responses := make([]models.Member, 0, len(members))
	for _, member := range members {
		responses = append(responses, memberResponse(member))
	}

	return responses
}

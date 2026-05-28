package routers

import (
	"net/http"

	"mina.local/mina/internal/controllers"
	"mina.local/mina/internal/models"
)

func registerMemberRoutes(mux *http.ServeMux, deps Dependencies) {
	mux.HandleFunc("POST /members", func(w http.ResponseWriter, r *http.Request) {
		var req models.CreateMemberRequest
		if err := decodeStrictJSON(r, &req); err != nil {
			WriteAPIError(w, http.StatusBadRequest, models.ErrorCodeInvalidRequest, "invalid JSON request body")
			return
		}

		member, err := deps.Controllers.Members.Create(r.Context(), req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, member)
	})

	mux.HandleFunc("GET /members", func(w http.ResponseWriter, r *http.Request) {
		includeTombstoned, ok := parseBoolQuery(w, r, "include_tombstoned")
		if !ok {
			return
		}

		members, err := deps.Controllers.Members.List(r.Context(), controllers.MemberListOptions{
			IncludeTombstoned: includeTombstoned,
		})
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, models.MemberListResponse{Members: members})
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

		member, err := deps.Controllers.Members.Get(r.Context(), id, includeTombstoned)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, member)
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

		member, err := deps.Controllers.Members.UpdateName(r.Context(), id, req)
		if err != nil {
			WriteControllerError(w, err)
			return
		}

		writeJSON(w, http.StatusOK, member)
	})

	mux.HandleFunc("DELETE /members/{member_id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := parseIDPathValue(w, r, "/members/", "member_id")
		if !ok {
			return
		}

		if err := deps.Controllers.Members.Delete(r.Context(), id); err != nil {
			WriteControllerError(w, err)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}

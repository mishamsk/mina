package httpapi

import (
	"context"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	"github.com/mishamsk/mina/internal/services/apiaudit"
)

func (s *strictServer) ListAPIAuditEntries(
	ctx context.Context,
	request openapi.ListAPIAuditEntriesRequestObject,
) (openapi.ListAPIAuditEntriesResponseObject, error) {
	var surface *apiaudit.ClientSurface
	if request.Params.ClientSurface != nil {
		value := apiaudit.ClientSurface(*request.Params.ClientSurface)
		surface = &value
	}
	entries, err := s.deps.APIAudit.List(ctx, apiaudit.ListOptions{
		Method:        request.Params.Method,
		OperationID:   request.Params.OperationId,
		ClientSurface: surface,
		Limit:         request.Params.Limit,
		Offset:        offsetParam(request.Params.Offset),
	})
	if err != nil {
		return nil, err
	}

	response := openapi.APIAuditEntryListResponse{
		Entries:    make([]openapi.APIAuditEntry, 0, len(entries.Items)),
		TotalCount: entries.TotalCount,
	}
	for _, entry := range entries.Items {
		response.Entries = append(response.Entries, openapi.APIAuditEntry{
			ApiAuditEntryId:      entry.ID,
			OccurredAt:           entry.OccurredAt,
			OperationId:          entry.OperationID,
			Method:               entry.Method,
			RequestUri:           entry.RequestURI,
			ResponseStatus:       entry.ResponseStatus,
			DurationMicroseconds: entry.DurationMicroseconds,
			ClientSurface:        openapi.APIAuditClientSurface(entry.ClientSurface),
			RequestJson:          entry.RequestJSON,
			RequestJsonPresent:   entry.RequestJSON != nil,
			ResponseJson:         entry.ResponseJSON,
			ResponseJsonPresent:  entry.ResponseJSON != nil,
		})
	}

	return openapi.ListAPIAuditEntries200JSONResponse(response), nil
}

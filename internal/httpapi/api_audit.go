package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	"github.com/mishamsk/mina/internal/services/apiaudit"
)

const clientSurfaceHeader = "X-Mina-Client-Surface"

const apiAuditInsertTimeout = time.Second

type auditPayloadDirection string

const (
	auditRequestPayload  auditPayloadDirection = "request"
	auditResponsePayload auditPayloadDirection = "response"
)

type auditDenylistRule struct {
	OperationID string
	Direction   auditPayloadDirection
	JSONPointer string
	parts       []string
}

var apiAuditDenylist = []auditDenylistRule{
	{OperationID: "login", Direction: auditRequestPayload, JSONPointer: "/password"},
}

func mustNewAPIAuditMiddleware(
	spec *openapi3.T,
	service *apiaudit.Service,
	clock Clock,
	diagnostics io.Writer,
) func(http.Handler) http.Handler {
	denylist, err := compileAPIAuditDenylist(spec, apiAuditDenylist)
	if err != nil {
		panic(fmt.Errorf("validate API audit denylist: %w", err))
	}
	router := mustOpenAPIRouter(spec)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
			route, _, err := router.FindRoute(request)
			if err != nil || route.Operation == nil || request.Method == http.MethodGet {
				next.ServeHTTP(w, request)
				return
			}

			startedAt := clock.Now().UTC()
			requestBody := captureAuditRequestBody(request)
			wrapped := middleware.NewWrapResponseWriter(w, request.ProtoMajor)
			responseCapture := &bytes.Buffer{}
			wrapped.Tee(responseCapture)
			surface, validSurface := requestClientSurface(request)
			if !validSurface {
				WriteAPIError(wrapped, http.StatusBadRequest, openapi.APIErrorCodeInvalidRequest, "X-Mina-Client-Surface is not supported")
			} else {
				next.ServeHTTP(wrapped, request)
			}

			finishedAt := clock.Now().UTC()
			duration := finishedAt.Sub(startedAt)
			if duration < 0 {
				duration = 0
			}
			responseStatus := wrapped.Status()
			if responseStatus == 0 {
				responseStatus = http.StatusOK
			}
			entry := apiaudit.Entry{
				OccurredAt:           startedAt,
				OperationID:          route.Operation.OperationID,
				Method:               request.Method,
				RequestURI:           request.URL.RequestURI(),
				ResponseStatus:       responseStatus,
				DurationMicroseconds: duration.Microseconds(),
				ClientSurface:        surface,
				ResponseJSON:         captureAuditJSON(responseCapture.Bytes(), route.Operation.OperationID, auditResponsePayload, denylist),
			}
			if request.Body == requestBody {
				request.Body = http.NoBody
			}
			persistenceContext, cancelPersistence := context.WithTimeout(context.WithoutCancel(request.Context()), apiAuditInsertTimeout)
			service.RecordAsync(persistenceContext, func(ctx context.Context) apiaudit.Entry {
				entry.RequestJSON = captureAuditJSON(requestBody.finish(ctx), route.Operation.OperationID, auditRequestPayload, denylist)
				return entry
			}, func(err error) {
				defer cancelPersistence()
				if err != nil && diagnostics != nil {
					_, _ = fmt.Fprintf(diagnostics, "API audit insert failed for %s %s (%s): %v\n", entry.Method, entry.RequestURI, entry.OperationID, err)
				}
			})
		})
	}
}

func requestClientSurface(request *http.Request) (apiaudit.ClientSurface, bool) {
	values := request.Header.Values(clientSurfaceHeader)
	if len(values) == 0 {
		return apiaudit.ClientSurfaceREST, true
	}
	if len(values) != 1 {
		return apiaudit.ClientSurfaceREST, false
	}
	surface := apiaudit.ClientSurface(values[0])
	switch surface {
	case apiaudit.ClientSurfaceWebUI, apiaudit.ClientSurfaceCLI, apiaudit.ClientSurfaceMCP:
		return surface, true
	default:
		return apiaudit.ClientSurfaceREST, false
	}
}

func captureAuditRequestBody(request *http.Request) *auditBodyCapture {
	capture := &auditBodyCapture{complete: request.Body == nil || request.Body == http.NoBody}
	if request.Body == nil {
		return capture
	}
	capture.source = request.Body
	request.Body = capture

	return capture
}

type auditBodyCapture struct {
	source   io.ReadCloser
	body     bytes.Buffer
	complete bool
}

func (c *auditBodyCapture) Read(p []byte) (int, error) {
	if c.source == nil {
		c.complete = true
		return 0, io.EOF
	}
	n, err := c.source.Read(p)
	if n > 0 {
		_, _ = c.body.Write(p[:n])
	}
	if err == io.EOF {
		c.complete = true
	}

	return n, err
}

func (c *auditBodyCapture) Close() error {
	if c.source == nil {
		return nil
	}

	return c.source.Close()
}

func (c *auditBodyCapture) finish(ctx context.Context) []byte {
	if !c.complete {
		stopCancelClose := context.AfterFunc(ctx, func() {
			_ = c.Close()
		})
		_, err := io.Copy(io.Discard, c)
		stopCancelClose()
		if err != nil {
			return nil
		}
	}
	_ = c.Close()
	if !c.complete {
		return nil
	}

	return c.body.Bytes()
}

func captureAuditJSON(body []byte, operationID string, direction auditPayloadDirection, denylist []auditDenylistRule) *json.RawMessage {
	if len(bytes.TrimSpace(body)) == 0 || !json.Valid(body) {
		return nil
	}
	rules := make([]auditDenylistRule, 0, len(denylist))
	for _, rule := range denylist {
		if rule.OperationID == operationID && rule.Direction == direction {
			rules = append(rules, rule)
		}
	}
	if len(rules) == 0 {
		raw := json.RawMessage(bytes.Clone(body))
		return &raw
	}

	var value any
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&value); err != nil {
		return nil
	}
	for _, rule := range rules {
		removeJSONPointer(value, rule.parts)
	}
	redacted, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	raw := json.RawMessage(redacted)

	return &raw
}

func removeJSONPointer(value any, parts []string) {
	if len(parts) == 0 {
		return
	}
	current := value
	for _, part := range parts[:len(parts)-1] {
		switch typed := current.(type) {
		case map[string]any:
			current = typed[part]
		case []any:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(typed) {
				return
			}
			current = typed[index]
		default:
			return
		}
	}
	last := parts[len(parts)-1]
	switch typed := current.(type) {
	case map[string]any:
		delete(typed, last)
	case []any:
		index, err := strconv.Atoi(last)
		if err == nil && index >= 0 && index < len(typed) {
			typed[index] = nil
		}
	}
}

func compileAPIAuditDenylist(spec *openapi3.T, rules []auditDenylistRule) ([]auditDenylistRule, error) {
	operations := map[string]*openapi3.Operation{}
	for _, pathItem := range spec.Paths.Map() {
		for _, operation := range pathItem.Operations() {
			operations[operation.OperationID] = operation
		}
	}
	compiled := append([]auditDenylistRule(nil), rules...)
	for index := range compiled {
		rule := &compiled[index]
		operation := operations[rule.OperationID]
		if operation == nil {
			return nil, fmt.Errorf("operation %q does not exist", rule.OperationID)
		}
		parts, err := parseJSONPointer(rule.JSONPointer)
		if err != nil || len(parts) == 0 {
			return nil, fmt.Errorf("operation %q has invalid JSON Pointer %q", rule.OperationID, rule.JSONPointer)
		}
		rule.parts = parts
		var schemas []*openapi3.SchemaRef
		switch rule.Direction {
		case auditRequestPayload:
			if operation.RequestBody != nil && operation.RequestBody.Value != nil {
				if media := operation.RequestBody.Value.Content.Get("application/json"); media != nil {
					schemas = append(schemas, media.Schema)
				}
			}
		case auditResponsePayload:
			for _, response := range operation.Responses.Map() {
				if response != nil && response.Value != nil {
					if media := response.Value.Content.Get("application/json"); media != nil {
						schemas = append(schemas, media.Schema)
					}
				}
			}
		default:
			return nil, fmt.Errorf("operation %q has unsupported direction %q", rule.OperationID, rule.Direction)
		}
		if len(schemas) == 0 {
			return nil, fmt.Errorf("operation %q has no %s JSON payload schema", rule.OperationID, rule.Direction)
		}
		applicable := false
		for _, schema := range schemas {
			if schemaHasJSONPointer(schema, parts) {
				applicable = true
				break
			}
		}
		if !applicable {
			return nil, fmt.Errorf("operation %q %s schema has no field at %q", rule.OperationID, rule.Direction, rule.JSONPointer)
		}
	}

	return compiled, nil
}

func schemaHasJSONPointer(schemaRef *openapi3.SchemaRef, parts []string) bool {
	if schemaRef == nil || schemaRef.Value == nil {
		return false
	}
	if len(parts) == 0 {
		return true
	}
	schema := schemaRef.Value
	if property := schema.Properties[parts[0]]; property != nil {
		return schemaHasJSONPointer(property, parts[1:])
	}
	if schema.Items != nil {
		if _, err := strconv.Atoi(parts[0]); err != nil && parts[0] != "-" {
			return false
		}
		return schemaHasJSONPointer(schema.Items, parts[1:])
	}

	return false
}

func parseJSONPointer(pointer string) ([]string, error) {
	if pointer == "" {
		return nil, nil
	}
	if !strings.HasPrefix(pointer, "/") {
		return nil, fmt.Errorf("JSON Pointer must start with /")
	}
	rawParts := strings.Split(pointer[1:], "/")
	parts := make([]string, 0, len(rawParts))
	for _, part := range rawParts {
		if strings.Contains(strings.ReplaceAll(strings.ReplaceAll(part, "~1", ""), "~0", ""), "~") {
			return nil, fmt.Errorf("invalid JSON Pointer escape")
		}
		part = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
		parts = append(parts, part)
	}

	return parts, nil
}

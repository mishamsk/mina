package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/mishamsk/mina/internal/httpclient"
)

// Options configures an MCP server.
type Options struct {
	// Version is reported to MCP clients as the Mina server implementation version.
	Version string
	// Diagnostics receives SDK diagnostics. Nil discards them.
	Diagnostics io.Writer
}

// Session gives hand-written extensions access to the generated REST client.
type Session struct {
	client httpclient.ClientWithResponsesInterface
}

// Client returns the generated REST client owned by the session.
func (s *Session) Client() httpclient.ClientWithResponsesInterface {
	return s.client
}

// Operations returns a copy of the generated operation catalog available to
// the MCP session.
func (s *Session) Operations() []Operation {
	return Operations()
}

// ToolHandler handles validated MCP arguments for a hand-written extension.
type ToolHandler func(
	context.Context,
	*mcp.CallToolRequest,
	map[string]json.RawMessage,
) (*mcp.CallToolResult, error)

// ToolRegistration describes one hand-written MCP tool.
type ToolRegistration struct {
	Tool    *mcp.Tool
	Handler ToolHandler
}

// Extension builds one hand-written tool using only the REST session.
type Extension func(*Session) (ToolRegistration, error)

// Server owns a generated REST-backed MCP registry.
type Server struct {
	protocol *mcp.Server
}

// NewRemote builds the MCP registry against one remote Mina REST server.
func NewRemote(serverURL string, options Options, extensions ...Extension) (*Server, error) {
	if err := validateServerURL(serverURL); err != nil {
		return nil, err
	}
	client, err := httpclient.NewClientWithResponses(
		serverURL,
		httpclient.WithHTTPClient(&http.Client{}),
	)
	if err != nil {
		return nil, fmt.Errorf("create remote REST client: %w", err)
	}
	return newServer(client, options, extensions)
}

// NewStreamableHTTP builds a Streamable HTTP MCP handler backed by the
// isolated in-process Mina REST handler.
func NewStreamableHTTP(restHandler http.Handler, options Options, extensions ...Extension) (http.Handler, error) {
	if restHandler == nil {
		return nil, errors.New("MCP Streamable HTTP requires a REST handler")
	}
	client, err := httpclient.NewInProcessClient(restHandler)
	if err != nil {
		return nil, fmt.Errorf("create in-process REST client: %w", err)
	}
	server, err := newServer(client, options, extensions)
	if err != nil {
		return nil, err
	}
	streamable := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server {
		return server.protocol
	}, nil)
	return validateLoopbackOrigin(streamable), nil
}

func newServer(
	client httpclient.ClientWithResponsesInterface,
	options Options,
	extensions []Extension,
) (*Server, error) {

	serverOptions := &mcp.ServerOptions{Capabilities: &mcp.ServerCapabilities{}}
	if options.Diagnostics != nil {
		serverOptions.Logger = slog.New(slog.NewTextHandler(options.Diagnostics, &slog.HandlerOptions{
			Level: slog.LevelWarn,
		}))
	}
	protocol := mcp.NewServer(&mcp.Implementation{Name: "mina", Version: options.Version}, serverOptions)
	registry := registry{
		protocol: protocol,
		session:  &Session{client: client},
		names:    make(map[string]struct{}),
	}
	if err := registry.registerGenerated(); err != nil {
		return nil, err
	}
	if err := registry.registerExtensions(extensions); err != nil {
		return nil, err
	}
	return &Server{protocol: protocol}, nil
}

func validateLoopbackOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && !isLoopbackOrigin(origin) {
			http.Error(w, "Forbidden: Origin must be loopback", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isLoopbackOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") ||
		parsed.Host == "" || parsed.User != nil || parsed.Path != "" ||
		parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	hostname := parsed.Hostname()
	if strings.EqualFold(hostname, "localhost") {
		return true
	}
	ip := net.ParseIP(hostname)
	return ip != nil && ip.IsLoopback()
}

// RunStdio serves one MCP session over the supplied standard-input and
// standard-output streams using the official SDK's newline-delimited transport.
func (s *Server) RunStdio(ctx context.Context, stdin io.Reader, stdout io.Writer) error {
	if s == nil || s.protocol == nil {
		return errors.New("MCP server is not initialized")
	}
	if stdin == nil || stdout == nil {
		return errors.New("MCP stdio requires input and output streams")
	}
	return s.protocol.Run(ctx, &mcp.IOTransport{
		Reader: io.NopCloser(stdin),
		Writer: nopWriteCloser{Writer: stdout},
	})
}

type nopWriteCloser struct {
	io.Writer
}

func (nopWriteCloser) Close() error { return nil }

type registry struct {
	protocol *mcp.Server
	session  *Session
	names    map[string]struct{}
}

func (r *registry) registerGenerated() error {
	for _, operation := range Operations() {
		name := operation.MCP.Group + "_" + operation.MCP.Name
		registration := ToolRegistration{
			Tool: &mcp.Tool{
				Name:        name,
				Description: toolDescription(operation),
				Annotations: &mcp.ToolAnnotations{
					ReadOnlyHint:    operation.MCP.ReadOnly,
					DestructiveHint: boolPointer(operation.MCP.Destructive),
					IdempotentHint:  operation.MCP.Idempotent,
					OpenWorldHint:   boolPointer(operation.MCP.OpenWorld),
				},
				InputSchema: operation.MCP.InputSchema,
			},
			Handler: generatedHandler(r.session, operation),
		}
		if err := r.register(registration, "generated operation "+operation.ID); err != nil {
			return err
		}
	}
	return nil
}

func (r *registry) registerExtensions(extensions []Extension) error {
	for index, extension := range extensions {
		if extension == nil {
			return fmt.Errorf("MCP extension %d is nil", index+1)
		}
		registration, err := extension(r.session)
		if err != nil {
			return fmt.Errorf("build MCP extension %d: %w", index+1, err)
		}
		if err := r.register(registration, fmt.Sprintf("MCP extension %d", index+1)); err != nil {
			return err
		}
	}
	return nil
}

func (r *registry) register(registration ToolRegistration, source string) error {
	if registration.Tool == nil || registration.Tool.Name == "" {
		return fmt.Errorf("%s returned a tool without a name", source)
	}
	if registration.Tool.InputSchema == nil {
		return fmt.Errorf("%s tool %q has no input schema", source, registration.Tool.Name)
	}
	if registration.Handler == nil {
		return fmt.Errorf("%s tool %q has no handler", source, registration.Tool.Name)
	}
	name := registration.Tool.Name
	if _, exists := r.names[name]; exists {
		return fmt.Errorf("MCP tool name %q collides with a generated or registered tool", name)
	}
	r.names[name] = struct{}{}
	mcp.AddTool(r.protocol, registration.Tool, func(
		ctx context.Context,
		request *mcp.CallToolRequest,
		input map[string]json.RawMessage,
	) (*mcp.CallToolResult, any, error) {
		result, err := registration.Handler(ctx, request, input)
		return result, nil, err
	})
	return nil
}

func generatedHandler(session *Session, operation Operation) ToolHandler {
	return func(
		ctx context.Context,
		_ *mcp.CallToolRequest,
		arguments map[string]json.RawMessage,
	) (*mcp.CallToolResult, error) {
		input, err := invocationInput(operation, arguments)
		if err != nil {
			return nil, err
		}
		result, err := operation.Invoke(ctx, session.Client(), input)
		if err != nil {
			return nil, fmt.Errorf("invoke Mina REST operation %s: %w", operation.ID, err)
		}
		return callToolResult(result)
	}
}

func invocationInput(
	operation Operation,
	arguments map[string]json.RawMessage,
) (InvocationInput, error) {
	input := InvocationInput{
		Path:  make([]string, len(operation.Input.Path)),
		Query: make(map[string][]string),
	}
	for index, parameter := range operation.Input.Path {
		value, err := scalarArgument(arguments[parameter.Name])
		if err != nil {
			return InvocationInput{}, fmt.Errorf("path argument %q: %w", parameter.Name, err)
		}
		input.Path[index] = value
	}
	for _, parameter := range operation.Input.Query {
		raw, supplied := arguments[parameter.Name]
		if !supplied {
			continue
		}
		values, err := queryArgument(raw, parameter.Array)
		if err != nil {
			return InvocationInput{}, fmt.Errorf("query argument %q: %w", parameter.Name, err)
		}
		input.Query[parameter.Name] = values
	}
	if raw, supplied := arguments["body"]; supplied {
		body, err := json.Marshal(raw)
		if err != nil {
			return InvocationInput{}, fmt.Errorf("body argument: %w", err)
		}
		input.Body = body
	}
	return input, nil
}

func queryArgument(raw json.RawMessage, array bool) ([]string, error) {
	if !array {
		value, err := scalarArgument(raw)
		if err != nil {
			return nil, err
		}
		return []string{value}, nil
	}
	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, err
	}
	values := make([]string, 0, len(items))
	for index, item := range items {
		value, err := scalarArgument(item)
		if err != nil {
			return nil, fmt.Errorf("item %d: %w", index, err)
		}
		values = append(values, value)
	}
	return values, nil
}

func scalarArgument(raw json.RawMessage) (string, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return "", err
	}
	if err := ensureJSONEnd(decoder); err != nil {
		return "", err
	}
	switch typed := value.(type) {
	case string:
		return typed, nil
	case json.Number:
		return typed.String(), nil
	case bool:
		return fmt.Sprintf("%t", typed), nil
	default:
		return "", fmt.Errorf("expected a string, number, or boolean, got %T", value)
	}
}

func ensureJSONEnd(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("contains multiple JSON values")
		}
		return err
	}
	return nil
}

type structuredRESTResult struct {
	Status int `json:"status"`
	Body   any `json:"body"`
}

func callToolResult(result InvocationResult) (*mcp.CallToolResult, error) {
	body, err := decodedJSONBody(result.Body)
	if err != nil {
		return nil, fmt.Errorf("decode Mina REST response body: %w", err)
	}
	structured := structuredRESTResult{Status: result.StatusCode, Body: body}
	encoded, err := json.Marshal(structured)
	if err != nil {
		return nil, fmt.Errorf("encode MCP structured result: %w", err)
	}
	toolResult := &mcp.CallToolResult{
		Content:           []mcp.Content{&mcp.TextContent{Text: string(encoded)}},
		StructuredContent: json.RawMessage(encoded),
	}
	if result.StatusCode >= http.StatusOK && result.StatusCode < http.StatusMultipleChoices {
		return toolResult, nil
	}
	if len(result.Body) > 0 {
		toolResult.Content = []mcp.Content{&mcp.TextContent{Text: string(result.Body)}}
	}
	toolResult.SetError(fmt.Errorf("mina REST request failed with HTTP status %d", result.StatusCode))
	return toolResult, nil
}

func decodedJSONBody(body []byte) (any, error) {
	if len(body) == 0 {
		return nil, nil
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	if err := ensureJSONEnd(decoder); err != nil {
		return nil, err
	}
	return value, nil
}

func toolDescription(operation Operation) string {
	parts := []string{strings.TrimSpace(operation.Summary), strings.TrimSpace(operation.Description)}
	parts = slicesWithoutEmptyDuplicates(parts)
	return strings.Join(parts, "\n\n")
}

func slicesWithoutEmptyDuplicates(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func boolPointer(value bool) *bool {
	return &value
}

func validateServerURL(raw string) error {
	parsed, err := url.ParseRequestURI(raw)
	if err != nil {
		return fmt.Errorf("invalid --server URL %q: %w", raw, err)
	}
	if (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return fmt.Errorf("invalid --server URL %q: expected an absolute http or https URL", raw)
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("invalid --server URL %q: query strings and fragments are not allowed", raw)
	}
	return nil
}

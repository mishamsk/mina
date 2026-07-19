package httpclient

import (
	"context"
	"encoding/json"
	"fmt"
)

// Operation describes one REST operation exposed through at least one client surface.
type Operation struct {
	// ID is the OpenAPI operationId.
	ID string
	// Method is the uppercase HTTP method.
	Method string
	// Path is the OpenAPI path template.
	Path string
	// Summary is the OpenAPI operation summary.
	Summary string
	// Description is the OpenAPI operation description.
	Description string
	// CLI is non-nil when the operation is exposed through the CLI surface.
	CLI *CLIOperation
	// MCP is non-nil when the operation is exposed through the MCP surface.
	MCP *MCPOperation
	// Input describes the values accepted by the operation.
	Input InputDescriptor
	// Invoke converts transport-neutral input and calls the generated REST client.
	Invoke Invoker
}

// CLIOperation describes the resolved CLI exposure of an operation.
type CLIOperation struct {
	// Area is the resolved CLI command area.
	Area string
	// Name is the configured command name within Area.
	Name string
	// Completion describes how local CLI mode waits for an asynchronous operation.
	Completion *CLICompletion
}

// CLICompletion describes generated REST polling metadata for an asynchronous CLI operation.
type CLICompletion struct {
	// StatusOperationID identifies the generated operation used to read run status.
	StatusOperationID string
	// RunIDResponseField identifies the trigger response field containing the run identifier.
	RunIDResponseField string
	// StatusPathParameter identifies the status operation path parameter receiving the run identifier.
	StatusPathParameter string
	// TerminalField identifies the status response field containing the run outcome.
	TerminalField string
	// TerminalValues lists every value that ends polling.
	TerminalValues []string
	// FailureValues lists terminal values that make the CLI invocation fail.
	FailureValues []string
}

// MCPOperation describes the resolved MCP exposure and behavioral annotations of an operation.
type MCPOperation struct {
	// Group is the resolved MCP tool group.
	Group string
	// Name is the configured tool name within Group.
	Name string
	// ReadOnly reports whether the operation is annotated as read-only.
	ReadOnly bool
	// Destructive reports whether the operation is annotated as destructive.
	Destructive bool
	// Idempotent reports whether the operation is annotated as idempotent.
	Idempotent bool
	// OpenWorld reports whether the operation is annotated as interacting with an open world.
	OpenWorld bool
	// InputSchema is the generated MCP-compatible JSON Schema for tool arguments.
	InputSchema json.RawMessage
}

// InputDescriptor describes an operation's ordered path, query, and body inputs.
type InputDescriptor struct {
	// Path lists path parameters in path-template order.
	Path []ParameterDescriptor
	// Query lists query parameters in OpenAPI declaration order.
	Query []ParameterDescriptor
	// Body describes the operation's JSON request body.
	Body BodyDescriptor
}

// ParameterDescriptor describes a path or query parameter.
type ParameterDescriptor struct {
	// Name is the OpenAPI parameter name.
	Name string
	// Type is the OpenAPI scalar type, or "array" for an array parameter.
	Type string
	// Description is the OpenAPI parameter description.
	Description string
	// Required reports whether the parameter is required.
	Required bool
	// Array reports whether the parameter accepts repeated values.
	Array bool
	// ItemType is the OpenAPI scalar item type for an array parameter.
	ItemType string
	// Enum lists accepted values in the text form used by InvocationInput.
	Enum []string
}

// BodyDescriptor describes a resolved top-level JSON request body schema.
type BodyDescriptor struct {
	// Present reports whether the operation declares a request body.
	Present bool
	// Required reports whether the request body is required.
	Required bool
	// Type is the resolved top-level OpenAPI schema type.
	Type string
	// Properties lists resolved top-level object properties in lexical order.
	Properties []BodyPropertyDescriptor
	// RequiredProperties lists required property names in lexical order.
	RequiredProperties []string
	// Simple reports whether the body satisfies Mina's typed-field simple-body rule.
	Simple bool
}

// BodyPropertyDescriptor describes one resolved top-level request body property.
type BodyPropertyDescriptor struct {
	// Name is the OpenAPI property name.
	Name string
	// Type is the OpenAPI scalar type, or "array" for an array property.
	Type string
	// Description is the OpenAPI property description.
	Description string
	// Required reports whether the property is required by the body schema.
	Required bool
	// Array reports whether the property is an array.
	Array bool
	// ItemType is the OpenAPI scalar item type for an array property.
	ItemType string
	// Enum lists accepted values in the text form used by InvocationInput.
	Enum []string
}

// InvocationInput contains transport-neutral values for one operation invocation.
type InvocationInput struct {
	// Path contains path values in path-template order.
	Path []string
	// Query maps query parameter names to their supplied string values.
	Query map[string][]string
	// Body contains an optional raw JSON request body; nil means no body was supplied.
	Body []byte
}

// InvocationResult contains the normalized raw HTTP result of an invocation.
type InvocationResult struct {
	// StatusCode is the HTTP response status code.
	StatusCode int
	// Headers contains the HTTP response headers.
	Headers map[string][]string
	// Body contains the raw HTTP response body.
	Body []byte
}

// Invoker converts transport-neutral input and invokes one generated REST client operation.
type Invoker func(
	ctx context.Context,
	client ClientWithResponsesInterface,
	input InvocationInput,
) (InvocationResult, error)

// InvocationInputError reports a failure to map transport-neutral input to a generated client type.
type InvocationInputError struct {
	// Location identifies the path, query, or body input collection.
	Location string
	// Name identifies the input that failed conversion.
	Name string
	// Value is the supplied string value when one was available.
	Value string
	// Err is the underlying conversion or input-shape error.
	Err error
}

// Error returns a contextual input conversion error message.
func (e *InvocationInputError) Error() string {
	if e.Value == "" {
		return fmt.Sprintf("invalid %s input %q: %v", e.Location, e.Name, e.Err)
	}
	return fmt.Sprintf("invalid %s input %q value %q: %v", e.Location, e.Name, e.Value, e.Err)
}

// Unwrap returns the underlying conversion or input-shape error.
func (e *InvocationInputError) Unwrap() error {
	return e.Err
}

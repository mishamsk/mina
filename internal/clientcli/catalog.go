package clientcli

import (
	"context"
	"fmt"

	"github.com/mishamsk/mina/internal/httpclient"
)

// Operation describes one REST operation exposed through the CLI surface.
type Operation struct {
	ID          string
	Method      string
	Path        string
	Summary     string
	Description string
	CLI         CLIOperation
	Input       InputDescriptor
	Invoke      Invoker
}

// CLIOperation describes the resolved CLI exposure of an operation.
type CLIOperation struct {
	Area    string
	Name    string
	RunWait *RunWait
}

// RunWait describes REST polling metadata for an asynchronous CLI operation.
type RunWait struct {
	StatusOperationID   string
	RunIDResponseField  string
	StatusPathParameter string
	TerminalField       string
	TerminalValues      []string
	FailureValues       []string
}

// InputDescriptor describes an operation's ordered path, query, and body inputs.
type InputDescriptor struct {
	Path  []ParameterDescriptor
	Query []ParameterDescriptor
	Body  BodyDescriptor
}

// ParameterDescriptor describes a path or query parameter.
type ParameterDescriptor struct {
	Name        string
	Type        string
	Description string
	Required    bool
	Array       bool
	ItemType    string
	Enum        []string
}

// BodyDescriptor describes a resolved top-level JSON request body schema.
type BodyDescriptor struct {
	Present            bool
	Required           bool
	Type               string
	Properties         []BodyPropertyDescriptor
	RequiredProperties []string
	Simple             bool
}

// BodyPropertyDescriptor describes one resolved top-level request body property.
type BodyPropertyDescriptor struct {
	Name        string
	Type        string
	Description string
	Required    bool
	Array       bool
	ItemType    string
	Enum        []string
}

// InvocationInput contains transport-neutral values for one operation invocation.
type InvocationInput struct {
	Path  []string
	Query map[string][]string
	Body  []byte
}

// InvocationResult contains the normalized raw HTTP result of an invocation.
type InvocationResult struct {
	StatusCode int
	Headers    map[string][]string
	Body       []byte
}

// Invoker converts transport-neutral input and invokes one generated REST client operation.
type Invoker func(
	context.Context,
	httpclient.ClientWithResponsesInterface,
	InvocationInput,
) (InvocationResult, error)

// InvocationInputError reports a failure to map input to a generated REST client type.
type InvocationInputError struct {
	Location string
	Name     string
	Value    string
	Err      error
}

func (e *InvocationInputError) Error() string {
	if e.Value == "" {
		return fmt.Sprintf("invalid %s input %q: %v", e.Location, e.Name, e.Err)
	}
	return fmt.Sprintf("invalid %s input %q value %q: %v", e.Location, e.Name, e.Value, e.Err)
}

func (e *InvocationInputError) Unwrap() error { return e.Err }

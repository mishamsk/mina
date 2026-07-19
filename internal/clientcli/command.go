package clientcli

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	"github.com/mishamsk/mina/internal/httpclient"
)

const (
	clientCommandName = "client"
	serverFlagName    = "server"
	jsonFlagName      = "json"
)

var reservedBodyFlagNames = map[string]struct{}{
	"help":         {},
	jsonFlagName:   {},
	serverFlagName: {},
}

// Session gives a hand-written extension access to the generated REST client
// for one remote target.
type Session struct {
	client httpclient.ClientWithResponsesInterface
}

// Client returns the generated REST client owned by the session.
func (s *Session) Client() httpclient.ClientWithResponsesInterface {
	return s.client
}

// Operations returns a copy of the generated operation catalog available to
// the session.
func (s *Session) Operations() []httpclient.Operation {
	return httpclient.CLIOperations()
}

// SessionFactory opens a remote client session using the client command's
// configured target. Extensions call it from their Cobra command action.
type SessionFactory func(*cobra.Command) (*Session, error)

// Extension builds one hand-written top-level command. The supplied session
// factory is its only route to Mina behavior.
type Extension func(SessionFactory) (*cobra.Command, error)

// ReportedError marks a command failure whose user-facing detail has already
// been written to the command's error stream.
type ReportedError struct {
	err error
}

// Error returns the underlying failure detail.
func (e *ReportedError) Error() string {
	return e.err.Error()
}

// Unwrap returns the underlying failure.
func (e *ReportedError) Unwrap() error {
	return e.err
}

// NewCommand builds the catalog-driven remote client command tree.
func NewCommand(stdin io.Reader, stdout io.Writer, stderr io.Writer) *cobra.Command {
	var serverURL string
	cmd := &cobra.Command{
		Use:          clientCommandName,
		Short:        "Call a Mina server",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if _, err := openSession(cmd); err != nil {
				return reportError(cmd, err)
			}
			return cmd.Help()
		},
	}
	cmd.SetIn(stdin)
	cmd.SetOut(stdout)
	cmd.SetErr(stderr)
	cmd.PersistentFlags().StringVar(&serverURL, serverFlagName, "", "Mina server URL")

	areas := make(map[string]*cobra.Command)
	for _, operation := range httpclient.CLIOperations() {
		areaName := operation.CLI.Area
		area, ok := areas[areaName]
		if !ok {
			area = &cobra.Command{
				Use:          areaName,
				Short:        "Commands for " + areaName,
				Args:         cobra.NoArgs,
				SilenceUsage: true,
				RunE: func(cmd *cobra.Command, _ []string) error {
					if _, err := openSession(cmd); err != nil {
						return reportError(cmd, err)
					}
					return cmd.Help()
				},
			}
			areas[areaName] = area
			cmd.AddCommand(area)
		}
		area.AddCommand(newOperationCommand(operation))
	}

	return cmd
}

// RegisterExtensions adds hand-written top-level client commands after checking
// their names against generated areas, generated commands, and prior extensions.
func RegisterExtensions(client *cobra.Command, extensions ...Extension) error {
	if client == nil || client.Name() != clientCommandName || client.PersistentFlags().Lookup(serverFlagName) == nil {
		return errors.New("extensions require a client command built by clientcli.NewCommand")
	}

	reserved := generatedNames()
	for _, command := range client.Commands() {
		reserved[command.Name()] = struct{}{}
		for _, alias := range command.Aliases {
			if alias != "" {
				reserved[alias] = struct{}{}
			}
		}
	}
	for index, extension := range extensions {
		if extension == nil {
			return fmt.Errorf("client extension %d is nil", index+1)
		}
		command, err := extension(openSession)
		if err != nil {
			return fmt.Errorf("build client extension %d: %w", index+1, err)
		}
		if command == nil || command.Name() == "" {
			return fmt.Errorf("client extension %d returned a command without a name", index+1)
		}
		name := command.Name()
		if _, exists := reserved[name]; exists {
			return fmt.Errorf("client extension command %q collides with a generated or registered command name or alias", name)
		}
		reserved[name] = struct{}{}
		for _, alias := range command.Aliases {
			if alias == "" {
				continue
			}
			if _, exists := reserved[alias]; exists {
				return fmt.Errorf("client extension command alias %q collides with a generated or registered command name or alias", alias)
			}
			reserved[alias] = struct{}{}
		}
		client.AddCommand(command)
	}

	return nil
}

func newOperationCommand(operation httpclient.Operation) *cobra.Command {
	pathNames := make([]string, 0, len(operation.Input.Path))
	for _, parameter := range operation.Input.Path {
		pathNames = append(pathNames, "<"+parameter.Name+">")
	}
	use := operation.CLI.Name
	if len(pathNames) > 0 {
		use += " " + strings.Join(pathNames, " ")
	}
	cmd := &cobra.Command{
		Use:           use,
		Short:         operation.Summary,
		Long:          operation.Description,
		Args:          cobra.ExactArgs(len(operation.Input.Path)),
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	for _, parameter := range operation.Input.Query {
		addTypedFlag(cmd.Flags(), parameter.Name, parameter.Type, parameter.ItemType, parameter.Array, parameter.Description, parameter.Enum)
	}

	bodyFieldFlags := make(map[string]httpclient.BodyPropertyDescriptor)
	if operation.Input.Body.Present {
		cmd.Flags().String(jsonFlagName, "", "raw JSON body, @file, or - for standard input")
		if bodySupportsFieldFlags(operation.Input) {
			for _, property := range operation.Input.Body.Properties {
				addTypedFlag(cmd.Flags(), property.Name, property.Type, property.ItemType, property.Array, property.Description, property.Enum)
				bodyFieldFlags[property.Name] = property
			}
		}
	}

	cmd.RunE = func(cmd *cobra.Command, args []string) error {
		session, err := openSession(cmd)
		if err != nil {
			return reportError(cmd, err)
		}
		input, err := composeInvocationInput(cmd, args, operation, bodyFieldFlags)
		if err != nil {
			return reportError(cmd, err)
		}
		result, err := operation.Invoke(cmd.Context(), session.Client(), input)
		if err != nil {
			return reportError(cmd, err)
		}
		if result.StatusCode < http.StatusOK || result.StatusCode >= http.StatusMultipleChoices {
			failure := fmt.Errorf("request failed with HTTP status %d", result.StatusCode)
			if len(result.Body) > 0 {
				if err := writeLine(cmd.ErrOrStderr(), result.Body); err != nil {
					return &ReportedError{err: err}
				}
				return &ReportedError{err: failure}
			}
			return reportError(cmd, failure)
		}
		if len(result.Body) == 0 {
			return nil
		}
		if err := writeLine(cmd.OutOrStdout(), result.Body); err != nil {
			return reportError(cmd, err)
		}
		return nil
	}

	return cmd
}

func openSession(command *cobra.Command) (*Session, error) {
	serverURL, err := command.Flags().GetString(serverFlagName)
	if err != nil {
		return nil, err
	}
	if serverURL == "" {
		return nil, errors.New("mina client requires --server URL; local --db mode is not available yet")
	}
	if err := validateServerURL(serverURL); err != nil {
		return nil, err
	}
	client, err := httpclient.NewClientWithResponses(serverURL)
	if err != nil {
		return nil, fmt.Errorf("create remote client: %w", err)
	}
	return &Session{client: client}, nil
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

func composeInvocationInput(
	cmd *cobra.Command,
	args []string,
	operation httpclient.Operation,
	bodyFields map[string]httpclient.BodyPropertyDescriptor,
) (httpclient.InvocationInput, error) {
	input := httpclient.InvocationInput{
		Path:  append([]string(nil), args...),
		Query: make(map[string][]string),
	}
	for _, parameter := range operation.Input.Query {
		if !cmd.Flags().Changed(parameter.Name) {
			continue
		}
		values, err := typedFlagStrings(cmd.Flags(), parameter.Name, parameter.Type, parameter.ItemType, parameter.Array)
		if err != nil {
			return httpclient.InvocationInput{}, err
		}
		input.Query[parameter.Name] = values
	}
	if !operation.Input.Body.Present {
		return input, nil
	}

	jsonChanged := cmd.Flags().Changed(jsonFlagName)
	changedFields := make([]string, 0, len(bodyFields))
	for name := range bodyFields {
		if cmd.Flags().Changed(name) {
			changedFields = append(changedFields, name)
		}
	}
	sort.Strings(changedFields)
	if jsonChanged && len(changedFields) > 0 {
		return httpclient.InvocationInput{}, errors.New("--json and request body field flags are mutually exclusive")
	}
	if jsonChanged {
		body, err := readRawBody(cmd)
		if err != nil {
			return httpclient.InvocationInput{}, err
		}
		input.Body = body
		return input, nil
	}

	if len(bodyFields) == 0 {
		return input, nil
	}
	for _, required := range operation.Input.Body.RequiredProperties {
		if !cmd.Flags().Changed(required) {
			return httpclient.InvocationInput{}, fmt.Errorf("request body field --%s is required when composing the body from flags", required)
		}
	}
	if len(changedFields) == 0 && !operation.Input.Body.Required {
		return input, nil
	}
	values := make(map[string]any, len(changedFields))
	for _, name := range changedFields {
		property := bodyFields[name]
		value, err := typedFlagJSONValue(cmd.Flags(), name, property.Type, property.ItemType, property.Array)
		if err != nil {
			return httpclient.InvocationInput{}, err
		}
		values[name] = value
	}
	body, err := json.Marshal(values)
	if err != nil {
		return httpclient.InvocationInput{}, fmt.Errorf("compose request body: %w", err)
	}
	input.Body = body
	return input, nil
}

func readRawBody(cmd *cobra.Command) ([]byte, error) {
	source, err := cmd.Flags().GetString(jsonFlagName)
	if err != nil {
		return nil, err
	}
	switch {
	case source == "-":
		body, err := io.ReadAll(cmd.InOrStdin())
		if err != nil {
			return nil, fmt.Errorf("read --json body from standard input: %w", err)
		}
		return body, nil
	case strings.HasPrefix(source, "@"):
		if len(source) == 1 {
			return nil, errors.New("--json @file requires a file path")
		}
		body, err := os.ReadFile(strings.TrimPrefix(source, "@"))
		if err != nil {
			return nil, fmt.Errorf("read --json body file: %w", err)
		}
		return body, nil
	default:
		return []byte(source), nil
	}
}

func bodySupportsFieldFlags(input httpclient.InputDescriptor) bool {
	if !input.Body.Simple {
		return false
	}
	names := make(map[string]struct{}, len(input.Query)+len(reservedBodyFlagNames))
	for name := range reservedBodyFlagNames {
		names[name] = struct{}{}
	}
	for _, parameter := range input.Query {
		names[parameter.Name] = struct{}{}
	}
	for _, property := range input.Body.Properties {
		if _, collision := names[property.Name]; collision {
			return false
		}
	}
	return true
}

func addTypedFlag(
	flags *pflag.FlagSet,
	name string,
	valueType string,
	itemType string,
	array bool,
	description string,
	enum []string,
) {
	usage := flagUsage(description, enum, array)
	if array {
		switch itemType {
		case "string":
			flags.StringArray(name, nil, usage)
		case "integer":
			flags.Int64Slice(name, nil, usage)
		case "boolean":
			flags.BoolSlice(name, nil, usage)
		default:
			panic(fmt.Sprintf("unsupported generated array flag type %q for %q", itemType, name))
		}
		return
	}
	switch valueType {
	case "string":
		flags.String(name, "", usage)
	case "integer":
		flags.Int64(name, 0, usage)
	case "boolean":
		flags.Bool(name, false, usage)
	default:
		panic(fmt.Sprintf("unsupported generated flag type %q for %q", valueType, name))
	}
}

func flagUsage(description string, enum []string, repeatable bool) string {
	parts := make([]string, 0, 3)
	if description != "" {
		parts = append(parts, description)
	}
	if len(enum) > 0 {
		parts = append(parts, "one of: "+strings.Join(enum, ", "))
	}
	if repeatable {
		parts = append(parts, "repeatable")
	}
	if len(parts) == 0 {
		return "request value"
	}
	return strings.Join(parts, "; ")
}

func typedFlagStrings(flags *pflag.FlagSet, name string, valueType string, itemType string, array bool) ([]string, error) {
	value, err := typedFlagJSONValue(flags, name, valueType, itemType, array)
	if err != nil {
		return nil, err
	}
	if !array {
		return []string{scalarString(value)}, nil
	}
	switch values := value.(type) {
	case []string:
		return values, nil
	case []int64:
		result := make([]string, 0, len(values))
		for _, item := range values {
			result = append(result, strconv.FormatInt(item, 10))
		}
		return result, nil
	case []bool:
		result := make([]string, 0, len(values))
		for _, item := range values {
			result = append(result, strconv.FormatBool(item))
		}
		return result, nil
	default:
		return nil, fmt.Errorf("unsupported generated array flag type %q for %q", itemType, name)
	}
}

func typedFlagJSONValue(flags *pflag.FlagSet, name string, valueType string, itemType string, array bool) (any, error) {
	if array {
		switch itemType {
		case "string":
			return flags.GetStringArray(name)
		case "integer":
			return flags.GetInt64Slice(name)
		case "boolean":
			return flags.GetBoolSlice(name)
		default:
			return nil, fmt.Errorf("unsupported generated array flag type %q for %q", itemType, name)
		}
	}
	switch valueType {
	case "string":
		return flags.GetString(name)
	case "integer":
		return flags.GetInt64(name)
	case "boolean":
		return flags.GetBool(name)
	default:
		return nil, fmt.Errorf("unsupported generated flag type %q for %q", valueType, name)
	}
}

func scalarString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case int64:
		return strconv.FormatInt(typed, 10)
	case bool:
		return strconv.FormatBool(typed)
	default:
		panic(fmt.Sprintf("unsupported generated scalar value type %T", value))
	}
}

func generatedNames() map[string]struct{} {
	names := make(map[string]struct{})
	for _, operation := range httpclient.CLIOperations() {
		names[operation.CLI.Area] = struct{}{}
		names[operation.CLI.Name] = struct{}{}
	}
	return names
}

func reportError(cmd *cobra.Command, err error) error {
	if _, writeErr := fmt.Fprintln(cmd.ErrOrStderr(), err); writeErr != nil {
		return &ReportedError{err: writeErr}
	}
	return &ReportedError{err: err}
}

func writeLine(writer io.Writer, body []byte) error {
	if _, err := writer.Write(body); err != nil {
		return err
	}
	if len(body) > 0 && body[len(body)-1] != '\n' {
		_, err := io.WriteString(writer, "\n")
		return err
	}
	return nil
}

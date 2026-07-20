package clientcli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	"github.com/mishamsk/mina/internal/appconfig"
	"github.com/mishamsk/mina/internal/httpclient"
)

const (
	clientCommandName      = "client"
	serverFlagName         = "server"
	databaseFlagName       = "db"
	yesFlagName            = "yes"
	jsonFlagName           = "json"
	completionPollInterval = 25 * time.Millisecond
)

var reservedBodyFlagNames = map[string]struct{}{
	"help":           {},
	jsonFlagName:     {},
	serverFlagName:   {},
	databaseFlagName: {},
	yesFlagName:      {},
}

// CommandOptions supplies process-composed local-mode dependencies.
type CommandOptions struct {
	ConfigFilePath      *string
	LocalSessionFactory LocalSessionFactory
}

// LocalSession contains the in-process handler and lifecycle cleanup composed by cmd/mina.
type LocalSession struct {
	Handler http.Handler
	Close   func() error
}

// LocalSessionFactory opens one local runtime session for resolved app config.
type LocalSessionFactory func(*cobra.Command, appconfig.Config) (LocalSession, error)

// Session gives a hand-written extension access to the generated REST client
// for one local or remote target.
type Session struct {
	client httpclient.ClientWithResponsesInterface
	close  func() error
	local  bool
}

// Client returns the generated REST client owned by the session.
func (s *Session) Client() httpclient.ClientWithResponsesInterface {
	return s.client
}

// Operations returns a copy of the generated operation catalog available to
// the session.
func (s *Session) Operations() []Operation {
	return Operations()
}

// Close releases lifecycle resources owned by the session.
func (s *Session) Close() error {
	if s == nil || s.close == nil {
		return nil
	}
	close := s.close
	s.close = nil
	return close()
}

// SessionFactory opens a local or remote client session using the client command's
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

// NewCommand builds the catalog-driven local-or-remote client command tree.
func NewCommand(stdin io.Reader, stdout io.Writer, stderr io.Writer, options CommandOptions) *cobra.Command {
	var serverURL string
	var databasePath string
	cmd := &cobra.Command{
		Use:          clientCommandName,
		Short:        "Call Mina through a local database or server",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runSessionHelp(cmd, newSessionFactory(options))
		},
	}
	cmd.SetIn(stdin)
	cmd.SetOut(stdout)
	cmd.SetErr(stderr)
	cmd.PersistentFlags().StringVar(&serverURL, serverFlagName, "", "Mina server URL")
	source := appconfig.Sources()[appconfig.SourceDatabasePath]
	cmd.PersistentFlags().StringVar(
		&databasePath,
		databaseFlagName,
		"",
		fmt.Sprintf("path to the Mina database file (config: %s; env: %s)", source.ConfigPath, source.EnvVar),
	)
	cmd.PersistentFlags().Bool(
		yesFlagName,
		false,
		"answer yes to database creation and migration prompts (env: MINA_YES)",
	)
	sessionFactory := newSessionFactory(options)

	areas := make(map[string]*cobra.Command)
	for _, operation := range Operations() {
		areaName := operation.CLI.Area
		area, ok := areas[areaName]
		if !ok {
			area = &cobra.Command{
				Use:          areaName,
				Short:        "Commands for " + areaName,
				Args:         cobra.NoArgs,
				SilenceUsage: true,
				RunE: func(cmd *cobra.Command, _ []string) error {
					return runSessionHelp(cmd, sessionFactory)
				},
			}
			areas[areaName] = area
			cmd.AddCommand(area)
		}
		area.AddCommand(newOperationCommand(operation, sessionFactory))
	}

	return cmd
}

// RegisterExtensions adds hand-written top-level client commands after checking
// their names against generated areas, generated commands, and prior extensions.
func RegisterExtensions(client *cobra.Command, options CommandOptions, extensions ...Extension) error {
	if client == nil || client.Name() != clientCommandName || client.PersistentFlags().Lookup(serverFlagName) == nil || client.PersistentFlags().Lookup(databaseFlagName) == nil {
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
		command, err := extension(newSessionFactory(options))
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

func newOperationCommand(operation Operation, sessionFactory SessionFactory) *cobra.Command {
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

	bodyFieldFlags := make(map[string]BodyPropertyDescriptor)
	if operation.Input.Body.Present {
		cmd.Flags().String(jsonFlagName, "", "raw JSON body, @file, or - for standard input")
		if bodySupportsFieldFlags(operation.Input) {
			for _, property := range operation.Input.Body.Properties {
				addTypedFlag(cmd.Flags(), property.Name, property.Type, property.ItemType, property.Array, property.Description, property.Enum)
				bodyFieldFlags[property.Name] = property
			}
		}
	}

	cmd.RunE = func(cmd *cobra.Command, args []string) (runErr error) {
		session, err := sessionFactory(cmd)
		if err != nil {
			return reportError(cmd, err)
		}
		defer func() {
			runErr = closeSession(cmd, session, runErr)
		}()
		input, err := composeInvocationInput(cmd, args, operation, bodyFieldFlags)
		if err != nil {
			return reportError(cmd, err)
		}
		result, err := operation.Invoke(cmd.Context(), session.Client(), input)
		if err != nil {
			return reportError(cmd, err)
		}
		if result.StatusCode < http.StatusOK || result.StatusCode >= http.StatusMultipleChoices {
			return reportHTTPFailure(cmd, result)
		}
		if session.local && operation.CLI.Completion != nil {
			return waitForLocalCompletion(cmd, session.Client(), operation.CLI.Completion, result.Body)
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

func newSessionFactory(options CommandOptions) SessionFactory {
	return func(command *cobra.Command) (*Session, error) {
		return openSession(command, options)
	}
}

func openSession(command *cobra.Command, options CommandOptions) (*Session, error) {
	serverURL, err := command.Flags().GetString(serverFlagName)
	if err != nil {
		return nil, err
	}
	databasePath, err := command.Flags().GetString(databaseFlagName)
	if err != nil {
		return nil, err
	}
	if command.Flags().Changed(serverFlagName) && command.Flags().Changed(databaseFlagName) {
		return nil, errors.New("--db and --server are mutually exclusive")
	}
	if command.Flags().Changed(serverFlagName) {
		if err := validateServerURL(serverURL); err != nil {
			return nil, err
		}
		client, err := httpclient.NewClientWithResponses(serverURL)
		if err != nil {
			return nil, fmt.Errorf("create remote client: %w", err)
		}
		return &Session{client: client}, nil
	}

	overrides := appconfig.Overrides{}
	if command.Flags().Changed(databaseFlagName) {
		overrides.DatabasePath = appconfig.Set(databasePath)
	}
	configFilePath := ""
	if options.ConfigFilePath != nil {
		configFilePath = *options.ConfigFilePath
	}
	cfg, err := appconfig.Load(appconfig.LoadOptions{ConfigFilePath: configFilePath}, overrides)
	if err != nil {
		return nil, err
	}
	if cfg.DatabasePath == "" {
		return nil, errors.New("mina client requires a target: use --db PATH for local mode or --server URL for remote mode")
	}
	if options.LocalSessionFactory == nil {
		return nil, errors.New("local client sessions are not configured")
	}
	local, err := options.LocalSessionFactory(command, cfg)
	if err != nil {
		if isDatabaseLockError(err) {
			return nil, fmt.Errorf("database %s is already in use; use --server URL to connect to the Mina server that owns it: %w", cfg.DatabasePath, err)
		}
		return nil, fmt.Errorf("open local client session: %w", err)
	}
	if local.Handler == nil || local.Close == nil {
		if local.Close != nil {
			_ = local.Close()
		}
		return nil, errors.New("open local client session: local session factory returned incomplete resources")
	}
	client, err := httpclient.NewInProcessClient(local.Handler)
	if err != nil {
		if closeErr := local.Close(); closeErr != nil {
			return nil, fmt.Errorf("create in-process client: %w; close local session: %w", err, closeErr)
		}
		return nil, fmt.Errorf("create in-process client: %w", err)
	}

	return &Session{client: client, close: local.Close, local: true}, nil
}

func waitForLocalCompletion(
	command *cobra.Command,
	client httpclient.ClientWithResponsesInterface,
	completion *CLICompletion,
	triggerBody []byte,
) error {
	runID, err := responseFieldString(triggerBody, completion.RunIDResponseField)
	if err != nil {
		return reportError(command, fmt.Errorf("read completion run identifier: %w", err))
	}
	statusOperation, err := operationByID(completion.StatusOperationID)
	if err != nil {
		return reportError(command, err)
	}
	statusInput, err := completionStatusInput(statusOperation, completion.StatusPathParameter, runID)
	if err != nil {
		return reportError(command, err)
	}

	for {
		result, invokeErr := statusOperation.Invoke(command.Context(), client, statusInput)
		if invokeErr != nil {
			return reportError(command, invokeErr)
		}
		if result.StatusCode < http.StatusOK || result.StatusCode >= http.StatusMultipleChoices {
			return reportHTTPFailure(command, result)
		}
		outcome, fieldErr := responseFieldString(result.Body, completion.TerminalField)
		if fieldErr != nil {
			return reportError(command, fmt.Errorf("read completion terminal state: %w", fieldErr))
		}
		if slices.Contains(completion.TerminalValues, outcome) {
			if slices.Contains(completion.FailureValues, outcome) {
				if writeErr := writeLine(command.ErrOrStderr(), result.Body); writeErr != nil {
					return &ReportedError{err: writeErr}
				}
				return &ReportedError{err: fmt.Errorf("operation completed with outcome %q", outcome)}
			}
			if writeErr := writeLine(command.OutOrStdout(), result.Body); writeErr != nil {
				return reportError(command, writeErr)
			}
			return nil
		}
		if err := waitForCompletionPoll(command.Context()); err != nil {
			return reportError(command, err)
		}
	}
}

func operationByID(operationID string) (Operation, error) {
	for _, operation := range Operations() {
		if operation.ID == operationID {
			return operation, nil
		}
	}
	return Operation{}, fmt.Errorf("completion status operation %q is unavailable", operationID)
}

func completionStatusInput(
	operation Operation,
	pathParameter string,
	runID string,
) (InvocationInput, error) {
	input := InvocationInput{
		Path:  make([]string, len(operation.Input.Path)),
		Query: make(map[string][]string),
	}
	found := false
	for index, parameter := range operation.Input.Path {
		if parameter.Name == pathParameter {
			input.Path[index] = runID
			found = true
		}
	}
	if !found {
		return InvocationInput{}, fmt.Errorf(
			"completion status operation %q has no path parameter %q",
			operation.ID,
			pathParameter,
		)
	}
	return input, nil
}

func responseFieldString(body []byte, field string) (string, error) {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(body, &object); err != nil {
		return "", fmt.Errorf("decode JSON response: %w", err)
	}
	raw, ok := object[field]
	if !ok {
		return "", fmt.Errorf("JSON response is missing field %q", field)
	}

	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return "", fmt.Errorf("decode JSON response field %q: %w", field, err)
	}
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return "", fmt.Errorf("JSON response field %q is empty", field)
		}
		return typed, nil
	case json.Number:
		return typed.String(), nil
	default:
		return "", fmt.Errorf("JSON response field %q must be a string or number", field)
	}
}

func waitForCompletionPoll(ctx context.Context) error {
	timer := time.NewTimer(completionPollInterval)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func reportHTTPFailure(command *cobra.Command, result InvocationResult) error {
	failure := fmt.Errorf("request failed with HTTP status %d", result.StatusCode)
	if len(result.Body) > 0 {
		if err := writeLine(command.ErrOrStderr(), result.Body); err != nil {
			return &ReportedError{err: err}
		}
		return &ReportedError{err: failure}
	}
	return reportError(command, failure)
}

func runSessionHelp(command *cobra.Command, factory SessionFactory) (runErr error) {
	session, err := factory(command)
	if err != nil {
		return reportError(command, err)
	}
	defer func() {
		runErr = closeSession(command, session, runErr)
	}()

	return command.Help()
}

func closeSession(command *cobra.Command, session *Session, runErr error) error {
	if err := session.Close(); err != nil && runErr == nil {
		return reportError(command, fmt.Errorf("close client session: %w", err))
	}
	return runErr
}

func isDatabaseLockError(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "could not set lock on file") ||
		strings.Contains(message, "conflicting lock") ||
		strings.Contains(message, "unique file handle conflict")
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
	operation Operation,
	bodyFields map[string]BodyPropertyDescriptor,
) (InvocationInput, error) {
	input := InvocationInput{
		Path:  append([]string(nil), args...),
		Query: make(map[string][]string),
	}
	for _, parameter := range operation.Input.Query {
		if !cmd.Flags().Changed(parameter.Name) {
			continue
		}
		values, err := typedFlagStrings(cmd.Flags(), parameter.Name, parameter.Type, parameter.ItemType, parameter.Array)
		if err != nil {
			return InvocationInput{}, err
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
		return InvocationInput{}, errors.New("--json and request body field flags are mutually exclusive")
	}
	if jsonChanged {
		body, err := readRawBody(cmd)
		if err != nil {
			return InvocationInput{}, err
		}
		input.Body = body
		return input, nil
	}

	if len(bodyFields) == 0 {
		return input, nil
	}
	for _, required := range operation.Input.Body.RequiredProperties {
		if !cmd.Flags().Changed(required) {
			return InvocationInput{}, fmt.Errorf("request body field --%s is required when composing the body from flags", required)
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
			return InvocationInput{}, err
		}
		values[name] = value
	}
	body, err := json.Marshal(values)
	if err != nil {
		return InvocationInput{}, fmt.Errorf("compose request body: %w", err)
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

func bodySupportsFieldFlags(input InputDescriptor) bool {
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
	for _, operation := range Operations() {
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

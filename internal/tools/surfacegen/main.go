// surfacegen validates the OpenAPI operations and explicit client-surface decisions.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"mime"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"gopkg.in/yaml.v3"
)

const (
	defaultOpenAPIPath = "api/openapi.yaml"
	defaultConfigPath  = "api/client-surfaces.yaml"
	defaultOutputPath  = "internal/httpclient/surfaces.gen.go"
)

type surfaceConfig struct {
	Operations map[string]operationConfig `yaml:"operations"`
}

type operationConfig struct {
	CLI *cliDecision `yaml:"cli"`
	MCP *mcpDecision `yaml:"mcp"`
}

type cliDecision struct {
	State      string         `yaml:"state"`
	Area       string         `yaml:"area,omitempty"`
	Name       string         `yaml:"name,omitempty"`
	Reason     string         `yaml:"reason,omitempty"`
	Completion *cliCompletion `yaml:"completion,omitempty"`
}

type cliCompletion struct {
	StatusOperationID   string   `yaml:"status_operation_id"`
	RunIDResponseField  string   `yaml:"run_id_response_field"`
	StatusPathParameter string   `yaml:"status_path_parameter"`
	TerminalField       string   `yaml:"terminal_field"`
	TerminalValues      []string `yaml:"terminal_values"`
	FailureValues       []string `yaml:"failure_values"`
}

type mcpDecision struct {
	State       string          `yaml:"state"`
	Group       string          `yaml:"group,omitempty"`
	Name        string          `yaml:"name,omitempty"`
	Annotations *mcpAnnotations `yaml:"annotations,omitempty"`
	Reason      string          `yaml:"reason,omitempty"`
}

type mcpAnnotations struct {
	ReadOnly    *bool `yaml:"read_only"`
	Destructive *bool `yaml:"destructive"`
	Idempotent  *bool `yaml:"idempotent"`
	OpenWorld   *bool `yaml:"open_world"`
}

type operationInfo struct {
	operation *openapi3.Operation
	pathItem  *openapi3.PathItem
	method    string
	path      string
}

type finding struct {
	path      string
	operation string
	message   string
}

func main() {
	check := flag.Bool("check", false, "validate the OpenAPI and client-surface contracts")
	openAPIPath := flag.String("openapi", defaultOpenAPIPath, "OpenAPI document path")
	configPath := flag.String("config", defaultConfigPath, "client-surface configuration path")
	outputPath := flag.String("output", defaultOutputPath, "generated Go output path")
	flag.Parse()

	if flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "usage: surfacegen [-check] [-openapi path] [-config path] [-output path]")
		os.Exit(2)
	}

	document, config, operations, findings, err := loadContracts(*openAPIPath, *configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "surfacegen: %v\n", err)
		os.Exit(2)
	}
	if len(findings) > 0 {
		printFindings(findings)
		os.Exit(1)
	}
	if *check {
		return
	}

	if err := generate(*outputPath, document, config, operations); err != nil {
		fmt.Fprintf(os.Stderr, "surfacegen: %v\n", err)
		os.Exit(2)
	}
}

func loadContracts(
	openAPIPath string,
	configPath string,
) (*openapi3.T, surfaceConfig, map[string]operationInfo, []finding, error) {
	document, err := openapi3.NewLoader().LoadFromFile(openAPIPath)
	if err != nil {
		return nil, surfaceConfig{}, nil, nil, fmt.Errorf("load %s: %w", openAPIPath, err)
	}
	if err := document.Validate(context.Background()); err != nil {
		return nil, surfaceConfig{}, nil, nil, fmt.Errorf("validate %s: %w", openAPIPath, err)
	}

	config, err := loadSurfaceConfig(configPath)
	if err != nil {
		return nil, surfaceConfig{}, nil, nil, err
	}

	operations, findings := collectOperations(openAPIPath, document)
	findings = append(findings, validateContracts(openAPIPath, configPath, operations, config)...)
	return document, config, operations, findings, nil
}

func printFindings(findings []finding) {
	sort.Slice(findings, func(i int, j int) bool {
		if findings[i].path != findings[j].path {
			return findings[i].path < findings[j].path
		}
		if findings[i].operation != findings[j].operation {
			return findings[i].operation < findings[j].operation
		}
		return findings[i].message < findings[j].message
	})
	for _, item := range findings {
		if item.operation == "" {
			fmt.Fprintf(os.Stderr, "%s: %s\n", item.path, item.message)
			continue
		}
		fmt.Fprintf(os.Stderr, "%s: operation %s: %s\n", item.path, item.operation, item.message)
	}
}

func loadSurfaceConfig(path string) (surfaceConfig, error) {
	file, err := os.Open(path)
	if err != nil {
		return surfaceConfig{}, fmt.Errorf("open %s: %w", path, err)
	}
	defer func() { _ = file.Close() }()

	decoder := yaml.NewDecoder(file)
	decoder.KnownFields(true)
	var config surfaceConfig
	if err := decoder.Decode(&config); err != nil {
		return surfaceConfig{}, fmt.Errorf("decode %s: %w", path, err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return surfaceConfig{}, fmt.Errorf("decode %s: multiple YAML documents are not supported", path)
		}
		return surfaceConfig{}, fmt.Errorf("decode %s: %w", path, err)
	}
	return config, nil
}

func collectOperations(path string, document *openapi3.T) (map[string]operationInfo, []finding) {
	operations := make(map[string]operationInfo)
	var findings []finding
	for operationPath, pathItem := range document.Paths.Map() {
		for method, operation := range pathItem.Operations() {
			if operation.OperationID == "" {
				findings = append(findings, finding{
					path:    path,
					message: fmt.Sprintf("%s %s is missing operationId", strings.ToUpper(method), operationPath),
				})
				continue
			}
			operations[operation.OperationID] = operationInfo{
				operation: operation,
				pathItem:  pathItem,
				method:    strings.ToUpper(method),
				path:      operationPath,
			}
		}
	}
	return operations, findings
}

func validateContracts(
	openAPIPath string,
	configPath string,
	operations map[string]operationInfo,
	config surfaceConfig,
) []finding {
	var findings []finding
	for operationID := range operations {
		if _, ok := config.Operations[operationID]; !ok {
			findings = append(findings, finding{
				path:      configPath,
				operation: operationID,
				message:   "missing configuration for OpenAPI operation",
			})
		}
	}
	for operationID := range config.Operations {
		if _, ok := operations[operationID]; !ok {
			findings = append(findings, finding{
				path:      configPath,
				operation: operationID,
				message:   "configuration key does not match an OpenAPI operation",
			})
		}
	}

	operationIDs := make([]string, 0, len(operations))
	for operationID := range operations {
		if _, ok := config.Operations[operationID]; ok {
			operationIDs = append(operationIDs, operationID)
		}
	}
	sort.Strings(operationIDs)

	cliNames := make(map[string]string)
	mcpNames := make(map[string]string)
	cliPattern := regexp.MustCompile(`^[a-z][a-z0-9-]*$`)
	mcpPattern := regexp.MustCompile(`^[a-z][a-z0-9_]*$`)
	for _, operationID := range operationIDs {
		info := operations[operationID]
		decisions := config.Operations[operationID]
		findings = append(findings, validateCLIDecision(configPath, operationID, decisions.CLI)...)
		findings = append(findings, validateMCPDecision(configPath, operationID, decisions.MCP)...)
		findings = append(findings, validateCLICompletion(
			configPath, operationID, decisions.CLI, operations, config,
		)...)

		if decisions.CLI != nil && decisions.CLI.State == "exposed" {
			area, resolutionFindings := resolveCLI(openAPIPath, operationID, info.operation, decisions.CLI)
			findings = append(findings, resolutionFindings...)
			findings = append(findings, validateResolvedName(
				configPath, operationID, "CLI area", area, cliPattern,
			)...)
			findings = append(findings, validateResolvedName(
				configPath, operationID, "CLI command", decisions.CLI.Name, cliPattern,
			)...)
			if area != "" && decisions.CLI.Name != "" {
				key := area + "\x00" + decisions.CLI.Name
				if previous, ok := cliNames[key]; ok {
					findings = append(findings, finding{
						path:      configPath,
						operation: operationID,
						message: fmt.Sprintf(
							"CLI name %q in area %q collides with operation %s",
							decisions.CLI.Name, area, previous,
						),
					})
				} else {
					cliNames[key] = operationID
				}
			}
		}

		if decisions.MCP != nil && decisions.MCP.State == "exposed" {
			group, resolutionFindings := resolveMCP(openAPIPath, operationID, info.operation, decisions.MCP)
			findings = append(findings, resolutionFindings...)
			findings = append(findings, validateResolvedName(
				configPath, operationID, "MCP group", group, mcpPattern,
			)...)
			findings = append(findings, validateResolvedName(
				configPath, operationID, "MCP tool", decisions.MCP.Name, mcpPattern,
			)...)
			if group != "" && decisions.MCP.Name != "" {
				key := group + "\x00" + decisions.MCP.Name
				if previous, ok := mcpNames[key]; ok {
					findings = append(findings, finding{
						path:      configPath,
						operation: operationID,
						message: fmt.Sprintf(
							"MCP name %q in group %q collides with operation %s",
							decisions.MCP.Name, group, previous,
						),
					})
				} else {
					mcpNames[key] = operationID
				}
			}
			findings = append(findings, validateMCPInputSchema(openAPIPath, operationID, info)...)
		}

		if decisions.CLI != nil && decisions.CLI.State == "exposed" ||
			decisions.MCP != nil && decisions.MCP.State == "exposed" {
			findings = append(findings, validateOperationShape(openAPIPath, operationID, info)...)
		}
	}
	return findings
}

func validateCLIDecision(path string, operationID string, decision *cliDecision) []finding {
	if decision == nil {
		return []finding{{
			path:      path,
			operation: operationID,
			message:   "missing CLI decision",
		}}
	}
	return validateDecision(path, operationID, "CLI", decision.State, decision.Name, decision.Reason)
}

func validateCLICompletion(
	path string,
	operationID string,
	decision *cliDecision,
	operations map[string]operationInfo,
	config surfaceConfig,
) []finding {
	if decision == nil || decision.Completion == nil {
		return nil
	}
	completion := decision.Completion
	if decision.State != "exposed" {
		return []finding{{
			path:      path,
			operation: operationID,
			message:   "CLI completion metadata requires an exposed CLI operation",
		}}
	}

	var findings []finding
	stringFields := []struct {
		name  string
		value string
	}{
		{name: "status_operation_id", value: completion.StatusOperationID},
		{name: "run_id_response_field", value: completion.RunIDResponseField},
		{name: "status_path_parameter", value: completion.StatusPathParameter},
		{name: "terminal_field", value: completion.TerminalField},
	}
	for _, field := range stringFields {
		if strings.TrimSpace(field.value) == "" {
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message:   fmt.Sprintf("CLI completion field %q must not be empty", field.name),
			})
		}
	}
	if len(completion.TerminalValues) == 0 {
		findings = append(findings, finding{
			path:      path,
			operation: operationID,
			message:   "CLI completion terminal_values must not be empty",
		})
	}
	findings = append(findings, validateCompletionValues(
		path, operationID, "terminal_values", completion.TerminalValues,
	)...)
	findings = append(findings, validateCompletionValues(
		path, operationID, "failure_values", completion.FailureValues,
	)...)
	findings = append(findings, validateCompletionResponseField(
		path,
		operationID,
		"run_id_response_field",
		completion.RunIDResponseField,
		"trigger operation",
		operations[operationID],
	)...)

	statusInfo, statusExists := operations[completion.StatusOperationID]
	if strings.TrimSpace(completion.StatusOperationID) != "" {
		if !statusExists {
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message: fmt.Sprintf(
					"CLI completion status operation %q does not match an OpenAPI operation",
					completion.StatusOperationID,
				),
			})
		} else if !isExposed(config.Operations[completion.StatusOperationID]) {
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message: fmt.Sprintf(
					"CLI completion status operation %q has no generated invoker",
					completion.StatusOperationID,
				),
			})
		}
	}
	if statusExists {
		findings = append(findings, validateCompletionResponseField(
			path,
			operationID,
			"terminal_field",
			completion.TerminalField,
			fmt.Sprintf("status operation %q", completion.StatusOperationID),
			statusInfo,
		)...)
		findings = append(findings, validateCompletionEnumValues(
			path, operationID, completion, statusInfo,
		)...)
	}
	if statusExists && strings.TrimSpace(completion.StatusPathParameter) != "" &&
		!operationHasPathParameter(statusInfo, completion.StatusPathParameter) {
		findings = append(findings, finding{
			path:      path,
			operation: operationID,
			message: fmt.Sprintf(
				"CLI completion status path parameter %q is not declared by operation %q",
				completion.StatusPathParameter, completion.StatusOperationID,
			),
		})
	}

	terminalValues := make(map[string]struct{}, len(completion.TerminalValues))
	for _, value := range completion.TerminalValues {
		terminalValues[value] = struct{}{}
	}
	for _, value := range completion.FailureValues {
		if _, ok := terminalValues[value]; !ok {
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message: fmt.Sprintf(
					"CLI completion failure value %q is not a terminal value", value,
				),
			})
		}
	}
	return findings
}

func validateCompletionResponseField(
	path string,
	operationID string,
	metadataName string,
	field string,
	responseSource string,
	info operationInfo,
) []finding {
	if strings.TrimSpace(field) == "" {
		return nil
	}

	var findings []finding
	foundSchema := false
	if responses := info.operation.Responses; responses != nil {
		for _, status := range responses.Keys() {
			statusCode, err := strconv.Atoi(status)
			if err != nil || statusCode < 200 || statusCode >= 300 {
				continue
			}
			response := responses.Value(status)
			if response == nil || response.Value == nil {
				continue
			}
			for contentType, media := range response.Value.Content {
				parsedType, _, err := mime.ParseMediaType(contentType)
				isJSON := err == nil &&
					(parsedType == "application/json" || strings.HasSuffix(parsedType, "+json"))
				if !isJSON || media == nil || media.Schema == nil || media.Schema.Value == nil {
					continue
				}
				foundSchema = true
				if !schemaDeclaresProperty(media.Schema, field, make(map[*openapi3.Schema]struct{})) {
					findings = append(findings, finding{
						path:      path,
						operation: operationID,
						message: fmt.Sprintf(
							"CLI completion %s %q is not declared by %s response %s",
							metadataName, field, responseSource, status,
						),
					})
				}
			}
		}
	}
	if !foundSchema {
		findings = append(findings, finding{
			path:      path,
			operation: operationID,
			message: fmt.Sprintf(
				"CLI completion %s %q cannot be validated because %s has no successful JSON response schema",
				metadataName, field, responseSource,
			),
		})
	}
	return findings
}

func validateCompletionEnumValues(
	path string,
	operationID string,
	completion *cliCompletion,
	info operationInfo,
) []finding {
	if strings.TrimSpace(completion.TerminalField) == "" {
		return nil
	}

	var enumValues []any
	if responses := info.operation.Responses; responses != nil {
		for _, status := range responses.Keys() {
			statusCode, err := strconv.Atoi(status)
			if err != nil || statusCode < 200 || statusCode >= 300 {
				continue
			}
			response := responses.Value(status)
			if response == nil || response.Value == nil {
				continue
			}
			for contentType, media := range response.Value.Content {
				parsedType, _, err := mime.ParseMediaType(contentType)
				isJSON := err == nil &&
					(parsedType == "application/json" || strings.HasSuffix(parsedType, "+json"))
				if !isJSON || media == nil || media.Schema == nil {
					continue
				}
				for _, fieldSchema := range schemasForProperty(
					media.Schema, completion.TerminalField, make(map[*openapi3.Schema]struct{}),
				) {
					enumValues = append(enumValues, resolvedSchemaEnum(fieldSchema, make(map[*openapi3.Schema]struct{}))...)
				}
			}
		}
	}
	if len(enumValues) == 0 {
		return nil
	}

	allowed := make(map[string]struct{}, len(enumValues))
	for _, value := range enumValues {
		text, ok := value.(string)
		if !ok {
			continue
		}
		allowed[text] = struct{}{}
	}
	var findings []finding
	for field, values := range map[string][]string{
		"terminal_values": completion.TerminalValues,
		"failure_values":  completion.FailureValues,
	} {
		for _, value := range values {
			if _, ok := allowed[value]; ok {
				continue
			}
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message: fmt.Sprintf(
					"CLI completion %s value %q is not declared by terminal field %q enum",
					field, value, completion.TerminalField,
				),
			})
		}
	}
	return findings
}

func schemasForProperty(
	schemaRef *openapi3.SchemaRef,
	field string,
	visited map[*openapi3.Schema]struct{},
) []*openapi3.Schema {
	if schemaRef == nil || schemaRef.Value == nil {
		return nil
	}
	schema := schemaRef.Value
	if _, ok := visited[schema]; ok {
		return nil
	}
	visited[schema] = struct{}{}
	var found []*openapi3.Schema
	if property := schema.Properties[field]; property != nil && property.Value != nil {
		found = append(found, property.Value)
	}
	for _, schemas := range []openapi3.SchemaRefs{schema.AllOf, schema.AnyOf, schema.OneOf} {
		for _, composed := range schemas {
			found = append(found, schemasForProperty(composed, field, visited)...)
		}
	}
	return found
}

func resolvedSchemaEnum(schema *openapi3.Schema, visited map[*openapi3.Schema]struct{}) []any {
	if schema == nil {
		return nil
	}
	if _, ok := visited[schema]; ok {
		return nil
	}
	visited[schema] = struct{}{}
	values := append([]any(nil), schema.Enum...)
	for _, schemas := range []openapi3.SchemaRefs{schema.AllOf, schema.AnyOf, schema.OneOf} {
		for _, composed := range schemas {
			if composed != nil {
				values = append(values, resolvedSchemaEnum(composed.Value, visited)...)
			}
		}
	}
	return values
}

func schemaDeclaresProperty(
	schemaRef *openapi3.SchemaRef,
	field string,
	visited map[*openapi3.Schema]struct{},
) bool {
	if schemaRef == nil || schemaRef.Value == nil {
		return false
	}
	schema := schemaRef.Value
	if _, ok := visited[schema]; ok {
		return false
	}
	visited[schema] = struct{}{}
	if _, ok := schema.Properties[field]; ok {
		return true
	}
	for _, schemas := range []openapi3.SchemaRefs{schema.AllOf, schema.AnyOf, schema.OneOf} {
		for _, composed := range schemas {
			if schemaDeclaresProperty(composed, field, visited) {
				return true
			}
		}
	}
	return false
}

func validateCompletionValues(path string, operationID string, field string, values []string) []finding {
	var findings []finding
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message:   fmt.Sprintf("CLI completion %s contains an empty value", field),
			})
			continue
		}
		if _, ok := seen[value]; ok {
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message:   fmt.Sprintf("CLI completion %s contains duplicate value %q", field, value),
			})
		}
		seen[value] = struct{}{}
	}
	return findings
}

func operationHasPathParameter(info operationInfo, name string) bool {
	for _, parameters := range []openapi3.Parameters{info.pathItem.Parameters, info.operation.Parameters} {
		for _, parameterRef := range parameters {
			if parameterRef != nil && parameterRef.Value != nil &&
				parameterRef.Value.In == openapi3.ParameterInPath && parameterRef.Value.Name == name {
				return true
			}
		}
	}
	return false
}

func validateMCPDecision(path string, operationID string, decision *mcpDecision) []finding {
	if decision == nil {
		return []finding{{
			path:      path,
			operation: operationID,
			message:   "missing MCP decision",
		}}
	}
	findings := validateDecision(path, operationID, "MCP", decision.State, decision.Name, decision.Reason)
	if decision.State == "exposed" {
		findings = append(findings, validateMCPAnnotations(path, operationID, decision.Annotations)...)
	}
	return findings
}

func validateDecision(
	path string,
	operationID string,
	surface string,
	state string,
	name string,
	reason string,
) []finding {
	var findings []finding
	switch state {
	case "exposed":
		if strings.TrimSpace(name) == "" {
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message:   fmt.Sprintf("%s exposure is missing a name", surface),
			})
		}
	case "excluded":
		if strings.TrimSpace(reason) == "" {
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message:   fmt.Sprintf("%s exclusion is missing a reason", surface),
			})
		}
	default:
		findings = append(findings, finding{
			path:      path,
			operation: operationID,
			message:   fmt.Sprintf("%s state %q must be exposed or excluded", surface, state),
		})
	}
	return findings
}

func validateMCPAnnotations(path string, operationID string, annotations *mcpAnnotations) []finding {
	if annotations == nil {
		return []finding{{
			path:      path,
			operation: operationID,
			message:   "MCP exposure is missing annotations",
		}}
	}

	values := []struct {
		name  string
		value *bool
	}{
		{name: "read_only", value: annotations.ReadOnly},
		{name: "destructive", value: annotations.Destructive},
		{name: "idempotent", value: annotations.Idempotent},
		{name: "open_world", value: annotations.OpenWorld},
	}
	var findings []finding
	for _, annotation := range values {
		if annotation.value == nil {
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message:   fmt.Sprintf("MCP exposure is missing annotation %q", annotation.name),
			})
		}
	}
	return findings
}

func resolveCLI(
	path string,
	operationID string,
	operation *openapi3.Operation,
	decision *cliDecision,
) (string, []finding) {
	if decision.Area != "" {
		return decision.Area, nil
	}
	if len(operation.Tags) == 1 {
		if tag := operation.Tags[0]; strings.TrimSpace(tag) != "" {
			return tag, nil
		}
		return "", []finding{{
			path:      path,
			operation: operationID,
			message:   "CLI area cannot be resolved: the sole OpenAPI tag is empty",
		}}
	}
	return "", []finding{{
		path:      path,
		operation: operationID,
		message: fmt.Sprintf(
			"CLI area cannot be resolved: area is omitted and OpenAPI operation has %d tags",
			len(operation.Tags),
		),
	}}
}

func resolveMCP(
	path string,
	operationID string,
	operation *openapi3.Operation,
	decision *mcpDecision,
) (string, []finding) {
	if decision.Group != "" {
		return decision.Group, nil
	}
	if len(operation.Tags) == 1 {
		if tag := operation.Tags[0]; strings.TrimSpace(tag) != "" {
			return strings.ReplaceAll(tag, "-", "_"), nil
		}
		return "", []finding{{
			path:      path,
			operation: operationID,
			message:   "MCP group cannot be resolved: the sole OpenAPI tag is empty",
		}}
	}
	return "", []finding{{
		path:      path,
		operation: operationID,
		message: fmt.Sprintf(
			"MCP group cannot be resolved: group is omitted and OpenAPI operation has %d tags",
			len(operation.Tags),
		),
	}}
}

func validateResolvedName(
	path string,
	operationID string,
	kind string,
	value string,
	pattern *regexp.Regexp,
) []finding {
	if value == "" || pattern.MatchString(value) {
		return nil
	}
	return []finding{{
		path:      path,
		operation: operationID,
		message:   fmt.Sprintf("%s %q has an invalid name", kind, value),
	}}
}

func validateOperationShape(path string, operationID string, info operationInfo) []finding {
	var findings []finding
	if requestBody := info.operation.RequestBody; requestBody != nil && requestBody.Value != nil {
		findings = append(findings, validateContent(path, operationID, "request", requestBody.Value.Content)...)
		if err := validateTypelessEnums(requestBodySchema(requestBody), make(map[*openapi3.Schema]struct{})); err != nil {
			findings = append(findings, finding{
				path: path, operation: operationID,
				message: fmt.Sprintf("request body schema is unsupported: %v", err),
			})
		}
	}
	if responses := info.operation.Responses; responses != nil {
		for _, status := range responses.Keys() {
			response := responses.Value(status)
			if response == nil || response.Value == nil {
				continue
			}
			findings = append(findings, validateContent(
				path, operationID, "response "+status, response.Value.Content,
			)...)
		}
	}

	for _, parameterRef := range effectiveOperationParameters(info) {
		if parameterRef == nil || parameterRef.Value == nil {
			continue
		}
		parameter := parameterRef.Value
		if parameter.In != openapi3.ParameterInPath && parameter.In != openapi3.ParameterInQuery {
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message: fmt.Sprintf(
					"parameter %q uses unsupported location %q; only path and query are supported",
					parameter.Name, parameter.In,
				),
			})
			continue
		}
		if !supportedParameterSchema(parameter.Schema) {
			findings = append(findings, finding{
				path:      path,
				operation: operationID,
				message: fmt.Sprintf(
					"%s parameter %q must use a scalar, enum, or array-of-scalar schema",
					parameter.In, parameter.Name,
				),
			})
		}
	}
	return findings
}

func validateMCPInputSchema(path string, operationID string, info operationInfo) []finding {
	names := make(map[string]struct{})
	for _, parameterRef := range effectiveOperationParameters(info) {
		if parameterRef == nil || parameterRef.Value == nil {
			continue
		}
		parameter := parameterRef.Value
		if _, exists := names[parameter.Name]; exists {
			return []finding{{
				path: path, operation: operationID,
				message: fmt.Sprintf("MCP input parameter name %q collides across locations", parameter.Name),
			}}
		}
		names[parameter.Name] = struct{}{}
		if parameter.Schema == nil || parameter.Schema.Value == nil {
			return []finding{{
				path: path, operation: operationID,
				message: fmt.Sprintf("MCP input schema for %s parameter %q is unresolved", parameter.In, parameter.Name),
			}}
		}
		if _, err := convertMCPJSONSchema(parameter.Schema.Value); err != nil {
			return []finding{{
				path: path, operation: operationID,
				message: fmt.Sprintf("MCP input schema for %s parameter %q is unsupported: %v", parameter.In, parameter.Name, err),
			}}
		}
	}
	if requestBody := info.operation.RequestBody; requestBody != nil && requestBody.Value != nil {
		if _, exists := names["body"]; exists {
			return []finding{{
				path: path, operation: operationID,
				message: "MCP input parameter name \"body\" collides with the request body property",
			}}
		}
		if _, err := convertMCPJSONSchema(requestBodySchema(requestBody)); err != nil {
			return []finding{{
				path: path, operation: operationID,
				message: fmt.Sprintf("MCP request body schema is unsupported: %v", err),
			}}
		}
	}
	return nil
}

func effectiveOperationParameters(info operationInfo) openapi3.Parameters {
	overridden := make(map[[2]string]struct{}, len(info.operation.Parameters))
	for _, parameterRef := range info.operation.Parameters {
		if parameterRef != nil && parameterRef.Value != nil {
			parameter := parameterRef.Value
			overridden[[2]string{parameter.Name, parameter.In}] = struct{}{}
		}
	}
	parameters := make(openapi3.Parameters, 0, len(info.pathItem.Parameters)+len(info.operation.Parameters))
	for _, parameterRef := range info.pathItem.Parameters {
		if parameterRef != nil && parameterRef.Value != nil {
			parameter := parameterRef.Value
			if _, exists := overridden[[2]string{parameter.Name, parameter.In}]; exists {
				continue
			}
		}
		parameters = append(parameters, parameterRef)
	}
	return append(parameters, info.operation.Parameters...)
}

func validateContent(path string, operationID string, kind string, content openapi3.Content) []finding {
	var findings []finding
	for contentType := range content {
		mediaType, _, err := mime.ParseMediaType(contentType)
		if err == nil && (mediaType == "application/json" || strings.HasSuffix(mediaType, "+json")) {
			continue
		}
		findings = append(findings, finding{
			path:      path,
			operation: operationID,
			message: fmt.Sprintf(
				"%s content type %q is unsupported; only JSON is supported",
				kind, contentType,
			),
		})
	}
	return findings
}

func supportedParameterSchema(schemaRef *openapi3.SchemaRef) bool {
	if schemaRef == nil || schemaRef.Value == nil {
		return false
	}
	return supportedScalarOrEnum(schemaRef.Value, true)
}

func supportedScalarOrEnum(schema *openapi3.Schema, allowArray bool) bool {
	if len(schema.Enum) > 0 {
		if schema.Type.Is(openapi3.TypeArray) || schema.Type.Is(openapi3.TypeObject) {
			return false
		}
		if schema.Type == nil || schema.Type.IsEmpty() {
			for _, value := range schema.Enum {
				if _, ok := value.(string); !ok {
					return false
				}
			}
			return true
		}
		for _, value := range schema.Enum {
			if !isScalarEnumValue(value) {
				return false
			}
		}
		return true
	}
	if schema.Type.Is(openapi3.TypeString) ||
		schema.Type.Is(openapi3.TypeInteger) ||
		schema.Type.Is(openapi3.TypeNumber) ||
		schema.Type.Is(openapi3.TypeBoolean) {
		return true
	}
	if !allowArray || !schema.Type.Is(openapi3.TypeArray) || schema.Items == nil || schema.Items.Value == nil {
		return false
	}
	return supportedScalarOrEnum(schema.Items.Value, false)
}

func validateTypelessEnums(schema *openapi3.Schema, visited map[*openapi3.Schema]struct{}) error {
	if schema == nil {
		return nil
	}
	if _, ok := visited[schema]; ok {
		return nil
	}
	visited[schema] = struct{}{}
	if len(schema.Enum) > 0 && (schema.Type == nil || schema.Type.IsEmpty()) {
		for _, value := range schema.Enum {
			if _, ok := value.(string); !ok {
				return errors.New("enum without a type must contain only string values")
			}
		}
	}
	for name, property := range schema.Properties {
		if property != nil {
			if err := validateTypelessEnums(property.Value, visited); err != nil {
				return fmt.Errorf("property %q: %w", name, err)
			}
		}
	}
	if schema.Items != nil {
		if err := validateTypelessEnums(schema.Items.Value, visited); err != nil {
			return fmt.Errorf("items: %w", err)
		}
	}
	compositions := []struct {
		keyword string
		refs    openapi3.SchemaRefs
	}{
		{keyword: "allOf", refs: schema.AllOf},
		{keyword: "anyOf", refs: schema.AnyOf},
		{keyword: "oneOf", refs: schema.OneOf},
	}
	for _, composition := range compositions {
		for index, ref := range composition.refs {
			if ref != nil {
				if err := validateTypelessEnums(ref.Value, visited); err != nil {
					return fmt.Errorf("%s item %d: %w", composition.keyword, index, err)
				}
			}
		}
	}
	if schema.Not != nil {
		if err := validateTypelessEnums(schema.Not.Value, visited); err != nil {
			return fmt.Errorf("not: %w", err)
		}
	}
	return nil
}

func isScalarEnumValue(value any) bool {
	switch value.(type) {
	case string, bool,
		int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64,
		float32, float64:
		return true
	default:
		return false
	}
}

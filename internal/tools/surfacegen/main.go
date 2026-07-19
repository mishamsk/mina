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
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"gopkg.in/yaml.v3"
)

const (
	defaultOpenAPIPath = "api/openapi.yaml"
	defaultConfigPath  = "api/client-surfaces.yaml"
)

type surfaceConfig struct {
	Operations map[string]operationConfig `yaml:"operations"`
}

type operationConfig struct {
	CLI *cliDecision `yaml:"cli"`
	MCP *mcpDecision `yaml:"mcp"`
}

type cliDecision struct {
	State  string `yaml:"state"`
	Area   string `yaml:"area,omitempty"`
	Name   string `yaml:"name,omitempty"`
	Reason string `yaml:"reason,omitempty"`
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
	flag.Parse()

	if !*check || flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "usage: surfacegen -check [-openapi path] [-config path]")
		os.Exit(2)
	}

	findings, err := validate(*openAPIPath, *configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "surfacegen: %v\n", err)
		os.Exit(2)
	}
	if len(findings) == 0 {
		return
	}

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
	os.Exit(1)
}

func validate(openAPIPath string, configPath string) ([]finding, error) {
	document, err := openapi3.NewLoader().LoadFromFile(openAPIPath)
	if err != nil {
		return nil, fmt.Errorf("load %s: %w", openAPIPath, err)
	}
	if err := document.Validate(context.Background()); err != nil {
		return nil, fmt.Errorf("validate %s: %w", openAPIPath, err)
	}

	config, err := loadSurfaceConfig(configPath)
	if err != nil {
		return nil, err
	}

	operations, findings := collectOperations(openAPIPath, document)
	findings = append(findings, validateContracts(openAPIPath, configPath, operations, config)...)
	return findings, nil
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

	overriddenParameters := make(map[[2]string]struct{}, len(info.operation.Parameters))
	for _, parameterRef := range info.operation.Parameters {
		if parameterRef != nil && parameterRef.Value != nil {
			parameter := parameterRef.Value
			overriddenParameters[[2]string{parameter.Name, parameter.In}] = struct{}{}
		}
	}

	parameters := make(openapi3.Parameters, 0, len(info.pathItem.Parameters)+len(info.operation.Parameters))
	for _, parameterRef := range info.pathItem.Parameters {
		if parameterRef != nil && parameterRef.Value != nil {
			parameter := parameterRef.Value
			if _, overridden := overriddenParameters[[2]string{parameter.Name, parameter.In}]; overridden {
				continue
			}
		}
		parameters = append(parameters, parameterRef)
	}
	parameters = append(parameters, info.operation.Parameters...)
	for _, parameterRef := range parameters {
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

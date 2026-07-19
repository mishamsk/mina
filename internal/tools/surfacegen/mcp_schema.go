package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/oapi-codegen/oapi-codegen/v2/pkg/codegen"
)

func buildMCPInputSchema(operation codegen.OperationDefinition) ([]byte, error) {
	properties := make(map[string]any)
	var required []string

	for _, parameter := range operation.PathParams {
		if err := addMCPParameterSchema(properties, parameter); err != nil {
			return nil, fmt.Errorf("path parameter %q: %w", parameter.ParamName, err)
		}
		required = append(required, parameter.ParamName)
	}
	for _, parameter := range operation.QueryParams {
		if err := addMCPParameterSchema(properties, parameter); err != nil {
			return nil, fmt.Errorf("query parameter %q: %w", parameter.ParamName, err)
		}
		if parameter.Required {
			required = append(required, parameter.ParamName)
		}
	}
	if operation.HasBody() {
		if _, exists := properties["body"]; exists {
			return nil, errors.New("parameter name collides with reserved body property")
		}
		body, err := convertMCPJSONSchema(requestBodySchema(operation.Spec.RequestBody))
		if err != nil {
			return nil, fmt.Errorf("request body: %w", err)
		}
		properties["body"] = body
		if operation.BodyRequired {
			required = append(required, "body")
		}
	}

	sort.Strings(required)
	schema := map[string]any{
		"additionalProperties": false,
		"properties":           properties,
		"type":                 "object",
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	encoded, err := json.Marshal(schema)
	if err != nil {
		return nil, fmt.Errorf("marshal schema: %w", err)
	}
	return encoded, nil
}

func addMCPParameterSchema(properties map[string]any, parameter codegen.ParameterDefinition) error {
	if _, exists := properties[parameter.ParamName]; exists {
		return errors.New("name collides with another parameter")
	}
	schema, err := convertMCPJSONSchema(parameter.Schema.OAPISchema)
	if err != nil {
		return err
	}
	if parameter.Spec.Description != "" {
		schema["description"] = parameter.Spec.Description
	}
	properties[parameter.ParamName] = schema
	return nil
}

func convertMCPJSONSchema(schema *openapi3.Schema) (map[string]any, error) {
	if schema == nil {
		return nil, errors.New("schema is unresolved")
	}
	if err := rejectUnsupportedMCPJSONSchema(schema); err != nil {
		return nil, err
	}

	converted := make(map[string]any)
	if schema.Title != "" {
		converted["title"] = schema.Title
	}
	if schema.Description != "" {
		converted["description"] = schema.Description
	}
	if schema.Format != "" {
		converted["format"] = schema.Format
	}
	if schema.Default != nil {
		converted["default"] = schema.Default
	}
	if len(schema.Enum) > 0 {
		converted["enum"] = schema.Enum
	}

	schemaType, err := effectiveOpenAPIType(schema)
	if err != nil {
		return nil, err
	}
	if schemaType != "" {
		converted["type"] = schemaType
	}

	if schema.Min != nil {
		if schema.ExclusiveMin.IsTrue() {
			converted["exclusiveMinimum"] = *schema.Min
		} else {
			converted["minimum"] = *schema.Min
		}
	}
	if schema.Max != nil {
		if schema.ExclusiveMax.IsTrue() {
			converted["exclusiveMaximum"] = *schema.Max
		} else {
			converted["maximum"] = *schema.Max
		}
	}
	if schema.MultipleOf != nil {
		converted["multipleOf"] = *schema.MultipleOf
	}
	if schema.MinLength > 0 {
		converted["minLength"] = schema.MinLength
	}
	if schema.MaxLength != nil {
		converted["maxLength"] = *schema.MaxLength
	}
	if schema.Pattern != "" {
		converted["pattern"] = schema.Pattern
	}
	if schema.MinItems > 0 {
		converted["minItems"] = schema.MinItems
	}
	if schema.MaxItems != nil {
		converted["maxItems"] = *schema.MaxItems
	}
	if schema.UniqueItems {
		converted["uniqueItems"] = true
	}
	if schema.Items != nil {
		items, err := convertMCPJSONSchema(schema.Items.Value)
		if err != nil {
			return nil, fmt.Errorf("items: %w", err)
		}
		converted["items"] = items
	}

	if len(schema.Properties) > 0 {
		properties := make(map[string]any, len(schema.Properties))
		for name, propertyRef := range schema.Properties {
			if propertyRef == nil {
				return nil, fmt.Errorf("property %q: schema is unresolved", name)
			}
			property, err := convertMCPJSONSchema(propertyRef.Value)
			if err != nil {
				return nil, fmt.Errorf("property %q: %w", name, err)
			}
			properties[name] = property
		}
		converted["properties"] = properties
	}
	if len(schema.Required) > 0 {
		required := append([]string(nil), schema.Required...)
		sort.Strings(required)
		converted["required"] = required
	}
	if schema.MinProps > 0 {
		converted["minProperties"] = schema.MinProps
	}
	if schema.MaxProps != nil {
		converted["maxProperties"] = *schema.MaxProps
	}
	if schema.AdditionalProperties.Has != nil {
		converted["additionalProperties"] = *schema.AdditionalProperties.Has
	} else if schema.AdditionalProperties.Schema != nil {
		additional, err := convertMCPJSONSchema(schema.AdditionalProperties.Schema.Value)
		if err != nil {
			return nil, fmt.Errorf("additional properties: %w", err)
		}
		converted["additionalProperties"] = additional
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
		if len(composition.refs) == 0 {
			continue
		}
		items := make([]any, 0, len(composition.refs))
		for index, ref := range composition.refs {
			if ref == nil {
				return nil, fmt.Errorf("%s item %d: schema is unresolved", composition.keyword, index)
			}
			item, err := convertMCPJSONSchema(ref.Value)
			if err != nil {
				return nil, fmt.Errorf("%s item %d: %w", composition.keyword, index, err)
			}
			items = append(items, item)
		}
		converted[composition.keyword] = items
	}
	if schema.Not != nil {
		if schema.Not.Value == nil {
			return nil, errors.New("not: schema is unresolved")
		}
		notSchema, err := convertMCPJSONSchema(schema.Not.Value)
		if err != nil {
			return nil, fmt.Errorf("not: %w", err)
		}
		converted["not"] = notSchema
	}

	if !schema.Nullable {
		return converted, nil
	}
	return map[string]any{
		"anyOf": []any{converted, map[string]any{"type": "null"}},
	}, nil
}

func effectiveOpenAPIType(schema *openapi3.Schema) (string, error) {
	if schema.Type != nil && schema.Type.IsMultiple() {
		return "", errors.New("multiple schema types are unsupported for OpenAPI 3.0 input")
	}
	for _, name := range []string{
		openapi3.TypeArray,
		openapi3.TypeObject,
		openapi3.TypeString,
		openapi3.TypeInteger,
		openapi3.TypeNumber,
		openapi3.TypeBoolean,
	} {
		if schema.Type.Is(name) {
			return name, nil
		}
	}
	if schema.Type != nil && !schema.Type.IsEmpty() {
		return "", fmt.Errorf("schema type %v is unsupported", schema.Type.Slice())
	}
	if len(schema.Enum) == 0 {
		return "", nil
	}
	for _, value := range schema.Enum {
		if _, ok := value.(string); !ok {
			return "", errors.New("enum without a type must contain only string values")
		}
	}
	return openapi3.TypeString, nil
}

func rejectUnsupportedMCPJSONSchema(schema *openapi3.Schema) error {
	if schema.ExclusiveMin.Value != nil || schema.ExclusiveMax.Value != nil ||
		schema.Const != nil || len(schema.Examples) > 0 || len(schema.PrefixItems) > 0 ||
		schema.Contains != nil || schema.MinContains != nil || schema.MaxContains != nil ||
		len(schema.PatternProperties) > 0 || len(schema.DependentSchemas) > 0 ||
		schema.PropertyNames != nil || schema.UnevaluatedItems.Has != nil ||
		schema.UnevaluatedItems.Schema != nil || schema.UnevaluatedProperties.Has != nil ||
		schema.UnevaluatedProperties.Schema != nil || schema.If != nil || schema.Then != nil ||
		schema.Else != nil || len(schema.DependentRequired) > 0 || len(schema.Defs) > 0 ||
		schema.SchemaDialect != "" || schema.Comment != "" || schema.SchemaID != "" ||
		schema.Anchor != "" || schema.DynamicRef != "" || schema.DynamicAnchor != "" ||
		schema.ContentMediaType != "" || schema.ContentEncoding != "" || schema.ContentSchema != nil {
		return errors.New("uses unsupported OpenAPI 3.1 schema keywords")
	}
	if schema.Discriminator != nil || schema.XML != nil || schema.ExternalDocs != nil {
		return errors.New("uses unsupported OpenAPI schema metadata")
	}
	if schema.ExclusiveMin.IsTrue() && schema.Min == nil {
		return errors.New("exclusiveMinimum requires minimum in OpenAPI 3.0")
	}
	if schema.ExclusiveMax.IsTrue() && schema.Max == nil {
		return errors.New("exclusiveMaximum requires maximum in OpenAPI 3.0")
	}
	return nil
}

package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"

	"github.com/BurntSushi/toml"
)

const (
	configDirEnv  = "XDG_CONFIG_PATH"
	configRelPath = "mina/config.toml"
)

const (
	defaultServeHost = "127.0.0.1"
	defaultServePort = 8080
)

type configScope string

const (
	sharedScope configScope = "shared"
	serveScope  configScope = "serve"
)

// ConfigFileHelp documents the local config file path used by the loader.
const ConfigFileHelp = "$XDG_CONFIG_PATH/mina/config.toml"

// SharedHelp documents config sources common to all commands.
func SharedHelp() string {
	return buildHelp(sharedScope)
}

// ServeHelp documents serve-specific config sources.
func ServeHelp() string {
	return buildHelp(sharedScope, serveScope)
}

// Config contains source-loaded database lifecycle settings.
type Config struct {
	DatabasePath     string
	AccountingSchema string
}

// ServeConfig contains source-loaded REST listener and database settings.
type ServeConfig struct {
	Config
	Host          string
	Port          int
	AccessLogPath string
	Quiet         bool
}

// Value is an optional command-line value.
type Value[T any] struct {
	Val   T
	IsSet bool
}

// Set returns an optional command-line value marked as explicitly provided.
func Set[T any](value T) Value[T] {
	return Value[T]{
		Val:   value,
		IsSet: true,
	}
}

// CommandConfig controls command behavior outside runtime app composition.
type CommandConfig struct {
	AssumeYes bool
}

// LoadOptions controls config source discovery.
type LoadOptions struct {
	ConfigFilePath string
}

// SharedCLI contains explicit command-line values common to Mina commands.
type SharedCLI struct {
	DatabasePath     Value[string]
	AccountingSchema Value[string]
	AssumeYes        Value[bool]
}

// ServeCLI contains explicit command-line values for the serve command.
type ServeCLI struct {
	SharedCLI
	Host          Value[string]
	Port          Value[int]
	AccessLogPath Value[string]
	Quiet         Value[bool]
}

type fileConfig struct {
	DatabasePath     *string         `toml:"db" env:"MINA_DB" flag:"db" scope:"shared"`
	AccountingSchema *string         `toml:"schema" env:"MINA_SCHEMA" flag:"schema" scope:"shared"`
	AssumeYes        *bool           `toml:"yes" env:"MINA_YES" flag:"yes" scope:"shared"`
	Serve            serveFileConfig `toml:"serve" scope:"serve"`
}

type serveFileConfig struct {
	Host          *string `toml:"host" env:"MINA_HOST" flag:"host"`
	Port          *int    `toml:"port" env:"MINA_PORT" flag:"port"`
	AccessLogPath *string `toml:"access_log" env:"MINA_ACCESS_LOG" flag:"access-log"`
	Quiet         *bool   `toml:"quiet" env:"MINA_QUIET" flag:"quiet"`
}

// DefaultServeConfig returns Mina's REST server defaults.
func DefaultServeConfig() ServeConfig {
	return ServeConfig{
		Host: defaultServeHost,
		Port: defaultServePort,
	}
}

// LoadServe returns the serve command config using Mina's source precedence.
func LoadServe(opts LoadOptions, cli ServeCLI) (ServeConfig, CommandConfig, error) {
	cfg := DefaultServeConfig()
	commandCfg := CommandConfig{}

	fileCfg, err := loadFileConfig(opts)
	if err != nil {
		return ServeConfig{}, CommandConfig{}, err
	}
	applySharedFile(&cfg.Config, &commandCfg, fileCfg)
	applyServeFile(&cfg, fileCfg)

	envCfg, err := loadEnvConfig()
	if err != nil {
		return ServeConfig{}, CommandConfig{}, err
	}
	applySharedFile(&cfg.Config, &commandCfg, envCfg)
	applyServeFile(&cfg, envCfg)

	applySharedCLI(&cfg.Config, &commandCfg, cli.SharedCLI)
	applyServeCLI(&cfg, cli)

	return cfg, commandCfg, nil
}

// LoadMigrate returns the migrate command config using Mina's source precedence.
func LoadMigrate(opts LoadOptions, cli SharedCLI) (Config, CommandConfig, error) {
	cfg := Config{}
	commandCfg := CommandConfig{}

	fileCfg, err := loadFileConfig(opts)
	if err != nil {
		return Config{}, CommandConfig{}, err
	}
	applySharedFile(&cfg, &commandCfg, fileCfg)

	envCfg, err := loadEnvConfig()
	if err != nil {
		return Config{}, CommandConfig{}, err
	}
	applySharedFile(&cfg, &commandCfg, envCfg)

	applySharedCLI(&cfg, &commandCfg, cli)

	return cfg, commandCfg, nil
}

// FlagSourceHelp returns a CLI help suffix for the config field bound to flag.
func FlagSourceHelp(flag string) string {
	field, ok := findConfigFieldByFlag(flag)
	if !ok {
		return ""
	}

	return fmt.Sprintf("(config: %s; env: %s)", field.configPath(), field.env)
}

func loadFileConfig(opts LoadOptions) (fileConfig, error) {
	var cfg fileConfig
	path := configFilePath(opts)
	if path == "" {
		return cfg, nil
	}

	_, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return cfg, nil
	}
	if err != nil {
		return cfg, fmt.Errorf("stat config file %s: %w", path, err)
	}
	meta, err := toml.DecodeFile(path, &cfg)
	if err != nil {
		return cfg, fmt.Errorf("read config file %s: %w", path, err)
	}
	if undecoded := meta.Undecoded(); len(undecoded) > 0 {
		return cfg, fmt.Errorf("read config file %s: unsupported key %s", path, undecoded[0].String())
	}

	return cfg, nil
}

func configFilePath(opts LoadOptions) string {
	if opts.ConfigFilePath != "" {
		return opts.ConfigFilePath
	}

	configDir := os.Getenv(configDirEnv)
	if configDir == "" {
		return ""
	}

	return filepath.Join(configDir, configRelPath)
}

func loadEnvConfig() (fileConfig, error) {
	var cfg fileConfig
	err := walkConfigFields(&cfg, func(field configField) error {
		if field.env == "" {
			return nil
		}

		value, ok := os.LookupEnv(field.env)
		if !ok {
			return nil
		}

		parsed, err := parseEnvValue(field.env, value, field.value.Type().Elem())
		if err != nil {
			return err
		}
		pointer := reflect.New(field.value.Type().Elem())
		pointer.Elem().Set(parsed)
		field.value.Set(pointer)

		return nil
	})
	if err != nil {
		return fileConfig{}, err
	}

	return cfg, nil
}

func applySharedFile(cfg *Config, commandCfg *CommandConfig, fileCfg fileConfig) {
	if fileCfg.DatabasePath != nil {
		cfg.DatabasePath = *fileCfg.DatabasePath
	}
	if fileCfg.AccountingSchema != nil {
		cfg.AccountingSchema = *fileCfg.AccountingSchema
	}
	if fileCfg.AssumeYes != nil {
		commandCfg.AssumeYes = *fileCfg.AssumeYes
	}
}

func applyServeFile(cfg *ServeConfig, fileCfg fileConfig) {
	if fileCfg.Serve.Host != nil {
		cfg.Host = *fileCfg.Serve.Host
	}
	if fileCfg.Serve.Port != nil {
		cfg.Port = *fileCfg.Serve.Port
	}
	if fileCfg.Serve.AccessLogPath != nil {
		cfg.AccessLogPath = *fileCfg.Serve.AccessLogPath
	}
	if fileCfg.Serve.Quiet != nil {
		cfg.Quiet = *fileCfg.Serve.Quiet
	}
}

func applySharedCLI(cfg *Config, commandCfg *CommandConfig, cli SharedCLI) {
	if cli.DatabasePath.IsSet {
		cfg.DatabasePath = cli.DatabasePath.Val
	}
	if cli.AccountingSchema.IsSet {
		cfg.AccountingSchema = cli.AccountingSchema.Val
	}
	if cli.AssumeYes.IsSet {
		commandCfg.AssumeYes = cli.AssumeYes.Val
	}
}

func applyServeCLI(cfg *ServeConfig, cli ServeCLI) {
	if cli.Host.IsSet {
		cfg.Host = cli.Host.Val
	}
	if cli.Port.IsSet {
		cfg.Port = cli.Port.Val
	}
	if cli.AccessLogPath.IsSet {
		cfg.AccessLogPath = cli.AccessLogPath.Val
	}
	if cli.Quiet.IsSet {
		cfg.Quiet = cli.Quiet.Val
	}
}

type configField struct {
	key   string
	table string
	env   string
	flag  string
	scope configScope
	value reflect.Value
}

func (f configField) configPath() string {
	if f.table == "" {
		return f.key
	}

	return f.table + "." + f.key
}

func walkConfigFields(config any, visit func(configField) error) error {
	value := reflect.ValueOf(config)
	if value.Kind() == reflect.Pointer {
		value = value.Elem()
	}

	return walkConfigStruct(value, "", "", visit)
}

func walkConfigStruct(
	value reflect.Value,
	table string,
	scope configScope,
	visit func(configField) error,
) error {
	valueType := value.Type()
	for index := range value.NumField() {
		structField := valueType.Field(index)
		fieldValue := value.Field(index)
		fieldScope := scopeFromTag(structField, scope)
		fieldTable := tableFromTag(structField, table)
		if fieldValue.Kind() == reflect.Struct {
			if err := walkConfigStruct(fieldValue, fieldTable, fieldScope, visit); err != nil {
				return err
			}
			continue
		}

		if fieldValue.Kind() != reflect.Pointer {
			continue
		}

		field := configField{
			key:   tomlName(structField),
			table: table,
			env:   structField.Tag.Get("env"),
			flag:  structField.Tag.Get("flag"),
			scope: fieldScope,
			value: fieldValue,
		}
		if field.key == "" {
			continue
		}
		if err := visit(field); err != nil {
			return err
		}
	}

	return nil
}

func tableFromTag(field reflect.StructField, parent string) string {
	name := tomlName(field)
	if name == "" {
		return parent
	}
	if parent == "" {
		return name
	}

	return parent + "." + name
}

func scopeFromTag(field reflect.StructField, parent configScope) configScope {
	scope := field.Tag.Get("scope")
	if scope == "" {
		return parent
	}

	return configScope(scope)
}

func tomlName(field reflect.StructField) string {
	name := strings.Split(field.Tag.Get("toml"), ",")[0]
	if name == "-" {
		return ""
	}

	return name
}

func parseEnvValue(name string, value string, valueType reflect.Type) (reflect.Value, error) {
	switch valueType.Kind() {
	case reflect.String:
		return reflect.ValueOf(value), nil
	case reflect.Int:
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return reflect.Value{}, fmt.Errorf("%s must be an integer", name)
		}
		return reflect.ValueOf(parsed), nil
	case reflect.Bool:
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return reflect.Value{}, fmt.Errorf("%s must be a boolean", name)
		}
		return reflect.ValueOf(parsed), nil
	default:
		return reflect.Value{}, fmt.Errorf("%s has unsupported config type %s", name, valueType)
	}
}

func buildHelp(scopes ...configScope) string {
	lines := []string{
		"Config file: " + ConfigFileHelp + " or --config-file PATH",
		"Config keys: " + strings.Join(configKeys(sharedScope), ", "),
		"Environment: " + strings.Join(envVars(sharedScope), ", "),
	}
	if hasScope(scopes, serveScope) {
		lines = append(
			lines,
			"Serve config keys: [serve] "+strings.Join(configKeys(serveScope), ", "),
			"Serve environment: "+strings.Join(envVars(serveScope), ", "),
		)
	}
	lines = append(lines, "Precedence: defaults < config file < environment < CLI flags")

	return strings.Join(lines, "\n")
}

func configKeys(scope configScope) []string {
	return metadataValues(scope, func(field configField) string {
		return field.key
	})
}

func envVars(scope configScope) []string {
	return metadataValues(scope, func(field configField) string {
		return field.env
	})
}

func metadataValues(scope configScope, value func(configField) string) []string {
	values := []string{}
	_ = walkConfigFields(fileConfig{}, func(field configField) error {
		if field.scope == scope {
			values = append(values, value(field))
		}

		return nil
	})

	return values
}

func hasScope(scopes []configScope, scope configScope) bool {
	for _, candidate := range scopes {
		if candidate == scope {
			return true
		}
	}

	return false
}

func findConfigFieldByFlag(flag string) (configField, bool) {
	var matched configField
	found := false
	_ = walkConfigFields(fileConfig{}, func(field configField) error {
		if field.flag == flag {
			matched = field
			found = true
		}

		return nil
	})

	return matched, found
}

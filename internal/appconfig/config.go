package appconfig

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
	cacheDirEnv   = "XDG_CACHE_HOME"
	configRelPath = "mina/config.toml"
)

const (
	defaultServeHost                   = "127.0.0.1"
	defaultServePort                   = 8080
	defaultExchangeRateLoadScheduleUTC = "0 17 * * *"
	defaultFrankfurterBaseURL          = "https://api.frankfurter.dev/v2"
	defaultExchangeRateStartupProvider = "frankfurter_file"
)

// ConfigFileHelp documents the local config file path used by the loader.
const ConfigFileHelp = "$XDG_CONFIG_PATH/mina/config.toml"

// Config contains source-loaded process settings.
type Config struct {
	DatabasePath     string
	AccountingSchema string
	CacheDir         string
	Serve            ServeConfig
	ExchangeRates    ExchangeRateConfig
}

// ServeConfig contains source-loaded REST listener settings.
type ServeConfig struct {
	Host          string
	Port          int
	AccessLogPath string
}

// ExchangeRateConfig contains source-loaded automatic exchange-rate loading settings.
type ExchangeRateConfig struct {
	AutomaticLoadingEnabled bool
	LoadScheduleUTC         string
	StartupProvider         string
	Frankfurter             FrankfurterConfig
}

// FrankfurterConfig contains source-loaded Frankfurter settings.
type FrankfurterConfig struct {
	BaseURL string
}

// Override is an optional caller-provided config value.
type Override[T any] struct {
	Val   T
	IsSet bool
}

// Set returns an override marked as explicitly provided.
func Set[T any](value T) Override[T] {
	return Override[T]{
		Val:   value,
		IsSet: true,
	}
}

// LoadOptions controls config source discovery.
type LoadOptions struct {
	ConfigFilePath string
}

// Overrides contains explicit config values from higher-precedence callers.
type Overrides struct {
	DatabasePath     Override[string]
	AccountingSchema Override[string]
	CacheDir         Override[string]
	Serve            ServeOverrides
	ExchangeRates    ExchangeRateOverrides
}

// ServeOverrides contains explicit REST listener config values.
type ServeOverrides struct {
	Host          Override[string]
	Port          Override[int]
	AccessLogPath Override[string]
}

// ExchangeRateOverrides contains explicit exchange-rate config values.
type ExchangeRateOverrides struct {
	AutomaticLoadingEnabled Override[bool]
	LoadScheduleUTC         Override[string]
	StartupProvider         Override[string]
	Frankfurter             FrankfurterOverrides
}

// FrankfurterOverrides contains explicit Frankfurter config values.
type FrankfurterOverrides struct {
	BaseURL Override[string]
}

// Source describes where one config field may be loaded from.
type Source struct {
	ConfigPath string
	EnvVar     string
}

// SourceKey identifies a config field's file and environment source metadata.
type SourceKey string

const (
	// SourceDatabasePath identifies the database path config source.
	SourceDatabasePath SourceKey = "db"
	// SourceAccountingSchema identifies the accounting schema config source.
	SourceAccountingSchema SourceKey = "schema"
	// SourceServeHost identifies the REST listener host config source.
	SourceServeHost SourceKey = "serve.host"
	// SourceServePort identifies the REST listener port config source.
	SourceServePort SourceKey = "serve.port"
	// SourceServeAccessLogPath identifies the REST access log path config source.
	SourceServeAccessLogPath SourceKey = "serve.access_log"
	// SourceExchangeRateAutomaticLoadingEnabled identifies the exchange-rate automatic-loading config source.
	SourceExchangeRateAutomaticLoadingEnabled SourceKey = "exchange_rates.automatic_loading_enabled"
	// SourceExchangeRateLoadScheduleUTC identifies the exchange-rate load schedule config source.
	SourceExchangeRateLoadScheduleUTC SourceKey = "exchange_rates.load_schedule_utc"
	// SourceExchangeRateStartupProvider identifies the exchange-rate startup provider config source.
	SourceExchangeRateStartupProvider SourceKey = "exchange_rates.startup_provider"
	// SourceExchangeRateFrankfurterBaseURL identifies the Frankfurter base URL config source.
	SourceExchangeRateFrankfurterBaseURL SourceKey = "exchange_rates.frankfurter.base_url"
)

type fileConfig struct {
	DatabasePath     *string                `toml:"db" env:"MINA_DB"`
	AccountingSchema *string                `toml:"schema" env:"MINA_SCHEMA"`
	Serve            serveFileConfig        `toml:"serve"`
	ExchangeRates    exchangeRateFileConfig `toml:"exchange_rates"`
}

type serveFileConfig struct {
	Host          *string `toml:"host" env:"MINA_HOST"`
	Port          *int    `toml:"port" env:"MINA_PORT"`
	AccessLogPath *string `toml:"access_log" env:"MINA_ACCESS_LOG"`
}

type exchangeRateFileConfig struct {
	AutomaticLoadingEnabled *bool                             `toml:"automatic_loading_enabled" env:"MINA_FX_AUTO_LOAD_ENABLED"`
	LoadScheduleUTC         *string                           `toml:"load_schedule_utc"`
	StartupProvider         *string                           `toml:"startup_provider"`
	Frankfurter             frankfurterExchangeRateFileConfig `toml:"frankfurter"`
}

type frankfurterExchangeRateFileConfig struct {
	BaseURL *string `toml:"base_url" env:"MINA_FX_FRANKFURTER_BASE_URL"`
}

// DefaultServeConfig returns Mina's REST server defaults.
func DefaultServeConfig() ServeConfig {
	return ServeConfig{
		Host: defaultServeHost,
		Port: defaultServePort,
	}
}

// DefaultConfig returns Mina's process config defaults.
func DefaultConfig() Config {
	return Config{
		Serve:         DefaultServeConfig(),
		ExchangeRates: DefaultExchangeRateConfig(),
	}
}

// DefaultCacheDir returns Mina's app cache directory.
func DefaultCacheDir() (string, error) {
	if cacheDir := os.Getenv(cacheDirEnv); cacheDir != "" {
		return filepath.Join(cacheDir, "mina"), nil
	}
	userCacheDir, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("resolve user cache directory: %w", err)
	}

	return filepath.Join(userCacheDir, "mina"), nil
}

// DefaultExchangeRateConfig returns automatic exchange-rate loading defaults.
func DefaultExchangeRateConfig() ExchangeRateConfig {
	return ExchangeRateConfig{
		AutomaticLoadingEnabled: true,
		LoadScheduleUTC:         defaultExchangeRateLoadScheduleUTC,
		StartupProvider:         defaultExchangeRateStartupProvider,
		Frankfurter: FrankfurterConfig{
			BaseURL: defaultFrankfurterBaseURL,
		},
	}
}

// Sources returns config file and environment source metadata by config source key.
func Sources() map[SourceKey]Source {
	return map[SourceKey]Source{
		SourceDatabasePath:                        sourceFor(SourceDatabasePath),
		SourceAccountingSchema:                    sourceFor(SourceAccountingSchema),
		SourceServeHost:                           sourceFor(SourceServeHost),
		SourceServePort:                           sourceFor(SourceServePort),
		SourceServeAccessLogPath:                  sourceFor(SourceServeAccessLogPath),
		SourceExchangeRateAutomaticLoadingEnabled: sourceFor(SourceExchangeRateAutomaticLoadingEnabled),
		SourceExchangeRateLoadScheduleUTC:         sourceFor(SourceExchangeRateLoadScheduleUTC),
		SourceExchangeRateStartupProvider:         sourceFor(SourceExchangeRateStartupProvider),
		SourceExchangeRateFrankfurterBaseURL:      sourceFor(SourceExchangeRateFrankfurterBaseURL),
	}
}

// Load returns process config using Mina's source precedence.
func Load(opts LoadOptions, overrides Overrides) (Config, error) {
	cfg := DefaultConfig()
	if !overrides.CacheDir.IsSet {
		cacheDir, err := DefaultCacheDir()
		if err != nil {
			return Config{}, err
		}
		cfg.CacheDir = cacheDir
	}

	fileCfg, err := loadFileConfig(opts)
	if err != nil {
		return Config{}, err
	}
	applySharedFile(&cfg, fileCfg)
	applyServeFile(&cfg, fileCfg)
	applyExchangeRateFile(&cfg, fileCfg)

	envCfg, err := loadEnvConfig()
	if err != nil {
		return Config{}, err
	}
	applySharedFile(&cfg, envCfg)
	applyServeFile(&cfg, envCfg)
	applyExchangeRateFile(&cfg, envCfg)

	applyOverrides(&cfg, overrides)
	applyServeOverrides(&cfg, overrides.Serve)
	applyExchangeRateOverrides(&cfg, overrides.ExchangeRates)

	return cfg, nil
}

func applyExchangeRateFile(cfg *Config, fileCfg fileConfig) {
	if fileCfg.ExchangeRates.AutomaticLoadingEnabled != nil {
		cfg.ExchangeRates.AutomaticLoadingEnabled = *fileCfg.ExchangeRates.AutomaticLoadingEnabled
	}
	if fileCfg.ExchangeRates.LoadScheduleUTC != nil {
		cfg.ExchangeRates.LoadScheduleUTC = *fileCfg.ExchangeRates.LoadScheduleUTC
	}
	if fileCfg.ExchangeRates.StartupProvider != nil {
		cfg.ExchangeRates.StartupProvider = *fileCfg.ExchangeRates.StartupProvider
	}
	if fileCfg.ExchangeRates.Frankfurter.BaseURL != nil {
		cfg.ExchangeRates.Frankfurter.BaseURL = *fileCfg.ExchangeRates.Frankfurter.BaseURL
	}
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

func applySharedFile(cfg *Config, fileCfg fileConfig) {
	if fileCfg.DatabasePath != nil {
		cfg.DatabasePath = *fileCfg.DatabasePath
	}
	if fileCfg.AccountingSchema != nil {
		cfg.AccountingSchema = *fileCfg.AccountingSchema
	}
}

func applyServeFile(cfg *Config, fileCfg fileConfig) {
	if fileCfg.Serve.Host != nil {
		cfg.Serve.Host = *fileCfg.Serve.Host
	}
	if fileCfg.Serve.Port != nil {
		cfg.Serve.Port = *fileCfg.Serve.Port
	}
	if fileCfg.Serve.AccessLogPath != nil {
		cfg.Serve.AccessLogPath = *fileCfg.Serve.AccessLogPath
	}
}

func applyOverrides(cfg *Config, overrides Overrides) {
	if overrides.DatabasePath.IsSet {
		cfg.DatabasePath = overrides.DatabasePath.Val
	}
	if overrides.AccountingSchema.IsSet {
		cfg.AccountingSchema = overrides.AccountingSchema.Val
	}
	if overrides.CacheDir.IsSet {
		cfg.CacheDir = overrides.CacheDir.Val
	}
}

func applyServeOverrides(cfg *Config, overrides ServeOverrides) {
	if overrides.Host.IsSet {
		cfg.Serve.Host = overrides.Host.Val
	}
	if overrides.Port.IsSet {
		cfg.Serve.Port = overrides.Port.Val
	}
	if overrides.AccessLogPath.IsSet {
		cfg.Serve.AccessLogPath = overrides.AccessLogPath.Val
	}
}

func applyExchangeRateOverrides(cfg *Config, overrides ExchangeRateOverrides) {
	if overrides.AutomaticLoadingEnabled.IsSet {
		cfg.ExchangeRates.AutomaticLoadingEnabled = overrides.AutomaticLoadingEnabled.Val
	}
	if overrides.LoadScheduleUTC.IsSet {
		cfg.ExchangeRates.LoadScheduleUTC = overrides.LoadScheduleUTC.Val
	}
	if overrides.StartupProvider.IsSet {
		cfg.ExchangeRates.StartupProvider = overrides.StartupProvider.Val
	}
	if overrides.Frankfurter.BaseURL.IsSet {
		cfg.ExchangeRates.Frankfurter.BaseURL = overrides.Frankfurter.BaseURL.Val
	}
}

type configField struct {
	key   string
	table string
	env   string
	value reflect.Value
}

func (f configField) configPath() string {
	if f.table == "" {
		return f.key
	}

	return f.table + "." + f.key
}

func sourceFor(configPath SourceKey) Source {
	var source Source
	_ = walkConfigFields(fileConfig{}, func(field configField) error {
		if field.configPath() == string(configPath) {
			source = Source{
				ConfigPath: string(configPath),
				EnvVar:     field.env,
			}
		}

		return nil
	})

	return source
}

func walkConfigFields(config any, visit func(configField) error) error {
	value := reflect.ValueOf(config)
	if value.Kind() == reflect.Pointer {
		value = value.Elem()
	}

	return walkConfigStruct(value, "", visit)
}

func walkConfigStruct(
	value reflect.Value,
	table string,
	visit func(configField) error,
) error {
	valueType := value.Type()
	for index := range value.NumField() {
		structField := valueType.Field(index)
		fieldValue := value.Field(index)
		fieldTable := tableFromTag(structField, table)
		if fieldValue.Kind() == reflect.Struct {
			if err := walkConfigStruct(fieldValue, fieldTable, visit); err != nil {
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

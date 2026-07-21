package appconfig

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"

	"github.com/BurntSushi/toml"
)

const (
	configHomeEnv = "XDG_CONFIG_HOME"
	cacheDirEnv   = "XDG_CACHE_HOME"
	configRelPath = "mina/config.toml"
)

const (
	defaultServeHost                   = "127.0.0.1"
	defaultServePort                   = 8080
	defaultStartupValidation           = "shallow"
	defaultExchangeRateLoadScheduleUTC = "0 17 * * *"
	defaultFrankfurterBaseURL          = "https://api.frankfurter.dev/v2"
	defaultExchangeRateStartupProvider = "frankfurter_file"
)

// ConfigFileHelp documents the local config file path used by the loader.
const ConfigFileHelp = "$XDG_CONFIG_HOME/mina/config.toml when set; otherwise ~/.config/mina/config.toml on macOS or mina/config.toml under the OS config directory"

// Config contains source-loaded process settings.
type Config struct {
	// ConfigFilePath is the resolved config file location.
	ConfigFilePath string
	// SettingSources identifies the effective source of each persistent setting.
	SettingSources    map[SourceKey]SettingSource
	DatabasePath      string
	AccountingSchema  string
	CacheDir          string
	StartupValidation string
	Serve             ServeConfig
	ExchangeRates     ExchangeRateConfig
	Backups           BackupConfig
}

// ServeConfig contains source-loaded REST listener settings.
type ServeConfig struct {
	Host          string
	Port          int
	AccessLogPath string
}

// ExchangeRateConfig contains source-loaded automatic exchange-rate loading settings.
type ExchangeRateConfig struct {
	// AutomaticLoadingEnabled may be set by config file or MINA_FX_AUTO_LOAD_ENABLED.
	AutomaticLoadingEnabled bool
	// LoadScheduleUTC is a five-field cron-style UTC schedule loaded from config file or overrides.
	LoadScheduleUTC string
	// StartupProvider selects the startup exchange-rate source loaded from config file or overrides.
	StartupProvider string
	Frankfurter     FrankfurterConfig
}

// FrankfurterConfig contains source-loaded Frankfurter settings.
type FrankfurterConfig struct {
	// BaseURL may be set by config file or MINA_FX_FRANKFURTER_BASE_URL.
	BaseURL string
}

// BackupConfig contains source-loaded backup settings.
type BackupConfig struct {
	File FileBackupConfig
}

// FileBackupConfig contains source-loaded local file backup settings.
type FileBackupConfig struct {
	// Directory may be set by config file or MINA_BACKUP_FILE_DIRECTORY.
	Directory string
	// RetentionCount may be set by config file or MINA_BACKUP_FILE_RETENTION_COUNT.
	RetentionCount int
	// ScheduleUTC is a five-field cron-style UTC schedule and may be set by config file or MINA_BACKUP_FILE_SCHEDULE_UTC.
	ScheduleUTC string
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
	DatabasePath      Override[string]
	AccountingSchema  Override[string]
	CacheDir          Override[string]
	StartupValidation Override[string]
	Serve             ServeOverrides
	ExchangeRates     ExchangeRateOverrides
	Backups           BackupOverrides
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

// BackupOverrides contains explicit backup config values.
type BackupOverrides struct {
	File FileBackupOverrides
}

// FileBackupOverrides contains explicit local file backup config values.
type FileBackupOverrides struct {
	Directory      Override[string]
	RetentionCount Override[int]
	ScheduleUTC    Override[string]
}

// Source describes where one config field may be loaded from.
type Source struct {
	ConfigPath string
	EnvVar     string
}

// SourceKey identifies a config field's file and environment source metadata.
type SourceKey string

// SettingSource identifies the effective source of one persistent setting.
type SettingSource string

const (
	// SettingSourceDefault means the active value comes from Mina's built-in default.
	SettingSourceDefault SettingSource = "default"
	// SettingSourceConfigFile means the active value comes from the resolved TOML file.
	SettingSourceConfigFile SettingSource = "config_file"
	// SettingSourceEnvironment means the active value comes from an environment variable.
	SettingSourceEnvironment SettingSource = "environment"
	// SettingSourceCLIOverride means the active value comes from an explicit caller override.
	SettingSourceCLIOverride SettingSource = "cli_override"
)

const (
	// SourceDatabasePath identifies the database path config source.
	SourceDatabasePath SourceKey = "db"
	// SourceAccountingSchema identifies the accounting schema config source.
	SourceAccountingSchema SourceKey = "schema"
	// SourceStartupValidation identifies the startup validation config source.
	SourceStartupValidation SourceKey = "startup_validation"
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
	// SourceBackupFileDirectory identifies the file backup directory config source.
	SourceBackupFileDirectory SourceKey = "backups.file.directory"
	// SourceBackupFileRetentionCount identifies the file backup retention count config source.
	SourceBackupFileRetentionCount SourceKey = "backups.file.retention_count"
	// SourceBackupFileScheduleUTC identifies the file backup schedule config source.
	SourceBackupFileScheduleUTC SourceKey = "backups.file.schedule_utc"
)

type fileConfig struct {
	DatabasePath      *string                `toml:"db" env:"MINA_DB"`
	AccountingSchema  *string                `toml:"schema" env:"MINA_SCHEMA"`
	StartupValidation *string                `toml:"startup_validation" env:"MINA_STARTUP_VALIDATION"`
	Serve             serveFileConfig        `toml:"serve"`
	ExchangeRates     exchangeRateFileConfig `toml:"exchange_rates"`
	Backups           backupFileConfig       `toml:"backups"`
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

type backupFileConfig struct {
	File fileBackupFileConfig `toml:"file"`
}

type fileBackupFileConfig struct {
	Directory      *string `toml:"directory" env:"MINA_BACKUP_FILE_DIRECTORY"`
	RetentionCount *int    `toml:"retention_count" env:"MINA_BACKUP_FILE_RETENTION_COUNT"`
	ScheduleUTC    *string `toml:"schedule_utc" env:"MINA_BACKUP_FILE_SCHEDULE_UTC"`
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
		SettingSources:    defaultSettingSources(),
		StartupValidation: defaultStartupValidation,
		Serve:             DefaultServeConfig(),
		ExchangeRates:     DefaultExchangeRateConfig(),
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
		SourceStartupValidation:                   sourceFor(SourceStartupValidation),
		SourceServeHost:                           sourceFor(SourceServeHost),
		SourceServePort:                           sourceFor(SourceServePort),
		SourceServeAccessLogPath:                  sourceFor(SourceServeAccessLogPath),
		SourceExchangeRateAutomaticLoadingEnabled: sourceFor(SourceExchangeRateAutomaticLoadingEnabled),
		SourceExchangeRateLoadScheduleUTC:         sourceFor(SourceExchangeRateLoadScheduleUTC),
		SourceExchangeRateStartupProvider:         sourceFor(SourceExchangeRateStartupProvider),
		SourceExchangeRateFrankfurterBaseURL:      sourceFor(SourceExchangeRateFrankfurterBaseURL),
		SourceBackupFileDirectory:                 sourceFor(SourceBackupFileDirectory),
		SourceBackupFileRetentionCount:            sourceFor(SourceBackupFileRetentionCount),
		SourceBackupFileScheduleUTC:               sourceFor(SourceBackupFileScheduleUTC),
	}
}

// Load returns process config using Mina's source precedence.
func Load(opts LoadOptions, overrides Overrides) (Config, error) {
	cfg := DefaultConfig()
	configFilePath := resolveConfigFilePath(opts)
	cfg.ConfigFilePath = configFilePath
	if !overrides.CacheDir.IsSet {
		cacheDir, err := DefaultCacheDir()
		if err != nil {
			return Config{}, err
		}
		cfg.CacheDir = cacheDir
	}

	fileCfg, err := loadFileConfig(configFilePath)
	if err != nil {
		return Config{}, err
	}
	applySharedFile(&cfg, fileCfg)
	applyServeFile(&cfg, fileCfg)
	applyExchangeRateFile(&cfg, fileCfg)
	applyBackupFile(&cfg, fileCfg)
	markSettingSources(cfg.SettingSources, fileCfg, SettingSourceConfigFile)

	envCfg, err := loadEnvConfig()
	if err != nil {
		return Config{}, err
	}
	applySharedFile(&cfg, envCfg)
	applyServeFile(&cfg, envCfg)
	applyExchangeRateFile(&cfg, envCfg)
	applyBackupFile(&cfg, envCfg)
	markSettingSources(cfg.SettingSources, envCfg, SettingSourceEnvironment)

	applyOverrides(&cfg, overrides)
	applyServeOverrides(&cfg, overrides.Serve)
	applyExchangeRateOverrides(&cfg, overrides.ExchangeRates)
	applyBackupOverrides(&cfg, overrides.Backups)

	return cfg, nil
}

func defaultSettingSources() map[SourceKey]SettingSource {
	sources := make(map[SourceKey]SettingSource)
	_ = walkConfigFields(fileConfig{}, func(field configField) error {
		sources[SourceKey(field.configPath())] = SettingSourceDefault
		return nil
	})

	return sources
}

func markSettingSources(sources map[SourceKey]SettingSource, cfg fileConfig, source SettingSource) {
	_ = walkConfigFields(cfg, func(field configField) error {
		if !field.value.IsNil() {
			sources[SourceKey(field.configPath())] = source
		}
		return nil
	})
}

func applyBackupFile(cfg *Config, fileCfg fileConfig) {
	if fileCfg.Backups.File.Directory != nil {
		cfg.Backups.File.Directory = *fileCfg.Backups.File.Directory
	}
	if fileCfg.Backups.File.RetentionCount != nil {
		cfg.Backups.File.RetentionCount = *fileCfg.Backups.File.RetentionCount
	}
	if fileCfg.Backups.File.ScheduleUTC != nil {
		cfg.Backups.File.ScheduleUTC = *fileCfg.Backups.File.ScheduleUTC
	}
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

func loadFileConfig(path string) (fileConfig, error) {
	var cfg fileConfig
	meta, err := toml.DecodeFile(path, &cfg)
	if errors.Is(err, os.ErrNotExist) {
		return fileConfig{}, nil
	}
	if err != nil {
		return cfg, fmt.Errorf("read config file %s: %w", path, err)
	}
	if undecoded := meta.Undecoded(); len(undecoded) > 0 {
		return cfg, fmt.Errorf("read config file %s: unsupported key %s", path, undecoded[0].String())
	}

	return cfg, nil
}

func resolveConfigFilePath(opts LoadOptions) string {
	if opts.ConfigFilePath != "" {
		return opts.ConfigFilePath
	}

	if configHome := os.Getenv(configHomeEnv); configHome != "" {
		return filepath.Join(configHome, configRelPath)
	}

	var (
		configHome string
		err        error
	)
	if runtime.GOOS == "darwin" {
		configHome, err = os.UserHomeDir()
		if err == nil {
			configHome = filepath.Join(configHome, ".config")
		}
	} else {
		configHome, err = os.UserConfigDir()
	}
	if err != nil {
		return ""
	}

	return filepath.Join(configHome, configRelPath)
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
	if fileCfg.StartupValidation != nil {
		cfg.StartupValidation = *fileCfg.StartupValidation
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
	applyOverride(&cfg.DatabasePath, overrides.DatabasePath, cfg.SettingSources, SourceDatabasePath)
	applyOverride(&cfg.AccountingSchema, overrides.AccountingSchema, cfg.SettingSources, SourceAccountingSchema)
	if overrides.CacheDir.IsSet {
		cfg.CacheDir = overrides.CacheDir.Val
	}
	applyOverride(&cfg.StartupValidation, overrides.StartupValidation, cfg.SettingSources, SourceStartupValidation)
}

func applyServeOverrides(cfg *Config, overrides ServeOverrides) {
	applyOverride(&cfg.Serve.Host, overrides.Host, cfg.SettingSources, SourceServeHost)
	applyOverride(&cfg.Serve.Port, overrides.Port, cfg.SettingSources, SourceServePort)
	applyOverride(&cfg.Serve.AccessLogPath, overrides.AccessLogPath, cfg.SettingSources, SourceServeAccessLogPath)
}

func applyExchangeRateOverrides(cfg *Config, overrides ExchangeRateOverrides) {
	applyOverride(&cfg.ExchangeRates.AutomaticLoadingEnabled, overrides.AutomaticLoadingEnabled, cfg.SettingSources, SourceExchangeRateAutomaticLoadingEnabled)
	applyOverride(&cfg.ExchangeRates.LoadScheduleUTC, overrides.LoadScheduleUTC, cfg.SettingSources, SourceExchangeRateLoadScheduleUTC)
	applyOverride(&cfg.ExchangeRates.StartupProvider, overrides.StartupProvider, cfg.SettingSources, SourceExchangeRateStartupProvider)
	applyOverride(&cfg.ExchangeRates.Frankfurter.BaseURL, overrides.Frankfurter.BaseURL, cfg.SettingSources, SourceExchangeRateFrankfurterBaseURL)
}

func applyBackupOverrides(cfg *Config, overrides BackupOverrides) {
	applyOverride(&cfg.Backups.File.Directory, overrides.File.Directory, cfg.SettingSources, SourceBackupFileDirectory)
	applyOverride(&cfg.Backups.File.RetentionCount, overrides.File.RetentionCount, cfg.SettingSources, SourceBackupFileRetentionCount)
	applyOverride(&cfg.Backups.File.ScheduleUTC, overrides.File.ScheduleUTC, cfg.SettingSources, SourceBackupFileScheduleUTC)
}

func applyOverride[T any](target *T, override Override[T], sources map[SourceKey]SettingSource, key SourceKey) {
	if override.IsSet {
		*target = override.Val
		sources[key] = SettingSourceCLIOverride
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

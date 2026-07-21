package appconfig

import (
	"fmt"
	"reflect"
	"sort"
	"strconv"
)

// SettingControlKind identifies how one active setting value should be displayed.
type SettingControlKind string

const (
	// SettingControlText displays a string value.
	SettingControlText SettingControlKind = "text"
	// SettingControlInteger displays an integer value.
	SettingControlInteger SettingControlKind = "integer"
	// SettingControlBoolean displays an enabled or disabled value.
	SettingControlBoolean SettingControlKind = "boolean"
	// SettingControlSelect displays a value selected from a finite domain.
	SettingControlSelect SettingControlKind = "select"
)

type settingGroupMetadata struct {
	Label string
	Order int
}

type settingGroupKey string

const (
	settingGroupStorageStartup settingGroupKey = "storage_startup"
	settingGroupHTTPServer     settingGroupKey = "http_server"
	settingGroupExchangeRates  settingGroupKey = "exchange_rates"
	settingGroupBackups        settingGroupKey = "backups"
)

type settingMetadata struct {
	Group   settingGroupKey
	Label   string
	Help    string
	Order   int
	Control SettingControlKind
}

//nolint:gochecknoglobals // immutable package definition data
var settingGroupMetadataByKey = map[settingGroupKey]settingGroupMetadata{
	settingGroupStorageStartup: {Label: "Storage and startup", Order: 10},
	settingGroupHTTPServer:     {Label: "HTTP server", Order: 20},
	settingGroupExchangeRates:  {Label: "Exchange rates", Order: 30},
	settingGroupBackups:        {Label: "Backups", Order: 40},
}

// This map is the readable presentation companion to fileConfig. Snapshot
// construction rejects either an unlisted fileConfig leaf or an unknown entry.
//
//nolint:gochecknoglobals // immutable package definition data
var settingMetadataByKey = map[SourceKey]settingMetadata{
	SourceDatabasePath: {
		Group: settingGroupStorageStartup,
		Label: "Database file", Help: "Accounting database file opened by this Mina process.", Order: 10, Control: SettingControlText,
	},
	SourceAccountingSchema: {
		Group: settingGroupStorageStartup,
		Label: "Accounting schema", Help: "DuckDB schema holding Mina accounting state for this process.", Order: 20, Control: SettingControlSelect,
	},
	SourceStartupValidation: {
		Group: settingGroupStorageStartup,
		Label: "Startup validation", Help: "Database validation depth selected when Mina started.", Order: 30, Control: SettingControlSelect,
	},
	SourceServeHost: {
		Group: settingGroupHTTPServer,
		Label: "Listen host", Help: "Resolved host in Mina's serve configuration.", Order: 10, Control: SettingControlText,
	},
	SourceServePort: {
		Group: settingGroupHTTPServer,
		Label: "Listen port", Help: "Resolved TCP port in Mina's serve configuration.", Order: 20, Control: SettingControlInteger,
	},
	SourceServeAccessLogPath: {
		Group: settingGroupHTTPServer,
		Label: "Access log file", Help: "Optional file receiving HTTP access logs.", Order: 30, Control: SettingControlText,
	},
	SourceExchangeRateAutomaticLoadingEnabled: {
		Group: settingGroupExchangeRates,
		Label: "Automatic loading", Help: "Whether Mina automatically loads exchange rates while running.", Order: 10, Control: SettingControlBoolean,
	},
	SourceExchangeRateLoadScheduleUTC: {
		Group: settingGroupExchangeRates,
		Label: "Load schedule (UTC)", Help: "Five-field UTC schedule for automatic exchange-rate loading.", Order: 20, Control: SettingControlText,
	},
	SourceExchangeRateStartupProvider: {
		Group: settingGroupExchangeRates,
		Label: "Startup provider", Help: "Exchange-rate source selected when Mina started.", Order: 30, Control: SettingControlSelect,
	},
	SourceExchangeRateFrankfurterBaseURL: {
		Group: settingGroupExchangeRates,
		Label: "Frankfurter base URL", Help: "Base URL used for Frankfurter exchange-rate requests.", Order: 40, Control: SettingControlText,
	},
	SourceBackupFileDirectory: {
		Group: settingGroupBackups,
		Label: "Backup directory", Help: "Directory receiving file backups.", Order: 10, Control: SettingControlText,
	},
	SourceBackupFileRetentionCount: {
		Group: settingGroupBackups,
		Label: "Retention count", Help: "Completed file backups retained; zero keeps all backups.", Order: 20, Control: SettingControlInteger,
	},
	SourceBackupFileScheduleUTC: {
		Group: settingGroupBackups,
		Label: "Backup schedule (UTC)", Help: "Optional five-field UTC schedule for automatic file backups.", Order: 30, Control: SettingControlText,
	},
}

// SettingField reports one active setting and its backend-owned presentation metadata.
type SettingField struct {
	Key     SourceKey
	Label   string
	Help    string
	Order   int
	Control SettingControlKind
	Value   string
	Source  SettingSource
}

// SettingGroup is one ordered group of active settings.
type SettingGroup struct {
	Key    string
	Label  string
	Order  int
	Fields []SettingField
}

// SettingsSnapshot is the immutable settings view for one running process.
type SettingsSnapshot struct {
	ConfigFilePath string
	Groups         []SettingGroup
}

// NewSettingsSnapshot builds and validates the immutable process-config snapshot.
func NewSettingsSnapshot(cfg Config) (SettingsSnapshot, error) {
	values := settingValues(cfg)
	remainingMetadata := make(map[SourceKey]struct{}, len(settingMetadataByKey))
	for key := range settingMetadataByKey {
		remainingMetadata[key] = struct{}{}
	}
	groupsByKey := make(map[settingGroupKey]*SettingGroup)
	err := walkConfigFields(fileConfig{}, func(configField configField) error {
		key := SourceKey(configField.configPath())
		metadata, exists := settingMetadataByKey[key]
		if !exists {
			return fmt.Errorf("settings metadata is missing field %s", key)
		}
		delete(remainingMetadata, key)
		if err := validateSettingControl(configField.value.Type().Elem(), metadata.Control); err != nil {
			return fmt.Errorf("settings metadata field %s: %w", key, err)
		}
		value, exists := values[key]
		if !exists {
			return fmt.Errorf("settings value is missing field %s", key)
		}

		groupMetadata, exists := settingGroupMetadataByKey[metadata.Group]
		if !exists {
			return fmt.Errorf("settings metadata field %s references unknown group %s", key, metadata.Group)
		}
		group := groupsByKey[metadata.Group]
		if group == nil {
			group = &SettingGroup{Key: string(metadata.Group), Label: groupMetadata.Label, Order: groupMetadata.Order}
			groupsByKey[metadata.Group] = group
		}
		for _, field := range group.Fields {
			if field.Order == metadata.Order {
				return fmt.Errorf("settings group %s repeats field order %d", group.Key, metadata.Order)
			}
		}
		source := cfg.SettingSources[key]
		group.Fields = append(group.Fields, SettingField{
			Key: key, Label: metadata.Label, Help: metadata.Help, Order: metadata.Order,
			Control: metadata.Control, Value: value, Source: source,
		})

		return nil
	})
	if err != nil {
		return SettingsSnapshot{}, err
	}
	for key := range remainingMetadata {
		return SettingsSnapshot{}, fmt.Errorf("settings metadata references unknown field %s", key)
	}

	groups := make([]SettingGroup, 0, len(groupsByKey))
	for _, group := range groupsByKey {
		sort.Slice(group.Fields, func(i, j int) bool { return group.Fields[i].Order < group.Fields[j].Order })
		groups = append(groups, *group)
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].Order < groups[j].Order })
	for index := 1; index < len(groups); index++ {
		if groups[index-1].Order == groups[index].Order {
			return SettingsSnapshot{}, fmt.Errorf("settings groups repeat order %d", groups[index].Order)
		}
	}

	return SettingsSnapshot{ConfigFilePath: cfg.ConfigFilePath, Groups: groups}, nil
}

func validateSettingControl(valueType reflect.Type, control SettingControlKind) error {
	valid := false
	switch control {
	case SettingControlText, SettingControlSelect:
		valid = valueType.Kind() == reflect.String
	case SettingControlInteger:
		valid = valueType.Kind() == reflect.Int
	case SettingControlBoolean:
		valid = valueType.Kind() == reflect.Bool
	default:
		return fmt.Errorf("unsupported control %q", control)
	}
	if !valid {
		return fmt.Errorf("control %q does not support %s", control, valueType)
	}
	return nil
}

func settingValues(cfg Config) map[SourceKey]string {
	return map[SourceKey]string{
		SourceDatabasePath:                        cfg.DatabasePath,
		SourceAccountingSchema:                    cfg.AccountingSchema,
		SourceStartupValidation:                   cfg.StartupValidation,
		SourceServeHost:                           cfg.Serve.Host,
		SourceServePort:                           strconv.Itoa(cfg.Serve.Port),
		SourceServeAccessLogPath:                  cfg.Serve.AccessLogPath,
		SourceExchangeRateAutomaticLoadingEnabled: strconv.FormatBool(cfg.ExchangeRates.AutomaticLoadingEnabled),
		SourceExchangeRateLoadScheduleUTC:         cfg.ExchangeRates.LoadScheduleUTC,
		SourceExchangeRateStartupProvider:         cfg.ExchangeRates.StartupProvider,
		SourceExchangeRateFrankfurterBaseURL:      cfg.ExchangeRates.Frankfurter.BaseURL,
		SourceBackupFileDirectory:                 cfg.Backups.File.Directory,
		SourceBackupFileRetentionCount:            strconv.Itoa(cfg.Backups.File.RetentionCount),
		SourceBackupFileScheduleUTC:               cfg.Backups.File.ScheduleUTC,
	}
}

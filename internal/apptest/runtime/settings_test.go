package runtime_test

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestSettingsReportsResolvedRuntimeValues(t *testing.T) {
	emptySchema := ""
	settingsSources, _ := apptest.WithSettingsSources(
		t,
		apptest.SettingsSourceValues{
			CLIOverrideAccountingSchema: &emptySchema,
			ConfigFile:                  "startup_validation = \"\"\n\n[exchange_rates]\nstartup_provider = \"\"\n",
		},
	)
	client := apptest.New(t, settingsSources)
	response, err := client.REST().GetSettingsWithResponse(context.Background())
	requireSettingsResponse(t, err, response.StatusCode(), response.Body)

	storageGroup := settingsGroup(t, response.JSON200.Groups, "storage_startup", "Storage and startup", 10)
	schema := settingsField(t, storageGroup.Fields, "schema", 20)
	if schema.Value != "mina" || schema.Source != httpclient.Default {
		t.Fatalf("schema = %+v, want resolved in-memory default", schema)
	}
	startupValidation := settingsField(t, storageGroup.Fields, "startup_validation", 30)
	if startupValidation.Value != "shallow" || startupValidation.Source != httpclient.Default {
		t.Fatalf("startup validation = %+v, want resolved default", startupValidation)
	}
	exchangeRatesGroup := settingsGroup(t, response.JSON200.Groups, "exchange_rates", "Exchange rates", 30)
	startupProvider := settingsField(t, exchangeRatesGroup.Fields, "exchange_rates.startup_provider", 30)
	if startupProvider.Value != "frankfurter_file" || startupProvider.Source != httpclient.Default {
		t.Fatalf("startup provider = %+v, want resolved default", startupProvider)
	}
	httpGroup := settingsGroup(t, response.JSON200.Groups, "http_server", "HTTP server", 20)
	host := settingsField(t, httpGroup.Fields, "serve.host", 10)
	if host.Help != "Resolved host in Mina's serve configuration." {
		t.Fatalf("serve host help = %q, want resolved configuration description", host.Help)
	}
	port := settingsField(t, httpGroup.Fields, "serve.port", 20)
	if port.Value != "8080" || port.Control != httpclient.Integer {
		t.Fatalf("serve port = %+v, want active integer value 8080", port)
	}
	if port.Help != "Resolved TCP port in Mina's serve configuration." {
		t.Fatalf("serve port help = %q, want resolved configuration description", port.Help)
	}
	assertSettingsUnchanged(t, client, response.JSON200)
}

func TestSettingsReportsFileBackedDefaultSchema(t *testing.T) {
	client := apptest.New(
		t,
		apptest.WithDatabasePath(filepath.Join(t.TempDir(), "mina.duckdb")),
		apptest.WithAccountingSchema(""),
	)
	response, err := client.REST().GetSettingsWithResponse(context.Background())
	requireSettingsResponse(t, err, response.StatusCode(), response.Body)

	storageGroup := settingsGroup(t, response.JSON200.Groups, "storage_startup", "Storage and startup", 10)
	schema := settingsField(t, storageGroup.Fields, "schema", 20)
	if schema.Value != "main" || schema.Source != httpclient.Default {
		t.Fatalf("schema = %+v, want resolved file-backed default", schema)
	}
}

func TestSettingsReportsConfigLocationAndEffectiveSources(t *testing.T) {
	tempDir := t.TempDir()
	fileDirectory := filepath.Join(tempDir, "file-backups")
	contents := "startup_validation = \"full\"\n\n[backups.file]\ndirectory = \"" + fileDirectory + "\"\n"
	environmentDirectory := filepath.Join(tempDir, "environment-backups")
	settingsSources, configPath := apptest.WithSettingsSources(
		t,
		apptest.SettingsSourceValues{
			ConfigFile: contents, EnvironmentBackupDirectory: environmentDirectory,
		},
	)
	client := newSharedClient(t, settingsSources)

	response, err := client.REST().GetSettingsWithResponse(context.Background())
	requireSettingsResponse(t, err, response.StatusCode(), response.Body)
	if response.JSON200.ConfigFilePath != configPath {
		t.Fatalf("config_file_path = %q, want %q", response.JSON200.ConfigFilePath, configPath)
	}
	storageGroup := settingsGroup(t, response.JSON200.Groups, "storage_startup", "Storage and startup", 10)
	startup := settingsField(t, storageGroup.Fields, "startup_validation", 30)
	if startup.Value != "full" || startup.Source != httpclient.ConfigFile {
		t.Fatalf("startup validation = %+v, want config-file value", startup)
	}
	backupGroup := settingsGroup(t, response.JSON200.Groups, "backups", "Backups", 40)
	directory := settingsField(t, backupGroup.Fields, "backups.file.directory", 10)
	if directory.Value != environmentDirectory || directory.Source != httpclient.Environment {
		t.Fatalf("backup directory = %+v, want environment value", directory)
	}
	if directory.Label == "" || directory.Help == "" {
		t.Fatalf("backup directory metadata = %+v, want user-facing label and help", directory)
	}
	if err := os.WriteFile(configPath, []byte("startup_validation = \"none\"\n"), 0o600); err != nil {
		t.Fatalf("replace settings config fixture: %v", err)
	}
	assertSettingsUnchanged(t, client, response.JSON200)
}

func TestSettingsReportsMissingConfigLocationAndDefaults(t *testing.T) {
	settingsSources, configPath := apptest.WithSettingsSources(
		t,
		apptest.SettingsSourceValues{ConfigFileMissing: true},
	)
	if _, err := os.Stat(configPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("config target stat error = %v, want not exist", err)
	}
	client := newSharedClient(t, settingsSources)

	response, err := client.REST().GetSettingsWithResponse(context.Background())
	requireSettingsResponse(t, err, response.StatusCode(), response.Body)
	if response.JSON200.ConfigFilePath != configPath {
		t.Fatalf("config_file_path = %q, want missing target %q", response.JSON200.ConfigFilePath, configPath)
	}
	httpGroup := settingsGroup(t, response.JSON200.Groups, "http_server", "HTTP server", 20)
	port := settingsField(t, httpGroup.Fields, "serve.port", 20)
	if port.Value != "8080" || port.Source != httpclient.Default {
		t.Fatalf("serve port = %+v, want default value 8080", port)
	}
}

func TestSettingsReportsCLIOverrideSource(t *testing.T) {
	portOverride := 18090
	settingsSources, _ := apptest.WithSettingsSources(
		t,
		apptest.SettingsSourceValues{CLIOverrideServePort: &portOverride},
	)
	client := newSharedClient(t, settingsSources)

	response, err := client.REST().GetSettingsWithResponse(context.Background())
	requireSettingsResponse(t, err, response.StatusCode(), response.Body)
	httpGroup := settingsGroup(t, response.JSON200.Groups, "http_server", "HTTP server", 20)
	port := settingsField(t, httpGroup.Fields, "serve.port", 20)
	if port.Value != "18090" || port.Source != httpclient.CliOverride {
		t.Fatalf("serve port = %+v, want CLI override value 18090", port)
	}
}

func assertSettingsUnchanged(
	t *testing.T,
	client *apptest.Client,
	want *httpclient.SettingsResponse,
) {
	t.Helper()
	response, err := client.REST().GetSettingsWithResponse(context.Background())
	requireSettingsResponse(t, err, response.StatusCode(), response.Body)
	if !reflect.DeepEqual(response.JSON200, want) {
		t.Fatalf("second settings read = %+v, want unchanged snapshot %+v", response.JSON200, want)
	}
}

func settingsGroup(
	t *testing.T,
	groups []httpclient.SettingGroup,
	key string,
	label string,
	order int,
) httpclient.SettingGroup {
	t.Helper()
	for _, group := range groups {
		if group.GroupKey != key {
			continue
		}
		if group.Label != label || group.Order != order {
			t.Fatalf("settings group %q = %+v, want label %q and order %d", key, group, label, order)
		}
		return group
	}
	t.Fatalf("settings groups = %+v, want group %q", groups, key)
	return httpclient.SettingGroup{}
}

func settingsField(
	t *testing.T,
	fields []httpclient.SettingField,
	key httpclient.SettingKey,
	order int,
) httpclient.SettingField {
	t.Helper()
	for _, field := range fields {
		if field.SettingKey != key {
			continue
		}
		if field.Order != order {
			t.Fatalf("settings field %q = %+v, want order %d", key, field, order)
		}
		return field
	}
	t.Fatalf("settings fields = %+v, want field %q", fields, key)
	return httpclient.SettingField{}
}

func requireSettingsResponse(t *testing.T, err error, status int, body []byte) {
	t.Helper()
	if err != nil {
		t.Fatalf("get settings: %v", err)
	}
	if status != http.StatusOK {
		t.Fatalf("get settings status = %d, want %d; body %s", status, http.StatusOK, body)
	}
}

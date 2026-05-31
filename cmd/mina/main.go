package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"syscall"

	"github.com/spf13/cobra"

	"github.com/mishamsk/mina/internal/runtime"
	runtimeconfig "github.com/mishamsk/mina/internal/runtime/config"
)

const version = "0.0.0-dev"

var portFlagErrorPattern = regexp.MustCompile(`invalid argument "([^"]+)" for "--port" flag`)

func main() {
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}

func run(args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) int {
	root := newRootCommand(stdin, stdout, stderr)
	root.SetArgs(args)
	if err := root.Execute(); err != nil {
		var runtimeErr *exitError
		if errors.As(err, &runtimeErr) {
			if _, writeErr := fmt.Fprintln(stderr, runtimeErr.Error()); writeErr != nil {
				return 1
			}
			return runtimeErr.code
		}
		if _, writeErr := fmt.Fprintf(stderr, "usage error: %s\n", normalizeFlagError(err).Error()); writeErr != nil {
			return 1
		}
		return 2
	}

	return 0
}

type exitError struct {
	code int
	err  error
}

func (e *exitError) Error() string {
	return e.err.Error()
}

func newRootCommand(stdin io.Reader, stdout io.Writer, stderr io.Writer) *cobra.Command {
	var configFilePath string
	root := &cobra.Command{
		Use:           "mina",
		Short:         "Mina local-first personal finance API",
		SilenceErrors: true,
		SilenceUsage:  true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return cmd.Help()
		},
	}
	root.SetOut(stdout)
	root.SetErr(stderr)
	root.SetVersionTemplate("mina {{.Version}}\n")
	root.Version = version
	root.SetFlagErrorFunc(func(_ *cobra.Command, err error) error {
		return normalizeFlagError(err)
	})
	root.PersistentFlags().StringVar(
		&configFilePath,
		"config-file",
		"",
		"config file path (default: $XDG_CONFIG_PATH/mina/config.toml)",
	)

	root.AddCommand(newVersionCommand(stdout))
	root.AddCommand(newServeCommand(stdin, stdout, stderr, &configFilePath))
	root.AddCommand(newMigrateCommand(stdin, stderr, &configFilePath))

	return root
}

func newVersionCommand(stdout io.Writer) *cobra.Command {
	return &cobra.Command{
		Use:          "version",
		Short:        "Show version",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(_ *cobra.Command, _ []string) error {
			_, err := fmt.Fprintf(stdout, "mina %s\n", version)
			return err
		},
	}
}

func newServeCommand(stdin io.Reader, stdout io.Writer, stderr io.Writer, configFilePath *string) *cobra.Command {
	var assumeYes bool
	sourceInfo := runtimeconfig.Sources()
	flagCfg := runtimeconfig.DefaultConfig()
	cmd := &cobra.Command{
		Use:          "serve",
		Short:        "Serve the REST API",
		Args:         noPositionalArgs("serve"),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, commandCfg, err := runtimeconfig.Load(
				runtimeconfig.LoadOptions{ConfigFilePath: *configFilePath},
				runtimeconfig.Overrides{
					DatabasePath:     configOverride(cmd, "db", flagCfg.DatabasePath),
					AccountingSchema: configOverride(cmd, "schema", flagCfg.AccountingSchema),
					AssumeYes:        configOverride(cmd, "yes", assumeYes),
					Serve: runtimeconfig.ServeOverrides{
						Host:          configOverride(cmd, "host", flagCfg.Serve.Host),
						Port:          configOverride(cmd, "port", flagCfg.Serve.Port),
						AccessLogPath: configOverride(cmd, "access-log", flagCfg.Serve.AccessLogPath),
						Quiet:         configOverride(cmd, "quiet", flagCfg.Serve.Quiet),
					},
				},
			)
			if err != nil {
				return err
			}
			serveCfg := runtimeServeConfig(cfg)
			if err := serveCfg.Validate(); err != nil {
				return err
			}

			if err := serve(stdin, stdout, stderr, serveCfg, commandCfg.AssumeYes); err != nil {
				return &exitError{code: 1, err: err}
			}

			return nil
		},
	}
	cmd.Flags().StringVar(&flagCfg.DatabasePath, "db", "", "path to the Mina database file "+sourceHelp(sourceInfo.DatabasePath))
	cmd.Flags().StringVar(
		&flagCfg.AccountingSchema,
		"schema",
		"",
		"DuckDB schema for accounting state "+sourceHelp(sourceInfo.AccountingSchema),
	)
	cmd.Flags().StringVar(&flagCfg.Serve.Host, "host", flagCfg.Serve.Host, "host interface for the REST API "+sourceHelp(sourceInfo.Serve.Host))
	cmd.Flags().IntVar(&flagCfg.Serve.Port, "port", flagCfg.Serve.Port, "port for the REST API "+sourceHelp(sourceInfo.Serve.Port))
	cmd.Flags().BoolVar(
		&assumeYes,
		"yes",
		false,
		"answer yes to database creation and migration prompts "+sourceHelp(sourceInfo.AssumeYes),
	)
	cmd.Flags().StringVar(
		&flagCfg.Serve.AccessLogPath,
		"access-log",
		"",
		"write access logs to a file instead of stderr "+sourceHelp(sourceInfo.Serve.AccessLogPath),
	)
	cmd.Flags().BoolVar(&flagCfg.Serve.Quiet, "quiet", false, "disable access logs "+sourceHelp(sourceInfo.Serve.Quiet))
	cmd.SetFlagErrorFunc(func(_ *cobra.Command, err error) error {
		return normalizeFlagError(err)
	})

	return cmd
}

func newMigrateCommand(stdin io.Reader, stderr io.Writer, configFilePath *string) *cobra.Command {
	var assumeYes bool
	sourceInfo := runtimeconfig.Sources()
	flagCfg := runtimeconfig.Config{}
	cmd := &cobra.Command{
		Use:          "migrate",
		Short:        "Apply database migrations",
		Args:         noPositionalArgs("migrate"),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, commandCfg, err := runtimeconfig.Load(
				runtimeconfig.LoadOptions{ConfigFilePath: *configFilePath},
				runtimeconfig.Overrides{
					DatabasePath:     configOverride(cmd, "db", flagCfg.DatabasePath),
					AccountingSchema: configOverride(cmd, "schema", flagCfg.AccountingSchema),
					AssumeYes:        configOverride(cmd, "yes", assumeYes),
				},
			)
			if err != nil {
				return err
			}
			if cfg.DatabasePath == "" {
				return errors.New("migrate requires --db")
			}
			appCfg := runtimeConfig(cfg)
			if err := appCfg.Validate(); err != nil {
				return err
			}

			if err := migrate(stdin, stderr, appCfg, commandCfg.AssumeYes); err != nil {
				return &exitError{code: 1, err: err}
			}

			return nil
		},
	}
	cmd.Flags().StringVar(&flagCfg.DatabasePath, "db", "", "path to the Mina database file "+sourceHelp(sourceInfo.DatabasePath))
	cmd.Flags().StringVar(
		&flagCfg.AccountingSchema,
		"schema",
		"",
		"DuckDB schema for accounting state "+sourceHelp(sourceInfo.AccountingSchema),
	)
	cmd.Flags().BoolVar(
		&assumeYes,
		"yes",
		false,
		"answer yes to database creation and migration prompts "+sourceHelp(sourceInfo.AssumeYes),
	)

	return cmd
}

func configOverride[T any](cmd *cobra.Command, flag string, value T) runtimeconfig.Override[T] {
	if cmd.Flags().Changed(flag) {
		return runtimeconfig.Set(value)
	}

	return runtimeconfig.Override[T]{}
}

func sourceHelp(source runtimeconfig.Source) string {
	return fmt.Sprintf("(config: %s; env: %s)", source.ConfigPath, source.EnvVar)
}

func runtimeConfig(cfg runtimeconfig.Config) runtime.Config {
	return runtime.Config{
		DatabasePath:     cfg.DatabasePath,
		AccountingSchema: cfg.AccountingSchema,
	}
}

func runtimeServeConfig(cfg runtimeconfig.Config) runtime.ServeConfig {
	return runtime.ServeConfig{
		Config:        runtimeConfig(cfg),
		Host:          cfg.Serve.Host,
		Port:          cfg.Serve.Port,
		AccessLogPath: cfg.Serve.AccessLogPath,
		Quiet:         cfg.Serve.Quiet,
	}
}

func noPositionalArgs(command string) cobra.PositionalArgs {
	return func(_ *cobra.Command, args []string) error {
		if len(args) != 0 {
			return fmt.Errorf("%s does not accept positional arguments", command)
		}

		return nil
	}
}

func normalizeFlagError(err error) error {
	matches := portFlagErrorPattern.FindStringSubmatch(err.Error())
	if len(matches) == 2 {
		return fmt.Errorf("invalid value %q for flag -port", matches[1])
	}

	return err
}

func serve(stdin io.Reader, stdout io.Writer, stderr io.Writer, cfg runtime.ServeConfig, assumeYes bool) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.DatabasePath == "" {
		if _, err := fmt.Fprintln(stderr, "warning: no --db provided; using ephemeral in-memory accounting state"); err != nil {
			return err
		}
	}

	accessLog, closeAccessLog, err := openAccessLog(stderr, cfg)
	if err != nil {
		return err
	}
	defer closeAccessLog()

	appConfig := cfg.Config
	appConfig.HTTP = runtime.HTTPConfig{
		AccessLog: accessLog,
	}
	created, err := confirmDatabaseCreation(stdin, stderr, appConfig, assumeYes)
	if err != nil {
		return err
	}
	if !created {
		if err := confirmPendingMigrations(ctx, stdin, stderr, appConfig, assumeYes); err != nil {
			return err
		}
	}
	appInstance, err := runtime.New(ctx, appConfig)
	if err != nil {
		return fmt.Errorf("startup error: %w", err)
	}
	defer func() {
		if err := appInstance.Close(); err != nil {
			_, _ = fmt.Fprintf(stderr, "close error: %v\n", err)
		}
	}()

	listener, err := net.Listen("tcp", net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port)))
	if err != nil {
		return fmt.Errorf("listen error: %w", err)
	}

	server := &http.Server{
		Handler: appInstance.Handler(),
	}
	go func() {
		<-ctx.Done()
		_ = server.Shutdown(context.Background())
	}()

	if _, err := fmt.Fprintf(stdout, "listening http://%s\n", listener.Addr().String()); err != nil {
		_ = listener.Close()
		return err
	}

	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("server error: %w", err)
	}

	return nil
}

func openAccessLog(stderr io.Writer, cfg runtime.ServeConfig) (io.Writer, func(), error) {
	if cfg.Quiet {
		return nil, func() {}, nil
	}
	if cfg.AccessLogPath == "" {
		return stderr, func() {}, nil
	}

	file, err := os.OpenFile(cfg.AccessLogPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, func() {}, fmt.Errorf("access log error: %w", err)
	}

	return file, func() {
		_ = file.Close()
	}, nil
}

func migrate(stdin io.Reader, stderr io.Writer, cfg runtime.Config, assumeYes bool) error {
	ctx := context.Background()
	created, err := confirmDatabaseCreation(stdin, stderr, cfg, assumeYes)
	if err != nil {
		return err
	}
	if !created {
		if err := confirmPendingMigrations(ctx, stdin, stderr, cfg, assumeYes); err != nil {
			return err
		}
	}
	appInstance, err := runtime.New(ctx, cfg)
	if err != nil {
		return fmt.Errorf("startup error: %w", err)
	}
	defer func() {
		if err := appInstance.Close(); err != nil {
			_, _ = fmt.Fprintf(stderr, "close error: %v\n", err)
		}
	}()

	return nil
}

func confirmDatabaseCreation(stdin io.Reader, stderr io.Writer, cfg runtime.Config, assumeYes bool) (bool, error) {
	if cfg.DatabasePath == "" {
		return false, nil
	}
	_, err := os.Stat(cfg.DatabasePath)
	if err == nil {
		return false, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return false, fmt.Errorf("stat database path: %w", err)
	}
	if assumeYes {
		return true, nil
	}

	if _, err := fmt.Fprintf(
		stderr,
		"database %s does not exist; create it? [y/N]: ",
		cfg.DatabasePath,
	); err != nil {
		return false, err
	}
	answer, err := readConfirmation(stdin)
	if err != nil {
		return false, err
	}
	if answer {
		return true, nil
	}

	return false, errors.New("database creation not confirmed")
}

func confirmPendingMigrations(
	ctx context.Context,
	stdin io.Reader,
	stderr io.Writer,
	cfg runtime.Config,
	assumeYes bool,
) error {
	if cfg.DatabasePath == "" {
		return nil
	}

	pending, err := runtime.HasPendingMigrations(ctx, cfg)
	if err != nil {
		return fmt.Errorf("check pending migrations: %w", err)
	}
	if !pending {
		return nil
	}
	if assumeYes {
		return nil
	}

	if _, err := fmt.Fprintf(
		stderr,
		"pending database migrations for %s; apply before continuing? [y/N]: ",
		cfg.DatabasePath,
	); err != nil {
		return err
	}
	confirmed, err := readConfirmation(stdin)
	if err != nil {
		return err
	}
	if confirmed {
		return nil
	}

	return errors.New("database migrations not confirmed")
}

func readConfirmation(stdin io.Reader) (bool, error) {
	answer, err := bufio.NewReader(stdin).ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return false, fmt.Errorf("read confirmation: %w", err)
	}

	switch strings.ToLower(strings.TrimSpace(answer)) {
	case "y", "yes":
		return true, nil
	default:
		return false, nil
	}
}

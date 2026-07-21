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

	"github.com/mishamsk/mina/internal/appconfig"
	"github.com/mishamsk/mina/internal/clientcli"
	"github.com/mishamsk/mina/internal/runtime"
)

const version = "0.0.0-dev"

var portFlagErrorPattern = regexp.MustCompile(`invalid argument "([^"]+)" for "--port" flag`)

func main() {
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}

func run(args []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) int {
	root := newRootCommand(stdin, stdout, stderr)
	root.SetArgs(args)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := root.ExecuteContext(ctx); err != nil {
		var reportedErr *clientcli.ReportedError
		if errors.As(err, &reportedErr) {
			return 1
		}
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
		"config file path (default: "+appconfig.ConfigFileHelp+")",
	)

	root.AddCommand(newVersionCommand(stdout))
	clientStdin := bufio.NewReader(stdin)
	root.AddCommand(clientcli.NewCommand(clientStdin, stdout, stderr, clientcli.CommandOptions{
		ConfigFilePath:      &configFilePath,
		LocalSessionFactory: newLocalClientSessionFactory(clientStdin, stderr),
	}))
	root.AddCommand(newMCPCommand(stdin, stdout, stderr))
	root.AddCommand(newServeCommand(stdin, stdout, stderr, &configFilePath))
	root.AddCommand(newMigrateCommand(stdin, stderr, &configFilePath))
	root.AddCommand(newDBCommand(stdout, stderr, &configFilePath))

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

func newLocalClientSessionFactory(stdin io.Reader, stderr io.Writer) clientcli.LocalSessionFactory {
	return func(cmd *cobra.Command, cfg appconfig.Config) (clientcli.LocalSession, error) {
		assumeYesFlag, err := cmd.Flags().GetBool("yes")
		if err != nil {
			return clientcli.LocalSession{}, err
		}
		assumeYes, err := commandBoolValue(cmd, "yes", assumeYesFlag, "MINA_YES")
		if err != nil {
			return clientcli.LocalSession{}, err
		}
		created, err := confirmDatabaseCreation(cmd.Context(), stdin, stderr, cfg, assumeYes)
		if err != nil {
			return clientcli.LocalSession{}, err
		}
		if !created {
			if err := confirmPendingMigrations(cmd.Context(), stdin, stderr, cfg, false, assumeYes); err != nil {
				return clientcli.LocalSession{}, err
			}
		}

		appInstance, err := runtime.New(cmd.Context(), cfg, runtime.Options{
			ExecutionProfile: runtime.ExecutionProfileOneShot,
		})
		if err != nil {
			return clientcli.LocalSession{}, fmt.Errorf("startup error: %w", err)
		}

		return clientcli.LocalSession{
			Handler: appInstance.Handler(),
			Close:   appInstance.Close,
		}, nil
	}
}

func newServeCommand(stdin io.Reader, stdout io.Writer, stderr io.Writer, configFilePath *string) *cobra.Command {
	var assumeYes bool
	var quiet bool
	var seedDemo bool
	sources := appconfig.Sources()
	flagCfg := appconfig.DefaultConfig()
	cmd := &cobra.Command{
		Use:          "serve",
		Short:        "Serve the REST API",
		Args:         noPositionalArgs("serve"),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := appconfig.Load(
				appconfig.LoadOptions{ConfigFilePath: *configFilePath},
				appconfig.Overrides{
					DatabasePath:     configOverride(cmd, "db", flagCfg.DatabasePath),
					AccountingSchema: configOverride(cmd, "schema", flagCfg.AccountingSchema),
					Serve: appconfig.ServeOverrides{
						Host:          configOverride(cmd, "host", flagCfg.Serve.Host),
						Port:          configOverride(cmd, "port", flagCfg.Serve.Port),
						AccessLogPath: configOverride(cmd, "access-log", flagCfg.Serve.AccessLogPath),
					},
				},
			)
			if err != nil {
				return err
			}
			assumeYesValue, err := commandBoolValue(cmd, "yes", assumeYes, "MINA_YES")
			if err != nil {
				return err
			}
			quietValue, err := commandBoolValue(cmd, "quiet", quiet, "MINA_QUIET")
			if err != nil {
				return err
			}
			if err := validateServeConfig(cfg, quietValue); err != nil {
				return err
			}

			if err := serve(cmd.Context(), stdin, stdout, stderr, cfg, quietValue, seedDemo, assumeYesValue); err != nil {
				return commandExitError(err)
			}

			return nil
		},
	}
	cmd.Flags().StringVar(&flagCfg.DatabasePath, "db", "", "path to the Mina database file "+sourceHelp(sources[appconfig.SourceDatabasePath]))
	cmd.Flags().StringVar(
		&flagCfg.AccountingSchema,
		"schema",
		"",
		"DuckDB schema for accounting state "+sourceHelp(sources[appconfig.SourceAccountingSchema]),
	)
	cmd.Flags().StringVar(&flagCfg.Serve.Host, "host", flagCfg.Serve.Host, "host interface for the REST API "+sourceHelp(sources[appconfig.SourceServeHost]))
	cmd.Flags().IntVar(&flagCfg.Serve.Port, "port", flagCfg.Serve.Port, "port for the REST API "+sourceHelp(sources[appconfig.SourceServePort]))
	cmd.Flags().BoolVar(
		&assumeYes,
		"yes",
		false,
		"answer yes to database creation and migration prompts "+commandEnvHelp("MINA_YES"),
	)
	cmd.Flags().StringVar(
		&flagCfg.Serve.AccessLogPath,
		"access-log",
		"",
		"write access logs to a file instead of stderr "+sourceHelp(sources[appconfig.SourceServeAccessLogPath]),
	)
	cmd.Flags().BoolVar(&quiet, "quiet", false, "disable access logs "+commandEnvHelp("MINA_QUIET"))
	cmd.Flags().BoolVar(&seedDemo, "demo", false, "seed deterministic demo data at startup")
	cmd.SetFlagErrorFunc(func(_ *cobra.Command, err error) error {
		return normalizeFlagError(err)
	})

	return cmd
}

func newMigrateCommand(stdin io.Reader, stderr io.Writer, configFilePath *string) *cobra.Command {
	var assumeYes bool
	sources := appconfig.Sources()
	flagCfg := appconfig.Config{}
	cmd := &cobra.Command{
		Use:          "migrate",
		Short:        "Apply database migrations",
		Args:         noPositionalArgs("migrate"),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := appconfig.Load(
				appconfig.LoadOptions{ConfigFilePath: *configFilePath},
				appconfig.Overrides{
					DatabasePath:     configOverride(cmd, "db", flagCfg.DatabasePath),
					AccountingSchema: configOverride(cmd, "schema", flagCfg.AccountingSchema),
				},
			)
			if err != nil {
				return err
			}
			assumeYesValue, err := commandBoolValue(cmd, "yes", assumeYes, "MINA_YES")
			if err != nil {
				return err
			}
			if cfg.DatabasePath == "" {
				return errors.New("migrate requires --db")
			}
			if err := runtime.Validate(cfg, false); err != nil {
				return err
			}

			if err := migrate(cmd.Context(), stdin, stderr, cfg, assumeYesValue); err != nil {
				return commandExitError(err)
			}

			return nil
		},
	}
	cmd.Flags().StringVar(&flagCfg.DatabasePath, "db", "", "path to the Mina database file "+sourceHelp(sources[appconfig.SourceDatabasePath]))
	cmd.Flags().StringVar(
		&flagCfg.AccountingSchema,
		"schema",
		"",
		"DuckDB schema for accounting state "+sourceHelp(sources[appconfig.SourceAccountingSchema]),
	)
	cmd.Flags().BoolVar(
		&assumeYes,
		"yes",
		false,
		"answer yes to database creation and migration prompts "+commandEnvHelp("MINA_YES"),
	)

	return cmd
}

func newDBCommand(stdout io.Writer, stderr io.Writer, configFilePath *string) *cobra.Command {
	cmd := &cobra.Command{
		Use:          "db",
		Short:        "Database diagnostics",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
	}
	cmd.AddCommand(newDBValidateCommand(stdout, stderr, configFilePath))

	return cmd
}

func newDBValidateCommand(stdout io.Writer, stderr io.Writer, configFilePath *string) *cobra.Command {
	var shallow bool
	sources := appconfig.Sources()
	flagCfg := appconfig.Config{}
	cmd := &cobra.Command{
		Use:          "validate",
		Short:        "Validate a Mina database file",
		Args:         noPositionalArgs("db validate"),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := appconfig.Load(
				appconfig.LoadOptions{ConfigFilePath: *configFilePath},
				appconfig.Overrides{
					DatabasePath:     configOverride(cmd, "db", flagCfg.DatabasePath),
					AccountingSchema: configOverride(cmd, "schema", flagCfg.AccountingSchema),
				},
			)
			if err != nil {
				return err
			}
			if cfg.DatabasePath == "" {
				return errors.New("db validate requires --db")
			}

			if err := dbValidate(cmd.Context(), cfg, shallow, stdout, stderr); err != nil {
				var runtimeErr *exitError
				if errors.As(err, &runtimeErr) {
					return runtimeErr
				}
				return &exitError{code: 1, err: err}
			}

			return nil
		},
	}
	cmd.Flags().StringVar(&flagCfg.DatabasePath, "db", "", "path to the Mina database file "+sourceHelp(sources[appconfig.SourceDatabasePath]))
	cmd.Flags().StringVar(
		&flagCfg.AccountingSchema,
		"schema",
		"",
		"DuckDB schema for accounting state "+sourceHelp(sources[appconfig.SourceAccountingSchema]),
	)
	cmd.Flags().BoolVar(&shallow, "shallow", false, "validate schema only")

	return cmd
}

func configOverride[T any](cmd *cobra.Command, flag string, value T) appconfig.Override[T] {
	if cmd.Flags().Changed(flag) {
		return appconfig.Set(value)
	}

	return appconfig.Override[T]{}
}

func sourceHelp(source appconfig.Source) string {
	return fmt.Sprintf("(config: %s; env: %s)", source.ConfigPath, source.EnvVar)
}

func commandEnvHelp(envVar string) string {
	return fmt.Sprintf("(env: %s)", envVar)
}

func commandBoolValue(cmd *cobra.Command, flag string, flagValue bool, envVar string) (bool, error) {
	if cmd.Flags().Changed(flag) {
		return flagValue, nil
	}
	value, ok := os.LookupEnv(envVar)
	if !ok {
		return false, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean", envVar)
	}

	return parsed, nil
}

func commandExitError(err error) *exitError {
	code := 1
	if runtime.IsDatabaseValidationInternalError(err) {
		code = 2
	}

	return &exitError{code: code, err: err}
}

func validateServeConfig(cfg appconfig.Config, quiet bool) error {
	if err := runtime.Validate(cfg, true); err != nil {
		return err
	}
	if cfg.Serve.Port < 0 || cfg.Serve.Port > 65535 {
		return errors.New("--port must be between 0 and 65535")
	}
	if quiet && cfg.Serve.AccessLogPath != "" {
		return errors.New("--quiet cannot be combined with --access-log")
	}

	return nil
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

func serve(
	ctx context.Context,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
	cfg appconfig.Config,
	quiet bool,
	seedDemo bool,
	assumeYes bool,
) error {
	if cfg.DatabasePath == "" {
		if _, err := fmt.Fprintln(stderr, "warning: no --db provided; using ephemeral in-memory accounting state"); err != nil {
			return err
		}
	}

	accessLog, closeAccessLog, err := openAccessLog(stderr, cfg.Serve.AccessLogPath, quiet)
	if err != nil {
		return err
	}
	defer closeAccessLog()

	runtimeOpts := runtime.Options{
		ExecutionProfile: runtime.ExecutionProfileLongRunning,
		HTTP: runtime.HTTPConfig{
			AccessLog:  accessLog,
			MCPVersion: version,
		},
		Operations: runtime.OperationConfig{
			Enabled:    true,
			DeferStart: true,
			ErrorLog:   stderr,
		},
	}
	created, err := confirmDatabaseCreation(ctx, stdin, stderr, cfg, assumeYes)
	if err != nil {
		return err
	}
	if seedDemo && cfg.DatabasePath != "" {
		exists, err := runtime.AccountingSchemaExists(ctx, cfg, runtimeOpts.Operations.Enabled)
		if err != nil {
			return fmt.Errorf("check demo schema: %w", err)
		}
		if exists {
			return fmt.Errorf("demo seeding requires schema %q to not already exist", runtime.AccountingLocationConfig(cfg).Schema)
		}
	}
	if !created {
		if err := confirmPendingMigrations(ctx, stdin, stderr, cfg, runtimeOpts.Operations.Enabled, assumeYes); err != nil {
			return err
		}
	}
	listener, err := net.Listen("tcp", net.JoinHostPort(cfg.Serve.Host, strconv.Itoa(cfg.Serve.Port)))
	if err != nil {
		return fmt.Errorf("listen error: %w", err)
	}
	defer func() {
		_ = listener.Close()
	}()
	cfg.Serve.Port = listener.Addr().(*net.TCPAddr).Port

	appInstance, err := runtime.New(ctx, cfg, runtimeOpts)
	if err != nil {
		return fmt.Errorf("startup error: %w", err)
	}
	defer func() {
		if err := appInstance.Close(); err != nil {
			_, _ = fmt.Fprintf(stderr, "close error: %v\n", err)
		}
	}()
	if seedDemo {
		summary, err := appInstance.SeedDemo(ctx)
		if err != nil {
			return fmt.Errorf("demo seed error: %w", err)
		}
		if _, err := fmt.Fprintf(stdout, "seeded demo data: %d transactions\n", summary.Transactions); err != nil {
			return err
		}
	}

	appInstance.StartOperations()

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

func openAccessLog(stderr io.Writer, path string, quiet bool) (io.Writer, func(), error) {
	if quiet {
		return nil, func() {}, nil
	}
	if path == "" {
		return stderr, func() {}, nil
	}

	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, func() {}, fmt.Errorf("access log error: %w", err)
	}

	return file, func() {
		_ = file.Close()
	}, nil
}

func migrate(ctx context.Context, stdin io.Reader, stderr io.Writer, cfg appconfig.Config, assumeYes bool) error {
	created, err := confirmDatabaseCreation(ctx, stdin, stderr, cfg, assumeYes)
	if err != nil {
		return err
	}
	if !created {
		if err := confirmPendingMigrations(ctx, stdin, stderr, cfg, false, assumeYes); err != nil {
			return err
		}
	}
	appInstance, err := runtime.New(ctx, cfg, runtime.Options{ExecutionProfile: runtime.ExecutionProfileLongRunning})
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

func dbValidate(ctx context.Context, cfg appconfig.Config, shallow bool, stdout io.Writer, stderr io.Writer) error {
	level := runtime.DatabaseValidationLevelFull
	if shallow {
		level = runtime.DatabaseValidationLevelShallow
	}
	report, err := runtime.ValidateDatabase(ctx, cfg, level)
	if err != nil {
		if runtime.IsDatabaseValidationInternalError(err) {
			return &exitError{code: 2, err: err}
		}

		return err
	}
	if report.HasErrors() {
		if err := report.Write(stderr); err != nil {
			return err
		}
		return &exitError{code: 1, err: errors.New("database validation failed")}
	}

	return report.Write(stdout)
}

func confirmDatabaseCreation(
	ctx context.Context,
	stdin io.Reader,
	stderr io.Writer,
	cfg appconfig.Config,
	assumeYes bool,
) (bool, error) {
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
	answer, err := readConfirmation(ctx, stdin)
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
	cfg appconfig.Config,
	operationsEnabled bool,
	assumeYes bool,
) error {
	if cfg.DatabasePath == "" {
		return nil
	}

	pending, err := runtime.HasPendingMigrations(ctx, cfg, operationsEnabled)
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
	confirmed, err := readConfirmation(ctx, stdin)
	if err != nil {
		return err
	}
	if confirmed {
		return nil
	}

	return errors.New("database migrations not confirmed")
}

func readConfirmation(ctx context.Context, stdin io.Reader) (bool, error) {
	type readResult struct {
		answer string
		err    error
	}
	resultCh := make(chan readResult, 1)
	go func() {
		answer, err := bufio.NewReader(stdin).ReadString('\n')
		resultCh <- readResult{answer: answer, err: err}
	}()

	var result readResult
	select {
	case <-ctx.Done():
		return false, ctx.Err()
	case result = <-resultCh:
	}
	if result.err != nil && !errors.Is(result.err, io.EOF) {
		return false, fmt.Errorf("read confirmation: %w", result.err)
	}

	switch strings.ToLower(strings.TrimSpace(result.answer)) {
	case "y", "yes":
		return true, nil
	default:
		return false, nil
	}
}

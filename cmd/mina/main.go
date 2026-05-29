package main

import (
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
	"syscall"

	"github.com/spf13/cobra"

	"mina.local/mina/internal/runtime"
)

const version = "0.0.0-dev"

var portFlagErrorPattern = regexp.MustCompile(`invalid argument "([^"]+)" for "--port" flag`)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout io.Writer, stderr io.Writer) int {
	root := newRootCommand(stdout, stderr)
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

func newRootCommand(stdout io.Writer, stderr io.Writer) *cobra.Command {
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

	root.AddCommand(newVersionCommand(stdout))
	root.AddCommand(newServeCommand(stdout, stderr))
	root.AddCommand(newMigrateCommand(stderr))

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

func newServeCommand(stdout io.Writer, stderr io.Writer) *cobra.Command {
	cfg := runtime.ServeConfig{
		Config: runtime.Config{
			ApplyMigrations: true,
		},
		Host: "127.0.0.1",
		Port: 8080,
	}
	cmd := &cobra.Command{
		Use:          "serve",
		Short:        "Serve the REST API",
		Args:         noPositionalArgs("serve"),
		SilenceUsage: true,
		RunE: func(_ *cobra.Command, _ []string) error {
			if cfg.DatabasePath == "" {
				return errors.New("serve requires --db")
			}
			if err := cfg.Validate(); err != nil {
				return err
			}

			if err := serve(stdout, stderr, cfg); err != nil {
				return &exitError{code: 1, err: err}
			}

			return nil
		},
	}
	cmd.Flags().StringVar(&cfg.DatabasePath, "db", "", "path to the Mina database file")
	cmd.Flags().StringVar(&cfg.Host, "host", cfg.Host, "host interface for the REST API")
	cmd.Flags().IntVar(&cfg.Port, "port", cfg.Port, "port for the REST API")
	cmd.Flags().BoolVar(&cfg.CreateIfMissing, "create", false, "create the database file when it does not exist")
	cmd.Flags().BoolVar(&cfg.ApplyMigrations, "migrate", cfg.ApplyMigrations, "apply database migrations before serving")
	cmd.SetFlagErrorFunc(func(_ *cobra.Command, err error) error {
		return normalizeFlagError(err)
	})

	return cmd
}

func newMigrateCommand(stderr io.Writer) *cobra.Command {
	cfg := runtime.Config{
		ApplyMigrations: true,
	}
	cmd := &cobra.Command{
		Use:          "migrate",
		Short:        "Apply database migrations",
		Args:         noPositionalArgs("migrate"),
		SilenceUsage: true,
		RunE: func(_ *cobra.Command, _ []string) error {
			if cfg.DatabasePath == "" {
				return errors.New("migrate requires --db")
			}
			if err := cfg.Validate(); err != nil {
				return err
			}

			if err := migrate(stderr, cfg); err != nil {
				return &exitError{code: 1, err: err}
			}

			return nil
		},
	}
	cmd.Flags().StringVar(&cfg.DatabasePath, "db", "", "path to the Mina database file")
	cmd.Flags().BoolVar(&cfg.CreateIfMissing, "create", false, "create the database file when it does not exist")

	return cmd
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

func serve(stdout io.Writer, stderr io.Writer, cfg runtime.ServeConfig) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	appInstance, err := runtime.New(ctx, runtime.Config{
		DatabasePath:    cfg.DatabasePath,
		CreateIfMissing: cfg.CreateIfMissing,
		ApplyMigrations: cfg.ApplyMigrations,
	})
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

func migrate(stderr io.Writer, cfg runtime.Config) error {
	ctx := context.Background()
	appInstance, err := runtime.New(ctx, runtime.Config{
		DatabasePath:    cfg.DatabasePath,
		CreateIfMissing: cfg.CreateIfMissing,
		ApplyMigrations: true,
	})
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

package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"mina.local/mina/internal/app"
)

const version = "0.0.0-dev"

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout io.Writer, stderr io.Writer) int {
	if len(args) == 0 {
		return exitCode(printHelp(stdout), 0)
	}

	switch args[0] {
	case "serve":
		return runServe(args[1:], stdout, stderr)
	}

	if len(args) != 1 {
		return exitCode(printUsageError(stderr, "expected at most one argument"), 2)
	}
	switch args[0] {
	case "-h", "--help", "help":
		return exitCode(printHelp(stdout), 0)
	case "-v", "--version", "version":
		if _, err := fmt.Fprintf(stdout, "mina %s\n", version); err != nil {
			return 1
		}
		return 0
	default:
		return exitCode(printUsageError(stderr, fmt.Sprintf("unknown argument %q", args[0])), 2)
	}
}

func exitCode(err error, successCode int) int {
	if err != nil {
		return 1
	}

	return successCode
}

func runServe(args []string, stdout io.Writer, stderr io.Writer) int {
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	flags.SetOutput(stderr)
	dbPath := flags.String("db", "", "path to the Mina database file")
	host := flags.String("host", "127.0.0.1", "host interface for the REST API")
	port := flags.Int("port", 8080, "port for the REST API")
	createIfMissing := flags.Bool("create", false, "create the database file when it does not exist")
	applyMigrations := flags.Bool("migrate", true, "apply database migrations before serving")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		return exitCode(printUsageError(stderr, "serve does not accept positional arguments"), 2)
	}
	if *dbPath == "" {
		return exitCode(printUsageError(stderr, "serve requires --db"), 2)
	}
	if *port < 0 || *port > 65535 {
		return exitCode(printUsageError(stderr, "--port must be between 0 and 65535"), 2)
	}
	if *createIfMissing && !*applyMigrations {
		if _, err := os.Stat(*dbPath); errors.Is(err, os.ErrNotExist) {
			return exitCode(printUsageError(stderr, "--migrate=false requires an existing database"), 2)
		} else if err != nil {
			if _, writeErr := fmt.Fprintf(stderr, "startup error: stat database path: %v\n", err); writeErr != nil {
				return 1
			}
			return 1
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	appInstance, err := app.New(ctx, app.Config{
		DatabasePath:    *dbPath,
		CreateIfMissing: *createIfMissing,
		ApplyMigrations: *applyMigrations,
	})
	if err != nil {
		if _, writeErr := fmt.Fprintf(stderr, "startup error: %v\n", err); writeErr != nil {
			return 1
		}
		return 1
	}
	defer func() {
		if err := appInstance.Close(); err != nil {
			_, _ = fmt.Fprintf(stderr, "close error: %v\n", err)
		}
	}()

	listener, err := net.Listen("tcp", net.JoinHostPort(*host, strconv.Itoa(*port)))
	if err != nil {
		if _, writeErr := fmt.Fprintf(stderr, "listen error: %v\n", err); writeErr != nil {
			return 1
		}
		return 1
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
		return 1
	}

	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		if _, writeErr := fmt.Fprintf(stderr, "server error: %v\n", err); writeErr != nil {
			return 1
		}
		return 1
	}

	return 0
}

func printUsageError(w io.Writer, message string) error {
	if _, err := fmt.Fprintf(w, "usage error: %s\n", message); err != nil {
		return err
	}

	return printHelp(w)
}

func printHelp(w io.Writer) error {
	lines := []string{
		"Mina local-first personal finance API",
		"",
		"Usage:",
		"  mina [--help|--version]",
		"  mina serve --db PATH [--host HOST] [--port PORT] [--create] [--migrate=false]",
	}

	for _, line := range lines {
		if _, err := fmt.Fprintln(w, line); err != nil {
			return err
		}
	}

	return nil
}

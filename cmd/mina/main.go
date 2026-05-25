package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"mina/internal/app"
)

var version = "dev"

func main() {
	if err := newRootCommand().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func newRootCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "mina",
		Short: "Run the mina API service",
	}
	cmd.AddCommand(newServeCommand())
	cmd.AddCommand(&cobra.Command{
		Use:   "version",
		Short: "Print the version",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Fprintln(cmd.OutOrStdout(), version)
		},
	})
	return cmd
}

func newServeCommand() *cobra.Command {
	var addr string
	var dbPath string

	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Serve the REST API",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()

			application, err := app.New(ctx, dbPath)
			if err != nil {
				return err
			}
			defer application.Close()

			server := &http.Server{
				Addr:              addr,
				Handler:           application.Handler,
				ReadHeaderTimeout: 5 * time.Second,
			}

			errCh := make(chan error, 1)
			go func() {
				slog.Info("serving API", "addr", addr, "db", dbLabel(dbPath))
				errCh <- server.ListenAndServe()
			}()

			select {
			case <-ctx.Done():
				shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				if err := server.Shutdown(shutdownCtx); err != nil {
					return err
				}
				return nil
			case err := <-errCh:
				if errors.Is(err, http.ErrServerClosed) {
					return nil
				}
				return err
			}
		},
	}

	cmd.Flags().StringVar(&addr, "addr", ":8080", "address to listen on")
	cmd.Flags().StringVar(&dbPath, "db", "", "DuckDB path; empty uses an in-memory database")
	return cmd
}

func dbLabel(path string) string {
	if path == "" {
		return "in-memory"
	}
	return path
}

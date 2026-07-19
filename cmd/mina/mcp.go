package main

import (
	"fmt"
	"io"

	"github.com/spf13/cobra"

	"github.com/mishamsk/mina/internal/mcpserver"
)

func newMCPCommand(stdin io.Reader, stdout io.Writer, stderr io.Writer) *cobra.Command {
	cmd := &cobra.Command{
		Use:          "mcp",
		Short:        "Serve Mina through Model Context Protocol",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return cmd.Help()
		},
	}
	cmd.AddCommand(newMCPStdioCommand(stdin, stdout, stderr))
	return cmd
}

func newMCPStdioCommand(stdin io.Reader, stdout io.Writer, stderr io.Writer) *cobra.Command {
	var serverURL string
	cmd := &cobra.Command{
		Use:           "stdio",
		Short:         "Serve MCP over stdio against a Mina server",
		Args:          noPositionalArgs("mcp stdio"),
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			server, err := mcpserver.NewRemote(serverURL, mcpserver.Options{
				Version:     version,
				Diagnostics: stderr,
			})
			if err != nil {
				return err
			}
			if err := server.RunStdio(cmd.Context(), stdin, stdout); err != nil {
				return &exitError{code: 1, err: fmt.Errorf("MCP stdio server: %w", err)}
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&serverURL, "server", "", "Mina server URL")
	return cmd
}

package main

import (
	"fmt"
	"io"
	"os"
)

const version = "0.0.0-dev"

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout io.Writer, stderr io.Writer) int {
	if len(args) == 0 {
		return exitCode(printHelp(stdout), 0)
	}

	if len(args) != 1 {
		if err := printUsageError(stderr, "expected at most one argument"); err != nil {
			return 1
		}
		return 2
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
		if err := printUsageError(stderr, fmt.Sprintf("unknown argument %q", args[0])); err != nil {
			return 1
		}
		return 2
	}
}

func exitCode(err error, successCode int) int {
	if err != nil {
		return 1
	}

	return successCode
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
	}

	for _, line := range lines {
		if _, err := fmt.Fprintln(w, line); err != nil {
			return err
		}
	}

	return nil
}

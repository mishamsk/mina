// testdiff compares runner inventories and script changes with the main worktree.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

type test struct {
	Name string `json:"name"`
	File string `json:"file,omitempty"`
	Line int    `json:"line,omitempty"`
	End  int    `json:"-"`
}

type change struct {
	Status string `json:"status"`
	Before *test  `json:"before,omitempty"`
	After  *test  `json:"after,omitempty"`
}

type category struct {
	Kind      string     `json:"kind"`
	Before    int        `json:"before"`
	After     int        `json:"after"`
	Added     int        `json:"added"`
	Removed   int        `json:"removed"`
	Modified  *int       `json:"modified"`
	Estimated bool       `json:"modified_estimated"`
	Lines     *lineCount `json:"lines,omitempty"`
	Changes   []change   `json:"changes"`
}

type lineCount struct {
	Added   int `json:"added"`
	Deleted int `json:"deleted"`
}

type revision struct {
	Branch   string `json:"branch"`
	Commit   string `json:"commit"`
	Worktree string `json:"worktree"`
}

type report struct {
	SchemaVersion int        `json:"schema_version"`
	Mode          string     `json:"mode"`
	Base          revision   `json:"base"`
	Current       revision   `json:"current"`
	Categories    []category `json:"categories"`
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "test-diff:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("test-diff", flag.ContinueOnError)
	format := flags.String("format", "console", "output format: console or json")
	working := flags.Bool("worktree", false, "include current staged, unstaged, and untracked changes; main must remain clean")
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if flags.NArg() != 0 || (*format != "console" && *format != "json") {
		return errors.New("usage: just test-diff [--format console|json] [--worktree]")
	}
	data, err := gather(ctx, *working)
	if err != nil {
		return err
	}
	result := prepare(data)
	if *format == "json" {
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		return encoder.Encode(result)
	}
	return renderConsole(os.Stdout, result)
}

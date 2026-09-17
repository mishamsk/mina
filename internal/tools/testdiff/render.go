package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"text/tabwriter"

	"charm.land/lipgloss/v2"
	"golang.org/x/term"
)

func categoryName(kind string) string {
	switch kind {
	case "go":
		return "Go tests"
	case "frontend_e2e":
		return "Frontend E2E"
	default:
		return "CLI scripts"
	}
}

func renderConsole(out *os.File, result report) error {
	width := 100
	terminal := term.IsTerminal(int(out.Fd()))
	if terminal {
		if w, _, err := term.GetSize(int(out.Fd())); err == nil && w > 0 {
			width = w
		}
	}
	_, noColor := os.LookupEnv("NO_COLOR")
	color := terminal && !noColor && os.Getenv("TERM") != "dumb"
	style := func(text, tint string, bold bool) string {
		s := lipgloss.NewStyle()
		if color {
			s = s.Foreground(lipgloss.Color(tint)).Bold(bold)
		}
		return s.Render(lipgloss.Wrap(text, width, ""))
	}
	var b strings.Builder
	fmt.Fprintln(&b, style("TEST CHANGES", "6", true))
	fmt.Fprintln(&b, style(fmt.Sprintf("%s · %.8s → %s · %.8s", result.Base.Branch, result.Base.Commit, result.Current.Branch, result.Current.Commit), "7", false))
	fmt.Fprintln(&b, style(result.Mode, "8", false))
	fmt.Fprintln(&b)
	var summary strings.Builder
	tw := tabwriter.NewWriter(&summary, 0, 4, 3, ' ', tabwriter.AlignRight)
	if _, err := fmt.Fprintln(tw, "\tAdded\tRemoved\tModified\t"); err != nil {
		return err
	}
	for _, c := range result.Categories {
		modified := "—"
		if c.Modified != nil {
			modified = strconv.Itoa(*c.Modified)
			if c.Estimated {
				modified = "~" + modified
			}
		}
		if _, err := fmt.Fprintf(tw, "%s\t%d\t%d\t%s\t\n", categoryName(c.Kind), c.Added, c.Removed, modified); err != nil {
			return err
		}
	}
	if err := tw.Flush(); err != nil {
		return err
	}
	if width < 55 {
		for _, c := range result.Categories {
			modified := "—"
			if c.Modified != nil {
				modified = strconv.Itoa(*c.Modified)
				if c.Estimated {
					modified = "~" + modified
				}
			}
			fmt.Fprintln(&b, style(fmt.Sprintf("%s\n  Added %d · Removed %d · Modified %s", categoryName(c.Kind), c.Added, c.Removed, modified), "7", false))
		}
	} else {
		b.WriteString(summary.String())
	}
	for _, c := range result.Categories {
		if c.Lines != nil {
			fmt.Fprintf(&b, "\nCLI script diff: +%d / −%d lines\n", c.Lines.Added, c.Lines.Deleted)
		}
	}
	fmt.Fprintln(&b, "\n"+style("— Not available   ~ Estimated from changed lines", "8", false))
	for _, c := range result.Categories {
		if len(c.Changes) == 0 {
			continue
		}
		fmt.Fprintln(&b, "\n"+style(strings.ToUpper(categoryName(c.Kind)), "6", true))
		lastFile := ""
		for _, change := range c.Changes {
			t := changedTest(change)
			if t.File != "" && t.File != lastFile {
				fmt.Fprintln(&b, style("  "+t.File, "8", false))
				lastFile = t.File
			}
			symbol, tint := "+", "2"
			switch change.Status {
			case "removed":
				symbol, tint = "−", "1"
			case "modified":
				symbol, tint = "~", "3"
			}
			name := strings.TrimPrefix(t.Name, "github.com/mishamsk/mina/")
			if c.Kind == "cli_scripts" {
				name = change.Status
			} else if t.Line > 0 {
				name += fmt.Sprintf(" (line %d)", t.Line)
			}
			fmt.Fprintln(&b, style("    "+symbol+" "+name, tint, false))
		}
	}
	_, err := fmt.Fprint(out, b.String())
	return err
}

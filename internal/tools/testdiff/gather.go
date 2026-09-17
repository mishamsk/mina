package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

const scriptDir = "cmd/mina/testdata/script/"

type inventory struct {
	Go       map[string]test
	Frontend map[string]test
	Scripts  map[string]scriptMetadata
}

type scriptMetadata struct {
	Hash  [sha256.Size]byte
	Lines int
}

type span struct{ Start, Count int }
type hunk struct{ Before, After span }
type gathered struct {
	Base, Current revision
	Before, After inventory
	Diffs         map[string][]hunk
	Working       bool
}

// Commands go through Justfile recipes for runner/toolchain ownership. Git and
// filesystem access belong to this gathering boundary, never to preparation.
func command(ctx context.Context, root string, name string, args ...string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = root
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		if strings.HasPrefix(key, "PLAYWRIGHT_JSON_OUTPUT_") {
			continue
		}
		cmd.Env = append(cmd.Env, entry)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("%s %s in %s: %w\n%s%s", name, strings.Join(args, " "), root, err, stderr.String(), output)
	}
	return output, nil
}

func git(ctx context.Context, root string, args ...string) (string, error) {
	output, err := command(ctx, root, "git", args...)
	return strings.TrimSuffix(string(output), "\n"), err
}

func clean(ctx context.Context, root string) error {
	status, err := git(ctx, root, "status", "--porcelain", "--untracked-files=all")
	if err != nil {
		return err
	}
	if status != "" {
		return fmt.Errorf("worktree %s must be clean (use --worktree to include current changes; main must always be clean)", root)
	}
	return nil
}

func revisions(ctx context.Context, working bool) (revision, revision, error) {
	var base, current revision
	root, err := git(ctx, "", "rev-parse", "--show-toplevel")
	if err != nil {
		return base, current, err
	}
	current.Worktree = root
	current.Commit, err = git(ctx, root, "rev-parse", "HEAD")
	if err != nil {
		return base, current, err
	}
	current.Branch, err = git(ctx, root, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return base, current, err
	}
	listed, err := git(ctx, root, "worktree", "list", "--porcelain", "-z")
	if err != nil {
		return base, current, err
	}
	var candidate revision
	for field := range strings.SplitSeq(listed, "\x00") {
		switch {
		case strings.HasPrefix(field, "worktree "):
			candidate = revision{Worktree: strings.TrimPrefix(field, "worktree ")}
		case strings.HasPrefix(field, "HEAD "):
			candidate.Commit = strings.TrimPrefix(field, "HEAD ")
		case field == "branch refs/heads/main":
			candidate.Branch = "main"
			base = candidate
		}
	}
	if base.Worktree == "" {
		return base, current, errors.New("main must be checked out in an existing worktree")
	}
	if err := clean(ctx, base.Worktree); err != nil {
		return base, current, err
	}
	if !working {
		if err := clean(ctx, root); err != nil {
			return base, current, err
		}
	}
	return base, current, nil
}

func gather(ctx context.Context, working bool) (gathered, error) {
	data := gathered{Working: working, Diffs: make(map[string][]hunk)}
	var err error
	data.Base, data.Current, err = revisions(ctx, working)
	if err != nil {
		return data, err
	}
	cachePath := filepath.Join(data.Current.Worktree, "build", "test-diff", "main-v2", data.Base.Commit+".gob")
	var cached bool
	data.Before, cached, err = readInventoryCache(cachePath)
	if err != nil {
		return data, err
	}
	if cached {
		fmt.Fprintf(os.Stderr, "Using cached main tests: %.8s\n", data.Base.Commit)
	} else {
		fmt.Fprintf(os.Stderr, "Listing tests: %s\n", data.Base.Worktree)
		data.Before, err = gatherInventory(ctx, data.Current.Worktree, data.Base.Worktree)
		if err != nil {
			return data, err
		}
	}
	fmt.Fprintf(os.Stderr, "Listing tests: %s\n", data.Current.Worktree)
	data.After, err = gatherInventory(ctx, data.Current.Worktree, data.Current.Worktree)
	if err != nil {
		return data, err
	}
	files := make(map[string]bool)
	for _, t := range data.Before.Frontend {
		files[t.File] = true
	}
	for _, t := range data.After.Frontend {
		files[t.File] = true
	}
	for file := range data.Before.Scripts {
		files[file] = true
	}
	for file := range data.After.Scripts {
		files[file] = true
	}
	header := regexp.MustCompile(`(?m)^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)
	for file := range files {
		args := []string{"diff", "--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", "--unified=0", data.Base.Commit}
		if !working {
			args = append(args, data.Current.Commit)
		}
		args = append(args, "--", ":(literal)"+file)
		patch, err := git(ctx, data.Current.Worktree, args...)
		if err != nil {
			return data, err
		}
		for _, match := range header.FindAllStringSubmatch(patch, -1) {
			data.Diffs[file] = append(data.Diffs[file], hunk{parseSpan(match[1], match[2]), parseSpan(match[3], match[4])})
		}
	}
	// Refuse a mixed baseline if a checkout/commit or baseline edit raced discovery.
	base, current, err := revisions(ctx, working)
	if err != nil {
		return data, err
	}
	if base != data.Base || current != data.Current {
		return data, errors.New("worktree revisions changed during discovery; retry")
	}
	if !cached {
		if err := writeInventoryCache(cachePath, data.Before); err != nil {
			return data, err
		}
	}
	return data, nil
}

func parseSpan(start, count string) span {
	s, _ := strconv.Atoi(start)
	n := 1
	if count != "" {
		n, _ = strconv.Atoi(count)
	}
	return span{s, n}
}

func gatherInventory(ctx context.Context, toolRoot, root string) (inventory, error) {
	i := inventory{Go: make(map[string]test), Frontend: make(map[string]test), Scripts: make(map[string]scriptMetadata)}
	list := func(recipe string) ([]byte, error) {
		return command(ctx, toolRoot, "just", "--justfile", filepath.Join(toolRoot, "Justfile"), recipe, root)
	}
	output, err := list("test-list-go")
	if err != nil {
		return i, err
	}
	decoder := json.NewDecoder(bytes.NewReader(output))
	for {
		var event struct{ Action, Package, Output string }
		if err := decoder.Decode(&event); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return i, fmt.Errorf("decode Go inventory: %w", err)
		}
		if event.Action != "output" {
			continue
		}
		for line := range strings.SplitSeq(event.Output, "\n") {
			if strings.HasPrefix(line, "Test") && line != "TestMain" && !strings.ContainsAny(line, " \t\r") {
				key := event.Package + "/" + line
				i.Go[key] = test{Name: key}
			}
		}
	}
	output, err = list("test-list-frontend")
	if err != nil {
		return i, err
	}
	var listing struct {
		Suites []playwrightSuite `json:"suites"`
		Errors []json.RawMessage `json:"errors"`
	}
	if err := json.Unmarshal(output, &listing); err != nil {
		return i, fmt.Errorf("decode Playwright inventory: %w", err)
	}
	if len(listing.Errors) != 0 {
		return i, fmt.Errorf("playwright discovery errors: %s", listing.Errors)
	}
	for _, suite := range listing.Suites {
		// The outer suite title is the file; nested titles form the test name.
		collectFrontend(i.Frontend, suite, nil)
	}
	if err := frontendRanges(root, i.Frontend); err != nil {
		return i, err
	}
	paths, err := git(ctx, root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", scriptDir)
	if err != nil {
		return i, err
	}
	for file := range strings.SplitSeq(paths, "\x00") {
		if filepath.ToSlash(filepath.Dir(file))+"/" != scriptDir {
			continue
		}
		if !strings.HasSuffix(file, ".txt") && !strings.HasSuffix(file, ".txtar") {
			continue
		}
		content, err := os.ReadFile(filepath.Join(root, file))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return i, err
		}
		i.Scripts[file] = scriptMetadata{Hash: sha256.Sum256(content), Lines: countLines(string(content))}
	}
	return i, nil
}

type playwrightSpec struct {
	Title string `json:"title"`
	File  string `json:"file"`
	Line  int    `json:"line"`
}
type playwrightSuite struct {
	Title  string            `json:"title"`
	Specs  []playwrightSpec  `json:"specs"`
	Suites []playwrightSuite `json:"suites"`
}

func collectFrontend(tests map[string]test, suite playwrightSuite, titles []string) {
	for _, spec := range suite.Specs {
		path := append(slices.Clone(titles), spec.Title)
		// Playwright JSON file paths are relative to testDir, not the repository.
		file := filepath.ToSlash(filepath.Join("frontend/tests/e2e", spec.File))
		identity, _ := json.Marshal(append([]string{file}, path...))
		tests[string(identity)] = test{Name: strings.Join(path, " › "), File: file, Line: spec.Line}
	}
	for _, child := range suite.Suites {
		collectFrontend(tests, child, append(slices.Clone(titles), child.Title))
	}
}

func frontendRanges(root string, tests map[string]test) error {
	files := make(map[string][]string)
	for key, t := range tests {
		files[t.File] = append(files[t.File], key)
	}
	for file, keys := range files {
		content, err := os.ReadFile(filepath.Join(root, file))
		if err != nil {
			return fmt.Errorf("read discovered test file: %w", err)
		}
		last := countLines(string(content))
		for _, key := range keys {
			t := tests[key]
			if t.Line < 1 || t.Line > last {
				return fmt.Errorf("invalid Playwright location: %s:%d", file, t.Line)
			}
			t.End = last
			for _, other := range keys {
				if line := tests[other].Line; line > t.Line && line <= t.End {
					t.End = line - 1
				}
			}
			tests[key] = t
		}
	}
	return nil
}

func countLines(content string) int {
	n := strings.Count(content, "\n")
	if content != "" && !strings.HasSuffix(content, "\n") {
		n++
	}
	return n
}

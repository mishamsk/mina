// reviewloop runs the repository's local Codex review loop.
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	modulePath              = "github.com/mishamsk/mina"
	maxIterations           = 3
	reviewLoopActiveEnvName = "MINA_REVIEW_LOOP_ACTIVE"
	codexHeartbeatInterval  = time.Minute
	codexTurnTimeout        = 30 * time.Minute
	codexNoEventTimeout     = 30 * time.Minute
)

var (
	actionableFindingHeaderRE = regexp.MustCompile(`^## \[(major|minor|nit)\](?:\s|$)`)
	commitSHAArgRE            = regexp.MustCompile(`\A[0-9a-fA-F]{7,40}\z`)
	markdownH2RE              = regexp.MustCompile(`(?m)^##\s+`)
	placeholderRE             = regexp.MustCompile(`\{\{[^{}]+\}\}`)
)

var progressOutputMu sync.Mutex

var (
	appCodeReviewers = []string{
		"compatibility",
		"implementation",
		"quality",
		"simplification",
		"testing",
	}
	stableReviewerOrder = []string{
		"compatibility",
		"implementation",
		"quality",
		"simplification",
		"testing",
		"docs",
		"dev-tooling",
	}
)

type config struct {
	root               string
	goal               string
	previousReviewFile string
	reviewTarget       reviewTarget
	templates          reviewTemplates
	reviewerPrompts    map[string]reviewerPrompt
}

type reviewTarget struct {
	branchName string
	commitSHA  string
	headSHA    string
}

type reviewTemplates struct {
	reviewer  string
	aggregate string
	fixer     string
}

type reviewerPrompt struct {
	name  string
	focus string
}

type reviewerResult struct {
	name    string
	message string
	err     error
}

type codexEvent struct {
	Type     string          `json:"type"`
	ThreadID string          `json:"thread_id"`
	Item     codexEventItem  `json:"item"`
	Message  string          `json:"message"`
	Error    json.RawMessage `json:"error"`
}

type codexEventItem struct {
	Type string `json:"type"`
}

type codexProgress struct {
	label              string
	startedAt          time.Time
	lastEventAt        time.Time
	currentTurnStarted time.Time
	threadID           string
	activeTurn         bool
	turns              int
	actions            codexActionCounters
	errors             []string
}

type codexActionCounters struct {
	commands int
	mcp      int
	web      int
	messages int
	other    int
}

func main() {
	code, err := run(os.Args[1:])
	if err != nil {
		fmt.Fprintf(os.Stderr, "reviewloop: %v\n", err)
	}
	os.Exit(code)
}

func run(args []string) (int, error) {
	if os.Getenv(reviewLoopActiveEnvName) != "" {
		fmt.Println("review loop skipped: already running as part of an outer review loop")
		return 0, nil
	}

	cfg, err := loadConfig(args)
	if err != nil {
		return 2, err
	}
	if err := requireCleanWorktree(cfg.root); err != nil {
		return 1, err
	}

	for iteration := 1; iteration <= maxIterations; iteration++ {
		reviewScope := cfg.reviewTarget.scope(iteration)
		changedFiles, err := cfg.reviewTarget.changedFiles(cfg.root, iteration)
		if err != nil {
			return 2, err
		}
		reviewerNames := selectReviewerNames(changedFiles)
		if len(reviewerNames) == 0 {
			fmt.Printf("review loop successful: no review findings; no reviewers selected for changed files in %s\n", cfg.reviewTarget.diffRange(iteration))
			return 0, nil
		}
		reviewers, err := cfg.selectedReviewers(reviewerNames)
		if err != nil {
			return 2, err
		}
		writeProgressLine("selected reviewers: %s", strings.Join(reviewerNames, ", "))

		rawReviews, err := runReviewers(cfg, reviewScope, reviewers)
		if err != nil {
			return 2, err
		}

		aggregatePrompt, err := interpolate(cfg.templates.aggregate, cfg.placeholderValues(map[string]string{
			"RAW_REVIEWS":  rawReviews,
			"REVIEW_SCOPE": reviewScope,
		}))
		if err != nil {
			return 2, fmt.Errorf("build aggregate prompt: %w", err)
		}
		aggregateReview, err := runCodex(cfg.root, "aggregator", aggregatePrompt)
		if err != nil {
			return 2, err
		}
		writeProgressLine("aggregator finished")

		if err := appendReviewHistory(cfg.previousReviewFile, iteration, aggregateReview); err != nil {
			return 2, err
		}

		reviews := actionableReviews(aggregateReview)
		if reviews == "" {
			fmt.Printf("review loop successful after %d iteration(s); no remaining reviews; history: %s\n", iteration, cfg.previousReviewFile)
			return 0, nil
		}
		if iteration == maxIterations {
			fmt.Printf("review loop stopped after %d iteration(s) with remaining reviews; history: %s\n", maxIterations, cfg.previousReviewFile)
			return 1, nil
		}

		fixPrompt, err := interpolate(cfg.templates.fixer, cfg.placeholderValues(map[string]string{
			"REVIEWS": reviews,
		}))
		if err != nil {
			return 2, fmt.Errorf("build fixer prompt: %w", err)
		}
		if _, err := runCodex(cfg.root, "fixer", fixPrompt); err != nil {
			return 2, fmt.Errorf("%w; history: %s", err, cfg.previousReviewFile)
		}
		writeProgressLine("fixer finished")
	}

	return 2, errors.New("unreachable review loop state")
}

func loadConfig(args []string) (config, error) {
	if len(args) != 1 && len(args) != 2 {
		return config{}, errors.New("usage: reviewloop <goal> [branch-or-commit]")
	}

	goal := strings.TrimSpace(args[0])
	if goal == "" {
		return config{}, errors.New("goal is required")
	}

	root, err := repoRoot()
	if err != nil {
		return config{}, err
	}

	target := reviewTarget{}
	if len(args) == 2 {
		arg := strings.TrimSpace(args[1])
		if arg == "" {
			return config{}, errors.New("branch-or-commit must not be empty when provided")
		}
		if commitSHAArgRE.MatchString(arg) {
			if err := verifyCommit(root, arg); err != nil {
				return config{}, err
			}
			target.commitSHA = arg
		} else {
			branchName, err := requireCurrentBranch(root)
			if err != nil {
				return config{}, err
			}
			target.branchName = branchName
		}
	} else {
		branchName, err := requireCurrentBranch(root)
		if err != nil {
			return config{}, err
		}
		target.branchName = branchName
	}

	headSHA, err := shortGitSHA(root, "HEAD")
	if err != nil {
		return config{}, err
	}
	target.headSHA = headSHA
	previousReviewFile, err := createReviewProgressFile(root, target)
	if err != nil {
		return config{}, err
	}

	templates, err := loadTemplates(root)
	if err != nil {
		return config{}, err
	}
	reviewerPrompts, err := loadReviewerPrompts(root)
	if err != nil {
		return config{}, err
	}

	return config{
		root:               root,
		goal:               goal,
		previousReviewFile: previousReviewFile,
		reviewTarget:       target,
		templates:          templates,
		reviewerPrompts:    reviewerPrompts,
	}, nil
}

func (target reviewTarget) scope(iteration int) string {
	if target.commitSHA == "" {
		return strings.Join([]string{
			"Review the current branch only.",
			"Use this exact range:",
			"1. Compute `base=$(git merge-base HEAD main)`.",
			"2. Inspect `git diff --stat \"$base\" HEAD` for the changed files.",
			"3. Inspect focused diffs with `git diff \"$base\" HEAD -- <path>`.",
			"Do not review `HEAD~1`, unrelated history, or changes already present on `main`.",
		}, "\n")
	}
	if iteration == 1 {
		return strings.Join([]string{
			fmt.Sprintf("Review commit sha `%s` only.", target.commitSHA),
			"Use this exact range:",
			fmt.Sprintf("1. Inspect `git diff --stat %s~1 %s` for the changed files.", target.commitSHA, target.commitSHA),
			fmt.Sprintf("2. Inspect focused diffs with `git diff %s~1 %s -- <path>`.", target.commitSHA, target.commitSHA),
			"Do not review the current working tree, current branch, merge base with `main`, or unrelated history.",
		}, "\n")
	}
	return strings.Join([]string{
		"Review the current branch only, including fixer commits from prior review-loop iterations.",
		"Use this exact range:",
		fmt.Sprintf("1. Inspect `git diff --stat %s~1 HEAD` for the changed files.", target.commitSHA),
		fmt.Sprintf("2. Inspect focused diffs with `git diff %s~1 HEAD -- <path>`.", target.commitSHA),
		"Do not review only the original commit sha, merge base with `main`, or unrelated history.",
	}, "\n")
}

func (target reviewTarget) diffRange(iteration int) string {
	if target.commitSHA == "" {
		return "`git diff $(git merge-base HEAD main) HEAD`"
	}
	if iteration == 1 {
		return fmt.Sprintf("`git diff %s~1 %s`", target.commitSHA, target.commitSHA)
	}
	return fmt.Sprintf("`git diff %s~1 HEAD`", target.commitSHA)
}

func (target reviewTarget) changedFiles(root string, iteration int) ([]string, error) {
	var args []string
	if target.commitSHA == "" {
		base, err := gitOutput(root, "merge-base", "HEAD", "main")
		if err != nil {
			return nil, fmt.Errorf("resolve review diff base: %w", err)
		}
		args = []string{"diff", "--name-only", base, "HEAD"}
	} else if iteration == 1 {
		args = []string{"diff", "--name-only", target.commitSHA + "~1", target.commitSHA}
	} else {
		args = []string{"diff", "--name-only", target.commitSHA + "~1", "HEAD"}
	}

	output, err := gitOutput(root, args...)
	if err != nil {
		return nil, fmt.Errorf("list changed files for %s: %w", target.diffRange(iteration), err)
	}
	return nonEmptyLines(output), nil
}

func gitOutput(root string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", root}, args...)...)
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func requireCleanWorktree(root string) error {
	output, err := gitOutput(root, "status", "--porcelain")
	if err != nil {
		return fmt.Errorf("check clean worktree: %w", err)
	}
	if output != "" {
		return errors.New("worktree isn't clean; commit all your changes first and re-run review again")
	}
	return nil
}

func nonEmptyLines(output string) []string {
	if output == "" {
		return nil
	}
	lines := strings.Split(output, "\n")
	values := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			values = append(values, line)
		}
	}
	return values
}

func repoRoot() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get working directory: %w", err)
	}

	for dir := wd; ; dir = filepath.Dir(dir) {
		if isMinaRoot(dir) {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("could not find %s go.mod from %s", modulePath, wd)
		}
	}
}

func isMinaRoot(dir string) bool {
	contents, err := os.ReadFile(filepath.Join(dir, "go.mod"))
	return err == nil && strings.Contains(string(contents), "module "+modulePath+"\n")
}

func requireCurrentBranch(root string) (string, error) {
	cmd := exec.Command("git", "-C", root, "branch", "--show-current")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("resolve current branch: %w", err)
	}
	branch := strings.TrimSpace(string(output))
	if branch == "" {
		return "", errors.New("current branch is empty; provide branch-or-commit explicitly")
	}
	return branch, nil
}

func verifyCommit(root string, commitSHA string) error {
	cmd := exec.Command("git", "-C", root, "rev-parse", "--verify", commitSHA+"^{commit}")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("resolve commit %s: %w", commitSHA, err)
	}
	return nil
}

func shortGitSHA(root string, rev string) (string, error) {
	cmd := exec.Command("git", "-C", root, "rev-parse", "--short=12", rev)
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("resolve short sha for %s: %w", rev, err)
	}
	shortSHA := strings.TrimSpace(string(output))
	if shortSHA == "" {
		return "", fmt.Errorf("resolve short sha for %s: empty output", rev)
	}
	return shortSHA, nil
}

func createReviewProgressFile(root string, target reviewTarget) (string, error) {
	progressDir := filepath.Join(root, "build", "review-loop")
	if err := os.MkdirAll(progressDir, 0o755); err != nil {
		return "", fmt.Errorf("create review progress directory: %w", err)
	}

	var baseName string
	if target.commitSHA != "" {
		shortSHA, err := shortGitSHA(root, target.commitSHA)
		if err != nil {
			return "", err
		}
		baseName = "review-progress-commit-" + shortSHA
	} else {
		baseName = "review-progress-full-branch-" + fileSafeName(target.branchName) + "-head-" + target.headSHA
	}

	return createNumberedFile(progressDir, baseName, ".md")
}

func createNumberedFile(dir string, baseName string, ext string) (string, error) {
	for counter := 0; ; counter++ {
		name := baseName + ext
		if counter > 0 {
			name = fmt.Sprintf("%s-%d%s", baseName, counter+1, ext)
		}
		path := filepath.Join(dir, name)
		file, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o644)
		if errors.Is(err, fs.ErrExist) {
			continue
		}
		if err != nil {
			return "", fmt.Errorf("create review progress file: %w", err)
		}
		if err := file.Close(); err != nil {
			return "", fmt.Errorf("close review progress file: %w", err)
		}
		return path, nil
	}
}

func loadTemplates(root string) (reviewTemplates, error) {
	reviewRoot := filepath.Join(root, "docs", "agents", "review")

	reviewer, err := readTemplate(filepath.Join(reviewRoot, "reviewer_template.md"))
	if err != nil {
		return reviewTemplates{}, err
	}
	aggregate, err := readTemplate(filepath.Join(reviewRoot, "aggregate_reviews.md"))
	if err != nil {
		return reviewTemplates{}, err
	}
	fixer, err := readTemplate(filepath.Join(reviewRoot, "fix_after_review.md"))
	if err != nil {
		return reviewTemplates{}, err
	}

	return reviewTemplates{
		reviewer:  reviewer,
		aggregate: aggregate,
		fixer:     fixer,
	}, nil
}

func readTemplate(path string) (string, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", path, err)
	}
	return string(contents), nil
}

func loadReviewerPrompts(root string) (map[string]reviewerPrompt, error) {
	pattern := filepath.Join(root, "docs", "agents", "review", "reviewer-prompts", "*.md")
	paths, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("list reviewer prompts: %w", err)
	}
	sort.Strings(paths)
	if len(paths) == 0 {
		return nil, fmt.Errorf("no reviewer prompts found for %s", pattern)
	}

	reviewers := make(map[string]reviewerPrompt, len(paths))
	for _, path := range paths {
		contents, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", path, err)
		}
		name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
		reviewers[name] = reviewerPrompt{
			name:  name,
			focus: string(contents),
		}
	}
	return reviewers, nil
}

func (cfg config) selectedReviewers(names []string) ([]reviewerPrompt, error) {
	reviewers := make([]reviewerPrompt, 0, len(names))
	for _, name := range names {
		reviewer, ok := cfg.reviewerPrompts[name]
		if !ok {
			return nil, fmt.Errorf("reviewer prompt %q is selected but missing", name)
		}
		reviewers = append(reviewers, reviewer)
	}
	return reviewers, nil
}

func selectReviewerNames(paths []string) []string {
	selected := map[string]bool{}
	for _, path := range paths {
		selectReviewersForPath(selected, filepath.ToSlash(path))
	}

	var names []string
	for _, name := range stableReviewerOrder {
		if selected[name] {
			names = append(names, name)
		}
	}
	return names
}

func selectReviewersForPath(selected map[string]bool, path string) {
	switch {
	case path == "", isGeneratedOpenAPIOutput(path), isDocsAgentPath(path):
		return
	case isDevToolingPath(path):
		selected["dev-tooling"] = true
	case strings.EqualFold(filepath.Ext(path), ".md"):
		selected["docs"] = true
	case isAppCodePath(path):
		for _, name := range appCodeReviewers {
			selected[name] = true
		}
	}
}

func isDocsAgentPath(path string) bool {
	return path == "docs/agents" || strings.HasPrefix(path, "docs/agents/")
}

func isDevToolingPath(path string) bool {
	switch path {
	case "Justfile", ".pre-commit-config.yaml", ".golangci.yml", ".kata.toml", "mise.toml":
		return true
	}
	return strings.HasPrefix(path, ".codex/") || strings.HasPrefix(path, "internal/tools/")
}

func isGeneratedOpenAPIOutput(path string) bool {
	switch path {
	case "internal/httpapi/openapi/openapi.gen.go", "internal/httpclient/openapi.gen.go":
		return true
	default:
		return false
	}
}

func isAppCodePath(path string) bool {
	switch path {
	case "api/openapi.yaml", "api/oapi-codegen.yaml", "api/oapi-codegen-httpclient.yaml", "go.mod", "go.sum":
		return true
	}
	appPrefixes := []string{
		"cmd/",
		"internal/apptest/",
		"internal/httpapi/",
		"internal/httpclient/",
		"internal/runtime/",
		"internal/services/",
		"internal/store/",
	}
	for _, prefix := range appPrefixes {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}
	return false
}

func (cfg config) placeholderValues(overrides map[string]string) map[string]string {
	values := map[string]string{
		"GOAL":                 cfg.goal,
		"BRANCH_OR_COMMIT":     "",
		"PREVIOUS_REVIEW_FILE": cfg.previousReviewFile,
		"REVIEWER_NAME":        "",
		"REVIEW_FOCUS":         "",
		"REVIEW_SCOPE":         "",
		"RAW_REVIEWS":          "",
		"REVIEWS":              "",
	}
	maps.Copy(values, overrides)
	return values
}

func interpolate(template string, values map[string]string) (string, error) {
	placeholders := placeholderRE.FindAllString(template, -1)
	if len(placeholders) > 0 {
		sort.Strings(placeholders)
	}
	var unresolved []string
	for _, placeholder := range unique(placeholders) {
		name := strings.TrimSuffix(strings.TrimPrefix(placeholder, "{{"), "}}")
		if _, ok := values[name]; !ok {
			unresolved = append(unresolved, placeholder)
		}
	}
	if len(unresolved) > 0 {
		return "", fmt.Errorf("unresolved placeholders: %s", strings.Join(unresolved, ", "))
	}

	result := placeholderRE.ReplaceAllStringFunc(template, func(placeholder string) string {
		name := strings.TrimSuffix(strings.TrimPrefix(placeholder, "{{"), "}}")
		return values[name]
	})
	return result, nil
}

func unique(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	result := values[:1]
	for _, value := range values[1:] {
		if value != result[len(result)-1] {
			result = append(result, value)
		}
	}
	return result
}

func runReviewers(cfg config, reviewScope string, reviewers []reviewerPrompt) (string, error) {
	results := make([]reviewerResult, len(reviewers))

	var wg sync.WaitGroup
	for i, reviewer := range reviewers {
		wg.Go(func() {

			prompt, err := interpolate(cfg.templates.reviewer, cfg.placeholderValues(map[string]string{
				"REVIEWER_NAME": reviewer.name,
				"REVIEW_FOCUS":  reviewer.focus,
				"REVIEW_SCOPE":  reviewScope,
			}))
			if err != nil {
				results[i] = reviewerResult{name: reviewer.name, err: fmt.Errorf("build reviewer %s prompt: %w", reviewer.name, err)}
				return
			}

			message, err := runCodex(cfg.root, "reviewer "+reviewer.name, prompt)
			if err != nil {
				results[i] = reviewerResult{name: reviewer.name, err: err}
				return
			}
			writeProgressLine("reviewer %s finished", reviewer.name)
			results[i] = reviewerResult{name: reviewer.name, message: message}
		})
	}
	wg.Wait()

	var resultErrors []string
	for _, result := range results {
		if result.err != nil {
			resultErrors = append(resultErrors, result.err.Error())
		}
	}
	if len(resultErrors) > 0 {
		return "", errors.New(strings.Join(resultErrors, "\n"))
	}

	var rawReviews strings.Builder
	for i, result := range results {
		if i > 0 {
			rawReviews.WriteString("\n\n")
		}
		rawReviews.WriteString("### Reviewer: ")
		rawReviews.WriteString(result.name)
		rawReviews.WriteString("\n\n")
		rawReviews.WriteString(result.message)
	}
	return rawReviews.String(), nil
}

func runCodex(root string, label string, prompt string) (string, error) {
	outputFile, err := os.CreateTemp("/tmp", "mina-reviewloop-"+fileSafeName(label)+"-*.md")
	if err != nil {
		return "", fmt.Errorf("create %s output file: %w", label, err)
	}
	outputPath := outputFile.Name()
	if err := outputFile.Close(); err != nil {
		return "", fmt.Errorf("close %s output file: %w", label, err)
	}
	defer func() {
		_ = os.Remove(outputPath)
	}()

	cmd := exec.Command(
		"codex",
		"exec",
		"--json",
		"--dangerously-bypass-approvals-and-sandbox",
		"--cd", root,
		"--output-last-message", outputPath,
		"-",
	)
	cmd.Stdin = strings.NewReader(prompt)
	cmd.Env = append(os.Environ(), reviewLoopActiveEnvName+"=1")
	configureProcessGroup(cmd)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("create %s stdout pipe: %w", label, err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("%s failed: %w%s", label, err, capturedOutput(stdout.String(), stderr.String()))
	}
	writeProgressLine("%s started", label)

	eventCh := make(chan codexEvent)
	readErrCh := make(chan error, 1)
	go func() {
		readErrCh <- readCodexEvents(stdoutPipe, &stdout, eventCh)
	}()

	waitCh := make(chan error, 1)
	go func() {
		waitCh <- cmd.Wait()
	}()

	now := time.Now()
	progress := codexProgress{
		label:       label,
		startedAt:   now,
		lastEventAt: now,
	}
	heartbeat := time.NewTicker(codexHeartbeatInterval)
	defer heartbeat.Stop()
	timeoutCheck := time.NewTicker(time.Second)
	defer timeoutCheck.Stop()

	var waitErr error
	var readErr error
	var timeoutErr error
	processDone := false
	eventsDone := false
	for !processDone || !eventsDone {
		select {
		case event, ok := <-eventCh:
			if !ok {
				eventCh = nil
				eventsDone = true
				readErr = <-readErrCh
				continue
			}
			progress.observe(event, time.Now())
		case err := <-waitCh:
			waitCh = nil
			processDone = true
			waitErr = err
		case <-heartbeat.C:
			writeProgressLine(progress.heartbeatLine(time.Now()))
		case <-timeoutCheck.C:
			if processDone || timeoutErr != nil {
				continue
			}
			timeoutErr = progress.timeoutError(time.Now())
			if timeoutErr == nil {
				continue
			}
			writeProgressLine("%s", timeoutErr.Error())
			if cmd.Process != nil {
				terminateProcess(cmd.Process)
			}
		}
	}

	if timeoutErr != nil {
		return "", fmt.Errorf("%w%s", timeoutErr, capturedOutput(stdout.String(), stderr.String()))
	}
	if readErr != nil {
		return "", fmt.Errorf("%s failed: read JSON events: %w%s", label, readErr, capturedOutput(stdout.String(), stderr.String()))
	}
	if waitErr != nil {
		return "", fmt.Errorf("%s failed: %w%s%s", label, waitErr, observedCodexErrors(progress.errors), capturedOutput(stdout.String(), stderr.String()))
	}

	message, err := os.ReadFile(outputPath)
	if err != nil {
		return "", fmt.Errorf("read %s output file: %w", label, err)
	}
	return strings.TrimRight(string(message), "\n"), nil
}

func readCodexEvents(stdout io.Reader, stdoutCapture *bytes.Buffer, events chan<- codexEvent) error {
	defer close(events)

	reader := bufio.NewReader(stdout)
	for {
		line, err := reader.ReadBytes('\n')
		if len(line) > 0 {
			stdoutCapture.Write(line)
			event, parseErr := parseCodexEvent(line)
			if parseErr == nil {
				events <- event
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
	}
}

func parseCodexEvent(line []byte) (codexEvent, error) {
	line = bytes.TrimSpace(line)
	if len(line) == 0 {
		return codexEvent{}, errors.New("empty event")
	}

	var event codexEvent
	if err := json.Unmarshal(line, &event); err != nil {
		return codexEvent{}, err
	}
	if event.Type == "" {
		return codexEvent{}, errors.New("missing event type")
	}
	return event, nil
}

func (progress *codexProgress) observe(event codexEvent, now time.Time) {
	progress.lastEventAt = now

	switch event.Type {
	case "thread.started":
		if event.ThreadID != "" {
			progress.threadID = event.ThreadID
		}
	case "turn.started":
		progress.turns++
		progress.activeTurn = true
		progress.currentTurnStarted = now
	case "turn.completed", "turn.failed":
		progress.activeTurn = false
		progress.currentTurnStarted = time.Time{}
	case "item.completed":
		progress.actions.increment(event.Item.Type)
	case "error":
		progress.errors = append(progress.errors, codexEventErrorText(event))
	}
}

func (progress codexProgress) heartbeatLine(now time.Time) string {
	return fmt.Sprintf(
		"%s still running; elapsed=%s current_turn=%s actions=%d (%s) timeout=30m",
		progress.label,
		durationString(now.Sub(progress.startedAt)),
		progress.currentTurnAge(now),
		progress.totalActions(),
		progress.counterSummary(),
	)
}

func (progress codexProgress) timeoutError(now time.Time) error {
	if progress.activeTurn {
		currentTurnAge := now.Sub(progress.currentTurnStarted)
		if currentTurnAge > codexTurnTimeout {
			return fmt.Errorf(
				"%s timed out; current turn exceeded 30m; elapsed=%s current_turn=%s actions=%d (%s)",
				progress.label,
				durationString(now.Sub(progress.startedAt)),
				durationString(currentTurnAge),
				progress.totalActions(),
				progress.counterSummary(),
			)
		}
	}

	timeSinceEvent := now.Sub(progress.lastEventAt)
	if timeSinceEvent > codexNoEventTimeout {
		return fmt.Errorf(
			"%s timed out; no JSON event observed for 30m; elapsed=%s current_turn=%s actions=%d (%s)",
			progress.label,
			durationString(now.Sub(progress.startedAt)),
			progress.currentTurnAge(now),
			progress.totalActions(),
			progress.counterSummary(),
		)
	}
	return nil
}

func (progress codexProgress) currentTurnAge(now time.Time) string {
	if !progress.activeTurn {
		return "none"
	}
	return durationString(now.Sub(progress.currentTurnStarted))
}

func (progress codexProgress) totalActions() int {
	return progress.turns + progress.actions.total()
}

func (progress codexProgress) counterSummary() string {
	return fmt.Sprintf(
		"turns=%d commands=%d mcp=%d web=%d messages=%d other=%d",
		progress.turns,
		progress.actions.commands,
		progress.actions.mcp,
		progress.actions.web,
		progress.actions.messages,
		progress.actions.other,
	)
}

func (counters *codexActionCounters) increment(itemType string) {
	itemType = strings.ToLower(itemType)
	switch {
	case strings.Contains(itemType, "command") || strings.Contains(itemType, "exec"):
		counters.commands++
	case strings.Contains(itemType, "mcp"):
		counters.mcp++
	case strings.Contains(itemType, "web") && strings.Contains(itemType, "search"):
		counters.web++
	case strings.Contains(itemType, "message"):
		counters.messages++
	default:
		counters.other++
	}
}

func (counters codexActionCounters) total() int {
	return counters.commands + counters.mcp + counters.web + counters.messages + counters.other
}

func codexEventErrorText(event codexEvent) string {
	if event.Message != "" {
		return event.Message
	}
	if len(event.Error) == 0 {
		return "unknown Codex error"
	}

	var message string
	if err := json.Unmarshal(event.Error, &message); err == nil && message != "" {
		return message
	}

	var body map[string]any
	if err := json.Unmarshal(event.Error, &body); err == nil {
		if message, ok := body["message"].(string); ok && message != "" {
			return message
		}
	}
	return string(event.Error)
}

func observedCodexErrors(errors []string) string {
	if len(errors) == 0 {
		return ""
	}
	return "\nobserved Codex errors:\n" + limitOutput(strings.Join(errors, "\n"))
}

func durationString(duration time.Duration) string {
	if duration < 0 {
		duration = 0
	}
	return duration.Round(time.Second).String()
}

func writeProgressLine(format string, args ...any) {
	progressOutputMu.Lock()
	defer progressOutputMu.Unlock()
	fmt.Fprintf(os.Stderr, format+"\n", args...)
}

func fileSafeName(value string) string {
	var builder strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			builder.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			builder.WriteRune(r)
		case r >= '0' && r <= '9':
			builder.WriteRune(r)
		default:
			builder.WriteByte('-')
		}
	}
	name := strings.Trim(builder.String(), "-")
	if name == "" {
		return "codex"
	}
	return name
}

func capturedOutput(stdout string, stderr string) string {
	stdout = strings.TrimSpace(stdout)
	stderr = strings.TrimSpace(stderr)
	if stdout == "" && stderr == "" {
		return ""
	}

	var builder strings.Builder
	if stdout != "" {
		builder.WriteString("\nstdout:\n")
		builder.WriteString(limitOutput(stdout))
	}
	if stderr != "" {
		builder.WriteString("\nstderr:\n")
		builder.WriteString(limitOutput(stderr))
	}
	return builder.String()
}

func limitOutput(output string) string {
	const maxOutputBytes = 4000
	if len(output) <= maxOutputBytes {
		return output
	}
	return output[:maxOutputBytes] + "\n... truncated ..."
}

func appendReviewHistory(path string, iteration int, review string) (err error) {
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, fs.FileMode(0))
	if err != nil {
		return fmt.Errorf("open previous review file: %w", err)
	}
	defer func() {
		if closeErr := file.Close(); err == nil && closeErr != nil {
			err = fmt.Errorf("close previous review file: %w", closeErr)
		}
	}()

	if _, err := fmt.Fprintf(file, "## Iteration %d\n\n%s\n\n", iteration, review); err != nil {
		return fmt.Errorf("append previous review file: %w", err)
	}
	return nil
}

func actionableReviews(review string) string {
	headingIndexes := markdownH2RE.FindAllStringIndex(review, -1)
	if len(headingIndexes) == 0 {
		return ""
	}

	var blocks []string
	for i, headingIndex := range headingIndexes {
		start := headingIndex[0]
		end := len(review)
		if i+1 < len(headingIndexes) {
			end = headingIndexes[i+1][0]
		}

		block := strings.TrimSpace(review[start:end])
		firstLine, _, _ := strings.Cut(block, "\n")
		if actionableFindingHeaderRE.MatchString(firstLine) {
			blocks = append(blocks, block)
		}
	}
	return strings.Join(blocks, "\n\n")
}

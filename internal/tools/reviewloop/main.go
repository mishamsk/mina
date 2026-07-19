// reviewloop orchestrates local Codex and Claude CLI sessions for repository review.
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
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	modulePath                           = "github.com/mishamsk/mina"
	defaultMaxIterations                 = 4
	defaultClaudeReviewPercent           = 50
	reviewLoopActiveEnvName              = "MINA_REVIEW_LOOP_ACTIVE"
	reviewLoopBaseEnvName                = "MINA_REVIEWLOOP_BASE"
	reviewLoopMaxIterationsEnvName       = "MINA_REVIEWLOOP_MAX_ITERATIONS"
	reviewLoopClaudeReviewPercentEnvName = "MINA_REVIEWLOOP_CLAUDE_REVIEW_PERCENT"
	defaultReviewBaseRef                 = "main"
	codexHeartbeatInterval               = time.Minute
	codexTurnTimeout                     = 30 * time.Minute
	codexNoEventTimeout                  = 30 * time.Minute
)

var (
	actionableFindingHeaderRE = regexp.MustCompile(`^## \[(major|minor|nit)\](?:\s|$)`)
	commitSHAArgRE            = regexp.MustCompile(`\A[0-9a-fA-F]{7,40}\z`)
	markdownH2RE              = regexp.MustCompile(`(?m)^##\s+`)
	placeholderRE             = regexp.MustCompile(`\{\{[^{}]+\}\}`)
	rejectedFindingHeaderRE   = regexp.MustCompile(`^## \[REJECTED\] \[(major|minor|nit)\](?:\s|$)`)
)

var progressOutputMu sync.Mutex

var (
	appCodeReviewers = []string{
		// TODO(a9m9): Re-enable compatibility review when Mina has a released or persisted compatibility boundary.
		// "compatibility",
		"implementation",
		"quality",
		"simplification",
		"testing",
	}
	stableReviewerOrder = []string{
		// TODO(a9m9): Restore compatibility to the stable reviewer order when its prompt is re-enabled.
		// "compatibility",
		"implementation",
		"quality",
		"simplification",
		"testing",
		"ci",
		"docs",
		"dev-tooling",
	}
)

type config struct {
	root                    string
	goal                    string
	claudeModel             string
	codexReviewer           codexSettings
	codexAggregator         codexSettings
	codexValidator          codexSettings
	codexFixer              codexSettings
	maxIterations           int
	claudeReviewIterations  map[int]bool
	previousReviewFile      string
	reviewTarget            reviewTarget
	templates               reviewTemplates
	reviewerPrompts         map[string]reviewerPrompt
	frontendReviewerPrompts map[string]reviewerPrompt
}

type reviewLoopOptions struct {
	baseRef             string
	claudeModel         string
	codexReviewer       string
	codexAggregator     string
	codexValidator      string
	codexFixer          string
	maxIterations       *int
	claudeReviewPercent *int
}

type codexSettings struct {
	model           string
	reasoningEffort string
}

type reviewTarget struct {
	branchName string
	commitSHA  string
	headSHA    string
	baseRef    string
	baseSHA    string
	baseSource string
}

type reviewBase struct {
	ref      string
	sha      string
	distance int
	source   string
}

type reviewTemplates struct {
	claudeReviewer string
	codexReviewer  string
	aggregate      string
	validator      string
	fixer          string
}

type reviewerPrompt struct {
	name  string
	focus string
}

type reviewerSelection struct {
	frontend bool
	name     string
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

	for iteration := 1; iteration <= cfg.maxIterations; iteration++ {
		reviewScope := cfg.reviewTarget.scope(iteration)
		changedFiles, err := cfg.reviewTarget.changedFiles(cfg.root, iteration)
		if err != nil {
			return 2, err
		}
		reviewerNames := cfg.selectReviewerNames(changedFiles)
		if len(reviewerNames) == 0 {
			fmt.Printf("review loop successful: no review findings; no reviewers selected for changed files in %s\n", cfg.reviewTarget.diffRange(iteration))
			return 0, nil
		}
		reviewers, err := cfg.selectedReviewers(reviewerNames)
		if err != nil {
			return 2, err
		}
		writeProgressLine("selected reviewers: %s", strings.Join(reviewerSelectionNames(reviewerNames), ", "))

		rawReviews, err := runReviewers(cfg, reviewScope, reviewers, cfg.claudeReviewIterations[iteration])
		if err != nil {
			return 2, err
		}

		aggregatePrompt, err := interpolate(cfg.templates.aggregate, cfg.placeholderValues(map[string]string{
			"RAW_REVIEWS":  rawReviews,
			"REVIEW_SCOPE": reviewScope,
			"REVIEW_RANGE": cfg.reviewTarget.diffRange(iteration),
		}))
		if err != nil {
			return 2, fmt.Errorf("build aggregate prompt: %w", err)
		}
		aggregateReview, err := runCodex(cfg, "aggregator", aggregatePrompt, cfg.codexAggregator)
		if err != nil {
			return 2, err
		}
		writeProgressLine("aggregator finished")

		candidateReviews := actionableReviews(aggregateReview)
		validationReview := ""
		if candidateReviews != "" {
			validationReview, err = runValidators(cfg, reviewScope, cfg.reviewTarget.diffRange(iteration), reviewBlocks(candidateReviews, actionableFindingHeaderRE))
			if err != nil {
				return 2, err
			}
			writeProgressLine("validators finished")
		}

		finalReview := joinReviewSections(
			actionableReviews(validationReview),
			rejectedReviews(aggregateReview),
			rejectedReviews(validationReview),
		)
		if err := appendReviewHistory(cfg.previousReviewFile, iteration, finalReview); err != nil {
			return 2, err
		}

		reviews := actionableReviews(finalReview)
		if reviews == "" {
			fmt.Printf("review loop successful after %d iteration(s); no remaining reviews; history: %s\n", iteration, cfg.previousReviewFile)
			return 0, nil
		}
		if iteration == cfg.maxIterations {
			fmt.Printf("review loop stopped after %d iteration(s) with remaining reviews; history: %s\n", cfg.maxIterations, cfg.previousReviewFile)
			return 1, nil
		}

		fixPrompt, err := interpolate(cfg.templates.fixer, cfg.placeholderValues(map[string]string{
			"REVIEWS": reviews,
		}))
		if err != nil {
			return 2, fmt.Errorf("build fixer prompt: %w", err)
		}
		if _, err := runCodex(cfg, "fixer", fixPrompt, cfg.codexFixer); err != nil {
			return 2, fmt.Errorf("%w; history: %s", err, cfg.previousReviewFile)
		}
		writeProgressLine("fixer finished")
	}

	return 2, errors.New("unreachable review loop state")
}

func loadConfig(args []string) (config, error) {
	args, options, err := parseReviewLoopArgs(args)
	if err != nil {
		return config{}, err
	}
	if len(args) != 1 && len(args) != 2 {
		return config{}, errors.New("usage: reviewloop --claude-model <model> --codex-reviewer <model/effort> --codex-aggregator <model/effort> --codex-validator <model/effort> --codex-fixer <model/effort> [--base <ref>] [--max-iterations <count>] [--claude-review-percent <percent>] <goal> [branch-or-commit]")
	}

	goal := strings.TrimSpace(args[0])
	if goal == "" {
		return config{}, errors.New("goal is required")
	}

	root, err := repoRoot()
	if err != nil {
		return config{}, err
	}
	if options.baseRef == "" {
		options.baseRef = strings.TrimSpace(os.Getenv(reviewLoopBaseEnvName))
	}
	maxIterations, err := configuredInt(defaultMaxIterations, reviewLoopMaxIterationsEnvName, options.maxIterations)
	if err != nil {
		return config{}, err
	}
	claudeReviewPercent, err := configuredInt(defaultClaudeReviewPercent, reviewLoopClaudeReviewPercentEnvName, options.claudeReviewPercent)
	if err != nil {
		return config{}, err
	}
	if options.claudeModel == "" {
		return config{}, errors.New("--claude-model is required")
	}
	codexReviewer, err := parseCodexSettings(options.codexReviewer, "--codex-reviewer")
	if err != nil {
		return config{}, err
	}
	codexAggregator, err := parseCodexSettings(options.codexAggregator, "--codex-aggregator")
	if err != nil {
		return config{}, err
	}
	codexValidator, err := parseCodexSettings(options.codexValidator, "--codex-validator")
	if err != nil {
		return config{}, err
	}
	codexFixer, err := parseCodexSettings(options.codexFixer, "--codex-fixer")
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
	if target.commitSHA == "" {
		base, err := resolveBranchReviewBase(root, target.branchName, options.baseRef)
		if err != nil {
			return config{}, err
		}
		target.baseRef = base.ref
		target.baseSHA = base.sha
		target.baseSource = base.source
	}
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
	frontendReviewerPrompts, err := loadFrontendReviewerPrompts(root)
	if err != nil {
		return config{}, err
	}

	return config{
		root:                    root,
		goal:                    goal,
		claudeModel:             options.claudeModel,
		codexReviewer:           codexReviewer,
		codexAggregator:         codexAggregator,
		codexValidator:          codexValidator,
		codexFixer:              codexFixer,
		maxIterations:           maxIterations,
		claudeReviewIterations:  claudeReviewIterationSet(maxIterations, claudeReviewPercent),
		previousReviewFile:      previousReviewFile,
		reviewTarget:            target,
		templates:               templates,
		reviewerPrompts:         reviewerPrompts,
		frontendReviewerPrompts: frontendReviewerPrompts,
	}, nil
}

func parseReviewLoopArgs(args []string) ([]string, reviewLoopOptions, error) {
	var positional []string
	var options reviewLoopOptions
	stringOptions := map[string]*string{
		"--base":             &options.baseRef,
		"--claude-model":     &options.claudeModel,
		"--codex-reviewer":   &options.codexReviewer,
		"--codex-aggregator": &options.codexAggregator,
		"--codex-validator":  &options.codexValidator,
		"--codex-fixer":      &options.codexFixer,
	}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if target, ok := stringOptions[arg]; ok {
			value, next, err := parseStringFlagValue(args, i, arg)
			if err != nil {
				return nil, reviewLoopOptions{}, err
			}
			i = next
			*target = value
			continue
		}
		if name, rawValue, ok := strings.Cut(arg, "="); ok {
			if target, found := stringOptions[name]; found {
				value, err := parseStringValue(rawValue, name)
				if err != nil {
					return nil, reviewLoopOptions{}, err
				}
				*target = value
				continue
			}
		}
		switch {
		case arg == "--max-iterations":
			value, next, err := parseIntFlagValue(args, i, "--max-iterations")
			if err != nil {
				return nil, reviewLoopOptions{}, err
			}
			i = next
			options.maxIterations = &value
		case strings.HasPrefix(arg, "--max-iterations="):
			value, err := parseIntValue(strings.TrimPrefix(arg, "--max-iterations="), "--max-iterations")
			if err != nil {
				return nil, reviewLoopOptions{}, err
			}
			options.maxIterations = &value
		case arg == "--claude-review-percent":
			value, next, err := parseIntFlagValue(args, i, "--claude-review-percent")
			if err != nil {
				return nil, reviewLoopOptions{}, err
			}
			i = next
			options.claudeReviewPercent = &value
		case strings.HasPrefix(arg, "--claude-review-percent="):
			value, err := parseIntValue(strings.TrimPrefix(arg, "--claude-review-percent="), "--claude-review-percent")
			if err != nil {
				return nil, reviewLoopOptions{}, err
			}
			options.claudeReviewPercent = &value
		case strings.HasPrefix(arg, "--"):
			return nil, reviewLoopOptions{}, fmt.Errorf("unknown flag %s", arg)
		default:
			positional = append(positional, arg)
		}
	}
	return positional, options, nil
}

func parseStringFlagValue(args []string, index int, name string) (string, int, error) {
	if index+1 >= len(args) {
		return "", index, fmt.Errorf("%s requires a value", name)
	}
	value, err := parseStringValue(args[index+1], name)
	return value, index + 1, err
}

func parseStringValue(value string, name string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("%s must not be empty", name)
	}
	return value, nil
}

func parseCodexSettings(value string, name string) (codexSettings, error) {
	parts := strings.Split(value, "/")
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return codexSettings{}, fmt.Errorf("%s must use <model>/<effort>", name)
	}
	return codexSettings{
		model:           "gpt-" + strings.TrimSpace(parts[0]),
		reasoningEffort: strings.TrimSpace(parts[1]),
	}, nil
}

func parseIntFlagValue(args []string, index int, name string) (int, int, error) {
	if index+1 >= len(args) {
		return 0, index, fmt.Errorf("%s requires a value", name)
	}
	value, err := parseIntValue(args[index+1], name)
	return value, index + 1, err
}

func parseIntValue(value string, name string) (int, error) {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", name, err)
	}
	return parsed, nil
}

func configuredInt(defaultValue int, envName string, override *int) (int, error) {
	value := defaultValue
	if raw := strings.TrimSpace(os.Getenv(envName)); raw != "" {
		parsed, err := parseIntValue(raw, envName)
		if err != nil {
			return 0, err
		}
		value = parsed
	}
	if override != nil {
		value = *override
	}
	return value, nil
}

func claudeReviewIterationSet(maxIterations int, percent int) map[int]bool {
	iterations := map[int]bool{}
	if percent <= 0 {
		return iterations
	}

	count := maxIterations * percent / 100
	if count < 1 {
		count = 1
	}
	if count == 1 {
		iterations[1] = true
		return iterations
	}

	for i := 0; i < count; i++ {
		iteration := 1 + i*maxIterations/count
		iterations[iteration] = true
	}
	return iterations
}

func resolveBranchReviewBase(root string, branchName string, baseOverride string) (reviewBase, error) {
	if baseOverride != "" {
		base, err := mergeBaseWithHead(root, baseOverride)
		if err != nil {
			return reviewBase{}, fmt.Errorf("resolve review base %q: %w", baseOverride, err)
		}
		return reviewBase{ref: baseOverride, sha: base, source: "override"}, nil
	}
	if branchName == defaultReviewBaseRef {
		base, err := mergeBaseWithHead(root, defaultReviewBaseRef)
		if err != nil {
			return reviewBase{}, fmt.Errorf("resolve review base %q: %w", defaultReviewBaseRef, err)
		}
		return reviewBase{ref: defaultReviewBaseRef, sha: base, source: "default"}, nil
	}

	base, err := autoDetectBranchReviewBase(root, branchName)
	if err == nil {
		return base, nil
	}

	fallbackBase, fallbackErr := mergeBaseWithHead(root, defaultReviewBaseRef)
	if fallbackErr != nil {
		return reviewBase{}, fmt.Errorf("%w; fallback to %s failed: %w", err, defaultReviewBaseRef, fallbackErr)
	}
	return reviewBase{ref: defaultReviewBaseRef, sha: fallbackBase, source: "fallback"}, nil
}

func autoDetectBranchReviewBase(root string, branchName string) (reviewBase, error) {
	output, err := gitOutput(root, "for-each-ref", "--format=%(refname:short)", "refs/heads")
	if err != nil {
		return reviewBase{}, fmt.Errorf("list local branches: %w", err)
	}

	headSHA, err := gitOutput(root, "rev-parse", "HEAD")
	if err != nil {
		return reviewBase{}, fmt.Errorf("resolve HEAD: %w", err)
	}

	var best reviewBase
	for _, ref := range nonEmptyLines(output) {
		if ref == branchName {
			continue
		}
		baseSHA, err := mergeBaseWithHead(root, ref)
		if err != nil || baseSHA == "" || baseSHA == headSHA {
			continue
		}
		distance, err := revListCount(root, baseSHA+"..HEAD")
		if err != nil {
			continue
		}
		candidate := reviewBase{
			ref:      ref,
			sha:      baseSHA,
			distance: distance,
			source:   "auto",
		}
		if betterReviewBase(candidate, best) {
			best = candidate
		}
	}

	if best.sha == "" {
		return reviewBase{}, errors.New("auto-detect review base: no usable local branch base")
	}
	return best, nil
}

func mergeBaseWithHead(root string, ref string) (string, error) {
	if _, err := gitOutput(root, "rev-parse", "--verify", ref+"^{commit}"); err != nil {
		return "", err
	}
	return gitOutput(root, "merge-base", "HEAD", ref)
}

func revListCount(root string, rangeSpec string) (int, error) {
	output, err := gitOutput(root, "rev-list", "--count", rangeSpec)
	if err != nil {
		return 0, err
	}
	var count int
	if _, err := fmt.Sscanf(output, "%d", &count); err != nil {
		return 0, fmt.Errorf("parse rev-list count %q: %w", output, err)
	}
	return count, nil
}

func betterReviewBase(candidate reviewBase, current reviewBase) bool {
	if current.sha == "" {
		return true
	}
	if candidate.distance != current.distance {
		return candidate.distance < current.distance
	}
	if candidate.ref == defaultReviewBaseRef && current.ref != defaultReviewBaseRef {
		return true
	}
	if candidate.ref != defaultReviewBaseRef && current.ref == defaultReviewBaseRef {
		return false
	}
	return candidate.ref < current.ref
}

func (target reviewTarget) scope(iteration int) string {
	if target.commitSHA == "" {
		return strings.Join([]string{
			"Review the current branch only.",
			"Use this exact range:",
			fmt.Sprintf("1. Use base commit `%s` (%s, %s).", target.baseSHA, target.baseRef, target.baseSource),
			fmt.Sprintf("2. Inspect `git diff --stat %s HEAD` for the changed files.", target.baseSHA),
			fmt.Sprintf("3. Inspect focused diffs with `git diff %s HEAD -- <path>`.", target.baseSHA),
			fmt.Sprintf("Do not review `HEAD~1`, unrelated history, or changes already present at `%s`.", target.baseSHA),
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
		return fmt.Sprintf("`git diff %s HEAD`", target.baseSHA)
	}
	if iteration == 1 {
		return fmt.Sprintf("`git diff %s~1 %s`", target.commitSHA, target.commitSHA)
	}
	return fmt.Sprintf("`git diff %s~1 HEAD`", target.commitSHA)
}

func (target reviewTarget) changedFiles(root string, iteration int) ([]string, error) {
	var args []string
	if target.commitSHA == "" {
		args = []string{"diff", "--name-only", target.baseSHA, "HEAD"}
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

	claudeReviewer, err := readTemplate(filepath.Join(reviewRoot, "claude_reviewer_template.md"))
	if err != nil {
		return reviewTemplates{}, err
	}
	codexReviewer, err := readTemplate(filepath.Join(reviewRoot, "reviewer_template.md"))
	if err != nil {
		return reviewTemplates{}, err
	}
	aggregate, err := readTemplate(filepath.Join(reviewRoot, "aggregate_reviews.md"))
	if err != nil {
		return reviewTemplates{}, err
	}
	validator, err := readTemplate(filepath.Join(reviewRoot, "validate_review.md"))
	if err != nil {
		return reviewTemplates{}, err
	}
	fixer, err := readTemplate(filepath.Join(reviewRoot, "fix_after_review.md"))
	if err != nil {
		return reviewTemplates{}, err
	}

	return reviewTemplates{
		claudeReviewer: claudeReviewer,
		codexReviewer:  codexReviewer,
		aggregate:      aggregate,
		validator:      validator,
		fixer:          fixer,
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
	return loadReviewerPromptSet(pattern, true)
}

func loadFrontendReviewerPrompts(root string) (map[string]reviewerPrompt, error) {
	pattern := filepath.Join(root, "docs", "agents", "review", "frontend-reviewer-prompts", "*.md")
	return loadReviewerPromptSet(pattern, false)
}

func loadReviewerPromptSet(pattern string, requirePrompts bool) (map[string]reviewerPrompt, error) {
	paths, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("list reviewer prompts: %w", err)
	}
	sort.Strings(paths)
	if requirePrompts && len(paths) == 0 {
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

func (cfg config) selectedReviewers(names []reviewerSelection) ([]reviewerPrompt, error) {
	reviewers := make([]reviewerPrompt, 0, len(names))
	for _, selection := range names {
		prompts := cfg.reviewerPrompts
		if selection.frontend {
			prompts = cfg.frontendReviewerPrompts
		}
		reviewer, ok := prompts[selection.name]
		if !ok {
			return nil, fmt.Errorf("reviewer prompt %q is selected but missing", selection.displayName())
		}
		reviewer.name = selection.displayName()
		reviewers = append(reviewers, reviewer)
	}
	return reviewers, nil
}

func (cfg config) selectReviewerNames(paths []string) []reviewerSelection {
	selected := reviewerSelectionState{
		repo: map[string]bool{},
	}
	for _, path := range paths {
		selectReviewersForPath(&selected, filepath.ToSlash(path))
	}

	var names []reviewerSelection
	for _, name := range stableReviewerOrder {
		if selected.repo[name] {
			names = append(names, reviewerSelection{name: name})
		}
	}
	if selected.frontend {
		for _, name := range reviewerPromptNames(cfg.frontendReviewerPrompts) {
			names = append(names, reviewerSelection{frontend: true, name: name})
		}
	}
	return names
}

type reviewerSelectionState struct {
	repo     map[string]bool
	frontend bool
}

func selectReviewersForPath(selected *reviewerSelectionState, path string) {
	switch {
	case path == "", isReviewExcludedPath(path):
		return
	case isCIPath(path):
		selected.repo["ci"] = true
	case isDocumentationPath(path):
		selected.repo["docs"] = true
	case isFrontendToolingPath(path):
		selected.repo["dev-tooling"] = true
	case isFrontendPath(path):
		selected.frontend = true
	case isAppCodePath(path):
		for _, name := range appCodeReviewers {
			selected.repo[name] = true
		}
	case isDevToolingPath(path):
		selected.repo["dev-tooling"] = true
	}
}

func isCIPath(path string) bool {
	return path == ".github/workflows" ||
		strings.HasPrefix(path, ".github/workflows/") ||
		path == ".github/actions" ||
		strings.HasPrefix(path, ".github/actions/")
}

func isReviewExcludedPath(path string) bool {
	return isGeneratedOpenAPIOutput(path) ||
		isPublicProjectDocPath(path) ||
		isDocsAgentPath(path) ||
		isPlanPath(path) ||
		isCodexPath(path)
}

func isPublicProjectDocPath(path string) bool {
	switch path {
	case "README.md", "CONTRIBUTING.md", "LICENSE.md":
		return true
	default:
		return false
	}
}

func isDocsAgentPath(path string) bool {
	return path == "docs/agents" || strings.HasPrefix(path, "docs/agents/")
}

func isPlanPath(path string) bool {
	return path == "docs/plans" || strings.HasPrefix(path, "docs/plans/")
}

func isCodexPath(path string) bool {
	return path == ".codex" || strings.HasPrefix(path, ".codex/")
}

func isFrontendPath(path string) bool {
	return path == "frontend" || strings.HasPrefix(path, "frontend/")
}

func isFrontendToolingPath(path string) bool {
	switch path {
	case "frontend/.prettierignore",
		"frontend/components.json",
		"frontend/eslint.config.js",
		"frontend/openapi-ts.config.ts",
		"frontend/package.json",
		"frontend/playwright.config.ts",
		"frontend/pnpm-lock.yaml",
		"frontend/pnpm-workspace.yaml",
		"frontend/prettier.config.js",
		"frontend/stylelint.config.js",
		"frontend/tsconfig.json",
		"frontend/vite.config.ts":
		return true
	}
	return false
}

func isDocumentationPath(path string) bool {
	return strings.EqualFold(filepath.Ext(path), ".md") ||
		path == "docs" ||
		strings.HasPrefix(path, "docs/")
}

func isDevToolingPath(path string) bool {
	switch path {
	case "Justfile", ".pre-commit-config.yaml", ".golangci.yml", ".kata.toml", "mise.toml":
		return true
	}
	return strings.HasPrefix(path, "internal/tools/")
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

func reviewerPromptNames(prompts map[string]reviewerPrompt) []string {
	names := make([]string, 0, len(prompts))
	for name := range prompts {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func reviewerSelectionNames(selections []reviewerSelection) []string {
	names := make([]string, 0, len(selections))
	for _, selection := range selections {
		names = append(names, selection.displayName())
	}
	return names
}

func (selection reviewerSelection) displayName() string {
	if selection.frontend {
		return "frontend/" + selection.name
	}
	return selection.name
}

func reviewerScopedReviewScope(reviewScope string, reviewer reviewerPrompt) string {
	scopeLines := []string{reviewScope, "", "Reviewer path scope:"}
	switch {
	case strings.HasPrefix(reviewer.name, "frontend/"):
		scopeLines = append(scopeLines,
			"- Review only changed paths under `frontend/`.",
			"- Use the range above with `-- frontend/` for focused diffs.",
		)
	case reviewer.name == "docs":
		scopeLines = append(scopeLines,
			"- Review documentation changes in any path, including documentation under `frontend/`.",
			"- Use the range above with focused documentation paths, such as `-- '*.md'` and `-- docs/`.",
		)
	case reviewer.name == "dev-tooling":
		scopeLines = append(scopeLines,
			"- Review changed paths under `frontend/` only when they are build, lint, test, format, or dependency configuration files.",
			"- Do not review frontend application code under `frontend/src/` or `frontend/tests/`.",
		)
	case reviewer.name == "ci":
		scopeLines = append(scopeLines,
			"- Review only changed CI definitions under `.github/workflows/` and reusable actions under `.github/actions/`.",
			"- Inspect invoked scripts or actions only as needed to trace a security or destructive execution path from a changed CI job.",
		)
	default:
		scopeLines = append(scopeLines,
			"- Do not review changed paths under `frontend/`.",
			"- You may inspect documentation changes for context.",
		)
	}
	return strings.Join(scopeLines, "\n")
}

func (cfg config) placeholderValues(overrides map[string]string) map[string]string {
	values := map[string]string{
		"GOAL":                 cfg.goal,
		"BRANCH_OR_COMMIT":     "",
		"PREVIOUS_REVIEW_FILE": cfg.previousReviewFile,
		"REVIEWER_NAME":        "",
		"REVIEW_FOCUS":         "",
		"REVIEW_SCOPE":         "",
		"REVIEW_RANGE":         "",
		"RAW_REVIEWS":          "",
		"FINDING":              "",
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

func runReviewers(cfg config, reviewScope string, reviewers []reviewerPrompt, useClaude bool) (string, error) {
	results := make([]reviewerResult, len(reviewers))
	reviewerTemplate := cfg.templates.codexReviewer
	if useClaude {
		reviewerTemplate = cfg.templates.claudeReviewer
	}

	var wg sync.WaitGroup
	for i, reviewer := range reviewers {
		wg.Go(func() {

			prompt, err := interpolate(reviewerTemplate, cfg.placeholderValues(map[string]string{
				"REVIEWER_NAME": reviewer.name,
				"REVIEW_FOCUS":  reviewer.focus,
				"REVIEW_SCOPE":  reviewerScopedReviewScope(reviewScope, reviewer),
			}))
			if err != nil {
				results[i] = reviewerResult{name: reviewer.name, err: fmt.Errorf("build reviewer %s prompt: %w", reviewer.name, err)}
				return
			}

			label := "reviewer " + reviewer.name
			message, err := runReviewerAgent(cfg, label, prompt, useClaude)
			if err != nil {
				results[i] = reviewerResult{name: reviewer.name, err: err}
				return
			}
			writeProgressLine("%s finished", label)
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

func runValidators(cfg config, reviewScope string, reviewRange string, findings []string) (string, error) {
	results := make([]reviewerResult, len(findings))

	var wg sync.WaitGroup
	for i, finding := range findings {
		wg.Go(func() {
			label := fmt.Sprintf("validator %d/%d", i+1, len(findings))
			prompt, err := interpolate(cfg.templates.validator, cfg.placeholderValues(map[string]string{
				"FINDING":      finding,
				"REVIEW_SCOPE": reviewScope,
				"REVIEW_RANGE": reviewRange,
			}))
			if err != nil {
				results[i] = reviewerResult{name: label, err: fmt.Errorf("build %s prompt: %w", label, err)}
				return
			}

			message, err := runCodex(cfg, label, prompt, cfg.codexValidator)
			if err != nil {
				results[i] = reviewerResult{name: label, err: err}
				return
			}
			result, err := singleValidationResult(message)
			if err != nil {
				results[i] = reviewerResult{name: label, err: fmt.Errorf("%s returned invalid output: %w", label, err)}
				return
			}
			writeProgressLine("%s finished", label)
			results[i] = reviewerResult{name: label, message: result}
		})
	}
	wg.Wait()

	var resultErrors []string
	var validationResults []string
	for _, result := range results {
		if result.err != nil {
			resultErrors = append(resultErrors, result.err.Error())
			continue
		}
		validationResults = append(validationResults, result.message)
	}
	if len(resultErrors) > 0 {
		return "", errors.New(strings.Join(resultErrors, "\n"))
	}
	return strings.Join(validationResults, "\n\n"), nil
}

func singleValidationResult(message string) (string, error) {
	blocks := append(
		reviewBlocks(message, actionableFindingHeaderRE),
		reviewBlocks(message, rejectedFindingHeaderRE)...,
	)
	if len(blocks) != 1 {
		return "", fmt.Errorf("expected exactly one validated or rejected finding block, got %d", len(blocks))
	}
	return blocks[0], nil
}

func runReviewerAgent(cfg config, label string, prompt string, useClaude bool) (string, error) {
	if useClaude {
		return runClaude(cfg.root, label, prompt, cfg.claudeModel)
	}
	return runCodex(cfg, label, prompt, cfg.codexReviewer)
}

func runClaude(root string, label string, prompt string, model string) (string, error) {
	cmd := exec.Command(
		"claude",
		"-p",
		"--output-format", "text",
		"--model", model,
		"--dangerously-skip-permissions",
	)
	cmd.Dir = root
	cmd.Stdin = strings.NewReader(prompt)
	cmd.Env = append(os.Environ(), reviewLoopActiveEnvName+"=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("%s failed: %w%s", label, err, capturedOutput(stdout.String(), stderr.String()))
	}
	writeProgressLine("%s started with claude", label)

	waitCh := make(chan error, 1)
	go func() {
		waitCh <- cmd.Wait()
	}()

	startedAt := time.Now()
	heartbeat := time.NewTicker(codexHeartbeatInterval)
	defer heartbeat.Stop()
	timeout := time.NewTimer(codexNoEventTimeout)
	defer timeout.Stop()

	for {
		select {
		case err := <-waitCh:
			if err != nil {
				return "", fmt.Errorf("%s failed: %w%s", label, err, capturedOutput(stdout.String(), stderr.String()))
			}
			return strings.TrimRight(stdout.String(), "\n"), nil
		case <-heartbeat.C:
			writeProgressLine(
				"%s still running with claude; elapsed=%s timeout=30m",
				label,
				durationString(time.Since(startedAt)),
			)
		case <-timeout.C:
			if cmd.Process != nil {
				killProcessGroup(cmd.Process)
			}
			err := fmt.Errorf(
				"%s timed out with claude; no process completion after 30m; elapsed=%s",
				label,
				durationString(time.Since(startedAt)),
			)
			return "", fmt.Errorf("%w%s", err, capturedOutput(stdout.String(), stderr.String()))
		}
	}
}

func runCodex(cfg config, label string, prompt string, settings codexSettings) (string, error) {
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
		"-m", settings.model,
		"-c", "model_reasoning_effort="+settings.reasoningEffort,
		"--json",
		"--dangerously-bypass-approvals-and-sandbox",
		"--cd", cfg.root,
		"--output-last-message", outputPath,
		"-",
	)
	cmd.Stdin = strings.NewReader(prompt)
	cmd.Env = append(os.Environ(), reviewLoopActiveEnvName+"=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

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
				killProcessGroup(cmd.Process)
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

func killProcessGroup(process *os.Process) {
	if err := syscall.Kill(-process.Pid, syscall.SIGKILL); err != nil {
		_ = process.Kill()
	}
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
	return strings.Join(reviewBlocks(review, actionableFindingHeaderRE), "\n\n")
}

func rejectedReviews(review string) string {
	return strings.Join(reviewBlocks(review, rejectedFindingHeaderRE), "\n\n")
}

func reviewBlocks(review string, headerRE *regexp.Regexp) []string {
	headingIndexes := markdownH2RE.FindAllStringIndex(review, -1)
	if len(headingIndexes) == 0 {
		return nil
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
		if headerRE.MatchString(firstLine) {
			blocks = append(blocks, block)
		}
	}
	return blocks
}

func joinReviewSections(sections ...string) string {
	var nonEmpty []string
	for _, section := range sections {
		if section = strings.TrimSpace(section); section != "" {
			nonEmpty = append(nonEmpty, section)
		}
	}
	return strings.Join(nonEmpty, "\n\n")
}

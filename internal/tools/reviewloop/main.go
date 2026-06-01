// reviewloop runs the repository's local Codex review loop.
package main

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
)

const (
	modulePath              = "github.com/mishamsk/mina"
	maxIterations           = 3
	reviewLoopActiveEnvName = "MINA_REVIEW_LOOP_ACTIVE"
)

var (
	actionableFindingHeaderRE = regexp.MustCompile(`^## \[(major|minor|nit)\](?:\s|$)`)
	commitSHAArgRE            = regexp.MustCompile(`\A[0-9a-fA-F]{7,40}\z`)
	markdownH2RE              = regexp.MustCompile(`(?m)^##\s+`)
	placeholderRE             = regexp.MustCompile(`\{\{[^{}]+\}\}`)
)

type config struct {
	root               string
	goal               string
	previousReviewFile string
	reviewTarget       reviewTarget
	templates          reviewTemplates
	reviewers          []reviewerPrompt
}

type reviewTarget struct {
	commitSHA string
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

	for iteration := 1; iteration <= maxIterations; iteration++ {
		reviewScope := cfg.reviewTarget.scope(iteration)
		rawReviews, err := runReviewers(cfg, reviewScope)
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
		fmt.Fprintln(os.Stderr, "aggregator finished")

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
		fmt.Fprintln(os.Stderr, "fixer finished")
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
		} else if err := requireCurrentBranch(root); err != nil {
			return config{}, err
		}
	} else if err := requireCurrentBranch(root); err != nil {
		return config{}, err
	}

	previousReview, err := os.CreateTemp("/tmp", "mina-reviewloop-history-*.md")
	if err != nil {
		return config{}, fmt.Errorf("create previous review file: %w", err)
	}
	if err := previousReview.Close(); err != nil {
		return config{}, fmt.Errorf("close previous review file: %w", err)
	}

	templates, err := loadTemplates(root)
	if err != nil {
		return config{}, err
	}
	reviewers, err := loadReviewerPrompts(root)
	if err != nil {
		return config{}, err
	}

	return config{
		root:               root,
		goal:               goal,
		previousReviewFile: previousReview.Name(),
		reviewTarget:       target,
		templates:          templates,
		reviewers:          reviewers,
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

func requireCurrentBranch(root string) error {
	cmd := exec.Command("git", "-C", root, "branch", "--show-current")
	output, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("resolve current branch: %w", err)
	}
	branch := strings.TrimSpace(string(output))
	if branch == "" {
		return errors.New("current branch is empty; provide branch-or-commit explicitly")
	}
	return nil
}

func verifyCommit(root string, commitSHA string) error {
	cmd := exec.Command("git", "-C", root, "rev-parse", "--verify", commitSHA+"^{commit}")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("resolve commit %s: %w", commitSHA, err)
	}
	return nil
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

func loadReviewerPrompts(root string) ([]reviewerPrompt, error) {
	pattern := filepath.Join(root, "docs", "agents", "review", "reviewer-prompts", "*.md")
	paths, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("list reviewer prompts: %w", err)
	}
	sort.Strings(paths)
	if len(paths) == 0 {
		return nil, fmt.Errorf("no reviewer prompts found for %s", pattern)
	}

	reviewers := make([]reviewerPrompt, 0, len(paths))
	for _, path := range paths {
		contents, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", path, err)
		}
		reviewers = append(reviewers, reviewerPrompt{
			name:  strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)),
			focus: string(contents),
		})
	}
	return reviewers, nil
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

func runReviewers(cfg config, reviewScope string) (string, error) {
	results := make([]reviewerResult, len(cfg.reviewers))

	var progressMu sync.Mutex
	var wg sync.WaitGroup
	for i, reviewer := range cfg.reviewers {
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
			progressMu.Lock()
			fmt.Fprintf(os.Stderr, "reviewer %s finished\n", reviewer.name)
			progressMu.Unlock()
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
		"--dangerously-bypass-approvals-and-sandbox",
		"--cd", root,
		"--output-last-message", outputPath,
		"-",
	)
	cmd.Stdin = strings.NewReader(prompt)
	cmd.Env = append(os.Environ(), reviewLoopActiveEnvName+"=1")

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%s failed: %w%s", label, err, capturedOutput(stdout.String(), stderr.String()))
	}

	message, err := os.ReadFile(outputPath)
	if err != nil {
		return "", fmt.Errorf("read %s output file: %w", label, err)
	}
	return strings.TrimRight(string(message), "\n"), nil
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

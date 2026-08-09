// gardendocs prepares isolated documentation-gardening agent invocations.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
)

const (
	modulePath        = "github.com/mishamsk/mina"
	defaultCodexSpec  = "5.6-terra/high"
	gardenSentinel    = "[garden-docs]"
	maxParallelAgents = 4
	reviewLoopActive  = "MINA_REVIEW_LOOP_ACTIVE"
)

type targetKind string

const (
	kindDocker          targetKind = "docker documentation"
	kindFrontendPackage targetKind = "frontend package"
	kindGoPackage       targetKind = "Go package"
	kindGoPackageFolder targetKind = "Go package folder"
	kindProjectState    targetKind = "project state"
)

type options struct {
	limit *int
	codex codexSettings
}

type optionalLimit struct {
	set   bool
	value int
}

func (limit *optionalLimit) String() string {
	if !limit.set {
		return ""
	}
	return strconv.Itoa(limit.value)
}

func (limit *optionalLimit) Set(raw string) error {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return fmt.Errorf("must be a nonnegative integer: %w", err)
	}
	if value < 0 {
		return errors.New("must be a nonnegative integer")
	}
	limit.set = true
	limit.value = value
	return nil
}

type codexSettings struct {
	model           string
	reasoningEffort string
}

type packageRecord struct {
	Dir          string   `json:"Dir"`
	ImportPath   string   `json:"ImportPath"`
	Imports      []string `json:"Imports"`
	TestImports  []string `json:"TestImports"`
	XTestImports []string `json:"XTestImports"`
}

type packageNode struct {
	dir          string
	importPath   string
	imports      map[string]struct{}
	testImports  map[string]struct{}
	xTestImports map[string]struct{}
}

type projectGraph struct {
	byDir    map[string]*packageNode
	byImport map[string]*packageNode
}

type gardenTarget struct {
	path       string
	kind       targetKind
	importPath string
}

type promptTemplates map[targetKind]string

type agentTask struct {
	index      int
	total      int
	target     gardenTarget
	invocation []string
	prompt     string
}

type agentResult struct {
	task   agentTask
	stdout string
	stderr string
	err    error
}

type selectionSummary struct {
	selected        int
	sentinelSkipped int
	limitDeferred   int
	unchanged       int
	committed       int
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	code, err := run(ctx, os.Args[1:], os.Stdout, os.Stderr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gardendocs: %v\n", err)
	}
	os.Exit(code)
}

func run(ctx context.Context, args []string, stdout io.Writer, stderr io.Writer) (int, error) {
	opts, err := parseOptions(args, stderr)
	if errors.Is(err, flag.ErrHelp) {
		return 0, nil
	}
	if err != nil {
		return 2, err
	}

	root, err := repoRoot()
	if err != nil {
		return 1, err
	}
	if err := requireSafeBranch(root); err != nil {
		return 1, err
	}
	if err := requireCleanWorktree(root); err != nil {
		return 1, err
	}

	templates, err := loadPromptTemplates(root)
	if err != nil {
		return 1, err
	}
	graph, err := loadProjectGraph(root)
	if err != nil {
		return 1, err
	}
	targets, summary, err := selectTargets(root, graph, opts.limit)
	if err != nil {
		return 1, err
	}

	tasks := make([]agentTask, 0, len(targets))
	invocation := codexInvocation(root, opts.codex)
	for index, target := range targets {
		prompt, err := renderPrompt(target, templates[target.kind], graph)
		if err != nil {
			return 1, err
		}
		tasks = append(tasks, agentTask{
			index:      index + 1,
			total:      len(targets),
			target:     target,
			invocation: invocation,
			prompt:     prompt,
		})
	}

	for batchStart := 0; batchStart < len(tasks); batchStart += maxParallelAgents {
		batchEnd := min(batchStart+maxParallelAgents, len(tasks))
		batch := tasks[batchStart:batchEnd]
		beforeHead, err := gitOutput(root, "rev-parse", "HEAD")
		if err != nil {
			return 1, fmt.Errorf("resolve HEAD before agent batch: %w", err)
		}

		failure, outputErr := runAgentBatch(ctx, root, stdout, batch)
		afterHead, headErr := gitOutput(root, "rev-parse", "HEAD")
		if headErr != nil {
			return 1, fmt.Errorf("resolve HEAD after agent batch: %w", headErr)
		}
		if afterHead != beforeHead {
			return 1, errors.New("an agent changed HEAD; preserve the repository for inspection")
		}

		changedPaths, err := worktreeChangedPaths(root)
		if err != nil {
			return 1, err
		}
		changedTargets, err := validateBatchChanges(root, batch, changedPaths)
		if err != nil {
			return 1, err
		}
		if outputErr != nil {
			return 1, outputErr
		}
		if err := ctx.Err(); err != nil {
			return 1, fmt.Errorf("gardening cancelled: %w", err)
		}
		if failure != nil {
			return 1, agentError(*failure)
		}

		for _, task := range batch {
			if _, changed := changedTargets[task.target.path]; !changed {
				summary.unchanged++
				continue
			}
			if err := commitGardenedTarget(root, task.target.path); err != nil {
				return 1, err
			}
			summary.committed++
		}
		if err := requireCleanWorktree(root); err != nil {
			return 1, fmt.Errorf("verify clean worktree after agent batch: %w", err)
		}
	}

	if _, err := fmt.Fprintf(
		stdout,
		"garden-docs summary: selected=%d unchanged=%d committed=%d sentinel-skipped=%d limit-deferred=%d\n",
		summary.selected,
		summary.unchanged,
		summary.committed,
		summary.sentinelSkipped,
		summary.limitDeferred,
	); err != nil {
		return 1, fmt.Errorf("write summary: %w", err)
	}
	return 0, nil
}

func parseOptions(args []string, stderr io.Writer) (options, error) {
	flags := flag.NewFlagSet("gardendocs", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var limit optionalLimit
	flags.Var(&limit, "limit", "maximum eligible PACKAGE.md files to garden")
	codexSpec := flags.String("codex", defaultCodexSpec, "Codex model and reasoning effort as <model>/<effort>")
	if err := flags.Parse(args); err != nil {
		return options{}, err
	}
	if flags.NArg() != 0 {
		return options{}, fmt.Errorf("unexpected arguments: %s", strings.Join(flags.Args(), " "))
	}
	codex, err := parseCodexSettings(*codexSpec)
	if err != nil {
		return options{}, fmt.Errorf("parse --codex: %w", err)
	}
	var configuredLimit *int
	if limit.set {
		configuredLimit = &limit.value
	}
	return options{limit: configuredLimit, codex: codex}, nil
}

func parseCodexSettings(value string) (codexSettings, error) {
	parts := strings.Split(value, "/")
	if len(parts) != 2 {
		return codexSettings{}, errors.New("must use <model>/<effort>")
	}
	model := strings.TrimSpace(parts[0])
	effort := strings.TrimSpace(parts[1])
	if model == "" || effort == "" {
		return codexSettings{}, errors.New("must use nonempty <model>/<effort>")
	}
	if !strings.HasPrefix(model, "gpt-") {
		model = "gpt-" + model
	}
	switch effort {
	case "none", "low", "medium", "high", "xhigh", "max":
	default:
		return codexSettings{}, fmt.Errorf("unsupported reasoning effort %q", effort)
	}
	return codexSettings{model: model, reasoningEffort: effort}, nil
}

func repoRoot() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get working directory: %w", err)
	}
	for dir := wd; ; dir = filepath.Dir(dir) {
		contents, readErr := os.ReadFile(filepath.Join(dir, "go.mod"))
		if readErr == nil && strings.Contains(string(contents), "module "+modulePath+"\n") {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("could not find %s go.mod from %s", modulePath, wd)
		}
	}
}

func requireSafeBranch(root string) error {
	branch, err := gitOutput(root, "branch", "--show-current")
	if err != nil {
		return fmt.Errorf("resolve current branch: %w", err)
	}
	if branch == "" {
		return errors.New("current Git state is detached; garden docs from a named branch")
	}
	if branch == "main" {
		return errors.New("refusing to garden docs directly on main")
	}
	return nil
}

func requireCleanWorktree(root string) error {
	status, err := gitOutput(root, "status", "--porcelain")
	if err != nil {
		return fmt.Errorf("check worktree status: %w", err)
	}
	if status != "" {
		return errors.New("worktree is not clean; commit or remove changes before gardening docs")
	}
	return nil
}

func loadPromptTemplates(root string) (promptTemplates, error) {
	paths := map[targetKind]string{
		kindDocker:          "docs/agents/garden/docker.md",
		kindFrontendPackage: "docs/agents/garden/frontend-package.md",
		kindGoPackage:       "docs/agents/garden/go-package.md",
		kindGoPackageFolder: "docs/agents/garden/go-package-folder.md",
		kindProjectState:    "docs/agents/garden/project-state.md",
	}
	templates := make(promptTemplates, len(paths))
	for kind, path := range paths {
		contents, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(path)))
		if err != nil {
			return nil, fmt.Errorf("read %s prompt: %w", kind, err)
		}
		if strings.TrimSpace(string(contents)) == "" {
			return nil, fmt.Errorf("%s prompt %s is empty", kind, path)
		}
		templates[kind] = strings.TrimSpace(string(contents))
	}
	return templates, nil
}

func loadProjectGraph(root string) (projectGraph, error) {
	graph := projectGraph{
		byDir:    make(map[string]*packageNode),
		byImport: make(map[string]*packageNode),
	}
	for _, args := range [][]string{{"list", "-json", "./..."}, {"list", "-tags=integration", "-json", "./..."}} {
		if err := graph.loadPass(root, args); err != nil {
			return projectGraph{}, err
		}
	}
	return graph, nil
}

func (graph projectGraph) loadPass(root string, args []string) error {
	cmd := exec.Command("go", args...)
	cmd.Dir = root
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("go %s failed: %w%s", strings.Join(args, " "), err, capturedOutput(stderr.String()))
	}
	decoder := json.NewDecoder(bytes.NewReader(stdout))
	for {
		var record packageRecord
		if err := decoder.Decode(&record); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			return fmt.Errorf("decode go %s output: %w", strings.Join(args, " "), err)
		}
		if err := graph.mergePackage(root, record); err != nil {
			return err
		}
	}
	return nil
}

func (graph projectGraph) mergePackage(root string, record packageRecord) error {
	relDir, err := filepath.Rel(root, record.Dir)
	if err != nil {
		return fmt.Errorf("relativize package directory %s: %w", record.Dir, err)
	}
	relDir = filepath.ToSlash(relDir)
	if relDir == ".." || strings.HasPrefix(relDir, "../") {
		return fmt.Errorf("project package %s is outside repository root at %s", record.ImportPath, record.Dir)
	}
	node := graph.byImport[record.ImportPath]
	if node == nil {
		node = &packageNode{
			dir:          relDir,
			importPath:   record.ImportPath,
			imports:      make(map[string]struct{}),
			testImports:  make(map[string]struct{}),
			xTestImports: make(map[string]struct{}),
		}
		graph.byImport[record.ImportPath] = node
		graph.byDir[relDir] = node
	} else if node.dir != relDir {
		return fmt.Errorf("package %s resolved to both %s and %s", record.ImportPath, node.dir, relDir)
	}
	addStrings(node.imports, record.Imports)
	addStrings(node.testImports, record.TestImports)
	addStrings(node.xTestImports, record.XTestImports)
	return nil
}

func addStrings(destination map[string]struct{}, values []string) {
	for _, value := range values {
		destination[value] = struct{}{}
	}
}

func selectTargets(root string, graph projectGraph, limit *int) ([]gardenTarget, selectionSummary, error) {
	packageDocs, err := trackedPackageDocs(root)
	if err != nil {
		return nil, selectionSummary{}, err
	}
	classified := make([]gardenTarget, 0, len(packageDocs))
	for _, path := range packageDocs {
		target, err := classifyPackageDoc(path, graph)
		if err != nil {
			return nil, selectionSummary{}, err
		}
		classified = append(classified, target)
	}

	var summary selectionSummary
	eligible := make([]gardenTarget, 0, len(classified))
	for _, target := range classified {
		gardened, err := lastCommitWasGardening(root, target.path)
		if err != nil {
			return nil, selectionSummary{}, err
		}
		if gardened {
			summary.sentinelSkipped++
			continue
		}
		eligible = append(eligible, target)
	}
	if limit != nil && len(eligible) > *limit {
		summary.limitDeferred = len(eligible) - *limit
		eligible = eligible[:*limit]
	}

	targets := make([]gardenTarget, 0, len(eligible)+1)
	stateGardened, err := lastCommitWasGardening(root, "PROJECT_STATE.md")
	if err != nil {
		return nil, selectionSummary{}, err
	}
	if stateGardened {
		summary.sentinelSkipped++
	} else {
		targets = append(targets, gardenTarget{path: "PROJECT_STATE.md", kind: kindProjectState})
	}
	targets = append(targets, eligible...)
	summary.selected = len(targets)
	return targets, summary, nil
}

func trackedPackageDocs(root string) ([]string, error) {
	output, err := gitOutputBytes(root, "ls-files", "-z", "--")
	if err != nil {
		return nil, fmt.Errorf("list tracked files: %w", err)
	}
	var paths []string
	for _, raw := range bytes.Split(output, []byte{0}) {
		if len(raw) == 0 {
			continue
		}
		path := filepath.ToSlash(string(raw))
		if filepath.Base(path) == "PACKAGE.md" {
			paths = append(paths, path)
		}
	}
	sort.Strings(paths)
	return paths, nil
}

func classifyPackageDoc(path string, graph projectGraph) (gardenTarget, error) {
	dir := filepath.ToSlash(filepath.Dir(path))
	switch {
	case path == "docker/PACKAGE.md":
		return gardenTarget{path: path, kind: kindDocker}, nil
	case path == "frontend/PACKAGE.md" || strings.HasPrefix(path, "frontend/"):
		return gardenTarget{path: path, kind: kindFrontendPackage}, nil
	case graph.byDir[dir] != nil:
		return gardenTarget{path: path, kind: kindGoPackage, importPath: graph.byDir[dir].importPath}, nil
	case graph.hasPackageDescendant(dir):
		return gardenTarget{path: path, kind: kindGoPackageFolder}, nil
	default:
		return gardenTarget{}, fmt.Errorf("cannot classify %s as Docker, frontend, a Go package, or a Go package folder", path)
	}
}

func (graph projectGraph) hasPackageDescendant(dir string) bool {
	if dir == "." {
		return len(graph.byDir) > 0
	}
	prefix := strings.TrimSuffix(dir, "/") + "/"
	for packageDir := range graph.byDir {
		if strings.HasPrefix(packageDir, prefix) {
			return true
		}
	}
	return false
}

func lastCommitWasGardening(root string, path string) (bool, error) {
	message, err := gitOutput(root, "log", "--follow", "-1", "--format=%B", "--", path)
	if err != nil {
		return false, fmt.Errorf("read last commit for %s: %w", path, err)
	}
	if message == "" {
		return false, fmt.Errorf("no commit history found for %s", path)
	}
	return strings.Contains(message, gardenSentinel), nil
}

func renderPrompt(target gardenTarget, template string, graph projectGraph) (string, error) {
	var prompt strings.Builder
	prompt.WriteString(strings.TrimSpace(template))
	prompt.WriteString("\n\n## Generated Invocation Context\n\n")
	fmt.Fprintf(&prompt, "- Target document: `%s`\n", target.path)
	fmt.Fprintf(&prompt, "- Target classification: %s\n", target.kind)
	prompt.WriteString("- Edit only the target document.\n")
	prompt.WriteString("- Do not create commits; the gardening orchestrator owns commits.\n")
	prompt.WriteString("- Do not run review-loop.\n")
	if target.kind != kindGoPackage {
		return prompt.String(), nil
	}
	node := graph.byImport[target.importPath]
	if node == nil {
		return "", fmt.Errorf("missing graph entry for %s", target.importPath)
	}
	fmt.Fprintf(&prompt, "- Package import path: `%s`\n", target.importPath)
	writePromptSection(&prompt, "Direct Project Production Upstreams", graph.projectImports(node.imports))
	writePromptSection(&prompt, "Direct Project Production Downstreams", graph.directImporters(target.importPath, func(candidate *packageNode) map[string]struct{} {
		return candidate.imports
	}))
	writePromptSection(&prompt, "Direct Project Internal-Test Downstreams", graph.directImporters(target.importPath, func(candidate *packageNode) map[string]struct{} {
		return candidate.testImports
	}))
	writePromptSection(&prompt, "Direct Project External-Test Downstreams", graph.directImporters(target.importPath, func(candidate *packageNode) map[string]struct{} {
		return candidate.xTestImports
	}))
	return prompt.String(), nil
}

func (graph projectGraph) projectImports(imports map[string]struct{}) []string {
	paths := make([]string, 0, len(imports))
	for importPath := range imports {
		if graph.byImport[importPath] != nil {
			paths = append(paths, importPath)
		}
	}
	sort.Strings(paths)
	return paths
}

func (graph projectGraph) directImporters(
	targetImportPath string,
	imports func(*packageNode) map[string]struct{},
) []string {
	var paths []string
	for importPath, candidate := range graph.byImport {
		if _, ok := imports(candidate)[targetImportPath]; ok {
			paths = append(paths, importPath)
		}
	}
	sort.Strings(paths)
	return paths
}

func writePromptSection(prompt *strings.Builder, title string, values []string) {
	if len(values) == 0 {
		return
	}
	fmt.Fprintf(prompt, "\n### %s\n\n", title)
	for _, value := range values {
		fmt.Fprintf(prompt, "- `%s`\n", value)
	}
}

func codexInvocation(root string, settings codexSettings) []string {
	return []string{
		"codex",
		"exec",
		"-m", settings.model,
		"-c", "model_reasoning_effort=" + settings.reasoningEffort,
		"--dangerously-bypass-approvals-and-sandbox",
		"--color", "never",
		"--cd", root,
		"-",
	}
}

func runAgentBatch(
	ctx context.Context,
	root string,
	stdout io.Writer,
	tasks []agentTask,
) (*agentResult, error) {
	for _, task := range tasks {
		if _, err := fmt.Fprintf(
			stdout,
			"garden-docs: [%d/%d] starting %s\n",
			task.index,
			task.total,
			task.target.path,
		); err != nil {
			return nil, fmt.Errorf("write agent start for %s: %w", task.target.path, err)
		}
	}

	batchCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	completed := make(chan agentResult, len(tasks))
	for _, task := range tasks {
		go func() {
			completed <- runAgent(batchCtx, root, task)
		}()
	}

	var failure *agentResult
	var outputErr error
	for range tasks {
		result := <-completed
		status := "completed"
		if result.err != nil {
			status = "cancelled"
			if failure == nil && outputErr == nil && ctx.Err() == nil {
				failedResult := result
				failure = &failedResult
				status = "failed"
				cancel()
			}
		}
		if outputErr != nil {
			continue
		}
		_, err := fmt.Fprintf(
			stdout,
			"garden-docs: [%d/%d] %s %s\n",
			result.task.index,
			result.task.total,
			status,
			result.task.target.path,
		)
		if err != nil {
			outputErr = fmt.Errorf("write agent result for %s: %w", result.task.target.path, err)
			cancel()
		}
	}
	return failure, outputErr
}

func runAgent(ctx context.Context, root string, task agentTask) agentResult {
	cmd := exec.CommandContext(ctx, task.invocation[0], task.invocation[1:]...)
	cmd.Dir = root
	cmd.Stdin = strings.NewReader(task.prompt)
	cmd.Env = append(os.Environ(), reviewLoopActive+"=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
			return cmd.Process.Kill()
		}
		return nil
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return agentResult{
		task:   task,
		stdout: stdout.String(),
		stderr: stderr.String(),
		err:    err,
	}
}

func agentError(result agentResult) error {
	return fmt.Errorf(
		"agent [%d/%d] failed for %s: %s; preserve the worktree for inspection",
		result.task.index,
		result.task.total,
		result.task.target.path,
		lastAgentError(result),
	)
}

func lastAgentError(result agentResult) string {
	for _, output := range []string{result.stderr, result.stdout} {
		lines := strings.Split(strings.TrimSpace(output), "\n")
		for index := len(lines) - 1; index >= 0; index-- {
			if line := strings.TrimSpace(lines[index]); line != "" {
				return line
			}
		}
	}
	return result.err.Error()
}

func validateBatchChanges(
	root string,
	tasks []agentTask,
	changedPaths []string,
) (map[string]struct{}, error) {
	assigned := make(map[string]struct{}, len(tasks))
	for _, task := range tasks {
		assigned[task.target.path] = struct{}{}
	}
	changedTargets := make(map[string]struct{}, len(changedPaths))
	var unexpected []string
	for _, path := range changedPaths {
		if _, ok := assigned[path]; !ok {
			unexpected = append(unexpected, path)
			continue
		}
		changedTargets[path] = struct{}{}
	}
	if len(unexpected) > 0 {
		return nil, fmt.Errorf("agents changed unexpected paths: %s; preserve the worktree for inspection", strings.Join(unexpected, ", "))
	}
	for path := range changedTargets {
		info, err := os.Lstat(filepath.Join(root, filepath.FromSlash(path)))
		if err != nil {
			return nil, fmt.Errorf("target %s was removed or became unreadable: %w", path, err)
		}
		if !info.Mode().IsRegular() {
			return nil, fmt.Errorf("target %s is no longer a regular file", path)
		}
	}
	return changedTargets, nil
}

func worktreeChangedPaths(root string) ([]string, error) {
	tracked, err := gitOutputBytes(root, "diff", "--name-only", "-z", "HEAD", "--")
	if err != nil {
		return nil, fmt.Errorf("list tracked worktree changes: %w", err)
	}
	untracked, err := gitOutputBytes(root, "ls-files", "--others", "--exclude-standard", "-z", "--")
	if err != nil {
		return nil, fmt.Errorf("list untracked worktree changes: %w", err)
	}
	pathSet := make(map[string]struct{})
	for _, output := range [][]byte{tracked, untracked} {
		for _, raw := range bytes.Split(output, []byte{0}) {
			if len(raw) > 0 {
				pathSet[filepath.ToSlash(string(raw))] = struct{}{}
			}
		}
	}
	paths := make([]string, 0, len(pathSet))
	for path := range pathSet {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	return paths, nil
}

func commitGardenedTarget(root string, path string) error {
	subject := fmt.Sprintf("docs: garden %s %s", path, gardenSentinel)
	cmd := exec.Command("git", "-C", root, "commit", "--only", "-m", subject, "--", path)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf(
			"commit gardened target %s: %w%s; preserve the change for inspection",
			path,
			err,
			capturedOutput(stdout.String()+"\n"+stderr.String()),
		)
	}
	return nil
}

func gitOutput(root string, args ...string) (string, error) {
	output, err := gitOutputBytes(root, args...)
	return strings.TrimSpace(string(output)), err
}

func gitOutputBytes(root string, args ...string) ([]byte, error) {
	cmd := exec.Command("git", append([]string{"-C", root}, args...)...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git %s failed: %w%s", strings.Join(args, " "), err, capturedOutput(stderr.String()))
	}
	return output, nil
}

func capturedOutput(output string) string {
	output = strings.TrimSpace(output)
	if output == "" {
		return ""
	}
	return ": " + output
}

// archlint enforces architecture rules that are not import-boundary rules.
//
// Keep import restrictions in .golangci.yml depguard rules. Add checks here
// only when the rule depends on file layout, package names, build tags, or
// other structure that depguard cannot express.
//
// Current rules:
//   - Go test files are allowed only in internal/apptest/runtime or as the
//     cmd/mina/cli_smoke_test.go integration driver.
//   - Normal in-process app tests must use package runtime_test.
//   - Normal in-process app tests must not use wall-clock waits, host-local
//     time, random values, or UUID fixture sources.
//   - The testscript integration driver must use package main and the
//     integration build tag.
package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"go/types"
	"io/fs"
	"os"
	"os/exec"
	pathpkg "path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/tools/go/packages"
)

const modulePath = "github.com/mishamsk/mina"

type issue struct {
	path string
	line int
	msg  string
}

type typedTestFile struct {
	fileSet *token.FileSet
	file    *ast.File
	info    *types.Info
}

func main() {
	root, err := repoRoot()
	if err != nil {
		fmt.Fprintf(os.Stderr, "archlint: %v\n", err)
		os.Exit(2)
	}

	issues, err := lint(root)
	if err != nil {
		fmt.Fprintf(os.Stderr, "archlint: %v\n", err)
		os.Exit(2)
	}
	if len(issues) == 0 {
		return
	}

	sort.Slice(issues, func(i, j int) bool {
		if issues[i].path != issues[j].path {
			return issues[i].path < issues[j].path
		}
		if issues[i].line != issues[j].line {
			return issues[i].line < issues[j].line
		}
		return issues[i].msg < issues[j].msg
	})
	for _, issue := range issues {
		if issue.line > 0 {
			fmt.Fprintf(os.Stderr, "%s:%d: %s\n", issue.path, issue.line, issue.msg)
			continue
		}
		fmt.Fprintf(os.Stderr, "%s: %s\n", issue.path, issue.msg)
	}
	os.Exit(1)
}

func repoRoot() (string, error) {
	if len(os.Args) > 2 {
		return "", fmt.Errorf("usage: archlint [repo-root]")
	}
	if len(os.Args) == 2 {
		return filepath.Abs(os.Args[1])
	}

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

func lint(root string) ([]issue, error) {
	typedAppTests, err := loadTypedAppTests(root)
	if err != nil {
		return nil, err
	}

	var issues []issue
	if err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".git", "build", "vendor":
				return filepath.SkipDir
			}
			ignored, err := topLevelGitIgnoredDir(root, path)
			if err != nil {
				return err
			}
			if ignored {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(entry.Name(), "_test.go") {
			return nil
		}

		relPath, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		relPath = filepath.ToSlash(relPath)
		fileIssues, err := lintTestFile(path, relPath, typedAppTests)
		if err != nil {
			return err
		}
		issues = append(issues, fileIssues...)

		return nil
	}); err != nil {
		return nil, fmt.Errorf("walk Go test files: %w", err)
	}

	return issues, nil
}

func loadTypedAppTests(root string) (map[string]typedTestFile, error) {
	loaded, err := packages.Load(&packages.Config{
		Dir:   root,
		Mode:  packages.LoadSyntax,
		Tests: true,
	}, "./internal/apptest/runtime")
	if err != nil {
		return nil, fmt.Errorf("load app tests: %w", err)
	}
	for _, pkg := range loaded {
		if len(pkg.Errors) > 0 {
			return nil, fmt.Errorf("load app tests: %s", pkg.Errors[0])
		}
	}

	typed := make(map[string]typedTestFile)
	for _, pkg := range loaded {
		for _, file := range pkg.Syntax {
			path, err := filepath.Abs(pkg.Fset.Position(file.Pos()).Filename)
			if err != nil {
				return nil, fmt.Errorf("resolve typed app-test path: %w", err)
			}
			path = filepath.Clean(path)
			if strings.HasSuffix(path, "_test.go") {
				typed[path] = typedTestFile{fileSet: pkg.Fset, file: file, info: pkg.TypesInfo}
			}
		}
	}
	return typed, nil
}

func topLevelGitIgnoredDir(root string, path string) (bool, error) {
	relPath, err := filepath.Rel(root, path)
	if err != nil {
		return false, err
	}
	relPath = filepath.ToSlash(relPath)
	if relPath == "." || strings.Contains(relPath, "/") {
		return false, nil
	}

	cmd := exec.Command("git", "-C", root, "check-ignore", "-q", "--", relPath)
	err = cmd.Run()
	if err == nil {
		return true, nil
	}
	if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
		return false, nil
	}
	return false, fmt.Errorf("check git ignore for %s: %w", relPath, err)
}

func lintTestFile(path string, relPath string, typedAppTests map[string]typedTestFile) ([]issue, error) {
	packageName, packageLine, err := packageClause(path)
	if err != nil {
		return nil, err
	}

	switch {
	case strings.HasPrefix(relPath, "internal/apptest/runtime/"):
		var issues []issue
		if packageName != "runtime_test" {
			issues = append(issues, issue{
				path: relPath,
				line: packageLine,
				msg:  "normal app tests must use package runtime_test",
			})
		}
		typed, ok := typedAppTests[filepath.Clean(path)]
		if !ok {
			return nil, fmt.Errorf("missing type information for app test %s", relPath)
		}
		determinismIssues := lintAppTestDeterminism(typed, relPath)
		return append(issues, determinismIssues...), nil
	case relPath == "cmd/mina/cli_smoke_test.go":
		var issues []issue
		if packageName != "main" {
			issues = append(issues, issue{
				path: relPath,
				line: packageLine,
				msg:  "testscript integration driver must use package main",
			})
		}
		hasTag, err := hasIntegrationBuildTag(path)
		if err != nil {
			return nil, err
		}
		if !hasTag {
			issues = append(issues, issue{
				path: relPath,
				line: 1,
				msg:  "testscript integration driver must use the integration build tag",
			})
		}
		return issues, nil
	default:
		return []issue{{
			path: relPath,
			line: packageLine,
			msg:  "app tests are only allowed in internal/apptest/runtime or cmd/mina/cli_smoke_test.go",
		}}, nil
	}
}

func lintAppTestDeterminism(typed typedTestFile, relPath string) []issue {
	var issues []issue
	for _, spec := range typed.file.Imports {
		importPath, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			continue
		}
		if spec.Name != nil && spec.Name.Name == "." && isNondeterministicPackage(importPath) {
			issues = append(issues, issue{
				path: relPath,
				line: typed.fileSet.Position(spec.Pos()).Line,
				msg:  fmt.Sprintf("app tests must not dot-import nondeterministic package %q", importPath),
			})
		}
	}

	ast.Inspect(typed.file, func(node ast.Node) bool {
		if assignment, ok := node.(*ast.AssignStmt); ok {
			for _, left := range assignment.Lhs {
				selector, ok := left.(*ast.SelectorExpr)
				if !ok || !isHTTPClientTimeout(typed.info.Uses[selector.Sel]) {
					continue
				}
				issues = append(issues, issue{
					path: relPath,
					line: typed.fileSet.Position(selector.Pos()).Line,
					msg:  "app tests must not set http.Client.Timeout; use deterministic synchronization",
				})
			}
		}
		if composite, ok := node.(*ast.CompositeLit); ok {
			for _, element := range composite.Elts {
				keyValue, ok := element.(*ast.KeyValueExpr)
				if !ok {
					continue
				}
				key, ok := keyValue.Key.(*ast.Ident)
				if ok && isHTTPClientTimeout(typed.info.Uses[key]) {
					issues = append(issues, issue{
						path: relPath,
						line: typed.fileSet.Position(key.Pos()).Line,
						msg:  "app tests must not set http.Client.Timeout; use deterministic synchronization",
					})
				}
			}
		}
		selector, ok := node.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		selected := typed.info.Uses[selector.Sel]
		if isQualifiedObject(selected, "time", "Local") {
			message := "app tests must not use time.Local; use UTC or an explicit fixed location"
			if _, ok := selected.(*types.Func); ok {
				message = "app tests must not use time.Time.Local; use UTC or an explicit fixed location"
			}
			issues = append(issues, issue{
				path: relPath,
				line: typed.fileSet.Position(selector.Pos()).Line,
				msg:  message,
			})
			return true
		}
		if selected == nil {
			return true
		}
		message := forbiddenAppTestObject(selected)
		if message == "" {
			return true
		}
		issues = append(issues, issue{
			path: relPath,
			line: typed.fileSet.Position(selector.Pos()).Line,
			msg:  message,
		})
		return true
	})

	return issues
}

func isHTTPClientTimeout(object types.Object) bool {
	variable, ok := object.(*types.Var)
	return ok && variable.IsField() && isQualifiedObject(variable, "net/http", "Timeout")
}

func isQualifiedObject(object types.Object, importPath string, name string) bool {
	return object != nil && objectPackagePath(object) == importPath && object.Name() == name
}

func objectPackagePath(object types.Object) string {
	if object == nil || object.Pkg() == nil {
		return ""
	}
	return object.Pkg().Path()
}

func forbiddenAppTestObject(object types.Object) string {
	importPath := objectPackagePath(object)
	if function, ok := object.(*types.Func); ok && importPath == "time" {
		signature, _ := function.Type().(*types.Signature)
		if signature != nil && signature.Recv() != nil {
			return ""
		}
	}
	return forbiddenAppTestUse(importPath, object.Name())
}

func forbiddenAppTestUse(importPath string, name string) string {
	if importPath == "time" {
		if name == "LoadLocation" {
			return "app tests must not use time.LoadLocation; use UTC or time.FixedZone"
		}
		switch name {
		case "After", "AfterFunc", "NewTicker", "NewTimer", "Now", "Since", "Sleep", "Tick", "Until":
			return fmt.Sprintf("app tests must not use time.%s; use the apptest fake clock or synchronization helpers", name)
		}
	}
	if importPath == "context" {
		switch name {
		case "WithDeadline", "WithDeadlineCause", "WithTimeout", "WithTimeoutCause":
			return fmt.Sprintf("app tests must not use context.%s; use controlled fake synchronization", name)
		}
	}
	if importPath == "math/rand" || importPath == "math/rand/v2" || importPath == "crypto/rand" {
		return fmt.Sprintf("app tests must not use %s.%s; use deterministic fixtures", importPath, name)
	}
	if isUUIDPackage(importPath) {
		return fmt.Sprintf("app tests must not use %s.%s; use deterministic fixture identifiers", importPath, name)
	}
	if isTestifyAssertionPackage(importPath) {
		switch name {
		case "Eventually", "EventuallyWithT", "EventuallyWithTf", "Eventuallyf", "Never", "Neverf":
			return fmt.Sprintf("app tests must not use %s.%s; use deterministic synchronization", importPath, name)
		}
	}
	return ""
}

func isNondeterministicPackage(importPath string) bool {
	return importPath == "time" || importPath == "context" || importPath == "math/rand" || importPath == "math/rand/v2" || importPath == "crypto/rand" || isUUIDPackage(importPath) || isTestifyAssertionPackage(importPath)
}

func isUUIDPackage(importPath string) bool {
	return pathpkg.Base(importPath) == "uuid" || strings.Contains(importPath, "/uuid/")
}

func isTestifyAssertionPackage(importPath string) bool {
	return importPath == "github.com/stretchr/testify/assert" || importPath == "github.com/stretchr/testify/require"
}

func packageClause(path string) (string, int, error) {
	fileSet := token.NewFileSet()
	parsed, err := parser.ParseFile(fileSet, path, nil, parser.PackageClauseOnly)
	if err != nil {
		return "", 0, fmt.Errorf("parse package clause for %s: %w", path, err)
	}
	pos := fileSet.Position(parsed.Package)

	return parsed.Name.Name, pos.Line, nil
}

func hasIntegrationBuildTag(path string) (bool, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return false, fmt.Errorf("read %s: %w", path, err)
	}
	beforePackage, _, _ := strings.Cut(string(contents), "\npackage ")

	return strings.Contains(beforePackage, "//go:build integration"), nil
}

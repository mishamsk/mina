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
//   - The testscript integration driver must use package main and the
//     integration build tag.
package main

import (
	"fmt"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

const modulePath = "github.com/mishamsk/mina"

type issue struct {
	path string
	line int
	msg  string
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
		fileIssues, err := lintTestFile(path, relPath)
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

func lintTestFile(path string, relPath string) ([]issue, error) {
	packageName, packageLine, err := packageClause(path)
	if err != nil {
		return nil, err
	}

	switch {
	case strings.HasPrefix(relPath, "internal/apptest/runtime/"):
		if packageName != "runtime_test" {
			return []issue{{
				path: relPath,
				line: packageLine,
				msg:  "normal app tests must use package runtime_test",
			}}, nil
		}
		return nil, nil
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

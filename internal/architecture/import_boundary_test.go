package architecture_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

const modulePath = "mina.local/mina"

type goFile struct {
	relPath string
	imports []string
}

func TestImportBoundaries(t *testing.T) {
	root := repoRoot(t)
	files := collectGoFiles(t, root)

	assertNoForbiddenImports(t, files, "internal/services/", []string{
		"database/sql",
		"github.com/spf13/cobra",
		"github.com/spf13/pflag",
		modulePath + "/internal/httpapi",
		modulePath + "/internal/store",
		"net/http",
		"os",
		"syscall",
	})
	assertNoForbiddenImports(t, files, "internal/store/", []string{
		"github.com/spf13/cobra",
		"github.com/spf13/pflag",
		modulePath + "/internal/httpapi",
		modulePath + "/internal/runtime",
	})
	assertRuntimeImportsAreCompositionOnly(t, files)
	assertObsoletePackagesRemoved(t, root)
}

func repoRoot(t *testing.T) string {
	t.Helper()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate import-boundary test file")
	}

	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
}

func collectGoFiles(t *testing.T, root string) []goFile {
	t.Helper()

	var files []goFile
	if err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".git", "vendor":
				return filepath.SkipDir
			default:
				return nil
			}
		}
		if filepath.Ext(path) != ".go" {
			return nil
		}

		relPath, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		imports, err := importsForFile(path)
		if err != nil {
			return err
		}
		files = append(files, goFile{
			relPath: filepath.ToSlash(relPath),
			imports: imports,
		})

		return nil
	}); err != nil {
		t.Fatalf("walk Go files: %v", err)
	}

	return files
}

func importsForFile(path string) ([]string, error) {
	parsed, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
	if err != nil {
		return nil, err
	}

	imports := make([]string, 0, len(parsed.Imports))
	for _, spec := range parsed.Imports {
		value, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			return nil, err
		}
		imports = append(imports, value)
	}

	return imports, nil
}

func assertNoForbiddenImports(t *testing.T, files []goFile, relPrefix string, forbidden []string) {
	t.Helper()

	for _, file := range files {
		if !strings.HasPrefix(file.relPath, relPrefix) {
			continue
		}
		for _, imported := range file.imports {
			for _, blocked := range forbidden {
				if importMatches(imported, blocked) {
					t.Fatalf("%s imports forbidden package %q", file.relPath, imported)
				}
			}
		}
	}
}

func assertRuntimeImportsAreCompositionOnly(t *testing.T, files []goFile) {
	t.Helper()

	for _, file := range files {
		if runtimeImportAllowed(file.relPath) {
			continue
		}
		for _, imported := range file.imports {
			if importMatches(imported, modulePath+"/internal/runtime") {
				t.Fatalf("%s imports runtime outside composition or boundary-test helpers", file.relPath)
			}
		}
	}
}

func runtimeImportAllowed(relPath string) bool {
	return strings.HasSuffix(relPath, "_test.go") ||
		strings.HasPrefix(relPath, "cmd/mina/") ||
		strings.HasPrefix(relPath, "internal/apptest/")
}

func assertObsoletePackagesRemoved(t *testing.T, root string) {
	t.Helper()

	for _, relDir := range []string{
		"internal/app",
		"internal/controllers",
		"internal/models",
		"internal/openapi",
		"internal/routers",
	} {
		path := filepath.Join(root, filepath.FromSlash(relDir))
		if _, err := os.Stat(path); err == nil {
			t.Fatalf("obsolete package directory %s still exists", relDir)
		} else if !os.IsNotExist(err) {
			t.Fatalf("stat obsolete package directory %s: %v", relDir, err)
		}
	}
}

func importMatches(imported string, blocked string) bool {
	return imported == blocked || strings.HasPrefix(imported, blocked+"/")
}

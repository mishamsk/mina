package webui

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed dist
var embeddedDist embed.FS

// New builds the embedded web UI handler.
func New() http.Handler {
	dist, err := fs.Sub(embeddedDist, "dist")
	if err != nil {
		panic("webui embedded dist missing: " + err.Error())
	}

	return handler{dist: dist}
}

type handler struct {
	dist fs.FS
}

func (h handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		return
	}

	assetName := strings.TrimPrefix(r.URL.Path, "/")
	if assetName == "" {
		assetName = "index.html"
	}
	assetName = path.Clean(assetName)
	if assetName == "." || strings.HasPrefix(assetName, "../") || !fs.ValidPath(assetName) {
		assetName = "index.html"
	}
	if !fileExists(h.dist, assetName) {
		if isStaticAssetPath(h.dist, assetName) {
			http.NotFound(w, r)
			return
		}
		assetName = "index.html"
	}

	http.ServeFileFS(w, r, h.dist, assetName)
}

func isStaticAssetPath(files fs.FS, name string) bool {
	if name == "assets" || strings.HasPrefix(name, "assets/") {
		return true
	}
	if path.Ext(name) == "" {
		return false
	}
	parent := path.Dir(name)
	if parent == "." {
		return true
	}
	stat, err := fs.Stat(files, parent)
	return err == nil && stat.IsDir()
}

func fileExists(files fs.FS, name string) bool {
	stat, err := fs.Stat(files, name)
	return err == nil && !stat.IsDir()
}

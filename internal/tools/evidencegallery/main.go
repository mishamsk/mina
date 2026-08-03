package main

import (
	"fmt"
	"html/template"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	address  = "127.0.0.1:18082"
	buildDir = "build"
)

var page = template.Must(template.New("gallery").Parse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>UI evidence</title>
  <style>
    body { max-width: 960px; margin: 2rem auto; padding: 0 1rem; font-family: sans-serif; }
    video { display: block; width: 100%; margin-bottom: 2rem; }
  </style>
</head>
<body>
  <h1>UI evidence</h1>
  {{range .Names}}
    <h2>{{.}}</h2>
    <video controls preload="metadata" src="video?name={{urlquery .}}"></video>
  {{else}}
    <p>No video files found in build/.</p>
  {{end}}
</body>
</html>
`))

type galleryData struct {
	Names []string
}

func main() {
	servePath, branch, err := evidenceServePath()
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /", gallery(""))
	mux.HandleFunc("GET /video", video(""))
	mux.HandleFunc("GET "+servePath+"/", gallery(servePath))
	mux.HandleFunc("GET "+servePath+"/video", video(servePath))

	listener, err := net.Listen("tcp", address)
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		_ = listener.Close()
	}()

	log.Printf("evidence gallery listening at http://%s", address)
	log.Printf("serving evidence for branch %q at %s/", branch, servePath)
	go func() {
		if err := http.Serve(listener, mux); err != nil && err != http.ErrServerClosed {
			log.Printf("serve evidence gallery: %v", err)
		}
	}()

	serve := exec.Command("tailscale", "serve", "--https=443", "--set-path="+servePath+"/", "http://"+address)
	serve.Stdout = os.Stdout
	serve.Stderr = os.Stderr
	if err := serve.Run(); err != nil {
		log.Fatal("serve evidence gallery over Tailscale: ", err)
	}
}

func evidenceServePath() (servePath, branch string, err error) {
	output, err := exec.Command("git", "branch", "--show-current").Output()
	if err != nil {
		return "", "", fmt.Errorf("read current Git branch: %w", err)
	}

	branch = strings.TrimSpace(string(output))
	if branch == "" {
		return "", "", fmt.Errorf("read current Git branch: detached HEAD")
	}

	return "/" + branch, branch, nil
}

func gallery(pathPrefix string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != pathPrefix+"/" {
			http.NotFound(w, r)
			return
		}

		names, err := videoNames()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if err := page.Execute(w, galleryData{Names: names}); err != nil {
			log.Printf("render gallery: %v", err)
		}
	}
}

func video(pathPrefix string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != pathPrefix+"/video" {
			http.NotFound(w, r)
			return
		}

		name := r.URL.Query().Get("name")
		if name == "" || filepath.Base(name) != name || !isVideoFile(name) {
			http.NotFound(w, r)
			return
		}

		names, err := videoNames()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		for _, candidate := range names {
			if candidate == name {
				w.Header().Set("Content-Type", videoContentType(name))
				http.ServeFile(w, r, filepath.Join(buildDir, name))
				return
			}
		}

		http.NotFound(w, r)
	}
}

func videoNames() ([]string, error) {
	entries, err := os.ReadDir(buildDir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var names []string
	for _, entry := range entries {
		if entry.Type().IsRegular() && isVideoFile(entry.Name()) {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}

func isVideoFile(name string) bool {
	return videoContentType(name) != ""
}

func videoContentType(name string) string {
	switch filepath.Ext(name) {
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	default:
		return ""
	}
}

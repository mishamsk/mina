package main

import (
	"html/template"
	"log"
	"net/http"
	"os"
	"path/filepath"
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
  {{range .}}
    <h2>{{.}}</h2>
    <video controls preload="metadata" src="/video?name={{urlquery .}}"></video>
  {{else}}
    <p>No WebM files found in build/.</p>
  {{end}}
</body>
</html>
`))

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", gallery)
	mux.HandleFunc("GET /video", video)

	log.Printf("evidence gallery listening at http://%s", address)
	log.Fatal(http.ListenAndServe(address, mux))
}

func gallery(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	names, err := videoNames()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := page.Execute(w, names); err != nil {
		log.Printf("render gallery: %v", err)
	}
}

func video(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" || filepath.Base(name) != name || filepath.Ext(name) != ".webm" {
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
			w.Header().Set("Content-Type", "video/webm")
			http.ServeFile(w, r, filepath.Join(buildDir, name))
			return
		}
	}

	http.NotFound(w, r)
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
		if entry.Type().IsRegular() && filepath.Ext(entry.Name()) == ".webm" {
			names = append(names, entry.Name())
		}
	}
	return names, nil
}

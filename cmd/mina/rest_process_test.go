package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestRESTSmokeProcess(t *testing.T) {
	dbPath := t.TempDir() + "/mina.db"
	cmd := minaHelperCommand(t, "serve", "--db", dbPath, "--create", "--migrate", "--host", "127.0.0.1", "--port", "0")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatalf("stdout pipe: %v", err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		t.Fatalf("start mina helper: %v", err)
	}
	t.Cleanup(func() {
		if cmd.ProcessState == nil || !cmd.ProcessState.Exited() {
			_ = cmd.Process.Signal(os.Interrupt)
			done := make(chan struct{})
			go func() {
				_ = cmd.Wait()
				close(done)
			}()
			select {
			case <-done:
			case <-time.After(3 * time.Second):
				_ = cmd.Process.Kill()
				<-done
			}
		}
	})

	lineCh := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		if scanner.Scan() {
			lineCh <- scanner.Text()
			return
		}
		lineCh <- ""
	}()

	var line string
	select {
	case line = <-lineCh:
	case <-time.After(5 * time.Second):
		t.Fatalf("timed out waiting for server URL; stderr: %s", stderr.String())
	}
	if !strings.HasPrefix(line, "listening http://") {
		t.Fatalf("server line = %q, want listening URL; stderr: %s", line, stderr.String())
	}
	baseURL := strings.TrimPrefix(line, "listening ")

	client := http.Client{Timeout: 5 * time.Second}
	response, err := client.Get(baseURL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v; stderr: %s", err, stderr.String())
	}
	defer func() {
		if err := response.Body.Close(); err != nil {
			t.Fatalf("close response body: %v", err)
		}
	}()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode health body: %v", err)
	}
	if body.Status != "ok" {
		t.Fatalf("health status body = %q, want ok", body.Status)
	}

	categoryResponse, err := client.Get(baseURL + "/categories")
	if err != nil {
		t.Fatalf("GET /categories: %v; stderr: %s", err, stderr.String())
	}
	defer func() {
		if err := categoryResponse.Body.Close(); err != nil {
			t.Fatalf("close category response body: %v", err)
		}
	}()
	if categoryResponse.StatusCode != http.StatusOK {
		t.Fatalf("categories status = %d, want %d", categoryResponse.StatusCode, http.StatusOK)
	}
	var categoryBody struct {
		Categories []struct{} `json:"categories"`
	}
	if err := json.NewDecoder(categoryResponse.Body).Decode(&categoryBody); err != nil {
		t.Fatalf("decode categories body: %v", err)
	}
	if len(categoryBody.Categories) != 0 {
		t.Fatalf("category count = %d, want 0", len(categoryBody.Categories))
	}
}

func TestRESTSmokeProcessHelper(t *testing.T) {
	if os.Getenv("MINA_TEST_HELPER_PROCESS") != "1" {
		return
	}

	args := os.Args
	for index, arg := range args {
		if arg == "--" {
			os.Exit(run(args[index+1:], os.Stdout, os.Stderr))
		}
	}
	os.Exit(run(nil, os.Stdout, os.Stderr))
}

func minaHelperCommand(t *testing.T, args ...string) *exec.Cmd {
	t.Helper()

	commandArgs := []string{"-test.run=TestRESTSmokeProcessHelper", "--"}
	commandArgs = append(commandArgs, args...)
	cmd := exec.Command(os.Args[0], commandArgs...)
	cmd.Env = append(os.Environ(), "MINA_TEST_HELPER_PROCESS=1")

	return cmd
}

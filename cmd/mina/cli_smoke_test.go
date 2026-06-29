//go:build integration

package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	_ "github.com/duckdb/duckdb-go/v2"
	"github.com/rogpeppe/go-internal/testscript"
)

func TestMain(m *testing.M) {
	testscript.Main(m, map[string]func(){
		"mina": func() {
			os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
		},
	})
}

func TestIntegrationScripts(t *testing.T) {
	testscript.Run(t, testscript.Params{
		Dir:                 "testdata/script",
		RequireExplicitExec: true,
		Cmds: map[string]func(ts *testscript.TestScript, neg bool, args []string){
			"duckdbsnapshot": testscriptDuckDBSnapshot,
			"duckdbtables":   testscriptDuckDBTables,
			"duckdbtouch":    testscriptDuckDBTouch,
			"freeport":       testscriptFreePort,
			"frankfurter":    testscriptFrankfurter,
			"httpget":        testscriptHTTPGet,
			"httpwait":       testscriptHTTPWait,
			"glob":           testscriptGlob,
			"waitfile":       testscriptWaitFile,
		},
	})
}

func testscriptDuckDBTouch(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("duckdbtouch does not support negation")
	}
	if len(args) != 1 {
		ts.Fatalf("usage: duckdbtouch path")
	}

	db, err := sql.Open("duckdb", args[0])
	ts.Check(err)
	ts.Check(db.PingContext(context.Background()))
	ts.Check(db.Close())
}

func testscriptDuckDBSnapshot(ts *testscript.TestScript, neg bool, args []string) {
	if len(args) != 2 {
		ts.Fatalf("usage: duckdbsnapshot path snapshot")
	}

	snapshot := duckDBFileSnapshot(ts, args[0])
	if neg {
		want := ts.ReadFile(args[1])
		if snapshot == want {
			ts.Fatalf("duckdb snapshot for %s did not change", args[0])
		}
		return
	}

	if _, err := os.Stat(args[1]); errors.Is(err, os.ErrNotExist) {
		ts.Check(os.WriteFile(args[1], []byte(snapshot), 0o644))
		return
	} else if err != nil {
		ts.Fatalf("stat snapshot %s: %v", args[1], err)
	}

	want := ts.ReadFile(args[1])
	if snapshot != want {
		ts.Fatalf("duckdb snapshot for %s changed:\ngot  %s\nwant %s", args[0], snapshot, want)
	}
}

func duckDBFileSnapshot(ts *testscript.TestScript, path string) string {
	info, err := os.Stat(path)
	ts.Check(err)

	file, err := os.Open(path)
	ts.Check(err)
	defer func() {
		ts.Check(file.Close())
	}()

	sum := sha256.New()
	_, err = io.Copy(sum, file)
	ts.Check(err)

	return fmt.Sprintf("%d %d %s\n", info.Size(), info.ModTime().UnixNano(), hex.EncodeToString(sum.Sum(nil)))
}

func testscriptDuckDBTables(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("duckdbtables does not support negation")
	}
	if len(args) != 2 {
		ts.Fatalf("usage: duckdbtables path schema")
	}

	db, err := sql.Open("duckdb", args[0])
	ts.Check(err)
	defer func() {
		ts.Check(db.Close())
	}()

	var count int
	err = db.QueryRowContext(
		context.Background(),
		`SELECT COUNT(*)
FROM duckdb_tables()
WHERE schema_name = ?`,
		args[1],
	).Scan(&count)
	ts.Check(err)
	_, err = ts.Stdout().Write([]byte(strconv.Itoa(count) + "\n"))
	ts.Check(err)
}

func testscriptFreePort(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("freeport does not support negation")
	}
	if len(args) > 1 {
		ts.Fatalf("usage: freeport [env_var]")
	}

	envVar := "PORT"
	if len(args) == 1 {
		envVar = args[0]
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	ts.Check(err)
	_, port, err := net.SplitHostPort(listener.Addr().String())
	ts.Check(err)
	ts.Check(listener.Close())
	ts.Setenv(envVar, port)
}

func testscriptGlob(ts *testscript.TestScript, neg bool, args []string) {
	if len(args) != 1 {
		ts.Fatalf("usage: glob pattern")
	}

	matches, err := filepath.Glob(ts.MkAbs(args[0]))
	ts.Check(err)
	if neg {
		if len(matches) != 0 {
			ts.Fatalf("glob %q matched %v", args[0], matches)
		}
		return
	}
	if len(matches) == 0 {
		ts.Fatalf("glob %q did not match any files", args[0])
	}
}

func testscriptWaitFile(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("waitfile does not support negation")
	}

	timeout := 10 * time.Second
	for len(args) > 0 && args[0] != "" && args[0][0] == '-' {
		switch args[0] {
		case "-timeout":
			if len(args) < 2 {
				ts.Fatalf("usage: waitfile [-timeout duration] path")
			}
			var err error
			timeout, err = time.ParseDuration(args[1])
			ts.Check(err)
			args = args[2:]
		default:
			ts.Fatalf("unknown waitfile option %q", args[0])
		}
	}
	if len(args) != 1 {
		ts.Fatalf("usage: waitfile [-timeout duration] path")
	}

	path := ts.MkAbs(args[0])
	deadline := time.Now().Add(timeout)
	for {
		_, err := os.Stat(path)
		if err == nil {
			return
		}
		if !errors.Is(err, os.ErrNotExist) {
			ts.Fatalf("stat %s: %v", args[0], err)
		}
		if time.Now().After(deadline) {
			ts.Fatalf("timed out waiting for %s", args[0])
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func testscriptFrankfurter(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("frankfurter does not support negation")
	}
	if len(args) != 1 {
		ts.Fatalf("usage: frankfurter url_env_var")
	}

	urlEnvVar := args[0]
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rates" {
			http.NotFound(w, r)
			return
		}
		from := r.URL.Query().Get("from")
		rows := frankfurterRowsForRange(from, r.URL.Query().Get("to"))
		if !strings.Contains(r.Header.Get("Accept"), "application/x-ndjson") {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, frankfurterJSON(rows))
			return
		}
		w.Header().Set("Content-Type", "application/x-ndjson")
		_, _ = io.WriteString(w, frankfurterNDJSON(rows))
	})
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	ts.Check(err)
	baseURL := "http://" + listener.Addr().String()
	ts.Setenv(urlEnvVar, baseURL)
	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	done := make(chan error, 1)
	go func() {
		defer close(done)
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			done <- err
		}
	}()
	ts.Defer(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
		if err := <-done; err != nil {
			ts.Fatalf("serve Frankfurter test server: %v", err)
		}
	})
	_, err = fmt.Fprintln(ts.Stdout(), baseURL)
	ts.Check(err)
}

type frankfurterTestRow struct {
	date string
	rate string
}

var frankfurterTestRows = []frankfurterTestRow{
	{date: "2024-04-02", rate: "0.93000000"},
	{date: "2026-04-01", rate: "1.09000000"},
}

func frankfurterRowsForRange(from string, to string) []frankfurterTestRow {
	rows := []frankfurterTestRow{}
	for _, row := range frankfurterTestRows {
		if from != "" && row.date < from {
			continue
		}
		if to != "" && row.date > to {
			continue
		}
		rows = append(rows, row)
	}

	return rows
}

func frankfurterJSON(rows []frankfurterTestRow) string {
	parts := make([]string, 0, len(rows))
	for _, row := range rows {
		parts = append(parts, frankfurterJSONObject(row))
	}

	return "[" + strings.Join(parts, ",") + "]"
}

func frankfurterNDJSON(rows []frankfurterTestRow) string {
	var builder strings.Builder
	for _, row := range rows {
		builder.WriteString(frankfurterJSONObject(row))
		builder.WriteByte('\n')
	}

	return builder.String()
}

func frankfurterJSONObject(row frankfurterTestRow) string {
	return `{"date":"` + row.date + `","base":"USD","quote":"EUR","rate":` + row.rate + `}`
}

func testscriptHTTPGet(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("httpget does not support negation")
	}

	method := http.MethodGet
	status := http.StatusOK
	accept := ""
	location := ""
	var body []byte
	for len(args) > 0 && args[0] != "" && args[0][0] == '-' {
		switch args[0] {
		case "-accept":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-location location] [-body file] url")
			}
			accept = args[1]
			args = args[2:]
		case "-method":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-location location] [-body file] url")
			}
			method = args[1]
			args = args[2:]
		case "-status":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-location location] [-body file] url")
			}
			var err error
			status, err = strconv.Atoi(args[1])
			ts.Check(err)
			args = args[2:]
		case "-location":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-location location] [-body file] url")
			}
			location = args[1]
			args = args[2:]
		case "-body":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-location location] [-body file] url")
			}
			body = []byte(ts.ReadFile(args[1]))
			args = args[2:]
		default:
			ts.Fatalf("unknown httpget flag %q", args[0])
		}
	}
	if len(args) != 1 {
		ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-location location] [-body file] url")
	}

	url := args[0]
	client := http.Client{Timeout: 500 * time.Millisecond}
	if location != "" || (status >= http.StatusMultipleChoices && status < http.StatusBadRequest) {
		client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		}
	}
	deadline := time.Now().Add(5 * time.Second)
	var lastErr error
	for {
		var requestBody io.Reader
		if body != nil {
			requestBody = bytes.NewReader(body)
		}
		request, err := http.NewRequest(method, url, requestBody)
		ts.Check(err)
		if accept != "" {
			request.Header.Set("Accept", accept)
		}
		if body != nil {
			request.Header.Set("Content-Type", "application/json")
		}

		response, err := client.Do(request)
		if err == nil {
			body, readErr := io.ReadAll(response.Body)
			closeErr := response.Body.Close()
			ts.Check(readErr)
			ts.Check(closeErr)
			if response.StatusCode != status {
				ts.Fatalf("%s %s status = %d, want %d; body: %s", method, url, response.StatusCode, status, string(body))
			}
			if location != "" && response.Header.Get("Location") != location {
				ts.Fatalf("%s %s location = %q, want %q", method, url, response.Header.Get("Location"), location)
			}
			_, err = ts.Stdout().Write(body)
			ts.Check(err)
			return
		}

		lastErr = err
		if time.Now().After(deadline) {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	ts.Fatalf("%s %s: %v", method, url, lastErr)
}

func testscriptHTTPWait(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("httpwait does not support negation")
	}
	timeout := 10 * time.Second
	for len(args) > 0 && args[0] != "" && args[0][0] == '-' {
		switch args[0] {
		case "-timeout":
			if len(args) < 2 {
				ts.Fatalf("usage: httpwait [-timeout duration] pattern url")
			}
			var err error
			timeout, err = time.ParseDuration(args[1])
			ts.Check(err)
			args = args[2:]
		default:
			ts.Fatalf("unknown httpwait flag %q", args[0])
		}
	}
	if len(args) != 2 {
		ts.Fatalf("usage: httpwait [-timeout duration] pattern url")
	}

	pattern, err := regexp.Compile(args[0])
	ts.Check(err)
	url := args[1]
	client := http.Client{Timeout: 500 * time.Millisecond}
	deadline := time.Now().Add(timeout)
	var lastBody string
	var lastErr error
	for {
		response, err := client.Get(url)
		if err == nil {
			body, readErr := io.ReadAll(response.Body)
			closeErr := response.Body.Close()
			ts.Check(readErr)
			ts.Check(closeErr)
			if response.StatusCode == http.StatusOK {
				lastBody = string(body)
				if pattern.Match(body) {
					_, err = ts.Stdout().Write(body)
					ts.Check(err)
					return
				}
			} else {
				lastErr = fmt.Errorf("status = %d; body: %s", response.StatusCode, string(body))
			}
		} else {
			lastErr = err
		}

		if time.Now().After(deadline) {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if lastErr != nil {
		ts.Fatalf("GET %s waiting for %q: %v", url, args[0], lastErr)
	}
	ts.Fatalf("GET %s did not match %q; last body: %s", url, args[0], lastBody)
}

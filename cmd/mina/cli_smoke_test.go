//go:build integration

package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	_ "github.com/duckdb/duckdb-go/v2"
	"github.com/modelcontextprotocol/go-sdk/mcp"
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
			"duckdbclone":    testscriptDuckDBClone,
			"duckdbsnapshot": testscriptDuckDBSnapshot,
			"duckdbexec":     testscriptDuckDBExec,
			"duckdbtables":   testscriptDuckDBTables,
			"duckdbtouch":    testscriptDuckDBTouch,
			"freeport":       testscriptFreePort,
			"frankfurter":    testscriptFrankfurter,
			"httpget":        testscriptHTTPGet,
			"httpwait":       testscriptHTTPWait,
			"mcpcall":        testscriptMCPCall,
			"mcplist":        testscriptMCPList,
			"glob":           testscriptGlob,
		},
	})
}

func testscriptMCPList(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("mcplist does not support negation")
	}
	if len(args) != 2 {
		ts.Fatalf("usage: mcplist transport target")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	session := connectMCPSession(ts, ctx, args[0], args[1])
	defer func() {
		ts.Check(session.Close())
	}()

	var tools []*mcp.Tool
	for tool, err := range session.Tools(ctx, nil) {
		ts.Check(err)
		tools = append(tools, tool)
	}
	sort.Slice(tools, func(i int, j int) bool {
		return tools[i].Name < tools[j].Name
	})
	for _, tool := range tools {
		annotations := tool.Annotations
		if annotations == nil {
			_, err := fmt.Fprintf(
				ts.Stdout(),
				"transport=%s tool=%s read_only=unset destructive=unset idempotent=unset open_world=unset\n",
				args[0],
				tool.Name,
			)
			ts.Check(err)
			continue
		}
		_, err := fmt.Fprintf(
			ts.Stdout(),
			"transport=%s tool=%s read_only=%t destructive=%s idempotent=%t open_world=%s\n",
			args[0],
			tool.Name,
			annotations.ReadOnlyHint,
			optionalBoolFact(annotations.DestructiveHint),
			annotations.IdempotentHint,
			optionalBoolFact(annotations.OpenWorldHint),
		)
		ts.Check(err)
	}
}

func testscriptMCPCall(ts *testscript.TestScript, neg bool, args []string) {
	if len(args) != 4 {
		ts.Fatalf("usage: mcpcall transport target tool-name json-arguments")
	}

	var arguments map[string]any
	decoder := json.NewDecoder(strings.NewReader(args[3]))
	decoder.UseNumber()
	err := decoder.Decode(&arguments)
	ts.Check(err)
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			ts.Fatalf("MCP JSON arguments contain multiple values")
		}
		ts.Check(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	session := connectMCPSession(ts, ctx, args[0], args[1])
	defer func() {
		ts.Check(session.Close())
	}()

	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: args[2], Arguments: arguments})
	if err != nil {
		_, writeErr := fmt.Fprintln(ts.Stderr(), err)
		ts.Check(writeErr)
		if neg {
			return
		}
		ts.Fatalf("call MCP tool %q: %v", args[2], err)
	}
	if result.IsError {
		writeMCPToolError(ts, result)
		if neg {
			return
		}
		ts.Fatalf("MCP tool %q returned an error", args[2])
	}
	if neg {
		ts.Fatalf("MCP tool %q unexpectedly succeeded", args[2])
	}
	encoded, err := json.Marshal(result.StructuredContent)
	ts.Check(err)
	_, err = fmt.Fprintln(ts.Stdout(), string(encoded))
	ts.Check(err)
}

func connectMCPSession(
	ts *testscript.TestScript,
	ctx context.Context,
	transportName string,
	target string,
) *mcp.ClientSession {
	var transport mcp.Transport
	switch transportName {
	case "http":
		transport = &mcp.StreamableClientTransport{Endpoint: target}
	case "stdio":
		command := exec.Command("mina", "mcp", "stdio", "--server", target)
		command.Dir = ts.MkAbs(".")
		command.Stderr = ts.Stderr()
		transport = &mcp.CommandTransport{Command: command}
	default:
		ts.Fatalf("unknown MCP transport %q; want http or stdio", transportName)
	}

	client := mcp.NewClient(&mcp.Implementation{Name: "mina-integration", Version: "test"}, &mcp.ClientOptions{
		Capabilities: &mcp.ClientCapabilities{},
	})
	session, err := client.Connect(ctx, transport, nil)
	ts.Check(err)
	initialized := session.InitializeResult()
	if initialized == nil || initialized.ServerInfo == nil || initialized.ServerInfo.Name != "mina" {
		ts.Fatalf("unexpected MCP initialize result: %+v", initialized)
	}
	return session
}

func optionalBoolFact(value *bool) string {
	if value == nil {
		return "unset"
	}
	return strconv.FormatBool(*value)
}

func writeMCPToolError(ts *testscript.TestScript, result *mcp.CallToolResult) {
	wrote := false
	for _, content := range result.Content {
		if text, ok := content.(*mcp.TextContent); ok {
			_, err := fmt.Fprintln(ts.Stderr(), text.Text)
			ts.Check(err)
			wrote = true
			continue
		}
		encoded, err := json.Marshal(content)
		ts.Check(err)
		_, err = fmt.Fprintln(ts.Stderr(), string(encoded))
		ts.Check(err)
		wrote = true
	}
	if !wrote {
		_, err := fmt.Fprintln(ts.Stderr(), "MCP tool returned an error without content")
		ts.Check(err)
	}
}

func testscriptDuckDBClone(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("duckdbclone does not support negation")
	}
	if len(args) != 2 {
		ts.Fatalf("usage: duckdbclone src-db dst-db")
	}
	if _, err := os.Stat(args[1]); err == nil {
		ts.Fatalf("clone destination %s already exists", args[1])
	} else if !errors.Is(err, os.ErrNotExist) {
		ts.Fatalf("stat clone destination %s: %v", args[1], err)
	}

	db, err := sql.Open("duckdb", "")
	ts.Check(err)
	defer func() {
		ts.Check(db.Close())
	}()

	ctx := context.Background()
	for _, stmt := range []string{
		"ATTACH " + duckDBStringLiteral(args[0]) + " AS src (READ_ONLY)",
		"ATTACH " + duckDBStringLiteral(args[1]) + " AS dst",
		"COPY FROM DATABASE src TO dst",
		"DETACH dst",
		"DETACH src",
	} {
		_, err := db.ExecContext(ctx, stmt)
		ts.Check(err)
	}
}

func duckDBStringLiteral(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func testscriptDuckDBExec(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("duckdbexec does not support negation")
	}
	if len(args) != 2 {
		ts.Fatalf("usage: duckdbexec path sql-file")
	}

	sqlPath := args[1]
	if _, err := os.Stat(ts.MkAbs(sqlPath)); err == nil {
		sqlPath = ts.MkAbs(sqlPath)
	} else if errors.Is(err, os.ErrNotExist) {
		sqlPath = filepath.Join("testdata", "validate", args[1])
	} else {
		ts.Fatalf("stat sql file %s: %v", args[1], err)
	}

	query, err := os.ReadFile(sqlPath)
	ts.Check(err)
	db, err := sql.Open("duckdb", args[0])
	ts.Check(err)
	defer func() {
		ts.Check(db.Close())
	}()

	_, err = db.ExecContext(context.Background(), string(query))
	ts.Check(err)
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
	origin := ""
	location := ""
	var body []byte
	for len(args) > 0 && args[0] != "" && args[0][0] == '-' {
		switch args[0] {
		case "-accept":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-origin origin] [-location location] [-body file] url")
			}
			accept = args[1]
			args = args[2:]
		case "-method":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-origin origin] [-location location] [-body file] url")
			}
			method = args[1]
			args = args[2:]
		case "-status":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-origin origin] [-location location] [-body file] url")
			}
			var err error
			status, err = strconv.Atoi(args[1])
			ts.Check(err)
			args = args[2:]
		case "-origin":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-origin origin] [-location location] [-body file] url")
			}
			origin = args[1]
			args = args[2:]
		case "-location":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-origin origin] [-location location] [-body file] url")
			}
			location = args[1]
			args = args[2:]
		case "-body":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-origin origin] [-location location] [-body file] url")
			}
			body = []byte(ts.ReadFile(args[1]))
			args = args[2:]
		default:
			ts.Fatalf("unknown httpget flag %q", args[0])
		}
	}
	if len(args) != 1 {
		ts.Fatalf("usage: httpget [-accept media-type] [-method method] [-status status] [-origin origin] [-location location] [-body file] url")
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
		if origin != "" {
			request.Header.Set("Origin", origin)
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

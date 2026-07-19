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
	"os/exec"
	"path/filepath"
	"regexp"
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
			"mcphttp":        testscriptMCPHTTP,
			"mcpstdio":       testscriptMCPStdio,
			"glob":           testscriptGlob,
			"waitfile":       testscriptWaitFile,
		},
	})
}

func testscriptMCPHTTP(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("mcphttp does not support negation")
	}
	if len(args) != 1 {
		ts.Fatalf("usage: mcphttp endpoint")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	client := mcp.NewClient(&mcp.Implementation{Name: "mina-integration", Version: "test"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{Endpoint: args[0]}, nil)
	ts.Check(err)
	defer func() {
		ts.Check(session.Close())
	}()
	initialized := session.InitializeResult()
	if initialized == nil || initialized.ServerInfo == nil || initialized.ServerInfo.Name != "mina" {
		ts.Fatalf("unexpected MCP initialize result: %+v", initialized)
	}

	listed, err := session.ListTools(ctx, nil)
	ts.Check(err)
	if listed.NextCursor != "" {
		ts.Fatalf("MCP tool list unexpectedly paginated with cursor %q", listed.NextCursor)
	}
	if len(listed.Tools) != 83 {
		ts.Fatalf("MCP tool count = %d, want 83", len(listed.Tools))
	}

	transactions := callMCPTool(ts, ctx, session, "transactions_list", map[string]any{"limit": 5})
	transactionsBody := successfulMCPBody(ts, transactions, http.StatusOK)
	if len(objectArrayField(ts, transactionsBody, "transactions")) == 0 {
		ts.Fatalf("transactions_list returned no demo transactions")
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, args[0], bytes.NewBufferString(
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"origin-probe","version":"test"}}}`,
	))
	ts.Check(err)
	request.Header.Set("Origin", "https://example.com")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json, text/event-stream")
	response, err := http.DefaultClient.Do(request)
	ts.Check(err)
	responseBody, err := io.ReadAll(response.Body)
	ts.Check(err)
	ts.Check(response.Body.Close())
	if response.StatusCode != http.StatusForbidden {
		ts.Fatalf("non-loopback Origin status = %d, want %d; body: %s", response.StatusCode, http.StatusForbidden, responseBody)
	}

	_, err = fmt.Fprintf(ts.Stdout(), "initialize=ok tools=%d transactions_list=ok origin=forbidden\n", len(listed.Tools))
	ts.Check(err)
}

func testscriptMCPStdio(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("mcpstdio does not support negation")
	}
	if len(args) != 1 {
		ts.Fatalf("usage: mcpstdio server-url")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	command := exec.Command("mina", "mcp", "stdio", "--server", args[0])
	command.Dir = ts.MkAbs(".")
	command.Stderr = ts.Stderr()
	client := mcp.NewClient(&mcp.Implementation{Name: "mina-integration", Version: "test"}, &mcp.ClientOptions{
		Capabilities: &mcp.ClientCapabilities{},
	})
	session, err := client.Connect(ctx, &mcp.CommandTransport{Command: command}, nil)
	ts.Check(err)
	defer func() {
		ts.Check(session.Close())
	}()

	listed, err := session.ListTools(ctx, nil)
	ts.Check(err)
	if listed.NextCursor != "" {
		ts.Fatalf("MCP tool list unexpectedly paginated with cursor %q", listed.NextCursor)
	}
	if len(listed.Tools) != 83 {
		ts.Fatalf("MCP tool count = %d, want 83", len(listed.Tools))
	}
	tools := make(map[string]*mcp.Tool, len(listed.Tools))
	for _, tool := range listed.Tools {
		tools[tool.Name] = tool
	}
	for _, name := range []string{"transactions_list", "accounts_get", "members_create", "accounts_delete"} {
		if tools[name] == nil {
			ts.Fatalf("MCP tool list is missing %q", name)
		}
	}
	assertMCPToolAnnotations(ts, tools["transactions_list"], true, false, true, false)
	assertMCPToolAnnotations(ts, tools["accounts_delete"], false, true, true, false)
	_, err = fmt.Fprintf(ts.Stdout(), "tools=%d annotations=ok\n", len(listed.Tools))
	ts.Check(err)

	transactions := callMCPTool(ts, ctx, session, "transactions_list", map[string]any{"limit": 5})
	transactionsBody := successfulMCPBody(ts, transactions, http.StatusOK)
	transactionItems := objectArrayField(ts, transactionsBody, "transactions")
	if len(transactionItems) == 0 {
		ts.Fatalf("transactions_list returned no demo transactions")
	}
	_, err = fmt.Fprintln(ts.Stdout(), "transactions_list=ok")
	ts.Check(err)

	accounts := callMCPTool(ts, ctx, session, "accounts_list", map[string]any{"limit": 5})
	accountsBody := successfulMCPBody(ts, accounts, http.StatusOK)
	accountItems := objectArrayField(ts, accountsBody, "accounts")
	if len(accountItems) == 0 {
		ts.Fatalf("accounts_list returned no demo accounts")
	}
	accountID := integerField(ts, accountItems[0], "account_id")
	account := callMCPTool(ts, ctx, session, "accounts_get", map[string]any{"account_id": accountID})
	accountBody := successfulMCPBody(ts, account, http.StatusOK)
	if got := integerField(ts, accountBody, "account_id"); got != accountID {
		ts.Fatalf("accounts_get account_id = %d, want %d", got, accountID)
	}
	_, err = fmt.Fprintln(ts.Stdout(), "accounts_get=ok")
	ts.Check(err)

	invalidMember := callMCPTool(ts, ctx, session, "members_create", map[string]any{
		"body": map[string]any{"name": ""},
	})
	if !invalidMember.IsError {
		ts.Fatalf("members_create invalid body did not return a tool error")
	}
	invalidText := textContent(ts, invalidMember)
	if !strings.Contains(invalidText, `"code":"invalid_request"`) || !strings.Contains(invalidText, `"message"`) {
		ts.Fatalf("members_create error does not carry Mina's stable envelope: %s", invalidText)
	}
	_, err = fmt.Fprintln(ts.Stdout(), "members_create_invalid=ok")
	ts.Check(err)

	validMember := callMCPTool(ts, ctx, session, "members_create", map[string]any{
		"body": map[string]any{"name": "MCP Smoke Member"},
	})
	validMemberBody := successfulMCPBody(ts, validMember, http.StatusCreated)
	if integerField(ts, validMemberBody, "member_id") < 1 {
		ts.Fatalf("members_create returned an invalid member_id")
	}
	_, err = fmt.Fprintln(ts.Stdout(), "members_create_valid=ok")
	ts.Check(err)
}

func assertMCPToolAnnotations(
	ts *testscript.TestScript,
	tool *mcp.Tool,
	readOnly bool,
	destructive bool,
	idempotent bool,
	openWorld bool,
) {
	if tool.Annotations == nil || tool.Annotations.DestructiveHint == nil || tool.Annotations.OpenWorldHint == nil {
		ts.Fatalf("MCP tool %q is missing explicit annotations", tool.Name)
	}
	annotations := tool.Annotations
	if annotations.ReadOnlyHint != readOnly || *annotations.DestructiveHint != destructive ||
		annotations.IdempotentHint != idempotent || *annotations.OpenWorldHint != openWorld {
		ts.Fatalf("MCP tool %q annotations = %+v", tool.Name, annotations)
	}
}

func callMCPTool(
	ts *testscript.TestScript,
	ctx context.Context,
	session *mcp.ClientSession,
	name string,
	arguments map[string]any,
) *mcp.CallToolResult {
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: arguments})
	ts.Check(err)
	return result
}

func successfulMCPBody(
	ts *testscript.TestScript,
	result *mcp.CallToolResult,
	wantStatus int,
) map[string]any {
	if result.IsError {
		ts.Fatalf("MCP tool returned an error: %s", textContent(ts, result))
	}
	structured, ok := result.StructuredContent.(map[string]any)
	if !ok {
		ts.Fatalf("MCP structured content has type %T", result.StructuredContent)
	}
	status, ok := structured["status"].(float64)
	if !ok || int(status) != wantStatus {
		ts.Fatalf("MCP structured status = %v, want %d", structured["status"], wantStatus)
	}
	body, ok := structured["body"].(map[string]any)
	if !ok {
		ts.Fatalf("MCP structured body has type %T", structured["body"])
	}
	return body
}

func objectArrayField(ts *testscript.TestScript, object map[string]any, field string) []map[string]any {
	raw, ok := object[field].([]any)
	if !ok {
		ts.Fatalf("MCP body field %q has type %T", field, object[field])
	}
	values := make([]map[string]any, 0, len(raw))
	for index, item := range raw {
		value, ok := item.(map[string]any)
		if !ok {
			ts.Fatalf("MCP body field %q item %d has type %T", field, index, item)
		}
		values = append(values, value)
	}
	return values
}

func integerField(ts *testscript.TestScript, object map[string]any, field string) int64 {
	value, ok := object[field].(float64)
	if !ok || value != float64(int64(value)) {
		ts.Fatalf("MCP body field %q is not an integer: %v", field, object[field])
	}
	return int64(value)
}

func textContent(ts *testscript.TestScript, result *mcp.CallToolResult) string {
	if len(result.Content) != 1 {
		ts.Fatalf("MCP tool content length = %d, want 1", len(result.Content))
	}
	content, ok := result.Content[0].(*mcp.TextContent)
	if !ok {
		ts.Fatalf("MCP tool content has type %T", result.Content[0])
	}
	return content.Text
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
	blockUntilCanceled := ""
	if len(args) >= 1 && args[0] == "-block-until-canceled" {
		if len(args) < 2 {
			ts.Fatalf("usage: frankfurter [-block-until-canceled ready-file] url_env_var")
		}
		blockUntilCanceled = ts.MkAbs(args[1])
		args = args[2:]
	}
	if len(args) != 1 {
		ts.Fatalf("usage: frankfurter [-block-until-canceled ready-file] url_env_var")
	}

	urlEnvVar := args[0]
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rates" {
			http.NotFound(w, r)
			return
		}
		if blockUntilCanceled != "" {
			if err := os.WriteFile(blockUntilCanceled, nil, 0o644); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			<-r.Context().Done()
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

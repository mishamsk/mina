//go:build integration

package main

import (
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/rogpeppe/go-internal/testscript"
)

func TestMain(m *testing.M) {
	testscript.Main(m, map[string]func(){
		"mina": func() {
			os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
		},
	})
}

func TestIntegrationScripts(t *testing.T) {
	testscript.Run(t, testscript.Params{
		Dir:                 "testdata/script",
		RequireExplicitExec: true,
		Cmds: map[string]func(ts *testscript.TestScript, neg bool, args []string){
			"freeport": testscriptFreePort,
			"httpget":  testscriptHTTPGet,
		},
	})
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

func testscriptHTTPGet(ts *testscript.TestScript, neg bool, args []string) {
	if neg {
		ts.Fatalf("httpget does not support negation")
	}

	method := http.MethodGet
	status := http.StatusOK
	for len(args) > 0 && args[0] != "" && args[0][0] == '-' {
		switch args[0] {
		case "-method":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-method method] [-status status] url")
			}
			method = args[1]
			args = args[2:]
		case "-status":
			if len(args) < 2 {
				ts.Fatalf("usage: httpget [-method method] [-status status] url")
			}
			var err error
			status, err = strconv.Atoi(args[1])
			ts.Check(err)
			args = args[2:]
		default:
			ts.Fatalf("unknown httpget flag %q", args[0])
		}
	}
	if len(args) != 1 {
		ts.Fatalf("usage: httpget [-method method] [-status status] url")
	}

	url := args[0]
	client := http.Client{Timeout: 500 * time.Millisecond}
	deadline := time.Now().Add(5 * time.Second)
	var lastErr error
	for {
		request, err := http.NewRequest(method, url, nil)
		ts.Check(err)

		response, err := client.Do(request)
		if err == nil {
			body, readErr := io.ReadAll(response.Body)
			closeErr := response.Body.Close()
			ts.Check(readErr)
			ts.Check(closeErr)
			if response.StatusCode != status {
				ts.Fatalf("%s %s status = %d, want %d; body: %s", method, url, response.StatusCode, status, string(body))
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

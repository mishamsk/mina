package apptest

import (
	"context"
	"net/http"
	"runtime"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/httpclient"
)

const hangWatchdogDuration = 30 * time.Second

func awaitCondition[T any](t testing.TB, label string, check func(context.Context) (T, bool)) T {
	t.Helper()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan T, 1)
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}
			value, ready := check(ctx)
			if ready {
				result <- value
				return
			}
			runtime.Gosched()
		}
	}()
	return awaitWatchdog(t, result, label)
}

// AwaitValue receives the next value or fails if the test harness appears hung.
func AwaitValue[T any](t testing.TB, values <-chan T, label string) T {
	t.Helper()
	return awaitWatchdog(t, values, label)
}

func awaitWatchdog[T any](t testing.TB, values <-chan T, label string) T {
	t.Helper()

	watchdog := time.NewTimer(hangWatchdogDuration)
	defer watchdog.Stop()
	select {
	case value := <-values:
		return value
	case <-watchdog.C:
		t.Fatalf("hung waiting for %s", label)
		var zero T
		return zero
	}
}

// AwaitSignal waits for a synchronization signal or fails if the test harness appears hung.
func AwaitSignal(t testing.TB, signal <-chan struct{}, label string) {
	t.Helper()
	AwaitValue(t, signal, label)
}

// RunConcurrentRequests releases requests together after each reaches its HTTP boundary and returns results in request order.
func RunConcurrentRequests[T any](t testing.TB, requests ...func(httpclient.RequestEditorFn) T) []T {
	t.Helper()

	ready := make(chan struct{}, len(requests))
	release := make(chan struct{})
	type indexedResult struct {
		index  int
		result T
	}
	results := make(chan indexedResult, len(requests))
	editor := func(ctx context.Context, _ *http.Request) error {
		ready <- struct{}{}
		select {
		case <-release:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	for index, request := range requests {
		go func() {
			results <- indexedResult{index: index, result: request(editor)}
		}()
	}
	for range requests {
		AwaitSignal(t, ready, "concurrent request readiness")
	}
	close(release)

	got := make([]T, len(requests))
	for range requests {
		result := AwaitValue(t, results, "concurrent request result")
		got[result.index] = result.result
	}
	return got
}

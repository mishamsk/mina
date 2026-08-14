package apptest

import (
	"context"
	"runtime"
	"testing"
	"time"
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

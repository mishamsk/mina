package background

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/robfig/cron/v3"

	"github.com/mishamsk/mina/internal/services/operationruns"
)

const (
	defaultOperationTimeout = 2 * time.Minute
	maxRecurringSleep       = time.Second
)

var errAlreadyRunning = errors.New("background operation already running")

// ErrorKind classifies an operation outcome.
type ErrorKind string

const (
	ErrorKindTransient   ErrorKind = "transient"
	ErrorKindPermanent   ErrorKind = "permanent"
	ErrorKindCanceled    ErrorKind = "canceled"
	ErrorKindAlreadyDone ErrorKind = "already_done"
)

// OperationError is a classified operation error.
type OperationError struct {
	Kind ErrorKind
	Err  error
}

// Error returns the underlying operation error message.
func (e OperationError) Error() string {
	if e.Err == nil {
		return string(e.Kind)
	}

	return e.Err.Error()
}

// Unwrap returns the underlying operation error.
func (e OperationError) Unwrap() error {
	return e.Err
}

// Transient marks err as retryable by the background runner.
func Transient(err error) error {
	return OperationError{Kind: ErrorKindTransient, Err: err}
}

// Permanent marks err as non-retryable by the background runner.
func Permanent(err error) error {
	return OperationError{Kind: ErrorKindPermanent, Err: err}
}

// Canceled marks err as a canceled operation outcome.
func Canceled(err error) error {
	return OperationError{Kind: ErrorKindCanceled, Err: err}
}

// AlreadyDone marks an operation outcome as successful without more work.
func AlreadyDone(err error) error {
	return OperationError{Kind: ErrorKindAlreadyDone, Err: err}
}

// OperationFunc is one operation invocation body.
type OperationFunc func(context.Context) error

// Clock returns the current process time.
type Clock interface {
	Now() time.Time
}

// Operation describes one registered background workflow.
type Operation struct {
	ID         operationruns.OperationID
	Key        string
	Run        OperationFunc
	StartupRun OperationFunc
	Startup    bool
	Schedule   string
	Timeout    time.Duration
	MaxRetries uint
}

// Runner executes registered background operations.
type Runner struct {
	runs     *operationruns.Service
	clock    Clock
	errorLog io.Writer

	mu         sync.Mutex
	operations map[operationruns.OperationID]registeredOperation
	running    map[string]int
	ctx        context.Context
	cancel     context.CancelFunc
	wg         sync.WaitGroup
}

type registeredOperation struct {
	Operation
	schedule cron.Schedule
}

func (op registeredOperation) withStartupRun() registeredOperation {
	if op.StartupRun == nil {
		return op
	}
	op.Run = op.StartupRun

	return op
}

// NewRunner creates a background operation runner.
func NewRunner(runs *operationruns.Service, clock Clock, errorLog io.Writer) *Runner {
	ctx, cancel := context.WithCancel(context.Background())
	return &Runner{
		runs:       runs,
		clock:      clock,
		errorLog:   errorLog,
		operations: make(map[operationruns.OperationID]registeredOperation),
		running:    make(map[string]int),
		ctx:        ctx,
		cancel:     cancel,
	}
}

// Register adds one background operation.
func (r *Runner) Register(op Operation) error {
	if op.ID == "" {
		return fmt.Errorf("operation id is required")
	}
	if op.Key == "" {
		op.Key = string(op.ID)
	}
	if op.Run == nil {
		return fmt.Errorf("operation %s run function is required", op.ID)
	}
	if op.Timeout <= 0 {
		op.Timeout = defaultOperationTimeout
	}
	var parsed cron.Schedule
	var err error
	if op.Schedule != "" {
		parsed, err = parseSchedule(op.Schedule)
		if err != nil {
			return err
		}
	}

	r.operations[op.ID] = registeredOperation{
		Operation: op,
		schedule:  parsed,
	}

	return nil
}

// ValidateSchedule checks a five-field UTC cron schedule.
func ValidateSchedule(schedule string) error {
	_, err := parseSchedule(schedule)
	return err
}

func parseSchedule(schedule string) (cron.Schedule, error) {
	parsed, err := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow).Parse(schedule)
	if err != nil {
		return nil, fmt.Errorf("cron schedule must have five fields")
	}

	return parsed, nil
}

// Start starts registered startup and recurring operation loops.
func (r *Runner) Start() {
	for _, op := range r.operations {
		if op.Startup {
			r.wg.Add(1)
			go func() {
				defer r.wg.Done()
				_, _ = r.run(r.ctx, op.withStartupRun())
			}()
		}
		if op.schedule != nil {
			r.wg.Add(1)
			go func() {
				defer r.wg.Done()
				r.runRecurring(r.ctx, op)
			}()
		}
	}
}

// Close stops recurring loops and waits for runner-owned goroutines.
func (r *Runner) Close() {
	if r.cancel != nil {
		r.cancel()
	}
	r.wg.Wait()
}

// Trigger starts one registered operation asynchronously and returns an already recorded run.
func (r *Runner) Trigger(ctx context.Context, operationID operationruns.OperationID) (operationruns.OperationRun, error) {
	if err := ctx.Err(); err != nil {
		return operationruns.OperationRun{}, err
	}
	if err := r.ctx.Err(); err != nil {
		return operationruns.OperationRun{}, err
	}
	op, ok := r.operations[operationID]
	if !ok {
		return operationruns.OperationRun{}, fmt.Errorf("unknown background operation %s", operationID)
	}
	run, err := r.start(ctx, op)
	if err != nil {
		return operationruns.OperationRun{}, err
	}
	if run.Status == operationruns.RunStatusRunning {
		r.wg.Add(1)
		go func() {
			defer r.wg.Done()
			_, _ = r.finish(r.ctx, op, run)
		}()
	}

	return run, nil
}

func (r *Runner) runRecurring(ctx context.Context, op registeredOperation) {
	next := op.schedule.Next(r.clock.Now().UTC())
	if next.IsZero() {
		r.log("%s schedule has no next matching time\n", op.ID)
		return
	}
	for {
		if err := ctx.Err(); err != nil {
			return
		}
		now := r.clock.Now().UTC()
		if !now.Before(next) {
			_, _ = r.run(ctx, op)
			next = op.schedule.Next(now)
			if next.IsZero() {
				r.log("%s schedule has no next matching time\n", op.ID)
				return
			}
			continue
		}
		if !r.waitUntil(ctx, next) {
			return
		}
	}
}

func (r *Runner) waitUntil(ctx context.Context, next time.Time) bool {
	duration := next.Sub(r.clock.Now().UTC())
	if duration <= 0 {
		return true
	}
	if duration > maxRecurringSleep {
		duration = maxRecurringSleep
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func (r *Runner) run(ctx context.Context, op registeredOperation) (operationruns.OperationRun, error) {
	started, err := r.start(ctx, op)
	if err != nil {
		return operationruns.OperationRun{}, err
	}
	if started.Status != operationruns.RunStatusRunning {
		return started, nil
	}

	return r.finish(ctx, op, started)
}

func (r *Runner) start(ctx context.Context, op registeredOperation) (operationruns.OperationRun, error) {
	if !r.reserve(op.Key) {
		return r.runs.RecordRunSkip(ctx, op.ID, errAlreadyRunning)
	}
	started, err := r.runs.RecordRunStart(ctx, op.ID)
	if err != nil {
		r.release(op.Key)
		return operationruns.OperationRun{}, err
	}

	return started, nil
}

func (r *Runner) finish(
	ctx context.Context,
	op registeredOperation,
	started operationruns.OperationRun,
) (operationruns.OperationRun, error) {
	defer r.release(op.Key)

	runCtx, cancel := context.WithTimeout(ctx, op.Timeout)
	defer cancel()
	err := r.invokeWithRetry(runCtx, op)
	finishCtx := context.WithoutCancel(ctx)
	if err == nil || operationErrorKind(err) == ErrorKindAlreadyDone {
		return r.runs.RecordRunSuccess(finishCtx, started)
	}
	if operationErrorKind(err) == ErrorKindCanceled ||
		errors.Is(err, context.Canceled) ||
		errors.Is(err, context.DeadlineExceeded) {
		return r.runs.RecordRunCancel(finishCtx, started, err)
	}

	run, finishErr := r.runs.RecordRunFailure(finishCtx, started, err)
	if finishErr != nil {
		return operationruns.OperationRun{}, finishErr
	}
	r.log("%s operation failed: %s\n", op.ID, err.Error())

	return run, nil
}

func (r *Runner) invokeWithRetry(ctx context.Context, op registeredOperation) error {
	maxTries := op.MaxRetries + 1
	for attempt := uint(0); ; attempt++ {
		err := invokeOperation(ctx, op.Run)
		if err == nil || operationErrorKind(err) != ErrorKindTransient || attempt+1 >= maxTries {
			return err
		}
		timer := time.NewTimer(10 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func operationErrorKind(err error) ErrorKind {
	var operationErr OperationError
	if errors.As(err, &operationErr) {
		return operationErr.Kind
	}

	return ErrorKindPermanent
}

func invokeOperation(ctx context.Context, fn OperationFunc) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("operation panic: %v", recovered)
		}
	}()

	return fn(ctx)
}

func (r *Runner) reserve(key string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.running[key] > 0 {
		return false
	}
	r.running[key]++

	return true
}

func (r *Runner) release(key string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.running[key] > 0 {
		r.running[key]--
	}
}

func (r *Runner) log(format string, args ...any) {
	if r.errorLog == nil {
		return
	}
	_, _ = fmt.Fprintf(r.errorLog, format, args...)
}

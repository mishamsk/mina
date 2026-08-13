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

// Invocation describes one operation body and its total timeout across retries.
type Invocation struct {
	Run     OperationFunc
	Timeout time.Duration
}

// Clock returns process time and provides cancelable deadline waits.
type Clock interface {
	Now() time.Time
	WaitUntil(context.Context, time.Time) bool
}

// Operation describes one registered background workflow.
type Operation struct {
	ID                operationruns.OperationID
	Key               string
	Invocation        Invocation
	StartupInvocation *Invocation
	Startup           bool
	Schedule          string
	MaxRetries        uint
}

// Runner executes registered background operations and owns unrecorded tasks.
type Runner struct {
	runs     *operationruns.Service
	clock    Clock
	errorLog io.Writer

	mu         sync.Mutex
	operations map[operationruns.OperationID]registeredOperation
	running    map[string]int
	closed     bool
	ctx        context.Context
	cancel     context.CancelFunc
	wg         sync.WaitGroup
}

type registeredOperation struct {
	Operation
	schedule cron.Schedule
}

func (op registeredOperation) withStartupInvocation() registeredOperation {
	if op.StartupInvocation != nil {
		op.Invocation = *op.StartupInvocation
	}

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
	if op.Invocation.Run == nil {
		return fmt.Errorf("operation %s run function is required", op.ID)
	}
	if op.Invocation.Timeout <= 0 {
		op.Invocation.Timeout = defaultOperationTimeout
	}
	if op.StartupInvocation != nil {
		if op.StartupInvocation.Run == nil {
			return fmt.Errorf("operation %s startup run function is required", op.ID)
		}
		startup := *op.StartupInvocation
		if startup.Timeout <= 0 {
			startup.Timeout = op.Invocation.Timeout
		}
		op.StartupInvocation = &startup
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
			r.Submit(string(op.ID), func(ctx context.Context) error {
				_, err := r.run(ctx, op.withStartupInvocation(), operationruns.RunTriggerStartup)
				return err
			})
		}
		if op.schedule != nil {
			r.Submit(string(op.ID)+" schedule", func(ctx context.Context) error {
				r.runRecurring(ctx, op)
				return nil
			})
		}
	}
}

// Submit sends named work to the runner without adding operation policy.
// It returns whether the work was accepted.
func (r *Runner) Submit(name string, run func(context.Context) error) bool {
	if name == "" || run == nil {
		return false
	}
	ctx, done, accepted := r.admit()
	if !accepted {
		return false
	}
	r.launch(name, ctx, done, run)

	return true
}

// Close stops operations and tasks and waits for runner-owned goroutines.
func (r *Runner) Close() {
	r.mu.Lock()
	if !r.closed {
		r.closed = true
		if r.cancel != nil {
			r.cancel()
		}
	}
	r.mu.Unlock()
	r.wg.Wait()
}

// Trigger starts one registered operation asynchronously and returns an already recorded run envelope.
func (r *Runner) Trigger(ctx context.Context, operationID operationruns.OperationID) (operationruns.RunEnvelope, error) {
	if err := ctx.Err(); err != nil {
		return operationruns.RunEnvelope{}, err
	}
	op, ok := r.operations[operationID]
	if !ok {
		return operationruns.RunEnvelope{}, fmt.Errorf("unknown background operation %s", operationID)
	}
	run, err := r.start(ctx, op, operationruns.RunTriggerManual)
	if err != nil {
		return operationruns.RunEnvelope{}, err
	}
	if run.Status == operationruns.RunStatusRunning {
		accepted := r.Submit(string(op.ID), func(ctx context.Context) error {
			_, err := r.finish(ctx, op, run)
			return err
		})
		if !accepted {
			r.release(op.Key)
			return operationruns.RunEnvelope{}, context.Canceled
		}
	}

	return run, nil
}

func (r *Runner) admit() (context.Context, func(), bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.closed || r.ctx.Err() != nil {
		return nil, nil, false
	}
	r.wg.Add(1)

	return r.ctx, r.wg.Done, true
}

func (r *Runner) launch(name string, ctx context.Context, done func(), run func(context.Context) error) {
	go func() {
		defer done()
		if err := runSafely(ctx, run); err != nil {
			if ctx.Err() == nil {
				r.log("%s background work failed: %s\n", name, err)
			}
		}
	}()
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
			if _, err := r.run(ctx, op, operationruns.RunTriggerScheduled); err != nil {
				if ctx.Err() == nil {
					r.log("%s scheduled run failed: %s\n", op.ID, err)
				}
			}
			next = op.schedule.Next(now)
			if next.IsZero() {
				r.log("%s schedule has no next matching time\n", op.ID)
				return
			}
			continue
		}
		if !r.clock.WaitUntil(ctx, next) {
			return
		}
	}
}

func (r *Runner) run(ctx context.Context, op registeredOperation, trigger operationruns.RunTrigger) (operationruns.RunEnvelope, error) {
	started, err := r.start(ctx, op, trigger)
	if err != nil {
		return operationruns.RunEnvelope{}, err
	}
	if started.Status != operationruns.RunStatusRunning {
		return started, nil
	}

	return r.finish(ctx, op, started)
}

func (r *Runner) start(ctx context.Context, op registeredOperation, trigger operationruns.RunTrigger) (operationruns.RunEnvelope, error) {
	if !r.reserve(op.Key) {
		return r.runs.RecordRunSkip(ctx, op.ID, trigger, errAlreadyRunning)
	}
	started, err := r.runs.RecordRunStart(ctx, op.ID, trigger)
	if err != nil {
		r.release(op.Key)
		return operationruns.RunEnvelope{}, err
	}

	return started, nil
}

func (r *Runner) finish(
	ctx context.Context,
	op registeredOperation,
	started operationruns.RunEnvelope,
) (operationruns.RunEnvelope, error) {
	defer r.release(op.Key)

	runCtx, cancel := context.WithTimeout(ctx, op.Invocation.Timeout)
	defer cancel()
	err := r.invokeWithRetry(runCtx, op)
	if ctxErr := ctx.Err(); ctxErr != nil {
		return operationruns.RunEnvelope{}, ctxErr
	}
	if err == nil || operationErrorKind(err) == ErrorKindAlreadyDone {
		return r.runs.RecordRunSuccess(ctx, started)
	}
	if operationErrorKind(err) == ErrorKindCanceled ||
		errors.Is(err, context.Canceled) ||
		errors.Is(err, context.DeadlineExceeded) {
		return r.runs.RecordRunCancel(ctx, started, err)
	}

	run, finishErr := r.runs.RecordRunFailure(ctx, started, err)
	if finishErr != nil {
		return operationruns.RunEnvelope{}, finishErr
	}
	r.log("%s operation failed: %s\n", op.ID, err.Error())

	return run, nil
}

func (r *Runner) invokeWithRetry(ctx context.Context, op registeredOperation) error {
	maxTries := op.MaxRetries + 1
	for attempt := uint(0); ; attempt++ {
		err := runSafely(ctx, op.Invocation.Run)
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

func runSafely(ctx context.Context, run OperationFunc) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("panic: %v", recovered)
		}
	}()

	return run(ctx)
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

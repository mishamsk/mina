package frankfurter

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	loading "github.com/mishamsk/mina/internal/services/exchangerateloading"
	"github.com/mishamsk/mina/internal/services/values"
)

const (
	baseCurrency          = "USD"
	cryptoPrefix          = "C::"
	DefaultHistoryYears   = 10
	DefaultCacheFileName  = "frankfurter-usd-rates.ndjson"
	defaultRequestTimeout = 10 * time.Second
	defaultCacheTimeout   = 90 * time.Second
	ndjsonContentType     = "application/x-ndjson"
	cacheIOBufferSize     = 64 * 1024
	maxCacheLineBytes     = 4 * 1024 * 1024
)

// Clock returns the current process time.
type Clock interface {
	Now() time.Time
}

// Options controls Frankfurter API providers.
type Options struct {
	BaseURL    string
	HTTPClient *http.Client
	Clock      Clock
}

// FileOptions controls the Frankfurter NDJSON file provider.
type FileOptions struct {
	Path string
}

// CacheOptions controls one Frankfurter NDJSON cache population attempt.
type CacheOptions struct {
	BaseURL    string
	Path       string
	From       values.CivilDate
	To         values.CivilDate
	HTTPClient *http.Client
}

// TargetedProvider loads requested Frankfurter rates from the API.
type TargetedProvider struct {
	baseURL    string
	httpClient *http.Client
	clock      Clock
}

// NewTargetedProvider creates a Frankfurter targeted API provider.
func NewTargetedProvider(opts Options) *TargetedProvider {
	return &TargetedProvider{
		baseURL:    strings.TrimRight(opts.BaseURL, "/"),
		httpClient: httpClient(opts.HTTPClient),
		clock:      opts.Clock,
	}
}

// SettledThroughDate returns the current provider query end date.
func (p *TargetedProvider) SettledThroughDate(_ context.Context, _ string) (values.CivilDate, bool, error) {
	return values.CivilDateFromTime(p.now().UTC()), true, nil
}

// Rates fetches daily USD fiat rates from Frankfurter.
func (p *TargetedProvider) Rates(
	ctx context.Context,
	currency string,
	start values.CivilDate,
	end values.CivilDate,
) ([]loading.ProviderRate, error) {
	if strings.HasPrefix(currency, cryptoPrefix) {
		return nil, fmt.Errorf("%w: %s", loading.ErrUnsupportedPair, currency)
	}
	endpoint, err := ratesURL(p.baseURL, start, end, currency)
	if err != nil {
		return nil, err
	}

	var rows []rateRow
	if err := getJSON(ctx, p.httpClient, endpoint, &rows); err != nil {
		return nil, err
	}

	return providerRates(rows, currency)
}

func (p *TargetedProvider) now() time.Time {
	if p.clock == nil {
		return time.Now()
	}

	return p.clock.Now()
}

// FileProvider loads requested Frankfurter rates from an NDJSON cache file.
type FileProvider struct {
	path string
}

// NewFileProvider creates a Frankfurter NDJSON file provider.
func NewFileProvider(opts FileOptions) *FileProvider {
	return &FileProvider{path: opts.Path}
}

// SettledThroughDate returns the final row date in the cache.
func (p *FileProvider) SettledThroughDate(ctx context.Context, _ string) (values.CivilDate, bool, error) {
	if p.path == "" {
		return values.CivilDate{}, false, loading.ErrInvalidProviderConfig
	}
	file, err := os.Open(p.path)
	if err != nil {
		return values.CivilDate{}, false, fmt.Errorf("%w: open Frankfurter cache: %v", loading.ErrProviderUnavailable, err)
	}
	defer func() {
		_ = file.Close()
	}()
	tail, err := inspectCacheTail(ctx, file)
	if err != nil {
		return values.CivilDate{}, false, err
	}
	if tail.latest.Time().IsZero() {
		return values.CivilDate{}, false, nil
	}

	return tail.latest, true, nil
}

// Rates loads daily USD fiat rates from the NDJSON cache file.
func (p *FileProvider) Rates(
	ctx context.Context,
	currency string,
	start values.CivilDate,
	end values.CivilDate,
) ([]loading.ProviderRate, error) {
	rows := []rateRow{}
	err := p.scan(ctx, func(row rateRow) error {
		if row.Base != baseCurrency || row.Quote != currency {
			return nil
		}
		date, err := values.ParseCivilDate(row.Date)
		if err != nil {
			return fmt.Errorf("%w: parse Frankfurter cache date: %v", loading.ErrMalformedProviderResponse, err)
		}
		if date.Time().Before(start.Time()) || date.Time().After(end.Time()) {
			return nil
		}
		rows = append(rows, row)

		return nil
	})
	if err != nil {
		return nil, err
	}

	return providerRates(rows, currency)
}

func (p *FileProvider) scan(ctx context.Context, fn func(rateRow) error) error {
	if p.path == "" {
		return loading.ErrInvalidProviderConfig
	}
	file, err := os.Open(p.path)
	if err != nil {
		return fmt.Errorf("%w: open Frankfurter cache: %v", loading.ErrProviderUnavailable, err)
	}
	defer func() {
		_ = file.Close()
	}()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, cacheIOBufferSize), maxCacheLineBytes)
	for scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return err
		}
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var row rateRow
		if err := decodeJSON(line, &row); err != nil {
			return fmt.Errorf("%w: decode Frankfurter cache row: %v", loading.ErrMalformedProviderResponse, err)
		}
		if err := fn(row); err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("%w: read Frankfurter cache: %v", loading.ErrProviderUnavailable, err)
	}

	return nil
}

// CachePath returns the Frankfurter cache file path under Mina's app cache directory.
func CachePath(cacheDir string) (string, error) {
	if cacheDir == "" {
		return "", fmt.Errorf("%w: Frankfurter cache directory is required", loading.ErrInvalidProviderConfig)
	}

	return filepath.Join(cacheDir, DefaultCacheFileName), nil
}

// DefaultHistoryWindow returns the default Frankfurter cache history window.
func DefaultHistoryWindow(clock Clock) (values.CivilDate, values.CivilDate) {
	now := time.Now()
	if clock != nil {
		now = clock.Now()
	}
	to := values.CivilDateFromTime(now.UTC())

	return values.CivilDateFromTime(to.Time().AddDate(-DefaultHistoryYears, 0, 0)), to
}

// PopulateCache performs one bounded Frankfurter NDJSON cache population attempt.
func PopulateCache(ctx context.Context, opts CacheOptions) error {
	if opts.Path == "" {
		return loading.ErrInvalidProviderConfig
	}
	plan, err := planCachePopulation(ctx, opts)
	if err != nil {
		return err
	}
	defer plan.cleanup()
	if plan.noop {
		return nil
	}

	result, err := fetchCacheRowsToTemp(ctx, opts, plan.fetchFrom, plan.tempPath)
	if err != nil {
		var readErr cacheReadError
		if !errors.As(err, &readErr) {
			return err
		}
		if !result.hasRows {
			return err
		}
		if installErr := installFetchedCache(opts.Path, plan, result); installErr != nil {
			return fmt.Errorf("%w; install partial Frankfurter cache: %v", err, installErr)
		}

		return err
	}
	if plan.replaceExisting && !result.hasRows {
		return nil
	}
	if err := installFetchedCache(opts.Path, plan, result); err != nil {
		return err
	}

	return nil
}

type cachePopulationPlan struct {
	fetchFrom       values.CivilDate
	replaceExisting bool
	noop            bool
	tempPath        string
}

func (p cachePopulationPlan) cleanup() {
	if p.tempPath != "" {
		_ = os.Remove(p.tempPath)
	}
}

func planCachePopulation(ctx context.Context, opts CacheOptions) (cachePopulationPlan, error) {
	if err := os.MkdirAll(filepath.Dir(opts.Path), 0o755); err != nil {
		return cachePopulationPlan{}, fmt.Errorf("%w: create Frankfurter cache directory: %v", loading.ErrProviderUnavailable, err)
	}
	file, err := os.Open(opts.Path)
	if errors.Is(err, os.ErrNotExist) {
		tmpPath, tmpErr := createCacheTemp(opts.Path)
		if tmpErr != nil {
			return cachePopulationPlan{}, tmpErr
		}

		return cachePopulationPlan{fetchFrom: opts.From, tempPath: tmpPath}, nil
	}
	if err != nil {
		return cachePopulationPlan{}, fmt.Errorf("%w: open Frankfurter cache: %v", loading.ErrProviderUnavailable, err)
	}
	defer func() {
		_ = file.Close()
	}()
	tail, err := inspectCacheTail(ctx, file)
	if err != nil {
		return cachePopulationPlan{}, err
	}
	if tail.latest.Time().IsZero() {
		tmpPath, tmpErr := seedCacheTemp(opts.Path, file, 0)
		if tmpErr != nil {
			return cachePopulationPlan{}, tmpErr
		}

		return cachePopulationPlan{fetchFrom: opts.From, replaceExisting: true, tempPath: tmpPath}, nil
	}
	if !tail.latest.Time().Before(opts.To.Time()) {
		return cachePopulationPlan{noop: true}, nil
	}

	tmpPath, err := seedCacheTemp(opts.Path, file, tail.latestBlockStart)
	if err != nil {
		return cachePopulationPlan{}, err
	}

	return cachePopulationPlan{
		fetchFrom:       tail.latest,
		replaceExisting: true,
		tempPath:        tmpPath,
	}, nil
}

func createCacheTemp(path string) (string, error) {
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return "", fmt.Errorf("%w: create Frankfurter cache temp file: %v", loading.ErrProviderUnavailable, err)
	}
	tmpPath := tmp.Name()
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("%w: close Frankfurter cache temp file: %v", loading.ErrProviderUnavailable, err)
	}

	return tmpPath, nil
}

func seedCacheTemp(path string, source *os.File, retainBytes int64) (string, error) {
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return "", fmt.Errorf("%w: create Frankfurter cache temp file: %v", loading.ErrProviderUnavailable, err)
	}
	tmpPath := tmp.Name()
	if retainBytes > 0 {
		if _, err := source.Seek(0, io.SeekStart); err != nil {
			_ = tmp.Close()
			_ = os.Remove(tmpPath)
			return "", fmt.Errorf("%w: seek Frankfurter cache: %v", loading.ErrProviderUnavailable, err)
		}
		if _, err := io.CopyN(tmp, source, retainBytes); err != nil {
			_ = tmp.Close()
			_ = os.Remove(tmpPath)
			return "", fmt.Errorf("%w: copy Frankfurter cache prefix: %v", loading.ErrProviderUnavailable, err)
		}
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("%w: close Frankfurter cache temp file: %v", loading.ErrProviderUnavailable, err)
	}

	return tmpPath, nil
}

type cacheFetchResult struct {
	latest  values.CivilDate
	hasRows bool
}

func fetchCacheRowsToTemp(ctx context.Context, opts CacheOptions, from values.CivilDate, tempPath string) (cacheFetchResult, error) {
	endpoint, err := ratesURL(strings.TrimRight(opts.BaseURL, "/"), from, opts.To, "")
	if err != nil {
		return cacheFetchResult{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return cacheFetchResult{}, fmt.Errorf("%w: build Frankfurter cache request: %v", loading.ErrInvalidProviderConfig, err)
	}
	request.Header.Set("Accept", ndjsonContentType)
	response, err := cacheHTTPClient(opts.HTTPClient).Do(request)
	if err != nil {
		return cacheFetchResult{}, mapRequestError("send Frankfurter cache request", err)
	}
	defer func() {
		_ = response.Body.Close()
	}()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return cacheFetchResult{}, mapStatusError(response.StatusCode)
	}

	tmp, err := os.OpenFile(tempPath, os.O_WRONLY|os.O_APPEND, 0)
	if err != nil {
		return cacheFetchResult{}, fmt.Errorf("%w: open Frankfurter cache temp file: %v", loading.ErrProviderUnavailable, err)
	}
	closed := false
	closeTemp := func(sync bool) error {
		if closed {
			return nil
		}
		closed = true
		if sync {
			if err := tmp.Sync(); err != nil {
				_ = tmp.Close()
				return fmt.Errorf("%w: sync Frankfurter cache temp file: %v", loading.ErrProviderUnavailable, err)
			}
		}
		if err := tmp.Close(); err != nil {
			return fmt.Errorf("%w: close Frankfurter cache temp file: %v", loading.ErrProviderUnavailable, err)
		}

		return nil
	}
	defer func() {
		_ = closeTemp(false)
	}()

	encoder := json.NewEncoder(tmp)
	result := cacheFetchResult{}
	pending := []rateRow{}
	var pendingDate values.CivilDate
	flushPending := func() error {
		if len(pending) == 0 {
			return nil
		}
		for _, row := range pending {
			if err := encoder.Encode(row); err != nil {
				return fmt.Errorf("%w: write Frankfurter cache temp file: %v", loading.ErrProviderUnavailable, err)
			}
		}
		result.latest = pendingDate
		result.hasRows = true
		pending = pending[:0]

		return nil
	}

	reader := bufio.NewReaderSize(response.Body, cacheIOBufferSize)
	for {
		if err := ctx.Err(); err != nil {
			if closeErr := closeTemp(true); closeErr != nil {
				return result, fmt.Errorf("%w; finalize partial Frankfurter cache: %v",
					cacheReadError{err: mapProviderIOError("read Frankfurter cache response", err)}, closeErr)
			}

			return result, cacheReadError{err: mapProviderIOError("read Frankfurter cache response", err)}
		}
		line, err := reader.ReadBytes('\n')
		if err != nil && !errors.Is(err, io.EOF) {
			if closeErr := closeTemp(true); closeErr != nil {
				return result, fmt.Errorf("%w; finalize partial Frankfurter cache: %v",
					cacheReadError{err: mapProviderIOError("read Frankfurter cache response", err)}, closeErr)
			}

			return result, cacheReadError{err: mapProviderIOError("read Frankfurter cache response", err)}
		}
		if len(line) > 0 {
			row, rowErr := decodeRateRowLine(line)
			if rowErr != nil {
				return cacheFetchResult{}, rowErr
			}
			if row.Date != "" {
				date, dateErr := values.ParseCivilDate(row.Date)
				if dateErr != nil {
					return cacheFetchResult{}, fmt.Errorf("%w: parse Frankfurter cache date: %v", loading.ErrMalformedProviderResponse, dateErr)
				}
				if pendingDate.Time().IsZero() {
					pendingDate = date
				}
				if date.Time().After(pendingDate.Time()) {
					if err := flushPending(); err != nil {
						return cacheFetchResult{}, err
					}
					pendingDate = date
				} else if date.Time().Before(pendingDate.Time()) {
					return cacheFetchResult{}, fmt.Errorf("%w: Frankfurter cache rows are not ordered by date", loading.ErrMalformedProviderResponse)
				}
				pending = append(pending, row)
			}
		}
		if err == nil {
			continue
		}
		if err := flushPending(); err != nil {
			return cacheFetchResult{}, err
		}
		if err := closeTemp(true); err != nil {
			return cacheFetchResult{}, err
		}

		return result, nil
	}
}

type cacheReadError struct {
	err error
}

func (e cacheReadError) Error() string {
	return e.err.Error()
}

func (e cacheReadError) Unwrap() error {
	return e.err
}

func decodeRateRowLine(line []byte) (rateRow, error) {
	line = bytes.TrimRight(line, "\r\n")
	if len(line) == 0 {
		return rateRow{}, nil
	}
	var row rateRow
	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.UseNumber()
	if err := decoder.Decode(&row); err != nil {
		return rateRow{}, fmt.Errorf("%w: decode Frankfurter cache row: %v", loading.ErrMalformedProviderResponse, err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return rateRow{}, fmt.Errorf("%w: decode Frankfurter cache row: trailing data", loading.ErrMalformedProviderResponse)
	}
	if err := validateRateRow(row); err != nil {
		return rateRow{}, err
	}

	return row, nil
}

func validateRateRow(row rateRow) error {
	if row.Base != baseCurrency {
		return fmt.Errorf("%w: Frankfurter cache row base %q is not %s", loading.ErrMalformedProviderResponse, row.Base, baseCurrency)
	}
	if !validFrankfurterQuoteCode(row.Quote) {
		return fmt.Errorf("%w: Frankfurter cache row quote %q is invalid", loading.ErrMalformedProviderResponse, row.Quote)
	}
	if _, err := values.ParseCivilDate(row.Date); err != nil {
		return fmt.Errorf("%w: parse Frankfurter cache date: %v", loading.ErrMalformedProviderResponse, err)
	}
	if _, err := values.ParsePositiveDecimal(row.Rate.String()); err != nil {
		return fmt.Errorf("%w: parse Frankfurter cache rate: %v", loading.ErrMalformedProviderResponse, err)
	}

	return nil
}

func validFrankfurterQuoteCode(code string) bool {
	if len(code) != 3 {
		return false
	}
	for i := 0; i < len(code); i++ {
		if code[i] < 'A' || code[i] > 'Z' {
			return false
		}
	}

	return true
}

func installFetchedCache(path string, plan cachePopulationPlan, result cacheFetchResult) error {
	if plan.replaceExisting {
		ok, err := shouldReplaceCacheFile(path, result.latest)
		if err != nil {
			return fmt.Errorf("%w: inspect Frankfurter cache before install: %v", loading.ErrProviderUnavailable, err)
		}
		if !ok {
			return nil
		}
		if err := os.Rename(plan.tempPath, path); err != nil {
			return fmt.Errorf("%w: install Frankfurter cache: %v", loading.ErrProviderUnavailable, err)
		}

		return nil
	}
	if err := installCacheFile(plan.tempPath, path); err != nil {
		return fmt.Errorf("%w: install Frankfurter cache: %v", loading.ErrProviderUnavailable, err)
	}

	return nil
}

func shouldReplaceCacheFile(path string, incomingLatest values.CivilDate) (bool, error) {
	if incomingLatest.Time().IsZero() {
		return false, nil
	}
	currentLatest, exists, err := latestCacheFileDate(context.Background(), path)
	if err != nil {
		if errors.Is(err, loading.ErrMalformedProviderResponse) {
			return true, nil
		}

		return false, err
	}
	if !exists || currentLatest.Time().IsZero() {
		return true, nil
	}

	return currentLatest.Time().Before(incomingLatest.Time()), nil
}

func latestCacheFileDate(ctx context.Context, path string) (values.CivilDate, bool, error) {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return values.CivilDate{}, false, nil
	}
	if err != nil {
		return values.CivilDate{}, false, fmt.Errorf("%w: open Frankfurter cache: %v", loading.ErrProviderUnavailable, err)
	}
	defer func() {
		_ = file.Close()
	}()
	tail, err := inspectCacheTail(ctx, file)
	if err != nil {
		return values.CivilDate{}, true, err
	}

	return tail.latest, true, nil
}

type cacheTail struct {
	latest           values.CivilDate
	latestBlockStart int64
}

func inspectCacheTail(ctx context.Context, file *os.File) (cacheTail, error) {
	info, err := file.Stat()
	if err != nil {
		return cacheTail{}, fmt.Errorf("%w: stat Frankfurter cache: %v", loading.ErrProviderUnavailable, err)
	}
	before := info.Size()
	tail := cacheTail{}
	for before > 0 {
		if err := ctx.Err(); err != nil {
			return cacheTail{}, err
		}
		line, start, err := previousCacheLine(file, before)
		if errors.Is(err, io.EOF) {
			return tail, nil
		}
		if err != nil {
			return cacheTail{}, err
		}
		before = start
		row, err := decodeRateRowLine(line)
		if err != nil {
			return cacheTail{}, err
		}
		if row.Date == "" {
			continue
		}
		date, err := values.ParseCivilDate(row.Date)
		if err != nil {
			return cacheTail{}, fmt.Errorf("%w: parse Frankfurter cache date: %v", loading.ErrMalformedProviderResponse, err)
		}
		if tail.latest.Time().IsZero() {
			tail.latest = date
			tail.latestBlockStart = start
			continue
		}
		if date.Time().Equal(tail.latest.Time()) {
			tail.latestBlockStart = start
			continue
		}
		if date.Time().After(tail.latest.Time()) {
			return cacheTail{}, fmt.Errorf("%w: Frankfurter cache rows are not ordered by date", loading.ErrMalformedProviderResponse)
		}

		return tail, nil
	}

	return tail, nil
}

func previousCacheLine(file *os.File, before int64) ([]byte, int64, error) {
	end, err := skipCacheLineBreaks(file, before)
	if err != nil {
		return nil, 0, err
	}
	if end == 0 {
		return nil, 0, io.EOF
	}
	search := end
	line := []byte{}
	for search > 0 {
		chunkStart := search - cacheIOBufferSize
		if chunkStart < 0 {
			chunkStart = 0
		}
		buf := make([]byte, int(search-chunkStart))
		if _, err := file.ReadAt(buf, chunkStart); err != nil && !errors.Is(err, io.EOF) {
			return nil, 0, mapProviderIOError("read Frankfurter cache", err)
		}
		if idx := bytes.LastIndexByte(buf, '\n'); idx >= 0 {
			part := append([]byte(nil), buf[idx+1:]...)
			line = append(part, line...)
			if len(line) > maxCacheLineBytes {
				return nil, 0, fmt.Errorf("%w: Frankfurter cache row exceeds %d bytes", loading.ErrMalformedProviderResponse, maxCacheLineBytes)
			}

			return line, chunkStart + int64(idx) + 1, nil
		}
		line = append(append([]byte(nil), buf...), line...)
		if len(line) > maxCacheLineBytes {
			return nil, 0, fmt.Errorf("%w: Frankfurter cache row exceeds %d bytes", loading.ErrMalformedProviderResponse, maxCacheLineBytes)
		}
		search = chunkStart
	}

	return line, 0, nil
}

func skipCacheLineBreaks(file *os.File, before int64) (int64, error) {
	var b [1]byte
	for before > 0 {
		if _, err := file.ReadAt(b[:], before-1); err != nil {
			return 0, mapProviderIOError("read Frankfurter cache", err)
		}
		if b[0] != '\n' {
			return before, nil
		}
		before--
	}

	return 0, nil
}

func installCacheFile(tmpPath string, path string) error {
	// Link installs only when the destination is still missing; unlike Rename it
	// cannot replace a cache another process installed while this one streamed.
	if err := os.Link(tmpPath, path); err == nil {
		return nil
	} else if errors.Is(err, os.ErrExist) {
		return nil
	} else {
		return err
	}
}

type rateRow struct {
	Date  string      `json:"date"`
	Base  string      `json:"base"`
	Quote string      `json:"quote"`
	Rate  json.Number `json:"rate"`
}

func providerRates(rows []rateRow, currency string) ([]loading.ProviderRate, error) {
	result := make([]loading.ProviderRate, 0, len(rows))
	for _, row := range rows {
		if row.Base != baseCurrency || row.Quote != currency {
			continue
		}
		date, err := values.ParseCivilDate(row.Date)
		if err != nil {
			return nil, fmt.Errorf("%w: parse Frankfurter date: %v", loading.ErrMalformedProviderResponse, err)
		}
		rate, err := values.ParsePositiveDecimal(row.Rate.String())
		if err != nil {
			return nil, fmt.Errorf("%w: parse Frankfurter rate: %v", loading.ErrMalformedProviderResponse, err)
		}
		result = append(result, loading.ProviderRate{
			Currency:      currency,
			EffectiveDate: date,
			Rate:          rate,
		})
	}

	return result, nil
}

func ratesURL(baseURL string, start values.CivilDate, end values.CivilDate, quote string) (string, error) {
	endpoint, err := url.Parse(baseURL + "/rates")
	if err != nil {
		return "", fmt.Errorf("%w: parse Frankfurter URL: %v", loading.ErrInvalidProviderConfig, err)
	}
	query := endpoint.Query()
	query.Set("base", baseCurrency)
	query.Set("from", start.String())
	query.Set("to", end.String())
	if quote != "" {
		query.Set("quotes", quote)
	}
	endpoint.RawQuery = query.Encode()

	return endpoint.String(), nil
}

func getJSON(ctx context.Context, client *http.Client, endpoint string, out any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("%w: build Frankfurter request: %v", loading.ErrInvalidProviderConfig, err)
	}
	response, err := client.Do(request)
	if err != nil {
		return mapRequestError("send Frankfurter request", err)
	}
	defer func() {
		_ = response.Body.Close()
	}()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return mapStatusError(response.StatusCode)
	}
	decoder := json.NewDecoder(response.Body)
	decoder.UseNumber()
	if err := decoder.Decode(out); err != nil {
		return fmt.Errorf("%w: decode Frankfurter response: %v", loading.ErrMalformedProviderResponse, err)
	}

	return nil
}

func decodeJSON(data []byte, out any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()

	return decoder.Decode(out)
}

func httpClient(client *http.Client) *http.Client {
	if client != nil {
		return client
	}

	return &http.Client{Timeout: defaultRequestTimeout}
}

func cacheHTTPClient(client *http.Client) *http.Client {
	if client != nil {
		return client
	}

	return &http.Client{Timeout: defaultCacheTimeout}
}

func mapRequestError(label string, err error) error {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return fmt.Errorf("%w: %s: %v", loading.ErrProviderTimeout, label, err)
	}

	return fmt.Errorf("%w: %s: %v", loading.ErrProviderUnavailable, label, err)
}

func mapProviderIOError(label string, err error) error {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) || os.IsTimeout(err) {
		return fmt.Errorf("%w: %s: %v", loading.ErrProviderTimeout, label, err)
	}

	return fmt.Errorf("%w: %s: %v", loading.ErrProviderUnavailable, label, err)
}

func mapStatusError(status int) error {
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return fmt.Errorf("%w: Frankfurter returned HTTP %d", loading.ErrProviderAuth, status)
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		return fmt.Errorf("%w: Frankfurter returned HTTP %d", loading.ErrUnsupportedPair, status)
	case http.StatusNotFound:
		return fmt.Errorf("%w: Frankfurter returned HTTP %d", loading.ErrNoProviderRate, status)
	default:
		return fmt.Errorf("%w: Frankfurter returned HTTP %d", loading.ErrProviderUnavailable, status)
	}
}

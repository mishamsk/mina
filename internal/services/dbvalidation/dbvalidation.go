package dbvalidation

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/transactions"
)

// Level controls how many validation layers run.
type Level string

const (
	// LevelShallow runs schema validation only.
	LevelShallow Level = "shallow"
	// LevelFull runs schema, referential, invariant, and classification validation.
	LevelFull Level = "full"
)

// Severity is a validation finding severity.
type Severity string

const (
	SeverityError   Severity = "error"
	SeverityWarning Severity = "warning"
	SeverityInfo    Severity = "info"
)

// Finding is one database validation finding.
type Finding struct {
	Severity         Severity
	Layer            string
	Message          string
	UniqueIndexDrift string
}

// Report is the complete validation result.
type Report struct {
	Findings []Finding
}

// HasErrors reports whether validation found error-severity issues.
func (r Report) HasErrors() bool {
	for _, finding := range r.Findings {
		if finding.Severity == SeverityError {
			return true
		}
	}

	return false
}

// Write writes a deterministic text report.
func (r Report) Write(w io.Writer) error {
	if len(r.Findings) == 0 {
		_, err := fmt.Fprintln(w, "ok: database is valid")
		return err
	}
	for _, finding := range r.Findings {
		if _, err := fmt.Fprintf(w, "%s: %s: %s\n", finding.Severity, finding.Layer, finding.Message); err != nil {
			return err
		}
	}

	return nil
}

// Repository supplies store-owned validation primitives.
type Repository interface {
	VerifyMigrationHash(context.Context) (MigrationHashCheck, error)
	LatestMigrationVersion(context.Context) (int64, error)
	TargetSchemaVersion(context.Context) (int64, error)
	ReferenceCatalog(context.Context) (ValidationCatalog, error)
	TargetCatalog(context.Context) (ValidationCatalog, error)
	CheckReferenceRegistryCompleteness(context.Context, ValidationCatalog) error
	ReferentialFindings(context.Context) ([]Finding, error)
	InvariantFindings(context.Context, []string) ([]Finding, error)
}

// TransactionReader supplies transactions for persisted classification validation.
type TransactionReader interface {
	List(context.Context, transactions.ListOptions) (transactions.ListResult, error)
}

// MigrationHashCheck reports whether the embedded migration SQL matches the pinned validator hash.
type MigrationHashCheck struct {
	Pinned string
	Actual string
}

// Matches reports whether the pinned and actual migration hashes agree.
func (c MigrationHashCheck) Matches() bool {
	return c.Pinned == c.Actual
}

// LegacySchemaVersionError reports a pre-Goose schema_version table that requires migration.
type LegacySchemaVersionError struct{}

func (e LegacySchemaVersionError) Error() string {
	return "schema_version uses legacy format"
}

// UnsupportedSchemaVersionError reports a schema_version table shape the validator cannot interpret.
type UnsupportedSchemaVersionError struct{}

func (e UnsupportedSchemaVersionError) Error() string {
	return "schema_version table has unsupported shape"
}

// ValidationCatalog is a canonical DuckDB catalog snapshot for validation.
type ValidationCatalog struct {
	Tables      map[string]ValidationTable
	Columns     map[string]map[string]ValidationColumn
	Types       map[string]ValidationType
	Indexes     map[string]ValidationIndex
	Constraints map[string]ValidationConstraint
	Sequences   map[string]ValidationSequence
}

// ValidationTable is table metadata relevant to schema validation.
type ValidationTable struct {
	Name          string
	Comment       string
	HasComment    bool
	HasPrimaryKey bool
}

// ValidationColumn is column metadata relevant to schema validation.
type ValidationColumn struct {
	TableName    string
	Name         string
	Index        int
	DataType     string
	Nullable     bool
	Default      string
	HasDefault   bool
	Comment      string
	HasComment   bool
	PrimaryKeyID bool
}

// ValidationType is custom type metadata relevant to schema validation.
type ValidationType struct {
	Name    string
	Labels  []string
	Comment string
}

// ValidationIndex is index metadata relevant to schema validation.
type ValidationIndex struct {
	Name        string
	TableName   string
	Unique      bool
	Primary     bool
	Expressions string
}

// ValidationConstraint is table constraint metadata relevant to schema validation.
type ValidationConstraint struct {
	TableName string
	Type      string
	Columns   []string
}

// CatalogKey returns the canonical key used to compare table constraints.
func (c ValidationConstraint) CatalogKey() string {
	return c.TableName + "\x00" + c.Type + "\x00" + strings.Join(c.Columns, "\x00")
}

// ValidationSequence is sequence metadata relevant to schema validation.
type ValidationSequence struct {
	Name        string
	StartValue  int64
	MinValue    int64
	MaxValue    int64
	IncrementBy int64
	Cycle       bool
}

// Service orchestrates gated database validation layers.
type Service struct {
	repo         Repository
	transactions TransactionReader
}

// NewService creates a database validation service.
func NewService(repo Repository, transactionRepo TransactionReader) *Service {
	return &Service{repo: repo, transactions: transactionRepo}
}

// InternalError marks validator-internal failures that must exit 2.
type InternalError struct {
	Message string
}

func (e InternalError) Error() string {
	return e.Message
}

// IsInternal reports whether err is a validator-internal failure.
func IsInternal(err error) bool {
	var internal InternalError
	return errors.As(err, &internal)
}

// Validate runs database validation at the requested level.
func (s *Service) Validate(ctx context.Context, level Level) (Report, error) {
	hash, err := s.repo.VerifyMigrationHash(ctx)
	if err != nil {
		return Report{}, err
	}
	if !hash.Matches() {
		return Report{}, InternalError{Message: migrationHashMismatchMessage(hash)}
	}

	reference, err := s.repo.ReferenceCatalog(ctx)
	if err != nil {
		return Report{}, InternalError{Message: "validator internal: build pristine schema reference: " + err.Error()}
	}
	if level == LevelFull {
		if err := s.repo.CheckReferenceRegistryCompleteness(ctx, reference); err != nil {
			return Report{}, InternalError{Message: referenceRegistryIncompleteMessage(err)}
		}
	}

	latest, err := s.repo.LatestMigrationVersion(ctx)
	if err != nil {
		return Report{}, err
	}
	targetVersion, err := s.repo.TargetSchemaVersion(ctx)
	if err != nil {
		var legacySchemaVersion LegacySchemaVersionError
		var unsupportedSchemaVersion UnsupportedSchemaVersionError
		if errors.As(err, &legacySchemaVersion) {
			report := Report{Findings: []Finding{{
				Severity: SeverityError,
				Layer:    "schema",
				Message:  "schema_version uses legacy format; run mina migrate first",
			}}}
			return report, nil
		}
		if errors.As(err, &unsupportedSchemaVersion) {
			report := Report{Findings: []Finding{{
				Severity: SeverityError,
				Layer:    "schema",
				Message:  "schema_version table has unsupported shape; run mina migrate first",
			}}}
			return report, nil
		}
		return Report{}, err
	}

	report := Report{}
	if targetVersion < latest {
		report.Findings = append(report.Findings, Finding{
			Severity: SeverityError,
			Layer:    "schema",
			Message:  fmt.Sprintf("schema_version %d has pending migrations; run mina migrate first", targetVersion),
		})
		return report, nil
	}
	if targetVersion > latest {
		report.Findings = append(report.Findings, Finding{
			Severity: SeverityError,
			Layer:    "schema",
			Message:  fmt.Sprintf("database is newer than this binary: schema_version %d exceeds latest embedded migration %d", targetVersion, latest),
		})
		return report, nil
	}

	target, err := s.repo.TargetCatalog(ctx)
	if err != nil {
		return Report{}, err
	}
	report.Findings = append(report.Findings, diffSchemaCatalogs(reference, target)...)
	if level == LevelShallow {
		sortFindings(report.Findings)
		return report, nil
	}
	if hasErrorFindings(report.Findings) {
		sortFindings(report.Findings)
		return report, nil
	}
	referentialFindings, err := s.repo.ReferentialFindings(ctx)
	if err != nil {
		return Report{}, err
	}
	report.Findings = append(report.Findings, referentialFindings...)
	if hasErrorFindings(report.Findings) {
		sortFindings(report.Findings)
		return report, nil
	}
	invariantFindings, err := s.repo.InvariantFindings(ctx, uniqueIndexDrifts(report.Findings))
	if err != nil {
		return Report{}, err
	}
	report.Findings = append(report.Findings, invariantFindings...)
	if hasErrorFindings(report.Findings) {
		sortFindings(report.Findings)
		return report, nil
	}
	classificationFindings, err := s.classificationFindings(ctx)
	if err != nil {
		return Report{}, err
	}
	report.Findings = append(report.Findings, classificationFindings...)
	sortFindings(report.Findings)

	return report, nil
}

func migrationHashMismatchMessage(hash MigrationHashCheck) string {
	return fmt.Sprintf(
		"validator out of date: embedded migration hash mismatch. The embedded migrations changed since the database validator was pinned; pinned hash %s, actual hash %s. Review whether the schema reference registry, reference waivers, and validation severity rules still cover the new or edited schema, then update internal/store.PinnedMigrationContentHash to the actual hash.",
		hash.Pinned,
		hash.Actual,
	)
}

func referenceRegistryIncompleteMessage(err error) string {
	return "validator internal: reference registry incomplete. FK-shaped column(s) are not registered or waived: " + err.Error() + ". Register each column in the validation reference registry, or add it to the waiver list with justification, following the completeness convention documented in internal/store/PACKAGE.md."
}

func hasErrorFindings(findings []Finding) bool {
	for _, finding := range findings {
		if finding.Severity == SeverityError {
			return true
		}
	}

	return false
}

func (s *Service) classificationFindings(ctx context.Context) ([]Finding, error) {
	const batchSize = 100
	if s.transactions == nil {
		return nil, InternalError{Message: "validator internal: transaction repository is not configured"}
	}

	findings := []Finding{}
	for offset := 0; ; offset += batchSize {
		limit := batchSize
		result, err := s.transactions.List(ctx, transactions.ListOptions{
			ListOptions: services.ListOptions{
				Limit:  &limit,
				Offset: offset,
			},
		})
		if err != nil {
			return nil, fmt.Errorf("list transactions for classification validation: %w", err)
		}
		for _, transaction := range result.Items {
			if err := transactions.ValidateTransactionClassification(transaction); err != nil {
				intent := "UNKNOWN"
				var shapeErr transactions.SemanticShapeError
				if errors.As(err, &shapeErr) {
					intent = strings.ToUpper(string(shapeErr.Intent))
				}
				findings = append(findings, Finding{
					Severity: SeverityError,
					Layer:    "classification",
					Message:  fmt.Sprintf("transaction %d violates %s semantic shape", transaction.ID, intent),
				})
			}
		}
		if len(result.Items) < batchSize {
			break
		}
	}

	return findings, nil
}

func uniqueIndexDrifts(findings []Finding) []string {
	indexes := []string{}
	for _, finding := range findings {
		if finding.UniqueIndexDrift == "" {
			continue
		}
		indexes = append(indexes, finding.UniqueIndexDrift)
	}

	return indexes
}

func diffSchemaCatalogs(reference ValidationCatalog, target ValidationCatalog) []Finding {
	findings := []Finding{}
	findings = append(findings, diffTables(reference, target)...)
	findings = append(findings, diffColumns(reference, target)...)
	findings = append(findings, diffTypes(reference, target)...)
	findings = append(findings, diffConstraints(reference, target)...)
	findings = append(findings, diffIndexes(reference, target)...)
	findings = append(findings, diffSequences(reference, target)...)

	return findings
}

func diffTables(reference ValidationCatalog, target ValidationCatalog) []Finding {
	findings := []Finding{}
	for _, name := range sortedKeys(reference.Tables) {
		if _, ok := target.Tables[name]; !ok {
			findings = append(findings, schemaFinding(SeverityError, "missing table "+name))
		}
	}
	for _, name := range sortedKeys(target.Tables) {
		if _, ok := reference.Tables[name]; !ok {
			findings = append(findings, schemaFinding(SeverityInfo, "unexpected table "+name))
		}
	}
	for _, name := range sortedKeys(reference.Tables) {
		ref, ok := reference.Tables[name]
		if !ok {
			continue
		}
		got, ok := target.Tables[name]
		if !ok {
			continue
		}
		if ref.HasPrimaryKey && !got.HasPrimaryKey {
			findings = append(findings, schemaFinding(SeverityError, "missing primary key on table "+name))
		}
		if ref.HasComment != got.HasComment || ref.Comment != got.Comment {
			findings = append(findings, schemaFinding(SeverityInfo, "table comment drift on "+name))
		}
	}

	return findings
}

func diffColumns(reference ValidationCatalog, target ValidationCatalog) []Finding {
	findings := []Finding{}
	for _, table := range sortedKeys(reference.Columns) {
		refColumns := reference.Columns[table]
		targetColumns := target.Columns[table]
		for _, name := range sortedKeys(refColumns) {
			ref := refColumns[name]
			got, ok := targetColumns[name]
			if !ok {
				findings = append(findings, schemaFinding(SeverityError, "missing column "+table+"."+name))
				continue
			}
			if ref.DataType != got.DataType {
				findings = append(findings, schemaFinding(SeverityError, fmt.Sprintf("column %s.%s type mismatch: expected %s got %s", table, name, ref.DataType, got.DataType)))
			}
			if ref.Nullable != got.Nullable {
				findings = append(findings, schemaFinding(SeverityError, "column "+table+"."+name+" nullability mismatch"))
			}
			if ref.HasDefault != got.HasDefault || normalizeCatalogSQL(ref.Default) != normalizeCatalogSQL(got.Default) {
				findings = append(findings, schemaFinding(SeverityError, "column "+table+"."+name+" default mismatch"))
			}
			if ref.HasComment != got.HasComment || ref.Comment != got.Comment {
				findings = append(findings, schemaFinding(SeverityInfo, "column comment drift on "+table+"."+name))
			}
		}
		for _, name := range sortedKeys(targetColumns) {
			if _, ok := refColumns[name]; ok {
				continue
			}
			got := targetColumns[name]
			severity := SeverityInfo
			if !got.Nullable && !got.HasDefault {
				severity = SeverityError
			}
			findings = append(findings, schemaFinding(severity, "unexpected column "+table+"."+name))
		}
	}

	return findings
}

func diffTypes(reference ValidationCatalog, target ValidationCatalog) []Finding {
	findings := []Finding{}
	for _, name := range sortedKeys(reference.Types) {
		ref := reference.Types[name]
		got, ok := target.Types[name]
		if !ok {
			findings = append(findings, schemaFinding(SeverityError, "missing enum type "+name))
			continue
		}
		if strings.Join(ref.Labels, "\x00") != strings.Join(got.Labels, "\x00") {
			findings = append(findings, schemaFinding(SeverityError, "enum type "+name+" value-set mismatch"))
		}
		if ref.Comment != got.Comment {
			findings = append(findings, schemaFinding(SeverityInfo, "enum type comment drift on "+name))
		}
	}

	return findings
}

func diffIndexes(reference ValidationCatalog, target ValidationCatalog) []Finding {
	findings := []Finding{}
	for _, name := range sortedKeys(reference.Indexes) {
		ref := reference.Indexes[name]
		got, ok := target.Indexes[name]
		if !ok {
			finding := schemaFinding(SeverityWarning, missingIndexMessage(ref))
			if ref.Unique {
				finding.UniqueIndexDrift = ref.Name
			}
			findings = append(findings, finding)
			continue
		}
		if ref.TableName != got.TableName ||
			ref.Unique != got.Unique ||
			ref.Primary != got.Primary ||
			normalizeCatalogSQL(ref.Expressions) != normalizeCatalogSQL(got.Expressions) {
			finding := schemaFinding(SeverityWarning, "index "+name+" definition mismatch")
			if ref.Unique {
				finding.UniqueIndexDrift = ref.Name
			}
			findings = append(findings, finding)
		}
	}
	for _, name := range sortedKeys(target.Indexes) {
		if _, ok := reference.Indexes[name]; !ok {
			findings = append(findings, schemaFinding(SeverityWarning, "unexpected index "+name))
		}
	}

	return findings
}

func diffConstraints(reference ValidationCatalog, target ValidationCatalog) []Finding {
	findings := []Finding{}
	for _, key := range sortedKeys(reference.Constraints) {
		ref := reference.Constraints[key]
		if _, ok := target.Constraints[key]; !ok {
			findings = append(findings, schemaFinding(SeverityWarning, missingConstraintMessage(ref)))
		}
	}
	for _, key := range sortedKeys(target.Constraints) {
		got := target.Constraints[key]
		if _, ok := reference.Constraints[key]; !ok {
			findings = append(findings, schemaFinding(SeverityWarning, unexpectedConstraintMessage(got)))
		}
	}

	return findings
}

func diffSequences(reference ValidationCatalog, target ValidationCatalog) []Finding {
	findings := []Finding{}
	for _, name := range sortedKeys(reference.Sequences) {
		ref := reference.Sequences[name]
		got, ok := target.Sequences[name]
		if !ok {
			findings = append(findings, schemaFinding(SeverityError, "missing sequence "+name))
			continue
		}
		if got.StartValue < ref.StartValue {
			findings = append(findings, schemaFinding(SeverityError, "sequence "+name+" start value is below reference"))
		}
		if ref.MinValue != got.MinValue ||
			ref.MaxValue != got.MaxValue ||
			ref.IncrementBy != got.IncrementBy ||
			ref.Cycle != got.Cycle {
			findings = append(findings, schemaFinding(SeverityError, "sequence "+name+" definition mismatch"))
		}
	}

	return findings
}

func missingIndexMessage(index ValidationIndex) string {
	if index.Unique {
		return "missing unique index " + index.Name
	}

	return "missing index " + index.Name
}

func missingConstraintMessage(constraint ValidationConstraint) string {
	return "missing " + constraintLabel(constraint) + " on table " + constraint.TableName
}

func unexpectedConstraintMessage(constraint ValidationConstraint) string {
	return "unexpected " + constraintLabel(constraint) + " on table " + constraint.TableName
}

func constraintLabel(constraint ValidationConstraint) string {
	return strings.ToLower(constraint.Type) + " constraint (" + strings.Join(constraint.Columns, ", ") + ")"
}

func schemaFinding(severity Severity, message string) Finding {
	return Finding{
		Severity: severity,
		Layer:    "schema",
		Message:  message,
	}
}

func sortFindings(findings []Finding) {
	sort.SliceStable(findings, func(i int, j int) bool {
		if findings[i].Severity != findings[j].Severity {
			return severityRank(findings[i].Severity) < severityRank(findings[j].Severity)
		}
		if findings[i].Layer != findings[j].Layer {
			return findings[i].Layer < findings[j].Layer
		}

		return findings[i].Message < findings[j].Message
	})
}

func severityRank(severity Severity) int {
	switch severity {
	case SeverityError:
		return 0
	case SeverityWarning:
		return 1
	default:
		return 2
	}
}

func sortedKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	return keys
}

func normalizeCatalogSQL(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

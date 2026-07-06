package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/dbvalidation"
	"github.com/mishamsk/mina/internal/services/values"
)

// PinnedMigrationContentHash is the validator-reviewed sha256 of embedded migration SQL.
const PinnedMigrationContentHash = "0da0ecee11fa6158dbe91ff7631e4ffd04c9c59e8ac8d4c4545a47ca4f1689a5"

const validationTrimSpaceCharactersSQL = `' ' || ` +
	`chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || ` +
	`chr(133) || chr(160) || chr(5760) || ` +
	`chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || ` +
	`chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288)`

// DBValidationStore exposes store-owned database validation primitives.
type DBValidationStore struct {
	db *AppDB
}

// NewDBValidationStore creates a database validation store.
func NewDBValidationStore(db *AppDB) *DBValidationStore {
	return &DBValidationStore{db: db}
}

// VerifyMigrationHash returns the pinned and actual embedded migration SQL hashes.
func (s *DBValidationStore) VerifyMigrationHash(context.Context) (dbvalidation.MigrationHashCheck, error) {
	actual, err := migrationContentHash()
	if err != nil {
		return dbvalidation.MigrationHashCheck{}, err
	}

	return dbvalidation.MigrationHashCheck{
		Pinned: PinnedMigrationContentHash,
		Actual: actual,
	}, nil
}

// LatestMigrationVersion returns the latest embedded migration version.
func (s *DBValidationStore) LatestMigrationVersion(context.Context) (int64, error) {
	entries, err := migrationEntries()
	if err != nil {
		return 0, err
	}
	var latest int64
	for _, entry := range entries {
		version, err := migrationVersion(entry.Name())
		if err != nil {
			return 0, err
		}
		if version > latest {
			latest = version
		}
	}

	return latest, nil
}

// TargetSchemaVersion returns the selected accounting schema's latest applied schema_version.
func (s *DBValidationStore) TargetSchemaVersion(ctx context.Context) (int64, error) {
	exists, err := schemaVersionTableExists(ctx, s.db)
	if err != nil {
		return 0, err
	}
	if !exists {
		return 0, nil
	}
	shape, err := schemaVersionTableShape(ctx, s.db)
	if err != nil {
		return 0, err
	}
	switch shape {
	case schemaVersionTableGoose:
	case schemaVersionTableLegacy:
		return 0, dbvalidation.LegacySchemaVersionError{}
	default:
		return 0, dbvalidation.UnsupportedSchemaVersionError{}
	}

	var version sql.NullInt64
	err = s.db.query().QueryRowContext(
		ctx,
		`SELECT MAX(version_id)
FROM `+s.db.accountingName("schema_version")+`
WHERE is_applied`,
	).Scan(&version)
	if err != nil {
		return 0, fmt.Errorf("read schema version: %w", err)
	}
	if !version.Valid {
		return 0, nil
	}

	return version.Int64, nil
}

// ReferenceCatalog builds a pristine migrated in-memory accounting schema catalog.
func (s *DBValidationStore) ReferenceCatalog(ctx context.Context) (dbvalidation.ValidationCatalog, error) {
	db, err := OpenInMemory(ctx)
	if err != nil {
		return dbvalidation.ValidationCatalog{}, err
	}
	defer func() {
		_ = db.Close()
	}()

	appDB, err := OpenAppDBWithProcessDB(ctx, db, AppDBOpenRequest{
		AccountingLocation: AccountingLocationConfig{
			Database: "memory",
			Schema:   "__mina_validation_reference",
		},
	})
	if err != nil {
		return dbvalidation.ValidationCatalog{}, err
	}
	defer func() {
		_ = appDB.Close()
	}()

	if err := Migrate(ctx, appDB); err != nil {
		return dbvalidation.ValidationCatalog{}, fmt.Errorf("build pristine validation reference: %w", err)
	}

	return introspectValidationCatalog(ctx, appDB.db, appDB.Location())
}

// TargetCatalog introspects the selected accounting schema catalog.
func (s *DBValidationStore) TargetCatalog(ctx context.Context) (dbvalidation.ValidationCatalog, error) {
	return introspectValidationCatalog(ctx, s.db.db, s.db.Location())
}

// CheckReferenceRegistryCompleteness verifies that FK-shaped columns are registered or waived.
func (s *DBValidationStore) CheckReferenceRegistryCompleteness(_ context.Context, catalog dbvalidation.ValidationCatalog) error {
	registered := map[string]struct{}{}
	for _, reference := range validationReferences() {
		registered[reference.childTable+"."+reference.childColumn] = struct{}{}
	}
	for _, waiver := range validationReferenceWaivers() {
		registered[waiver] = struct{}{}
	}

	missing := []string{}
	for _, table := range sortedValidationKeys(catalog.Columns) {
		for _, columnName := range sortedValidationKeys(catalog.Columns[table]) {
			column := catalog.Columns[table][columnName]
			if !fkShapedValidationColumn(column) {
				continue
			}
			if _, ok := registered[table+"."+columnName]; !ok {
				missing = append(missing, table+"."+columnName)
			}
		}
	}
	if len(missing) > 0 {
		return errors.New(strings.Join(missing, ", "))
	}

	return nil
}

// ReferentialFindings runs registry-driven anti-join reference checks.
func (s *DBValidationStore) ReferentialFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	findings := []dbvalidation.Finding{}
	for _, reference := range validationReferences() {
		referenceFindings, err := s.referenceFindings(ctx, reference)
		if err != nil {
			return nil, err
		}
		findings = append(findings, referenceFindings...)
	}

	return findings, nil
}

// InvariantFindings runs SQL-backed invariant and value-domain checks.
func (s *DBValidationStore) InvariantFindings(ctx context.Context, missingUniqueIndexes []string) ([]dbvalidation.Finding, error) {
	findings := []dbvalidation.Finding{}
	queryChecks := []func(context.Context) ([]dbvalidation.Finding, error){
		s.unbalancedTransactionFindings,
		s.shortTransactionFindings,
		s.nonPositiveExchangeRateFindings,
		s.zeroAmountFindings,
		s.zeroAmountUSDFindings,
		s.tagIDValueFindings,
		s.negativeCreditLimitFindings,
		s.unpairedExternalIdentifierFindings,
		s.memoWhitespaceFindings,
	}
	for _, check := range queryChecks {
		checkFindings, err := check(ctx)
		if err != nil {
			return nil, err
		}
		findings = append(findings, checkFindings...)
	}
	currencyFindings, err := s.currencyFindings(ctx)
	if err != nil {
		return nil, err
	}
	findings = append(findings, currencyFindings...)
	fqnFindings, err := s.fqnFindings(ctx)
	if err != nil {
		return nil, err
	}
	findings = append(findings, fqnFindings...)
	duplicateFindings, err := s.duplicateActiveFindings(ctx, missingUniqueIndexes)
	if err != nil {
		return nil, err
	}
	findings = append(findings, duplicateFindings...)

	return findings, nil
}

func (s *DBValidationStore) unbalancedTransactionFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT t.transaction_id, jr.currency
FROM `+s.db.accountingName("transaction")+` AS t
JOIN `+s.db.accountingName("journal_record")+` AS jr
  ON jr.transaction_id = t.transaction_id
WHERE t.tombstoned_at IS NULL
  AND jr.tombstoned_at IS NULL
GROUP BY t.transaction_id, jr.currency
HAVING SUM(jr.amount) <> 0
ORDER BY t.transaction_id, jr.currency`,
	)
	if err != nil {
		return nil, fmt.Errorf("check transaction balance: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()

	findings := []dbvalidation.Finding{}
	for rows.Next() {
		var transactionID int64
		var currency string
		if err := rows.Scan(&transactionID, &currency); err != nil {
			return nil, fmt.Errorf("scan transaction balance finding: %w", err)
		}
		findings = append(findings, invariantFinding(dbvalidation.SeverityError, fmt.Sprintf("transaction %d is unbalanced for %s", transactionID, currency)))
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate transaction balance findings: %w", err)
	}

	return findings, nil
}

func (s *DBValidationStore) shortTransactionFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT t.transaction_id
FROM `+s.db.accountingName("transaction")+` AS t
LEFT JOIN `+s.db.accountingName("journal_record")+` AS jr
  ON jr.transaction_id = t.transaction_id
 AND jr.tombstoned_at IS NULL
WHERE t.tombstoned_at IS NULL
GROUP BY t.transaction_id
HAVING COUNT(jr.record_id) < 2
ORDER BY t.transaction_id`,
	)
	if err != nil {
		return nil, fmt.Errorf("check transaction record counts: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()

	findings := []dbvalidation.Finding{}
	for rows.Next() {
		var transactionID int64
		if err := rows.Scan(&transactionID); err != nil {
			return nil, fmt.Errorf("scan transaction record-count finding: %w", err)
		}
		findings = append(findings, invariantFinding(dbvalidation.SeverityError, fmt.Sprintf("active transaction %d has fewer than two active records", transactionID)))
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate transaction record-count findings: %w", err)
	}

	return findings, nil
}

func (s *DBValidationStore) nonPositiveExchangeRateFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	return s.existsFinding(ctx, `SELECT EXISTS (
	SELECT 1
	FROM `+s.db.accountingName("exchange_rate")+`
	WHERE tombstoned_at IS NULL
	  AND rate <= 0
)`, dbvalidation.SeverityError, "exchange_rate.rate must be positive")
}

func (s *DBValidationStore) zeroAmountFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	findings := []dbvalidation.Finding{}
	checks := []struct {
		query   string
		message string
	}{
		{
			query: `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("journal_record") + `
	WHERE tombstoned_at IS NULL
	  AND amount = 0
)`,
			message: "journal_record.amount is zero",
		},
		{
			query: `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("transaction_template_record") + `
	WHERE tombstoned_at IS NULL
	  AND amount = 0
)`,
			message: "transaction_template_record.amount is zero",
		},
	}
	for _, check := range checks {
		checkFindings, err := s.existsFinding(ctx, check.query, dbvalidation.SeverityWarning, check.message)
		if err != nil {
			return nil, err
		}
		findings = append(findings, checkFindings...)
	}

	return findings, nil
}

func (s *DBValidationStore) zeroAmountUSDFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	return s.existsFinding(ctx, `SELECT EXISTS (
	SELECT 1
	FROM `+s.db.accountingName("journal_record")+`
	WHERE tombstoned_at IS NULL
	  AND amount_usd = 0
)`, dbvalidation.SeverityWarning, "journal_record.amount_usd is zero")
}

func (s *DBValidationStore) tagIDValueFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	findings := []dbvalidation.Finding{}
	checks := []struct {
		query   string
		message string
	}{
		{
			query: `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("journal_record") + ` AS jr
	CROSS JOIN UNNEST(jr.tag_ids) AS tag_ids(tag_id)
	WHERE jr.tombstoned_at IS NULL
	  AND tag_ids.tag_id <= 0
)`,
			message: "journal_record.tag_ids contains non-positive element",
		},
		{
			query: `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("journal_record") + ` AS jr
	CROSS JOIN UNNEST(jr.tag_ids) AS tag_ids(tag_id)
	WHERE jr.tombstoned_at IS NULL
	GROUP BY jr.record_id, tag_ids.tag_id
	HAVING COUNT(*) > 1
)`,
			message: "journal_record.tag_ids contains duplicate element",
		},
		{
			query: `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("transaction_template_record") + ` AS ttr
	CROSS JOIN UNNEST(ttr.tag_ids) AS tag_ids(tag_id)
	WHERE ttr.tombstoned_at IS NULL
	  AND tag_ids.tag_id <= 0
)`,
			message: "transaction_template_record.tag_ids contains non-positive element",
		},
		{
			query: `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("transaction_template_record") + ` AS ttr
	CROSS JOIN UNNEST(ttr.tag_ids) AS tag_ids(tag_id)
	WHERE ttr.tombstoned_at IS NULL
	GROUP BY ttr.transaction_template_record_id, tag_ids.tag_id
	HAVING COUNT(*) > 1
)`,
			message: "transaction_template_record.tag_ids contains duplicate element",
		},
	}
	for _, check := range checks {
		checkFindings, err := s.existsFinding(ctx, check.query, dbvalidation.SeverityWarning, check.message)
		if err != nil {
			return nil, err
		}
		findings = append(findings, checkFindings...)
	}

	return findings, nil
}

func (s *DBValidationStore) negativeCreditLimitFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	return s.existsFinding(ctx, `SELECT EXISTS (
	SELECT 1
	FROM `+s.db.accountingName("credit_limit_history")+`
	WHERE tombstoned_at IS NULL
	  AND credit_limit < 0
)`, dbvalidation.SeverityWarning, "credit_limit_history.credit_limit is negative")
}

func (s *DBValidationStore) unpairedExternalIdentifierFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	findings := []dbvalidation.Finding{}
	checks := []struct {
		query   string
		message string
	}{
		{
			query: `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("account") + `
	WHERE tombstoned_at IS NULL
	  AND ((external_id IS NULL) <> (external_system IS NULL))
)`,
			message: "account external_id and external_system must be paired",
		},
		{
			query: `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("journal_record") + `
	WHERE tombstoned_at IS NULL
	  AND ((external_id IS NULL) <> (external_system IS NULL))
)`,
			message: "journal_record external_id and external_system must be paired",
		},
	}
	for _, check := range checks {
		checkFindings, err := s.existsFinding(ctx, check.query, dbvalidation.SeverityInfo, check.message)
		if err != nil {
			return nil, err
		}
		findings = append(findings, checkFindings...)
	}

	return findings, nil
}

func (s *DBValidationStore) memoWhitespaceFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	findings := []dbvalidation.Finding{}
	checks := []struct {
		query   string
		message string
	}{
		{
			query: `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("journal_record") + `
	WHERE tombstoned_at IS NULL
	  AND memo IS NOT NULL
	  AND memo <> trim(memo, ` + validationTrimSpaceCharactersSQL + `)
)`,
			message: "journal_record.memo has leading or trailing whitespace",
		},
		{
			query: `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName("transaction_template_record") + `
	WHERE tombstoned_at IS NULL
	  AND memo IS NOT NULL
	  AND memo <> trim(memo, ` + validationTrimSpaceCharactersSQL + `)
)`,
			message: "transaction_template_record.memo has leading or trailing whitespace",
		},
	}
	for _, check := range checks {
		checkFindings, err := s.existsFinding(ctx, check.query, dbvalidation.SeverityInfo, check.message)
		if err != nil {
			return nil, err
		}
		findings = append(findings, checkFindings...)
	}

	return findings, nil
}

func (s *DBValidationStore) currencyFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT DISTINCT currency
FROM (
	SELECT currency
	FROM `+s.db.accountingName("journal_record")+`
	WHERE tombstoned_at IS NULL
	UNION ALL
	SELECT currency
	FROM `+s.db.accountingName("account")+`
	WHERE tombstoned_at IS NULL AND currency IS NOT NULL
	UNION ALL
	SELECT currency
	FROM `+s.db.accountingName("transaction_template_record")+`
	WHERE tombstoned_at IS NULL AND currency IS NOT NULL
	UNION ALL
	SELECT from_currency
	FROM `+s.db.accountingName("exchange_rate")+`
	WHERE tombstoned_at IS NULL
	UNION ALL
	SELECT to_currency
	FROM `+s.db.accountingName("exchange_rate")+`
	WHERE tombstoned_at IS NULL
) AS currencies
ORDER BY currency`,
	)
	if err != nil {
		return nil, fmt.Errorf("read currencies: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()

	findings := []dbvalidation.Finding{}
	for rows.Next() {
		var currency string
		if err := rows.Scan(&currency); err != nil {
			return nil, fmt.Errorf("scan currency: %w", err)
		}
		if !values.ValidCurrencyCode(currency) {
			findings = append(findings, invariantFinding(dbvalidation.SeverityWarning, "invalid currency code "+currency))
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate currencies: %w", err)
	}

	return findings, nil
}

func (s *DBValidationStore) fqnFindings(ctx context.Context) ([]dbvalidation.Finding, error) {
	findings := []dbvalidation.Finding{}
	for _, table := range []string{"account", "category", "tag", "transaction_template"} {
		fqns, err := s.distinctFQNs(ctx, table)
		if err != nil {
			return nil, err
		}
		for _, fqn := range fqns {
			if err := services.ValidateFQN(fqn); err != nil {
				findings = append(findings, invariantFinding(dbvalidation.SeverityWarning, fmt.Sprintf("malformed %s.fqn %q", table, fqn)))
			}
		}
	}

	return findings, nil
}

func (s *DBValidationStore) distinctFQNs(ctx context.Context, table string) ([]string, error) {
	rows, err := s.db.query().QueryContext(
		ctx,
		`SELECT DISTINCT fqn
FROM `+s.db.accountingName(table)+`
WHERE tombstoned_at IS NULL
ORDER BY fqn`,
	)
	if err != nil {
		return nil, fmt.Errorf("read %s fqns: %w", table, err)
	}
	defer func() {
		_ = rows.Close()
	}()

	fqns := []string{}
	for rows.Next() {
		var fqn string
		if err := rows.Scan(&fqn); err != nil {
			return nil, fmt.Errorf("scan %s fqn: %w", table, err)
		}
		fqns = append(fqns, fqn)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate %s fqns: %w", table, err)
	}

	return fqns, nil
}

func (s *DBValidationStore) duplicateActiveFindings(ctx context.Context, missingUniqueIndexes []string) ([]dbvalidation.Finding, error) {
	findings := []dbvalidation.Finding{}
	for _, indexName := range missingUniqueIndexes {
		check, ok := activeUniquenessChecks()[indexName]
		if !ok {
			continue
		}
		checkFindings, err := s.existsFinding(ctx, check.query(s), dbvalidation.SeverityWarning, check.message)
		if err != nil {
			return nil, err
		}
		findings = append(findings, checkFindings...)
	}

	return findings, nil
}

type activeUniquenessCheck struct {
	message string
	query   func(*DBValidationStore) string
}

func activeUniquenessChecks() map[string]activeUniquenessCheck {
	return map[string]activeUniquenessCheck{
		"account_active_fqn_unique": {
			message: "duplicate active account.fqn",
			query: func(s *DBValidationStore) string {
				return duplicateActiveQuery(s, "account", "fqn")
			},
		},
		"category_active_fqn_unique": {
			message: "duplicate active category.fqn",
			query: func(s *DBValidationStore) string {
				return duplicateActiveQuery(s, "category", "fqn")
			},
		},
		"tag_active_fqn_unique": {
			message: "duplicate active tag.fqn",
			query: func(s *DBValidationStore) string {
				return duplicateActiveQuery(s, "tag", "fqn")
			},
		},
		"transaction_template_active_fqn_unique": {
			message: "duplicate active transaction_template.fqn",
			query: func(s *DBValidationStore) string {
				return duplicateActiveQuery(s, "transaction_template", "fqn")
			},
		},
		"member_active_name_unique": {
			message: "duplicate active member.name",
			query: func(s *DBValidationStore) string {
				return duplicateActiveQuery(s, "member", "name")
			},
		},
		"credit_limit_history_active_account_date_unique": {
			message: "duplicate active credit_limit_history account_id/effective_date",
			query: func(s *DBValidationStore) string {
				return duplicateActiveCompositeQuery(s, "credit_limit_history", "account_id", "effective_date")
			},
		},
		"exchange_rate_active_pair_date_unique": {
			message: "duplicate active exchange_rate from_currency/to_currency/effective_date",
			query: func(s *DBValidationStore) string {
				return duplicateActiveCompositeQuery(s, "exchange_rate", "from_currency", "to_currency", "effective_date")
			},
		},
		"budget_active_category_month_unique": {
			message: "duplicate active budget category_fqn/month",
			query: func(s *DBValidationStore) string {
				return duplicateActiveCompositeQuery(s, "budget", "category_fqn", "month")
			},
		},
	}
}

func duplicateActiveQuery(s *DBValidationStore, table string, column string) string {
	return `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName(table) + `
	WHERE tombstoned_at IS NULL
	GROUP BY ` + QuoteIdentifier(column) + `
	HAVING COUNT(*) > 1
)`
}

func duplicateActiveCompositeQuery(s *DBValidationStore, table string, columns ...string) string {
	quotedColumns := make([]string, 0, len(columns))
	for _, column := range columns {
		quotedColumns = append(quotedColumns, QuoteIdentifier(column))
	}

	return `SELECT EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName(table) + `
	WHERE tombstoned_at IS NULL
	GROUP BY ` + strings.Join(quotedColumns, ", ") + `
	HAVING COUNT(*) > 1
)`
}

func (s *DBValidationStore) existsFinding(ctx context.Context, query string, severity dbvalidation.Severity, message string) ([]dbvalidation.Finding, error) {
	var exists bool
	if err := s.db.query().QueryRowContext(ctx, query).Scan(&exists); err != nil {
		return nil, fmt.Errorf("run invariant check %q: %w", message, err)
	}
	if !exists {
		return nil, nil
	}

	return []dbvalidation.Finding{invariantFinding(severity, message)}, nil
}

func invariantFinding(severity dbvalidation.Severity, message string) dbvalidation.Finding {
	return dbvalidation.Finding{
		Severity: severity,
		Layer:    "invariant",
		Message:  message,
	}
}

type validationReferenceKind int

const (
	validationReferenceScalar validationReferenceKind = iota
	validationReferenceArray
)

type validationReference struct {
	childTable   string
	childColumn  string
	parentTable  string
	parentColumn string
	kind         validationReferenceKind
	severity     dbvalidation.Severity
}

func validationReferences() []validationReference {
	return []validationReference{
		{childTable: "journal_record", childColumn: "transaction_id", parentTable: "transaction", parentColumn: "transaction_id", severity: dbvalidation.SeverityError},
		{childTable: "journal_record", childColumn: "account_id", parentTable: "account", parentColumn: "account_id", severity: dbvalidation.SeverityError},
		{childTable: "journal_record", childColumn: "category_id", parentTable: "category", parentColumn: "category_id", severity: dbvalidation.SeverityError},
		{childTable: "journal_record", childColumn: "member_id", parentTable: "member", parentColumn: "member_id", severity: dbvalidation.SeverityWarning},
		{childTable: "journal_record", childColumn: "tag_ids", parentTable: "tag", parentColumn: "tag_id", kind: validationReferenceArray, severity: dbvalidation.SeverityWarning},
		{childTable: "transaction_template_record", childColumn: "transaction_template_id", parentTable: "transaction_template", parentColumn: "transaction_template_id", severity: dbvalidation.SeverityError},
		{childTable: "transaction_template_record", childColumn: "category_id", parentTable: "category", parentColumn: "category_id", severity: dbvalidation.SeverityError},
		{childTable: "transaction_template_record", childColumn: "account_id", parentTable: "account", parentColumn: "account_id", severity: dbvalidation.SeverityWarning},
		{childTable: "transaction_template_record", childColumn: "member_id", parentTable: "member", parentColumn: "member_id", severity: dbvalidation.SeverityWarning},
		{childTable: "transaction_template_record", childColumn: "tag_ids", parentTable: "tag", parentColumn: "tag_id", kind: validationReferenceArray, severity: dbvalidation.SeverityWarning},
		{childTable: "credit_limit_history", childColumn: "account_id", parentTable: "account", parentColumn: "account_id", severity: dbvalidation.SeverityWarning},
		{childTable: "budget", childColumn: "category_fqn", parentTable: "category", parentColumn: "fqn", severity: dbvalidation.SeverityWarning},
	}
}

func validationReferenceWaivers() []string {
	return []string{
		"account.parent_fqn",
		"category.parent_fqn",
		"tag.parent_fqn",
		"transaction_template.parent_fqn",
	}
}

func fkShapedValidationColumn(column dbvalidation.ValidationColumn) bool {
	if column.PrimaryKeyID || (column.Index == 1 && strings.HasSuffix(column.Name, "_id")) {
		return false
	}
	if column.DataType == "INTEGER" && strings.HasSuffix(column.Name, "_id") {
		return true
	}
	if column.DataType == "INTEGER[]" && strings.HasSuffix(column.Name, "_ids") {
		return true
	}
	if column.DataType == "VARCHAR" && strings.HasSuffix(column.Name, "_fqn") {
		return true
	}

	return false
}

func (s *DBValidationStore) referenceFindings(ctx context.Context, reference validationReference) ([]dbvalidation.Finding, error) {
	var missingCount int64
	var tombstonedCount int64
	var err error
	switch reference.kind {
	case validationReferenceArray:
		missingCount, tombstonedCount, err = s.arrayReferenceCounts(ctx, reference)
	default:
		missingCount, tombstonedCount, err = s.scalarReferenceCounts(ctx, reference)
	}
	if err != nil {
		return nil, err
	}

	findings := []dbvalidation.Finding{}
	if missingCount > 0 {
		findings = append(findings, dbvalidation.Finding{
			Severity: reference.severity,
			Layer:    "referential",
			Message:  reference.childMessage("missing"),
		})
	}
	if tombstonedCount > 0 {
		findings = append(findings, dbvalidation.Finding{
			Severity: reference.severity,
			Layer:    "referential",
			Message:  reference.childMessage("tombstoned"),
		})
	}

	return findings, nil
}

func (s *DBValidationStore) scalarReferenceCounts(ctx context.Context, reference validationReference) (int64, int64, error) {
	if reference.parentColumn == "fqn" {
		return s.fqnReferenceCounts(ctx, reference)
	}

	query := `SELECT
	COALESCE(SUM(CASE WHEN p.` + QuoteIdentifier(reference.parentColumn) + ` IS NULL THEN 1 ELSE 0 END), 0) AS missing_count,
	COALESCE(SUM(CASE WHEN p.` + QuoteIdentifier(reference.parentColumn) + ` IS NOT NULL AND p.tombstoned_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS tombstoned_count
FROM ` + s.db.accountingName(reference.childTable) + ` AS c
LEFT JOIN ` + s.db.accountingName(reference.parentTable) + ` AS p
  ON p.` + QuoteIdentifier(reference.parentColumn) + ` = c.` + QuoteIdentifier(reference.childColumn) + `
WHERE c.tombstoned_at IS NULL
  AND c.` + QuoteIdentifier(reference.childColumn) + ` IS NOT NULL
  AND (p.` + QuoteIdentifier(reference.parentColumn) + ` IS NULL OR p.tombstoned_at IS NOT NULL)`

	var missingCount int64
	var tombstonedCount int64
	if err := s.db.query().QueryRowContext(ctx, query).Scan(&missingCount, &tombstonedCount); err != nil {
		return 0, 0, fmt.Errorf("check %s.%s reference: %w", reference.childTable, reference.childColumn, err)
	}

	return missingCount, tombstonedCount, nil
}

func (s *DBValidationStore) fqnReferenceCounts(ctx context.Context, reference validationReference) (int64, int64, error) {
	childValue := "c." + QuoteIdentifier(reference.childColumn)
	activeParentExists := `EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName(reference.parentTable) + ` AS active_parent
	WHERE active_parent.` + QuoteIdentifier(reference.parentColumn) + ` = ` + childValue + `
	  AND active_parent.tombstoned_at IS NULL
)`
	tombstonedParentExists := `EXISTS (
	SELECT 1
	FROM ` + s.db.accountingName(reference.parentTable) + ` AS tombstoned_parent
	WHERE tombstoned_parent.` + QuoteIdentifier(reference.parentColumn) + ` = ` + childValue + `
	  AND tombstoned_parent.tombstoned_at IS NOT NULL
)`
	query := `SELECT
	COALESCE(SUM(CASE WHEN NOT ` + activeParentExists + ` AND NOT ` + tombstonedParentExists + ` THEN 1 ELSE 0 END), 0) AS missing_count,
	COALESCE(SUM(CASE WHEN NOT ` + activeParentExists + ` AND ` + tombstonedParentExists + ` THEN 1 ELSE 0 END), 0) AS tombstoned_count
FROM ` + s.db.accountingName(reference.childTable) + ` AS c
WHERE c.tombstoned_at IS NULL
  AND ` + childValue + ` IS NOT NULL`

	var missingCount int64
	var tombstonedCount int64
	if err := s.db.query().QueryRowContext(ctx, query).Scan(&missingCount, &tombstonedCount); err != nil {
		return 0, 0, fmt.Errorf("check %s.%s reference: %w", reference.childTable, reference.childColumn, err)
	}

	return missingCount, tombstonedCount, nil
}

func (s *DBValidationStore) arrayReferenceCounts(ctx context.Context, reference validationReference) (int64, int64, error) {
	query := `SELECT
	COALESCE(SUM(CASE WHEN p.` + QuoteIdentifier(reference.parentColumn) + ` IS NULL THEN 1 ELSE 0 END), 0) AS missing_count,
	COALESCE(SUM(CASE WHEN p.` + QuoteIdentifier(reference.parentColumn) + ` IS NOT NULL AND p.tombstoned_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS tombstoned_count
FROM ` + s.db.accountingName(reference.childTable) + ` AS c
CROSS JOIN UNNEST(c.` + QuoteIdentifier(reference.childColumn) + `) AS ref_ids(ref_id)
LEFT JOIN ` + s.db.accountingName(reference.parentTable) + ` AS p
  ON p.` + QuoteIdentifier(reference.parentColumn) + ` = ref_ids.ref_id
WHERE c.tombstoned_at IS NULL
  AND (p.` + QuoteIdentifier(reference.parentColumn) + ` IS NULL OR p.tombstoned_at IS NOT NULL)`

	var missingCount int64
	var tombstonedCount int64
	if err := s.db.query().QueryRowContext(ctx, query).Scan(&missingCount, &tombstonedCount); err != nil {
		return 0, 0, fmt.Errorf("check %s.%s reference: %w", reference.childTable, reference.childColumn, err)
	}

	return missingCount, tombstonedCount, nil
}

func (r validationReference) childMessage(parentState string) string {
	return "active " + r.childTable + "." + r.childColumn + " references " + parentState + " " + r.parentTable
}

func migrationContentHash() (string, error) {
	entries, err := migrationEntries()
	if err != nil {
		return "", err
	}
	hash := sha256.New()
	for _, entry := range entries {
		content, err := embeddedMigrations.ReadFile(filepath.Join("migrations", entry.Name()))
		if err != nil {
			return "", fmt.Errorf("read embedded migration %s: %w", entry.Name(), err)
		}
		hash.Write([]byte(entry.Name()))
		hash.Write([]byte{0})
		hash.Write(content)
		hash.Write([]byte{0})
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}

func migrationEntries() ([]fs.DirEntry, error) {
	entries, err := embeddedMigrations.ReadDir("migrations")
	if err != nil {
		return nil, fmt.Errorf("read embedded migrations: %w", err)
	}
	entries = append([]fs.DirEntry(nil), entries...)
	sort.Slice(entries, func(i int, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	return entries, nil
}

func migrationVersion(name string) (int64, error) {
	prefix, _, ok := strings.Cut(name, "_")
	if !ok {
		return 0, fmt.Errorf("embedded migration %s has no version prefix", name)
	}
	version, err := strconv.ParseInt(prefix, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse embedded migration version %s: %w", name, err)
	}

	return version, nil
}

func introspectValidationCatalog(ctx context.Context, db *sql.DB, location AccountingLocation) (dbvalidation.ValidationCatalog, error) {
	catalog := dbvalidation.ValidationCatalog{
		Tables:      map[string]dbvalidation.ValidationTable{},
		Columns:     map[string]map[string]dbvalidation.ValidationColumn{},
		Types:       map[string]dbvalidation.ValidationType{},
		Indexes:     map[string]dbvalidation.ValidationIndex{},
		Constraints: map[string]dbvalidation.ValidationConstraint{},
		Sequences:   map[string]dbvalidation.ValidationSequence{},
	}
	if err := introspectValidationTables(ctx, db, location, catalog.Tables); err != nil {
		return dbvalidation.ValidationCatalog{}, err
	}
	if err := introspectValidationColumns(ctx, db, location, catalog); err != nil {
		return dbvalidation.ValidationCatalog{}, err
	}
	if err := introspectValidationTypes(ctx, db, location, catalog.Types); err != nil {
		return dbvalidation.ValidationCatalog{}, err
	}
	if err := introspectValidationIndexes(ctx, db, location, catalog.Indexes); err != nil {
		return dbvalidation.ValidationCatalog{}, err
	}
	if err := introspectValidationConstraints(ctx, db, location, catalog.Constraints); err != nil {
		return dbvalidation.ValidationCatalog{}, err
	}
	if err := introspectValidationSequences(ctx, db, location, catalog.Sequences); err != nil {
		return dbvalidation.ValidationCatalog{}, err
	}

	return catalog, nil
}

func introspectValidationTables(ctx context.Context, db *sql.DB, location AccountingLocation, tables map[string]dbvalidation.ValidationTable) error {
	rows, err := db.QueryContext(
		ctx,
		`SELECT table_name, comment, has_primary_key
FROM duckdb_tables()
WHERE database_name = ?
  AND schema_name = ?
  AND NOT internal
ORDER BY table_name`,
		location.Database(),
		location.Schema(),
	)
	if err != nil {
		return fmt.Errorf("introspect tables: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()
	for rows.Next() {
		var table dbvalidation.ValidationTable
		var comment sql.NullString
		if err := rows.Scan(&table.Name, &comment, &table.HasPrimaryKey); err != nil {
			return fmt.Errorf("scan table metadata: %w", err)
		}
		table.Comment, table.HasComment = nullStringValue(comment)
		tables[table.Name] = table
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate table metadata: %w", err)
	}

	return nil
}

func introspectValidationColumns(ctx context.Context, db *sql.DB, location AccountingLocation, catalog dbvalidation.ValidationCatalog) error {
	rows, err := db.QueryContext(
		ctx,
		`SELECT table_name, column_name, column_index, data_type, is_nullable, column_default, comment
FROM duckdb_columns()
WHERE database_name = ?
  AND schema_name = ?
  AND NOT internal
ORDER BY table_name, column_index`,
		location.Database(),
		location.Schema(),
	)
	if err != nil {
		return fmt.Errorf("introspect columns: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()
	for rows.Next() {
		var column dbvalidation.ValidationColumn
		var defaultValue sql.NullString
		var comment sql.NullString
		if err := rows.Scan(
			&column.TableName,
			&column.Name,
			&column.Index,
			&column.DataType,
			&column.Nullable,
			&defaultValue,
			&comment,
		); err != nil {
			return fmt.Errorf("scan column metadata: %w", err)
		}
		column.Default, column.HasDefault = nullStringValue(defaultValue)
		column.Comment, column.HasComment = nullStringValue(comment)
		column.PrimaryKeyID = column.Name == column.TableName+"_id"
		if catalog.Columns[column.TableName] == nil {
			catalog.Columns[column.TableName] = map[string]dbvalidation.ValidationColumn{}
		}
		catalog.Columns[column.TableName][column.Name] = column
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate column metadata: %w", err)
	}

	return nil
}

func introspectValidationTypes(ctx context.Context, db *sql.DB, location AccountingLocation, types map[string]dbvalidation.ValidationType) error {
	rows, err := db.QueryContext(
		ctx,
		`SELECT type_name, COALESCE(array_to_string(labels, ','), ''), comment
FROM duckdb_types()
WHERE database_name = ?
  AND schema_name = ?
  AND type_category = 'ENUM'
  AND NOT internal
ORDER BY type_name`,
		location.Database(),
		location.Schema(),
	)
	if err != nil {
		return fmt.Errorf("introspect types: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()
	for rows.Next() {
		var typ dbvalidation.ValidationType
		var labels string
		var comment sql.NullString
		if err := rows.Scan(&typ.Name, &labels, &comment); err != nil {
			return fmt.Errorf("scan type metadata: %w", err)
		}
		if labels != "" {
			typ.Labels = strings.Split(labels, ",")
		}
		typ.Comment = comment.String
		types[typ.Name] = typ
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate type metadata: %w", err)
	}

	return nil
}

func introspectValidationIndexes(ctx context.Context, db *sql.DB, location AccountingLocation, indexes map[string]dbvalidation.ValidationIndex) error {
	rows, err := db.QueryContext(
		ctx,
		`SELECT index_name, table_name, is_unique, is_primary, expressions
FROM duckdb_indexes()
WHERE database_name = ?
  AND schema_name = ?
ORDER BY index_name`,
		location.Database(),
		location.Schema(),
	)
	if err != nil {
		return fmt.Errorf("introspect indexes: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()
	for rows.Next() {
		var index dbvalidation.ValidationIndex
		var expressions sql.NullString
		if err := rows.Scan(&index.Name, &index.TableName, &index.Unique, &index.Primary, &expressions); err != nil {
			return fmt.Errorf("scan index metadata: %w", err)
		}
		index.Expressions = expressions.String
		indexes[index.Name] = index
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate index metadata: %w", err)
	}

	return nil
}

func introspectValidationConstraints(ctx context.Context, db *sql.DB, location AccountingLocation, constraints map[string]dbvalidation.ValidationConstraint) error {
	rows, err := db.QueryContext(
		ctx,
		`SELECT table_name, constraint_type, array_to_string(constraint_column_names, ',')
FROM duckdb_constraints()
WHERE database_name = ?
  AND schema_name = ?
  AND constraint_type = 'UNIQUE'
ORDER BY table_name, constraint_type, constraint_index`,
		location.Database(),
		location.Schema(),
	)
	if err != nil {
		return fmt.Errorf("introspect constraints: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()
	for rows.Next() {
		var constraint dbvalidation.ValidationConstraint
		var columns string
		if err := rows.Scan(&constraint.TableName, &constraint.Type, &columns); err != nil {
			return fmt.Errorf("scan constraint metadata: %w", err)
		}
		constraint.Columns = strings.Split(columns, ",")
		constraints[constraint.CatalogKey()] = constraint
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate constraint metadata: %w", err)
	}

	return nil
}

func introspectValidationSequences(ctx context.Context, db *sql.DB, location AccountingLocation, sequences map[string]dbvalidation.ValidationSequence) error {
	rows, err := db.QueryContext(
		ctx,
		`SELECT sequence_name, start_value, min_value, max_value, increment_by, cycle
FROM duckdb_sequences()
WHERE database_name = ?
  AND schema_name = ?
ORDER BY sequence_name`,
		location.Database(),
		location.Schema(),
	)
	if err != nil {
		return fmt.Errorf("introspect sequences: %w", err)
	}
	defer func() {
		_ = rows.Close()
	}()
	for rows.Next() {
		var sequence dbvalidation.ValidationSequence
		if err := rows.Scan(
			&sequence.Name,
			&sequence.StartValue,
			&sequence.MinValue,
			&sequence.MaxValue,
			&sequence.IncrementBy,
			&sequence.Cycle,
		); err != nil {
			return fmt.Errorf("scan sequence metadata: %w", err)
		}
		sequences[sequence.Name] = sequence
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate sequence metadata: %w", err)
	}

	return nil
}

func nullStringValue(value sql.NullString) (string, bool) {
	if !value.Valid {
		return "", false
	}

	return value.String, true
}

func sortedValidationKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	return keys
}

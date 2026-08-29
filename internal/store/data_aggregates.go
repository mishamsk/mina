package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"
	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/dataaggregates"
	"github.com/mishamsk/mina/internal/services/values"
)

// DataAggregateStore computes backend-generated aggregate datasets.
type DataAggregateStore struct {
	db *AppDB
}

var _ dataaggregates.Repository = (*DataAggregateStore)(nil)

// NewDataAggregateStore creates a DuckDB-backed aggregate repository.
func NewDataAggregateStore(db *AppDB) *DataAggregateStore {
	return &DataAggregateStore{db: db}
}

// AccountingHistoryRange returns the earliest active accounting date through today.
func (s *DataAggregateStore) AccountingHistoryRange(ctx context.Context, today values.CivilDate) (dataaggregates.AccountingHistoryRange, error) {
	transactionTable := s.db.accountingName("transaction")
	transactionLifecycleStatus := s.db.accountingName("transaction_lifecycle_status")
	row := s.db.query().QueryRowContext(ctx, `SELECT COALESCE(MIN(initiated_date), CAST(? AS DATE))
FROM `+transactionTable+`
WHERE tombstoned_at IS NULL
  AND lifecycle_status = CAST('ACTIVE' AS `+transactionLifecycleStatus+`)
  AND initiated_date <= CAST(? AS DATE)`, civilDateArg(today), civilDateArg(today))
	var start time.Time
	if err := row.Scan(&start); err != nil {
		return dataaggregates.AccountingHistoryRange{}, fmt.Errorf("query accounting history range: %w", err)
	}
	return dataaggregates.AccountingHistoryRange{
		StartDate: values.CivilDateFromTime(start),
		EndDate:   today,
	}, nil
}

// FlowReport returns one bounded, presentation-ready household-flow dataset.
func (s *DataAggregateStore) FlowReport(ctx context.Context, query dataaggregates.Query) (dataaggregates.Dataset, error) {
	var dataset dataaggregates.Dataset
	err := s.db.WithTx(ctx, nil, func(txDB *AppDB) error {
		var queryErr error
		dataset, queryErr = NewDataAggregateStore(txDB).flowReport(ctx, query)
		return queryErr
	})
	return dataset, err
}

type aggregateTables struct {
	matchedTransactions string
	economicComponents  string
	rankedContributors  string
}

func (t aggregateTables) drop(ctx context.Context, db sqlQueryer) error {
	var err error
	for _, table := range []string{t.rankedContributors, t.economicComponents, t.matchedTransactions} {
		if table == "" {
			continue
		}
		if _, dropErr := db.ExecContext(ctx, "DROP TABLE IF EXISTS "+table); dropErr != nil {
			err = errors.Join(err, fmt.Errorf("drop data aggregate table: %w", dropErr))
		}
	}
	return err
}

func (s *DataAggregateStore) flowReport(ctx context.Context, query dataaggregates.Query) (dataset dataaggregates.Dataset, err error) {
	tables, err := s.prepareFlowTables(ctx, query)
	if err != nil {
		return dataaggregates.Dataset{}, err
	}
	defer func() {
		err = errors.Join(err, tables.drop(ctx, s.db.query()))
	}()

	if err := s.rankContributors(ctx, &tables, query); err != nil {
		return dataaggregates.Dataset{}, err
	}
	topLine, excluded, err := s.flowSummary(ctx, tables, query.CurrentMonth)
	if err != nil {
		return dataaggregates.Dataset{}, err
	}
	breakdown, err := s.flowBreakdown(ctx, tables, query)
	if err != nil {
		return dataaggregates.Dataset{}, err
	}
	periods, err := s.flowPeriods(ctx, tables, query)
	if err != nil {
		return dataaggregates.Dataset{}, err
	}
	barGroupTotals, err := s.flowBarGroupTotals(ctx, tables, query)
	if err != nil {
		return dataaggregates.Dataset{}, err
	}
	stacks, err := s.flowStacks(ctx, tables, query)
	if err != nil {
		return dataaggregates.Dataset{}, err
	}
	periodByLabel := make(map[string]*dataaggregates.Period, len(periods))
	for index := range periods {
		periodByLabel[periods[index].Label] = &periods[index]
	}
	for _, total := range barGroupTotals {
		if period := periodByLabel[total.label]; period != nil {
			period.BarGroupTotals = append(period.BarGroupTotals, total.value)
		}
	}
	for _, stack := range stacks {
		if period := periodByLabel[stack.label]; period != nil {
			period.Stacks = append(period.Stacks, stack.value)
		}
	}
	return dataaggregates.Dataset{
		Configuration: query.Configuration, TopLine: topLine, Breakdown: breakdown,
		Periods: periods, ExcludedActivity: excluded,
	}, nil
}

func (s *DataAggregateStore) prepareFlowTables(ctx context.Context, query dataaggregates.Query) (aggregateTables, error) {
	tables := aggregateTables{
		matchedTransactions: "data_aggregate_matched",
		economicComponents:  "data_aggregate_economic",
		rankedContributors:  "data_aggregate_ranked",
	}
	db := s.db.query()
	matched, matchedArgs := s.flowMatchedTransactions(query)
	if _, err := db.ExecContext(ctx, "CREATE TEMP TABLE "+tables.matchedTransactions+" AS "+matched, matchedArgs...); err != nil {
		return aggregateTables{}, fmt.Errorf("materialize flow-report matches: %w", err)
	}
	economic, economicArgs := s.flowEconomicComponents(query, tables.matchedTransactions)
	if _, err := db.ExecContext(ctx, "CREATE TEMP TABLE "+tables.economicComponents+" AS "+economic, economicArgs...); err != nil {
		_ = tables.drop(ctx, db)
		return aggregateTables{}, fmt.Errorf("materialize flow-report components: %w", err)
	}
	return tables, nil
}

func (s *DataAggregateStore) rankContributors(ctx context.Context, tables *aggregateTables, query dataaggregates.Query) error {
	statement := `CREATE TEMP TABLE ` + tables.rankedContributors + ` AS
SELECT
	contributor_key,
	ANY_VALUE(contributor_fqn) AS contributor_fqn,
	ANY_VALUE(contributor_label_override) AS contributor_label_override,
	ANY_VALUE(contributor_category_id) AS contributor_category_id,
	CAST(SUM(ABS(COALESCE(bar_amount_usd, 0))) AS DECIMAL(18,8)) AS magnitude,
	CAST(SUM(unconverted_count) AS BIGINT) AS unconverted_count,
	ROW_NUMBER() OVER (ORDER BY SUM(ABS(COALESCE(bar_amount_usd, 0))) DESC, contributor_key ASC) AS contributor_rank
FROM ` + tables.economicComponents + `
WHERE contributor_key IS NOT NULL
  AND initiated_date >= CAST(? AS DATE)
  AND initiated_date < CAST(? AS DATE)
GROUP BY contributor_key`
	if _, err := s.db.query().ExecContext(ctx, statement, civilDateArg(query.VisibleStart), civilDateArg(query.VisibleEndExclusive)); err != nil {
		return fmt.Errorf("materialize flow-report ranks: %w", err)
	}
	return nil
}

func (s *DataAggregateStore) flowMatchedTransactions(query dataaggregates.Query) (string, []any) {
	transactionTable := s.db.accountingName("transaction")
	where := `WHERE tx.tombstoned_at IS NULL
	  AND tx.lifecycle_status = CAST('ACTIVE' AS ` + s.db.accountingName("transaction_lifecycle_status") + `)
	  AND tx.initiated_date <= ?`
	args := []any{civilDateArg(query.Today)}
	if query.Scope.EntityKind == dataaggregates.EntityKindHousehold {
		return `SELECT tx.transaction_id, tx.initiated_date FROM ` + transactionTable + ` tx
` + where, args
	}
	recordTable := s.db.accountingName("journal_record")
	categoryTable := s.db.accountingName("category")
	tagTable := s.db.accountingName("tag")
	base := `SELECT DISTINCT tx.transaction_id, tx.initiated_date
	FROM ` + transactionTable + ` tx
	JOIN ` + recordTable + ` matched_record ON matched_record.transaction_id = tx.transaction_id
`
	where += "\n\t  AND matched_record.tombstoned_at IS NULL"
	if query.Scope.EntityKind == dataaggregates.EntityKindCategory {
		base += `	JOIN ` + categoryTable + ` matched_category ON matched_category.category_id = matched_record.category_id
`
		where += "\n\t  AND matched_category.tombstoned_at IS NULL"
		if query.Scope.ScopeKind == dataaggregates.ScopeKindLeaf {
			where += "\n\t  AND matched_category.category_id = ?"
			args = append(args, *query.Scope.EntityID)
		} else {
			where += "\n\t  AND starts_with(matched_category.fqn, ? || ':')"
			args = append(args, query.Scope.FQN)
		}
	} else {
		base += `	CROSS JOIN unnest(matched_record.tag_ids) AS matched_tag_id(tag_id)
	JOIN ` + tagTable + ` matched_tag ON matched_tag.tag_id = matched_tag_id.tag_id
`
		where += "\n\t  AND matched_tag.tombstoned_at IS NULL"
		if query.Scope.ScopeKind == dataaggregates.ScopeKindLeaf {
			where += "\n\t  AND matched_tag.tag_id = ?"
			args = append(args, *query.Scope.EntityID)
		} else {
			where += "\n\t  AND starts_with(matched_tag.fqn, ? || ':')"
			args = append(args, query.Scope.FQN)
		}
	}
	return base + where, args
}

func (s *DataAggregateStore) flowEconomicComponents(query dataaggregates.Query, matchedTransactions string) (string, []any) {
	recordTable := s.db.accountingName("journal_record")
	categoryTable := s.db.accountingName("category")
	accountTable := s.db.accountingName("account")
	accountType := s.db.accountingName("account_type")

	contributorKey := "'category:' || CAST(c.category_id AS VARCHAR)"
	contributorFQN := "c.fqn"
	contributorOverride := "CAST(NULL AS VARCHAR)"
	contributorCategoryID := "c.category_id"
	where := ""
	args := []any{}
	if query.Configuration.BreakdownDimension == dataaggregates.BreakdownDimensionAccounts {
		contributorKey = "'account:' || CAST(a.account_id AS VARCHAR)"
		contributorFQN = "a.fqn"
		contributorOverride = "a.display_label"
		contributorCategoryID = "CAST(NULL AS BIGINT)"
	} else if query.Scope.EntityKind == dataaggregates.EntityKindCategory && query.Scope.ScopeKind == dataaggregates.ScopeKindGroup {
		contributorKey = "'category:' || ? || ':' || split_part(substr(c.fqn, length(?) + 2), ':', 1)"
		contributorFQN = "? || ':' || split_part(substr(c.fqn, length(?) + 2), ':', 1)"
		contributorCategoryID = "CASE WHEN c.fqn = ? || ':' || split_part(substr(c.fqn, length(?) + 2), ':', 1) THEN c.category_id ELSE NULL END"
		args = append(args, query.Scope.FQN, query.Scope.FQN, query.Scope.FQN, query.Scope.FQN, query.Scope.FQN, query.Scope.FQN)
	}
	if query.Scope.EntityKind == dataaggregates.EntityKindCategory {
		if query.Scope.ScopeKind == dataaggregates.ScopeKindLeaf {
			where = " AND c.category_id = ?"
			args = append(args, *query.Scope.EntityID)
		} else {
			where = " AND starts_with(c.fqn, ? || ':')"
			args = append(args, query.Scope.FQN)
		}
	}

	signedAmountUSD := "CASE WHEN jr.amount < 0 THEN -ABS(jr.amount_usd) ELSE ABS(jr.amount_usd) END"
	barGroup := "CASE WHEN jr.amount < 0 THEN 'inflow' ELSE 'outflow' END"
	barAmount := "-(" + signedAmountUSD + ")"
	coreAmount := barAmount
	switch query.Configuration.CoreMetric {
	case dataaggregates.CoreMetricNetSpend:
		barGroup = "'net'"
		barAmount = signedAmountUSD
		coreAmount = signedAmountUSD
	case dataaggregates.CoreMetricNetIncome:
		barGroup = "'net'"
		barAmount = "-(" + signedAmountUSD + ")"
		coreAmount = barAmount
	}
	return `SELECT
		matched.initiated_date,
		` + contributorKey + ` AS contributor_key,
		` + contributorFQN + ` AS contributor_fqn,
		` + contributorOverride + ` AS contributor_label_override,
		` + contributorCategoryID + ` AS contributor_category_id,
		` + barGroup + ` AS bar_group,
		CAST(` + barAmount + ` AS DECIMAL(18,8)) AS bar_amount_usd,
		CAST(` + coreAmount + ` AS DECIMAL(18,8)) AS core_amount_usd,
		CAST(CASE WHEN jr.amount_usd IS NULL THEN 1 ELSE 0 END AS BIGINT) AS unconverted_count
	FROM ` + matchedTransactions + ` matched
	JOIN ` + recordTable + ` jr ON jr.transaction_id = matched.transaction_id
	JOIN ` + accountTable + ` a ON a.account_id = jr.account_id
	JOIN ` + categoryTable + ` c ON c.category_id = jr.category_id
	WHERE jr.tombstoned_at IS NULL
	  AND c.tombstoned_at IS NULL
	  AND a.account_type = CAST('FLOW' AS ` + accountType + `)` + where, args
}

func (s *DataAggregateStore) flowSummary(ctx context.Context, tables aggregateTables, currentMonth values.CivilDate) (dataaggregates.TopLine, dataaggregates.ExcludedActivity, error) {
	statement := `WITH month_spine AS (
	SELECT CAST(month_start AS DATE) AS month_start
	FROM generate_series(CAST(? AS DATE) - INTERVAL 13 MONTH, CAST(? AS DATE), INTERVAL 1 MONTH) months(month_start)
), month_core AS (
	SELECT CAST(date_trunc('month', initiated_date) AS DATE) AS month_start,
		CAST(COALESCE(SUM(core_amount_usd), 0) AS DECIMAL(18,8)) AS amount_usd,
		CAST(SUM(unconverted_count) AS BIGINT) AS unconverted_count
	FROM ` + tables.economicComponents + ` GROUP BY 1
), month_values AS (
	SELECT spine.month_start,
		COALESCE(core.amount_usd, CAST(0 AS DECIMAL(18,8))) AS amount_usd,
		COALESCE(core.unconverted_count, 0) AS unconverted_count
	FROM month_spine spine LEFT JOIN month_core core USING (month_start)
), month_windows AS (
	SELECT *,
		SUM(CAST(amount_usd * 100000000::HUGEINT AS HUGEINT)) OVER (ORDER BY month_start ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS trailing_numerator,
		CAST(SUM(unconverted_count) OVER (ORDER BY month_start ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS BIGINT) AS trailing_unconverted_count
	FROM month_values
), months AS (
	SELECT *,
		CAST((
			trailing_numerator // 3 + CASE
				WHEN abs(trailing_numerator % 3) * 2 > 3 OR (
					abs(trailing_numerator % 3) * 2 = 3 AND abs(trailing_numerator // 3) % 2 = 1
				) THEN sign(trailing_numerator)
				ELSE 0
			END
		) * CAST(0.00000001 AS DECIMAL(9,8)) AS DECIMAL(18,8)) AS trailing_amount_usd
	FROM month_windows
), excluded AS (
	SELECT
		COUNT(DISTINCT matched.transaction_id) FILTER (WHERE a.fqn IN ('system:suspense', 'system:correction', 'system:opening_balance')) AS adjustment_count,
		COUNT(DISTINCT matched.transaction_id) FILTER (WHERE a.fqn = 'system:exchange') AS exchange_count
	FROM ` + tables.matchedTransactions + ` matched
	JOIN ` + s.db.accountingName("journal_record") + ` jr ON jr.transaction_id = matched.transaction_id AND jr.tombstoned_at IS NULL
	JOIN ` + s.db.accountingName("account") + ` a ON a.account_id = jr.account_id
	WHERE matched.initiated_date >= CAST(? AS DATE) - INTERVAL 11 MONTH
)
	SELECT
		strftime(current.month_start, '%Y-%m'), current.amount_usd, current.unconverted_count,
		strftime(current.month_start - INTERVAL 3 MONTH, '%Y-%m'), strftime(current.month_start - INTERVAL 1 MONTH, '%Y-%m'),
		current.trailing_amount_usd, current.trailing_unconverted_count,
		strftime(mom.month_start, '%Y-%m'), mom.amount_usd, mom.unconverted_count,
		strftime(mom_base.month_start, '%Y-%m'), mom_base.amount_usd, mom_base.unconverted_count,
		CASE WHEN mom_percentage.denominator = 0 THEN NULL ELSE CAST((
			mom_percentage.numerator // mom_percentage.denominator + CASE
				WHEN abs(mom_percentage.numerator % mom_percentage.denominator) * 2 > mom_percentage.denominator OR (
					abs(mom_percentage.numerator % mom_percentage.denominator) * 2 = mom_percentage.denominator
					AND abs(mom_percentage.numerator // mom_percentage.denominator) % 2 = 1
				) THEN sign(mom_percentage.numerator)
				ELSE 0
			END
		) * CAST(0.00000001 AS DECIMAL(9,8)) AS DECIMAL(18,8)) END,
		strftime(mom.month_start, '%Y-%m'), mom.amount_usd, mom.unconverted_count,
		strftime(yoy_base.month_start, '%Y-%m'), yoy_base.amount_usd, yoy_base.unconverted_count,
		CASE WHEN yoy_percentage.denominator = 0 THEN NULL ELSE CAST((
			yoy_percentage.numerator // yoy_percentage.denominator + CASE
				WHEN abs(yoy_percentage.numerator % yoy_percentage.denominator) * 2 > yoy_percentage.denominator OR (
					abs(yoy_percentage.numerator % yoy_percentage.denominator) * 2 = yoy_percentage.denominator
					AND abs(yoy_percentage.numerator // yoy_percentage.denominator) % 2 = 1
				) THEN sign(yoy_percentage.numerator)
				ELSE 0
			END
		) * CAST(0.00000001 AS DECIMAL(9,8)) AS DECIMAL(18,8)) END,
		excluded.adjustment_count, excluded.exchange_count
	FROM months current
	JOIN months mom ON mom.month_start = current.month_start - INTERVAL 1 MONTH
	JOIN months mom_base ON mom_base.month_start = current.month_start - INTERVAL 2 MONTH
	JOIN months yoy_base ON yoy_base.month_start = current.month_start - INTERVAL 13 MONTH
	CROSS JOIN LATERAL (
		SELECT
			(CAST(mom.amount_usd * 100000000::HUGEINT AS HUGEINT) - CAST(mom_base.amount_usd * 100000000::HUGEINT AS HUGEINT)) * 10000000000::HUGEINT AS numerator,
			abs(CAST(mom_base.amount_usd * 100000000::HUGEINT AS HUGEINT)) AS denominator
	) mom_percentage
	CROSS JOIN LATERAL (
		SELECT
			(CAST(mom.amount_usd * 100000000::HUGEINT AS HUGEINT) - CAST(yoy_base.amount_usd * 100000000::HUGEINT AS HUGEINT)) * 10000000000::HUGEINT AS numerator,
			abs(CAST(yoy_base.amount_usd * 100000000::HUGEINT AS HUGEINT)) AS denominator
	) yoy_percentage
	CROSS JOIN excluded
	WHERE current.month_start = CAST(? AS DATE)`
	monthArg := civilDateArg(currentMonth)
	row := s.db.query().QueryRowContext(ctx, statement, monthArg, monthArg, monthArg, monthArg)
	var top dataaggregates.TopLine
	var currentAmount, averageAmount, momAmount, momBaseAmount, yoyAmount, yoyBaseAmount duckdb.Decimal
	var momPercent, yoyPercent sql.Null[duckdb.Decimal]
	var excluded dataaggregates.ExcludedActivity
	if err := row.Scan(
		&top.CurrentMonth, &currentAmount, &top.CurrentMonthTotal.UnconvertedCount,
		&top.TrailingThreeMonthStart, &top.TrailingThreeMonthEnd, &averageAmount, &top.TrailingThreeMonthAverage.UnconvertedCount,
		&top.MonthOverMonth.CurrentMonth, &momAmount, &top.MonthOverMonth.Current.UnconvertedCount,
		&top.MonthOverMonth.BaselineMonth, &momBaseAmount, &top.MonthOverMonth.Baseline.UnconvertedCount, &momPercent,
		&top.YearOverYear.CurrentMonth, &yoyAmount, &top.YearOverYear.Current.UnconvertedCount,
		&top.YearOverYear.BaselineMonth, &yoyBaseAmount, &top.YearOverYear.Baseline.UnconvertedCount, &yoyPercent,
		&excluded.AdjustmentTransactionCount, &excluded.ExchangeTransactionCount,
	); err != nil {
		return dataaggregates.TopLine{}, dataaggregates.ExcludedActivity{}, fmt.Errorf("query flow-report summary: %w", err)
	}
	decimalTargets := []struct {
		raw    duckdb.Decimal
		target *values.Decimal
	}{
		{currentAmount, &top.CurrentMonthTotal.AmountUSD}, {averageAmount, &top.TrailingThreeMonthAverage.AmountUSD},
		{momAmount, &top.MonthOverMonth.Current.AmountUSD}, {momBaseAmount, &top.MonthOverMonth.Baseline.AmountUSD},
		{yoyAmount, &top.YearOverYear.Current.AmountUSD}, {yoyBaseAmount, &top.YearOverYear.Baseline.AmountUSD},
	}
	for _, target := range decimalTargets {
		parsed, err := decimalFromDuckDB(target.raw)
		if err != nil {
			return dataaggregates.TopLine{}, dataaggregates.ExcludedActivity{}, fmt.Errorf("scan flow-report summary decimal: %w", err)
		}
		*target.target = parsed
	}
	if momPercent.Valid {
		parsed, err := decimalFromDuckDB(momPercent.V)
		if err != nil {
			return dataaggregates.TopLine{}, dataaggregates.ExcludedActivity{}, fmt.Errorf("scan month comparison percent: %w", err)
		}
		top.MonthOverMonth.ChangePercent = &parsed
	}
	if yoyPercent.Valid {
		parsed, err := decimalFromDuckDB(yoyPercent.V)
		if err != nil {
			return dataaggregates.TopLine{}, dataaggregates.ExcludedActivity{}, fmt.Errorf("scan year comparison percent: %w", err)
		}
		top.YearOverYear.ChangePercent = &parsed
	}
	return top, excluded, nil
}

func (s *DataAggregateStore) flowBreakdown(ctx context.Context, tables aggregateTables, query dataaggregates.Query) ([]dataaggregates.BreakdownSeries, error) {
	trendStart := query.VisibleStart.Time()
	if query.Configuration.Grain == dataaggregates.GrainYear {
		trendStart = trendStart.AddDate(-3, 0, 0)
	} else {
		trendStart = trendStart.AddDate(0, -3, 0)
	}
	statement := `SELECT contributor_key, contributor_fqn, contributor_label_override, contributor_category_id, CAST(contributor_rank AS INTEGER), false, unconverted_count
	FROM ` + tables.rankedContributors + ` WHERE contributor_rank <= ?
	UNION ALL
	SELECT 'other', NULL, NULL, NULL, ?, true, CAST(SUM(unconverted_count) AS BIGINT)
	FROM ` + tables.rankedContributors + ` WHERE contributor_rank > ? HAVING COUNT(*) > 0
	UNION ALL
	SELECT 'other', NULL, NULL, NULL, ?, true, CAST(0 AS BIGINT)
	WHERE NOT EXISTS (SELECT 1 FROM ` + tables.rankedContributors + ` WHERE contributor_rank > ?)
	  AND EXISTS (
		SELECT 1 FROM ` + tables.economicComponents + ` economic
		LEFT JOIN ` + tables.rankedContributors + ` ranked USING (contributor_key)
		WHERE economic.initiated_date >= CAST(? AS DATE)
		  AND economic.initiated_date < CAST(? AS DATE)
		  AND ranked.contributor_key IS NULL
	  )
	ORDER BY 5`
	rows, err := s.db.query().QueryContext(ctx, statement,
		query.Configuration.NamedSeriesCount,
		query.Configuration.NamedSeriesCount+1,
		query.Configuration.NamedSeriesCount,
		query.Configuration.NamedSeriesCount+1,
		query.Configuration.NamedSeriesCount,
		civilDateArg(values.CivilDateFromTime(trendStart)),
		civilDateArg(query.VisibleEndExclusive),
	)
	if err != nil {
		return nil, fmt.Errorf("query flow-report breakdown: %w", err)
	}
	result := []dataaggregates.BreakdownSeries{}
	for rows.Next() {
		var item dataaggregates.BreakdownSeries
		var fqn, override sql.NullString
		var categoryID sql.NullInt64
		if err := rows.Scan(&item.ID, &fqn, &override, &categoryID, &item.Rank, &item.IsOther, &item.UnconvertedCount); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan flow-report breakdown: %w", err)
		}
		if item.IsOther {
			item.Label = "Other"
		} else if fqn.Valid {
			item.FQN = &fqn.String
			if categoryID.Valid {
				item.CategoryID = &categoryID.Int64
			}
			if query.Configuration.BreakdownDimension == dataaggregates.BreakdownDimensionAccounts {
				var labelOverride *string
				if override.Valid {
					labelOverride = &override.String
				}
				item.Label = services.EffectiveDisplayLabel(fqn.String, labelOverride)
			} else {
				segments := strings.Split(fqn.String, ":")
				item.Label = segments[len(segments)-1]
			}
		}
		result = append(result, item)
	}
	if err := closeRows(rows, "flow-report breakdown"); err != nil {
		return nil, err
	}
	if query.Configuration.BreakdownDimension == dataaggregates.BreakdownDimensionCategories {
		labelCounts := make(map[string]int, len(result))
		for _, item := range result {
			labelCounts[item.Label]++
		}
		for index := range result {
			if result[index].FQN != nil && labelCounts[result[index].Label] > 1 {
				result[index].Label = *result[index].FQN
			}
		}
	}
	return result, nil
}

func grainSQL(grain dataaggregates.Grain) (unit, labelFormat string) {
	if grain == dataaggregates.GrainYear {
		return "year", "%Y"
	}
	return "month", "%Y-%m"
}

func retainedContributorsCTE(tables aggregateTables, query dataaggregates.Query, from values.CivilDate) (string, []any) {
	unit, _ := grainSQL(query.Configuration.Grain)
	args := []any{query.Configuration.NamedSeriesCount, civilDateArg(from), civilDateArg(query.VisibleEndExclusive)}
	statement := `mapped_contributors AS (
	SELECT
		CAST(date_trunc('` + unit + `', economic.initiated_date) AS DATE) AS period_start,
		CASE WHEN ranked.contributor_rank <= ? THEN economic.contributor_key ELSE 'other' END AS series_id,
		economic.bar_group, economic.bar_amount_usd, economic.core_amount_usd, economic.unconverted_count
	FROM ` + tables.economicComponents + ` economic
	LEFT JOIN ` + tables.rankedContributors + ` ranked USING (contributor_key)
	WHERE economic.initiated_date >= CAST(? AS DATE)
	  AND economic.initiated_date < CAST(? AS DATE)
), retained_contributors AS (
	SELECT * FROM mapped_contributors`
	if len(query.Configuration.ExcludedContributorIDs) > 0 {
		placeholders := make([]string, len(query.Configuration.ExcludedContributorIDs))
		for index, id := range query.Configuration.ExcludedContributorIDs {
			placeholders[index] = "?"
			args = append(args, id)
		}
		statement += " WHERE series_id NOT IN (" + strings.Join(placeholders, ", ") + ")"
	}
	statement += ")"
	return statement, args
}

func (s *DataAggregateStore) flowPeriods(ctx context.Context, tables aggregateTables, query dataaggregates.Query) ([]dataaggregates.Period, error) {
	unit, labelFormat := grainSQL(query.Configuration.Grain)
	retained, args := retainedContributorsCTE(tables, query, query.AnalysisStart)
	args = append(args, civilDateArg(query.AnalysisStart), civilDateArg(query.VisibleEnd), civilDateArg(query.VisibleStart), civilDateArg(query.VisibleStart), civilDateArg(query.CurrentPeriod), civilDateArg(query.VisibleStart))
	trendAmount := "rolling_average_amount"
	trendUnconverted := "rolling_average_unconverted"
	if query.Configuration.Trend == dataaggregates.TrendRollingSum {
		trendAmount = "rolling_sum_amount"
		trendUnconverted = "rolling_sum_unconverted"
	}
	statement := `WITH ` + retained + `,
	period_spine AS (
		SELECT CAST(period_start AS DATE) AS period_start
		FROM generate_series(CAST(? AS DATE), CAST(? AS DATE), INTERVAL 1 ` + strings.ToUpper(unit) + `) periods(period_start)
	), period_core AS (
		SELECT period_start,
			CAST(COALESCE(SUM(core_amount_usd), 0) AS DECIMAL(18,8)) AS amount_usd,
			CAST(SUM(unconverted_count) AS BIGINT) AS unconverted_count
		FROM retained_contributors GROUP BY period_start
	), period_values AS (
		SELECT spine.period_start,
			COALESCE(core.amount_usd, CAST(0 AS DECIMAL(18,8))) AS amount_usd,
			COALESCE(core.unconverted_count, 0) AS unconverted_count
		FROM period_spine spine LEFT JOIN period_core core USING (period_start)
	), period_windows AS (
		SELECT period_start, amount_usd, unconverted_count,
			SUM(CAST(amount_usd * 100000000::HUGEINT AS HUGEINT)) OVER (ORDER BY period_start ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS rolling_average_numerator,
			CAST(SUM(unconverted_count) OVER (ORDER BY period_start ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING) AS BIGINT) AS rolling_average_unconverted,
			CAST(SUM(CASE WHEN period_start >= CAST(? AS DATE) THEN amount_usd ELSE CAST(0 AS DECIMAL(18,8)) END) OVER (ORDER BY period_start) AS DECIMAL(18,8)) AS rolling_sum_amount,
			CAST(SUM(CASE WHEN period_start >= CAST(? AS DATE) THEN unconverted_count ELSE 0 END) OVER (ORDER BY period_start) AS BIGINT) AS rolling_sum_unconverted
		FROM period_values
	), period_trends AS (
		SELECT *,
			CAST((
				rolling_average_numerator // 3 + CASE
					WHEN abs(rolling_average_numerator % 3) * 2 > 3 OR (
						abs(rolling_average_numerator % 3) * 2 = 3 AND abs(rolling_average_numerator // 3) % 2 = 1
					) THEN sign(rolling_average_numerator)
					ELSE 0
				END
			) * CAST(0.00000001 AS DECIMAL(9,8)) AS DECIMAL(18,8)) AS rolling_average_amount
		FROM period_windows
	)
	SELECT strftime(period_start, '` + labelFormat + `'), period_start = CAST(? AS DATE),
		` + trendAmount + `, ` + trendUnconverted + `
	FROM period_trends WHERE period_start >= CAST(? AS DATE) ORDER BY period_start`
	rows, err := s.db.query().QueryContext(ctx, statement, args...)
	if err != nil {
		return nil, fmt.Errorf("query flow-report periods: %w", err)
	}
	result := []dataaggregates.Period{}
	for rows.Next() {
		var item dataaggregates.Period
		var trend duckdb.Decimal
		if err := rows.Scan(&item.Label, &item.IsCurrent, &trend, &item.Trend.UnconvertedCount); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan flow-report period: %w", err)
		}
		var err error
		if item.Trend.AmountUSD, err = decimalFromDuckDB(trend); err != nil {
			return nil, fmt.Errorf("scan flow-report period trend: %w", err)
		}
		item.Stacks = []dataaggregates.StackValue{}
		item.BarGroupTotals = []dataaggregates.BarGroupTotal{}
		result = append(result, item)
	}
	if err := closeRows(rows, "flow-report periods"); err != nil {
		return nil, err
	}
	return result, nil
}

type aggregateBarGroupTotalRow struct {
	label string
	value dataaggregates.BarGroupTotal
}

func (s *DataAggregateStore) flowBarGroupTotals(ctx context.Context, tables aggregateTables, query dataaggregates.Query) ([]aggregateBarGroupTotalRow, error) {
	unit, labelFormat := grainSQL(query.Configuration.Grain)
	retained, args := retainedContributorsCTE(tables, query, query.VisibleStart)
	configuredGroups := make([]string, 0, len(query.Configuration.BarGroups))
	for _, group := range query.Configuration.BarGroups {
		configuredGroups = append(configuredGroups, "(?)")
		args = append(args, string(group))
	}
	args = append(args, civilDateArg(query.VisibleStart), civilDateArg(query.VisibleEnd))
	statement := `WITH ` + retained + `,
	configured_groups(bar_group) AS (VALUES ` + strings.Join(configuredGroups, ", ") + `),
	period_spine AS (
		SELECT CAST(period_start AS DATE) AS period_start
		FROM generate_series(CAST(? AS DATE), CAST(? AS DATE), INTERVAL 1 ` + strings.ToUpper(unit) + `) periods(period_start)
	)
	SELECT strftime(spine.period_start, '` + labelFormat + `'), configured.bar_group,
		CAST(COALESCE(SUM(retained.bar_amount_usd), 0) AS DECIMAL(18,8)),
		CAST(COALESCE(SUM(retained.unconverted_count), 0) AS BIGINT)
	FROM period_spine spine CROSS JOIN configured_groups configured
	LEFT JOIN retained_contributors retained ON retained.period_start = spine.period_start AND retained.bar_group = configured.bar_group
	GROUP BY spine.period_start, configured.bar_group ORDER BY spine.period_start, configured.bar_group`
	rows, err := s.db.query().QueryContext(ctx, statement, args...)
	if err != nil {
		return nil, fmt.Errorf("query flow-report bar-group totals: %w", err)
	}
	result := []aggregateBarGroupTotalRow{}
	for rows.Next() {
		var item aggregateBarGroupTotalRow
		var group string
		var amount duckdb.Decimal
		if err := rows.Scan(&item.label, &group, &amount, &item.value.UnconvertedCount); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan flow-report bar-group total: %w", err)
		}
		item.value.BarGroup = dataaggregates.BarGroup(group)
		parsed, err := decimalFromDuckDB(amount)
		if err != nil {
			return nil, fmt.Errorf("scan flow-report bar-group amount: %w", err)
		}
		item.value.AmountUSD = parsed
		result = append(result, item)
	}
	if err := closeRows(rows, "flow-report bar-group totals"); err != nil {
		return nil, err
	}
	return result, nil
}

type aggregateStackRow struct {
	label string
	value dataaggregates.StackValue
}

func (s *DataAggregateStore) flowStacks(ctx context.Context, tables aggregateTables, query dataaggregates.Query) ([]aggregateStackRow, error) {
	_, labelFormat := grainSQL(query.Configuration.Grain)
	retained, args := retainedContributorsCTE(tables, query, query.VisibleStart)
	statement := `WITH ` + retained + `
	SELECT strftime(period_start, '` + labelFormat + `'), series_id, bar_group,
		CAST(COALESCE(SUM(bar_amount_usd), 0) AS DECIMAL(18,8)), CAST(SUM(unconverted_count) AS BIGINT)
	FROM retained_contributors
	GROUP BY period_start, series_id, bar_group ORDER BY period_start, bar_group, series_id`
	rows, err := s.db.query().QueryContext(ctx, statement, args...)
	if err != nil {
		return nil, fmt.Errorf("query flow-report stacks: %w", err)
	}
	result := []aggregateStackRow{}
	for rows.Next() {
		var item aggregateStackRow
		var group string
		var amount duckdb.Decimal
		if err := rows.Scan(&item.label, &item.value.SeriesID, &group, &amount, &item.value.UnconvertedCount); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan flow-report stack: %w", err)
		}
		item.value.BarGroup = dataaggregates.BarGroup(group)
		parsed, err := decimalFromDuckDB(amount)
		if err != nil {
			return nil, fmt.Errorf("scan flow-report stack amount: %w", err)
		}
		item.value.AmountUSD = parsed
		result = append(result, item)
	}
	if err := closeRows(rows, "flow-report stacks"); err != nil {
		return nil, err
	}
	return result, nil
}

func closeRows(rows *sql.Rows, name string) error {
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return fmt.Errorf("iterate %s: %w", name, err)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("close %s: %w", name, err)
	}
	return nil
}

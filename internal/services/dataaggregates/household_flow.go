package dataaggregates

import (
	"context"
	"slices"
	"time"

	"github.com/mishamsk/mina/internal/services"
	"github.com/mishamsk/mina/internal/services/categories"
	"github.com/mishamsk/mina/internal/services/tags"
	"github.com/mishamsk/mina/internal/services/transactions"
	"github.com/mishamsk/mina/internal/services/values"
)

const (
	previewLimit            = 8
	defaultMonthCount       = 12
	defaultYearCount        = 6
	defaultNamedSeriesCount = 5
)

// EntityKind identifies the dictionary dimension being reported.
type EntityKind string

const (
	EntityKindCategory  EntityKind = "category"
	EntityKindTag       EntityKind = "tag"
	EntityKindHousehold EntityKind = "household"
)

// ScopeKind identifies a stored leaf or implicit group scope.
type ScopeKind string

const (
	ScopeKindLeaf  ScopeKind = "leaf"
	ScopeKindGroup ScopeKind = "group"
)

// CoreMetric identifies the configured report measure.
type CoreMetric string

const (
	CoreMetricNetSpend  CoreMetric = "net_spend"
	CoreMetricNetIncome CoreMetric = "net_income"
	CoreMetricNetFlow   CoreMetric = "net_flow"
)

// BreakdownDimension identifies the contributor dimension used by stacks.
type BreakdownDimension string

const (
	BreakdownDimensionAccounts   BreakdownDimension = "accounts"
	BreakdownDimensionCategories BreakdownDimension = "categories"
)

// Grain identifies the calendar period represented by one chart bucket.
type Grain string

const (
	GrainMonth Grain = "month"
	GrainYear  Grain = "year"
)

// Trend identifies the backend-computed chart line.
type Trend string

const (
	TrendRollingAverage Trend = "rolling_average"
	TrendRollingSum     Trend = "rolling_sum"
)

// BarGroup identifies one grouped stack in a report period.
type BarGroup string

const (
	BarGroupNet     BarGroup = "net"
	BarGroupInflow  BarGroup = "inflow"
	BarGroupOutflow BarGroup = "outflow"
)

// Scope is the server-resolved report identity.
type Scope struct {
	EntityKind EntityKind
	ScopeKind  ScopeKind
	EntityID   *int64
	FQN        string
}

// ReportConfigurationInput carries optional caller-selected report controls.
type ReportConfigurationInput struct {
	BreakdownDimension     *BreakdownDimension
	Grain                  *Grain
	PeriodCount            *int
	AnchorDate             *values.CivilDate
	NamedSeriesCount       *int
	ExcludedContributorIDs []string
	Trend                  *Trend
}

// Configuration is the effective report configuration echoed to clients.
type Configuration struct {
	CoreMetric             CoreMetric
	BreakdownDimension     BreakdownDimension
	BarGroups              []BarGroup
	Grain                  Grain
	PeriodCount            int
	AnchorPeriod           string
	NamedSeriesCount       int
	ExcludedContributorIDs []string
	Trend                  Trend
}

// AccountingHistoryRange is the inclusive active-accounting window available to reports.
type AccountingHistoryRange struct {
	StartDate values.CivilDate
	EndDate   values.CivilDate
}

// MetricValue is one USD-equivalent aggregate and its conversion disclosure.
type MetricValue struct {
	AmountUSD        values.Decimal
	UnconvertedCount int64
}

// Comparison is a current month against one baseline month.
type Comparison struct {
	CurrentMonth  string
	BaselineMonth string
	Current       MetricValue
	Baseline      MetricValue
	ChangePercent *values.Decimal
}

// TopLine contains whole-scope report summaries unaffected by chart filters.
type TopLine struct {
	CurrentMonth              string
	CurrentMonthTotal         MetricValue
	TrailingThreeMonthStart   string
	TrailingThreeMonthEnd     string
	TrailingThreeMonthAverage MetricValue
	MonthOverMonth            Comparison
	YearOverYear              Comparison
}

// BreakdownSeries is one stable named contributor or aggregate Other series.
type BreakdownSeries struct {
	ID               string
	Label            string
	FQN              *string
	CategoryID       *int64
	Rank             int
	IsOther          bool
	UnconvertedCount int64
}

// StackValue is one server-aggregated contributor value in one bar group.
type StackValue struct {
	SeriesID         string
	BarGroup         BarGroup
	AmountUSD        values.Decimal
	UnconvertedCount int64
}

// BarGroupTotal is one filtered total across every retained contributor.
type BarGroupTotal struct {
	BarGroup         BarGroup
	AmountUSD        values.Decimal
	UnconvertedCount int64
}

// Period is one complete presentation bucket.
type Period struct {
	Label          string
	IsCurrent      bool
	Trend          MetricValue
	BarGroupTotals []BarGroupTotal
	Stacks         []StackValue
}

// ExcludedActivity identifies matching non-reportable transaction shapes.
type ExcludedActivity struct {
	AdjustmentTransactionCount int64
	ExchangeTransactionCount   int64
}

// Dataset is the repository-computed report portion.
type Dataset struct {
	Configuration    Configuration
	TopLine          TopLine
	Breakdown        []BreakdownSeries
	Periods          []Period
	ExcludedActivity ExcludedActivity
}

// Report is the bounded Category or Tag response including its fixed preview.
type Report struct {
	Scope        Scope
	Dataset      Dataset
	Transactions []transactions.Transaction
}

// Query identifies one validated report request for persistence.
type Query struct {
	Scope               Scope
	Configuration       Configuration
	Today               values.CivilDate
	CurrentMonth        values.CivilDate
	CurrentPeriod       values.CivilDate
	VisibleStart        values.CivilDate
	VisibleEnd          values.CivilDate
	VisibleEndExclusive values.CivilDate
	AnalysisStart       values.CivilDate
}

// Repository computes household-flow aggregate datasets in DuckDB.
type Repository interface {
	AccountingHistoryRange(context.Context, values.CivilDate) (AccountingHistoryRange, error)
	FlowReport(context.Context, Query) (Dataset, error)
}

// CategoryReader resolves active Category identity and implicit groups.
type CategoryReader interface {
	Get(context.Context, int64, bool) (categories.Category, error)
	GroupStates(context.Context, bool) ([]categories.GroupState, error)
	DescendantEconomicIntents(context.Context, string) ([]categories.CategoryEconomicIntent, error)
}

// TagReader resolves active Tag identity and implicit groups.
type TagReader interface {
	Get(context.Context, int64, bool) (tags.Tag, error)
	GroupStates(context.Context, bool) ([]tags.GroupState, error)
}

// TransactionLister supplies classified transaction previews.
type TransactionLister interface {
	List(context.Context, transactions.ListOptions) (transactions.ListResult, error)
}

// Clock supplies the runtime-local report date.
type Clock interface {
	Now() time.Time
}

// Service owns backend-generated aggregate dataset configuration and scope.
type Service struct {
	repo         Repository
	categories   CategoryReader
	tags         TagReader
	transactions TransactionLister
	clock        Clock
}

// NewService creates the aggregate dataset service.
func NewService(repo Repository, categoryReader CategoryReader, tagReader TagReader, transactionLister TransactionLister, clock Clock) *Service {
	return &Service{repo: repo, categories: categoryReader, tags: tagReader, transactions: transactionLister, clock: clock}
}

// Category returns an active Category leaf report.
func (s *Service) Category(ctx context.Context, id int64, input ReportConfigurationInput) (Report, error) {
	category, err := s.categories.Get(ctx, id, false)
	if err != nil {
		return Report{}, err
	}
	metric := CoreMetricNetSpend
	if category.EconomicIntent == categories.CategoryEconomicIntentIncome {
		metric = CoreMetricNetIncome
	}
	entityID := category.ID
	return s.report(ctx, Scope{EntityKind: EntityKindCategory, ScopeKind: ScopeKindLeaf, EntityID: &entityID, FQN: category.FQN}, metric, BreakdownDimensionAccounts, input)
}

// CategoryGroup returns an implicit Category group report.
func (s *Service) CategoryGroup(ctx context.Context, fqn string, input ReportConfigurationInput) (Report, error) {
	if err := services.ValidateFQN(fqn); err != nil {
		return Report{}, err
	}
	groups, err := s.categories.GroupStates(ctx, true)
	if err != nil {
		return Report{}, err
	}
	if !slices.ContainsFunc(groups, func(group categories.GroupState) bool { return group.FQN == fqn }) {
		return Report{}, services.NotFound("category group not found")
	}
	intents, err := s.categories.DescendantEconomicIntents(ctx, fqn)
	if err != nil {
		return Report{}, err
	}
	metric := CoreMetricNetFlow
	if slices.Contains(intents, categories.CategoryEconomicIntentExpense) && !slices.Contains(intents, categories.CategoryEconomicIntentIncome) {
		metric = CoreMetricNetSpend
	} else if slices.Contains(intents, categories.CategoryEconomicIntentIncome) && !slices.Contains(intents, categories.CategoryEconomicIntentExpense) {
		metric = CoreMetricNetIncome
	}
	return s.report(ctx, Scope{EntityKind: EntityKindCategory, ScopeKind: ScopeKindGroup, FQN: fqn}, metric, BreakdownDimensionCategories, input)
}

// Tag returns an active Tag leaf report.
func (s *Service) Tag(ctx context.Context, id int64, input ReportConfigurationInput) (Report, error) {
	tag, err := s.tags.Get(ctx, id, false)
	if err != nil {
		return Report{}, err
	}
	entityID := tag.ID
	return s.report(ctx, Scope{EntityKind: EntityKindTag, ScopeKind: ScopeKindLeaf, EntityID: &entityID, FQN: tag.FQN}, CoreMetricNetFlow, BreakdownDimensionCategories, input)
}

// TagGroup returns an implicit Tag group report.
func (s *Service) TagGroup(ctx context.Context, fqn string, input ReportConfigurationInput) (Report, error) {
	if err := services.ValidateFQN(fqn); err != nil {
		return Report{}, err
	}
	groups, err := s.tags.GroupStates(ctx, true)
	if err != nil {
		return Report{}, err
	}
	if !slices.ContainsFunc(groups, func(group tags.GroupState) bool { return group.FQN == fqn }) {
		return Report{}, services.NotFound("tag group not found")
	}
	return s.report(ctx, Scope{EntityKind: EntityKindTag, ScopeKind: ScopeKindGroup, FQN: fqn}, CoreMetricNetFlow, BreakdownDimensionCategories, input)
}

// Household returns the unfiltered Household report dataset.
func (s *Service) Household(ctx context.Context, input ReportConfigurationInput) (Dataset, error) {
	query, err := s.query(Scope{EntityKind: EntityKindHousehold}, CoreMetricNetFlow, BreakdownDimensionCategories, input)
	if err != nil {
		return Dataset{}, err
	}
	return s.repo.FlowReport(ctx, query)
}

// AccountingHistoryRange returns the inclusive active-accounting window through today.
func (s *Service) AccountingHistoryRange(ctx context.Context) (AccountingHistoryRange, error) {
	today := values.LocalCivilDateFromTime(s.clock.Now())
	return s.repo.AccountingHistoryRange(ctx, today)
}

func (s *Service) report(ctx context.Context, scope Scope, metric CoreMetric, defaultBreakdown BreakdownDimension, input ReportConfigurationInput) (Report, error) {
	query, err := s.query(scope, metric, defaultBreakdown, input)
	if err != nil {
		return Report{}, err
	}
	dataset, err := s.repo.FlowReport(ctx, query)
	if err != nil {
		return Report{}, err
	}
	previewPageLimit := previewLimit
	listOptions := transactions.ListOptions{
		ListOptions:       services.ListOptions{SortKey: services.SortKeyInitiatedDate, SortDirection: services.SortDirectionDesc, Limit: &previewPageLimit},
		LifecycleStatuses: []transactions.LifecycleStatus{transactions.LifecycleStatusActive},
		InitiatedDateTo:   &query.Today,
	}
	if scope.EntityKind == EntityKindCategory {
		if scope.ScopeKind == ScopeKindLeaf {
			listOptions.CategoryIDs = []int64{*scope.EntityID}
		} else {
			listOptions.CategoryFQNPrefix = &scope.FQN
		}
	} else if scope.ScopeKind == ScopeKindLeaf {
		listOptions.TagIDs = []int64{*scope.EntityID}
	} else {
		listOptions.TagFQNPrefix = &scope.FQN
	}
	preview, err := s.transactions.List(ctx, listOptions)
	if err != nil {
		return Report{}, err
	}
	return Report{Scope: scope, Dataset: dataset, Transactions: preview.Items}, nil
}

func (s *Service) query(scope Scope, metric CoreMetric, defaultBreakdown BreakdownDimension, input ReportConfigurationInput) (Query, error) {
	configuration, err := resolveConfiguration(scope, metric, defaultBreakdown, input)
	if err != nil {
		return Query{}, err
	}
	today := values.LocalCivilDateFromTime(s.clock.Now())
	currentMonthTime := time.Date(today.Time().Year(), today.Time().Month(), 1, 0, 0, 0, 0, time.UTC)
	currentPeriodTime := currentMonthTime
	if configuration.Grain == GrainYear {
		currentPeriodTime = time.Date(today.Time().Year(), time.January, 1, 0, 0, 0, 0, time.UTC)
	}
	visibleEndTime := currentPeriodTime
	if input.AnchorDate != nil {
		if input.AnchorDate.Time().After(today.Time()) {
			return Query{}, services.InvalidRequest("anchor_date cannot be in the future")
		}
		visibleEndTime = time.Date(input.AnchorDate.Time().Year(), input.AnchorDate.Time().Month(), 1, 0, 0, 0, 0, time.UTC)
		if configuration.Grain == GrainYear {
			visibleEndTime = time.Date(input.AnchorDate.Time().Year(), time.January, 1, 0, 0, 0, 0, time.UTC)
		}
	}
	configuration.AnchorPeriod = periodLabel(configuration.Grain, visibleEndTime)
	visibleEndExclusiveTime := visibleEndTime.AddDate(0, 1, 0)
	if configuration.Grain == GrainYear {
		visibleEndExclusiveTime = visibleEndTime.AddDate(1, 0, 0)
	}
	query := Query{
		Scope: scope, Configuration: configuration, Today: today,
		CurrentMonth: values.CivilDateFromTime(currentMonthTime), CurrentPeriod: values.CivilDateFromTime(currentPeriodTime),
		VisibleEnd: values.CivilDateFromTime(visibleEndTime), VisibleEndExclusive: values.CivilDateFromTime(visibleEndExclusiveTime),
	}
	visibleStartTime := visibleEndTime
	if configuration.Grain == GrainMonth {
		visibleStartTime = visibleStartTime.AddDate(0, -(configuration.PeriodCount - 1), 0)
	} else {
		visibleStartTime = visibleStartTime.AddDate(-(configuration.PeriodCount - 1), 0, 0)
	}
	analysisStartTime := visibleStartTime
	if configuration.Grain == GrainMonth {
		analysisStartTime = analysisStartTime.AddDate(0, -3, 0)
	} else {
		analysisStartTime = analysisStartTime.AddDate(-3, 0, 0)
	}
	topLineStart := currentMonthTime.AddDate(0, -14, 0)
	if topLineStart.Before(analysisStartTime) {
		analysisStartTime = topLineStart
	}
	visibleStart := values.CivilDateFromTime(visibleStartTime)
	analysisStart := values.CivilDateFromTime(analysisStartTime)
	query.VisibleStart = visibleStart
	query.AnalysisStart = analysisStart
	return query, nil
}

func resolveConfiguration(scope Scope, metric CoreMetric, defaultBreakdown BreakdownDimension, input ReportConfigurationInput) (Configuration, error) {
	breakdown := defaultBreakdown
	if input.BreakdownDimension != nil {
		breakdown = *input.BreakdownDimension
	}
	if breakdown != BreakdownDimensionAccounts && breakdown != BreakdownDimensionCategories {
		return Configuration{}, services.InvalidRequest("breakdown must be accounts or categories")
	}
	if scope.EntityKind == EntityKindCategory && scope.ScopeKind == ScopeKindLeaf && breakdown == BreakdownDimensionCategories {
		return Configuration{}, services.InvalidRequest("categories breakdown is unavailable for category leaves")
	}
	grain := GrainMonth
	if input.Grain != nil {
		grain = *input.Grain
	}
	if grain != GrainMonth && grain != GrainYear {
		return Configuration{}, services.InvalidRequest("grain must be month or year")
	}
	periodCount := defaultMonthCount
	if grain == GrainYear {
		periodCount = defaultYearCount
	}
	if input.PeriodCount != nil {
		periodCount = *input.PeriodCount
	}
	if grain == GrainMonth && (periodCount < 6 || periodCount > 24) {
		return Configuration{}, services.InvalidRequest("month period_count must be between 6 and 24")
	}
	if grain == GrainYear && periodCount < 3 {
		return Configuration{}, services.InvalidRequest("year period_count must be at least 3")
	}
	namedSeriesCount := defaultNamedSeriesCount
	if input.NamedSeriesCount != nil {
		namedSeriesCount = *input.NamedSeriesCount
	}
	if namedSeriesCount < 5 {
		return Configuration{}, services.InvalidRequest("named_series_count must be at least 5")
	}
	trend := TrendRollingAverage
	if grain == GrainYear {
		trend = TrendRollingSum
	}
	if input.Trend != nil {
		trend = *input.Trend
	}
	if trend != TrendRollingAverage && trend != TrendRollingSum {
		return Configuration{}, services.InvalidRequest("trend must be rolling_average or rolling_sum")
	}
	if duplicateStrings(input.ExcludedContributorIDs) {
		return Configuration{}, services.InvalidRequest("excluded_contributor_id values must be unique")
	}
	barGroups := []BarGroup{BarGroupInflow, BarGroupOutflow}
	if metric != CoreMetricNetFlow {
		barGroups = []BarGroup{BarGroupNet}
	}
	return Configuration{
		CoreMetric: metric, BreakdownDimension: breakdown, BarGroups: barGroups,
		Grain: grain, PeriodCount: periodCount,
		NamedSeriesCount: namedSeriesCount, ExcludedContributorIDs: slices.Clone(input.ExcludedContributorIDs), Trend: trend,
	}, nil
}

func periodLabel(grain Grain, value time.Time) string {
	if grain == GrainYear {
		return value.Format("2006")
	}
	return value.Format("2006-01")
}

func duplicateStrings(values []string) bool {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if value == "" {
			return true
		}
		if _, exists := seen[value]; exists {
			return true
		}
		seen[value] = struct{}{}
	}
	return false
}

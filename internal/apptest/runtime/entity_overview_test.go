package runtime_test

import (
	"context"
	"fmt"
	"math/big"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/mishamsk/mina/internal/apptest"
	"github.com/mishamsk/mina/internal/httpclient"
)

func TestAccountingHistoryRangeEmptyLedger(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(time.Date(2026, time.August, 15, 12, 0, 0, 0, time.UTC))))
	response, err := client.REST().GetAccountingHistoryRangeWithResponse(context.Background())
	requireNoTransportError(t, "get empty accounting history range", err)
	if response.StatusCode() != http.StatusOK || response.JSON200 == nil {
		t.Fatalf("empty accounting history range status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if got := response.JSON200; got.StartDate.Format(time.DateOnly) != "2026-08-15" || got.EndDate.Format(time.DateOnly) != "2026-08-15" {
		t.Fatalf("empty accounting history range = %+v, want today for both bounds", got)
	}
}

func TestEntityOverviewRESTContract(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(time.Date(2026, time.August, 15, 12, 0, 0, 0, time.FixedZone("local", -4*60*60)))))
	fixture := newEntityOverviewFixture(t, client)
	assertEntityOverviewErrorResponses(t, client)

	categoryLeaf := getCategoryOverview(t, client, fixture.categories[0].CategoryId)
	assertEntityOverviewMetric(t, "category leaf current month", categoryLeaf.Dataset.TopLine.CurrentMonthTotal, "80.00000000", 1)
	assertEntityOverviewMetric(t, "category leaf trailing average", categoryLeaf.Dataset.TopLine.TrailingThreeMonthAverage, "40.00000000", 0)
	assertComparison(t, "category leaf month-over-month", categoryLeaf.Dataset.TopLine.MonthOverMonth, "2026-07", "2026-06", "80.00000000", "40.00000000", "100.00000000")
	assertComparison(t, "category leaf year-over-year", categoryLeaf.Dataset.TopLine.YearOverYear, "2026-07", "2025-07", "80.00000000", "20.00000000", "300.00000000")
	assertOverviewShape(t, categoryLeaf.Dataset, httpclient.HouseholdFlowCoreMetricNetSpend, httpclient.HouseholdFlowBreakdownDimensionAccounts)
	assertRankedBreakdown(t, categoryLeaf.Dataset.Breakdown,
		fixture.semantic.merchant.Fqn,
		"overviewreport:merchant:crypto",
	)
	assertBarGroups(t, categoryLeaf.Dataset, httpclient.HouseholdFlowBarGroupNet)
	assertMonthlyStack(t, categoryLeaf.Dataset, "2026-07", "net", "80.00000000")
	if len(categoryLeaf.Transactions) != 7 {
		t.Fatalf("category leaf preview transaction count = %d, want 7", len(categoryLeaf.Transactions))
	}
	for _, transaction := range categoryLeaf.Transactions {
		if transaction.InitiatedDate.After(apptest.Date("2026-08-15").Time) {
			t.Fatalf("category preview contains future transaction %s", transaction.InitiatedDate.Time)
		}
	}

	incomeLeaf := getCategoryOverview(t, client, fixture.incomeCategory.CategoryId)
	assertOverviewShape(t, incomeLeaf.Dataset, httpclient.HouseholdFlowCoreMetricNetIncome, httpclient.HouseholdFlowBreakdownDimensionAccounts)
	assertEntityOverviewMetric(t, "income category leaf nets clawbacks", incomeLeaf.Dataset.TopLine.CurrentMonthTotal, "3.00000000", 0)
	assertMonthlyStack(t, incomeLeaf.Dataset, "2026-08", "net", "3.00000000")

	decimalLimitCategory := client.Scenario().Category("overviewreport:decimal-limit")
	createOverviewSpend(t, client, fixture.semantic, "2026-08-05", decimalLimitCategory.CategoryId, "9999999999.99999999")
	decimalLimit := getCategoryOverview(t, client, decimalLimitCategory.CategoryId)
	assertEntityOverviewMetric(t, "category leaf decimal limit", decimalLimit.Dataset.TopLine.CurrentMonthTotal, "9999999999.99999999", 0)
	assertMonthlyStack(t, decimalLimit.Dataset, "2026-08", "net", "9999999999.99999999")
	createOverviewSpend(t, client, fixture.semantic, "2026-08-06", decimalLimitCategory.CategoryId, "0.00000001")
	overflow, err := client.REST().GetCategoryOverviewWithResponse(context.Background(), decimalLimitCategory.CategoryId, nil)
	requireNoTransportError(t, "get overflowing category overview", err)
	if overflow.StatusCode() != http.StatusInternalServerError {
		t.Fatalf("overflowing category overview status = %d, want %d; body %s", overflow.StatusCode(), http.StatusInternalServerError, overflow.Body)
	}

	categoryGroup := getCategoryGroupOverview(t, client, fixture.categoryGroupFQN)
	assertEntityOverviewMetric(t, "category group current month", categoryGroup.Dataset.TopLine.CurrentMonthTotal, "-468.00000000", 1)
	assertEntityOverviewMetric(t, "category group trailing average", categoryGroup.Dataset.TopLine.TrailingThreeMonthAverage, "-40.00000000", 0)
	assertOverviewShape(t, categoryGroup.Dataset, httpclient.HouseholdFlowCoreMetricNetFlow, httpclient.HouseholdFlowBreakdownDimensionCategories)
	assertBarGroups(t, categoryGroup.Dataset, httpclient.HouseholdFlowBarGroupInflow, httpclient.HouseholdFlowBarGroupOutflow)
	if len(categoryGroup.Dataset.Breakdown) != 6 || !categoryGroup.Dataset.Breakdown[5].IsOther || categoryGroup.Dataset.Breakdown[5].Label != "Other" {
		t.Fatalf("category group breakdown = %+v, want five named series plus Other", categoryGroup.Dataset.Breakdown)
	}
	assertBreakdownLabel(t, categoryGroup.Dataset.Breakdown, fixture.categoryGroupFQN+":nested", "nested")
	assertRankedBreakdown(t, categoryGroup.Dataset.Breakdown,
		fixture.categoryGroupFQN+":one",
		fixture.categoryGroupFQN+":nested",
		fixture.categoryGroupFQN+":two",
		fixture.categoryGroupFQN+":three",
		fixture.categoryGroupFQN+":four",
		"Other",
	)
	assertStacksJoinBreakdown(t, categoryGroup.Dataset)
	assertMonthlyStack(t, categoryGroup.Dataset, "2026-07", "inflow", "20.00000000")
	assertMonthlyStack(t, categoryGroup.Dataset, "2026-07", "outflow", "-100.00000000")
	assertMonthlyBarGroupTotal(t, categoryGroup.Dataset, "2026-07", "inflow", "20.00000000")
	assertMonthlyBarGroupTotal(t, categoryGroup.Dataset, "2026-07", "outflow", "-100.00000000")
	assertMonthlySeriesStack(t, categoryGroup.Dataset, "2026-08", "other", "inflow", "5.00000000")
	assertMonthlySeriesStack(t, categoryGroup.Dataset, "2026-08", "other", "outflow", "-32.00000000")
	assertPreviewExcludesTransactions(t, categoryGroup.Transactions, fixture.categoryFilterExcludedTransactionIDs...)
	assertHiddenCategoryScopeInTransactions(t, client, fixture.categoryGroupFQN, fixture.hiddenCategory.CategoryId, fixture.categoryFilterExcludedTransactionIDs...)

	zeroBaseline := getCategoryOverview(t, client, fixture.hiddenCategory.CategoryId)
	if zeroBaseline.Dataset.TopLine.MonthOverMonth.ChangePercent != nil || zeroBaseline.Dataset.TopLine.YearOverYear.ChangePercent != nil {
		t.Fatalf("zero-baseline category changes = (%v, %v), want unavailable", zeroBaseline.Dataset.TopLine.MonthOverMonth.ChangePercent, zeroBaseline.Dataset.TopLine.YearOverYear.ChangePercent)
	}

	pureExpense := getCategoryGroupOverview(t, client, fixture.pureExpenseGroupFQN)
	assertOverviewShape(t, pureExpense.Dataset, httpclient.HouseholdFlowCoreMetricNetSpend, httpclient.HouseholdFlowBreakdownDimensionCategories)
	assertEntityOverviewMetric(t, "pure expense group nets refunds", pureExpense.Dataset.TopLine.CurrentMonthTotal, "25.00000000", 0)
	assertMonthlyStack(t, pureExpense.Dataset, "2026-08", "net", "25.00000000")

	pureIncome := getCategoryGroupOverview(t, client, fixture.pureIncomeGroupFQN)
	assertOverviewShape(t, pureIncome.Dataset, httpclient.HouseholdFlowCoreMetricNetIncome, httpclient.HouseholdFlowBreakdownDimensionCategories)
	assertEntityOverviewMetric(t, "pure income group nets clawbacks", pureIncome.Dataset.TopLine.CurrentMonthTotal, "50.00000000", 0)
	assertMonthlyStack(t, pureIncome.Dataset, "2026-08", "net", "50.00000000")

	mixedInactive := getCategoryGroupOverview(t, client, fixture.mixedInactiveGroupFQN)
	assertOverviewShape(t, mixedInactive.Dataset, httpclient.HouseholdFlowCoreMetricNetFlow, httpclient.HouseholdFlowBreakdownDimensionCategories)
	assertMonthlyStack(t, mixedInactive.Dataset, "2026-08", "outflow", "-10.00000000")

	tagLeaf := getTagOverview(t, client, fixture.primaryTag.TagId)
	assertEntityOverviewMetric(t, "tag leaf current month", tagLeaf.Dataset.TopLine.CurrentMonthTotal, "-120.00000000", 1)
	assertOverviewShape(t, tagLeaf.Dataset, httpclient.HouseholdFlowCoreMetricNetFlow, httpclient.HouseholdFlowBreakdownDimensionCategories)
	assertRankedBreakdown(t, tagLeaf.Dataset.Breakdown,
		fixture.categoryGroupFQN+":one",
		fixture.categoryGroupFQN+":two",
	)
	assertMonthlyStack(t, tagLeaf.Dataset, "2026-08", "outflow", "-120.00000000")
	assertNoBarGroup(t, tagLeaf.Dataset, "transfer")
	if tagLeaf.Dataset.ExcludedActivity.AdjustmentTransactionCount != 1 || tagLeaf.Dataset.ExcludedActivity.ExchangeTransactionCount != 1 {
		t.Fatalf("tag excluded activity = %+v, want one adjustment and one exchange", tagLeaf.Dataset.ExcludedActivity)
	}
	assertPreviewIncludesTransactions(t, tagLeaf.Transactions, fixture.tagPreviewExcludedTransactionIDs...)

	tagGroup := getTagGroupOverview(t, client, fixture.tagGroupFQN)
	assertEntityOverviewMetric(t, "tag group current month", tagGroup.Dataset.TopLine.CurrentMonthTotal, "-130.00000000", 1)
	assertPreviewExcludesTransactions(t, tagGroup.Transactions, fixture.tagFilterExcludedTransactionIDs...)
	assertHiddenTagScopeInTransactions(t, client, fixture.tagGroupFQN, fixture.hiddenTag.TagId, fixture.tagFilterExcludedTransactionIDs...)

	accountsBreakdown := httpclient.HouseholdFlowBreakdownDimensionAccounts
	yearGrain := httpclient.HouseholdFlowGrainYear
	threeYears := 3
	namedSeriesCount := 7
	rollingAverage := httpclient.HouseholdFlowTrendRollingAverage
	excludedContributorIDs := []string{"configured-exclusion"}
	configuredCategoryLeaf := getCategoryOverviewWithParams(t, client, fixture.categories[0].CategoryId, &httpclient.GetCategoryOverviewParams{
		Breakdown: &accountsBreakdown, Grain: &yearGrain, PeriodCount: &threeYears, NamedSeriesCount: &namedSeriesCount,
		ExcludedContributorId: &excludedContributorIDs, Trend: &rollingAverage,
	})
	configuredCategoryGroup := getCategoryGroupOverviewWithParams(t, client, &httpclient.GetCategoryGroupOverviewParams{
		Fqn: fixture.categoryGroupFQN, Breakdown: &accountsBreakdown, Grain: &yearGrain, PeriodCount: &threeYears, NamedSeriesCount: &namedSeriesCount,
		ExcludedContributorId: &excludedContributorIDs, Trend: &rollingAverage,
	})
	configuredTagLeaf := getTagOverviewWithParams(t, client, fixture.primaryTag.TagId, &httpclient.GetTagOverviewParams{
		Breakdown: &accountsBreakdown, Grain: &yearGrain, PeriodCount: &threeYears, NamedSeriesCount: &namedSeriesCount,
		ExcludedContributorId: &excludedContributorIDs, Trend: &rollingAverage,
	})
	configuredTagGroup := getTagGroupOverviewWithParams(t, client, &httpclient.GetTagGroupOverviewParams{
		Fqn: fixture.tagGroupFQN, Breakdown: &accountsBreakdown, Grain: &yearGrain, PeriodCount: &threeYears, NamedSeriesCount: &namedSeriesCount,
		ExcludedContributorId: &excludedContributorIDs, Trend: &rollingAverage,
	})
	for label, configured := range map[string]httpclient.HouseholdFlowEntityResponse{
		"Category leaf": configuredCategoryLeaf, "Category group": configuredCategoryGroup,
		"Tag leaf": configuredTagLeaf, "Tag group": configuredTagGroup,
	} {
		assertFlowConfiguration(t, configured.Dataset.Configuration, accountsBreakdown, yearGrain, threeYears, namedSeriesCount, rollingAverage)
		if !slices.Equal(configured.Dataset.Configuration.ExcludedContributorIds, excludedContributorIDs) {
			t.Fatalf("%s excluded contributors = %v, want %v", label, configured.Dataset.Configuration.ExcludedContributorIds, excludedContributorIDs)
		}
	}
	firstTransit := client.Scenario().Category("overviewreport:city:Transit")
	secondTransit := client.Scenario().Category("overviewreport:travel:Transit")
	createOverviewTransaction(t, client, "2026-08-14",
		withOverviewTags(balanceRecord(fixture.semantic.checking.AccountId, "USD", "-1000.00"), fixture.primaryTag.TagId),
		withOverviewTags(record(fixture.semantic.merchant.AccountId, firstTransit.CategoryId, "USD", "1000.00"), fixture.primaryTag.TagId),
	)
	createOverviewTransaction(t, client, "2026-08-14",
		withOverviewTags(balanceRecord(fixture.semantic.checking.AccountId, "USD", "-900.00"), fixture.primaryTag.TagId),
		withOverviewTags(record(fixture.semantic.merchant.AccountId, secondTransit.CategoryId, "USD", "900.00"), fixture.primaryTag.TagId),
	)
	collisionBreakdown := getTagOverview(t, client, fixture.primaryTag.TagId).Dataset.Breakdown
	assertBreakdownLabel(t, collisionBreakdown, firstTransit.Fqn, firstTransit.Fqn)
	assertBreakdownLabel(t, collisionBreakdown, secondTransit.Fqn, secondTransit.Fqn)

	lookbackCrypto := client.Scenario().AccountWithCurrency("overviewreport:lookback-crypto", "C::OVR")
	lookbackMerchant := client.Scenario().Account("overviewreport:merchant:lookback-crypto")
	createOverviewTransaction(t, client, "2026-07-12",
		balanceRecord(lookbackCrypto.AccountId, "C::OVR", "-2.00"),
		record(lookbackMerchant.AccountId, fixture.categories[0].CategoryId, "C::OVR", "2.00"),
	)
	conversionReport := getCategoryOverview(t, client, fixture.categories[0].CategoryId).Dataset
	assertPeriodUnconvertedCounts(t, conversionReport, "2026-08", 1, 1, 1)
}

func TestHouseholdFlowRESTContract(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(time.Date(2026, time.August, 15, 12, 0, 0, 0, time.FixedZone("local", -4*60*60)))))
	semantic := newClassificationFixture(t, client)
	expense := client.Scenario().Category("householdflow:expense")
	income := client.Scenario().CategoryWithIntent("householdflow:income", httpclient.CategoryEconomicIntentIncome)

	createOverviewSpend(t, client, semantic, "2026-06-05", expense.CategoryId, "30.00")
	createOverviewSpend(t, client, semantic, "2026-07-05", expense.CategoryId, "60.00")
	createOverviewSpend(t, client, semantic, "2026-08-05", expense.CategoryId, "100.00")
	createOverviewTransaction(t, client, "2026-08-06",
		balanceRecord(semantic.checking.AccountId, "USD", "20.00"),
		record(semantic.merchant.AccountId, expense.CategoryId, "USD", "-20.00"),
	)
	createOverviewTransaction(t, client, "2026-08-07",
		balanceRecord(semantic.checking.AccountId, "USD", "50.00"),
		record(semantic.employer.AccountId, income.CategoryId, "USD", "-50.00"),
	)
	createOverviewTransaction(t, client, "2026-08-08",
		balanceRecord(semantic.checking.AccountId, "USD", "-10.00"),
		record(semantic.employer.AccountId, income.CategoryId, "USD", "10.00"),
	)
	createOverviewTransaction(t, client, "2026-08-09",
		balanceRecord(semantic.checking.AccountId, "USD", "-30.00"),
		balanceRecord(semantic.savings.AccountId, "USD", "30.00"),
	)
	createOverviewTransaction(t, client, "2026-08-10",
		balanceRecord(semantic.checking.AccountId, "USD", "-30.00"),
		record(semantic.merchant.AccountId, expense.CategoryId, "USD", "20.00"),
		balanceRecord(semantic.savings.AccountId, "USD", "10.00"),
	)

	household := getHouseholdFlowReport(t, client)
	assertOverviewShape(t, household, httpclient.HouseholdFlowCoreMetricNetFlow, httpclient.HouseholdFlowBreakdownDimensionCategories)
	assertBarGroups(t, household, httpclient.HouseholdFlowBarGroupInflow, httpclient.HouseholdFlowBarGroupOutflow)
	assertEntityOverviewMetric(t, "household current net flow", household.TopLine.CurrentMonthTotal, "-60.00000000", 0)
	assertComparison(t, "household signed month-over-month", household.TopLine.MonthOverMonth, "2026-07", "2026-06", "-60.00000000", "-30.00000000", "-100.00000000")
	assertRankedBreakdown(t, household.Breakdown, expense.Fqn, income.Fqn)
	assertEntityOverviewMetric(t, "household negative trailing average", household.TopLine.TrailingThreeMonthAverage, "-30.00000000", 0)
	assertMonthlyTrailingAverages(t, household,
		"0.00000000", "0.00000000", "0.00000000", "0.00000000",
		"0.00000000", "0.00000000", "0.00000000", "0.00000000",
		"0.00000000", "0.00000000", "-10.00000000", "-30.00000000",
	)
	assertMonthlyStack(t, household, "2026-08", "inflow", "70.00000000")
	assertMonthlyStack(t, household, "2026-08", "outflow", "-130.00000000")
	assertMonthlyBarGroupTotal(t, household, "2026-08", "inflow", "70.00000000")
	assertMonthlyBarGroupTotal(t, household, "2026-08", "outflow", "-130.00000000")
	assertNoBarGroup(t, household, "transfer")
}

func TestConfigurableHouseholdFlowRESTContract(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(time.Date(2026, time.August, 15, 12, 0, 0, 0, time.FixedZone("local", -4*60*60)))))
	semantic := newClassificationFixture(t, client)
	expense := client.Scenario().Category("configurableflow:expense")
	income := client.Scenario().CategoryWithIntent("configurableflow:income", httpclient.CategoryEconomicIntentIncome)

	createOverviewSpend(t, client, semantic, "2022-03-05", expense.CategoryId, "10.00")
	createOverviewTransaction(t, client, "2024-04-05",
		balanceRecord(semantic.checking.AccountId, "USD", "20.00"),
		record(semantic.employer.AccountId, income.CategoryId, "USD", "-20.00"),
	)
	createOverviewSpend(t, client, semantic, "2025-12-05", expense.CategoryId, "30.00")
	createOverviewTransaction(t, client, "2026-07-05",
		balanceRecord(semantic.checking.AccountId, "USD", "12.00"),
		record(semantic.employer.AccountId, income.CategoryId, "USD", "-12.00"),
	)
	createOverviewTransaction(t, client, "2026-08-05",
		balanceRecord(semantic.checking.AccountId, "USD", "40.00"),
		record(semantic.employer.AccountId, income.CategoryId, "USD", "-40.00"),
	)
	for index, amount := range []string{"1.00", "2.00", "3.00", "4.00", "5.00", "6.00"} {
		category := client.Scenario().Category(fmt.Sprintf("configurableflow:extra:%d", index+1))
		createOverviewSpend(t, client, semantic, "2026-08-06", category.CategoryId, amount)
	}

	defaults := getHouseholdFlowReport(t, client)
	assertFlowConfiguration(t, defaults.Configuration, httpclient.HouseholdFlowBreakdownDimensionCategories, httpclient.HouseholdFlowGrainMonth, 12, 5, httpclient.HouseholdFlowTrendRollingAverage)
	if defaults.Configuration.AnchorPeriod != "2026-08" {
		t.Fatalf("default window anchor = %+v, want 2026-08", defaults.Configuration)
	}
	historyRangeResponse, err := client.REST().GetAccountingHistoryRangeWithResponse(context.Background())
	requireNoTransportError(t, "get accounting history range", err)
	if historyRangeResponse.StatusCode() != http.StatusOK || historyRangeResponse.JSON200 == nil {
		t.Fatalf("accounting history range status = %d, want %d; body %s", historyRangeResponse.StatusCode(), http.StatusOK, historyRangeResponse.Body)
	}
	if got := historyRangeResponse.JSON200; got.StartDate.Format(time.DateOnly) != "2022-03-05" || got.EndDate.Format(time.DateOnly) != "2026-08-15" {
		t.Fatalf("accounting history range = %+v, want 2022-03-05 through 2026-08-15", got)
	}
	if len(defaults.Breakdown) != 6 || !defaults.Breakdown[5].IsOther {
		t.Fatalf("default breakdown = %+v, want five named contributors plus Other", defaults.Breakdown)
	}
	assertMonthlyBarGroupTotal(t, defaults, "2026-08", "inflow", "40.00000000")
	assertMonthlyBarGroupTotal(t, defaults, "2026-08", "outflow", "-21.00000000")
	assertPeriodBarGroupSum(t, defaults, "2026-08", "19.00000000")
	assertPeriodTrend(t, defaults, "2026-08", "4.00000000")

	monthSix := 6
	monthGrain := httpclient.HouseholdFlowGrainMonth
	sixMonths := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{Grain: &monthGrain, PeriodCount: &monthSix})
	if len(sixMonths.Periods) != 6 || sixMonths.Periods[0].Label != "2026-03" || sixMonths.Periods[5].Label != "2026-08" {
		t.Fatalf("six-month periods = %+v, want March through August 2026", sixMonths.Periods)
	}
	monthTwentyFour := 24
	twentyFourMonths := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{Grain: &monthGrain, PeriodCount: &monthTwentyFour})
	if len(twentyFourMonths.Periods) != 24 || twentyFourMonths.Periods[0].Label != "2024-09" {
		t.Fatalf("twenty-four-month periods = %+v, want September 2024 start", twentyFourMonths.Periods)
	}
	anchorDate := httpclient.HouseholdFlowAnchorDate{Time: time.Date(2024, time.April, 20, 0, 0, 0, 0, time.UTC)}
	anchoredMonths := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{
		Grain: &monthGrain, PeriodCount: &monthSix, AnchorDate: &anchorDate,
	})
	assertPeriodLabels(t, anchoredMonths, "2023-11", "2023-12", "2024-01", "2024-02", "2024-03", "2024-04")
	assertPeriodBarGroupSum(t, anchoredMonths, "2024-04", "20.00000000")
	if anchoredMonths.Configuration.AnchorPeriod != "2024-04" {
		t.Fatalf("anchored window = %+v, want anchor 2024-04", anchoredMonths.Configuration)
	}

	yearGrain := httpclient.HouseholdFlowGrainYear
	yearCount := 3
	years := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{Grain: &yearGrain, PeriodCount: &yearCount})
	assertFlowConfiguration(t, years.Configuration, httpclient.HouseholdFlowBreakdownDimensionCategories, httpclient.HouseholdFlowGrainYear, 3, 5, httpclient.HouseholdFlowTrendRollingSum)
	assertPeriodLabels(t, years, "2024", "2025", "2026")
	assertPeriodBarGroupSum(t, years, "2024", "20.00000000")
	assertPeriodBarGroupSum(t, years, "2025", "-30.00000000")
	assertPeriodBarGroupSum(t, years, "2026", "31.00000000")
	assertPeriodTrend(t, years, "2024", "20.00000000")
	assertPeriodTrend(t, years, "2025", "-10.00000000")
	assertPeriodTrend(t, years, "2026", "21.00000000")
	rollingAverage := httpclient.HouseholdFlowTrendRollingAverage
	yearAverages := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{
		Grain: &yearGrain, PeriodCount: &yearCount, Trend: &rollingAverage,
	})
	assertFlowConfiguration(t, yearAverages.Configuration, httpclient.HouseholdFlowBreakdownDimensionCategories, yearGrain, 3, 5, rollingAverage)
	assertPeriodTrend(t, yearAverages, "2026", "-3.33333333")

	fiveYears := 5
	history := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{Grain: &yearGrain, PeriodCount: &fiveYears})
	assertFlowConfiguration(t, history.Configuration, httpclient.HouseholdFlowBreakdownDimensionCategories, httpclient.HouseholdFlowGrainYear, 5, 5, httpclient.HouseholdFlowTrendRollingSum)
	assertPeriodLabels(t, history, "2022", "2023", "2024", "2025", "2026")
	assertPeriodBarGroupSum(t, history, "2023", "0.00000000")
	assertPeriodTrend(t, history, "2026", "11.00000000")

	accountsBreakdown := httpclient.HouseholdFlowBreakdownDimensionAccounts
	byAccounts := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{Breakdown: &accountsBreakdown})
	assertFlowConfiguration(t, byAccounts.Configuration, accountsBreakdown, httpclient.HouseholdFlowGrainMonth, 12, 5, httpclient.HouseholdFlowTrendRollingAverage)
	assertRankedBreakdown(t, byAccounts.Breakdown, semantic.employer.Fqn, semantic.merchant.Fqn)

	namedSeriesCount := 8
	eightNamed := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{NamedSeriesCount: &namedSeriesCount})
	if len(eightNamed.Breakdown) != 8 || slices.ContainsFunc(eightNamed.Breakdown, func(series httpclient.HouseholdFlowBreakdownSeries) bool { return series.IsOther }) {
		t.Fatalf("eight-series breakdown = %+v, want eight named contributors without Other", eightNamed.Breakdown)
	}

	incomeSeriesID := findBreakdownSeriesID(t, defaults.Breakdown, income.Fqn)
	excludedIncome := []string{incomeSeriesID}
	filtered := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{ExcludedContributorId: &excludedIncome})
	assertStableBreakdown(t, defaults.Breakdown, filtered.Breakdown)
	assertPeriodBarGroupSum(t, filtered, "2026-08", "-21.00000000")
	assertPeriodTrend(t, filtered, "2026-08", "0.00000000")
	assertMonthlyBarGroupTotal(t, filtered, "2026-08", "inflow", "0.00000000")
	assertMonthlyBarGroupTotal(t, filtered, "2026-08", "outflow", "-21.00000000")
	assertEntityOverviewMetric(t, "filtered report keeps whole-scope top line", filtered.TopLine.CurrentMonthTotal, "19.00000000", 0)
	filteredYears := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{
		ExcludedContributorId: &excludedIncome, Grain: &yearGrain, PeriodCount: &yearCount,
	})
	assertPeriodBarGroupSum(t, filteredYears, "2026", "-21.00000000")
	assertPeriodTrend(t, filteredYears, "2026", "-51.00000000")

	excludeAll := make([]string, 0, len(defaults.Breakdown))
	for _, series := range defaults.Breakdown {
		excludeAll = append(excludeAll, series.SeriesId)
	}
	fullyFiltered := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{ExcludedContributorId: &excludeAll})
	assertStableBreakdown(t, defaults.Breakdown, fullyFiltered.Breakdown)
	for _, period := range fullyFiltered.Periods {
		if period.Trend.AmountUsd != "0.00000000" || period.Trend.UnconvertedCount != 0 || len(period.Stacks) != 0 {
			t.Fatalf("fully filtered period = %+v, want zero totals/trend/disclosure and no stacks", period)
		}
		for _, total := range period.BarGroupTotals {
			if total.AmountUsd != "0.00000000" || total.UnconvertedCount != 0 {
				t.Fatalf("fully filtered bar-group total = %+v, want zero", total)
			}
		}
	}
	lookbackOnly := client.Scenario().Category("configurableflow:lookback-only")
	createOverviewSpend(t, client, semantic, "2026-01-05", lookbackOnly.CategoryId, "9.00")
	wideSeriesCount := 20
	lookbackDataset := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{
		Grain: &monthGrain, PeriodCount: &monthSix, NamedSeriesCount: &wideSeriesCount,
	})
	if !slices.ContainsFunc(lookbackDataset.Breakdown, func(series httpclient.HouseholdFlowBreakdownSeries) bool { return series.IsOther }) {
		t.Fatalf("lookback breakdown = %+v, want Other for contributors active only before the visible range", lookbackDataset.Breakdown)
	}
	assertPeriodTrend(t, lookbackDataset, "2026-03", "-13.00000000")
	excludeLookbackDataset := make([]string, 0, len(lookbackDataset.Breakdown))
	for _, series := range lookbackDataset.Breakdown {
		excludeLookbackDataset = append(excludeLookbackDataset, series.SeriesId)
	}
	fullyFilteredLookback := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{
		Grain: &monthGrain, PeriodCount: &monthSix, NamedSeriesCount: &wideSeriesCount, ExcludedContributorId: &excludeLookbackDataset,
	})
	for _, period := range fullyFilteredLookback.Periods {
		if period.Trend.AmountUsd != "0.00000000" || period.Trend.UnconvertedCount != 0 {
			t.Fatalf("fully filtered lookback trend = %+v, want zero", period.Trend)
		}
	}

	categoryBreakdown := httpclient.HouseholdFlowBreakdownDimensionCategories
	invalidCategoryLeaf, err := client.REST().GetCategoryOverviewWithResponse(context.Background(), expense.CategoryId, &httpclient.GetCategoryOverviewParams{Breakdown: &categoryBreakdown})
	requireNoTransportError(t, "get invalid Category-leaf breakdown", err)
	assertStatus(t, "Category-leaf Categories breakdown", invalidCategoryLeaf.StatusCode(), http.StatusBadRequest, invalidCategoryLeaf.Body)
	monthFive := 5
	invalidMonth, err := client.REST().GetHouseholdFlowReportWithResponse(context.Background(), &httpclient.GetHouseholdFlowReportParams{Grain: &monthGrain, PeriodCount: &monthFive})
	requireNoTransportError(t, "get invalid month range", err)
	assertStatus(t, "five-month range", invalidMonth.StatusCode(), http.StatusBadRequest, invalidMonth.Body)
	futureAnchor := httpclient.HouseholdFlowAnchorDate{Time: time.Date(2026, time.August, 16, 0, 0, 0, 0, time.UTC)}
	invalidFutureAnchor, err := client.REST().GetHouseholdFlowReportWithResponse(context.Background(), &httpclient.GetHouseholdFlowReportParams{AnchorDate: &futureAnchor})
	requireNoTransportError(t, "get future flow anchor", err)
	assertStatus(t, "future flow anchor", invalidFutureAnchor.StatusCode(), http.StatusBadRequest, invalidFutureAnchor.Body)
	longYearCount := 2027
	longYears := getHouseholdFlowReportWithParams(t, client, &httpclient.GetHouseholdFlowReportParams{Grain: &yearGrain, PeriodCount: &longYearCount})
	assertFlowConfiguration(t, longYears.Configuration, httpclient.HouseholdFlowBreakdownDimensionCategories, yearGrain, longYearCount, 5, httpclient.HouseholdFlowTrendRollingSum)
	if len(longYears.Periods) != longYearCount || longYears.Periods[len(longYears.Periods)-1].Label != "2026" {
		t.Fatalf("long year range has %d periods ending %q, want %d periods ending 2026", len(longYears.Periods), longYears.Periods[len(longYears.Periods)-1].Label, longYearCount)
	}
}

func TestHouseholdFlowRollingAverageKeepsDecimalPrecision(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(time.Date(2026, time.August, 15, 12, 0, 0, 0, time.UTC))))
	semantic := newClassificationFixture(t, client)
	mayExpense := client.Scenario().Category("householdflow:decimal-average:may")
	juneExpense := client.Scenario().Category("householdflow:decimal-average:june")
	julyExpense := client.Scenario().Category("householdflow:decimal-average:july")

	createOverviewSpend(t, client, semantic, "2026-05-05", mayExpense.CategoryId, "9999999999.99999999")
	createOverviewSpend(t, client, semantic, "2026-06-05", juneExpense.CategoryId, "9999999999.99999998")
	createOverviewSpend(t, client, semantic, "2026-07-05", julyExpense.CategoryId, "9999999999.99999997")

	report := getHouseholdFlowReport(t, client)
	assertEntityOverviewMetric(t, "decimal-limit trailing average", report.TopLine.TrailingThreeMonthAverage, "-9999999999.99999998", 0)
	assertPeriodTrend(t, report, "2026-08", "-9999999999.99999998")
}

func TestHouseholdFlowComparisonKeepsDecimalPrecision(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(time.Date(2026, time.August, 15, 12, 0, 0, 0, time.UTC))))
	semantic := newClassificationFixture(t, client)
	expense := client.Scenario().Category("householdflow:decimal-comparison")

	createOverviewSpend(t, client, semantic, "2026-06-05", expense.CategoryId, "0.00000003")
	createOverviewSpend(t, client, semantic, "2026-07-05", expense.CategoryId, "2.99999999")

	report := getCategoryOverview(t, client, expense.CategoryId)
	assertComparison(t, "exact decimal month-over-month", report.Dataset.TopLine.MonthOverMonth, "2026-07", "2026-06", "2.99999999", "0.00000003", "9999999866.66666667")
}

func TestEntityOverviewExplicitUSDSign(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(time.Date(2026, time.August, 15, 12, 0, 0, 0, time.FixedZone("local", -4*60*60)))))
	semantic := newClassificationFixture(t, client)
	expense := client.Scenario().Category("overviewreport:explicit-usd-sign")
	tag := client.Scenario().Tag("overviewreport:explicit-usd-sign")

	flowRecord := withOverviewTags(record(semantic.merchant.AccountId, expense.CategoryId, "USD", "10.00"), tag.TagId)
	flowRecord.AmountUsd = apptest.StringPtr("-10.00")
	createOverviewTransaction(t, client, "2026-08-05",
		balanceRecord(semantic.checking.AccountId, "USD", "-10.00"),
		flowRecord,
	)

	expenseReport := getCategoryOverview(t, client, expense.CategoryId).Dataset
	assertEntityOverviewMetric(t, "expense with opposite-signed explicit USD", expenseReport.TopLine.CurrentMonthTotal, "10.00000000", 0)
	assertMonthlyStack(t, expenseReport, "2026-08", "net", "10.00000000")

	mixedReport := getTagOverview(t, client, tag.TagId).Dataset
	assertEntityOverviewMetric(t, "mixed flow with opposite-signed explicit USD", mixedReport.TopLine.CurrentMonthTotal, "-10.00000000", 0)
	assertMonthlyStack(t, mixedReport, "2026-08", "outflow", "-10.00000000")
}

func TestTagOverviewUsesWholeTransactionAttribution(t *testing.T) {
	client := newSharedClient(t, apptest.WithClock(apptest.NewFakeClock(time.Date(2026, time.August, 15, 12, 0, 0, 0, time.FixedZone("local", -4*60*60)))))
	semantic := newClassificationFixture(t, client)
	expense := client.Scenario().Category("overviewreport:whole-transaction-tag")
	tag := client.Scenario().Tag("overviewreport:whole-transaction-tag")

	createOverviewTransaction(t, client, "2026-08-05",
		withOverviewTags(balanceRecord(semantic.checking.AccountId, "USD", "-12.00"), tag.TagId),
		record(semantic.merchant.AccountId, expense.CategoryId, "USD", "12.00"),
	)

	report := getTagOverview(t, client, tag.TagId).Dataset
	assertEntityOverviewMetric(t, "whole matched tagged transaction", report.TopLine.CurrentMonthTotal, "-12.00000000", 0)
	assertMonthlyStack(t, report, "2026-08", "outflow", "-12.00000000")
}

type entityOverviewFixture struct {
	semantic                             classificationFixture
	categories                           []httpclient.Category
	hiddenCategory                       httpclient.Category
	incomeCategory                       httpclient.Category
	primaryTag                           httpclient.Tag
	hiddenTag                            httpclient.Tag
	categoryGroupFQN                     string
	tagGroupFQN                          string
	pureExpenseGroupFQN                  string
	pureIncomeGroupFQN                   string
	mixedInactiveGroupFQN                string
	categoryFilterExcludedTransactionIDs []int64
	tagFilterExcludedTransactionIDs      []int64
	tagPreviewExcludedTransactionIDs     []int64
}

func newEntityOverviewFixture(t *testing.T, client *apptest.Client) entityOverviewFixture {
	t.Helper()
	scenario := client.Scenario()
	semantic := newClassificationFixture(t, client)
	categoryGroup := "overviewreport:categories"
	categories := []httpclient.Category{
		scenario.Category(categoryGroup + ":one"),
		scenario.Category(categoryGroup + ":two"),
		scenario.Category(categoryGroup + ":three"),
		scenario.Category(categoryGroup + ":four"),
		scenario.Category(categoryGroup + ":five"),
	}
	hiddenCategory := scenario.CategoryWithHidden(categoryGroup+":six", true)
	categories = append(categories, hiddenCategory)
	incomeCategory := scenario.CategoryWithIntent(categoryGroup+":income", httpclient.CategoryEconomicIntentIncome)
	categories = append(categories, incomeCategory)
	nestedCategoryOne := scenario.Category(categoryGroup + ":nested:one")
	nestedCategoryTwo := scenario.Category(categoryGroup + ":nested:two")

	tagGroup := "overviewreport:tags"
	primaryTag := scenario.Tag(tagGroup + ":primary")
	hidden := true
	hiddenTagResponse, err := client.REST().CreateTagWithResponse(context.Background(), httpclient.CreateTagRequest{Fqn: tagGroup + ":hidden", IsHidden: &hidden})
	requireNoTransportError(t, "create hidden overview tag", err)
	if hiddenTagResponse.StatusCode() != http.StatusCreated {
		t.Fatalf("create hidden overview tag status = %d, want %d; body %s", hiddenTagResponse.StatusCode(), http.StatusCreated, hiddenTagResponse.Body)
	}
	hiddenTag := *hiddenTagResponse.JSON201

	createOverviewTransaction(t, client, "2026-08-10",
		withOverviewTags(balanceRecord(semantic.checking.AccountId, "USD", "-100.00"), primaryTag.TagId),
		withOverviewTags(record(semantic.merchant.AccountId, categories[0].CategoryId, "USD", "60.00"), primaryTag.TagId),
		withOverviewTags(record(semantic.feeProvider.AccountId, categories[1].CategoryId, "USD", "40.00"), primaryTag.TagId, hiddenTag.TagId),
	)
	createOverviewTransaction(t, client, "2026-08-20",
		balanceRecord(semantic.checking.AccountId, "USD", "-999.00"),
		record(semantic.merchant.AccountId, categories[0].CategoryId, "USD", "999.00"),
	)
	createOverviewSpend(t, client, semantic, "2026-07-05", categories[0].CategoryId, "100.00")
	createOverviewTransaction(t, client, "2026-07-06",
		balanceRecord(semantic.checking.AccountId, "USD", "20.00"),
		record(semantic.merchant.AccountId, categories[0].CategoryId, "USD", "-20.00"),
	)
	createOverviewSpend(t, client, semantic, "2026-06-05", categories[0].CategoryId, "40.00")
	createOverviewSpend(t, client, semantic, "2025-07-05", categories[0].CategoryId, "20.00")
	createOverviewSpend(t, client, semantic, "2026-08-11", categories[1].CategoryId, "50.00")
	createOverviewSpend(t, client, semantic, "2026-08-11", categories[2].CategoryId, "40.00")
	createOverviewSpend(t, client, semantic, "2026-08-11", categories[3].CategoryId, "30.00")
	createOverviewSpend(t, client, semantic, "2026-08-11", categories[4].CategoryId, "20.00")
	createOverviewTransaction(t, client, "2026-08-11",
		withOverviewTags(balanceRecord(semantic.checking.AccountId, "USD", "-10.00"), hiddenTag.TagId),
		withOverviewTags(record(semantic.merchant.AccountId, hiddenCategory.CategoryId, "USD", "10.00"), hiddenTag.TagId),
	)
	createOverviewSpend(t, client, semantic, "2026-08-12", nestedCategoryOne.CategoryId, "200.00")
	createOverviewSpend(t, client, semantic, "2026-08-12", nestedCategoryTwo.CategoryId, "1.00")
	createOverviewTransaction(t, client, "2026-08-11",
		balanceRecord(semantic.checking.AccountId, "USD", "5.00"),
		record(semantic.employer.AccountId, incomeCategory.CategoryId, "USD", "-5.00"),
	)
	createOverviewTransaction(t, client, "2026-08-11",
		balanceRecord(semantic.checking.AccountId, "USD", "-2.00"),
		record(semantic.employer.AccountId, incomeCategory.CategoryId, "USD", "2.00"),
	)

	crypto := scenario.AccountWithCurrency("overviewreport:crypto", "C::OVR")
	cryptoMerchant := scenario.Account("overviewreport:merchant:crypto")
	createOverviewTransaction(t, client, "2026-08-12",
		withOverviewTags(balanceRecord(crypto.AccountId, "C::OVR", "-2.00"), primaryTag.TagId),
		withOverviewTags(record(cryptoMerchant.AccountId, categories[0].CategoryId, "C::OVR", "2.00"), primaryTag.TagId),
	)
	transferOnlyTransaction := createOverviewTransaction(t, client, "2026-08-13",
		withOverviewTags(balanceRecord(semantic.checking.AccountId, "USD", "-30.00"), primaryTag.TagId),
		withOverviewTags(balanceRecord(semantic.savings.AccountId, "USD", "30.00"), primaryTag.TagId),
	)
	economicPlusTransferTransaction := createOverviewTransaction(t, client, "2026-08-13",
		withOverviewTags(balanceRecord(semantic.checking.AccountId, "USD", "-30.00"), primaryTag.TagId),
		withOverviewTags(record(semantic.merchant.AccountId, categories[0].CategoryId, "USD", "20.00"), primaryTag.TagId),
		withOverviewTags(balanceRecord(semantic.savings.AccountId, "USD", "10.00"), primaryTag.TagId),
	)
	adjustmentTransaction := createOverviewTransaction(t, client, "2026-08-13",
		withOverviewTags(balanceRecord(semantic.checking.AccountId, "USD", "7.00"), primaryTag.TagId),
		withOverviewTags(semanticRecordWithoutSettlement(semantic.correctionSystem.AccountId, "-7.00", "USD", nil), primaryTag.TagId),
	)
	createOverviewTransaction(t, client, "2025-07-13",
		withOverviewTags(balanceRecord(semantic.checking.AccountId, "USD", "8.00"), primaryTag.TagId),
		withOverviewTags(semanticRecordWithoutSettlement(semantic.correctionSystem.AccountId, "-8.00", "USD", nil), primaryTag.TagId),
	)
	exchange := exchangeClassificationRequest(semantic)
	for index := range exchange.Records {
		exchange.Records[index] = withOverviewTags(exchange.Records[index], primaryTag.TagId)
	}
	exchangeTransaction := createOverviewTransaction(t, client, "2026-08-14", exchange.Records...)
	createOverviewTransaction(t, client, "2025-07-14", exchange.Records...)

	pureExpenseGroup := "overviewreport:pure-expense"
	pureExpense := scenario.Category(pureExpenseGroup + ":active")
	scenario.CategoryWithHidden(pureExpenseGroup+":hidden-inactive", true)
	createOverviewSpend(t, client, semantic, "2026-08-05", pureExpense.CategoryId, "40.00")
	createOverviewTransaction(t, client, "2026-08-06",
		balanceRecord(semantic.checking.AccountId, "USD", "15.00"),
		record(semantic.merchant.AccountId, pureExpense.CategoryId, "USD", "-15.00"),
	)

	pureIncomeGroup := "overviewreport:pure-income"
	pureIncome := scenario.CategoryWithIntent(pureIncomeGroup+":active", httpclient.CategoryEconomicIntentIncome)
	createHiddenCategoryWithIntent(t, client, pureIncomeGroup+":hidden-inactive", httpclient.CategoryEconomicIntentIncome)
	createOverviewTransaction(t, client, "2026-08-07",
		balanceRecord(semantic.checking.AccountId, "USD", "70.00"),
		record(semantic.employer.AccountId, pureIncome.CategoryId, "USD", "-70.00"),
	)
	createOverviewTransaction(t, client, "2026-08-08",
		balanceRecord(semantic.checking.AccountId, "USD", "-20.00"),
		record(semantic.employer.AccountId, pureIncome.CategoryId, "USD", "20.00"),
	)

	mixedInactiveGroup := "overviewreport:mixed-inactive"
	mixedExpense := scenario.Category(mixedInactiveGroup + ":expense")
	createHiddenCategoryWithIntent(t, client, mixedInactiveGroup+":nested:hidden-income", httpclient.CategoryEconomicIntentIncome)
	createOverviewSpend(t, client, semantic, "2026-08-09", mixedExpense.CategoryId, "10.00")

	unrelatedCategory := scenario.Category("overviewreport:unrelated")
	siblingCategory := scenario.Category(categoryGroup + "-sibling:leaf")
	unrelatedCategoryTransaction := createOverviewTransaction(t, client, "2026-08-14",
		balanceRecord(semantic.checking.AccountId, "USD", "-3.00"),
		record(semantic.merchant.AccountId, unrelatedCategory.CategoryId, "USD", "3.00"),
	)
	siblingCategoryTransaction := createOverviewTransaction(t, client, "2026-08-14",
		balanceRecord(semantic.checking.AccountId, "USD", "-4.00"),
		record(semantic.merchant.AccountId, siblingCategory.CategoryId, "USD", "4.00"),
	)
	unrelatedTag := scenario.Tag("overviewreport:unrelated-tag")
	siblingTag := scenario.Tag(tagGroup + "-sibling:leaf")
	unrelatedTagTransaction := createOverviewTransaction(t, client, "2026-08-14",
		withOverviewTags(balanceRecord(semantic.checking.AccountId, "USD", "-5.00"), unrelatedTag.TagId),
		withOverviewTags(record(semantic.merchant.AccountId, unrelatedCategory.CategoryId, "USD", "5.00"), unrelatedTag.TagId),
	)
	siblingTagTransaction := createOverviewTransaction(t, client, "2026-08-14",
		withOverviewTags(balanceRecord(semantic.checking.AccountId, "USD", "-6.00"), siblingTag.TagId),
		withOverviewTags(record(semantic.merchant.AccountId, unrelatedCategory.CategoryId, "USD", "6.00"), siblingTag.TagId),
	)

	return entityOverviewFixture{
		semantic: semantic, categories: categories, hiddenCategory: hiddenCategory, incomeCategory: incomeCategory, primaryTag: primaryTag, hiddenTag: hiddenTag,
		categoryGroupFQN: categoryGroup, tagGroupFQN: tagGroup, pureExpenseGroupFQN: pureExpenseGroup,
		pureIncomeGroupFQN: pureIncomeGroup, mixedInactiveGroupFQN: mixedInactiveGroup,
		categoryFilterExcludedTransactionIDs: []int64{unrelatedCategoryTransaction.TransactionId, siblingCategoryTransaction.TransactionId},
		tagFilterExcludedTransactionIDs:      []int64{unrelatedTagTransaction.TransactionId, siblingTagTransaction.TransactionId},
		tagPreviewExcludedTransactionIDs: []int64{
			transferOnlyTransaction.TransactionId, economicPlusTransferTransaction.TransactionId,
			adjustmentTransaction.TransactionId, exchangeTransaction.TransactionId,
		},
	}
}

func createHiddenCategoryWithIntent(t *testing.T, client *apptest.Client, fqn string, intent httpclient.CategoryEconomicIntent) httpclient.Category {
	t.Helper()
	hidden := true
	response, err := client.REST().CreateCategoryWithResponse(context.Background(), httpclient.CreateCategoryRequest{
		Fqn: fqn, EconomicIntent: intent, IsHidden: &hidden,
	})
	requireNoTransportError(t, "create hidden category", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create hidden category status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}
	return *response.JSON201
}

func createOverviewSpend(t *testing.T, client *apptest.Client, fixture classificationFixture, date string, categoryID int64, amount string) {
	t.Helper()
	createOverviewTransaction(t, client, date,
		balanceRecord(fixture.checking.AccountId, "USD", "-"+amount),
		record(fixture.merchant.AccountId, categoryID, "USD", amount),
	)
}

func createOverviewTransaction(t *testing.T, client *apptest.Client, date string, records ...httpclient.CreateJournalRecordRequest) httpclient.Transaction {
	t.Helper()
	request := classificationRequest(records...)
	request.InitiatedDate = apptest.Date(date)
	response, err := client.REST().CreateTransactionWithResponse(context.Background(), request)
	requireNoTransportError(t, "create overview transaction", err)
	if response.StatusCode() != http.StatusCreated {
		t.Fatalf("create overview transaction status = %d, want %d; body %s", response.StatusCode(), http.StatusCreated, response.Body)
	}
	return *response.JSON201
}

func withOverviewTags(record httpclient.CreateJournalRecordRequest, tagIDs ...int64) httpclient.CreateJournalRecordRequest {
	record.TagIds = apptest.Int64SlicePtr(tagIDs...)
	return record
}

func getCategoryOverview(t *testing.T, client *apptest.Client, id int64) httpclient.HouseholdFlowEntityResponse {
	return getCategoryOverviewWithParams(t, client, id, nil)
}

func getCategoryOverviewWithParams(t *testing.T, client *apptest.Client, id int64, params *httpclient.GetCategoryOverviewParams) httpclient.HouseholdFlowEntityResponse {
	t.Helper()
	response, err := client.REST().GetCategoryOverviewWithResponse(context.Background(), id, params)
	requireNoTransportError(t, "get category overview", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("category overview status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return *response.JSON200
}

func getCategoryGroupOverview(t *testing.T, client *apptest.Client, fqn string) httpclient.HouseholdFlowEntityResponse {
	return getCategoryGroupOverviewWithParams(t, client, &httpclient.GetCategoryGroupOverviewParams{Fqn: fqn})
}

func getCategoryGroupOverviewWithParams(t *testing.T, client *apptest.Client, params *httpclient.GetCategoryGroupOverviewParams) httpclient.HouseholdFlowEntityResponse {
	t.Helper()
	response, err := client.REST().GetCategoryGroupOverviewWithResponse(context.Background(), params)
	requireNoTransportError(t, "get category group overview", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("category group overview status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return *response.JSON200
}

func getTagOverview(t *testing.T, client *apptest.Client, id int64) httpclient.HouseholdFlowEntityResponse {
	return getTagOverviewWithParams(t, client, id, nil)
}

func getTagOverviewWithParams(t *testing.T, client *apptest.Client, id int64, params *httpclient.GetTagOverviewParams) httpclient.HouseholdFlowEntityResponse {
	t.Helper()
	response, err := client.REST().GetTagOverviewWithResponse(context.Background(), id, params)
	requireNoTransportError(t, "get tag overview", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("tag overview status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return *response.JSON200
}

func getTagGroupOverview(t *testing.T, client *apptest.Client, fqn string) httpclient.HouseholdFlowEntityResponse {
	return getTagGroupOverviewWithParams(t, client, &httpclient.GetTagGroupOverviewParams{Fqn: fqn})
}

func getTagGroupOverviewWithParams(t *testing.T, client *apptest.Client, params *httpclient.GetTagGroupOverviewParams) httpclient.HouseholdFlowEntityResponse {
	t.Helper()
	response, err := client.REST().GetTagGroupOverviewWithResponse(context.Background(), params)
	requireNoTransportError(t, "get tag group overview", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("tag group overview status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return *response.JSON200
}

func getHouseholdFlowReport(t *testing.T, client *apptest.Client) httpclient.HouseholdFlowDataset {
	return getHouseholdFlowReportWithParams(t, client, nil)
}

func getHouseholdFlowReportWithParams(t *testing.T, client *apptest.Client, params *httpclient.GetHouseholdFlowReportParams) httpclient.HouseholdFlowDataset {
	t.Helper()
	response, err := client.REST().GetHouseholdFlowReportWithResponse(context.Background(), params)
	requireNoTransportError(t, "get household flow report", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("household flow report status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	return *response.JSON200
}

func assertFlowConfiguration(
	t *testing.T,
	got httpclient.HouseholdFlowConfiguration,
	breakdown httpclient.HouseholdFlowBreakdownDimension,
	grain httpclient.HouseholdFlowGrain,
	periodCount int,
	namedSeriesCount int,
	trend httpclient.HouseholdFlowTrend,
) {
	t.Helper()
	if got.BreakdownDimension != breakdown || got.Grain != grain || got.PeriodCount != periodCount || got.NamedSeriesCount != namedSeriesCount || got.Trend != trend {
		t.Fatalf("flow configuration = %+v, want breakdown=%s grain=%s periods=%d named=%d trend=%s", got, breakdown, grain, periodCount, namedSeriesCount, trend)
	}
}

func assertPeriodLabels(t *testing.T, report httpclient.HouseholdFlowDataset, want ...string) {
	t.Helper()
	got := make([]string, 0, len(report.Periods))
	for _, period := range report.Periods {
		got = append(got, period.Label)
	}
	if !slices.Equal(got, want) {
		t.Fatalf("flow period labels = %v, want %v", got, want)
	}
}

func assertPeriodBarGroupSum(t *testing.T, report httpclient.HouseholdFlowDataset, label, want string) {
	t.Helper()
	for _, period := range report.Periods {
		if period.Label == label {
			total := new(big.Rat)
			for _, group := range period.BarGroupTotals {
				parsed, ok := new(big.Rat).SetString(group.AmountUsd)
				if !ok {
					t.Fatalf("parse bar-group total %q", group.AmountUsd)
				}
				total.Add(total, parsed)
			}
			if got := total.FloatString(8); got != want {
				t.Fatalf("%s bar-group sum = %s, want %s", label, got, want)
			}
			return
		}
	}
	t.Fatalf("flow period %s not found", label)
}

func assertPeriodTrend(t *testing.T, report httpclient.HouseholdFlowDataset, label, want string) {
	t.Helper()
	for _, period := range report.Periods {
		if period.Label == label {
			if period.Trend.AmountUsd != want {
				t.Fatalf("%s period trend = %s, want %s", label, period.Trend.AmountUsd, want)
			}
			return
		}
	}
	t.Fatalf("flow period %s not found", label)
}

func assertPeriodUnconvertedCounts(t *testing.T, report httpclient.HouseholdFlowDataset, label string, wantTrend, wantBarGroups, wantStacks int64) {
	t.Helper()
	for _, period := range report.Periods {
		if period.Label != label {
			continue
		}
		var barGroupCount int64
		for _, total := range period.BarGroupTotals {
			barGroupCount += total.UnconvertedCount
		}
		var stackCount int64
		for _, stack := range period.Stacks {
			stackCount += stack.UnconvertedCount
		}
		if period.Trend.UnconvertedCount != wantTrend || barGroupCount != wantBarGroups || stackCount != wantStacks {
			t.Fatalf("%s unconverted counts = trend %d groups %d stacks %d, want %d/%d/%d", label, period.Trend.UnconvertedCount, barGroupCount, stackCount, wantTrend, wantBarGroups, wantStacks)
		}
		return
	}
	t.Fatalf("flow period %s not found", label)
}

func findBreakdownSeriesID(t *testing.T, breakdown []httpclient.HouseholdFlowBreakdownSeries, fqn string) string {
	t.Helper()
	for _, series := range breakdown {
		if series.Fqn != nil && *series.Fqn == fqn {
			return series.SeriesId
		}
	}
	t.Fatalf("flow breakdown omitted %q: %+v", fqn, breakdown)
	return ""
}

func assertStableBreakdown(t *testing.T, before, after []httpclient.HouseholdFlowBreakdownSeries) {
	t.Helper()
	if len(before) != len(after) {
		t.Fatalf("filtered breakdown length = %d, want stable %d; before=%+v after=%+v", len(after), len(before), before, after)
	}
	for index := range before {
		if before[index].SeriesId != after[index].SeriesId || before[index].Rank != after[index].Rank || before[index].IsOther != after[index].IsOther {
			t.Fatalf("filtered breakdown changed at %d: before=%+v after=%+v", index, before[index], after[index])
		}
	}
}

func assertStatus(t *testing.T, label string, got, want int, body []byte) {
	t.Helper()
	if got != want {
		t.Fatalf("%s status = %d, want %d; body %s", label, got, want, body)
	}
}

func assertEntityOverviewErrorResponses(t *testing.T, client *apptest.Client) {
	t.Helper()
	categoryLeaf, err := client.REST().GetCategoryOverviewWithResponse(context.Background(), 999999999, nil)
	requireNoTransportError(t, "get unknown category overview", err)
	if categoryLeaf.StatusCode() != http.StatusNotFound {
		t.Fatalf("unknown category overview status = %d, want %d; body %s", categoryLeaf.StatusCode(), http.StatusNotFound, categoryLeaf.Body)
	}

	tagLeaf, err := client.REST().GetTagOverviewWithResponse(context.Background(), 999999999, nil)
	requireNoTransportError(t, "get unknown tag overview", err)
	if tagLeaf.StatusCode() != http.StatusNotFound {
		t.Fatalf("unknown tag overview status = %d, want %d; body %s", tagLeaf.StatusCode(), http.StatusNotFound, tagLeaf.Body)
	}

	for _, tc := range []struct {
		name       string
		fqn        string
		wantStatus int
	}{
		{name: "missing", fqn: "overviewreport:missing", wantStatus: http.StatusNotFound},
		{name: "malformed", fqn: " overviewreport:categories", wantStatus: http.StatusBadRequest},
	} {
		categoryGroup, err := client.REST().GetCategoryGroupOverviewWithResponse(context.Background(), &httpclient.GetCategoryGroupOverviewParams{Fqn: tc.fqn})
		requireNoTransportError(t, "get "+tc.name+" category group overview", err)
		if categoryGroup.StatusCode() != tc.wantStatus {
			t.Fatalf("%s category group overview status = %d, want %d; body %s", tc.name, categoryGroup.StatusCode(), tc.wantStatus, categoryGroup.Body)
		}

		tagGroup, err := client.REST().GetTagGroupOverviewWithResponse(context.Background(), &httpclient.GetTagGroupOverviewParams{Fqn: tc.fqn})
		requireNoTransportError(t, "get "+tc.name+" tag group overview", err)
		if tagGroup.StatusCode() != tc.wantStatus {
			t.Fatalf("%s tag group overview status = %d, want %d; body %s", tc.name, tagGroup.StatusCode(), tc.wantStatus, tagGroup.Body)
		}
	}
}

func assertEntityOverviewMetric(t *testing.T, label string, got httpclient.HouseholdFlowMetricValue, wantAmount string, wantUnconverted int64) {
	t.Helper()
	if got.AmountUsd != wantAmount || got.UnconvertedCount != wantUnconverted {
		t.Fatalf("%s = (%s, %d), want (%s, %d)", label, got.AmountUsd, got.UnconvertedCount, wantAmount, wantUnconverted)
	}
}

func assertComparison(t *testing.T, label string, got httpclient.HouseholdFlowComparison, wantCurrentMonth, wantBaselineMonth, wantCurrent, wantBaseline, wantPercent string) {
	t.Helper()
	if got.CurrentMonth != wantCurrentMonth || got.BaselineMonth != wantBaselineMonth || got.Current.AmountUsd != wantCurrent || got.Baseline.AmountUsd != wantBaseline || got.ChangePercent == nil || *got.ChangePercent != wantPercent {
		t.Fatalf("%s = %+v, want months %s/%s values %s/%s change %s", label, got, wantCurrentMonth, wantBaselineMonth, wantCurrent, wantBaseline, wantPercent)
	}
}

func assertOverviewShape(t *testing.T, report httpclient.HouseholdFlowDataset, metric httpclient.HouseholdFlowCoreMetric, breakdown httpclient.HouseholdFlowBreakdownDimension) {
	t.Helper()
	if report.Configuration.CoreMetric != metric || report.Configuration.BreakdownDimension != breakdown {
		t.Fatalf("overview configuration = %+v, want metric %s breakdown %s", report.Configuration, metric, breakdown)
	}
	assertFlowConfiguration(t, report.Configuration, breakdown, httpclient.HouseholdFlowGrainMonth, 12, 5, httpclient.HouseholdFlowTrendRollingAverage)
	if len(report.Configuration.ExcludedContributorIds) != 0 {
		t.Fatalf("default excluded contributors = %v, want none", report.Configuration.ExcludedContributorIds)
	}
	if len(report.Periods) != 12 || report.Periods[0].Label != "2025-09" || report.Periods[11].Label != "2026-08" || !report.Periods[11].IsCurrent {
		t.Fatalf("overview months = %+v, want twelve September 2025 through current August 2026", report.Periods)
	}
	if report.Periods[8].Label != "2026-05" {
		t.Fatalf("zero month = %+v, want 2026-05 zero", report.Periods[8])
	}
	assertPeriodBarGroupSum(t, report, "2026-05", "0.00000000")
}

func assertBarGroups(t *testing.T, report httpclient.HouseholdFlowDataset, want ...httpclient.HouseholdFlowBarGroup) {
	t.Helper()
	if !slices.Equal(report.Configuration.BarGroups, want) {
		t.Fatalf("overview bar groups = %v, want %v", report.Configuration.BarGroups, want)
	}
}

func assertMonthlyStack(t *testing.T, report httpclient.HouseholdFlowDataset, month, barGroup, amount string) {
	t.Helper()
	for _, bucket := range report.Periods {
		if bucket.Label != month {
			continue
		}
		total := new(big.Rat)
		for _, stack := range bucket.Stacks {
			if string(stack.BarGroup) == barGroup {
				parsed, ok := new(big.Rat).SetString(stack.AmountUsd)
				if !ok {
					t.Fatalf("parse stack amount %q", stack.AmountUsd)
				}
				total.Add(total, parsed)
			}
		}
		got := total.FloatString(8)
		if got != amount {
			t.Fatalf("%s %s stack total = %s, want %s; stacks %+v", month, barGroup, got, amount, bucket.Stacks)
		}
		return
	}
	t.Fatalf("overview month %s not found", month)
}

func assertMonthlySeriesStack(t *testing.T, report httpclient.HouseholdFlowDataset, month, seriesID, barGroup, amount string) {
	t.Helper()
	for _, bucket := range report.Periods {
		if bucket.Label != month {
			continue
		}
		for _, stack := range bucket.Stacks {
			if stack.SeriesId == seriesID && string(stack.BarGroup) == barGroup {
				if stack.AmountUsd != amount {
					t.Fatalf("%s %s/%s stack = %s, want %s", month, seriesID, barGroup, stack.AmountUsd, amount)
				}
				return
			}
		}
		t.Fatalf("%s omitted %s/%s stack; stacks %+v", month, seriesID, barGroup, bucket.Stacks)
	}
	t.Fatalf("overview month %s not found", month)
}

func assertMonthlyBarGroupTotal(t *testing.T, report httpclient.HouseholdFlowDataset, month, barGroup, amount string) {
	t.Helper()
	for _, bucket := range report.Periods {
		if bucket.Label != month {
			continue
		}
		for _, total := range bucket.BarGroupTotals {
			if string(total.BarGroup) == barGroup {
				if total.AmountUsd != amount {
					t.Fatalf("%s %s total = %s, want %s", month, barGroup, total.AmountUsd, amount)
				}
				return
			}
		}
		t.Fatalf("%s omitted %s total; totals %+v", month, barGroup, bucket.BarGroupTotals)
	}
	t.Fatalf("overview month %s not found", month)
}

func assertMonthlyTrailingAverages(t *testing.T, report httpclient.HouseholdFlowDataset, want ...string) {
	t.Helper()
	if len(report.Periods) != len(want) {
		t.Fatalf("overview month count = %d, want %d trailing averages", len(report.Periods), len(want))
	}
	for index, bucket := range report.Periods {
		if bucket.Trend.AmountUsd != want[index] {
			t.Fatalf("%s trailing average = %s, want %s", bucket.Label, bucket.Trend.AmountUsd, want[index])
		}
	}
}

func assertNoBarGroup(t *testing.T, report httpclient.HouseholdFlowDataset, barGroup string) {
	t.Helper()
	for _, bucket := range report.Periods {
		if slices.ContainsFunc(bucket.Stacks, func(stack httpclient.HouseholdFlowStackValue) bool { return string(stack.BarGroup) == barGroup }) {
			t.Fatalf("overview contains excluded %s bar group in %s: %+v", barGroup, bucket.Label, bucket.Stacks)
		}
	}
}

func assertPreviewIncludesTransactions(t *testing.T, preview []httpclient.Transaction, transactionIDs ...int64) {
	t.Helper()
	for _, transactionID := range transactionIDs {
		if !slices.ContainsFunc(preview, func(transaction httpclient.Transaction) bool {
			return transaction.TransactionId == transactionID
		}) {
			t.Fatalf("overview preview omitted transaction %d: %+v", transactionID, preview)
		}
	}
}

func assertPreviewExcludesTransactions(t *testing.T, preview []httpclient.Transaction, transactionIDs ...int64) {
	t.Helper()
	for _, transaction := range preview {
		if slices.Contains(transactionIDs, transaction.TransactionId) {
			t.Fatalf("overview preview included out-of-scope transaction %d: %+v", transaction.TransactionId, preview)
		}
	}
}

func assertRankedBreakdown(t *testing.T, breakdown []httpclient.HouseholdFlowBreakdownSeries, want ...string) {
	t.Helper()
	if len(breakdown) != len(want) {
		t.Fatalf("overview breakdown = %+v, want %d ranked series", breakdown, len(want))
	}
	for index, wantLabel := range want {
		series := breakdown[index]
		wantRank := index + 1
		if series.Rank != wantRank {
			t.Fatalf("overview breakdown rank %d = %d, want %d; breakdown %+v", index, series.Rank, wantRank, breakdown)
		}
		if wantLabel == "Other" {
			if !series.IsOther || series.Label != wantLabel {
				t.Fatalf("overview breakdown rank %d = %+v, want Other", wantRank, series)
			}
			continue
		}
		if series.IsOther || series.Fqn == nil || *series.Fqn != wantLabel {
			t.Fatalf("overview breakdown rank %d = %+v, want FQN %q", wantRank, series, wantLabel)
		}
	}
}

func assertBreakdownLabel(t *testing.T, breakdown []httpclient.HouseholdFlowBreakdownSeries, fqn, wantLabel string) {
	t.Helper()
	for _, series := range breakdown {
		if series.Fqn != nil && *series.Fqn == fqn {
			if series.Label != wantLabel {
				t.Fatalf("overview breakdown label for %q = %q, want %q", fqn, series.Label, wantLabel)
			}
			return
		}
	}
	t.Fatalf("overview breakdown omitted %q: %+v", fqn, breakdown)
}

func assertStacksJoinBreakdown(t *testing.T, report httpclient.HouseholdFlowDataset) {
	t.Helper()
	seriesIDs := make(map[string]struct{}, len(report.Breakdown))
	for _, series := range report.Breakdown {
		seriesIDs[series.SeriesId] = struct{}{}
	}
	for _, bucket := range report.Periods {
		for _, stack := range bucket.Stacks {
			if _, ok := seriesIDs[stack.SeriesId]; !ok {
				t.Fatalf("%s stack series %q does not join breakdown %+v", bucket.Label, stack.SeriesId, report.Breakdown)
			}
		}
	}
}

func assertHiddenCategoryScopeInTransactions(t *testing.T, client *apptest.Client, fqn string, hiddenCategoryID int64, excludedTransactionIDs ...int64) {
	t.Helper()
	limit := 100
	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{CategoryFqnPrefix: &fqn, Limit: &limit})
	requireNoTransportError(t, "list category group transactions", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("category group transactions status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if !slices.ContainsFunc(response.JSON200.Transactions, func(transaction httpclient.Transaction) bool {
		return slices.ContainsFunc(transaction.Records, func(record httpclient.JournalRecord) bool {
			return record.CategoryId != nil && *record.CategoryId == hiddenCategoryID
		})
	}) {
		t.Fatal("category FQN-prefix transaction scope omitted hidden descendant")
	}
	for _, transaction := range response.JSON200.Transactions {
		if slices.Contains(excludedTransactionIDs, transaction.TransactionId) {
			t.Fatalf("category FQN-prefix transaction scope included excluded transaction %d", transaction.TransactionId)
		}
	}
}

func assertHiddenTagScopeInTransactions(t *testing.T, client *apptest.Client, fqn string, hiddenTagID int64, excludedTransactionIDs ...int64) {
	t.Helper()
	limit := 100
	response, err := client.REST().ListTransactionsWithResponse(context.Background(), &httpclient.ListTransactionsParams{TagFqnPrefix: &fqn, Limit: &limit})
	requireNoTransportError(t, "list tag group transactions", err)
	if response.StatusCode() != http.StatusOK {
		t.Fatalf("tag group transactions status = %d, want %d; body %s", response.StatusCode(), http.StatusOK, response.Body)
	}
	if !slices.ContainsFunc(response.JSON200.Transactions, func(transaction httpclient.Transaction) bool {
		return slices.ContainsFunc(transaction.Records, func(record httpclient.JournalRecord) bool { return slices.Contains(record.TagIds, hiddenTagID) })
	}) {
		t.Fatal("tag FQN-prefix transaction scope omitted hidden descendant")
	}
	for _, transaction := range response.JSON200.Transactions {
		if slices.Contains(excludedTransactionIDs, transaction.TransactionId) {
			t.Fatalf("tag FQN-prefix transaction scope included excluded transaction %d", transaction.TransactionId)
		}
	}
}

package httpapi

import (
	"context"

	"github.com/mishamsk/mina/internal/httpapi/openapi"
	"github.com/mishamsk/mina/internal/services/dataaggregates"
)

func (s *strictServer) GetCategoryOverview(ctx context.Context, request openapi.GetCategoryOverviewRequestObject) (openapi.GetCategoryOverviewResponseObject, error) {
	report, err := s.deps.DataAggregates.Category(ctx, request.CategoryId, flowReportInput(
		request.Params.Breakdown, request.Params.Grain, request.Params.PeriodCount, request.Params.AnchorDate,
		request.Params.NamedSeriesCount, request.Params.ExcludedContributorId, request.Params.Trend,
	))
	if err != nil {
		return nil, err
	}
	return openapi.GetCategoryOverview200JSONResponse(flowEntityAPIResponse(report)), nil
}

func (s *strictServer) GetCategoryGroupOverview(ctx context.Context, request openapi.GetCategoryGroupOverviewRequestObject) (openapi.GetCategoryGroupOverviewResponseObject, error) {
	report, err := s.deps.DataAggregates.CategoryGroup(ctx, request.Params.Fqn, flowReportInput(
		request.Params.Breakdown, request.Params.Grain, request.Params.PeriodCount, request.Params.AnchorDate,
		request.Params.NamedSeriesCount, request.Params.ExcludedContributorId, request.Params.Trend,
	))
	if err != nil {
		return nil, err
	}
	return openapi.GetCategoryGroupOverview200JSONResponse(flowEntityAPIResponse(report)), nil
}

func (s *strictServer) GetTagOverview(ctx context.Context, request openapi.GetTagOverviewRequestObject) (openapi.GetTagOverviewResponseObject, error) {
	report, err := s.deps.DataAggregates.Tag(ctx, request.TagId, flowReportInput(
		request.Params.Breakdown, request.Params.Grain, request.Params.PeriodCount, request.Params.AnchorDate,
		request.Params.NamedSeriesCount, request.Params.ExcludedContributorId, request.Params.Trend,
	))
	if err != nil {
		return nil, err
	}
	return openapi.GetTagOverview200JSONResponse(flowEntityAPIResponse(report)), nil
}

func (s *strictServer) GetTagGroupOverview(ctx context.Context, request openapi.GetTagGroupOverviewRequestObject) (openapi.GetTagGroupOverviewResponseObject, error) {
	report, err := s.deps.DataAggregates.TagGroup(ctx, request.Params.Fqn, flowReportInput(
		request.Params.Breakdown, request.Params.Grain, request.Params.PeriodCount, request.Params.AnchorDate,
		request.Params.NamedSeriesCount, request.Params.ExcludedContributorId, request.Params.Trend,
	))
	if err != nil {
		return nil, err
	}
	return openapi.GetTagGroupOverview200JSONResponse(flowEntityAPIResponse(report)), nil
}

func (s *strictServer) GetHouseholdFlowReport(ctx context.Context, request openapi.GetHouseholdFlowReportRequestObject) (openapi.GetHouseholdFlowReportResponseObject, error) {
	dataset, err := s.deps.DataAggregates.Household(ctx, flowReportInput(
		request.Params.Breakdown, request.Params.Grain, request.Params.PeriodCount, request.Params.AnchorDate,
		request.Params.NamedSeriesCount, request.Params.ExcludedContributorId, request.Params.Trend,
	))
	if err != nil {
		return nil, err
	}
	return openapi.GetHouseholdFlowReport200JSONResponse(flowDatasetAPIResponse(dataset)), nil
}

func (s *strictServer) GetAccountingHistoryRange(ctx context.Context, _ openapi.GetAccountingHistoryRangeRequestObject) (openapi.GetAccountingHistoryRangeResponseObject, error) {
	historyRange, err := s.deps.DataAggregates.AccountingHistoryRange(ctx)
	if err != nil {
		return nil, err
	}
	return openapi.GetAccountingHistoryRange200JSONResponse{
		StartDate: openAPIDate(historyRange.StartDate),
		EndDate:   openAPIDate(historyRange.EndDate),
	}, nil
}

func flowReportInput(
	breakdown *openapi.HouseholdFlowBreakdown,
	grain *openapi.HouseholdFlowGrain,
	periodCount *openapi.HouseholdFlowPeriodCount,
	anchorDate *openapi.HouseholdFlowAnchorDate,
	namedSeriesCount *openapi.HouseholdFlowNamedSeriesCount,
	excludedContributorIDs *openapi.HouseholdFlowExcludedContributorIDs,
	trend *openapi.HouseholdFlowTrend,
) dataaggregates.ReportConfigurationInput {
	input := dataaggregates.ReportConfigurationInput{}
	if breakdown != nil {
		value := dataaggregates.BreakdownDimension(*breakdown)
		input.BreakdownDimension = &value
	}
	if grain != nil {
		value := dataaggregates.Grain(*grain)
		input.Grain = &value
	}
	if periodCount != nil {
		value := int(*periodCount)
		input.PeriodCount = &value
	}
	input.AnchorDate = nullableCivilDateFromOpenAPI(anchorDate)
	if namedSeriesCount != nil {
		value := int(*namedSeriesCount)
		input.NamedSeriesCount = &value
	}
	if excludedContributorIDs != nil {
		input.ExcludedContributorIDs = append([]string(nil), (*excludedContributorIDs)...)
	}
	if trend != nil {
		value := dataaggregates.Trend(*trend)
		input.Trend = &value
	}
	return input
}

func flowEntityAPIResponse(report dataaggregates.Report) openapi.HouseholdFlowEntityResponse {
	return openapi.HouseholdFlowEntityResponse{
		Scope: openapi.HouseholdFlowScope{
			EntityKind: openapi.HouseholdFlowEntityKind(report.Scope.EntityKind), ScopeKind: openapi.HouseholdFlowScopeKind(report.Scope.ScopeKind),
			EntityId: report.Scope.EntityID, Fqn: report.Scope.FQN,
		},
		Dataset:      flowDatasetAPIResponse(report.Dataset),
		Transactions: transactionAPIResponses(report.Transactions),
	}
}

func flowDatasetAPIResponse(dataset dataaggregates.Dataset) openapi.HouseholdFlowDataset {
	breakdown := make([]openapi.HouseholdFlowBreakdownSeries, 0, len(dataset.Breakdown))
	for _, series := range dataset.Breakdown {
		breakdown = append(breakdown, openapi.HouseholdFlowBreakdownSeries{
			SeriesId: series.ID, Label: series.Label, Fqn: series.FQN, CategoryId: series.CategoryID, Rank: series.Rank,
			IsOther: series.IsOther, UnconvertedCount: series.UnconvertedCount,
		})
	}
	periods := make([]openapi.HouseholdFlowPeriod, 0, len(dataset.Periods))
	for _, period := range dataset.Periods {
		barGroupTotals := make([]openapi.HouseholdFlowBarGroupTotal, 0, len(period.BarGroupTotals))
		for _, total := range period.BarGroupTotals {
			barGroupTotals = append(barGroupTotals, openapi.HouseholdFlowBarGroupTotal{
				BarGroup: openapi.HouseholdFlowBarGroup(total.BarGroup), AmountUsd: total.AmountUSD.String(),
				UnconvertedCount: total.UnconvertedCount,
			})
		}
		stacks := make([]openapi.HouseholdFlowStackValue, 0, len(period.Stacks))
		for _, stack := range period.Stacks {
			stacks = append(stacks, openapi.HouseholdFlowStackValue{
				SeriesId: stack.SeriesID, BarGroup: openapi.HouseholdFlowBarGroup(stack.BarGroup),
				AmountUsd: stack.AmountUSD.String(), UnconvertedCount: stack.UnconvertedCount,
			})
		}
		periods = append(periods, openapi.HouseholdFlowPeriod{
			Label: period.Label, IsCurrent: period.IsCurrent,
			Trend: flowMetricAPIResponse(period.Trend), BarGroupTotals: barGroupTotals, Stacks: stacks,
		})
	}
	barGroups := make([]openapi.HouseholdFlowBarGroup, 0, len(dataset.Configuration.BarGroups))
	for _, group := range dataset.Configuration.BarGroups {
		barGroups = append(barGroups, openapi.HouseholdFlowBarGroup(group))
	}
	return openapi.HouseholdFlowDataset{
		Configuration: openapi.HouseholdFlowConfiguration{
			CoreMetric:         openapi.HouseholdFlowCoreMetric(dataset.Configuration.CoreMetric),
			BreakdownDimension: openapi.HouseholdFlowBreakdownDimension(dataset.Configuration.BreakdownDimension),
			BarGroups:          barGroups, Grain: openapi.HouseholdFlowGrain(dataset.Configuration.Grain),
			PeriodCount:            dataset.Configuration.PeriodCount,
			AnchorPeriod:           dataset.Configuration.AnchorPeriod,
			NamedSeriesCount:       dataset.Configuration.NamedSeriesCount,
			ExcludedContributorIds: append([]string{}, dataset.Configuration.ExcludedContributorIDs...),
			Trend:                  openapi.HouseholdFlowTrend(dataset.Configuration.Trend),
		},
		TopLine: flowTopLineAPIResponse(dataset.TopLine), Breakdown: breakdown, Periods: periods,
		ExcludedActivity: openapi.HouseholdFlowExcludedActivity{
			AdjustmentTransactionCount: dataset.ExcludedActivity.AdjustmentTransactionCount,
			ExchangeTransactionCount:   dataset.ExcludedActivity.ExchangeTransactionCount,
		},
	}
}

func flowTopLineAPIResponse(top dataaggregates.TopLine) openapi.HouseholdFlowTopLine {
	return openapi.HouseholdFlowTopLine{
		CurrentMonth: top.CurrentMonth, CurrentMonthTotal: flowMetricAPIResponse(top.CurrentMonthTotal),
		TrailingThreeMonthStart: top.TrailingThreeMonthStart, TrailingThreeMonthEnd: top.TrailingThreeMonthEnd,
		TrailingThreeMonthAverage: flowMetricAPIResponse(top.TrailingThreeMonthAverage),
		MonthOverMonth:            flowComparisonAPIResponse(top.MonthOverMonth),
		YearOverYear:              flowComparisonAPIResponse(top.YearOverYear),
	}
}

func flowComparisonAPIResponse(comparison dataaggregates.Comparison) openapi.HouseholdFlowComparison {
	var changePercent *string
	if comparison.ChangePercent != nil {
		value := comparison.ChangePercent.String()
		changePercent = &value
	}
	return openapi.HouseholdFlowComparison{
		CurrentMonth: comparison.CurrentMonth, BaselineMonth: comparison.BaselineMonth,
		Current: flowMetricAPIResponse(comparison.Current), Baseline: flowMetricAPIResponse(comparison.Baseline),
		ChangePercent: changePercent,
	}
}

func flowMetricAPIResponse(value dataaggregates.MetricValue) openapi.HouseholdFlowMetricValue {
	return openapi.HouseholdFlowMetricValue{AmountUsd: value.AmountUSD.String(), UnconvertedCount: value.UnconvertedCount}
}

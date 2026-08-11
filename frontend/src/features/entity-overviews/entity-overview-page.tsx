/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Eye, EyeOff, Minus, Plus, Reload } from "pixelarticons/react";
import { Slider } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import type {
  AccountingHistoryRange,
  EntityOverviewRequest,
  HouseholdFlowBreakdownSeries,
  HouseholdFlowDataset,
  HouseholdFlowEntityResponse,
  HouseholdFlowMetricValue,
  HouseholdFlowSelection,
  Transaction,
} from "@/api";
import {
  apiErrorMessage,
  fetchAccountingHistoryRange,
  fetchEntityOverview,
  householdFlowSelectionFromDataset,
} from "@/api";
import { PageHelp } from "@/components/page-help";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/features/app-shell";
import {
  formatDecimalAmount,
  FqnPath,
  refreshLedgerLookups,
  TransactionBrowser,
  TransactionDetailPanel,
  useLedgerLookupsResource,
  useTransactionDetail,
  writeTransactionFiltersToSearchParams,
} from "@/features/ledger";
import { ReferenceDrilldownNotFound } from "@/features/reference";
import {
  emptyTransactionFilters,
  type TransactionFilters,
} from "@/models/transaction-filters";

import { useEntityOverview } from "./use-entity-overview";

interface EntityOverviewPageProps {
  readonly backHref: string;
  readonly entityKindLabel: "Category" | "Tag";
  readonly request?: EntityOverviewRequest;
}

type ChartDatum = Record<string, number | string> & {
  readonly period: string;
  readonly periodLabel: string;
};

const seriesPalette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
] as const;

const seriesColor = (index: number): string =>
  seriesPalette[index % seriesPalette.length] ?? "var(--muted-foreground)";

const formatUSDAmount = (amount: string, positiveSign = false): string =>
  `≈ ${formatDecimalAmount(amount, "USD", { positiveSign })}`;

const formatUSDAxisTick = (amount: string, positiveSign = false): string =>
  `${formatUSDAmount(amount, positiveSign)} USD`;

const USDValue = ({
  amount,
  positiveSign = false,
}: {
  readonly amount: string;
  readonly positiveSign?: boolean;
}) => (
  <>
    {formatUSDAmount(amount, positiveSign)}{" "}
    <span className="text-muted-foreground font-normal">USD</span>
  </>
);

const monthLabel = (value: string, long = false): string => {
  const [year = "0", month = "1"] = value.split("-");
  return new Intl.DateTimeFormat(undefined, {
    month: long ? "long" : "short",
    year: long ? "numeric" : "2-digit",
  }).format(new Date(Number(year), Number(month) - 1, 1));
};

const periodLabel = (
  value: string,
  grain: HouseholdFlowDataset["configuration"]["grain"],
  long = false,
): string => (grain === "year" ? value : monthLabel(value, long));

const periodOrdinal = (
  value: string,
  grain: HouseholdFlowDataset["configuration"]["grain"],
): number => {
  const [year = 0, month = 1] = value.split("-").map(Number);
  return grain === "year" ? year : year * 12 + month - 1;
};

const ordinalPeriod = (
  value: number,
  grain: HouseholdFlowDataset["configuration"]["grain"],
): string => {
  if (grain === "year") return String(value);
  const year = Math.floor(value / 12);
  const month = (value % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
};

const anchorDateFromPeriod = (value: string): string =>
  value.length === 4 ? `${value}-01-01` : `${value}-01`;

const metricLabel = (dataset: HouseholdFlowDataset): string =>
  ({
    net_income: "Net income",
    net_spend: "Net spend",
    net_flow: "Net flow",
  })[dataset.configuration.core_metric];

const UnconvertedDisclosure = ({
  label,
  value,
}: {
  readonly label?: string;
  readonly value: HouseholdFlowMetricValue;
}) =>
  value.unconverted_count > 0 ? (
    <span className="text-muted-foreground text-xs">
      {label ? `${label}: ` : ""}
      {value.unconverted_count} unconverted
    </span>
  ) : null;

const ComparisonMetric = ({
  label,
  comparison,
}: {
  readonly label: string;
  readonly comparison: HouseholdFlowDataset["top_line"]["month_over_month"];
}) => (
  <div className="min-w-0 px-4 py-3">
    <dt className="font-heading text-muted-foreground text-xs font-semibold uppercase">
      {label}
    </dt>
    <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">
      {comparison.change_percent === null
        ? "Unavailable"
        : `${Number(comparison.change_percent) > 0 ? "+" : ""}${formatDecimalAmount(comparison.change_percent, "USD", { positiveSign: false })}%`}
    </dd>
    <p className="text-muted-foreground mt-1 text-xs">
      {monthLabel(comparison.current_month)} vs.{" "}
      {monthLabel(comparison.baseline_month)}
    </p>
    <div className="flex flex-wrap gap-x-3">
      <UnconvertedDisclosure label="Current" value={comparison.current} />
      <UnconvertedDisclosure label="Baseline" value={comparison.baseline} />
    </div>
  </div>
);

export const FlowReportTopLine = ({
  dataset,
}: {
  readonly dataset: HouseholdFlowDataset;
}) => (
  <dl
    className="bg-card grid border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)] sm:grid-cols-2 xl:grid-cols-4 [&>*]:border-[var(--hairline)] xl:[&>*]:border-t-0 [&>*:not(:first-child)]:border-t xl:[&>*:not(:first-child)]:border-l sm:[&>*:nth-child(2)]:border-t-0 sm:[&>*:nth-child(even)]:border-l"
    data-testid="entity-overview-top-line"
  >
    <div className="min-w-0 px-4 py-3">
      <dt className="font-heading text-muted-foreground text-xs font-semibold uppercase">
        This month · {metricLabel(dataset)}
      </dt>
      <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">
        <USDValue
          amount={dataset.top_line.current_month_total.amount_usd}
          positiveSign={dataset.configuration.core_metric === "net_flow"}
        />
      </dd>
      <p className="text-muted-foreground mt-1 text-xs">
        Through today · {monthLabel(dataset.top_line.current_month, true)}
      </p>
      <UnconvertedDisclosure value={dataset.top_line.current_month_total} />
    </div>
    <div className="min-w-0 px-4 py-3">
      <dt className="font-heading text-muted-foreground text-xs font-semibold uppercase">
        3-month average
      </dt>
      <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">
        <USDValue
          amount={dataset.top_line.trailing_three_month_average.amount_usd}
          positiveSign={dataset.configuration.core_metric === "net_flow"}
        />
      </dd>
      <p className="text-muted-foreground mt-1 text-xs">
        {monthLabel(dataset.top_line.trailing_three_month_start)}–
        {monthLabel(dataset.top_line.trailing_three_month_end)}
      </p>
      <UnconvertedDisclosure
        value={dataset.top_line.trailing_three_month_average}
      />
    </div>
    <ComparisonMetric
      label="Month over month"
      comparison={dataset.top_line.month_over_month}
    />
    <ComparisonMetric
      label="Year over year"
      comparison={dataset.top_line.year_over_year}
    />
  </dl>
);

const chartKey = (seriesIndex: number, barGroup: string): string =>
  `series_${seriesIndex}_${barGroup}`;

const totalKey = (barGroup: string): string => `total_${barGroup}`;

const barGroupLabel = (value: string): string =>
  ({ inflow: "Inflow", net: "Net", outflow: "Outflow" })[value] ?? value;

const chartPresentation = (dataset: HouseholdFlowDataset) => {
  const seriesIndex = new Map(
    dataset.breakdown.map((series, index) => [series.series_id, index]),
  );
  const data: ChartDatum[] = dataset.periods.map((period) => {
    const row: Record<string, number | string> = {
      period: period.label,
      periodLabel: periodLabel(period.label, dataset.configuration.grain),
      overlay_trend: Number(period.trend.amount_usd),
      overlay_trend_decimal: period.trend.amount_usd,
      overlay_trend_unconverted: period.trend.unconverted_count,
    };
    for (const total of period.bar_group_totals) {
      const key = totalKey(total.bar_group);
      row[key] = total.amount_usd;
      row[`${key}_unconverted`] = total.unconverted_count;
    }
    for (const stack of period.stacks) {
      const index =
        seriesIndex.get(stack.series_id) ?? dataset.breakdown.length;
      const key = chartKey(index, stack.bar_group);
      row[key] = Number(stack.amount_usd);
      row[`${key}_decimal`] = stack.amount_usd;
      row[`${key}_unconverted`] = stack.unconverted_count;
    }
    return row as ChartDatum;
  });
  return data;
};

const orderedSeriesIndexes = (
  dataset: HouseholdFlowDataset,
  barGroup: HouseholdFlowDataset["configuration"]["bar_groups"][number],
): number[] => {
  const totals = new Map<string, number>();
  for (const period of dataset.periods) {
    for (const stack of period.stacks) {
      if (stack.bar_group === barGroup) {
        totals.set(
          stack.series_id,
          (totals.get(stack.series_id) ?? 0) + Number(stack.amount_usd),
        );
      }
    }
  }
  return dataset.breakdown
    .map((_, index) => index)
    .sort((leftIndex, rightIndex) => {
      const left = dataset.breakdown[leftIndex];
      const right = dataset.breakdown[rightIndex];
      if (!left || !right) return 0;
      if (left.is_other !== right.is_other) return left.is_other ? 1 : -1;
      const leftTotal = totals.get(left.series_id) ?? 0;
      const rightTotal = totals.get(right.series_id) ?? 0;
      if (leftTotal !== rightTotal) {
        return barGroup === "outflow"
          ? leftTotal - rightTotal
          : rightTotal - leftTotal;
      }
      return left.rank - right.rank;
    });
};

const deeperCategoryHref = (
  series: HouseholdFlowBreakdownSeries,
  dataset: HouseholdFlowDataset,
): string | undefined => {
  if (
    dataset.configuration.breakdown_dimension !== "categories" ||
    !series.fqn
  ) {
    return undefined;
  }
  return series.category_id
    ? `/categories/${series.category_id}`
    : `/categories/group?prefix=${encodeURIComponent(series.fqn)}`;
};

const BreakdownControl = ({
  categoriesUnavailable,
  dataset,
  disabled,
  excludedContributorIds,
  onExcludedChange,
  onSelectionChange,
  selection,
}: {
  readonly categoriesUnavailable: boolean;
  readonly dataset: HouseholdFlowDataset;
  readonly disabled: boolean;
  readonly excludedContributorIds: readonly string[];
  readonly onExcludedChange: (next: readonly string[]) => void;
  readonly onSelectionChange: (next: HouseholdFlowSelection) => void;
  readonly selection: HouseholdFlowSelection;
}) => {
  const updateStructure = (changes: Partial<HouseholdFlowSelection>): void =>
    onSelectionChange({
      ...selection,
      ...changes,
      excludedContributorIds: [],
    });

  return (
    <aside
      className="bg-card order-2 flex min-h-0 flex-col border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)] lg:order-1"
      aria-labelledby="entity-overview-breakdown-title"
      data-testid="entity-overview-breakdown"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="entity-overview-breakdown-title"
          className="font-heading text-sm font-semibold uppercase"
        >
          Contributors
        </h2>
        <div className="flex gap-1">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={disabled}
            onClick={() => onExcludedChange([])}
            data-testid="flow-contributors-all"
          >
            All
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onExcludedChange(
                dataset.breakdown.map((series) => series.series_id),
              )
            }
            data-testid="flow-contributors-none"
          >
            None
          </Button>
        </div>
      </div>
      <ul className="mt-3 space-y-1">
        {dataset.breakdown.map((series, index) => {
          const checked = !excludedContributorIds.includes(series.series_id);
          const deeperHref = deeperCategoryHref(series, dataset);
          return (
            <li
              key={series.series_id}
              className="flex min-w-0 items-center gap-2 border-t border-[var(--hairline)] py-2 first:border-t-0"
            >
              <Checkbox
                aria-label={`${checked ? "Hide" : "Show"} ${series.label}`}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(nextChecked) => {
                  const next = new Set(excludedContributorIds);
                  if (nextChecked === true) next.delete(series.series_id);
                  else next.add(series.series_id);
                  onExcludedChange([...next]);
                }}
              />
              <span
                className="size-3 shrink-0 border border-[var(--border-ink)]"
                style={{ backgroundColor: seriesColor(index) }}
                aria-hidden="true"
              />
              {deeperHref ? (
                <Tooltip asChild label={series.fqn ?? series.label}>
                  <Link
                    className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-2 hover:underline"
                    to={deeperHref}
                  >
                    {series.label}
                  </Link>
                </Tooltip>
              ) : (
                <Tooltip asChild label={series.fqn ?? series.label}>
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                    tabIndex={0}
                  >
                    {series.label}
                  </span>
                </Tooltip>
              )}
              {series.unconverted_count > 0 ? (
                <span className="text-muted-foreground font-mono text-xs">
                  {series.unconverted_count} unconverted
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t-2 border-[var(--border-ink)] pt-4">
        <div>
          <span className="font-heading block text-xs font-semibold uppercase">
            Named
          </span>
          <div
            className="mt-1 flex items-center gap-2"
            data-testid="flow-named-series-count"
          >
            <Button
              aria-label="Show fewer named series"
              disabled={selection.namedSeriesCount <= 5}
              onClick={() =>
                updateStructure({
                  namedSeriesCount: selection.namedSeriesCount - 1,
                })
              }
              size="icon-xs"
              type="button"
              variant="outline"
            >
              <Minus aria-hidden="true" />
            </Button>
            <span className="min-w-5 text-center font-mono text-sm font-semibold tabular-nums">
              {selection.namedSeriesCount}
            </span>
            <Button
              aria-label="Show more named series"
              onClick={() =>
                updateStructure({
                  namedSeriesCount: selection.namedSeriesCount + 1,
                })
              }
              size="icon-xs"
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div
          aria-label="Breakdown"
          className="flex gap-1"
          data-testid="flow-breakdown-select"
          role="group"
        >
          {(["accounts", "categories"] as const).map((breakdown) => (
            <Button
              key={breakdown}
              aria-pressed={selection.breakdown === breakdown}
              className="aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              disabled={breakdown === "categories" && categoriesUnavailable}
              onClick={() => updateStructure({ breakdown })}
              size="xs"
              type="button"
              variant="outline"
            >
              {breakdown === "accounts" ? "Accounts" : "Categories"}
            </Button>
          ))}
        </div>
      </div>
      {categoriesUnavailable ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Categories is unavailable because this page already fixes one
          category.
        </p>
      ) : null}
    </aside>
  );
};

const FlowWindowControl = ({
  dataset,
  historyRange,
  onSelectionChange,
  selection,
}: {
  readonly dataset: HouseholdFlowDataset;
  readonly historyRange: AccountingHistoryRange;
  readonly onSelectionChange: (next: HouseholdFlowSelection) => void;
  readonly selection: HouseholdFlowSelection;
}) => {
  const grain = dataset.configuration.grain;
  const minimumSteps = grain === "month" ? 5 : 2;
  const rangeStart = periodOrdinal(
    grain === "month"
      ? historyRange.start_date.slice(0, 7)
      : historyRange.start_date.slice(0, 4),
    grain,
  );
  const domainEnd = periodOrdinal(
    grain === "month"
      ? historyRange.end_date.slice(0, 7)
      : historyRange.end_date.slice(0, 4),
    grain,
  );
  const selectedStart = periodOrdinal(
    dataset.periods[0]?.label ?? dataset.configuration.anchor_period,
    grain,
  );
  const selectedEnd = periodOrdinal(dataset.configuration.anchor_period, grain);
  const domainStart = Math.min(
    rangeStart,
    selectedStart,
    domainEnd - minimumSteps,
  );
  const initialWindow: [number, number] = [
    Math.max(domainStart, selectedStart) - domainStart,
    Math.max(domainStart, selectedEnd) - domainStart,
  ];
  const [windowValue, setWindowValue] =
    useState<[number, number]>(initialWindow);
  const maximumSteps = grain === "month" ? 23 : undefined;
  const domainMaximum = domainEnd - domainStart;

  const updateStructure = (changes: Partial<HouseholdFlowSelection>): void =>
    onSelectionChange({
      ...selection,
      ...changes,
      excludedContributorIds: [],
    });

  const updateWindow = (nextValue: number[]): void => {
    const [rawStart = 0, rawEnd = minimumSteps] = nextValue;
    let start = rawStart;
    let end = rawEnd;
    if (maximumSteps !== undefined && end - start > maximumSteps) {
      if (start !== windowValue[0]) start = end - maximumSteps;
      else end = start + maximumSteps;
    }
    setWindowValue([start, end]);
  };

  return (
    <div className="mt-3 grid items-end gap-4 border-t-2 border-[var(--border-ink)] pt-3 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div>
        <span className="font-heading block text-xs font-semibold uppercase">
          Grain
        </span>
        <div
          aria-label="Grain"
          className="mt-1 flex gap-1"
          data-testid="flow-grain-select"
          role="group"
        >
          {(["month", "year"] as const).map((nextGrain) => (
            <Button
              key={nextGrain}
              aria-pressed={selection.grain === nextGrain}
              className="aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              onClick={() =>
                updateStructure({
                  grain: nextGrain,
                  periodCount: nextGrain === "month" ? 12 : 6,
                  trend:
                    nextGrain === "month" ? "rolling_average" : "rolling_sum",
                })
              }
              size="xs"
              type="button"
              variant="outline"
            >
              {nextGrain === "month" ? "Month" : "Year"}
            </Button>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
          <span className="font-heading font-semibold uppercase">Window</span>
          <span className="text-muted-foreground font-mono tabular-nums">
            {periodLabel(
              ordinalPeriod(domainStart + windowValue[0], grain),
              grain,
            )}
            {" – "}
            {periodLabel(
              ordinalPeriod(domainStart + windowValue[1], grain),
              grain,
            )}
            {" · "}
            {windowValue[1] - windowValue[0] + 1}{" "}
            {grain === "month" ? "mo" : "yr"}
          </span>
        </div>
        <Slider.Root
          aria-label="Visible report window"
          className="relative flex h-7 w-full touch-none items-center select-none"
          data-testid="flow-range-slider"
          max={domainMaximum}
          min={0}
          minStepsBetweenThumbs={minimumSteps}
          onValueChange={updateWindow}
          onValueCommit={([start = 0, end = minimumSteps]) =>
            updateStructure({
              anchorDate: anchorDateFromPeriod(
                ordinalPeriod(domainStart + end, grain),
              ),
              periodCount: end - start + 1,
            })
          }
          step={1}
          value={windowValue}
        >
          <Slider.Track className="bg-muted relative h-2 grow border-2 border-[var(--border-ink)]">
            <Slider.Range className="bg-primary absolute h-full" />
          </Slider.Track>
          <Slider.Thumb
            aria-label="First visible period"
            className="bg-card block size-5 border-2 border-[var(--border-ink)] shadow-[var(--shadow-chip)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          />
          <Slider.Thumb
            aria-label="Final visible period"
            className="bg-card block size-5 border-2 border-[var(--border-ink)] shadow-[var(--shadow-chip)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          />
        </Slider.Root>
      </div>
    </div>
  );
};

const FlowChart = ({
  dataset,
  historyRange,
  onSelectionChange,
  selection,
}: {
  readonly dataset: HouseholdFlowDataset;
  readonly historyRange: AccountingHistoryRange;
  readonly onSelectionChange: (next: HouseholdFlowSelection) => void;
  readonly selection: HouseholdFlowSelection;
}) => {
  const data = useMemo(() => chartPresentation(dataset), [dataset]);
  const signedValues = dataset.configuration.core_metric === "net_flow";
  const trendLabel =
    dataset.configuration.trend === "rolling_average"
      ? "Rolling 3-period average"
      : "Range-to-date rolling sum";
  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {
      overlay_trend: {
        color: "var(--border-ink)",
        label: trendLabel,
      },
    };
    dataset.breakdown.forEach((series, index) => {
      for (const group of dataset.configuration.bar_groups) {
        config[chartKey(index, group)] = {
          color: seriesColor(index),
          label: `${series.label} · ${barGroupLabel(group)}`,
        };
      }
    });
    return config;
  }, [dataset, trendLabel]);

  return (
    <section
      className="bg-card order-1 min-w-0 border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)] lg:order-2"
      aria-labelledby="entity-overview-chart-title"
      data-testid="entity-overview-chart"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id="entity-overview-chart-title"
            className="font-heading text-sm font-semibold uppercase"
          >
            {dataset.configuration.grain === "month" ? "Monthly" : "Yearly"}{" "}
            activity
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {dataset.configuration.period_count}-period window · bars show{" "}
            {metricLabel(dataset).toLowerCase()} · line shows{" "}
            {trendLabel.toLowerCase()}
          </p>
        </div>
        <div className="shrink-0">
          <label className="sr-only" htmlFor="flow-trend">
            Trend
          </label>
          <Select
            value={selection.trend}
            onValueChange={(trend: HouseholdFlowSelection["trend"]) =>
              onSelectionChange({ ...selection, trend })
            }
          >
            <SelectTrigger
              className="font-heading h-7 min-w-32 px-2 text-xs uppercase shadow-[var(--shadow-chip)]"
              id="flow-trend"
              data-testid="flow-trend-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rolling_average">Rolling average</SelectItem>
              <SelectItem value="rolling_sum">Rolling sum</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <ChartContainer
        config={chartConfig}
        className="mt-4 aspect-auto h-[22rem] w-full"
        initialDimension={{ width: 720, height: 352 }}
      >
        <ComposedChart
          accessibilityLayer
          data={data}
          margin={{ left: 4, right: 12, top: 12 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="periodLabel"
            tickLine={false}
            axisLine={false}
            minTickGap={18}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) =>
              formatUSDAxisTick(String(value), signedValues)
            }
            width="auto"
          />
          <ChartTooltip
            cursor={{ fill: "var(--band)" }}
            itemSorter={() => 0}
            content={
              <ChartTooltipContent
                dataTestId="flow-chart-tooltip"
                className="max-w-[min(24rem,calc(100vw-4rem))] rounded-none border-0 bg-[var(--border-ink)] font-mono text-[var(--frame-foreground)] shadow-none [&_.text-muted-foreground]:text-[var(--frame-foreground)]"
                labelFormatter={(_, payload) =>
                  payload[0]?.payload?.period
                    ? periodLabel(
                        String(payload[0].payload.period),
                        dataset.configuration.grain,
                        true,
                      )
                    : ""
                }
                formatter={(value, name, item, index) => {
                  const key = String(item.dataKey ?? name);
                  const count = Number(
                    item.payload?.[`${key}_unconverted`] ?? 0,
                  );
                  return (
                    <>
                      {index === 0 ? (
                        <div
                          className="mb-0.5 grid w-full gap-1 border-b border-[var(--frame-muted)] pb-1.5"
                          data-testid="flow-chart-summary"
                        >
                          <div
                            className="flex items-center justify-between gap-4 font-medium"
                            data-testid="flow-chart-metric"
                          >
                            <span>{trendLabel}</span>
                            <span className="shrink-0 text-right font-mono tabular-nums">
                              <USDValue
                                amount={String(
                                  item.payload?.overlay_trend_decimal ?? 0,
                                )}
                                positiveSign={signedValues}
                              />
                              {Number(
                                item.payload?.overlay_trend_unconverted ?? 0,
                              ) > 0 ? (
                                <span className="block text-xs font-normal">
                                  {Number(
                                    item.payload?.overlay_trend_unconverted ??
                                      0,
                                  )}{" "}
                                  unconverted
                                </span>
                              ) : null}
                            </span>
                          </div>
                          <div
                            className="grid gap-1"
                            data-testid="flow-chart-totals"
                          >
                            {dataset.configuration.bar_groups.map((group) => {
                              const groupKey = totalKey(group);
                              const groupCount = Number(
                                item.payload?.[`${groupKey}_unconverted`] ?? 0,
                              );
                              return (
                                <div
                                  key={group}
                                  className="flex items-center justify-between gap-4 font-medium"
                                >
                                  <span>
                                    {dataset.configuration.bar_groups.length ===
                                    1
                                      ? "Net total"
                                      : `Total ${barGroupLabel(group).toLowerCase()}`}
                                  </span>
                                  <span className="shrink-0 text-right font-mono tabular-nums">
                                    <USDValue
                                      amount={String(
                                        item.payload?.[groupKey] ?? 0,
                                      )}
                                      positiveSign={signedValues}
                                    />
                                    {groupCount > 0 ? (
                                      <span className="block text-xs font-normal">
                                        {groupCount} unconverted
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {key === "overlay_trend" ? null : (
                        <div className="flex w-full min-w-0 items-center justify-between gap-4">
                          <span className="text-muted-foreground min-w-0 [overflow-wrap:anywhere]">
                            {chartConfig[key]?.label ?? String(name)}
                          </span>
                          <span className="shrink-0 text-right font-mono tabular-nums">
                            <USDValue
                              amount={String(
                                item.payload?.[`${key}_decimal`] ?? value,
                              )}
                              positiveSign={signedValues}
                            />
                            {count > 0 ? (
                              <span className="block text-xs">
                                {count} unconverted
                              </span>
                            ) : null}
                          </span>
                        </div>
                      )}
                    </>
                  );
                }}
              />
            }
          />
          {dataset.configuration.bar_groups.flatMap((group) =>
            orderedSeriesIndexes(dataset, group).map((index) => {
              const series = dataset.breakdown[index];
              return series ? (
                <Bar
                  key={`${group}:${series.series_id}`}
                  dataKey={chartKey(index, group)}
                  fill={`var(--color-${chartKey(index, group)})`}
                  stackId={group}
                  zIndex={300}
                  isAnimationActive={false}
                />
              ) : null;
            }),
          )}
          <Line
            dataKey="overlay_trend"
            name={trendLabel}
            stroke="var(--color-overlay_trend)"
            strokeWidth={4}
            strokeDasharray="8 4"
            strokeLinecap="square"
            dot={{
              fill: "var(--color-class-adjustment-bright)",
              r: 4,
              stroke: "var(--border-ink)",
              strokeWidth: 2,
            }}
            activeDot={{
              fill: "var(--color-class-adjustment-bright)",
              r: 6,
              stroke: "var(--border-ink)",
              strokeWidth: 2,
            }}
            zIndex={600}
            isAnimationActive={false}
            type="linear"
          />
        </ComposedChart>
      </ChartContainer>
      <FlowWindowControl
        key={`${dataset.configuration.grain}:${dataset.configuration.anchor_period}:${dataset.configuration.period_count}:${historyRange.start_date}:${historyRange.end_date}`}
        dataset={dataset}
        historyRange={historyRange}
        onSelectionChange={onSelectionChange}
        selection={selection}
      />
      <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {dataset.excluded_activity.adjustment_transaction_count > 0 ? (
          <span>
            {dataset.excluded_activity.adjustment_transaction_count} adjustment
            transactions excluded
          </span>
        ) : null}
        {dataset.excluded_activity.exchange_transaction_count > 0 ? (
          <span>
            {dataset.excluded_activity.exchange_transaction_count} exchange
            transactions excluded
          </span>
        ) : null}
      </div>
    </section>
  );
};

interface FlowReportLoadResult {
  readonly data?: HouseholdFlowDataset;
  readonly error?: unknown;
}

type FlowReportLoader = (
  selection: HouseholdFlowSelection,
) => Promise<FlowReportLoadResult>;

const FlowReportController = ({
  categoriesUnavailable,
  dataset,
  load,
  onDatasetChange,
}: {
  readonly categoriesUnavailable: boolean;
  readonly dataset: HouseholdFlowDataset;
  readonly load: FlowReportLoader;
  readonly onDatasetChange?: (dataset: HouseholdFlowDataset) => void;
}) => {
  const [displayedDataset, setDisplayedDataset] = useState(dataset);
  const [selection, setSelection] = useState(() =>
    householdFlowSelectionFromDataset(dataset),
  );
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [historyRange, setHistoryRange] = useState<AccountingHistoryRange>(
    () => ({
      start_date: anchorDateFromPeriod(
        dataset.periods[0]?.label ?? dataset.configuration.anchor_period,
      ),
      end_date: anchorDateFromPeriod(dataset.configuration.anchor_period),
    }),
  );
  const [historyRangeErrorMessage, setHistoryRangeErrorMessage] =
    useState<string>();
  const requestGeneration = useRef(0);
  const historyRangeGeneration = useRef(0);
  const failedSelection = useRef<HouseholdFlowSelection | undefined>(undefined);

  const requestHistoryRange = useCallback(async (): Promise<void> => {
    const generation = ++historyRangeGeneration.current;
    const result = await fetchAccountingHistoryRange();
    if (generation !== historyRangeGeneration.current) return;
    if (result.data) {
      setHistoryRange(result.data);
      return;
    }
    setHistoryRangeErrorMessage(
      apiErrorMessage(
        result.error,
        "The full accounting history range could not be loaded.",
      ),
    );
  }, []);

  useEffect(() => {
    const generation = ++historyRangeGeneration.current;
    void fetchAccountingHistoryRange().then((result) => {
      if (generation !== historyRangeGeneration.current) return;
      if (result.data) {
        setHistoryRange(result.data);
        return;
      }
      setHistoryRangeErrorMessage(
        apiErrorMessage(
          result.error,
          "The full accounting history range could not be loaded.",
        ),
      );
    });
    return () => {
      historyRangeGeneration.current += 1;
    };
  }, []);

  const requestReport = useCallback(
    async (next: HouseholdFlowSelection): Promise<void> => {
      const generation = ++requestGeneration.current;
      setSelection(next);
      setLoading(true);
      setErrorMessage(undefined);
      failedSelection.current = undefined;
      const result = await load(next);
      if (generation !== requestGeneration.current) return;
      setLoading(false);
      if (!result.data) {
        failedSelection.current = next;
        setSelection(householdFlowSelectionFromDataset(displayedDataset));
        setErrorMessage(
          apiErrorMessage(
            result.error,
            "The flow report could not be refreshed.",
          ),
        );
        return;
      }
      setDisplayedDataset(result.data);
      setSelection(householdFlowSelectionFromDataset(result.data));
      onDatasetChange?.(result.data);
    },
    [displayedDataset, load, onDatasetChange],
  );

  const includedCount =
    displayedDataset.breakdown.length -
    displayedDataset.configuration.excluded_contributor_ids.length;
  const displayedSelection =
    householdFlowSelectionFromDataset(displayedDataset);
  const contributorActionsDisabled =
    selection.breakdown !== displayedSelection.breakdown ||
    selection.grain !== displayedSelection.grain ||
    selection.periodCount !== displayedSelection.periodCount ||
    selection.anchorDate !== displayedSelection.anchorDate ||
    selection.namedSeriesCount !== displayedSelection.namedSeriesCount;
  return (
    <div className="space-y-3" data-testid="flow-report-visualization">
      {errorMessage ? (
        <div
          className="border-destructive bg-card flex flex-wrap items-center justify-between gap-3 border-2 p-3"
          data-testid="flow-report-error"
          role="alert"
        >
          <div>
            <p className="text-destructive font-semibold">
              Flow report could not be refreshed.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{errorMessage}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void requestReport(failedSelection.current ?? selection)
            }
          >
            <Reload aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}
      {loading ? (
        <span className="sr-only" role="status">
          Updating report…
        </span>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(13rem,24%)_minmax(0,1fr)]">
        <BreakdownControl
          categoriesUnavailable={categoriesUnavailable}
          dataset={displayedDataset}
          disabled={contributorActionsDisabled}
          excludedContributorIds={selection.excludedContributorIds}
          onExcludedChange={(excludedContributorIds) =>
            void requestReport({ ...selection, excludedContributorIds })
          }
          onSelectionChange={(next) => void requestReport(next)}
          selection={selection}
        />
        <FlowChart
          dataset={displayedDataset}
          historyRange={historyRange}
          onSelectionChange={(next) => void requestReport(next)}
          selection={selection}
        />
      </div>
      {historyRangeErrorMessage ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--frame-muted)]">
          <span>{historyRangeErrorMessage}</span>
          <Button
            onClick={() => {
              setHistoryRangeErrorMessage(undefined);
              void requestHistoryRange();
            }}
            size="xs"
            type="button"
            variant="outline"
          >
            Retry range
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-2 text-xs text-[var(--frame-muted)]">
        {includedCount === displayedDataset.breakdown.length ? (
          <Eye aria-hidden="true" />
        ) : (
          <EyeOff aria-hidden="true" />
        )}
        {includedCount} of {displayedDataset.breakdown.length} contributors
        included · chart totals and trend reflect these filters.
      </div>
    </div>
  );
};

interface FlowReportVisualizationProps {
  readonly categoriesUnavailable?: boolean;
  readonly dataset: HouseholdFlowDataset;
  readonly load: FlowReportLoader;
  readonly onDatasetChange?: (dataset: HouseholdFlowDataset) => void;
  readonly reportKey?: string;
}

export const FlowReportVisualization = ({
  categoriesUnavailable = false,
  dataset,
  load,
  onDatasetChange,
  reportKey = "household",
}: FlowReportVisualizationProps) => {
  const [controllerState, setControllerState] = useState(() => ({
    dataset,
    generation: 0,
  }));
  if (controllerState.dataset !== dataset) {
    setControllerState({
      dataset,
      generation: controllerState.generation + 1,
    });
  }

  return (
    <FlowReportController
      key={`${reportKey}:${controllerState.generation}`}
      categoriesUnavailable={categoriesUnavailable}
      dataset={dataset}
      load={load}
      onDatasetChange={onDatasetChange}
    />
  );
};

const noop = () => undefined;
const noopAsync = () => Promise.resolve();

const TransactionPreview = ({
  filters,
  report,
}: {
  readonly filters: TransactionFilters;
  readonly report: HouseholdFlowEntityResponse;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const lookups = useLedgerLookupsResource();
  const retryLookups = useCallback(() => {
    void refreshLedgerLookups();
  }, []);
  const detail = useTransactionDetail({
    lookupsLoaded: Boolean(lookups.snapshot || lookups.errorMessage),
    onNotice: noop,
    params: { filters, limit: 8, offset: 0 },
    searchParams,
    setSearchParams,
    transactions: report.transactions,
  });
  const selectedTransactions: readonly Transaction[] = [];
  const transactionsParams = writeTransactionFiltersToSearchParams(
    new URLSearchParams(),
    filters,
  );
  const openTransactionsWithFilters = (
    nextFilters: TransactionFilters,
  ): void => {
    const params = writeTransactionFiltersToSearchParams(
      new URLSearchParams(),
      nextFilters,
    );
    void navigate(`/transactions?${params.toString()}`);
  };

  return (
    <section
      aria-labelledby="entity-overview-transactions-title"
      data-transaction-detail-restore-target
      data-testid="entity-overview-transactions"
      tabIndex={-1}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="entity-overview-transactions-title"
            className="font-heading text-sm font-semibold text-[var(--frame-foreground)] uppercase"
          >
            Recent transactions
          </h2>
          <p className="mt-1 text-xs text-[var(--frame-muted)]">
            Newest matching active transactions through today
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to={`/transactions?${transactionsParams.toString()}`}>
            Transactions
          </Link>
        </Button>
      </div>
      <TransactionBrowser
        amountDisplayMode="native"
        preview
        editMode={false}
        errorMessage={undefined}
        hasNextPage={false}
        loading={false}
        lookups={lookups.snapshot}
        onConfirmRecurringOccurrence={noopAsync}
        onChangeTransactionLifecycle={noopAsync}
        onClearSelection={noop}
        onFilterCategory={(categoryId) => {
          openTransactionsWithFilters({
            ...filters,
            categoryIds: [categoryId],
          });
        }}
        onFilterMember={(memberId) => {
          openTransactionsWithFilters({ ...filters, memberIds: [memberId] });
        }}
        onFilterTag={(tagId) => {
          openTransactionsWithFilters({
            ...filters,
            tagIds: [...new Set([...filters.tagIds, tagId])],
          });
        }}
        onDeleteTransaction={noopAsync}
        onDismissRecurringOccurrence={noopAsync}
        onNextPage={noop}
        onOpenTransaction={detail.openTransactionDetail}
        onPageSizeChange={noop}
        onPreviousPage={noop}
        onRetryRefresh={retryLookups}
        onPostTransaction={noopAsync}
        onSetEditMode={noop}
        onSelectRange={noop}
        onTogglePageSelection={noop}
        onToggleSelection={noop}
        onUpdateTransactionAmount={() => Promise.resolve(false)}
        onUpdateTransactionsEditRecordState={noopAsync}
        page={1}
        pageSize={8}
        refreshErrorMessage={lookups.errorMessage}
        selectedTransactionIds={new Set()}
        selectedTransactions={selectedTransactions}
        totalCount={report.transactions.length}
        transactions={report.transactions}
      />
      {detail.selectedTransactionId ? (
        <TransactionDetailPanel
          readOnly
          errorMessage={detail.errorMessage}
          loading={detail.loading}
          lookups={lookups.snapshot}
          onChangeLifecycle={noopAsync}
          onClose={detail.closeTransactionDetail}
          onDelete={noopAsync}
          onFilterCategory={(categoryId) => {
            openTransactionsWithFilters({
              ...filters,
              categoryIds: [categoryId],
            });
          }}
          onFilterMember={(memberId) => {
            openTransactionsWithFilters({ ...filters, memberIds: [memberId] });
          }}
          onFilterTag={(tagId) => {
            openTransactionsWithFilters({
              ...filters,
              tagIds: [...new Set([...filters.tagIds, tagId])],
            });
          }}
          onPost={noopAsync}
          onRestoreFocus={detail.restoreDetailFocus}
          transaction={detail.transaction}
          transactionId={detail.selectedTransactionId}
        />
      ) : null}
    </section>
  );
};

const OverviewSkeleton = () => (
  <div className="space-y-6" aria-label="Loading entity overview">
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-[26rem] w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
);

export const EntityOverviewPage = ({
  backHref,
  entityKindLabel,
  request,
}: EntityOverviewPageProps) => {
  const {
    errorMessage,
    loading,
    notFound,
    report,
    retry,
    setFlowReportDataset,
  } = useEntityOverview(request);
  const loadFlowReport = useCallback(
    async (
      selection: HouseholdFlowSelection,
    ): Promise<FlowReportLoadResult> => {
      if (!request) {
        return { error: new Error("The entity scope is unavailable.") };
      }
      const result = await fetchEntityOverview(request, selection);
      return { data: result.data?.dataset, error: result.error };
    },
    [request],
  );
  const entityKindPluralLabel =
    entityKindLabel === "Category" ? "categories" : "tags";
  const reportKey = report
    ? `${report.scope.entity_kind}:${report.scope.scope_kind}:${report.scope.fqn}`
    : "";
  const filters = useMemo<TransactionFilters | undefined>(() => {
    if (!report) return undefined;
    if (report.scope.entity_kind === "category") {
      return report.scope.scope_kind === "leaf"
        ? {
            ...emptyTransactionFilters,
            categoryIds: [report.scope.entity_id!],
          }
        : {
            ...emptyTransactionFilters,
            categoryFqnPrefix: report.scope.fqn,
          };
    }
    return report.scope.scope_kind === "leaf"
      ? {
          ...emptyTransactionFilters,
          tagIds: [report.scope.entity_id!],
        }
      : {
          ...emptyTransactionFilters,
          tagFqnPrefix: report.scope.fqn,
        };
  }, [report]);

  return (
    <section className="space-y-6 pb-8" aria-labelledby="entity-overview-title">
      <PageHeader
        title={
          report ? (
            <FqnPath
              value={report.scope.fqn}
              ancestorClassName="text-[var(--frame-muted)]"
              className="text-2xl"
              leafClassName="text-[var(--frame-foreground)]"
            />
          ) : (
            entityKindLabel
          )
        }
        titleId="entity-overview-title"
        titleClassName="normal-case"
        eyebrow={`${entityKindLabel} overview`}
        help={
          <PageHelp label={`${entityKindLabel} overview help`}>
            {`This overview summarizes flow activity across the selected report range and recent transactions for the selected ${entityKindLabel.toLowerCase()} scope.`}
          </PageHelp>
        }
      />
      {!request ? (
        <div className="bg-card border-2 border-[var(--border-ink)] p-6 shadow-[var(--shadow-pixel)]">
          <h2 className="font-heading font-semibold uppercase">
            Invalid {entityKindLabel.toLowerCase()}
          </h2>
          <Button asChild className="mt-4" variant="outline">
            <Link to={backHref}>Back to {entityKindPluralLabel}</Link>
          </Button>
        </div>
      ) : null}
      {loading && !report ? <OverviewSkeleton /> : null}
      {notFound ? (
        <ReferenceDrilldownNotFound
          backHref={backHref}
          backLabel={`Back to ${entityKindPluralLabel}`}
          entityKindLabel={entityKindLabel}
        />
      ) : null}
      {errorMessage && !report ? (
        <div
          className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
          role="alert"
        >
          <p className="text-destructive font-semibold">
            {entityKindLabel} overview could not be loaded.
          </p>
          <p className="text-muted-foreground mt-2 text-sm">{errorMessage}</p>
          <div className="mt-4 flex gap-3">
            <Button type="button" onClick={retry}>
              <Reload aria-hidden="true" />
              Retry
            </Button>
            <Button asChild variant="outline">
              <Link to={backHref}>Back</Link>
            </Button>
          </div>
        </div>
      ) : null}
      {errorMessage && report ? (
        <div
          className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
          role="alert"
        >
          <p className="text-destructive font-semibold">
            {entityKindLabel} overview could not be refreshed.
          </p>
          <p className="text-muted-foreground mt-2 text-sm">{errorMessage}</p>
          <Button className="mt-4" type="button" onClick={retry}>
            <Reload aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}
      {report && filters ? (
        <>
          <FlowReportTopLine dataset={report.dataset} />
          <FlowReportVisualization
            categoriesUnavailable={
              report.scope.entity_kind === "category" &&
              report.scope.scope_kind === "leaf"
            }
            dataset={report.dataset}
            load={loadFlowReport}
            onDatasetChange={setFlowReportDataset}
            reportKey={reportKey}
          />
          <TransactionPreview filters={filters} report={report} />
        </>
      ) : null}
    </section>
  );
};

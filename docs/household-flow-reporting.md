# Household Flow Reporting

This document is the semantic ground truth for configurable household flow
reporting across Household, Category, and Tag scopes. It defines attribution,
configuration, metrics, periods, filtering, and accounting meaning. Page
composition and responsive layout belong to [`docs/webui-design.md`](webui-design.md).

Owning documents:

- [`docs/accounting-semantics.md`](accounting-semantics.md) owns transaction
  roles, shapes, classes, and amounts.
- [`docs/hierarchy-semantics.md`](hierarchy-semantics.md) owns leaf and implicit
  group behavior.
- [`docs/architecture.md`](architecture.md) owns backend computation boundaries.
- [`docs/frontend-architecture.md`](frontend-architecture.md) owns browser data
  boundaries and charting technology.
- [`api/openapi.yaml`](../api/openapi.yaml) owns the transport contract.

## Scope and Attribution

- Household is the unfiltered household scope. It has no entity identity,
  group behavior, or transaction preview.
- Category and Tag leaves report the selected active entity. Groups report all
  active descendants, including hidden descendants; groups cannot own activity.
- A Category scope includes matching categorized economic-flow records only. A
  split transaction contributes only the records in the selected leaf or group.
- A Tag scope matches a transaction when an active record carries the selected
  Tag or a descendant Tag. Every categorized economic-flow record in each
  matched transaction contributes once, even when multiple records or tags match.
- Hidden state affects ordinary discovery, not reporting attribution.
- Category and Tag reports retain a fixed preview of the newest matching
  transactions. Their Transactions links preserve the exact leaf ID or group
  FQN-prefix scope. Chart configuration and contributor filters never change
  either surface.

### Members

- Member flow reporting is not yet specified and therefore is not implemented.

## Accounting Meaning

- Reportable flow is expense, refund, income, and clawback activity only.
  Transfer movement, adjustments, and exchanges do not contribute to metrics,
  ranks, stacks, totals, or trends.
- Net spend is spend less refunds. Net income is income less clawbacks.
- Net flow is the signed checkbook-accounting change in Mina's tracked household
  position: income and refunds are positive; spend and clawbacks are negative.
  It is not exact household net worth.
- Expense and income Category leaves follow their declared intent. A Category
  group is pure only when every active descendant, including hidden and
  zero-activity descendants, has the same intent. Tags and Household are mixed.
- Pure scopes use one conventional positive `net` stack. Mixed scopes use
  positive `inflow` and negative `outflow` stacks.
- Aggregate amounts and percentages use `values.Decimal` and DuckDB
  `DECIMAL(18,8)`. Out-of-range computation fails; values are never rounded,
  clamped, widened, or represented as internal strings. Decimal strings are
  permitted only at explicit parsing and rendering boundaries such as JSON.

## Shared Configuration

Every Household, Category leaf/group, and Tag leaf/group operation accepts the
same typed configuration. Omitted fields resolve to the defaults below, and the
dataset echoes the effective configuration.

| Scope | Core metric | Default breakdown | Allowed breakdowns |
| --- | --- | --- | --- |
| Expense Category leaf | Net spend | Accounts | Accounts |
| Income Category leaf | Net income | Accounts | Accounts |
| Pure-expense Category group | Net spend | Categories | Accounts, Categories |
| Pure-income Category group | Net income | Categories | Accounts, Categories |
| Mixed Category group | Net flow | Categories | Accounts, Categories |
| Tag leaf or group | Net flow | Categories | Accounts, Categories |
| Household | Net flow | Categories | Accounts, Categories |

- Category breakdown uses leaf Categories for Household and Tag scopes and the
  immediate child Category groups/leaves for Category groups. Account breakdown
  uses contributing accounts and their effective display labels.
- Categories is invalid for Category leaves and returns a validation error.
- Grain is `month` or `year`. Month defaults to 12 calendar buckets and accepts
  integer counts from 6 through 24. Year defaults to 6 calendar buckets and
  accepts every integer count from 3 upward.
- The optional anchor date selects the final visible calendar bucket and defaults
  to today. It cannot be future-dated.
- Named-series count defaults to 5 and accepts every integer at least 5, with no
  product maximum.
- Trend is `rolling_average` or `rolling_sum`. Omission selects rolling average
  for month grain and rolling sum for year grain.
- Changing breakdown, grain, range, anchor, or named-series count creates a new ranked
  universe, so clients reset contributor selections. Changing only contributor
  selection or trend retains the universe.

## Period Dataset

- Periods are calendar-aligned by transaction `initiated_date`, oldest first.
  The current partial period is included through today; complete and zero-activity
  periods remain explicit.
- Configuration echoes the aligned anchor. A separate accounting-history range
  read returns the earliest active accounting date through today so clients can
  bound one movable, resizable window without coupling it to report scope.
- Contributors are ranked by absolute reportable activity over the selected
  visible range before contributor filters are applied. The requested number
  of named contributors remains stable while filtering; every remaining
  contributor is combined into stable `Other` identity when present.
- Each period supplies stable contributor identities, signed stacks,
  unconverted counts, filtered group totals, and the selected trend point.
- Tooltip data leads with the selected trend value and backend-supplied filtered
  totals. Contributors follow with inflows descending, then outflows ascending
  so the largest spend appears first; `Other` is last within either group. Stack
  order matches this tooltip order.
- Scope top-line cards remain whole-scope summaries. Contributor filtering
  changes only chart stacks, period totals, conversion disclosure, and trend.

## Whole-Scope Summaries

- Household, Category, and Tag reports show the current calendar-month total through today.
- Their monthly average is the arithmetic mean of the three complete calendar
  months before the current month; zero-activity months count as zero.
- Month-over-month compares the most recent complete month with its preceding
  complete month. Year-over-year compares that month with the same month one
  year earlier.
- A zero comparison baseline produces an unavailable percentage, never zero or
  infinity.
- Summary values and the adjustment/exchange exclusion disclosure use the full
  report scope and never respond to chart contributor filters.

## Contributor Filtering

- Every named breakdown item and `Other` is a server-applied chart filter.
- Filters use stable identities from the ranked dataset. Ranking and `Other`
  membership do not change when contributors are excluded.
- Selecting all contributors returns the unfiltered chart. Selecting none
  returns the complete requested period spine with zero stacks, zero totals,
  zero unconverted counts, and a trend computed from those retained zeros.
- The server recomputes stacks, period group totals, conversion disclosure, and
  the selected trend from retained contributors. The browser performs no
  accounting or trend arithmetic.

## Trends

- Every chart exposes one selected trend line, painted in high contrast above
  every bar.
- Rolling average for a plotted bucket is the arithmetic mean of the three
  complete calendar buckets immediately before it. Zero-activity buckets count
  as zero; the current partial bucket uses the preceding three complete buckets.
- Rolling sum is range-to-date: each point sums from the first visible bucket
  through that bucket. Its final point equals the filtered net total for the
  entire selected range.
- Trend values retain signed net meaning and carry their own unconverted count.

## Experience Requirements

- Controls form one inline chart deck: trend sits in the graph's upper-right;
  the checklist footer holds named-series step buttons at left and the breakdown
  toggle at right; grain sits left of a two-thumb range/anchor control below the
  x-axis.
- Repeated series colors remain distinguishable through labels, checkboxes,
  tooltip text, and signs; color is never the only series identifier.
- Empty, sparse, filtered, and large-series reports stay responsive,
  accessible, theme-compatible, and local-first.
- During refetch, clients keep the last successful dataset visible, ignore or
  cancel stale responses, and present recoverable errors.

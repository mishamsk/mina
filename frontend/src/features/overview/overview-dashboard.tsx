import { Reload } from "pixelarticons/react";
import { useMemo } from "react";
import { Link } from "react-router";

import type { Transaction } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FlowReportTopLine,
  FlowReportVisualization,
} from "@/features/entity-overviews";
import {
  AccountDisplayLabel,
  AmountText,
  ApproximateUsdAmount,
  ClassIcon,
  displayStatusLabel,
  formatInitiatedDateParts,
  lineDisplayAmounts,
  lineMemo,
  lineStatus,
  MorePartsIndicator,
  StatusIcon,
  sumDecimalStrings,
  transactionAccountFqnContext,
  transactionClassLabel,
  transactionHasMoreParts,
  transactionPartsLabel,
} from "@/features/ledger";
import { cn } from "@/lib/utils";
import type { OverviewBalanceRow } from "@/store";
import { localYearMonth } from "@/utils/date";

import {
  commitOverviewFlowReport,
  loadOverviewFlowReport,
  refreshOverview,
  useOverviewResource,
} from "./use-overview-resource";

interface BalanceGroup {
  readonly accountType: "owned" | "party";
  readonly root: string;
  readonly rows: readonly AccountBalanceRow[];
  readonly subtotalUsd: string;
  readonly unconvertedCount: number;
}

interface AccountBalanceRow {
  readonly account: OverviewBalanceRow["account"];
  readonly balances: readonly OverviewBalanceRow["balance"][];
}

const displayedBalanceAmount = (
  balance: OverviewBalanceRow["balance"],
): string => balance.remaining_credit ?? balance.current_balance;

const isZeroAmount = (amount: string): boolean => Number(amount) === 0;

const groupedBalances = (
  rows: readonly OverviewBalanceRow[],
): readonly BalanceGroup[] => {
  const groups = new Map<string, OverviewBalanceRow[]>();
  for (const row of rows) {
    const root = row.account.fqn.split(":")[0] ?? row.account.fqn;
    const key = `${row.account.account_type}:${root}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupRows]) => {
      const [accountType, ...rootParts] = key.split(":");
      const root = rootParts.join(":");
      const rowsByAccountId = new Map<number, AccountBalanceRow>();
      for (const row of groupRows) {
        if (isZeroAmount(displayedBalanceAmount(row.balance))) {
          continue;
        }
        const existing = rowsByAccountId.get(row.account.account_id);
        rowsByAccountId.set(row.account.account_id, {
          account: row.account,
          balances: [...(existing?.balances ?? []), row.balance],
        });
      }
      const rows = [...rowsByAccountId.values()].sort(
        (left, right) =>
          Number(right.account.is_featured) -
            Number(left.account.is_featured) ||
          left.account.fqn.localeCompare(right.account.fqn),
      );

      return {
        accountType: accountType as "owned" | "party",
        root,
        rows,
        subtotalUsd: sumDecimalStrings(
          groupRows.map((row) => row.balance.current_balance_usd),
        ),
        unconvertedCount: groupRows.reduce(
          (count, row) => count + row.balance.unconverted_count,
          0,
        ),
      };
    })
    .filter(
      (group) =>
        group.rows.length > 0 ||
        !isZeroAmount(group.subtotalUsd) ||
        group.unconvertedCount > 0,
    );
};

const monthLabel = (yearMonth: string): string => {
  const [year = "0", month = "1"] = yearMonth.split("-");
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(year), Number(month) - 1, 1));
};

const UnconvertedNote = ({ count }: { readonly count: number }) =>
  count > 0 ? (
    <span className="text-muted-foreground text-xs">{count} unconverted</span>
  ) : null;

const partyBalanceLabel = (amount: string): string => {
  if (amount.startsWith("-")) {
    return "Owed by household";
  }
  return /^0(?:\.0+)?$/.test(amount) ? "Settled" : "Owed to household";
};

const OverviewError = ({ message }: { readonly message: string }) => (
  <div className="border-destructive bg-card border-2 p-4" role="alert">
    <p className="text-destructive font-semibold">
      Overview could not be loaded.
    </p>
    <details className="text-muted-foreground mt-3 text-sm">
      <summary className="text-foreground cursor-pointer">API error</summary>
      <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
        {message}
      </pre>
    </details>
  </div>
);

const BalancesSkeleton = () => (
  <div className="grid gap-4 xl:grid-cols-2" aria-label="Loading balances">
    {Array.from({ length: 2 }).map((_, groupIndex) => (
      <Card key={groupIndex}>
        <CardHeader className="grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
          <div className="justify-self-end">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-2 h-3 w-16 justify-self-end" />
          </div>
        </CardHeader>
        <CardContent>
          <ul>
            {Array.from({ length: 3 }).map((_, rowIndex) => (
              <li
                key={rowIndex}
                className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--hairline)] py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <Skeleton className="h-5 w-40 max-w-full" />
                </div>
                <div className="flex min-w-0 flex-col items-end gap-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-7 w-28" />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    ))}
  </div>
);

const PulseSkeleton = () => (
  <div className="grid gap-3 md:grid-cols-2" aria-label="Loading month pulse">
    {Array.from({ length: 2 }).map((_, index) => (
      <Card key={index} size="sm">
        <CardHeader>
          <Skeleton className="h-4 w-16" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
        </CardContent>
      </Card>
    ))}
  </div>
);

const RecentSkeleton = () => (
  <Card aria-label="Loading recent activity">
    <CardHeader>
      <Skeleton className="h-5 w-40" />
    </CardHeader>
    <CardContent className="flex flex-col gap-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-14" />
      ))}
    </CardContent>
  </Card>
);

const FlowReportSkeleton = () => (
  <div className="space-y-3" aria-label="Loading household flow report">
    <div className="bg-card grid border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)] sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="min-h-28 min-w-0 border-t border-[var(--hairline)] px-4 py-3 first:border-t-0 xl:border-t-0 xl:border-l xl:first:border-l-0 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(even)]:border-l"
        >
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-1 h-7 w-44 max-w-full" />
          <Skeleton className="mt-1 h-3 w-32 max-w-full" />
        </div>
      ))}
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(13rem,24%)_minmax(0,1fr)]">
      <Skeleton className="order-2 h-64 lg:order-1 lg:h-[calc(32rem+19px)]" />
      <Skeleton className="order-1 h-[calc(32rem+19px)] lg:order-2" />
    </div>
    <Skeleton className="h-4 w-80 max-w-full" />
  </div>
);

const BalanceRow = ({ row }: { readonly row: AccountBalanceRow }) => (
  <li
    data-testid="overview-balance-row"
    className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--hairline)] py-3 first:border-t-0"
  >
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <AccountDisplayLabel
        account={row.account}
        to={`/accounts/${row.account.account_id}`}
      />
      {row.account.is_featured ? (
        <Badge variant="secondary" className="text-[10px]">
          Featured
        </Badge>
      ) : null}
    </div>
    <div className="flex min-w-0 flex-col items-end gap-2">
      {row.balances.map((balance) => (
        <div
          key={balance.currency}
          className="flex min-w-0 flex-col items-end gap-1"
        >
          <p className="text-muted-foreground font-mono text-xs">
            {balance.currency}
            {balance.remaining_credit !== undefined ? (
              <>
                <span aria-hidden="true"> · </span>
                Remaining credit
              </>
            ) : row.account.account_type === "party" ? (
              <>
                <span aria-hidden="true"> · </span>
                {partyBalanceLabel(balance.current_balance)}
              </>
            ) : null}
          </p>
          <AmountText
            amount={{
              amount: displayedBalanceAmount(balance),
              currency: balance.currency,
            }}
            chip
            positiveSign={false}
            tone="neutral"
          />
        </div>
      ))}
    </div>
  </li>
);

const BalanceGroups = ({
  groups,
}: {
  readonly groups: readonly BalanceGroup[];
}) => {
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted-foreground">
            No active balance accounts yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {groups.map((group) => (
        <Card
          key={`${group.accountType}:${group.root}`}
          data-testid="overview-balance-group"
        >
          <CardHeader className="grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <CardTitle className="font-heading text-base font-bold uppercase">
                <Link
                  to={`/accounts/group?prefix=${encodeURIComponent(group.root)}`}
                  className="focus-visible:outline-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {group.root}
                </Link>
              </CardTitle>
              <p className="text-muted-foreground text-xs">
                {group.accountType === "owned"
                  ? "Owned funds"
                  : "Party balances"}{" "}
                · {group.rows.length} account
                {group.rows.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="justify-self-end text-right">
              <ApproximateUsdAmount
                amountUsd={group.subtotalUsd}
                className="font-semibold"
              />
              {group.accountType === "party" ? (
                <p className="text-muted-foreground text-xs">
                  {group.unconvertedCount > 0
                    ? "Direction unavailable"
                    : partyBalanceLabel(group.subtotalUsd)}
                </p>
              ) : null}
              <div>
                <UnconvertedNote count={group.unconvertedCount} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul>
              {group.rows.map((row) => (
                <BalanceRow key={row.account.account_id} row={row} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const PulseTile = ({
  amountUsd,
  label,
  unconvertedCount,
}: {
  readonly amountUsd: string;
  readonly label: string;
  readonly unconvertedCount: number;
}) => (
  <Card size="sm" data-testid="overview-pulse-tile">
    <CardHeader>
      <p className="text-muted-foreground text-sm">{label}</p>
    </CardHeader>
    <CardContent>
      <ApproximateUsdAmount
        amountUsd={amountUsd}
        className="text-xl font-bold"
      />
      <div className="mt-1">
        <UnconvertedNote count={unconvertedCount} />
      </div>
    </CardContent>
  </Card>
);

const recentActivityTooltipLabel = (
  transaction: Transaction,
  accountFqnContext: string,
  memo: string | undefined,
  displayStatus: ReturnType<typeof lineStatus>,
): string =>
  [
    `Class ${transactionClassLabel(transaction.transaction_class)}`,
    displayStatus ? `Status ${displayStatusLabel(displayStatus)}` : undefined,
    `Description ${transaction.display_title}`,
    accountFqnContext,
    memo ? `Memo ${memo}` : undefined,
    transactionHasMoreParts(transaction)
      ? `All parts ${transactionPartsLabel(transaction)}`
      : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(". ");

const RecentActivityLine = ({
  accountFqnContext,
  transaction,
}: {
  readonly accountFqnContext: string;
  readonly transaction: Transaction;
}) => {
  const memo = lineMemo(transaction);
  const dateParts = formatInitiatedDateParts(transaction.initiated_date);
  const displayStatus = lineStatus(transaction);
  const amounts = lineDisplayAmounts(transaction);
  const hasMoreParts = transactionHasMoreParts(transaction);
  const amountDeemphasized =
    displayStatus === "pending" ||
    displayStatus === "mixed" ||
    displayStatus === "cancelled";
  const lineInactive = displayStatus === "cancelled";

  return (
    <li>
      <Tooltip
        asChild
        label={recentActivityTooltipLabel(
          transaction,
          accountFqnContext,
          memo,
          displayStatus,
        )}
      >
        <Link
          to={`/transactions?transaction=${transaction.transaction_id}`}
          data-testid="overview-recent-activity-link"
          className={cn(
            "grid min-h-16 grid-cols-[1.75rem_4rem_1.75rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--hairline)] px-1 py-3 first:border-t-0",
            "hover:bg-muted focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
            lineInactive && "text-muted-foreground line-through",
          )}
        >
          <ClassIcon
            focusable={false}
            transactionClass={transaction.transaction_class}
          />
          <span className="font-mono text-xs">
            <span className="block font-semibold">{dateParts.day}</span>
            <span className="text-muted-foreground block">
              {dateParts.year}
            </span>
          </span>
          <span className="inline-grid size-6 place-items-center">
            {displayStatus ? (
              <StatusIcon focusable={false} status={displayStatus} />
            ) : null}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-mono text-sm font-semibold">
              {transaction.display_title}
            </span>
            {memo ? (
              <Tooltip focusable={false} label={memo} className="block min-w-0">
                <span className="text-muted-foreground block truncate text-xs">
                  {memo}
                </span>
              </Tooltip>
            ) : null}
          </span>
          <span className="flex max-w-56 min-w-0 flex-nowrap justify-end gap-1 overflow-hidden">
            {amounts.map((amount, index) => (
              <AmountText
                key={`${amount.currency}:${amount.amount}:${index}`}
                amount={amount}
                chip
                overflowTooltip
                className={cn(
                  "max-w-full min-w-0",
                  amountDeemphasized && "text-muted-foreground bg-card",
                )}
                positiveSign={
                  transaction.transaction_class !== "transfer" &&
                  transaction.transaction_class !== "currency_exchange"
                }
                tone="neutral"
                truncate
              />
            ))}
            {hasMoreParts ? (
              <MorePartsIndicator transaction={transaction} />
            ) : null}
          </span>
        </Link>
      </Tooltip>
    </li>
  );
};

export const OverviewDashboard = () => {
  const month = localYearMonth();
  const overview = useOverviewResource(month);
  const snapshot = overview.snapshot;
  const groups = useMemo(
    () => groupedBalances(snapshot?.balanceRows ?? []),
    [snapshot?.balanceRows],
  );
  const accountsById = useMemo(
    () =>
      new Map(
        snapshot?.accounts.map((account) => [account.account_id, account]) ??
          [],
      ),
    [snapshot?.accounts],
  );

  return (
    <>
      {overview.errorMessage ? (
        <OverviewError message={overview.errorMessage} />
      ) : null}

      <section
        className="flex flex-col gap-3"
        aria-labelledby="household-flow-title"
        data-testid="overview-flow-report"
      >
        <h2
          id="household-flow-title"
          className="font-heading text-base font-bold text-[var(--frame-foreground)] uppercase"
        >
          Household net flow
        </h2>
        {snapshot?.flowReportErrorMessage ? (
          <div
            className="border-destructive bg-card flex flex-wrap items-center justify-between gap-3 border-2 p-3"
            role="alert"
          >
            <div>
              <p className="text-destructive font-semibold">
                Household flow could not be refreshed.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {snapshot.flowReportErrorMessage}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshOverview(month)}
            >
              <Reload aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : null}
        {snapshot?.flowReport ? (
          <>
            <FlowReportTopLine dataset={snapshot.flowReport} />
            <FlowReportVisualization
              dataset={snapshot.flowReport}
              load={loadOverviewFlowReport}
              onDatasetChange={commitOverviewFlowReport}
            />
          </>
        ) : !snapshot?.flowReportErrorMessage &&
          (snapshot || overview.loading) ? (
          <FlowReportSkeleton />
        ) : null}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="balances-title">
        <h2
          id="balances-title"
          className="font-heading text-base font-bold text-[var(--frame-foreground)] uppercase"
        >
          Balances
        </h2>
        {snapshot ? (
          <BalanceGroups groups={groups} />
        ) : overview.loading ? (
          <BalancesSkeleton />
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-bold text-[var(--frame-foreground)] uppercase">
            {monthLabel(snapshot?.month ?? month)}
          </h2>
          {!snapshot && overview.loading ? (
            <PulseSkeleton />
          ) : snapshot ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <PulseTile
                label="Spend"
                amountUsd={snapshot.monthTotals.spend.amount_usd}
                unconvertedCount={snapshot.monthTotals.spend.unconverted_count}
              />
              <PulseTile
                label="Income"
                amountUsd={snapshot.monthTotals.income.amount_usd}
                unconvertedCount={snapshot.monthTotals.income.unconverted_count}
              />
            </div>
          ) : null}
        </div>

        <section
          className="flex min-w-0 flex-col gap-3"
          aria-labelledby="recent-activity-title"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="recent-activity-title"
              className="font-heading text-base font-bold text-[var(--frame-foreground)] uppercase"
            >
              Recent activity
            </h2>
            <Link
              to="/transactions"
              className="font-heading text-sm font-semibold text-[var(--frame-foreground)] uppercase underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </div>
          {!snapshot && overview.loading ? (
            <RecentSkeleton />
          ) : snapshot ? (
            <Card>
              <CardContent>
                {snapshot.recentTransactions.length > 0 ? (
                  <ul>
                    {snapshot.recentTransactions.map((transaction) => (
                      <RecentActivityLine
                        key={transaction.transaction_id}
                        accountFqnContext={transactionAccountFqnContext(
                          transaction,
                          { accountsById },
                          { includeDisplayTitle: false },
                        )}
                        transaction={transaction}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No activity yet.</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </section>
      </section>
    </>
  );
};

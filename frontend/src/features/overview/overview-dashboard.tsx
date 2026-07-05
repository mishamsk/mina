import { useMemo } from "react";
import { Link } from "react-router";

import type { Transaction } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AmountText,
  ApproximateUsdAmount,
  buildLookupMaps,
  ClassIcon,
  formatInitiatedDateParts,
  FqnPath,
  lineDisplayAmounts,
  lineMemo,
  linePostingStatus,
  MixedAmounts,
  StatusIcon,
  sumDecimalStrings,
  transactionClassLabel,
} from "@/features/ledger";
import { cn } from "@/lib/utils";
import type {
  LedgerLookupsSnapshot,
  OverviewBalanceRow,
  OverviewSnapshot,
} from "@/store";
import { getTransactionsSnapshot } from "@/store";
import { localYearMonth } from "@/utils/date";

import { useOverviewResource } from "./use-overview-resource";

interface BalanceGroup {
  readonly root: string;
  readonly rows: readonly OverviewBalanceRow[];
  readonly subtotalUsd: string;
  readonly unconvertedCount: number;
}

const groupedBalances = (
  rows: readonly OverviewBalanceRow[],
): readonly BalanceGroup[] => {
  const groups = new Map<string, OverviewBalanceRow[]>();
  for (const row of rows) {
    const root = row.account.fqn.split(":")[0] ?? row.account.fqn;
    groups.set(root, [...(groups.get(root) ?? []), row]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([root, groupRows]) => {
      const rows = groupRows.sort(
        (left, right) =>
          Number(right.account.is_featured) -
            Number(left.account.is_featured) ||
          left.account.fqn.localeCompare(right.account.fqn),
      );

      return {
        root,
        rows,
        subtotalUsd: sumDecimalStrings(
          rows.map((row) => row.balance.current_balance_usd),
        ),
        unconvertedCount: rows.reduce(
          (count, row) => count + row.balance.unconverted_count,
          0,
        ),
      };
    });
};

const overviewLookups = (
  snapshot: OverviewSnapshot | undefined,
): LedgerLookupsSnapshot | undefined =>
  getTransactionsSnapshot().lookups ??
  (snapshot
    ? {
        accounts: snapshot.accounts,
        categories: [],
        loadedAt: snapshot.loadedAt,
        members: [],
        tags: [],
      }
    : undefined);

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
                  <Skeleton className="mt-2 h-3 w-24 max-w-full" />
                </div>
                <Skeleton className="h-7 w-28 justify-self-end" />
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

const BalanceRow = ({ row }: { readonly row: OverviewBalanceRow }) => {
  const remainingCredit =
    row.balance.credit_limit === undefined
      ? undefined
      : sumDecimalStrings([
          row.balance.credit_limit,
          row.balance.current_balance,
        ]);

  return (
    <li
      data-testid="overview-balance-row"
      className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--hairline)] py-3 first:border-t-0"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <FqnPath value={row.account.fqn} />
          {row.account.is_featured ? (
            <Badge variant="secondary" className="text-[10px]">
              Featured
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          {row.balance.currency}
          {remainingCredit ? (
            <>
              <span aria-hidden="true"> · </span>
              <span>Remaining credit </span>
              <AmountText
                amount={{
                  amount: remainingCredit,
                  currency: row.balance.currency,
                }}
                className="font-semibold"
                positiveSign={false}
                tone="neutral"
              />
            </>
          ) : null}
        </p>
      </div>
      <AmountText
        amount={{
          amount: row.balance.current_balance,
          currency: row.balance.currency,
        }}
        chip
        className="justify-self-end"
        positiveSign={false}
        tone="neutral"
      />
    </li>
  );
};

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
        <Card key={group.root} data-testid="overview-balance-group">
          <CardHeader className="grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <CardTitle className="font-heading text-base font-bold uppercase">
                {group.root}
              </CardTitle>
              <p className="text-muted-foreground text-xs">
                {group.rows.length} account{group.rows.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="justify-self-end text-right">
              <ApproximateUsdAmount
                amountUsd={group.subtotalUsd}
                className="font-semibold"
              />
              <div>
                <UnconvertedNote count={group.unconvertedCount} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul>
              {group.rows.map((row) => (
                <BalanceRow
                  key={`${row.account.account_id}:${row.balance.currency}`}
                  row={row}
                />
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

const StatusMixedMarker = () => (
  <Tooltip
    focusable={false}
    label="Mixed posting status"
    className="font-heading text-foreground bg-card inline-grid size-5 place-items-center border border-[var(--border-ink)] text-[11px] font-semibold uppercase shadow-[var(--shadow-chip)]"
  >
    <span aria-hidden="true">M</span>
  </Tooltip>
);

const postingStatusLabel = (status: string): string =>
  status === "mixed"
    ? "Mixed posting status"
    : `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;

const recentActivityTooltipLabel = (
  transaction: Transaction,
  memo: string | undefined,
  postingStatus: string,
): string =>
  [
    `Class ${transactionClassLabel(transaction.transaction_class)}`,
    `Status ${postingStatusLabel(postingStatus)}`,
    `Description ${transaction.display_title}`,
    memo ? `Memo ${memo}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(". ");

const RecentActivityLine = ({
  lookups,
  transaction,
}: {
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly transaction: Transaction;
}) => {
  const maps = useMemo(() => buildLookupMaps(lookups), [lookups]);
  const memo = lineMemo(transaction);
  const dateParts = formatInitiatedDateParts(transaction.initiated_date);
  const postingStatus = linePostingStatus(transaction);
  const amounts = lineDisplayAmounts(transaction, maps);
  const amountDeemphasized =
    postingStatus === "pending" || postingStatus === "cancelled";
  const lineInactive = postingStatus === "cancelled";

  return (
    <li>
      <Tooltip
        asChild
        label={recentActivityTooltipLabel(transaction, memo, postingStatus)}
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
            {postingStatus === "mixed" ? (
              <StatusMixedMarker />
            ) : (
              <StatusIcon focusable={false} status={postingStatus} />
            )}
          </span>
          <span className="min-w-0">
            <Tooltip
              focusable={false}
              label={transaction.display_title}
              className="block min-w-0"
            >
              <span className="block truncate font-mono text-sm font-semibold">
                {transaction.display_title}
              </span>
            </Tooltip>
            {memo ? (
              <Tooltip focusable={false} label={memo} className="block min-w-0">
                <span className="text-muted-foreground block truncate text-xs">
                  {memo}
                </span>
              </Tooltip>
            ) : null}
          </span>
          <span className="flex max-w-56 flex-wrap justify-end gap-1">
            {transaction.transaction_class === "mixed" ? (
              <MixedAmounts amounts={amounts} />
            ) : (
              amounts.map((amount, index) => (
                <AmountText
                  key={`${amount.currency}:${amount.amount}:${index}`}
                  amount={amount}
                  chip
                  className={cn(
                    "max-w-full",
                    amountDeemphasized && "text-muted-foreground bg-card",
                  )}
                  positiveSign={
                    transaction.transaction_class !== "transfer" &&
                    transaction.transaction_class !== "currency_exchange"
                  }
                  transactionClass={transaction.transaction_class}
                />
              ))
            )}
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
  const lookups = overviewLookups(snapshot);
  const groups = useMemo(
    () => groupedBalances(snapshot?.balanceRows ?? []),
    [snapshot?.balanceRows],
  );

  return (
    <>
      {overview.errorMessage ? (
        <OverviewError message={overview.errorMessage} />
      ) : null}

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
                        lookups={lookups}
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

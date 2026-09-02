import { RefreshCw } from "lucide-react";
import { Banknote } from "pixelarticons/react";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountDisplayLabel } from "@/features/ledger";
import { formatDecimalAmount } from "@/features/ledger/format";
import { cn } from "@/lib/utils";
import type { FeaturedBalanceRow } from "@/store";
import { currencyDisplayMarker } from "@/utils/currency";

import {
  refreshFeaturedBalances,
  useFeaturedBalancesResource,
} from "./use-featured-balances-resource";

interface BalanceStripProps {
  readonly collapsed: boolean;
  readonly onNavigate?: () => void;
}

const formatBalance = (row: FeaturedBalanceRow): string =>
  `${formatDecimalAmount(
    row.balance.remaining_credit ?? row.balance.current_balance,
    row.balance.currency,
    {
      positiveSign: false,
    },
  )} ${currencyDisplayMarker(row.balance.currency)}`;

const partyBalanceLabel = (row: FeaturedBalanceRow): string => {
  if (row.balance.current_balance.startsWith("-")) {
    return "Owed by household";
  }
  return /^0(?:\.0+)?$/.test(row.balance.current_balance)
    ? "Settled"
    : "Owed to household";
};

const balanceLabel = (row: FeaturedBalanceRow): string | undefined =>
  row.balance.remaining_credit !== undefined
    ? "Remaining credit"
    : row.account.account_type === "party"
      ? partyBalanceLabel(row)
      : undefined;

const collapsedTooltipLabel = (rows: readonly FeaturedBalanceRow[]): string =>
  rows
    .map(
      (row) =>
        `${row.account.display_label} (${row.account.fqn})${balanceLabel(row) ? ` ${balanceLabel(row)}:` : ""} ${formatBalance(row)}`,
    )
    .join("; ");

const BalanceAmount = ({ row }: { readonly row: FeaturedBalanceRow }) => (
  <span
    data-testid="featured-balance-amount"
    className="max-w-full min-w-0 text-right font-mono text-xs leading-5 break-all text-[var(--frame-foreground)] tabular-nums"
  >
    <span>
      {formatDecimalAmount(
        row.balance.remaining_credit ?? row.balance.current_balance,
        row.balance.currency,
        { positiveSign: false },
      )}
    </span>
    <span className="text-[var(--frame-muted)]">
      {` ${currencyDisplayMarker(row.balance.currency)}`}
    </span>
  </span>
);

const ExpandedBalanceGroup = ({
  label,
  rows,
}: {
  readonly label: string;
  readonly rows: readonly FeaturedBalanceRow[];
}) => (
  <section aria-label={label} data-testid="featured-balance-group">
    <p className="px-2 font-mono text-xs font-semibold text-[var(--frame-muted)] uppercase">
      {label}
    </p>
    <div role="list" className="mt-1 flex flex-col gap-1">
      {rows.map((row) => (
        <div
          key={`${row.account.account_id}:${row.balance.currency}`}
          role="listitem"
          data-testid="featured-balance-row"
          className="grid min-h-8 grid-cols-[minmax(0,1fr)_minmax(0,50%)] items-center gap-2 px-2 py-1"
        >
          <div className="min-w-0">
            <AccountDisplayLabel
              account={row.account}
              className="block text-xs text-[var(--frame-foreground)]"
              testId="featured-balance-name"
              to={`/accounts/${row.account.account_id}`}
            />
            {balanceLabel(row) ? (
              <Tooltip
                className="block min-w-0"
                label={balanceLabel(row) ?? ""}
              >
                <span className="block truncate font-mono text-xs text-[var(--frame-muted)]">
                  {balanceLabel(row)}
                </span>
              </Tooltip>
            ) : null}
          </div>
          <BalanceAmount row={row} />
        </div>
      ))}
    </div>
  </section>
);

const ExpandedBalanceRows = ({
  rows,
}: {
  readonly rows: readonly FeaturedBalanceRow[];
}) => {
  const ownedRows = rows.filter((row) => row.account.account_type === "owned");
  const partyRows = rows.filter((row) => row.account.account_type === "party");

  return (
    <div className="flex flex-col gap-2">
      {ownedRows.length > 0 ? (
        <ExpandedBalanceGroup label="Household funds" rows={ownedRows} />
      ) : null}
      {partyRows.length > 0 ? (
        <ExpandedBalanceGroup label="Party balances" rows={partyRows} />
      ) : null}
    </div>
  );
};

const BalanceSkeletonRows = () => (
  <div
    aria-hidden="true"
    className="flex flex-col gap-1"
    data-testid="featured-balance-skeleton"
  >
    {Array.from({ length: 3 }).map((_, index) => (
      <div
        key={index}
        className="grid min-h-8 grid-cols-[minmax(0,1fr)_minmax(0,50%)] items-center gap-2 px-2 py-1"
      >
        <Skeleton className="h-4 w-20 bg-[var(--frame-muted)]" />
        <Skeleton className="h-4 w-16 justify-self-end bg-[var(--frame-muted)]" />
      </div>
    ))}
  </div>
);

const retryFeaturedBalances = () => {
  void refreshFeaturedBalances();
};

const BalanceStripError = ({
  errorMessage,
  loading,
}: {
  readonly errorMessage: string;
  readonly loading: boolean;
}) => (
  <div
    role="alert"
    className="border-destructive bg-card text-foreground mx-2 border-2 p-2 text-xs"
  >
    <p className="text-destructive font-semibold">
      Featured balances could not be loaded.
    </p>
    <details className="mt-2 text-[var(--muted-foreground)]">
      <summary className="text-foreground cursor-pointer">API error</summary>
      <pre className="mt-1 overflow-auto font-mono whitespace-pre-wrap">
        {errorMessage}
      </pre>
    </details>
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="mt-2"
      disabled={loading}
      onClick={retryFeaturedBalances}
    >
      <RefreshCw aria-hidden="true" />
      Retry
    </Button>
  </div>
);

export const BalanceStrip = ({ collapsed, onNavigate }: BalanceStripProps) => {
  const { errorMessage, loading, snapshot } = useFeaturedBalancesResource();
  const rows = snapshot?.rows ?? [];

  if (!errorMessage && snapshot && rows.length === 0) {
    return null;
  }

  if (collapsed) {
    let label = "Featured balances";
    if (errorMessage) {
      label = `Featured balances could not be loaded. ${errorMessage}`;
    } else if (rows.length > 0) {
      label = collapsedTooltipLabel(rows);
    }
    const collapsedControlClass = cn(
      "flex h-9 w-full items-center justify-center border-2 border-transparent text-[var(--frame-muted)]",
      "hover:border-[var(--border-ink)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--frame-foreground)]",
      errorMessage && "text-destructive",
    );
    return (
      <section
        aria-label="Featured balances"
        data-testid="featured-balance-strip"
      >
        {errorMessage ? (
          <Tooltip label={label} asChild>
            <button
              type="button"
              disabled={loading}
              onClick={retryFeaturedBalances}
              className={collapsedControlClass}
            >
              <Banknote className="size-4" aria-hidden="true" />
              <span className="sr-only">Retry featured balances</span>
            </button>
          </Tooltip>
        ) : (
          <Tooltip label={label} asChild>
            <div tabIndex={0} className={collapsedControlClass}>
              <Banknote className="size-4" aria-hidden="true" />
              <span className="sr-only">Featured balances</span>
            </div>
          </Tooltip>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Featured balances"
      data-testid="featured-balance-strip"
      className="flex flex-col gap-2"
      aria-busy={loading ? "true" : undefined}
      onClickCapture={(event) => {
        if (
          onNavigate &&
          event.target instanceof Element &&
          event.target.closest("a[href]")
        ) {
          onNavigate();
        }
      }}
    >
      <p className="text-pixel px-2 text-xs text-[var(--frame-muted)]">
        Featured
      </p>
      {snapshot ? (
        <ExpandedBalanceRows rows={rows} />
      ) : !errorMessage ? (
        <BalanceSkeletonRows />
      ) : null}
      {errorMessage ? (
        <BalanceStripError errorMessage={errorMessage} loading={loading} />
      ) : null}
    </section>
  );
};

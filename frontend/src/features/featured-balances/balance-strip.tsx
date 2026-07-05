import { RefreshCw } from "lucide-react";
import { Banknote } from "pixelarticons/react";
import { Link } from "react-router";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
}

const formatBalance = (row: FeaturedBalanceRow): string =>
  `${formatDecimalAmount(row.balance.current_balance, row.balance.currency, {
    positiveSign: false,
  })} ${currencyDisplayMarker(row.balance.currency)}`;

const collapsedTooltipLabel = (rows: readonly FeaturedBalanceRow[]): string =>
  rows.map((row) => `${row.account.fqn} ${formatBalance(row)}`).join("; ");

const BalanceAmount = ({ row }: { readonly row: FeaturedBalanceRow }) => (
  <span
    data-testid="featured-balance-amount"
    className="max-w-full min-w-0 text-right font-mono text-xs leading-5 break-all text-[var(--frame-foreground)] tabular-nums"
  >
    <span>
      {formatDecimalAmount(row.balance.current_balance, row.balance.currency, {
        positiveSign: false,
      })}
    </span>
    <span className="text-[var(--frame-muted)]">
      {` ${currencyDisplayMarker(row.balance.currency)}`}
    </span>
  </span>
);

const ExpandedBalanceRows = ({
  rows,
}: {
  readonly rows: readonly FeaturedBalanceRow[];
}) => (
  <div role="list" className="flex flex-col gap-1">
    {rows.map((row) => (
      <div
        key={`${row.account.account_id}:${row.balance.currency}`}
        role="listitem"
        data-testid="featured-balance-row"
        className="grid min-h-8 grid-cols-[minmax(0,1fr)_minmax(0,50%)] items-center gap-2 px-2 py-1"
      >
        <Tooltip label={row.account.fqn} asChild className="min-w-0">
          <Link
            to={`/accounts/${row.account.account_id}`}
            data-testid="featured-balance-name"
            className="block truncate font-mono text-xs font-medium text-[var(--frame-foreground)] hover:underline"
          >
            {row.account.name}
          </Link>
        </Tooltip>
        <BalanceAmount row={row} />
      </div>
    ))}
  </div>
);

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

export const BalanceStrip = ({ collapsed }: BalanceStripProps) => {
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

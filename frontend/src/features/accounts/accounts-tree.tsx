import { EyeOff, Plus, Reload } from "pixelarticons/react";
import { useMemo } from "react";
import { Link } from "react-router";

import type {
  Account,
  AccountBalance,
  AccountType,
  DisplayAmount,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AmountText, FqnPath } from "@/features/ledger";
import { cn } from "@/lib/utils";

import { AccountTypeBadge } from "./account-type-badge";

export type AccountTypeFilter = AccountType | "all";

interface AccountsTreeProps {
  readonly accounts: readonly Account[] | undefined;
  readonly balances: readonly AccountBalance[] | undefined;
  readonly errorMessage?: string;
  readonly includeHidden: boolean;
  readonly loading: boolean;
  readonly onCreateAccount?: (opener: HTMLElement) => void;
  readonly onEditAccount?: (account: Account, opener: HTMLElement) => void;
  readonly onRetry?: () => void;
  readonly search: string;
  readonly typeFilter: AccountTypeFilter;
}

interface AccountTreeRow {
  readonly account?: Account;
  readonly depth: number;
  readonly fqn: string;
  readonly hasChildren: boolean;
}

const accountTypeMatches = (
  account: Account,
  typeFilter: AccountTypeFilter,
): boolean => typeFilter === "all" || account.account_type === typeFilter;

const accountSearchMatches = (account: Account, search: string): boolean =>
  search.trim() === "" ||
  account.fqn.toLowerCase().includes(search.trim().toLowerCase());

const interactiveTargetSelector =
  "a, button, input, select, textarea, summary, [role='button'], " +
  "[contenteditable='true'], " +
  "[tabindex]:not([tabindex='-1']):not([data-slot='tooltip-trigger'])";

const isInteractiveTarget = (
  target: EventTarget | null,
  currentTarget: HTMLElement,
): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const interactiveTarget = target.closest(interactiveTargetSelector);
  return interactiveTarget !== null && interactiveTarget !== currentTarget;
};

export const accountTreeRows = (
  accounts: readonly Account[],
  {
    includeHidden,
    search,
    typeFilter,
  }: {
    readonly includeHidden: boolean;
    readonly search: string;
    readonly typeFilter: AccountTypeFilter;
  },
): readonly AccountTreeRow[] => {
  const visibleAccountByFqn = new Map(
    accounts
      .filter(
        (account) =>
          (includeHidden || !account.is_hidden) &&
          accountTypeMatches(account, typeFilter) &&
          accountSearchMatches(account, search),
      )
      .map((account) => [account.fqn, account]),
  );
  const visibleNodeFqns = new Set<string>();

  for (const account of visibleAccountByFqn.values()) {
    const segments = account.fqn.split(":");
    for (
      let segmentIndex = 1;
      segmentIndex <= segments.length;
      segmentIndex += 1
    ) {
      visibleNodeFqns.add(segments.slice(0, segmentIndex).join(":"));
    }
  }

  const visibleParentFqns = new Set<string>();
  for (const nodeFqn of visibleNodeFqns) {
    const segments = nodeFqn.split(":");
    for (
      let segmentIndex = 1;
      segmentIndex < segments.length;
      segmentIndex += 1
    ) {
      visibleParentFqns.add(segments.slice(0, segmentIndex).join(":"));
    }
  }

  return [...visibleNodeFqns].sort(compareFqnPath).map((fqn) => {
    return {
      account: visibleAccountByFqn.get(fqn),
      depth: Math.max(0, fqn.split(":").length - 1),
      fqn,
      hasChildren: visibleParentFqns.has(fqn),
    };
  });
};

const compareFqnPath = (left: string, right: string): number => {
  const leftSegments = left.split(":");
  const rightSegments = right.split(":");
  const maxLength = Math.max(leftSegments.length, rightSegments.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftSegment = leftSegments[index];
    const rightSegment = rightSegments[index];
    if (leftSegment === undefined) {
      return -1;
    }
    if (rightSegment === undefined) {
      return 1;
    }
    const comparison = leftSegment.localeCompare(rightSegment);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
};

const balancesByAccountId = (
  balances: readonly AccountBalance[] | undefined,
): ReadonlyMap<number, readonly AccountBalance[]> => {
  const rows = new Map<number, AccountBalance[]>();
  for (const balance of balances ?? []) {
    rows.set(balance.account_id, [
      ...(rows.get(balance.account_id) ?? []),
      balance,
    ]);
  }
  return rows;
};

const BalanceAmounts = ({
  balances,
}: {
  readonly balances: readonly AccountBalance[];
}) => (
  <div className="flex flex-col items-end gap-1">
    {balances.map((balance) => {
      const amount: DisplayAmount = {
        amount: balance.current_balance,
        currency: balance.currency,
      };
      return (
        <AmountText
          key={`${balance.currency}:${balance.current_balance}`}
          amount={amount}
          className="justify-end"
          positiveSign={false}
          tone="neutral"
        />
      );
    })}
  </div>
);

const AccountsTreeSkeleton = () => (
  <div
    className="bg-card border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
    aria-hidden="true"
  >
    <div className="grid grid-cols-[minmax(14rem,1fr)_7rem_6rem_9rem_5rem] gap-3 bg-[var(--table-header)] px-3 py-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-5" />
      ))}
    </div>
    {Array.from({ length: 8 }).map((_, index) => (
      <div
        key={index}
        className={cn(
          "grid grid-cols-[minmax(14rem,1fr)_7rem_6rem_9rem_5rem] gap-3 px-3 py-3",
          index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
        )}
      >
        <Skeleton className="h-5" />
        <Skeleton className="h-5" />
        <Skeleton className="h-5" />
        <Skeleton className="h-5" />
        <Skeleton className="h-5" />
      </div>
    ))}
  </div>
);

export const AccountsTree = ({
  accounts,
  balances,
  errorMessage,
  includeHidden,
  loading,
  onCreateAccount,
  onEditAccount,
  onRetry,
  search,
  typeFilter,
}: AccountsTreeProps) => {
  const rows = useMemo(
    () =>
      accounts
        ? accountTreeRows(accounts, { includeHidden, search, typeFilter })
        : [],
    [accounts, includeHidden, search, typeFilter],
  );
  const accountBalancesById = useMemo(
    () => balancesByAccountId(balances),
    [balances],
  );

  if (loading && !accounts) {
    return <AccountsTreeSkeleton />;
  }

  if (errorMessage) {
    return (
      <div
        className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
        role="alert"
      >
        <p className="text-destructive font-semibold">
          Accounts could not be loaded.
        </p>
        <details className="text-muted-foreground mt-3 text-sm">
          <summary className="text-foreground cursor-pointer">
            API error
          </summary>
          <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
            {errorMessage}
          </pre>
        </details>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={onRetry}
          >
            <Reload aria-hidden="true" />
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (!accounts || rows.length === 0) {
    const hasAccounts = (accounts?.length ?? 0) > 0;
    return (
      <div className="bg-card flex flex-col items-start gap-3 border-2 border-[var(--border-ink)] p-6 shadow-[var(--shadow-pixel)]">
        <div className="space-y-1">
          <p className="font-heading text-base font-semibold uppercase">
            No accounts
          </p>
          <p className="font-body text-muted-foreground max-w-prose text-sm">
            {hasAccounts
              ? "No accounts match the current search and filters. The chart will show account paths, types, currencies, balances, and hidden state."
              : "The chart will show account paths, types, currencies, balances, and hidden state once accounts exist."}
          </p>
        </div>
        {onCreateAccount ? (
          <Button
            type="button"
            onClick={(event) => {
              onCreateAccount(event.currentTarget);
            }}
          >
            <Plus aria-hidden="true" />
            New account
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="bg-card min-h-0 overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]">
      <div
        className="max-h-full overflow-auto"
        data-testid="accounts-table-scroll"
      >
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="text-foreground sticky top-0 z-10 bg-[var(--table-header)]">
            <tr className="font-heading text-left text-xs font-semibold uppercase">
              <th scope="col" className="w-[60%] px-3 py-2 sm:w-[44%]">
                Name
              </th>
              <th
                scope="col"
                className="hidden w-[14%] px-3 py-2 sm:table-cell"
              >
                Type
              </th>
              <th
                scope="col"
                className="hidden w-[12%] px-3 py-2 md:table-cell"
              >
                Currency
              </th>
              <th
                scope="col"
                className="w-[40%] px-3 py-2 text-right sm:w-[20%]"
              >
                Balance
              </th>
              <th
                scope="col"
                className="hidden w-[10%] px-3 py-2 text-center lg:table-cell"
              >
                Hidden
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowBalances = row.account
                ? (accountBalancesById.get(row.account.account_id) ?? [])
                : [];
              return (
                <tr
                  key={row.fqn}
                  data-testid="accounts-tree-row"
                  role={row.account ? "button" : undefined}
                  tabIndex={row.account ? 0 : undefined}
                  className={cn(
                    index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
                    row.account ? "text-foreground" : "text-muted-foreground",
                    row.account &&
                      "cursor-pointer hover:bg-[var(--color-interactive-bright)]",
                    !row.account &&
                      "hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)]",
                  )}
                  onClick={(event) => {
                    if (row.account) {
                      onEditAccount?.(row.account, event.currentTarget);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (!row.account) {
                      return;
                    }
                    if (
                      isInteractiveTarget(event.target, event.currentTarget)
                    ) {
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onEditAccount?.(row.account, event.currentTarget);
                    }
                  }}
                >
                  <td className="overflow-hidden px-3 py-2 align-middle">
                    <div
                      className="min-w-0 overflow-hidden"
                      style={{ paddingLeft: `${row.depth * 1.25}rem` }}
                    >
                      {row.account ? (
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <Link
                            to={`/accounts/${row.account.account_id}`}
                            className="focus-visible:outline-ring inline-flex min-w-0 items-center gap-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                          >
                            <FqnPath value={row.fqn} focusable={false} />
                            {row.account.is_hidden ? (
                              <EyeOff
                                aria-hidden="true"
                                className="size-4 shrink-0 lg:hidden"
                              />
                            ) : null}
                          </Link>
                          {row.hasChildren ? (
                            <Link
                              to={`/accounts/group?prefix=${encodeURIComponent(row.fqn)}`}
                              className="focus-visible:outline-ring border border-[var(--border-ink)] bg-[var(--band)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase shadow-[var(--shadow-chip)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              Group
                            </Link>
                          ) : null}
                        </div>
                      ) : (
                        <Link
                          to={`/accounts/group?prefix=${encodeURIComponent(row.fqn)}`}
                          className="focus-visible:outline-ring flex min-w-0 items-center gap-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          <FqnPath value={row.fqn} focusable={false} />
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="hidden px-3 py-2 align-middle sm:table-cell">
                    {row.account ? (
                      <AccountTypeBadge
                        accountType={row.account.account_type}
                      />
                    ) : null}
                  </td>
                  <td className="hidden px-3 py-2 align-middle font-mono text-sm md:table-cell">
                    {row.account?.currency ?? ""}
                  </td>
                  <td className="px-3 py-2 text-right align-middle">
                    {row.account?.account_type === "balance" ? (
                      <BalanceAmounts balances={rowBalances} />
                    ) : null}
                  </td>
                  <td className="hidden px-3 py-2 align-middle lg:table-cell">
                    <div className="flex justify-center">
                      {row.account?.is_hidden ? (
                        <EyeOff
                          aria-label="Hidden account"
                          className="size-4"
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

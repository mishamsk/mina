import {
  Eye,
  EyeOff,
  MagicEdit,
  Plus,
  Reload,
  Star,
  Trash,
} from "pixelarticons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import type {
  Account,
  AccountBalance,
  AccountGroupState,
  AccountType,
  DisplayAmount,
} from "@/api";
import {
  deleteLedgerAccountById,
  deleteLedgerAccountsByPath,
  isNetworkFailure,
  setLedgerAccountHiddenByPath,
  updateLedgerAccount,
} from "@/api";
import { type RowAction, RowActions } from "@/components/row-actions";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AmountText, FqnPath } from "@/features/ledger";
import { cn } from "@/lib/utils";

import { AccountTypeBadge } from "./account-type-badge";
import { refreshAccountsAfterMutation } from "./use-accounts-resource";

export type AccountTypeFilter = AccountType | "all";

interface AccountsTreeProps {
  readonly accounts: readonly Account[] | undefined;
  readonly balances: readonly AccountBalance[] | undefined;
  readonly errorMessage?: string;
  readonly groups: readonly AccountGroupState[] | undefined;
  readonly includeHidden: boolean;
  readonly loading: boolean;
  readonly onCreateAccount?: (opener: HTMLElement) => void;
  readonly onEditAccount?: (account: Account, opener: HTMLElement) => void;
  readonly onNotice?: (message: string) => void;
  readonly onRestructurePath?: (fqn: string, opener: HTMLElement) => void;
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

type AccountDeleteTarget =
  | {
      readonly account: Account;
      readonly kind: "account";
      readonly opener: HTMLElement;
    }
  | {
      readonly accountCount: number;
      readonly fqn: string;
      readonly kind: "group";
      readonly opener: HTMLElement;
    };

const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (isNetworkFailure(error)) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "message" in error.error &&
    typeof error.error.message === "string"
  ) {
    return error.error.message;
  }
  return fallback;
};

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

const deleteDialogFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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

const HiddenRowIndicator = ({ label }: { readonly label: string }) => (
  <Tooltip
    focusable={false}
    label={label}
    className="text-foreground inline-flex shrink-0"
  >
    <span aria-label={label} className="inline-flex">
      <EyeOff aria-hidden="true" className="size-4" />
    </span>
  </Tooltip>
);

const accountsTreeSkeletonGridClass =
  "grid grid-cols-[48%_32%_20%] sm:grid-cols-[36%_14%_30%_20%] md:grid-cols-[36%_14%_12%_24%_14%]";

const accountTreeSkeletonColumnClasses = [
  "px-3",
  "hidden px-3 sm:block",
  "hidden px-3 md:block",
  "px-2 sm:px-3",
  "px-1 sm:px-3",
] as const;

const AccountsTreeSkeleton = () => (
  <div
    className="bg-card border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
    aria-hidden="true"
  >
    <div
      className={cn(
        accountsTreeSkeletonGridClass,
        "bg-[var(--table-header)] py-2",
      )}
    >
      {accountTreeSkeletonColumnClasses.map((className, index) => (
        <div key={index} className={className}>
          <Skeleton className="h-5" />
        </div>
      ))}
    </div>
    {Array.from({ length: 8 }).map((_, index) => (
      <div
        key={index}
        className={cn(
          accountsTreeSkeletonGridClass,
          "py-3",
          index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
        )}
      >
        {accountTreeSkeletonColumnClasses.map((className, columnIndex) => (
          <div key={columnIndex} className={className}>
            <Skeleton className="h-5" />
          </div>
        ))}
      </div>
    ))}
  </div>
);

export const AccountsTree = ({
  accounts,
  balances,
  errorMessage,
  groups,
  includeHidden,
  loading,
  onCreateAccount,
  onEditAccount,
  onNotice,
  onRestructurePath,
  onRetry,
  search,
  typeFilter,
}: AccountsTreeProps) => {
  const [deleteTarget, setDeleteTarget] = useState<
    AccountDeleteTarget | undefined
  >();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [deleting, setDeleting] = useState(false);
  const accountsTableScrollRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLElement | null>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
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
  const groupByFqn = useMemo(
    () => new Map((groups ?? []).map((group) => [group.fqn, group])),
    [groups],
  );
  const accountCountByGroupFqn = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of accounts ?? []) {
      const segments = account.fqn.split(":");
      for (let index = 1; index <= segments.length; index += 1) {
        const prefix = segments.slice(0, index).join(":");
        counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
      }
    }
    return counts;
  }, [accounts]);

  const closeDeleteDialog = useCallback(() => {
    if (deleting) {
      return;
    }
    const opener = deleteTarget?.opener;
    setDeleteTarget(undefined);
    setDeleteErrorMessage(undefined);
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) {
        focusWithoutTooltip(opener, { preventScroll: true });
      }
    });
  }, [deleteTarget?.opener, deleting]);

  const focusDeleteSuccessFallback = useCallback(() => {
    window.requestAnimationFrame(() => {
      const searchField = document.getElementById("accounts-search");
      if (searchField instanceof HTMLElement && searchField.isConnected) {
        focusWithoutTooltip(searchField, { preventScroll: true });
        return;
      }

      const tableScroll = accountsTableScrollRef.current;
      if (tableScroll?.isConnected) {
        focusWithoutTooltip(tableScroll, { preventScroll: true });
      }
    });
  }, []);

  useEffect(() => {
    if (!deleteTarget) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "Escape") {
        if (deleting) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        closeDeleteDialog();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const trapRoot = deleteDialogRef.current;
      if (!trapRoot) {
        return;
      }
      const focusable = Array.from(
        trapRoot.querySelectorAll<HTMLElement>(deleteDialogFocusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        trapRoot.focus();
        return;
      }

      if (!trapRoot.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    window.requestAnimationFrame(() => {
      cancelDeleteButtonRef.current?.focus({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [closeDeleteDialog, deleteTarget, deleting]);

  const showNotice = (message: string) => {
    onNotice?.(message);
  };

  const showQuickToggleError = (error: unknown, fallback: string) => {
    showNotice(apiErrorMessage(error, fallback));
  };

  const toggleAccountHidden = async (account: Account) => {
    const result = await updateLedgerAccount(account.account_id, {
      is_hidden: !account.is_hidden,
    });
    if (!result.data) {
      showQuickToggleError(result.error, "Account hidden state was not saved.");
      return;
    }
    await refreshAccountsAfterMutation({ account: result.data });
    showNotice(result.data.is_hidden ? "Account hidden." : "Account unhidden.");
  };

  const toggleAccountFeatured = async (account: Account) => {
    const result = await updateLedgerAccount(account.account_id, {
      is_featured: !account.is_featured,
    });
    if (!result.data) {
      showQuickToggleError(result.error, "Featured state was not saved.");
      return;
    }
    await refreshAccountsAfterMutation({ account: result.data });
    showNotice(
      result.data.is_featured ? "Account featured." : "Account unfeatured.",
    );
  };

  const toggleGroupHidden = async (group: AccountGroupState) => {
    const result = await setLedgerAccountHiddenByPath({
      is_hidden: !group.is_hidden,
      path_fqn: group.fqn,
    });
    if (!result.data) {
      showQuickToggleError(
        result.error,
        "Account group hidden state was not saved.",
      );
      return;
    }
    await refreshAccountsAfterMutation({ bulk: true });
    showNotice(
      group.is_hidden ? "Account group unhidden." : "Account group hidden.",
    );
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) {
      return;
    }

    setDeleting(true);
    setDeleteErrorMessage(undefined);
    const result =
      deleteTarget.kind === "account"
        ? await deleteLedgerAccountById(deleteTarget.account.account_id)
        : await deleteLedgerAccountsByPath({ path_fqn: deleteTarget.fqn });

    if (
      deleteTarget.kind === "account" &&
      (result.data !== undefined || !result.error)
    ) {
      await refreshAccountsAfterMutation({
        removedAccountId: deleteTarget.account.account_id,
      });
      showNotice("Account deleted.");
      setDeleting(false);
      setDeleteTarget(undefined);
      focusDeleteSuccessFallback();
      return;
    }

    if (deleteTarget.kind === "group" && result.data) {
      await refreshAccountsAfterMutation({ bulk: true });
      showNotice(`Deleted ${result.data.deleted_count} account(s).`);
      setDeleting(false);
      setDeleteTarget(undefined);
      focusDeleteSuccessFallback();
      return;
    }

    setDeleting(false);
    setDeleteErrorMessage(
      apiErrorMessage(
        result.error,
        deleteTarget.kind === "account"
          ? "Account could not be deleted."
          : "Account group could not be deleted.",
      ),
    );
  };

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
    <>
      <div className="bg-card min-h-0 overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]">
        <div
          ref={accountsTableScrollRef}
          className="accounts-table-scroll max-h-full overflow-auto"
          data-testid="accounts-table-scroll"
          tabIndex={-1}
        >
          <table className="accounts-table w-full table-fixed border-collapse text-sm">
            <thead className="text-foreground sticky top-0 z-10 bg-[var(--table-header)]">
              <tr className="font-heading text-left text-xs font-semibold uppercase">
                <th scope="col" className="w-[48%] px-3 py-2 sm:w-[36%]">
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
                  className="w-[32%] px-2 py-2 text-right sm:w-[30%] sm:px-3 md:w-[24%]"
                >
                  Balance
                </th>
                <th
                  scope="col"
                  className="w-[20%] px-1 py-2 text-center sm:px-3 md:w-[14%]"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const account = row.account;
                const rowBalances = account
                  ? (accountBalancesById.get(account.account_id) ?? [])
                  : [];
                const group = groupByFqn.get(row.fqn);
                const rowHidden =
                  account?.is_hidden ?? group?.is_hidden ?? false;
                const groupActions: RowAction[] = group
                  ? [
                      {
                        icon: group.is_hidden ? (
                          <EyeOff aria-hidden="true" />
                        ) : (
                          <Eye aria-hidden="true" />
                        ),
                        kind: "toggle" as const,
                        label: group.is_hidden ? "Unhide group" : "Hide group",
                        onToggle: () => {
                          void toggleGroupHidden(group);
                        },
                        pressed: group.is_hidden,
                      },
                      {
                        disabled: !group.deletable,
                        disabledReason:
                          "Account group has active dependent records.",
                        icon: <Trash aria-hidden="true" />,
                        label: "Delete account group",
                        onSelect: (opener: HTMLElement) => {
                          setDeleteErrorMessage(undefined);
                          setDeleteTarget({
                            accountCount:
                              accountCountByGroupFqn.get(row.fqn) ?? 0,
                            fqn: row.fqn,
                            kind: "group",
                            opener,
                          });
                        },
                      },
                    ]
                  : [];
                const rowActions: RowAction[] = account
                  ? [
                      {
                        icon: account.is_hidden ? (
                          <EyeOff aria-hidden="true" />
                        ) : (
                          <Eye aria-hidden="true" />
                        ),
                        kind: "toggle" as const,
                        label: account.is_hidden
                          ? "Unhide account"
                          : "Hide account",
                        onToggle: () => {
                          void toggleAccountHidden(account);
                        },
                        pressed: account.is_hidden,
                      },
                      {
                        icon: (
                          <Star
                            aria-hidden="true"
                            className={
                              account.is_featured
                                ? "text-[var(--color-class-adjustment-ink)]"
                                : undefined
                            }
                          />
                        ),
                        kind: "toggle" as const,
                        label: account.is_featured
                          ? "Unfeature account"
                          : "Feature account",
                        onToggle: () => {
                          void toggleAccountFeatured(account);
                        },
                        pressed: account.is_featured,
                      },
                      ...(onRestructurePath
                        ? [
                            {
                              icon: <MagicEdit aria-hidden="true" />,
                              label: "Move or rename",
                              onSelect: (opener: HTMLElement) => {
                                opener.blur();
                                onRestructurePath(row.fqn, opener);
                              },
                            },
                          ]
                        : []),
                      {
                        disabled: account.deletable !== true,
                        disabledReason: "Account has active dependent records.",
                        icon: <Trash aria-hidden="true" />,
                        label: "Delete account",
                        onSelect: (opener: HTMLElement) => {
                          setDeleteErrorMessage(undefined);
                          setDeleteTarget({
                            account,
                            kind: "account",
                            opener,
                          });
                        },
                      },
                      ...groupActions,
                    ]
                  : group
                    ? [
                        ...groupActions.slice(0, 1),
                        ...(onRestructurePath
                          ? [
                              {
                                icon: <MagicEdit aria-hidden="true" />,
                                label: "Move or rename",
                                onSelect: (opener: HTMLElement) => {
                                  opener.blur();
                                  onRestructurePath(row.fqn, opener);
                                },
                              },
                            ]
                          : []),
                        ...groupActions.slice(1),
                      ]
                    : [];
                return (
                  <tr
                    key={row.fqn}
                    data-testid="accounts-tree-row"
                    role={account ? "button" : undefined}
                    tabIndex={account ? 0 : undefined}
                    className={cn(
                      index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
                      account ? "text-foreground" : "text-muted-foreground",
                      account &&
                        "cursor-pointer hover:bg-[var(--color-interactive-bright)]",
                      !account &&
                        "hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)]",
                    )}
                    onClick={(event) => {
                      if (account) {
                        onEditAccount?.(account, event.currentTarget);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (!account) {
                        return;
                      }
                      if (
                        isInteractiveTarget(event.target, event.currentTarget)
                      ) {
                        return;
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onEditAccount?.(account, event.currentTarget);
                      }
                    }}
                  >
                    <td className="overflow-hidden px-3 py-2 align-middle">
                      <div
                        className="min-w-0 overflow-hidden"
                        style={{ paddingLeft: `${row.depth * 1.25}rem` }}
                      >
                        {account ? (
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Link
                              to={`/accounts/${account.account_id}`}
                              className="focus-visible:outline-ring inline-flex min-w-0 items-center gap-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <FqnPath value={row.fqn} focusable={false} />
                            </Link>
                            {rowHidden ? (
                              <HiddenRowIndicator label="Hidden account" />
                            ) : null}
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
                          <div className="flex min-w-0 items-center gap-2">
                            <Link
                              to={`/accounts/group?prefix=${encodeURIComponent(row.fqn)}`}
                              className="focus-visible:outline-ring flex min-w-0 items-center gap-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                              <FqnPath value={row.fqn} focusable={false} />
                            </Link>
                            {rowHidden ? (
                              <HiddenRowIndicator label="Hidden account group" />
                            ) : null}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 align-middle sm:table-cell">
                      {account ? (
                        <AccountTypeBadge accountType={account.account_type} />
                      ) : null}
                    </td>
                    <td className="hidden px-3 py-2 align-middle font-mono text-sm md:table-cell">
                      {account?.currency ?? ""}
                    </td>
                    <td className="px-2 py-2 text-right align-middle sm:px-3">
                      {account?.account_type === "balance" ? (
                        <BalanceAmounts balances={rowBalances} />
                      ) : null}
                    </td>
                    <td className="px-1 py-2 align-middle sm:px-3">
                      <RowActions
                        foldable
                        actions={rowActions}
                        className="justify-center"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-[color-mix(in_srgb,var(--frame),transparent_18%)] p-4"
          role="presentation"
        >
          <section
            ref={deleteDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-row-title"
            aria-describedby="delete-account-row-description"
            className="bg-card w-[min(480px,100%)] border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
            tabIndex={-1}
          >
            <h3
              id="delete-account-row-title"
              className="font-heading text-base font-bold uppercase"
            >
              {deleteTarget.kind === "account"
                ? "Delete account"
                : "Delete account group"}
            </h3>
            <div
              id="delete-account-row-description"
              className="font-body text-muted-foreground mt-3 space-y-2 text-sm"
            >
              <p className="flex flex-wrap items-center gap-1">
                <span>Delete</span>
                <span className="text-foreground font-mono break-all">
                  {deleteTarget.kind === "account"
                    ? deleteTarget.account.fqn
                    : deleteTarget.fqn}
                </span>
                <span>?</span>
              </p>
              <p>
                {deleteTarget.kind === "account"
                  ? "This tombstones the account and removes it from default account lists and pickers."
                  : `This tombstones ${deleteTarget.accountCount} account(s) in the subtree and removes them from default account lists and pickers.`}
              </p>
            </div>
            {deleteErrorMessage ? (
              <p
                className="border-destructive text-destructive mt-3 border-2 p-2 text-sm"
                role="alert"
              >
                {deleteErrorMessage}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                ref={cancelDeleteButtonRef}
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={closeDeleteDialog}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => {
                  void confirmDelete();
                }}
              >
                <Trash aria-hidden="true" />
                {deleting
                  ? "Deleting"
                  : deleteTarget.kind === "account"
                    ? "Delete account"
                    : "Delete group"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
};

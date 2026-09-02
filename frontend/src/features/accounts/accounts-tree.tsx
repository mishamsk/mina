import {
  ArrowsHorizontal,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Reload,
  Trash,
} from "pixelarticons/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import type { Account, AccountBalance, AccountType, GroupState } from "@/api";
import {
  apiErrorMessage,
  deleteLedgerAccountById,
  setLedgerAccountHiddenByPath,
  updateLedgerAccount,
} from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FavoriteStarIcon } from "@/components/favorite-star-icon";
import { ReferenceEntityDeleteDescription } from "@/components/reference-entity-delete-description";
import { referenceTableFrameClassName } from "@/components/reference-table-frame";
import { type RowAction, RowActions } from "@/components/row-actions";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AmountText, FqnPath } from "@/features/ledger";
import { cn } from "@/lib/utils";

import { AccountTypeBadge } from "./account-type-badge";
import { CreditLimitIndicator } from "./credit-limit-indicator";
import { refreshAccountsAfterMutation } from "./use-accounts-resource";

export type AccountTypeFilter = readonly AccountType[];

interface AccountsTreeProps {
  readonly accounts: readonly Account[] | undefined;
  readonly balances: readonly AccountBalance[] | undefined;
  readonly errorMessage?: string;
  readonly filtered: boolean;
  readonly groups: readonly GroupState[] | undefined;
  readonly hideZeroBalances: boolean;
  readonly loading: boolean;
  readonly onCreateAccount?: (opener: HTMLElement) => void;
  readonly onEditAccount?: (account: Account, opener: HTMLElement) => void;
  readonly onNotice?: (message: string) => void;
  readonly onRestructurePath?: (fqn: string, opener: HTMLElement) => void;
  readonly onRetry?: () => void;
}

interface AccountTreeRow {
  readonly account?: Account;
  readonly depth: number;
  readonly fqn: string;
}

type AccountDeleteTarget = {
  readonly account: Account;
  readonly opener: HTMLElement;
};

const accountTreeName = (account: Account): string =>
  account.display_label_override
    ? `${account.fqn} (${account.display_label_override})`
    : account.fqn;

const primaryStanding = (balance: AccountBalance): string =>
  balance.remaining_credit ?? balance.current_balance;

const accountHasNonZeroStanding = (
  account: Account,
  balancesByAccountId: ReadonlyMap<number, readonly AccountBalance[]>,
): boolean =>
  (balancesByAccountId.get(account.account_id) ?? []).some(
    (balance) => Number(primaryStanding(balance)) !== 0,
  );

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
    balancesByAccountId,
    hideZeroBalances,
  }: {
    readonly balancesByAccountId: ReadonlyMap<
      number,
      readonly AccountBalance[]
    >;
    readonly hideZeroBalances: boolean;
  },
): readonly AccountTreeRow[] => {
  const visibleAccountByFqn = new Map(
    accounts
      .filter(
        (account) =>
          !hideZeroBalances ||
          account.account_type === "flow" ||
          account.account_type === "system" ||
          accountHasNonZeroStanding(account, balancesByAccountId),
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

  return [...visibleNodeFqns].sort(compareFqnPath).map((fqn) => {
    return {
      account: visibleAccountByFqn.get(fqn),
      depth: Math.max(0, fqn.split(":").length - 1),
      fqn,
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
}) => {
  const nonZeroBalances = balances.filter(
    (balance) => Number(primaryStanding(balance)) !== 0,
  );
  const displayedBalances =
    nonZeroBalances.length > 0 ? nonZeroBalances : balances.slice(0, 1);

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      {displayedBalances.map((balance) => {
        const amount = {
          amount: primaryStanding(balance),
          currency: balance.currency,
        };
        return (
          <div
            key={`${balance.currency}:${balance.current_balance}`}
            className="min-w-0 text-right"
          >
            {balance.remaining_credit !== undefined ? (
              <span className="text-muted-foreground block truncate font-mono text-xs">
                Remaining credit
              </span>
            ) : null}
            <AmountText
              amount={amount}
              className="min-w-0 justify-end"
              overflowTooltip
              positiveSign={false}
              tone="neutral"
            />
          </div>
        );
      })}
    </div>
  );
};

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
  "grid grid-cols-[44%_32%_24%] sm:grid-cols-[36%_14%_30%_20%] md:grid-cols-[23%_14%_22%_20%_21%] lg:grid-cols-[28%_14%_14%_20%_24%]";

const accountTreeSkeletonColumnClasses = [
  "px-3",
  "hidden px-3 sm:block",
  "hidden px-1 md:block lg:px-3",
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
  filtered,
  groups,
  hideZeroBalances,
  loading,
  onCreateAccount,
  onEditAccount,
  onNotice,
  onRestructurePath,
  onRetry,
}: AccountsTreeProps) => {
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<
    AccountDeleteTarget | undefined
  >();
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [deleting, setDeleting] = useState(false);
  const accountsTableScrollRef = useRef<HTMLDivElement | null>(null);
  const accountBalancesById = useMemo(
    () => balancesByAccountId(balances),
    [balances],
  );
  const rows = useMemo(
    () =>
      accounts
        ? accountTreeRows(accounts, {
            balancesByAccountId: accountBalancesById,
            hideZeroBalances,
          })
        : [],
    [accountBalancesById, accounts, hideZeroBalances],
  );
  const groupByFqn = useMemo(
    () => new Map((groups ?? []).map((group) => [group.fqn, group])),
    [groups],
  );

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
      if (
        searchField instanceof HTMLElement &&
        searchField.isConnected &&
        searchField.getClientRects().length > 0
      ) {
        focusWithoutTooltip(searchField, { preventScroll: true });
        return;
      }

      const tableScroll = accountsTableScrollRef.current;
      if (tableScroll?.isConnected) {
        focusWithoutTooltip(tableScroll, { preventScroll: true });
      }
    });
  }, []);

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

  const toggleGroupHidden = async (group: GroupState) => {
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
    const result = await deleteLedgerAccountById(
      deleteTarget.account.account_id,
    );

    if (result.data !== undefined || !result.error) {
      await refreshAccountsAfterMutation();
      showNotice("Account deleted.");
      setDeleting(false);
      setDeleteTarget(undefined);
      focusDeleteSuccessFallback();
      return;
    }

    setDeleting(false);
    setDeleteErrorMessage(
      apiErrorMessage(result.error, "Account could not be deleted."),
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
    return (
      <div className="bg-card flex flex-col items-start gap-3 border-2 border-[var(--border-ink)] p-6 shadow-[var(--shadow-pixel)]">
        <div className="space-y-1">
          <p className="font-heading text-base font-semibold uppercase">
            No accounts
          </p>
          <p className="font-body text-muted-foreground max-w-prose text-sm">
            {filtered
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
      <div
        className={referenceTableFrameClassName}
        data-testid="accounts-table-frame"
      >
        <div
          ref={accountsTableScrollRef}
          className="accounts-table-scroll roomy-shell:overflow-auto min-h-0 flex-1 overflow-visible"
          data-testid="accounts-table-scroll"
          tabIndex={-1}
        >
          <table className="accounts-table w-full table-fixed border-collapse text-sm">
            <thead className="text-foreground roomy-shell:sticky roomy-shell:top-0 roomy-shell:z-10 bg-[var(--table-header)]">
              <tr className="font-heading text-left text-xs font-semibold uppercase">
                <th
                  scope="col"
                  className="w-[44%] px-3 py-2 sm:w-[36%] md:w-[23%] lg:w-[28%]"
                >
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
                  className="hidden w-[22%] px-1 py-2 md:table-cell lg:w-[14%] lg:px-3"
                >
                  Currency
                </th>
                <th
                  scope="col"
                  className="w-[32%] px-2 py-2 text-right sm:w-[30%] sm:px-3 md:w-[20%]"
                >
                  Balance
                </th>
                <th
                  scope="col"
                  className="w-[24%] px-3 py-2 text-center sm:w-[20%] md:w-[21%] lg:w-[24%]"
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const account = row.account;
                const rowBalances = account
                  ? (accountBalancesById.get(account.account_id) ?? [])
                  : [];
                const hasCreditLimit =
                  account?.has_credit_limit_history === true;
                const group = groupByFqn.get(row.fqn);
                const readOnlySystemPath =
                  row.fqn === "system" || row.fqn.startsWith("system:");
                const rowHidden =
                  account?.is_hidden ?? group?.is_hidden ?? false;
                const groupHiddenAction: RowAction | undefined = group
                  ? readOnlySystemPath
                    ? undefined
                    : {
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
                        slot: "hidden",
                      }
                  : undefined;
                const rowActions: RowAction[] =
                  account?.account_type === "system"
                    ? []
                    : account
                      ? [
                          {
                            icon: <Pencil aria-hidden="true" />,
                            label: "Edit account",
                            onSelect: (opener: HTMLElement) => {
                              onEditAccount?.(account, opener);
                            },
                          },
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
                            slot: "hidden",
                          },
                          {
                            icon: (
                              <FavoriteStarIcon filled={account.is_featured} />
                            ),
                            kind: "toggle" as const,
                            label: account.is_featured
                              ? "Unfeature account"
                              : "Feature account",
                            onToggle: () => {
                              void toggleAccountFeatured(account);
                            },
                            pressed: account.is_featured,
                            slot: "featured",
                          },
                          ...(onRestructurePath
                            ? [
                                {
                                  icon: <ArrowsHorizontal aria-hidden="true" />,
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
                            disabledReason:
                              "Account has active dependent records.",
                            icon: <Trash aria-hidden="true" />,
                            label: "Delete account",
                            onSelect: (opener: HTMLElement) => {
                              setDeleteErrorMessage(undefined);
                              setDeleteTarget({
                                account,
                                opener,
                              });
                            },
                          },
                          ...(groupHiddenAction ? [groupHiddenAction] : []),
                        ]
                      : groupHiddenAction
                        ? [
                            groupHiddenAction,
                            ...(onRestructurePath
                              ? [
                                  {
                                    icon: (
                                      <ArrowsHorizontal aria-hidden="true" />
                                    ),
                                    label: "Move or rename",
                                    onSelect: (opener: HTMLElement) => {
                                      opener.blur();
                                      onRestructurePath(row.fqn, opener);
                                    },
                                  },
                                ]
                              : []),
                          ]
                        : [];
                return (
                  <tr
                    key={row.fqn}
                    data-testid="accounts-tree-row"
                    role="button"
                    aria-description="Press Enter or Space to open."
                    aria-keyshortcuts="Enter Space"
                    aria-label={
                      account
                        ? `Open account ${accountTreeName(account)}`
                        : `Open account group ${row.fqn}`
                    }
                    tabIndex={0}
                    className={cn(
                      index % 2 === 0 ? "bg-card" : "bg-[var(--band)]",
                      account ? "text-foreground" : "text-muted-foreground",
                      "cursor-pointer hover:bg-[color-mix(in_srgb,var(--band),var(--table-header)_28%)]",
                    )}
                    onClick={() => {
                      if (account) {
                        void navigate(`/accounts/${account.account_id}`);
                        return;
                      }
                      void navigate(
                        `/accounts/group?prefix=${encodeURIComponent(row.fqn)}`,
                      );
                    }}
                    onKeyDown={(event) => {
                      if (
                        isInteractiveTarget(event.target, event.currentTarget)
                      ) {
                        return;
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (account) {
                          void navigate(`/accounts/${account.account_id}`);
                          return;
                        }
                        void navigate(
                          `/accounts/group?prefix=${encodeURIComponent(row.fqn)}`,
                        );
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
                            <span className="min-w-0 flex-1 overflow-hidden">
                              <Tooltip
                                focusable={false}
                                label={accountTreeName(account)}
                                className="w-full gap-2 overflow-hidden font-mono text-sm"
                              >
                                <span
                                  data-testid="accounts-tree-fqn"
                                  className="text-foreground shrink-0 font-medium"
                                >
                                  {account.fqn}
                                </span>
                                {account.display_label_override ? (
                                  <span
                                    data-testid="accounts-tree-display-label"
                                    className="text-muted-foreground min-w-0 truncate"
                                  >
                                    ({account.display_label_override})
                                  </span>
                                ) : null}
                              </Tooltip>
                            </span>
                            {hasCreditLimit ? <CreditLimitIndicator /> : null}
                            {rowHidden ? (
                              <HiddenRowIndicator label="Hidden account" />
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              data-testid="accounts-tree-fqn"
                              className="min-w-0"
                            >
                              <FqnPath
                                collapseAncestors={false}
                                focusable={false}
                                value={row.fqn}
                              />
                            </span>
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
                    <td className="hidden px-1 py-2 align-middle font-mono text-sm md:table-cell lg:px-3">
                      {account ? (
                        account.currency ? (
                          <span className="block break-all">
                            {account.currency}
                          </span>
                        ) : (
                          <Badge
                            variant="outline"
                            className="max-w-full bg-[var(--band)] text-center"
                          >
                            Multi-currency
                          </Badge>
                        )
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right align-middle sm:px-3">
                      {account?.account_type === "owned" ||
                      account?.account_type === "party" ? (
                        <BalanceAmounts balances={rowBalances} />
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <RowActions
                        foldable
                        actions={rowActions}
                        indicatorSlots={["featured", "hidden"]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmationDialog
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Delete account"
        errorMessage={deleteErrorMessage}
        open={deleteTarget !== undefined}
        pending={deleting}
        pendingLabel="Deleting"
        title="Delete account"
        onConfirm={() => {
          void confirmDelete();
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
      >
        {deleteTarget ? (
          <ReferenceEntityDeleteDescription
            name={deleteTarget.account.fqn}
            noun="account"
          />
        ) : null}
      </ConfirmationDialog>
    </>
  );
};

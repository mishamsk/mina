import {
  Archive,
  Chart,
  EyeOff,
  Folder,
  Hash,
  Home,
  ListBox,
  Plus,
  SettingsCog2,
  User,
  Wallet,
} from "pixelarticons/react";
import {
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type To, useLocation, useNavigate } from "react-router";

import {
  type Account,
  apiErrorMessage,
  fetchAccountGroupsForLookups,
  fetchTransactionPage,
  type GroupState,
  startDatabaseBackupRun,
  startExchangeRateLoadingRun,
  type Transaction,
} from "@/api";
import { Toast, toastDurationMs } from "@/components/toast";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AmountText,
  buildLookupMaps,
  ClassIcon,
  displayAmountKey,
  formatInitiatedDate,
  FqnPath,
  lineDisplayAmounts,
  lineMemo,
  linePostingStatus,
  MixedAmounts,
  MixedSentinel,
  postingStatusLabel,
  refreshLedgerLookups,
  StatusIcon,
  transactionClassLabel,
} from "@/features/ledger";
import { formatDecimalAmount } from "@/features/ledger/format";
import { cn } from "@/lib/utils";
import type { TransactionEntryType } from "@/models/ui-state";
import {
  closeCommandPalette,
  openTransactionEntryPanel,
  useCommandPaletteView,
  useLastTransactionsPageSearch,
  useLedgerLookupsView,
} from "@/store";
import { currencyDisplayMarker } from "@/utils/currency";

type PixelIcon = ComponentType<SVGProps<SVGSVGElement>>;

type CommandGroup =
  "Account groups" | "Accounts" | "Actions" | "Navigation" | "New transaction";

interface CommandItem {
  readonly accessibleLabel?: string;
  readonly action?: () => void;
  readonly detail?: string;
  readonly group: CommandGroup;
  readonly hiddenLabel?: string;
  readonly icon: PixelIcon;
  readonly id: string;
  readonly keywords?: readonly string[];
  readonly label: string;
  readonly renderLabel?: ReactNode;
  readonly to?: To;
}

interface GroupedCommandItems {
  readonly group: CommandGroup;
  readonly items: readonly CommandItem[];
}

interface PaletteSearchState {
  readonly activeIndex: number;
  readonly query: string;
}

interface PaletteNotice {
  readonly id: number;
  readonly kind: "error" | "success";
  readonly message: string;
}

interface AccountGroupLookupState {
  readonly errorMessage: string | undefined;
  readonly groups: readonly GroupState[] | undefined;
  readonly loading: boolean;
}

interface TransactionSearchState {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly query: string;
  readonly transactions: readonly Transaction[];
}

const commandGroups: readonly CommandGroup[] = [
  "Navigation",
  "New transaction",
  "Accounts",
  "Account groups",
  "Actions",
];
const entityResultLimit = 8;
const transactionResultLimit = 20;
const transactionSearchDebounceMs = 180;
const commandSkeletonRows = [0, 1, 2, 3] as const;
const transactionResultGridClass =
  "grid min-w-0 grid-cols-[3.75rem_1.5rem_minmax(0,1fr)_minmax(0,5.5rem)] items-center gap-2 px-2 sm:grid-cols-[4.5rem_1.75rem_2.5rem_minmax(0,1fr)_minmax(0,clamp(7rem,28vw,14rem))] sm:gap-3 sm:px-3";

const domIdPart = (value: string): string => {
  const slug = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return `${slug || "item"}-${hash.toString(36)}`;
};

const commandOptionId = (commandId: string): string =>
  `command-palette-option-${domIdPart(commandId)}`;

const transactionOptionId = (transactionId: number): string =>
  `command-palette-transaction-${transactionId}`;

const normalizeSearch = (value: string): string =>
  value.trim().toLocaleLowerCase();

const normalizePathname = (pathname: string): string =>
  pathname === "/" ? pathname : pathname.replace(/\/+$/, "");

const commandMatches = (command: CommandItem, query: string): boolean => {
  if (!query) {
    return true;
  }

  const haystack = [command.label, ...(command.keywords ?? [])]
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query);
};

const leafName = (fqn: string): string => fqn.split(":").at(-1) ?? fqn;

const transactionsEntrySearch = (search: string): string => {
  const params = new URLSearchParams(search);
  params.delete("transaction");
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
};

const transactionDetailSearch = (
  transactionId: number,
  search: string,
): string => {
  const params = new URLSearchParams(search);
  params.set("transaction", String(transactionId));
  return `?${params.toString()}`;
};

const fqnMatchScore = (fqn: string, query: string): number | undefined => {
  if (!query) {
    return undefined;
  }

  const normalizedFqn = fqn.toLocaleLowerCase();
  const normalizedLeaf = leafName(fqn).toLocaleLowerCase();
  if (normalizedFqn === query) {
    return 0;
  }
  if (normalizedLeaf === query) {
    return 1;
  }
  if (normalizedLeaf.startsWith(query)) {
    return 2;
  }
  if (normalizedFqn.startsWith(query)) {
    return 3;
  }
  if (normalizedLeaf.includes(query)) {
    return 4;
  }
  if (normalizedFqn.includes(query)) {
    return 5;
  }
  return undefined;
};

const sortFqnMatches = <T extends { readonly fqn: string }>(
  items: readonly T[],
  query: string,
): readonly T[] =>
  items
    .map((item) => ({
      item,
      score: fqnMatchScore(item.fqn, query),
    }))
    .filter(
      (match): match is { readonly item: T; readonly score: number } =>
        match.score !== undefined,
    )
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.item.fqn.length - right.item.fqn.length ||
        left.item.fqn.localeCompare(right.item.fqn),
    )
    .slice(0, entityResultLimit)
    .map((match) => match.item);

const groupCommands = (
  commands: readonly CommandItem[],
): readonly GroupedCommandItems[] =>
  commandGroups
    .map((group) => ({
      group,
      items: commands.filter((command) => command.group === group),
    }))
    .filter((group) => group.items.length > 0);

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const CommandPaletteResultsSkeleton = () => (
  <div
    className="flex flex-col gap-3"
    role="status"
    aria-label="Loading command results"
  >
    <section>
      <Skeleton className="mx-2 mb-1 h-4 w-28" />
      <div className="flex flex-col gap-1">
        {commandSkeletonRows.map((row) => (
          <div
            key={row}
            className="flex items-center gap-3 border-2 border-transparent px-3 py-2"
          >
            <Skeleton className="size-4 shrink-0" />
            <Skeleton className="h-5 min-w-0 flex-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </section>
  </div>
);

const TransactionSearchResultsSkeleton = () => (
  <div
    className="flex flex-col gap-2"
    role="status"
    aria-label="Loading transaction results"
  >
    <Skeleton className="mx-2 mb-1 h-4 w-36" />
    {commandSkeletonRows.map((row) => (
      <div
        key={row}
        className={cn(
          transactionResultGridClass,
          "border-2 border-transparent py-2",
        )}
      >
        <Skeleton className="h-5 w-14" />
        <Skeleton className="size-5" />
        <Skeleton className="hidden size-5 sm:block" />
        <div className="grid gap-1">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-7 w-20 justify-self-end sm:w-24" />
      </div>
    ))}
  </div>
);

const TransactionResultAmounts = ({
  deemphasized,
  maps,
  transaction,
}: {
  readonly deemphasized: boolean;
  readonly maps: ReturnType<typeof buildLookupMaps>;
  readonly transaction: Transaction;
}) => {
  const amounts = lineDisplayAmounts(transaction, maps);
  if (transaction.transaction_class === "mixed") {
    return (
      <span className={cn(deemphasized && "text-muted-foreground")}>
        <MixedAmounts
          amounts={amounts}
          className="h-auto min-h-7 flex-wrap overflow-hidden [overflow-wrap:anywhere] whitespace-normal"
        />
      </span>
    );
  }

  return amounts.map((amount) => (
    <AmountText
      key={displayAmountKey(amount)}
      amount={amount}
      chip
      className={cn(
        "h-auto min-h-7 min-w-0 flex-wrap overflow-hidden [overflow-wrap:anywhere] whitespace-normal",
        deemphasized && "text-muted-foreground bg-card",
      )}
      positiveSign={
        transaction.transaction_class !== "transfer" &&
        transaction.transaction_class !== "currency_exchange"
      }
      tone="neutral"
    />
  ));
};

const transactionResultAmountLabel = (
  transaction: Transaction,
  maps: ReturnType<typeof buildLookupMaps>,
): string | undefined => {
  const amounts = lineDisplayAmounts(transaction, maps);
  if (amounts.length === 0) {
    return undefined;
  }

  const positiveSign =
    transaction.transaction_class !== "transfer" &&
    transaction.transaction_class !== "currency_exchange";
  return amounts
    .map(
      (amount) =>
        `${formatDecimalAmount(amount.amount, amount.currency, {
          positiveSign,
        })} ${currencyDisplayMarker(amount.currency)}`,
    )
    .join(", ");
};

const transactionResultOptionLabel = (
  transaction: Transaction,
  memo: string | undefined,
  postingStatus: ReturnType<typeof linePostingStatus>,
  maps: ReturnType<typeof buildLookupMaps>,
): string => {
  const amountLabel = transactionResultAmountLabel(transaction, maps);
  return [
    `Transaction ${formatInitiatedDate(transaction.initiated_date)}`,
    transaction.display_title,
    `class ${transactionClassLabel(transaction.transaction_class)}`,
    `status ${postingStatusLabel(postingStatus)}`,
    amountLabel ? `amount ${amountLabel}` : undefined,
    memo ? `memo ${memo}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
};

export const CommandPalette = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { open } = useCommandPaletteView();
  const lookups = useLedgerLookupsView();
  const lookupMaps = useMemo(
    () => buildLookupMaps(lookups.snapshot),
    [lookups.snapshot],
  );
  const lastTransactionsPageSearch = useLastTransactionsPageSearch();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsViewportRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const openCycleRef = useRef(0);
  const wasOpenRef = useRef(false);
  const lookupRefreshCycleRef = useRef<number | undefined>(undefined);
  const accountGroupRefreshCycleRef = useRef<number | undefined>(undefined);
  const transactionSearchRequestRef = useRef(0);
  const [searchState, setSearchState] = useState<PaletteSearchState>({
    activeIndex: 0,
    query: "",
  });
  const [notice, setNotice] = useState<PaletteNotice | undefined>();
  const [accountGroupLookups, setAccountGroupLookups] =
    useState<AccountGroupLookupState>({
      errorMessage: undefined,
      groups: undefined,
      loading: false,
    });
  const [transactionSearch, setTransactionSearch] =
    useState<TransactionSearchState>({
      errorMessage: undefined,
      loading: false,
      query: "",
      transactions: [],
    });
  const query = searchState.query;
  const transactionSearchMode = query.startsWith("'");
  const transactionQuery = transactionSearchMode ? query.slice(1) : "";

  const showNotice = useCallback(
    (message: string, kind: PaletteNotice["kind"]) => {
      setNotice((current) => ({
        id: (current?.id ?? 0) + 1,
        kind,
        message,
      }));
    },
    [],
  );

  const dismissNotice = useCallback(() => {
    setNotice(undefined);
  }, []);

  const openEntryCommand = useCallback(
    (entryType: TransactionEntryType) => {
      openTransactionEntryPanel(entryType);
      void navigate({
        pathname: "/transactions",
        search: transactionsEntrySearch(
          location.pathname === "/transactions"
            ? location.search
            : lastTransactionsPageSearch,
        ),
      });
    },
    [lastTransactionsPageSearch, location.pathname, location.search, navigate],
  );

  const runDatabaseBackup = useCallback(async () => {
    const result = await startDatabaseBackupRun();
    if (result.data) {
      showNotice(
        `Database backup started: run ${result.data.operation_run_id}.`,
        "success",
      );
      return;
    }
    showNotice(
      `Database backup failed: ${apiErrorMessage(result.error)}`,
      "error",
    );
  }, [showNotice]);

  const runExchangeRateLoading = useCallback(async () => {
    const result = await startExchangeRateLoadingRun();
    if (result.data) {
      showNotice(
        `Exchange-rate reload started: run ${result.data.operation_run_id}.`,
        "success",
      );
      return;
    }
    showNotice(
      `Exchange-rate reload failed: ${apiErrorMessage(result.error)}`,
      "error",
    );
  }, [showNotice]);

  const commands = useMemo<readonly CommandItem[]>(() => {
    if (transactionSearchMode) {
      return [];
    }

    const pageCommands: readonly CommandItem[] = [
      {
        group: "Navigation",
        icon: Home,
        id: "page-overview",
        label: "Overview",
        to: "/overview",
      },
      {
        group: "Navigation",
        icon: ListBox,
        id: "page-transactions",
        keywords: ["ledger", "activity"],
        label: "Transactions",
        to: {
          pathname: "/transactions",
          search: lastTransactionsPageSearch,
        },
      },
      {
        group: "Navigation",
        icon: Wallet,
        id: "page-accounts",
        keywords: ["chart of accounts"],
        label: "Accounts",
        to: "/accounts",
      },
      {
        group: "Navigation",
        icon: Folder,
        id: "page-categories",
        label: "Categories",
        to: "/categories",
      },
      {
        group: "Navigation",
        icon: Hash,
        id: "page-tags",
        label: "Tags",
        to: "/tags",
      },
      {
        group: "Navigation",
        icon: User,
        id: "page-members",
        label: "Members",
        to: "/members",
      },
      {
        group: "Navigation",
        icon: Chart,
        id: "page-status",
        keywords: ["health"],
        label: "Status",
        to: "/status",
      },
      {
        group: "Navigation",
        icon: SettingsCog2,
        id: "page-settings",
        keywords: ["configuration", "preferences"],
        label: "Settings",
        to: "/settings",
      },
    ];

    const entryCommands: readonly CommandItem[] = [
      {
        action: () => {
          openEntryCommand("spend");
        },
        group: "New transaction",
        icon: Plus,
        id: "entry-spend",
        keywords: ["spend", "expense"],
        label: "New spend",
      },
      {
        action: () => {
          openEntryCommand("income");
        },
        group: "New transaction",
        icon: Plus,
        id: "entry-income",
        keywords: ["income"],
        label: "New income",
      },
      {
        action: () => {
          openEntryCommand("refund");
        },
        group: "New transaction",
        icon: Plus,
        id: "entry-refund",
        keywords: ["refund"],
        label: "New refund",
      },
      {
        action: () => {
          openEntryCommand("transfer");
        },
        group: "New transaction",
        icon: Plus,
        id: "entry-transfer",
        keywords: ["transfer"],
        label: "New transfer",
      },
    ];

    const actionCommands: readonly CommandItem[] = [
      {
        action: () => {
          void runDatabaseBackup();
        },
        group: "Actions",
        icon: Archive,
        id: "action-database-backup",
        keywords: ["backup", "database"],
        label: "Run database backup",
      },
      {
        action: () => {
          void runExchangeRateLoading();
        },
        group: "Actions",
        icon: Chart,
        id: "action-exchange-rates",
        keywords: ["exchange", "rates", "reload"],
        label: "Reload exchange rates",
      },
    ];

    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery || !lookups.snapshot) {
      return [...pageCommands, ...entryCommands, ...actionCommands];
    }

    const accountCommands = sortFqnMatches<Account>(
      lookups.snapshot.accounts.filter((account) => !account.tombstoned_at),
      normalizedQuery,
    ).map<CommandItem>((account) => ({
      accessibleLabel: `Account ${account.fqn}`,
      detail: "Account",
      group: "Accounts",
      hiddenLabel: account.is_hidden ? "Hidden account" : undefined,
      icon: Wallet,
      id: `account-${account.account_id}`,
      keywords: [account.fqn, leafName(account.fqn)],
      label: account.fqn,
      renderLabel: (
        <FqnPath value={account.fqn} focusable={false} className="text-sm" />
      ),
      to: `/accounts/${account.account_id}`,
    }));

    const groupCommands = sortFqnMatches<GroupState>(
      accountGroupLookups.groups ?? [],
      normalizedQuery,
    ).map<CommandItem>((group) => ({
      accessibleLabel: `Account group ${group.fqn}`,
      detail: "Account group",
      group: "Account groups",
      hiddenLabel: group.is_hidden ? "Hidden account group" : undefined,
      icon: Folder,
      id: `account-group-${domIdPart(group.fqn)}`,
      keywords: [group.fqn, leafName(group.fqn)],
      label: group.fqn,
      renderLabel: (
        <FqnPath value={group.fqn} focusable={false} className="text-sm" />
      ),
      to: {
        pathname: "/accounts/group",
        search: `?prefix=${encodeURIComponent(group.fqn)}`,
      },
    }));

    return [
      ...pageCommands,
      ...entryCommands,
      ...accountCommands,
      ...groupCommands,
      ...actionCommands,
    ];
  }, [
    accountGroupLookups.groups,
    lastTransactionsPageSearch,
    lookups.snapshot,
    openEntryCommand,
    query,
    runDatabaseBackup,
    runExchangeRateLoading,
    transactionSearchMode,
  ]);

  const visibleCommands = useMemo(() => {
    if (transactionSearchMode) {
      return [];
    }

    const normalizedQuery = normalizeSearch(query);
    return commands.filter((command) =>
      commandMatches(command, normalizedQuery),
    );
  }, [commands, query, transactionSearchMode]);
  const transactionSearchCurrent = transactionSearch.query === transactionQuery;
  const transactionSearchLoading =
    Boolean(transactionQuery.trim()) &&
    (!transactionSearchCurrent || transactionSearch.loading);
  const transactionSearchErrorMessage = transactionSearchCurrent
    ? transactionSearch.errorMessage
    : undefined;
  const transactionResults = transactionSearchCurrent
    ? transactionSearch.transactions
    : [];
  const resultCount = transactionSearchMode
    ? transactionResults.length
    : visibleCommands.length;
  const activeIndex = Math.min(
    searchState.activeIndex,
    Math.max(0, resultCount - 1),
  );
  const groupedCommands = useMemo(
    () => (transactionSearchMode ? [] : groupCommands(visibleCommands)),
    [transactionSearchMode, visibleCommands],
  );
  const activeCommand = transactionSearchMode
    ? undefined
    : visibleCommands[activeIndex];
  const activeTransaction = transactionSearchMode
    ? transactionResults[activeIndex]
    : undefined;
  const activeDescendantId = transactionSearchMode
    ? activeTransaction
      ? transactionOptionId(activeTransaction.transaction_id)
      : undefined
    : activeCommand
      ? commandOptionId(activeCommand.id)
      : undefined;
  const hasCommandResults = groupedCommands.length > 0;
  const hasTransactionResults = transactionResults.length > 0;
  const hasPaletteResults = transactionSearchMode
    ? hasTransactionResults
    : hasCommandResults;
  const lookupErrorMessage = lookups.snapshot
    ? accountGroupLookups.errorMessage
    : (lookups.errorMessage ?? accountGroupLookups.errorMessage);

  const close = useCallback(() => {
    closeCommandPalette();
  }, []);

  const commandIsCurrent = useCallback(
    (to: To): boolean => {
      if (typeof to === "string") {
        return (
          normalizePathname(location.pathname) === normalizePathname(to) &&
          location.search === ""
        );
      }

      return (
        normalizePathname(location.pathname) ===
          normalizePathname(to.pathname ?? location.pathname) &&
        location.search === (to.search ?? "")
      );
    },
    [location.pathname, location.search],
  );

  const activateCommand = useCallback(
    (command: CommandItem | undefined) => {
      if (!command) {
        return;
      }

      if (command.action) {
        closeCommandPalette();
        command.action();
        return;
      }
      if (command.to) {
        const isCurrent = commandIsCurrent(command.to);
        if (!isCurrent) {
          restoreFocusRef.current = null;
        }
        closeCommandPalette();
        if (!isCurrent) {
          void navigate(command.to);
        }
        return;
      }
      closeCommandPalette();
    },
    [commandIsCurrent, navigate],
  );

  const activateTransaction = useCallback(
    (transaction: Transaction | undefined) => {
      if (!transaction) {
        return;
      }

      restoreFocusRef.current = null;
      closeCommandPalette();
      const detailBaseSearch =
        location.pathname === "/transactions"
          ? location.search
          : lastTransactionsPageSearch;
      void navigate({
        pathname: "/transactions",
        search: transactionDetailSearch(
          transaction.transaction_id,
          detailBaseSearch,
        ),
      });
    },
    [lastTransactionsPageSearch, location.pathname, location.search, navigate],
  );

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      openCycleRef.current += 1;
      setSearchState({
        activeIndex: 0,
        query: "",
      });
      setTransactionSearch({
        errorMessage: undefined,
        loading: false,
        query: "",
        transactions: [],
      });
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open || !transactionSearchMode) {
      transactionSearchRequestRef.current += 1;
      return;
    }

    const trimmedQuery = transactionQuery.trim();
    const requestId = transactionSearchRequestRef.current + 1;
    transactionSearchRequestRef.current = requestId;

    if (!trimmedQuery) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (transactionSearchRequestRef.current !== requestId) {
        return;
      }

      setTransactionSearch((current) => ({
        errorMessage: undefined,
        loading: true,
        query: transactionQuery,
        transactions:
          current.query === transactionQuery ? current.transactions : [],
      }));

      void fetchTransactionPage({
        filters: { search: transactionQuery },
        limit: transactionResultLimit,
        offset: 0,
      })
        .then((result) => {
          if (transactionSearchRequestRef.current !== requestId) {
            return;
          }

          if (result.data) {
            setTransactionSearch({
              errorMessage: undefined,
              loading: false,
              query: transactionQuery,
              transactions: result.data.transactions,
            });
            return;
          }

          setTransactionSearch({
            errorMessage: apiErrorMessage(result.error),
            loading: false,
            query: transactionQuery,
            transactions: [],
          });
        })
        .catch(() => {
          if (transactionSearchRequestRef.current !== requestId) {
            return;
          }

          setTransactionSearch({
            errorMessage: "Unable to search transactions.",
            loading: false,
            query: transactionQuery,
            transactions: [],
          });
        });
    }, transactionSearchDebounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, transactionQuery, transactionSearchMode]);

  useEffect(() => {
    if (
      !open ||
      lookups.snapshot ||
      lookups.loading ||
      lookupRefreshCycleRef.current === openCycleRef.current
    ) {
      return;
    }

    lookupRefreshCycleRef.current = openCycleRef.current;
    void refreshLedgerLookups();
  }, [lookups.loading, lookups.snapshot, open]);

  useEffect(() => {
    if (
      !open ||
      accountGroupLookups.loading ||
      accountGroupRefreshCycleRef.current === openCycleRef.current
    ) {
      return;
    }

    const refreshCycle = openCycleRef.current;
    const currentGroups = accountGroupLookups.groups;
    accountGroupRefreshCycleRef.current = refreshCycle;
    setAccountGroupLookups({
      errorMessage: undefined,
      groups: currentGroups,
      loading: true,
    });

    void fetchAccountGroupsForLookups().then((result) => {
      if (accountGroupRefreshCycleRef.current !== refreshCycle) {
        return;
      }

      if (result.data) {
        setAccountGroupLookups({
          errorMessage: undefined,
          groups: result.data.groups,
          loading: false,
        });
        return;
      }

      setAccountGroupLookups({
        errorMessage: apiErrorMessage(result.error),
        groups: currentGroups,
        loading: false,
      });
    });
  }, [accountGroupLookups.groups, accountGroupLookups.loading, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const activeElement = document.activeElement;
    restoreFocusRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;

    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
  }, [open]);

  useLayoutEffect(() => {
    if (open || openCycleRef.current === 0) {
      return;
    }

    const restoreTarget = restoreFocusRef.current;
    restoreFocusRef.current = null;
    const focusTarget =
      restoreTarget &&
      restoreTarget !== document.body &&
      document.contains(restoreTarget)
        ? restoreTarget
        : document.querySelector<HTMLElement>("main h1[tabindex='-1']");
    if (!focusTarget) {
      return;
    }

    focusWithoutTooltip(focusTarget, { preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open || !activeDescendantId) {
      return;
    }

    const activeOption = document.getElementById(activeDescendantId);
    if (
      !(activeOption instanceof HTMLElement) ||
      !resultsViewportRef.current?.contains(activeOption)
    ) {
      return;
    }

    activeOption.scrollIntoView({ block: "nearest" });
  }, [activeDescendantId, open]);

  const handleDialogKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    ).filter((element) => element.offsetParent !== null);
    if (focusableElements.length === 0) {
      return;
    }

    event.preventDefault();
    const activeIndex = focusableElements.findIndex(
      (element) => element === document.activeElement,
    );
    const nextIndex = event.shiftKey
      ? activeIndex <= 0
        ? focusableElements.length - 1
        : activeIndex - 1
      : activeIndex < 0 || activeIndex === focusableElements.length - 1
        ? 0
        : activeIndex + 1;
    focusableElements[nextIndex]?.focus();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!event.nativeEvent.isComposing && event.key === " " && query === "") {
      event.preventDefault();
      setSearchState({
        activeIndex: 0,
        query: "'",
      });
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchState({
        activeIndex:
          resultCount === 0 ? 0 : Math.min(activeIndex + 1, resultCount - 1),
        query,
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchState({
        activeIndex: Math.max(activeIndex - 1, 0),
        query,
      });
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (transactionSearchMode) {
        activateTransaction(activeTransaction);
        return;
      }
      activateCommand(activeCommand);
    }
  };

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[color-mix(in_srgb,var(--frame),transparent_55%)] px-4 pt-[12svh]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              close();
            }
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-palette-title"
            className="bg-card text-foreground flex max-h-[min(38rem,76svh)] w-full max-w-2xl flex-col border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
            onKeyDownCapture={handleDialogKeyDownCapture}
          >
            <div className="bg-card sticky top-0 z-10 flex flex-col gap-3 border-b-2 border-[var(--border-ink)] p-4">
              <div className="flex items-center justify-between gap-4">
                <h2
                  id="command-palette-title"
                  className="font-heading text-base font-bold uppercase"
                >
                  Command Palette
                </h2>
                <kbd className="bg-muted border-2 border-[var(--border-ink)] px-1.5 py-0.5 font-mono text-xs shadow-[var(--shadow-chip)]">
                  Cmd/Ctrl K
                </kbd>
              </div>
              <input
                ref={inputRef}
                type="search"
                role="combobox"
                aria-label="Command search"
                aria-autocomplete="list"
                aria-controls={
                  hasPaletteResults ? "command-palette-results" : undefined
                }
                aria-expanded={hasPaletteResults}
                aria-activedescendant={
                  hasPaletteResults ? activeDescendantId : undefined
                }
                className="bg-card text-foreground placeholder:text-muted-foreground h-10 border-2 border-[var(--border-ink)] px-3 font-mono text-sm shadow-[var(--shadow-chip)]"
                placeholder={
                  transactionSearchMode
                    ? "' search transactions"
                    : "Type a command or page"
                }
                value={query}
                onChange={(event) => {
                  setSearchState({
                    activeIndex: 0,
                    query: event.target.value,
                  });
                }}
                onKeyDown={handleInputKeyDown}
              />
            </div>
            <div
              ref={resultsViewportRef}
              className="min-h-0 overflow-y-auto p-2"
            >
              {transactionSearchMode ? (
                <>
                  {transactionSearchLoading ? (
                    <TransactionSearchResultsSkeleton />
                  ) : transactionSearchErrorMessage ? (
                    <div
                      className="bg-muted text-destructive px-3 py-4 font-mono text-sm"
                      role="alert"
                    >
                      {transactionSearchErrorMessage}
                    </div>
                  ) : transactionResults.length === 0 ? (
                    <div className="bg-muted text-muted-foreground px-3 py-4 font-mono text-sm">
                      {transactionQuery.trim()
                        ? "No matching transactions."
                        : "Type after the apostrophe to search transactions."}
                    </div>
                  ) : (
                    <div
                      id="command-palette-results"
                      role="listbox"
                      aria-label="Transaction search results"
                      className="flex flex-col gap-1"
                    >
                      {transactionResults.map((transaction, index) => {
                        const active = index === activeIndex;
                        const memo = lineMemo(transaction);
                        const postingStatus = linePostingStatus(transaction);
                        const amountDeemphasized =
                          postingStatus === "expected" ||
                          postingStatus === "pending" ||
                          postingStatus === "cancelled";
                        const lineInactive = postingStatus === "cancelled";
                        const optionLabel = transactionResultOptionLabel(
                          transaction,
                          memo,
                          postingStatus,
                          lookupMaps,
                        );
                        return (
                          <button
                            key={transaction.transaction_id}
                            id={transactionOptionId(transaction.transaction_id)}
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={cn(
                              transactionResultGridClass,
                              "w-full border-2 border-transparent py-2 text-left font-mono text-sm",
                              "hover:bg-muted hover:border-[var(--border-ink)]",
                              active &&
                                "border-[var(--border-ink)] bg-[var(--color-interactive-bright)] shadow-[var(--shadow-chip)]",
                              lineInactive &&
                                "text-muted-foreground line-through",
                            )}
                            onMouseEnter={() => {
                              setSearchState({
                                activeIndex: index,
                                query,
                              });
                            }}
                            onClick={() => {
                              activateTransaction(transaction);
                            }}
                            aria-label={optionLabel}
                          >
                            <span className="text-muted-foreground shrink-0 text-xs">
                              {formatInitiatedDate(transaction.initiated_date)}
                            </span>
                            <ClassIcon
                              focusable={false}
                              transactionClass={transaction.transaction_class}
                            />
                            <span className="hidden h-6 w-10 shrink-0 place-items-center sm:grid">
                              {postingStatus === "mixed" ? (
                                <MixedSentinel />
                              ) : (
                                <StatusIcon
                                  focusable={false}
                                  status={postingStatus}
                                />
                              )}
                            </span>
                            <span className="grid min-w-0 gap-0.5">
                              <Tooltip
                                focusable={false}
                                label={transaction.display_title}
                                className="block min-w-0"
                              >
                                <span
                                  className={cn(
                                    "block font-semibold",
                                    active
                                      ? "[overflow-wrap:anywhere] whitespace-normal"
                                      : "truncate",
                                  )}
                                >
                                  {transaction.display_title}
                                </span>
                              </Tooltip>
                              {memo ? (
                                <Tooltip
                                  focusable={false}
                                  label={memo}
                                  className="block min-w-0"
                                >
                                  <span
                                    className={cn(
                                      "text-muted-foreground block text-xs",
                                      active
                                        ? "[overflow-wrap:anywhere] whitespace-normal"
                                        : "truncate",
                                    )}
                                  >
                                    {memo}
                                  </span>
                                </Tooltip>
                              ) : null}
                            </span>
                            <span className="flex min-w-0 flex-wrap justify-end gap-1 overflow-hidden">
                              <TransactionResultAmounts
                                deemphasized={amountDeemphasized}
                                maps={lookupMaps}
                                transaction={transaction}
                              />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : groupedCommands.length === 0 ? (
                lookups.loading || accountGroupLookups.loading ? (
                  <CommandPaletteResultsSkeleton />
                ) : (
                  <div
                    className={cn(
                      "bg-muted px-3 py-4 font-mono text-sm",
                      lookupErrorMessage
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                    role={lookupErrorMessage ? "alert" : undefined}
                  >
                    {lookupErrorMessage ?? "No commands found."}
                  </div>
                )
              ) : (
                <>
                  <div
                    id="command-palette-results"
                    role="listbox"
                    aria-label="Command results"
                    className="flex flex-col gap-3"
                  >
                    {groupedCommands.map((group) => (
                      <div
                        key={group.group}
                        role="group"
                        aria-label={group.group}
                      >
                        <h3
                          role="presentation"
                          className="font-heading text-muted-foreground px-2 pb-1 text-xs font-semibold uppercase"
                        >
                          {group.group}
                        </h3>
                        <div className="flex flex-col gap-1">
                          {group.items.map((command) => {
                            const index = visibleCommands.indexOf(command);
                            const active = index === activeIndex;
                            const Icon = command.icon;
                            return (
                              <button
                                key={command.id}
                                id={commandOptionId(command.id)}
                                type="button"
                                role="option"
                                aria-selected={active}
                                className={cn(
                                  "flex w-full items-center gap-3 border-2 border-transparent px-3 py-2 text-left font-mono text-sm",
                                  "hover:bg-muted hover:border-[var(--border-ink)]",
                                  active &&
                                    "border-[var(--border-ink)] bg-[var(--color-interactive-bright)] shadow-[var(--shadow-chip)]",
                                )}
                                onMouseEnter={() => {
                                  setSearchState({
                                    activeIndex: index,
                                    query,
                                  });
                                }}
                                onClick={() => {
                                  activateCommand(command);
                                }}
                                aria-label={command.accessibleLabel}
                              >
                                <Icon
                                  className="size-4 shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="min-w-0 flex-1 font-semibold">
                                  {command.renderLabel ?? command.label}
                                </span>
                                {command.hiddenLabel ? (
                                  <Tooltip
                                    focusable={false}
                                    label={command.hiddenLabel}
                                    className="text-foreground inline-flex shrink-0"
                                  >
                                    <span
                                      aria-label={command.hiddenLabel}
                                      className="inline-flex"
                                    >
                                      <EyeOff
                                        aria-hidden="true"
                                        className="size-4"
                                      />
                                    </span>
                                  </Tooltip>
                                ) : null}
                                {command.detail ? (
                                  <span className="text-muted-foreground ml-auto text-xs">
                                    {command.detail}
                                  </span>
                                ) : null}
                                {command.to && commandIsCurrent(command.to) ? (
                                  <span className="text-muted-foreground ml-auto text-xs">
                                    Current
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {lookupErrorMessage ? (
                    <div
                      className="bg-muted text-destructive mt-3 px-3 py-2 font-mono text-sm"
                      role="alert"
                    >
                      {lookupErrorMessage}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <Toast
        key={notice?.id ?? "empty"}
        className={
          notice?.kind === "error"
            ? "text-destructive"
            : "text-[var(--color-money-in)]"
        }
        durationMs={toastDurationMs}
        message={notice?.message}
        onDismiss={dismissNotice}
      />
    </>
  );
};

import {
  Archive,
  Chart,
  EyeOff,
  Folder,
  Hash,
  Home,
  ListBox,
  Plus,
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
  useMemo,
  useRef,
  useState,
} from "react";
import { type To, useLocation, useNavigate } from "react-router";

import {
  type Account,
  fetchAccountGroupsForLookups,
  type GroupState,
  isNetworkFailure,
  startDatabaseBackupRun,
  startExchangeRateLoadingRun,
} from "@/api";
import { Toast, toastDurationMs } from "@/components/toast";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { FqnPath, refreshLedgerLookups } from "@/features/ledger";
import { cn } from "@/lib/utils";
import type { TransactionEntryType } from "@/models/ui-state";
import {
  closeCommandPalette,
  openTransactionEntryPanel,
  useCommandPaletteView,
  useLastTransactionsPageSearch,
  useLedgerLookupsView,
} from "@/store";

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

const commandGroups: readonly CommandGroup[] = [
  "Navigation",
  "New transaction",
  "Accounts",
  "Account groups",
  "Actions",
];
const entityResultLimit = 8;
const commandSkeletonRows = [0, 1, 2, 3] as const;

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

const normalizeSearch = (value: string): string =>
  value.trim().toLocaleLowerCase();

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

const apiErrorMessage = (error: unknown): string => {
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
  return "The API request failed.";
};

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

export const CommandPalette = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { open } = useCommandPaletteView();
  const lookups = useLedgerLookupsView();
  const lastTransactionsPageSearch = useLastTransactionsPageSearch();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsViewportRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const openCycleRef = useRef(0);
  const wasOpenRef = useRef(false);
  const lookupRefreshCycleRef = useRef<number | undefined>(undefined);
  const accountGroupRefreshCycleRef = useRef<number | undefined>(undefined);
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
  const query = searchState.query;

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
  ]);

  const visibleCommands = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return commands.filter((command) =>
      commandMatches(command, normalizedQuery),
    );
  }, [commands, query]);
  const activeIndex = Math.min(
    searchState.activeIndex,
    Math.max(0, visibleCommands.length - 1),
  );
  const groupedCommands = useMemo(
    () => groupCommands(visibleCommands),
    [visibleCommands],
  );
  const activeCommand = visibleCommands[activeIndex];
  const activeDescendantId = activeCommand
    ? commandOptionId(activeCommand.id)
    : undefined;
  const hasCommandResults = groupedCommands.length > 0;
  const lookupErrorMessage = lookups.snapshot
    ? accountGroupLookups.errorMessage
    : (lookups.errorMessage ?? accountGroupLookups.errorMessage);

  const close = useCallback(() => {
    closeCommandPalette();
  }, []);

  const commandIsCurrent = useCallback(
    (to: To): boolean => {
      if (typeof to === "string") {
        return location.pathname === to && location.search === "";
      }

      return (
        location.pathname === (to.pathname ?? location.pathname) &&
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
        restoreFocusRef.current = null;
        closeCommandPalette();
        void navigate(command.to);
        return;
      }
      closeCommandPalette();
    },
    [navigate],
  );

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      openCycleRef.current += 1;
      setSearchState({
        activeIndex: 0,
        query: "",
      });
    }
    wasOpenRef.current = open;
  }, [open]);

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

  useEffect(() => {
    if (open) {
      return;
    }

    const restoreTarget = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (!restoreTarget || !document.contains(restoreTarget)) {
      return;
    }

    window.requestAnimationFrame(() => {
      focusWithoutTooltip(restoreTarget, { preventScroll: true });
    });
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

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    if (!first || !last) {
      return;
    }
    const activeElement = document.activeElement;
    if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchState({
        activeIndex:
          visibleCommands.length === 0
            ? 0
            : Math.min(activeIndex + 1, visibleCommands.length - 1),
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
                  hasCommandResults ? "command-palette-results" : undefined
                }
                aria-expanded={hasCommandResults}
                aria-activedescendant={
                  hasCommandResults ? activeDescendantId : undefined
                }
                className="bg-card text-foreground placeholder:text-muted-foreground h-10 border-2 border-[var(--border-ink)] px-3 font-mono text-sm shadow-[var(--shadow-chip)]"
                placeholder="Type a command or page"
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
              {groupedCommands.length === 0 ? (
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
        containerClassName="z-[60]"
        durationMs={toastDurationMs}
        message={notice?.message}
        onDismiss={dismissNotice}
      />
    </>
  );
};

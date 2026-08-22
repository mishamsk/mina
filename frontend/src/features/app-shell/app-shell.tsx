import {
  Archive,
  Calendar,
  CardText,
  Chart,
  Close,
  Folder,
  Hash,
  Home,
  ListBox,
  Logout,
  Menu,
  Search,
  SettingsCog2,
  User,
  Wallet,
} from "pixelarticons/react";
import type { ComponentType, ReactNode, Ref, SVGProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  NavLink,
  type To,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";

import { apiErrorMessage, fetchTransactionById } from "@/api";
import { Toast } from "@/components/toast";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CommandPalette } from "@/features/command-palette";
import { BalanceStrip } from "@/features/featured-balances";
import {
  canSplitTransaction,
  captureTransactionEntryLaunchContext,
  EntryModal,
  invalidateAccountRegistersForTransaction,
  refreshLedgerLookups,
  refreshViewsAfterEntrySave,
  transactionEntrySavedEvent,
  transactionRowFallback,
  useLedgerLookupsResource,
} from "@/features/ledger";
import {
  DefinitionEditorPanel,
  refreshAfterRecurringDefinitionMutation,
  refreshMountedRecurringDefinitions,
  revealRecurringDefinitionActionRow,
} from "@/features/recurring";
import {
  refreshTransactionTemplates,
  TemplateEditorModal,
} from "@/features/templates";
import { cn } from "@/lib/utils";
import type { TransactionEntryType } from "@/models/ui-state";
import {
  closeRecurringDefinitionEditor,
  closeTemplateEditor,
  closeTransactionEntryPanel,
  consumeRecurringDefinitionFragmentNavigation,
  failTransactionEntryRoute,
  getCommandPaletteSnapshot,
  loadTransactionEntryRoute,
  logoutAuthentication,
  openCommandPalette,
  openTransactionEntryPanel,
  openTransactionEntryRoute,
  resolveTransactionEntryRoute,
  setSidebarCollapsed,
  toggleCommandPalette,
  transactionEntryWillOpenEvent,
  upsertTransactionTemplate,
  useAuthenticationView,
  useCommandPaletteOpen,
  useLastTransactionsPageSearch,
  usePreferencesView,
  useRecurringDefinitionEditorView,
  useTemplateEditorView,
  useTransactionEntryPanelView,
} from "@/store";

type PixelIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  readonly entryModalRestoreTarget?: boolean;
  readonly icon: PixelIcon;
  readonly label: string;
  readonly to: To;
}

const referenceNavItems: readonly NavItem[] = [
  { icon: Folder, label: "Categories", to: "/categories" },
  { icon: Hash, label: "Tags", to: "/tags" },
  { icon: User, label: "Members", to: "/members" },
  { icon: CardText, label: "Templates", to: "/templates" },
];

const utilityNavItems: readonly NavItem[] = [
  { icon: Chart, label: "Status", to: "/status" },
  { icon: SettingsCog2, label: "Settings", to: "/settings" },
];

const modalOverlaySelector =
  "[role='alertdialog'], [role='dialog'][aria-modal='true'], [data-global-shortcut-blocking-overlay], [data-recurring-definition-editor], [data-page-help-content], [data-slot='popover-content'], [data-slot='select-content'][data-state='open']";

const isVisibleOverlay = (element: Element): boolean =>
  element instanceof HTMLElement && element.getClientRects().length > 0;

const isTransactionRowWithinViewport = (row: HTMLElement): boolean => {
  const viewport = row.closest<HTMLElement>(
    "[data-testid='transactions-table-scroll']",
  );
  if (!viewport) {
    return true;
  }

  const rowBounds = row.getBoundingClientRect();
  const viewportBounds = viewport.getBoundingClientRect();
  const headerBottom =
    viewport.querySelector("thead")?.getBoundingClientRect().bottom ??
    viewportBounds.top;
  return (
    rowBounds.bottom > Math.max(viewportBounds.top, headerBottom) &&
    rowBounds.top < viewportBounds.bottom
  );
};

const hasActiveOverlay = (): boolean =>
  Array.from(document.querySelectorAll(modalOverlaySelector)).some(
    isVisibleOverlay,
  );

const currentHistoryKey = (): string | undefined => {
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null || !("key" in state)) {
    return undefined;
  }
  return typeof state.key === "string" ? state.key : undefined;
};

const resolveRecurringDefinitionFocusTarget = (
  opener: HTMLElement | undefined,
): HTMLElement | undefined => {
  const routeFallback =
    document.querySelector<HTMLElement>("main h1") ?? undefined;
  const recurringDefinitionId = opener?.closest<HTMLElement>(
    "[data-recurring-definition-id]",
  )?.dataset.recurringDefinitionId;
  if (recurringDefinitionId) {
    const liveRow = document.querySelector<HTMLElement>(
      `[data-recurring-definition-id="${recurringDefinitionId}"]`,
    );
    if (liveRow) {
      revealRecurringDefinitionActionRow(liveRow);
      return liveRow;
    }
    return routeFallback ?? opener;
  }
  const openerTransactionRow = opener?.closest<HTMLElement>(
    "[data-transaction-row='true']",
  );
  if (
    !opener ||
    (opener.isConnected &&
      opener.getClientRects().length > 0 &&
      (!openerTransactionRow ||
        isTransactionRowWithinViewport(openerTransactionRow)) &&
      !opener.matches("tr"))
  ) {
    return opener;
  }
  const overflowTrigger = opener
    .closest<HTMLElement>(".row-actions")
    ?.querySelector<HTMLElement>(".row-actions-overflow");
  if (
    overflowTrigger?.isConnected &&
    overflowTrigger.getClientRects().length > 0 &&
    (!openerTransactionRow ||
      isTransactionRowWithinViewport(openerTransactionRow))
  ) {
    return overflowTrigger;
  }
  const transactionSurfaceMounted = Boolean(
    document.querySelector("[data-testid='transaction-browser-layout']"),
  );
  const transactionRouteMounted = window.location.pathname === "/transactions";
  const transactionPageLoading = Boolean(
    document.querySelector("[data-testid='transactions-page-busy']"),
  );
  const transactionRouteSettledWithoutRows = Boolean(
    document.querySelector(
      "[data-transaction-empty-action], main [role='alert']",
    ),
  );
  const transactionId =
    opener.closest<HTMLElement>(
      "[data-transaction-row='true'][data-transaction-id]",
    )?.dataset.transactionId ??
    opener.closest<HTMLElement>("[data-source-transaction-id]")?.dataset
      .sourceTransactionId;
  if (!transactionId) {
    const sourceRow = opener.closest<HTMLElement>("tr");
    if (sourceRow?.isConnected && sourceRow.getClientRects().length > 0) {
      const recurringAction = Array.from(
        sourceRow.querySelectorAll<HTMLElement>(
          "[aria-label='Create recurring']",
        ),
      ).find((action) => action.getClientRects().length > 0);
      if (recurringAction) {
        return recurringAction;
      }
      const rowOverflowTrigger = sourceRow.querySelector<HTMLElement>(
        ".row-actions-overflow",
      );
      if (
        rowOverflowTrigger &&
        rowOverflowTrigger.getClientRects().length > 0
      ) {
        return rowOverflowTrigger;
      }
      return sourceRow;
    }
    return routeFallback ?? opener;
  }
  const liveRow = document.querySelector<HTMLElement>(
    `[data-transaction-row='true'][data-transaction-id='${transactionId}']`,
  );
  const visibleTransactionFallback = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>("[data-transaction-row='true']"),
    ).find(isTransactionRowWithinViewport) ??
    document.querySelector<HTMLElement>(
      "[data-testid='transactions-pagination-footer']",
    ) ??
    routeFallback ??
    opener;
  if (!liveRow) {
    if (!transactionSurfaceMounted && !transactionRouteMounted) {
      return routeFallback ?? opener;
    }
    if (
      transactionRouteMounted &&
      !transactionSurfaceMounted &&
      !transactionRouteSettledWithoutRows
    ) {
      return opener;
    }
    if (transactionPageLoading) {
      return opener;
    }
    return visibleTransactionFallback();
  }
  if (!isTransactionRowWithinViewport(liveRow)) {
    return visibleTransactionFallback();
  }
  return opener.classList.contains("row-actions-overflow")
    ? (liveRow.querySelector<HTMLElement>(".row-actions-overflow") ?? opener)
    : liveRow;
};

const createEntryTypes: Readonly<Record<string, TransactionEntryType>> = {
  exchange: "exchange",
  income: "income",
  journal: "advanced",
  refund: "refund",
  spend: "spend",
  transfer: "transfer",
};

const savedEntryPattern = /^(duplicate|edit|split):([1-9]\d*)$/;

interface AppShellProps {
  readonly children: ReactNode;
}

const navLinkClass = ({ collapsed }: { collapsed: boolean }) =>
  cn(
    "font-heading flex h-9 items-center gap-3 border-2 border-transparent px-2 text-sm font-semibold text-[var(--frame-muted)] uppercase",
    "hover:border-[var(--border-ink)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--frame-foreground)]",
    "aria-[current=page]:border-[var(--border-ink)] aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground aria-[current=page]:shadow-[var(--shadow-chip)] aria-[current=page]:hover:bg-primary aria-[current=page]:hover:text-primary-foreground",
    collapsed && "justify-center px-0",
  );

const SidebarNav = ({
  collapsed,
  items,
}: {
  readonly collapsed: boolean;
  readonly items: readonly NavItem[];
}) => (
  <nav className="flex flex-col gap-1">
    {items.map((item) => {
      const navLink = (
        <NavLink
          className={navLinkClass({ collapsed })}
          data-entry-modal-restore-target={
            item.entryModalRestoreTarget ? "" : undefined
          }
          key={item.label}
          to={item.to}
        >
          <item.icon className="size-4 shrink-0" aria-hidden="true" />
          <span className={cn(collapsed && "sr-only")}>{item.label}</span>
        </NavLink>
      );

      return collapsed ? (
        <Tooltip key={item.label} label={item.label} asChild>
          {navLink}
        </Tooltip>
      ) : (
        navLink
      );
    })}
  </nav>
);

const CommandPaletteButton = ({
  collapsed,
}: {
  readonly collapsed: boolean;
}) => {
  const button = (
    <Button
      type="button"
      variant="outline"
      className={cn("w-full", collapsed && "px-0")}
      aria-label="Command palette"
      onClick={openCommandPalette}
    >
      <Search aria-hidden="true" />
      <span className={cn(collapsed && "sr-only")}>Command palette</span>
    </Button>
  );

  return collapsed ? (
    <Tooltip label="Command palette" className="w-full" asChild>
      {button}
    </Tooltip>
  ) : (
    button
  );
};

const LogoutButton = ({
  buttonRef,
  collapsed,
  pending,
  onLogout,
}: {
  readonly buttonRef: Ref<HTMLButtonElement>;
  readonly collapsed: boolean;
  readonly pending: boolean;
  readonly onLogout: () => void;
}) => {
  const label = pending ? "Logging out…" : "Log out";
  const button = (
    <Button
      ref={buttonRef}
      type="button"
      variant="outline"
      className={cn("w-full", collapsed && "px-0")}
      aria-label={label}
      disabled={pending}
      onClick={onLogout}
    >
      <Logout aria-hidden="true" />
      <span className={cn(collapsed && "sr-only")} aria-live="polite">
        {label}
      </span>
    </Button>
  );

  return collapsed || pending ? (
    <Tooltip label={label} className="w-full" asChild={!pending}>
      {button}
    </Tooltip>
  ) : (
    button
  );
};

export const AppShell = ({ children }: AppShellProps) => {
  const {
    preferences: { sidebarCollapsed },
  } = usePreferencesView();
  const authentication = useAuthenticationView();
  const commandPaletteOpen = useCommandPaletteOpen();
  const entryModal = useTransactionEntryPanelView();
  const recurringDefinitionEditor = useRecurringDefinitionEditorView();
  const templateEditor = useTemplateEditorView();
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();
  const logoutButtonRef = useRef<HTMLButtonElement>(null);
  const [entrySaveNotice, setEntrySaveNotice] = useState<
    | {
        readonly avoidDetailActions?: boolean;
        readonly id: number;
        readonly message: string;
        readonly tone?: "error" | "success";
      }
    | undefined
  >();
  const entrySaveNoticeIdRef = useRef(0);
  const lookups = useLedgerLookupsResource(
    entryModal.open || templateEditor.open,
  );
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const entryParam = searchParams.get("entry");
  const previousEntryParamRef = useRef(entryParam);
  const closingEntryRef = useRef(false);
  const openingEntryUrlRef = useRef(false);
  const historyEntryClosePendingRef = useRef(false);
  const entryCloseRequestRef = useRef<(() => void) | null>(null);
  const entryDetailParamRef = useRef(
    entryParam ? searchParams.get("transaction") : null,
  );
  const lastTransactionsPageSearch = useLastTransactionsPageSearch();

  useEffect(() => {
    const markEntryUrlOpening = () => {
      openingEntryUrlRef.current = true;
    };
    window.addEventListener(transactionEntryWillOpenEvent, markEntryUrlOpening);
    return () => {
      window.removeEventListener(
        transactionEntryWillOpenEvent,
        markEntryUrlOpening,
      );
    };
  }, []);

  useEffect(() => {
    if (!logoutPending && logoutError && !commandPaletteOpen) {
      focusWithoutTooltip(logoutButtonRef.current, { preventScroll: true });
    }
  }, [commandPaletteOpen, logoutError, logoutPending]);

  const primaryNavItems: readonly NavItem[] = [
    { icon: Home, label: "Overview", to: "/overview" },
    {
      icon: ListBox,
      entryModalRestoreTarget: true,
      label: "Transactions",
      to: {
        pathname: "/transactions",
        search: lastTransactionsPageSearch,
      },
    },
    { icon: Calendar, label: "Recurring", to: "/recurring" },
    { icon: Wallet, label: "Accounts", to: "/accounts" },
  ];

  useEffect(() => {
    if (
      closingEntryRef.current &&
      !previousEntryParamRef.current &&
      !entryParam &&
      entryModal.open
    ) {
      closingEntryRef.current = false;
    }
    if (
      closingEntryRef.current ||
      (previousEntryParamRef.current && !entryParam) ||
      !entryModal.open ||
      !entryModal.requestedEntry ||
      entryParam === entryModal.requestedEntry
    ) {
      return;
    }
    openingEntryUrlRef.current = true;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("entry", entryModal.requestedEntry!);
        return next;
      },
      { replace: Boolean(entryParam) },
    );
  }, [entryModal.open, entryModal.requestedEntry, entryParam, setSearchParams]);

  useEffect(() => {
    const previousEntryParam = previousEntryParamRef.current;
    previousEntryParamRef.current = entryParam;
    if (openingEntryUrlRef.current) {
      if (entryParam !== entryModal.requestedEntry) {
        return;
      }
      openingEntryUrlRef.current = false;
    }
    if (entryParam && entryParam !== previousEntryParam) {
      entryDetailParamRef.current = searchParams.get("transaction");
    }
    if (!entryParam) {
      if (historyEntryClosePendingRef.current) {
        return;
      }
      closingEntryRef.current = false;
      entryDetailParamRef.current = null;
      if (previousEntryParam || entryModal.open) {
        closeTransactionEntryPanel();
      }
      return;
    }

    historyEntryClosePendingRef.current = false;
    if (closingEntryRef.current) {
      return;
    }

    const routeAlreadyOpen =
      entryModal.requestedEntry === entryParam && entryModal.open;
    if (routeAlreadyOpen) {
      return;
    }

    if (entryParam === "new") {
      openTransactionEntryRoute(
        entryParam,
        undefined,
        captureTransactionEntryLaunchContext(),
      );
      return;
    }
    if (entryParam.startsWith("new:")) {
      const initialTab = createEntryTypes[entryParam.slice(4)];
      if (initialTab) {
        openTransactionEntryRoute(
          entryParam,
          initialTab,
          captureTransactionEntryLaunchContext(),
        );
        return;
      }
    }

    const match = savedEntryPattern.exec(entryParam);
    if (!match) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("entry");
          return next;
        },
        { replace: true },
      );
      return;
    }

    const type = match[1] as "duplicate" | "edit" | "split";
    const transactionId = Number(match[2]);
    loadTransactionEntryRoute(
      entryParam,
      () => {
        void fetchTransactionById(transactionId).then((result) => {
          if (
            result.data &&
            !result.data.tombstoned_at &&
            (type !== "edit" || result.data.lifecycle_status === "active") &&
            (type !== "split" || canSplitTransaction(result.data))
          ) {
            resolveTransactionEntryRoute(entryParam, {
              transaction: result.data,
              type,
            });
            return;
          }
          failTransactionEntryRoute(
            entryParam,
            apiErrorMessage(
              result.error,
              type === "split"
                ? `Transaction #${transactionId} is unavailable for Split.`
                : type === "edit"
                  ? `Transaction #${transactionId} is unavailable for Edit.`
                  : `Transaction #${transactionId} could not be found.`,
            ),
          );
        });
      },
      captureTransactionEntryLaunchContext(),
    );
  }, [
    entryModal.open,
    entryModal.requestedEntry,
    entryParam,
    searchParams,
    setSearchParams,
  ]);

  const closeEntryModal = useCallback(() => {
    openingEntryUrlRef.current = false;
    closingEntryRef.current = true;
    previousEntryParamRef.current = null;
    historyEntryClosePendingRef.current = false;
    setSearchParams(
      () => {
        const next = new URLSearchParams(window.location.search);
        next.delete("entry");
        if (entryDetailParamRef.current && !next.has("transaction")) {
          next.set("transaction", entryDetailParamRef.current);
        }
        return next;
      },
      { replace: true },
    );
    closeTransactionEntryPanel();
  }, [setSearchParams]);

  useEffect(() => {
    const closeEntryAfterHistoryNavigation = () => {
      if (new URL(window.location.href).searchParams.has("entry")) {
        return;
      }
      if (
        !entryModal.open ||
        !entryModal.requestedEntry ||
        !entryCloseRequestRef.current
      ) {
        return;
      }
      openingEntryUrlRef.current = false;
      closingEntryRef.current = false;
      historyEntryClosePendingRef.current = true;
      setSearchParams(
        () => {
          const next = new URLSearchParams(window.location.search);
          next.set("entry", entryModal.requestedEntry!);
          return next;
        },
        { replace: true },
      );
      entryCloseRequestRef.current();
    };
    window.addEventListener("popstate", closeEntryAfterHistoryNavigation);
    return () => {
      window.removeEventListener("popstate", closeEntryAfterHistoryNavigation);
    };
  }, [entryModal.open, entryModal.requestedEntry, setSearchParams]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLocaleLowerCase() !== "k" ||
        event.altKey ||
        event.shiftKey ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }
      const commandPaletteOpen = getCommandPaletteSnapshot().open;
      if (!commandPaletteOpen && hasActiveOverlay()) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      toggleCommandPalette();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target =
        event.target instanceof HTMLElement ? event.target : undefined;
      if (
        event.key.toLowerCase() !== "n" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        hasActiveOverlay() ||
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      event.preventDefault();
      openTransactionEntryPanel(
        undefined,
        captureTransactionEntryLaunchContext(),
      );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className="bg-background text-foreground min-h-svh">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-10 flex flex-col border-r-2 border-[var(--border-ink)] bg-[var(--frame)] text-[var(--frame-foreground)] shadow-[var(--shadow-pixel)]",
          sidebarCollapsed ? "w-[76px]" : "w-64",
        )}
        aria-label="Primary"
      >
        <div
          className={cn(
            "flex h-16 items-center gap-3 border-b-2 border-[var(--border-ink)] px-3",
            sidebarCollapsed && "justify-center px-2",
          )}
        >
          <Archive
            className="size-6 shrink-0 text-[var(--color-class-adjustment-bright)]"
            aria-hidden="true"
          />
          <span
            className={cn(
              "text-pixel text-base leading-none",
              sidebarCollapsed && "sr-only",
            )}
          >
            Mina
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
          <div className="flex flex-col gap-2">
            <CommandPaletteButton collapsed={sidebarCollapsed} />
          </div>

          <SidebarNav collapsed={sidebarCollapsed} items={primaryNavItems} />

          <section className="flex flex-col gap-2">
            <p
              className={cn(
                "text-pixel text-muted-foreground px-2 text-xs",
                "text-[var(--frame-muted)]",
                sidebarCollapsed && "sr-only",
              )}
            >
              Reference
            </p>
            <SidebarNav
              collapsed={sidebarCollapsed}
              items={referenceNavItems}
            />
          </section>

          <BalanceStrip collapsed={sidebarCollapsed} />

          <div className="mt-auto flex flex-col gap-3">
            <Separator />
            <SidebarNav collapsed={sidebarCollapsed} items={utilityNavItems} />
            {authentication.phase === "authenticated" ? (
              <LogoutButton
                buttonRef={logoutButtonRef}
                collapsed={sidebarCollapsed}
                pending={logoutPending}
                onLogout={() => {
                  setLogoutPending(true);
                  setLogoutError(undefined);
                  void logoutAuthentication().then((error) => {
                    setLogoutPending(false);
                    if (error) {
                      setLogoutError(error);
                    }
                  });
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="border-t-2 border-[var(--border-ink)] p-3">
          <Tooltip
            label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            asChild
          >
            <Button
              type="button"
              variant="outline"
              size={sidebarCollapsed ? "icon" : "default"}
              className="w-full"
              aria-expanded={!sidebarCollapsed}
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              onClick={() => {
                setSidebarCollapsed(!sidebarCollapsed);
              }}
            >
              {sidebarCollapsed ? (
                <Menu aria-hidden="true" />
              ) : (
                <Close aria-hidden="true" />
              )}
              <span className={cn(sidebarCollapsed && "sr-only")}>
                {sidebarCollapsed ? "Expand" : "Collapse"}
              </span>
            </Button>
          </Tooltip>
        </div>
      </aside>

      <main
        inert={
          location.pathname === "/recurring" &&
          recurringDefinitionEditor.launch !== undefined
        }
        className={cn(
          "min-h-svh bg-[var(--ground)] bg-[linear-gradient(90deg,rgb(237_234_247_/_4%)_1px,transparent_1px),linear-gradient(180deg,rgb(237_234_247_/_4%)_1px,transparent_1px)] bg-[size:16px_16px] px-5 pt-7 pb-3 transition-[margin] duration-150 ease-[steps(2)] sm:px-8",
          sidebarCollapsed ? "ml-[76px]" : "ml-64",
        )}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          {children}
        </div>
      </main>
      <CommandPalette />
      {recurringDefinitionEditor.launch ? (
        <DefinitionEditorPanel
          key={recurringDefinitionEditor.launch.key}
          definition={recurringDefinitionEditor.launch.definition}
          initialRecords={recurringDefinitionEditor.launch.initialRecords}
          onClose={() => {
            const fragmentNavigation =
              recurringDefinitionEditor.launch?.fragmentNavigation;
            if (fragmentNavigation) {
              const currentLocation = new URL(window.location.href);
              if (
                fragmentNavigation ===
                `${currentHistoryKey()}:${currentLocation.hash}`
              ) {
                void navigate(
                  {
                    pathname: currentLocation.pathname,
                    search: currentLocation.search,
                  },
                  { replace: true },
                );
              } else {
                consumeRecurringDefinitionFragmentNavigation(
                  fragmentNavigation,
                );
              }
            }
            closeRecurringDefinitionEditor();
          }}
          onNotice={(message, tone = "success") => {
            entrySaveNoticeIdRef.current += 1;
            setEntrySaveNotice({
              avoidDetailActions: searchParams.has("transaction"),
              id: entrySaveNoticeIdRef.current,
              message,
              tone,
            });
          }}
          onSaved={() =>
            refreshAfterRecurringDefinitionMutation(
              refreshMountedRecurringDefinitions,
            )
          }
          open={recurringDefinitionEditor.open}
          resolveReturnFocusTo={() =>
            resolveRecurringDefinitionFocusTarget(
              recurringDefinitionEditor.launch?.opener,
            )
          }
        />
      ) : null}
      {templateEditor.launch ? (
        <TemplateEditorModal
          key={templateEditor.launch.key}
          launch={templateEditor.launch}
          loadingLookups={lookups.loading}
          lookups={lookups.snapshot}
          lookupsErrorMessage={lookups.errorMessage}
          open={templateEditor.open}
          onClose={closeTemplateEditor}
          onLookupsRetry={refreshLedgerLookups}
          onSaved={(message, template) => {
            const avoidDetailActions = searchParams.has("transaction");
            upsertTransactionTemplate(template);
            const noticeId = ++entrySaveNoticeIdRef.current;
            setEntrySaveNotice({
              avoidDetailActions,
              id: noticeId,
              message,
              tone: "success",
            });
            void refreshTransactionTemplates().then((refreshed) => {
              if (!refreshed && entrySaveNoticeIdRef.current === noticeId) {
                entrySaveNoticeIdRef.current += 1;
                setEntrySaveNotice({
                  avoidDetailActions,
                  id: entrySaveNoticeIdRef.current,
                  message: `${message} Template choices could not be refreshed.`,
                  tone: "error",
                });
              }
            });
          }}
        />
      ) : null}
      <EntryModal
        errorMessage={entryModal.errorMessage}
        globalNotice={logoutError}
        initialTab={entryModal.initialTab}
        initialTemplateId={entryModal.initialTemplateId}
        launch={entryModal.launch}
        loading={entryModal.loading}
        loadingCreate={entryModal.requestedEntry?.startsWith("duplicate:")}
        lookups={lookups.snapshot}
        lookupsErrorMessage={lookups.errorMessage}
        notice={entrySaveNotice}
        open={entryModal.open}
        recentTransactions={entryModal.recentTransactions}
        requestCloseRef={entryCloseRequestRef}
        returnFocusTo={entryModal.launch?.opener}
        onClose={closeEntryModal}
        onGlobalNoticeDismiss={() => {
          setLogoutError(undefined);
        }}
        onLookupsRetry={refreshLedgerLookups}
        onNoticeDismiss={() => {
          setEntrySaveNotice(undefined);
        }}
        onSaved={async (transaction, context) => {
          const editedRow =
            context.operation === "updated"
              ? document.querySelector<HTMLElement>(
                  `[data-transaction-row='true'][data-transaction-id="${transaction.transaction_id}"]`,
                )
              : null;
          const restoreRowFocus = editedRow
            ? transactionRowFallback(editedRow, transaction.transaction_id)
            : undefined;
          await refreshViewsAfterEntrySave(
            transaction,
            context.previousTransactions,
            {
              onPageRefresh: (rowRemainsVisible) => {
                window.requestAnimationFrame(() => {
                  if (
                    !rowRemainsVisible ||
                    !editedRow?.isConnected ||
                    !isTransactionRowWithinViewport(editedRow)
                  ) {
                    restoreRowFocus?.();
                  }
                });
              },
              pageRefreshMode:
                context.operation === "updated" &&
                location.pathname === "/transactions" &&
                editedRow
                  ? "background"
                  : "blocking",
            },
          );
          let publishedTransaction =
            context.operation === "refreshed" ? undefined : transaction;
          if (context.operation === "refreshed") {
            const latest = await fetchTransactionById(
              transaction.transaction_id,
            );
            publishedTransaction = latest.data;
            if (latest.data) {
              invalidateAccountRegistersForTransaction(latest.data, [
                transaction,
              ]);
            }
          }
          if (publishedTransaction) {
            window.dispatchEvent(
              new CustomEvent(transactionEntrySavedEvent, {
                detail: publishedTransaction,
              }),
            );
          }
          if (context.operation === "refreshed") {
            return;
          }
          entrySaveNoticeIdRef.current += 1;
          setEntrySaveNotice({
            id: entrySaveNoticeIdRef.current,
            message:
              context.operation === "updated"
                ? "Transaction updated."
                : "Transaction saved.",
            tone: "success",
          });
        }}
      />
      {!entryModal.open && !templateEditor.open ? (
        <Toast
          key={entrySaveNotice?.id ?? "empty"}
          className={
            entrySaveNotice?.tone === "error"
              ? "text-destructive"
              : "text-[var(--color-money-in)]"
          }
          containerClassName={
            entrySaveNotice?.avoidDetailActions
              ? "top-20 bottom-auto"
              : undefined
          }
          message={entrySaveNotice?.message}
          onDismiss={() => {
            setEntrySaveNotice(undefined);
          }}
        />
      ) : null}
      {!entryModal.open && !templateEditor.open ? (
        <Toast
          containerClassName="bottom-16 z-[80]"
          className="text-destructive"
          message={logoutError}
          onDismiss={() => {
            setLogoutError(undefined);
          }}
        />
      ) : null}
    </div>
  );
};

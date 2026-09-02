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
import {
  MobileTableControlsProvider,
  MobileTableControlsTrigger,
} from "@/components/mobile-table-controls";
import {
  MobileTableEditPanelProvider,
  MobileTableEditPanelTrigger,
} from "@/components/mobile-table-edit-panel";
import { Toast } from "@/components/toast";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  const compactToolbar = document.querySelector<HTMLElement>(
    "[data-mobile-app-toolbar]",
  );
  const compactToolbarTop = compactToolbar?.getClientRects().length
    ? compactToolbar.getBoundingClientRect().top
    : window.innerHeight;
  const headerBottom =
    viewport.querySelector("thead")?.getBoundingClientRect().bottom ??
    viewportBounds.top;
  return (
    rowBounds.bottom > Math.max(viewportBounds.top, headerBottom, 0) &&
    rowBounds.top < viewportBounds.bottom &&
    rowBounds.bottom <= compactToolbarTop
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
  onNavigate,
}: {
  readonly collapsed: boolean;
  readonly items: readonly NavItem[];
  readonly onNavigate?: () => void;
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
          onClick={onNavigate}
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
  onOpen = openCommandPalette,
}: {
  readonly collapsed: boolean;
  readonly onOpen?: () => void;
}) => {
  const button = (
    <Button
      type="button"
      variant="outline"
      className={cn("w-full", collapsed && "px-0")}
      aria-label="Command palette"
      onClick={onOpen}
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

const NavigationSections = ({
  collapsed,
  logoutButtonRef,
  logoutPending,
  onLogout,
  onNavigate,
  onOpenCommandPalette,
  primaryNavItems,
  showLogout,
}: {
  readonly collapsed: boolean;
  readonly logoutButtonRef: Ref<HTMLButtonElement>;
  readonly logoutPending: boolean;
  readonly onLogout: () => void;
  readonly onNavigate?: () => void;
  readonly onOpenCommandPalette?: () => void;
  readonly primaryNavItems: readonly NavItem[];
  readonly showLogout: boolean;
}) => (
  <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3">
    <div className="flex flex-col gap-2">
      <CommandPaletteButton
        collapsed={collapsed}
        onOpen={onOpenCommandPalette}
      />
    </div>

    <SidebarNav
      collapsed={collapsed}
      items={primaryNavItems}
      onNavigate={onNavigate}
    />

    <section className="flex flex-col gap-2">
      <p
        className={cn(
          "text-pixel text-muted-foreground px-2 text-xs",
          "text-[var(--frame-muted)]",
          collapsed && "sr-only",
        )}
      >
        Reference
      </p>
      <SidebarNav
        collapsed={collapsed}
        items={referenceNavItems}
        onNavigate={onNavigate}
      />
    </section>

    <BalanceStrip collapsed={collapsed} onNavigate={onNavigate} />

    <div className="mt-auto flex flex-col gap-3">
      <Separator />
      <SidebarNav
        collapsed={collapsed}
        items={utilityNavItems}
        onNavigate={onNavigate}
      />
      {showLogout ? (
        <LogoutButton
          buttonRef={logoutButtonRef}
          collapsed={collapsed}
          pending={logoutPending}
          onLogout={onLogout}
        />
      ) : null}
    </div>
  </div>
);

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
  const desktopLogoutButtonRef = useRef<HTMLButtonElement>(null);
  const desktopNavigationRef = useRef<HTMLElement>(null);
  const mobileLogoutButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationButtonRef = useRef<HTMLButtonElement>(null);
  const lastNavigationFocusSurfaceRef = useRef<"compact" | "roomy" | undefined>(
    undefined,
  );
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
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
    let compactNavigationWasVisible = Boolean(
      mobileNavigationButtonRef.current?.getClientRects().length,
    );
    const trackNavigationFocus = (event: FocusEvent) => {
      const target =
        event.target instanceof HTMLElement ? event.target : undefined;
      if (
        target === mobileNavigationButtonRef.current ||
        target?.closest("[data-mobile-navigation-content]")
      ) {
        lastNavigationFocusSurfaceRef.current = "compact";
        return;
      }
      if (target && desktopNavigationRef.current?.contains(target)) {
        lastNavigationFocusSurfaceRef.current = "roomy";
        return;
      }
      if (target !== document.body) {
        lastNavigationFocusSurfaceRef.current = undefined;
      }
    };
    const visibleRoomyNavigationTarget = () => {
      const currentPageLink =
        desktopNavigationRef.current?.querySelector<HTMLElement>(
          "[aria-current='page']",
        );
      if (currentPageLink?.getClientRects().length) return currentPageLink;
      const commandPaletteButton =
        desktopNavigationRef.current?.querySelector<HTMLElement>(
          "button[aria-label='Command palette']",
        );
      return commandPaletteButton?.getClientRects().length
        ? commandPaletteButton
        : undefined;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        !mobileNavigationOpen ||
        event.key !== "Escape" ||
        event.defaultPrevented
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setMobileNavigationOpen(false);
    };
    const handOffBreakpointFocus = () => {
      const compactNavigationIsVisible = Boolean(
        mobileNavigationButtonRef.current?.getClientRects().length,
      );
      if (compactNavigationIsVisible === compactNavigationWasVisible) return;
      compactNavigationWasVisible = compactNavigationIsVisible;
      const previousSurface = lastNavigationFocusSurfaceRef.current;
      const destinationSurface = compactNavigationIsVisible
        ? "compact"
        : "roomy";
      if (!compactNavigationIsVisible && mobileNavigationOpen) {
        setMobileNavigationOpen(false);
      }
      if (!previousSurface || previousSurface === destinationSurface) return;
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const activeElementIsVisible = Boolean(
        activeElement &&
        activeElement !== document.body &&
        activeElement.getClientRects().length,
      );
      const activeElementWasOnPreviousSurface =
        previousSurface === "compact"
          ? activeElement === mobileNavigationButtonRef.current ||
            Boolean(activeElement?.closest("[data-mobile-navigation-content]"))
          : Boolean(
              activeElement &&
              desktopNavigationRef.current?.contains(activeElement),
            );
      if (activeElementIsVisible && !activeElementWasOnPreviousSurface) return;
      window.requestAnimationFrame(() => {
        const focusTarget = compactNavigationIsVisible
          ? mobileNavigationButtonRef.current
          : visibleRoomyNavigationTarget();
        focusWithoutTooltip(focusTarget, { preventScroll: true });
        lastNavigationFocusSurfaceRef.current = destinationSurface;
      });
    };
    document.addEventListener("focusin", trackNavigationFocus, {
      capture: true,
    });
    window.addEventListener("keydown", closeOnEscape, { capture: true });
    window.addEventListener("resize", handOffBreakpointFocus);
    return () => {
      document.removeEventListener("focusin", trackNavigationFocus, {
        capture: true,
      });
      window.removeEventListener("keydown", closeOnEscape, { capture: true });
      window.removeEventListener("resize", handOffBreakpointFocus);
    };
  }, [mobileNavigationOpen]);

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
      const target = [
        mobileLogoutButtonRef.current,
        desktopLogoutButtonRef.current,
      ].find((button) => button && button.getClientRects().length > 0);
      focusWithoutTooltip(target, { preventScroll: true });
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

  const handleLogout = () => {
    setLogoutPending(true);
    setLogoutError(undefined);
    void logoutAuthentication().then((error) => {
      setLogoutPending(false);
      if (error) {
        setLogoutError(error);
      }
    });
  };

  const openCommandPaletteFromMobileNavigation = () => {
    setMobileNavigationOpen(false);
    window.setTimeout(openCommandPalette);
  };

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
        ref={desktopNavigationRef}
        className={cn(
          "roomy-shell:flex fixed inset-y-0 left-0 z-10 hidden flex-col border-r-2 border-[var(--border-ink)] bg-[var(--frame)] text-[var(--frame-foreground)] shadow-[var(--shadow-pixel)]",
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

        <NavigationSections
          collapsed={sidebarCollapsed}
          logoutButtonRef={desktopLogoutButtonRef}
          logoutPending={logoutPending}
          onLogout={handleLogout}
          primaryNavItems={primaryNavItems}
          showLogout={authentication.phase === "authenticated"}
        />

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
        className={cn(
          "roomy-shell:px-8 roomy-shell:pb-3 min-h-svh bg-[var(--ground)] bg-[linear-gradient(90deg,rgb(237_234_247_/_4%)_1px,transparent_1px),linear-gradient(180deg,rgb(237_234_247_/_4%)_1px,transparent_1px)] bg-[size:16px_16px] px-5 pt-7 pb-[calc(5.5rem+env(safe-area-inset-bottom))] transition-[margin] duration-150 ease-[steps(2)]",
          sidebarCollapsed ? "roomy-shell:ml-[76px]" : "roomy-shell:ml-64",
        )}
      >
        <MobileTableControlsProvider>
          <MobileTableEditPanelProvider>
            <div
              inert={
                location.pathname === "/recurring" &&
                recurringDefinitionEditor.launch !== undefined
              }
              className="mx-auto flex w-full max-w-7xl flex-col gap-6"
            >
              {children}
            </div>
            <div
              className={cn(
                "roomy-shell:hidden fixed inset-x-0 bottom-0 z-40 grid auto-cols-fr grid-flow-col gap-2 border-t-2 border-[var(--border-ink)] bg-[var(--frame)] px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
                (commandPaletteOpen ||
                  entryModal.open ||
                  templateEditor.open) &&
                  "hidden",
              )}
              data-mobile-app-toolbar
            >
              <Popover
                open={mobileNavigationOpen}
                onOpenChange={setMobileNavigationOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    ref={mobileNavigationButtonRef}
                    type="button"
                    variant="outline"
                    className="h-11 min-w-0 justify-center bg-[var(--card)] text-[var(--foreground)] shadow-[var(--shadow-pixel)] data-[state=open]:bg-[var(--color-class-adjustment-bright)] data-[state=open]:shadow-[var(--shadow-pixel)]"
                    aria-label="Navigation"
                    data-entry-modal-restore-target
                  >
                    <Menu aria-hidden="true" />
                    Navigation
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  compactBack={false}
                  side="top"
                  align="start"
                  sideOffset={10}
                  aria-label="Navigation"
                  data-mobile-navigation-content
                  className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden bg-[var(--frame)] p-0 text-[var(--frame-foreground)]"
                >
                  <div className="flex h-14 shrink-0 items-center gap-3 border-b-2 border-[var(--border-ink)] px-3">
                    <Archive
                      className="size-6 shrink-0 text-[var(--color-class-adjustment-bright)]"
                      aria-hidden="true"
                    />
                    <span className="text-pixel text-base leading-none">
                      Mina
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="ml-auto"
                      aria-label="Close navigation"
                      onClick={() => {
                        setMobileNavigationOpen(false);
                      }}
                    >
                      <Close aria-hidden="true" />
                      Close
                    </Button>
                  </div>
                  <NavigationSections
                    collapsed={false}
                    logoutButtonRef={mobileLogoutButtonRef}
                    logoutPending={logoutPending}
                    onLogout={handleLogout}
                    onNavigate={() => {
                      setMobileNavigationOpen(false);
                    }}
                    onOpenCommandPalette={
                      openCommandPaletteFromMobileNavigation
                    }
                    primaryNavItems={primaryNavItems}
                    showLogout={authentication.phase === "authenticated"}
                  />
                </PopoverContent>
              </Popover>
              <MobileTableEditPanelTrigger />
              <MobileTableControlsTrigger />
            </div>
          </MobileTableEditPanelProvider>
        </MobileTableControlsProvider>
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
        initialTemplate={entryModal.initialTemplate}
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
              ? "compact-shell:bottom-auto top-20 bottom-auto"
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
          containerClassName="compact-shell:bottom-[calc(7.75rem+env(safe-area-inset-bottom))] bottom-16 z-[80]"
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

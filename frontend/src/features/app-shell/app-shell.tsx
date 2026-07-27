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
  Menu,
  Plus,
  Search,
  SettingsCog2,
  User,
  Wallet,
} from "pixelarticons/react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, type To, useSearchParams } from "react-router";

import { apiErrorMessage, fetchTransactionById } from "@/api";
import { Toast } from "@/components/toast";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CommandPalette } from "@/features/command-palette";
import { BalanceStrip } from "@/features/featured-balances";
import {
  captureTransactionEntryLaunchContext,
  EntryModal,
  refreshLedgerLookups,
  refreshViewsAfterEntrySave,
  transactionEntrySavedEvent,
  useLedgerLookupsResource,
} from "@/features/ledger";
import { cn } from "@/lib/utils";
import type { TransactionEntryType } from "@/models/ui-state";
import {
  closeTransactionEntryPanel,
  failTransactionEntryRoute,
  getCommandPaletteSnapshot,
  loadTransactionEntryRoute,
  openCommandPalette,
  openTransactionEntryPanel,
  openTransactionEntryRoute,
  resolveTransactionEntryRoute,
  setSidebarCollapsed,
  toggleCommandPalette,
  useLastTransactionsPageSearch,
  usePreferencesView,
  useTransactionEntryPanelView,
} from "@/store";

type PixelIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  readonly disabled?: boolean;
  readonly icon: PixelIcon;
  readonly label: string;
  readonly to: To;
}

const referenceNavItems: readonly NavItem[] = [
  { icon: Folder, label: "Categories", to: "/categories" },
  { icon: Hash, label: "Tags", to: "/tags" },
  { icon: User, label: "Members", to: "/members" },
  { disabled: true, icon: CardText, label: "Templates", to: "/templates" },
];

const utilityNavItems: readonly NavItem[] = [
  { icon: Chart, label: "Status", to: "/status" },
  { icon: SettingsCog2, label: "Settings", to: "/settings" },
];

const modalOverlaySelector =
  "[role='alertdialog'], [role='dialog'][aria-modal='true'], [data-page-help-content], [data-slot='popover-content'], [data-slot='select-content'][data-state='open']";

const isVisibleOverlay = (element: Element): boolean =>
  element instanceof HTMLElement && element.getClientRects().length > 0;

const hasActiveOverlay = (): boolean =>
  Array.from(document.querySelectorAll(modalOverlaySelector)).some(
    isVisibleOverlay,
  );

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

const DisabledNavItem = ({
  collapsed,
  icon: Icon,
  label,
}: Pick<NavItem, "icon" | "label"> & { readonly collapsed: boolean }) => {
  const item = (
    <button
      type="button"
      disabled
      aria-label={label}
      className={cn(
        "font-heading flex h-9 w-full items-center gap-3 border-2 border-transparent px-2 text-sm font-semibold text-[var(--frame-muted)] uppercase opacity-60",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className={cn(collapsed && "sr-only")}>{label}</span>
    </button>
  );

  return collapsed ? (
    <Tooltip label={label} asChild>
      <span className="flex w-full">{item}</span>
    </Tooltip>
  ) : (
    item
  );
};

const SidebarNav = ({
  collapsed,
  items,
}: {
  readonly collapsed: boolean;
  readonly items: readonly NavItem[];
}) => (
  <nav className="flex flex-col gap-1">
    {items.map((item) => {
      if (item.disabled) {
        return (
          <DisabledNavItem
            key={item.label}
            collapsed={collapsed}
            icon={item.icon}
            label={item.label}
          />
        );
      }

      const navLink = (
        <NavLink
          className={navLinkClass({ collapsed })}
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

const NewTransactionButton = ({
  collapsed,
}: {
  readonly collapsed: boolean;
}) => {
  const button = (
    <Button
      type="button"
      data-entry-modal-restore-target
      className={cn("w-full", collapsed && "px-0")}
      aria-label="New transaction"
      onClick={() => {
        openTransactionEntryPanel(
          undefined,
          captureTransactionEntryLaunchContext(),
        );
      }}
    >
      <Plus aria-hidden="true" />
      <span className={cn(collapsed && "sr-only")}>New transaction</span>
    </Button>
  );

  return collapsed ? (
    <Tooltip label="New transaction" className="w-full">
      {button}
    </Tooltip>
  ) : (
    button
  );
};

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

export const AppShell = ({ children }: AppShellProps) => {
  const {
    preferences: { sidebarCollapsed },
  } = usePreferencesView();
  const entryModal = useTransactionEntryPanelView();
  const [entrySaveNotice, setEntrySaveNotice] = useState<
    { readonly id: number; readonly message: string } | undefined
  >();
  const entrySaveNoticeIdRef = useRef(0);
  const lookups = useLedgerLookupsResource(entryModal.open);
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
  const primaryNavItems: readonly NavItem[] = [
    { icon: Home, label: "Overview", to: "/overview" },
    {
      icon: ListBox,
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
    window.queueMicrotask(() => {
      openingEntryUrlRef.current = false;
    });
  }, [entryModal.open, entryModal.requestedEntry, entryParam, setSearchParams]);

  useEffect(() => {
    const previousEntryParam = previousEntryParamRef.current;
    previousEntryParamRef.current = entryParam;
    if (openingEntryUrlRef.current) {
      return;
    }
    if (entryParam && entryParam !== previousEntryParam) {
      entryDetailParamRef.current = searchParams.get("transaction");
    }
    if (!entryParam) {
      if (historyEntryClosePendingRef.current) {
        return;
      }
      if (openingEntryUrlRef.current) {
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
      captureTransactionEntryLaunchContext(),
    );
    void fetchTransactionById(transactionId).then((result) => {
      if (result.data && !result.data.tombstoned_at) {
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
          `Transaction #${transactionId} could not be found.`,
        ),
      );
    });
  }, [
    entryModal.open,
    entryModal.requestedEntry,
    entryParam,
    searchParams,
    setSearchParams,
  ]);

  const closeEntryModal = useCallback(() => {
    closingEntryRef.current = true;
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
        document.querySelector("[data-inline-editor-id]") ||
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
            <NewTransactionButton collapsed={sidebarCollapsed} />
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
      <EntryModal
        errorMessage={entryModal.errorMessage}
        initialTab={entryModal.initialTab}
        initialTemplateFqn={entryModal.initialTemplateFqn}
        launch={entryModal.launch}
        loading={entryModal.loading}
        loadingCreate={entryModal.requestedEntry?.startsWith("duplicate:")}
        lookups={lookups.snapshot}
        lookupsErrorMessage={lookups.errorMessage}
        notice={entrySaveNotice}
        open={entryModal.open}
        recentTransactions={entryModal.recentTransactions}
        requestCloseRef={entryCloseRequestRef}
        onClose={closeEntryModal}
        onLookupsRetry={refreshLedgerLookups}
        onNoticeDismiss={() => {
          setEntrySaveNotice(undefined);
        }}
        onSaved={async (transaction, context) => {
          await refreshViewsAfterEntrySave(
            transaction,
            context.previousTransaction,
          );
          window.dispatchEvent(
            new CustomEvent(transactionEntrySavedEvent, {
              detail: transaction,
            }),
          );
          entrySaveNoticeIdRef.current += 1;
          setEntrySaveNotice({
            id: entrySaveNoticeIdRef.current,
            message:
              context.operation === "updated"
                ? "Transaction updated."
                : "Transaction saved.",
          });
        }}
      />
      {!entryModal.open ? (
        <Toast
          key={entrySaveNotice?.id ?? "empty"}
          className="text-[var(--color-money-in)]"
          message={entrySaveNotice?.message}
          onDismiss={() => {
            setEntrySaveNotice(undefined);
          }}
        />
      ) : null}
    </div>
  );
};

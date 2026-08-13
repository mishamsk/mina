import {
  Cancel,
  ChevronDown,
  Circle,
  Eye,
  EyeOff,
  Search,
} from "pixelarticons/react";
import { useCallback } from "react";
import type { SetURLSearchParams } from "react-router";

import type { Account, AccountType } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AccountsPageSnapshot } from "@/store";

import type { AccountTypeFilter } from "./accounts-tree";
import { AccountsTree } from "./accounts-tree";
import { refreshAccountsPage } from "./use-accounts-resource";

const accountTypes: readonly AccountType[] = [
  "owned",
  "party",
  "flow",
  "system",
];

const accountTypeLabels: Readonly<Record<AccountType, string>> = {
  flow: "Flow",
  owned: "Owned",
  party: "Party",
  system: "System",
};

export const readAccountsSearchState = (
  searchParams: URLSearchParams,
): {
  readonly includeHidden: boolean;
  readonly hideZeroBalances: boolean;
  readonly search: string;
  readonly typeFilter: AccountTypeFilter;
} => {
  const selectedTypes = new Set(searchParams.getAll("type"));
  return {
    hideZeroBalances: searchParams.get("nonzero") === "true",
    includeHidden: searchParams.get("hidden") === "true",
    search: searchParams.get("q") ?? "",
    typeFilter: accountTypes.filter((type) => selectedTypes.has(type)),
  };
};

interface AccountsToolbarProps {
  readonly hideZeroBalances: boolean;
  readonly includeHidden: boolean;
  readonly search: string;
  readonly setSearchParams: SetURLSearchParams;
  readonly typeFilter: AccountTypeFilter;
}

const updateAccountsSearchParam = (
  current: URLSearchParams,
  key: "hidden" | "nonzero" | "q",
  value: string | undefined,
): URLSearchParams => {
  const next = new URLSearchParams(current);
  if (value) {
    next.set(key, value);
  } else {
    next.delete(key);
  }
  return next;
};

export const AccountsToolbar = ({
  hideZeroBalances,
  includeHidden,
  search,
  setSearchParams,
  typeFilter,
}: AccountsToolbarProps) => {
  const setSearch = useCallback(
    (nextSearch: string) => {
      setSearchParams((current) =>
        updateAccountsSearchParam(current, "q", nextSearch.trim() || undefined),
      );
    },
    [setSearchParams],
  );

  const toggleTypeFilter = useCallback(
    (type: AccountType) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        const selectedTypes = new Set(current.getAll("type"));
        if (selectedTypes.has(type)) {
          selectedTypes.delete(type);
        } else {
          selectedTypes.add(type);
        }
        next.delete("type");
        for (const accountType of accountTypes) {
          if (selectedTypes.has(accountType)) {
            next.append("type", accountType);
          }
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const setHideZeroBalances = (nextHideZeroBalances: boolean) => {
    setSearchParams((current) =>
      updateAccountsSearchParam(
        current,
        "nonzero",
        nextHideZeroBalances ? "true" : undefined,
      ),
    );
  };

  const typeFilterLabel =
    typeFilter.length === 0
      ? "All types"
      : typeFilter.map((type) => accountTypeLabels[type]).join(", ");

  const setIncludeHidden = useCallback(
    (nextIncludeHidden: boolean) => {
      setSearchParams((current) =>
        updateAccountsSearchParam(
          current,
          "hidden",
          nextIncludeHidden ? "true" : undefined,
        ),
      );
    },
    [setSearchParams],
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-[16rem] flex-col gap-1">
        <label
          htmlFor="accounts-search"
          className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
        >
          Search
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2"
          />
          <input
            id="accounts-search"
            type="search"
            className="bg-card text-foreground placeholder:text-muted-foreground h-9 w-full border-2 border-[var(--border-ink)] px-8 font-mono text-sm shadow-[var(--shadow-pixel)]"
            placeholder="Full account path"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="accounts-type"
          className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
        >
          Type
        </label>
        <Popover modal>
          <Tooltip label={typeFilterLabel} asChild>
            <PopoverTrigger asChild>
              <Button
                id="accounts-type"
                type="button"
                variant="outline"
                size="lg"
                aria-label={`Type: ${typeFilterLabel}`}
                className="min-w-32 justify-between"
              >
                <span className="max-w-48 truncate">{typeFilterLabel}</span>
                <ChevronDown aria-hidden="true" data-icon="inline-end" />
              </Button>
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent
            aria-label="Account types"
            className="w-48 space-y-1 p-2"
          >
            {accountTypes.map((type) => {
              const selected = typeFilter.includes(type);
              return (
                <label
                  key={type}
                  className="flex min-h-8 cursor-pointer items-center gap-3 px-2 font-mono text-sm hover:bg-[var(--color-interactive-bright)]"
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => {
                      toggleTypeFilter(type);
                    }}
                  />
                  {accountTypeLabels[type]}
                </label>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>

      <Tooltip
        label={
          hideZeroBalances
            ? "Show zero-standing owned and party accounts"
            : "Hide zero-standing owned and party accounts"
        }
        asChild
      >
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Hide zero-standing accounts"
          aria-pressed={hideZeroBalances}
          className="aria-pressed:bg-[var(--table-header)]"
          onClick={() => {
            setHideZeroBalances(!hideZeroBalances);
          }}
        >
          {hideZeroBalances ? (
            <Cancel aria-hidden="true" data-icon="zero-standing-hidden" />
          ) : (
            <Circle aria-hidden="true" data-icon="zero-standing-shown" />
          )}
        </Button>
      </Tooltip>

      <Tooltip
        label={
          includeHidden ? "Hide hidden accounts" : "Include hidden accounts"
        }
        asChild
      >
        <Button
          type="button"
          variant="outline"
          size="lg"
          aria-label="Include hidden"
          aria-pressed={includeHidden}
          className="aria-pressed:bg-[var(--table-header)]"
          onClick={() => {
            setIncludeHidden(!includeHidden);
          }}
        >
          {includeHidden ? (
            <EyeOff aria-hidden="true" data-icon="inline-start" />
          ) : (
            <Eye aria-hidden="true" data-icon="inline-start" />
          )}
          Include hidden
        </Button>
      </Tooltip>
    </div>
  );
};

interface AccountsPageContentProps {
  readonly accountsPage: {
    readonly errorMessage: string | undefined;
    readonly loading: boolean;
    readonly snapshot: AccountsPageSnapshot | undefined;
  };
  readonly hideZeroBalances: boolean;
  readonly includeHidden: boolean;
  readonly onCreateAccount: (opener: HTMLElement) => void;
  readonly onEditAccount: (account: Account, opener: HTMLElement) => void;
  readonly onNotice?: (message: string) => void;
  readonly onRestructurePath: (fqn: string, opener: HTMLElement) => void;
  readonly search: string;
  readonly typeFilter: AccountTypeFilter;
}

export const AccountsPageContent = ({
  accountsPage,
  hideZeroBalances,
  includeHidden,
  onCreateAccount,
  onEditAccount,
  onNotice,
  onRestructurePath,
  search,
  typeFilter,
}: AccountsPageContentProps) => {
  return (
    <AccountsTree
      accounts={accountsPage.snapshot?.accounts}
      balances={accountsPage.snapshot?.balances}
      errorMessage={
        accountsPage.snapshot ? undefined : accountsPage.errorMessage
      }
      includeHidden={includeHidden}
      hideZeroBalances={hideZeroBalances}
      loading={accountsPage.loading}
      groups={accountsPage.snapshot?.groups}
      onCreateAccount={onCreateAccount}
      onEditAccount={onEditAccount}
      onNotice={onNotice}
      onRestructurePath={onRestructurePath}
      onRetry={() => {
        void refreshAccountsPage();
      }}
      search={search}
      typeFilter={typeFilter}
    />
  );
};

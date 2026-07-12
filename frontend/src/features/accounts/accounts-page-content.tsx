import { Eye, EyeOff, Search } from "pixelarticons/react";
import { useCallback } from "react";
import type { SetURLSearchParams } from "react-router";

import type { Account, AccountType } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AccountsPageSnapshot } from "@/store";

import type { AccountTypeFilter } from "./accounts-tree";
import { AccountsTree } from "./accounts-tree";
import { refreshAccountsPage } from "./use-accounts-resource";

const accountTypes: readonly AccountType[] = ["balance", "flow", "system"];

export const readAccountsSearchState = (
  searchParams: URLSearchParams,
): {
  readonly includeHidden: boolean;
  readonly search: string;
  readonly typeFilter: AccountTypeFilter;
} => {
  const type = searchParams.get("type");
  return {
    includeHidden: searchParams.get("hidden") === "true",
    search: searchParams.get("q") ?? "",
    typeFilter: accountTypes.includes(type as AccountType)
      ? (type as AccountType)
      : "all",
  };
};

interface AccountsToolbarProps {
  readonly includeHidden: boolean;
  readonly search: string;
  readonly setSearchParams: SetURLSearchParams;
  readonly typeFilter: AccountTypeFilter;
}

const updateAccountsSearchParam = (
  current: URLSearchParams,
  key: "hidden" | "q" | "type",
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

  const setTypeFilter = useCallback(
    (nextType: AccountTypeFilter) => {
      setSearchParams((current) =>
        updateAccountsSearchParam(
          current,
          "type",
          nextType === "all" ? undefined : nextType,
        ),
      );
    },
    [setSearchParams],
  );

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
        <Select
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value as AccountTypeFilter);
          }}
        >
          <SelectTrigger id="accounts-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="balance">Balance</SelectItem>
            <SelectItem value="flow">Flow</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>

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

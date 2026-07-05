import { Plus } from "pixelarticons/react";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import type { Account } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  AccountsPageContent,
  AccountsSidePanel,
  AccountsToolbar,
  readAccountsSearchState,
  useAccountsResource,
} from "@/features/accounts";
import { PageHeader } from "@/features/app-shell";

interface Notice {
  readonly id: number;
  readonly message: string;
}

export const AccountsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const accountsPage = useAccountsResource();
  const [panelMode, setPanelMode] = useState<"create" | "edit" | undefined>();
  const [selectedAccountId, setSelectedAccountId] = useState<
    number | undefined
  >();
  const [notice, setNotice] = useState<Notice | undefined>();
  const createAccountButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelOpenerRef = useRef<HTMLElement | null>(null);
  const { includeHidden, search, typeFilter } =
    readAccountsSearchState(searchParams);
  const selectedAccount = accountsPage.snapshot?.accounts.find(
    (account) => account.account_id === selectedAccountId,
  );
  const currencies = useMemo(
    () => [
      ...new Set([
        ...(accountsPage.snapshot?.accounts.flatMap((account) =>
          account.currency ? [account.currency] : [],
        ) ?? []),
        ...(accountsPage.snapshot?.balances.map(
          (balance) => balance.currency,
        ) ?? []),
        "USD",
      ]),
    ],
    [accountsPage.snapshot],
  );

  const restorePanelOpenerFocus = () => {
    const opener = panelOpenerRef.current;
    panelOpenerRef.current = null;
    const target = opener?.isConnected
      ? opener
      : createAccountButtonRef.current;
    if (target) {
      window.requestAnimationFrame(() => {
        target.focus({ preventScroll: true });
      });
    }
  };

  const openCreatePanel = (opener: HTMLElement) => {
    panelOpenerRef.current = opener;
    setSelectedAccountId(undefined);
    setPanelMode("create");
  };

  const openEditPanel = (account: Account, opener: HTMLElement) => {
    panelOpenerRef.current = opener;
    setSelectedAccountId(account.account_id);
    setPanelMode("edit");
  };

  const closePanel = () => {
    setPanelMode(undefined);
    setSelectedAccountId(undefined);
    restorePanelOpenerFocus();
  };

  const showNotice = (message: string) => {
    setNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
    }));
  };

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="accounts-title"
    >
      <PageHeader
        title="Accounts"
        titleId="accounts-title"
        eyebrow="Chart of accounts"
        help={
          <PageHelp label="Accounts help">
            Hierarchical account paths, types, currencies, balances, and hidden
            state.
          </PageHelp>
        }
        actions={
          <Button
            ref={createAccountButtonRef}
            type="button"
            onClick={(event) => {
              openCreatePanel(event.currentTarget);
            }}
          >
            <Plus aria-hidden="true" />
            New account
          </Button>
        }
        toolbar={
          <AccountsToolbar
            includeHidden={includeHidden}
            search={search}
            setSearchParams={setSearchParams}
            typeFilter={typeFilter}
          />
        }
      />

      <div className="min-h-0 flex-1">
        <AccountsPageContent
          accountsPage={accountsPage}
          includeHidden={includeHidden}
          onCreateAccount={openCreatePanel}
          onEditAccount={openEditPanel}
          search={search}
          typeFilter={typeFilter}
        />
      </div>
      <Toast
        key={notice?.id ?? "empty"}
        className="text-[var(--color-money-in)]"
        containerClassName="z-[70]"
        durationMs={toastDurationMs}
        message={notice?.message}
        onDismiss={() => {
          setNotice(undefined);
        }}
      />
      <AccountsSidePanel
        account={selectedAccount}
        currencies={currencies}
        mode={panelMode ?? "create"}
        open={Boolean(panelMode)}
        onClose={closePanel}
        onNotice={showNotice}
      />
    </section>
  );
};

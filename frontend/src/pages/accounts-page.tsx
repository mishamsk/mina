import { Plus } from "pixelarticons/react";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import {
  type Account,
  apiErrorMessage,
  restructureLedgerAccounts,
} from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  AccountsPageContent,
  AccountsSidePanel,
  AccountsToolbar,
  readAccountsSearchState,
  refreshAccountsAfterMutation,
  useAccountsResource,
} from "@/features/accounts";
import { PageHeader } from "@/features/app-shell";
import {
  RestructureDialog,
  type RestructureSubmitInput,
} from "@/features/hierarchy";

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
  const [restructurePath, setRestructurePath] = useState<string | undefined>();
  const [restructureError, setRestructureError] = useState<
    string | undefined
  >();
  const [notice, setNotice] = useState<Notice | undefined>();
  const createAccountButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelOpenerRef = useRef<HTMLElement | null>(null);
  const restructureOpenerRef = useRef<HTMLElement | null>(null);
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
    setRestructurePath(undefined);
    setRestructureError(undefined);
    restructureOpenerRef.current = null;
    panelOpenerRef.current = opener;
    setSelectedAccountId(undefined);
    setPanelMode("create");
  };

  const openEditPanel = (account: Account, opener: HTMLElement) => {
    setRestructurePath(undefined);
    setRestructureError(undefined);
    restructureOpenerRef.current = null;
    panelOpenerRef.current = opener;
    setSelectedAccountId(account.account_id);
    setPanelMode("edit");
  };

  const closePanel = () => {
    setPanelMode(undefined);
    setSelectedAccountId(undefined);
    restorePanelOpenerFocus();
  };

  const openRestructureDialog = (fqn: string, opener: HTMLElement) => {
    setPanelMode(undefined);
    setSelectedAccountId(undefined);
    panelOpenerRef.current = null;
    restructureOpenerRef.current = opener;
    setRestructureError(undefined);
    setRestructurePath(fqn);
  };

  const restoreRestructureOpenerFocus = () => {
    const opener = restructureOpenerRef.current;
    restructureOpenerRef.current = null;
    if (opener?.isConnected) {
      window.requestAnimationFrame(() => {
        focusWithoutTooltip(opener, { preventScroll: true });
      });
    }
  };

  const closeRestructureDialog = () => {
    setRestructurePath(undefined);
    setRestructureError(undefined);
    restoreRestructureOpenerFocus();
  };

  const submitRestructure = async ({
    fromFqn,
    toFqn,
  }: RestructureSubmitInput) => {
    setRestructureError(undefined);
    const result = await restructureLedgerAccounts({
      from_fqn: fromFqn,
      to_fqn: toFqn,
    });

    if (result.data) {
      closeRestructureDialog();
      showNotice(`Moved ${result.data.moved_count} account(s).`);
      await refreshAccountsAfterMutation({ bulk: true });
      return;
    }

    setRestructureError(
      apiErrorMessage(result.error, "Account path could not be moved."),
    );
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
          onNotice={showNotice}
          onRestructurePath={openRestructureDialog}
          search={search}
          typeFilter={typeFilter}
        />
      </div>
      <Toast
        key={notice?.id ?? "empty"}
        className="text-[var(--color-money-in)]"
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
      {restructurePath ? (
        <RestructureDialog
          key={restructurePath}
          entityLabel="Account path"
          errorMessage={restructureError}
          fromFqn={restructurePath}
          hint="The whole account subtree moves with this path."
          onClearError={() => {
            setRestructureError(undefined);
          }}
          onClose={closeRestructureDialog}
          onSubmit={submitRestructure}
        />
      ) : null}
    </section>
  );
};

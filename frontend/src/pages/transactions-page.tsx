import { Plus } from "pixelarticons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import type { Transaction } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import {
  defaultTransactionPage,
  EntryPanel,
  readTransactionPageFromSearchParams,
  refreshTransactionPageAfterSave,
  TransactionBrowser,
  TransactionDetailPanel,
  transactionOffsetFromPage,
  useTransactionDateJump,
  useTransactionDetail,
  useTransactionsResource,
} from "@/features/ledger";
import { cn } from "@/lib/utils";

interface SaveNotice {
  readonly id: number;
  readonly message: string;
}

export const TransactionsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [entryPanelOpen, setEntryPanelOpen] = useState(false);
  const [entryPanelRevision, setEntryPanelRevision] = useState(0);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | undefined>();
  const { page, pageSize } = readTransactionPageFromSearchParams(searchParams);
  const params = useMemo(
    () => ({
      limit: pageSize,
      offset: transactionOffsetFromPage(page, pageSize),
    }),
    [page, pageSize],
  );
  const {
    cancelDateJump,
    dateJumpLoading,
    dateJumpValue,
    jumpToDate,
    setDateJumpValue,
  } = useTransactionDateJump({
    page,
    pageSize,
    params,
    setSearchParams,
  });
  const { lookups, page: pageResource } = useTransactionsResource(params);
  const displayedSnapshot = pageResource.displayedSnapshot;
  const transactions = displayedSnapshot?.transactions;
  const totalCount = displayedSnapshot?.totalCount;
  const loading =
    pageResource.loading ||
    dateJumpLoading ||
    lookups.loading ||
    (Boolean(transactions) && !lookups.snapshot);
  const errorMessage = pageResource.errorMessage ?? lookups.errorMessage;

  const openEntryPanel = useCallback(() => {
    setEntryPanelRevision((revision) => revision + 1);
    setEntryPanelOpen(true);
    setSaveNotice(undefined);
  }, []);

  const dismissSaveNotice = useCallback(() => {
    setSaveNotice(undefined);
  }, []);

  const showSaveNotice = useCallback((message: string) => {
    setSaveNotice((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
    }));
  }, []);

  const detail = useTransactionDetail({
    lookupsLoaded: Boolean(lookups.snapshot),
    onNotice: showSaveNotice,
    params,
    searchParams,
    setSearchParams,
    transactions,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const targetElement = target instanceof HTMLElement ? target : undefined;
      if (
        detail.selectedTransactionId ||
        event.key.toLowerCase() !== "n" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        targetElement?.matches(
          "input, textarea, select, [contenteditable='true']",
        )
      ) {
        return;
      }

      event.preventDefault();
      openEntryPanel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detail.selectedTransactionId, openEntryPanel]);

  const setPage = useCallback(
    (nextPage: number) => {
      cancelDateJump();
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("page", String(nextPage));
        next.set("pageSize", String(pageSize));
        return next;
      });
    },
    [cancelDateJump, pageSize, setSearchParams],
  );

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="transactions-title"
      data-transaction-detail-restore-target
      tabIndex={-1}
    >
      <PageHeader
        title="Transactions"
        titleId="transactions-title"
        eyebrow="Ledger"
        help={
          <PageHelp label="Transactions help">
            Classified transaction lines with inline journal records.
          </PageHelp>
        }
        actions={
          <Button type="button" onClick={openEntryPanel}>
            <Plus aria-hidden="true" />
            New transaction
          </Button>
        }
        toolbar={
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="transactions-date-jump"
                className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
              >
                Go to day
              </label>
              <input
                id="transactions-date-jump"
                type="date"
                className="bg-card text-foreground h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)] aria-disabled:opacity-70"
                value={dateJumpValue}
                readOnly={dateJumpLoading}
                aria-disabled={dateJumpLoading}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setDateJumpValue(nextValue);
                  void jumpToDate(nextValue);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }
                  event.preventDefault();
                  void jumpToDate(event.currentTarget.value);
                }}
              />
            </div>
          </div>
        }
      />
      <div
        className={cn(
          "grid min-h-0 min-w-0 flex-1 gap-6",
          entryPanelOpen && "lg:grid-cols-[minmax(0,1fr)_360px]",
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <TransactionBrowser
            errorMessage={errorMessage}
            hasNextPage={
              transactions
                ? totalCount === undefined
                  ? transactions.length === pageSize
                  : page * pageSize < totalCount
                : false
            }
            loading={loading}
            lookups={lookups.snapshot}
            onNewTransaction={openEntryPanel}
            onNextPage={() => {
              setPage(page + 1);
            }}
            onOpenTransaction={detail.openTransactionDetail}
            onPageSizeChange={(nextPageSize) => {
              cancelDateJump();
              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.set("page", String(defaultTransactionPage));
                next.set("pageSize", String(nextPageSize));
                return next;
              });
            }}
            onPreviousPage={() => {
              setPage(Math.max(defaultTransactionPage, page - 1));
            }}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            transactions={transactions}
          />
        </div>
        <Toast
          key={saveNotice?.id ?? "empty"}
          className="text-[var(--color-money-in)]"
          durationMs={toastDurationMs}
          message={saveNotice?.message}
          onDismiss={dismissSaveNotice}
        />
        <EntryPanel
          key={entryPanelRevision}
          lookups={lookups.snapshot}
          open={entryPanelOpen}
          onClose={() => {
            setEntryPanelOpen(false);
          }}
          onSaved={async (transaction: Transaction) => {
            const savedOnCurrentPage = await refreshTransactionPageAfterSave(
              params,
              transaction.transaction_id,
            );
            showSaveNotice(
              savedOnCurrentPage
                ? "Transaction saved."
                : "Transaction saved. It may appear on another page.",
            );
          }}
        />
        {detail.selectedTransactionId ? (
          <TransactionDetailPanel
            errorMessage={detail.errorMessage}
            loading={detail.loading}
            lookups={lookups.snapshot}
            onClose={detail.closeTransactionDetail}
            onDelete={detail.deleteSelectedTransaction}
            onRestoreFocus={detail.restoreDetailFocus}
            transaction={detail.transaction}
          />
        ) : null}
      </div>
    </section>
  );
};

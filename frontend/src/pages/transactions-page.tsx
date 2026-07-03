import { Plus } from "pixelarticons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import type { Transaction } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import {
  EntryPanel,
  refreshTransactionPageAfterSave,
  TransactionBrowser,
  useTransactionsResource,
} from "@/features/ledger";
import { cn } from "@/lib/utils";

const defaultPage = 1;
const defaultPageSize = 10;
const pageSizes = new Set([10, 25, 50]);

const parsePositiveInteger = (
  value: string | null,
  fallback: number,
): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
};

export const TransactionsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [entryPanelOpen, setEntryPanelOpen] = useState(false);
  const [entryPanelRevision, setEntryPanelRevision] = useState(0);
  const [saveNotice, setSaveNotice] = useState<string | undefined>();
  const page = parsePositiveInteger(searchParams.get("page"), defaultPage);
  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    defaultPageSize,
  );
  const pageSize = pageSizes.has(requestedPageSize)
    ? requestedPageSize
    : defaultPageSize;
  const params = useMemo(
    () => ({
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [page, pageSize],
  );
  const { lookups, page: pageResource } = useTransactionsResource(params);
  const displayedSnapshot = pageResource.displayedSnapshot;
  const transactions = displayedSnapshot?.transactions;
  const totalCount = displayedSnapshot?.totalCount;
  const loading =
    pageResource.loading ||
    lookups.loading ||
    (Boolean(transactions) && !lookups.snapshot);
  const errorMessage = pageResource.errorMessage ?? lookups.errorMessage;

  const openEntryPanel = useCallback(() => {
    setEntryPanelRevision((revision) => revision + 1);
    setEntryPanelOpen(true);
    setSaveNotice(undefined);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const targetElement = target instanceof HTMLElement ? target : undefined;
      if (
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
  }, [openEntryPanel]);

  const setPage = (nextPage: number) => {
    setSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
    });
  };

  return (
    <section
      className="flex h-[calc(100svh-1.75rem)] min-h-0 flex-col gap-6"
      aria-labelledby="transactions-title"
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
            onPageSizeChange={(nextPageSize) => {
              setSearchParams({
                page: String(defaultPage),
                pageSize: String(nextPageSize),
              });
            }}
            onPreviousPage={() => {
              setPage(Math.max(defaultPage, page - 1));
            }}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            transactions={transactions}
          />
        </div>
        {saveNotice ? (
          <p
            className="bg-card fixed right-4 bottom-4 z-40 max-w-sm border-2 border-[var(--border-ink)] p-3 text-sm shadow-[var(--shadow-pixel)]"
            role="status"
          >
            {saveNotice}
          </p>
        ) : null}
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
            setSaveNotice(
              savedOnCurrentPage
                ? "Transaction saved."
                : "Transaction saved. It may appear on another page.",
            );
          }}
        />
      </div>
    </section>
  );
};

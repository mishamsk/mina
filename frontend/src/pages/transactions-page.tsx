import { Plus } from "pixelarticons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import type { Transaction } from "@/api";
import {
  deleteTransactionById,
  fetchTransactionById,
  isNetworkFailure,
} from "@/api";
import { PageHelp } from "@/components/page-help";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/features/app-shell";
import {
  EntryPanel,
  refreshTransactionPage,
  refreshTransactionPageAfterSave,
  TransactionBrowser,
  TransactionDetailPanel,
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

const parseOptionalPositiveInteger = (
  value: string | null,
): number | undefined => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
};

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

interface FetchedTransactionDetail {
  readonly errorMessage: string | undefined;
  readonly transaction: Transaction | undefined;
  readonly transactionId: number;
}

export const TransactionsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [entryPanelOpen, setEntryPanelOpen] = useState(false);
  const [entryPanelRevision, setEntryPanelRevision] = useState(0);
  const [saveNotice, setSaveNotice] = useState<string | undefined>();
  const [fetchedDetail, setFetchedDetail] =
    useState<FetchedTransactionDetail>();
  const [suppressedDetailFetchId, setSuppressedDetailFetchId] = useState<
    number | undefined
  >();
  const detailRestoreFocusRef = useRef<HTMLElement | null>(null);
  const page = parsePositiveInteger(searchParams.get("page"), defaultPage);
  const selectedTransactionId = parseOptionalPositiveInteger(
    searchParams.get("transaction"),
  );
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
  const selectedTransactionFromSnapshot = transactions?.find(
    (transaction) => transaction.transaction_id === selectedTransactionId,
  );
  const selectedFetchedDetail =
    fetchedDetail?.transactionId === selectedTransactionId
      ? fetchedDetail
      : undefined;
  const detailTransaction =
    selectedTransactionFromSnapshot ?? selectedFetchedDetail?.transaction;
  const detailErrorMessage = selectedTransactionFromSnapshot
    ? undefined
    : selectedFetchedDetail?.errorMessage;
  const detailNeedsFetch = Boolean(
    selectedTransactionId &&
    selectedTransactionId !== suppressedDetailFetchId &&
    !selectedTransactionFromSnapshot &&
    !selectedFetchedDetail,
  );
  const detailLoading =
    detailNeedsFetch || Boolean(detailTransaction && !lookups.snapshot);
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

  const openTransactionDetail = useCallback(
    (transaction: Transaction) => {
      setSuppressedDetailFetchId(undefined);
      const activeElement = document.activeElement;
      detailRestoreFocusRef.current =
        activeElement instanceof HTMLElement ? activeElement : null;
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("transaction", String(transaction.transaction_id));
        return next;
      });
    },
    [setSearchParams],
  );

  const closeTransactionDetail = useCallback(() => {
    setFetchedDetail(undefined);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("transaction");
      return next;
    });
  }, [setSearchParams]);

  const restoreDetailFocus = useCallback(() => {
    focusWithoutTooltip(detailRestoreFocusRef.current, { preventScroll: true });
  }, []);

  const deleteSelectedTransaction = useCallback(
    async (transaction: Transaction) => {
      const result = await deleteTransactionById(transaction.transaction_id);
      if (result.error) {
        throw new Error(apiErrorMessage(result.error));
      }

      setSuppressedDetailFetchId(transaction.transaction_id);
      closeTransactionDetail();
      setSaveNotice("Transaction deleted.");
      await refreshTransactionPage(params);
    },
    [closeTransactionDetail, params],
  );

  useEffect(() => {
    if (
      !selectedTransactionId ||
      selectedTransactionId === suppressedDetailFetchId ||
      selectedTransactionFromSnapshot ||
      selectedFetchedDetail
    ) {
      return;
    }

    let active = true;

    void fetchTransactionById(selectedTransactionId).then((result) => {
      if (!active) {
        return;
      }

      if (result.data) {
        setFetchedDetail({
          errorMessage: undefined,
          transaction: result.data,
          transactionId: selectedTransactionId,
        });
        return;
      }

      setFetchedDetail({
        errorMessage: apiErrorMessage(result.error),
        transaction: undefined,
        transactionId: selectedTransactionId,
      });
    });

    return () => {
      active = false;
    };
  }, [
    selectedFetchedDetail,
    selectedTransactionFromSnapshot,
    selectedTransactionId,
    suppressedDetailFetchId,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const targetElement = target instanceof HTMLElement ? target : undefined;
      if (
        selectedTransactionId ||
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
  }, [openEntryPanel, selectedTransactionId]);

  const setPage = (nextPage: number) => {
    setSearchParams({
      page: String(nextPage),
      pageSize: String(pageSize),
    });
  };

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
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
            onOpenTransaction={openTransactionDetail}
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
        {selectedTransactionId ? (
          <TransactionDetailPanel
            errorMessage={detailErrorMessage}
            loading={detailLoading}
            lookups={lookups.snapshot}
            onClose={closeTransactionDetail}
            onDelete={deleteSelectedTransaction}
            onRestoreFocus={restoreDetailFocus}
            transaction={detailTransaction}
          />
        ) : null}
      </div>
    </section>
  );
};

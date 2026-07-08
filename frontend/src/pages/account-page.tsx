import { Plus } from "pixelarticons/react";
import { useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import type { JournalRecord } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AccountHeader,
  AccountPeekPanel,
  AccountRegisterTable,
  refreshAccountRegisterPage,
  refreshAccountTransaction,
  useAccountRegisterResource,
} from "@/features/accounts";
import { PageHeader } from "@/features/app-shell";
import { buildLookupMaps, refreshLedgerLookups } from "@/features/ledger";

const pageSizes = [10, 25, 50] as const;
const defaultPageSize = 10;

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const readPage = (searchParams: URLSearchParams): number =>
  parsePositiveInteger(searchParams.get("page") ?? undefined) ?? 1;

const readPageSize = (searchParams: URLSearchParams): number => {
  const parsed =
    parsePositiveInteger(searchParams.get("pageSize") ?? undefined) ??
    defaultPageSize;
  return pageSizes.includes(parsed as (typeof pageSizes)[number])
    ? parsed
    : defaultPageSize;
};

const readSelectedRecordId = (
  searchParams: URLSearchParams,
): number | undefined =>
  parsePositiveInteger(searchParams.get("record") ?? undefined);

const writePageParams = (
  current: URLSearchParams,
  nextValues: { readonly page?: number; readonly pageSize?: number },
): URLSearchParams => {
  const next = new URLSearchParams(current);
  if (nextValues.page) {
    next.set("page", String(nextValues.page));
  }
  if (nextValues.pageSize) {
    next.set("pageSize", String(nextValues.pageSize));
  }
  next.delete("record");
  return next;
};

const AccountHeaderSkeleton = () => (
  <div
    className="bg-card border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
    aria-hidden="true"
  >
    <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
      <div className="space-y-3">
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="h-5 w-52 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[28rem]">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  </div>
);

const AccountPageError = ({ message }: { readonly message: string }) => (
  <div
    className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
    role="alert"
  >
    <p className="text-destructive font-semibold">
      Account could not be loaded.
    </p>
    <details className="text-muted-foreground mt-3 text-sm">
      <summary className="text-foreground cursor-pointer">API error</summary>
      <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">
        {message}
      </pre>
    </details>
  </div>
);

const AccountPageContent = ({ accountId }: { readonly accountId: number }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const restoreRecordFocusRef = useRef<HTMLElement | null>(null);
  const page = readPage(searchParams);
  const pageSize = readPageSize(searchParams);
  const selectedRecordId = readSelectedRecordId(searchParams);
  const params = useMemo(
    () => ({
      accountId,
      includeRunningBalance: true,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [accountId, page, pageSize],
  );
  const resource = useAccountRegisterResource(params);
  const maps = useMemo(
    () => buildLookupMaps(resource.lookups.snapshot),
    [resource.lookups.snapshot],
  );
  const account = resource.header.snapshot?.account;
  const registerSnapshot = resource.register.displayedSnapshot;
  const selectedRecord = registerSnapshot?.records.find(
    (record) => record.record_id === selectedRecordId,
  );
  const selectedTransaction = selectedRecord
    ? resource.transactions.transactions[selectedRecord.transaction_id]
    : undefined;
  const selectedTransactionError = selectedRecord
    ? resource.transactions.errors[selectedRecord.transaction_id]
    : undefined;
  const pageCount =
    registerSnapshot?.totalCount === undefined
      ? 1
      : Math.max(1, Math.ceil(registerSnapshot.totalCount / pageSize));
  const openRecordPeek = useCallback(
    (record: JournalRecord, opener: HTMLElement) => {
      restoreRecordFocusRef.current = opener;
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("record", String(record.record_id));
        return next;
      });
    },
    [setSearchParams],
  );
  const openTransactionsEntityFilter = useCallback(
    (kind: "category" | "member" | "tag", id: number) => {
      const next = new URLSearchParams();
      next.append(kind, String(id));
      void navigate(`/transactions?${next.toString()}`);
    },
    [navigate],
  );
  const closeRecordPeek = useCallback(
    (options?: { readonly restoreFocus?: boolean }) => {
      const recordId = selectedRecordId;
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("record");
        return next;
      });
      if (options?.restoreFocus === false) {
        restoreRecordFocusRef.current = null;
        return;
      }
      window.requestAnimationFrame(() => {
        const fallback = recordId
          ? document.querySelector<HTMLElement>(
              `[data-record-id="${recordId}"]`,
            )
          : null;
        const target = restoreRecordFocusRef.current?.isConnected
          ? restoreRecordFocusRef.current
          : fallback;
        target?.focus({ preventScroll: true });
        restoreRecordFocusRef.current = null;
      });
    },
    [selectedRecordId, setSearchParams],
  );

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="account-title"
    >
      <PageHeader
        title={account?.name ?? "Account"}
        titleId="account-title"
        eyebrow="Register"
        help={
          <PageHelp label="Account help">
            Account registers show the account's records with signed amounts,
            running balances, and the containing transaction one action away.
          </PageHelp>
        }
        actions={
          <Button
            type="button"
            onClick={() => {
              void navigate("/transactions");
            }}
          >
            <Plus aria-hidden="true" />
            New transaction
          </Button>
        }
      />

      {resource.header.loading && !resource.header.snapshot ? (
        <AccountHeaderSkeleton />
      ) : null}
      {resource.header.errorMessage ? (
        <AccountPageError message={resource.header.errorMessage} />
      ) : null}
      {account?.tombstoned_at ? (
        <AccountPageError message="This account has been deleted." />
      ) : null}
      {resource.header.snapshot && !account?.tombstoned_at ? (
        <AccountHeader
          account={resource.header.snapshot.account}
          balances={resource.header.snapshot.balances}
          creditLimitHistory={resource.header.snapshot.creditLimitHistory}
        />
      ) : null}

      <div className="min-h-0 flex-1">
        <AccountRegisterTable
          errorMessage={resource.register.errorMessage}
          loading={resource.register.loading}
          lookupErrorMessage={resource.lookups.errorMessage}
          lookupsLoaded={Boolean(resource.lookups.snapshot)}
          maps={maps}
          onNewTransaction={() => {
            void navigate("/transactions");
          }}
          onNextPage={() => {
            setSearchParams((current) =>
              writePageParams(current, {
                page: Math.min(page + 1, pageCount),
              }),
            );
          }}
          onOpenRecord={openRecordPeek}
          onPageSizeChange={(nextPageSize) => {
            setSearchParams((current) =>
              writePageParams(current, { page: 1, pageSize: nextPageSize }),
            );
          }}
          onPreviousPage={() => {
            setSearchParams((current) =>
              writePageParams(current, { page: Math.max(1, page - 1) }),
            );
          }}
          onRetry={() => {
            void refreshAccountRegisterPage(params);
          }}
          onRetryLookups={() => {
            void refreshLedgerLookups();
          }}
          page={page}
          pageSize={pageSize}
          pageSizeOptions={pageSizes}
          records={registerSnapshot?.records}
          selectedRecordId={selectedRecordId}
          totalCount={registerSnapshot?.totalCount}
          transactionErrorsById={resource.transactions.errors}
          transactionsById={resource.transactions.transactions}
        />
      </div>
      {selectedRecord ? (
        <AccountPeekPanel
          errorMessage={selectedTransactionError}
          loading={!selectedTransaction && !selectedTransactionError}
          maps={maps}
          onClose={closeRecordPeek}
          onFilterCategory={(categoryId) => {
            openTransactionsEntityFilter("category", categoryId);
          }}
          onFilterMember={(memberId) => {
            openTransactionsEntityFilter("member", memberId);
          }}
          onFilterTag={(tagId) => {
            openTransactionsEntityFilter("tag", tagId);
          }}
          onRetry={() => {
            void refreshAccountTransaction(selectedRecord.transaction_id);
          }}
          transaction={selectedTransaction}
        />
      ) : null}
    </section>
  );
};

export const AccountPage = () => {
  const { accountId: rawAccountId } = useParams();
  const accountId = parsePositiveInteger(rawAccountId);

  if (!accountId) {
    return (
      <section className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6">
        <PageHeader title="Account" eyebrow="Register" />
        <AccountPageError message="The account id in the URL is invalid." />
      </section>
    );
  }

  return <AccountPageContent accountId={accountId} />;
};

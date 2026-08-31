import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import {
  getCategory,
  type JournalRecord,
  type Transaction,
  updateLedgerAccount,
} from "@/api";
import { apiErrorMessage } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AccountHeader,
  AccountRegisterTable,
  refreshAccountRegisterPage,
  refreshAccountsAfterMutation,
  useAccountRegisterResource,
  useAccountRegisterTransactionDetail,
} from "@/features/accounts";
import { PageHeader } from "@/features/app-shell";
import {
  AccountDisplayLabel,
  buildLookupMaps,
  captureTransactionEntryLaunchContext,
  defaultTransactionPageSize,
  readLiveSearchParams,
  refreshLedgerLookups,
  TransactionDetailPanel,
  transactionPageSizeOptions,
  useEntityFilterRequestGuard,
  writeTransactionFiltersToSearchParams,
} from "@/features/ledger";
import { withTransactionFilterEntityScope } from "@/models/transaction-filters";
import { openTransactionEntryLaunch } from "@/store";

const pageSizes = transactionPageSizeOptions;
const defaultPageSize = defaultTransactionPageSize;

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

interface ToggleNotice {
  readonly message: string;
  readonly tone: "error" | "success" | "warning";
}

const AccountPageContent = ({ accountId }: { readonly accountId: number }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [toggleNotice, setToggleNotice] = useState<ToggleNotice | undefined>();
  const [favoriteTogglePending, setFavoriteTogglePending] = useState(false);
  const favoriteTogglePendingRef = useRef(false);
  const { beginEntityFilterRequest, completeEntityFilterRequest } =
    useEntityFilterRequestGuard();
  const page = readPage(searchParams);
  const pageSize = readPageSize(searchParams);
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
  const registerDetail = useAccountRegisterTransactionDetail({
    lookupsLoaded: Boolean(
      resource.lookups.snapshot || resource.lookups.errorMessage,
    ),
    searchParams,
    setSearchParams,
    transactions: resource.transactions,
  });
  const maps = useMemo(
    () => buildLookupMaps(resource.lookups.snapshot),
    [resource.lookups.snapshot],
  );
  const account = resource.header.snapshot?.account;
  const toggleAccountFeatured = async () => {
    if (!account || favoriteTogglePendingRef.current) {
      return;
    }
    favoriteTogglePendingRef.current = true;
    setFavoriteTogglePending(true);
    setToggleNotice(undefined);
    try {
      const result = await updateLedgerAccount(account.account_id, {
        is_featured: !account.is_featured,
      });
      if (!result.data) {
        setToggleNotice({
          message: apiErrorMessage(
            result.error,
            "Featured state was not saved.",
          ),
          tone: "error",
        });
        return;
      }
      await refreshAccountsAfterMutation({
        account: result.data,
        preserveAccountHeader: true,
      });
      setToggleNotice({
        message: result.data.is_featured
          ? "Account featured."
          : "Account unfeatured.",
        tone: "success",
      });
    } finally {
      favoriteTogglePendingRef.current = false;
      setFavoriteTogglePending(false);
    }
  };
  const registerSnapshot = resource.register.displayedSnapshot;
  const pageCount =
    registerSnapshot?.totalCount === undefined
      ? 1
      : Math.max(1, Math.ceil(registerSnapshot.totalCount / pageSize));
  const openRecordDetail = (record: JournalRecord, opener: HTMLElement) => {
    registerDetail.detail.openTransactionDetail(record.transaction_id, opener, {
      toggle: false,
    });
  };
  const openTransactionsEntityFilter = useCallback(
    async (categoryId: number) => {
      const controller = beginEntityFilterRequest();
      const response = await getCategory({
        path: { category_id: categoryId },
        signal: controller.signal,
      });
      if (!completeEntityFilterRequest(controller)) {
        return;
      }
      if (!response.data?.fqn) {
        setToggleNotice({
          message: apiErrorMessage(
            response.error,
            "The category could not be loaded for filtering.",
          ),
          tone: "warning",
        });
        return;
      }
      const filters = withTransactionFilterEntityScope(
        { classes: [] },
        "category",
        response.data.fqn,
        false,
      );
      const next = writeTransactionFiltersToSearchParams(
        new URLSearchParams(),
        filters,
        { resetPage: false },
      );
      void navigate(`/transactions?${next.toString()}`);
    },
    [beginEntityFilterRequest, completeEntityFilterRequest, navigate],
  );
  const openEntry = (
    transaction: Transaction,
    type: "duplicate" | "edit" | "split",
  ) => {
    openTransactionEntryLaunch(
      { transaction, type },
      captureTransactionEntryLaunchContext(),
    );
  };
  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="account-title"
    >
      <PageHeader
        title={
          account ? (
            <AccountDisplayLabel
              account={account}
              className="text-2xl font-bold text-[var(--frame-foreground)]"
              focusable={false}
            />
          ) : (
            "Account"
          )
        }
        titleClassName="normal-case!"
        titleId="account-title"
        eyebrow="Register"
        help={
          <PageHelp label="Account help">
            Account registers show the account's records with signed amounts,
            running balances, and the containing transaction one action away.
          </PageHelp>
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
          featuredTogglePending={favoriteTogglePending}
          onToggleFeatured={() => {
            void toggleAccountFeatured();
          }}
        />
      ) : null}

      <div
        className="min-h-0 flex-1"
        data-transaction-detail-restore-target
        tabIndex={-1}
      >
        <AccountRegisterTable
          errorMessage={resource.register.errorMessage}
          loading={resource.register.loading}
          lookupErrorMessage={resource.lookups.errorMessage}
          lookupsLoaded={Boolean(resource.lookups.snapshot)}
          maps={maps}
          onNextPage={() => {
            setSearchParams(
              writePageParams(readLiveSearchParams(), {
                page: Math.min(page + 1, pageCount),
              }),
            );
          }}
          onOpenRecord={openRecordDetail}
          onPageSizeChange={(nextPageSize) => {
            setSearchParams(
              writePageParams(readLiveSearchParams(), {
                page: 1,
                pageSize: nextPageSize,
              }),
            );
          }}
          onPreviousPage={() => {
            setSearchParams(
              writePageParams(readLiveSearchParams(), {
                page: Math.max(1, page - 1),
              }),
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
          selectedTransactionId={registerDetail.detail.selectedTransactionId}
          totalCount={registerSnapshot?.totalCount}
        />
      </div>
      <Toast
        key={
          toggleNotice
            ? `${toggleNotice.tone}:${toggleNotice.message}`
            : "empty"
        }
        className={
          toggleNotice?.tone === "error"
            ? "text-destructive"
            : toggleNotice?.tone === "warning"
              ? "text-[var(--color-class-adjustment-ink)]"
              : "text-[var(--color-money-in)]"
        }
        durationMs={toastDurationMs}
        message={toggleNotice?.message}
        onDismiss={() => {
          setToggleNotice(undefined);
        }}
      />
      <Toast
        key={registerDetail.notice?.id ?? "empty"}
        className="text-[var(--color-money-in)]"
        containerClassName={toggleNotice ? "bottom-16" : undefined}
        durationMs={toastDurationMs}
        message={registerDetail.notice?.message}
        onDismiss={registerDetail.dismissNotice}
      />
      {registerDetail.detail.selectedTransactionId ? (
        <TransactionDetailPanel
          autoFocusOnTransactionChange={
            registerDetail.detail.autoFocusOnTransactionChange
          }
          errorMessage={registerDetail.detail.errorMessage}
          loading={registerDetail.detail.loading}
          lookups={resource.lookups.snapshot}
          onChangeLifecycle={registerDetail.changeTransactionLifecycle}
          onClose={registerDetail.detail.closeTransactionDetail}
          onConfirmOccurrence={registerDetail.confirmRecurringOccurrence}
          onDelete={registerDetail.deleteTransaction}
          onDismissOccurrence={registerDetail.dismissRecurringOccurrence}
          onDuplicate={(transaction) => {
            openEntry(transaction, "duplicate");
          }}
          onEdit={(transaction) => {
            openEntry(transaction, "edit");
          }}
          onFilterCategory={(categoryId) => {
            void openTransactionsEntityFilter(categoryId);
          }}
          onPost={registerDetail.postTransaction}
          onRestoreFocus={registerDetail.detail.restoreDetailFocus}
          onSplit={(transaction) => {
            openEntry(transaction, "split");
          }}
          transaction={registerDetail.detail.transaction}
          transactionId={registerDetail.detail.selectedTransactionId}
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

  return <AccountPageContent key={accountId} accountId={accountId} />;
};

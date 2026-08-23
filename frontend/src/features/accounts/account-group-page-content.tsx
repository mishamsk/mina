import { Reload } from "pixelarticons/react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import {
  type Account,
  type AccountBalance,
  apiErrorMessage,
  getCategory,
  type JournalRecord,
  type Transaction,
} from "@/api";
import { PageHelp } from "@/components/page-help";
import { Toast, toastDurationMs } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/features/app-shell";
import {
  AccountDisplayLabel,
  AmountText,
  ApproximateUsdAmount,
  buildLookupMaps,
  captureTransactionEntryLaunchContext,
  defaultTransactionPageSize,
  FqnPath,
  readLiveSearchParams,
  refreshLedgerLookups,
  sumDecimalStrings,
  TransactionDetailPanel,
  transactionPageSizeOptions,
  useEntityFilterRequestGuard,
  writeTransactionFiltersToSearchParams,
} from "@/features/ledger";
import { withTransactionFilterEntityScope } from "@/models/transaction-filters";
import { openTransactionEntryLaunch } from "@/store";

import { AccountRegisterTable } from "./account-register-table";
import {
  refreshGroupRegisterPage,
  useGroupRegisterResource,
} from "./use-account-register-resource";
import { useAccountRegisterTransactionDetail } from "./use-account-register-transaction-detail";
import {
  refreshAccountsPage,
  useAccountsResource,
} from "./use-accounts-resource";

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

const matchesPrefix = (account: Account, prefix: string): boolean =>
  account.fqn === prefix || account.fqn.startsWith(`${prefix}:`);

const GroupPageError = ({
  action,
  message,
}: {
  readonly action?: () => void;
  readonly message: string;
}) => (
  <div
    className="border-destructive bg-card border-2 p-4 shadow-[var(--shadow-pixel)]"
    role="alert"
  >
    <p className="text-destructive font-semibold">{message}</p>
    {action ? (
      <Button type="button" variant="outline" className="mt-4" onClick={action}>
        <Reload aria-hidden="true" />
        Retry
      </Button>
    ) : null}
  </div>
);

const GroupSubtotalsSkeleton = () => (
  <Card aria-hidden="true">
    <CardHeader className="grid-cols-[1fr_auto]">
      <div className="space-y-2">
        <Skeleton className="h-5 w-64 max-w-full" />
        <Skeleton className="h-4 w-36 max-w-full" />
      </div>
      <Skeleton className="h-7 w-32 justify-self-end" />
    </CardHeader>
    <CardContent>
      <div className="grid gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-9" />
        ))}
      </div>
    </CardContent>
  </Card>
);

const UnconvertedNote = ({ count }: { readonly count: number }) =>
  count > 0 ? (
    <span className="text-muted-foreground text-xs">{count} unconverted</span>
  ) : null;

const GroupSubtotals = ({
  accountType,
  balances,
  balanceAccounts,
  prefix,
}: {
  readonly accountType: "owned" | "party";
  readonly balances: readonly AccountBalance[];
  readonly balanceAccounts: readonly Account[];
  readonly prefix: string;
}) => {
  const balancesByAccountId = useMemo(() => {
    const grouped = new Map<number, AccountBalance[]>();
    for (const balance of balances) {
      grouped.set(balance.account_id, [
        ...(grouped.get(balance.account_id) ?? []),
        balance,
      ]);
    }
    return grouped;
  }, [balances]);

  const rows = balanceAccounts.flatMap((account) =>
    (balancesByAccountId.get(account.account_id) ?? []).map((balance) => ({
      account,
      balance,
    })),
  );
  const subtotalUsd = sumDecimalStrings(
    rows.map((row) => row.balance.current_balance_usd),
  );
  const unconvertedCount = rows.reduce(
    (count, row) => count + row.balance.unconverted_count,
    0,
  );

  return (
    <Card data-testid="account-group-subtotals">
      <CardHeader className="grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <CardTitle className="font-heading text-base font-bold normal-case">
            <FqnPath value={prefix} />
          </CardTitle>
          <p className="text-muted-foreground text-xs">
            {accountType === "owned" ? "Owned funds" : "Party balances"} ·{" "}
            {balanceAccounts.length} account
            {balanceAccounts.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="justify-self-end text-right">
          <ApproximateUsdAmount
            amountUsd={subtotalUsd}
            className="font-semibold"
          />
          <div>
            <UnconvertedNote count={unconvertedCount} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <ul className="divide-y divide-[var(--hairline)]">
            {rows.map((row) => (
              <li
                key={`${row.account.account_id}:${row.balance.currency}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2"
                data-testid="account-group-balance-row"
              >
                <AccountDisplayLabel
                  account={row.account}
                  to={`/accounts/${row.account.account_id}`}
                />
                <AmountText
                  amount={{
                    amount: row.balance.current_balance,
                    currency: row.balance.currency,
                  }}
                  chip
                  className="justify-end"
                  positiveSign={false}
                  tone="neutral"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-body text-muted-foreground text-sm">
            No balance accounts in this group have balances yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const GroupRegister = ({ prefix }: { readonly prefix: string }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [filterNotice, setFilterNotice] = useState<string>();
  const { beginEntityFilterRequest, completeEntityFilterRequest } =
    useEntityFilterRequestGuard();
  const page = readPage(searchParams);
  const pageSize = readPageSize(searchParams);
  const params = useMemo(
    () => ({
      accountFqnPrefix: prefix,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [page, pageSize, prefix],
  );
  const resource = useGroupRegisterResource(params);
  const transactions = useMemo(
    () => Object.values(resource.transactions.transactions),
    [resource.transactions.transactions],
  );
  const registerDetail = useAccountRegisterTransactionDetail({
    lookupsLoaded: Boolean(
      resource.lookups.snapshot || resource.lookups.errorMessage,
    ),
    searchParams,
    setSearchParams,
    transactions,
  });
  const maps = useMemo(
    () => buildLookupMaps(resource.lookups.snapshot),
    [resource.lookups.snapshot],
  );
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
        setFilterNotice(
          apiErrorMessage(
            response.error,
            "The category could not be loaded for filtering.",
          ),
        );
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
          void refreshGroupRegisterPage(params);
        }}
        onRetryLookups={() => {
          void refreshLedgerLookups();
        }}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={pageSizes}
        records={registerSnapshot?.records}
        selectedTransactionId={registerDetail.detail.selectedTransactionId}
        showAccount
        showRunningBalance={false}
        totalCount={registerSnapshot?.totalCount}
        transactionErrorsById={resource.transactions.errors}
        transactionsById={resource.transactions.transactions}
      />
      <Toast
        key={filterNotice ?? "empty-filter-notice"}
        className="text-[var(--color-class-adjustment-ink)]"
        containerClassName={registerDetail.notice ? "bottom-16" : undefined}
        durationMs={toastDurationMs}
        message={filterNotice}
        onDismiss={() => {
          setFilterNotice(undefined);
        }}
      />
      <Toast
        key={registerDetail.notice?.id ?? "empty"}
        className="text-[var(--color-money-in)]"
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
    </div>
  );
};

export const AccountGroupPageContent = ({
  prefix,
}: {
  readonly prefix: string;
}) => {
  const accountsResource = useAccountsResource();
  const matchingAccounts = useMemo(
    () =>
      accountsResource.snapshot?.accounts
        .filter((account) => matchesPrefix(account, prefix))
        .sort((left, right) => left.fqn.localeCompare(right.fqn)) ?? [],
    [accountsResource.snapshot?.accounts, prefix],
  );
  const ownedAccounts = matchingAccounts.filter(
    (account) => account.account_type === "owned",
  );
  const partyAccounts = matchingAccounts.filter(
    (account) => account.account_type === "party",
  );
  const accountIds = new Set(
    matchingAccounts.map((account) => account.account_id),
  );
  const matchingBalances =
    accountsResource.snapshot?.balances.filter((balance) =>
      accountIds.has(balance.account_id),
    ) ?? [];

  return (
    <section
      className="flex h-[calc(100svh-2.5rem)] min-h-0 flex-col gap-6"
      aria-labelledby="account-group-title"
    >
      <PageHeader
        title={
          <FqnPath
            value={prefix}
            ancestorClassName="text-[var(--frame-muted)]"
            className="text-2xl"
            collapseAncestors={false}
            leafClassName={
              prefix.includes(":")
                ? "max-w-[calc(100%-2ch)] shrink-0 text-[var(--frame-foreground)]"
                : "text-[var(--frame-foreground)]"
            }
          />
        }
        titleId="account-group-title"
        titleClassName="normal-case"
        eyebrow="Group register"
        help={
          <PageHelp label="Group help">
            Group registers show records for every account under this FQN
            prefix, including balance and flow accounts, with account subtotals
            above the combined register.
          </PageHelp>
        }
      />

      {accountsResource.loading && !accountsResource.snapshot ? (
        <GroupSubtotalsSkeleton />
      ) : null}
      {accountsResource.errorMessage ? (
        <GroupPageError
          message="Account group data could not be loaded."
          action={() => {
            void refreshAccountsPage();
          }}
        />
      ) : null}
      {accountsResource.snapshot ? (
        <>
          {ownedAccounts.length > 0 ? (
            <GroupSubtotals
              accountType="owned"
              balances={matchingBalances}
              balanceAccounts={ownedAccounts}
              prefix={prefix}
            />
          ) : null}
          {partyAccounts.length > 0 ? (
            <GroupSubtotals
              accountType="party"
              balances={matchingBalances}
              balanceAccounts={partyAccounts}
              prefix={prefix}
            />
          ) : null}
          <GroupRegister prefix={prefix} />
        </>
      ) : null}
    </section>
  );
};

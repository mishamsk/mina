import { Plus, Reload } from "pixelarticons/react";
import { useCallback, useMemo, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import type { Account, AccountBalance, JournalRecord } from "@/api";
import { PageHelp } from "@/components/page-help";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/features/app-shell";
import {
  AmountText,
  ApproximateUsdAmount,
  buildLookupMaps,
  FqnPath,
  refreshLedgerLookups,
  sumDecimalStrings,
} from "@/features/ledger";

import { AccountPeekPanel } from "./account-peek-panel";
import { AccountRegisterTable } from "./account-register-table";
import {
  refreshAccountTransaction,
  refreshGroupRegisterPage,
  useGroupRegisterResource,
} from "./use-account-register-resource";
import {
  refreshAccountsPage,
  useAccountsResource,
} from "./use-accounts-resource";

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

interface CloseRecordPeekOptions {
  readonly restoreFocus?: boolean;
}

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
  balances,
  balanceAccounts,
  prefix,
}: {
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
            {balanceAccounts.length} balance account
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
                <Link
                  to={`/accounts/${row.account.account_id}`}
                  className="focus-visible:outline-ring min-w-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <FqnPath value={row.account.fqn} />
                </Link>
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
  const restoreRecordFocusRef = useRef<HTMLElement | null>(null);
  const page = readPage(searchParams);
  const pageSize = readPageSize(searchParams);
  const selectedRecordId = readSelectedRecordId(searchParams);
  const params = useMemo(
    () => ({
      accountFqnPrefix: prefix,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [page, pageSize, prefix],
  );
  const resource = useGroupRegisterResource(params);
  const maps = useMemo(
    () => buildLookupMaps(resource.lookups.snapshot),
    [resource.lookups.snapshot],
  );
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
    (options?: CloseRecordPeekOptions) => {
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
          void refreshGroupRegisterPage(params);
        }}
        onRetryLookups={() => {
          void refreshLedgerLookups();
        }}
        page={page}
        pageSize={pageSize}
        pageSizeOptions={pageSizes}
        records={registerSnapshot?.records}
        selectedRecordId={selectedRecordId}
        showAccount
        showRunningBalance={false}
        totalCount={registerSnapshot?.totalCount}
        transactionErrorsById={resource.transactions.errors}
        transactionsById={resource.transactions.transactions}
      />
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
    </div>
  );
};

export const AccountGroupPageContent = ({
  prefix,
}: {
  readonly prefix: string;
}) => {
  const navigate = useNavigate();
  const accountsResource = useAccountsResource();
  const matchingAccounts = useMemo(
    () =>
      accountsResource.snapshot?.accounts
        .filter((account) => matchesPrefix(account, prefix))
        .sort((left, right) => left.fqn.localeCompare(right.fqn)) ?? [],
    [accountsResource.snapshot?.accounts, prefix],
  );
  const balanceAccounts = matchingAccounts.filter(
    (account) => account.account_type === "balance",
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
            leafClassName="text-[var(--frame-foreground)]"
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
          <GroupSubtotals
            balances={matchingBalances}
            balanceAccounts={balanceAccounts}
            prefix={prefix}
          />
          <GroupRegister prefix={prefix} />
        </>
      ) : null}
    </section>
  );
};

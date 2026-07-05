import {
  normalizeTransactionFilters,
  type TransactionFilters,
} from "@/models/transaction-filters";

import type {
  CategoryEconomicIntent,
  CreateAccountRequest,
  CreateCreditLimitHistoryRequest,
  CreateIncomeTransactionRequest,
  CreateRefundTransactionRequest,
  CreateSpendTransactionRequest,
  CreateTransferTransactionRequest,
  UpdateAccountRequest,
} from "./generated";
import {
  createAccount as createGeneratedAccount,
  createCreditLimitHistory as createGeneratedCreditLimitHistory,
  createIncomeTransaction,
  createRefundTransaction,
  createSpendTransaction,
  createTransferTransaction,
  deleteAccount as deleteGeneratedAccount,
  deleteCreditLimitHistory as deleteGeneratedCreditLimitHistory,
  deleteTransaction,
  getAccount,
  getTransaction,
  getTransactionMonthTotals,
  listAccountBalances,
  listAccounts,
  listCategories,
  listCreditLimitHistory as listGeneratedCreditLimitHistory,
  listMembers,
  listTags,
  listTransactions,
  searchAccountJournalRecords,
  updateAccount as updateGeneratedAccount,
} from "./generated";

export interface TransactionPageParams {
  readonly anchorDate?: string;
  readonly filters?: Partial<TransactionFilters>;
  readonly limit: number;
  readonly offset: number;
}

export interface AccountRecordsPageParams {
  readonly includeRunningBalance: boolean;
  readonly limit: number;
  readonly offset: number;
}

const lookupLimit = 500;

const dateTimeBound = (date: string, boundary: "end" | "start"): string => {
  const [year = "0", month = "1", day = "1"] = date.split("-");
  const localDate =
    boundary === "start"
      ? new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0)
      : new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
  return localDate.toISOString();
};

const transactionFilterQuery = (
  filters: Partial<TransactionFilters> | undefined,
) => {
  const normalized = normalizeTransactionFilters(filters);
  return {
    ...(normalized.accountIds.length > 0
      ? { account_id: [...normalized.accountIds] }
      : {}),
    ...(normalized.amountMax ? { amount_max: normalized.amountMax } : {}),
    ...(normalized.amountMin ? { amount_min: normalized.amountMin } : {}),
    ...(normalized.amountUsdMax
      ? { amount_usd_max: normalized.amountUsdMax }
      : {}),
    ...(normalized.amountUsdMin
      ? { amount_usd_min: normalized.amountUsdMin }
      : {}),
    ...(normalized.categoryIds.length > 0
      ? { category_id: [...normalized.categoryIds] }
      : {}),
    ...(normalized.classes.length > 0
      ? { transaction_class: [...normalized.classes] }
      : {}),
    ...(normalized.initiatedFrom
      ? { initiated_date_from: normalized.initiatedFrom }
      : {}),
    ...(normalized.initiatedTo
      ? { initiated_date_to: normalized.initiatedTo }
      : {}),
    ...(normalized.memberIds.length > 0
      ? { member_id: [...normalized.memberIds] }
      : {}),
    ...(normalized.pendingFrom
      ? { pending_date_from: dateTimeBound(normalized.pendingFrom, "start") }
      : {}),
    ...(normalized.pendingTo
      ? { pending_date_to: dateTimeBound(normalized.pendingTo, "end") }
      : {}),
    ...(normalized.postedFrom
      ? { posted_date_from: dateTimeBound(normalized.postedFrom, "start") }
      : {}),
    ...(normalized.postedTo
      ? { posted_date_to: dateTimeBound(normalized.postedTo, "end") }
      : {}),
    ...(normalized.search ? { search: normalized.search } : {}),
    ...(normalized.statuses.length > 0
      ? { posting_status: [...normalized.statuses] }
      : {}),
    ...(normalized.tagIds.length > 0 ? { tag_id: [...normalized.tagIds] } : {}),
  };
};

export const fetchTransactionPage = (params: TransactionPageParams) =>
  listTransactions({
    query: {
      limit: params.limit,
      offset: params.offset,
      anchor_date: params.anchorDate,
      ...transactionFilterQuery(params.filters),
      // When sorting becomes user-facing, add sort and sort_dir to the URL state and snapshot key.
      sort: "initiated_date",
      sort_dir: "desc",
    },
  });

export const fetchTransactionById = (transactionId: number) =>
  getTransaction({
    path: {
      transaction_id: transactionId,
    },
  });

export const fetchAccountRecordsPage = (
  accountId: number,
  params: AccountRecordsPageParams,
) =>
  searchAccountJournalRecords({
    path: {
      account_id: accountId,
    },
    query: {
      include_running_balance: params.includeRunningBalance,
      limit: params.limit,
      offset: params.offset,
    },
  });

export const fetchAccountHeader = async (accountId: number) => {
  const account = await getAccount({
    path: {
      account_id: accountId,
    },
    query: {
      include_tombstoned: true,
    },
  });
  const [balances, creditLimitHistory] = await Promise.all([
    listAccountBalances({
      query: {
        account_ids: [accountId],
        include_hidden: true,
      },
    }),
    account.data?.tombstoned_at
      ? Promise.resolve({
          data: {
            credit_limit_history: [],
            total_count: 0,
          },
          error: undefined,
        })
      : fetchCreditLimitHistory(accountId),
  ]);

  return { account, balances, creditLimitHistory };
};

export const deleteTransactionById = (transactionId: number) =>
  deleteTransaction({
    path: {
      transaction_id: transactionId,
    },
  });

export const fetchLedgerLookups = async () => {
  const [accounts, categories, tags, members] = await Promise.all([
    listAccounts({
      query: {
        include_hidden: true,
        include_tombstoned: true,
        limit: lookupLimit,
        offset: 0,
        sort: "fqn",
        sort_dir: "asc",
      },
    }),
    listCategories({
      query: {
        include_hidden: true,
        include_tombstoned: true,
        limit: lookupLimit,
        offset: 0,
        sort: "fqn",
        sort_dir: "asc",
      },
    }),
    listTags({
      query: {
        include_hidden: true,
        include_tombstoned: true,
        limit: lookupLimit,
        offset: 0,
        sort: "fqn",
        sort_dir: "asc",
      },
    }),
    listMembers({
      query: {
        include_tombstoned: true,
        limit: lookupLimit,
        offset: 0,
        sort: "name",
        sort_dir: "asc",
      },
    }),
  ]);

  return { accounts, categories, members, tags };
};

export const fetchFeaturedAccountBalances = async () => {
  const accounts = await listAccounts({
    query: {
      account_type: "balance",
      is_featured: true,
      limit: lookupLimit,
      offset: 0,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

  if (!accounts.data || accounts.data.accounts.length === 0) {
    return { accounts, balances: undefined };
  }

  const balances = await listAccountBalances({
    query: {
      account_ids: accounts.data.accounts.map((account) => account.account_id),
    },
  });

  return { accounts, balances };
};

export const fetchAccountsPage = async () => {
  const [accounts, balances] = await Promise.all([
    listAccounts({
      query: {
        include_hidden: true,
        limit: lookupLimit,
        offset: 0,
        sort: "fqn",
        sort_dir: "asc",
      },
    }),
    listAccountBalances({
      query: {
        include_hidden: true,
      },
    }),
  ]);

  return { accounts, balances };
};

export const fetchOverviewAccountBalances = () => listAccountBalances();

export const fetchOverviewAccounts = () =>
  listAccounts({
    query: {
      account_type: "balance",
      limit: lookupLimit,
      offset: 0,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

export const fetchAccountsByIds = (accountIds: readonly number[]) =>
  Promise.all(
    [...new Set(accountIds)].map((accountId) =>
      getAccount({
        path: {
          account_id: accountId,
        },
        query: {
          include_tombstoned: true,
        },
      }),
    ),
  );

export const fetchTransactionMonthTotalsByMonth = (month: string) =>
  getTransactionMonthTotals({
    query: {
      month,
    },
  });

export const fetchCategoryPickerCategories = (
  economicIntents: readonly CategoryEconomicIntent[],
) =>
  listCategories({
    query: {
      economic_intent: [...new Set(economicIntents)].sort(),
      limit: lookupLimit,
      offset: 0,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

export const createLedgerAccount = (body: CreateAccountRequest) =>
  createGeneratedAccount({ body });

export const updateLedgerAccount = (
  accountId: number,
  body: UpdateAccountRequest,
) =>
  updateGeneratedAccount({
    body,
    path: {
      account_id: accountId,
    },
  });

export const deleteLedgerAccountById = (accountId: number) =>
  deleteGeneratedAccount({
    path: {
      account_id: accountId,
    },
  });

export const fetchCreditLimitHistory = (accountId: number) =>
  listGeneratedCreditLimitHistory({
    path: {
      account_id: accountId,
    },
    query: {
      limit: lookupLimit,
      offset: 0,
      sort: "effective_date",
      sort_dir: "desc",
    },
  });

export const createLedgerCreditLimitHistory = (
  accountId: number,
  body: CreateCreditLimitHistoryRequest,
) =>
  createGeneratedCreditLimitHistory({
    body,
    path: {
      account_id: accountId,
    },
  });

export const deleteLedgerCreditLimitHistoryById = (
  creditLimitHistoryId: number,
) =>
  deleteGeneratedCreditLimitHistory({
    path: {
      credit_limit_history_id: creditLimitHistoryId,
    },
  });

export const createSpend = (body: CreateSpendTransactionRequest) =>
  createSpendTransaction({ body });

export const createIncome = (body: CreateIncomeTransactionRequest) =>
  createIncomeTransaction({ body });

export const createRefund = (body: CreateRefundTransactionRequest) =>
  createRefundTransaction({ body });

export const createTransfer = (body: CreateTransferTransactionRequest) =>
  createTransferTransaction({ body });

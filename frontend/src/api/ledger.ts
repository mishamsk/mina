import type {
  CreateIncomeTransactionRequest,
  CreateRefundTransactionRequest,
  CreateSpendTransactionRequest,
  CreateTransferTransactionRequest,
} from "./generated";
import {
  createIncomeTransaction,
  createRefundTransaction,
  createSpendTransaction,
  createTransferTransaction,
  deleteTransaction,
  getTransaction,
  listAccounts,
  listCategories,
  listMembers,
  listTags,
  listTransactions,
} from "./generated";

export interface TransactionPageParams {
  readonly anchorDate?: string;
  readonly limit: number;
  readonly offset: number;
}

const lookupLimit = 500;

export const fetchTransactionPage = (params: TransactionPageParams) =>
  listTransactions({
    query: {
      limit: params.limit,
      offset: params.offset,
      anchor_date: params.anchorDate,
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

export const createSpend = (body: CreateSpendTransactionRequest) =>
  createSpendTransaction({ body });

export const createIncome = (body: CreateIncomeTransactionRequest) =>
  createIncomeTransaction({ body });

export const createRefund = (body: CreateRefundTransactionRequest) =>
  createRefundTransaction({ body });

export const createTransfer = (body: CreateTransferTransactionRequest) =>
  createTransferTransaction({ body });

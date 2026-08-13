export const transactionSortOptions = [
  "initiated_date",
  "created_at",
  "updated_at",
] as const;
export type TransactionSort = (typeof transactionSortOptions)[number];

export const transactionSortDirectionOptions = ["asc", "desc"] as const;
export type TransactionSortDirection =
  (typeof transactionSortDirectionOptions)[number];

export const defaultTransactionSort: TransactionSort = "initiated_date";
export const defaultTransactionSortDirection: TransactionSortDirection = "desc";

import type { Transaction } from "@/api";

import {
  canSplitTransaction,
  isActiveWhollyPendingTransaction,
  isExpectedRecurringOccurrence,
} from "./format";

export interface TransactionActionApplicability {
  readonly confirmOccurrence: boolean;
  readonly createRecurring: boolean;
  readonly createTemplate: boolean;
  readonly delete: boolean;
  readonly duplicate: boolean;
  readonly edit: boolean;
  readonly post: boolean;
  readonly restore: boolean;
  readonly split: boolean;
}

export const transactionActionApplicability = (
  transaction: Transaction,
): TransactionActionApplicability => {
  const expectedOccurrence = isExpectedRecurringOccurrence(transaction);
  const active = transaction.lifecycle_status === "active";
  const cancelled = transaction.lifecycle_status === "cancelled";
  const reusable = !expectedOccurrence && (active || cancelled);
  const whollyPending =
    !expectedOccurrence && isActiveWhollyPendingTransaction(transaction);

  return {
    confirmOccurrence: expectedOccurrence,
    createRecurring: reusable,
    createTemplate: reusable,
    delete: reusable,
    duplicate: reusable,
    edit: !expectedOccurrence && active,
    post: whollyPending,
    restore: cancelled,
    split: !expectedOccurrence && active && canSplitTransaction(transaction),
  };
};

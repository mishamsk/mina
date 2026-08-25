import type { Transaction } from "@/api";

import {
  canSplitTransaction,
  isActiveWhollyPendingTransaction,
  isExpectedRecurringOccurrence,
  isProjectedRecurringTransaction,
} from "./format";

export interface TransactionActionApplicability {
  readonly confirmNextProjection: boolean;
  readonly confirmOccurrence: boolean;
  readonly createRecurring: boolean;
  readonly createTemplate: boolean;
  readonly delete: boolean;
  readonly deferProjection: boolean;
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
  const projectedOccurrence = isProjectedRecurringTransaction(transaction);
  const active = transaction.lifecycle_status === "active";
  const cancelled = transaction.lifecycle_status === "cancelled";
  const reusable = !expectedOccurrence && (active || cancelled);
  const whollyPending =
    !expectedOccurrence && isActiveWhollyPendingTransaction(transaction);

  return {
    confirmNextProjection:
      projectedOccurrence && transaction.recurring_projection_is_next === true,
    confirmOccurrence: expectedOccurrence,
    createRecurring: reusable,
    createTemplate: reusable,
    delete: reusable,
    deferProjection:
      projectedOccurrence && transaction.recurring_projection_is_next === true,
    duplicate: reusable,
    edit: !expectedOccurrence && active,
    post: whollyPending,
    restore: cancelled,
    split: !expectedOccurrence && active && canSplitTransaction(transaction),
  };
};

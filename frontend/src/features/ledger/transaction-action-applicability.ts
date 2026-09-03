import type { Transaction } from "@/api";

import {
  canSplitTransaction,
  isActiveWhollyPendingTransaction,
  isMaterializedExpectedRecurringTransaction,
  isProjectedRecurringTransaction,
} from "./format";

export interface TransactionActionApplicability {
  readonly confirmNextProjection: boolean;
  readonly confirmExpected: boolean;
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
  const materializedExpected =
    isMaterializedExpectedRecurringTransaction(transaction);
  const projectedRecurring = isProjectedRecurringTransaction(transaction);
  const active = transaction.lifecycle_status === "active";
  const cancelled = transaction.lifecycle_status === "cancelled";
  const reusable = !materializedExpected && (active || cancelled);
  const whollyPending =
    !materializedExpected && isActiveWhollyPendingTransaction(transaction);

  return {
    confirmNextProjection:
      projectedRecurring && transaction.recurring_projection_is_next === true,
    confirmExpected: materializedExpected,
    createRecurring: reusable,
    createTemplate: reusable,
    delete: reusable,
    deferProjection:
      projectedRecurring && transaction.recurring_projection_is_next === true,
    duplicate: reusable,
    edit: !materializedExpected && active,
    post: whollyPending,
    restore: cancelled,
    split: !materializedExpected && active && canSplitTransaction(transaction),
  };
};

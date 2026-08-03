import type { Account, JournalRecord, Transaction } from "@/api";

export type EditModeField = "category" | "member" | "tags";

export type EditModeSkipReason =
  | "mixed records"
  | "no active records"
  | "no categorizable records"
  | "partially attributed members";

export interface EditModePrediction {
  readonly reason?: EditModeSkipReason;
  readonly skip: boolean;
}

export interface EditModeSkipSummary {
  readonly count: number;
  readonly reasons: readonly {
    readonly count: number;
    readonly reason: EditModeSkipReason;
  }[];
}

const reasonOrder: readonly EditModeSkipReason[] = [
  "mixed records",
  "no active records",
  "partially attributed members",
  "no categorizable records",
];

const sameTagIds = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length &&
  left.every((tagId, index) => tagId === right[index]);

const sortedTagIds = (tagIds: readonly number[]): readonly number[] =>
  [...tagIds].sort((left, right) => left - right);

export const activeEditModeRecords = (
  transaction: Transaction,
): readonly JournalRecord[] =>
  transaction.lifecycle_status === "active" ? transaction.records : [];

export const editModeCategoryTargetRecords = (
  transaction: Transaction,
  accountsById: ReadonlyMap<number, Account>,
): readonly JournalRecord[] =>
  activeEditModeRecords(transaction).filter(
    (record) => accountsById.get(record.account_id)?.account_type === "flow",
  );

export const predictEditMode = (
  transaction: Transaction,
  field: EditModeField,
  accountsById: ReadonlyMap<number, Account>,
): EditModePrediction => {
  const records = activeEditModeRecords(transaction);
  if (records.length === 0) {
    return { reason: "no active records", skip: true };
  }

  if (field === "category") {
    const categorizedRecords = records.filter(
      (record) => record.category_id !== null,
    );
    if (
      categorizedRecords.length === 0 ||
      editModeCategoryTargetRecords(transaction, accountsById).length === 0
    ) {
      return { reason: "no categorizable records", skip: true };
    }
    if (
      new Set(categorizedRecords.map((record) => record.category_id)).size > 1
    ) {
      return { reason: "mixed records", skip: true };
    }
    return { skip: false };
  }

  if (field === "member") {
    const memberIds = new Set(
      records.map((record) => record.member_id ?? null),
    );
    if (memberIds.size === 1) {
      return { skip: false };
    }
    const attributedMemberIds = new Set(
      records.flatMap((record) =>
        record.member_id === null || record.member_id === undefined
          ? []
          : [record.member_id],
      ),
    );
    return attributedMemberIds.size === 1 && memberIds.has(null)
      ? { reason: "partially attributed members", skip: true }
      : { reason: "mixed records", skip: true };
  }

  const firstTagIds = sortedTagIds(records[0]!.tag_ids);
  return records.every((record) =>
    sameTagIds(sortedTagIds(record.tag_ids), firstTagIds),
  )
    ? { skip: false }
    : { reason: "mixed records", skip: true };
};

export const summarizeEditModeSkips = (
  transactions: readonly Transaction[],
  field: EditModeField,
  accountsById: ReadonlyMap<number, Account>,
): EditModeSkipSummary => {
  const counts = new Map<EditModeSkipReason, number>();
  for (const transaction of transactions) {
    const prediction = predictEditMode(transaction, field, accountsById);
    if (prediction.reason) {
      counts.set(prediction.reason, (counts.get(prediction.reason) ?? 0) + 1);
    }
  }
  const reasons = reasonOrder.flatMap((reason) => {
    const count = counts.get(reason);
    return count === undefined ? [] : [{ count, reason }];
  });
  return {
    count: reasons.reduce((total, reason) => total + reason.count, 0),
    reasons,
  };
};

export const formatEditModeSkipReasons = (
  summary: EditModeSkipSummary,
): string =>
  summary.reasons
    .map(
      ({ count, reason }) =>
        `${count} ${count === 1 ? "transaction has" : "transactions have"} ${reason}`,
    )
    .join(", ");

import type {
  JournalRecord,
  Transaction,
  UpdateTransactionRequest,
} from "@/api";

export type AmountSavePageRefresh = (rowRemainsVisible: boolean) => void;

export class TransactionAmountConflictError extends Error {}

const amountWithRecordSign = (record: JournalRecord, amount: string): string =>
  `${record.amount.startsWith("-") ? "-" : ""}${amount}`;

const transactionRecordUpdate = (
  record: JournalRecord,
  amount: string,
): UpdateTransactionRequest["records"][number] => ({
  account_id: record.account_id,
  amount: amountWithRecordSign(record, amount),
  category_id: record.category_id,
  currency: record.currency,
  member_id: record.member_id,
  memo: record.memo,
  settlement: record.settlement
    ? {
        pending_date: record.pending_date,
        posted_date: record.posted_date,
        status: record.settlement,
      }
    : null,
  reconciliation_status: record.reconciliation_status,
  record_id: record.record_id,
  tag_ids: [...record.tag_ids],
});

export const transactionAmountUpdateBody = (
  transaction: Transaction,
  amount: string,
): UpdateTransactionRequest => ({
  initiated_date: transaction.initiated_date,
  records: transaction.records
    .filter((record) => !record.tombstoned_at)
    .map((record) => transactionRecordUpdate(record, amount)),
});

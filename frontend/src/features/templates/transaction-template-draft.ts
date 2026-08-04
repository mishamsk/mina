import type { Transaction, TransactionTemplateRecordRequest } from "@/api";

export const transactionTemplateRecordsFromTransaction = (
  transaction: Transaction,
): readonly TransactionTemplateRecordRequest[] =>
  transaction.records
    .filter((record) => !record.tombstoned_at)
    .map((record) => ({
      account_id: record.account_id,
      amount: record.amount,
      category_id: record.category_id,
      currency: record.currency,
      member_id: record.member_id,
      memo: record.memo,
      tag_ids: [...record.tag_ids],
    }));

import type {
  RecurringDefinitionRecordRequest,
  Transaction,
  TransactionTemplate,
} from "@/api";

export const recurringDefinitionRecordsFromTransaction = (
  transaction: Transaction,
): readonly RecurringDefinitionRecordRequest[] =>
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

export const recurringDefinitionRecordsFromTemplate = (
  template: TransactionTemplate,
): readonly RecurringDefinitionRecordRequest[] =>
  template.records
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

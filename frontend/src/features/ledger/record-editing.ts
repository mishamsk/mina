import type {
  JournalRecord,
  Transaction,
  UpdateTransactionRequest,
} from "@/api";

export type RecordReferenceUpdate =
  | { readonly categoryId: number; readonly kind: "category" }
  | { readonly kind: "tags"; readonly tagIds: readonly number[] }
  | { readonly kind: "member"; readonly memberId: number | undefined };

export type RecordUpdate =
  | RecordReferenceUpdate
  | { readonly kind: "memo"; readonly memo: string | null }
  | {
      readonly initiatedDate: string;
      readonly kind: "dates";
      readonly pendingDate: string;
      readonly postedDate: string | null;
    }
  | {
      readonly kind: "postingStatus";
      readonly postingStatus: "cancelled" | "pending" | "posted";
    };

type RecordReplacementUpdate = Extract<
  RecordUpdate,
  | { readonly kind: "dates" }
  | { readonly kind: "member" }
  | { readonly kind: "memo" }
>;

const updateRecord = (
  record: JournalRecord,
  update?: RecordReplacementUpdate,
): UpdateTransactionRequest["records"][number] => ({
  account_id: record.account_id,
  amount: record.amount,
  amount_usd: record.amount_usd,
  category_id: record.category_id,
  currency: record.currency,
  external_id: record.external_id,
  external_system: record.external_system,
  member_id:
    update?.kind === "member" ? (update.memberId ?? null) : record.member_id,
  memo: update?.kind === "memo" ? update.memo : record.memo,
  pending_date:
    update?.kind === "dates" ? update.pendingDate : record.pending_date,
  posted_date:
    update?.kind === "dates" ? update.postedDate : record.posted_date,
  posting_status: record.posting_status,
  reconciliation_status: record.reconciliation_status,
  source: "manual",
  tag_ids: [...record.tag_ids],
});

export const recordUpdateBody = (
  transaction: Transaction,
  recordId: number,
  update: RecordReplacementUpdate,
): UpdateTransactionRequest => ({
  initiated_date:
    update.kind === "dates" ? update.initiatedDate : transaction.initiated_date,
  records: transaction.records
    .filter((record) => !record.tombstoned_at)
    .map((record) =>
      record.record_id === recordId
        ? updateRecord(record, update)
        : updateRecord(record),
    ),
});

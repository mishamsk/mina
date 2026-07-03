import type {
  Account,
  Category,
  DisplayAmount,
  JournalRecord,
  Member,
  PostingStatus,
  Tag,
  Transaction,
  TransactionClass,
} from "@/api";
import type { LedgerLookupsSnapshot } from "@/store";
import { formatLocalCivilDate, formatLocalCivilDateParts } from "@/utils/date";

export interface LookupMaps {
  readonly accountsById: ReadonlyMap<number, Account>;
  readonly categoriesById: ReadonlyMap<number, Category>;
  readonly membersById: ReadonlyMap<number, Member>;
  readonly tagsById: ReadonlyMap<number, Tag>;
}

const compactClassLabels: Record<TransactionClass, string> = {
  adjustment: "ADJUST",
  currency_exchange: "EXCHANGE",
  fx_gain_loss: "FX",
  income: "INCOME",
  mixed: "MIXED",
  refund: "REFUND",
  spend: "SPEND",
  transfer: "TRANSFER",
};

export const transactionClassLabel = (
  transactionClass: TransactionClass,
): string => compactClassLabels[transactionClass];

export const buildLookupMaps = (
  lookups: LedgerLookupsSnapshot | undefined,
): LookupMaps => ({
  accountsById: new Map(
    lookups?.accounts.map((account) => [account.account_id, account]) ?? [],
  ),
  categoriesById: new Map(
    lookups?.categories.map((category) => [category.category_id, category]) ??
      [],
  ),
  membersById: new Map(
    lookups?.members.map((member) => [member.member_id, member]) ?? [],
  ),
  tagsById: new Map(lookups?.tags.map((tag) => [tag.tag_id, tag]) ?? []),
});

export const formatInitiatedDate = (value: string): string => {
  return formatLocalCivilDate(value);
};

export const formatInitiatedDateParts = (
  value: string,
): { readonly day: string; readonly year: string } => {
  return formatLocalCivilDateParts(value);
};

const formatWhole = (value: string): string =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(Number(value));

const roundedFixed = (absoluteAmount: string, scale: number): string => {
  const [whole = "0", rawFraction = ""] = absoluteAmount.split(".");
  const fraction = rawFraction.padEnd(8, "0").slice(0, 8);
  const mantissa = BigInt(`${whole}${fraction}`);
  const divisor = 10n ** BigInt(8 - scale);
  const rounded = (mantissa + divisor / 2n) / divisor;
  const raw = rounded.toString().padStart(scale + 1, "0");
  const fixedWhole = raw.slice(0, -scale) || "0";
  const fixedFraction = raw.slice(-scale);
  return scale === 0
    ? formatWhole(fixedWhole)
    : `${formatWhole(fixedWhole)}.${fixedFraction}`;
};

export const formatDecimalAmount = (
  amount: string,
  currency: string,
  options: { readonly positiveSign?: boolean } = {},
): string => {
  const negative = amount.startsWith("-");
  const absolute = negative ? amount.slice(1) : amount;
  const scale = currency.startsWith("C::") ? 8 : 2;
  const formatted =
    scale === 8
      ? roundedFixed(absolute, scale).replace(/\.?0+$/, "")
      : roundedFixed(absolute, scale);
  const sign = negative ? "-" : options.positiveSign === false ? "" : "+";
  return `${sign}${formatted}`;
};

export const displayAmountKey = (displayAmount: DisplayAmount): string =>
  `${displayAmount.currency}:${displayAmount.amount}`;

export const accountLeaf = (account: Account | undefined): string =>
  account?.name ?? "Unknown account";

const activeRecords = (transaction: Transaction): readonly JournalRecord[] => {
  const records = transaction.records.filter(
    (record) => record.posting_status !== "cancelled",
  );
  return records.length > 0 ? records : transaction.records;
};

const recordAmountIsPositive = (record: JournalRecord): boolean =>
  !record.amount.startsWith("-");

const flowRecord = (
  transaction: Transaction,
  maps: LookupMaps,
): JournalRecord | undefined =>
  transaction.records.find(
    (record) =>
      maps.accountsById.get(record.account_id)?.account_type === "flow",
  );

const balanceRecords = (
  transaction: Transaction,
  maps: LookupMaps,
): readonly JournalRecord[] =>
  transaction.records.filter(
    (record) =>
      maps.accountsById.get(record.account_id)?.account_type === "balance",
  );

const signedBalanceRecord = (
  transaction: Transaction,
  maps: LookupMaps,
  positive: boolean,
): JournalRecord | undefined =>
  balanceRecords(transaction, maps).find(
    (record) => recordAmountIsPositive(record) === positive,
  );

const signedFlowRecord = (
  transaction: Transaction,
  maps: LookupMaps,
  positive: boolean,
): JournalRecord | undefined =>
  transaction.records.find(
    (record) =>
      maps.accountsById.get(record.account_id)?.account_type === "flow" &&
      recordAmountIsPositive(record) === positive,
  );

export const counterpartyTitle = (
  transaction: Transaction,
  maps: LookupMaps,
): string => {
  switch (transaction.transaction_class) {
    case "spend": {
      const from = signedBalanceRecord(transaction, maps, false);
      const to = signedFlowRecord(transaction, maps, true);
      return `${accountLeaf(maps.accountsById.get(from?.account_id ?? -1))} → ${accountLeaf(
        maps.accountsById.get(to?.account_id ?? -1),
      )}`;
    }
    case "income":
    case "refund": {
      const from = signedFlowRecord(transaction, maps, false);
      const to = signedBalanceRecord(transaction, maps, true);
      return `${accountLeaf(maps.accountsById.get(from?.account_id ?? -1))} → ${accountLeaf(
        maps.accountsById.get(to?.account_id ?? -1),
      )}`;
    }
    case "transfer": {
      const records = balanceRecords(transaction, maps);
      const from = records.find((record) => !recordAmountIsPositive(record));
      const to = records.find((record) => recordAmountIsPositive(record));
      return `${accountLeaf(maps.accountsById.get(from?.account_id ?? -1))} → ${accountLeaf(
        maps.accountsById.get(to?.account_id ?? -1),
      )}`;
    }
    case "currency_exchange": {
      const exchangeAmounts =
        transaction.components.find(
          (component) => component.intent === "exchange",
        )?.amounts ?? [];
      const sold = exchangeAmounts.find((amount) =>
        amount.amount.startsWith("-"),
      );
      const bought = exchangeAmounts.find(
        (amount) => !amount.amount.startsWith("-"),
      );
      if (sold && bought) {
        return `${sold.currency} → ${bought.currency}`;
      }

      const from = signedBalanceRecord(transaction, maps, false);
      const to = signedBalanceRecord(transaction, maps, true);
      return from && to
        ? `${from.currency} → ${to.currency}`
        : "Currency exchange";
    }
    case "adjustment":
    case "fx_gain_loss":
      return accountLeaf(
        maps.accountsById.get(
          balanceRecords(transaction, maps)[0]?.account_id ?? -1,
        ),
      );
    case "mixed":
      return (
        transaction.records.find((record) => record.memo)?.memo ??
        accountLeaf(
          maps.accountsById.get(
            flowRecord(transaction, maps)?.account_id ?? -1,
          ),
        )
      );
  }
};

const uniformValue = <T>(
  values: readonly T[],
  equals: (left: T, right: T) => boolean = Object.is,
): T | "mixed" | undefined => {
  const [first] = values;
  if (first === undefined) {
    return undefined;
  }
  return values.every((value) => equals(value, first)) ? first : "mixed";
};

export const lineMemo = (transaction: Transaction): string | undefined => {
  const memos = activeRecords(transaction)
    .map((record) => record.memo?.trim())
    .filter((memo): memo is string => Boolean(memo));
  if (memos.length === 0) {
    return undefined;
  }
  if (transaction.transaction_class === "mixed") {
    return undefined;
  }
  const memo = uniformValue(memos);
  return memo === "mixed" ? undefined : memo;
};

export const lineCategory = (
  transaction: Transaction,
  maps: LookupMaps,
): Category | "mixed" | undefined => {
  const categoryId = uniformValue(
    activeRecords(transaction).map((record) => record.category_id),
  );
  if (categoryId === "mixed") {
    return "mixed";
  }
  if (categoryId === undefined) {
    return undefined;
  }
  return maps.categoriesById.get(categoryId);
};

export const lineTags = (
  transaction: Transaction,
  maps: LookupMaps,
): readonly Tag[] | "mixed" => {
  const tagIds = uniformValue(
    activeRecords(transaction).map((record) => [...record.tag_ids].sort()),
    (left, right) =>
      left.length === right.length &&
      left.every((value, index) => value === right[index]),
  );
  if (tagIds === "mixed") {
    return "mixed";
  }
  return tagIds
    ? tagIds
        .map((tagId) => maps.tagsById.get(tagId))
        .filter((tag): tag is Tag => Boolean(tag))
    : [];
};

export const lineMember = (
  transaction: Transaction,
  maps: LookupMaps,
): Member | "mixed" | undefined => {
  const memberId = uniformValue(
    activeRecords(transaction)
      .map((record) => record.member_id)
      .filter((memberId): memberId is number => memberId != null),
  );
  if (memberId === "mixed") {
    return "mixed";
  }
  if (memberId === undefined) {
    return undefined;
  }
  return maps.membersById.get(memberId);
};

export const linePostingStatus = (
  transaction: Transaction,
): PostingStatus | "mixed" => {
  const status = uniformValue(
    activeRecords(transaction).map((record) => record.posting_status),
  );
  return status ?? "posted";
};

export const lineDisplayAmounts = (
  transaction: Transaction,
  maps?: LookupMaps,
): readonly DisplayAmount[] => {
  if (transaction.transaction_class === "transfer") {
    return transaction.components.flatMap((component) => component.amounts);
  }

  if (transaction.transaction_class === "currency_exchange") {
    const exchangeAmounts =
      transaction.components.find(
        (component) => component.intent === "exchange",
      )?.amounts ?? [];
    const soldSide = exchangeAmounts.find((amount) =>
      amount.amount.startsWith("-"),
    );
    if (soldSide) {
      return [soldSide];
    }

    const soldRecord =
      maps === undefined
        ? undefined
        : signedBalanceRecord(transaction, maps, false);
    return soldRecord
      ? [{ amount: soldRecord.amount, currency: soldRecord.currency }]
      : exchangeAmounts.slice(0, 1);
  }

  if (transaction.transaction_class === "mixed") {
    return transaction.components.flatMap((component) => component.amounts);
  }

  if (transaction.primary_amounts.length > 0) {
    return transaction.primary_amounts;
  }

  return transaction.components.flatMap((component) => component.amounts);
};

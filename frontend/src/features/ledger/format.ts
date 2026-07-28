import type {
  Account,
  Category,
  DisplayAmount,
  JournalRecord,
  Member,
  PostingStatus,
  RecordRole,
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

const classLabels: Record<TransactionClass, string> = {
  adjustment: "Adjustment",
  clawback: "Clawback",
  currency_exchange: "Currency exchange",
  income: "Income",
  mixed: "Mixed",
  refund: "Refund",
  spend: "Spend",
  transfer: "Transfer",
};

const compactClassLabels: Record<TransactionClass, string> = {
  adjustment: "ADJUST",
  clawback: "CLAWBACK",
  currency_exchange: "EXCHANGE",
  income: "INCOME",
  mixed: "MIXED",
  refund: "REFUND",
  spend: "SPEND",
  transfer: "TRANSFER",
};

export const transactionClassLabel = (
  transactionClass: TransactionClass,
): string => classLabels[transactionClass];

export const compactTransactionClassLabel = (
  transactionClass: TransactionClass,
): string => compactClassLabels[transactionClass];

const postingStatusLabels: Record<PostingStatus, string> = {
  cancelled: "Cancelled",
  expected: "Expected",
  pending: "Pending",
  posted: "Posted",
};

export const postingStatusLabel = (status: PostingStatus | "mixed"): string =>
  status === "mixed" ? "Mixed posting status" : postingStatusLabels[status];

const recordRoleLabels: Record<RecordRole, string> = {
  adjustment: "Adjustment",
  balance: "Balance",
  clawback: "Clawback",
  exchange: "Exchange",
  expense: "Expense",
  income: "Income",
  refund: "Refund",
};

export const recordRoleLabel = (role: RecordRole): string =>
  recordRoleLabels[role];

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

const decimalScale = 8;
const decimalFactor = 10n ** BigInt(decimalScale);

const decimalUnits = (value: string): bigint => {
  const negative = value.startsWith("-");
  const absolute = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = absolute.split(".");
  const normalizedFraction = fraction.padEnd(decimalScale, "0").slice(0, 8);
  const units =
    BigInt(whole || "0") * decimalFactor + BigInt(normalizedFraction);
  return negative ? -units : units;
};

const decimalString = (units: bigint): string => {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / decimalFactor;
  const fraction = (absolute % decimalFactor)
    .toString()
    .padStart(decimalScale, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
};

export const sumDecimalStrings = (values: readonly string[]): string =>
  decimalString(values.reduce((sum, value) => sum + decimalUnits(value), 0n));

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

export const activeTransactionRecords = (
  transaction: Transaction,
): readonly JournalRecord[] => {
  const records = transaction.records.filter(
    (record) => record.posting_status !== "cancelled",
  );
  return records.length > 0 ? records : transaction.records;
};

export const simpleTransactionAmountRecords = (
  transaction: Transaction,
): readonly [JournalRecord, JournalRecord] | undefined => {
  if (
    transaction.transaction_class !== "spend" &&
    transaction.transaction_class !== "income" &&
    transaction.transaction_class !== "refund" &&
    transaction.transaction_class !== "transfer"
  ) {
    return undefined;
  }

  const records = activeTransactionRecords(transaction);
  if (records.length !== 2 || records[0]?.currency !== records[1]?.currency) {
    return undefined;
  }

  const first = records[0]!;
  const second = records[1]!;
  const firstAmount = decimalUnits(first.amount);
  const secondAmount = decimalUnits(second.amount);
  if (
    firstAmount === 0n ||
    secondAmount === 0n ||
    firstAmount !== -secondAmount
  ) {
    return undefined;
  }

  return [first, second];
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

const compareNumbers = (left: number, right: number): number => left - right;

const compareTagsByName = (left: Tag, right: Tag): number =>
  left.name.localeCompare(right.name) || left.fqn.localeCompare(right.fqn);

export const lineMemo = (transaction: Transaction): string | undefined => {
  const memos = activeTransactionRecords(transaction)
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
    activeTransactionRecords(transaction)
      .map((record) => record.category_id)
      .filter((categoryId): categoryId is number => categoryId !== null),
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
    activeTransactionRecords(transaction).map((record) =>
      [...record.tag_ids].sort(compareNumbers),
    ),
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
        .sort(compareTagsByName)
    : [];
};

export const lineMember = (
  transaction: Transaction,
  maps: LookupMaps,
): Member | "mixed" | undefined => {
  const memberId = uniformValue(
    activeTransactionRecords(transaction)
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
    activeTransactionRecords(transaction).map(
      (record) => record.posting_status,
    ),
  );
  return status ?? "posted";
};

export const lineDisplayAmounts = (
  transaction: Transaction,
): readonly DisplayAmount[] => {
  if (transaction.transaction_class === "currency_exchange") {
    return transaction.shapes
      .filter((shape) => shape.shape === "exchange")
      .flatMap((shape) => shape.amounts)
      .filter((amount) => amount.amount.startsWith("-"));
  }

  if (transactionHasMoreParts(transaction)) {
    return transaction.primary_amounts.length === 1
      ? transaction.primary_amounts
      : [];
  }

  return transaction.primary_amounts.length > 0
    ? transaction.primary_amounts
    : detailDisplayAmounts(transaction);
};

export const detailDisplayAmounts = (
  transaction: Transaction,
): readonly DisplayAmount[] =>
  transaction.shapes.flatMap((shape) => shape.amounts);

export const transactionHasMoreParts = (transaction: Transaction): boolean =>
  transaction.shapes.length > 1;

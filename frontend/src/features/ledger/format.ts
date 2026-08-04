import type {
  Account,
  Category,
  DisplayAmount,
  JournalRecord,
  Member,
  RecordRole,
  SettlementStatus,
  Tag,
  Transaction,
  TransactionClass,
  TransactionLifecycleStatus,
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

const lifecycleStatusLabels: Record<TransactionLifecycleStatus, string> = {
  active: "Active",
  cancelled: "Cancelled",
  expected: "Expected",
};

const settlementStatusLabels: Record<SettlementStatus, string> = {
  pending: "Pending",
  posted: "Posted",
};

export const lifecycleStatusLabel = (
  status: TransactionLifecycleStatus,
): string => lifecycleStatusLabels[status];

export const settlementStatusLabel = (
  status: SettlementStatus | "mixed" | "not_applicable",
): string =>
  status === "mixed"
    ? "Mixed settlement"
    : status === "not_applicable"
      ? "No settlement"
      : settlementStatusLabels[status];

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

export const transactionAccountFqnContext = (
  transaction: Transaction,
  maps: Pick<LookupMaps, "accountsById">,
  options: { readonly includeDisplayTitle?: boolean } = {},
): string => {
  const fqns = Array.from(
    new Set(
      transaction.records.flatMap((record) => {
        const account = maps.accountsById.get(record.account_id);
        return account ? [account.fqn] : [];
      }),
    ),
  );
  const accountContext =
    fqns.length > 0 ? `Accounts: ${fqns.join("; ")}` : undefined;
  if (options.includeDisplayTitle === false) {
    return accountContext ?? "";
  }
  return accountContext
    ? `${transaction.display_title}. ${accountContext}`
    : transaction.display_title;
};

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

  const records = transaction.records;
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
  const memos = transaction.records
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
    transaction.records
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
    transaction.records.map((record) =>
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
    transaction.records
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

export type TransactionDisplayStatus =
  "cancelled" | "expected" | "mixed" | "pending";

export const displayStatusLabel = (status: TransactionDisplayStatus): string =>
  status === "pending" || status === "mixed"
    ? settlementStatusLabel(status)
    : lifecycleStatusLabel(status);

export const lineStatus = (
  transaction: Transaction,
): TransactionDisplayStatus | undefined =>
  transaction.lifecycle_status === "expected" ||
  transaction.lifecycle_status === "cancelled"
    ? transaction.lifecycle_status
    : transaction.settlement === "pending" || transaction.settlement === "mixed"
      ? transaction.settlement
      : undefined;

export const isActiveWhollyPendingTransaction = (
  transaction: Transaction,
): boolean =>
  transaction.lifecycle_status === "active" &&
  transaction.settlement === "pending";

export const isExpectedRecurringOccurrence = (
  transaction: Transaction,
): boolean =>
  transaction.lifecycle_status === "expected" &&
  transaction.recurring_occurrence_id !== null;

export const canSplitTransaction = (transaction: Transaction): boolean =>
  transaction.lifecycle_status === "active" &&
  (transaction.transaction_class === "spend" ||
    transaction.transaction_class === "income");

export const recordStatus = (
  record: JournalRecord,
): TransactionDisplayStatus | undefined =>
  record.lifecycle_status === "expected" ||
  record.lifecycle_status === "cancelled"
    ? record.lifecycle_status
    : record.settlement === "pending"
      ? "pending"
      : undefined;

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

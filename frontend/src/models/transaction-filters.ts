import type { PostingStatus, TransactionClass } from "@/api/generated";

export const transactionPostingStatuses = [
  "pending",
  "posted",
  "cancelled",
] as const satisfies readonly PostingStatus[];

export const defaultTransactionPostingStatuses = [
  "expected",
  "pending",
  "posted",
  "cancelled",
] as const satisfies readonly PostingStatus[];

export const transactionClasses = [
  "spend",
  "income",
  "refund",
  "transfer",
  "currency_exchange",
  "adjustment",
  "fx_gain_loss",
  "mixed",
] as const satisfies readonly TransactionClass[];

export const transactionFilterDecimalPattern = /^-?(?:\d{1,10})(?:\.\d{1,8})?$/;

export interface TransactionFilters {
  readonly accountIds: readonly number[];
  readonly amountMax?: string;
  readonly amountMin?: string;
  readonly amountUsdMax?: string;
  readonly amountUsdMin?: string;
  readonly categoryIds: readonly number[];
  readonly classes: readonly TransactionClass[];
  readonly hideExpected: boolean;
  readonly initiatedFrom?: string;
  readonly initiatedTo?: string;
  readonly memberIds: readonly number[];
  readonly pendingFrom?: string;
  readonly pendingTo?: string;
  readonly postedFrom?: string;
  readonly postedTo?: string;
  readonly search?: string;
  readonly statuses: readonly PostingStatus[];
  readonly tagIds: readonly number[];
}

export const emptyTransactionFilters: TransactionFilters = {
  accountIds: [],
  categoryIds: [],
  classes: [],
  hideExpected: false,
  memberIds: [],
  statuses: [],
  tagIds: [],
};

const uniqueSortedNumbers = (values: readonly number[]): readonly number[] =>
  [
    ...new Set(values.filter((value) => Number.isInteger(value) && value > 0)),
  ].sort((left, right) => left - right);

const uniqueAllowedValues = <T extends string>(
  values: readonly T[],
  allowed: readonly T[],
): readonly T[] => {
  const allowedSet = new Set<T>(allowed);
  const selectedSet = new Set(values.filter((value) => allowedSet.has(value)));
  return allowed.filter((value) => selectedSet.has(value));
};

const trimmedValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const normalizeTransactionFilters = (
  filters: Partial<TransactionFilters> = {},
): TransactionFilters => ({
  ...emptyTransactionFilters,
  accountIds: uniqueSortedNumbers(filters.accountIds ?? []),
  amountMax: trimmedValue(filters.amountMax),
  amountMin: trimmedValue(filters.amountMin),
  amountUsdMax: trimmedValue(filters.amountUsdMax),
  amountUsdMin: trimmedValue(filters.amountUsdMin),
  categoryIds: uniqueSortedNumbers(filters.categoryIds ?? []),
  classes: uniqueAllowedValues(filters.classes ?? [], transactionClasses),
  hideExpected: filters.hideExpected === true,
  initiatedFrom: trimmedValue(filters.initiatedFrom),
  initiatedTo: trimmedValue(filters.initiatedTo),
  memberIds: uniqueSortedNumbers(filters.memberIds ?? []),
  pendingFrom: trimmedValue(filters.pendingFrom),
  pendingTo: trimmedValue(filters.pendingTo),
  postedFrom: trimmedValue(filters.postedFrom),
  postedTo: trimmedValue(filters.postedTo),
  search: trimmedValue(filters.search),
  statuses: uniqueAllowedValues(
    filters.statuses ?? [],
    transactionPostingStatuses,
  ),
  tagIds: uniqueSortedNumbers(filters.tagIds ?? []),
});

export const transactionFilterSignature = (
  filters: Partial<TransactionFilters> = {},
): string => {
  const normalized = normalizeTransactionFilters(filters);
  return [
    `account=${normalized.accountIds.join(",")}`,
    `category=${normalized.categoryIds.join(",")}`,
    `tag=${normalized.tagIds.join(",")}`,
    `member=${normalized.memberIds.join(",")}`,
    `status=${normalized.statuses.join(",")}`,
    `class=${normalized.classes.join(",")}`,
    `hideExpected=${normalized.hideExpected}`,
    `amountMin=${normalized.amountMin ?? ""}`,
    `amountMax=${normalized.amountMax ?? ""}`,
    `amountUsdMin=${normalized.amountUsdMin ?? ""}`,
    `amountUsdMax=${normalized.amountUsdMax ?? ""}`,
    `initiatedFrom=${normalized.initiatedFrom ?? ""}`,
    `initiatedTo=${normalized.initiatedTo ?? ""}`,
    `pendingFrom=${normalized.pendingFrom ?? ""}`,
    `pendingTo=${normalized.pendingTo ?? ""}`,
    `postedFrom=${normalized.postedFrom ?? ""}`,
    `postedTo=${normalized.postedTo ?? ""}`,
    `q=${normalized.search ?? ""}`,
  ].join("|");
};

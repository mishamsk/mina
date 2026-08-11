import type {
  RecordRole,
  TransactionClass,
  TransactionLifecycleStatus,
  TransactionSettlement,
  TransactionShapeType,
} from "@/api/generated";

export const transactionLifecycleStatuses = [
  "active",
  "expected",
  "cancelled",
] as const satisfies readonly TransactionLifecycleStatus[];

export const transactionSettlements = [
  "pending",
  "posted",
  "mixed",
  "not_applicable",
] as const satisfies readonly TransactionSettlement[];

export const transactionClasses = [
  "spend",
  "income",
  "refund",
  "clawback",
  "transfer",
  "currency_exchange",
  "adjustment",
  "mixed",
] as const satisfies readonly TransactionClass[];

export const transactionShapes = [
  "spend",
  "refund",
  "income",
  "clawback",
  "adjustment",
  "exchange",
  "transfer",
] as const satisfies readonly TransactionShapeType[];

export const recordRoles = [
  "expense",
  "refund",
  "income",
  "clawback",
  "exchange",
  "adjustment",
  "balance",
] as const satisfies readonly RecordRole[];

export const transactionFilterDecimalPattern = /^-?(?:\d{1,10})(?:\.\d{1,8})?$/;

export interface TransactionFilters {
  readonly accountIds: readonly number[];
  readonly amountMax?: string;
  readonly amountMin?: string;
  readonly amountUsdMax?: string;
  readonly amountUsdMin?: string;
  readonly categoryIds: readonly number[];
  readonly categoryFqnPrefix?: string;
  readonly classes: readonly TransactionClass[];
  readonly lifecycleStatuses: readonly TransactionLifecycleStatus[];
  readonly initiatedFrom?: string;
  readonly initiatedTo?: string;
  readonly memberIds: readonly number[];
  readonly recordRoles: readonly RecordRole[];
  readonly search?: string;
  readonly shapes: readonly TransactionShapeType[];
  readonly settlements: readonly TransactionSettlement[];
  readonly tagIds: readonly number[];
  readonly tagFqnPrefix?: string;
}

export const emptyTransactionFilters: TransactionFilters = {
  accountIds: [],
  categoryIds: [],
  classes: [],
  lifecycleStatuses: [],
  memberIds: [],
  recordRoles: [],
  shapes: [],
  settlements: [],
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
  categoryFqnPrefix: trimmedValue(filters.categoryFqnPrefix),
  classes: uniqueAllowedValues(filters.classes ?? [], transactionClasses),
  lifecycleStatuses: uniqueAllowedValues(
    filters.lifecycleStatuses ?? [],
    transactionLifecycleStatuses,
  ),
  initiatedFrom: trimmedValue(filters.initiatedFrom),
  initiatedTo: trimmedValue(filters.initiatedTo),
  memberIds: uniqueSortedNumbers(filters.memberIds ?? []),
  recordRoles: uniqueAllowedValues(filters.recordRoles ?? [], recordRoles),
  search: trimmedValue(filters.search),
  shapes: uniqueAllowedValues(filters.shapes ?? [], transactionShapes),
  settlements: uniqueAllowedValues(
    filters.settlements ?? [],
    transactionSettlements,
  ),
  tagIds: uniqueSortedNumbers(filters.tagIds ?? []),
  tagFqnPrefix: trimmedValue(filters.tagFqnPrefix),
});

export const transactionFilterSignature = (
  filters: Partial<TransactionFilters> = {},
): string => {
  const normalized = normalizeTransactionFilters(filters);
  return [
    `account=${normalized.accountIds.join(",")}`,
    `category=${normalized.categoryIds.join(",")}`,
    `categoryPrefix=${normalized.categoryFqnPrefix ?? ""}`,
    `tag=${normalized.tagIds.join(",")}`,
    `tagPrefix=${normalized.tagFqnPrefix ?? ""}`,
    `member=${normalized.memberIds.join(",")}`,
    `lifecycle=${normalized.lifecycleStatuses.join(",")}`,
    `settlement=${normalized.settlements.join(",")}`,
    `class=${normalized.classes.join(",")}`,
    `shape=${normalized.shapes.join(",")}`,
    `role=${normalized.recordRoles.join(",")}`,
    `amountMin=${normalized.amountMin ?? ""}`,
    `amountMax=${normalized.amountMax ?? ""}`,
    `amountUsdMin=${normalized.amountUsdMin ?? ""}`,
    `amountUsdMax=${normalized.amountUsdMax ?? ""}`,
    `initiatedFrom=${normalized.initiatedFrom ?? ""}`,
    `initiatedTo=${normalized.initiatedTo ?? ""}`,
    `q=${normalized.search ?? ""}`,
  ].join("|");
};

import type {
  RecordRole,
  TransactionClass,
  TransactionLifecycleStatus,
  TransactionSettlement,
  TransactionShapeType,
} from "@/api";
import {
  normalizeTransactionFilters,
  recordRoles,
  transactionClasses,
  transactionFilterDecimalPattern,
  type TransactionFilters,
  transactionLifecycleStatuses,
  transactionSettlements,
  transactionShapes,
} from "@/models/transaction-filters";

export const defaultTransactionPage = 1;
export const defaultTransactionPageSize = 50;
export const transactionPageSizeOptions = [25, 50, 100] as const;
export const transactionPageSizes = new Set<number>(transactionPageSizeOptions);

const filterParamNames = [
  "account",
  "amountMax",
  "amountMin",
  "amountUsdMax",
  "amountUsdMin",
  "category",
  "categoryPrefix",
  "class",
  "lifecycle",
  "initiatedFrom",
  "initiatedTo",
  "member",
  "q",
  "role",
  "shape",
  "settlement",
  "tag",
  "tagPrefix",
] as const;

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const parsePositiveInteger = (
  value: string | null,
  fallback: number,
): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
};

export const normalizeTransactionPageSize = (pageSize: number): number =>
  transactionPageSizes.has(pageSize) ? pageSize : defaultTransactionPageSize;

export const transactionOffsetFromPage = (
  page: number,
  pageSize: number,
): number => (page - 1) * pageSize;

export const transactionPageFromOffset = (
  offset: number,
  pageSize: number,
): number => Math.floor(offset / pageSize) + 1;

export const readTransactionPageFromSearchParams = (
  searchParams: URLSearchParams,
): { readonly page: number; readonly pageSize: number } => {
  const page = parsePositiveInteger(
    searchParams.get("page"),
    defaultTransactionPage,
  );
  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    defaultTransactionPageSize,
  );
  return {
    page,
    pageSize: normalizeTransactionPageSize(requestedPageSize),
  };
};

const readPositiveIntegerParams = (
  searchParams: URLSearchParams,
  name: string,
): readonly number[] =>
  searchParams
    .getAll(name)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

const readAllowedParams = <T extends string>(
  searchParams: URLSearchParams,
  name: string,
  allowed: readonly T[],
): readonly T[] => {
  const allowedSet = new Set<T>(allowed);
  return searchParams
    .getAll(name)
    .filter((value): value is T => allowedSet.has(value as T));
};

const readPatternParam = (
  searchParams: URLSearchParams,
  name: string,
  pattern: RegExp,
): string | undefined => {
  const value = searchParams.get(name)?.trim();
  return value && pattern.test(value) ? value : undefined;
};

const readTextParam = (
  searchParams: URLSearchParams,
  name: string,
): string | undefined => {
  const value = searchParams.get(name)?.trim();
  return value ? value : undefined;
};

export const readTransactionFiltersFromSearchParams = (
  searchParams: URLSearchParams,
): TransactionFilters =>
  normalizeTransactionFilters({
    accountIds: readPositiveIntegerParams(searchParams, "account"),
    amountMax: readPatternParam(
      searchParams,
      "amountMax",
      transactionFilterDecimalPattern,
    ),
    amountMin: readPatternParam(
      searchParams,
      "amountMin",
      transactionFilterDecimalPattern,
    ),
    amountUsdMax: readPatternParam(
      searchParams,
      "amountUsdMax",
      transactionFilterDecimalPattern,
    ),
    amountUsdMin: readPatternParam(
      searchParams,
      "amountUsdMin",
      transactionFilterDecimalPattern,
    ),
    categoryIds: readPositiveIntegerParams(searchParams, "category"),
    categoryFqnPrefix: readTextParam(searchParams, "categoryPrefix"),
    classes: readAllowedParams<TransactionClass>(
      searchParams,
      "class",
      transactionClasses,
    ),
    lifecycleStatuses: readAllowedParams<TransactionLifecycleStatus>(
      searchParams,
      "lifecycle",
      transactionLifecycleStatuses,
    ),
    initiatedFrom: readPatternParam(
      searchParams,
      "initiatedFrom",
      isoDatePattern,
    ),
    initiatedTo: readPatternParam(searchParams, "initiatedTo", isoDatePattern),
    memberIds: readPositiveIntegerParams(searchParams, "member"),
    recordRoles: readAllowedParams<RecordRole>(
      searchParams,
      "role",
      recordRoles,
    ),
    search: readTextParam(searchParams, "q"),
    shapes: readAllowedParams<TransactionShapeType>(
      searchParams,
      "shape",
      transactionShapes,
    ),
    settlements: readAllowedParams<TransactionSettlement>(
      searchParams,
      "settlement",
      transactionSettlements,
    ),
    tagIds: readPositiveIntegerParams(searchParams, "tag"),
    tagFqnPrefix: readTextParam(searchParams, "tagPrefix"),
  });

export const readLiveSearchParams = (): URLSearchParams =>
  new URLSearchParams(window.location.search);

export const writeTransactionFiltersToSearchParams = (
  searchParams: URLSearchParams,
  filters: Partial<TransactionFilters>,
  options: { readonly resetPage?: boolean } = {},
): URLSearchParams => {
  const normalized = normalizeTransactionFilters(filters);
  const next = new URLSearchParams(searchParams);

  for (const name of filterParamNames) {
    next.delete(name);
  }

  for (const accountId of normalized.accountIds) {
    next.append("account", String(accountId));
  }
  for (const categoryId of normalized.categoryIds) {
    next.append("category", String(categoryId));
  }
  for (const tagId of normalized.tagIds) {
    next.append("tag", String(tagId));
  }
  for (const memberId of normalized.memberIds) {
    next.append("member", String(memberId));
  }
  for (const lifecycleStatus of normalized.lifecycleStatuses) {
    next.append("lifecycle", lifecycleStatus);
  }
  for (const settlement of normalized.settlements) {
    next.append("settlement", settlement);
  }
  for (const transactionClass of normalized.classes) {
    next.append("class", transactionClass);
  }
  for (const transactionShape of normalized.shapes) {
    next.append("shape", transactionShape);
  }
  for (const recordRole of normalized.recordRoles) {
    next.append("role", recordRole);
  }
  const setIfPresent = (name: string, value: string | undefined) => {
    if (value) {
      next.set(name, value);
    }
  };
  setIfPresent("amountMin", normalized.amountMin);
  setIfPresent("amountMax", normalized.amountMax);
  setIfPresent("amountUsdMin", normalized.amountUsdMin);
  setIfPresent("amountUsdMax", normalized.amountUsdMax);
  setIfPresent("categoryPrefix", normalized.categoryFqnPrefix);
  setIfPresent("initiatedFrom", normalized.initiatedFrom);
  setIfPresent("initiatedTo", normalized.initiatedTo);
  setIfPresent("q", normalized.search);
  setIfPresent("tagPrefix", normalized.tagFqnPrefix);

  if (options.resetPage ?? true) {
    next.set("page", String(defaultTransactionPage));
  }

  return next;
};

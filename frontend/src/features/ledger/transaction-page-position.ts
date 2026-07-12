import type { PostingStatus, TransactionClass } from "@/api";
import {
  normalizeTransactionFilters,
  transactionClasses,
  transactionFilterDecimalPattern,
  type TransactionFilters,
  transactionPostingStatuses,
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
  "class",
  "hideExpected",
  "initiatedFrom",
  "initiatedTo",
  "member",
  "pendingFrom",
  "pendingTo",
  "postedFrom",
  "postedTo",
  "q",
  "status",
  "tag",
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
    classes: readAllowedParams<TransactionClass>(
      searchParams,
      "class",
      transactionClasses,
    ),
    hideExpected: searchParams.get("hideExpected") === "true",
    initiatedFrom: readPatternParam(
      searchParams,
      "initiatedFrom",
      isoDatePattern,
    ),
    initiatedTo: readPatternParam(searchParams, "initiatedTo", isoDatePattern),
    memberIds: readPositiveIntegerParams(searchParams, "member"),
    pendingFrom: readPatternParam(searchParams, "pendingFrom", isoDatePattern),
    pendingTo: readPatternParam(searchParams, "pendingTo", isoDatePattern),
    postedFrom: readPatternParam(searchParams, "postedFrom", isoDatePattern),
    postedTo: readPatternParam(searchParams, "postedTo", isoDatePattern),
    search: readTextParam(searchParams, "q"),
    statuses: readAllowedParams<PostingStatus>(
      searchParams,
      "status",
      transactionPostingStatuses,
    ),
    tagIds: readPositiveIntegerParams(searchParams, "tag"),
  });

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
  for (const status of normalized.statuses) {
    next.append("status", status);
  }
  for (const transactionClass of normalized.classes) {
    next.append("class", transactionClass);
  }
  if (normalized.hideExpected) {
    next.set("hideExpected", "true");
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
  setIfPresent("initiatedFrom", normalized.initiatedFrom);
  setIfPresent("initiatedTo", normalized.initiatedTo);
  setIfPresent("pendingFrom", normalized.pendingFrom);
  setIfPresent("pendingTo", normalized.pendingTo);
  setIfPresent("postedFrom", normalized.postedFrom);
  setIfPresent("postedTo", normalized.postedTo);
  setIfPresent("q", normalized.search);

  if (options.resetPage ?? true) {
    next.set("page", String(defaultTransactionPage));
  }

  return next;
};

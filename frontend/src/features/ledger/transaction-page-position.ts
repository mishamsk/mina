import type { TransactionClass } from "@/api";
import {
  normalizeTransactionFilters,
  transactionClasses,
  type TransactionFilters,
} from "@/models/transaction-filters";
import {
  defaultTransactionSort,
  defaultTransactionSortDirection,
  type TransactionSort,
  type TransactionSortDirection,
  transactionSortDirectionOptions,
  transactionSortOptions,
} from "@/models/transaction-sorting";

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
  "currency",
  "filter",
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
): {
  readonly page: number;
  readonly pageSize: number;
  readonly sort: TransactionSort;
  readonly sortDirection: TransactionSortDirection;
} => {
  const page = parsePositiveInteger(
    searchParams.get("page"),
    defaultTransactionPage,
  );
  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    defaultTransactionPageSize,
  );
  const requestedSort = searchParams.get("sort");
  const requestedSortDirection = searchParams.get("sortDir");
  return {
    page,
    pageSize: normalizeTransactionPageSize(requestedPageSize),
    sort: transactionSortOptions.includes(requestedSort as TransactionSort)
      ? (requestedSort as TransactionSort)
      : defaultTransactionSort,
    sortDirection: transactionSortDirectionOptions.includes(
      requestedSortDirection as TransactionSortDirection,
    )
      ? (requestedSortDirection as TransactionSortDirection)
      : defaultTransactionSortDirection,
  };
};

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

export const readTransactionAnchorDateFromSearchParams = (
  searchParams: URLSearchParams,
): string | undefined =>
  readPatternParam(searchParams, "anchor_date", isoDatePattern);

export const readTransactionFiltersFromSearchParams = (
  searchParams: URLSearchParams,
): TransactionFilters => {
  const filterText = searchParams.get("filter");
  return normalizeTransactionFilters({
    classes: readAllowedParams<TransactionClass>(
      searchParams,
      "class",
      transactionClasses,
    ),
    ...(filterText !== null ? { filterText } : {}),
    search: readTextParam(searchParams, "q"),
  });
};

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

  for (const transactionClass of normalized.classes) {
    next.append("class", transactionClass);
  }
  const setIfPresent = (name: string, value: string | undefined) => {
    if (value !== undefined) {
      next.set(name, value);
    }
  };
  setIfPresent("filter", normalized.filterText);
  setIfPresent("q", normalized.search);

  if (options.resetPage ?? true) {
    next.set("page", String(defaultTransactionPage));
  }

  return next;
};

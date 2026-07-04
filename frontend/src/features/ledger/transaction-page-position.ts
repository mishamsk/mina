export const defaultTransactionPage = 1;
export const defaultTransactionPageSize = 10;
export const transactionPageSizes = new Set([10, 25, 50]);

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

import { useEffect, useRef } from "react";

import {
  apiErrorMessage,
  type CategoriesManagementParams,
  fetchCategoriesPage,
} from "@/api";
import { refreshLedgerLookups } from "@/features/ledger";
import { refreshOverview } from "@/features/overview";
import {
  type CategoriesPageKey,
  clearCategoriesPageLoading,
  getCategoriesSnapshot,
  invalidateCategoriesPage,
  invalidateTransactionPages,
  setCategoriesPage,
  setCategoriesPageError,
  setCategoriesPageFromCache,
  setCategoriesPageLoading,
  useCategoriesPageView,
} from "@/store";

let categoriesPageLoadGeneration = 0;
const defaultCategoriesPageParams: CategoriesManagementParams = {
  includeHidden: true,
  q: "",
};
let currentCategoriesPageParams = defaultCategoriesPageParams;
const categoriesPageRefreshRetryDelayMs = 200;
const categoriesPageRefreshAttempts = 8;

const normalizedCategoriesPageParams = (
  params: CategoriesManagementParams,
): CategoriesManagementParams => ({
  economicIntent: params.economicIntent,
  includeHidden: params.includeHidden,
  q: params.q.trim(),
});

const categoriesPageKey = (
  params: CategoriesManagementParams,
): CategoriesPageKey =>
  `${params.includeHidden ? "hidden" : "visible"}:${params.economicIntent ?? "all"}:${params.q.toLowerCase()}`;

const nextCategoriesPageLoadGeneration = (
  params: CategoriesManagementParams,
): number => {
  categoriesPageLoadGeneration += 1;
  currentCategoriesPageParams = normalizedCategoriesPageParams(params);
  const key = categoriesPageKey(currentCategoriesPageParams);
  setCategoriesPageLoading(key);
  return categoriesPageLoadGeneration;
};

const isCurrentCategoriesPageLoad = (generation: number): boolean =>
  generation === categoriesPageLoadGeneration;

const categoriesPageLoaded = (
  result: Awaited<ReturnType<typeof fetchCategoriesPage>>,
): boolean => Boolean(result.categories.data && result.groups.data);

const waitForCategoriesPageRetry = (): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, categoriesPageRefreshRetryDelayMs);
  });

const fetchCategoriesPageWithRetries = async (
  params: CategoriesManagementParams,
  shouldContinue: () => boolean,
): Promise<Awaited<ReturnType<typeof fetchCategoriesPage>>> => {
  let result = await fetchCategoriesPage(params, shouldContinue);
  for (
    let attempt = 1;
    attempt < categoriesPageRefreshAttempts && !categoriesPageLoaded(result);
    attempt += 1
  ) {
    if (!shouldContinue()) {
      return result;
    }
    await waitForCategoriesPageRetry();
    if (!shouldContinue()) {
      return result;
    }
    result = await fetchCategoriesPage(params, shouldContinue);
  }
  return result;
};

const loadCategoriesPage = async (
  generation: number,
  params: CategoriesManagementParams,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> => {
  const isCurrentLoad = () => isCurrentCategoriesPageLoad(generation);
  const commitCurrent = () => shouldCommit() && isCurrentLoad();

  const result = await fetchCategoriesPageWithRetries(params, commitCurrent);
  if (!commitCurrent()) {
    if (isCurrentLoad()) {
      clearCategoriesPageLoading();
    }
    return false;
  }

  if (!result.categories.data) {
    setCategoriesPageError(apiErrorMessage(result.categories.error));
    return false;
  }

  if (!result.groups.data) {
    setCategoriesPageError(apiErrorMessage(result.groups.error));
    return false;
  }

  setCategoriesPage({
    categories: result.categories.data.categories,
    groups: result.groups.data.groups,
    key: categoriesPageKey(params),
  });
  return true;
};

export const refreshCategoriesPage = async (): Promise<boolean> => {
  const params = currentCategoriesPageParams;
  return loadCategoriesPage(nextCategoriesPageLoadGeneration(params), params);
};

export const refreshCategoriesAfterMutation = async (options?: {
  readonly bulk?: boolean;
}): Promise<boolean> => {
  invalidateCategoriesPage();
  if (options?.bulk) {
    invalidateTransactionPages();
  }
  const categoriesRefreshed = await refreshCategoriesPage();
  await Promise.all([refreshLedgerLookups(), refreshOverview()]);
  return categoriesRefreshed;
};

export const useCategoriesResource = (
  requestedParams: CategoriesManagementParams = defaultCategoriesPageParams,
) => {
  const categoriesPage = useCategoriesPageView();
  const mountedRef = useRef(false);
  const params = normalizedCategoriesPageParams(requestedParams);
  const key = categoriesPageKey(params);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const snapshot = getCategoriesSnapshot();
    currentCategoriesPageParams = params;
    if (snapshot.snapshot?.key === key && !snapshot.stale) {
      if (
        snapshot.requestKey !== key &&
        (snapshot.loading || snapshot.errorMessage)
      ) {
        categoriesPageLoadGeneration += 1;
        setCategoriesPageFromCache(key);
      }
      return;
    }
    if (
      (snapshot.loading && snapshot.requestKey === key) ||
      (snapshot.errorMessage && snapshot.requestKey === key)
    ) {
      return;
    }

    const generation = nextCategoriesPageLoadGeneration(params);

    void loadCategoriesPage(generation, params, () => mountedRef.current);
  }, [
    categoriesPage.errorMessage,
    categoriesPage.loading,
    categoriesPage.snapshot,
    categoriesPage.stale,
    key,
  ]);

  return categoriesPage;
};

import { useEffect, useRef } from "react";

import { apiErrorMessage, fetchCategoriesPage } from "@/api";
import { refreshLedgerLookups } from "@/features/ledger";
import { refreshOverview } from "@/features/overview";
import {
  clearCategoriesPageLoading,
  getCategoriesSnapshot,
  invalidateCategoryPickerCategories,
  invalidateTransactionPages,
  setCategoriesPage,
  setCategoriesPageError,
  setCategoriesPageLoading,
  useCategoriesPageView,
} from "@/store";

let categoriesPageLoadGeneration = 0;
const categoriesPageRefreshRetryDelayMs = 200;
const categoriesPageRefreshAttempts = 8;

const nextCategoriesPageLoadGeneration = (): number => {
  categoriesPageLoadGeneration += 1;
  setCategoriesPageLoading();
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
  shouldContinue: () => boolean,
): Promise<Awaited<ReturnType<typeof fetchCategoriesPage>>> => {
  let result = await fetchCategoriesPage();
  for (
    let attempt = 1;
    attempt < categoriesPageRefreshAttempts && !categoriesPageLoaded(result);
    attempt += 1
  ) {
    if (!shouldContinue()) {
      return result;
    }
    await waitForCategoriesPageRetry();
    result = await fetchCategoriesPage();
  }
  return result;
};

const loadCategoriesPage = async (
  generation: number,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> => {
  const isCurrentLoad = () => isCurrentCategoriesPageLoad(generation);
  const commitCurrent = () => shouldCommit() && isCurrentLoad();

  const result = await fetchCategoriesPageWithRetries(commitCurrent);
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
  });
  return true;
};

export const refreshCategoriesPage = async (): Promise<boolean> => {
  return loadCategoriesPage(nextCategoriesPageLoadGeneration());
};

export const refreshCategoriesAfterMutation = async (options?: {
  readonly bulk?: boolean;
}): Promise<boolean> => {
  invalidateCategoryPickerCategories();
  if (options?.bulk) {
    invalidateTransactionPages();
  }
  const categoriesRefreshed = await refreshCategoriesPage();
  await Promise.all([refreshLedgerLookups(), refreshOverview()]);
  return categoriesRefreshed;
};

export const useCategoriesResource = () => {
  const categoriesPage = useCategoriesPageView();
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const snapshot = getCategoriesSnapshot();
    if (snapshot.snapshot || snapshot.loading || snapshot.errorMessage) {
      return;
    }

    const generation = nextCategoriesPageLoadGeneration();

    void loadCategoriesPage(generation, () => mountedRef.current);
  }, [
    categoriesPage.errorMessage,
    categoriesPage.loading,
    categoriesPage.snapshot,
  ]);

  return categoriesPage;
};

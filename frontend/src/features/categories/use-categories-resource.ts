import { useEffect, useRef } from "react";

import {
  apiErrorMessage,
  type CategoryEconomicIntent,
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
const categoriesPageRefreshRetryDelayMs = 200;
const categoriesPageRefreshAttempts = 8;

const categoriesPageKey = (
  economicIntent?: CategoryEconomicIntent,
): CategoriesPageKey => economicIntent ?? "all";

const nextCategoriesPageLoadGeneration = (key: CategoriesPageKey): number => {
  categoriesPageLoadGeneration += 1;
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
  economicIntent: CategoryEconomicIntent | undefined,
  shouldContinue: () => boolean,
): Promise<Awaited<ReturnType<typeof fetchCategoriesPage>>> => {
  let result = await fetchCategoriesPage(economicIntent);
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
    result = await fetchCategoriesPage(economicIntent);
  }
  return result;
};

const loadCategoriesPage = async (
  generation: number,
  economicIntent?: CategoryEconomicIntent,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> => {
  const isCurrentLoad = () => isCurrentCategoriesPageLoad(generation);
  const commitCurrent = () => shouldCommit() && isCurrentLoad();

  const result = await fetchCategoriesPageWithRetries(
    economicIntent,
    commitCurrent,
  );
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
    key: categoriesPageKey(economicIntent),
  });
  return true;
};

const currentCategoriesPageEconomicIntent = () => {
  const snapshot = getCategoriesSnapshot();
  const key = snapshot.requestKey ?? snapshot.snapshot?.key;
  return key === "all" ? undefined : key;
};

export const refreshCategoriesPage = async (): Promise<boolean> => {
  const economicIntent = currentCategoriesPageEconomicIntent();
  const key = categoriesPageKey(economicIntent);
  return loadCategoriesPage(
    nextCategoriesPageLoadGeneration(key),
    economicIntent,
  );
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
  economicIntent?: CategoryEconomicIntent,
) => {
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
    const key = categoriesPageKey(economicIntent);
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

    const generation = nextCategoriesPageLoadGeneration(key);

    void loadCategoriesPage(
      generation,
      economicIntent,
      () => mountedRef.current,
    );
  }, [
    categoriesPage.errorMessage,
    categoriesPage.loading,
    categoriesPage.snapshot,
    categoriesPage.stale,
    economicIntent,
  ]);

  return categoriesPage;
};

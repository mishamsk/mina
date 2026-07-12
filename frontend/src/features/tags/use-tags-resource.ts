import { useEffect, useRef } from "react";

import { apiErrorMessage, fetchTagsPage } from "@/api";
import { refreshLedgerLookups } from "@/features/ledger";
import { refreshOverview } from "@/features/overview";
import {
  clearTagsPageLoading,
  getTagsSnapshot,
  invalidateTransactionPages,
  setTagsPage,
  setTagsPageError,
  setTagsPageLoading,
  useTagsPageView,
} from "@/store";

let tagsPageLoadGeneration = 0;
const tagsPageRefreshRetryDelayMs = 200;
const tagsPageRefreshAttempts = 8;

const nextTagsPageLoadGeneration = (): number => {
  tagsPageLoadGeneration += 1;
  setTagsPageLoading();
  return tagsPageLoadGeneration;
};

const isCurrentTagsPageLoad = (generation: number): boolean =>
  generation === tagsPageLoadGeneration;

const tagsPageLoaded = (
  result: Awaited<ReturnType<typeof fetchTagsPage>>,
): boolean => Boolean(result.tags.data && result.groups.data);

const waitForTagsPageRetry = (): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, tagsPageRefreshRetryDelayMs);
  });

const fetchTagsPageWithRetries = async (
  shouldContinue: () => boolean,
): Promise<Awaited<ReturnType<typeof fetchTagsPage>>> => {
  let result = await fetchTagsPage();
  for (
    let attempt = 1;
    attempt < tagsPageRefreshAttempts && !tagsPageLoaded(result);
    attempt += 1
  ) {
    if (!shouldContinue()) {
      return result;
    }
    await waitForTagsPageRetry();
    result = await fetchTagsPage();
  }
  return result;
};

const loadTagsPage = async (
  generation: number,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> => {
  const isCurrentLoad = () => isCurrentTagsPageLoad(generation);
  const commitCurrent = () => shouldCommit() && isCurrentLoad();

  const result = await fetchTagsPageWithRetries(commitCurrent);
  if (!commitCurrent()) {
    if (isCurrentLoad()) {
      clearTagsPageLoading();
    }
    return false;
  }

  if (!result.tags.data) {
    setTagsPageError(apiErrorMessage(result.tags.error));
    return false;
  }

  if (!result.groups.data) {
    setTagsPageError(apiErrorMessage(result.groups.error));
    return false;
  }

  setTagsPage({
    groups: result.groups.data.groups,
    tags: result.tags.data.tags,
  });
  return true;
};

export const refreshTagsPage = async (): Promise<boolean> => {
  return loadTagsPage(nextTagsPageLoadGeneration());
};

export const refreshTagsAfterMutation = async (options?: {
  readonly restructure?: boolean;
}): Promise<boolean> => {
  if (options?.restructure) {
    invalidateTransactionPages();
  }
  const tagsRefreshed = await refreshTagsPage();
  await Promise.all([refreshLedgerLookups(), refreshOverview()]);
  return tagsRefreshed;
};

export const useTagsResource = () => {
  const tagsPage = useTagsPageView();
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const snapshot = getTagsSnapshot();
    if (
      (snapshot.snapshot && !snapshot.stale) ||
      snapshot.loading ||
      snapshot.errorMessage
    ) {
      return;
    }

    const generation = nextTagsPageLoadGeneration();

    void loadTagsPage(generation, () => mountedRef.current);
  }, [
    tagsPage.errorMessage,
    tagsPage.loading,
    tagsPage.snapshot,
    tagsPage.stale,
  ]);

  return tagsPage;
};

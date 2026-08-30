import { useEffect, useRef } from "react";

import {
  apiErrorMessage,
  fetchTagsPage,
  type TagsManagementParams,
} from "@/api";
import { refreshLedgerLookups } from "@/features/ledger";
import { refreshOverview } from "@/features/overview";
import {
  clearTagsPageLoading,
  getTagsSnapshot,
  invalidateTransactionPages,
  setTagsPage,
  setTagsPageError,
  setTagsPageFromCache,
  setTagsPageLoading,
  useTagsPageView,
} from "@/store";

let tagsPageLoadGeneration = 0;
const defaultTagsPageParams: TagsManagementParams = {
  includeHidden: true,
  q: "",
};
let currentTagsPageParams = defaultTagsPageParams;
const tagsPageRefreshRetryDelayMs = 200;
const tagsPageRefreshAttempts = 8;

const normalizedTagsPageParams = (
  params: TagsManagementParams,
): TagsManagementParams => ({
  includeHidden: params.includeHidden,
  q: params.q.trim(),
});

const tagsPageKey = (params: TagsManagementParams): string =>
  `${params.includeHidden ? "hidden" : "visible"}:${params.q.toLowerCase()}`;

const nextTagsPageLoadGeneration = (params: TagsManagementParams): number => {
  tagsPageLoadGeneration += 1;
  currentTagsPageParams = normalizedTagsPageParams(params);
  setTagsPageLoading(tagsPageKey(currentTagsPageParams));
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
  params: TagsManagementParams,
  shouldContinue: () => boolean,
): Promise<Awaited<ReturnType<typeof fetchTagsPage>>> => {
  let result = await fetchTagsPage(params, shouldContinue);
  for (
    let attempt = 1;
    attempt < tagsPageRefreshAttempts && !tagsPageLoaded(result);
    attempt += 1
  ) {
    if (!shouldContinue()) {
      return result;
    }
    await waitForTagsPageRetry();
    if (!shouldContinue()) {
      return result;
    }
    result = await fetchTagsPage(params, shouldContinue);
  }
  return result;
};

const loadTagsPage = async (
  generation: number,
  params: TagsManagementParams,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> => {
  const isCurrentLoad = () => isCurrentTagsPageLoad(generation);
  const commitCurrent = () => shouldCommit() && isCurrentLoad();

  const result = await fetchTagsPageWithRetries(params, commitCurrent);
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
    key: tagsPageKey(params),
    tags: result.tags.data.tags,
  });
  return true;
};

export const refreshTagsPage = async (): Promise<boolean> => {
  const params = currentTagsPageParams;
  return loadTagsPage(nextTagsPageLoadGeneration(params), params);
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

export const useTagsResource = (
  requestedParams: TagsManagementParams = defaultTagsPageParams,
) => {
  const tagsPage = useTagsPageView();
  const mountedRef = useRef(false);
  const params = normalizedTagsPageParams(requestedParams);
  const key = tagsPageKey(params);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const snapshot = getTagsSnapshot();
    currentTagsPageParams = params;
    if (snapshot.snapshot?.key === key && !snapshot.stale) {
      if (
        snapshot.requestKey !== key &&
        (snapshot.loading || snapshot.errorMessage)
      ) {
        tagsPageLoadGeneration += 1;
        setTagsPageFromCache(key);
      }
      return;
    }
    if (
      snapshot.requestKey === key &&
      (snapshot.loading || snapshot.errorMessage)
    ) {
      return;
    }

    const generation = nextTagsPageLoadGeneration(params);

    void loadTagsPage(generation, params, () => mountedRef.current);
  }, [
    tagsPage.errorMessage,
    tagsPage.loading,
    tagsPage.snapshot,
    tagsPage.stale,
    key,
  ]);

  return tagsPage;
};

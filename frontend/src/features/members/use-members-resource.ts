import { useEffect, useRef } from "react";

import {
  apiErrorMessage,
  fetchMembersPage,
  type MembersManagementParams,
} from "@/api";
import { refreshLedgerLookups } from "@/features/ledger";
import {
  clearMembersPageLoading,
  getMembersSnapshot,
  invalidateTransactionPages,
  setMembersPage,
  setMembersPageError,
  setMembersPageFromCache,
  setMembersPageLoading,
  useMembersPageView,
} from "@/store";

let membersPageLoadGeneration = 0;
const defaultMembersPageParams: MembersManagementParams = {
  includeHidden: false,
  q: "",
};
let currentMembersPageParams = defaultMembersPageParams;
const membersPageRefreshRetryDelayMs = 200;
const membersPageRefreshAttempts = 8;

const normalizedMembersPageParams = (
  params: MembersManagementParams,
): MembersManagementParams => ({
  includeHidden: params.includeHidden,
  q: params.q.trim(),
});

const membersPageKey = (params: MembersManagementParams): string =>
  `${params.includeHidden ? "hidden" : "visible"}:${params.q.toLowerCase()}`;

const nextMembersPageLoadGeneration = (
  params: MembersManagementParams,
): number => {
  membersPageLoadGeneration += 1;
  currentMembersPageParams = normalizedMembersPageParams(params);
  setMembersPageLoading(membersPageKey(currentMembersPageParams));
  return membersPageLoadGeneration;
};

const isCurrentMembersPageLoad = (generation: number): boolean =>
  generation === membersPageLoadGeneration;

const waitForMembersPageRetry = (): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, membersPageRefreshRetryDelayMs);
  });

const fetchMembersPageWithRetries = async (
  params: MembersManagementParams,
  shouldContinue: () => boolean,
): Promise<Awaited<ReturnType<typeof fetchMembersPage>>> => {
  let result = await fetchMembersPage(params, shouldContinue);
  for (
    let attempt = 1;
    attempt < membersPageRefreshAttempts && !result.data;
    attempt += 1
  ) {
    if (!shouldContinue()) {
      return result;
    }
    await waitForMembersPageRetry();
    if (!shouldContinue()) {
      return result;
    }
    result = await fetchMembersPage(params, shouldContinue);
  }
  return result;
};

const loadMembersPage = async (
  generation: number,
  params: MembersManagementParams,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> => {
  const isCurrentLoad = () => isCurrentMembersPageLoad(generation);
  const commitCurrent = () => shouldCommit() && isCurrentLoad();

  const result = await fetchMembersPageWithRetries(params, commitCurrent);
  if (!commitCurrent()) {
    if (isCurrentLoad()) {
      clearMembersPageLoading();
    }
    return false;
  }

  if (!result.data) {
    setMembersPageError(apiErrorMessage(result.error));
    return false;
  }

  setMembersPage({
    includeHidden: params.includeHidden,
    key: membersPageKey(params),
    members: result.data.members,
  });
  return true;
};

export const refreshMembersPage = async (
  includeHidden = currentMembersPageParams.includeHidden,
): Promise<boolean> => {
  const params = {
    ...currentMembersPageParams,
    includeHidden,
  };
  return loadMembersPage(nextMembersPageLoadGeneration(params), params);
};

export const refreshMembersAfterMutation = async (options?: {
  readonly includeHidden?: boolean;
  readonly invalidateTransactions?: boolean;
}): Promise<boolean> => {
  if (options?.invalidateTransactions) {
    invalidateTransactionPages();
  }
  const membersRefreshed = await refreshMembersPage(options?.includeHidden);
  await refreshLedgerLookups();
  return membersRefreshed;
};

export const useMembersResource = (
  requestedParams: MembersManagementParams = defaultMembersPageParams,
) => {
  const membersPage = useMembersPageView();
  const mountedRef = useRef(false);
  const params = normalizedMembersPageParams(requestedParams);
  const key = membersPageKey(params);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const snapshot = getMembersSnapshot();
    currentMembersPageParams = params;
    if (snapshot.snapshot?.key === key && !snapshot.stale) {
      if (
        snapshot.requestKey !== key &&
        (snapshot.loading || snapshot.errorMessage)
      ) {
        membersPageLoadGeneration += 1;
        setMembersPageFromCache(key);
      }
      return;
    }
    if (
      snapshot.requestKey === key &&
      (snapshot.loading || snapshot.errorMessage)
    ) {
      return;
    }

    const generation = nextMembersPageLoadGeneration(params);

    void loadMembersPage(generation, params, () => mountedRef.current);
  }, [
    key,
    membersPage.errorMessage,
    membersPage.loading,
    membersPage.snapshot,
    membersPage.stale,
  ]);

  return membersPage;
};

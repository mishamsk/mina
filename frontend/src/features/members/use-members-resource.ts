import { useEffect, useRef } from "react";

import { apiErrorMessage, fetchMembersPage } from "@/api";
import { refreshLedgerLookups } from "@/features/ledger";
import {
  clearMembersPageLoading,
  getMembersSnapshot,
  invalidateTransactionPages,
  setMembersPage,
  setMembersPageError,
  setMembersPageLoading,
  useMembersPageView,
} from "@/store";

let membersPageLoadGeneration = 0;
let membersPageLoadIncludeHidden: boolean | undefined;
const membersPageRefreshRetryDelayMs = 200;
const membersPageRefreshAttempts = 8;

const nextMembersPageLoadGeneration = (includeHidden: boolean): number => {
  membersPageLoadGeneration += 1;
  membersPageLoadIncludeHidden = includeHidden;
  setMembersPageLoading();
  return membersPageLoadGeneration;
};

const isCurrentMembersPageLoad = (generation: number): boolean =>
  generation === membersPageLoadGeneration;

const waitForMembersPageRetry = (): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, membersPageRefreshRetryDelayMs);
  });

const fetchMembersPageWithRetries = async (
  includeHidden: boolean,
  shouldContinue: () => boolean,
): Promise<Awaited<ReturnType<typeof fetchMembersPage>>> => {
  let result = await fetchMembersPage(includeHidden);
  for (
    let attempt = 1;
    attempt < membersPageRefreshAttempts && !result.data;
    attempt += 1
  ) {
    if (!shouldContinue()) {
      return result;
    }
    await waitForMembersPageRetry();
    result = await fetchMembersPage(includeHidden);
  }
  return result;
};

const loadMembersPage = async (
  generation: number,
  includeHidden: boolean,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> => {
  const isCurrentLoad = () => isCurrentMembersPageLoad(generation);
  const commitCurrent = () => shouldCommit() && isCurrentLoad();

  const result = await fetchMembersPageWithRetries(
    includeHidden,
    commitCurrent,
  );
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
    includeHidden,
    members: result.data.members,
  });
  return true;
};

export const refreshMembersPage = async (
  includeHidden = false,
): Promise<boolean> => {
  return loadMembersPage(
    nextMembersPageLoadGeneration(includeHidden),
    includeHidden,
  );
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

export const useMembersResource = (includeHidden = false) => {
  const membersPage = useMembersPageView();
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const snapshot = getMembersSnapshot();
    if (
      (snapshot.snapshot?.includeHidden === includeHidden && !snapshot.stale) ||
      (membersPageLoadIncludeHidden === includeHidden &&
        (snapshot.loading || snapshot.errorMessage))
    ) {
      return;
    }

    const generation = nextMembersPageLoadGeneration(includeHidden);

    void loadMembersPage(generation, includeHidden, () => mountedRef.current);
  }, [
    includeHidden,
    membersPage.errorMessage,
    membersPage.loading,
    membersPage.snapshot,
    membersPage.stale,
  ]);

  return membersPage;
};

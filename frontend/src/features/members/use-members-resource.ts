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
const membersPageRefreshRetryDelayMs = 200;
const membersPageRefreshAttempts = 8;

const nextMembersPageLoadGeneration = (): number => {
  membersPageLoadGeneration += 1;
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
  shouldContinue: () => boolean,
): Promise<Awaited<ReturnType<typeof fetchMembersPage>>> => {
  let result = await fetchMembersPage();
  for (
    let attempt = 1;
    attempt < membersPageRefreshAttempts && !result.data;
    attempt += 1
  ) {
    if (!shouldContinue()) {
      return result;
    }
    await waitForMembersPageRetry();
    result = await fetchMembersPage();
  }
  return result;
};

const loadMembersPage = async (
  generation: number,
  shouldCommit: () => boolean = () => true,
): Promise<boolean> => {
  const isCurrentLoad = () => isCurrentMembersPageLoad(generation);
  const commitCurrent = () => shouldCommit() && isCurrentLoad();

  const result = await fetchMembersPageWithRetries(commitCurrent);
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
    members: result.data.members,
  });
  return true;
};

export const refreshMembersPage = async (): Promise<boolean> => {
  return loadMembersPage(nextMembersPageLoadGeneration());
};

export const refreshMembersAfterMutation = async (options?: {
  readonly invalidateTransactions?: boolean;
}): Promise<boolean> => {
  if (options?.invalidateTransactions) {
    invalidateTransactionPages();
  }
  const membersRefreshed = await refreshMembersPage();
  await refreshLedgerLookups();
  return membersRefreshed;
};

export const useMembersResource = () => {
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
    if (snapshot.snapshot || snapshot.loading || snapshot.errorMessage) {
      return;
    }

    const generation = nextMembersPageLoadGeneration();

    void loadMembersPage(generation, () => mountedRef.current);
  }, [membersPage.errorMessage, membersPage.loading, membersPage.snapshot]);

  return membersPage;
};

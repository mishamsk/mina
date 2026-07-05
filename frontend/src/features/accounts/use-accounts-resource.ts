import { useEffect, useRef } from "react";

import { type Account, fetchAccountsPage, isNetworkFailure } from "@/api";
import { refreshFeaturedBalances } from "@/features/featured-balances";
import { refreshLedgerLookups } from "@/features/ledger";
import { refreshOverview } from "@/features/overview";
import {
  clearAccountsPageLoading,
  getAccountsSnapshot,
  invalidateAccountHeaders,
  mergeAccountsPageAccount,
  removeAccountsPageAccount,
  setAccountsPage,
  setAccountsPageError,
  setAccountsPageLoading,
  useAccountsPageView,
} from "@/store";

const apiErrorMessage = (error: unknown): string => {
  if (isNetworkFailure(error)) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "message" in error.error &&
    typeof error.error.message === "string"
  ) {
    return error.error.message;
  }
  return "The API request failed.";
};

let accountsPageLoadGeneration = 0;
const accountsPageRefreshRetryDelayMs = 200;
const accountsPageRefreshAttempts = 8;

const nextAccountsPageLoadGeneration = (): number => {
  accountsPageLoadGeneration += 1;
  setAccountsPageLoading();
  return accountsPageLoadGeneration;
};

const isCurrentAccountsPageLoad = (generation: number): boolean =>
  generation === accountsPageLoadGeneration;

const accountsPageLoaded = (
  result: Awaited<ReturnType<typeof fetchAccountsPage>>,
): boolean => Boolean(result.accounts.data && result.balances.data);

const waitForAccountsPageRetry = (): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, accountsPageRefreshRetryDelayMs);
  });

const fetchAccountsPageWithRetries = async (
  shouldContinue: () => boolean,
): Promise<Awaited<ReturnType<typeof fetchAccountsPage>>> => {
  let result = await fetchAccountsPage();
  for (
    let attempt = 1;
    attempt < accountsPageRefreshAttempts && !accountsPageLoaded(result);
    attempt += 1
  ) {
    if (!shouldContinue()) {
      return result;
    }
    await waitForAccountsPageRetry();
    result = await fetchAccountsPage();
  }
  return result;
};

const loadAccountsPage = async (
  generation: number,
  shouldCommit: () => boolean = () => true,
): Promise<void> => {
  const isCurrentLoad = () => isCurrentAccountsPageLoad(generation);
  const commitCurrent = () => shouldCommit() && isCurrentLoad();

  const result = await fetchAccountsPageWithRetries(commitCurrent);
  if (!commitCurrent()) {
    if (isCurrentLoad()) {
      clearAccountsPageLoading();
    }
    return;
  }

  if (!result.accounts.data) {
    setAccountsPageError(apiErrorMessage(result.accounts.error));
    return;
  }

  if (!result.balances.data) {
    setAccountsPageError(apiErrorMessage(result.balances.error));
    return;
  }

  setAccountsPage({
    accounts: result.accounts.data.accounts,
    balances: result.balances.data.balances,
  });
};

export const refreshAccountsPage = async (): Promise<void> => {
  await loadAccountsPage(nextAccountsPageLoadGeneration());
};

export const refreshAccountsAfterMutation = async (options?: {
  readonly account?: Account;
  readonly removedAccountId?: number;
}): Promise<void> => {
  invalidateAccountHeaders();
  await refreshAccountsPage();
  if (options?.account) {
    mergeAccountsPageAccount(options.account);
  }
  if (options?.removedAccountId !== undefined) {
    removeAccountsPageAccount(options.removedAccountId);
  }
  await Promise.all([
    refreshFeaturedBalances(),
    refreshOverview(),
    refreshLedgerLookups(),
  ]);
};

export const useAccountsResource = () => {
  const accountsPage = useAccountsPageView();
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const snapshot = getAccountsSnapshot();
    if (snapshot.snapshot || snapshot.loading || snapshot.errorMessage) {
      return;
    }

    const generation = nextAccountsPageLoadGeneration();

    void loadAccountsPage(generation, () => mountedRef.current);
  }, [accountsPage.errorMessage, accountsPage.loading, accountsPage.snapshot]);

  return accountsPage;
};

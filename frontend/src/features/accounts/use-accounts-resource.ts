import { useEffect, useRef } from "react";

import { fetchAccountsPage, isNetworkFailure } from "@/api";
import { refreshFeaturedBalances } from "@/features/featured-balances";
import { refreshLedgerLookups } from "@/features/ledger";
import { refreshOverview } from "@/features/overview";
import {
  clearAccountsPageLoading,
  getAccountsSnapshot,
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

const nextAccountsPageLoadGeneration = (): number => {
  accountsPageLoadGeneration += 1;
  setAccountsPageLoading();
  return accountsPageLoadGeneration;
};

const isCurrentAccountsPageLoad = (generation: number): boolean =>
  generation === accountsPageLoadGeneration;

const loadAccountsPage = async (
  generation: number,
  shouldCommit: () => boolean = () => true,
): Promise<void> => {
  const result = await fetchAccountsPage();
  const isCurrentLoad = () => isCurrentAccountsPageLoad(generation);
  const commitCurrent = () => shouldCommit() && isCurrentLoad();

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

export const refreshAccountsAfterMutation = async (): Promise<void> => {
  await Promise.all([
    refreshAccountsPage(),
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

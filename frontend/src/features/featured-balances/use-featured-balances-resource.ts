import { useEffect } from "react";

import { fetchFeaturedAccountBalances, isNetworkFailure } from "@/api";
import {
  getTransactionsSnapshot,
  setFeaturedBalances,
  setFeaturedBalancesError,
  setFeaturedBalancesLoading,
  useFeaturedBalancesView,
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

let featuredBalancesLoadGeneration = 0;

const nextFeaturedBalancesLoadGeneration = (): number => {
  featuredBalancesLoadGeneration += 1;
  setFeaturedBalancesLoading();
  return featuredBalancesLoadGeneration;
};

const isCurrentFeaturedBalancesLoad = (generation: number): boolean =>
  generation === featuredBalancesLoadGeneration;

const loadFeaturedBalances = async (
  generation: number,
  shouldCommit: () => boolean = () => true,
): Promise<void> => {
  const result = await fetchFeaturedAccountBalances();
  const commitCurrent = () =>
    shouldCommit() && isCurrentFeaturedBalancesLoad(generation);

  if (!commitCurrent()) {
    return;
  }

  if (!result.accounts.data) {
    setFeaturedBalancesError(apiErrorMessage(result.accounts.error));
    return;
  }

  if (result.accounts.data.accounts.length === 0) {
    setFeaturedBalances([]);
    return;
  }

  if (!result.balances?.data) {
    setFeaturedBalancesError(apiErrorMessage(result.balances?.error));
    return;
  }

  const balancesByAccountId = new Map<
    number,
    typeof result.balances.data.balances
  >();
  for (const balance of result.balances.data.balances) {
    const balances = balancesByAccountId.get(balance.account_id) ?? [];
    balancesByAccountId.set(balance.account_id, [...balances, balance]);
  }

  setFeaturedBalances(
    result.accounts.data.accounts.flatMap((account) =>
      (balancesByAccountId.get(account.account_id) ?? []).map((balance) => ({
        account,
        balance,
      })),
    ),
  );
};

export const refreshFeaturedBalances = async (): Promise<void> => {
  await loadFeaturedBalances(nextFeaturedBalancesLoadGeneration());
};

export const useFeaturedBalancesResource = () => {
  const featuredBalances = useFeaturedBalancesView();

  useEffect(() => {
    const snapshot = getTransactionsSnapshot();
    if (snapshot.featuredBalances) {
      return;
    }

    let active = true;
    const generation = nextFeaturedBalancesLoadGeneration();

    void loadFeaturedBalances(generation, () => active);

    return () => {
      active = false;
    };
  }, [featuredBalances.snapshot]);

  return featuredBalances;
};

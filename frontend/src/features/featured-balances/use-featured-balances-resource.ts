import { useEffect } from "react";

import { apiErrorMessage, fetchFeaturedAccountBalances } from "@/api";
import {
  getTransactionsSnapshot,
  setFeaturedBalances,
  setFeaturedBalancesError,
  setFeaturedBalancesLoading,
  useFeaturedBalancesView,
} from "@/store";

let featuredBalancesLoadGeneration = 0;
let featuredBalancesConsumerCount = 0;
let pendingFeaturedBalancesLoad: Promise<void> | undefined;

const nextFeaturedBalancesLoadGeneration = (): number => {
  featuredBalancesLoadGeneration += 1;
  setFeaturedBalancesLoading();
  return featuredBalancesLoadGeneration;
};

const isCurrentFeaturedBalancesLoad = (generation: number): boolean =>
  generation === featuredBalancesLoadGeneration;

const loadFeaturedBalances = async (generation: number): Promise<void> => {
  const result = await fetchFeaturedAccountBalances();

  if (!isCurrentFeaturedBalancesLoad(generation)) {
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

const startFeaturedBalancesLoad = (force = false): Promise<void> => {
  if (!force && pendingFeaturedBalancesLoad) {
    return pendingFeaturedBalancesLoad;
  }
  const load = loadFeaturedBalances(nextFeaturedBalancesLoadGeneration());
  const trackedLoad = load.finally(() => {
    if (pendingFeaturedBalancesLoad === trackedLoad) {
      pendingFeaturedBalancesLoad = undefined;
    }
  });
  pendingFeaturedBalancesLoad = trackedLoad;
  return trackedLoad;
};

export const refreshFeaturedBalances = async (): Promise<void> => {
  await startFeaturedBalancesLoad(true);
};

export const useFeaturedBalancesResource = () => {
  const featuredBalances = useFeaturedBalancesView();

  useEffect(() => {
    featuredBalancesConsumerCount += 1;
    return () => {
      featuredBalancesConsumerCount -= 1;
      if (featuredBalancesConsumerCount === 0) {
        featuredBalancesLoadGeneration += 1;
        pendingFeaturedBalancesLoad = undefined;
      }
    };
  }, []);

  useEffect(() => {
    const snapshot = getTransactionsSnapshot();
    if (snapshot.featuredBalances) {
      return;
    }

    void startFeaturedBalancesLoad();
  }, [featuredBalances.snapshot]);

  return featuredBalances;
};

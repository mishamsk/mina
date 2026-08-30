import { useEffect, useRef } from "react";

import {
  type Account,
  type AccountsManagementParams,
  apiErrorMessage,
  fetchAccountsPage,
} from "@/api";
import { refreshFeaturedBalances } from "@/features/featured-balances";
import { refreshLedgerLookups } from "@/features/ledger";
import { refreshOverview } from "@/features/overview";
import {
  clearAccountsPageLoading,
  getAccountsSnapshot,
  invalidateAccountHeaders,
  invalidateAccountRegisterPages,
  invalidateAllAccountRegisterPages,
  invalidateAllAccountTransactionCache,
  invalidateTransactionPages,
  invalidateTransactionTemplates,
  mergeAccountHeaderAccount,
  setAccountsPage,
  setAccountsPageError,
  setAccountsPageFromCache,
  setAccountsPageLoading,
  useAccountsPageView,
} from "@/store";

let accountsPageLoadGeneration = 0;
const defaultAccountsPageParams: AccountsManagementParams = {
  accountTypes: [],
  includeHidden: true,
  q: "",
};
let currentAccountsPageParams = defaultAccountsPageParams;
const accountsPageRefreshRetryDelayMs = 200;
const accountsPageRefreshAttempts = 8;

const normalizedAccountsPageParams = (
  params: AccountsManagementParams,
): AccountsManagementParams => ({
  accountTypes: [...params.accountTypes].sort(),
  includeHidden: params.includeHidden,
  q: params.q.trim(),
});

const accountsPageKey = (params: AccountsManagementParams): string =>
  `${params.includeHidden ? "hidden" : "visible"}:${params.accountTypes.join(",")}:${params.q.toLowerCase()}`;

const nextAccountsPageLoadGeneration = (
  params: AccountsManagementParams,
): number => {
  accountsPageLoadGeneration += 1;
  currentAccountsPageParams = normalizedAccountsPageParams(params);
  setAccountsPageLoading(accountsPageKey(currentAccountsPageParams));
  return accountsPageLoadGeneration;
};

const isCurrentAccountsPageLoad = (generation: number): boolean =>
  generation === accountsPageLoadGeneration;

const accountsPageLoaded = (
  result: Awaited<ReturnType<typeof fetchAccountsPage>>,
): boolean =>
  Boolean(result.accounts.data && result.balances.data && result.groups.data);

const waitForAccountsPageRetry = (): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, accountsPageRefreshRetryDelayMs);
  });

const fetchAccountsPageWithRetries = async (
  params: AccountsManagementParams,
  shouldContinue: () => boolean,
): Promise<Awaited<ReturnType<typeof fetchAccountsPage>>> => {
  let result = await fetchAccountsPage(params, shouldContinue);
  for (
    let attempt = 1;
    attempt < accountsPageRefreshAttempts && !accountsPageLoaded(result);
    attempt += 1
  ) {
    if (!shouldContinue()) {
      return result;
    }
    await waitForAccountsPageRetry();
    if (!shouldContinue()) {
      return result;
    }
    result = await fetchAccountsPage(params, shouldContinue);
  }
  return result;
};

const loadAccountsPage = async (
  generation: number,
  params: AccountsManagementParams,
  shouldCommit: () => boolean = () => true,
): Promise<void> => {
  const isCurrentLoad = () => isCurrentAccountsPageLoad(generation);
  const commitCurrent = () => shouldCommit() && isCurrentLoad();

  const result = await fetchAccountsPageWithRetries(params, commitCurrent);
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

  if (!result.groups.data) {
    setAccountsPageError(apiErrorMessage(result.groups.error));
    return;
  }

  setAccountsPage({
    accounts: result.accounts.data.accounts,
    balances: result.balances.data.balances,
    groups: result.groups.data.groups,
    key: accountsPageKey(params),
  });
};

export const refreshAccountsPage = async (): Promise<void> => {
  const params = currentAccountsPageParams;
  await loadAccountsPage(nextAccountsPageLoadGeneration(params), params);
};

export const refreshAccountsAfterMutation = async (options?: {
  readonly account?: Account;
  readonly bulk?: boolean;
  readonly preserveAccountHeader?: boolean;
  readonly registerAccountId?: number;
  readonly templateCompatibilityChanged?: boolean;
}): Promise<void> => {
  if (options?.account && options.preserveAccountHeader) {
    mergeAccountHeaderAccount(options.account);
  } else {
    invalidateAccountHeaders();
  }
  if (options?.bulk) {
    invalidateAllAccountRegisterPages();
    invalidateAllAccountTransactionCache();
    invalidateTransactionPages();
  } else if (options?.registerAccountId !== undefined) {
    invalidateAccountRegisterPages(options.registerAccountId);
  }
  if (options?.templateCompatibilityChanged) {
    invalidateTransactionTemplates();
  }
  await refreshAccountsPage();
  await Promise.all([
    refreshFeaturedBalances(),
    refreshOverview(),
    refreshLedgerLookups(),
  ]);
};

export const useAccountsResource = (
  requestedParams: AccountsManagementParams = defaultAccountsPageParams,
) => {
  const accountsPage = useAccountsPageView();
  const mountedRef = useRef(false);
  const params = normalizedAccountsPageParams(requestedParams);
  const key = accountsPageKey(params);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const snapshot = getAccountsSnapshot();
    currentAccountsPageParams = params;
    if (snapshot.snapshot?.key === key && !snapshot.stale) {
      if (
        snapshot.requestKey !== key &&
        (snapshot.loading || snapshot.errorMessage)
      ) {
        accountsPageLoadGeneration += 1;
        setAccountsPageFromCache(key);
      }
      return;
    }
    if (
      snapshot.requestKey === key &&
      (snapshot.loading || snapshot.errorMessage)
    ) {
      return;
    }

    const generation = nextAccountsPageLoadGeneration(params);

    void loadAccountsPage(generation, params, () => mountedRef.current);
  }, [
    accountsPage.errorMessage,
    accountsPage.loading,
    accountsPage.snapshot,
    accountsPage.stale,
    key,
  ]);

  return accountsPage;
};

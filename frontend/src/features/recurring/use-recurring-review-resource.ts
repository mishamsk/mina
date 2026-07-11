import { useCallback, useEffect, useState } from "react";

import {
  apiErrorMessage,
  fetchRecurringReviewPage,
  type RecurringDefinition,
  type RecurringOccurrence,
  type Transaction,
} from "@/api";
import { refreshFeaturedBalances } from "@/features/featured-balances";
import { refreshOverview } from "@/features/overview";
import {
  invalidateAccountHeaders,
  invalidateAllAccountRegisterPages,
  invalidateAllAccountTransactionCache,
  invalidateGroupRegisterPages,
  invalidateTransactionPages,
} from "@/store";

export interface RecurringReviewSnapshot {
  readonly definitions: readonly RecurringDefinition[];
  readonly occurrences: readonly RecurringOccurrence[];
  readonly transactions: readonly Transaction[];
}

interface RecurringReviewState {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly snapshot: RecurringReviewSnapshot | undefined;
}

let recurringReviewLoadGeneration = 0;

const nextRecurringReviewLoadGeneration = (): number => {
  recurringReviewLoadGeneration += 1;
  return recurringReviewLoadGeneration;
};

const unexpectedRecurringReviewLoadError = (error: unknown) => ({
  data: undefined,
  error: {
    error: {
      code: "internal_error" as const,
      message:
        error instanceof Error ? error.message : "The API request failed.",
    },
  },
});

const fetchRecurringReviewPageResult = async (): Promise<
  Awaited<ReturnType<typeof fetchRecurringReviewPage>>
> => {
  try {
    return await fetchRecurringReviewPage();
  } catch (error) {
    return {
      definitionError: undefined,
      definitions: [],
      occurrences: unexpectedRecurringReviewLoadError(error),
      transactionError: undefined,
      transactions: [],
    };
  }
};

const loadRecurringReviewPage = async (
  generation: number,
  commit: (nextState: RecurringReviewState) => void,
  shouldCommit: () => boolean,
): Promise<boolean> => {
  const commitCurrent = () =>
    shouldCommit() && generation === recurringReviewLoadGeneration;
  const result = await fetchRecurringReviewPageResult();
  if (!commitCurrent()) {
    return false;
  }

  if (!result.occurrences.data) {
    commit({
      errorMessage: apiErrorMessage(result.occurrences.error),
      loading: false,
      snapshot: undefined,
    });
    return false;
  }

  if (result.definitionError) {
    commit({
      errorMessage: apiErrorMessage(result.definitionError),
      loading: false,
      snapshot: undefined,
    });
    return false;
  }

  if (result.transactionError) {
    commit({
      errorMessage: apiErrorMessage(result.transactionError),
      loading: false,
      snapshot: undefined,
    });
    return false;
  }

  const expectedOccurrences = result.occurrences.data.recurring_occurrences
    .filter((occurrence) => occurrence.status === "expected")
    .sort((left, right) =>
      left.scheduled_date.localeCompare(right.scheduled_date),
    );
  commit({
    errorMessage: undefined,
    loading: false,
    snapshot: {
      definitions: result.definitions,
      occurrences: expectedOccurrences,
      transactions: result.transactions,
    },
  });
  return true;
};

export const refreshRecurringAfterOccurrenceMutation = async (
  refreshReviewPage: () => Promise<boolean>,
): Promise<boolean> => {
  invalidateTransactionPages();
  invalidateAccountHeaders();
  invalidateAllAccountRegisterPages();
  invalidateAllAccountTransactionCache();
  invalidateGroupRegisterPages();

  const reviewRefreshed = await refreshReviewPage();
  await Promise.all([refreshFeaturedBalances(), refreshOverview()]);
  return reviewRefreshed;
};

export const useRecurringReviewResource = () => {
  const [state, setState] = useState<RecurringReviewState>({
    errorMessage: undefined,
    loading: true,
    snapshot: undefined,
  });

  const refresh = useCallback(async (): Promise<boolean> => {
    const generation = nextRecurringReviewLoadGeneration();
    setState((current) => ({
      ...current,
      errorMessage: undefined,
      loading: true,
    }));

    return loadRecurringReviewPage(generation, setState, () => true);
  }, []);

  useEffect(() => {
    let active = true;
    const generation = nextRecurringReviewLoadGeneration();
    void loadRecurringReviewPage(generation, setState, () => active);
    return () => {
      active = false;
      recurringReviewLoadGeneration += 1;
    };
  }, []);

  return { ...state, refresh };
};

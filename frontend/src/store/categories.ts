import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { Category, CategoryEconomicIntent, GroupState } from "@/api";

import { createSelectors } from "./selectors";

export type CategoriesPageKey = CategoryEconomicIntent | "all";

export interface CategoriesPageSnapshot {
  readonly categories: readonly Category[];
  readonly groups: readonly GroupState[];
  readonly key: CategoriesPageKey;
  readonly loadedAt: string;
}

interface CategoriesState {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly requestKey: CategoriesPageKey | undefined;
  readonly snapshot: CategoriesPageSnapshot | undefined;
  readonly stale: boolean;
}

const initialCategoriesState: CategoriesState = {
  errorMessage: undefined,
  loading: false,
  requestKey: undefined,
  snapshot: undefined,
  stale: false,
};

const categoriesStore = create<CategoriesState>()(
  devtools(() => initialCategoriesState, { name: "CategoriesStore" }),
);

export const useCategoriesStore = createSelectors(categoriesStore);

export const useCategoriesPageView = () =>
  useCategoriesStore(
    useShallow((state) => ({
      errorMessage: state.errorMessage,
      loading: state.loading,
      requestKey: state.requestKey,
      snapshot: state.snapshot,
      stale: state.stale,
    })),
  );

export const getCategoriesSnapshot = (): CategoriesState =>
  useCategoriesStore.getState();

export const setCategoriesPageLoading = (key: CategoriesPageKey): void => {
  useCategoriesStore.setState(
    {
      errorMessage: undefined,
      loading: true,
      requestKey: key,
    },
    false,
    "CategoriesStore/setCategoriesPageLoading",
  );
};

export const clearCategoriesPageLoading = (): void => {
  useCategoriesStore.setState(
    {
      loading: false,
      requestKey: undefined,
    },
    false,
    "CategoriesStore/clearCategoriesPageLoading",
  );
};

export const setCategoriesPageFromCache = (key: CategoriesPageKey): void => {
  useCategoriesStore.setState(
    {
      errorMessage: undefined,
      loading: false,
      requestKey: key,
    },
    false,
    "CategoriesStore/setCategoriesPageFromCache",
  );
};

export const setCategoriesPage = (
  snapshot: Omit<CategoriesPageSnapshot, "loadedAt">,
): void => {
  useCategoriesStore.setState(
    {
      errorMessage: undefined,
      loading: false,
      requestKey: snapshot.key,
      snapshot: {
        ...snapshot,
        loadedAt: new Date().toISOString(),
      },
      stale: false,
    },
    false,
    "CategoriesStore/setCategoriesPage",
  );
};

export const setCategoriesPageError = (errorMessage: string): void => {
  useCategoriesStore.setState(
    {
      errorMessage,
      loading: false,
    },
    false,
    "CategoriesStore/setCategoriesPageError",
  );
};

export const invalidateCategoriesPage = (): void => {
  useCategoriesStore.setState(
    {
      errorMessage: undefined,
      loading: false,
      stale: true,
    },
    false,
    "CategoriesStore/invalidateCategoriesPage",
  );
};

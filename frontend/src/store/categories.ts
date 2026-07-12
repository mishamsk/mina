import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { Category, GroupState } from "@/api";

import { createSelectors } from "./selectors";

export interface CategoriesPageSnapshot {
  readonly categories: readonly Category[];
  readonly groups: readonly GroupState[];
  readonly loadedAt: string;
}

interface CategoriesState {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly snapshot: CategoriesPageSnapshot | undefined;
  readonly stale: boolean;
}

const initialCategoriesState: CategoriesState = {
  errorMessage: undefined,
  loading: false,
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
      snapshot: state.snapshot,
      stale: state.stale,
    })),
  );

export const getCategoriesSnapshot = (): CategoriesState =>
  useCategoriesStore.getState();

export const setCategoriesPageLoading = (): void => {
  useCategoriesStore.setState(
    {
      errorMessage: undefined,
      loading: true,
    },
    false,
    "CategoriesStore/setCategoriesPageLoading",
  );
};

export const clearCategoriesPageLoading = (): void => {
  useCategoriesStore.setState(
    {
      loading: false,
    },
    false,
    "CategoriesStore/clearCategoriesPageLoading",
  );
};

export const setCategoriesPage = (
  snapshot: Omit<CategoriesPageSnapshot, "loadedAt">,
): void => {
  useCategoriesStore.setState(
    {
      errorMessage: undefined,
      loading: false,
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

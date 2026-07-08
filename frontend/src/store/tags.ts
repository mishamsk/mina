import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { GroupState, Tag } from "@/api";

import { createSelectors } from "./selectors";

export interface TagsPageSnapshot {
  readonly groups: readonly GroupState[];
  readonly loadedAt: string;
  readonly tags: readonly Tag[];
}

interface TagsState {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly snapshot: TagsPageSnapshot | undefined;
}

const initialTagsState: TagsState = {
  errorMessage: undefined,
  loading: false,
  snapshot: undefined,
};

const tagsStore = create<TagsState>()(
  devtools(() => initialTagsState, { name: "TagsStore" }),
);

export const useTagsStore = createSelectors(tagsStore);

export const useTagsPageView = () =>
  useTagsStore(
    useShallow((state) => ({
      errorMessage: state.errorMessage,
      loading: state.loading,
      snapshot: state.snapshot,
    })),
  );

export const getTagsSnapshot = (): TagsState => useTagsStore.getState();

export const setTagsPageLoading = (): void => {
  useTagsStore.setState(
    {
      errorMessage: undefined,
      loading: true,
    },
    false,
    "TagsStore/setTagsPageLoading",
  );
};

export const clearTagsPageLoading = (): void => {
  useTagsStore.setState(
    {
      loading: false,
    },
    false,
    "TagsStore/clearTagsPageLoading",
  );
};

export const setTagsPage = (
  snapshot: Omit<TagsPageSnapshot, "loadedAt">,
): void => {
  useTagsStore.setState(
    {
      errorMessage: undefined,
      loading: false,
      snapshot: {
        ...snapshot,
        loadedAt: new Date().toISOString(),
      },
    },
    false,
    "TagsStore/setTagsPage",
  );
};

export const setTagsPageError = (errorMessage: string): void => {
  useTagsStore.setState(
    {
      errorMessage,
      loading: false,
    },
    false,
    "TagsStore/setTagsPageError",
  );
};

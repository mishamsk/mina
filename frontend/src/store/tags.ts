import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { GroupState, Tag } from "@/api";

import { createSelectors } from "./selectors";

export interface TagsPageSnapshot {
  readonly groups: readonly GroupState[];
  readonly key: string;
  readonly loadedAt: string;
  readonly tags: readonly Tag[];
}

interface TagsState {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly requestKey: string | undefined;
  readonly snapshot: TagsPageSnapshot | undefined;
  readonly stale: boolean;
}

const initialTagsState: TagsState = {
  errorMessage: undefined,
  loading: false,
  requestKey: undefined,
  snapshot: undefined,
  stale: false,
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
      requestKey: state.requestKey,
      snapshot: state.snapshot,
      stale: state.stale,
    })),
  );

export const getTagsSnapshot = (): TagsState => useTagsStore.getState();

export const setTagsPageLoading = (key: string): void => {
  useTagsStore.setState(
    {
      errorMessage: undefined,
      loading: true,
      requestKey: key,
    },
    false,
    "TagsStore/setTagsPageLoading",
  );
};

export const clearTagsPageLoading = (): void => {
  useTagsStore.setState(
    {
      loading: false,
      requestKey: undefined,
    },
    false,
    "TagsStore/clearTagsPageLoading",
  );
};

export const setTagsPageFromCache = (key: string): void => {
  useTagsStore.setState(
    {
      errorMessage: undefined,
      loading: false,
      requestKey: key,
    },
    false,
    "TagsStore/setTagsPageFromCache",
  );
};

export const setTagsPage = (
  snapshot: Omit<TagsPageSnapshot, "loadedAt">,
): void => {
  useTagsStore.setState(
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

export const invalidateTagsPage = (): void => {
  useTagsStore.setState(
    {
      errorMessage: undefined,
      loading: false,
      stale: true,
    },
    false,
    "TagsStore/invalidateTagsPage",
  );
};

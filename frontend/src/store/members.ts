import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { Member } from "@/api";

import { createSelectors } from "./selectors";

export interface MembersPageSnapshot {
  readonly includeHidden: boolean;
  readonly loadedAt: string;
  readonly members: readonly Member[];
}

interface MembersState {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly snapshot: MembersPageSnapshot | undefined;
  readonly stale: boolean;
}

const initialMembersState: MembersState = {
  errorMessage: undefined,
  loading: false,
  snapshot: undefined,
  stale: false,
};

const membersStore = create<MembersState>()(
  devtools(() => initialMembersState, { name: "MembersStore" }),
);

export const useMembersStore = createSelectors(membersStore);

export const useMembersPageView = () =>
  useMembersStore(
    useShallow((state) => ({
      errorMessage: state.errorMessage,
      loading: state.loading,
      snapshot: state.snapshot,
      stale: state.stale,
    })),
  );

export const getMembersSnapshot = (): MembersState =>
  useMembersStore.getState();

export const setMembersPageLoading = (): void => {
  useMembersStore.setState(
    {
      errorMessage: undefined,
      loading: true,
    },
    false,
    "MembersStore/setMembersPageLoading",
  );
};

export const clearMembersPageLoading = (): void => {
  useMembersStore.setState(
    {
      loading: false,
    },
    false,
    "MembersStore/clearMembersPageLoading",
  );
};

export const setMembersPage = (
  snapshot: Omit<MembersPageSnapshot, "loadedAt">,
): void => {
  useMembersStore.setState(
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
    "MembersStore/setMembersPage",
  );
};

export const setMembersPageError = (errorMessage: string): void => {
  useMembersStore.setState(
    {
      errorMessage,
      loading: false,
    },
    false,
    "MembersStore/setMembersPageError",
  );
};

export const invalidateMembersPage = (): void => {
  useMembersStore.setState(
    {
      errorMessage: undefined,
      loading: false,
      stale: true,
    },
    false,
    "MembersStore/invalidateMembersPage",
  );
};

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { TransactionTemplate } from "@/api";

import { createSelectors } from "./selectors";

export interface TransactionTemplatesSnapshot {
  readonly loadedAt: string;
  readonly templates: readonly TransactionTemplate[];
}

interface TransactionTemplatesState {
  readonly errorMessage: string | undefined;
  readonly invalidationVersion: number;
  readonly loading: boolean;
  readonly mutationVersion: number;
  readonly snapshot: TransactionTemplatesSnapshot | undefined;
}

const initialTransactionTemplatesState: TransactionTemplatesState = {
  errorMessage: undefined,
  invalidationVersion: 0,
  loading: false,
  mutationVersion: 0,
  snapshot: undefined,
};

const transactionTemplatesStore = create<TransactionTemplatesState>()(
  devtools(() => initialTransactionTemplatesState, {
    name: "TransactionTemplatesStore",
  }),
);

let transactionTemplatesLoadGeneration = 0;

export const useTransactionTemplatesStore = createSelectors(
  transactionTemplatesStore,
);

export const useTransactionTemplatesView = () =>
  useTransactionTemplatesStore(
    useShallow((state) => ({
      errorMessage: state.errorMessage,
      invalidationVersion: state.invalidationVersion,
      loading: state.loading,
      mutationVersion: state.mutationVersion,
      snapshot: state.snapshot,
    })),
  );

export const getTransactionTemplatesSnapshot = (): TransactionTemplatesState =>
  useTransactionTemplatesStore.getState();

export const startTransactionTemplatesLoad = (): number => {
  transactionTemplatesLoadGeneration += 1;
  setTransactionTemplatesLoading();
  return transactionTemplatesLoadGeneration;
};

export const isCurrentTransactionTemplatesLoad = (
  generation: number,
): boolean => generation === transactionTemplatesLoadGeneration;

export const setTransactionTemplatesLoading = (): void => {
  useTransactionTemplatesStore.setState(
    { errorMessage: undefined, loading: true },
    false,
    "TransactionTemplatesStore/setTransactionTemplatesLoading",
  );
};

export const invalidateTransactionTemplates = (): void => {
  transactionTemplatesLoadGeneration += 1;
  useTransactionTemplatesStore.setState(
    (state) => ({
      errorMessage: undefined,
      invalidationVersion: state.invalidationVersion + 1,
      loading: false,
      snapshot: undefined,
    }),
    false,
    "TransactionTemplatesStore/invalidateTransactionTemplates",
  );
};

export const setTransactionTemplates = (
  templates: readonly TransactionTemplate[],
): void => {
  useTransactionTemplatesStore.setState(
    {
      errorMessage: undefined,
      loading: false,
      snapshot: {
        loadedAt: new Date().toISOString(),
        templates,
      },
    },
    false,
    "TransactionTemplatesStore/setTransactionTemplates",
  );
};

export const setTransactionTemplatesError = (errorMessage: string): void => {
  useTransactionTemplatesStore.setState(
    { errorMessage, loading: false },
    false,
    "TransactionTemplatesStore/setTransactionTemplatesError",
  );
};

const updateTransactionTemplates = (
  update: (
    templates: readonly TransactionTemplate[],
  ) => readonly TransactionTemplate[],
  action: string,
): void => {
  useTransactionTemplatesStore.setState(
    (state) => ({
      errorMessage: undefined,
      mutationVersion: state.mutationVersion + 1,
      snapshot: state.snapshot
        ? {
            loadedAt: new Date().toISOString(),
            templates: update(state.snapshot.templates),
          }
        : undefined,
    }),
    false,
    action,
  );
};

export const upsertTransactionTemplate = (
  template: TransactionTemplate,
): void => {
  updateTransactionTemplates(
    (templates) =>
      [
        ...templates.filter(
          (candidate) =>
            candidate.transaction_template_id !==
            template.transaction_template_id,
        ),
        template,
      ].sort((left, right) => left.fqn.localeCompare(right.fqn)),
    "TransactionTemplatesStore/upsertTransactionTemplate",
  );
};

export const removeTransactionTemplate = (templateId: number): void => {
  updateTransactionTemplates(
    (templates) =>
      templates.filter(
        (template) => template.transaction_template_id !== templateId,
      ),
    "TransactionTemplatesStore/removeTransactionTemplate",
  );
};

export const restructureTransactionTemplates = (
  fromFqn: string,
  toFqn: string,
): void => {
  const descendantPrefix = `${fromFqn}:`;
  updateTransactionTemplates(
    (templates) =>
      templates
        .map((template) => {
          if (
            template.fqn !== fromFqn &&
            !template.fqn.startsWith(descendantPrefix)
          ) {
            return template;
          }
          const fqn = `${toFqn}${template.fqn.slice(fromFqn.length)}`;
          const segments = fqn.split(":");
          return {
            ...template,
            fqn,
            level: segments.length - 1,
            name: segments.at(-1) ?? fqn,
            parent_fqn:
              segments.length > 1 ? segments.slice(0, -1).join(":") : null,
          };
        })
        .sort((left, right) => left.fqn.localeCompare(right.fqn)),
    "TransactionTemplatesStore/restructureTransactionTemplates",
  );
};

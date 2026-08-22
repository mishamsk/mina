import { useCallback, useEffect, useState } from "react";

import {
  apiErrorDetails,
  apiErrorMessage,
  getRecurringDefinition,
  getRecurringOccurrence,
  type RecurringDefinition,
  type Transaction,
} from "@/api";

import { recurringDefinitionMutationEvent } from "./use-transactions-resource";

export interface RecurringDefinitionProvenance {
  readonly definitionActive: boolean;
  readonly definitionFqn: string;
  readonly definitionId: number;
}

export interface RecurringDefinitionProvenanceView {
  readonly applicable: boolean;
  readonly errorDetails: string | undefined;
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly provenance: RecurringDefinitionProvenance | undefined;
  readonly projectionDefinition: RecurringDefinition | undefined;
  readonly retry: () => void;
}

interface ProvenanceState {
  readonly errorDetails: string | undefined;
  readonly errorMessage: string | undefined;
  readonly key: ProvenanceKey;
  readonly provenance: RecurringDefinitionProvenance | undefined;
  readonly projectionDefinition: RecurringDefinition | undefined;
}

type ProvenanceKey = `occurrence:${number}` | `projection:${number}`;

interface ProvenanceResult {
  readonly error: unknown;
  readonly provenance: RecurringDefinitionProvenance | undefined;
  readonly projectionDefinition: RecurringDefinition | undefined;
}

const provenanceKey = (transaction: Transaction): ProvenanceKey | undefined => {
  if (transaction.recurring_occurrence_id != null) {
    return `occurrence:${transaction.recurring_occurrence_id}`;
  }
  if (transaction.recurring_projection_definition_id != null) {
    return `projection:${transaction.recurring_projection_definition_id}`;
  }
  return undefined;
};

const loadProvenance = async (
  key: ProvenanceKey,
): Promise<ProvenanceResult> => {
  const [kind, rawId] = key.split(":");
  const id = Number(rawId);
  if (kind === "occurrence") {
    const result = await getRecurringOccurrence({
      path: { recurring_occurrence_id: id },
    });
    return {
      error: result.error,
      provenance: result.data
        ? {
            definitionActive: result.data.recurring_definition_active,
            definitionFqn: result.data.recurring_definition_fqn,
            definitionId: result.data.recurring_definition_id,
          }
        : undefined,
      projectionDefinition: undefined,
    };
  }

  const result = await getRecurringDefinition({
    path: { recurring_definition_id: id },
  });
  return {
    error: result.error,
    provenance: result.data
      ? {
          definitionActive: true,
          definitionFqn: result.data.fqn,
          definitionId: result.data.recurring_definition_id,
        }
      : undefined,
    projectionDefinition: result.data,
  };
};

export const useRecurringDefinitionProvenance = (
  transaction: Transaction | undefined,
): RecurringDefinitionProvenanceView => {
  const key = transaction ? provenanceKey(transaction) : undefined;
  const [state, setState] = useState<ProvenanceState>();
  const [retryGeneration, setRetryGeneration] = useState(0);

  const retry = useCallback(() => {
    if (!key) {
      return;
    }
    setState((current) => (current?.key === key ? undefined : current));
    setRetryGeneration((current) => current + 1);
  }, [key]);

  useEffect(() => {
    if (!key) {
      return;
    }
    const refresh = () => {
      setRetryGeneration((current) => current + 1);
    };
    window.addEventListener(recurringDefinitionMutationEvent, refresh);
    return () => {
      window.removeEventListener(recurringDefinitionMutationEvent, refresh);
    };
  }, [key]);

  useEffect(() => {
    if (!key) {
      return;
    }

    let active = true;
    const load = async () => {
      const result = await loadProvenance(key);
      if (!active) {
        return;
      }
      setState({
        errorDetails: result.provenance
          ? undefined
          : apiErrorDetails(
              result.error,
              "Recurring definition could not be loaded.",
            ),
        errorMessage: result.provenance
          ? undefined
          : apiErrorMessage(
              result.error,
              "Recurring definition could not be loaded.",
            ),
        key,
        provenance: result.provenance,
        projectionDefinition: result.projectionDefinition,
      });
    };

    void load();
    return () => {
      active = false;
    };
  }, [key, retryGeneration]);

  if (!key) {
    return {
      applicable: false,
      errorDetails: undefined,
      errorMessage: undefined,
      loading: false,
      provenance: undefined,
      projectionDefinition: undefined,
      retry,
    };
  }

  const current = state?.key === key ? state : undefined;
  return {
    applicable: true,
    errorDetails: current?.errorDetails,
    errorMessage: current?.errorMessage,
    loading: current === undefined,
    provenance: current?.provenance,
    projectionDefinition: current?.projectionDefinition,
    retry,
  };
};

import { useCallback, useEffect, useState } from "react";

import {
  apiErrorMessage,
  getRecurringDefinition,
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
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly provenance: RecurringDefinitionProvenance | undefined;
  readonly projectionDefinition: RecurringDefinition | undefined;
  readonly retry: () => void;
}

interface ProjectionState {
  readonly definitionId: number;
  readonly errorMessage: string | undefined;
  readonly projectionDefinition: RecurringDefinition | undefined;
}

const directProvenance = (
  transaction: Transaction | undefined,
): RecurringDefinitionProvenance | undefined => {
  if (
    transaction?.recurring_definition_id == null ||
    transaction.recurring_definition_fqn == null ||
    transaction.recurring_definition_active == null
  ) {
    return undefined;
  }
  return {
    definitionActive: transaction.recurring_definition_active,
    definitionFqn: transaction.recurring_definition_fqn,
    definitionId: transaction.recurring_definition_id,
  };
};

export const useRecurringDefinitionProvenance = (
  transaction: Transaction | undefined,
): RecurringDefinitionProvenanceView => {
  const responseProvenance = directProvenance(transaction);
  const projectionDefinitionId =
    transaction?.transaction_id != null &&
    transaction.transaction_id < 0 &&
    transaction.recurring_projection_is_next === true
      ? transaction.recurring_definition_id
      : undefined;
  const [state, setState] = useState<ProjectionState>();
  const [retryGeneration, setRetryGeneration] = useState(0);

  const retry = useCallback(() => {
    if (projectionDefinitionId != null) {
      setState((current) =>
        current?.definitionId === projectionDefinitionId ? undefined : current,
      );
      setRetryGeneration((current) => current + 1);
    }
  }, [projectionDefinitionId]);

  useEffect(() => {
    if (projectionDefinitionId == null) return;
    const refresh = () => {
      setRetryGeneration((current) => current + 1);
    };
    window.addEventListener(recurringDefinitionMutationEvent, refresh);
    return () =>
      window.removeEventListener(recurringDefinitionMutationEvent, refresh);
  }, [projectionDefinitionId]);

  useEffect(() => {
    if (projectionDefinitionId == null) return;
    let active = true;
    void getRecurringDefinition({
      path: { recurring_definition_id: projectionDefinitionId },
    }).then((result) => {
      if (!active) return;
      setState({
        definitionId: projectionDefinitionId,
        errorMessage: result.data
          ? undefined
          : apiErrorMessage(
              result.error,
              "Recurring definition could not be loaded.",
            ),
        projectionDefinition: result.data,
      });
    });
    return () => {
      active = false;
    };
  }, [projectionDefinitionId, retryGeneration]);

  const current =
    state?.definitionId === projectionDefinitionId ? state : undefined;
  return {
    applicable: responseProvenance !== undefined,
    errorMessage: current?.errorMessage,
    loading: projectionDefinitionId != null && current === undefined,
    provenance: responseProvenance,
    projectionDefinition: current?.projectionDefinition,
    retry,
  };
};

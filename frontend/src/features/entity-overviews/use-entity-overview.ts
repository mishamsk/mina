import { useCallback, useEffect, useRef, useState } from "react";

import type {
  EntityOverviewRequest,
  HouseholdFlowDataset,
  HouseholdFlowEntityResponse,
} from "@/api";
import {
  apiErrorMessage,
  fetchEntityOverview,
  householdFlowSelectionFromDataset,
} from "@/api";
import { transactionEntrySavedEvent } from "@/features/ledger";

interface EntityOverviewState {
  readonly errorMessage?: string;
  readonly notFound?: boolean;
  readonly report?: HouseholdFlowEntityResponse;
  readonly requestKey: string;
}

export const useEntityOverview = (
  request: EntityOverviewRequest | undefined,
) => {
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<EntityOverviewState>({ requestKey: "" });
  const reportRef = useRef<
    | {
        readonly report: HouseholdFlowEntityResponse;
        readonly requestKey: string;
      }
    | undefined
  >(undefined);
  const requestKey = request
    ? `${request.entityKind}:${request.scopeKind}:${"entityId" in request ? request.entityId : request.fqn}`
    : "invalid";
  const entityKind = request?.entityKind;
  const scopeKind = request?.scopeKind;
  const entityId =
    request && "entityId" in request ? request.entityId : undefined;
  const fqn = request && "fqn" in request ? request.fqn : undefined;
  const refresh = useCallback(() => {
    setState((current) =>
      current.requestKey === requestKey && current.report
        ? { ...current, errorMessage: undefined }
        : current,
    );
    setRetryToken((current) => current + 1);
  }, [requestKey]);

  useEffect(() => {
    let currentRequest: EntityOverviewRequest | undefined;
    if (entityKind === "category" && scopeKind === "leaf" && entityId) {
      currentRequest = { entityId, entityKind, scopeKind };
    } else if (entityKind === "tag" && scopeKind === "leaf" && entityId) {
      currentRequest = { entityId, entityKind, scopeKind };
    } else if (entityKind === "category" && scopeKind === "group" && fqn) {
      currentRequest = { entityKind, fqn, scopeKind };
    } else if (entityKind === "tag" && scopeKind === "group" && fqn) {
      currentRequest = { entityKind, fqn, scopeKind };
    }
    if (!currentRequest) {
      return;
    }

    let active = true;
    const previousReport =
      reportRef.current?.requestKey === requestKey
        ? reportRef.current.report
        : undefined;
    void fetchEntityOverview(
      currentRequest,
      previousReport
        ? householdFlowSelectionFromDataset(previousReport.dataset)
        : undefined,
    ).then((result) => {
      if (!active) {
        return;
      }
      if (result.data) {
        reportRef.current = { report: result.data, requestKey };
        setState({ report: result.data, requestKey });
      } else if (result.response?.status === 404) {
        setState({ notFound: true, requestKey });
      } else {
        setState((current) =>
          current.requestKey === requestKey && current.report
            ? {
                ...current,
                errorMessage: apiErrorMessage(result.error),
                notFound: false,
              }
            : {
                errorMessage: apiErrorMessage(result.error),
                requestKey,
              },
        );
      }
    });

    return () => {
      active = false;
    };
  }, [entityId, entityKind, fqn, requestKey, retryToken, scopeKind]);

  useEffect(() => {
    window.addEventListener(transactionEntrySavedEvent, refresh);
    return () => {
      window.removeEventListener(transactionEntrySavedEvent, refresh);
    };
  }, [refresh]);

  const setFlowReportDataset = useCallback(
    (dataset: HouseholdFlowDataset): void => {
      setState((currentState) => {
        if (currentState.requestKey !== requestKey || !currentState.report) {
          return currentState;
        }
        const report = { ...currentState.report, dataset };
        reportRef.current = { report, requestKey };
        return { ...currentState, report };
      });
    },
    [requestKey],
  );

  const current = state.requestKey === requestKey ? state : undefined;
  return {
    errorMessage: current?.errorMessage,
    loading: Boolean(request && !current),
    notFound: current?.notFound ?? false,
    report: current?.report,
    retry: refresh,
    setFlowReportDataset,
  };
};

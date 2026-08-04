import { useEffect, useRef } from "react";

import { apiErrorDetails, fetchAllTransactionTemplates } from "@/api";
import {
  getTransactionTemplatesSnapshot,
  isCurrentTransactionTemplatesLoad,
  setTransactionTemplates,
  setTransactionTemplatesError,
  startTransactionTemplatesLoad,
  useTransactionTemplatesView,
} from "@/store";

const loadTransactionTemplates = async (
  generation: number,
): Promise<boolean> => {
  const result = await fetchAllTransactionTemplates();
  if (!isCurrentTransactionTemplatesLoad(generation)) {
    return true;
  }
  if (!result.data) {
    setTransactionTemplatesError(
      apiErrorDetails(
        result.error,
        "Transaction templates could not be loaded.",
      ),
    );
    return false;
  }
  setTransactionTemplates(result.data.transaction_templates);
  return true;
};

export const refreshTransactionTemplates = async (): Promise<boolean> =>
  loadTransactionTemplates(startTransactionTemplatesLoad());

export const useTransactionTemplatesResource = (enabled = true) => {
  const resource = useTransactionTemplatesView();
  const attemptedInvalidationVersionRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      attemptedInvalidationVersionRef.current = undefined;
      return;
    }
    const snapshot = getTransactionTemplatesSnapshot();
    if (snapshot.loading) {
      return;
    }
    if (
      (snapshot.snapshot && !snapshot.errorMessage) ||
      attemptedInvalidationVersionRef.current === resource.invalidationVersion
    ) {
      return;
    }
    attemptedInvalidationVersionRef.current = resource.invalidationVersion;
    const generation = startTransactionTemplatesLoad();
    void loadTransactionTemplates(generation);
  }, [
    enabled,
    resource.errorMessage,
    resource.invalidationVersion,
    resource.loading,
    resource.snapshot,
  ]);

  return resource;
};

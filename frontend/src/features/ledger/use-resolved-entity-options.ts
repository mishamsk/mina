import { useEffect, useMemo, useState } from "react";

import type { EntityOption } from "./entity-picker";

type EntityOptionResolver = (
  ids: readonly number[],
) => Promise<readonly EntityOption[]>;

const aggregateLookupGracePeriodMilliseconds = 250;

const mergeOptions = (
  base: readonly EntityOption[],
  retained: readonly EntityOption[],
): readonly EntityOption[] => {
  const byId = new Map(base.map((option) => [option.id, option]));
  for (const option of retained) {
    byId.set(option.id, option);
  }
  return [...byId.values()];
};

export const useResolvedEntityOptions = (
  selectedIds: readonly number[],
  baseOptions: readonly EntityOption[],
  resolveOptions: EntityOptionResolver,
  baseOptionsPending = false,
): readonly EntityOption[] => {
  const baseOptionIds = new Set(baseOptions.map((option) => option.id));
  const unresolvedSelectedIdsKey = [...new Set(selectedIds)]
    .filter((id) => !baseOptionIds.has(id))
    .sort((a, b) => a - b)
    .join(",");
  const [retainedOptions, setRetainedOptions] = useState<
    readonly EntityOption[]
  >([]);

  useEffect(() => {
    if (!unresolvedSelectedIdsKey) {
      return;
    }
    const ids = unresolvedSelectedIdsKey.split(",").map(Number);
    let active = true;
    const resolve = () => {
      void resolveOptions(ids)
        .then((options) => {
          if (active) {
            setRetainedOptions((current) => mergeOptions(current, options));
          }
        })
        .catch(() => undefined);
    };
    const timeout = baseOptionsPending
      ? window.setTimeout(resolve, aggregateLookupGracePeriodMilliseconds)
      : undefined;
    if (timeout === undefined) {
      resolve();
    }
    return () => {
      active = false;
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
    };
  }, [baseOptionsPending, resolveOptions, unresolvedSelectedIdsKey]);

  return useMemo(
    () => mergeOptions(baseOptions, retainedOptions),
    [baseOptions, retainedOptions],
  );
};

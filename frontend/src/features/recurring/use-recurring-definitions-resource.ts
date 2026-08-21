import { useCallback, useEffect, useState } from "react";

import {
  apiErrorMessage,
  listRecurringDefinitions,
  type RecurringDefinition,
} from "@/api";

export interface RecurringDefinitionsSnapshot {
  readonly definitions: readonly RecurringDefinition[];
}

interface RecurringDefinitionsState {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly snapshot: RecurringDefinitionsSnapshot | undefined;
}

const definitionsPageSize = 500;
const definitionsLoadAttemptLimit = 3;

let definitionsLoadGeneration = 0;
let mountedRefresh: (() => Promise<boolean>) | undefined;

const nextDefinitionsLoadGeneration = (): number => {
  definitionsLoadGeneration += 1;
  return definitionsLoadGeneration;
};

const fetchAllRecurringDefinitions = async () => {
  for (let attempt = 0; attempt < definitionsLoadAttemptLimit; attempt += 1) {
    const firstPage = await listRecurringDefinitions({
      query: {
        limit: definitionsPageSize,
        offset: 0,
        sort: "next_due_date",
        sort_dir: "asc",
      },
    });
    if (
      !firstPage.data ||
      firstPage.data.recurring_definitions.length >= firstPage.data.total_count
    ) {
      return firstPage;
    }

    const totalCount = firstPage.data.total_count;
    const definitions = [...firstPage.data.recurring_definitions];
    let consistentTotal = true;
    for (
      let offset = definitionsPageSize;
      offset < totalCount;
      offset += definitionsPageSize
    ) {
      const page = await listRecurringDefinitions({
        query: {
          limit: definitionsPageSize,
          offset,
          sort: "next_due_date",
          sort_dir: "asc",
        },
      });
      if (!page.data) {
        return page;
      }
      if (page.data.total_count !== totalCount) {
        consistentTotal = false;
        break;
      }
      definitions.push(...page.data.recurring_definitions);
    }

    const uniqueDefinitionCount = new Set(
      definitions.map((definition) => definition.recurring_definition_id),
    ).size;
    if (
      consistentTotal &&
      definitions.length === totalCount &&
      uniqueDefinitionCount === totalCount
    ) {
      return {
        ...firstPage,
        data: {
          ...firstPage.data,
          recurring_definitions: definitions,
        },
      };
    }
  }

  throw new Error("Recurring definitions changed while loading.");
};

const loadRecurringDefinitions = async (
  generation: number,
  commit: (state: RecurringDefinitionsState) => void,
  shouldCommit: () => boolean,
): Promise<boolean> => {
  try {
    const result = await fetchAllRecurringDefinitions();
    if (!shouldCommit() || generation !== definitionsLoadGeneration) {
      return false;
    }
    if (!result.data) {
      commit({
        errorMessage: apiErrorMessage(result.error),
        loading: false,
        snapshot: undefined,
      });
      return false;
    }
    commit({
      errorMessage: undefined,
      loading: false,
      snapshot: { definitions: result.data.recurring_definitions },
    });
    return true;
  } catch (error) {
    if (!shouldCommit() || generation !== definitionsLoadGeneration) {
      return false;
    }
    commit({
      errorMessage: apiErrorMessage(error),
      loading: false,
      snapshot: undefined,
    });
    return false;
  }
};

export const useRecurringDefinitionsResource = () => {
  const [state, setState] = useState<RecurringDefinitionsState>({
    errorMessage: undefined,
    loading: true,
    snapshot: undefined,
  });

  const refresh = useCallback(async (): Promise<boolean> => {
    const generation = nextDefinitionsLoadGeneration();
    setState((current) => ({
      ...current,
      errorMessage: undefined,
      loading: true,
    }));
    return loadRecurringDefinitions(generation, setState, () => true);
  }, []);

  useEffect(() => {
    let active = true;
    const generation = nextDefinitionsLoadGeneration();
    void loadRecurringDefinitions(generation, setState, () => active);
    return () => {
      active = false;
      definitionsLoadGeneration += 1;
    };
  }, []);

  useEffect(() => {
    mountedRefresh = refresh;
    return () => {
      if (mountedRefresh === refresh) {
        mountedRefresh = undefined;
      }
    };
  }, [refresh]);

  return { ...state, refresh };
};

export const refreshMountedRecurringDefinitions =
  async (): Promise<boolean> => {
    return mountedRefresh ? mountedRefresh() : true;
  };

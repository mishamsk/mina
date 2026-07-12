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

let definitionsLoadGeneration = 0;

const nextDefinitionsLoadGeneration = (): number => {
  definitionsLoadGeneration += 1;
  return definitionsLoadGeneration;
};

const fetchAllRecurringDefinitions = async () => {
  const firstPage = await listRecurringDefinitions({
    query: {
      limit: definitionsPageSize,
      offset: 0,
      sort: "fqn",
      sort_dir: "asc",
    },
  });
  if (
    !firstPage.data ||
    firstPage.data.recurring_definitions.length >= firstPage.data.total_count
  ) {
    return firstPage;
  }

  const definitions = [...firstPage.data.recurring_definitions];
  for (
    let offset = definitionsPageSize;
    offset < firstPage.data.total_count;
    offset += definitionsPageSize
  ) {
    const page = await listRecurringDefinitions({
      query: {
        limit: definitionsPageSize,
        offset,
        sort: "fqn",
        sort_dir: "asc",
      },
    });
    if (!page.data) {
      return page;
    }
    definitions.push(...page.data.recurring_definitions);
  }

  return {
    ...firstPage,
    data: {
      ...firstPage.data,
      recurring_definitions: definitions,
    },
  };
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

  return { ...state, refresh };
};

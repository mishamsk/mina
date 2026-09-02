import { ChevronRight, Close, EyeOff, Home, Plus } from "pixelarticons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface EntityOption {
  readonly accountType?: string;
  readonly currency?: string | null;
  readonly detail?: string;
  readonly hidden?: boolean;
  readonly id: number;
  readonly label: string;
  readonly metadata?: string;
  readonly searchLabel: string;
  readonly selectedLabel?: string;
}

export interface EntityPickerGroup {
  readonly childCount: number;
  readonly fqn: string;
  readonly parentFqn: string;
  readonly segment: string;
}

export interface EntityPickerLeafRow {
  readonly kind: "leaf";
  readonly option: EntityOption;
}

export interface EntityPickerGroupRow {
  readonly group: EntityPickerGroup;
  readonly kind: "group";
}

export type EntityPickerRow = EntityPickerLeafRow | EntityPickerGroupRow;

export interface EntityPickerLoadRequest {
  readonly excludedIds: readonly number[];
  readonly parentFqn: string | undefined;
  readonly query: string;
}

export interface EntityPickerLoadResult {
  readonly hasMore: boolean;
  readonly rows: readonly EntityPickerRow[];
}

export type EntityOptionLoader = (
  request: EntityPickerLoadRequest,
) => Promise<EntityPickerLoadResult>;

export type EntityCreationAvailabilityLoader = (
  fqn: string,
) => Promise<boolean>;

type CreateEntityOption = (fqn: string) => Promise<EntityOption>;

interface EntityPickerProps {
  readonly autoFocus?: boolean;
  readonly clearOnSelect?: boolean;
  readonly createOption?: CreateEntityOption;
  readonly disabled?: boolean;
  readonly excludedOptionIds?: readonly number[];
  readonly id: string;
  readonly hierarchical?: boolean;
  readonly label: string;
  readonly labelClassName?: string;
  readonly loadKey?: string | number;
  readonly loadCreationAvailability?: EntityCreationAvailabilityLoader;
  readonly loadOptions?: EntityOptionLoader;
  readonly onChange: (id: number | undefined, option?: EntityOption) => void;
  readonly onGroupSelect?: (fqn: string) => void;
  readonly onLoadedOptions?: (options: readonly EntityOption[]) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly openOnFocus?: boolean;
  readonly options?: readonly EntityOption[];
  readonly placeholder?: string;
  readonly preferredSide?: "bottom" | "top";
  readonly value: number | undefined;
  readonly selectedIds?: readonly number[];
  readonly selectedGroupFqns?: readonly string[];
}

type HierarchyGroup = EntityPickerGroup;
type PickerLeafRow = EntityPickerLeafRow;
type PickerGroupRow = EntityPickerGroupRow;

interface PickerCreateRow {
  readonly fqn: string;
  readonly kind: "create";
}

interface PickerGroupSelectionRow {
  readonly fqn: string;
  readonly kind: "group-selection";
}

type PickerRow =
  PickerLeafRow | PickerGroupRow | PickerCreateRow | PickerGroupSelectionRow;

interface QueryModel {
  readonly committedPrefix: string;
  readonly filter: string;
  readonly levelMode: boolean;
}

interface LoadedSearchSnapshot {
  readonly hasMore: boolean;
  readonly query: string;
  readonly requestKey: string;
  readonly rows: readonly EntityPickerRow[];
}

const searchDebounceMilliseconds = 200;
const searchLimit = 6;
const noLoadedRows: readonly EntityPickerRow[] = [];
const noSelectedIds: readonly number[] = [];

const normalized = (value: string): string => value.trim().toLocaleLowerCase();

const optionPresentation = (option: EntityOption): string =>
  option.label === option.searchLabel
    ? option.searchLabel
    : `${option.searchLabel} (${option.label})`;

interface EntityOptionPresentationProps {
  readonly className?: string;
  readonly expanded?: boolean;
  readonly option: EntityOption;
}

const EntityOptionPresentation = ({
  className,
  expanded = false,
  option,
}: EntityOptionPresentationProps) => (
  <span
    className={cn(
      "inline-flex max-w-full min-w-0 items-center font-mono",
      expanded && "flex-wrap",
      className,
    )}
  >
    <span
      data-testid="entity-picker-fqn"
      className={cn(
        "text-foreground min-w-0 font-medium",
        expanded ? "break-all whitespace-normal" : "truncate",
      )}
    >
      {option.searchLabel}
    </span>
    {option.label !== option.searchLabel ? (
      <span
        data-testid="entity-picker-display-title"
        className={cn(
          "text-muted-foreground min-w-0",
          expanded ? "break-all whitespace-normal" : "truncate",
        )}
      >
        {` (${option.label})`}
      </span>
    ) : null}
  </span>
);

const queryAfterPresentationEdit = (
  presentation: string,
  searchLabel: string,
  editedValue: string,
): string => {
  if (!presentation.startsWith(searchLabel)) {
    return editedValue;
  }
  let unchangedPrefixLength = 0;
  while (
    unchangedPrefixLength < presentation.length &&
    presentation[unchangedPrefixLength] === editedValue[unchangedPrefixLength]
  ) {
    unchangedPrefixLength += 1;
  }
  if (unchangedPrefixLength >= searchLabel.length) {
    return searchLabel;
  }
  let unchangedSuffixLength = 0;
  while (
    unchangedSuffixLength < presentation.length - unchangedPrefixLength &&
    unchangedSuffixLength < editedValue.length - unchangedPrefixLength &&
    presentation[presentation.length - unchangedSuffixLength - 1] ===
      editedValue[editedValue.length - unchangedSuffixLength - 1]
  ) {
    unchangedSuffixLength += 1;
  }
  const searchEditEnd = Math.min(
    searchLabel.length,
    Math.max(
      unchangedPrefixLength,
      presentation.length - unchangedSuffixLength,
    ),
  );
  return `${searchLabel.slice(0, unchangedPrefixLength)}${editedValue.slice(
    unchangedPrefixLength,
    editedValue.length - unchangedSuffixLength,
  )}${searchLabel.slice(searchEditEnd)}`;
};

const optionParentFqn = (option: EntityOption): string => {
  const separatorIndex = option.searchLabel.lastIndexOf(":");
  return separatorIndex < 0 ? "" : option.searchLabel.slice(0, separatorIndex);
};

const deriveGroups = (
  options: readonly EntityOption[],
): readonly HierarchyGroup[] => {
  const descendantCounts = new Map<string, number>();
  for (const option of options) {
    for (
      let separatorIndex = option.searchLabel.indexOf(":");
      separatorIndex >= 0;
      separatorIndex = option.searchLabel.indexOf(":", separatorIndex + 1)
    ) {
      const fqn = option.searchLabel.slice(0, separatorIndex);
      descendantCounts.set(fqn, (descendantCounts.get(fqn) ?? 0) + 1);
    }
  }

  return [...descendantCounts].map(([fqn, childCount]) => {
    const separatorIndex = fqn.lastIndexOf(":");
    return {
      childCount,
      fqn,
      parentFqn: separatorIndex < 0 ? "" : fqn.slice(0, separatorIndex),
      segment: separatorIndex < 0 ? fqn : fqn.slice(separatorIndex + 1),
    };
  });
};

const deriveQueryModel = (
  query: string,
  groupFqns: ReadonlySet<string>,
): QueryModel => {
  let committedPrefix = "";
  for (
    let separatorIndex = query.indexOf(":");
    separatorIndex >= 0;
    separatorIndex = query.indexOf(":", separatorIndex + 1)
  ) {
    const candidate = query.slice(0, separatorIndex);
    if (!groupFqns.has(candidate)) {
      break;
    }
    committedPrefix = candidate;
  }

  const filter = committedPrefix
    ? query.slice(committedPrefix.length + 1)
    : query;
  return {
    committedPrefix,
    filter,
    levelMode: committedPrefix.length > 0 && !filter.includes(":"),
  };
};

const prefixRank = (value: string, query: string): number =>
  normalized(value).startsWith(normalized(query)) ? 0 : 1;

const compareLevelRows = (
  left: PickerLeafRow | PickerGroupRow,
  right: PickerLeafRow | PickerGroupRow,
  filter: string,
): number => {
  const leftName =
    left.kind === "leaf" ? left.option.label : left.group.segment;
  const rightName =
    right.kind === "leaf" ? right.option.label : right.group.segment;
  return (
    prefixRank(leftName, filter) - prefixRank(rightName, filter) ||
    leftName.localeCompare(rightName)
  );
};

const fqnIsValid = (fqn: string): boolean =>
  fqn.length > 0 &&
  fqn.trim() === fqn &&
  !fqn.startsWith(":") &&
  !fqn.endsWith(":") &&
  !fqn.includes("::") &&
  fqn
    .split(":")
    .every((segment) => segment.length > 0 && segment.trim() === segment);

const mergeOptions = (
  options: readonly EntityOption[],
  additions: readonly EntityOption[],
): readonly EntityOption[] => {
  const byId = new Map(options.map((option) => [option.id, option]));
  for (const addition of additions) {
    byId.set(addition.id, addition);
  }
  return [...byId.values()];
};

const rowId = (id: string, row: PickerRow): string => {
  if (row.kind === "leaf") {
    return `${id}-option-${row.option.id}`;
  }
  if (row.kind === "create") {
    return `${id}-option-create`;
  }
  if (row.kind === "group-selection") {
    return `${id}-option-group-selection-${encodeURIComponent(row.fqn)}`;
  }
  return `${id}-option-group-${encodeURIComponent(row.group.fqn)}`;
};

const typedGroupFqn = (query: string): string | undefined => {
  if (!query.endsWith(":*")) return undefined;
  const fqn = query.slice(0, -2);
  return fqnIsValid(fqn) ? fqn : undefined;
};

const rowsForQuery = (
  options: readonly EntityOption[],
  groups: readonly HierarchyGroup[],
  model: QueryModel,
): readonly (PickerLeafRow | PickerGroupRow)[] => {
  const filter = normalized(model.filter);
  if (model.levelMode) {
    const groupRows: PickerGroupRow[] = groups
      .filter(
        (group) =>
          group.parentFqn === model.committedPrefix &&
          normalized(group.segment).includes(filter),
      )
      .map((group) => ({ group, kind: "group" }));
    const leafRows: PickerLeafRow[] = options
      .filter(
        (option) =>
          optionParentFqn(option) === model.committedPrefix &&
          normalized(option.label).includes(filter),
      )
      .map((option) => ({ kind: "leaf", option }));
    return [...groupRows, ...leafRows].sort((left, right) =>
      compareLevelRows(left, right, model.filter),
    );
  }

  const query = normalized(model.filter);
  const scopePrefix = model.committedPrefix ? `${model.committedPrefix}:` : "";
  const leafRows: PickerLeafRow[] = options
    .filter(
      (option) =>
        option.searchLabel.startsWith(scopePrefix) &&
        normalized(option.searchLabel).includes(query),
    )
    .sort((left, right) => left.searchLabel.localeCompare(right.searchLabel))
    .map((option) => ({ kind: "leaf", option }));
  const groupRows: PickerGroupRow[] = groups
    .filter(
      (group) =>
        group.fqn.startsWith(scopePrefix) &&
        normalized(group.fqn).includes(query),
    )
    .sort((left, right) => left.fqn.localeCompare(right.fqn))
    .map((group) => ({ group, kind: "group" }));
  return [...leafRows, ...groupRows].slice(0, searchLimit);
};

const retainedPrefixAfterPick = (
  option: EntityOption,
  clearOnSelect: boolean,
  committedPrefix: string,
): string => {
  if (!clearOnSelect) {
    return option.searchLabel;
  }
  return committedPrefix ? `${committedPrefix}:` : "";
};

export const EntityPicker = ({
  autoFocus = false,
  clearOnSelect = false,
  createOption,
  disabled = false,
  excludedOptionIds = [],
  id,
  hierarchical = true,
  label,
  labelClassName,
  loadKey,
  loadCreationAvailability,
  loadOptions,
  onChange,
  onGroupSelect,
  onLoadedOptions,
  onOpenChange,
  openOnFocus = true,
  options = [],
  placeholder = "Search",
  preferredSide = "bottom",
  value,
  selectedIds = noSelectedIds,
  selectedGroupFqns = [],
}: EntityPickerProps) => {
  const [createdOptions, setCreatedOptions] = useState<readonly EntityOption[]>(
    [],
  );
  const [loadedSearch, setLoadedSearch] = useState<LoadedSearchSnapshot>();
  const [loadedOptions, setLoadedOptions] = useState<readonly EntityOption[]>(
    [],
  );
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const loadedRows = loadedSearch?.rows ?? noLoadedRows;
  const loadedRequestKey = loadedSearch?.requestKey;
  const loadedHasMore = loadedSearch?.hasMore ?? false;
  const loadedQuery = loadedSearch?.query;
  const [availabilityFailure, setAvailabilityFailure] = useState<{
    readonly message: string;
    readonly query: string;
  }>();
  const [creationAvailable, setCreationAvailable] = useState(false);
  const [availabilityQuery, setAvailabilityQuery] = useState<string>();
  const initialGroupFqn = selectedGroupFqns[0];
  const [remoteParentFqn, setRemoteParentFqn] = useState<string | undefined>(
    initialGroupFqn,
  );
  const loadOptionsRef = useRef(loadOptions);
  const onLoadedOptionsRef = useRef(onLoadedOptions);
  const loadVersionRef = useRef(0);
  const lastIssuedSearchKeyRef = useRef<string | undefined>(undefined);
  const flushPendingLoadRef = useRef<(() => void) | undefined>(undefined);
  const flushPendingAvailabilityRef = useRef<(() => void) | undefined>(
    undefined,
  );
  const pendingEnterRef = useRef(false);
  useEffect(() => {
    loadOptionsRef.current = loadOptions;
    onLoadedOptionsRef.current = onLoadedOptions;
  }, [loadOptions, onLoadedOptions]);
  const selectedIdsKey = selectedIds.join(",");
  const requestedSelectedIds = useMemo(
    () => [
      ...new Set([
        ...(selectedIdsKey
          ? selectedIdsKey.split(",").map((idValue) => Number(idValue))
          : []),
        ...(value === undefined ? [] : [value]),
      ]),
    ],
    [selectedIdsKey, value],
  );
  const effectiveOptions = useMemo(
    () =>
      mergeOptions(mergeOptions(options, loadedOptions), createdOptions).filter(
        (option) => !excludedOptionIds.includes(option.id),
      ),
    [createdOptions, excludedOptionIds, loadedOptions, options],
  );
  const typedThisSessionRef = useRef(false);
  const [typedThisSession, setTypedThisSession] = useState(false);
  const selected = effectiveOptions.find((option) => option.id === value);
  const [query, setQuery] = useState(
    selected?.searchLabel ?? (initialGroupFqn ? `${initialGroupFqn}:` : ""),
  );
  const loadRequestKey = JSON.stringify([
    loadKey,
    query,
    reloadVersion,
    remoteParentFqn,
    requestedSelectedIds,
  ]);
  const searchRequestPending = Boolean(
    loadOptions && loadedRequestKey !== loadRequestKey,
  );
  const [open, setOpen] = useState(false);
  const requestPending = searchRequestPending;
  const selectedPresentation = selected
    ? (selected.selectedLabel ?? optionPresentation(selected))
    : undefined;
  const showSelectedPresentation = Boolean(
    selectedPresentation && (!open || !typedThisSession),
  );
  const displayQuery = showSelectedPresentation
    ? selectedPresentation
    : query || (value === undefined ? "" : (selected?.searchLabel ?? ""));
  const [activeIndex, setActiveIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [createError, setCreateError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const interactionVersionRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const deferredCloseFrameRef = useRef<number | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  const skipInitialAutoFocusOpenRef = useRef(autoFocus);

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(
    () => () => {
      interactionVersionRef.current += 1;
      window.cancelAnimationFrame(deferredCloseFrameRef.current ?? 0);
    },
    [],
  );

  useEffect(() => {
    const loader = loadOptionsRef.current;
    if (!loader) {
      setLoading(false);
      setLoadError(undefined);
      setLoadedSearch(undefined);
      lastIssuedSearchKeyRef.current = undefined;
      flushPendingLoadRef.current = undefined;
      return;
    }
    if (!open && !autoFocus) {
      return;
    }

    const version = ++loadVersionRef.current;
    queueMicrotask(() => {
      if (loadVersionRef.current === version) {
        setLoading(true);
        setLoadError(undefined);
      }
    });
    const searchKey = JSON.stringify([query, remoteParentFqn]);
    let debounceTimer: number | undefined;
    let loadStarted = false;
    const load = () => {
      if (loadStarted) {
        return;
      }
      loadStarted = true;
      window.clearTimeout(debounceTimer);
      flushPendingLoadRef.current = undefined;
      lastIssuedSearchKeyRef.current = searchKey;
      void loader({
        excludedIds: requestedSelectedIds,
        parentFqn: remoteParentFqn,
        query,
      })
        .then((result) => {
          if (loadVersionRef.current !== version) {
            return;
          }
          setLoadedSearch({
            hasMore: result.hasMore,
            query,
            requestKey: loadRequestKey,
            rows: result.rows,
          });
          const returnedOptions = result.rows.flatMap((row) =>
            row.kind === "leaf" ? [row.option] : [],
          );
          setLoadedOptions(returnedOptions);
          onLoadedOptionsRef.current?.(returnedOptions);
          setLoading(false);
        })
        .catch((error: unknown) => {
          if (loadVersionRef.current !== version) {
            return;
          }
          setLoading(false);
          setLoadError(
            error instanceof Error
              ? error.message
              : "Options could not be loaded.",
          );
        });
    };
    const debounceSearch =
      lastIssuedSearchKeyRef.current !== undefined &&
      lastIssuedSearchKeyRef.current !== searchKey;
    if (debounceSearch) {
      debounceTimer = window.setTimeout(load, searchDebounceMilliseconds);
      flushPendingLoadRef.current = load;
    } else {
      load();
    }

    return () => {
      window.clearTimeout(debounceTimer);
      if (flushPendingLoadRef.current === load) {
        flushPendingLoadRef.current = undefined;
      }
      if (loadVersionRef.current === version) {
        loadVersionRef.current += 1;
      }
    };
  }, [
    autoFocus,
    loadKey,
    loadRequestKey,
    open,
    query,
    reloadVersion,
    remoteParentFqn,
    requestedSelectedIds,
  ]);

  useEffect(() => {
    if (
      !open ||
      !createOption ||
      !loadCreationAvailability ||
      query.length === 0 ||
      query.endsWith(":")
    ) {
      flushPendingAvailabilityRef.current = undefined;
      return;
    }
    let active = true;
    let loadStarted = false;
    const load = () => {
      if (loadStarted) {
        return;
      }
      loadStarted = true;
      window.clearTimeout(timer);
      flushPendingAvailabilityRef.current = undefined;
      setAvailabilityFailure(undefined);
      void loadCreationAvailability(query)
        .then((available) => {
          if (!active) {
            return;
          }
          setCreationAvailable(available);
          setAvailabilityQuery(query);
          setAvailabilityFailure(undefined);
        })
        .catch((error: unknown) => {
          if (!active) {
            return;
          }
          setCreationAvailable(false);
          setAvailabilityQuery(query);
          setAvailabilityFailure({
            message:
              error instanceof Error
                ? error.message
                : "Creation availability could not be loaded.",
            query,
          });
        });
    };
    const timer = window.setTimeout(load, searchDebounceMilliseconds);
    flushPendingAvailabilityRef.current = load;
    return () => {
      active = false;
      window.clearTimeout(timer);
      if (flushPendingAvailabilityRef.current === load) {
        flushPendingAvailabilityRef.current = undefined;
      }
    };
  }, [createOption, loadCreationAvailability, open, query, reloadVersion]);

  const groups = useMemo(
    () =>
      loadOptions
        ? loadedRows.flatMap((row) => (row.kind === "group" ? [row.group] : []))
        : hierarchical
          ? deriveGroups(effectiveOptions)
          : [],
    [effectiveOptions, hierarchical, loadOptions, loadedRows],
  );
  const groupFqns = useMemo(
    () => new Set(groups.map((group) => group.fqn)),
    [groups],
  );
  const model = useMemo<QueryModel>(() => {
    if (!loadOptions) {
      return deriveQueryModel(query, groupFqns);
    }
    const committedPrefix = remoteParentFqn ?? "";
    return {
      committedPrefix,
      filter: committedPrefix
        ? query.slice(Math.min(query.length, committedPrefix.length + 1))
        : query,
      levelMode: committedPrefix.length > 0,
    };
  }, [groupFqns, loadOptions, query, remoteParentFqn]);
  const retainedPrefixRef = useRef(model.committedPrefix);
  const optionRows = useMemo(() => {
    if (!loadOptions) {
      return rowsForQuery(effectiveOptions, groups, model);
    }
    const returnedRows = loadedRows.filter(
      (row) =>
        row.kind === "group" || !excludedOptionIds.includes(row.option.id),
    );
    return returnedRows;
  }, [
    effectiveOptions,
    excludedOptionIds,
    groups,
    loadOptions,
    loadedRows,
    model,
  ]);
  const updateOpen = useCallback(
    (nextOpen: boolean, typedSession = false) => {
      if (nextOpen && !open) {
        typedThisSessionRef.current = typedSession;
        setTypedThisSession(typedSession);
      }
      if (!nextOpen) {
        pendingEnterRef.current = false;
        typedThisSessionRef.current = false;
        setTypedThisSession(false);
      }
      setOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open, setOpen, setTypedThisSession],
  );
  const selectOption = useCallback(
    (option: EntityOption) => {
      pendingEnterRef.current = false;
      interactionVersionRef.current += 1;
      setLoadedOptions((current) => mergeOptions(current, [option]));
      onChangeRef.current(option.id, option);
      const retainedPrefix =
        clearOnSelect && hierarchical
          ? model.committedPrefix
          : clearOnSelect
            ? ""
            : retainedPrefixRef.current;
      retainedPrefixRef.current = retainedPrefix;
      setQuery(retainedPrefixAfterPick(option, clearOnSelect, retainedPrefix));
      setActiveIndex(0);
      setCreateError(undefined);
      updateOpen(false);
    },
    [
      clearOnSelect,
      hierarchical,
      model.committedPrefix,
      setActiveIndex,
      setCreateError,
      setLoadedOptions,
      setQuery,
      updateOpen,
    ],
  );
  const selectGroup = useCallback(
    (fqn: string) => {
      interactionVersionRef.current += 1;
      retainedPrefixRef.current = fqn;
      if (loadOptions) {
        setRemoteParentFqn(fqn);
      }
      setQuery(`${fqn}:`);
      setActiveIndex(0);
      setCreateError(undefined);
      onGroupSelect?.(fqn);
      setAnnouncement(`Selected entire group ${fqn}`);
      updateOpen(false);
    },
    [loadOptions, onGroupSelect, updateOpen],
  );
  useEffect(() => {
    if (
      !loadOptions ||
      requestPending ||
      !open ||
      pendingEnterRef.current ||
      !typedThisSessionRef.current
    ) {
      return;
    }
    if (loadedQuery !== query) {
      return;
    }
    const exact = optionRows.find(
      (row) => row.kind === "leaf" && row.option.searchLabel === query,
    );
    const groupFqn = onGroupSelect ? typedGroupFqn(query) : undefined;
    if ((!exact || exact.kind !== "leaf") && !groupFqn) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      if (exact?.kind === "leaf") {
        selectOption(exact.option);
        return;
      }
      if (groupFqn) {
        selectGroup(groupFqn);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    loadOptions,
    loadedQuery,
    onGroupSelect,
    open,
    optionRows,
    query,
    requestPending,
    selectGroup,
    selectOption,
  ]);
  const createAllowed = Boolean(
    loadOptions &&
    createOption &&
    creationAvailable &&
    loadedQuery === query &&
    availabilityQuery === query,
  );
  const requestError =
    loadError ??
    (availabilityFailure?.query === query
      ? availabilityFailure.message
      : undefined);
  const rows = useMemo<readonly PickerRow[]>(() => {
    const selectableRows: readonly PickerRow[] =
      createAllowed && loadedQuery !== undefined
        ? [...optionRows, { fqn: loadedQuery, kind: "create" }]
        : optionRows;
    return onGroupSelect && model.committedPrefix
      ? [
          { fqn: model.committedPrefix, kind: "group-selection" },
          ...selectableRows,
        ]
      : selectableRows;
  }, [
    createAllowed,
    loadedQuery,
    model.committedPrefix,
    onGroupSelect,
    optionRows,
  ]);
  const clampedActiveIndex =
    rows.length === 0 ||
    (rows[0]?.kind === "group-selection" &&
      model.filter.length > 0 &&
      activeIndex >= rows.length)
      ? activeIndex
      : Math.min(activeIndex, rows.length - 1);
  const activeRow = rows[clampedActiveIndex];
  const activeOptionId =
    open && !disabled && !requestPending && activeRow
      ? rowId(id, activeRow)
      : undefined;
  const contextText = model.committedPrefix
    ? `Browsing under ${model.committedPrefix}`
    : "Searching full paths";

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    inputRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [open]);

  useEffect(() => {
    if (requestPending || !open || !pendingEnterRef.current) {
      return;
    }
    const exact = optionRows.find(
      (row) => row.kind === "leaf" && row.option.searchLabel === query,
    );
    const frame = window.requestAnimationFrame(() => {
      if (!pendingEnterRef.current) {
        return;
      }
      pendingEnterRef.current = false;
      if (exact?.kind === "leaf") {
        selectOption(exact.option);
        return;
      }
      const groupFqn = onGroupSelect ? typedGroupFqn(query) : undefined;
      if (groupFqn) {
        selectGroup(groupFqn);
        return;
      }
      inputRef.current?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    onGroupSelect,
    open,
    optionRows,
    query,
    requestPending,
    selectGroup,
    selectOption,
  ]);

  const updatePopoverOpen = (nextOpen: boolean) => {
    window.cancelAnimationFrame(deferredCloseFrameRef.current ?? 0);
    if (!nextOpen && document.activeElement === inputRef.current) {
      deferredCloseFrameRef.current = window.requestAnimationFrame(() => {
        if (document.activeElement !== inputRef.current) {
          updateOpen(false);
        }
      });
      return;
    }
    updateOpen(nextOpen, typedThisSessionRef.current);
  };

  const drillInto = (group: HierarchyGroup) => {
    interactionVersionRef.current += 1;
    retainedPrefixRef.current = group.fqn;
    if (loadOptions) {
      setRemoteParentFqn(group.fqn);
    }
    const nextQuery = `${group.fqn}:`;
    setQuery(nextQuery);
    setActiveIndex(0);
    setCreateError(undefined);
    onChange(undefined);
    setAnnouncement(`${group.fqn}: ${group.childCount} children`);
    updateOpen(true, typedThisSessionRef.current);
    window.requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(nextQuery.length, nextQuery.length);
    });
  };

  const backTo = (prefix: string) => {
    interactionVersionRef.current += 1;
    retainedPrefixRef.current = prefix;
    if (loadOptions) {
      setRemoteParentFqn(prefix || undefined);
    }
    const nextQuery = prefix ? `${prefix}:` : "";
    setQuery(nextQuery);
    setActiveIndex(0);
    setCreateError(undefined);
    onChange(undefined);
    setAnnouncement(prefix ? `Back to ${prefix}` : "Back to root");
    updateOpen(true, typedThisSessionRef.current);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextQuery.length, nextQuery.length);
    });
  };

  const activateRow = async (row: PickerRow) => {
    if (requestPending) {
      return;
    }
    if (row.kind === "leaf") {
      selectOption(row.option);
      return;
    }
    if (row.kind === "group") {
      drillInto(row.group);
      return;
    }
    if (row.kind === "group-selection") {
      selectGroup(row.fqn);
      return;
    }
    if (!createOption || creating) {
      return;
    }

    const creationVersion = ++interactionVersionRef.current;
    setCreating(true);
    setCreateError(undefined);
    try {
      const option = await createOption(row.fqn);
      setCreatedOptions((current) => mergeOptions(current, [option]));
      if (interactionVersionRef.current === creationVersion) {
        selectOption(option);
      }
    } catch (error) {
      if (interactionVersionRef.current === creationVersion) {
        setCreateError(
          error instanceof Error
            ? error.message
            : "Could not create this item.",
        );
        setAnnouncement(`Could not create ${row.fqn}`);
        if (document.activeElement === inputRef.current) {
          updateOpen(true, typedThisSessionRef.current);
        }
      }
    } finally {
      setCreating(false);
    }
  };

  const adoptActiveRow = () => {
    if (!activeRow) {
      return;
    }
    if (activeRow.kind === "group") {
      drillInto(activeRow.group);
      return;
    }
    if (activeRow.kind === "leaf") {
      selectOption(activeRow.option);
      return;
    }
    void activateRow(activeRow);
  };

  const breadcrumbSegments = model.committedPrefix.split(":").filter(Boolean);
  const visibleBreadcrumbSegments =
    breadcrumbSegments.length <= 4
      ? breadcrumbSegments.map((segment, index) => ({
          index,
          segment,
        }))
      : [
          { index: 0, segment: breadcrumbSegments[0] },
          { index: -1, segment: "…" },
          ...breadcrumbSegments.slice(-2).map((segment, offset) => ({
            index: breadcrumbSegments.length - 2 + offset,
            segment,
          })),
        ];

  return (
    <Popover open={open && !disabled} onOpenChange={updatePopoverOpen}>
      <div
        className={cn("relative flex min-w-0 flex-col gap-1", open && "z-50")}
      >
        <label
          htmlFor={id}
          className={cn("text-sm font-semibold", labelClassName)}
        >
          {label}
        </label>
        <Tooltip
          className="w-full"
          disabled={!selected}
          focusable={false}
          label={selected ? optionPresentation(selected) : ""}
        >
          <PopoverAnchor asChild>
            <input
              ref={inputRef}
              id={id}
              type="text"
              autoComplete="off"
              autoFocus={autoFocus}
              role="combobox"
              aria-controls={`${id}-options`}
              aria-describedby={`${id}-context`}
              aria-expanded={open && !disabled}
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              className={cn(
                "bg-card h-9 w-full shrink-0 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]",
                selected?.hidden && "pr-8",
                showSelectedPresentation &&
                  "text-transparent caret-transparent",
              )}
              disabled={disabled}
              placeholder={placeholder}
              value={displayQuery}
              onChange={(event) => {
                pendingEnterRef.current = false;
                interactionVersionRef.current += 1;
                const editedValue = event.target.value;
                const nextQuery =
                  !typedThisSessionRef.current &&
                  selected &&
                  selectedPresentation
                    ? queryAfterPresentationEdit(
                        selectedPresentation,
                        selected.searchLabel,
                        editedValue,
                      )
                    : editedValue;
                const exactOption = loadOptions
                  ? undefined
                  : effectiveOptions.find(
                      (option) => option.searchLabel === nextQuery,
                    );
                if (exactOption) {
                  selectOption(exactOption);
                  return;
                }
                const selectedGroupFqn = onGroupSelect
                  ? typedGroupFqn(nextQuery)
                  : undefined;
                if (selectedGroupFqn && !loadOptions) {
                  typedThisSessionRef.current = true;
                  setTypedThisSession(true);
                  selectGroup(selectedGroupFqn);
                  return;
                }
                const remoteRemainder =
                  remoteParentFqn && nextQuery.startsWith(`${remoteParentFqn}:`)
                    ? nextQuery.slice(remoteParentFqn.length + 1)
                    : undefined;
                const retainsRemotePrefix = Boolean(
                  loadOptions &&
                  remoteParentFqn &&
                  remoteRemainder !== undefined &&
                  !remoteRemainder.includes(":"),
                );
                const typedRemoteParent =
                  loadOptions && hierarchical && nextQuery.endsWith(":")
                    ? nextQuery.slice(0, -1)
                    : undefined;
                const nextRemoteParent = retainsRemotePrefix
                  ? remoteParentFqn
                  : typedRemoteParent && fqnIsValid(typedRemoteParent)
                    ? typedRemoteParent
                    : undefined;
                const nextModel = loadOptions
                  ? {
                      committedPrefix: nextRemoteParent ?? "",
                      filter: nextRemoteParent
                        ? nextQuery.slice(nextRemoteParent.length + 1)
                        : nextQuery,
                      levelMode: Boolean(nextRemoteParent),
                    }
                  : deriveQueryModel(nextQuery, groupFqns);
                if (loadOptions && nextRemoteParent !== remoteParentFqn) {
                  setRemoteParentFqn(nextRemoteParent);
                }
                retainedPrefixRef.current =
                  nextModel.committedPrefix ||
                  (retainedPrefixRef.current &&
                  nextQuery.startsWith(`${retainedPrefixRef.current}:`)
                    ? retainedPrefixRef.current
                    : "");
                typedThisSessionRef.current = true;
                setTypedThisSession(true);
                if (nextModel.levelMode !== model.levelMode) {
                  setAnnouncement(
                    nextModel.levelMode
                      ? `Browsing under ${nextModel.committedPrefix}`
                      : "Searching full paths",
                  );
                }
                setQuery(nextQuery);
                setCreateError(undefined);
                updateOpen(true, true);
                setActiveIndex(
                  onGroupSelect && nextModel.committedPrefix && nextModel.filter
                    ? 1
                    : 0,
                );
                if (!selected || selected.searchLabel !== nextQuery) {
                  onChange(undefined);
                }
              }}
              onFocus={() => {
                if (disabled || !openOnFocus) {
                  return;
                }
                const nextQuery = selected?.searchLabel ?? query;
                if (selected) {
                  inputRef.current?.select();
                }
                if (skipInitialAutoFocusOpenRef.current) {
                  skipInitialAutoFocusOpenRef.current = false;
                  return;
                }
                updateOpen(true);
                const focusedRows = loadOptions
                  ? optionRows
                  : rowsForQuery(
                      effectiveOptions,
                      groups,
                      deriveQueryModel(nextQuery, groupFqns),
                    );
                const selectedIndex = focusedRows.findIndex(
                  (row) => row.kind === "leaf" && row.option.id === value,
                );
                setActiveIndex(value === undefined ? 0 : selectedIndex);
              }}
              onKeyDown={(event) => {
                if (disabled) {
                  return;
                }

                if (event.metaKey || event.ctrlKey) {
                  return;
                }

                if (event.key === "Escape") {
                  if (open) {
                    event.preventDefault();
                    updateOpen(false);
                  }
                  return;
                }

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  updateOpen(true);
                  setActiveIndex((current) =>
                    rows.length === 0
                      ? 0
                      : Math.min(current + 1, rows.length - 1),
                  );
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  updateOpen(true);
                  setActiveIndex((current) =>
                    rows.length === 0 ? 0 : Math.max(current - 1, 0),
                  );
                  return;
                }

                if (event.key === "Enter" && open && requestPending) {
                  event.preventDefault();
                  pendingEnterRef.current = true;
                  flushPendingLoadRef.current?.();
                  flushPendingAvailabilityRef.current?.();
                  return;
                }

                if (
                  event.key === "Enter" &&
                  open &&
                  !requestPending &&
                  activeRow
                ) {
                  event.preventDefault();
                  void activateRow(activeRow);
                  return;
                }

                if (
                  event.key === "Tab" &&
                  !event.shiftKey &&
                  open &&
                  requestError
                ) {
                  event.preventDefault();
                  retryButtonRef.current?.focus();
                  return;
                }

                if (
                  event.key === "ArrowRight" &&
                  open &&
                  !requestPending &&
                  activeRow?.kind === "group" &&
                  event.currentTarget.selectionStart === query.length &&
                  event.currentTarget.selectionEnd === query.length
                ) {
                  event.preventDefault();
                  drillInto(activeRow.group);
                  return;
                }

                if (
                  event.key === "Tab" &&
                  !event.shiftKey &&
                  open &&
                  !requestPending &&
                  activeRow &&
                  typedThisSessionRef.current
                ) {
                  const adoptedValue =
                    activeRow.kind === "group"
                      ? `${activeRow.group.fqn}:`
                      : activeRow.kind === "leaf"
                        ? activeRow.option.searchLabel
                        : activeRow.kind === "create"
                          ? activeRow.fqn
                          : `${activeRow.fqn}:*`;
                  if (adoptedValue !== query) {
                    event.preventDefault();
                    adoptActiveRow();
                  }
                  return;
                }

                if (
                  event.key === "ArrowLeft" &&
                  open &&
                  model.committedPrefix &&
                  model.filter === "" &&
                  event.currentTarget.selectionStart === query.length &&
                  event.currentTarget.selectionEnd === query.length
                ) {
                  event.preventDefault();
                  const separatorIndex = model.committedPrefix.lastIndexOf(":");
                  backTo(
                    separatorIndex < 0
                      ? ""
                      : model.committedPrefix.slice(0, separatorIndex),
                  );
                  return;
                }

                if (
                  event.key === "Backspace" &&
                  open &&
                  query.endsWith(":") &&
                  event.currentTarget.selectionStart === query.length &&
                  event.currentTarget.selectionEnd === query.length
                ) {
                  event.preventDefault();
                  interactionVersionRef.current += 1;
                  typedThisSessionRef.current = true;
                  setTypedThisSession(true);
                  const nextQuery = query.slice(0, -1);
                  setQuery(nextQuery);
                  setActiveIndex(0);
                  setCreateError(undefined);
                  onChange(undefined);
                  const nextRemoteParent = remoteParentFqn?.includes(":")
                    ? remoteParentFqn.slice(0, remoteParentFqn.lastIndexOf(":"))
                    : undefined;
                  const nextModel = loadOptions
                    ? {
                        committedPrefix: nextRemoteParent ?? "",
                        filter: nextRemoteParent
                          ? nextQuery.slice(nextRemoteParent.length + 1)
                          : nextQuery,
                        levelMode: Boolean(nextRemoteParent),
                      }
                    : deriveQueryModel(nextQuery, groupFqns);
                  retainedPrefixRef.current = nextModel.committedPrefix;
                  if (loadOptions) {
                    setRemoteParentFqn(nextRemoteParent);
                  }
                  setAnnouncement(
                    nextModel.committedPrefix
                      ? `Back to ${nextModel.committedPrefix}`
                      : "Back to root",
                  );
                }
              }}
            />
          </PopoverAnchor>
        </Tooltip>
        {showSelectedPresentation && selected ? (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-2 flex h-9 min-w-0 items-center overflow-hidden text-sm",
              labelClassName === "sr-only" ? "top-0" : "top-6",
              selected.hidden ? "right-8" : "right-2",
            )}
          >
            <EntityOptionPresentation className="w-full" option={selected} />
          </span>
        ) : null}
        {selected?.hidden ? (
          <EyeOff
            aria-label="Hidden"
            className={cn(
              "text-muted-foreground pointer-events-none absolute right-2 size-4 -translate-y-1/2",
              labelClassName === "sr-only" ? "top-1/2" : "top-[2.625rem]",
            )}
          />
        ) : null}
        <span id={`${id}-context`} className="sr-only">
          {contextText}
        </span>
        <span
          id={`${id}-announcement`}
          className="sr-only"
          role="status"
          aria-live="polite"
        >
          {announcement}
        </span>
        {open && !disabled ? (
          <PopoverContent
            ref={listboxRef}
            id={`${id}-options`}
            role="listbox"
            aria-busy={loading}
            data-picker-portal
            data-picker-mode={model.levelMode ? "level" : "search"}
            align="start"
            collisionPadding={4}
            side={preferredSide}
            sideOffset={4}
            sticky="always"
            updatePositionStrategy="always"
            className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
            onCloseAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              updateOpen(false);
              inputRef.current?.focus({ preventScroll: true });
            }}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            {model.levelMode ? (
              <div
                data-picker-breadcrumb
                data-testid={`${id}-breadcrumb`}
                className="sticky top-0 z-10 flex min-w-0 items-center gap-1 border-b border-[var(--hairline)] bg-[var(--band)] px-2 py-1 font-mono text-xs"
              >
                <Tooltip asChild label="Browse from root">
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Browse from root"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      backTo("");
                    }}
                  >
                    <Home aria-hidden="true" className="size-4" />
                  </button>
                </Tooltip>
                {visibleBreadcrumbSegments.map(({ index, segment }) => (
                  <span
                    key={`${index}:${segment}`}
                    className="flex min-w-0 items-center gap-1"
                  >
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                    {index < 0 ? (
                      <Tooltip focusable={false} label={model.committedPrefix}>
                        <span className="text-muted-foreground">…</span>
                      </Tooltip>
                    ) : (
                      <Tooltip
                        asChild
                        label={breadcrumbSegments.slice(0, index + 1).join(":")}
                      >
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={`Browse ${breadcrumbSegments
                            .slice(0, index + 1)
                            .join(":")}`}
                          className={cn(
                            "max-w-24 truncate",
                            index === breadcrumbSegments.length - 1
                              ? "text-foreground font-semibold"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => {
                            backTo(
                              breadcrumbSegments.slice(0, index + 1).join(":"),
                            );
                          }}
                        >
                          {segment}
                        </button>
                      </Tooltip>
                    )}
                  </span>
                ))}
              </div>
            ) : null}
            {loading ? (
              <span className="sr-only" role="status">
                Loading options…
              </span>
            ) : null}
            {requestError ? (
              <div
                className="border-destructive text-destructive flex items-center justify-between gap-2 border-b px-2 py-1 text-xs"
                role="alert"
              >
                <span>{requestError}</span>
                <Button
                  ref={retryButtonRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReloadVersion((current) => current + 1);
                    inputRef.current?.focus();
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : null}
            {rows.length > 0 ? (
              rows.map((row, rowIndex) => {
                const option = (
                  <button
                    key={rowId(id, row)}
                    id={rowId(id, row)}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    disabled={requestPending}
                    aria-hidden={requestPending ? true : undefined}
                    aria-disabled={
                      requestPending || (row.kind === "create" && creating)
                        ? true
                        : undefined
                    }
                    aria-description={
                      requestPending
                        ? "Wait for options to finish loading."
                        : row.kind === "create" && creating
                          ? "Wait for creation to finish."
                          : undefined
                    }
                    aria-label={
                      row.kind === "group"
                        ? `${row.group.fqn}, group, ${row.group.childCount} children`
                        : row.kind === "group-selection"
                          ? `Select entire group ${row.fqn}`
                          : row.kind === "create"
                            ? `Create ${row.fqn}`
                            : undefined
                    }
                    aria-selected={
                      row.kind === "leaf"
                        ? row.option.id === value
                        : row.kind === "group-selection"
                          ? selectedGroupFqns.includes(row.fqn)
                          : false
                    }
                    className={cn(
                      "hover:bg-muted flex w-full items-center px-2 py-2 text-left text-sm",
                      row.kind === "create" && "bg-card sticky bottom-0",
                      rowIndex === clampedActiveIndex &&
                        "bg-[var(--color-interactive-bright)]",
                      row.kind === "leaf" &&
                        row.option.id === value &&
                        "bg-[var(--color-interactive-bright)]",
                      row.kind === "group-selection" &&
                        selectedGroupFqns.includes(row.fqn) &&
                        "bg-[var(--color-interactive-bright)]",
                      row.kind === "create" &&
                        creating &&
                        "text-muted-foreground outline-muted-foreground bg-muted hover:bg-muted [&_svg]:!text-muted-foreground cursor-not-allowed outline outline-1 -outline-offset-1",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      void activateRow(row);
                    }}
                  >
                    {row.kind === "leaf" ? (
                      <span className="flex w-full min-w-0 flex-col items-start overflow-hidden">
                        <span className="flex max-w-full min-w-0 items-center gap-1">
                          {row.option.hidden ? (
                            <EyeOff
                              aria-label="Hidden"
                              className="size-3 shrink-0"
                            />
                          ) : null}
                          <Tooltip
                            className="min-w-0"
                            focusable={false}
                            label={optionPresentation(row.option)}
                          >
                            <EntityOptionPresentation
                              expanded={rowIndex === clampedActiveIndex}
                              option={row.option}
                            />
                          </Tooltip>
                        </span>
                        {(row.option.detail &&
                          row.option.detail !== row.option.searchLabel) ||
                        row.option.metadata ? (
                          <span className="flex max-w-full min-w-0 items-center gap-1 text-xs">
                            {row.option.detail &&
                            row.option.detail !== row.option.searchLabel ? (
                              <Tooltip
                                className={cn(
                                  "text-muted-foreground block min-w-0 flex-1 font-mono text-xs",
                                  rowIndex === clampedActiveIndex
                                    ? "break-all whitespace-normal"
                                    : "truncate",
                                )}
                                focusable={false}
                                label={row.option.detail}
                              >
                                {row.option.detail}
                              </Tooltip>
                            ) : null}
                            {row.option.detail &&
                            row.option.detail !== row.option.searchLabel &&
                            row.option.metadata ? (
                              <span
                                aria-hidden="true"
                                className="text-muted-foreground shrink-0"
                              >
                                ·
                              </span>
                            ) : null}
                            {row.option.metadata ? (
                              <Tooltip
                                className={cn(
                                  "text-muted-foreground block min-w-0 font-mono text-xs",
                                  row.option.detail &&
                                    row.option.detail !== row.option.searchLabel
                                    ? "max-w-[45%] shrink-0"
                                    : "max-w-full flex-1",
                                  rowIndex === clampedActiveIndex
                                    ? "break-all whitespace-normal"
                                    : "truncate",
                                )}
                                focusable={false}
                                label={row.option.metadata}
                              >
                                {row.option.metadata}
                              </Tooltip>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    ) : row.kind === "group" ? (
                      <>
                        <Tooltip
                          className="min-w-0 flex-1 font-mono font-medium"
                          focusable={false}
                          label={row.group.fqn}
                        >
                          <span className="block truncate">
                            {row.group.segment}
                          </span>
                        </Tooltip>
                        <span className="text-muted-foreground ml-2 font-mono text-xs">
                          {row.group.childCount}
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          className="text-muted-foreground ml-1 size-4 shrink-0"
                        />
                      </>
                    ) : row.kind === "group-selection" ? (
                      <span className="flex min-w-0 flex-col">
                        <span className="font-mono font-medium">
                          Select entire group
                        </span>
                        <span className="text-muted-foreground truncate font-mono text-xs">
                          {row.fqn}:*
                        </span>
                      </span>
                    ) : (
                      <>
                        <Plus
                          aria-hidden="true"
                          className="mr-1 size-4 shrink-0 text-[var(--color-class-adjustment-ink)]"
                        />
                        <span className="min-w-0 truncate font-medium">
                          {creating ? "Creating" : "Create"} “{row.fqn}”
                        </span>
                      </>
                    )}
                  </button>
                );
                return row.kind === "create" ? (
                  <Tooltip
                    key={rowId(id, row)}
                    asChild
                    disabled={!requestPending && !creating}
                    label={
                      requestPending
                        ? "Wait for options to finish loading."
                        : "Wait for creation to finish."
                    }
                  >
                    {option}
                  </Tooltip>
                ) : (
                  option
                );
              })
            ) : loading ? (
              <div data-testid={`${id}-loading-skeleton`}>
                {["w-2/5", "w-1/2", "w-1/3"].map((width, index) => (
                  <div
                    key={index}
                    className="flex min-h-10 flex-col justify-center gap-1 px-2 py-2"
                  >
                    <Skeleton className={cn("h-4", width)} />
                    {hierarchical ? <Skeleton className="h-3 w-3/4" /> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground px-2 py-2 text-sm">
                {model.committedPrefix
                  ? `No matches under ${model.committedPrefix}:`
                  : "No matches"}
              </div>
            )}
            {loadedHasMore && !requestError ? (
              <div
                className="text-muted-foreground border-t border-[var(--hairline)] px-2 py-2 font-mono text-xs"
                data-testid={`${id}-type-to-narrow`}
                role="status"
              >
                More matches available. Type to narrow.
              </div>
            ) : null}
          </PopoverContent>
        ) : null}
        {createError ? (
          <div className="text-destructive px-2 py-2 text-xs" role="alert">
            {createError}
          </div>
        ) : null}
      </div>
    </Popover>
  );
};

interface EntityMultiPickerProps {
  readonly autoFocus?: boolean;
  readonly createOption?: CreateEntityOption;
  readonly disabled?: boolean;
  readonly id: string;
  readonly hierarchical?: boolean;
  readonly label: string;
  readonly labelClassName?: string;
  readonly loadKey?: string | number;
  readonly loadCreationAvailability?: EntityCreationAvailabilityLoader;
  readonly loadOptions: EntityOptionLoader;
  readonly onChange: (
    ids: readonly number[],
    selectedOptions: readonly EntityOption[],
  ) => void;
  readonly groupValues?: readonly string[];
  readonly onGroupChange?: (fqns: readonly string[]) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly options?: readonly EntityOption[];
  readonly placeholder?: string;
  readonly value: readonly number[];
}

export const EntityMultiPicker = ({
  autoFocus = false,
  createOption,
  disabled = false,
  id,
  hierarchical = true,
  label,
  labelClassName,
  loadKey,
  loadCreationAvailability,
  loadOptions,
  onChange,
  groupValues = [],
  onGroupChange,
  onOpenChange,
  options = [],
  placeholder = "Search",
  value,
}: EntityMultiPickerProps) => {
  const [createdOptions, setCreatedOptions] = useState<readonly EntityOption[]>(
    [],
  );
  const [loadedOptions, setLoadedOptions] = useState<readonly EntityOption[]>(
    [],
  );
  const effectiveOptions = useMemo(
    () => mergeOptions(mergeOptions(options, loadedOptions), createdOptions),
    [createdOptions, loadedOptions, options],
  );
  const selectedOptions = effectiveOptions.filter((option) =>
    value.includes(option.id),
  );
  const valueRef = useRef(value);
  const groupValuesRef = useRef(groupValues);
  const pickerRef = useRef<HTMLDivElement>(null);
  const restoreGroupFocusRef = useRef<number | undefined>(undefined);
  const groupValuesKey = JSON.stringify(groupValues);
  const renderedGroupValuesKeyRef = useRef(groupValuesKey);
  useLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);
  useLayoutEffect(() => {
    if (renderedGroupValuesKeyRef.current === groupValuesKey) return;
    renderedGroupValuesKeyRef.current = groupValuesKey;
    groupValuesRef.current = groupValues;
  }, [groupValues, groupValuesKey]);
  useLayoutEffect(() => {
    const removedIndex = restoreGroupFocusRef.current;
    if (removedIndex === undefined) return;
    restoreGroupFocusRef.current = undefined;
    const remainingButtons = Array.from(
      pickerRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-entity-group-remove]",
      ) ?? [],
    );
    const fallback =
      remainingButtons[Math.min(removedIndex, remainingButtons.length - 1)] ??
      pickerRef.current?.querySelector<HTMLInputElement>("[role=combobox]");
    fallback?.focus();
  }, [groupValuesKey]);
  return (
    <div ref={pickerRef} className="flex min-w-0 flex-col gap-2">
      <EntityPicker
        autoFocus={autoFocus}
        clearOnSelect
        createOption={
          createOption
            ? async (fqn) => {
                const option = await createOption(fqn);
                setCreatedOptions((current) => mergeOptions(current, [option]));
                return option;
              }
            : undefined
        }
        disabled={disabled}
        excludedOptionIds={value}
        hierarchical={hierarchical}
        id={id}
        label={label}
        labelClassName={labelClassName}
        loadKey={loadKey}
        loadCreationAvailability={loadCreationAvailability}
        loadOptions={loadOptions}
        onLoadedOptions={(returned) => {
          setLoadedOptions(returned);
        }}
        onOpenChange={onOpenChange}
        onGroupSelect={
          onGroupChange
            ? (fqn) => {
                if (!groupValuesRef.current.includes(fqn)) {
                  const nextGroupValues = [...groupValuesRef.current, fqn];
                  groupValuesRef.current = nextGroupValues;
                  onGroupChange(nextGroupValues);
                }
              }
            : undefined
        }
        placeholder={placeholder}
        preferredSide="top"
        options={options}
        selectedIds={value}
        selectedGroupFqns={groupValues}
        value={undefined}
        onChange={(nextId, selectedOption) => {
          if (nextId) {
            if (selectedOption) {
              setLoadedOptions((current) =>
                mergeOptions(current, [selectedOption]),
              );
            }
            const nextValue = [...valueRef.current, nextId];
            valueRef.current = nextValue;
            onChange(
              nextValue,
              mergeOptions(
                effectiveOptions,
                selectedOption ? [selectedOption] : [],
              ).filter((option) => nextValue.includes(option.id)),
            );
          }
        }}
      />
      {selectedOptions.length > 0 || groupValues.length > 0 ? (
        <div
          className="relative z-40 flex w-full min-w-0 flex-wrap gap-1 overflow-x-hidden p-0.5"
          data-testid="entity-multi-picker-selected"
        >
          {selectedOptions.map((option) => {
            const selectedLabel =
              option.selectedLabel ?? optionPresentation(option);
            return (
              <span
                key={option.id}
                className="bg-muted inline-flex h-7 max-w-full min-w-0 items-center gap-1 border border-[var(--border-ink)] px-2 font-mono text-xs shadow-[var(--shadow-chip)]"
              >
                {option.hidden ? (
                  <EyeOff aria-label="Hidden" className="size-3 shrink-0" />
                ) : null}
                <Tooltip
                  className="min-w-0 flex-1"
                  focusable={false}
                  label={selectedLabel}
                >
                  <EntityOptionPresentation option={option} />
                </Tooltip>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label={`Remove ${selectedLabel}`}
                  disabled={disabled}
                  onClick={() => {
                    const nextValue = valueRef.current.filter(
                      (idValue) => idValue !== option.id,
                    );
                    valueRef.current = nextValue;
                    onChange(
                      nextValue,
                      effectiveOptions.filter((candidate) =>
                        nextValue.includes(candidate.id),
                      ),
                    );
                  }}
                >
                  <Close aria-hidden="true" />
                </Button>
              </span>
            );
          })}
          {groupValues.map((fqn, groupIndex) => (
            <span
              key={`group:${fqn}`}
              className="bg-muted inline-flex h-7 max-w-full min-w-0 items-center gap-1 border border-[var(--border-ink)] px-2 font-mono text-xs shadow-[var(--shadow-chip)]"
            >
              <Tooltip
                className="min-w-0 flex-1"
                focusable={false}
                label={`${fqn}:* (entire group)`}
              >
                <span className="block truncate">{fqn}:* (entire group)</span>
              </Tooltip>
              <Tooltip asChild label={`Remove group ${fqn}`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label={`Remove group ${fqn}`}
                  data-entity-group-remove
                  disabled={disabled}
                  onClick={() => {
                    restoreGroupFocusRef.current = groupIndex;
                    const nextGroupValues = groupValuesRef.current.filter(
                      (candidate) => candidate !== fqn,
                    );
                    groupValuesRef.current = nextGroupValues;
                    onGroupChange?.(nextGroupValues);
                  }}
                >
                  <Close aria-hidden="true" />
                </Button>
              </Tooltip>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

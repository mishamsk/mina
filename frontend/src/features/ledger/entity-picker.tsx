import { ChevronRight, Close, EyeOff, Home, Plus } from "pixelarticons/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { FqnPath } from "./fqn-path";

export interface EntityOption {
  readonly detail?: string;
  readonly hidden?: boolean;
  readonly id: number;
  readonly label: string;
  readonly metadata?: string;
  readonly searchLabel: string;
  readonly selectedLabel?: string;
}

type CreateEntityOption = (fqn: string) => Promise<EntityOption>;

interface EntityPickerProps {
  readonly autoFocus?: boolean;
  readonly createConflictOptions?: readonly EntityOption[];
  readonly clearOnSelect?: boolean;
  readonly createOption?: CreateEntityOption;
  readonly disabled?: boolean;
  readonly exactMatchOptions?: readonly EntityOption[];
  readonly excludedOptionIds?: readonly number[];
  readonly id: string;
  readonly hierarchical?: boolean;
  readonly label: string;
  readonly labelClassName?: string;
  readonly onChange: (id: number | undefined) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly openOnFocus?: boolean;
  readonly options: readonly EntityOption[];
  readonly placeholder?: string;
  readonly value: number | undefined;
}

interface HierarchyGroup {
  readonly childCount: number;
  readonly fqn: string;
  readonly parentFqn: string;
  readonly segment: string;
}

interface PickerLeafRow {
  readonly kind: "leaf";
  readonly option: EntityOption;
}

interface PickerGroupRow {
  readonly group: HierarchyGroup;
  readonly kind: "group";
}

interface PickerCreateRow {
  readonly fqn: string;
  readonly kind: "create";
}

type PickerRow = PickerLeafRow | PickerGroupRow | PickerCreateRow;

interface QueryModel {
  readonly committedPrefix: string;
  readonly filter: string;
  readonly levelMode: boolean;
}

const searchLimit = 8;

const normalized = (value: string): string => value.trim().toLocaleLowerCase();

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

const pathsConflict = (candidate: string, existing: string): boolean =>
  candidate === existing ||
  candidate.startsWith(`${existing}:`) ||
  existing.startsWith(`${candidate}:`);

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
  return `${id}-option-group-${encodeURIComponent(row.group.fqn)}`;
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
  createConflictOptions = [],
  clearOnSelect = false,
  createOption,
  disabled = false,
  exactMatchOptions = [],
  excludedOptionIds = [],
  id,
  hierarchical = true,
  label,
  labelClassName,
  onChange,
  onOpenChange,
  openOnFocus = true,
  options,
  placeholder = "Search",
  value,
}: EntityPickerProps) => {
  const [createdOptions, setCreatedOptions] = useState<readonly EntityOption[]>(
    [],
  );
  const effectiveOptions = useMemo(
    () =>
      mergeOptions(options, createdOptions).filter(
        (option) => !excludedOptionIds.includes(option.id),
      ),
    [createdOptions, excludedOptionIds, options],
  );
  const selected = effectiveOptions.find((option) => option.id === value);
  const [query, setQuery] = useState(selected?.searchLabel ?? "");
  const displayQuery =
    query || (value === undefined ? "" : (selected?.searchLabel ?? ""));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [createError, setCreateError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const typedThisSessionRef = useRef(false);
  const interactionVersionRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const deferredCloseFrameRef = useRef<number | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  const skipInitialAutoFocusOpenRef = useRef(autoFocus);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(
    () => () => {
      interactionVersionRef.current += 1;
      window.cancelAnimationFrame(deferredCloseFrameRef.current ?? 0);
    },
    [],
  );

  const groups = useMemo(
    () => (hierarchical ? deriveGroups(effectiveOptions) : []),
    [effectiveOptions, hierarchical],
  );
  const groupFqns = useMemo(
    () => new Set(groups.map((group) => group.fqn)),
    [groups],
  );
  const model = useMemo(
    () => deriveQueryModel(query, groupFqns),
    [groupFqns, query],
  );
  const retainedPrefixRef = useRef(model.committedPrefix);
  useEffect(() => {
    if (!selected || query || typedThisSessionRef.current) {
      return;
    }
    const selectedModel = deriveQueryModel(selected.searchLabel, groupFqns);
    const selectedRows = rowsForQuery(effectiveOptions, groups, selectedModel);
    retainedPrefixRef.current = selectedModel.committedPrefix;
    setQuery(selected.searchLabel);
    setActiveIndex(
      Math.max(
        0,
        selectedRows.findIndex(
          (row) => row.kind === "leaf" && row.option.id === selected.id,
        ),
      ),
    );
  }, [effectiveOptions, groupFqns, groups, query, selected]);
  const optionRows = useMemo(
    () => rowsForQuery(effectiveOptions, groups, model),
    [effectiveOptions, groups, model],
  );
  const createAllowed =
    Boolean(createOption) &&
    fqnIsValid(query) &&
    ![...effectiveOptions, ...exactMatchOptions, ...createConflictOptions].some(
      (option) => pathsConflict(query, option.searchLabel),
    );
  const rows = useMemo<readonly PickerRow[]>(
    () =>
      createAllowed
        ? [...optionRows, { fqn: query, kind: "create" }]
        : optionRows,
    [createAllowed, optionRows, query],
  );
  const clampedActiveIndex =
    rows.length === 0 ? 0 : Math.min(activeIndex, rows.length - 1);
  const activeRow = rows[clampedActiveIndex];
  const activeOptionId =
    open && !disabled && activeRow ? rowId(id, activeRow) : undefined;
  const contextText = model.committedPrefix
    ? `Browsing under ${model.committedPrefix}`
    : "Searching full paths";

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    inputRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (!activeOptionId) {
      return;
    }
    listboxRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(activeOptionId)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId, open]);

  const updateOpen = (nextOpen: boolean, typedSession = false) => {
    if (nextOpen && !open) {
      typedThisSessionRef.current = typedSession;
    }
    if (!nextOpen) {
      typedThisSessionRef.current = false;
    }
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

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

  const selectOption = (option: EntityOption) => {
    interactionVersionRef.current += 1;
    onChangeRef.current(option.id);
    setQuery(
      retainedPrefixAfterPick(option, clearOnSelect, retainedPrefixRef.current),
    );
    setActiveIndex(0);
    setCreateError(undefined);
    updateOpen(false);
  };

  const drillInto = (group: HierarchyGroup) => {
    interactionVersionRef.current += 1;
    retainedPrefixRef.current = group.fqn;
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
    if (row.kind === "leaf") {
      selectOption(row.option);
      return;
    }
    if (row.kind === "group") {
      drillInto(row.group);
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
        <PopoverAnchor asChild>
          <input
            ref={inputRef}
            id={id}
            type="text"
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
            )}
            disabled={disabled}
            placeholder={placeholder}
            value={displayQuery}
            onChange={(event) => {
              interactionVersionRef.current += 1;
              const nextQuery = event.target.value;
              const nextModel = deriveQueryModel(nextQuery, groupFqns);
              retainedPrefixRef.current =
                nextModel.committedPrefix ||
                (retainedPrefixRef.current &&
                nextQuery.startsWith(`${retainedPrefixRef.current}:`)
                  ? retainedPrefixRef.current
                  : "");
              typedThisSessionRef.current = true;
              const exactOption = [
                ...effectiveOptions,
                ...exactMatchOptions,
              ].find((option) => option.searchLabel === nextQuery);
              if (exactOption) {
                selectOption(exactOption);
                return;
              }
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
              setActiveIndex(0);
              if (!selected || selected.searchLabel !== nextQuery) {
                onChange(undefined);
              }
            }}
            onFocus={() => {
              if (disabled || !openOnFocus) {
                return;
              }
              const nextQuery = selected?.searchLabel ?? query;
              setQuery(nextQuery);
              if (skipInitialAutoFocusOpenRef.current) {
                skipInitialAutoFocusOpenRef.current = false;
                return;
              }
              updateOpen(true);
              const focusedModel = deriveQueryModel(nextQuery, groupFqns);
              const focusedRows = rowsForQuery(
                effectiveOptions,
                groups,
                focusedModel,
              );
              setActiveIndex(
                Math.max(
                  0,
                  focusedRows.findIndex(
                    (row) => row.kind === "leaf" && row.option.id === value,
                  ),
                ),
              );
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

              if (event.key === "Enter" && open && activeRow) {
                event.preventDefault();
                void activateRow(activeRow);
                return;
              }

              if (
                event.key === "ArrowRight" &&
                open &&
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
                activeRow &&
                typedThisSessionRef.current
              ) {
                const adoptedValue =
                  activeRow.kind === "group"
                    ? `${activeRow.group.fqn}:`
                    : activeRow.kind === "leaf"
                      ? activeRow.option.searchLabel
                      : activeRow.fqn;
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
                const nextQuery = query.slice(0, -1);
                setQuery(nextQuery);
                setActiveIndex(0);
                setCreateError(undefined);
                onChange(undefined);
                const nextModel = deriveQueryModel(nextQuery, groupFqns);
                retainedPrefixRef.current = nextModel.committedPrefix;
                setAnnouncement(
                  nextModel.committedPrefix
                    ? `Back to ${nextModel.committedPrefix}`
                    : "Back to root",
                );
              }
            }}
          />
        </PopoverAnchor>
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
            data-picker-portal
            data-picker-mode={model.levelMode ? "level" : "search"}
            align="start"
            collisionPadding={4}
            sideOffset={4}
            sticky="always"
            updatePositionStrategy="always"
            className="max-h-[min(14rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] overflow-auto p-0"
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
            {rows.length > 0 ? (
              rows.map((row, rowIndex) => {
                const option = (
                  <button
                    key={rowId(id, row)}
                    id={rowId(id, row)}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-disabled={
                      row.kind === "create" && creating ? true : undefined
                    }
                    aria-description={
                      row.kind === "create" && creating
                        ? "Wait for creation to finish."
                        : undefined
                    }
                    aria-label={
                      row.kind === "group"
                        ? `${row.group.fqn}, group, ${row.group.childCount} children`
                        : row.kind === "create"
                          ? `Create ${row.fqn}`
                          : undefined
                    }
                    aria-selected={
                      row.kind === "leaf" ? row.option.id === value : false
                    }
                    className={cn(
                      "hover:bg-muted flex w-full items-center px-2 py-2 text-left text-sm",
                      row.kind === "create" && "bg-card sticky bottom-0",
                      rowIndex === clampedActiveIndex &&
                        "bg-[var(--color-interactive-bright)]",
                      row.kind === "leaf" &&
                        row.option.id === value &&
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
                        <span className="flex max-w-full min-w-0 items-center gap-1 font-medium">
                          {row.option.hidden ? (
                            <EyeOff
                              aria-label="Hidden"
                              className="size-3 shrink-0"
                            />
                          ) : null}
                          <Tooltip
                            className="min-w-0"
                            focusable={false}
                            label={row.option.label}
                          >
                            <span
                              className={cn(
                                "block",
                                rowIndex === clampedActiveIndex
                                  ? "break-all whitespace-normal"
                                  : "truncate",
                              )}
                            >
                              {row.option.label}
                            </span>
                          </Tooltip>
                        </span>
                        {row.option.detail || row.option.metadata ? (
                          <span className="flex max-w-full min-w-0 items-center gap-1 text-xs">
                            {row.option.detail ? (
                              row.option.detail === row.option.searchLabel ? (
                                <FqnPath
                                  className="min-w-0 flex-1 text-xs"
                                  focusable={false}
                                  value={row.option.detail}
                                />
                              ) : (
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
                              )
                            ) : null}
                            {row.option.detail && row.option.metadata ? (
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
                                  "text-muted-foreground block max-w-[45%] shrink-0 font-mono text-xs",
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
                    disabled={!creating}
                    label="Wait for creation to finish."
                  >
                    {option}
                  </Tooltip>
                ) : (
                  option
                );
              })
            ) : (
              <div className="text-muted-foreground px-2 py-2 text-sm">
                {model.committedPrefix
                  ? `No matches under ${model.committedPrefix}:`
                  : "No matches"}
              </div>
            )}
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
  readonly createConflictOptions?: readonly EntityOption[];
  readonly createOption?: CreateEntityOption;
  readonly disabled?: boolean;
  readonly id: string;
  readonly hierarchical?: boolean;
  readonly label: string;
  readonly labelClassName?: string;
  readonly onChange: (ids: readonly number[]) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly options: readonly EntityOption[];
  readonly placeholder?: string;
  readonly value: readonly number[];
}

export const EntityMultiPicker = ({
  autoFocus = false,
  createConflictOptions = [],
  createOption,
  disabled = false,
  id,
  hierarchical = true,
  label,
  labelClassName,
  onChange,
  onOpenChange,
  options,
  placeholder = "Search",
  value,
}: EntityMultiPickerProps) => {
  const [createdOptions, setCreatedOptions] = useState<readonly EntityOption[]>(
    [],
  );
  const effectiveOptions = useMemo(
    () => mergeOptions(options, createdOptions),
    [createdOptions, options],
  );
  const selectedOptions = effectiveOptions.filter((option) =>
    value.includes(option.id),
  );
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const availableOptions = effectiveOptions.filter(
    (option) => !value.includes(option.id),
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <EntityPicker
        autoFocus={autoFocus}
        clearOnSelect
        createConflictOptions={mergeOptions(
          createConflictOptions,
          createdOptions,
        )}
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
        onOpenChange={onOpenChange}
        options={availableOptions}
        placeholder={placeholder}
        value={undefined}
        onChange={(nextId) => {
          if (nextId) {
            const nextValue = [...valueRef.current, nextId];
            valueRef.current = nextValue;
            onChange(nextValue);
          }
        }}
      />
      {selectedOptions.length > 0 ? (
        <div
          className="relative z-40 flex w-full min-w-0 flex-wrap gap-1 overflow-x-hidden p-0.5"
          data-testid="entity-multi-picker-selected"
        >
          {selectedOptions.map((option) => {
            const selectedLabel = option.selectedLabel ?? option.label;
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
                  <span className="block truncate">{selectedLabel}</span>
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
                    onChange(nextValue);
                  }}
                >
                  <Close aria-hidden="true" />
                </Button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

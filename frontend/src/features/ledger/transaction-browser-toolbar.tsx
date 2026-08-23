import { DollarSign } from "lucide-react";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Close,
  Coins,
  Filter,
} from "pixelarticons/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import {
  focusWithoutTooltip,
  Tooltip as AppTooltip,
} from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  transactionClasses,
  type TransactionFilters,
} from "@/models/transaction-filters";
import {
  type TransactionSort,
  type TransactionSortDirection,
  transactionSortOptions,
} from "@/models/transaction-sorting";

import { transactionClassLabel } from "./format";
import { TransactionSearchInput } from "./transaction-search-input";
import type { TransactionAmountDisplayMode } from "./use-transaction-browser-page";

interface TransactionBrowserToolbarProps {
  readonly amountDisplayMode: TransactionAmountDisplayMode;
  readonly amountSavePending: boolean;
  readonly editMode: boolean;
  readonly dateJumpLoading: boolean;
  readonly dateJumpEnabled: boolean;
  readonly dateJumpValue: string;
  readonly extraControls?: ReactNode;
  readonly filterControls: ReactNode;
  readonly hasActiveFilterChips: boolean;
  readonly filters: TransactionFilters;
  readonly idPrefix: string;
  readonly onClearFilterChips: () => void;
  readonly onClearSelection: () => void;
  readonly onDateJumpNext: (trigger: HTMLButtonElement) => void;
  readonly onDateJumpPrevious: (trigger: HTMLButtonElement) => void;
  readonly onDateJumpToday: (trigger: HTMLButtonElement) => void;
  readonly onDateJumpValueChange: (value: string) => void;
  readonly onSelectPage: () => void;
  readonly onSearchChange: (value: string) => void;
  readonly onSetEditMode: (enabled: boolean) => void;
  readonly onSortChange: (sort: TransactionSort) => void;
  readonly onSortDirectionChange: (direction: TransactionSortDirection) => void;
  readonly onToggleAmountDisplayMode: () => void;
  readonly onTransactionClassesChange: (
    classes: TransactionFilters["classes"],
  ) => void;
  readonly selectableCount: number;
  readonly selectedCount: number;
  readonly sort: TransactionSort;
  readonly sortDirection: TransactionSortDirection;
}

export const TransactionBrowserToolbar = ({
  amountDisplayMode,
  amountSavePending,
  editMode,
  dateJumpLoading,
  dateJumpEnabled,
  dateJumpValue,
  extraControls,
  filterControls,
  hasActiveFilterChips,
  filters,
  idPrefix,
  onClearFilterChips,
  onClearSelection,
  onDateJumpNext,
  onDateJumpPrevious,
  onDateJumpToday,
  onDateJumpValueChange,
  onSelectPage,
  onSearchChange,
  onSetEditMode,
  onSortChange,
  onSortDirectionChange,
  onToggleAmountDisplayMode,
  onTransactionClassesChange,
  selectableCount,
  selectedCount,
  sort,
  sortDirection,
}: TransactionBrowserToolbarProps) => {
  const [filterBarOpen, setFilterBarOpen] = useState(false);
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false);
  const sortFieldLabel =
    sort === "initiated_date"
      ? "Date"
      : sort === "created_at"
        ? "Created"
        : "Updated";
  const classFilterLabel =
    filters.classes.length === 0
      ? "All classes"
      : filters.classes.map(transactionClassLabel).join(", ");
  const dateJumpDisabledReason = !dateJumpEnabled
    ? "Date jumping requires Date sorting with newest first"
    : dateJumpLoading
      ? "A date jump is in progress"
      : null;
  const editModeButtonRef = useRef<HTMLButtonElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const selectPageButtonRef = useRef<HTMLButtonElement>(null);
  const classTriggerRef = useRef<HTMLButtonElement>(null);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  const sortOutsideFocusTargetRef = useRef<HTMLElement>(null);
  const restoreSortTriggerFocusRef = useRef(true);
  const previousEditModeRef = useRef(editMode);
  const showFilterBar = !editMode && (filterBarOpen || hasActiveFilterChips);
  const clearSelectionAndRestoreFocus = () => {
    onClearSelection();
    window.requestAnimationFrame(() => {
      doneButtonRef.current?.focus({ preventScroll: true });
    });
  };

  useLayoutEffect(() => {
    const previousEditMode = previousEditModeRef.current;
    previousEditModeRef.current = editMode;
    if (editMode) {
      const frame = window.requestAnimationFrame(() => {
        setFilterBarOpen(false);
        (selectPageButtonRef.current ?? doneButtonRef.current)?.focus({
          preventScroll: true,
        });
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    if (previousEditMode) {
      const frame = window.requestAnimationFrame(() => {
        if (hasActiveFilterChips) setFilterBarOpen(true);
        editModeButtonRef.current?.focus({ preventScroll: true });
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }
  }, [editMode, hasActiveFilterChips]);

  useLayoutEffect(() => {
    if (!hasActiveFilterChips) return;
    const frame = window.requestAnimationFrame(() => {
      setFilterBarOpen(true);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [hasActiveFilterChips]);

  return (
    <div className="flex flex-col gap-3">
      {editMode ? (
        <div
          data-transaction-browser-edit-controls
          data-testid="transaction-browser-edit-mode-header"
          className="flex min-h-10 animate-[toolbar-mode-swap_120ms_steps(2)] flex-wrap items-center gap-3 motion-reduce:animate-none"
        >
          <span className="font-heading text-foreground inline-flex min-h-7 items-center border-2 border-[var(--border-ink)] bg-[var(--color-interactive-bright)] px-2 text-xs font-semibold uppercase shadow-[var(--shadow-chip)]">
            Edit mode
          </span>
          <span
            className="font-heading text-sm font-semibold text-[var(--frame-foreground)] uppercase"
            aria-live="polite"
          >
            <span
              key={selectedCount}
              className="inline-block animate-[score-pop_150ms_steps(2)] motion-reduce:animate-none"
            >
              {selectedCount}
            </span>{" "}
            selected
          </span>
          {selectableCount > 0 ? (
            <Button
              ref={selectPageButtonRef}
              type="button"
              variant="outline"
              size="sm"
              onClick={onSelectPage}
            >
              <Check aria-hidden="true" />
              Select page
            </Button>
          ) : null}
          {selectedCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearSelectionAndRestoreFocus}
            >
              <Close aria-hidden="true" />
              Clear
            </Button>
          ) : null}
          <AppTooltip
            className="ml-auto"
            label="Exit after the amount update finishes"
            disabled={!amountSavePending}
            focusable={false}
          >
            <Button
              ref={doneButtonRef}
              type="button"
              size="sm"
              data-edit-mode-done
              onClick={() => {
                onSetEditMode(false);
              }}
            >
              Done
            </Button>
          </AppTooltip>
        </div>
      ) : (
        <div
          data-testid="transaction-browser-toolbar-row"
          className="flex animate-[toolbar-mode-swap_120ms_steps(2)] flex-wrap items-end gap-3 motion-reduce:animate-none"
        >
          <div className="flex min-w-[11rem] flex-col gap-1">
            <label
              htmlFor={`${idPrefix}-search`}
              className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
            >
              Search
            </label>
            <TransactionSearchInput
              id={`${idPrefix}-search`}
              onSearchChange={onSearchChange}
              value={filters.search ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${idPrefix}-date-jump`}
              className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
            >
              Go to day
            </label>
            <div className="flex items-center gap-1">
              <AppTooltip
                asChild={dateJumpEnabled}
                focusable={dateJumpDisabledReason !== null}
                label={dateJumpDisabledReason ?? "Previous day"}
                triggerLabel={
                  dateJumpDisabledReason
                    ? `Previous day unavailable: ${dateJumpDisabledReason}`
                    : undefined
                }
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label="Previous day"
                  disabled={dateJumpLoading || !dateJumpEnabled}
                  onClick={(event) => {
                    onDateJumpPrevious(event.currentTarget);
                  }}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
              </AppTooltip>
              <AppTooltip
                asChild={dateJumpEnabled}
                focusable={!dateJumpEnabled}
                label={dateJumpDisabledReason ?? "Choose a day"}
                triggerLabel={
                  dateJumpDisabledReason
                    ? `Choose a day unavailable: ${dateJumpDisabledReason}`
                    : undefined
                }
              >
                <input
                  id={`${idPrefix}-date-jump`}
                  type="date"
                  className="bg-card text-foreground disabled:bg-muted disabled:text-muted-foreground h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)] disabled:cursor-not-allowed disabled:border-[var(--muted-foreground)] disabled:shadow-none"
                  value={dateJumpValue}
                  aria-busy={dateJumpLoading}
                  disabled={!dateJumpEnabled}
                  readOnly={dateJumpLoading}
                  onChange={(event) => {
                    onDateJumpValueChange(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || dateJumpLoading) {
                      return;
                    }
                    event.preventDefault();
                    onDateJumpValueChange(event.currentTarget.value);
                  }}
                />
              </AppTooltip>
              <AppTooltip
                asChild={dateJumpEnabled}
                focusable={dateJumpDisabledReason !== null}
                label={dateJumpDisabledReason ?? "Next day"}
                triggerLabel={
                  dateJumpDisabledReason
                    ? `Next day unavailable: ${dateJumpDisabledReason}`
                    : undefined
                }
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label="Next day"
                  disabled={dateJumpLoading || !dateJumpEnabled}
                  onClick={(event) => {
                    onDateJumpNext(event.currentTarget);
                  }}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </AppTooltip>
              <AppTooltip
                asChild={dateJumpEnabled}
                focusable={dateJumpDisabledReason !== null}
                label={dateJumpDisabledReason ?? "Today"}
                triggerLabel={
                  dateJumpDisabledReason
                    ? `Today unavailable: ${dateJumpDisabledReason}`
                    : undefined
                }
              >
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  aria-label="Today"
                  disabled={dateJumpLoading || !dateJumpEnabled}
                  onClick={(event) => {
                    onDateJumpToday(event.currentTarget);
                  }}
                >
                  <Calendar data-icon="inline-start" aria-hidden="true" />
                  <span className="hidden sm:inline">Today</span>
                </Button>
              </AppTooltip>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${idPrefix}-class`}
              className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
            >
              Class
            </label>
            <Popover modal>
              <AppTooltip label={classFilterLabel} asChild>
                <PopoverTrigger asChild>
                  <Button
                    ref={classTriggerRef}
                    id={`${idPrefix}-class`}
                    type="button"
                    variant="outline"
                    size="lg"
                    aria-label={`Class: ${classFilterLabel}`}
                    className="min-w-32 justify-between"
                  >
                    <span className="max-w-48 truncate">
                      {classFilterLabel}
                    </span>
                    <ChevronDown aria-hidden="true" data-icon="inline-end" />
                  </Button>
                </PopoverTrigger>
              </AppTooltip>
              <PopoverContent
                aria-label="Transaction classes"
                className="w-56 space-y-1 p-2"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  focusWithoutTooltip(classTriggerRef.current);
                }}
              >
                {transactionClasses.map((transactionClass) => {
                  const selected = filters.classes.includes(transactionClass);
                  return (
                    <label
                      key={transactionClass}
                      className="flex min-h-8 cursor-pointer items-center gap-3 px-2 font-mono text-sm hover:bg-[var(--color-interactive-bright)]"
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => {
                          const selectedClasses = new Set(filters.classes);
                          if (selected) {
                            selectedClasses.delete(transactionClass);
                          } else {
                            selectedClasses.add(transactionClass);
                          }
                          onTransactionClassesChange(
                            transactionClasses.filter((candidate) =>
                              selectedClasses.has(candidate),
                            ),
                          );
                        }}
                      />
                      {transactionClassLabel(transactionClass)}
                    </label>
                  );
                })}
              </PopoverContent>
            </Popover>
          </div>
          {extraControls}
          <div className="flex h-9 items-end gap-2">
            <Popover
              open={sortPopoverOpen}
              onOpenChange={(open) => {
                if (open) {
                  sortOutsideFocusTargetRef.current = null;
                  restoreSortTriggerFocusRef.current = true;
                }
                setSortPopoverOpen(open);
              }}
            >
              <AppTooltip
                asChild
                disabled={sortPopoverOpen}
                label="Sort transactions"
              >
                <PopoverTrigger asChild>
                  <Button
                    ref={sortTriggerRef}
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label={`Sort transactions: ${sort === "initiated_date" ? "initiated" : sort === "created_at" ? "created" : "updated"}, ${sortDirection === "desc" ? "newest first" : "oldest first"}`}
                  >
                    {sortDirection === "desc" ? (
                      <ArrowDown aria-hidden="true" />
                    ) : (
                      <ArrowUp aria-hidden="true" />
                    )}
                    <span
                      aria-hidden="true"
                      className="font-mono text-[0.65rem] leading-none"
                    >
                      {sortFieldLabel.charAt(0)}
                    </span>
                  </Button>
                </PopoverTrigger>
              </AppTooltip>
              <PopoverContent
                aria-label="Sort transactions"
                className="w-60 space-y-3"
                align="end"
                onCloseAutoFocus={(event) => {
                  if (!restoreSortTriggerFocusRef.current) {
                    event.preventDefault();
                    restoreSortTriggerFocusRef.current = true;
                    const outsideFocusTarget =
                      sortOutsideFocusTargetRef.current;
                    sortOutsideFocusTargetRef.current = null;
                    if (outsideFocusTarget?.isConnected) {
                      focusWithoutTooltip(outsideFocusTarget);
                    }
                    return;
                  }
                  event.preventDefault();
                  focusWithoutTooltip(sortTriggerRef.current);
                }}
                onInteractOutside={(event) => {
                  if (
                    !(event.target instanceof Node) ||
                    !sortTriggerRef.current?.contains(event.target)
                  ) {
                    const outsideTarget = event.detail.originalEvent.target;
                    const outsideFocusTarget =
                      outsideTarget instanceof HTMLElement
                        ? outsideTarget.closest<HTMLElement>(
                            "button, a[href], input, textarea, select, [tabindex]:not([tabindex='-1'])",
                          )
                        : null;
                    sortOutsideFocusTargetRef.current = outsideFocusTarget;
                    restoreSortTriggerFocusRef.current =
                      outsideFocusTarget === null;
                  }
                }}
              >
                <div className="space-y-2">
                  <p className="text-muted-foreground font-heading text-xs font-semibold uppercase">
                    Sort field
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {transactionSortOptions.map((option) => (
                      <Button
                        key={option}
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={sort === option}
                        className="aria-pressed:bg-[var(--table-header)]"
                        onClick={() => {
                          onSortChange(option);
                        }}
                      >
                        {option === "initiated_date"
                          ? "Date"
                          : option === "created_at"
                            ? "Created"
                            : "Updated"}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-muted-foreground font-heading text-xs font-semibold uppercase">
                    Order
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={sortDirection === "desc"}
                      className="aria-pressed:bg-[var(--table-header)]"
                      onClick={() => {
                        onSortDirectionChange("desc");
                      }}
                    >
                      Newest first
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-pressed={sortDirection === "asc"}
                      className="aria-pressed:bg-[var(--table-header)]"
                      onClick={() => {
                        onSortDirectionChange("asc");
                      }}
                    >
                      Oldest first
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <AppTooltip
              asChild
              label={
                amountDisplayMode === "usd"
                  ? "Show native values"
                  : "Show values in USD"
              }
            >
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="USD display mode"
                aria-pressed={amountDisplayMode === "usd"}
                className="aria-pressed:bg-[var(--table-header)]"
                data-testid="transaction-amount-display-toggle"
                onClick={onToggleAmountDisplayMode}
              >
                {amountDisplayMode === "usd" ? (
                  <DollarSign aria-hidden="true" />
                ) : (
                  <Coins aria-hidden="true" />
                )}
              </Button>
            </AppTooltip>
            <Button
              ref={editModeButtonRef}
              type="button"
              variant="outline"
              size="lg"
              aria-pressed="false"
              onClick={() => onSetEditMode(true)}
            >
              <Check aria-hidden="true" />
              Edit mode
            </Button>
            <AppTooltip
              asChild
              label={showFilterBar ? "Close filters" : "Open filters"}
            >
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label={showFilterBar ? "Close filters" : "Open filters"}
                onClick={() => {
                  if (showFilterBar) {
                    if (hasActiveFilterChips) {
                      onClearFilterChips();
                    }
                    setFilterBarOpen(false);
                    return;
                  }

                  setFilterBarOpen(true);
                }}
              >
                {showFilterBar ? (
                  <Close aria-hidden="true" />
                ) : (
                  <Filter aria-hidden="true" />
                )}
              </Button>
            </AppTooltip>
          </div>
        </div>
      )}
      {showFilterBar ? (
        <div
          data-testid="transaction-browser-filter-bar"
          className="bg-card text-foreground max-h-[min(20svh,12rem)] overflow-y-auto border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)]"
        >
          {filterControls}
        </div>
      ) : null}
    </div>
  );
};

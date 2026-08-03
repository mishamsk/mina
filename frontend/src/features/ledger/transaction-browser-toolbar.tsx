import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Close,
  Filter,
} from "pixelarticons/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { Tooltip as AppTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  transactionClasses,
  type TransactionFilters,
} from "@/models/transaction-filters";

import { transactionClassLabel } from "./format";
import { TransactionSearchInput } from "./transaction-search-input";

interface TransactionBrowserToolbarProps {
  readonly amountSavePending: boolean;
  readonly editMode: boolean;
  readonly dateJumpLoading: boolean;
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
  readonly onTransactionClassChange: (value: string) => void;
  readonly selectableCount: number;
  readonly selectedCount: number;
}

export const TransactionBrowserToolbar = ({
  amountSavePending,
  editMode,
  dateJumpLoading,
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
  onTransactionClassChange,
  selectableCount,
  selectedCount,
}: TransactionBrowserToolbarProps) => {
  const [filterBarOpen, setFilterBarOpen] = useState(false);
  const editModeButtonRef = useRef<HTMLButtonElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const selectPageButtonRef = useRef<HTMLButtonElement>(null);
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
        editModeButtonRef.current?.focus({ preventScroll: true });
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }
  }, [editMode]);

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
              onClick={() => onSetEditMode(false)}
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
          <div className="flex min-w-[16rem] flex-col gap-1">
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
              <AppTooltip asChild label="Previous day">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label="Previous day"
                  disabled={dateJumpLoading}
                  onClick={(event) => {
                    onDateJumpPrevious(event.currentTarget);
                  }}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
              </AppTooltip>
              <input
                id={`${idPrefix}-date-jump`}
                type="date"
                className="bg-card text-foreground h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)] aria-disabled:opacity-70"
                value={dateJumpValue}
                readOnly={dateJumpLoading}
                aria-disabled={dateJumpLoading}
                onChange={(event) => {
                  onDateJumpValueChange(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }
                  event.preventDefault();
                  onDateJumpValueChange(event.currentTarget.value);
                }}
              />
              <AppTooltip asChild label="Next day">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label="Next day"
                  disabled={dateJumpLoading}
                  onClick={(event) => {
                    onDateJumpNext(event.currentTarget);
                  }}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </AppTooltip>
              <Button
                type="button"
                variant="outline"
                size="lg"
                aria-label="Today"
                disabled={dateJumpLoading}
                onClick={(event) => {
                  onDateJumpToday(event.currentTarget);
                }}
              >
                <Calendar data-icon="inline-start" aria-hidden="true" />
                Today
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${idPrefix}-class`}
              className="font-heading text-xs font-semibold text-[var(--frame-muted)] uppercase"
            >
              Class
            </label>
            <Select
              value={filters.classes[0] ?? "all"}
              onValueChange={(value) => {
                onTransactionClassChange(value);
              }}
            >
              <SelectTrigger id={`${idPrefix}-class`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {transactionClasses.map((transactionClass) => (
                  <SelectItem key={transactionClass} value={transactionClass}>
                    {transactionClassLabel(transactionClass)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {extraControls}
          <div className="flex h-9 items-end gap-3">
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
          className="bg-card border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)]"
        >
          {filterControls}
        </div>
      ) : null}
    </div>
  );
};

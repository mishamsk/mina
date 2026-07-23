import {
  Calendar,
  CalendarWeeks,
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
import { cn } from "@/lib/utils";
import {
  transactionClasses,
  type TransactionFilters,
} from "@/models/transaction-filters";

import { transactionClassLabel } from "./format";
import { CalendarWeeksOff } from "./line-icons";
import { TransactionSearchInput } from "./transaction-search-input";

interface TransactionBrowserToolbarProps {
  readonly bulkEditMode: boolean;
  readonly dateJumpLoading: boolean;
  readonly dateJumpValue: string;
  readonly detailPanelOpen: boolean;
  readonly extraControls?: ReactNode;
  readonly filterControls: ReactNode;
  readonly hasActiveFilterChips: boolean;
  readonly filters: TransactionFilters;
  readonly idPrefix: string;
  readonly onClearFilterChips: () => void;
  readonly onClearSelection: () => void;
  readonly onFilterBarClose?: () => void;
  readonly onDateJumpNext: (trigger: HTMLButtonElement) => void;
  readonly onDateJumpPrevious: (trigger: HTMLButtonElement) => void;
  readonly onDateJumpToday: (trigger: HTMLButtonElement) => void;
  readonly onDateJumpValueChange: (value: string) => void;
  readonly onHideExpectedChange: (hideExpected: boolean) => void;
  readonly onSelectPage: () => void;
  readonly onSearchChange: (value: string) => void;
  readonly onSetBulkEditMode: (enabled: boolean) => void;
  readonly onTransactionClassChange: (value: string) => void;
  readonly selectableCount: number;
  readonly selectedCount: number;
}

export const TransactionBrowserToolbar = ({
  bulkEditMode,
  dateJumpLoading,
  dateJumpValue,
  detailPanelOpen,
  extraControls,
  filterControls,
  hasActiveFilterChips,
  filters,
  idPrefix,
  onClearFilterChips,
  onClearSelection,
  onFilterBarClose,
  onDateJumpNext,
  onDateJumpPrevious,
  onDateJumpToday,
  onDateJumpValueChange,
  onHideExpectedChange,
  onSelectPage,
  onSearchChange,
  onSetBulkEditMode,
  onTransactionClassChange,
  selectableCount,
  selectedCount,
}: TransactionBrowserToolbarProps) => {
  const [filterBarOpen, setFilterBarOpen] = useState(false);
  const bulkEditButtonRef = useRef<HTMLButtonElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const selectPageButtonRef = useRef<HTMLButtonElement>(null);
  const previousBulkEditModeRef = useRef(bulkEditMode);
  const showFilterBar =
    !bulkEditMode && (filterBarOpen || hasActiveFilterChips);
  const clearSelectionAndRestoreFocus = () => {
    onClearSelection();
    window.requestAnimationFrame(() => {
      doneButtonRef.current?.focus({ preventScroll: true });
    });
  };

  useLayoutEffect(() => {
    const previousBulkEditMode = previousBulkEditModeRef.current;
    previousBulkEditModeRef.current = bulkEditMode;
    if (bulkEditMode) {
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

    if (previousBulkEditMode) {
      const frame = window.requestAnimationFrame(() => {
        bulkEditButtonRef.current?.focus({ preventScroll: true });
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }
  }, [bulkEditMode]);

  return (
    <div className="flex flex-col gap-3">
      {bulkEditMode ? (
        <div
          data-transaction-browser-bulk-controls
          data-testid="transaction-browser-bulk-mode-bar"
          className="flex min-h-10 animate-[toolbar-mode-swap_120ms_steps(2)] flex-wrap items-center gap-3 motion-reduce:animate-none"
        >
          <span className="font-heading text-foreground inline-flex min-h-7 items-center border-2 border-[var(--border-ink)] bg-[var(--color-interactive-bright)] px-2 text-xs font-semibold uppercase shadow-[var(--shadow-chip)]">
            Bulk edit
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
          <Button
            ref={doneButtonRef}
            type="button"
            size="sm"
            className="ml-auto"
            data-bulk-done
            onClick={() => onSetBulkEditMode(false)}
          >
            Done
          </Button>
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
          <div className="flex h-9 items-end">
            <AppTooltip
              asChild
              label={
                filters.hideExpected
                  ? "Expected hidden — show"
                  : "Hide expected transactions"
              }
            >
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="Hide expected"
                aria-pressed={filters.hideExpected}
                className="aria-pressed:bg-[var(--table-header)]"
                onClick={() => {
                  onHideExpectedChange(!filters.hideExpected);
                }}
              >
                {filters.hideExpected ? (
                  <CalendarWeeksOff
                    aria-hidden="true"
                    data-icon="calendar-weeks-off"
                  />
                ) : (
                  <CalendarWeeks
                    aria-hidden="true"
                    data-icon="calendar-weeks"
                  />
                )}
              </Button>
            </AppTooltip>
          </div>
          {extraControls}
          <div
            className={cn(
              "flex h-9 items-end gap-3",
              detailPanelOpen && "basis-full",
            )}
          >
            <Button
              ref={bulkEditButtonRef}
              type="button"
              variant="outline"
              size="lg"
              aria-pressed="false"
              onClick={() => onSetBulkEditMode(true)}
            >
              <Check aria-hidden="true" />
              Bulk edit
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
                    onFilterBarClose?.();
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

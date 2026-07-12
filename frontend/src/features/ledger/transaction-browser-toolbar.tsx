import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Close,
  Filter,
} from "pixelarticons/react";
import { type ReactNode, useState } from "react";

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
  readonly dateJumpLoading: boolean;
  readonly dateJumpValue: string;
  readonly extraControls?: ReactNode;
  readonly filterControls: ReactNode;
  readonly hasActiveFilterChips: boolean;
  readonly filters: TransactionFilters;
  readonly idPrefix: string;
  readonly onClearFilterChips: () => void;
  readonly onFilterBarClose?: () => void;
  readonly onDateJumpNext: (trigger: HTMLButtonElement) => void;
  readonly onDateJumpPrevious: (trigger: HTMLButtonElement) => void;
  readonly onDateJumpToday: (trigger: HTMLButtonElement) => void;
  readonly onDateJumpValueChange: (value: string) => void;
  readonly onSearchChange: (value: string) => void;
  readonly onTransactionClassChange: (value: string) => void;
}

export const TransactionBrowserToolbar = ({
  dateJumpLoading,
  dateJumpValue,
  extraControls,
  filterControls,
  hasActiveFilterChips,
  filters,
  idPrefix,
  onClearFilterChips,
  onFilterBarClose,
  onDateJumpNext,
  onDateJumpPrevious,
  onDateJumpToday,
  onDateJumpValueChange,
  onSearchChange,
  onTransactionClassChange,
}: TransactionBrowserToolbarProps) => {
  const [filterBarOpen, setFilterBarOpen] = useState(false);
  const showFilterBar = filterBarOpen || hasActiveFilterChips;

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="transaction-browser-toolbar-row"
        className="flex flex-wrap items-end gap-3"
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
        <div className="flex h-9 items-end">
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

import { ChevronLeft, ChevronRight } from "pixelarticons/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
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
  readonly filters: TransactionFilters;
  readonly idPrefix: string;
  readonly onDateJumpNext: (trigger: HTMLButtonElement) => void;
  readonly onDateJumpPrevious: (trigger: HTMLButtonElement) => void;
  readonly onDateJumpValueChange: (value: string) => void;
  readonly onSearchChange: (value: string) => void;
  readonly onTransactionClassChange: (value: string) => void;
}

export const TransactionBrowserToolbar = ({
  dateJumpLoading,
  dateJumpValue,
  extraControls,
  filterControls,
  filters,
  idPrefix,
  onDateJumpNext,
  onDateJumpPrevious,
  onDateJumpValueChange,
  onSearchChange,
  onTransactionClassChange,
}: TransactionBrowserToolbarProps) => (
  <div className="flex flex-wrap items-start gap-3">
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
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={dateJumpLoading}
          onClick={(event) => {
            onDateJumpPrevious(event.currentTarget);
          }}
        >
          <ChevronLeft aria-hidden="true" />
          Previous day
        </Button>
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
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={dateJumpLoading}
          onClick={(event) => {
            onDateJumpNext(event.currentTarget);
          }}
        >
          <ChevronRight aria-hidden="true" />
          Next day
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
      <select
        id={`${idPrefix}-class`}
        className="bg-card text-foreground h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
        value={filters.classes[0] ?? "all"}
        onChange={(event) => {
          onTransactionClassChange(event.target.value);
        }}
      >
        <option value="all">All classes</option>
        {transactionClasses.map((transactionClass) => (
          <option key={transactionClass} value={transactionClass}>
            {transactionClassLabel(transactionClass)}
          </option>
        ))}
      </select>
    </div>
    {extraControls}
    <div className="mt-5 flex min-w-9 flex-1">{filterControls}</div>
  </div>
);

import { Pencil } from "pixelarticons/react";
import { type ReactNode, useRef, useState } from "react";

import type { JournalRecord, Transaction } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";

const amountPattern = /^\d+(\.\d{1,8})?$/;

const compactAmount = (amount: string, currency: string): string => {
  const unsigned = amount.replace(/^-/, "");
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const scale = currency.startsWith("C::") ? 8 : 2;
  const compactFraction = fraction.slice(0, scale).replace(/0+$/, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
};

const normalizeAmount = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!amountPattern.test(trimmed)) {
    return undefined;
  }

  const [whole = "0", fraction = ""] = trimmed.split(".");
  const mantissa = BigInt(`${whole}${fraction.padEnd(8, "0")}`);
  if (mantissa <= 0n) {
    return undefined;
  }
  return `${whole}.${fraction.padEnd(8, "0")}`;
};

interface TransactionAmountCellProps {
  readonly children: ReactNode;
  readonly records: readonly [JournalRecord, JournalRecord];
  readonly testIdPrefix: string;
  readonly transaction: Transaction;
  readonly onSave: (
    transaction: Transaction,
    records: readonly [JournalRecord, JournalRecord],
    amount: string,
  ) => Promise<void>;
}

export const TransactionAmountCell = ({
  children,
  onSave,
  records,
  testIdPrefix,
  transaction,
}: TransactionAmountCellProps) => {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(() =>
    compactAmount(records[0].amount, records[0].currency),
  );
  const [errorMessage, setErrorMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const displayCellRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const amountFromRecords = compactAmount(
    records[0].amount,
    records[0].currency,
  );

  const restoreDisplayFocus = () => {
    window.requestAnimationFrame(() => {
      displayCellRef.current?.focus();
    });
  };

  const cancel = () => {
    if (saving) {
      return;
    }
    setAmount(amountFromRecords);
    setErrorMessage(undefined);
    setEditing(false);
    restoreDisplayFocus();
  };

  const startEditing = () => {
    setAmount(amountFromRecords);
    setErrorMessage(undefined);
    setEditing(true);
  };

  const save = async () => {
    if (savingRef.current) {
      return;
    }

    const normalizedAmount = normalizeAmount(amount);
    if (!normalizedAmount) {
      setErrorMessage(
        "Enter an amount greater than zero with up to 8 decimals.",
      );
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setErrorMessage(undefined);
    try {
      await onSave(transaction, records, normalizedAmount);
      setEditing(false);
      restoreDisplayFocus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div
        ref={displayCellRef}
        tabIndex={0}
        className="group flex min-h-6 min-w-0 items-center justify-end gap-1"
        data-row-expand-passthrough="true"
        data-testid={`${testIdPrefix}-amount-cell`}
        onKeyDown={(event) => {
          if (event.key === "F2") {
            event.preventDefault();
            startEditing();
          }
        }}
      >
        <span className="min-w-0 flex-1 text-right">{children}</span>
        <Tooltip label="Edit amount" asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="pointer-events-none shrink-0 opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
            aria-label="Edit row value"
            onClick={startEditing}
          >
            <Pencil aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-col items-end gap-2"
      data-testid={`${testIdPrefix}-amount-editor`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          cancel();
        }
      }}
    >
      <label className="sr-only" htmlFor={`${testIdPrefix}-amount`}>
        Amount
      </label>
      <input
        autoFocus
        id={`${testIdPrefix}-amount`}
        inputMode="decimal"
        value={amount}
        disabled={saving}
        className="bg-card h-8 w-full min-w-24 border-2 border-[var(--border-ink)] px-2 text-right font-mono text-sm shadow-[var(--shadow-chip)]"
        onChange={(event) => setAmount(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => void save()}
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={cancel}
        >
          Cancel
        </Button>
      </div>
      {errorMessage ? (
        <p className="text-destructive text-xs" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
};

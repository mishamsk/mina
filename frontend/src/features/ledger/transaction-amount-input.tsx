import { useEffect, useId, useRef, useState } from "react";

import type { JournalRecord, Transaction } from "@/api";
import { cn } from "@/lib/utils";
import { currencyDisplayMarker } from "@/utils/currency";

import type { AmountSavePageRefresh } from "./transaction-amount-update";
import { transactionRowFallback } from "./transaction-row-focus";

const amountPattern = /^\d+(\.\d{1,8})?$/;
const focusableSelector =
  "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), " +
  "textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

const compactAmount = (amount: string): string => {
  const unsigned = amount.replace(/^-/, "");
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const compactFraction = fraction.slice(0, 8).replace(/0+$/, "");
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

const adjacentFocusableElement = (
  input: HTMLInputElement,
  backwards: boolean,
): HTMLElement | undefined => {
  const root = input.closest<HTMLElement>("[data-transaction-browser='true']");
  const elements = Array.from(
    (root ?? document).querySelectorAll<HTMLElement>(focusableSelector),
  ).filter((element) => element.getClientRects().length > 0);
  const index = elements.indexOf(input);
  return elements[index + (backwards ? -1 : 1)];
};

interface TransactionAmountInputProps {
  readonly disabled?: boolean;
  readonly records: readonly [JournalRecord, JournalRecord];
  readonly testIdPrefix: string;
  readonly transaction: Transaction;
  readonly onInvalidChange?: (invalid: boolean) => void;
  readonly onPendingChange?: (pending: boolean, successful?: boolean) => void;
  readonly onSave: (
    transaction: Transaction,
    amount: string,
    onPageRefresh?: AmountSavePageRefresh,
  ) => Promise<boolean | void>;
}

export const TransactionAmountInput = ({
  disabled = false,
  onInvalidChange,
  onPendingChange,
  onSave,
  records,
  testIdPrefix,
  transaction,
}: TransactionAmountInputProps) => {
  const amountFromRecords = compactAmount(records[0].amount);
  const [draftAmount, setDraftAmount] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const onInvalidChangeRef = useRef(onInvalidChange);
  const pendingFocusTargetRef = useRef<HTMLElement | undefined>(undefined);
  const savingRef = useRef(false);
  const skipNextBlurRef = useRef(false);
  const errorId = useId();
  const amount = draftAmount ?? amountFromRecords;

  useEffect(() => {
    onInvalidChangeRef.current = onInvalidChange;
  }, [onInvalidChange]);

  useEffect(
    () => () => {
      onInvalidChangeRef.current?.(false);
    },
    [],
  );

  const restore = () => {
    onInvalidChange?.(false);
    setDraftAmount(undefined);
    setErrorMessage(undefined);
  };

  const save = async (focusTarget?: HTMLElement) => {
    if (disabled) {
      return;
    }
    if (savingRef.current) {
      if (focusTarget) {
        pendingFocusTargetRef.current = focusTarget;
      }
      return;
    }

    const normalizedAmount = normalizeAmount(amount);
    if (!normalizedAmount) {
      onInvalidChange?.(true);
      setErrorMessage(
        "Enter an amount greater than zero with up to 8 decimals.",
      );
      if (focusTarget) {
        skipNextBlurRef.current = true;
        focusTarget.focus();
      }
      return;
    }
    if (normalizedAmount === normalizeAmount(amountFromRecords)) {
      onInvalidChange?.(false);
      setDraftAmount(undefined);
      setErrorMessage(undefined);
      if (focusTarget) {
        skipNextBlurRef.current = true;
        focusTarget.focus();
      }
      return;
    }

    const input = inputRef.current;
    onInvalidChange?.(false);
    const restoreFallback = transactionRowFallback(
      input,
      transaction.transaction_id,
    );
    pendingFocusTargetRef.current = focusTarget;
    savingRef.current = true;
    onPendingChange?.(true);
    setSaving(true);
    setErrorMessage(undefined);
    let successful = false;
    try {
      const rowRemainsVisible = await onSave(
        transaction,
        normalizedAmount,
        (visible) => {
          if (!visible) {
            restoreFallback();
          }
        },
      );
      successful = true;
      setDraftAmount(undefined);
      if (rowRemainsVisible === false) {
        restoreFallback();
      } else if (pendingFocusTargetRef.current?.isConnected) {
        skipNextBlurRef.current = true;
        pendingFocusTargetRef.current.focus();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
      const activeElement = document.activeElement;
      const anotherAmountInputOwnsFocus =
        activeElement instanceof HTMLInputElement &&
        activeElement !== input &&
        activeElement.matches(
          "input[data-testid^='transaction-'][data-testid$='-amount-input']",
        );
      if (!anotherAmountInputOwnsFocus) {
        window.requestAnimationFrame(() => input?.focus());
      }
    } finally {
      pendingFocusTargetRef.current = undefined;
      savingRef.current = false;
      onPendingChange?.(false, successful);
      setSaving(false);
    }
  };

  const inputTone =
    transaction.transaction_class === "income"
      ? "text-[var(--color-class-income-ink)]"
      : transaction.transaction_class === "refund"
        ? "text-[var(--color-class-refund-ink)]"
        : transaction.transaction_class === "transfer"
          ? "text-[var(--color-class-transfer-ink)]"
          : "text-foreground";

  return (
    <div
      className="flex min-w-0 flex-col items-end gap-1"
      data-amount-input-pending={saving ? "true" : undefined}
      data-testid={`${testIdPrefix}-amount-input-wrap`}
    >
      <span
        className={cn(
          "bg-card flex h-8 w-full min-w-24 items-center border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-chip)]",
          errorMessage && "border-destructive",
          inputTone,
        )}
        data-transaction-row-interactive
      >
        <input
          ref={inputRef}
          aria-label={`Amount for ${transaction.display_title}`}
          aria-describedby={errorMessage ? errorId : undefined}
          aria-disabled={saving || disabled ? true : undefined}
          aria-invalid={errorMessage ? true : undefined}
          className="min-w-0 flex-1 bg-transparent text-right font-mono tabular-nums"
          data-testid={`${testIdPrefix}-amount-input`}
          id={`${testIdPrefix}-amount`}
          inputMode="decimal"
          readOnly={saving || disabled}
          value={amount}
          onBlur={() => {
            if (skipNextBlurRef.current) {
              skipNextBlurRef.current = false;
              return;
            }
            void save();
          }}
          onChange={(event) => {
            onInvalidChange?.(false);
            setDraftAmount(event.target.value);
            setErrorMessage(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (draftAmount !== undefined || errorMessage) {
                event.preventDefault();
                event.stopPropagation();
                restore();
              }
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
              return;
            }
            if (event.key === "Tab") {
              if (disabled) {
                return;
              }
              const target = adjacentFocusableElement(
                event.currentTarget,
                event.shiftKey,
              );
              if (target) {
                event.preventDefault();
                void save(target);
              }
            }
          }}
        />
        <span className="text-muted-foreground ml-1 shrink-0">
          {currencyDisplayMarker(records[0].currency)}
        </span>
      </span>
      {errorMessage ? (
        <p
          id={errorId}
          className="text-destructive max-w-44 text-right text-xs"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
};

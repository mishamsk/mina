import { Check } from "pixelarticons/react";
import { useRef, useState } from "react";

import type { Transaction } from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { formatLocalCivilDate } from "@/utils/date";

interface RecurringOccurrenceConfirmDialogProps {
  readonly errorMessage: string | undefined;
  readonly onConfirm: (actualDate: string) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly pending: boolean;
  readonly transaction: Transaction | undefined;
}

const RecurringOccurrenceConfirmDialogContent = ({
  errorMessage,
  onConfirm,
  onOpenChange,
  open,
  pending,
  transaction,
}: RecurringOccurrenceConfirmDialogProps) => {
  const [actualDate, setActualDate] = useState(
    transaction?.initiated_date ?? "",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const validationMessage =
    actualDate === "" ? "Choose an actual date." : undefined;

  return (
    <ConfirmationDialog
      confirmDisabled={validationMessage !== undefined}
      confirmDisabledTooltip={validationMessage}
      confirmIcon={<Check aria-hidden="true" />}
      confirmLabel="Confirm occurrence"
      confirmVariant="default"
      errorMessage={errorMessage}
      initialFocusRef={inputRef}
      onConfirm={() => onConfirm(actualDate)}
      onOpenChange={onOpenChange}
      open={open && transaction !== undefined}
      pending={pending}
      pendingLabel="Confirming"
      title="Confirm occurrence"
    >
      <p>
        {transaction
          ? `${transaction.display_title} scheduled ${formatLocalCivilDate(
              transaction.initiated_date,
            )}`
          : ""}
      </p>
      <label className="text-foreground grid gap-1 font-mono text-sm">
        Actual date
        <input
          ref={inputRef}
          aria-describedby={validationMessage ? "actual-date-error" : undefined}
          aria-invalid={validationMessage ? true : undefined}
          className="bg-card text-foreground h-9 border-2 border-[var(--border-ink)] px-2 shadow-[var(--shadow-pixel)]"
          onChange={(event) => setActualDate(event.target.value)}
          required
          type="date"
          value={actualDate}
        />
        {validationMessage ? (
          <span
            id="actual-date-error"
            className="text-destructive font-body text-sm"
            role="alert"
          >
            {validationMessage}
          </span>
        ) : null}
      </label>
      <p>The recurring schedule remains fixed to its scheduled dates.</p>
    </ConfirmationDialog>
  );
};

export const RecurringOccurrenceConfirmDialog = (
  props: RecurringOccurrenceConfirmDialogProps,
) => (
  <RecurringOccurrenceConfirmDialogContent
    key={`${String(props.open)}:${String(props.transaction?.transaction_id)}`}
    {...props}
  />
);

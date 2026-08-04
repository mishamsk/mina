import { Check } from "pixelarticons/react";
import { useEffect, useRef } from "react";

import type { Transaction } from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

interface TransactionPostDialogProps {
  readonly errorMessage: string | undefined;
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPostedDateTimeChange: (value: string) => void;
  readonly pending: boolean;
  readonly postedDateTime: string;
  readonly transaction: Transaction;
}

export const TransactionPostDialog = ({
  errorMessage,
  onConfirm,
  onOpenChange,
  onPostedDateTimeChange,
  pending,
  postedDateTime,
  transaction,
}: TransactionPostDialogProps) => {
  const postedDateTimeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!pending && errorMessage) {
      postedDateTimeRef.current?.focus({ preventScroll: true });
    }
  }, [errorMessage, pending]);

  return (
    <ConfirmationDialog
      confirmIcon={<Check aria-hidden="true" />}
      confirmLabel="Post transaction"
      confirmVariant="default"
      errorMessage={errorMessage}
      initialFocusRef={postedDateTimeRef}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      open
      pending={pending}
      pendingLabel="Posting"
      title="Post transaction"
    >
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) {
            onConfirm();
          }
        }}
      >
        <p className="break-words">
          Post every pending balance record in {transaction.display_title}.
        </p>
        <div className="space-y-1">
          <label
            htmlFor="post-transaction-date"
            className="text-foreground block font-mono text-xs font-semibold uppercase"
          >
            Posted date
          </label>
          <input
            ref={postedDateTimeRef}
            id="post-transaction-date"
            type="datetime-local"
            step="any"
            className="bg-card text-foreground h-9 w-full border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
            disabled={pending}
            required
            value={postedDateTime}
            onChange={(event) => {
              onPostedDateTimeChange(event.target.value);
            }}
          />
          <p>The posted date must not be earlier than any pending date.</p>
        </div>
        <button
          type="submit"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        >
          Post transaction
        </button>
      </form>
    </ConfirmationDialog>
  );
};

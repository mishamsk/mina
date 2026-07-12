import { Pencil } from "pixelarticons/react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import type { JournalRecord, Transaction } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { localCivilDateStartISO, localTimestampDateValue } from "@/utils/date";

import type { RecordUpdate } from "./record-editing";

type DetailField = "dates" | "memo" | "postingStatus";

const fieldLabel: Record<DetailField, string> = {
  dates: "dates",
  memo: "memo",
  postingStatus: "posting status",
};

const dateInputClassName =
  "bg-card h-9 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]";

interface RecordDetailCellsProps {
  readonly field: DetailField;
  readonly onSave: (
    transaction: Transaction,
    record: JournalRecord,
    update: RecordUpdate,
  ) => Promise<void>;
  readonly record: JournalRecord;
  readonly transaction: Transaction;
  readonly value: ReactNode;
}

const inputDateValue = (value: string | null | undefined): string =>
  localTimestampDateValue(value);

const timestampForDateInput = (value: string, originalValue: string): string =>
  value === inputDateValue(originalValue)
    ? originalValue
    : localCivilDateStartISO(value);

const nullableTimestampForDateInput = (
  value: string,
  originalValue: string | null | undefined,
): string | null => {
  if (!value) {
    return null;
  }
  return value === inputDateValue(originalValue) && originalValue
    ? originalValue
    : localCivilDateStartISO(value);
};

export const RecordDetailCells = ({
  field,
  onSave,
  record,
  transaction,
  value,
}: RecordDetailCellsProps) => {
  const [editing, setEditing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [memo, setMemo] = useState(record.memo ?? "");
  const [initiatedDate, setInitiatedDate] = useState(
    transaction.initiated_date,
  );
  const [pendingDate, setPendingDate] = useState(
    inputDateValue(record.pending_date),
  );
  const [postedDate, setPostedDate] = useState(
    inputDateValue(record.posted_date),
  );
  const [postingStatusSelectOpen, setPostingStatusSelectOpen] = useState(false);
  const displayCellRef = useRef<HTMLDivElement>(null);

  const restoreDisplayFocus = () => {
    window.requestAnimationFrame(() => {
      displayCellRef.current?.focus();
    });
  };

  const cancel = () => {
    setMemo(record.memo ?? "");
    setInitiatedDate(transaction.initiated_date);
    setPendingDate(inputDateValue(record.pending_date));
    setPostedDate(inputDateValue(record.posted_date));
    setErrorMessage(undefined);
    setEditing(false);
    restoreDisplayFocus();
  };
  const save = async (update: RecordUpdate) => {
    setErrorMessage(undefined);
    try {
      await onSave(transaction, record, update);
      setEditing(false);
      restoreDisplayFocus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    }
  };
  const saveDates = () => {
    if (!pendingDate) {
      setErrorMessage("Pending date is required.");
      return;
    }

    void save({
      initiatedDate,
      kind: "dates",
      pendingDate: timestampForDateInput(pendingDate, record.pending_date),
      postedDate: nullableTimestampForDateInput(postedDate, record.posted_date),
    });
  };

  if (!editing) {
    return (
      <div
        ref={displayCellRef}
        tabIndex={0}
        className="group flex min-h-6 min-w-0 items-start gap-1"
        data-testid={`record-${field}-cell`}
        onKeyDown={(event) => {
          if (event.key === "F2") {
            event.preventDefault();
            setEditing(true);
          }
        }}
      >
        <span className="min-w-0 flex-1 break-words">{value}</span>
        <Tooltip label={`Edit ${fieldLabel[field]}`} asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Edit ${fieldLabel[field]}`}
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-2"
      data-testid={`record-${field}-editor`}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          if (field === "postingStatus" && postingStatusSelectOpen) {
            return;
          }

          event.preventDefault();
          cancel();
        }
      }}
    >
      {field === "memo" ? (
        <input
          autoFocus
          className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
          aria-label="Memo"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          onBlur={() => void save({ kind: "memo", memo: memo.trim() || null })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save({ kind: "memo", memo: memo.trim() || null });
            }
          }}
        />
      ) : null}
      {field === "dates" ? (
        <>
          <label className="text-xs">
            Initiated{" "}
            <input
              autoFocus
              type="date"
              className={dateInputClassName}
              value={initiatedDate}
              onChange={(event) => setInitiatedDate(event.target.value)}
            />
          </label>
          <label className="text-xs">
            Pending{" "}
            <input
              type="date"
              className={dateInputClassName}
              value={pendingDate}
              onChange={(event) => setPendingDate(event.target.value)}
            />
          </label>
          <label className="text-xs">
            Posted{" "}
            <input
              type="date"
              className={dateInputClassName}
              value={postedDate}
              onChange={(event) => setPostedDate(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={saveDates}>
              Save
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </>
      ) : null}
      {field === "postingStatus" ? (
        record.posting_status === "expected" ? (
          <>
            <p className="text-muted-foreground text-xs">
              Expected occurrence status is managed by recurring actions.
            </p>
            <Button
              autoFocus
              type="button"
              size="sm"
              variant="outline"
              onClick={cancel}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Select
            open={postingStatusSelectOpen}
            onOpenChange={setPostingStatusSelectOpen}
            value={record.posting_status}
            onValueChange={(postingStatus) =>
              void save({
                kind: "postingStatus",
                postingStatus: postingStatus as
                  "cancelled" | "pending" | "posted",
              })
            }
          >
            <SelectTrigger autoFocus aria-label="Posting status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        )
      ) : null}
      {errorMessage ? (
        <p className="text-destructive text-xs" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
};

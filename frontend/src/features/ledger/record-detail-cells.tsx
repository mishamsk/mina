import { Pencil } from "pixelarticons/react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

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
import {
  lifecycleTimestampDateValue,
  localCivilDateStartISO,
} from "@/utils/date";

import { useInlineEdit } from "./inline-editing";
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
  readonly editable?: boolean;
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
  lifecycleTimestampDateValue(value);

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
  editable = true,
  field,
  onSave,
  record,
  transaction,
  value,
}: RecordDetailCellsProps) => {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
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
  const { activeEditorId, finish, requestStart } = useInlineEdit();
  const instanceId = useId();
  const editorId = `record-${record.record_id}-${field}-${instanceId}`;
  const editing = activeEditorId === editorId;

  const restoreDisplayFocus = () => {
    window.requestAnimationFrame(() => {
      displayCellRef.current?.focus();
    });
  };

  const cancel = () => {
    if (saving) {
      return;
    }
    setMemo(record.memo ?? "");
    setInitiatedDate(transaction.initiated_date);
    setPendingDate(inputDateValue(record.pending_date));
    setPostedDate(inputDateValue(record.posted_date));
    setErrorMessage(undefined);
    finish(editorId, true);
  };
  const startEditing = () => {
    setMemo(record.memo ?? "");
    setInitiatedDate(transaction.initiated_date);
    setPendingDate(inputDateValue(record.pending_date));
    setPostedDate(inputDateValue(record.posted_date));
    setErrorMessage(undefined);
    requestStart(editorId, restoreDisplayFocus);
  };

  useEffect(
    () => () => {
      finish(editorId);
    },
    [editorId, finish],
  );

  const save = async (update: RecordUpdate) => {
    setSaving(true);
    setErrorMessage(undefined);
    try {
      await onSave(transaction, record, update);
      finish(editorId, true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The API request failed.",
      );
    } finally {
      setSaving(false);
    }
  };
  const saveDates = () => {
    void save({
      initiatedDate,
      kind: "dates",
      pendingDate: nullableTimestampForDateInput(
        pendingDate,
        record.pending_date,
      ),
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
          if (editable && event.key === "F2") {
            event.preventDefault();
            startEditing();
          }
        }}
      >
        <span className="min-w-0 flex-1 break-words">{value}</span>
        {editable ? (
          <Tooltip label={`Edit ${fieldLabel[field]}`} asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Edit ${fieldLabel[field]}`}
              onClick={startEditing}
            >
              <Pencil aria-hidden="true" />
            </Button>
          </Tooltip>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-2"
      data-inline-editor-id={editorId}
      data-inline-editor-pending={saving ? "true" : undefined}
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
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={saveDates}
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
            disabled={saving}
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
            <SelectContent data-inline-editor-content={editorId}>
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

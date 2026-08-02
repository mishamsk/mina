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

import { useInlineEdit } from "./inline-editing";
import type { InlineSavePageRefresh, RecordUpdate } from "./record-editing";
import { transactionRowFallback } from "./transaction-row-focus";

type DetailField = "dates" | "memo" | "settlement";

const fieldLabel: Record<DetailField, string> = {
  dates: "dates",
  memo: "memo",
  settlement: "settlement",
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
    onPageRefresh?: InlineSavePageRefresh,
  ) => Promise<boolean | void>;
  readonly record: JournalRecord;
  readonly transaction: Transaction;
  readonly value: ReactNode;
}

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
  const [settlementSelectOpen, setSettlementSelectOpen] = useState(false);
  const displayCellRef = useRef<HTMLDivElement>(null);
  const restoreFallbackRef = useRef<() => void>(() => undefined);
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
    setErrorMessage(undefined);
    finish(editorId, true);
  };
  const startEditing = () => {
    setMemo(record.memo ?? "");
    setInitiatedDate(transaction.initiated_date);
    setErrorMessage(undefined);
    restoreFallbackRef.current = transactionRowFallback(
      displayCellRef.current,
      transaction.transaction_id,
    );
    requestStart(editorId, restoreDisplayFocus);
  };

  useEffect(
    () => () => {
      finish(editorId);
    },
    [editorId, finish],
  );

  const save = async (update: RecordUpdate) => {
    const restoreFallback = restoreFallbackRef.current;
    setSaving(true);
    setErrorMessage(undefined);
    try {
      const rowRemainsVisible = await onSave(
        transaction,
        record,
        update,
        (visible) => {
          if (!visible) {
            restoreFallback();
          }
        },
      );
      finish(editorId, rowRemainsVisible !== false);
      if (rowRemainsVisible === false) {
        restoreFallback();
      }
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
          if (field === "settlement" && settlementSelectOpen) {
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
      {field === "settlement" ? (
        record.settlement === null ? (
          <>
            <p className="text-muted-foreground text-xs">
              Settlement does not apply to this record.
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
            open={settlementSelectOpen}
            onOpenChange={setSettlementSelectOpen}
            value={record.settlement}
            onValueChange={(settlement) =>
              void save({
                kind: "settlement",
                settlement: settlement as "pending" | "posted",
              })
            }
          >
            <SelectTrigger autoFocus aria-label="Settlement">
              <SelectValue />
            </SelectTrigger>
            <SelectContent data-inline-editor-content={editorId}>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
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

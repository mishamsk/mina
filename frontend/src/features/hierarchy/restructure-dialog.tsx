import { Check, Close } from "pixelarticons/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { FqnPath } from "@/features/ledger";

export interface RestructureSubmitInput {
  readonly fromFqn: string;
  readonly toFqn: string;
}

interface RestructureDialogProps {
  readonly entityLabel: string;
  readonly errorMessage?: string;
  readonly fromFqn: string;
  readonly hint: string;
  readonly onClearError?: () => void;
  readonly onClose: () => void;
  readonly onSubmit: (input: RestructureSubmitInput) => void | Promise<void>;
}

const submitLabel = "Move";
const title = "Move or rename";

export const RestructureDialog = ({
  entityLabel,
  errorMessage,
  fromFqn,
  hint,
  onClearError,
  onClose,
  onSubmit,
}: RestructureDialogProps) => {
  const titleId = useId();
  const descriptionId = useId();
  const toInputId = useId();
  const fromLabelId = useId();
  const toInputRef = useRef<HTMLInputElement | null>(null);
  const [toFqn, setToFqn] = useState(fromFqn);
  const [toError, setToError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const closeDialog = useCallback(() => {
    if (saving) {
      return;
    }
    onClose();
  }, [onClose, saving]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      toInputRef.current?.focus({ preventScroll: true });
      toInputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.defaultPrevented) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        closeDialog();
      }
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [closeDialog]);

  const submit = async () => {
    if (saving) {
      return;
    }

    const normalizedToFqn = toFqn.trim();
    if (!normalizedToFqn) {
      setToError("To path is required.");
      return;
    }
    if (normalizedToFqn === fromFqn) {
      setToError("To path must differ from the current path.");
      return;
    }

    setSaving(true);
    setToError(undefined);
    onClearError?.();
    try {
      await onSubmit({
        fromFqn,
        toFqn: normalizedToFqn,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="bg-card fixed top-4 right-4 bottom-4 z-50 flex w-[min(520px,calc(100vw-2rem))] max-w-full flex-col border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      tabIndex={-1}
    >
      <div className="bg-card sticky top-0 z-10 flex items-start justify-between gap-3 border-b-2 border-[var(--border-ink)] p-4">
        <div className="min-w-0">
          <p className="font-heading text-muted-foreground text-xs font-semibold uppercase">
            {entityLabel}
          </p>
          <h2
            id={titleId}
            className="font-heading text-base font-bold uppercase"
          >
            {title}
          </h2>
        </div>
        <Tooltip label="Close restructure panel" asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Close restructure panel"
            disabled={saving}
            onClick={closeDialog}
          >
            <Close aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>

      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p
            id={descriptionId}
            className="font-body text-muted-foreground text-sm"
          >
            {hint}
          </p>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span id={fromLabelId} className="text-sm font-semibold">
                From
              </span>
              <div
                aria-labelledby={fromLabelId}
                className="bg-muted flex h-9 min-w-0 items-center overflow-hidden border-2 border-[var(--border-ink)] px-2 shadow-[var(--shadow-pixel)]"
              >
                <FqnPath value={fromFqn} focusable={false} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={toInputId} className="text-sm font-semibold">
                To
              </label>
              <input
                ref={toInputRef}
                id={toInputId}
                className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                disabled={saving}
                value={toFqn}
                onBlur={() => {
                  const normalizedToFqn = toFqn.trim();
                  if (!normalizedToFqn) {
                    setToError("To path is required.");
                    return;
                  }
                  if (normalizedToFqn === fromFqn) {
                    setToError("To path must differ from the current path.");
                  }
                }}
                onChange={(event) => {
                  setToFqn(event.target.value);
                  setToError(undefined);
                  onClearError?.();
                }}
              />
              {toError ? (
                <p className="text-destructive text-xs" role="alert">
                  {toError}
                </p>
              ) : null}
              {errorMessage ? (
                <p className="text-destructive text-xs" role="alert">
                  {errorMessage}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="bg-card flex justify-end gap-2 border-t-2 border-[var(--border-ink)] p-4">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={closeDialog}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            <Check aria-hidden="true" />
            {saving ? "Moving" : submitLabel}
          </Button>
        </div>
      </form>
    </aside>
  );
};

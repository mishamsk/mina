import { AlertDialog } from "radix-ui";
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
} from "react";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";

interface ConfirmationDialogProps {
  readonly cancelLabel?: string;
  readonly cancelPendingTooltip?: string;
  readonly children: ReactNode;
  readonly confirmIcon?: ReactNode;
  readonly confirmDisabled?: boolean;
  readonly confirmDisabledTooltip?: string;
  readonly confirmLabel: string;
  readonly confirmPendingTooltip?: string;
  readonly confirmVariant?: ComponentProps<typeof Button>["variant"];
  readonly escapeAction?: "cancel" | "confirm";
  readonly errorMessage: string | undefined;
  readonly initialFocus?: "cancel" | "confirm";
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly pending: boolean;
  readonly pendingLabel: string;
  readonly title: string;
}

export const ConfirmationDialog = ({
  cancelLabel = "Cancel",
  cancelPendingTooltip,
  children,
  confirmIcon,
  confirmDisabled = false,
  confirmDisabledTooltip,
  confirmLabel,
  confirmPendingTooltip,
  confirmVariant = "destructive",
  errorMessage,
  escapeAction = "cancel",
  initialFocus = "cancel",
  initialFocusRef,
  onConfirm,
  onOpenChange,
  open,
  pending,
  pendingLabel,
  title,
}: ConfirmationDialogProps) => {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pending) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (escapeAction === "confirm") {
        if (!confirmDisabled) {
          onConfirm();
        }
      } else {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape, { capture: true });
    return () => {
      window.removeEventListener("keydown", closeOnEscape, { capture: true });
    };
  }, [confirmDisabled, escapeAction, onConfirm, onOpenChange, open, pending]);

  const cancelControl = (
    <AlertDialog.Cancel asChild>
      <Button
        tabIndex={0}
        type="button"
        variant="outline"
        aria-disabled={pending && cancelPendingTooltip ? true : undefined}
        disabled={pending && !cancelPendingTooltip}
        onClick={(event) => {
          if (pending) {
            event.preventDefault();
          }
        }}
      >
        {cancelLabel}
      </Button>
    </AlertDialog.Cancel>
  );
  const confirmTooltip = pending
    ? confirmPendingTooltip
    : confirmDisabled
      ? confirmDisabledTooltip
      : undefined;
  const confirmControl = (
    <Button
      ref={confirmRef}
      tabIndex={0}
      type="button"
      variant={confirmVariant}
      aria-disabled={
        (pending || confirmDisabled) && confirmTooltip ? true : undefined
      }
      disabled={(pending || confirmDisabled) && !confirmTooltip}
      onClick={() => {
        if (!pending && !confirmDisabled) {
          onConfirm();
        }
      }}
    >
      {confirmIcon}
      {pending ? pendingLabel : confirmLabel}
    </Button>
  );
  const configuredConfirmTooltip =
    confirmPendingTooltip ?? confirmDisabledTooltip;

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-[color-mix(in_srgb,var(--frame),transparent_18%)]" />
        <AlertDialog.Content
          data-slot="confirmation-dialog-content"
          className="bg-card fixed top-1/2 left-1/2 z-[80] flex max-h-[calc(100dvh-2rem)] w-[min(480px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
          onOpenAutoFocus={(event) => {
            const target =
              initialFocusRef?.current ??
              (initialFocus === "confirm" ? confirmRef.current : null);
            if (target) {
              event.preventDefault();
              target.focus({ preventScroll: true });
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            event.stopPropagation();
          }}
        >
          <AlertDialog.Title className="font-heading text-base font-bold uppercase">
            {title}
          </AlertDialog.Title>
          <div className="min-h-0 overflow-y-auto">
            <AlertDialog.Description asChild>
              <div className="font-body text-muted-foreground mt-3 space-y-2 text-sm">
                {children}
              </div>
            </AlertDialog.Description>
            {errorMessage ? (
              <p
                className="border-destructive text-destructive mt-3 border-2 p-2 text-sm"
                role="alert"
              >
                {errorMessage}
              </p>
            ) : null}
          </div>
          <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2">
            {cancelPendingTooltip ? (
              <Tooltip
                className={
                  pending || confirmDisabled ? "cursor-not-allowed" : undefined
                }
                disabled={!pending && !confirmDisabled}
                focusable={false}
                label={cancelPendingTooltip}
              >
                {cancelControl}
              </Tooltip>
            ) : (
              cancelControl
            )}
            {configuredConfirmTooltip ? (
              <Tooltip
                className={confirmTooltip ? "cursor-not-allowed" : undefined}
                disabled={!confirmTooltip}
                focusable={false}
                label={confirmTooltip ?? configuredConfirmTooltip}
              >
                {confirmControl}
              </Tooltip>
            ) : (
              confirmControl
            )}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};

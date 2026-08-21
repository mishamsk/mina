import { AlertDialog } from "radix-ui";
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
} from "react";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";

interface ConfirmationDialogProps {
  readonly cancelLabel?: string;
  readonly cancelPendingTooltip?: string;
  readonly children: ReactNode;
  readonly confirmIcon?: ReactNode;
  readonly confirmLabel: string;
  readonly confirmPendingTooltip?: string;
  readonly confirmVariant?: ComponentProps<typeof Button>["variant"];
  readonly errorMessage: string | undefined;
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
  confirmLabel,
  confirmPendingTooltip,
  confirmVariant = "destructive",
  errorMessage,
  initialFocusRef,
  onConfirm,
  onOpenChange,
  open,
  pending,
  pendingLabel,
  title,
}: ConfirmationDialogProps) => {
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
      onOpenChange(false);
    };
    window.addEventListener("keydown", closeOnEscape, { capture: true });
    return () => {
      window.removeEventListener("keydown", closeOnEscape, { capture: true });
    };
  }, [onOpenChange, open, pending]);

  const cancelControl = (
    <AlertDialog.Cancel asChild>
      <Button
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
  const confirmControl = (
    <Button
      type="button"
      variant={confirmVariant}
      aria-disabled={pending && confirmPendingTooltip ? true : undefined}
      disabled={pending && !confirmPendingTooltip}
      onClick={() => {
        if (!pending) {
          onConfirm();
        }
      }}
    >
      {confirmIcon}
      {pending ? pendingLabel : confirmLabel}
    </Button>
  );

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-[color-mix(in_srgb,var(--frame),transparent_18%)]" />
        <AlertDialog.Content
          data-slot="confirmation-dialog-content"
          className="bg-card fixed top-1/2 left-1/2 z-[80] flex max-h-[calc(100dvh-2rem)] w-[min(480px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
          onOpenAutoFocus={(event) => {
            if (initialFocusRef) {
              event.preventDefault();
              initialFocusRef.current?.focus({ preventScroll: true });
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
          <div className="mt-4 flex shrink-0 justify-end gap-2">
            {cancelPendingTooltip ? (
              <Tooltip
                className={pending ? "cursor-not-allowed" : undefined}
                disabled={!pending}
                label={cancelPendingTooltip}
              >
                {cancelControl}
              </Tooltip>
            ) : (
              cancelControl
            )}
            {confirmPendingTooltip ? (
              <Tooltip
                className={pending ? "cursor-not-allowed" : undefined}
                disabled={!pending}
                label={confirmPendingTooltip}
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

import { AlertDialog } from "radix-ui";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface ConfirmationDialogProps {
  readonly children: ReactNode;
  readonly confirmIcon?: ReactNode;
  readonly confirmLabel: string;
  readonly errorMessage: string | undefined;
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly pending: boolean;
  readonly pendingLabel: string;
  readonly title: string;
}

export const ConfirmationDialog = ({
  children,
  confirmIcon,
  confirmLabel,
  errorMessage,
  onConfirm,
  onOpenChange,
  open,
  pending,
  pendingLabel,
  title,
}: ConfirmationDialogProps) => (
  <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="fixed inset-0 z-[80] bg-[color-mix(in_srgb,var(--frame),transparent_18%)]" />
      <AlertDialog.Content
        className="bg-card fixed top-1/2 left-1/2 z-[80] w-[min(480px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
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
        <div className="mt-4 flex justify-end gap-2">
          <AlertDialog.Cancel asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmIcon}
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
);

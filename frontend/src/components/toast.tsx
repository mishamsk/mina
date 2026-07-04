import { useEffect, useState } from "react";

import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

export const toastDurationMs = 4000;

interface ToastProps {
  readonly className?: string;
  readonly durationMs?: number;
  readonly message: string | undefined;
  readonly onDismiss: () => void;
}

export const Toast = ({
  className,
  durationMs = toastDurationMs,
  message,
  onDismiss,
}: ToastProps) => {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDismissed(true);
    }, durationMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [durationMs, message]);

  if (!message || dismissed) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    onDismiss();
  };

  return (
    <div className="fixed right-4 bottom-4 z-40 max-w-sm" role="status">
      <Tooltip label={message} asChild>
        <button
          type="button"
          aria-label={`Dismiss notice: ${message}`}
          className={cn(
            "bg-card text-foreground block max-w-full border-2 border-[var(--border-ink)] px-3 py-2 text-left font-mono text-sm font-semibold whitespace-nowrap shadow-[var(--shadow-pixel)]",
            className,
          )}
          onClick={dismiss}
        >
          <span className="block truncate">{message}</span>
        </button>
      </Tooltip>
    </div>
  );
};

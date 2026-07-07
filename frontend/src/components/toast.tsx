import { useEffect, useRef } from "react";

import { Tooltip } from "@/components/tooltip";
import { cn } from "@/lib/utils";

export const toastDurationMs = 4000;

interface ToastProps {
  readonly className?: string;
  readonly containerClassName?: string;
  readonly durationMs?: number;
  readonly message: string | undefined;
  readonly onDismiss: () => void;
}

export const Toast = ({
  className,
  containerClassName,
  durationMs = toastDurationMs,
  message,
  onDismiss,
}: ToastProps) => {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onDismissRef.current();
    }, durationMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [durationMs, message]);

  if (!message) {
    return null;
  }

  const dismiss = () => {
    onDismiss();
  };

  return (
    <div
      className={cn("fixed right-4 bottom-4 z-40 max-w-sm", containerClassName)}
      style={{
        animation: `toast-auto-hide 1ms steps(1, end) ${durationMs}ms forwards`,
      }}
      role="status"
      onAnimationEnd={dismiss}
    >
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

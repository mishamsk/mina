import { type ReactNode, useEffect, useRef, useState } from "react";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface RowActionButton {
  readonly icon: ReactNode;
  readonly label: string;
  readonly onSelect: (opener: HTMLElement) => void;
}

interface RowActionsProps {
  readonly actions?: readonly RowActionButton[];
  readonly className?: string;
  readonly foldable?: boolean;
  readonly onOverflowOpenChange?: (open: boolean) => void;
}

const actionButtonClassName =
  "row-actions-button size-6 border-[var(--border-ink)] bg-card text-foreground shadow-none " +
  "hover:bg-muted hover:shadow-[var(--shadow-chip)] " +
  "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

const selectAction = (
  action: RowActionButton,
  opener: HTMLElement,
  close?: () => void,
) => {
  action.onSelect(opener);
  close?.();
};

export const RowActions = ({
  actions = [],
  className,
  foldable = false,
  onOverflowOpenChange,
}: RowActionsProps) => {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowOpenRef = useRef(false);
  const onOverflowOpenChangeRef = useRef(onOverflowOpenChange);
  const overflowTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    onOverflowOpenChangeRef.current = onOverflowOpenChange;
  }, [onOverflowOpenChange]);

  useEffect(
    () => () => {
      if (overflowOpenRef.current) {
        onOverflowOpenChangeRef.current?.(false);
      }
    },
    [],
  );

  const setNextOverflowOpen = (open: boolean) => {
    overflowOpenRef.current = open;
    setOverflowOpen(open);
    onOverflowOpenChange?.(open);
  };

  return (
    <div
      className={cn(
        "row-actions inline-flex min-w-0 items-center justify-end gap-1",
        className,
      )}
    >
      <div className="row-actions-buttons inline-flex items-center justify-end gap-1">
        {actions.map((action) => (
          <Tooltip key={action.label} label={action.label} asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              className={actionButtonClassName}
              aria-label={action.label}
              onClick={(event) => {
                event.stopPropagation();
                selectAction(action, event.currentTarget);
              }}
            >
              {action.icon}
            </Button>
          </Tooltip>
        ))}
      </div>

      {foldable && actions.length > 0 ? (
        <Popover open={overflowOpen} onOpenChange={setNextOverflowOpen}>
          <Tooltip label="More row actions" asChild>
            <PopoverTrigger asChild>
              <Button
                ref={overflowTriggerRef}
                type="button"
                variant="outline"
                size="icon-xs"
                className={cn(actionButtonClassName, "row-actions-overflow")}
                aria-label="More row actions"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  ⋯
                </span>
              </Button>
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent
            align="end"
            className="row-actions-menu w-56 p-1"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="flex flex-col gap-1">
              {actions.map((action) => (
                <Button
                  key={action.label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={(event) => {
                    selectAction(
                      action,
                      overflowTriggerRef.current ?? event.currentTarget,
                      () => {
                        setNextOverflowOpen(false);
                      },
                    );
                  }}
                >
                  {action.icon}
                  {action.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
};

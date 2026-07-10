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
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly icon: ReactNode;
  readonly kind?: "button";
  readonly label: string;
  readonly onSelect: (opener: HTMLElement) => void;
}

export interface RowActionToggle {
  readonly icon: ReactNode;
  readonly kind: "toggle";
  readonly label: string;
  readonly onToggle: (opener: HTMLElement) => void;
  readonly pressed: boolean;
}

export type RowAction = RowActionButton | RowActionToggle;

interface RowActionsProps {
  readonly actions?: readonly RowAction[];
  readonly className?: string;
  readonly foldable?: boolean;
  readonly onOverflowOpenChange?: (open: boolean) => void;
}

const actionButtonClassName =
  "row-actions-button size-6 border-[var(--border-ink)] bg-card text-foreground shadow-none " +
  "hover:bg-muted hover:shadow-[var(--shadow-chip)] " +
  "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

const disabledActionButtonClassName =
  "text-muted-foreground border-muted-foreground hover:bg-card hover:shadow-none " +
  "active:translate-x-0 active:translate-y-0";

const toggleButtonClassName =
  "row-actions-toggle inline-grid size-6 place-items-center border-0 bg-transparent p-0 " +
  "text-muted-foreground shadow-none hover:text-foreground " +
  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "aria-pressed:text-foreground";

const disabledOverflowActionClassName =
  "cursor-not-allowed text-muted-foreground hover:bg-transparent " +
  "hover:text-muted-foreground active:!translate-x-0 active:!translate-y-0";

const isButtonAction = (action: RowAction): action is RowActionButton =>
  action.kind !== "toggle";

const selectAction = (
  action: RowActionButton,
  opener: HTMLElement,
  close?: () => void,
) => {
  if (action.disabled) {
    return;
  }
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
  const overflowActions = actions.filter(isButtonAction);
  const actionClusterCount = actions.length;
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
        foldable && "row-actions--foldable w-full",
        className,
      )}
      data-row-actions-count={actionClusterCount}
    >
      <div className="row-actions-buttons inline-flex items-center justify-end gap-1">
        {actions.map((action) => (
          <Tooltip
            key={action.label}
            label={
              isButtonAction(action) && action.disabled
                ? (action.disabledReason ?? action.label)
                : action.label
            }
            asChild
          >
            {isButtonAction(action) ? (
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                className={cn(
                  actionButtonClassName,
                  action.disabled && disabledActionButtonClassName,
                )}
                aria-disabled={action.disabled ? "true" : undefined}
                aria-label={action.label}
                onClick={(event) => {
                  event.stopPropagation();
                  selectAction(action, event.currentTarget);
                }}
              >
                {action.icon}
              </Button>
            ) : (
              <button
                type="button"
                className={toggleButtonClassName}
                aria-label={action.label}
                aria-pressed={action.pressed}
                onClick={(event) => {
                  event.stopPropagation();
                  action.onToggle(event.currentTarget);
                }}
              >
                {action.icon}
              </button>
            )}
          </Tooltip>
        ))}
      </div>

      {foldable && overflowActions.length > 0 ? (
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
              {overflowActions.map((action) => {
                const disabled = action.disabled;
                const button = (
                  <Button
                    key={action.label}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "justify-start",
                      disabled && disabledOverflowActionClassName,
                    )}
                    aria-disabled={disabled ? "true" : undefined}
                    onClick={(event) => {
                      if (disabled) {
                        event.preventDefault();
                        return;
                      }
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
                );

                if (!disabled) {
                  return button;
                }

                return (
                  <Tooltip
                    key={action.label}
                    label={action.disabledReason ?? action.label}
                    asChild
                  >
                    {button}
                  </Tooltip>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
};

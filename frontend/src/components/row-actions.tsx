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
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly icon: ReactNode;
  readonly kind: "toggle";
  readonly label: string;
  readonly onToggle: (opener: HTMLElement) => void;
  readonly pressed: boolean;
  readonly slot?: RowActionIndicatorSlot;
}

export interface RowActionPlaceholder {
  readonly kind: "placeholder";
}

export type RowAction =
  RowActionButton | RowActionPlaceholder | RowActionToggle;
export type RowActionIndicatorSlot = "featured" | "hidden";
type ActionableRowAction = RowActionButton | RowActionToggle;

interface RowActionsProps {
  readonly actions?: readonly RowAction[];
  readonly className?: string;
  readonly foldable?: boolean;
  readonly indicatorSlots?: readonly RowActionIndicatorSlot[];
  readonly onOverflowOpenChange?: (open: boolean) => void;
}

const actionButtonClassName =
  "row-actions-button size-7 border-[var(--border-ink)] bg-card text-foreground shadow-none " +
  "hover:bg-muted hover:shadow-[var(--shadow-chip)] " +
  "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

const toggleButtonClassName =
  "row-actions-toggle inline-grid size-7 place-items-center overflow-visible border-0 bg-transparent p-0 leading-none " +
  "text-muted-foreground shadow-none hover:text-foreground " +
  "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "aria-pressed:text-foreground [&_svg]:size-6 [&_svg]:shrink-0";

const indicatorSlotClassName = "row-actions-indicator-slot size-7 shrink-0";

const isButtonAction = (
  action: ActionableRowAction,
): action is RowActionButton => action.kind !== "toggle";

const isPlaceholderAction = (
  action: RowAction,
): action is RowActionPlaceholder => action.kind === "placeholder";

const isActionable = (action: RowAction): action is ActionableRowAction =>
  !isPlaceholderAction(action);

const isActionDisabled = (action: ActionableRowAction): boolean =>
  Boolean(action.disabled);

const selectAction = (
  action: ActionableRowAction,
  opener: HTMLElement,
  close?: () => void,
) => {
  if (isActionDisabled(action)) {
    return;
  }
  if (isButtonAction(action)) {
    action.onSelect(opener);
  } else {
    action.onToggle(opener);
  }
  close?.();
};

export const RowActions = ({
  actions = [],
  className,
  foldable = false,
  indicatorSlots,
  onOverflowOpenChange,
}: RowActionsProps) => {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const slottedActions = new Map<RowActionIndicatorSlot, RowActionToggle>();
  for (const action of actions) {
    if (
      action.kind === "toggle" &&
      action.slot &&
      !slottedActions.has(action.slot)
    ) {
      slottedActions.set(action.slot, action);
    }
  }
  const selectedIndicatorActions = new Set<RowAction>(slottedActions.values());
  const nonIndicatorActions = actions.filter(
    (action) =>
      !isPlaceholderAction(action) && !selectedIndicatorActions.has(action),
  );
  const primaryActions = indicatorSlots
    ? [
        ...nonIndicatorActions,
        ...indicatorSlots.flatMap((slot) => {
          const action = slottedActions.get(slot);
          return action ? [action] : [];
        }),
      ]
    : actions;
  const alignedPrimaryActions = indicatorSlots
    ? [
        ...nonIndicatorActions,
        ...indicatorSlots.map((slot) => slottedActions.get(slot)),
      ]
    : primaryActions;
  const orderedActions = primaryActions.filter(isActionable);
  const actionClusterCount = alignedPrimaryActions.length;
  const overflowOpenRef = useRef(false);
  const onOverflowOpenChangeRef = useRef(onOverflowOpenChange);
  const overflowMenuRef = useRef<HTMLDivElement | null>(null);
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

  const overflowActionButtons = () =>
    Array.from(
      overflowMenuRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not([aria-disabled='true'])",
      ) ?? [],
    );

  const focusFirstOverflowAction = () => {
    const firstEnabledAction = overflowActionButtons()[0];
    const firstAction =
      firstEnabledAction ??
      overflowMenuRef.current?.querySelector<HTMLButtonElement>("button");
    firstAction?.focus();
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
        {alignedPrimaryActions.map((action, index) => {
          if (!action || isPlaceholderAction(action)) {
            return (
              <span
                key={indicatorSlots?.[index]}
                aria-hidden="true"
                className={indicatorSlotClassName}
              />
            );
          }

          return (
            <Tooltip
              key={action.label}
              label={
                isActionDisabled(action)
                  ? (action.disabledReason ?? action.label)
                  : action.label
              }
              asChild
            >
              {isButtonAction(action) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className={cn(actionButtonClassName)}
                  aria-disabled={isActionDisabled(action) ? "true" : undefined}
                  aria-label={action.label}
                  onMouseDown={(event) => {
                    if (isActionDisabled(action)) {
                      event.preventDefault();
                    }
                  }}
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
                  className={cn(
                    toggleButtonClassName,
                    isActionDisabled(action) &&
                      "text-muted-foreground hover:text-muted-foreground cursor-not-allowed",
                  )}
                  aria-label={action.label}
                  aria-disabled={isActionDisabled(action) ? "true" : undefined}
                  aria-pressed={action.pressed}
                  onMouseDown={(event) => {
                    if (isActionDisabled(action)) {
                      event.preventDefault();
                    }
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isActionDisabled(action)) {
                      event.preventDefault();
                      return;
                    }
                    action.onToggle(event.currentTarget);
                  }}
                >
                  {action.icon}
                </button>
              )}
            </Tooltip>
          );
        })}
      </div>

      {foldable && orderedActions.length > 0 ? (
        <Popover modal open={overflowOpen} onOpenChange={setNextOverflowOpen}>
          <Tooltip label="More row actions" asChild>
            <PopoverTrigger asChild>
              <Button
                ref={overflowTriggerRef}
                type="button"
                variant="outline"
                size="icon-sm"
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
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              requestAnimationFrame(() => {
                if (overflowOpenRef.current) {
                  focusFirstOverflowAction();
                }
              });
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
            onKeyDownCapture={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
                return;
              }
              const buttons = overflowActionButtons();
              const currentIndex = buttons.indexOf(
                event.target as HTMLButtonElement,
              );
              if (currentIndex < 0) {
                return;
              }
              event.preventDefault();
              const offset = event.key === "ArrowDown" ? 1 : -1;
              const nextIndex =
                (currentIndex + offset + buttons.length) % buttons.length;
              buttons[nextIndex]?.focus();
            }}
          >
            <div ref={overflowMenuRef} className="flex flex-col gap-1">
              {orderedActions.map((action) => {
                const disabled = isActionDisabled(action);
                const button = (
                  <Button
                    key={action.label}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    aria-disabled={disabled ? "true" : undefined}
                    aria-pressed={
                      isButtonAction(action) ? undefined : action.pressed
                    }
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

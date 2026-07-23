import { Pencil } from "pixelarticons/react";
import { type ReactNode, useRef } from "react";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  type BulkReferenceAction,
  BulkReferenceEditor,
} from "./bulk-action-bar";
import type { LookupMaps } from "./format";
import type { RecordReferenceUpdate } from "./record-reference-cells";

interface BulkReferenceCellProps {
  readonly action: BulkReferenceAction;
  readonly active: boolean;
  readonly children: ReactNode;
  readonly initialCategoryId?: number;
  readonly initialMemberId?: number;
  readonly maps: LookupMaps;
  readonly mixedCount: number;
  readonly onApply: (update: RecordReferenceUpdate) => Promise<void>;
  readonly onOpenChange: (open: boolean) => void;
  readonly selectedCount: number;
  readonly testIdPrefix: string;
}

const fieldLabel: Record<BulkReferenceAction, string> = {
  category: "category",
  member: "member",
  tags: "tags",
};

export const BulkReferenceCell = ({
  action,
  active,
  children,
  initialCategoryId,
  initialMemberId,
  maps,
  mixedCount,
  onApply,
  onOpenChange,
  selectedCount,
  testIdPrefix,
}: BulkReferenceCellProps) => {
  const displayCellRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const label = fieldLabel[action];
  const focusDisplayCellOrBulkAction = () => {
    const displayCell = displayCellRef.current;
    const focusTarget = displayCell?.isConnected
      ? displayCell
      : document.querySelector<HTMLButtonElement>(
          `[data-testid="bulk-action-bar"] [data-bulk-action="${action}"]`,
        );
    focusTarget?.focus({ preventScroll: true });
  };
  const applyAndRestoreFocus = async (update: RecordReferenceUpdate) => {
    await onApply(update);
    if (!displayCellRef.current?.isConnected) {
      focusDisplayCellOrBulkAction();
    }
  };

  return (
    <Popover
      open={active}
      onOpenChange={(open) => {
        if (!open && savingRef.current) {
          return;
        }
        onOpenChange(open);
      }}
    >
      <div
        ref={displayCellRef}
        tabIndex={0}
        className="group relative flex min-h-6 min-w-0 items-start"
        data-row-expand-passthrough="true"
        data-testid={`${testIdPrefix}-${label}-bulk-cell`}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget
              .closest<HTMLTableRowElement>("[data-transaction-row='true']")
              ?.focus({ preventScroll: true });
            return;
          }
          if (event.key !== "F2") {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onOpenChange(true);
        }}
      >
        <span className="min-w-0 flex-1 break-words">{children}</span>
        <Tooltip label={`Bulk edit ${label}`} asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="pointer-events-none absolute top-0 right-0 opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
              aria-label={`Bulk edit ${label}`}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <Pencil aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </Tooltip>
      </div>
      {active ? (
        <PopoverContent
          align="start"
          className="flex max-h-[min(32rem,calc(100svh-1rem))] min-h-0 flex-col overflow-hidden"
          data-testid={`${testIdPrefix}-${label}-bulk-editor`}
          onEscapeKeyDown={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.matches("[role='combobox'][aria-expanded='true']")
            ) {
              event.preventDefault();
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (
              document.activeElement instanceof HTMLElement &&
              document.activeElement.closest(
                '[data-testid="bulk-action-picker"]',
              )
            ) {
              return;
            }
            focusDisplayCellOrBulkAction();
          }}
        >
          <BulkReferenceEditor
            key={`${testIdPrefix}-${action}`}
            action={action}
            allowIncludeHidden={false}
            initialCategoryId={initialCategoryId}
            initialMemberId={initialMemberId}
            inlineOptions
            maps={maps}
            mixedCount={mixedCount}
            onApply={applyAndRestoreFocus}
            onCancel={() => onOpenChange(false)}
            onSavingChange={(saving) => {
              savingRef.current = saving;
            }}
            selectedCount={selectedCount}
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
};

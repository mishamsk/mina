import { Check, ChevronDown, ChevronLeft } from "pixelarticons/react";
import { Select as SelectPrimitive } from "radix-ui";
import * as React from "react";

import { markMobileControlsLayer } from "@/components/compact-overlay";
import { cn } from "@/lib/utils";

type SelectTriggerSize = "default" | "compact";

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  children,
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: SelectTriggerSize;
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "bg-card text-foreground data-[state=open]:bg-muted flex w-fit items-center justify-between gap-2 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)] transition-[transform,box-shadow,background-color] duration-150 ease-[steps(2)] active:translate-x-1 active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:translate-x-0 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none data-[size=compact]:h-8 data-[size=default]:h-9 [&>span]:line-clamp-1 [&>span]:flex-1 [&>span]:text-left",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  children,
  className,
  position = "popper",
  ref,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const [mobileControlsLayer, setMobileControlsLayer] = React.useState(false);
  const [compactListboxId, setCompactListboxId] = React.useState<string>();
  const contentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      markMobileControlsLayer(node);
      const isMobileControlsLayer =
        node?.hasAttribute("data-mobile-controls-layer") ?? false;
      setMobileControlsLayer(isMobileControlsLayer);
      if (isMobileControlsLayer && node?.id) {
        setCompactListboxId(node.id);
      }
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={contentRef}
        data-slot="select-content"
        data-compact-bottom-sheet
        position={position}
        sideOffset={sideOffset}
        className={cn(
          "bg-card text-card-foreground z-80 max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)] outline-none",
          className,
        )}
        {...props}
        {...(mobileControlsLayer ? { id: undefined, role: undefined } : {})}
      >
        {mobileControlsLayer ? (
          <button
            type="button"
            className="compact-shell:flex font-heading hidden h-11 w-full shrink-0 items-center gap-2 border-b-2 border-[var(--border-ink)] bg-[var(--band)] px-3 text-sm font-semibold uppercase"
            aria-label="Back"
            onClick={(event) => {
              const ownerWindow = event.currentTarget.ownerDocument.defaultView;
              if (!ownerWindow) return;
              event.currentTarget.ownerDocument.dispatchEvent(
                new ownerWindow.KeyboardEvent("keydown", {
                  bubbles: true,
                  cancelable: true,
                  key: "Escape",
                }),
              );
            }}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Back
          </button>
        ) : null}
        <SelectPrimitive.Viewport
          data-slot="select-viewport"
          className="p-1"
          {...(mobileControlsLayer
            ? { id: compactListboxId, role: "listbox" }
            : {})}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(
        "font-heading px-2 py-1.5 text-xs font-semibold uppercase",
        className,
      )}
      {...props}
    />
  );
}

function SelectItem({
  children,
  className,
  value,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      data-testid={`select-option-${value}`}
      value={value}
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 py-1.5 pr-8 pl-2 font-mono text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--color-interactive-bright)] data-[state=checked]:bg-[var(--color-interactive-bright)]",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex size-4 items-center justify-center">
        <Check aria-hidden="true" className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-[var(--hairline)]", className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};

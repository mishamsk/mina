import { Close } from "pixelarticons/react";
import { Dialog } from "radix-ui";
import { useRef } from "react";

import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { closeKeyboardShortcuts, useKeyboardShortcutsView } from "@/store";

import {
  commandPaletteShortcutGroup,
  globalShortcutGroup,
  transactionEntryShortcutGroup,
} from "./global-shortcuts";

export const KeyboardShortcutsDialog = () => {
  const catalogRef = useRef<HTMLDivElement>(null);
  const { groups, launch, open } = useKeyboardShortcutsView();
  const orderedGroups = [
    globalShortcutGroup,
    commandPaletteShortcutGroup,
    transactionEntryShortcutGroup,
    ...Array.from(groups.values()).sort(
      (a, b) => a.order - b.order || a.title.localeCompare(b.title),
    ),
  ];
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeKeyboardShortcuts();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-modal-overlay
          className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--frame),transparent_35%)]"
        />
        <Dialog.Content
          data-testid="keyboard-shortcuts-dialog"
          key={launch?.key}
          aria-modal="true"
          aria-describedby={undefined}
          className="bg-card text-foreground fixed top-1/2 left-1/2 z-[51] flex max-h-[calc(100svh-2rem)] w-[min(640px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            focusWithoutTooltip(catalogRef.current, { preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusWithoutTooltip(
              launch?.opener?.isConnected && launch.opener !== document.body
                ? launch.opener
                : document.querySelector<HTMLElement>("main h1[tabindex='-1']"),
              { preventScroll: true },
            );
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b-2 border-[var(--border-ink)] p-4">
            <Dialog.Title className="font-heading text-base font-bold uppercase">
              Keyboard shortcuts
            </Dialog.Title>
            <Tooltip label="Close keyboard shortcuts" asChild>
              <Dialog.Close asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Close keyboard shortcuts"
                >
                  <Close aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </Tooltip>
          </div>
          <div
            ref={catalogRef}
            role="region"
            aria-label="Available keyboard shortcuts"
            tabIndex={0}
            className="min-h-0 overflow-y-auto p-4"
          >
            {orderedGroups.map((group) => (
              <section
                key={group.id}
                aria-labelledby={`shortcut-group-${group.id}`}
                className="mb-6 last:mb-0"
              >
                <h3
                  id={`shortcut-group-${group.id}`}
                  className="font-heading text-muted-foreground mb-2 text-xs font-bold uppercase"
                >
                  {group.title}
                </h3>
                <ul className="flex flex-col">
                  {group.shortcuts.map((shortcut) => (
                    <li
                      key={shortcut.id}
                      className="odd:bg-muted/50 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-4 px-2 py-3"
                    >
                      <span className="flex flex-wrap gap-1.5">
                        {shortcut.keys.map((key, index) => (
                          <Kbd key={`${key}-${index}`}>{key}</Kbd>
                        ))}
                      </span>
                      <span className="text-sm">
                        <span className="font-medium">{shortcut.label}</span>
                        {shortcut.detail ? (
                          <span className="text-muted-foreground mt-1 block text-xs">
                            {shortcut.detail}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

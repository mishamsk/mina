import { Close, Reload } from "pixelarticons/react";
import { Dialog } from "radix-ui";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { Transaction } from "@/api";
import { Toast } from "@/components/toast";
import { focusWithoutTooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TransactionEntryType } from "@/models/ui-state";
import type { LedgerLookupsSnapshot } from "@/store";

import {
  EntryPanel,
  type EntryPanelLaunch,
  type EntryPanelSaveContext,
} from "./entry-panel";

interface EntryModalProps {
  readonly errorMessage?: string;
  readonly initialTab?: TransactionEntryType;
  readonly initialTemplateFqn?: string;
  readonly launch?: EntryPanelLaunch;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly lookupsErrorMessage?: string;
  readonly loading?: boolean;
  readonly loadingCreate?: boolean;
  readonly onClose: () => void;
  readonly onLookupsRetry: () => Promise<void>;
  readonly onSaved: (
    transaction: Transaction,
    context: EntryPanelSaveContext,
  ) => Promise<void>;
  readonly notice?: { readonly id: number; readonly message: string };
  readonly onNoticeDismiss: () => void;
  readonly open: boolean;
  readonly recentTransactions?: readonly Transaction[];
  readonly requestCloseRef?: MutableRefObject<(() => void) | null>;
}

const listRestoreSelector = "[data-transaction-detail-restore-target]";
const appShellRestoreSelector = "[data-entry-modal-restore-target]";

const EntryLoadingSkeleton = ({ create }: { readonly create: boolean }) => (
  <>
    <span className="sr-only" role="status">
      Loading transaction…
    </span>
    <div
      className="grid h-9 grid-cols-5 border-b-2 border-[var(--border-ink)]"
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          className="flex items-center justify-center border-r border-[var(--border-ink)] last:border-r-0"
        >
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
    {create ? (
      <div
        className="border-b-2 border-[var(--border-ink)] bg-[var(--band)] px-4 py-3"
        aria-hidden="true"
      >
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    ) : null}
    <div className="flex min-h-0 flex-1" aria-hidden="true">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-5 p-4">
          <div className="grid grid-cols-[1fr_130px] gap-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t-2 border-[var(--border-ink)] p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-44" />
        </div>
      </div>
      {create ? (
        <aside className="hidden w-[280px] shrink-0 flex-col gap-4 border-l-2 border-[var(--border-ink)] p-3 xl:flex">
          <Skeleton className="h-3 w-24" />
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-7 w-full" />
          ))}
        </aside>
      ) : null}
    </div>
  </>
);

export const EntryModal = ({
  errorMessage,
  initialTab,
  initialTemplateFqn,
  launch,
  lookups,
  lookupsErrorMessage,
  loading = false,
  loadingCreate = false,
  onClose,
  onLookupsRetry,
  onSaved,
  notice,
  onNoticeDismiss,
  open,
  recentTransactions,
  requestCloseRef,
}: EntryModalProps) => {
  const [attentionFlash, setAttentionFlash] = useState(false);
  const closeRequestRef = useRef<(() => void) | null>(null);
  const pointerLaunchTargetRef = useRef<HTMLElement | null>(null);
  const restoreFocusTargetRef = useRef<HTMLElement | null>(null);
  const statusCloseButtonRef = useRef<HTMLButtonElement>(null);
  const requestClose = useCallback(() => {
    (closeRequestRef.current ?? onClose)();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      return;
    }
    const rememberPointerLaunchTarget = (event: PointerEvent) => {
      const target =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>(
              "button, a[href], input, textarea, select, [tabindex]",
            )
          : null;
      pointerLaunchTargetRef.current = target;
    };
    document.addEventListener("pointerdown", rememberPointerLaunchTarget, {
      capture: true,
    });
    return () => {
      document.removeEventListener("pointerdown", rememberPointerLaunchTarget, {
        capture: true,
      });
    };
  }, [open]);

  useEffect(() => {
    if (!requestCloseRef) {
      return;
    }
    requestCloseRef.current = requestClose;
    return () => {
      requestCloseRef.current = null;
    };
  }, [requestClose, requestCloseRef]);

  useEffect(() => {
    if (!open || (!errorMessage && !lookupsErrorMessage && !loading)) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      focusWithoutTooltip(statusCloseButtonRef.current, {
        preventScroll: true,
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [errorMessage, loading, lookupsErrorMessage, open]);

  const flashAttention = () => {
    setAttentionFlash(false);
    window.requestAnimationFrame(() => {
      setAttentionFlash(true);
    });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          requestClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-modal-overlay
          className="fixed inset-0 z-[70] bg-[color-mix(in_srgb,var(--frame),transparent_35%)]"
          onPointerDown={flashAttention}
        />
        <Dialog.Content
          className={`bg-card fixed inset-0 z-[70] h-dvh w-screen overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)] outline-none motion-safe:animate-[entry-stage-in_120ms_steps(2)] sm:top-1/2 sm:left-1/2 sm:h-[calc(100dvh-32px)] sm:w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 lg:h-[calc(100dvh-48px)] lg:w-[calc(100vw-64px)] xl:h-[calc(100dvh-64px)] xl:w-[min(1200px,calc(100vw-96px))] ${
            attentionFlash
              ? "motion-safe:animate-[entry-attention-flash_120ms_steps(2)]"
              : ""
          }`}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const fallback =
              document.querySelector<HTMLElement>(listRestoreSelector) ??
              document.querySelector<HTMLElement>(appShellRestoreSelector);
            const restoreFocusTarget = restoreFocusTargetRef.current;
            pointerLaunchTargetRef.current = null;
            restoreFocusTargetRef.current = null;
            focusWithoutTooltip(
              restoreFocusTarget?.isConnected ? restoreFocusTarget : fallback,
              { preventScroll: true },
            );
          }}
          onEscapeKeyDown={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.matches("[role='combobox'][aria-expanded='true']")
            ) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            event.preventDefault();
            flashAttention();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const activeElement = document.activeElement;
            restoreFocusTargetRef.current = pointerLaunchTargetRef.current
              ?.isConnected
              ? pointerLaunchTargetRef.current
              : activeElement instanceof HTMLElement &&
                  activeElement !== document.body
                ? activeElement
                : null;
          }}
        >
          <Dialog.Title className="sr-only">Transaction editor</Dialog.Title>
          {errorMessage || lookupsErrorMessage || loading ? (
            <section className="flex h-full min-h-0 flex-col">
              <header className="flex items-center justify-between border-b-2 border-[var(--border-ink)] p-4">
                <div>
                  <p className="text-muted-foreground font-heading text-xs font-semibold uppercase">
                    Transaction editor
                  </p>
                  <h2 className="text-pixel text-base">
                    {errorMessage
                      ? "Transaction unavailable"
                      : lookupsErrorMessage
                        ? "Editor resources unavailable"
                        : "Loading transaction"}
                  </h2>
                </div>
                <Button
                  ref={statusCloseButtonRef}
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Close transaction editor"
                  onClick={onClose}
                >
                  <Close aria-hidden="true" />
                </Button>
              </header>
              {loading && !errorMessage && !lookupsErrorMessage ? (
                <EntryLoadingSkeleton create={loadingCreate} />
              ) : (
                <div className="flex flex-1 items-start p-6">
                  <div className="flex flex-col items-start gap-3">
                    <p
                      className="border-destructive text-destructive border-2 p-3 text-sm"
                      role="alert"
                    >
                      {errorMessage ?? lookupsErrorMessage}
                    </p>
                    {lookupsErrorMessage && !errorMessage ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void onLookupsRetry();
                        }}
                      >
                        <Reload aria-hidden="true" />
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <>
              <EntryPanel
                closeRequestRef={closeRequestRef}
                initialTab={initialTab}
                initialTemplateFqn={initialTemplateFqn}
                launch={launch}
                lookups={lookups}
                onClose={onClose}
                onSaved={onSaved}
                open={open}
                recentTransactions={recentTransactions}
              />
              <Toast
                key={notice?.id ?? "empty"}
                className="text-[var(--color-money-in)]"
                containerClassName="z-[80]"
                message={notice?.message}
                onDismiss={onNoticeDismiss}
              />
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

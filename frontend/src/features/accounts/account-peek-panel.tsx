import { Close, Open, Reload } from "pixelarticons/react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";

import type { Transaction } from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  type LookupMaps,
  TransactionDetailContent,
  TransactionDetailErrorContent,
  TransactionDetailLoadingContent,
} from "@/features/ledger";
import { useOutsidePointerClose } from "@/hooks/use-outside-pointer-close";

interface AccountPeekPanelProps {
  readonly errorMessage: string | undefined;
  readonly loading: boolean;
  readonly maps: LookupMaps;
  readonly onClose: (options?: AccountPeekPanelCloseOptions) => void;
  readonly onFilterCategory?: (categoryId: number) => void;
  readonly onFilterMember?: (memberId: number) => void;
  readonly onFilterTag?: (tagId: number) => void;
  readonly onRetry: () => void;
  readonly transaction: Transaction | undefined;
}

interface AccountPeekPanelCloseOptions {
  readonly restoreFocus?: boolean;
}

const floatingOverlaySelectors = ["[data-page-help-content]"] as const;

export const AccountPeekPanel = ({
  errorMessage,
  loading,
  maps,
  onClose,
  onFilterCategory,
  onFilterMember,
  onFilterTag,
  onRetry,
  transaction,
}: AccountPeekPanelProps) => {
  const panelRef = useRef<HTMLElement | null>(null);

  useOutsidePointerClose({
    floatingOverlaySelectors,
    onOutsideClose: () => {
      onClose({ restoreFocus: false });
    },
    ref: panelRef,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      if (document.querySelector("[data-page-help-content]")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <aside
      ref={panelRef}
      aria-label="Transaction peek"
      className="bg-card fixed top-4 right-4 bottom-4 z-40 flex w-[min(780px,calc(100vw-2rem))] max-w-full flex-col border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      data-testid="account-peek-panel"
    >
      <div className="bg-card sticky top-0 z-10 flex items-start justify-between gap-3 border-b-2 border-[var(--border-ink)] p-4">
        <div className="min-w-0">
          <p className="font-heading text-muted-foreground text-xs font-semibold uppercase">
            Transaction peek
          </p>
          <h2 className="font-heading text-xl font-bold">
            {transaction?.display_title ??
              (errorMessage
                ? "Transaction unavailable"
                : "Loading transaction")}
          </h2>
        </div>
        <Tooltip label="Close transaction peek" asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Close transaction peek"
            onClick={() => {
              onClose();
            }}
          >
            <Close aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <TransactionDetailLoadingContent />
        ) : errorMessage ? (
          <div>
            <TransactionDetailErrorContent errorMessage={errorMessage} />
            <div className="px-4 pb-4">
              <Button type="button" variant="outline" onClick={onRetry}>
                <Reload aria-hidden="true" />
                Retry
              </Button>
            </div>
          </div>
        ) : transaction ? (
          <TransactionDetailContent
            maps={maps}
            onFilterCategory={onFilterCategory}
            onFilterMember={onFilterMember}
            onFilterTag={onFilterTag}
            transaction={transaction}
          />
        ) : null}
      </div>

      {transaction && !loading && !errorMessage ? (
        <div className="bg-card flex justify-end border-t-2 border-[var(--border-ink)] p-4">
          <Button asChild variant="outline">
            <Link
              to={`/transactions?transaction=${transaction.transaction_id}`}
            >
              <Open aria-hidden="true" />
              Open transaction
            </Link>
          </Button>
        </div>
      ) : null}
    </aside>
  );
};

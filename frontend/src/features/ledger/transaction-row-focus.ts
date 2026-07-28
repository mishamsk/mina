import { focusWithoutTooltip } from "@/components/tooltip";

export const transactionRowSelector = "[data-transaction-row='true']";

const listRestoreSelector = "[data-transaction-detail-restore-target]";

export const focusTransactionRowFallback = (
  browser: HTMLElement | null,
  rowIndex: number,
  source?: HTMLElement | null,
): void => {
  window.requestAnimationFrame(() => {
    const activeElement = document.activeElement;
    const sourceOwnsFocus =
      activeElement === source ||
      (activeElement instanceof Node && source?.contains(activeElement));
    if (activeElement !== document.body && !sourceOwnsFocus) {
      return;
    }

    const listRestoreTarget =
      document.querySelector<HTMLElement>(listRestoreSelector);
    const liveBrowser = browser?.isConnected ? browser : listRestoreTarget;
    const rows = liveBrowser
      ? Array.from(
          liveBrowser.querySelectorAll<HTMLElement>(transactionRowSelector),
        )
      : [];
    const neighborIndex =
      rowIndex < 0 ? -1 : Math.min(rowIndex, Math.max(0, rows.length - 1));
    const target =
      rows[neighborIndex] ??
      liveBrowser?.querySelector<HTMLElement>(
        "[data-testid='transactions-pagination-footer'] button:not(:disabled)",
      ) ??
      liveBrowser?.querySelector<HTMLElement>(
        "[data-testid='transactions-pagination-footer']",
      ) ??
      liveBrowser?.querySelector<HTMLElement>(
        "[data-transaction-empty-action]",
      ) ??
      listRestoreTarget;

    focusWithoutTooltip(target, { preventScroll: true });
  });
};

export const transactionRowFallback = (
  source: HTMLElement | null,
  transactionId: number,
): (() => void) => {
  const browser = source?.closest<HTMLElement>(
    "[data-inline-edit-scope='true']",
  );
  const sourceRow = browser?.querySelector<HTMLTableRowElement>(
    `[data-transaction-id="${transactionId}"]`,
  );
  const sourceRowIndex =
    browser && sourceRow
      ? Array.from(
          browser.querySelectorAll<HTMLTableRowElement>(transactionRowSelector),
        ).indexOf(sourceRow)
      : -1;

  return () => {
    focusTransactionRowFallback(browser ?? null, sourceRowIndex, source);
  };
};

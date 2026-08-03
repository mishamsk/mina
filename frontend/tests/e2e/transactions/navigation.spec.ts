import { test } from "@tests/e2e/test";
import {
  expect,
  expectTransactionsPageUrl,
  formatLocalDate,
  shiftLocalDate,
  type TransactionListFixture,
} from "@tests/e2e/transactions/support";

test("transactions page jumps to a date-anchored page", async ({ page }) => {
  const initialResponse = await page.request.get(
    "/api/transactions?limit=25&offset=0&sort=initiated_date&sort_dir=desc",
  );
  expect(initialResponse.ok()).toBe(true);
  const initialPage = (await initialResponse.json()) as TransactionListFixture;
  expect(initialPage.transactions.length).toBeGreaterThan(20);

  const jumpDate = initialPage.transactions[10]!.initiated_date!;
  const olderThanEverything = "2020-01-01";

  await page.goto("/transactions?page=1&pageSize=25");
  const firstTransactionRow = page
    .locator("tbody > tr[data-transaction-id]")
    .first();
  await expect(firstTransactionRow).toBeVisible();
  const normalizedFirstTransactionRowText = async () =>
    firstTransactionRow.evaluate(
      (row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
  const retainedFirstPageRow = await normalizedFirstTransactionRowText();

  let releaseDateJumpResponse: (() => void) | undefined;
  let delayDateJumpResponse = true;
  const dateJumpRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/transactions**", async (route) => {
      const url = new URL(route.request().url());
      if (
        delayDateJumpResponse &&
        url.searchParams.get("anchor_date") === jumpDate
      ) {
        delayDateJumpResponse = false;
        resolve();
        await new Promise<void>((release) => {
          releaseDateJumpResponse = release;
        });
      }
      await route.continue();
    });
  });
  const dateJumpResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === jumpDate
    );
  });
  const transactionRequestUrls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/transactions") {
      transactionRequestUrls.push(request.url());
    }
  });

  await page.getByLabel("Go to day").fill(jumpDate);
  await dateJumpRequestStarted;

  try {
    await expect(page.getByTestId("transactions-page-busy")).toBeVisible();
    await expect
      .poll(normalizedFirstTransactionRowText)
      .toBe(retainedFirstPageRow);
    await page.getByRole("button", { name: "Bulk edit" }).click();
    await page
      .locator("tbody > tr[data-transaction-id]:not([aria-disabled='true'])")
      .first()
      .click();
    await expect(
      page.getByTestId("transaction-browser-bulk-mode-bar"),
    ).toContainText("1 selected");
  } finally {
    releaseDateJumpResponse?.();
  }

  const cancelledDateJumpBody = (await (
    await dateJumpResponse
  ).json()) as TransactionListFixture;
  await expectTransactionsPageUrl(page, 1, 25);
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("1 selected");
  await expect(
    page.locator(`[data-date-jump-anchor="${jumpDate}"]`),
  ).toHaveCount(0);
  await page
    .getByTestId("transaction-browser-bulk-mode-bar")
    .getByRole("button", { name: "Done" })
    .click();

  await page.unroute("**/api/transactions**");
  const retryDateJumpResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === jumpDate
    );
  });
  await page.getByLabel("Go to day").fill("");
  await page.getByLabel("Go to day").fill(jumpDate);
  const dateJumpBody = (await (
    await retryDateJumpResponse
  ).json()) as TransactionListFixture;
  const landedPage = Math.floor(dateJumpBody.offset / 25) + 1;
  expect(cancelledDateJumpBody.offset).toBe(dateJumpBody.offset);
  expect(dateJumpBody.total_count).toBeGreaterThan(landedPage * 25);
  const landedTransaction = dateJumpBody.transactions[0]!;
  await expectTransactionsPageUrl(page, landedPage, 25);
  await expect(
    page.getByText(new RegExp(`Page ${landedPage} of \\d+`)),
  ).toBeVisible();
  await expect(
    page.getByText(landedTransaction.display_title).first(),
  ).toBeVisible();
  await expect(
    page.locator(`[data-date-jump-anchor="${jumpDate}"]`),
  ).toBeVisible();
  expect(
    transactionRequestUrls.filter((requestUrl) => {
      const url = new URL(requestUrl);
      return (
        url.searchParams.get("anchor_date") === null &&
        url.searchParams.get("limit") === "25" &&
        url.searchParams.get("offset") === String(dateJumpBody.offset)
      );
    }),
  ).toHaveLength(0);
  await expect(page.getByLabel("Go to day")).toHaveValue(jumpDate);

  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await expectTransactionsPageUrl(page, landedPage + 1, 25);
  await expect(
    page.getByText(new RegExp(`Page ${landedPage + 1} of \\d+`)),
  ).toBeVisible();

  const oldDateJumpResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === olderThanEverything
    );
  });
  await page.getByLabel("Go to day").fill(olderThanEverything);
  const oldDateJumpBody = (await (
    await oldDateJumpResponse
  ).json()) as TransactionListFixture;
  const oldAnchorPage = Math.floor(oldDateJumpBody.offset / 25) + 1;
  await expectTransactionsPageUrl(page, oldAnchorPage, 25);
  await expect(
    page.getByText(new RegExp(`Page ${oldAnchorPage} of \\d+`)),
  ).toBeVisible();
});

test("transactions page steps adjacent date anchors", async ({ page }) => {
  const anchorDate = "2026-05-01";
  const previousDate = shiftLocalDate(anchorDate, -1);
  const today = formatLocalDate(new Date());
  const yesterday = shiftLocalDate(today, -1);
  const tomorrow = shiftLocalDate(today, 1);

  await page.goto("/transactions?page=1&pageSize=25");
  const dateJump = page.getByLabel("Go to day");
  const previousDayButton = page.getByRole("button", {
    name: "Previous day",
  });
  const nextDayButton = page.getByRole("button", { name: "Next day" });

  const anchorResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === anchorDate
    );
  });
  await dateJump.fill(anchorDate);
  await anchorResponse;
  await expect(previousDayButton).toBeEnabled();

  const previousResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === previousDate
    );
  });
  await previousDayButton.focus();
  await page.keyboard.press("Enter");
  const previousPage = (await (
    await previousResponse
  ).json()) as TransactionListFixture;
  const previousLandedPage = Math.floor(previousPage.offset / 25) + 1;
  await expect(dateJump).toHaveValue(previousDate);
  await expectTransactionsPageUrl(page, previousLandedPage, 25);
  await expect(
    page.getByText(previousPage.transactions[0]!.display_title).first(),
  ).toBeVisible();
  await expect(nextDayButton).toBeEnabled();

  const nextResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === anchorDate
    );
  });
  await nextDayButton.click();
  const nextPage = (await (
    await nextResponse
  ).json()) as TransactionListFixture;
  await expect(dateJump).toHaveValue(anchorDate);
  await expectTransactionsPageUrl(
    page,
    Math.floor(nextPage.offset / 25) + 1,
    25,
  );

  await page.goto("/transactions?page=1&pageSize=25");
  await expect(dateJump).toHaveValue("");
  const noAnchorResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === yesterday
    );
  });
  await previousDayButton.click();
  const noAnchorPage = (await (
    await noAnchorResponse
  ).json()) as TransactionListFixture;
  await expect(nextDayButton).toBeEnabled();
  await expect(dateJump).toHaveValue(yesterday);
  await expectTransactionsPageUrl(
    page,
    Math.floor(noAnchorPage.offset / 25) + 1,
    25,
  );

  const todayResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === today
    );
  });
  await nextDayButton.focus();
  await page.keyboard.press("Enter");
  await todayResponse;
  await expect(nextDayButton).toBeEnabled();
  await expect(dateJump).toHaveValue(today);
  await expect(nextDayButton).toBeEnabled();

  const tomorrowResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === tomorrow
    );
  });
  await nextDayButton.click();
  await tomorrowResponse;
  await expect(dateJump).toHaveValue(tomorrow);
  await expect(nextDayButton).toBeEnabled();
});

test("transactions page repositions a same-page day jump, then keeps stepping and offers Today", async ({
  page,
}) => {
  const mishaReviewDate = shiftLocalDate(formatLocalDate(new Date()), -2);
  const previousDate = shiftLocalDate(mishaReviewDate, -1);

  await page.goto("/transactions?page=1&pageSize=50");
  const dateJump = page.getByLabel("Go to day");
  const samePageJumpResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === mishaReviewDate
    );
  });

  await dateJump.fill(mishaReviewDate);
  const samePageJump = (await (
    await samePageJumpResponse
  ).json()) as TransactionListFixture;
  expect(samePageJump.offset).toBe(0);
  const samePageJumpAnchor = page.locator(
    `[data-date-jump-anchor="${mishaReviewDate}"]`,
  );
  await expect(samePageJumpAnchor).toBeVisible();
  const samePageJumpBounds = await page
    .getByTestId("transactions-table-scroll")
    .evaluate((container, anchorDate) => {
      const row = container.querySelector(
        `[data-date-jump-anchor="${anchorDate}"]`,
      );
      if (!row) {
        return undefined;
      }

      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        containerBottom: containerRect.bottom,
        containerLeft: containerRect.left,
        containerRight: containerRect.right,
        containerTop: containerRect.top,
        rowBottom: rowRect.bottom,
        rowLeft: rowRect.left,
        rowRight: rowRect.right,
        rowTop: rowRect.top,
      };
    }, mishaReviewDate);
  expect(samePageJumpBounds).toBeDefined();
  expect(samePageJumpBounds!.rowTop).toBeGreaterThanOrEqual(
    samePageJumpBounds!.containerTop - 1,
  );
  expect(samePageJumpBounds!.rowBottom).toBeLessThanOrEqual(
    samePageJumpBounds!.containerBottom + 1,
  );
  expect(samePageJumpBounds!.rowLeft).toBeGreaterThanOrEqual(
    samePageJumpBounds!.containerLeft - 1,
  );
  expect(samePageJumpBounds!.rowRight).toBeLessThanOrEqual(
    samePageJumpBounds!.containerRight + 1,
  );

  const previousResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === previousDate
    );
  });
  await page.getByRole("button", { name: "Previous day" }).click();
  await previousResponse;
  await expect(dateJump).toHaveValue(previousDate);

  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();

  const today = formatLocalDate(new Date());
  const todayResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === today
    );
  });
  await page.getByRole("button", { name: "Today" }).click();
  const todayPage = (await (
    await todayResponse
  ).json()) as TransactionListFixture;
  await expect(dateJump).toHaveValue(today);
  await expectTransactionsPageUrl(
    page,
    Math.floor(todayPage.offset / 50) + 1,
    50,
  );
  await expect(
    page.locator(`[data-date-jump-anchor="${today}"]`),
  ).toBeVisible();
});

test("transactions page collapses low-priority columns instead of scrolling horizontally", async ({
  page,
}) => {
  const measureTableState = async () =>
    page.getByTestId("transactions-table-scroll").evaluate((container) => {
      const rows = Array.from(
        container.querySelectorAll("tbody > tr[aria-expanded]"),
      );
      const row =
        rows.find((candidate) =>
          candidate.textContent?.includes("Amex:BlueCash → merchant:Target"),
        ) ?? rows[0];
      const cells = row?.querySelectorAll("td");
      const rectFor = (cell: Element | null | undefined) => {
        const rect = cell?.getBoundingClientRect();
        return rect
          ? {
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              width: rect.width,
            }
          : undefined;
      };
      const isCollapsed = (cell: Element | null | undefined) => {
        if (!cell) {
          return true;
        }
        const style = getComputedStyle(cell);
        const rect = cell.getBoundingClientRect();
        return (
          style.display === "none" ||
          style.visibility === "collapse" ||
          rect.width < 1
        );
      };
      const amountCell = row?.querySelector<HTMLTableCellElement>(
        ".transactions-amount-column",
      );
      const amountRect = rectFor(amountCell);
      const actionsCell = row?.querySelector<HTMLTableCellElement>(
        ".transactions-actions-column",
      );
      const actionsRect = rectFor(actionsCell);
      const containerRect = container.getBoundingClientRect();
      const memberCell = row?.querySelector<HTMLTableCellElement>(
        ".transactions-member-column",
      );
      const memberRect = rectFor(memberCell);
      const memberContentRects = Array.from(
        memberCell?.querySelectorAll("*") ?? [],
      )
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const amountContentRects = Array.from(
        amountCell?.querySelectorAll("*") ?? [],
      )
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const hasTruncatedContent = (cell: Element | null | undefined) =>
        Array.from(cell?.querySelectorAll<HTMLElement>("*") ?? []).some(
          (element) => {
            const style = getComputedStyle(element);
            return (
              style.overflow !== "visible" &&
              element.scrollWidth > element.clientWidth + 1
            );
          },
        );
      const textRectsFor = (element: HTMLElement) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = Array.from(range.getClientRects())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => ({
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            top: rect.top,
          }));
        range.detach();
        return rects;
      };
      const amountChips = rows.flatMap((visibleRow) => {
        const cell = visibleRow.querySelector<HTMLTableCellElement>(
          ".transactions-amount-column",
        );
        if (!cell || isCollapsed(cell)) {
          return [];
        }
        return Array.from(
          cell.querySelectorAll<HTMLElement>("[data-testid='amount-chip']"),
        ).map((chip) => ({ cell, chip }));
      });
      const amountChipStates = amountChips.map(({ cell, chip }) => {
        const cellRect = cell.getBoundingClientRect();
        const chipRect = chip.getBoundingClientRect();
        const textRects = textRectsFor(chip);
        const lineCenters = textRects.map(
          (rect) => (rect.top + rect.bottom) / 2,
        );
        const minLineCenter = Math.min(...lineCenters);
        const maxLineCenter = Math.max(...lineCenters);
        return {
          fitsCell:
            chipRect.left >= cellRect.left - 0.5 &&
            chipRect.right <= cellRect.right + 0.5 &&
            textRects.every(
              (rect) =>
                rect.left >= cellRect.left - 0.5 &&
                rect.right <= cellRect.right + 0.5,
            ),
          singleLine:
            textRects.length > 0 && maxLineCenter - minLineCenter <= 1,
          text: chip.innerText.replace(/\s+/g, " ").trim(),
        };
      });
      const visibleAmountCells = rows
        .map((visibleRow) =>
          visibleRow.querySelector<HTMLTableCellElement>(
            ".transactions-amount-column",
          ),
        )
        .filter((cell): cell is HTMLTableCellElement => !isCollapsed(cell));
      const contentOverlappingAmount = amountRect
        ? Array.from(cells ?? [])
            .filter(
              (cell) =>
                cell !== amountCell &&
                !cell.matches(".transactions-actions-column"),
            )
            .filter((cell) => !isCollapsed(cell))
            .flatMap((cell) => [
              cell,
              ...Array.from(cell.querySelectorAll("*")),
            ])
            .some((element) => {
              const rect = element.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.right > amountRect.left + 0.5 &&
                rect.left < amountRect.right - 0.5
              );
            })
        : true;

      return {
        actionsColumnCollapsed: isCollapsed(actionsCell),
        actionsColumnRightWithinContainer:
          actionsRect !== undefined &&
          actionsRect.right <= containerRect.right + 0.5,
        actionsFolded:
          getComputedStyle(
            actionsCell?.querySelector(".row-actions-buttons") ?? container,
          ).display === "none" &&
          getComputedStyle(
            actionsCell?.querySelector(".row-actions-overflow") ?? container,
          ).display !== "none",
        categoryCollapsed: isCollapsed(
          row?.querySelector(".transactions-category-column"),
        ),
        categoryHeaderCollapsed: isCollapsed(
          container.querySelector("thead .transactions-category-column"),
        ),
        containerWidth: container.getBoundingClientRect().width,
        hasHorizontalOverflow:
          container.scrollWidth > container.clientWidth + 1,
        amountCellRightWithinContainer:
          amountRect !== undefined &&
          amountRect.right <= containerRect.right + 0.5,
        amountContentRightWithinContainer: amountRect
          ? amountContentRects.every(
              (rect) => rect.right <= containerRect.right + 0.5,
            )
          : false,
        amountHasTruncatedContent: visibleAmountCells.some((cell) =>
          hasTruncatedContent(cell),
        ),
        amountChipsFitCells: amountChipStates.every((state) => state.fitsCell),
        amountChipsSingleLine: amountChipStates.every(
          (state) => state.singleLine,
        ),
        amountChipTexts: amountChipStates.map((state) => state.text),
        amountTexts: visibleAmountCells.map((cell) =>
          cell.innerText.replace(/\s+/g, " ").trim(),
        ),
        amountText: amountCell?.innerText.replace(/\s+/g, " ").trim(),
        memberCollapsed: isCollapsed(memberCell),
        memberFullyVisible:
          isCollapsed(memberCell) ||
          (Boolean(memberRect) &&
            memberContentRects.every(
              (rect) =>
                rect.left >= (memberRect?.left ?? 0) - 0.5 &&
                rect.right <= (memberRect?.right ?? 0) + 0.5 &&
                (!amountRect || rect.right <= amountRect.left + 0.5),
            )),
        memberHeaderCollapsed: isCollapsed(
          container.querySelector("thead .transactions-member-column"),
        ),
        tagsCollapsed: isCollapsed(
          row?.querySelector(".transactions-tags-column"),
        ),
        tagsHeaderCollapsed: isCollapsed(
          container.querySelector("thead .transactions-tags-column"),
        ),
        visibleContentOverlapsAmount: contentOverlappingAmount,
      };
    });

  await page.setViewportSize({ width: 1000, height: 720 });
  await page.goto("/transactions?page=1&pageSize=100");

  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();

  const intermediateTableState = await measureTableState();

  expect(intermediateTableState.hasHorizontalOverflow).toBe(false);
  expect(intermediateTableState.amountCellRightWithinContainer).toBe(true);
  expect(intermediateTableState.amountContentRightWithinContainer).toBe(true);
  expect(intermediateTableState.amountHasTruncatedContent).toBe(false);
  expect(intermediateTableState.amountChipsFitCells).toBe(true);
  expect(intermediateTableState.amountChipsSingleLine).toBe(true);
  expect(intermediateTableState.actionsColumnCollapsed).toBe(false);
  expect(intermediateTableState.actionsColumnRightWithinContainer).toBe(true);
  expect(intermediateTableState.amountText).toBe("-45.35 $");
  expect(intermediateTableState.amountTexts).toContain("+3,250.00 $");
  expect(intermediateTableState.memberFullyVisible).toBe(true);
  expect(intermediateTableState.visibleContentOverlapsAmount).toBe(false);
  expect(intermediateTableState.memberHeaderCollapsed).toBe(
    intermediateTableState.memberCollapsed,
  );
  expect(intermediateTableState.tagsHeaderCollapsed).toBe(
    intermediateTableState.tagsCollapsed,
  );
  expect(intermediateTableState.categoryHeaderCollapsed).toBe(
    intermediateTableState.categoryCollapsed,
  );

  for (const width of [
    1600, 1440, 1280, 1249, 1150, 1000, 900, 820, 800, 700, 640,
  ]) {
    await page.setViewportSize({ width, height: 720 });
    const tableState = await measureTableState();

    expect(tableState.hasHorizontalOverflow).toBe(false);
    expect(tableState.amountCellRightWithinContainer).toBe(true);
    expect(tableState.amountContentRightWithinContainer).toBe(true);
    expect(tableState.amountHasTruncatedContent).toBe(false);
    expect(
      tableState.amountChipsFitCells,
      `amount chips fit cells at ${width}px viewport / ${tableState.containerWidth}px container: ${tableState.amountChipTexts.join(" | ")}`,
    ).toBe(true);
    expect(tableState.amountChipsSingleLine).toBe(true);
    expect(tableState.actionsColumnCollapsed).toBe(false);
    expect(tableState.actionsColumnRightWithinContainer).toBe(true);
    expect(tableState.amountText).toBe("-45.35 $");
    expect(tableState.amountTexts).toContain("+3,250.00 $");
    expect(tableState.visibleContentOverlapsAmount).toBe(false);
    if (tableState.categoryCollapsed) {
      expect(tableState.tagsCollapsed).toBe(true);
    }
    if (tableState.tagsCollapsed) {
      expect(tableState.actionsFolded).toBe(true);
    }
  }

  expect(intermediateTableState.memberCollapsed).toBe(true);

  await page.setViewportSize({ width: 700, height: 720 });
  const foldedSpendRow = page
    .getByRole("row")
    .filter({ hasText: "Amex:BlueCash → merchant:Target" })
    .first();
  await expect(foldedSpendRow).toBeVisible();
  await foldedSpendRow.hover();
  await foldedSpendRow
    .getByRole("button", { name: "More row actions" })
    .click();
  await page
    .locator('[data-slot="popover-content"]')
    .getByRole("button", { name: "Open transaction detail" })
    .click();
  await expect(page).toHaveURL(/[?&]transaction=\d+(?:&|$)/);
});

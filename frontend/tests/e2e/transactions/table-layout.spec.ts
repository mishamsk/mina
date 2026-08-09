import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  amountChipsFitCell,
  boundingBoxesOverlap,
  type CategoryFixture,
  chipShadowFitsClippingAncestors,
  createAccount,
  createMember,
  createTag,
  deleteTransaction,
  expect,
  expectRecordRoleIndicators,
  findByFqn,
  formatLocalDate,
  listFixtures,
  mixedPartsIndicatorGeometry,
  requiredBoundingBox,
  tagChipLineState,
  type TransactionFixture,
} from "@tests/e2e/transactions/support";

test("transaction layouts balance localized date fit and description width", async ({
  page,
}) => {
  await page.goto("/transactions?page=1&pageSize=100");
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();

  const table = page.locator("table.transactions-table");

  for (const viewportWidth of [1280, 1445, 1920]) {
    await page.setViewportSize({ width: viewportWidth, height: 720 });
    const layout = await table.evaluate((tableElement) => {
      const rows = Array.from(
        tableElement.querySelectorAll<HTMLTableRowElement>(
          "[data-transaction-row='true']",
        ),
      );
      const firstRow = rows[0];
      const firstDay = firstRow?.querySelector<HTMLElement>(
        ".transactions-date-column > div",
      );
      const tableWidth = tableElement.getBoundingClientRect().width;
      if (firstDay && tableWidth > 1120) {
        firstDay.textContent = "31. maijs";
      }
      const dateCell = firstRow?.querySelector<HTMLElement>(
        ".transactions-date-column",
      );
      const descriptionCell = firstRow?.querySelector<HTMLElement>(
        ".transactions-description-column",
      );

      return {
        dateContentFits: rows.every((row) =>
          Array.from(
            row.querySelectorAll<HTMLElement>(
              ".transactions-date-column > div",
            ),
          ).every((line) => {
            const style = getComputedStyle(line);
            const lineHeight = Number.parseFloat(style.lineHeight);
            return (
              line.scrollWidth <= line.clientWidth + 1 &&
              line.getBoundingClientRect().height <= lineHeight + 1
            );
          }),
        ),
        dateRatio: (dateCell?.getBoundingClientRect().width ?? 0) / tableWidth,
        descriptionRatio:
          (descriptionCell?.getBoundingClientRect().width ?? 0) / tableWidth,
        tableWidth,
      };
    });

    expect(layout.dateContentFits).toBe(true);

    if (layout.tableWidth > 1120) {
      expect(layout.dateRatio).toBeLessThanOrEqual(0.081);
      expect(layout.descriptionRatio).toBeGreaterThanOrEqual(0.249);
    } else {
      expect(layout.tableWidth).toBeGreaterThan(940);
      expect(layout.dateRatio).toBeLessThanOrEqual(0.081);
      expect(layout.descriptionRatio).toBeGreaterThanOrEqual(0.219);
    }
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  const descriptionLines = table.locator(
    '[data-testid="transaction-line-title"], [data-testid="transaction-line-memo"]',
  );
  const truncatedLineIndex = await descriptionLines.evaluateAll((lines) =>
    lines.findIndex((line) => line.scrollWidth > line.clientWidth),
  );
  expect(truncatedLineIndex).toBeGreaterThanOrEqual(0);

  const truncatedLine = descriptionLines.nth(truncatedLineIndex);
  const fullText = (await truncatedLine.textContent())?.trim() ?? "";
  await expect(truncatedLine).toHaveCSS("text-overflow", "ellipsis");
  await truncatedLine.hover();
  await expect(page.getByRole("tooltip")).toContainText(fullText);

  await page.mouse.move(0, 0);
  const toolbar = page.getByTestId("transaction-browser-toolbar-row");
  const toolbarBeforeDetail = await requiredBoundingBox(toolbar);
  const amountDisplayToggle = page.getByTestId(
    "transaction-amount-display-toggle",
  );
  const dateJumpInput = page.getByLabel("Go to day");
  const amountDisplayToggleBeforeDetail =
    await requiredBoundingBox(amountDisplayToggle);
  const dateJumpInputBeforeDetail = await requiredBoundingBox(dateJumpInput);
  expect(toolbarBeforeDetail.height).toBeLessThanOrEqual(56);
  expect(amountDisplayToggleBeforeDetail.y).toBe(dateJumpInputBeforeDetail.y);
  const editModeButton = page.getByRole("button", { name: "Edit mode" });
  const editModeButtonBeforeDetail = await requiredBoundingBox(editModeButton);
  const filterButton = page.getByRole("button", { name: "Open filters" });
  const firstRow = page.locator("[data-transaction-row='true']").first();
  await firstRow.focus();
  await firstRow.press("Enter");
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();
  const toolbarAfterDetail = await requiredBoundingBox(toolbar);
  const editModeButtonAfterDetail = await requiredBoundingBox(editModeButton);
  expect(toolbarAfterDetail.y).toBe(toolbarBeforeDetail.y);
  expect(toolbarAfterDetail.height).toBe(toolbarBeforeDetail.height);
  expect(editModeButtonAfterDetail.y).toBe(editModeButtonBeforeDetail.y);
  expect(
    boundingBoxesOverlap(
      await requiredBoundingBox(detailPanel),
      await requiredBoundingBox(filterButton),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Close transaction detail" }).click();
});

test("mixed more-parts indicators stay inside the amount column where member first appears", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const incomeSourceAccount = findByFqn(accounts, "employers:Acme:salary");
  const category = findByFqn(categories, "Entertainment:Books");
  const incomeCategory = findByFqn(categories, "Income:Salary");
  const member = await createMember(page, `Overlap ${unique}`);
  const incomeDestinationAccount = await createAccount(
    page,
    `e2e:overlap:${unique}:income-destination`,
    "owned",
    "USD",
  );
  const memo = `E2E mixed amount overlap ${unique}`;

  let mixedTransaction: TransactionFixture | undefined;
  try {
    const mixedResponse = await page.request.post("/api/transactions", {
      data: {
        initiated_date: "2026-05-31",
        records: [
          {
            account_id: fundingAccount.account_id,
            amount: "-5.00",
            category_id: null,
            currency: "USD",
            member_id: member.member_id,
            memo,
            settlement: { status: "posted" },
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: merchantAccount.account_id,
            amount: "5.00",
            category_id: category.category_id,
            currency: "USD",
            member_id: member.member_id,
            memo,
            settlement: null,
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: incomeDestinationAccount.account_id,
            amount: "100.00",
            category_id: null,
            currency: "USD",
            member_id: member.member_id,
            memo,
            settlement: { status: "posted" },
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: incomeSourceAccount.account_id,
            amount: "-100.00",
            category_id: incomeCategory.category_id,
            currency: "USD",
            member_id: member.member_id,
            memo,
            settlement: null,
            reconciliation_status: "unreconciled",
            source: "manual",
          },
        ],
      },
    });
    expect(mixedResponse.ok()).toBe(true);
    mixedTransaction = (await mixedResponse.json()) as TransactionFixture;

    await page.setViewportSize({ width: 1445, height: 720 });
    await page.goto(
      `/transactions?q=${encodeURIComponent(memo)}&page=1&pageSize=50`,
    );
    await expect(page.getByText("Description")).toBeVisible();

    const mixedRow = page.getByRole("row").filter({ hasText: memo }).first();
    await expect(mixedRow).toBeVisible();

    const widthOutsideTable = await page
      .getByTestId("transactions-table-scroll")
      .evaluate((container) => window.innerWidth - container.clientWidth);
    const viewportWidthForContainer = (containerWidth: number) =>
      Math.round(widthOutsideTable + containerWidth);
    const memberRevealSamples = [
      { containerWidth: 1119, memberCollapsed: true, name: "below" },
      { containerWidth: 1120, memberCollapsed: true, name: "at" },
      { containerWidth: 1122, memberCollapsed: false, name: "above" },
    ];

    for (const sample of memberRevealSamples) {
      await page.setViewportSize({
        height: 720,
        width: viewportWidthForContainer(sample.containerWidth),
      });
      const state = await mixedPartsIndicatorGeometry(mixedRow);

      expect(
        Math.abs(state.containerWidth - sample.containerWidth),
        `${sample.name} member breakpoint table width`,
      ).toBeLessThanOrEqual(1);
      expect(state.tableHasHorizontalOverflow, sample.name).toBe(false);
      expect(state.indicatorFitsCell, sample.name).toBe(true);
      expect(state.memberOverlaps, sample.name).toBe(false);
      expect(state.singleLine, sample.name).toBe(true);
      expect(state.chipText, sample.name).toBe("+");
      expect(state.memberCollapsed, sample.name).toBe(sample.memberCollapsed);
    }
  } finally {
    if (mixedTransaction) {
      await deleteTransaction(page, mixedTransaction);
    }
  }
});

test("transactions contain long amount chips and align the pagination footer", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const partyAccount = findByFqn(accounts, "person:Friend:Jordan");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E long amount ${unique}`;
  const mixedMemo = `E2E mixed long amount ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "9999999999.12345678",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const spendTransaction = (await spendResponse.json()) as TransactionFixture;

  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-05-31",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-9999999999.99",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: merchantAccount.account_id,
          amount: "9999999998.98",
          category_id: category.category_id,
          currency: "USD",
          memo: mixedMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: partyAccount.account_id,
          amount: "1.01",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
        },
      ],
    },
  });
  expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);
  const mixedTransaction = (await mixedResponse.json()) as TransactionFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  await expect(page.getByText("Description")).toBeVisible();

  const footerBox = await page
    .getByTestId("transactions-pagination-footer")
    .boundingBox();
  const collapseBox = await page
    .getByRole("button", { name: "Collapse sidebar" })
    .boundingBox();
  expect(footerBox).not.toBeNull();
  expect(collapseBox).not.toBeNull();
  expect(
    Math.abs(
      (footerBox?.y ?? 0) +
        (footerBox?.height ?? 0) -
        ((collapseBox?.y ?? 0) + (collapseBox?.height ?? 0)),
    ),
  ).toBeLessThanOrEqual(1);

  for (const width of [1600, 1000, 700, 390]) {
    await page.setViewportSize({ width, height: 720 });
    const longAmountRow = page.getByRole("row").filter({ hasText: memo });
    await expect(longAmountRow).toBeVisible();
    await expect(
      longAmountRow.locator(".transactions-amount-column"),
    ).toContainText("-9,999,999,999.12 $");
    const mixedLongAmountRow = page
      .getByRole("row")
      .filter({ hasText: mixedMemo });
    await expect(mixedLongAmountRow).toBeVisible();
    const mixedLongAmountChip = mixedLongAmountRow.getByTestId("amount-chip");
    await expect(mixedLongAmountChip).toHaveText("-9,999,999,998.98 $");
    await expect(mixedLongAmountChip).toHaveCSS("overflow", "hidden");
    await expect(mixedLongAmountChip.locator(".truncate")).toHaveCSS(
      "text-overflow",
      "ellipsis",
    );
    await expect(
      mixedLongAmountRow.getByTestId("more-parts-indicator"),
    ).toBeVisible();

    await expect(amountChipsFitCell(longAmountRow)).resolves.toBe(true);
    await expect(amountChipsFitCell(mixedLongAmountRow)).resolves.toBe(true);
    expect(
      boundingBoxesOverlap(
        await requiredBoundingBox(mixedLongAmountChip),
        await requiredBoundingBox(
          mixedLongAmountRow.getByTestId("more-parts-indicator"),
        ),
      ),
    ).toBe(false);
  }

  await page.setViewportSize({ width: 1000, height: 720 });
  const fullAmountLabel = "-9,999,999,999.12 $";
  const longAmountRow = page.getByRole("row").filter({ hasText: memo });
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  const longAmountChip = longAmountRow.getByTestId("amount-chip");
  await expect(longAmountChip.locator(".truncate")).toHaveCount(0);
  await expect(longAmountChip).toHaveCSS("overflow", "visible");
  await longAmountChip.scrollIntoViewIfNeeded();
  const tableScroll = page.getByTestId("transactions-table-scroll");
  const longAmountTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: fullAmountLabel });
  await tableScroll.hover({ position: { x: 1, y: 1 } });
  await longAmountChip.hover();
  await tableScroll.hover({ position: { x: 1, y: 1 } });
  await longAmountChip.hover();
  await expect(longAmountTooltip).toBeVisible();

  await page.setViewportSize({ width: 1000, height: 720 });
  await page.getByRole("button", { name: "Edit mode" }).click();
  const bulkFooterBox = await page
    .getByTestId("transactions-pagination-footer")
    .boundingBox();
  const sidebarControlBox = await page
    .getByRole("button", { name: "Expand sidebar" })
    .boundingBox();
  expect(bulkFooterBox).not.toBeNull();
  expect(sidebarControlBox).not.toBeNull();
  expect(
    Math.abs(
      (bulkFooterBox?.y ?? 0) +
        (bulkFooterBox?.height ?? 0) -
        ((sidebarControlBox?.y ?? 0) + (sidebarControlBox?.height ?? 0)),
    ),
  ).toBeLessThanOrEqual(1);
  const editModeHeader = page.getByTestId(
    "transaction-browser-edit-mode-header",
  );
  const mixedLongAmountRow = page
    .getByRole("row")
    .filter({ hasText: mixedMemo });
  const bulkMoreParts = mixedLongAmountRow.getByTestId("more-parts-indicator");
  expect(await bulkMoreParts.evaluate((indicator) => indicator.tabIndex)).toBe(
    -1,
  );
  await bulkMoreParts.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "All parts: -9,999,999,998.98 $, -1.01 $",
  );
  await bulkMoreParts.click();
  await expect(editModeHeader).toContainText("1 selected");
  const editModeAmountInput = longAmountRow.getByTestId(
    `transaction-${spendTransaction.transaction_id}-amount-input`,
  );
  await expect(editModeAmountInput).toHaveValue("9999999999.12345678");
  await page.setViewportSize({ width: 390, height: 720 });
  await expect(editModeAmountInput).toBeVisible();
  const narrowLayout = page.getByTestId("transaction-browser-layout");
  const narrowDock = page.getByTestId("transaction-edit-dock");
  const narrowGeometry = await narrowLayout.evaluate((layout) => {
    const tableRegion = layout.firstElementChild;
    const dock = layout.lastElementChild;
    return {
      dockWidth: dock?.getBoundingClientRect().width ?? 0,
      layoutClientWidth: layout.clientWidth,
      layoutScrollWidth: layout.scrollWidth,
      tableRegionWidth: tableRegion?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(narrowGeometry.tableRegionWidth).toBeGreaterThanOrEqual(368);
  expect(narrowGeometry.dockWidth).toBeGreaterThanOrEqual(256);
  expect(narrowGeometry.layoutScrollWidth).toBeGreaterThan(
    narrowGeometry.layoutClientWidth,
  );
  const narrowDockAction = narrowDock.getByRole("button", {
    name: "Set / clear",
  });
  await narrowDockAction.scrollIntoViewIfNeeded();
  await expect(narrowDockAction).toBeInViewport();
  await expect(
    narrowDock.evaluate((dock) => dock.scrollWidth <= dock.clientWidth + 1),
  ).resolves.toBe(true);
  const amountInputWidth = await editModeAmountInput.evaluate((input) => ({
    client: input.clientWidth,
    scroll: input.scrollWidth,
  }));
  expect(amountInputWidth.client).toBeGreaterThanOrEqual(
    amountInputWidth.scroll,
  );
  await expect(longAmountRow.getByTestId("amount-chip")).toHaveCount(0);
  await expect(
    page.getByRole("tooltip").filter({ hasText: fullAmountLabel }),
  ).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(editModeHeader).toContainText("0 selected");
  await page.keyboard.press("Escape");
  await expect(editModeHeader).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 720 });
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const entryRail = page.getByRole("complementary", {
    name: "Transaction entry context",
  });
  const mixedRailAmount = entryRail
    .getByTestId("amount-chip")
    .filter({ hasText: "-9,999,999,998.98 $" });
  await expect(mixedRailAmount).toBeVisible();
  const mixedRailRow = mixedRailAmount.locator("../..");
  await expect(mixedRailRow).toHaveAttribute(
    "aria-label",
    /More transaction parts\. All parts: -9,999,999,998\.98 \$, -1\.01 \$/,
  );
  await expect(mixedRailRow.getByTestId("more-parts-indicator")).toHaveText(
    "+",
  );
  await expect(
    mixedRailRow.evaluate((row) => {
      const indicator = row.querySelector<HTMLElement>(
        "[data-testid='more-parts-indicator']",
      );
      if (!indicator) {
        return false;
      }
      const rowBounds = row.getBoundingClientRect();
      const indicatorBounds = indicator.getBoundingClientRect();
      return (
        row.scrollWidth <= row.clientWidth &&
        indicatorBounds.right <= rowBounds.right + 0.5
      );
    }),
  ).resolves.toBe(true);
  const singleRailRow = entryRail
    .getByTestId("amount-chip")
    .filter({ hasText: fullAmountLabel })
    .locator("../..");
  const [mixedBounds, singleBounds, mixedStyle, singleStyle] =
    await Promise.all([
      mixedRailRow.boundingBox(),
      singleRailRow.boundingBox(),
      mixedRailAmount.evaluate((chip) => {
        const style = getComputedStyle(chip);
        return {
          border: style.border,
          boxShadow: style.boxShadow,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          height: style.height,
        };
      }),
      singleRailRow.getByTestId("amount-chip").evaluate((chip) => {
        const style = getComputedStyle(chip);
        return {
          border: style.border,
          boxShadow: style.boxShadow,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          height: style.height,
        };
      }),
    ]);
  expect(mixedBounds?.height).toBe(singleBounds?.height);
  expect(mixedStyle).toEqual(singleStyle);
  expect(mixedStyle.boxShadow).not.toBe("none");

  await deleteTransaction(page, mixedTransaction);
  await deleteTransaction(page, spendTransaction);
});

test("transactions display currency symbols with code fallback", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [categories] = await Promise.all([
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const category = findByFqn(categories, "Entertainment:Books");
  const fundingAccount = await createAccount(
    page,
    `e2e:fallback:${unique}:cash`,
    "owned",
    "XDR",
  );
  const merchantAccount = await createAccount(
    page,
    `e2e:fallback:${unique}:merchant`,
    "flow",
  );
  const memo = `E2E fallback currency ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "3.21",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "XDR",
      funding_account_id: fundingAccount.account_id,
      initiated_date: formatLocalDate(new Date()),
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Amex:BlueCash → merchant:Target" })
      .first()
      .locator(".transactions-amount-column"),
  ).toContainText("-45.35 $");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: memo })
      .locator(".transactions-amount-column"),
  ).toContainText("-3.21 XDR");
});

test("transactions page help and leaf category chips", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const fundingAccount = findByFqn(accounts, "bank:Chase:joint_checking");
  const cashEUR = await createAccount(
    page,
    `cash:E2EExchange:${unique}:EUR`,
    "owned",
    "EUR",
  );
  const exchangeMemo = `E2E exchange row ${unique}`;
  const exchangeResponse = await page.request.post(
    "/api/transactions/exchange",
    {
      data: {
        bought_account_id: cashEUR.account_id,
        bought_amount: "200.00000000",
        initiated_date: "2026-07-10",
        memo: exchangeMemo,
        sold_account_id: fundingAccount.account_id,
        sold_amount: "224.00000000",
      },
    },
  );
  expect(exchangeResponse.ok(), await exchangeResponse.text()).toBe(true);

  await page.goto("/transactions?page=1&pageSize=50");

  await expect(
    page.getByText("Read-only transaction lines open full detail on click"),
  ).toBeHidden();

  await page.getByRole("button", { name: "Transactions help" }).click();
  await expect(
    page.getByText("Read-only transaction lines open full detail on click"),
  ).toBeVisible();

  const simpleSpendRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "SPEND" }) })
    .filter({ hasText: "Amex:BlueCash → merchant:Target" })
    .first();
  await expect(simpleSpendRow).toBeVisible();
  await expect(
    simpleSpendRow.locator(".transactions-member-column"),
  ).not.toContainText("Mixed");
  await expect(
    simpleSpendRow.locator(".transactions-amount-column"),
  ).toContainText(/-45\.35 \$/);
  await expect(
    simpleSpendRow
      .locator(".transactions-description-column")
      .getByRole("button", { name: "Open transaction detail" }),
  ).toHaveCount(0);

  const mixedRow = page
    .getByRole("row")
    .filter({ hasText: "Mixed payroll correction" })
    .first();
  await expect(mixedRow).toBeVisible();
  await expect(
    mixedRow
      .locator(".transactions-category-column")
      .getByText("Mixed", { exact: true }),
  ).toBeVisible();
  await expect(mixedRow.locator(".transactions-amount-column")).toHaveText("+");
  const rowHeights = await page
    .locator("[data-transaction-row='true']")
    .evaluateAll((rows) => {
      const mixed = rows.find((row) =>
        row.textContent?.includes("Mixed payroll correction"),
      );
      const ordinarySingleLine = rows.find((row) =>
        row.textContent?.includes("Amex:BlueCash → merchant:Target"),
      );
      return {
        mixed: mixed?.getBoundingClientRect().height,
        ordinary: ordinarySingleLine?.getBoundingClientRect().height,
      };
    });
  expect(rowHeights.mixed).toBeGreaterThan(0);
  expect(rowHeights.ordinary).toBeGreaterThan(0);
  expect(
    Math.abs((rowHeights.mixed ?? 0) - (rowHeights.ordinary ?? 0)),
  ).toBeLessThanOrEqual(1);

  await page.goto(
    `/transactions?q=${encodeURIComponent(exchangeMemo)}&page=1&pageSize=50`,
  );
  const exchangeRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "EXCHANGE" }) })
    .filter({ hasText: "USD → EUR" })
    .first();
  await expect(exchangeRow).toContainText("-224.00 $");
  await expect(exchangeRow).not.toContainText("200.00 €");

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(simpleSpendRow).toBeVisible();

  const spendIcon = page.getByRole("img", { name: "SPEND" }).first();
  await expect(spendIcon).toBeVisible();
  await spendIcon.hover();
  const spendTooltip = page.getByRole("tooltip").filter({ hasText: "SPEND" });
  await expect(spendTooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(spendTooltip).toBeHidden();

  const booksCategory = page
    .getByRole("button", { name: "Filter by Books" })
    .first();
  await expect(booksCategory).toBeVisible();
  await booksCategory.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Entertainment:Books" }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).toBeHidden();

  const directRowActions = simpleSpendRow.locator(".row-actions-buttons");
  await expect(
    directRowActions.getByRole("button", { name: "Open transaction detail" }),
  ).toHaveCount(0);
  await expect(
    directRowActions.getByRole("button", { name: "Delete transaction" }),
  ).toBeVisible();
  await expect(
    simpleSpendRow.getByRole("button", { name: "More row actions" }),
  ).toBeHidden();
});

test("record role indicators preserve density across accounting shapes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "bank:Chase:joint_checking");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const correctionAccount = findByFqn(accounts, "system:correction");
  const category = findByFqn(categories, "Entertainment:Books");
  const boughtAccount = await createAccount(
    page,
    `cash:E2ERoles:${unique}:EUR`,
    "owned",
    "EUR",
  );
  const spendMemo = `E2E role spend ${unique}`;
  const exchangeMemo = `E2E role exchange ${unique}`;
  const adjustmentMemo = `E2E role adjustment ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.75",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-24",
      memo: spendMemo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);

  const exchangeResponse = await page.request.post(
    "/api/transactions/exchange",
    {
      data: {
        bought_account_id: boughtAccount.account_id,
        bought_amount: "20.00000000",
        initiated_date: "2026-07-25",
        memo: exchangeMemo,
        sold_account_id: fundingAccount.account_id,
        sold_amount: "22.00000000",
      },
    },
  );
  expect(exchangeResponse.ok(), await exchangeResponse.text()).toBe(true);

  const adjustmentResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-24",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "9.50000000",
          category_id: null,
          currency: "USD",
          memo: adjustmentMemo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: correctionAccount.account_id,
          amount: "-9.50000000",
          category_id: null,
          currency: "USD",
          memo: adjustmentMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(adjustmentResponse.ok(), await adjustmentResponse.text()).toBe(true);

  const fixtures = [
    {
      memo: spendMemo,
      roles: ["Balance role", "Expense role"],
    },
    {
      memo: exchangeMemo,
      roles: ["Balance role", "Exchange role", "Exchange role", "Balance role"],
    },
    {
      memo: adjustmentMemo,
      roles: ["Balance role", "Adjustment role"],
    },
  ] as const;

  for (const fixture of fixtures) {
    await page.goto(
      `/transactions?q=${encodeURIComponent(fixture.memo)}&page=1&pageSize=50`,
    );
    const transactionRow = page
      .getByRole("row")
      .filter({ hasText: fixture.memo })
      .first();
    await expect(transactionRow).toBeVisible();
    await transactionRow.focus();
    await transactionRow.press(" ");
    const detailPanel = page.getByTestId("transaction-detail-panel");
    await expect(detailPanel).toBeVisible();
    const detailTable = detailPanel.getByTestId(
      "transaction-detail-records-table",
    );
    await expectRecordRoleIndicators(
      detailTable,
      "tbody > tr[data-detail-record-row='true']",
      fixture.roles,
      {
        narrowDetail: true,
      },
    );

    const firstDetailRow = detailTable
      .locator("tr[data-detail-record-row='true']")
      .first();
    await firstDetailRow.click();
    const disclosure = detailTable.locator("tr.detail-records-disclosure-row");
    await expect(disclosure).toContainText("Role");
    await expect(disclosure).toContainText(
      fixture.roles[0].replace(" role", ""),
    );
  }
});

test("transactions line composition uses compact dates and single-line leaf tags", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 720 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const fitTagFqns = [
    `E2E:WrapFit:${unique}:A`,
    `E2E:WrapFit:${unique}:B`,
    `E2E:WrapFit:${unique}:C`,
    `E2E:WrapFit:${unique}:D`,
  ];
  const overflowTooltipTagFqn = `E2E:WrapOverflow:${unique}:Aardvark${unique}`;
  const overflowTagFqns = [
    overflowTooltipTagFqn,
    ...Array.from(
      { length: 11 },
      (_, index) =>
        `E2E:WrapOverflow:${unique}:Overflow${String(index + 1).padStart(2, "0")}${unique}`,
    ),
  ];
  const memberName = `QA${unique}`;
  const createdFitTags = await Promise.all(
    fitTagFqns.map((fqn) => createTag(page, fqn)),
  );
  const createdOverflowTags = await Promise.all(
    overflowTagFqns.map((fqn) => createTag(page, fqn)),
  );
  const overflowTagFqnsByName = new Map(
    createdOverflowTags.map((tag) => [tag.name, tag.fqn]),
  );
  const member = await createMember(page, memberName);
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const fitMemo = `E2E fitting tags ${unique}`;
  const overflowMemo = `E2E overflowing tags ${unique}`;
  const noMemoLeaf = `NoMemo${unique}`;
  const noMemoMerchantAccount = await createAccount(
    page,
    `merchant:E2E:${noMemoLeaf}`,
    "flow",
  );

  const fitSpendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "7.31",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo: fitMemo,
      tag_ids: createdFitTags.map((tag) => tag.tag_id),
    },
  });
  expect(fitSpendResponse.ok()).toBe(true);

  const overflowSpendResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "7.32",
        category_id: category.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-05-31",
        member_id: member.member_id,
        memo: overflowMemo,
        tag_ids: createdOverflowTags.map((tag) => tag.tag_id),
      },
    },
  );
  expect(overflowSpendResponse.ok()).toBe(true);

  const noMemoSpendResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "6.42",
        category_id: category.category_id,
        counterparty_account_id: noMemoMerchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-05-31",
        tag_ids: createdOverflowTags.map((tag) => tag.tag_id),
      },
    },
  );
  expect(noMemoSpendResponse.ok()).toBe(true);

  await page.goto("/transactions?page=1&pageSize=100");
  await expect(page.getByText("Description")).toBeVisible();

  const fitTagRow = page.getByRole("row").filter({ hasText: fitMemo }).first();
  await expect(fitTagRow).toBeVisible();
  const fitTagState = await tagChipLineState(fitTagRow);
  expect(fitTagState.visibleLabels.length).toBeGreaterThan(2);
  expect(fitTagState.visibleLabels).toEqual(
    expect.arrayContaining(createdFitTags.map((tag) => tag.name)),
  );
  expect(fitTagState.hiddenLabels).toEqual([]);
  for (const viewportWidth of [1600, 1200]) {
    await page.setViewportSize({ width: viewportWidth, height: 720 });
    const responsiveTagState = await tagChipLineState(fitTagRow);
    expect(responsiveTagState.visibleRowCount).toBe(1);
    expect(responsiveTagState.verticalCenterOffset).not.toBeNull();
    expect(
      responsiveTagState.verticalCenterOffset ?? Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(1.5);
  }
  await page.setViewportSize({ width: 1600, height: 720 });
  await expect(
    fitTagRow
      .locator(".transactions-tags-column")
      .getByTestId("transaction-tags-overflow"),
  ).toHaveCount(0);

  const overflowTagRow = page
    .getByRole("row")
    .filter({ hasText: overflowMemo })
    .first();
  await expect(overflowTagRow).toBeVisible();

  const dateCell = overflowTagRow.locator(".transactions-date-column");
  await expect(dateCell.locator("div").nth(0)).toHaveText("May 31");
  await expect(dateCell.locator("div").nth(1)).toHaveText("2026");

  await expect(
    overflowTagRow.getByTestId("transaction-status-indicators"),
  ).toHaveCount(0);

  const overflowTagState = await tagChipLineState(overflowTagRow);
  expect(overflowTagState.visibleLabels.length).toBeGreaterThan(0);
  expect(overflowTagState.hiddenLabels.length).toBeGreaterThan(0);
  expect(overflowTagState.visibleRowCount).toBeLessThanOrEqual(2);

  const visibleOverflowTag = overflowTagRow
    .locator(".transactions-tags-column")
    .getByText(createdOverflowTags[0]?.name ?? "", { exact: true });
  await expect(visibleOverflowTag).toBeVisible();
  const overflowChip = overflowTagRow
    .locator(".transactions-tags-column")
    .getByTestId("transaction-tags-overflow");
  await expect(overflowChip).toBeVisible();
  const renderedOverflowTagLabels = await overflowTagRow
    .locator(".transactions-tags-column")
    .getByTestId("transaction-tag-chips-list")
    .evaluate((list) =>
      Array.from(list.children)
        .map((child) => child.textContent?.trim() ?? "")
        .filter(Boolean),
    );
  const overflowTooltipLabel = renderedOverflowTagLabels
    .map((label) => overflowTagFqnsByName.get(label) ?? label)
    .join(", ");
  await overflowChip.hover();
  const overflowTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: overflowTooltipLabel });
  await expect(overflowTooltip).toBeVisible();
  await expect(overflowTooltip).toHaveText(overflowTooltipLabel);
  expect(await chipShadowFitsClippingAncestors(visibleOverflowTag)).toBe(true);

  const memberChip = overflowTagRow
    .locator(".transactions-member-column")
    .getByText(memberName.slice(0, 2), { exact: true });
  await expect(memberChip).toBeVisible();
  expect(await chipShadowFitsClippingAncestors(memberChip)).toBe(true);

  const noMemoRow = page
    .getByRole("row")
    .filter({ hasText: noMemoLeaf })
    .first();
  await expect(noMemoRow).toBeVisible();
  await expect(noMemoRow.getByTestId("transaction-line-title")).toContainText(
    noMemoLeaf,
  );
  await expect(noMemoRow.getByTestId("transaction-line-memo")).toHaveCount(0);
  const noMemoTagState = await tagChipLineState(noMemoRow);
  expect(noMemoTagState.visibleRowCount).toBe(2);
  const noMemoTitleCenterOffset = await noMemoRow
    .locator(".transactions-description-column")
    .evaluate((descriptionCell) => {
      const title = descriptionCell.querySelector<HTMLElement>(
        "[data-testid='transaction-line-title']",
      );
      if (!title) {
        return Number.POSITIVE_INFINITY;
      }

      const cellRect = descriptionCell.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      return Math.abs(
        titleRect.top +
          titleRect.height / 2 -
          (cellRect.top + cellRect.height / 2),
      );
    });
  expect(noMemoTitleCenterOffset).toBeLessThanOrEqual(1);

  const rowHeights = await page
    .locator("[data-transaction-row='true']")
    .evaluateAll(
      (rows, rowText) => {
        const manyTag = rows.find((row) =>
          row.textContent?.includes(rowText.withMemo),
        );
        const noMemoManyTag = rows.find((row) =>
          row.textContent?.includes(rowText.withoutMemo),
        );
        const ordinary = rows.find((row) =>
          row.textContent?.includes("Amex:BlueCash → merchant:Target"),
        );
        return {
          manyTag: manyTag?.getBoundingClientRect().height,
          noMemoManyTag: noMemoManyTag?.getBoundingClientRect().height,
          ordinary: ordinary?.getBoundingClientRect().height,
        };
      },
      { withMemo: overflowMemo, withoutMemo: noMemoLeaf },
    );
  expect(
    Math.abs((rowHeights.manyTag ?? 0) - (rowHeights.ordinary ?? 0)),
  ).toBeLessThan(1);
  expect(
    Math.abs((rowHeights.noMemoManyTag ?? 0) - (rowHeights.ordinary ?? 0)),
  ).toBeLessThan(1);
});

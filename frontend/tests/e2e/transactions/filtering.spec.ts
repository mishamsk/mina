import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  activateTransactionRow,
  captureSearchDebounce,
  type CategoryFixture,
  clickRowAction,
  createAccount,
  createCategory,
  createExpectedRecurringFixture,
  createMember,
  createSearchSpend,
  createTag,
  deleteTransaction,
  expect,
  expectAmountMarkerRightEdgesAligned,
  expectCollapsedRowActionsKeepAmountVisible,
  expectTransactionFilterUrl,
  expectTransactionsPageUrl,
  fillAndExpectValue,
  findByFqn,
  formatLocalDate,
  hideTag,
  journalRecord,
  listFixtures,
  type Locator,
  openRowActionsMenu,
  pickerSelectedLabel,
  runCapturedSearchDebounce,
  shiftLocalDate,
  type TransactionFixture,
  transactionRequestHasFilters,
  waitForLedgerLookups,
} from "@tests/e2e/transactions/support";

const defaultTransactionBrowserFilter =
  "(lifecycle:active or lifecycle:expected or lifecycle:cancelled)";

test("transactions page uses server pagination controls", async ({ page }) => {
  const defaultPageRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("limit") === "50" &&
      url.searchParams.get("offset") === "0"
    );
  });
  await page.goto("/transactions");
  await defaultPageRequest;
  await expect(page.getByLabel("Rows")).toContainText("50");
  await page.getByLabel("Rows").click();
  await expect(
    page.getByRole("option", { exact: true, name: "25" }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { exact: true, name: "50" }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { exact: true, name: "100" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  const legacyPageSizeRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("limit") === "50" &&
      url.searchParams.get("offset") === "0"
    );
  });
  await page.goto("/transactions?page=1&pageSize=10");
  await legacyPageSizeRequest;
  await expect(page.getByLabel("Rows")).toContainText("50");

  await page.goto("/transactions?page=1&pageSize=25");

  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  await expect(
    page
      .locator("[data-transaction-row='true']")
      .filter({ hasText: "→" })
      .first(),
  ).toBeVisible();
  const firstPageFirstTitle = (
    await page
      .locator("[data-transaction-row='true']")
      .first()
      .locator(".transactions-description-column")
      .innerText()
  ).split("\n")[0];
  const firstPageFirstDate = await page
    .locator("[data-transaction-row='true']")
    .first()
    .locator(".transactions-date-column")
    .innerText();
  expect(firstPageFirstDate).toMatch(/^[A-Z][a-z]{2} \d{1,2}\n\d{4}$/);

  const amountColumnBefore = await page
    .getByRole("columnheader", { name: "Amount" })
    .boundingBox();
  expect(amountColumnBefore).not.toBeNull();

  let releaseNextPageResponse: (() => void) | undefined;
  const nextPageRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/transactions**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("offset") === "25") {
        resolve();
        await new Promise<void>((release) => {
          releaseNextPageResponse = release;
        });
      }
      await route.continue();
    });
  });

  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await nextPageRequestStarted;

  try {
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId("transactions-page-busy")).toBeVisible();
    const retainedRowText = await page
      .locator("[data-transaction-row='true']")
      .first()
      .innerText();
    expect(retainedRowText).toContain(firstPageFirstTitle);
  } finally {
    releaseNextPageResponse?.();
  }

  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
  const amountColumnAfter = await page
    .getByRole("columnheader", { name: "Amount" })
    .boundingBox();
  expect(amountColumnAfter).not.toBeNull();
  expect(
    Math.abs((amountColumnBefore?.x ?? 0) - (amountColumnAfter?.x ?? 0)),
  ).toBeLessThan(1);
  expect(
    Math.abs(
      (amountColumnBefore?.width ?? 0) - (amountColumnAfter?.width ?? 0),
    ),
  ).toBeLessThan(1);

  await page.getByRole("button", { exact: true, name: "Previous" }).click();

  await expect(page).toHaveURL(/page=1/);
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
});

test("edit mode keyboard ranges stay page-local across pagination", async ({
  page,
}) => {
  await page.goto("/transactions?page=1&pageSize=25");
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  const selectableRows = page.locator(
    "tbody tr[data-transaction-id]:not([aria-disabled='true'])",
  );
  await expect(selectableRows.nth(1)).toBeVisible();
  await page.getByRole("button", { name: "Edit mode" }).click();
  const selectableCount = await selectableRows.count();
  const modeBar = page.getByTestId("transaction-browser-edit-mode-header");
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveCount(0);

  await selectableRows.first().focus();
  await page.keyboard.press("Space");
  await expect(modeBar).toContainText("1 selected");
  await selectableRows.nth(1).focus();
  await page.keyboard.press("Shift+Space");
  await expect(modeBar).toContainText("2 selected");
  await selectableRows.first().focus();
  await page.keyboard.press("Shift+Space");
  await expect(modeBar).toContainText("1 selected");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(modeBar).toContainText("2 selected");

  await modeBar.getByRole("button", { name: "Clear" }).click();
  await selectableRows.first().focus();
  await page.keyboard.press("Control+A");
  await expect(modeBar).toContainText(`${selectableCount} selected`);
  await expect(
    page.getByRole("checkbox", { name: "Select page transactions" }),
  ).toBeChecked();

  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
  await expect(modeBar).toContainText("0 selected");
  await expect(page.getByTestId("transaction-edit-dock")).toBeVisible();
  await expect(page.getByTestId("edit-dock-editor")).toHaveCount(0);
});

test("transactions page search filters server-side and deep-links", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E search memo ${unique}`;
  await createSearchSpend(page, memo);

  await page.goto("/transactions?page=2&pageSize=25");
  await expect(page.getByText("Description")).toBeVisible();

  const searchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === unique
    );
  });
  await page.getByRole("searchbox", { name: "Search" }).fill(unique);
  const requestUrl = new URL((await searchRequest).url());
  expect(requestUrl.searchParams.get("limit")).toBe("25");
  expect(requestUrl.searchParams.get("offset")).toBe("0");
  expect(requestUrl.searchParams.get("search")).toBe(unique);

  await expectTransactionsPageUrl(page, 1, 25, { q: unique });
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();

  const deepLinkRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === unique &&
      url.searchParams.get("limit") === "50"
    );
  });
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  await deepLinkRequest;
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    unique,
  );
  await expectTransactionsPageUrl(page, 1, 50, { q: unique });
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();
});

test("uncached search failure replaces retained rows with the page error", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `MissingSearch${slug}${Date.now()}`;

  await page.goto("/transactions?page=1&pageSize=50");
  const previousRow = page.locator("[data-transaction-row='true']").first();
  await expect(previousRow).toBeVisible();

  await page.route("**/api/transactions**", async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      url.pathname !== "/api/transactions" ||
      url.searchParams.get("search") !== unique
    ) {
      await route.continue();
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: "forced_uncached_page_failure",
          message: "Forced uncached transaction page failure.",
        },
      }),
      contentType: "application/json",
      status: 503,
    });
  });

  await page.getByRole("searchbox", { name: "Search" }).fill(unique);

  const fatalAlert = page
    .getByRole("alert")
    .filter({ hasText: "Transactions could not be loaded." });
  await expect(fatalAlert).toBeVisible();
  await expect(fatalAlert).toContainText(
    "Forced uncached transaction page failure.",
  );
  await expect(page.locator("[data-transaction-row='true']")).toHaveCount(0);
  await expect(page.getByText("Transactions may be stale.")).toHaveCount(0);
});

test("debounced search preserves transaction detail URL state", async ({
  page,
}, testInfo) => {
  const clockStart = Date.now();
  await page.clock.install({ time: clockStart });
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E search race ${unique}`;
  const transaction = await createSearchSpend(page, memo);

  await page.goto("/transactions?page=1&pageSize=50");
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  await page.clock.pauseAt(clockStart + 60_000);
  await captureSearchDebounce(
    page,
    page.getByRole("searchbox", { name: "Search" }),
    unique,
  );
  await row.click();
  await runCapturedSearchDebounce(page, unique);
  await page.clock.runFor(350);

  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();
  await expectTransactionsPageUrl(page, 1, 50, {
    q: unique,
    transaction: String(transaction.transaction_id),
  });

  await page.goBack();
  await expect(detailPanel).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    unique,
  );
  await expectTransactionsPageUrl(page, 1, 50, { q: unique });
});

test("debounced search preserves unsaved split editor input", async ({
  page,
}, testInfo) => {
  const clockStart = Date.now();
  await page.clock.install({ time: clockStart });
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const modifiedMemo = `E2E unsaved split ${unique}`;
  const memo = `E2E search race ${unique}`;
  const transaction = await createSearchSpend(page, memo);

  await page.goto("/transactions?page=1&pageSize=50");
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  await page.clock.pauseAt(clockStart + 60_000);
  // Keep the pre-entry callback so the URL rerender cannot replace it before
  // the test fires that exact late write after editing the split draft.
  await captureSearchDebounce(
    page,
    page.getByRole("searchbox", { name: "Search" }),
    unique,
  );
  await clickRowAction(page, row, "Split transaction");
  await expectTransactionsPageUrl(page, 1, 50, {
    entry: `split:${transaction.transaction_id}`,
  });

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  const memoInput = journalRecord(page, 1).getByLabel("Memo");
  await expect(entryPanel).toBeVisible();
  await expect(memoInput).toBeVisible();
  await memoInput.fill(modifiedMemo);
  await runCapturedSearchDebounce(page, unique);
  await page.clock.runFor(350);

  await expectTransactionsPageUrl(page, 1, 50, {
    entry: `split:${transaction.transaction_id}`,
    q: unique,
  });
  await expect(entryPanel).toBeVisible();
  await expect(memoInput).toHaveValue(modifiedMemo);

  await memoInput.fill(memo);
  await page.goBack();
  await expect(entryPanel).toHaveCount(0);
  await expectTransactionsPageUrl(page, 1, 50, { q: unique });
});

test("transactions page add-filter menu drives server filters and chips", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const visibleTagOne = await createTag(page, `E2E:Filter:${unique}:Groceries`);
  const visibleTagTwo = await createTag(page, `E2E:Filter:${unique}:Errands`);
  const tagFilter = `(tag:"${visibleTagTwo.fqn}" or tag:"${visibleTagOne.fqn}")`;
  const composedFilter = `(${tagFilter} and currency:USD and settlement:pending and (amount>=10 and amount<=20) and (initiated>=2026-05-01 and initiated<=2026-05-31))`;
  const deepLinkFilter = `((tag:"${visibleTagOne.fqn}" or tag:"${visibleTagTwo.fqn}") and currency:USD and settlement:pending and amount>=10 and amount<=20 and initiated>=2026-05-01 and initiated<=2026-05-31)`;
  const hiddenTag = await createTag(page, `E2E:Filter:${unique}:HiddenMatch`);
  await hideTag(page, hiddenTag);

  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const targetMemo = `E2E filtered target ${unique}`;
  const eurMemo = `E2E filtered EUR ${unique}`;
  const eurFundingAccount = await createAccount(
    page,
    `e2e:Filter:${unique}:EuroChecking`,
    "owned",
    "EUR",
  );
  const eurMerchantAccount = await createAccount(
    page,
    `e2e:Filter:${unique}:EuroMerchant`,
    "flow",
    "EUR",
  );

  const targetSpend = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo: targetMemo,
      settlement: { status: "pending" },
      tag_ids: [visibleTagOne.tag_id],
    },
  });
  expect(targetSpend.ok()).toBe(true);
  const alternateSpend = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "15.00",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-30",
      memo: `E2E filtered alternate ${unique}`,
      tag_ids: [visibleTagTwo.tag_id],
    },
  });
  expect(alternateSpend.ok()).toBe(true);
  const eurSpend = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: category.category_id,
      counterparty_account_id: eurMerchantAccount.account_id,
      currency: "EUR",
      funding_account_id: eurFundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo: eurMemo,
      settlement: { status: "pending" },
      tag_ids: [visibleTagOne.tag_id],
    },
  });
  expect(eurSpend.ok()).toBe(true);

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=2&pageSize=25");
  await ledgerLookups;
  await expect(page.getByText("Description")).toBeVisible();

  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  const tagsPicker = page.getByRole("combobox", { name: "Tags" });
  await fillAndExpectValue(tagsPicker, "HiddenMatch");
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    "No matches",
    { timeout: 10000 },
  );
  const includeHiddenTags = page.getByRole("checkbox", {
    name: "Include hidden",
  });
  await includeHiddenTags.click();
  await expect(includeHiddenTags).toBeChecked();
  await tagsPicker.focus();
  await expect(tagsPicker).toHaveValue("HiddenMatch");
  await expect(
    page
      .locator("#transactions-filter-tag-options")
      .getByRole("option")
      .filter({ hasText: "HiddenMatch" }),
  ).toBeVisible();
  await tagsPicker.fill(visibleTagOne.fqn);
  await expect(
    page.getByRole("button", {
      name: `Remove ${pickerSelectedLabel(visibleTagOne)}`,
    }),
  ).toBeVisible();
  await tagsPicker.fill(visibleTagTwo.fqn);
  await expect(
    page.getByRole("button", {
      name: `Remove ${pickerSelectedLabel(visibleTagTwo)}`,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { exact: true, name: "Currency" }).click();
  const multiCurrencyRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        filter: `(${tagFilter} and (currency:EUR or currency:USD))`,
        limit: "25",
      })
    );
  });
  await page.getByRole("checkbox", { name: "USD" }).click();
  await page.getByRole("checkbox", { name: "EUR" }).click();
  await multiCurrencyRequest;
  await expectTransactionFilterUrl(page, {
    filter: `(${tagFilter} and (currency:EUR or currency:USD))`,
    pageSize: "25",
  });
  await expect(
    page.getByRole("row").filter({ hasText: eurMemo }),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: "EUR" }).click();
  await expectTransactionFilterUrl(page, {
    filter: `(${tagFilter} and currency:USD)`,
    pageSize: "25",
  });
  await expect(page.getByRole("row").filter({ hasText: eurMemo })).toBeHidden();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Settlement" }).click();
  await page.getByText("Pending", { exact: true }).click();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { exact: true, name: "Amount" }).click();
  const amountDialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Amount" }),
  });
  const amountMinInput = amountDialog.getByRole("textbox", { name: "Min" });
  const amountMaxInput = amountDialog.getByRole("textbox", { name: "Max" });
  await fillAndExpectValue(amountMinInput, "10");
  await fillAndExpectValue(amountMaxInput, "20");
  await expect(page.getByText("Amount 10-20")).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Initiated date" }).click();
  await page
    .getByRole("textbox", { exact: true, name: "From" })
    .fill("2026-05-01");
  const finalFilterRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        filter: composedFilter,
        limit: "25",
      })
    );
  });
  await page
    .getByRole("textbox", { exact: true, name: "To" })
    .fill("2026-05-31");
  await finalFilterRequest;

  await expectTransactionFilterUrl(page, {
    filter: composedFilter,
    pageSize: "25",
  });
  await expect(
    page.getByRole("row").filter({ hasText: targetMemo }),
  ).toBeVisible();

  const deepLinkRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        filter: deepLinkFilter,
        limit: "25",
      })
    );
  });
  await page.goto(
    `/transactions?page=1&pageSize=25&filter=${encodeURIComponent(deepLinkFilter)}`,
  );
  await deepLinkRequest;
  const deepLinkTagLabel = `Tag ${pickerSelectedLabel(visibleTagOne)}, ${pickerSelectedLabel(visibleTagTwo)} · any of`;
  await expect(page.getByText(deepLinkTagLabel)).toBeVisible();
  await expect(page.getByText("Settlement Pending")).toBeVisible();
  await expect(page.getByText("Currency USD")).toBeVisible();
  await expect(page.getByText("Amount 10-20")).toBeVisible();
  await expect(page.getByText("Initiated 2026-05-01-2026-05-31")).toBeVisible();

  const pageSizeRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        filter: deepLinkFilter,
        limit: "50",
      })
    );
  });
  await page.getByLabel("Rows").click();
  await page.getByRole("option", { exact: true, name: "50" }).click();
  await pageSizeRequest;

  const dateJumpRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        anchorDate: "2026-05-31",
        filter: deepLinkFilter,
        limit: "50",
      })
    );
  });
  await page.getByLabel("Go to day").fill("2026-05-31");
  await dateJumpRequest;

  await page.getByRole("button", { name: "Remove Currency USD" }).click();
  await expectTransactionFilterUrl(page, {
    filter: `(${tagFilter} and settlement:pending and (amount>=10 and amount<=20) and (initiated>=2026-05-01 and initiated<=2026-05-31))`,
    pageSize: "50",
  });
  await expect(
    page.getByRole("row").filter({ hasText: eurMemo }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Currency USD")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: eurMemo })).toBeHidden();

  await page.getByRole("button", { name: "Remove Settlement Pending" }).click();
  await expectTransactionFilterUrl(page, {
    filter: `(${tagFilter} and currency:USD and (amount>=10 and amount<=20) and (initiated>=2026-05-01 and initiated<=2026-05-31))`,
    pageSize: "50",
  });

  await page.getByRole("button", { name: "Close filters" }).click();
  await expectTransactionFilterUrl(page, { filter: null, pageSize: "50" });
  await expect(page.getByText(deepLinkTagLabel)).toBeHidden();
  await expect(page.getByText("Amount 10-20")).toBeHidden();

  const relativeDateRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("filter") === "initiated>=-30d"
    );
  });
  await page.goto(
    `/transactions?page=1&pageSize=50&filter=${encodeURIComponent("initiated>=-30d")}`,
  );
  await relativeDateRequest;
  await page.getByRole("button", { name: "Edit Initiated >= -30d" }).click();
  await expect(
    page.getByRole("textbox", { exact: true, name: "From" }),
  ).toHaveValue("-30d");
});

test("typed currency filters commit suggestions and layer Escape", async ({
  page,
}) => {
  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=50");
  await ledgerLookups;
  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Currency" }).click();

  const currencyCode = page.getByRole("combobox", { name: "Currency code" });
  await expect(
    page.locator(
      "datalist#transactions-filter-currency-options option[value='EUR']",
    ),
  ).toHaveCount(1);

  const eurRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, { filter: "currency:EUR" })
    );
  });
  await currencyCode.fill("E");
  await currencyCode.press("ArrowDown");
  await currencyCode.press("Enter");
  await eurRequest;
  await expectTransactionFilterUrl(page, { filter: "currency:EUR" });

  const historyLengthBeforeDuplicate = await page.evaluate(
    () => window.history.length,
  );
  await currencyCode.fill("eur");
  await currencyCode.press("Enter");
  expect(await page.evaluate(() => window.history.length)).toBe(
    historyLengthBeforeDuplicate,
  );

  const cryptoRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        filter: '(currency:"C::stETH" or currency:EUR)',
      })
    );
  });
  await currencyCode.fill("c::stETH");
  await currencyCode.press("Enter");
  await cryptoRequest;
  await expectTransactionFilterUrl(page, {
    filter: '(currency:"C::stETH" or currency:EUR)',
  });

  const cryptoCheckbox = page.getByRole("checkbox", { name: "C::stETH" });
  await cryptoCheckbox.press("Space");
  await expectTransactionFilterUrl(page, { filter: "currency:EUR" });
  await expect(cryptoCheckbox).toHaveCount(0);

  await currencyCode.fill("E");
  await currencyCode.press("ArrowDown");
  await currencyCode.press("ArrowUp");
  await currencyCode.press("Escape");
  await expect(currencyCode).toBeVisible();
  await expect(currencyCode).toHaveValue("E");
  await currencyCode.press("Escape");
  await expect(currencyCode).toBeHidden();

  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Currency" }).click();
  await currencyCode.fill("E");
  await currencyCode.dispatchEvent("pointerdown");
  await currencyCode.evaluate((input) => {
    const valueDescriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );
    valueDescriptor?.set?.call(input, "EUR");
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
      }),
    );
  });
  await currencyCode.press("Escape");
  await expect(currencyCode).toBeHidden();
});

test("transactions inline recurring occurrences support lifecycle filtering, confirm, and dismiss", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 700, height: 720 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const overdueDate = shiftLocalDate(formatLocalDate(new Date()), -1);
  const overdueFixture = await createExpectedRecurringFixture(
    page,
    `${unique}Overdue`,
    {
      anchorDate: overdueDate,
      featured: true,
    },
  );
  const dueFixture = await createExpectedRecurringFixture(page, `${unique}Due`);
  const ordinaryMemo = `E2E recurring layout ${unique} ordinary`;
  const ordinaryResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "34.56",
      category_id: dueFixture.category.category_id,
      counterparty_account_id: dueFixture.merchant.account_id,
      currency: "USD",
      funding_account_id: dueFixture.checking.account_id,
      initiated_date: formatLocalDate(new Date()),
      memo: ordinaryMemo,
    },
  });
  expect(ordinaryResponse.ok(), await ordinaryResponse.text()).toBe(true);
  const search = unique;

  const defaultRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === search &&
      transactionRequestHasFilters(url, {
        filter: defaultTransactionBrowserFilter,
        limit: "50",
      })
    );
  });
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  await defaultRequest;
  const overdueRow = page.getByRole("row").filter({
    hasText: overdueFixture.merchantFqn.split(":").at(-1) ?? "Merchant",
  });
  const dueRow = page
    .getByRole("row")
    .filter({
      hasText: dueFixture.merchantFqn.split(":").at(-1) ?? "Merchant",
    })
    .filter({ has: page.getByRole("img", { name: "Expected" }) });
  const ordinaryRow = page.getByRole("row").filter({ hasText: ordinaryMemo });
  await expect(overdueRow).toBeVisible();
  await expect(dueRow).toBeVisible();
  await expect(ordinaryRow).toBeVisible();

  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Lifecycle" }).click();
  await page.getByRole("checkbox", { name: "Active" }).click();
  const allLifecycleRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === search &&
      transactionRequestHasFilters(url, {
        filter: "(lifecycle:active or lifecycle:expected)",
        limit: "50",
      })
    );
  });
  await page.getByRole("checkbox", { name: "Expected" }).click();
  await allLifecycleRequest;
  await page.getByRole("button", { name: "Back" }).click();
  await page.keyboard.press("Escape");
  await expect(overdueRow).toBeVisible();
  await expect(dueRow).toBeVisible();
  await expect(ordinaryRow).toBeVisible();

  for (const width of [1280, 700]) {
    await page.setViewportSize({ width, height: 720 });

    const overdueExpected = overdueRow.getByRole("img", { name: "Expected" });
    const overdueMarker = overdueRow.getByRole("img", { name: "Overdue" });
    const dueExpected = dueRow.getByRole("img", { name: "Expected" });
    await expect(overdueExpected).toBeVisible();
    await expect(overdueMarker).toBeVisible();
    await expect(dueExpected).toBeVisible();
    await expect(dueRow.getByRole("img", { name: "Overdue" })).toHaveCount(0);
    await expect(
      ordinaryRow.getByTestId("transaction-status-indicators"),
    ).toHaveCount(0);

    const geometry = await Promise.all(
      [overdueRow, dueRow, ordinaryRow].map((row) =>
        row.evaluate((element) => {
          const cell = element.querySelector<HTMLElement>(
            ".transactions-description-column",
          );
          const text = element.querySelector<HTMLElement>(
            "[data-testid='transaction-description-text']",
          );
          const indicators = element.querySelector<HTMLElement>(
            "[data-testid='transaction-status-indicators']",
          );
          const title = element.querySelector<HTMLElement>(
            "[data-testid='transaction-line-title']",
          );
          if (!cell || !text || !title) {
            throw new Error("expected transaction description geometry");
          }
          const cellBounds = cell.getBoundingClientRect();
          const textBounds = text.getBoundingClientRect();
          const indicatorBounds = indicators?.getBoundingClientRect();
          const rowBounds = element.getBoundingClientRect();
          return {
            cell: {
              bottom: cellBounds.bottom,
              left: cellBounds.left,
              right: cellBounds.right,
              top: cellBounds.top,
            },
            indicators: indicatorBounds
              ? {
                  bottom: indicatorBounds.bottom,
                  left: indicatorBounds.left,
                  right: indicatorBounds.right,
                  top: indicatorBounds.top,
                }
              : undefined,
            rowHeight: rowBounds.height,
            text: {
              right: textBounds.right,
              width: textBounds.width,
            },
            titleOverflow: getComputedStyle(title).textOverflow,
            titleWhiteSpace: getComputedStyle(title).whiteSpace,
          };
        }),
      ),
    );
    const [overdueGeometry, dueGeometry, ordinaryGeometry] = geometry;
    expect(overdueGeometry?.indicators).toBeDefined();
    expect(dueGeometry?.indicators).toBeDefined();
    expect(ordinaryGeometry?.indicators).toBeUndefined();

    for (const recurringGeometry of [overdueGeometry, dueGeometry]) {
      expect(
        (recurringGeometry?.indicators?.left ?? 0) -
          (recurringGeometry?.text.right ?? 0),
      ).toBeGreaterThanOrEqual(-0.5);
      expect(recurringGeometry?.indicators?.left ?? 0).toBeGreaterThanOrEqual(
        (recurringGeometry?.cell.left ?? 0) - 0.5,
      );
      expect(recurringGeometry?.indicators?.right ?? 0).toBeLessThanOrEqual(
        (recurringGeometry?.cell.right ?? 0) + 0.5,
      );
      expect(recurringGeometry?.indicators?.top ?? 0).toBeGreaterThanOrEqual(
        (recurringGeometry?.cell.top ?? 0) - 0.5,
      );
      expect(recurringGeometry?.indicators?.bottom ?? 0).toBeLessThanOrEqual(
        (recurringGeometry?.cell.bottom ?? 0) + 0.5,
      );
      expect(recurringGeometry?.titleOverflow).toBe("ellipsis");
      expect(recurringGeometry?.titleWhiteSpace).toBe("nowrap");
    }

    expect(ordinaryGeometry?.text.width ?? 0).toBeGreaterThan(
      (dueGeometry?.text.width ?? 0) + 20,
    );
    expect(dueGeometry?.text.width ?? 0).toBeGreaterThan(
      (overdueGeometry?.text.width ?? 0) + 20,
    );
    expect(
      Math.abs(
        (ordinaryGeometry?.rowHeight ?? 0) -
          (dueGeometry?.rowHeight ?? Number.POSITIVE_INFINITY),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        (ordinaryGeometry?.rowHeight ?? 0) -
          (overdueGeometry?.rowHeight ?? Number.POSITIVE_INFINITY),
      ),
    ).toBeLessThanOrEqual(1);
  }

  await overdueRow.getByRole("img", { name: "Expected" }).hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Expected" }),
  ).toBeVisible();
  await overdueRow.getByRole("img", { name: "Overdue" }).hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Overdue occurrence" }),
  ).toBeVisible();
  await expect(overdueRow.getByText("-23.45 $", { exact: true })).toHaveClass(
    /text-muted-foreground/,
  );
  await expectCollapsedRowActionsKeepAmountVisible(overdueRow);
  await expectCollapsedRowActionsKeepAmountVisible(dueRow);
  const overdueActionsMenu = await openRowActionsMenu(page, overdueRow);
  await expect(
    overdueActionsMenu.getByRole("button", {
      name: "Open transaction detail",
    }),
  ).toHaveCount(0);
  await expect(
    overdueActionsMenu.getByRole("button", { name: "Confirm occurrence" }),
  ).toBeVisible();
  await expect(
    overdueActionsMenu.getByRole("button", { name: "Dismiss occurrence" }),
  ).toBeVisible();
  await expect(
    overdueActionsMenu.getByRole("button", { name: "Defer" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(overdueActionsMenu).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 720 });
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(entryPanel).toBeVisible();
  await expect(dueRow).toHaveCount(0);
  await entryPanel
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await expect(entryPanel).toHaveCount(0);
  await page.setViewportSize({ width: 700, height: 720 });

  await page
    .getByRole("button", { name: "Edit Lifecycle Active, Expected · any of" })
    .click();
  const expectedRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === search &&
      transactionRequestHasFilters(url, {
        filter: "lifecycle:expected",
        limit: "50",
      })
    );
  });
  await page.getByRole("checkbox", { name: "Active" }).click();
  await expectedRequest;

  await expectTransactionFilterUrl(page, {
    filter: "lifecycle:expected",
    pageSize: "50",
    q: search,
  });
  await expect(page.getByText("Lifecycle Expected · any of")).toBeVisible();
  await expect(overdueRow).toBeVisible();
  await expect(dueRow).toBeVisible();
  await expect(ordinaryRow).toBeHidden();

  await page.getByRole("checkbox", { name: "Active" }).click();
  await expectTransactionFilterUrl(page, {
    filter: "(lifecycle:active or lifecycle:expected)",
    pageSize: "50",
    q: search,
  });
  await page.keyboard.press("Escape");
  await expect(ordinaryRow).toBeVisible();

  const featuredRow = page
    .getByTestId("featured-balance-row")
    .filter({ hasText: overdueFixture.checking.fqn.split(":").at(-1) ?? "" });
  await expect(featuredRow).toContainText("0.00 $");
  let accountingHistoryRangeRequested = false;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/accounting-history/range") {
      accountingHistoryRangeRequested = true;
    }
  });
  await clickRowAction(page, overdueRow, "Confirm occurrence");
  const confirmDialog = page.getByRole("alertdialog", {
    name: "Confirm occurrence",
  });
  const actualDateInput = confirmDialog.getByLabel("Actual date");
  await expect(actualDateInput).toHaveValue(overdueDate);
  expect(accountingHistoryRangeRequested).toBe(false);
  await expect(actualDateInput).toHaveCSS("border-top-width", "2px");
  await expect(actualDateInput).not.toHaveCSS("box-shadow", "none");
  const confirmOccurrenceButton = confirmDialog.getByRole("button", {
    name: "Confirm occurrence",
  });
  await actualDateInput.fill("");
  await expect(confirmDialog.getByText("Choose an actual date.")).toBeVisible();
  await expect(confirmOccurrenceButton).toBeDisabled();
  await confirmOccurrenceButton.locator("..").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Choose an actual date.");
  await page.mouse.move(0, 0);
  const actualDate = formatLocalDate(new Date());
  await actualDateInput.fill(actualDate);
  await expect(confirmOccurrenceButton).toBeEnabled();
  const confirmRequest = page.waitForRequest((request) =>
    /\/api\/recurring-occurrences\/\d+\/confirm$/.test(
      new URL(request.url()).pathname,
    ),
  );
  let markConfirmationRefreshStarted!: () => void;
  const confirmationRefreshStarted = new Promise<void>((resolve) => {
    markConfirmationRefreshStarted = resolve;
  });
  let releaseConfirmationRefresh!: () => void;
  const confirmationRefreshReleased = new Promise<void>((resolve) => {
    releaseConfirmationRefresh = resolve;
  });
  await page.route("**/api/transactions?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("search") !== search) {
      await route.continue();
      return;
    }
    markConfirmationRefreshStarted();
    await confirmationRefreshReleased;
    await route.continue();
  });
  await confirmOccurrenceButton.click();
  expect((await confirmRequest).postDataJSON()).toMatchObject({
    actual_date: actualDate,
  });
  await confirmationRefreshStarted;
  await expect(confirmDialog).toBeVisible();
  await expect(
    confirmDialog.getByRole("button", { name: "Confirming" }),
  ).toBeVisible();
  await expect(
    page.locator("tbody > tr").filter({
      hasText:
        overdueFixture.merchantFqn.split(":").at(-1) ?? "Overdue merchant",
    }),
  ).toBeVisible();
  releaseConfirmationRefresh();
  await expect(
    page.getByRole("status").filter({ hasText: "Occurrence confirmed." }),
  ).toBeVisible();
  await expect(overdueRow).toBeFocused();
  await expect(overdueRow.locator('[aria-label="Expected"]')).toHaveCount(0);
  await expect(
    overdueRow.getByText("-23.45 $", { exact: true }),
  ).not.toHaveClass(/text-muted-foreground/);
  await expect(featuredRow).toContainText("-23.45 $");

  await clickRowAction(page, dueRow, "Dismiss occurrence");
  const dismissDialog = page.getByRole("alertdialog", {
    name: "Dismiss occurrence",
  });
  await expect(dismissDialog).toContainText(
    dueFixture.merchantFqn.split(":").at(-1) ?? "Merchant",
  );
  await dismissDialog
    .getByRole("button", { name: "Dismiss occurrence" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Occurrence dismissed." }),
  ).toBeVisible();
  await expect(dueRow).toHaveCount(0);
  await page.reload();
  await expect(dueRow).toHaveCount(0);
});

test("transaction amount chips share one right edge across row variants", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const overdueFixture = await createExpectedRecurringFixture(
    page,
    `${unique}AmountAlignment`,
    {
      anchorDate: shiftLocalDate(formatLocalDate(new Date()), -1),
    },
  );
  const incomeAccount = await createAccount(
    page,
    `e2e:amount-alignment:${unique}:income`,
    "owned",
    "USD",
  );
  const incomeSource = await createAccount(
    page,
    `e2e:amount-alignment:${unique}:source`,
    "flow",
  );
  const incomeCategory = await createCategory(
    page,
    `E2E:AmountAlignment:${unique}:Income`,
    "income",
  );
  const ordinaryMemo = `E2E amount alignment ${unique} ordinary memo`;
  const mixedMemo = `E2E amount alignment ${unique} mixed`;
  let ordinaryTransaction: TransactionFixture | undefined;
  let mixedTransaction: TransactionFixture | undefined;

  try {
    const ordinaryResponse = await page.request.post(
      "/api/transactions/spend",
      {
        data: {
          amount: "34.56",
          category_id: overdueFixture.category.category_id,
          counterparty_account_id: overdueFixture.merchant.account_id,
          currency: "USD",
          funding_account_id: overdueFixture.checking.account_id,
          initiated_date: formatLocalDate(new Date()),
          memo: ordinaryMemo,
        },
      },
    );
    expect(ordinaryResponse.ok(), await ordinaryResponse.text()).toBe(true);
    ordinaryTransaction = (await ordinaryResponse.json()) as TransactionFixture;

    const mixedResponse = await page.request.post("/api/transactions", {
      data: {
        initiated_date: formatLocalDate(new Date()),
        records: [
          {
            account_id: overdueFixture.checking.account_id,
            amount: "-5.00",
            category_id: null,
            currency: "USD",
            memo: mixedMemo,
            settlement: { status: "posted" },
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: overdueFixture.merchant.account_id,
            amount: "5.00",
            category_id: overdueFixture.category.category_id,
            currency: "USD",
            memo: mixedMemo,
            settlement: null,
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: incomeAccount.account_id,
            amount: "100.00",
            category_id: null,
            currency: "USD",
            memo: mixedMemo,
            settlement: { status: "posted" },
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: incomeSource.account_id,
            amount: "-100.00",
            category_id: incomeCategory.category_id,
            currency: "USD",
            memo: mixedMemo,
            settlement: null,
            reconciliation_status: "unreconciled",
            source: "manual",
          },
        ],
      },
    });
    expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);
    mixedTransaction = (await mixedResponse.json()) as TransactionFixture;

    await page.goto(
      `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}&filter=${encodeURIComponent("(lifecycle:active or lifecycle:expected)")}`,
    );
    const ordinaryRow = page.getByRole("row").filter({ hasText: ordinaryMemo });
    const overdueRow = page
      .getByRole("row")
      .filter({
        hasText:
          overdueFixture.merchantFqn.split(":").at(-1) ?? "AmountAlignment",
      })
      .filter({ has: page.getByRole("img", { name: "Expected" }) });
    const mixedRow = page.getByRole("row").filter({ hasText: mixedMemo });

    await expect(
      overdueRow.getByRole("img", { name: "Overdue" }),
    ).toBeVisible();
    await expect(mixedRow.getByTestId("amount-chip")).toHaveCount(0);
    await expect(mixedRow.getByTestId("more-parts-indicator")).toBeVisible();

    for (const width of [1440, 700]) {
      await page.setViewportSize({ width, height: 720 });
      await expectAmountMarkerRightEdgesAligned([
        ordinaryRow,
        overdueRow,
        mixedRow,
      ]);
    }
  } finally {
    if (ordinaryTransaction) {
      await deleteTransaction(page, ordinaryTransaction);
    }
    if (mixedTransaction) {
      await deleteTransaction(page, mixedTransaction);
    }
  }
});

test("multi-part transaction rows show one honest amount or only the indicator", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `E2E mixed row rule ${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const wallet = findByFqn(accounts, "cash:Wallet");
  const joint = findByFqn(accounts, "bank:Chase:joint_checking");
  const merchant = findByFqn(accounts, "merchant:PowellsBooks");
  const incomeSource = findByFqn(accounts, "employers:Acme:salary");
  const party = findByFqn(accounts, "person:Friend:Jordan");
  const expenseCategory = findByFqn(categories, "Entertainment:Books");
  const incomeCategory = findByFqn(categories, "Income:Salary");
  const exchangeDestination = await createAccount(
    page,
    `cash:E2EMixedRowRule:${slug}${Date.now()}:EUR`,
    "owned",
    "EUR",
  );
  const initiatedDate = formatLocalDate(new Date());
  const simpleMemo = `${unique} simple`;
  const spendTransferMemo = `${unique} spend transfer`;
  const mixedMemo = `${unique} no primary`;
  const exchangeMemo = `${unique} exchange`;

  const simpleResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: expenseCategory.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: wallet.account_id,
      initiated_date: initiatedDate,
      memo: simpleMemo,
    },
  });
  expect(simpleResponse.ok(), await simpleResponse.text()).toBe(true);
  const simple = (await simpleResponse.json()) as TransactionFixture;

  const spendTransferResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: initiatedDate,
      records: [
        {
          account_id: wallet.account_id,
          amount: "-72.00",
          category_id: null,
          currency: "USD",
          memo: spendTransferMemo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: merchant.account_id,
          amount: "54.00",
          category_id: expenseCategory.category_id,
          currency: "USD",
          memo: spendTransferMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: party.account_id,
          amount: "18.00",
          category_id: null,
          currency: "USD",
          memo: spendTransferMemo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
        },
      ],
    },
  });
  expect(spendTransferResponse.ok(), await spendTransferResponse.text()).toBe(
    true,
  );
  const spendTransfer =
    (await spendTransferResponse.json()) as TransactionFixture;

  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: initiatedDate,
      records: [
        {
          account_id: wallet.account_id,
          amount: "-5.00",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: merchant.account_id,
          amount: "5.00",
          category_id: expenseCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: joint.account_id,
          amount: "100.00",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: incomeSource.account_id,
          amount: "-100.00",
          category_id: incomeCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
        },
      ],
    },
  });
  expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);
  const mixed = (await mixedResponse.json()) as TransactionFixture;

  const exchangeResponse = await page.request.post(
    "/api/transactions/exchange",
    {
      data: {
        bought_account_id: exchangeDestination.account_id,
        bought_amount: "100.00",
        initiated_date: initiatedDate,
        memo: exchangeMemo,
        sold_account_id: joint.account_id,
        sold_amount: "110.00",
      },
    },
  );
  expect(exchangeResponse.ok(), await exchangeResponse.text()).toBe(true);
  const exchange = (await exchangeResponse.json()) as TransactionFixture;

  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  await expect(page.getByText("Description")).toBeVisible();

  const transactionRow = (transaction: TransactionFixture) =>
    page.locator(
      `[data-transaction-row="true"][data-transaction-id="${transaction.transaction_id}"]`,
    );
  const simpleRow = transactionRow(simple);
  const spendTransferRow = transactionRow(spendTransfer);
  const mixedRow = transactionRow(mixed);
  const exchangeRow = transactionRow(exchange);
  const spendTransferAmountCell = spendTransferRow.locator(
    ".transactions-amount-column",
  );

  await expect(simpleRow).toBeVisible();
  await expect(spendTransferRow).toBeVisible();
  await expect(spendTransferAmountCell.getByTestId("amount-chip")).toHaveCount(
    1,
  );
  await expect(spendTransferAmountCell.getByTestId("amount-chip")).toHaveText(
    "-54.00 $",
  );
  await expect(spendTransferAmountCell.locator(":scope > div")).toHaveCSS(
    "overflow",
    "visible",
  );
  const [simpleAmountStyle, spendTransferAmountStyle] = await Promise.all([
    simpleRow.getByTestId("amount-chip").evaluate((chip) => {
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
    spendTransferAmountCell.getByTestId("amount-chip").evaluate((chip) => {
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
  expect(spendTransferAmountStyle).toEqual(simpleAmountStyle);
  expect(spendTransferAmountStyle.boxShadow).not.toBe("none");
  await expectAmountMarkerRightEdgesAligned([simpleRow, spendTransferRow]);
  const moreParts = spendTransferAmountCell.getByTestId("more-parts-indicator");
  await expect(moreParts).toHaveAttribute(
    "aria-label",
    "More transaction parts. All parts: -54.00 $, -18.00 $",
  );
  await expect(moreParts).toHaveText("+");
  expect(await moreParts.evaluate((indicator) => indicator.tabIndex)).toBe(-1);
  await expect(moreParts).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(moreParts).toHaveCSS("border-top-width", "0px");
  await expect(moreParts).toHaveCSS("box-shadow", "none");
  await moreParts.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "All parts: -54.00 $, -18.00 $",
  );

  const [simpleHeight, spendTransferHeight] = await Promise.all([
    simpleRow.evaluate((row) => row.getBoundingClientRect().height),
    spendTransferRow.evaluate((row) => row.getBoundingClientRect().height),
  ]);
  expect(Math.abs(simpleHeight - spendTransferHeight)).toBeLessThanOrEqual(1);

  await expect(mixedRow).toBeVisible();
  await expect(mixedRow.getByTestId("amount-chip")).toHaveCount(0);
  await expect(mixedRow.getByTestId("more-parts-indicator")).toHaveAttribute(
    "aria-label",
    /^More transaction parts\. All parts: /,
  );

  await expect(exchangeRow).toBeVisible();
  await expect(exchangeRow.getByTestId("amount-chip")).toHaveCount(1);
  await expect(exchangeRow.getByTestId("amount-chip")).toHaveText("-110.00 $");
  await expect(exchangeRow).not.toContainText("100.00 €");
  await expect(exchangeRow.getByTestId("more-parts-indicator")).toHaveCount(0);

  await activateTransactionRow(spendTransferRow);
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail).toBeVisible();
  await expect(
    detail.getByTestId("amount-chip").filter({ hasText: "-54.00 $" }),
  ).toBeVisible();
  await expect(
    detail.getByTestId("amount-chip").filter({ hasText: "-18.00 $" }),
  ).toBeVisible();

  await detail
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const railMoreParts = page
    .getByRole("dialog", { name: "Transaction editor" })
    .getByTestId("more-parts-indicator")
    .first();
  await expect(railMoreParts).toHaveText("+");
  await expect(railMoreParts).toHaveCSS("height", "16px");
  await expect(railMoreParts).toHaveCSS("border-top-width", "0px");
  await expect(railMoreParts).toHaveCSS("box-shadow", "none");
  expect(await railMoreParts.evaluate((indicator) => indicator.tabIndex)).toBe(
    -1,
  );
});

test("transactions class toolbar popover selects and clears multiple classes", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `E2E class filter ${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const wallet = findByFqn(accounts, "cash:Wallet");
  const merchant = findByFqn(accounts, "merchant:PowellsBooks");
  const joint = findByFqn(accounts, "bank:Chase:joint_checking");
  const payroll = findByFqn(accounts, "employers:Acme:salary");
  const books = findByFqn(categories, "Entertainment:Books");
  const salary = findByFqn(categories, "Income:Salary");
  const spendMemo = `${unique} spend`;
  const incomeMemo = `${unique} income`;

  const [spendResponse, incomeResponse] = await Promise.all([
    page.request.post("/api/transactions/spend", {
      data: {
        amount: "12.34",
        category_id: books.category_id,
        counterparty_account_id: merchant.account_id,
        currency: "USD",
        funding_account_id: wallet.account_id,
        initiated_date: "2026-05-31",
        memo: spendMemo,
      },
    }),
    page.request.post("/api/transactions/income", {
      data: {
        amount: "56.78",
        category_id: salary.category_id,
        currency: "USD",
        destination_account_id: joint.account_id,
        initiated_date: "2026-05-31",
        memo: incomeMemo,
        source_account_id: payroll.account_id,
      },
    }),
  ]);
  expect(spendResponse.ok()).toBe(true);
  expect(incomeResponse.ok()).toBe(true);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeVisible();

  const classFilter = page.locator("#transactions-class");
  await expect(classFilter).toHaveAccessibleName("Class: All classes");
  const spendRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        classes: ["spend"],
        filter: defaultTransactionBrowserFilter,
        limit: "50",
      })
    );
  });
  await classFilter.click();
  const classPopover = page.getByRole("dialog", {
    name: "Transaction classes",
  });
  await expect(classPopover).toBeVisible();
  await expect(classPopover).toHaveClass(/border-\[var\(--border-ink\)\]/);
  const spendCheckbox = classPopover.getByRole("checkbox", { name: "Spend" });
  const incomeCheckbox = classPopover.getByRole("checkbox", {
    name: "Income",
  });
  await spendCheckbox.click();
  await spendRequest;
  await expectTransactionFilterUrl(page, {
    classes: ["spend"],
    filter: null,
    pageSize: "50",
    q: unique,
  });
  await expect(spendCheckbox).toBeChecked();
  await expect(incomeCheckbox).not.toBeChecked();

  const multiClassRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        classes: ["spend", "income"],
        filter: defaultTransactionBrowserFilter,
        limit: "50",
      })
    );
  });
  await incomeCheckbox.click();
  await multiClassRequest;
  await expect(classPopover).toBeVisible();
  await expectTransactionFilterUrl(page, {
    classes: ["spend", "income"],
    filter: null,
    pageSize: "50",
    q: unique,
  });
  await expect(spendCheckbox).toBeChecked();
  await expect(incomeCheckbox).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(classPopover).toBeHidden();
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeVisible();

  const reloadRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        classes: ["spend", "income"],
        filter: defaultTransactionBrowserFilter,
        limit: "50",
      })
    );
  });
  await page.reload();
  await reloadRequest;
  await expect(classFilter).toHaveAccessibleName("Class: Spend, Income");
  await classFilter.click();
  await expect(spendCheckbox).toBeChecked();
  await expect(incomeCheckbox).toBeChecked();

  const incomeOnlyRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        classes: ["income"],
        filter: defaultTransactionBrowserFilter,
        limit: "50",
      })
    );
  });
  await spendCheckbox.click();
  await incomeOnlyRequest;
  await expect(classFilter).toContainText("Income");
  await expectTransactionFilterUrl(page, {
    classes: ["income"],
    filter: null,
    pageSize: "50",
    q: unique,
  });
  await expect(spendCheckbox).not.toBeChecked();
  await expect(incomeCheckbox).toBeChecked();

  const allClassesRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        filter: defaultTransactionBrowserFilter,
        limit: "50",
      })
    );
  });
  await incomeCheckbox.click();
  await allClassesRequest;
  await expect(classFilter).toContainText("All classes");
  await expectTransactionFilterUrl(page, {
    filter: null,
    pageSize: "50",
    q: unique,
  });
  await expect(spendCheckbox).not.toBeChecked();
  await expect(incomeCheckbox).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(classPopover).toBeHidden();
  await expect(classFilter).toHaveAccessibleName("Class: All classes");
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeVisible();

  await page.goBack();
  await expect(classFilter).toHaveAccessibleName("Class: Income");
  await expectTransactionFilterUrl(page, {
    classes: ["income"],
    filter: null,
    pageSize: "50",
    q: unique,
  });
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeHidden();
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeVisible();
  await page.goForward();
  await expect(classFilter).toHaveAccessibleName("Class: All classes");
  await expectTransactionFilterUrl(page, {
    filter: null,
    pageSize: "50",
    q: unique,
  });
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await expect(
    page.getByRole("button", { exact: true, name: "Transaction class" }),
  ).toBeVisible();
});

test("transactions filter toolbar keeps a stable inline trigger geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const toolbarRow = page.getByTestId("transaction-browser-toolbar-row");
  const filterToggle = page.getByRole("button", { name: "Open filters" });
  const dateJumpInput = page.getByLabel("Go to day");
  const previousDayButton = page.getByRole("button", {
    name: "Previous day",
  });
  const nextDayButton = page.getByRole("button", { name: "Next day" });
  const initialTriggerBox = await filterToggle.boundingBox();
  const initialToolbarRowBox = await toolbarRow.boundingBox();
  const dateJumpInputBox = await dateJumpInput.boundingBox();
  const previousDayButtonBox = await previousDayButton.boundingBox();
  const nextDayButtonBox = await nextDayButton.boundingBox();
  expect(initialTriggerBox).not.toBeNull();
  expect(initialToolbarRowBox).not.toBeNull();
  expect(dateJumpInputBox).not.toBeNull();
  expect(previousDayButtonBox).not.toBeNull();
  expect(nextDayButtonBox).not.toBeNull();
  expect(initialTriggerBox?.width).toBe(36);
  expect(initialTriggerBox?.height).toBe(36);
  expect(previousDayButtonBox?.width).toBe(36);
  expect(previousDayButtonBox?.height).toBe(36);
  expect(nextDayButtonBox?.width).toBe(36);
  expect(nextDayButtonBox?.height).toBe(36);
  expect(previousDayButtonBox?.y).toBe(dateJumpInputBox?.y);
  expect(nextDayButtonBox?.y).toBe(dateJumpInputBox?.y);

  await filterToggle.focus();
  await page.keyboard.press("Enter");
  const closeFilterButton = page.getByRole("button", {
    name: "Close filters",
  });
  const openedTriggerBox = await closeFilterButton.boundingBox();
  const openedToolbarRowBox = await toolbarRow.boundingBox();
  expect(openedTriggerBox).not.toBeNull();
  expect(openedToolbarRowBox).not.toBeNull();
  expect(openedTriggerBox).toEqual(initialTriggerBox);
  expect(openedToolbarRowBox?.height).toBe(initialToolbarRowBox?.height);
  await page.goto(
    `/transactions?page=1&pageSize=50&filter=${encodeURIComponent("not settlement:pending")}`,
  );

  const settlementChip = page.getByText("Settlement Pending · none of", {
    exact: true,
  });
  await expect(settlementChip).toBeVisible();
  await page.keyboard.press("Escape");
  const triggerWithChipBox = await closeFilterButton.boundingBox();
  const chipBox = await settlementChip.boundingBox();
  const toolbarWithChipBox = await toolbarRow.boundingBox();
  const filterBarBox = await page
    .getByTestId("transaction-browser-filter-bar")
    .boundingBox();
  expect(triggerWithChipBox).not.toBeNull();
  expect(chipBox).not.toBeNull();
  expect(toolbarWithChipBox).not.toBeNull();
  expect(filterBarBox).not.toBeNull();
  expect(triggerWithChipBox?.x).toBe(initialTriggerBox?.x);
  expect(triggerWithChipBox?.y).toBe(initialTriggerBox?.y);
  expect(toolbarWithChipBox?.height).toBe(initialToolbarRowBox?.height);
  expect(chipBox?.y ?? 0).toBeGreaterThan(filterBarBox?.y ?? 0);
  expect((chipBox?.y ?? 0) + (chipBox?.height ?? 0)).toBeLessThan(
    (filterBarBox?.y ?? 0) + (filterBarBox?.height ?? 0),
  );

  const removeStatusButton = page.getByRole("button", {
    name: "Remove Settlement Pending",
  });
  await removeStatusButton.press("Enter");
  await expect(settlementChip).toBeHidden();
  const finalTriggerBox = await closeFilterButton.boundingBox();
  const finalToolbarBox = await toolbarRow.boundingBox();
  expect(finalTriggerBox).not.toBeNull();
  expect(finalToolbarBox).not.toBeNull();
  expect(finalTriggerBox?.x).toBe(initialTriggerBox?.x);
  expect(finalTriggerBox?.y).toBe(initialTriggerBox?.y);
  expect(finalToolbarBox?.height).toBe(initialToolbarRowBox?.height);
});

test("transactions filter toolbar suppresses open-control tooltips and supports Tab traversal", async ({
  page,
}, testInfo) => {
  await page.goto("/transactions?page=1&pageSize=50");
  const searchInput = page.getByRole("searchbox", { name: "Search" });
  const previousDayButton = page.getByRole("button", {
    name: "Previous day",
  });
  const dateJumpInput = page.getByLabel("Go to day");
  const nextDayButton = page.getByRole("button", { name: "Next day" });
  const todayButton = page.getByRole("button", { name: "Today" });
  const sortMenu = page.getByRole("button", { name: /^Sort transactions:/ });
  const classFilter = page.getByLabel("Class");
  const amountDisplayToggle = page.getByTestId(
    "transaction-amount-display-toggle",
  );
  const editModeButton = page.getByRole("button", { name: "Edit mode" });
  const filterToggle = page.getByRole("button", { name: "Open filters" });
  const filterTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Open filters" });
  const sortTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Sort transactions" });
  const classTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "All classes" });
  const tabTo = async (target: Locator) => {
    await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
  };

  await filterToggle.hover();
  await expect(filterTooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(filterTooltip).toBeHidden();

  await sortMenu.hover();
  await expect(sortTooltip).toBeVisible();
  await sortMenu.click();
  const sortPopover = page.locator('[data-slot="popover-content"]');
  await expect(sortPopover).toBeVisible();
  await sortMenu.hover();
  await expect(sortTooltip).toBeHidden();
  await page.mouse.move(0, 0);
  await page.keyboard.press("Escape");
  await expect(sortPopover).toBeHidden();
  await expect(sortMenu).toBeFocused();
  await expect(sortTooltip).toBeHidden();

  await classFilter.focus();
  await page.keyboard.press("Enter");
  const classPopover = page.getByRole("dialog", {
    name: "Transaction classes",
  });
  await expect(classPopover).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(classPopover).toBeHidden();
  await expect(classFilter).toBeFocused();
  await expect(classTooltip).toBeHidden();

  const transactionsHeading = page.locator("main h1").filter({
    hasText: "Transactions",
  });
  await page.keyboard.press("Enter");
  await expect(classPopover).toBeVisible();
  const transactionsHeadingBox = await transactionsHeading.boundingBox();
  expect(transactionsHeadingBox).not.toBeNull();
  await page.mouse.click(
    transactionsHeadingBox!.x + transactionsHeadingBox!.width / 2,
    transactionsHeadingBox!.y + transactionsHeadingBox!.height / 2,
  );
  await expect(classPopover).toBeHidden();
  await expect(classFilter).toBeFocused();
  await expect(classTooltip).toBeHidden();

  await sortMenu.click();
  await expect(sortPopover).toBeVisible();
  const refreshedTransactionsHeadingBox =
    await transactionsHeading.boundingBox();
  expect(refreshedTransactionsHeadingBox).not.toBeNull();
  await page.mouse.click(
    refreshedTransactionsHeadingBox!.x +
      refreshedTransactionsHeadingBox!.width / 2,
    refreshedTransactionsHeadingBox!.y +
      refreshedTransactionsHeadingBox!.height / 2,
  );
  await expect(sortPopover).toBeHidden();
  await expect(sortMenu).toBeFocused();

  await sortMenu.click();
  await expect(sortPopover).toBeVisible();
  await amountDisplayToggle.click();
  await expect(sortPopover).toBeHidden();
  await expect(amountDisplayToggle).toBeFocused();
  await expect(amountDisplayToggle).toHaveAttribute("aria-pressed", "true");
  await amountDisplayToggle.press("Space");
  await expect(amountDisplayToggle).toHaveAttribute("aria-pressed", "false");
  await expect(sortPopover).toBeHidden();

  if (testInfo.project.name === "webkit") {
    await filterToggle.click();
    await expect(
      page.getByTestId("transaction-browser-filter-bar"),
    ).toBeVisible();
    const addFilterButton = page.getByRole("button", { name: "Add filter" });
    const addFilterTooltip = page
      .getByRole("tooltip")
      .filter({ hasText: "Add filter" });
    await addFilterButton.hover();
    await expect(addFilterTooltip).toBeVisible();
    await addFilterButton.click();
    await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();
    await addFilterButton.hover();
    await page.waitForTimeout(200);
    await expect(addFilterTooltip).toBeHidden();
    return;
  }

  await searchInput.focus();
  await searchInput.press("Tab");
  await expect(previousDayButton).toBeFocused();
  await tabTo(dateJumpInput);
  await nextDayButton.focus();
  await expect(nextDayButton).toBeFocused();
  await tabTo(todayButton);
  await tabTo(classFilter);
  await tabTo(sortMenu);
  await tabTo(amountDisplayToggle);
  await tabTo(editModeButton);
  await tabTo(filterToggle);
  await expect(filterTooltip).toBeVisible();
  await page.keyboard.press("Enter");

  const closeFilterButton = page.getByRole("button", {
    name: "Close filters",
  });
  await expect(
    page.getByTestId("transaction-browser-filter-bar"),
  ).toBeVisible();
  await closeFilterButton.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Close filters" }),
  ).toBeVisible();

  await page.keyboard.press("Tab");
  const addFilterButton = page.getByRole("button", { name: "Add filter" });
  await expect(addFilterButton).toBeFocused();
  const addFilterTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Add filter" });
  await addFilterButton.hover();
  await expect(addFilterTooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(addFilterTooltip).toBeHidden();
  await addFilterButton.click();
  await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();
  await addFilterButton.hover();
  await page.waitForTimeout(200);
  await expect(addFilterTooltip).toBeHidden();
});

test("filter X dismiss clears chips while retaining standing search and class filters", async ({
  page,
}) => {
  const categories = await listFixtures<CategoryFixture>(
    page,
    "/api/categories",
    "categories",
  );
  const category = findByFqn(categories, "Entertainment:Books");
  const search = "E2E X dismiss standing controls";

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}&class=spend&filter=${encodeURIComponent(`category:"${category.fqn}"`)}`,
  );

  await expect(
    page.getByTestId("transaction-browser-filter-bar"),
  ).toBeVisible();
  await expect(
    page.getByText(`Category ${category.display_label}`),
  ).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    search,
  );
  await expect(page.getByLabel("Class")).toHaveText("Spend");
  await page.getByRole("button", { name: "Close filters" }).click();

  await expect(page.getByTestId("transaction-browser-filter-bar")).toBeHidden();
  await expectTransactionFilterUrl(page, {
    classes: ["spend"],
    filter: null,
    pageSize: "50",
    q: search,
  });
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    search,
  );
  await expect(page.getByLabel("Class")).toHaveText("Spend");
  await expect(
    page.getByRole("button", { name: "Open filters" }),
  ).toBeVisible();
});

test("transaction entity chips add filters in place", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = await createCategory(
    page,
    `E2E:ChipFilter:${unique}:Category*One`,
    "expense",
  );
  const alternateCategory = await createCategory(
    page,
    `E2E:ChipFilter:${unique}:CategoryTwo`,
    "expense",
  );
  const tag = await createTag(page, `E2E:ChipFilter:${unique}:DetailTag`);
  const member = await createMember(page, `Chip ${unique}`);
  const searchQuery = `E2E chip filter ${unique}`;
  const memo = `${searchQuery} target`;
  const alternateMemo = `${searchQuery} alternate`;

  const targetResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "21.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-04-01",
      member_id: member.member_id,
      memo,
      tag_ids: [tag.tag_id],
    },
  });
  expect(targetResponse.ok()).toBe(true);
  const target = (await targetResponse.json()) as TransactionFixture;
  const alternateResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "22.45",
      category_id: alternateCategory.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-04-01",
      memo: alternateMemo,
    },
  });
  expect(alternateResponse.ok()).toBe(true);

  await page.goto(
    `/transactions?q=${encodeURIComponent(searchQuery)}&page=1&pageSize=50`,
  );
  await expect(page.getByText("Description")).toBeVisible();
  const targetRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(targetRow).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: alternateMemo }).first(),
  ).toBeVisible();

  const memberChip = targetRow.getByRole("button", {
    name: `Filter by ${member.name}`,
  });
  await expect(memberChip).toBeVisible();
  await expect(memberChip).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(memberChip).toHaveCSS("color", "rgb(15, 13, 22)");
  await memberChip.click();
  await expectTransactionFilterUrl(page, {
    filter: `member:"${member.name}"`,
    pageSize: "50",
    q: searchQuery,
  });
  await expect(
    page.getByTestId("transaction-browser-filter-bar"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close filters" }),
  ).toBeVisible();
  await expect(page.getByText(`Member ${member.name}`)).toBeVisible();
  await page
    .getByRole("button", { name: `Remove Member ${member.name}` })
    .click();
  await expectTransactionFilterUrl(page, {
    filter: null,
    pageSize: "50",
    q: searchQuery,
  });

  const renamedCategoryFqn = `E2E:ChipFilterRenamed:${unique}:Category*One`;
  const renameResponse = await page.request.post(
    "/api/categories/restructure",
    {
      data: {
        from_fqn: category.fqn,
        to_fqn: renamedCategoryFqn,
      },
    },
  );
  expect(renameResponse.ok(), await renameResponse.text()).toBe(true);

  await targetRow
    .getByRole("button", { name: `Filter by ${category.name}` })
    .click();
  await expectTransactionFilterUrl(page, {
    filter: `category:"${renamedCategoryFqn}"`,
    pageSize: "50",
    q: searchQuery,
  });
  await expect(page.getByText(`Category ${renamedCategoryFqn}`)).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: alternateMemo }),
  ).toBeHidden();

  await targetRow
    .getByRole("button", { name: `Filter by ${tag.name}` })
    .first()
    .click();
  await expectTransactionFilterUrl(page, {
    filter: `(category:"${renamedCategoryFqn}" and tag:"${tag.fqn}")`,
    pageSize: "50",
    q: searchQuery,
  });
  await expect(page.getByText(`Tag ${pickerSelectedLabel(tag)}`)).toBeVisible();

  await activateTransactionRow(targetRow);
  const panel = page.getByRole("dialog", { name: target.display_title });
  await expect(panel).toBeVisible();
});

test("transactions sidebar restores the last-used transactions URL state", async ({
  page,
}) => {
  await page.goto(
    `/transactions?page=2&pageSize=25&q=Target&filter=${encodeURIComponent("(currency:USD and settlement:posted)")}`,
  );
  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    "Target",
  );
  await expectTransactionFilterUrl(page, {
    filter: "(currency:USD and settlement:posted)",
    page: "2",
    pageSize: "25",
    q: "Target",
  });

  await page.getByRole("link", { name: "Status" }).click();
  await expect(
    page.getByRole("heading", { exact: true, name: "Status" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    "Target",
  );
  await expectTransactionFilterUrl(page, {
    filter: "(currency:USD and settlement:posted)",
    page: "2",
    pageSize: "25",
    q: "Target",
  });
});

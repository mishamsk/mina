import { test } from "@tests/e2e/test";
import {
  createAccount,
  createCategory,
  expect,
  expectTransactionsPageUrl,
  formatLocalDate,
  shiftLocalDate,
  type TransactionListFixture,
} from "@tests/e2e/transactions/support";

test("future date navigation displays future active and expected transactions", async ({
  page,
}, testInfo) => {
  const unique = `44a1-${testInfo.workerIndex}-${Date.now()}`;
  const futureDate = shiftLocalDate(formatLocalDate(new Date()), 730);
  const futureActiveDate = shiftLocalDate(futureDate, -1);
  const activeMemo = `Future active ${unique}`;
  const oldestActiveMemo = `${activeMemo} 0`;
  const expectedMemo = `Future expected ${unique}`;
  const checking = await createAccount(
    page,
    `e2e:FuturePosition:${unique}:Checking`,
    "owned",
    "USD",
  );
  const merchant = await createAccount(
    page,
    `e2e:FuturePosition:${unique}:Merchant`,
    "flow",
  );
  const category = await createCategory(
    page,
    `e2e:FuturePosition:${unique}:Category`,
    "expense",
  );

  for (let index = 0; index < 25; index += 1) {
    const futureTransaction = await page.request.post(
      "/api/transactions/spend",
      {
        data: {
          amount: "17.25000000",
          category_id: category.category_id,
          counterparty_account_id: merchant.account_id,
          currency: "USD",
          funding_account_id: checking.account_id,
          initiated_date: futureActiveDate,
          memo: `${activeMemo} ${String(index)}`,
        },
      },
    );
    expect(futureTransaction.ok(), await futureTransaction.text()).toBe(true);
  }

  const recurringDefinition = await page.request.post(
    "/api/recurring-definitions",
    {
      data: {
        anchor_date: futureDate,
        fqn: `E2E:FuturePosition:${unique}`,
        schedule_rule: {
          every: 1,
          kind: "interval",
          unit: "YEAR",
          version: 1,
        },
        records: [
          {
            account_id: checking.account_id,
            amount: "-23.45000000",
            category_id: null,
            currency: "USD",
            memo: expectedMemo,
            tag_ids: [],
          },
          {
            account_id: merchant.account_id,
            amount: "23.45000000",
            category_id: category.category_id,
            currency: "USD",
            memo: expectedMemo,
            tag_ids: [],
          },
          {
            account_id: checking.account_id,
            amount: "-11.00000000",
            category_id: null,
            currency: "USD",
            memo: expectedMemo,
            tag_ids: [],
          },
          {
            account_id: merchant.account_id,
            amount: "11.00000000",
            category_id: category.category_id,
            currency: "USD",
            memo: expectedMemo,
            tag_ids: [],
          },
        ],
      },
    },
  );
  expect(recurringDefinition.ok(), await recurringDefinition.text()).toBe(true);
  const recurringDefinitionBody = (await recurringDefinition.json()) as {
    recurring_definition_id: number;
  };

  const filteredTransactionsURL = `/transactions?page=1&pageSize=25&category=${String(category.category_id)}`;
  await page.goto(filteredTransactionsURL);
  await expect(
    page.locator("tbody > tr[data-transaction-id]").first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Lifecycle" }).click();
  const initialExpectedRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.getAll("lifecycle_status").includes("expected")
    );
  });
  await page.getByText("Expected", { exact: true }).click();
  await initialExpectedRequest;
  await expect(page.getByText(expectedMemo)).toHaveCount(0);
  await page.getByRole("button", { name: "Remove Lifecycle Expected" }).click();
  await expect(
    page.getByRole("button", { name: "Remove Lifecycle Expected" }),
  ).toHaveCount(0);
  await page.goto(filteredTransactionsURL);
  await expect(
    page.locator("tbody > tr[data-transaction-id]").first(),
  ).toBeVisible();

  const anchorResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === futureDate
    );
  });
  await page.getByLabel("Go to day").fill(futureDate);
  expect((await anchorResponse).ok()).toBe(true);

  const transactionRows = page.locator("tbody > tr[data-transaction-id]");
  const expectedRow = transactionRows.filter({ hasText: expectedMemo });
  await expect(expectedRow).toBeVisible();
  await expect(
    expectedRow.getByRole("img", { name: "Expected" }),
  ).toBeVisible();
  await expect(expectedRow).toHaveAttribute(
    "data-recurring-projection",
    "true",
  );
  await expect(expectedRow).not.toHaveAttribute("aria-disabled");
  await expect(expectedRow.locator(".row-actions")).toHaveAttribute(
    "data-row-actions-count",
    "1",
  );
  await expect(
    expectedRow.getByRole("button", { name: "Defer" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`[?&]anchor_date=${futureDate}(?:&|$)`),
  );
  const reloadAnchorResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === futureDate
    );
  });
  await page.reload();
  expect((await reloadAnchorResponse).ok()).toBe(true);
  await expect(expectedRow).toBeVisible();
  await expect(page.getByLabel("Go to day")).toHaveValue(futureDate);
  await expectedRow.click();
  const projectedDetail = page.getByTestId("transaction-detail-panel");
  await expect(projectedDetail).toBeVisible();
  await expect(
    projectedDetail
      .getByTestId("transaction-detail-records-table")
      .locator("tbody > tr"),
  ).toHaveCount(4);
  await expect(projectedDetail).toContainText("23.45");
  await expect(projectedDetail).toContainText("11.00");
  await expect(
    projectedDetail.getByRole("button", { name: "Confirm occurrence" }),
  ).toHaveCount(0);
  await expect(
    projectedDetail.getByRole("button", { name: "Defer" }),
  ).toBeVisible();
  await page.goBack();
  await expect(projectedDetail).toBeHidden();

  await expectedRow.click();
  await expect(projectedDetail).toContainText(expectedMemo);
  await page.keyboard.press("Control+K");
  const commandPalette = page.getByRole("dialog", { name: "Command Palette" });
  await expect(commandPalette).toBeVisible();
  const transactionSearchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === oldestActiveMemo
    );
  });
  await commandPalette
    .getByRole("combobox", { name: "Command search" })
    .fill(`'${oldestActiveMemo}`);
  await transactionSearchRequest;
  await commandPalette
    .getByRole("option")
    .filter({ hasText: oldestActiveMemo })
    .click();
  await expect(projectedDetail).toContainText(oldestActiveMemo);
  await expect(projectedDetail).not.toContainText(expectedMemo);
  await expect(page).toHaveURL(/[?&]transaction=\d+(?:&|$)/);
  await projectedDetail.getByRole("button", { name: "Close" }).click();

  let failNextPage = true;
  await page.route("**/api/transactions**", async (route) => {
    const url = new URL(route.request().url());
    if (
      failNextPage &&
      url.searchParams.get("anchor_date") === futureDate &&
      url.searchParams.get("offset") === "25"
    ) {
      await route.fulfill({
        body: JSON.stringify({
          error: { code: "internal_error", message: "Anchored page failed." },
        }),
        contentType: "application/json",
        status: 500,
      });
      return;
    }
    await route.continue();
  });
  const failedNextPageResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === futureDate &&
      url.searchParams.get("offset") === "25" &&
      response.status() === 500
    );
  });
  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await failedNextPageResponse;
  const anchoredPageError = page.getByRole("alert").filter({
    hasText: "Anchored page failed.",
  });
  await expect(anchoredPageError).toBeVisible();

  failNextPage = false;
  const nextPageResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === futureDate &&
      url.searchParams.get("offset") === "25"
    );
  });
  await anchoredPageError.getByRole("button", { name: "Retry" }).click();
  expect((await nextPageResponse).ok()).toBe(true);
  await page.unroute("**/api/transactions**");
  await expect(
    transactionRows.filter({ hasText: oldestActiveMemo }),
  ).toBeVisible();

  const occurrences = await page.request.get(
    `/api/recurring-occurrences?recurring_definition_id=${String(recurringDefinitionBody.recurring_definition_id)}`,
  );
  expect(occurrences.ok(), await occurrences.text()).toBe(true);
  const occurrencesBody = (await occurrences.json()) as {
    recurring_occurrences: unknown[];
  };
  expect(occurrencesBody.recurring_occurrences).toEqual([]);
});

test("only the next recurring projection can be deferred", async ({
  page,
}, testInfo) => {
  const unique = `next-projection-${testInfo.workerIndex}-${Date.now()}`;
  const tomorrow = shiftLocalDate(formatLocalDate(new Date()), 1);
  const futureDate = shiftLocalDate(tomorrow, 9);
  const checking = await createAccount(
    page,
    `e2e:ProjectionDefer:${unique}:Checking`,
    "owned",
    "USD",
  );
  const merchant = await createAccount(
    page,
    `e2e:ProjectionDefer:${unique}:Merchant`,
    "flow",
  );
  const category = await createCategory(
    page,
    `e2e:ProjectionDefer:${unique}:Category`,
    "expense",
  );
  const definitionResponse = await page.request.post(
    "/api/recurring-definitions",
    {
      data: {
        anchor_date: tomorrow,
        fqn: `E2E:ProjectionDefer:${unique}`,
        schedule_rule: {
          every: 1,
          kind: "interval",
          unit: "DAY",
          version: 1,
        },
        records: [
          {
            account_id: checking.account_id,
            amount: "-8.75000000",
            category_id: null,
            currency: "USD",
            memo: `Projection defer funding ${unique}`,
            tag_ids: [],
          },
          {
            account_id: merchant.account_id,
            amount: "8.75000000",
            category_id: category.category_id,
            currency: "USD",
            memo: `Projection defer merchant ${unique}`,
            tag_ids: [],
          },
        ],
      },
    },
  );
  expect(definitionResponse.ok(), await definitionResponse.text()).toBe(true);
  const definition = (await definitionResponse.json()) as {
    recurring_definition_id: number;
  };

  await page.goto(
    `/transactions?page=1&pageSize=25&category=${String(category.category_id)}`,
  );
  const anchoredResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === futureDate &&
      response.ok()
    );
  });
  await page.getByLabel("Go to day").fill(futureDate);
  const anchoredBody = (await (
    await anchoredResponse
  ).json()) as TransactionListFixture;
  const projections = anchoredBody.transactions.filter(
    (transaction) =>
      transaction.recurring_projection_definition_id ===
      definition.recurring_definition_id,
  );
  const nextProjections = projections.filter(
    (transaction) => transaction.recurring_projection_is_next === true,
  );
  const laterProjections = projections.filter(
    (transaction) => transaction.recurring_projection_is_next === false,
  );
  expect(nextProjections).toHaveLength(1);
  expect(laterProjections.length).toBeGreaterThan(0);
  const nextProjection = nextProjections[0];
  if (!nextProjection) throw new Error("Expected a next projection");
  const nextRow = page.locator(
    `tbody > tr[data-transaction-id="${String(nextProjection.transaction_id)}"]`,
  );
  await expect(nextRow).toBeVisible();
  await expect(nextRow.locator(".row-actions")).toHaveAttribute(
    "data-row-actions-count",
    "1",
  );
  await expect(nextRow.getByRole("button", { name: "Defer" })).toBeVisible();

  for (const projection of laterProjections) {
    const row = page.locator(
      `tbody > tr[data-transaction-id="${String(projection.transaction_id)}"]`,
    );
    await expect(row.getByRole("button", { name: "Defer" })).toHaveCount(0);
  }

  await nextRow.click();
  const nextProjectionDetail = page.getByTestId("transaction-detail-panel");
  const detailDeferButton = nextProjectionDetail.getByRole("button", {
    exact: true,
    name: "Defer",
  });
  const definitionPath = `/api/recurring-definitions/${String(definition.recurring_definition_id)}`;
  let releaseDefinitionLoad: (() => void) | undefined;
  const definitionLoadHeld = new Promise<void>((resolve) => {
    releaseDefinitionLoad = resolve;
  });
  await page.route(
    `**${definitionPath}`,
    async (route) => {
      await definitionLoadHeld;
      try {
        await route.continue();
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("already handled")
        ) {
          throw error;
        }
      }
    },
    { times: 1 },
  );
  await detailDeferButton.click();
  const loadingDeferDialog = page.getByRole("alertdialog", {
    name: "Defer next occurrence",
  });
  const loadingCancel = loadingDeferDialog.getByRole("button", {
    name: "Cancel",
  });
  await expect(loadingCancel).toBeEnabled();
  await loadingCancel.focus();
  await loadingDeferDialog
    .getByRole("button", { name: "Defer definition" })
    .locator("..")
    .hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Wait for the recurring definition to load.",
  );
  await page.mouse.move(0, 0);
  const loadingDialogBounds = await loadingDeferDialog.boundingBox();
  releaseDefinitionLoad?.();
  await expect(loadingDeferDialog.getByLabel("Offset")).toBeVisible();
  await expect(loadingCancel).toBeFocused();
  expect(await loadingDeferDialog.boundingBox()).toEqual(loadingDialogBounds);
  await expect(
    loadingDeferDialog.getByRole("button", { name: "Defer definition" }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(detailDeferButton).toBeFocused();

  const removedProjection = laterProjections.find(
    (projection) => projection.initiated_date === shiftLocalDate(tomorrow, 1),
  );
  if (!removedProjection) throw new Error("Expected the D+2 projection");
  const removedRow = page.locator(
    `tbody > tr[data-transaction-id="${String(removedProjection.transaction_id)}"]`,
  );
  await removedRow.evaluate((row: HTMLTableRowElement) => row.click());
  const removedDetail = page.getByTestId("transaction-detail-panel");
  await expect(removedDetail).toHaveAttribute(
    "data-source-transaction-id",
    String(removedProjection.transaction_id),
  );

  await nextRow
    .getByRole("button", { name: "Defer" })
    .evaluate((button: HTMLButtonElement) => button.click());
  const deferDialog = page.getByRole("alertdialog", {
    name: "Defer next occurrence",
  });
  await expect(deferDialog).toBeVisible();
  await expect(deferDialog.getByLabel("Offset")).toHaveValue("1");
  await deferDialog.getByLabel("Offset").fill("2");
  const deferResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(
      `/api/recurring-definitions/${String(definition.recurring_definition_id)}/defer`,
    ),
  );
  const refreshedResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === futureDate &&
      response.ok()
    );
  });
  let markProjectionRefreshStarted!: () => void;
  const projectionRefreshStarted = new Promise<void>((resolve) => {
    markProjectionRefreshStarted = resolve;
  });
  let releaseProjectionRefresh!: () => void;
  const projectionRefreshReleased = new Promise<void>((resolve) => {
    releaseProjectionRefresh = resolve;
  });
  await page.route("**/api/transactions?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("anchor_date") !== futureDate) {
      await route.continue();
      return;
    }
    markProjectionRefreshStarted();
    await projectionRefreshReleased;
    await route.continue();
  });
  await deferDialog.getByRole("button", { name: "Defer definition" }).click();
  expect((await deferResponse).ok()).toBe(true);
  await projectionRefreshStarted;
  await expect(deferDialog).toBeVisible();
  await expect(
    deferDialog.getByRole("button", { name: "Deferring" }),
  ).toBeVisible();
  await expect(nextRow).toBeVisible();
  releaseProjectionRefresh();
  const refreshedBody = (await (
    await refreshedResponse
  ).json()) as TransactionListFixture;
  const refreshedNext = refreshedBody.transactions.filter(
    (transaction) =>
      transaction.recurring_projection_definition_id ===
        definition.recurring_definition_id &&
      transaction.recurring_projection_is_next === true,
  );
  expect(refreshedNext).toHaveLength(1);
  expect(refreshedNext[0]?.initiated_date).toBe(shiftLocalDate(tomorrow, 2));
  expect(
    refreshedBody.transactions.some(
      (transaction) =>
        transaction.transaction_id === removedProjection.transaction_id,
    ),
  ).toBe(false);
  await expect(
    page.getByRole("status").filter({ hasText: "Next occurrence deferred." }),
  ).toBeVisible();
  await expect(removedDetail).toHaveCount(0);
  const refreshedNextRow = page.locator(
    `tbody > tr[data-transaction-id="${String(refreshedNext[0]?.transaction_id)}"]`,
  );
  await expect(
    refreshedNextRow.getByRole("button", { name: "Defer" }),
  ).toBeVisible();
  await expect(refreshedNextRow).toBeFocused();
});

test("failed future date navigation can retry the retained page", async ({
  page,
}) => {
  const failedDate = shiftLocalDate(formatLocalDate(new Date()), 365);
  await page.goto("/transactions?page=1&pageSize=25");
  await expect(
    page.locator("tbody > tr[data-transaction-id]").first(),
  ).toBeVisible();

  await page.route("**/api/transactions**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("anchor_date") === failedDate) {
      await route.fulfill({
        body: JSON.stringify({
          error: { code: "internal_error", message: "Date jump failed." },
        }),
        contentType: "application/json",
        status: 500,
      });
      return;
    }
    await route.continue();
  });

  await page.getByLabel("Go to day").fill(failedDate);
  const staleAlert = page.getByRole("alert").filter({
    hasText: "Transactions may be stale.",
  });
  await expect(staleAlert).toBeVisible();

  const retryResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === null &&
      url.searchParams.get("offset") === "0"
    );
  });
  await staleAlert.getByRole("button", { name: "Retry" }).click();
  expect((await retryResponse).ok()).toBe(true);
  await expect(staleAlert).toHaveCount(0);
});

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
    await page.getByRole("button", { name: "Edit mode" }).click();
    await page
      .locator("tbody > tr[data-transaction-id]:not([aria-disabled='true'])")
      .first()
      .click();
    await expect(
      page.getByTestId("transaction-browser-edit-mode-header"),
    ).toContainText("1 selected");
  } finally {
    releaseDateJumpResponse?.();
  }

  const cancelledDateJumpBody = (await (
    await dateJumpResponse
  ).json()) as TransactionListFixture;
  await expectTransactionsPageUrl(page, 1, 25);
  await expect(
    page.getByTestId("transaction-browser-edit-mode-header"),
  ).toContainText("1 selected");
  await expect(
    page.locator(`[data-date-jump-anchor="${jumpDate}"]`),
  ).toHaveCount(0);
  await page
    .getByTestId("transaction-browser-edit-mode-header")
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
  await expectTransactionsPageUrl(page, landedPage, 25, {
    anchorDate: jumpDate,
  });
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
  await expectTransactionsPageUrl(page, landedPage + 1, 25, {
    anchorDate: jumpDate,
  });
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
  await expectTransactionsPageUrl(page, oldAnchorPage, 25, {
    anchorDate: olderThanEverything,
  });
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
  await expectTransactionsPageUrl(page, previousLandedPage, 25, {
    anchorDate: previousDate,
  });
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
    { anchorDate },
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
    { anchorDate: yesterday },
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

test("transactions page chooses a stable sort field and direction", async ({
  page,
}) => {
  await page.goto("/transactions?page=2&pageSize=25");
  const sortMenu = page.getByRole("button", {
    name: /^Sort transactions:/,
  });
  const dateJump = page.getByLabel("Go to day");

  const firstTransactionRow = page
    .locator("tbody > tr[data-transaction-id]")
    .first();
  await expect(firstTransactionRow).toBeVisible();
  await firstTransactionRow.focus();
  await firstTransactionRow.press("Enter");
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();
  await expect(page).toHaveURL(/[?&]transaction=\d+(?:&|$)/);

  const updatedDescending = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("sort") === "updated_at" &&
      url.searchParams.get("sort_dir") === "desc"
    );
  });
  await sortMenu.focus();
  await sortMenu.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Sort transactions" }),
  ).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Updated" }).click();
  await updatedDescending;
  await expect(page).toHaveURL(
    /\/transactions\?page=1&pageSize=25&transaction=\d+&sort=updated_at&sortDir=desc$/,
  );
  await expect(dateJump).toBeDisabled();
  await page.goBack();
  await expect(detailPanel).toBeHidden();
  await expect(page).toHaveURL(
    /\/transactions\?page=1&pageSize=25&sort=updated_at&sortDir=desc$/,
  );

  const updatedAscending = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("sort") === "updated_at" &&
      url.searchParams.get("sort_dir") === "asc"
    );
  });
  await sortMenu.click();
  await page.getByRole("button", { exact: true, name: "Oldest first" }).click();
  await updatedAscending;
  await expect(page).toHaveURL(
    /\/transactions\?page=1&pageSize=25&sort=updated_at&sortDir=asc$/,
  );
  const dateJumpDisabledReason =
    "Date jumping requires Date sorting with newest first";
  for (const controlName of [
    "Previous day",
    "Choose a day",
    "Next day",
    "Today",
  ]) {
    await expect(
      page.getByLabel(`${controlName} unavailable: ${dateJumpDisabledReason}`, {
        exact: true,
      }),
    ).toHaveAttribute("tabindex", "0");
  }

  for (const width of [1280, 600]) {
    await page.setViewportSize({ width, height: 720 });
    const overflow = await page
      .getByTestId("transaction-browser-toolbar-row")
      .evaluate((toolbar) => ({
        document: document.documentElement.scrollWidth > window.innerWidth + 1,
        toolbar: toolbar.scrollWidth > toolbar.clientWidth + 1,
      }));
    expect(overflow, `toolbar overflow at ${width}px`).toEqual({
      document: false,
      toolbar: false,
    });
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  const initiatedAscending = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("sort") === "initiated_date" &&
      url.searchParams.get("sort_dir") === "asc"
    );
  });
  await page.getByRole("button", { exact: true, name: "Date" }).click();
  await initiatedAscending;
  await expect(dateJump).toBeDisabled();

  const initiatedDescending = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("sort") === "initiated_date" &&
      url.searchParams.get("sort_dir") === "desc"
    );
  });
  await page.getByRole("button", { exact: true, name: "Newest first" }).click();
  await initiatedDescending;
  await expect(dateJump).toBeEnabled();
});

test("transactions page keeps its page when the active sort is reselected", async ({
  page,
}) => {
  await page.goto("/transactions?page=2&pageSize=25");
  const sortMenu = page.getByRole("button", {
    name: /^Sort transactions:/,
  });

  await sortMenu.click();
  await page.getByRole("button", { exact: true, name: "Date" }).click();
  await expect(page).toHaveURL(/\/transactions\?page=2&pageSize=25$/);

  await page.getByRole("button", { exact: true, name: "Newest first" }).click();
  await expect(page).toHaveURL(/\/transactions\?page=2&pageSize=25$/);
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
  await expect(dateJump).toBeFocused();
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
  const previousDayButton = page.getByRole("button", { name: "Previous day" });
  await previousDayButton.click();
  await previousResponse;
  await expect(dateJump).toHaveValue(previousDate);
  await expect(previousDayButton).toBeFocused();

  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();

  const today = formatLocalDate(new Date());
  const todayResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === today
    );
  });
  const todayButton = page.getByRole("button", { name: "Today" });
  await todayButton.click();
  const todayPage = (await (
    await todayResponse
  ).json()) as TransactionListFixture;
  await expect(dateJump).toHaveValue(today);
  await expect(todayButton).toBeFocused();
  await expectTransactionsPageUrl(
    page,
    Math.floor(todayPage.offset / 50) + 1,
    50,
    { anchorDate: today },
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
        container.querySelectorAll("[data-transaction-row='true']"),
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
  await foldedSpendRow.click();
  await expect(page).toHaveURL(/[?&]transaction=\d+(?:&|$)/);
});

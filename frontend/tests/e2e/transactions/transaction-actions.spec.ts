import type { Page } from "@playwright/test";
import { test } from "@tests/e2e/test";
import {
  createAccount,
  createCategory,
  createExpectedRecurringFixture,
  expect,
  type TransactionDetailFixture,
} from "@tests/e2e/transactions/support";

const confirmPostDate = async (page: Page) => {
  await page
    .getByRole("alertdialog")
    .getByRole("button", { exact: true, name: "Post transaction" })
    .click();
};

test("pending transaction actions post all balance records and retain history", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E pending actions ${unique}`;
  const [source, destination, merchant, category] = await Promise.all([
    createAccount(page, `e2e:Actions:${unique}:Source`, "owned", "USD"),
    createAccount(page, `e2e:Actions:${unique}:Destination`, "owned", "USD"),
    createAccount(page, `e2e:Actions:${unique}:Merchant`, "flow"),
    createCategory(page, `E2E:Actions:${unique}:Expense`, "expense"),
  ]);
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-08-02",
      records: [
        {
          account_id: source.account_id,
          amount: "-25.00",
          category_id: null,
          currency: "USD",
          memo,
          settlement: { status: "pending" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: destination.account_id,
          amount: "20.00",
          category_id: null,
          currency: "USD",
          memo,
          settlement: { status: "pending" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchant.account_id,
          amount: "5.00",
          category_id: category.category_id,
          currency: "USD",
          memo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const created = (await createResponse.json()) as TransactionDetailFixture;
  const pendingRecords = created.records.filter(
    (record) => record.settlement === "pending",
  );
  expect(pendingRecords).toHaveLength(2);
  const pendingDates = new Map(
    pendingRecords.map((record) => [record.record_id, record.pending_date]),
  );

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const settlementPath = "**/api/records/bulk/settlement";
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Open transaction detail" }),
  ).toHaveCount(0);
  const rowActions = row.locator(".row-actions-buttons");
  for (const action of [
    "Edit transaction",
    "Duplicate transaction",
    "Post transaction",
    "Cancel transaction",
    "Delete transaction",
  ]) {
    await expect(
      rowActions.getByRole("button", { exact: true, name: action }),
    ).toBeVisible();
  }
  await expect(
    rowActions.getByRole("button", { name: "Open transaction detail" }),
  ).toHaveCount(0);

  let markRowPostStarted!: () => void;
  const rowPostStarted = new Promise<void>((resolve) => {
    markRowPostStarted = resolve;
  });
  let releaseRowPost!: () => void;
  const rowPostReleased = new Promise<void>((resolve) => {
    releaseRowPost = resolve;
  });
  await page.route(settlementPath, async (route) => {
    markRowPostStarted();
    await rowPostReleased;
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "internal", message: "Forced row post failure" },
      }),
      contentType: "application/json",
      status: 500,
    });
  });
  const rowPostButton = rowActions.getByRole("button", {
    exact: true,
    name: "Post transaction",
  });
  await rowPostButton.click();
  await confirmPostDate(page);
  await rowPostStarted;
  const busyRowPostButton = rowActions.getByRole("button", {
    exact: true,
    name: "Posting transaction",
  });
  await expect(busyRowPostButton).toHaveAttribute("aria-disabled", "true");
  for (const action of ["Edit transaction", "Split transaction"]) {
    const disabledAction = rowActions.getByRole("button", {
      exact: true,
      name: action,
    });
    await expect(disabledAction).toHaveAttribute("aria-disabled", "true");
    await disabledAction.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Posting transaction.");
  }
  const disabledCancelButton = rowActions.getByRole("button", {
    exact: true,
    name: "Cancel transaction",
  });
  await disabledCancelButton.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Posting transaction.");
  const disabledRowDelete = rowActions.getByRole("button", {
    exact: true,
    name: "Delete transaction",
  });
  await expect(disabledRowDelete).toHaveAttribute("aria-disabled", "true");
  await disabledRowDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Posting transaction.");
  releaseRowPost();
  await expect(page.getByRole("alert")).toHaveText("Forced row post failure");
  await expect(rowPostButton).toBeFocused();
  await page.unroute(settlementPath);

  let markMovedFocusPostStarted!: () => void;
  const movedFocusPostStarted = new Promise<void>((resolve) => {
    markMovedFocusPostStarted = resolve;
  });
  let releaseMovedFocusPost!: () => void;
  const movedFocusPostReleased = new Promise<void>((resolve) => {
    releaseMovedFocusPost = resolve;
  });
  await page.route(settlementPath, async (route) => {
    markMovedFocusPostStarted();
    await movedFocusPostReleased;
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "internal", message: "Forced moved-focus failure" },
      }),
      contentType: "application/json",
      status: 500,
    });
  });
  await rowPostButton.click();
  await confirmPostDate(page);
  await movedFocusPostStarted;
  const searchInput = page.getByRole("searchbox", { name: "Search" });
  await searchInput.focus();
  await expect(searchInput).toBeFocused();
  releaseMovedFocusPost();
  await expect(page.getByRole("alert")).toHaveText(
    "Forced moved-focus failure",
  );
  await expect(searchInput).toBeFocused();
  await page.unroute(settlementPath);

  const cancelPath = `**/api/transactions/${created.transaction_id}/cancel`;
  let markCancelStarted!: () => void;
  const cancelStarted = new Promise<void>((resolve) => {
    markCancelStarted = resolve;
  });
  let releaseCancel!: () => void;
  const cancelReleased = new Promise<void>((resolve) => {
    releaseCancel = resolve;
  });
  await page.route(cancelPath, async (route) => {
    markCancelStarted();
    await cancelReleased;
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: { code: "temporary_failure", message: "Cancel failed." },
      },
      status: 503,
    });
  });
  await rowActions
    .getByRole("button", { exact: true, name: "Cancel transaction" })
    .click();
  await cancelStarted;
  const disabledPostButton = rowActions.getByRole("button", {
    exact: true,
    name: "Post transaction",
  });
  await expect(disabledPostButton).toHaveAttribute("aria-disabled", "true");
  await disabledPostButton.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Cancelling transaction.");
  const busyCancelButton = rowActions.getByRole("button", {
    exact: true,
    name: "Cancelling transaction",
  });
  await expect(busyCancelButton).toHaveAttribute("aria-disabled", "true");
  await expect(busyCancelButton).toBeFocused();
  releaseCancel();
  await expect(page.getByRole("alert")).toHaveText("Cancel failed.");
  await expect(
    rowActions.getByRole("button", {
      exact: true,
      name: "Cancel transaction",
    }),
  ).toBeFocused();
  await page.unroute(cancelPath);

  await row.click();
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail).toBeVisible();
  const footer = detail.locator(":scope > div").last();
  for (const action of [
    "Edit",
    "Duplicate",
    "Split",
    "Post",
    "Cancel",
    "Delete",
  ]) {
    await expect(
      footer.getByRole("button", { exact: true, name: action }),
    ).toBeVisible();
  }
  await expect(
    detail
      .locator(":scope > div")
      .first()
      .getByRole("button", { exact: true, name: "Edit" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 900 });
  const [postBox, cancelBox] = await Promise.all([
    footer.getByRole("button", { exact: true, name: "Post" }).boundingBox(),
    footer.getByRole("button", { exact: true, name: "Cancel" }).boundingBox(),
  ]);
  expect(postBox).not.toBeNull();
  expect(cancelBox).not.toBeNull();
  expect(postBox?.y).toBe(cancelBox?.y);
  await page.setViewportSize({ width: 1600, height: 900 });

  let markDetailPostStarted!: () => void;
  const detailPostStarted = new Promise<void>((resolve) => {
    markDetailPostStarted = resolve;
  });
  let releaseDetailPost!: () => void;
  const detailPostReleased = new Promise<void>((resolve) => {
    releaseDetailPost = resolve;
  });
  await page.route(settlementPath, async (route) => {
    markDetailPostStarted();
    await detailPostReleased;
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "internal", message: "Forced post failure" },
      }),
      contentType: "application/json",
      status: 500,
    });
  });
  const postButton = footer.getByRole("button", { exact: true, name: "Post" });
  await postButton.click();
  await confirmPostDate(page);
  await detailPostStarted;
  await expect(
    footer.getByRole("button", { exact: true, name: "Edit" }),
  ).toBeDisabled();
  const disabledDetailSplit = footer.getByRole("button", {
    exact: true,
    name: "Split",
  });
  await expect(disabledDetailSplit).toBeDisabled();
  await disabledDetailSplit.locator("..").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Posting transaction.");
  const disabledDetailDelete = footer.getByRole("button", {
    exact: true,
    name: "Delete",
  });
  await expect(disabledDetailDelete).toBeDisabled();
  await disabledDetailDelete.locator("..").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Posting transaction.");
  releaseDetailPost();
  await expect(detail.getByRole("alert")).toHaveText("Forced post failure");
  await expect(postButton).toBeFocused();
  await page.unroute(settlementPath);

  let markMovedDetailFocusPostStarted!: () => void;
  const movedDetailFocusPostStarted = new Promise<void>((resolve) => {
    markMovedDetailFocusPostStarted = resolve;
  });
  let releaseMovedDetailFocusPost!: () => void;
  const movedDetailFocusPostReleased = new Promise<void>((resolve) => {
    releaseMovedDetailFocusPost = resolve;
  });
  await page.route(settlementPath, async (route) => {
    markMovedDetailFocusPostStarted();
    await movedDetailFocusPostReleased;
    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: "internal",
          message: "Forced moved detail focus failure",
        },
      }),
      contentType: "application/json",
      status: 500,
    });
  });
  await postButton.click();
  await confirmPostDate(page);
  await movedDetailFocusPostStarted;
  const closeDetailButton = detail.getByRole("button", {
    name: "Close transaction detail",
  });
  await closeDetailButton.focus();
  await expect(closeDetailButton).toBeFocused();
  releaseMovedDetailFocusPost();
  await expect(detail.getByRole("alert")).toHaveText(
    "Forced moved detail focus failure",
  );
  await expect(closeDetailButton).toBeFocused();
  await page.unroute(settlementPath);

  const settlementRequestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/records/bulk/settlement" &&
      request.method() === "POST",
  );
  const transactionPath = `/api/transactions/${created.transaction_id}`;
  let detailRefreshFailed = false;
  await page.route(`**${transactionPath}`, async (route) => {
    if (route.request().method() !== "GET" || detailRefreshFailed) {
      await route.continue();
      return;
    }
    detailRefreshFailed = true;
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: { code: "temporary_failure", message: "Detail refresh failed." },
      },
      status: 503,
    });
  });
  await postButton.click();
  await confirmPostDate(page);
  const settlementRequest = await settlementRequestPromise;
  const settlementRequestBody: unknown = settlementRequest.postDataJSON();
  expect(settlementRequestBody).toMatchObject({
    posted_date: expect.any(String),
    record_ids: pendingRecords.map((record) => record.record_id),
    settlement: "posted",
  });

  await expect(
    page.getByRole("status").filter({ hasText: "Transaction posted." }),
  ).toBeVisible();
  expect(detailRefreshFailed).toBe(true);
  await expect(detail.getByRole("alert")).toHaveCount(0);
  await expect(footer.getByRole("button", { name: "Post" })).toHaveCount(0);
  await expect(footer.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await expect(
    footer.getByRole("button", { exact: true, name: "Edit" }),
  ).toBeFocused();
  await expect(row.getByRole("img", { name: "Pending" })).toHaveCount(0);

  const detailResponse = await page.request.get(transactionPath);
  expect(detailResponse.ok(), await detailResponse.text()).toBe(true);
  const posted = (await detailResponse.json()) as TransactionDetailFixture;
  const postedRecords = posted.records.filter(
    (record) => record.settlement === "posted",
  );
  expect(postedRecords).toHaveLength(2);
  for (const record of postedRecords) {
    expect(record.pending_date).toBe(pendingDates.get(record.record_id));
    expect(record.posted_date).not.toBeNull();
  }
});

test("concurrent row Posts retain independent busy state and overflow focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [wallet, merchant, category] = await Promise.all([
    createAccount(page, `e2e:ConcurrentPost:${unique}:Wallet`, "owned", "USD"),
    createAccount(page, `e2e:ConcurrentPost:${unique}:Merchant`, "flow"),
    createCategory(page, `E2E:ConcurrentPost:${unique}:Expense`, "expense"),
  ]);
  const createPendingSpend = async (
    suffix: string,
  ): Promise<TransactionDetailFixture> => {
    const response = await page.request.post("/api/transactions/spend", {
      data: {
        amount: "10.00",
        category_id: category.category_id,
        counterparty_account_id: merchant.account_id,
        currency: "USD",
        funding_account_id: wallet.account_id,
        initiated_date: "2026-08-02",
        memo: `E2E concurrent post ${unique} ${suffix}`,
        settlement: { status: "pending" },
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as TransactionDetailFixture;
  };
  await Promise.all([
    createPendingSpend("first"),
    createPendingSpend("second"),
    createPendingSpend("overflow"),
  ]);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const firstRow = page.getByRole("row").filter({ hasText: "first" }).first();
  const secondRow = page.getByRole("row").filter({ hasText: "second" }).first();
  const overflowRow = page
    .getByRole("row")
    .filter({ hasText: "overflow" })
    .first();
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toBeVisible();
  await expect(overflowRow).toBeVisible();

  let firstStartedResolve!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    firstStartedResolve = resolve;
  });
  let secondStartedResolve!: () => void;
  const secondStarted = new Promise<void>((resolve) => {
    secondStartedResolve = resolve;
  });
  let releaseFirst!: () => void;
  const firstReleased = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let releaseSecond!: () => void;
  const secondReleased = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  let requestIndex = 0;
  const settlementPath = "**/api/records/bulk/settlement";
  await page.route(settlementPath, async (route) => {
    requestIndex += 1;
    const currentIndex = requestIndex;
    if (currentIndex === 1) {
      firstStartedResolve();
      await firstReleased;
    } else {
      secondStartedResolve();
      await secondReleased;
    }
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: {
          code: "temporary_failure",
          message: `Concurrent Post ${currentIndex} failed.`,
        },
      },
      status: 503,
    });
  });

  await firstRow
    .locator(".row-actions-buttons")
    .getByRole("button", { exact: true, name: "Post transaction" })
    .click();
  await confirmPostDate(page);
  await firstStarted;
  await secondRow
    .locator(".row-actions-buttons")
    .getByRole("button", { exact: true, name: "Post transaction" })
    .click();
  await confirmPostDate(page);
  await secondStarted;
  await expect(
    firstRow.getByRole("button", { exact: true, name: "Posting transaction" }),
  ).toBeVisible();
  await expect(
    secondRow.getByRole("button", {
      exact: true,
      name: "Posting transaction",
    }),
  ).toBeVisible();

  releaseFirst();
  await expect(
    firstRow.getByRole("button", { exact: true, name: "Post transaction" }),
  ).toBeVisible();
  await expect(
    secondRow.getByRole("button", {
      exact: true,
      name: "Posting transaction",
    }),
  ).toBeVisible();
  releaseSecond();
  await expect(
    secondRow.getByRole("button", { exact: true, name: "Post transaction" }),
  ).toBeVisible();
  await page.unroute(settlementPath);

  const overflowActions = overflowRow.locator(".row-actions");
  await overflowActions.evaluate((element) => {
    element.setAttribute("style", "width: 150px");
  });
  const overflowTrigger = overflowRow.getByRole("button", {
    name: "More row actions",
  });
  await expect(overflowTrigger).toBeVisible();
  await overflowTrigger.click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Post transaction" })
    .click();
  await confirmPostDate(page);
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction posted." }),
  ).toBeVisible();
  await expect(overflowTrigger).toBeHidden();
  await expect(overflowRow).toBeFocused();
});

test("row lifecycle busy labels preserve keyboard focus", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E lifecycle focus ${unique}`;
  const [wallet, merchant, category] = await Promise.all([
    createAccount(page, `e2e:LifecycleFocus:${unique}:Wallet`, "owned", "USD"),
    createAccount(page, `e2e:LifecycleFocus:${unique}:Merchant`, "flow"),
    createCategory(page, `E2E:LifecycleFocus:${unique}:Expense`, "expense"),
  ]);
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "10.00",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: wallet.account_id,
      initiated_date: "2026-08-02",
      memo,
      settlement: { status: "pending" },
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const created = (await createResponse.json()) as TransactionDetailFixture;
  const cancelResponse = await page.request.post(
    `/api/transactions/${created.transaction_id}/cancel`,
  );
  expect(cancelResponse.ok(), await cancelResponse.text()).toBe(true);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  const rowActions = row.locator(".row-actions-buttons");
  const restorePath = `**/api/transactions/${created.transaction_id}/restore`;
  let markRestoreStarted!: () => void;
  const restoreStarted = new Promise<void>((resolve) => {
    markRestoreStarted = resolve;
  });
  let releaseRestore!: () => void;
  const restoreReleased = new Promise<void>((resolve) => {
    releaseRestore = resolve;
  });
  await page.route(restorePath, async (route) => {
    markRestoreStarted();
    await restoreReleased;
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: { code: "temporary_failure", message: "Restore failed." },
      },
      status: 503,
    });
  });

  await rowActions
    .getByRole("button", { exact: true, name: "Restore transaction" })
    .click();
  await restoreStarted;
  const busyRestoreButton = rowActions.getByRole("button", {
    exact: true,
    name: "Restoring transaction",
  });
  await expect(busyRestoreButton).toHaveAttribute("aria-disabled", "true");
  await expect(busyRestoreButton).toBeFocused();
  releaseRestore();
  await expect(page.getByRole("alert")).toHaveText("Restore failed.");
  await expect(
    rowActions.getByRole("button", {
      exact: true,
      name: "Restore transaction",
    }),
  ).toBeFocused();
});

test("detail Post feedback stays with its invoking transaction", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [wallet, firstMerchant, secondMerchant, category] = await Promise.all([
    createAccount(page, `e2e:ScopedPost:${unique}:Wallet`, "owned", "USD"),
    createAccount(page, `e2e:ScopedPost:${unique}:First`, "flow"),
    createAccount(page, `e2e:ScopedPost:${unique}:Second`, "flow"),
    createCategory(page, `E2E:ScopedPost:${unique}:Expense`, "expense"),
  ]);
  const createPendingSpend = async (
    merchantId: number,
    memo: string,
  ): Promise<TransactionDetailFixture> => {
    const response = await page.request.post("/api/transactions/spend", {
      data: {
        amount: "10.00",
        category_id: category.category_id,
        counterparty_account_id: merchantId,
        currency: "USD",
        funding_account_id: wallet.account_id,
        initiated_date: "2026-08-02",
        memo,
        settlement: { status: "pending" },
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as TransactionDetailFixture;
  };
  const firstMemo = `E2E scoped post first ${unique}`;
  const secondMemo = `E2E scoped post second ${unique}`;
  const [first, second] = await Promise.all([
    createPendingSpend(firstMerchant.account_id, firstMemo),
    createPendingSpend(secondMerchant.account_id, secondMemo),
  ]);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const firstRow = page.getByRole("row").filter({ hasText: firstMemo }).first();
  const secondRow = page
    .getByRole("row")
    .filter({ hasText: secondMemo })
    .first();
  await firstRow.click();
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail).toBeVisible();

  const settlementPath = "**/api/records/bulk/settlement";
  let markPostStarted!: () => void;
  const postStarted = new Promise<void>((resolve) => {
    markPostStarted = resolve;
  });
  let releasePost!: () => void;
  const postReleased = new Promise<void>((resolve) => {
    releasePost = resolve;
  });
  await page.route(settlementPath, async (route) => {
    markPostStarted();
    await postReleased;
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "internal", message: "First post failed" },
      }),
      contentType: "application/json",
      status: 500,
    });
  });
  const firstPost = detail.getByRole("button", {
    exact: true,
    name: "Post",
  });
  await firstPost.click();
  await confirmPostDate(page);
  await postStarted;

  await secondRow.focus();
  await secondRow.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${second.transaction_id}(?:&|$)`),
  );
  const secondPost = detail.getByRole("button", {
    exact: true,
    name: "Post",
  });
  await expect(secondPost).toBeEnabled();

  const failedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/records/bulk/settlement" &&
      response.status() === 500,
  );
  releasePost();
  await failedResponse;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      }),
  );
  await expect(detail.getByRole("alert")).toHaveCount(0);
  await expect(secondPost).toBeEnabled();
  await expect(secondPost).not.toBeFocused();
  expect(first.transaction_id).not.toBe(second.transaction_id);
});

test("Split is limited to active spend and income transactions", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memoPrefix = `E2E split actions ${unique}`;
  const [wallet, checking, euros, merchant, employer, expense, income] =
    await Promise.all([
      createAccount(page, `e2e:SplitActions:${unique}:Wallet`, "owned", "USD"),
      createAccount(
        page,
        `e2e:SplitActions:${unique}:Checking`,
        "owned",
        "USD",
      ),
      createAccount(page, `e2e:SplitActions:${unique}:Euros`, "owned", "EUR"),
      createAccount(page, `e2e:SplitActions:${unique}:Merchant`, "flow"),
      createAccount(page, `e2e:SplitActions:${unique}:Employer`, "flow"),
      createCategory(page, `E2E:SplitActions:${unique}:Expense`, "expense"),
      createCategory(page, `E2E:SplitActions:${unique}:Income`, "income"),
    ]);

  const createTransaction = async (
    path: string,
    data: Record<string, unknown>,
  ): Promise<TransactionDetailFixture> => {
    const response = await page.request.post(path, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as TransactionDetailFixture;
  };
  const common = {
    amount: "10.00",
    currency: "USD",
    initiated_date: "2026-08-02",
  };
  const spendMemo = `${memoPrefix} spend`;
  const incomeMemo = `${memoPrefix} income`;
  const refundMemo = `${memoPrefix} refund`;
  const transferMemo = `${memoPrefix} transfer`;
  const exchangeMemo = `${memoPrefix} exchange`;
  const cancelledMemo = `${memoPrefix} cancelled`;

  const [, , , transfer, , toCancel] = await Promise.all([
    createTransaction("/api/transactions/spend", {
      ...common,
      category_id: expense.category_id,
      counterparty_account_id: merchant.account_id,
      funding_account_id: wallet.account_id,
      memo: spendMemo,
    }),
    createTransaction("/api/transactions/income", {
      ...common,
      category_id: income.category_id,
      destination_account_id: checking.account_id,
      memo: incomeMemo,
      source_account_id: employer.account_id,
    }),
    createTransaction("/api/transactions/refund", {
      ...common,
      category_id: expense.category_id,
      counterparty_account_id: merchant.account_id,
      destination_account_id: wallet.account_id,
      memo: refundMemo,
    }),
    createTransaction("/api/transactions/transfer", {
      ...common,
      destination_account_id: checking.account_id,
      memo: transferMemo,
      source_account_id: wallet.account_id,
    }),
    createTransaction("/api/transactions/exchange", {
      bought_account_id: euros.account_id,
      bought_amount: "9.00",
      initiated_date: "2026-08-02",
      memo: exchangeMemo,
      sold_account_id: wallet.account_id,
      sold_amount: "10.00",
    }),
    createTransaction("/api/transactions/spend", {
      ...common,
      category_id: expense.category_id,
      counterparty_account_id: merchant.account_id,
      funding_account_id: wallet.account_id,
      memo: cancelledMemo,
      settlement: { status: "pending" },
    }),
  ]);
  const cancelResponse = await page.request.post(
    `/api/transactions/${toCancel.transaction_id}/cancel`,
  );
  expect(cancelResponse.ok(), await cancelResponse.text()).toBe(true);
  const expected = await createExpectedRecurringFixture(
    page,
    `${unique}SplitActions`,
    { anchorDate: "2026-08-02" },
  );

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const cases = [
    { eligible: true, memo: spendMemo },
    { eligible: true, memo: incomeMemo },
    { eligible: false, memo: refundMemo },
    { eligible: false, memo: transferMemo },
    { eligible: false, memo: exchangeMemo },
    { eligible: false, memo: cancelledMemo },
  ];
  const detail = page.getByTestId("transaction-detail-panel");
  for (const item of cases) {
    const row = page.getByRole("row").filter({ hasText: item.memo }).first();
    await expect(row).toBeVisible();
    await expect(
      row
        .locator(".row-actions-buttons")
        .getByRole("button", { exact: true, name: "Split transaction" }),
    ).toHaveCount(item.eligible ? 1 : 0);
    await row.click();
    await expect(detail).toBeVisible();
    await expect(
      detail.getByRole("button", { exact: true, name: "Split" }),
    ).toHaveCount(item.eligible ? 1 : 0);
    await detail
      .getByRole("button", { name: "Close transaction detail" })
      .click();
  }

  await page.goto(
    `/transactions?page=1&pageSize=50&transaction=${expected.transactionId}`,
  );
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole("button", { exact: true, name: "Split" }),
  ).toHaveCount(0);

  await page.goto(
    `/transactions?page=1&pageSize=50&entry=split:${transfer.transaction_id}`,
  );
  const entry = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(
    entry.getByRole("heading", { name: "Transaction unavailable" }),
  ).toBeVisible();
  await expect(entry.getByRole("alert")).toHaveText(
    `Transaction #${transfer.transaction_id} is unavailable for Split.`,
  );
});

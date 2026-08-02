import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
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
  findByFqn,
  getTransactionDetail,
  listFixtures,
  type Route,
  type TransactionDetailFixture,
  type TransactionFixture,
  waitForLedgerLookups,
} from "@tests/e2e/transactions/support";

test("bulk settlement and reconciliation stay independent", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E bulk settlement ${unique}`;
  const created = await createSearchSpend(page, memo);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  await row.click();
  const actions = page.getByTestId("bulk-action-bar");
  const pendingButton = actions.getByRole("button", { name: "Pending" });
  const postedButton = actions.getByRole("button", { name: "Posted" });
  const reconcileButton = actions.getByRole("button", {
    exact: true,
    name: "Reconcile",
  });
  const unreconcileButton = actions.getByRole("button", {
    exact: true,
    name: "Unreconcile",
  });

  await unreconcileButton.click();
  await expect(
    page.getByRole("status").filter({ hasText: "2 records updated." }),
  ).toBeVisible();
  await expect(unreconcileButton).toBeFocused();
  await pendingButton.click();
  await expect(
    page.getByRole("status").filter({ hasText: "1 record updated." }),
  ).toBeVisible();
  await expect(pendingButton).toBeFocused();
  let detail = await getTransactionDetail(page, created);
  expect(detail.records.map((record) => record.settlement).sort()).toEqual([
    null,
    "pending",
  ]);
  expect(detail.records.map((record) => record.reconciliation_status)).toEqual([
    "unreconciled",
    "unreconciled",
  ]);

  await reconcileButton.click();
  await expect(
    page.getByRole("status").filter({ hasText: "2 records updated." }),
  ).toBeVisible();
  await expect(reconcileButton).toBeFocused();
  detail = await getTransactionDetail(page, created);
  expect(detail.records.map((record) => record.reconciliation_status)).toEqual([
    "reconciled",
    "reconciled",
  ]);
  expect(detail.records.map((record) => record.settlement).sort()).toEqual([
    null,
    "pending",
  ]);

  const postedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/records/bulk/settlement" &&
      response.request().method() === "POST",
  );
  await postedButton.click();
  await postedResponse;
  await expect(postedButton).toBeFocused();
  const unreconcileResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/records/bulk/reconciliation" &&
      response.request().method() === "POST",
  );
  await unreconcileButton.click();
  await unreconcileResponse;
  await expect(unreconcileButton).toBeFocused();
  detail = await getTransactionDetail(page, created);
  expect(detail.records.map((record) => record.settlement).sort()).toEqual([
    null,
    "posted",
  ]);
  expect(detail.records.map((record) => record.reconciliation_status)).toEqual([
    "unreconciled",
    "unreconciled",
  ]);
  await deleteTransaction(page, created);
});

test("clearing selection during a record-state update stays cleared", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E bulk selection race ${unique}`;
  const created = await createSearchSpend(page, memo);
  let releaseSettlement: (() => void) | undefined;
  const settlementStarted = new Promise<void>((resolve) => {
    void page.route("**/api/records/bulk/settlement", async (route) => {
      resolve();
      await new Promise<void>((release) => {
        releaseSettlement = release;
      });
      await route.continue();
    });
  });

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  await row.click();
  const modeBar = page.getByTestId("transaction-browser-bulk-mode-bar");
  await expect(modeBar).toContainText("1 selected");

  await page
    .getByTestId("bulk-action-bar")
    .getByRole("button", { name: "Pending" })
    .click();
  await settlementStarted;
  await modeBar.getByRole("button", { name: "Clear" }).click();
  await expect(modeBar).toContainText("0 selected");
  releaseSettlement?.();
  await expect(
    page.getByRole("status").filter({ hasText: "1 record updated." }),
  ).toBeVisible();
  await expect(modeBar).toContainText("0 selected");

  await deleteTransaction(page, created);
});

test("bulk mode updates uniform fields and skips mixed rows", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const [targetCategory, initialMember, targetMember] = await Promise.all([
    createCategory(page, `E2E:Bulk:${unique}:Category`, "expense"),
    createMember(page, `Initial bulk member ${unique}`),
    createMember(page, `Target bulk member ${unique}`),
  ]);
  const uniformMemo = `E2E bulk uniform ${unique}`;
  const mixedMemo = `E2E bulk mixed ${unique}`;
  const uniformResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-12",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-11.00000000",
          category_id: null,
          currency: "USD",
          member_id: initialMember.member_id,
          memo: uniformMemo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "11.00000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: uniformMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(uniformResponse.ok(), await uniformResponse.text()).toBe(true);
  const uniform = (await uniformResponse.json()) as TransactionDetailFixture;
  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-12",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-7.00000000",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "3.00000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "4.00000000",
          category_id: targetCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);
  const mixed = (await mixedResponse.json()) as TransactionDetailFixture;
  const expectedFixture = await createExpectedRecurringFixture(page, unique);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const uniformRow = page
    .getByRole("row")
    .filter({ hasText: uniformMemo })
    .first();
  const mixedRow = page.getByRole("row").filter({ hasText: mixedMemo }).first();
  const expectedRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "Expected" }) })
    .filter({
      hasText: expectedFixture.merchantFqn.split(":").at(-1) ?? "Merchant",
    });
  await expect(uniformRow).toBeVisible();
  await expect(mixedRow).toBeVisible();
  await expect(expectedRow).toBeVisible();
  await expect(page.getByTestId("bulk-action-bar")).toHaveCount(0);

  await page.getByRole("button", { name: "Bulk edit" }).click();
  const modeBar = page.getByTestId("transaction-browser-bulk-mode-bar");
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  await expect(modeBar).toBeVisible();
  await expect(modeBar).toContainText("0 selected");
  await expect(expectedRow.getByRole("checkbox")).toHaveCount(0);
  await expect(expectedRow).toHaveAttribute("aria-disabled", "true");
  await uniformRow.click();
  await expect(modeBar).toContainText("1 selected");
  await mixedRow.click();
  await expect(modeBar).toContainText("2 selected");
  await expect(uniformRow).toHaveAttribute("aria-selected", "true");
  await expect(mixedRow).toHaveAttribute("aria-selected", "true");

  await bulkActionBar.getByRole("button", { name: "Categorize" }).click();
  const categoryPicker = page.getByTestId("bulk-action-picker");
  await expect(categoryPicker).toContainText(
    "1 of 2 selected will be skipped: mixed records",
  );
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .fill(targetCategory.fqn);
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .press("Enter");
  let releaseRefresh: (() => void) | undefined;
  let markRefreshStarted: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    markRefreshStarted = resolve;
  });
  let transactionReadbackCount = 0;
  const holdRefresh = async (route: Route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === "GET" &&
      url.pathname === `/api/transactions/${uniform.transaction_id}`
    ) {
      transactionReadbackCount += 1;
    }
    if (
      route.request().method() !== "GET" ||
      url.pathname !== "/api/transactions"
    ) {
      await route.continue();
      return;
    }
    markRefreshStarted?.();
    await new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    await route.continue();
  };
  await page.route("**/api/transactions**", holdRefresh);
  await categoryPicker.getByRole("button", { name: "Apply category" }).click();
  await refreshStarted;
  expect(transactionReadbackCount).toBe(0);
  await expect(categoryPicker).toBeVisible();
  await expect(
    categoryPicker.getByRole("combobox", { name: "Category" }),
  ).toHaveValue(targetCategory.fqn);
  await expect(
    categoryPicker.getByRole("button", { name: "Cancel" }),
  ).toBeDisabled();
  releaseRefresh?.();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "1 updated, 1 skipped: mixed records." }),
  ).toBeVisible();
  await page.unroute("**/api/transactions**", holdRefresh);
  await expect(uniformRow).toContainText(targetCategory.name);
  await expect(mixedRow).toContainText("Mixed");
  await expect(modeBar).toContainText("2 selected");

  await bulkActionBar.getByRole("button", { name: "Member" }).click();
  const memberPicker = page.getByTestId("bulk-action-picker");
  await expect(memberPicker).toContainText(
    "1 of 2 selected will be skipped: partially attributed members",
  );
  await memberPicker
    .getByRole("combobox", { name: "Member" })
    .fill(targetMember.name);
  await memberPicker.getByRole("combobox", { name: "Member" }).press("Enter");
  await memberPicker.getByRole("button", { name: "Set member" }).click();
  await expect(memberPicker).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({
      hasText: "1 updated, 1 skipped: partially attributed members.",
    }),
  ).toBeVisible();

  const [partialMemberResponse, updatedMemberResponse] = await Promise.all([
    page.request.get(`/api/transactions/${uniform.transaction_id}`),
    page.request.get(`/api/transactions/${mixed.transaction_id}`),
  ]);
  expect(partialMemberResponse.ok(), await partialMemberResponse.text()).toBe(
    true,
  );
  expect(updatedMemberResponse.ok(), await updatedMemberResponse.text()).toBe(
    true,
  );
  const partialMemberTransaction =
    (await partialMemberResponse.json()) as TransactionDetailFixture;
  const updatedMemberTransaction =
    (await updatedMemberResponse.json()) as TransactionDetailFixture;
  expect(
    partialMemberTransaction.records.map((record) => record.member_id ?? null),
  ).toEqual([initialMember.member_id, null]);
  expect(
    updatedMemberTransaction.records.map((record) => record.member_id ?? null),
  ).toEqual([
    targetMember.member_id,
    targetMember.member_id,
    targetMember.member_id,
  ]);

  const tagButton = bulkActionBar.getByRole("button", { name: "Tag" });
  await tagButton.click();
  const tagCombobox = page
    .getByTestId("bulk-action-picker")
    .getByRole("combobox", { name: "Tags to add" });
  await expect(tagCombobox).toHaveAttribute("aria-expanded", "true");
  await tagCombobox.press("Escape");
  await tagCombobox.press("Escape");
  await expect(tagButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modeBar).toContainText("0 selected");
  await expect(mixedRow).toBeFocused();
  await modeBar.getByRole("button", { name: "Select page" }).click();
  await bulkActionBar.getByRole("button", { name: "Tag" }).click();
  const pageTagCombobox = page
    .getByTestId("bulk-action-picker")
    .getByRole("combobox", { name: "Tags to add" });
  await expect(pageTagCombobox).toHaveAttribute("aria-expanded", "true");
  await pageTagCombobox.press("Escape");
  await pageTagCombobox.press("Escape");
  await expect(tagButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modeBar).toContainText("0 selected");
  await expect(modeBar.getByRole("button", { name: "Done" })).toBeFocused();
  await uniformRow.click();
  await mixedRow.click();
  await expect(modeBar).toContainText("2 selected");

  const rowCategoryCell = uniformRow.getByTestId(
    `transaction-${uniform.transaction_id}-category-bulk-cell`,
  );
  await rowCategoryCell.hover();
  await uniformRow.getByRole("button", { name: "Bulk edit category" }).click();
  const rowCategoryPicker = page.getByTestId(
    `transaction-${uniform.transaction_id}-category-bulk-editor`,
  );
  const rowCategoryCombobox = rowCategoryPicker.getByRole("combobox", {
    name: "Category",
  });
  await expect(rowCategoryCombobox).toHaveAttribute("aria-expanded", "true");
  await rowCategoryCombobox.press("Escape");
  await expect(rowCategoryCombobox).toHaveAttribute("aria-expanded", "false");
  await expect(rowCategoryPicker).toBeVisible();
  await rowCategoryCombobox.press("Escape");
  await expect(rowCategoryPicker).toHaveCount(0);
  await expect(rowCategoryCell).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(modeBar).toContainText("1 selected");
  await expect(uniformRow).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modeBar).toContainText("0 selected");
  await expect(uniformRow).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modeBar).toHaveCount(0);
  await expect(bulkActionBar).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bulk edit" })).toBeFocused();
  await expect(uniformRow.getByRole("checkbox")).toHaveCount(0);
});

test("an invalidated sibling page keeps its refresh error scoped", async ({
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
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const targetCategory = await createCategory(
    page,
    `E2E:InvalidatedRetry:${unique}`,
    "expense",
  );
  const memo = `E2E invalidated sibling retry ${unique}`;
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: initialCategory.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-28",
      memo,
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=25");
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await expect(row).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole("button", { exact: true, name: "Previous" }).click();
  await expect(page).toHaveURL(/page=1/);
  await expect(row).toBeVisible();

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await row.click();
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  await bulkActionBar.getByRole("button", { name: "Categorize" }).click();
  const categoryPicker = page.getByTestId("bulk-action-picker");
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .fill(targetCategory.fqn);
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .press("Enter");
  await categoryPicker.getByRole("button", { name: "Apply category" }).click();
  await expect(categoryPicker).toHaveCount(0);

  let pageTwoRefreshes = 0;
  const failPageTwoRefreshes = async (route: Route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      url.pathname !== "/api/transactions" ||
      url.searchParams.get("offset") !== "25"
    ) {
      await route.continue();
      return;
    }

    pageTwoRefreshes += 1;
    if (pageTwoRefreshes <= 2) {
      await route.fulfill({
        body: JSON.stringify({
          error: {
            code: "forced_invalidated_page_failure",
            message: "Forced invalidated page refresh failure.",
          },
        }),
        contentType: "application/json",
        status: 503,
      });
      return;
    }
    await route.continue();
  };
  await page.route("**/api/transactions**", failPageTwoRefreshes);

  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await expect.poll(() => pageTwoRefreshes).toBe(2);
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
  await expect(page.getByText("Transactions may be stale.")).toBeVisible();

  await page.getByRole("button", { exact: true, name: "Previous" }).click();
  await expect(page).toHaveURL(/page=1/);
  await expect(row).toBeVisible();
  await expect(page.getByText("Transactions may be stale.")).toHaveCount(0);

  await page.unroute("**/api/transactions**", failPageTwoRefreshes);
  await deleteTransaction(page, transaction);
});

test("bulk edit keeps cancelled transactions unavailable", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E bulk all cancelled ${unique}`;
  const response = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-12",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-9.00000000",
          category_id: null,
          currency: "USD",
          memo,
          settlement: { status: "pending" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "9.00000000",
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
  expect(response.ok(), await response.text()).toBe(true);
  const activeToCancel = (await response.json()) as TransactionDetailFixture;
  const cancelResponse = await page.request.post(
    `/api/transactions/${activeToCancel.transaction_id}/cancel`,
  );
  const cancelBody = await cancelResponse.text();
  expect(cancelResponse.ok(), cancelBody).toBe(true);
  const transaction = JSON.parse(cancelBody) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  await expect(row).toHaveAttribute("aria-disabled", "true");
  await expect(
    page.getByTestId("bulk-action-bar").getByRole("button", { name: "Member" }),
  ).toBeDisabled();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("0 selected");
  const unchangedResponse = await page.request.get(
    `/api/transactions/${transaction.transaction_id}`,
  );
  expect(unchangedResponse.ok(), await unchangedResponse.text()).toBe(true);
  const unchanged =
    (await unchangedResponse.json()) as TransactionDetailFixture;
  expect(unchanged.records.map((record) => record.member_id ?? null)).toEqual([
    null,
    null,
  ]);
});

test("bulk category excludes transactions with no applied records from updated count", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [accounts, categories, targetCategory] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
    createCategory(page, `E2E:BulkNoApply:${unique}:Target`, "expense"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const missingSearch = `E2E bulk no apply missing ${unique}`;
  const memo = `E2E bulk no apply ${unique}`;
  const lookupsLoaded = waitForLedgerLookups(page);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(missingSearch)}`,
  );
  await lookupsLoaded;

  const lateFlowAccount = await createAccount(
    page,
    `e2e:BulkNoApply:${unique}:Merchant`,
    "flow",
  );
  const response = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-12",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-13.00000000",
          category_id: null,
          currency: "USD",
          memo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: lateFlowAccount.account_id,
          amount: "13.00000000",
          category_id: initialCategory.category_id,
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
  expect(response.ok(), await response.text()).toBe(true);
  const transaction = (await response.json()) as TransactionDetailFixture;

  const transactionRefresh = page.waitForResponse((refreshResponse) => {
    const url = new URL(refreshResponse.url());
    return (
      refreshResponse.request().method() === "GET" &&
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === memo
    );
  });
  await page.getByRole("searchbox", { name: "Search" }).fill(memo);
  await transactionRefresh;
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  await row.click();
  await page
    .getByTestId("bulk-action-bar")
    .getByRole("button", { name: "Categorize" })
    .click();
  const picker = page.getByTestId("bulk-action-picker");
  await expect(picker).toContainText(
    "1 of 1 selected will be skipped: no categorizable records",
  );
  await picker
    .getByRole("combobox", { name: "Category" })
    .fill(targetCategory.fqn);
  await picker.getByRole("combobox", { name: "Category" }).press("Enter");
  await picker.getByRole("button", { name: "Apply category" }).click();

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "0 updated, 1 skipped: no categorizable records." }),
  ).toBeVisible();
  const unchangedResponse = await page.request.get(
    `/api/transactions/${transaction.transaction_id}`,
  );
  expect(unchangedResponse.ok(), await unchangedResponse.text()).toBe(true);
  const unchanged =
    (await unchangedResponse.json()) as TransactionDetailFixture;
  expect(
    unchanged.records.find(
      (record) => record.account_id === lateFlowAccount.account_id,
    )?.category_id,
  ).toBe(initialCategory.category_id);
});

test("bulk selection keeps mutation targets after an edit changes the active filter", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const [targetCategory, tag] = await Promise.all([
    createCategory(page, `E2E:BulkFilter:${unique}:Category`, "expense"),
    createTag(page, `E2E:BulkFilter:${unique}:Tag`),
  ]);
  const selectedMemo = `E2E bulk filter ${unique} selected`;
  const guardMemo = `E2E bulk filter ${unique} guard`;
  const createSpend = async (memo: string, amount: string) => {
    const response = await page.request.post("/api/transactions/spend", {
      data: {
        amount,
        category_id: initialCategory.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-07-12",
        memo,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as TransactionDetailFixture;
  };
  const [selectedTransaction] = await Promise.all([
    createSpend(selectedMemo, "13.00"),
    createSpend(guardMemo, "17.00"),
  ]);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(`E2E bulk filter ${unique}`)}&category=${initialCategory.category_id}`,
  );
  const selectedRow = page
    .getByRole("row")
    .filter({ hasText: selectedMemo })
    .first();
  const guardRow = page.getByRole("row").filter({ hasText: guardMemo }).first();
  await expect(selectedRow).toBeVisible();
  await expect(guardRow).toBeVisible();

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await selectedRow.click();
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  await selectedRow
    .getByTestId(
      `transaction-${selectedTransaction.transaction_id}-category-bulk-cell`,
    )
    .hover();
  await selectedRow.getByRole("button", { name: "Bulk edit category" }).click();
  const categoryPicker = page.getByTestId(
    `transaction-${selectedTransaction.transaction_id}-category-bulk-editor`,
  );
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .fill(targetCategory.fqn);
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .press("Enter");
  await categoryPicker.getByRole("button", { name: "Apply category" }).click();

  await expect(selectedRow).toHaveCount(0);
  await expect(guardRow).toBeVisible();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("1 selected");
  await expect(
    bulkActionBar.getByRole("button", { name: "Categorize" }),
  ).toBeFocused();
  await bulkActionBar.getByRole("button", { name: "Tag" }).click();
  const tagPicker = page.getByTestId("bulk-action-picker");
  await tagPicker.getByRole("combobox", { name: "Tags to add" }).fill(tag.fqn);
  await tagPicker.getByRole("combobox", { name: "Tags to add" }).press("Enter");
  await tagPicker.getByRole("button", { name: "Add tags" }).click();

  await expect(tagPicker).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "1 updated, 0 skipped." }),
  ).toBeVisible();
  const updatedResponse = await page.request.get(
    `/api/transactions/${selectedTransaction.transaction_id}`,
  );
  expect(updatedResponse.ok(), await updatedResponse.text()).toBe(true);
  const updated = (await updatedResponse.json()) as TransactionDetailFixture;
  expect(
    updated.records.every((record) => record.tag_ids.includes(tag.tag_id)),
  ).toBe(true);
});

test("browser history navigation exits bulk mode before restoring transaction detail", async ({
  page,
}) => {
  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  const row = page
    .locator("tbody tr[data-transaction-id]")
    .filter({
      hasNot: page.getByRole("img", { name: "Expected" }),
    })
    .first();
  await clickRowAction(page, row, "Open transaction detail");
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();
  const detailUrl = page.url();

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await expect(detailPanel).toHaveCount(0);
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  await expect(bulkActionBar).toBeVisible();
  await page
    .locator("tbody tr[data-transaction-id]:not([aria-disabled='true'])")
    .first()
    .click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("1 selected");

  await page.goBack();
  await expect(bulkActionBar).toHaveCount(0);
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toHaveCount(0);
  for (let attempt = 0; attempt < 5 && page.url() !== detailUrl; attempt += 1) {
    await page.goBack();
  }
  await expect(page).toHaveURL(detailUrl);
  await expect(detailPanel).toBeVisible();
  await expect(
    detailPanel.getByRole("button", {
      name: "Edit transaction",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("button", { name: "Delete", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("tbody tr").first().getByRole("checkbox"),
  ).toHaveCount(0);
});

test("active Transactions navigation exits bulk mode", async ({ page }) => {
  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  await page
    .locator("tbody tr[data-transaction-id]:not([aria-disabled='true'])")
    .first()
    .click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("1 selected");

  await page.getByRole("link", { name: "Transactions" }).click();

  await expect(bulkActionBar).toHaveCount(0);
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toHaveCount(0);
  await expect(
    page.locator("tbody tr").first().getByRole("checkbox"),
  ).toHaveCount(0);
});

test("narrow row bulk shortcuts use the visible bulk bar editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  const row = page
    .locator("tbody tr[data-transaction-id]:not([aria-disabled='true'])")
    .first();
  const transactionId = await row.getAttribute("data-transaction-id");
  expect(transactionId).not.toBeNull();
  await row.click();
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  const bulkActionBarBounds = await bulkActionBar.boundingBox();
  expect(bulkActionBarBounds).not.toBeNull();
  expect(bulkActionBarBounds!.x).toBeGreaterThanOrEqual(0);
  expect(
    bulkActionBarBounds!.x + bulkActionBarBounds!.width,
  ).toBeLessThanOrEqual(390);

  const shortcuts = [
    {
      action: "category",
      barButton: "Categorize",
      combobox: "Category",
      key: "c",
    },
    {
      action: "tags",
      barButton: "Tag",
      combobox: "Tags to add",
      key: "t",
    },
    {
      action: "member",
      barButton: "Member",
      combobox: "Member",
      key: "m",
    },
  ] as const;
  for (const shortcut of shortcuts) {
    await row.focus();
    await page.keyboard.press(shortcut.key);
    const picker = bulkActionBar.getByTestId("bulk-action-picker");
    await expect(picker).toBeVisible();
    await expect(
      picker.getByRole("combobox", { name: shortcut.combobox }),
    ).toBeFocused();
    await expect(
      page.getByTestId(
        `transaction-${transactionId}-${shortcut.action}-bulk-editor`,
      ),
    ).toHaveCount(0);
    await picker
      .getByRole("button", { name: "Close bulk action picker" })
      .click();
    await expect(picker).toHaveCount(0);
    await expect(
      bulkActionBar.getByRole("button", { name: shortcut.barButton }),
    ).toBeFocused();
  }
});

test("bulk action surface remains visible for an empty transaction result", async ({
  page,
}, testInfo) => {
  const missing = `no-bulk-results-${testInfo.project.name}-${Date.now()}`;
  await page.goto(`/transactions?q=${encodeURIComponent(missing)}`);
  await expect(
    page.getByRole("heading", { name: "No transactions" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("0 selected");
  await expect(page.getByTestId("bulk-action-bar")).not.toContainText(
    "selected",
  );
  await expect(page.getByRole("button", { name: "Select page" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Clear" })).toHaveCount(0);
  await expect(
    page
      .getByTestId("transaction-browser-bulk-mode-bar")
      .getByRole("button", { name: "Done" }),
  ).toBeFocused();
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  const categorizeRemedy = bulkActionBar
    .getByRole("button", { name: "Categorize" })
    .locator("..");
  const tagRemedy = bulkActionBar
    .getByRole("button", { name: "Tag" })
    .locator("..");
  const memberRemedy = bulkActionBar
    .getByRole("button", { name: "Member" })
    .locator("..");
  await expect(categorizeRemedy).toHaveAttribute("tabindex", "0");
  await expect(tagRemedy).toHaveAttribute("tabindex", "0");
  await expect(memberRemedy).toHaveAttribute("tabindex", "0");
  for (const action of ["Pending", "Posted", "Reconcile", "Unreconcile"]) {
    const remedy = bulkActionBar
      .getByRole("button", { exact: true, name: action })
      .locator("..");
    await expect(remedy).toHaveAttribute("tabindex", "0");
    await remedy.focus();
    await expect(page.getByRole("tooltip")).toHaveText(
      "Select transactions first",
    );
  }
  await categorizeRemedy.focus();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Select transactions first",
  );
});

test("bulk mode removes the empty actions column at wide widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  await page.goto("/transactions?page=1&pageSize=50");
  const table = page.locator("table.transactions-table");
  await expect(table).toBeVisible();

  await page.getByRole("button", { name: "Bulk edit" }).click();

  await expect(table.locator("col.transactions-actions-column")).toBeHidden();
  await expect(
    table.locator("thead .transactions-actions-column"),
  ).toBeHidden();
  await expect(
    table.locator("tbody .transactions-actions-column").first(),
  ).toBeHidden();
});

test("bulk mode leaves amount chip shadows unclipped", async ({ page }) => {
  await page.goto("/transactions?page=1&pageSize=50");
  const row = page.locator("tbody tr[data-transaction-id]").first();
  const amountContainer = row.locator("td.transactions-amount-column > div");
  await expect(amountContainer).toBeVisible();

  await page.getByRole("button", { name: "Bulk edit" }).click();

  await expect(amountContainer).toHaveCSS("overflow", "visible");
});

test("bulk action surface remains visible during initial loading and errors", async ({
  page,
}) => {
  let releaseTransactions: (() => void) | undefined;
  const transactionRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/transactions**", async (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().method() !== "GET" ||
        url.pathname !== "/api/transactions"
      ) {
        await route.continue();
        return;
      }
      resolve();
      await new Promise<void>((release) => {
        releaseTransactions = release;
      });
      await route.fulfill({
        contentType: "application/json",
        json: { message: "Transaction loading failed" },
        status: 500,
      });
    });
  });

  await page.goto("/transactions?page=1&pageSize=50");
  await transactionRequestStarted;
  await expect(page.locator("[data-slot='skeleton']").first()).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("0 selected");

  releaseTransactions?.();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Transactions could not be loaded" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("0 selected");
});

test("bulk selection clears when a filtered snapshot replaces retained rows", async ({
  page,
}, testInfo) => {
  await page.goto("/transactions?page=1&pageSize=50");
  const retainedRow = page
    .locator("tbody tr[data-transaction-id]:not([aria-disabled='true'])")
    .first();
  await expect(retainedRow).toBeVisible();

  const missing = `no-filter-results-${testInfo.project.name}-${Date.now()}`;
  let releaseFilteredResponse: (() => void) | undefined;
  const filteredRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/transactions**", async (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().method() !== "GET" ||
        url.pathname !== "/api/transactions" ||
        url.searchParams.get("search") !== missing
      ) {
        await route.continue();
        return;
      }

      resolve();
      await new Promise<void>((release) => {
        releaseFilteredResponse = release;
      });
      await route.fulfill({
        contentType: "application/json",
        json: { offset: 0, total_count: 0, transactions: [] },
      });
    });
  });

  await page.getByRole("searchbox", { name: "Search" }).fill(missing);
  await filteredRequestStarted;

  try {
    await page.getByRole("button", { name: "Bulk edit" }).click();
    await retainedRow.click();
    await expect(
      page.getByTestId("transaction-browser-bulk-mode-bar"),
    ).toContainText("1 selected");
  } finally {
    releaseFilteredResponse?.();
  }

  await expect(
    page.getByRole("heading", { name: "No transactions" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("0 selected");
});

test("switching bulk edit mode preserves the transaction list scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/transactions?page=1&pageSize=50");
  const tableScroll = page.getByTestId("transactions-table-scroll");
  await expect(tableScroll).toBeVisible();
  await tableScroll.evaluate((element) => {
    element.scrollTop = Math.min(
      160,
      element.scrollHeight - element.clientHeight,
    );
  });
  const initialScrollTop = await tableScroll.evaluate(
    (element) => element.scrollTop,
  );
  expect(initialScrollTop).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await expect(tableScroll).toBeVisible();
  expect(await tableScroll.evaluate((element) => element.scrollTop)).toBe(
    initialScrollTop,
  );

  await page
    .getByTestId("transaction-browser-bulk-mode-bar")
    .getByRole("button", { name: "Done" })
    .click();
  expect(await tableScroll.evaluate((element) => element.scrollTop)).toBe(
    initialScrollTop,
  );
});

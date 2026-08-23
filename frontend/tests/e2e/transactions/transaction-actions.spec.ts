import type { Page } from "@playwright/test";
import { test } from "@tests/e2e/test";
import {
  createAccount,
  createCategory,
  createExpectedRecurringFixture,
  createMember,
  createTag,
  expect,
  hideAccount,
  hideCategory,
  hideMember,
  hideTag,
  type TransactionDetailFixture,
} from "@tests/e2e/transactions/support";

const confirmPostDate = async (page: Page) => {
  await page
    .getByRole("alertdialog")
    .getByRole("button", { exact: true, name: "Post transaction" })
    .click();
};

test("recurring quick action preserves crypto token case", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const currency = "C::stETH";
  const [wallet, counterparty, category] = await Promise.all([
    createAccount(
      page,
      `e2e:CryptoRecurring:${unique}:Wallet`,
      "owned",
      currency,
    ),
    createAccount(
      page,
      `e2e:CryptoRecurring:${unique}:Counterparty`,
      "flow",
      currency,
    ),
    createCategory(page, `E2E:CryptoRecurring:${unique}:Expense`, "expense"),
  ]);
  const memo = `Crypto recurring ${unique}`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-08-02",
      records: [
        {
          account_id: wallet.account_id,
          amount: "-1.00",
          category_id: null,
          currency,
          memo,
          reconciliation_status: "unreconciled",
          settlement: { status: "posted" },
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: counterparty.account_id,
          amount: "1.00",
          category_id: category.category_id,
          currency,
          memo,
          reconciliation_status: "unreconciled",
          settlement: null,
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await editor
    .getByLabel("Definition FQN")
    .fill(`E2E:CryptoRecurring:${unique}:Definition`);
  const createDefinitionRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/recurring-definitions",
  );
  await editor.getByRole("button", { name: "Save definition" }).click();
  const body = (await (await createDefinitionRequest).postDataJSON()) as {
    readonly records: readonly { readonly currency: string }[];
  };
  expect(body.records.map((record) => record.currency)).toEqual([
    currency,
    currency,
  ]);
  await expect(editor).toBeHidden();
});

test("recurring quick action shows retained hidden references", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [wallet, counterparty, otherFlow, category, member, tag] =
    await Promise.all([
      createAccount(
        page,
        `e2e:HiddenRecurring:${unique}:Wallet`,
        "owned",
        "USD",
      ),
      createAccount(page, `e2e:HiddenRecurring:${unique}:Flow`, "flow", "USD"),
      createAccount(
        page,
        `e2e:AvailableRecurring:${unique}:Flow`,
        "flow",
        "USD",
      ),
      createCategory(page, `E2E:HiddenRecurring:${unique}:Expense`, "expense"),
      createMember(page, `E2E Hidden Recurring ${unique}`),
      createTag(page, `E2E:HiddenRecurring:${unique}:Tag`),
    ]);
  const memo = `Hidden recurring ${unique}`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-08-02",
      records: [
        {
          account_id: wallet.account_id,
          amount: "-2.00",
          category_id: null,
          currency: "USD",
          member_id: member.member_id,
          memo,
          reconciliation_status: "unreconciled",
          settlement: { status: "posted" },
          source: "manual",
          tag_ids: [tag.tag_id],
        },
        {
          account_id: counterparty.account_id,
          amount: "2.00",
          category_id: category.category_id,
          currency: "USD",
          member_id: member.member_id,
          memo,
          reconciliation_status: "unreconciled",
          settlement: null,
          source: "manual",
          tag_ids: [tag.tag_id],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;
  await Promise.all([
    hideAccount(page, wallet),
    hideAccount(page, counterparty),
    hideCategory(page, category),
    hideMember(page, member),
    hideTag(page, tag),
  ]);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  const records = editor.getByLabel("Definition records").locator("section");
  await expect(records.nth(0).getByLabel("Account")).toHaveValue(wallet.fqn);
  await expect(records.nth(1).getByLabel("Account")).toHaveValue(
    counterparty.fqn,
  );
  await expect(records.nth(1).getByLabel("Category")).toHaveValue(category.fqn);
  await expect(records.nth(0).getByLabel("Member")).toHaveValue(member.name);
  await expect(
    records.nth(0).getByRole("button", { name: `Remove ${tag.name}` }),
  ).toBeVisible();
  await expect(
    records.nth(1).getByLabel("Hidden", { exact: true }),
  ).toHaveCount(4);

  await editor.getByRole("button", { name: "Add record" }).click();
  const unseededRecord = records.nth(2);
  for (const [label, hiddenLabel] of [
    ["Account", wallet.fqn],
    ["Tags", tag.name],
    ["Member", member.name],
  ] as const) {
    const picker = unseededRecord.getByLabel(label);
    await picker.fill(unique);
    await expect(
      page.getByRole("option").filter({ hasText: hiddenLabel }),
    ).toHaveCount(0);
    await editor.getByLabel("Definition FQN").click();
  }
  await unseededRecord.getByLabel("Account").fill(otherFlow.fqn);
  await unseededRecord.getByLabel("Account").press("Enter");
  const categoryPicker = unseededRecord.getByLabel("Category");
  await categoryPicker.fill(unique);
  await expect(
    page.getByRole("option").filter({ hasText: category.fqn }),
  ).toHaveCount(0);
});

test("recurring save restores focus when its source leaves the page", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [wallet, merchant, category] = await Promise.all([
    createAccount(page, `e2e:RecurringFocus:${unique}:Wallet`, "owned", "USD"),
    createAccount(page, `e2e:RecurringFocus:${unique}:Merchant`, "flow"),
    createCategory(page, `E2E:RecurringFocus:${unique}:Expense`, "expense"),
  ]);
  const memo = `Recurring focus ${unique}`;
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "1.00",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: wallet.account_id,
      initiated_date: "2026-08-02",
      memo,
      tag_ids: [],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  const tableScroll = page.getByTestId("transactions-table-scroll");
  await tableScroll.evaluate((element) => {
    element.style.flex = "none";
    element.style.height = "1px";
  });
  await editor.getByRole("button", { name: "Close definition editor" }).click();
  await expect(
    page.getByTestId("transactions-pagination-footer"),
  ).toBeFocused();
  await tableScroll.evaluate((element) => {
    element.style.removeProperty("flex");
    element.style.removeProperty("height");
  });
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  await editor
    .getByLabel("Definition FQN")
    .fill(`E2E:RecurringFocus:${unique}:Definition`);

  await page.route("**/api/transactions?*", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      total_count: number;
      transactions: TransactionDetailFixture[];
    };
    await route.fulfill({
      response,
      json: {
        ...body,
        total_count: 0,
        transactions: [],
      },
    });
  });
  let releaseCatchup!: () => void;
  let markCatchupStarted!: () => void;
  const catchupStarted = new Promise<void>((resolve) => {
    markCatchupStarted = resolve;
  });
  const catchupReleased = new Promise<void>((resolve) => {
    releaseCatchup = resolve;
  });
  await page.route("**/api/recurring-occurrences?*", async (route) => {
    markCatchupStarted();
    await catchupReleased;
    await route.continue();
  });
  await editor.getByRole("button", { name: "Save definition" }).click();

  await expect(editor).toBeHidden();
  await catchupStarted;
  await expect(
    row.getByRole("button", { name: "More row actions" }),
  ).toBeFocused();
  releaseCatchup();
  await expect(row).toHaveCount(0);
  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeFocused();
});

test("recurring quick action finishes lookup loading after navigation", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [wallet, merchant, category] = await Promise.all([
    createAccount(page, `e2e:RecurringLookup:${unique}:Wallet`, "owned", "USD"),
    createAccount(page, `e2e:RecurringLookup:${unique}:Merchant`, "flow"),
    createCategory(page, `E2E:RecurringLookup:${unique}:Expense`, "expense"),
  ]);
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "1.00",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: wallet.account_id,
      initiated_date: "2026-08-02",
      memo: `Recurring lookup ${unique}`,
      tag_ids: [],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  let releaseAccounts!: () => void;
  const accountsReleased = new Promise<void>((resolve) => {
    releaseAccounts = resolve;
  });
  await page.route("**/api/accounts?*", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("include_tombstoned") ===
      "true"
    ) {
      await accountsReleased;
    }
    await route.continue();
  });

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  const accountPicker = editor.getByLabel("Account").first();
  await expect(accountPicker).toHaveValue("");
  await page.getByRole("link", { exact: true, name: "Status" }).click();
  releaseAccounts();

  await expect(accountPicker).toHaveValue(wallet.fqn);
});

test("recurring save preserves transaction rows when refresh fails", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [wallet, merchant, category] = await Promise.all([
    createAccount(
      page,
      `e2e:RecurringRefresh:${unique}:Wallet`,
      "owned",
      "USD",
    ),
    createAccount(page, `e2e:RecurringRefresh:${unique}:Merchant`, "flow"),
    createCategory(page, `E2E:RecurringRefresh:${unique}:Expense`, "expense"),
  ]);
  const memo = `Recurring refresh ${unique}`;
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "1.00",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: wallet.account_id,
      initiated_date: "2026-08-02",
      memo,
      tag_ids: [],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await editor
    .getByLabel("Definition FQN")
    .fill(`E2E:RecurringRefresh:${unique}:Definition`);

  await page.route("**/api/transactions?*", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "internal_error", message: "refresh unavailable" },
      }),
      contentType: "application/json",
      status: 500,
    });
  });
  await editor.getByRole("button", { name: "Save definition" }).click();

  await expect(editor).toBeHidden();
  await expect(row).toBeVisible();
  await expect(page.getByText("Transactions may be stale.")).toBeVisible();
});

test("recurring save retries failed occurrence catch-up before refresh", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [wallet, merchant, category] = await Promise.all([
    createAccount(
      page,
      `e2e:RecurringCatchup:${unique}:Wallet`,
      "owned",
      "USD",
    ),
    createAccount(page, `e2e:RecurringCatchup:${unique}:Merchant`, "flow"),
    createCategory(page, `E2E:RecurringCatchup:${unique}:Expense`, "expense"),
  ]);
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "1.00",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: wallet.account_id,
      initiated_date: "2026-08-02",
      memo: `Recurring catch-up ${unique}`,
      tag_ids: [],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await editor
    .getByLabel("Definition FQN")
    .fill(`E2E:RecurringCatchup:${unique}:Definition`);

  let catchupRequests = 0;
  let transactionRefreshes = 0;
  await page.route("**/api/recurring-occurrences?*", async (route) => {
    catchupRequests += 1;
    if (catchupRequests <= 2) {
      await route.fulfill({
        contentType: "application/json",
        json: {
          error: { code: "temporary_failure", message: "Catch-up failed." },
        },
        status: 503,
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/transactions?*", async (route) => {
    transactionRefreshes += 1;
    await route.continue();
  });
  await editor.getByRole("button", { name: "Save definition" }).click();

  await expect(page.getByText("Transactions may be stale.")).toBeVisible();
  await expect.poll(() => catchupRequests).toBe(2);
  expect(transactionRefreshes).toBe(0);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => catchupRequests).toBe(3);
  await expect(page.getByText("Transactions may be stale.")).toBeHidden();
  await expect.poll(() => transactionRefreshes).toBeGreaterThan(0);
});

test("cold transaction catch-up failures can be retried", async ({ page }) => {
  let catchupRequests = 0;
  let transactionRequests = 0;
  await page.route("**/api/recurring-occurrences?*", async (route) => {
    catchupRequests += 1;
    if (catchupRequests === 1) {
      await route.fulfill({
        contentType: "application/json",
        json: {
          error: { code: "temporary_failure", message: "Catch-up failed." },
        },
        status: 503,
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/transactions?*", async (route) => {
    transactionRequests += 1;
    await route.continue();
  });

  await page.goto("/transactions?page=1&pageSize=50");

  await expect(
    page.getByText("Transactions could not be loaded."),
  ).toBeVisible();
  expect(transactionRequests).toBe(0);

  await page.getByRole("button", { name: "Retry" }).click();

  await expect(
    page.getByText("Transactions could not be loaded."),
  ).toBeHidden();
  await expect.poll(() => catchupRequests).toBe(2);
  await expect.poll(() => transactionRequests).toBe(1);
});

test("transaction refreshes wait for recurring catch-up", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [wallet, merchant, category] = await Promise.all([
    createAccount(page, `e2e:RecurringRace:${unique}:Wallet`, "owned", "USD"),
    createAccount(page, `e2e:RecurringRace:${unique}:Merchant`, "flow"),
    createCategory(page, `E2E:RecurringRace:${unique}:Expense`, "expense"),
  ]);
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "1.00",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: wallet.account_id,
      initiated_date: "2026-08-02",
      memo: `Recurring race ${unique}`,
      tag_ids: [],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await editor
    .getByLabel("Definition FQN")
    .fill(`E2E:RecurringRace:${unique}:Definition`);

  let releaseCatchup: (() => void) | undefined;
  let markCatchupStarted: (() => void) | undefined;
  const catchupStarted = new Promise<void>((resolve) => {
    markCatchupStarted = resolve;
  });
  const catchupReleased = new Promise<void>((resolve) => {
    releaseCatchup = resolve;
  });
  await page.route("**/api/recurring-occurrences?*", async (route) => {
    markCatchupStarted?.();
    await catchupReleased;
    await route.continue();
  });
  let transactionRequests = 0;
  await page.route("**/api/transactions?*", async (route) => {
    transactionRequests += 1;
    await route.continue();
  });

  await editor.getByRole("button", { name: "Save definition" }).click();
  await catchupStarted;
  await page.getByRole("button", { name: "Edit mode" }).click();
  const amountInput = page.getByTestId(
    `transaction-${transaction.transaction_id}-amount-input`,
  );
  await amountInput.fill("2.00");
  await expect(amountInput).toHaveValue("2.00");
  const saveResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT",
  );
  await amountInput.press("Enter");
  await saveResponse;

  expect(transactionRequests).toBe(0);
  await page.getByRole("button", { name: "Done" }).click();
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { name: "Delete transaction" })
    .click();
  const deleteResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "DELETE",
  );
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete transaction" })
    .click();
  await deleteResponse;
  expect(transactionRequests).toBe(0);
  releaseCatchup?.();

  await expect.poll(() => transactionRequests).toBeGreaterThan(0);
  await expect(row).toHaveCount(0);
});

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
  const row = page.locator(`[data-transaction-id="${created.transaction_id}"]`);
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
  ]) {
    await expect(
      rowActions.getByRole("button", { exact: true, name: action }),
    ).toBeVisible();
  }
  await expect(
    rowActions.getByRole("button", { name: "Open transaction detail" }),
  ).toHaveCount(0);
  const overflowTrigger = row.getByRole("button", {
    name: "More row actions",
  });
  await expect(overflowTrigger).toBeVisible();
  await overflowTrigger.click();
  const overflowMenu = page.locator(".row-actions-menu:visible");
  for (const action of [
    "Create template",
    "Create recurring",
    "Split transaction",
    "Delete transaction",
  ]) {
    await expect(
      overflowMenu.getByRole("button", { exact: true, name: action }),
    ).toBeVisible();
  }
  await expect(
    overflowMenu.getByRole("button", {
      exact: true,
      name: "Duplicate transaction",
    }),
  ).toHaveCount(0);
  await overflowMenu
    .getByRole("button", { exact: true, name: "Split transaction" })
    .click();
  const splitEditor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(splitEditor).toBeVisible();
  await splitEditor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await expect(overflowTrigger).toBeFocused();

  await overflowTrigger.click();
  await overflowMenu
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  const recurringEditor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await expect(recurringEditor).toBeVisible();
  await expect(recurringEditor).toBeFocused();
  await page.keyboard.press("KeyN");
  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Command palette" }),
  ).toHaveCount(0);
  await expect(recurringEditor).toBeVisible();
  const seededRecords = recurringEditor
    .getByLabel("Definition records")
    .locator("section");
  await expect(seededRecords).toHaveCount(3);
  await expect(seededRecords.nth(0).getByLabel("Amount")).toHaveValue(
    "-25.00000000",
  );
  await expect(seededRecords.nth(1).getByLabel("Amount")).toHaveValue(
    "20.00000000",
  );
  await expect(seededRecords.nth(2).getByLabel("Amount")).toHaveValue(
    "5.00000000",
  );
  await expect(seededRecords.nth(0).getByLabel("Memo")).toHaveValue(memo);
  await page.evaluate(() => {
    const NativeMutationObserver = window.MutationObserver;
    document.documentElement.dataset.activeDocumentMutationObservers = "0";
    window.MutationObserver = class extends NativeMutationObserver {
      private monitoringDocument = false;

      override disconnect() {
        if (this.monitoringDocument) {
          this.monitoringDocument = false;
          const current = Number(
            document.documentElement.dataset.activeDocumentMutationObservers,
          );
          document.documentElement.dataset.activeDocumentMutationObservers =
            String(current - 1);
        }
        super.disconnect();
      }

      override observe(target: Node, options?: MutationObserverInit) {
        if (
          !this.monitoringDocument &&
          target === document.body &&
          options?.childList &&
          options.subtree
        ) {
          this.monitoringDocument = true;
          const current = Number(
            document.documentElement.dataset.activeDocumentMutationObservers,
          );
          document.documentElement.dataset.activeDocumentMutationObservers =
            String(current + 1);
        }
        super.observe(target, options);
      }
    };
  });
  await recurringEditor
    .getByRole("button", { name: "Close definition editor" })
    .click();
  await expect(overflowTrigger).toBeFocused();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      }),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(
          document.documentElement.dataset.activeDocumentMutationObservers,
        ),
      ),
    )
    .toBe(0);

  await overflowTrigger.click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  await expect(recurringEditor).toBeFocused();
  await recurringEditor
    .getByLabel("Definition FQN")
    .fill(`E2E:SavedRecurring:${unique}`);
  await recurringEditor
    .getByRole("button", { name: "Save definition" })
    .click();
  await expect(recurringEditor).toBeHidden();
  await expect(overflowTrigger).toBeFocused();
  await expect(row).toBeVisible();

  await overflowTrigger.click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  const routeIndependentFqn = `E2E:MountedRecurring:${unique}`;
  await recurringEditor.getByLabel("Definition FQN").fill(routeIndependentFqn);
  await page.getByRole("link", { exact: true, name: "Recurring" }).click();
  const localNewDefinition = page.getByRole("button", {
    name: "New definition",
  });
  await localNewDefinition.focus();
  await expect(localNewDefinition).not.toBeFocused();
  await expect(
    page.getByRole("complementary", { name: /recurring definition/ }),
  ).toHaveCount(1);
  await recurringEditor
    .getByRole("button", { name: "Save definition" })
    .click();
  await expect(
    page
      .getByTestId("recurring-definition-row")
      .filter({ hasText: routeIndependentFqn }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recurring" })).toBeFocused();
  await page.getByRole("link", { exact: true, name: "Transactions" }).click();
  await expect(row).toBeVisible();

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
  for (const action of ["Edit transaction"]) {
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
    "Create template",
    "Create recurring",
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

  const detailRecurringAction = footer.getByRole("button", {
    exact: true,
    name: "Create recurring",
  });
  await detailRecurringAction.click();
  const detailRecurringEditor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  const unsavedRecurringFqn = `E2E:UnsavedRecurring:${unique}`;
  await detailRecurringEditor
    .getByLabel("Definition FQN")
    .fill(unsavedRecurringFqn);
  await detailRecurringAction.focus();
  await detailRecurringAction.press("Enter");
  await expect(detailRecurringEditor.getByLabel("Definition FQN")).toHaveValue(
    unsavedRecurringFqn,
  );
  await expect(detail).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("transaction"))
    .toBe(String(created.transaction_id));
  await detailRecurringEditor
    .getByRole("button", { name: "Close definition editor" })
    .click();
  await expect(detailRecurringAction).toBeFocused();

  await detailRecurringAction.click();
  await expect(detailRecurringEditor).toBeVisible();
  await expect(detailRecurringEditor).toBeFocused();
  await row.locator(".transactions-description-column").click();
  await expect(detail).toBeHidden();
  await detailRecurringEditor
    .getByRole("button", { name: "Close definition editor" })
    .click();
  await expect(row).toBeFocused();
  await row.click();
  await expect(detail).toBeVisible();

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
  await expect(overflowTrigger).toBeVisible();
  await expect(overflowTrigger).toBeFocused();
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
  const overflowTrigger = row.getByRole("button", {
    name: "More row actions",
  });
  await overflowTrigger.click();
  await expect(
    page
      .locator(".row-actions-menu:visible")
      .getByRole("button", { exact: true, name: "Create recurring" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await row.click();
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(
    detail.getByRole("button", { exact: true, name: "Create recurring" }),
  ).toBeVisible();
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
    await row.getByRole("button", { name: "More row actions" }).click();
    await expect(
      page
        .locator(".row-actions-menu:visible")
        .getByRole("button", { exact: true, name: "Split transaction" }),
    ).toHaveCount(item.eligible ? 1 : 0);
    await page.keyboard.press("Escape");
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

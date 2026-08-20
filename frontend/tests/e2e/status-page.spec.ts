import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly fqn: string;
}

interface BalanceFixture {
  readonly account_id: number;
  readonly currency: string;
  readonly current_balance: string;
  readonly remaining_credit?: string;
}

const createAccount = async (
  page: Page,
  fqn: string,
  accountType: "flow" | "owned" | "party",
  currency?: string,
  isFeatured = false,
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency,
      fqn,
      is_featured: isFeatured,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as AccountFixture;
};

const updateAccountFeatured = async (
  page: Page,
  account: AccountFixture,
  isFeatured: boolean,
): Promise<void> => {
  const response = await page.request.patch(
    `/api/accounts/${account.account_id}`,
    {
      data: {
        is_featured: isFeatured,
      },
    },
  );
  expect(response.ok()).toBe(true);
};

const createCreditLimit = async (
  page: Page,
  account: AccountFixture,
  creditLimit: string,
): Promise<void> => {
  const response = await page.request.post(
    `/api/accounts/${account.account_id}/credit-limit-history`,
    {
      data: {
        credit_limit: creditLimit,
        effective_date: "2026-05-01",
      },
    },
  );
  expect(response.ok()).toBe(true);
};

const getAccountBalance = async (
  page: Page,
  account: AccountFixture,
): Promise<BalanceFixture> => {
  const response = await page.request.get(
    `/api/accounts/balances?account_ids=${account.account_id}`,
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    readonly balances: readonly BalanceFixture[];
  };
  const balance = body.balances.find(
    (candidate) => candidate.account_id === account.account_id,
  );
  expect(balance).toBeDefined();
  return balance as BalanceFixture;
};

const createCategory = async (
  page: Page,
  fqn: string,
): Promise<CategoryFixture> => {
  const response = await page.request.post("/api/categories", {
    data: {
      economic_intent: "expense",
      fqn,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as CategoryFixture;
};

const chooseOptionByKeyboard = async (
  page: Page,
  label: string,
  searchText: string,
  optionValue: string,
) => {
  const picker = page.getByRole("combobox", { name: label });
  await picker.click();
  await expect(picker).toBeFocused();
  await picker.fill("");
  await picker.fill(searchText);
  await expect(picker).toHaveValue(searchText);
  const optionListId = await picker.getAttribute("aria-controls");
  expect(optionListId).not.toBeNull();
  const optionList = page.locator(`#${optionListId}`);
  const optionByValue = optionList
    .getByRole("option")
    .filter({ hasText: optionValue });
  await expect
    .poll(async () => await optionByValue.count(), { timeout: 10000 })
    .toBeGreaterThan(0);
  const option = optionByValue.first();
  await expect(option).toBeVisible({ timeout: 10000 });
  const optionId = (await option.getAttribute("id")) ?? "";
  await picker.press("ArrowDown");
  await picker.press("ArrowUp");
  await expect(picker).toHaveAttribute("aria-activedescendant", optionId);
  await picker.press("Enter");
  await expect.poll(async () => picker.inputValue()).toContain(searchText);
};

const databaseFileSizeValue = (page: Page) =>
  page
    .getByText("Database file size", { exact: true })
    .locator("../..")
    .locator('[data-slot="card-content"] > p');

test("status page reports backend health", async ({ page }) => {
  await page.goto("/status");

  await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
  await expect(page.getByText("API status")).toBeVisible();
  await expect(page.getByText("ok")).toBeVisible();
  await expect(page.getByText("Schema version")).toBeVisible();
  await expect(page.getByText("Server time")).toBeVisible();
  await expect(databaseFileSizeValue(page)).toHaveText(
    /^\d+(?:\.\d)? (?:KiB|MiB|GiB|TiB)$/,
  );
  await expect(page.getByText("Database encryption")).toBeVisible();
  await expect(page.getByText("Not encrypted")).toBeVisible();
  await expect(page.getByText("GMT")).toHaveCount(0);

  await expect(
    page.getByText(
      "Backend health, background work, and API mutation history for this Mina process.",
    ),
  ).toBeHidden();
  await page.getByRole("button", { name: "Status help" }).click();
  await expect(
    page.getByText(
      "Backend health, background work, and API mutation history for this Mina process.",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText(
      "Backend health, background work, and API mutation history for this Mina process.",
    ),
  ).toBeHidden();
});

test("status page reports an encrypted database", async ({ page }) => {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        database_encrypted: true,
        database_file_size_bytes: 1048575,
        schema_version: 1,
        status: "ok",
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/status");

  await expect(page.getByText("Database encryption")).toBeVisible();
  await expect(page.getByText("Encrypted", { exact: true })).toBeVisible();
  await expect(page.getByText("Not encrypted")).toHaveCount(0);
  await expect(databaseFileSizeValue(page)).toHaveText("1 MiB");
});

test("status page reports an unavailable database file size", async ({
  page,
}) => {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        database_encrypted: false,
        database_file_size_bytes: null,
        schema_version: 1,
        status: "ok",
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/status");

  await expect(databaseFileSizeValue(page)).toHaveText("Unavailable");
  await expect(page.getByText("ok", { exact: true })).toBeVisible();
});

test("status page navigates operations and inspects a web UI audit mutation", async ({
  page,
}) => {
  const firstRunResponse = await page.request.post(
    "/api/background-operations/exchange-rate-loading/runs",
  );
  expect(firstRunResponse.status()).toBe(202);
  const firstRun = (await firstRunResponse.json()) as {
    readonly operation_run_id: number;
  };
  const secondRunResponse = await page.request.post(
    "/api/background-operations/exchange-rate-loading/runs",
  );
  expect(secondRunResponse.status()).toBe(202);
  const secondRun = (await secondRunResponse.json()) as {
    readonly operation_run_id: number;
  };

  await page.goto("/status");
  const largeIntegerMutationStatus = await page.evaluate(async () => {
    const response = await fetch("/api/tags", {
      body: '{"fqn":"Audit:LargeInteger","extra":9007199254740993}',
      headers: {
        "Content-Type": "application/json",
        "X-Mina-Client-Surface": "web-ui",
      },
      method: "POST",
    });
    return response.status;
  });
  expect(largeIntegerMutationStatus).toBe(400);
  const backupRunResponse = await page.request.post(
    "/api/background-operations/database-backup/runs",
  );
  expect(backupRunResponse.status()).toBe(202);
  const backupRun = (await backupRunResponse.json()) as {
    readonly operation_run_id: number;
  };

  const operationSelect = page.getByRole("combobox", { name: "Operation" });
  await operationSelect.click();
  await expect(
    page.getByTestId("select-option-exchange-rate-loading"),
  ).toBeVisible();
  await expect(page.getByTestId("select-option-database-backup")).toBeVisible();
  await expect(
    page.getByTestId("select-option-audit-log-compaction"),
  ).toBeVisible();
  await page.getByTestId("select-option-database-backup").click();
  await expect(page).toHaveURL(/operation=database-backup/);

  const backupRunsTable = page.getByTestId("operation-runs-table");
  const backupRows = backupRunsTable.locator("tbody tr");
  await expect
    .poll(async () => await backupRows.count(), { timeout: 10000 })
    .toBeGreaterThan(0);
  await expect(
    backupRunsTable.getByRole("columnheader", { name: "Started" }),
  ).toBeVisible();
  await expect(
    backupRunsTable.getByRole("columnheader", { name: "Finished / duration" }),
  ).toBeVisible();
  await expect(
    backupRunsTable.getByRole("columnheader", { name: "Trigger" }),
  ).toBeVisible();
  await expect(
    backupRunsTable.getByRole("columnheader", { name: "Outcome" }),
  ).toBeVisible();
  await backupRows.first().click();
  const backupDetail = page.getByTestId("operation-run-detail");
  await expect(backupDetail).toContainText("Database backup");
  await expect(backupDetail).toContainText("Local database backup");
  await expect(backupDetail).toContainText(String(backupRun.operation_run_id));

  await operationSelect.click();
  await page.getByTestId("select-option-exchange-rate-loading").click();

  await expect(page).toHaveURL(/operation=exchange-rate-loading/);
  await expect(page).toHaveURL(/runsPage=1/);
  await expect(page).toHaveURL(/runsPageSize=25/);

  const runsTable = page.getByTestId("operation-runs-table");
  const runRows = runsTable.locator("tbody tr");
  await expect.poll(async () => await runRows.count()).toBeGreaterThan(1);
  await expect(runRows.first()).toContainText(
    String(secondRun.operation_run_id),
  );
  await expect(runRows.nth(1)).toContainText(String(firstRun.operation_run_id));

  await runRows.first().click();
  const detail = page.getByTestId("operation-run-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Exchange-rate loading");
  await expect(detail).toContainText("Rate load and USD backfill");

  await page.goto(
    "/status?operation=exchange-rate-loading&runsPage=1&runsPageSize=50",
  );
  await expect(
    page.getByRole("combobox", { name: "Rows per page" }),
  ).toContainText("50");
  await expect(page).toHaveURL(
    /operation=exchange-rate-loading&runsPage=1&runsPageSize=50/,
  );

  await operationSelect.click();
  await page.getByTestId("select-option-audit-log-compaction").click();
  await expect(page).toHaveURL(/operation=audit-log-compaction/);
  await page.getByRole("button", { name: "Run now" }).click();
  const compactionDetail = page.getByTestId("operation-run-detail");
  await expect(compactionDetail).toContainText("API audit-log compaction");
  await expect(compactionDetail).toContainText(
    "Expired audit-history deletion",
  );

  await page.getByRole("tab", { name: "Audit log" }).click();
  await expect(page).toHaveURL(/tab=audit-log/);
  await expect(page.getByRole("checkbox", { name: "Details" })).toHaveCount(0);
  await expect(page.getByText("Backend health route")).toHaveCount(0);

  await page.getByRole("combobox", { name: "Surface filter" }).click();
  await page.getByTestId("select-option-web-ui").click();
  await page
    .getByRole("textbox", { name: "Operation ID filter" })
    .fill("startAuditLogCompactionRun");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/auditSurface=web-ui/);
  await expect(page).toHaveURL(/auditOperation=startAuditLogCompactionRun/);
  await expect(page).toHaveURL(/auditPage=1/);
  await expect(page).toHaveURL(/auditPageSize=25/);

  const auditRows = page.getByTestId("audit-log-table").locator("tbody tr");
  await expect(auditRows).toHaveCount(1);
  await expect(auditRows.first()).toContainText("web-ui");
  await expect(auditRows.first()).toContainText("POST");
  await expect(auditRows.first()).toContainText("startAuditLogCompactionRun");
  await auditRows.first().click();
  await expect(page).toHaveURL(/auditEntry=\d+/);

  const auditDetail = page.getByTestId("audit-entry-detail");
  await expect(auditDetail).toContainText("No request JSON body.");
  await expect(auditDetail).toContainText(
    '"operation_id": "audit-log-compaction"',
  );
  await page.reload();
  await expect(page.getByTestId("audit-entry-detail")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Audit log" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page
    .getByRole("textbox", { name: "Operation ID filter" })
    .fill("createTag");
  await page.getByRole("button", { name: "Apply" }).click();
  const largeIntegerAuditRow = page
    .getByTestId("audit-log-table")
    .locator("tbody tr")
    .filter({ hasText: "createTag" })
    .first();
  await expect(largeIntegerAuditRow).toBeVisible();
  await largeIntegerAuditRow.click();
  const requestJSON = page
    .getByTestId("audit-entry-detail")
    .getByRole("region", { name: "Request JSON" })
    .locator("pre");
  await expect(requestJSON).toContainText("9007199254740993");
  await expect(requestJSON).not.toContainText("9007199254740992");
});

test("legacy ui deep links redirect to root routes preserving query", async ({
  page,
}) => {
  await page.goto("/ui/status");

  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();

  await page.goto("/ui/transactions?page=2&pageSize=25");

  await expect(page).toHaveURL(/\/transactions\?page=2&pageSize=25$/);
  await expect(page.getByText("Page 2")).toBeVisible();
});

test("legacy ui redirects keep slash-prefixed paths same-origin", async ({
  request,
}) => {
  const response = await request.get("/ui//example.com/path?q=1", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(308);
  expect(response.headers()["location"]).toBe("/example.com/path?q=1");
});

test("shell renders and navigates between routed pages", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/overview$/);
  const primaryNav = page.getByLabel("Primary");
  await expect(primaryNav).toBeVisible();
  await expect(
    primaryNav.getByRole("button", { name: "New transaction" }),
  ).toHaveCount(0);
  await expect(
    page.locator("main").getByRole("button", { name: "New transaction" }),
  ).toHaveCount(0);
  await expect(
    primaryNav.getByRole("link", { name: "Overview" }),
  ).toBeVisible();
  await expect(
    primaryNav.getByRole("link", { name: "Transactions" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const balanceStrip = page.getByTestId("featured-balance-strip");
  await expect(balanceStrip).toBeVisible();
  await expect(balanceStrip.getByText("Joint")).toBeVisible();
  await expect(balanceStrip.getByText("Emergency")).toBeVisible();
  await expect(balanceStrip.getByText("Sapphire")).toBeVisible();
  await expect(balanceStrip).not.toContainText("BlueCash");

  await primaryNav.getByRole("link", { name: "Status" }).click();

  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
  await expect(
    page.locator("main").getByRole("button", { name: "New transaction" }),
  ).toHaveCount(0);
  await expect(balanceStrip.getByText("Joint")).toBeVisible();

  await primaryNav.getByRole("link", { name: "Transactions" }).click();

  await expect(page).toHaveURL(/\/transactions$/);
  await expect(
    page.getByRole("heading", { name: "Transactions" }),
  ).toBeVisible();
  await expect(
    page.locator("header").getByRole("button", { name: "New transaction" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(
    primaryNav.getByRole("link", { name: "Transactions" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    primaryNav.getByRole("link", { name: "Settings" }),
  ).toHaveAttribute("href", "/settings");
  await expect(balanceStrip.getByTestId("featured-balance-row")).toHaveCount(0);
  const featuredIcon = balanceStrip.locator("svg").first();
  await expect(featuredIcon).toBeVisible();
  await featuredIcon.hover();
  const featuredTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "joint_checking" });
  await expect(featuredTooltip).toContainText("Sapphire");
  await expect(featuredTooltip).toContainText("$");
  await page.mouse.move(0, 0);

  const statusIcon = primaryNav
    .getByRole("link", { name: "Status" })
    .locator("svg")
    .first();
  const settingsIcon = primaryNav
    .getByRole("link", { name: "Settings" })
    .locator("svg")
    .first();
  await expect(statusIcon).toBeVisible();
  await expect(settingsIcon).toBeVisible();

  const [statusIconBox, settingsIconBox] = await Promise.all([
    statusIcon.boundingBox(),
    settingsIcon.boundingBox(),
  ]);
  expect(statusIconBox).not.toBeNull();
  expect(settingsIconBox).not.toBeNull();
  expect(
    Math.abs(
      (statusIconBox?.x ?? 0) +
        (statusIconBox?.width ?? 0) / 2 -
        ((settingsIconBox?.x ?? 0) + (settingsIconBox?.width ?? 0) / 2),
    ),
  ).toBeLessThanOrEqual(1);
});

test("featured balance strip follows account metadata and transaction saves", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const featuredLeaf = `Featured${unique}`;
  const featuredFqn = `e2e:featured:${featuredLeaf}`;
  const fundingAccount = await createAccount(page, featuredFqn, "owned", "USD");
  const merchantAccount = await createAccount(
    page,
    `e2e:merchant:${unique}`,
    "flow",
    "USD",
  );
  const category = await createCategory(page, `E2E:Featured:${unique}`);
  await createCreditLimit(page, fundingAccount, "100.00");

  await page.goto("/transactions?page=1&pageSize=25");
  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  const balanceStrip = page.getByTestId("featured-balance-strip");
  await expect(balanceStrip).not.toContainText(featuredLeaf);

  await updateAccountFeatured(page, fundingAccount, true);
  await page.reload();

  const featuredRow = balanceStrip
    .getByTestId("featured-balance-row")
    .filter({ hasText: featuredLeaf });
  const balanceBeforeSave = await getAccountBalance(page, fundingAccount);
  expect(balanceBeforeSave.remaining_credit).toBeDefined();
  const remainingCreditLabel = featuredRow.getByText("Remaining credit", {
    exact: true,
  });
  await expect(remainingCreditLabel).toBeVisible();
  await expect(remainingCreditLabel).not.toHaveAttribute("title");
  await expect
    .poll(() =>
      remainingCreditLabel.evaluate(
        (label) => label.scrollWidth > label.clientWidth,
      ),
    )
    .toBe(true);
  await remainingCreditLabel.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Remaining credit");
  await page.mouse.move(0, 0);
  await expect(featuredRow).toContainText(
    `${Number(balanceBeforeSave.remaining_credit).toFixed(2)} $`,
  );
  const beforeSaveText = await featuredRow.innerText();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(page.getByRole("heading", { name: "New spend" })).toBeVisible();
  await page.getByLabel("Date").fill("2026-04-01");
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    featuredLeaf,
    featuredFqn,
  );
  await chooseOptionByKeyboard(page, "Merchant", unique, merchantAccount.fqn);
  await chooseOptionByKeyboard(page, "Category", unique, category.fqn);
  await page.getByLabel("Amount").fill("12.34");
  await expect(page.getByLabel("Amount")).toHaveValue("12.34");
  await page.getByLabel("Memo").fill(`E2E featured strip ${unique}`);
  await page.getByRole("button", { name: "Save and add another" }).click();

  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await expect.poll(() => featuredRow.innerText()).not.toBe(beforeSaveText);
  const balanceAfterSave = await getAccountBalance(page, fundingAccount);
  expect(balanceAfterSave.remaining_credit).toBeDefined();
  await expect(featuredRow).toContainText(
    `${Number(balanceAfterSave.remaining_credit).toFixed(2)} $`,
  );
});

test("featured balance strip separates and labels party balances", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const owned = await createAccount(
    page,
    `e2e:featured:Funds${unique}`,
    "owned",
    "USD",
    true,
  );
  const owedToHousehold = await createAccount(
    page,
    `e2e:featured:OwedTo${unique}`,
    "party",
    "USD",
    true,
  );
  const owedByHousehold = await createAccount(
    page,
    `e2e:featured:OwedBy${unique}`,
    "party",
    "USD",
    true,
  );

  for (const transfer of [
    {
      amount: "7.00",
      destination_account_id: owedToHousehold.account_id,
      source_account_id: owned.account_id,
    },
    {
      amount: "5.00",
      destination_account_id: owned.account_id,
      source_account_id: owedByHousehold.account_id,
    },
  ]) {
    const response = await page.request.post("/api/transactions/transfer", {
      data: {
        ...transfer,
        currency: "USD",
        initiated_date: "2026-04-01",
      },
    });
    expect(response.ok()).toBe(true);
  }

  await page.goto("/transactions?page=1&pageSize=25");

  const strip = page.getByTestId("featured-balance-strip");
  const householdFunds = strip.getByRole("region", {
    name: "Household funds",
  });
  const partyBalances = strip.getByRole("region", { name: "Party balances" });
  await expect(householdFunds).toContainText(`Funds${unique}`);
  await expect(householdFunds).not.toContainText(`OwedTo${unique}`);
  await expect(partyBalances).not.toContainText(`Funds${unique}`);
  await expect(
    partyBalances
      .getByTestId("featured-balance-row")
      .filter({ hasText: `OwedTo${unique}` }),
  ).toContainText("Owed to household");
  await expect(
    partyBalances
      .getByTestId("featured-balance-row")
      .filter({ hasText: `OwedBy${unique}` }),
  ).toContainText("Owed by household");
});

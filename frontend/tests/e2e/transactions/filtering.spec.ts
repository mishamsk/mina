import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  clickRowAction,
  createCategory,
  createSearchSpend,
  createTag,
  expect,
  findByFqn,
  listFixtures,
  type Page,
} from "@tests/e2e/transactions/support";

const uniqueSuffix = (projectName: string) =>
  `${projectName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;

const seededExpectedTransactionRow = async (page: Page) => {
  await page.goto(
    "/transactions?page=1&pageSize=50&q=Streaming%20subscription&filter=lifecycle%3Aexpected",
  );
  const firstExpectedRow = page
    .locator('[data-transaction-row="true"]')
    .filter({ has: page.getByRole("img", { name: "Expected" }) })
    .first();
  await expect(firstExpectedRow).toBeVisible();
  const transactionId = await firstExpectedRow.getAttribute(
    "data-transaction-id",
  );
  if (transactionId === null) {
    throw new Error("Expected transaction row has no transaction identity");
  }

  return page.locator(
    `[data-transaction-row="true"][data-transaction-id="${transactionId}"]`,
  );
};

test("transactions page changes page size and pages through results", async ({
  page,
}) => {
  await page.goto("/transactions");

  await page.getByLabel("Rows").click();
  await page.getByRole("option", { exact: true, name: "25" }).click();
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/transactions" &&
      url.searchParams.get("page") === "1" &&
      url.searchParams.get("pageSize") === "25"
    );
  });
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();

  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/transactions" &&
      url.searchParams.get("page") === "2" &&
      url.searchParams.get("pageSize") === "25"
    );
  });
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

  await page.getByRole("button", { exact: true, name: "Previous" }).click();
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/transactions" &&
      url.searchParams.get("page") === "1" &&
      url.searchParams.get("pageSize") === "25"
    );
  });
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
});

test("transactions search narrows the visible rows and updates the URL", async ({
  page,
}, testInfo) => {
  const search = `E2E transaction search ${uniqueSuffix(testInfo.project.name)}`;
  const targetMemo = `${search} target`;
  const nonmatchMemo = `${search} nonmatch`;
  await createSearchSpend(page, targetMemo);
  await createSearchSpend(page, nonmatchMemo);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  const targetRow = page.getByRole("row").filter({ hasText: targetMemo });
  const nonmatchRow = page.getByRole("row").filter({ hasText: nonmatchMemo });
  await expect(targetRow).toBeVisible();
  await expect(nonmatchRow).toBeVisible();

  await page.getByRole("searchbox", { name: "Search" }).fill(targetMemo);

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/transactions" &&
      url.searchParams.get("q") === targetMemo
    );
  });
  await expect(targetRow).toBeVisible();
  await expect(nonmatchRow).toBeHidden();
});

test("transactions class control narrows and restores visible rows", async ({
  page,
}, testInfo) => {
  const search = `E2E class control ${uniqueSuffix(testInfo.project.name)}`;
  const spendMemo = `${search} spend`;
  const incomeMemo = `${search} income`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const checking = findByFqn(accounts, "bank:Chase:joint_checking");
  const payroll = findByFqn(accounts, "employers:Acme:salary");
  const salary = findByFqn(categories, "Income:Salary");
  await createSearchSpend(page, spendMemo);
  const incomeResponse = await page.request.post("/api/transactions/income", {
    data: {
      amount: "56.78",
      category_id: salary.category_id,
      currency: "USD",
      destination_account_id: checking.account_id,
      initiated_date: "2026-05-31",
      memo: incomeMemo,
      source_account_id: payroll.account_id,
    },
  });
  expect(incomeResponse.ok(), await incomeResponse.text()).toBe(true);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  const spendRow = page.getByRole("row").filter({ hasText: spendMemo });
  const incomeRow = page.getByRole("row").filter({ hasText: incomeMemo });
  await expect(spendRow).toBeVisible();
  await expect(incomeRow).toBeVisible();

  const classControl = page.locator("#transactions-class");
  await classControl.click();
  const classPopover = page.getByRole("dialog", {
    name: "Transaction classes",
  });
  const spendCheckbox = classPopover.getByRole("checkbox", { name: "Spend" });
  await spendCheckbox.click();

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/transactions" &&
      url.searchParams.getAll("class").join(",") === "spend"
    );
  });
  await page.keyboard.press("Escape");
  await expect(spendRow).toBeVisible();
  await expect(incomeRow).toBeHidden();

  await classControl.click();
  await spendCheckbox.click();

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/transactions" &&
      url.searchParams.getAll("class").length === 0
    );
  });
  await page.keyboard.press("Escape");
  await expect(spendRow).toBeVisible();
  await expect(incomeRow).toBeVisible();
});

test("transaction toolbar icon controls expose their tooltips", async ({
  page,
}) => {
  await page.goto("/transactions?page=1&pageSize=50");

  await page.getByRole("button", { name: /^Sort transactions:/ }).hover();
  const sortTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Sort transactions" });
  await expect(sortTooltip).toBeVisible();

  await page.getByRole("heading", { name: "Transactions" }).hover();
  await expect(sortTooltip).toBeHidden();
  const filterToggle = page.getByRole("button", { name: "Open filters" });
  await filterToggle.focus();
  await expect(filterToggle).toBeFocused();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Open filters" }),
  ).toBeVisible();
});

test("transactions occurrence review confirms an expected transaction", async ({
  page,
}) => {
  const row = await seededExpectedTransactionRow(page);
  await expect(row.getByRole("img", { name: "Expected" })).toBeVisible();

  await clickRowAction(page, row, "Confirm expected");
  const dialog = page.getByRole("alertdialog", {
    name: "Confirm expected transaction",
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Confirm expected transaction" })
    .click();

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Expected transaction confirmed." }),
  ).toBeVisible();
  await page.goto(
    "/transactions?page=1&pageSize=50&q=Streaming%20subscription",
  );
  await expect(row).toBeVisible();
  await expect(row.getByRole("img", { name: "Expected" })).toHaveCount(0);
});

test("transactions occurrence review dismisses an expected transaction", async ({
  page,
}) => {
  const row = await seededExpectedTransactionRow(page);
  await expect(row.getByRole("img", { name: "Expected" })).toBeVisible();

  await clickRowAction(page, row, "Dismiss expected");
  const dialog = page.getByRole("alertdialog", {
    name: "Dismiss expected transaction",
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Dismiss expected transaction" })
    .click();

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Expected transaction dismissed." }),
  ).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("transaction entity chips add filters that the filter X clears", async ({
  page,
}, testInfo) => {
  const unique = uniqueSuffix(testInfo.project.name);
  const search = `E2E entity chip filter ${unique}`;
  const targetMemo = `${search} target`;
  const nonmatchMemo = `${search} nonmatch`;
  const [accounts, categories, category, tag] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
    createCategory(page, `E2E:ChipFilter:${unique}:Category`, "expense"),
    createTag(page, `E2E:ChipFilter:${unique}:Tag`),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const fallbackCategory = findByFqn(categories, "Entertainment:Books");
  const targetResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "21.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo: targetMemo,
      tag_ids: [tag.tag_id],
    },
  });
  expect(targetResponse.ok(), await targetResponse.text()).toBe(true);
  const nonmatchResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "22.45",
      category_id: fallbackCategory.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo: nonmatchMemo,
    },
  });
  expect(nonmatchResponse.ok(), await nonmatchResponse.text()).toBe(true);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  const targetRow = page.getByRole("row").filter({ hasText: targetMemo });
  const nonmatchRow = page.getByRole("row").filter({ hasText: nonmatchMemo });
  await expect(targetRow).toBeVisible();
  await expect(nonmatchRow).toBeVisible();

  await targetRow
    .getByRole("button", { name: `Filter by ${category.name}` })
    .click();

  const filterBar = page.getByTestId("transaction-browser-filter-bar");
  await expect(filterBar).toBeVisible();
  await expect(
    filterBar.getByRole("button", { name: /^Remove Category / }),
  ).toBeVisible();
  await expect(targetRow).toBeVisible();
  await expect(nonmatchRow).toBeHidden();

  await targetRow
    .getByRole("button", { name: `Filter by ${tag.name}` })
    .click();

  await expect(
    filterBar.getByRole("button", { name: /^Remove Category / }),
  ).toBeVisible();
  await expect(
    filterBar.getByRole("button", { name: /^Remove Tag / }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close filters" }).click();

  await expect(filterBar).toBeHidden();
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/transactions" &&
      url.searchParams.get("q") === search &&
      url.searchParams.get("filter") === null
    );
  });
  await expect(targetRow).toBeVisible();
  await expect(nonmatchRow).toBeVisible();
});

test("transactions sidebar restores the last-used browser state", async ({
  page,
}) => {
  const search = "USD";
  const filter = "settlement:posted";
  await page.goto(
    `/transactions?page=2&pageSize=25&q=${encodeURIComponent(search)}&filter=${encodeURIComponent(filter)}`,
  );

  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    search,
  );
  await expect(page.getByText("Settlement Posted")).toBeVisible();
  await expect(page.getByLabel("Rows")).toContainText("25");
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

  await page.getByRole("link", { name: "Status" }).click();
  await expect(
    page.getByRole("heading", { exact: true, name: "Status" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).click();

  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/transactions" &&
      url.searchParams.get("page") === "2" &&
      url.searchParams.get("pageSize") === "25" &&
      url.searchParams.get("q") === search &&
      url.searchParams.get("filter") === filter
    );
  });
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    search,
  );
  await expect(page.getByText("Settlement Posted")).toBeVisible();
  await expect(page.getByLabel("Rows")).toContainText("25");
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
});

import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  createExpectedRecurringFixture,
  createSearchSpend,
  expect,
  findByFqn,
  journalRecord,
  listFixtures,
  type Page,
} from "@tests/e2e/transactions/support";

const transactionRow = (page: Page, memo: string) =>
  page.locator("[data-transaction-row='true']").filter({ hasText: memo });

test("recurring transaction detail links back to its definition", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const expected = await createExpectedRecurringFixture(page, unique);

  await page.goto(
    `/transactions?page=1&pageSize=50&transaction=${expected.transactionId}`,
  );
  const panel = page.getByTestId("transaction-detail-panel");
  const definitionLink = panel.getByRole("link", {
    name: expected.recurringDefinitionFqn,
  });
  await expect(panel).toBeVisible();
  await expect(definitionLink).toBeVisible();
  await expect(
    panel.getByTestId("transaction-recurring-definition"),
  ).toContainText(expected.recurringDefinitionFqn);

  await definitionLink.click();

  await expect(page).toHaveURL(
    new RegExp(`/recurring#definition-${expected.recurringDefinitionId}$`),
  );
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Definition FQN")).toHaveValue(
    expected.recurringDefinitionFqn,
  );
  const records = editor.getByLabel("Definition records").locator("section");
  await expect(records).toHaveCount(2);
  await expect(records.nth(0).getByLabel("Amount")).toHaveValue("-23.45000000");
  await expect(records.nth(1).getByLabel("Amount")).toHaveValue("23.45000000");
});

test("transaction row opens read-only balanced detail that survives reload", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E transaction detail ${unique}`;
  const transaction = await createSearchSpend(page, memo);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = transactionRow(page, memo);
  await expect(row).toBeVisible();

  await row.locator(".transactions-description-column").click();

  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${transaction.transaction_id}(?:&|$)`),
  );
  const panel = page.getByTestId("transaction-detail-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAccessibleName(transaction.display_title);
  await expect(panel.getByTestId("transaction-detail-summary-memo")).toHaveText(
    memo,
  );
  await expect(panel.locator("input, textarea, select")).toHaveCount(0);
  const records = panel.locator("tr[data-detail-record-row='true']");
  await expect(records).toHaveCount(2);
  await expect(
    records.getByRole("img", { name: "Balance role" }),
  ).toBeVisible();
  await expect(
    records.getByRole("img", { name: "Expense role" }),
  ).toBeVisible();
  await expect(panel.getByText("cash:Wallet", { exact: true })).toBeVisible();
  await expect(
    panel.getByText("merchant:PowellsBooks", { exact: true }),
  ).toBeVisible();
  await expect(
    panel
      .getByTestId("transaction-detail-records-table")
      .locator("td[data-label='Amount']"),
  ).toHaveText(["-12.34 $", "+12.34 $"]);

  await page.reload();

  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("transaction-detail-summary-memo")).toHaveText(
    memo,
  );
  await expect(records).toHaveCount(2);
});

test("transaction detail account label opens the account", async ({ page }) => {
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const account = findByFqn(accounts, "merchant:Amazon:flow");
  const memo = "Amazon gift card purchase";

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = transactionRow(page, memo);
  await expect(row).toBeVisible();
  await row.locator(".transactions-description-column").click();

  const panel = page.getByTestId("transaction-detail-panel");
  const accountLink = panel.getByRole("link", {
    exact: true,
    name: account.display_label,
  });

  await accountLink.click();

  await expect(page).toHaveURL(
    new RegExp(`/accounts/${account.account_id}(?:\\?.*)?$`),
  );
  await expect(
    page.getByRole("heading", {
      exact: true,
      name: account.display_label,
    }),
  ).toBeVisible();
});

test("transaction detail deletes a transaction", async ({ page }, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E detail delete ${unique}`;
  const transaction = await createSearchSpend(page, memo);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = transactionRow(page, memo);
  await expect(row).toBeVisible();
  await row.locator(".transactions-description-column").click();
  const panel = page.getByTestId("transaction-detail-panel");
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Delete" }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Delete transaction",
  });
  await expect(confirmation).toContainText(transaction.display_title);
  await confirmation
    .getByRole("button", { name: "Delete transaction" })
    .click();

  await expect(
    page.getByRole("status").filter({ hasText: "Transaction deleted." }),
  ).toBeVisible();
  await expect(panel).toHaveCount(0);
  await expect(row).toHaveCount(0);
});

test("transaction detail splits a spend and shows the new record", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E detail split ${unique}`;
  const splitMemo = `${memo} added record`;
  await createSearchSpend(page, memo, "30.00");

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = transactionRow(page, memo);
  await expect(row).toBeVisible();
  await row.locator(".transactions-description-column").click();
  const panel = page.getByTestId("transaction-detail-panel");

  await panel.getByRole("button", { name: "Split" }).click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(
    editor.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  const firstRecord = journalRecord(page, 1);
  const secondRecord = journalRecord(page, 2);
  const thirdRecord = journalRecord(page, 3);
  await expect(firstRecord.getByLabel("Amount")).toHaveValue("-30");
  await expect(secondRecord.getByLabel("Amount")).toHaveValue("30");
  await expect(thirdRecord.getByLabel("Record 3 account")).toHaveValue(
    "merchant:PowellsBooks",
  );
  await expect(thirdRecord.getByLabel("Currency")).toHaveValue("USD");

  await secondRecord.getByLabel("Amount").fill("20.00");
  await thirdRecord.getByLabel("Amount").fill("10.00");
  const categoryPicker = thirdRecord.getByRole("combobox", {
    name: "Category",
  });
  await categoryPicker.fill("Books");
  const categoryOptionsId = await categoryPicker.getAttribute("aria-controls");
  expect(categoryOptionsId).not.toBeNull();
  await page
    .locator(`#${categoryOptionsId}`)
    .getByRole("option")
    .filter({ hasText: "Entertainment:Books" })
    .click();
  await thirdRecord.getByLabel("Memo").fill(splitMemo);
  await editor.getByRole("button", { name: "Update transaction" }).click();

  await expect(editor).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction updated." }),
  ).toBeVisible();
  await expect(panel).toBeVisible();
  const records = panel.locator("tr[data-detail-record-row='true']");
  await expect(records).toHaveCount(3);
  await records.nth(2).click();
  await expect(panel.locator("tr.detail-records-disclosure-row")).toContainText(
    splitMemo,
  );
});

test("transaction detail creates a date-free template", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E detail template ${unique}`;
  const templateFqn = `E2E:${unique}:Captured transaction`;
  await createSearchSpend(page, memo);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = transactionRow(page, memo);
  await expect(row).toBeVisible();
  await row.locator(".transactions-description-column").click();
  const panel = page.getByTestId("transaction-detail-panel");

  await panel.getByRole("button", { name: "Create template" }).click();
  const editor = page.getByRole("dialog", { name: "New template" });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Template FQN")).toHaveValue("");
  await expect(editor.getByLabel("Date")).toHaveCount(0);
  await expect(editor).not.toContainText("2026-05-31");
  const records = editor.getByLabel("Template records").locator("section");
  await expect(records).toHaveCount(2);
  await expect(records.nth(0).getByLabel("Account (optional)")).toHaveValue(
    "cash:Wallet",
  );
  await expect(records.nth(0).getByLabel("Amount (optional)")).toHaveValue(
    "-12.34",
  );
  await expect(records.nth(1).getByLabel("Account (optional)")).toHaveValue(
    "merchant:PowellsBooks",
  );
  await expect(records.nth(1).getByLabel("Category (optional)")).toHaveValue(
    "Entertainment:Books",
  );
  await expect(records.nth(1).getByLabel("Memo (optional)")).toHaveValue(memo);

  await editor.getByLabel("Template FQN").fill(templateFqn);
  await editor.getByRole("button", { name: "Create template" }).click();

  await expect(editor).toHaveCount(0);
  await expect(page.getByText("Template created.")).toBeVisible();
  await page.getByRole("link", { exact: true, name: "Templates" }).click();
  await page.getByRole("searchbox", { name: "Search" }).fill(templateFqn);
  await expect(
    page.getByTestId("templates-tree-row").filter({ hasText: templateFqn }),
  ).toBeVisible();
});

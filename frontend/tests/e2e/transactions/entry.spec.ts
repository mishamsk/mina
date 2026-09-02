import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  chooseOptionByKeyboard,
  clickRowAction,
  createAccount,
  createSearchSpend,
  expect,
  expectAdvancedBalanceStatus,
  findByFqn,
  journalRecord,
  listFixtures,
  type Page,
} from "@tests/e2e/transactions/support";

const testSlug = (projectName: string): string =>
  `${projectName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;

const createImportedSpendFixture = async (
  page: Page,
  unique: string,
): Promise<number> => {
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const response = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-08-15",
      records: [
        {
          account_id: findByFqn(accounts, "cash:Wallet").account_id,
          amount: "-12.00",
          currency: "USD",
          reconciliation_status: "unreconciled",
          settlement: { status: "posted" },
          source: "manual",
        },
        {
          account_id: findByFqn(accounts, "merchant:PowellsBooks").account_id,
          amount: "12.00",
          category_id: findByFqn(categories, "Entertainment:Books").category_id,
          currency: "USD",
          external_id: `merchant-${unique}`,
          external_system: "e2e-provider",
          reconciliation_status: "unreconciled",
          settlement: null,
          source: "imported",
        },
      ],
    },
  });
  const responseBody = await response.text();
  expect(response.ok(), responseBody).toBe(true);
  return (
    JSON.parse(responseBody) as {
      readonly transaction_id: number;
    }
  ).transaction_id;
};

test("create drafts recover after closing and can be cleared", async ({
  page,
}, testInfo) => {
  const memo = `E2E recovered draft ${testSlug(testInfo.project.name)}`;
  await page.goto("/transactions?page=1&pageSize=25");
  const launcher = page
    .locator("header")
    .getByRole("button", { name: "New transaction" });
  await launcher.click();

  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByLabel("Memo").fill(memo);
  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await expect(launcher).toBeFocused();

  await launcher.click();
  await expect(editor.getByLabel("Memo")).toHaveValue(memo);
  await editor.getByRole("button", { name: "Clear draft" }).click();
  await page
    .getByRole("alertdialog", { name: "Clear entry draft?" })
    .getByRole("button", { name: "Clear draft" })
    .click();

  await expect(editor.getByLabel("Memo")).toHaveValue("");
  await expect(editor.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("editing a transaction updates its visible detail", async ({
  page,
}, testInfo) => {
  const unique = testSlug(testInfo.project.name);
  const initialMemo = `E2E edit original ${unique}`;
  const updatedMemo = `E2E edit updated ${unique}`;
  await createSearchSpend(page, initialMemo);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );

  const row = page.getByRole("row").filter({ hasText: initialMemo }).first();
  await clickRowAction(page, row, "Edit transaction");
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByLabel("Memo").fill(updatedMemo);
  await editor.getByRole("button", { name: "Update transaction" }).click();

  await expect(editor).toHaveCount(0);
  const updatedRow = page
    .getByRole("row")
    .filter({ hasText: updatedMemo })
    .first();
  await expect(updatedRow).toBeVisible();
  await updatedRow.locator(".transactions-description-column").click();
  await expect(
    page
      .getByTestId("transaction-detail-panel")
      .getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(updatedMemo);
});

test("discarding a dirty edit keeps the original transaction", async ({
  page,
}, testInfo) => {
  const unique = testSlug(testInfo.project.name);
  const initialMemo = `E2E discard original ${unique}`;
  const discardedMemo = `E2E discard changed ${unique}`;
  await createSearchSpend(page, initialMemo);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );

  const row = page.getByRole("row").filter({ hasText: initialMemo }).first();
  await clickRowAction(page, row, "Edit transaction");
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByLabel("Memo").fill(discardedMemo);
  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await page
    .getByRole("alertdialog", { name: "Discard transaction changes?" })
    .getByRole("button", { name: "Discard changes" })
    .click();

  await expect(editor).toHaveCount(0);
  await expect(row).toContainText(initialMemo);
  await expect(
    page.getByRole("row").filter({ hasText: discardedMemo }),
  ).toHaveCount(0);
});

test("duplicating a transaction saves a seeded copy beside its source", async ({
  page,
}, testInfo) => {
  const unique = testSlug(testInfo.project.name);
  const sourceMemo = `E2E duplicate source ${unique}`;
  const copyMemo = `E2E duplicate copy ${unique}`;
  await createSearchSpend(page, sourceMemo, "19.25");
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );

  const sourceRow = page
    .getByRole("row")
    .filter({ hasText: sourceMemo })
    .first();
  await clickRowAction(page, sourceRow, "Duplicate transaction");
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const spend = editor.getByRole("tabpanel", { name: "Spend" });
  await expect(
    editor.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(spend.getByLabel("Amount")).toHaveValue("19.25");
  await expect(spend.getByLabel("Memo")).toHaveValue(sourceMemo);
  await spend.getByLabel("Memo").fill(copyMemo);
  await editor.getByRole("button", { name: "Save and close" }).click();

  await expect(editor).toHaveCount(0);
  await expect(sourceRow).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: copyMemo }).first(),
  ).toBeVisible();
});

test("advanced entry previews and saves a balanced spend", async ({
  page,
}, testInfo) => {
  const memo = `E2E advanced spend ${testSlug(testInfo.project.name)}`;
  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByRole("tab", { name: "Advanced" }).click();
  await editor
    .getByRole("textbox", { exact: true, name: "Date" })
    .fill("2026-08-28");

  const funding = journalRecord(page, 1);
  const merchant = journalRecord(page, 2);
  await chooseOptionByKeyboard(page, "Account", "Wallet", "cash:Wallet", {
    scope: funding,
  });
  await expect(funding.getByRole("combobox", { name: "Category" })).toHaveCount(
    0,
  );
  await funding.getByLabel("Amount").fill("-15.00");
  await funding.getByLabel("Memo").fill(memo);
  await chooseOptionByKeyboard(
    page,
    "Account",
    "Powells",
    "merchant:PowellsBooks",
    { scope: merchant },
  );
  await expect(
    merchant.getByRole("combobox", { name: "Category" }),
  ).toBeVisible();
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: merchant },
  );
  await merchant.getByLabel("Amount").fill("15.00");
  await merchant.getByLabel("Memo").fill(memo);

  await expectAdvancedBalanceStatus(page, "USD", "Balanced");
  const preview = editor.getByTestId("classification-preview");
  await expect(preview).toContainText("Spend");
  await expect(preview).toContainText("-15.00 $");
  await editor.getByRole("button", { name: "Save and close" }).click();

  await expect(editor).toHaveCount(0);
  await page.getByLabel("Search").fill(memo);
  await expect(
    page.getByRole("row").filter({ hasText: memo }).first(),
  ).toBeVisible();
});

test("advanced account picker resolves an exact hidden account", async ({
  page,
}, testInfo) => {
  const unique = testSlug(testInfo.project.name);
  const hiddenFqn = `e2e:advanced:${unique}:HiddenFlow`;
  const hiddenAccount = await createAccount(page, hiddenFqn, "flow");
  const hideResponse = await page.request.patch(
    `/api/accounts/${hiddenAccount.account_id}`,
    { data: { is_hidden: true } },
  );
  expect(hideResponse.ok()).toBe(true);

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByRole("tab", { name: "Advanced" }).click();

  const record = journalRecord(page, 1);
  const accountPicker = record.getByRole("combobox", { name: "Account" });
  await accountPicker.fill("HiddenFlow");
  await expect(
    page.locator("#advanced-record-0-account-options"),
  ).toContainText("No matches");

  await accountPicker.fill(hiddenFqn);
  await expect(accountPicker).toHaveValue(hiddenAccount.display_label);
  await expect(record.getByLabel("Hidden", { exact: true })).toBeVisible();
});

test("spend explains why an imported merchant cannot be removed", async ({
  page,
}, testInfo) => {
  const transactionId = await createImportedSpendFixture(
    page,
    testSlug(testInfo.project.name),
  );
  await page.goto(
    `/transactions?page=1&pageSize=50&entry=edit:${transactionId}`,
  );

  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(
    editor.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  const spend = editor.getByRole("tabpanel", { name: "Spend" });
  await spend.getByRole("button", { name: "Add merchant" }).click();

  const importedMerchant = spend.getByRole("group", { name: "Merchant 1" });
  const manualMerchant = spend.getByRole("group", { name: "Merchant 2" });
  await expect(
    manualMerchant.getByRole("button", { name: "Remove merchant" }),
  ).toBeEnabled();
  await expect(
    importedMerchant.getByRole("button", { name: "Remove merchant" }),
  ).toBeDisabled();
  await importedMerchant.getByLabel("Remove merchant unavailable").hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Imported records keep their identity and cannot be removed",
  );
});

test("advanced entry explains why an imported record cannot be removed", async ({
  page,
}, testInfo) => {
  const transactionId = await createImportedSpendFixture(
    page,
    testSlug(testInfo.project.name),
  );
  await page.goto(
    `/transactions?page=1&pageSize=50&entry=edit:${transactionId}`,
  );

  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByRole("button", { name: "Edit as journal" }).click();
  await editor.getByRole("button", { name: "Add record" }).click();

  const importedRecord = journalRecord(page, 2);
  const manualRecord = journalRecord(page, 3);
  await expect(
    manualRecord.getByRole("button", { name: "Remove record 3" }),
  ).toBeEnabled();
  await expect(
    importedRecord.getByRole("button", { name: "Remove record 2" }),
  ).toBeDisabled();
  await importedRecord.getByLabel("Remove record 2 unavailable").hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Imported records keep their identity and cannot be removed",
  );
});

test("transfer charge removal reflects its source", async ({
  page,
}, testInfo) => {
  const unique = testSlug(testInfo.project.name);
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const response = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-08-14",
      records: [
        {
          account_id: findByFqn(accounts, "cash:Wallet").account_id,
          amount: "-12.00",
          currency: "USD",
          reconciliation_status: "unreconciled",
          settlement: { status: "posted" },
          source: "manual",
        },
        {
          account_id: findByFqn(accounts, "bank:Ally:emergency_savings")
            .account_id,
          amount: "10.00",
          currency: "USD",
          reconciliation_status: "unreconciled",
          settlement: { status: "posted" },
          source: "manual",
        },
        {
          account_id: findByFqn(accounts, "bank:Chase:fees").account_id,
          amount: "2.00",
          category_id: findByFqn(categories, "Bank:Fees").category_id,
          currency: "USD",
          external_id: `charge-${unique}`,
          external_system: "e2e-provider",
          reconciliation_status: "unreconciled",
          settlement: null,
          source: "imported",
        },
      ],
    },
  });
  const responseBody = await response.text();
  expect(response.ok(), responseBody).toBe(true);
  const transaction = JSON.parse(responseBody) as {
    readonly transaction_id: number;
  };

  await page.goto(
    `/transactions?page=1&pageSize=50&entry=edit:${transaction.transaction_id}`,
  );
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(
    editor.getByRole("heading", { name: "Edit transfer" }),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Remove charge" }),
  ).toBeDisabled();
  await editor.getByLabel("Remove charge unavailable").hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Imported records keep their identity and cannot be removed",
  );

  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await expect(editor).toHaveCount(0);
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await editor.getByRole("tab", { name: "Transfer" }).click();
  await editor.getByRole("button", { name: "Add charge" }).click();
  await expect(
    editor.getByRole("group", { name: "Transfer charge" }),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Remove charge" }),
  ).toBeEnabled();
});

test("transaction entry guards focus and remains usable on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await page.goto("/transactions?page=1&pageSize=25");
  await page.getByRole("button", { name: "Edit mode" }).click();
  await expect(
    page.getByTestId("transaction-browser-edit-mode-header"),
  ).toBeVisible();
  await page
    .locator("main")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(
    page.getByTestId("transaction-browser-edit-mode-header"),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 700 });
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Start from a template")).toBeFocused();

  const saveAndClose = editor.getByRole("button", { name: "Save and close" });
  await saveAndClose.focus();
  await page.keyboard.press("Tab");
  expect(
    await editor.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);

  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toHaveCount(0);

  expect(
    await editor.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return (
        bounds.left >= -1 &&
        bounds.top >= -1 &&
        bounds.right <= window.innerWidth + 1 &&
        bounds.bottom <= window.innerHeight + 1 &&
        element.scrollWidth <= element.clientWidth + 1
      );
    }),
  ).toBe(true);

  const scrollRegion = editor.getByTestId("entry-scroll-region");
  await expect(scrollRegion).toBeVisible();
  expect(
    await scrollRegion.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await expect(editor.getByRole("tab", { name: "Spend" })).toBeVisible();
  await expect(
    editor.getByRole("tabpanel", { name: "Spend" }).getByLabel("Date"),
  ).toBeVisible();
  await expect(saveAndClose).toBeInViewport();
});

test("spend entry escalates to matching journal records", async ({
  page,
}, testInfo) => {
  const memo = `E2E escalation ${testSlug(testInfo.project.name)}`;
  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const spend = editor.getByRole("tabpanel", { name: "Spend" });
  await spend.getByLabel("Date").fill("2026-08-29");
  await spend.getByLabel("Amount").fill("13.47");
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    "Wallet",
    "cash:Wallet",
    { scope: spend },
  );
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
    { scope: spend },
  );
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: spend },
  );
  await spend.getByLabel("Memo").fill(memo);
  await editor.getByRole("button", { name: "Edit as journal" }).click();

  const funding = journalRecord(page, 1);
  const merchant = journalRecord(page, 2);
  await expect(funding.getByRole("combobox", { name: "Account" })).toHaveValue(
    "cash:Wallet",
  );
  await expect(funding.getByLabel("Amount")).toHaveValue("-13.47");
  await expect(funding.getByLabel("Memo")).toHaveValue(memo);
  await expect(merchant.getByRole("combobox", { name: "Account" })).toHaveValue(
    "merchant:PowellsBooks",
  );
  await expect(merchant.getByLabel("Amount")).toHaveValue("13.47");
  await expect(
    merchant.getByRole("combobox", { name: "Category" }),
  ).toHaveValue("Entertainment:Books");
  await expect(merchant.getByLabel("Memo")).toHaveValue(memo);
});

test("batched entry retains sticky fields between saves", async ({
  page,
}, testInfo) => {
  const unique = testSlug(testInfo.project.name);
  const firstMemo = `E2E batch first ${unique}`;
  const secondMemo = `E2E batch second ${unique}`;
  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const spend = editor.getByRole("tabpanel", { name: "Spend" });
  const merchant = spend.getByRole("group", { name: "Merchant 1" });
  await spend.getByLabel("Date").fill("2026-08-30");
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    "Wallet",
    "cash:Wallet",
    { scope: spend },
  );
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
    { scope: merchant },
  );
  await merchant.getByLabel("Amount").fill("8.25");
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: merchant },
  );
  await spend.getByLabel("Memo").fill(firstMemo);
  await editor.getByRole("button", { name: "Save and add another" }).click();

  await expect(editor.getByText("Entries this session: 1")).toBeVisible();
  await expect(editor.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(spend.getByLabel("Date")).toHaveValue("2026-08-30");
  await expect(spend.getByLabel("Funding account")).toHaveValue("cash:Wallet");
  await expect(
    merchant.getByRole("combobox", { name: "Merchant account" }),
  ).toHaveValue("merchant:PowellsBooks");
  await expect(merchant.getByLabel("Amount")).toHaveValue("");
  await expect(merchant.getByLabel("Category")).toHaveValue("");
  await expect(spend.getByLabel("Memo")).toHaveValue("");

  await merchant.getByLabel("Amount").fill("6.75");
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: merchant },
  );
  await spend.getByLabel("Memo").fill(secondMemo);
  await editor.getByRole("button", { name: "Save and close" }).click();

  await expect(editor).toHaveCount(0);
  await page.getByLabel("Search").fill(unique);
  await expect(
    page.getByRole("row").filter({ hasText: firstMemo }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: secondMemo }).first(),
  ).toBeVisible();
});

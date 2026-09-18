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

test("new entry follows the active day and requires a date when its saved draft reopens on Overview", async ({
  page,
}) => {
  await page.goto("/transactions?anchor_date=2026-08-12&entry=new:transfer");
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const date = editor.getByLabel("Date", { exact: true });
  await expect(date).toHaveValue("2026-08-12");
  await editor.getByLabel("Memo").fill("Remember my entry");
  await editor.getByLabel("Memo").press("Control+s");
  await expect(editor).toHaveCount(0);
  await page.goto("/overview?entry=new:transfer");
  await expect(date).toHaveValue("");
  await editor.getByRole("button", { name: "Save and add another" }).click();
  await expect(
    editor.getByText("Date is required.", { exact: true }),
  ).toBeVisible();
  await expect(date).toBeFocused();
});

test("create drafts reopen only after explicit save and can be discarded or cleared", async ({
  page,
}, testInfo) => {
  const memo = `E2E saved draft ${testSlug(testInfo.project.name)}`;
  await page.goto("/transactions");
  const launcher = page
    .locator("header")
    .getByRole("button", { name: "New transaction" });
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const close = editor.getByRole("button", {
    name: "Close transaction editor",
  });
  const saveDraft = page.getByRole("alertdialog", { name: "Save draft?" });
  await launcher.click();
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    "Wallet",
    "cash:Wallet",
    {
      scope: editor,
    },
  );
  const merchant = editor.getByRole("group", { name: "Merchant 1" });
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
    {
      scope: merchant,
    },
  );
  await merchant.getByLabel("Amount").fill("8.25");
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    {
      scope: merchant,
    },
  );
  await editor.getByRole("tab", { name: "Transfer" }).click();
  await editor.getByLabel("Amount", { exact: true }).fill("25");
  await editor.getByLabel("Memo").fill(memo);
  await close.click();
  await expect(
    saveDraft.getByRole("button", { name: "Discard draft" }),
  ).toBeFocused();
  await saveDraft
    .getByRole("button", { name: "Save draft", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await page.reload();
  await launcher.click();
  await expect(editor.getByRole("tab", { name: "Transfer" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(editor.getByLabel("Amount", { exact: true })).toHaveValue("25");
  await expect(editor.getByLabel("Memo")).toHaveValue(memo);
  await close.click();
  await expect(editor).toHaveCount(0);
  await launcher.click();
  await editor.getByRole("tab", { name: "Spend" }).click();
  await editor.getByRole("button", { name: "Save and add another" }).click();
  await expect(editor.getByText("Entries this session: 1")).toBeVisible();
  await editor.getByRole("tab", { name: "Transfer" }).click();
  await expect(editor.getByLabel("Memo")).toHaveValue(memo);
  await close.click();
  await expect(
    saveDraft.getByRole("button", { name: "Discard draft" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);
  await launcher.click();
  await expect(editor.getByLabel("Memo")).toHaveValue("");
  await expect(editor.getByLabel("Amount", { exact: true })).toHaveValue("");
  await editor.getByLabel("Memo").fill(memo);
  await editor.getByLabel("Memo").press("Control+s");
  await expect(editor).toHaveCount(0);
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
  await expect(
    editor.getByRole("combobox", { name: "Start from a template" }),
  ).toBeFocused();
  await close.click();
  await expect(editor).toHaveCount(0);
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
  const discard = page.getByRole("alertdialog", {
    name: "Discard transaction changes?",
  });
  await expect(
    discard.getByRole("button", { name: "Discard changes" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
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
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await clickRowAction(page, sourceRow, "Duplicate transaction");
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
  const fundingAccount = editor.getByLabel("Funding account");
  await expect(fundingAccount).toBeFocused();
  await fundingAccount.click();
  await expect(fundingAccount).toHaveAttribute("aria-expanded", "true");

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
  await editor.getByRole("checkbox", { name: "Record as pending" }).check();
  await editor.getByRole("button", { name: "Edit as journal" }).click();

  const funding = journalRecord(page, 1);
  const merchant = journalRecord(page, 2);
  await expect(funding.getByRole("combobox", { name: "Account" })).toHaveValue(
    "cash:Wallet",
  );
  await expect(funding.getByLabel("Amount")).toHaveValue("-13.47");
  await expect(editor.getByLabel("Record 1 settlement")).toHaveText("Pending");
  await expect(funding.getByLabel("Memo")).toHaveValue(memo);
  await expect(merchant.getByRole("combobox", { name: "Account" })).toHaveValue(
    "merchant:PowellsBooks",
  );
  await expect(merchant.getByLabel("Amount")).toHaveValue("13.47");
  await expect(
    merchant.getByRole("combobox", { name: "Category" }),
  ).toHaveValue("Entertainment:Books");
  await expect(merchant.getByLabel("Memo")).toHaveValue(memo);
  await editor.getByRole("tab", { name: "Spend" }).click();
  const unsavedMemo = `${memo} unsaved`;
  await spend.getByLabel("Memo").fill(unsavedMemo);
  await editor.getByRole("tab", { name: "Advanced" }).click();
  await editor.getByRole("button", { name: "Save and add another" }).click();
  await expect(editor.getByText("Entries this session: 1")).toBeVisible();
  await expect(editor.getByLabel("Record 1 settlement")).toHaveText("Posted");
  await editor.getByRole("button", { name: "Clear draft" }).click();
  await page
    .getByRole("alertdialog", { name: "Clear entry draft?" })
    .getByRole("button", { name: "Keep draft" })
    .click();
  await editor.getByRole("tab", { name: "Spend" }).click();
  await expect(spend.getByLabel("Memo")).toHaveValue(unsavedMemo);
  await expect(
    editor.getByRole("checkbox", { name: "Record as pending" }),
  ).toBeChecked();
});

test("batched entry keeps sticky fields only within the session and clears replaced tabs", async ({
  page,
}, testInfo) => {
  const unique = testSlug(testInfo.project.name);
  const firstMemo = `E2E batch first ${unique}`;
  const secondMemo = `E2E batch second ${unique}`;
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const templateFqn = `E2E:${unique}:Replacement`;
  const response = await page.request.post("/api/transaction-templates", {
    data: {
      fqn: templateFqn,
      records: [
        {
          account_id: findByFqn(accounts, "cash:Wallet").account_id,
          amount: "-5",
          currency: "USD",
          memo: unique,
        },
        {
          account_id: findByFqn(accounts, "bank:Chase:joint_checking")
            .account_id,
          amount: "5",
          currency: "USD",
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
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
  await editor.getByRole("button", { name: "Save and add another" }).click();
  await expect(editor.getByText("Entries this session: 2")).toBeVisible();
  await editor.getByRole("tab", { name: "Advanced" }).click();
  await editor.getByRole("combobox", { name: "Template" }).fill(templateFqn);
  await expect(editor.getByLabel("Record 1 memo")).toHaveValue(unique);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await editor.getByRole("button", { name: "Save and add another" }).click();
  await expect(editor.getByText("Entries this session: 3")).toBeVisible();
  await editor.getByRole("tab", { name: "Spend" }).click();
  await expect(spend.getByLabel("Funding account")).toHaveValue("");
  await spend.getByLabel("Memo").fill("Unsaved rail draft");
  await editor
    .getByRole("button", { name: /Edit saved transaction/ })
    .last()
    .click();
  const saveDraft = page.getByRole("alertdialog", { name: "Save draft?" });
  await expect(
    saveDraft.getByRole("button", { name: "Discard draft" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    editor.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(spend.getByLabel("Memo")).toHaveValue(firstMemo);
  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await expect(editor).toHaveCount(0);
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await editor.getByRole("tab", { name: "Spend" }).click();
  await expect(spend.getByLabel("Funding account")).toHaveValue("");
  await expect(spend.getByLabel("Memo")).toHaveValue("");
  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await expect(editor).toHaveCount(0);
  await page.getByLabel("Search").fill(unique);
  await expect(
    page.getByRole("row").filter({ hasText: firstMemo }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: secondMemo }).first(),
  ).toBeVisible();
});

test("palette templates protect modified drafts within the open session", async ({
  page,
}, testInfo) => {
  const unique = testSlug(testInfo.project.name);
  const templateFqn = `E2E:${unique}:Entry baseline`;
  const templateMemo = `Template ${unique}`;
  const templateResponse = await page.request.post(
    "/api/transaction-templates",
    {
      data: { fqn: templateFqn, records: [{ memo: templateMemo }] },
    },
  );
  expect(templateResponse.ok()).toBe(true);
  await page.goto(
    `/transactions?page=1&pageSize=25&q=${encodeURIComponent(unique)}`,
  );
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(
    page.getByRole("heading", { name: "Transactions", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+K");

  const palette = page.getByRole("dialog", { name: "Command Palette" });
  await palette
    .getByRole("combobox", { name: "Command search" })
    .fill(templateFqn);
  await palette
    .getByRole("option", { name: new RegExp(`Use ${templateFqn}`) })
    .click();
  await expect(editor.getByLabel("Record 1 memo")).toHaveValue(templateMemo);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  const changedMemo = `Unsaved ${unique}`;
  await editor.getByLabel("Record 1 memo").fill(changedMemo);
  await editor.getByRole("combobox", { name: "Template" }).fill(templateFqn);
  const replaceDraft = page.getByRole("alertdialog", {
    name: "Replace entry draft?",
  });
  await expect(replaceDraft).toBeVisible();
  await replaceDraft.getByRole("button", { name: "Keep draft" }).click();
  await expect(editor.getByLabel("Record 1 memo")).toHaveValue(changedMemo);
});

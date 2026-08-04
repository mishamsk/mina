import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  chooseOptionByKeyboard,
  clickRowAction,
  comparableRecords,
  createAccount,
  createCategory,
  createSearchSpend,
  delayTransactionEntryDraftDeletion,
  expect,
  expectAdvancedBalanceStatus,
  expectAdvancedRecordUsableAtDockedWidth,
  expectTransactionsPageUrl,
  failTransactionEntryDraftDeletion,
  fillAndExpectValue,
  findByFqn,
  hideAccount,
  journalRecord,
  listFixtures,
  readStoredTransactionEntryDraft,
  seedStoredPristineTransactionEntryDefaults,
  type TransactionDetailFixture,
  type TransactionFixture,
  waitForLedgerLookups,
} from "@tests/e2e/transactions/support";

test("the entry modal traps focus while lookups load", async ({ page }) => {
  let releaseCategories = () => {};
  const categoriesGate = new Promise<void>((resolve) => {
    releaseCategories = resolve;
  });
  await page.route("**/api/categories?**", async (route) => {
    await categoriesGate;
    await route.continue();
  });

  try {
    await page.goto("/transactions");
    const launcher = page
      .locator("header")
      .getByRole("button", { name: "New transaction" });
    await launcher.click();
    const entryModal = page.getByRole("dialog", {
      name: "Transaction editor",
    });
    await expect(entryModal).toBeVisible();
    await expect(entryModal).toBeFocused();

    releaseCategories();
    await expect(page.getByLabel("Start from a template")).toBeFocused();
  } finally {
    releaseCategories();
  }
});

test("clear draft confirms hand-entered and restored work and deletes persistence", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `Restored clear ${unique}`;
  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const entryForm = editor.locator("form[role='tabpanel']");
  const releasePristineDeletion =
    await delayTransactionEntryDraftDeletion(page);
  await editor.getByRole("button", { name: "Clear draft" }).click();
  await expect(entryForm).toHaveAttribute("inert", "");
  await expect(editor.getByRole("tab", { name: "Income" })).toBeDisabled();
  await expect(editor.getByLabel("Start from a template")).toBeDisabled();
  const memoField = editor.getByLabel("Memo");
  await memoField.evaluate((element) => element.focus());
  await page.keyboard.type("must not be entered");
  await expect(memoField).toHaveValue("");
  await releasePristineDeletion();
  await expect(entryForm).not.toHaveAttribute("inert", "");
  await expect(memoField).toBeEditable();

  await memoField.fill(memo);
  await editor.getByRole("button", { name: "Clear draft" }).click();
  let clearDialog = page.getByRole("alertdialog", {
    name: "Clear entry draft?",
  });
  await expect(clearDialog).toBeVisible();
  await clearDialog.getByRole("button", { name: "Keep draft" }).click();
  await expect(editor.getByLabel("Memo")).toHaveValue(memo);
  await expect(
    editor.getByRole("button", { name: "Clear draft" }),
  ).toBeFocused();
  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({
      tabs: { spend: { memo } },
    });

  await page.reload();
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(editor.getByLabel("Memo")).toHaveValue(memo);
  await editor.getByRole("button", { name: "Clear draft" }).click();
  clearDialog = page.getByRole("alertdialog", {
    name: "Clear entry draft?",
  });
  await clearDialog.getByRole("button", { name: "Clear draft" }).click();
  await expect(editor.getByLabel("Memo")).toHaveValue("");
  await expect(editor.getByLabel("Start from a template")).toBeFocused();
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toBeUndefined();
  await expect(page.getByRole("button", { name: /undo/i })).toHaveCount(0);
});

test("each unavailable-lookup session can clear its restored draft", async ({
  page,
}, testInfo) => {
  const memo = `Unavailable lookup draft ${testInfo.project.name} ${Date.now()}`;
  const laterMemo = `Later unavailable draft ${testInfo.project.name} ${Date.now()}`;
  const tagFqn = `E2EUnavailable:${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByLabel("Memo").fill(memo);
  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({ tabs: { spend: { memo } } });

  await page.route("**/api/categories?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { error: { code: "internal_error", message: "lookups down" } },
      status: 500,
    });
  });
  await page.reload();
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(editor.getByText("Editor resources unavailable")).toBeVisible();
  await editor.getByRole("button", { name: "Clear draft" }).click();
  const clearDialog = page.getByRole("alertdialog", {
    name: "Clear entry draft?",
  });
  await clearDialog.getByRole("button", { name: "Clear draft" }).click();
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toBeUndefined();
  await expect(editor.getByRole("button", { name: "Retry" })).toBeFocused();

  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await page.unroute("**/api/categories?**");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(editor.getByLabel("Start from a template")).toBeFocused();
  await expect(editor.getByLabel("Memo")).toHaveValue("");

  await editor.getByLabel("Memo").fill(laterMemo);
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({ tabs: { spend: { memo: laterMemo } } });
  await page.route("**/api/categories?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: { code: "internal_error", message: "lookups down again" },
      },
      status: 500,
    });
  });
  const lookupFailure = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/categories" &&
      response.request().method() === "GET" &&
      response.status() === 500,
  );
  const tagsPicker = editor.getByRole("combobox", { name: "Tags" });
  await tagsPicker.fill(tagFqn);
  await expect(
    page.getByRole("option", { name: `Create ${tagFqn}` }),
  ).toBeVisible();
  await tagsPicker.press("Enter");
  await lookupFailure;

  await expect(editor.getByText("lookups down again")).toBeVisible();
  const laterClearButton = editor.getByRole("button", { name: "Clear draft" });
  await expect(laterClearButton).toBeEnabled();
  await laterClearButton.click();
  await page
    .getByRole("alertdialog", { name: "Clear entry draft?" })
    .getByRole("button", { name: "Clear draft" })
    .click();
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toBeUndefined();
});

test("pristine create drafts do not block saved transaction launches", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E pristine launch ${unique}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.00",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-08",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Income" }).click();
  await expect(
    entryPanel.getByRole("heading", { name: "New income" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toBeUndefined();

  await page.reload();
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(
    entryPanel.getByRole("heading", { name: "New income" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await clickRowAction(page, row, "Edit transaction");
  await expect(
    page.getByRole("alertdialog", { name: "Discard entry draft" }),
  ).toHaveCount(0);
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit as journal" }).click();
  await expect(
    entryPanel.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  const discardChangesDialog = page.getByRole("alertdialog", {
    name: "Discard transaction changes?",
  });
  await expect(discardChangesDialog).toBeVisible();
  await discardChangesDialog
    .getByRole("button", { name: "Discard changes" })
    .click();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(
    entryPanel.getByRole("heading", { name: "New income" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await clickRowAction(page, row, "Duplicate transaction");
  await expect(
    page.getByRole("alertdialog", { name: "Discard entry draft" }),
  ).toHaveCount(0);
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  const duplicateSpendPanel = entryPanel.getByRole("tabpanel", {
    name: "Spend",
  });
  await expect(duplicateSpendPanel.getByLabel("Memo")).toHaveValue(memo);
  await expect(duplicateSpendPanel.getByLabel("Amount")).toHaveValue("12");
  await expect(
    page.getByRole("alertdialog", { name: "Discard entry draft" }),
  ).toHaveCount(0);
});

test("dirty and stale-pristine entry drafts use their initialization baseline", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const transactionMemo = `E2E baseline launch ${unique}`;
  const draftMemo = `E2E kept draft ${unique}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.00",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-08",
      memo: transactionMemo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const row = page
    .getByRole("row")
    .filter({ hasText: transactionMemo })
    .first();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await spendPanel.getByLabel("Memo").fill(draftMemo);
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({
      tabs: {
        spend: {
          memo: draftMemo,
        },
      },
    });
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await clickRowAction(page, row, "Edit transaction");
  const discardDialog = page.getByRole("alertdialog", {
    name: "Discard entry draft",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Keep draft" }).click();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(draftMemo);
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await seedStoredPristineTransactionEntryDefaults(page, "2001-02-03", "EUR");
  await clickRowAction(page, row, "Edit transaction");
  await expect(discardDialog).toHaveCount(0);
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await seedStoredPristineTransactionEntryDefaults(page, "2001-02-03", "EUR", {
    date: "2001-02-04",
    name: "spend",
  });
  await clickRowAction(page, row, "Duplicate transaction");
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Keep draft" }).click();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(spendPanel.getByLabel("Date")).toHaveValue("2001-02-04");
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await seedStoredPristineTransactionEntryDefaults(page, "2001-02-03", "EUR", {
    currency: "CAD",
    name: "spend",
  });
  await clickRowAction(page, row, "Split transaction");
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Keep draft" }).click();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(spendPanel.getByLabel("Currency")).toHaveValue("CAD");
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const delayedDraftMemo = `${draftMemo} delayed discard`;
  await spendPanel.getByLabel("Memo").fill(delayedDraftMemo);
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({
      tabs: {
        spend: {
          memo: delayedDraftMemo,
        },
      },
    });
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await clickRowAction(page, row, "Edit transaction");
  await expect(discardDialog).toBeVisible();

  const releaseDeletion = await delayTransactionEntryDraftDeletion(page);
  const discardDraftButton = discardDialog.getByRole("button", {
    name: "Discard draft",
  });
  await discardDraftButton.focus();
  await discardDraftButton.press("Enter");
  const keepDraftButton = discardDialog.getByRole("button", {
    name: "Keep draft",
  });
  await expect(keepDraftButton).toHaveAttribute("aria-disabled", "true");
  await expect(
    discardDialog.getByRole("button", { name: "Discarding" }),
  ).toHaveAttribute("aria-disabled", "true");
  await keepDraftButton.locator("..").hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Draft deletion is in progress; the saved draft cannot be reopened yet.",
  );
  const discardingButton = discardDialog.getByRole("button", {
    name: "Discarding",
  });
  await expect(discardingButton).toBeFocused();
  await discardingButton.locator("..").hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Draft deletion is already in progress.",
  );
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await releaseDeletion();
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const failedDeletionDraftMemo = `${draftMemo} failed deletion`;
  await spendPanel.getByLabel("Memo").fill(failedDeletionDraftMemo);
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({
      tabs: {
        spend: {
          memo: failedDeletionDraftMemo,
        },
      },
    });
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await clickRowAction(page, row, "Edit transaction");
  await expect(discardDialog).toBeVisible();

  const restoreDeletion = await failTransactionEntryDraftDeletion(page);
  await discardDialog.getByRole("button", { name: "Discard draft" }).click();
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await restoreDeletion();
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(spendPanel.getByLabel("Memo")).toHaveValue("");
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toBeUndefined();
});

test("advanced journal entry gates balance, persists drafts, and saves records", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E advanced journal ${unique}`;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await page.getByRole("tab", { name: "Advanced" }).click();
  await expect(
    page.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();

  const saveButton = page.getByRole("button", { name: "Save and add another" });
  await expect(saveButton).toBeDisabled();

  const firstRecord = journalRecord(page, 1);
  const secondRecord = journalRecord(page, 2);

  await expectAdvancedRecordUsableAtDockedWidth(page, firstRecord);
  await expect(
    firstRecord.getByLabel("Record 1 reconciliation status"),
  ).toHaveCount(0);

  await firstRecord.getByLabel("Amount").fill("0");
  await firstRecord.getByLabel("Amount").blur();
  await expect(
    firstRecord.getByText(
      "Enter a signed non-zero amount with up to 8 decimals.",
    ),
  ).toBeVisible();
  await firstRecord.getByLabel("Amount").fill("-10.00");
  await secondRecord.getByLabel("Amount").fill("9.00");
  await expectAdvancedBalanceStatus(page, "USD", "Unbalanced");
  await expect(saveButton).toBeDisabled();
  await secondRecord.getByLabel("Amount").fill("10.00");
  await expectAdvancedBalanceStatus(page, "USD", "Balanced");

  await firstRecord.getByLabel("Memo").fill(memo);
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await page.goto("/transactions?page=1&pageSize=25&entry=new:journal");
  await expect(
    page.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();
  await expect(firstRecord.getByLabel("Amount")).toHaveValue("-10.00");
  await expect(firstRecord.getByLabel("Memo")).toHaveValue(memo);

  await page
    .getByRole("textbox", { exact: true, name: "Date" })
    .fill("2026-05-31");
  await chooseOptionByKeyboard(page, "Account", "Wallet", "cash:Wallet", {
    scope: firstRecord,
  });

  await chooseOptionByKeyboard(
    page,
    "Account",
    "joint_checking",
    "bank:Chase:joint_checking",
    { scope: secondRecord },
  );
  await secondRecord.getByLabel("Amount").fill("-5.00");

  await page.getByRole("button", { name: "Add record" }).click();
  const thirdRecord = journalRecord(page, 3);
  await chooseOptionByKeyboard(
    page,
    "Account",
    "Powells",
    "merchant:PowellsBooks",
    {
      scope: thirdRecord,
    },
  );
  await thirdRecord.getByLabel("Amount").fill("15.00");
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: thirdRecord },
  );
  await thirdRecord.getByLabel("Memo").fill(memo);

  await expectAdvancedBalanceStatus(page, "USD", "Balanced");
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await page.getByLabel("Search").fill(memo);
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();
});

test("create-mode advanced drafts stay independent when switching tabs and keeping a launch draft", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const advancedMemo = `E2E advanced independent ${unique}`;
  const keptMemo = `E2E keep draft ${unique}`;
  const editMemo = `E2E discard prompt edit ${unique}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.00",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-08",
      memo: editMemo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await page.getByRole("tab", { name: "Advanced" }).click();
  await expect(
    page.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();

  const firstRecord = journalRecord(page, 1);
  const secondRecord = journalRecord(page, 2);
  await fillAndExpectValue(firstRecord.getByLabel("Amount"), "-88.10");
  await fillAndExpectValue(firstRecord.getByLabel("Memo"), advancedMemo);
  await fillAndExpectValue(secondRecord.getByLabel("Amount"), "88.10");

  await page.getByRole("tab", { name: "Spend" }).click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await spendPanel.getByLabel("Memo").fill(keptMemo);
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({
      tabs: {
        spend: {
          memo: keptMemo,
        },
      },
    });
  await page.getByRole("tab", { name: "Advanced" }).click();

  await expect(
    entryPanel.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();
  await expect(firstRecord.getByLabel("Amount")).toHaveValue("-88.10");
  await expect(firstRecord.getByLabel("Memo")).toHaveValue(advancedMemo);
  await expect(secondRecord.getByLabel("Amount")).toHaveValue("88.10");

  await page.getByRole("tab", { name: "Spend" }).click();
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(keptMemo);
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({
      tabs: {
        spend: {
          memo: keptMemo,
        },
      },
    });
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: editMemo }).first(),
    "Open transaction detail",
  );
  const detailPanel = page.getByRole("dialog", {
    name: transaction.display_title,
  });
  await expect(detailPanel).toBeVisible();
  await detailPanel
    .getByRole("button", { exact: true, name: "Edit transaction" })
    .click();

  const discardDialog = page.getByRole("alertdialog", {
    name: "Discard entry draft",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Keep draft" }).click();
  await expect(discardDialog).toBeHidden();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(keptMemo);
});

test("the modal protects an in-flight edit from underlying saved-transaction actions", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const initialMemo = `E2E in-flight edit ${unique}`;
  const nextMemo = `E2E next saved transaction ${unique}`;
  const changedMemo = `E2E changed in-flight edit ${unique}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");

  for (const memo of [initialMemo, nextMemo]) {
    const response = await page.request.post("/api/transactions/spend", {
      data: {
        amount: "12.00",
        category_id: category.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-07-08",
        memo,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: initialMemo }).first(),
    "Open transaction detail",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit transaction" })
    .click();

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  const editPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await fillAndExpectValue(editPanel.getByLabel("Memo"), changedMemo);

  const nextRow = page.getByRole("row").filter({ hasText: nextMemo }).first();
  await expect(nextRow).toHaveCount(0);
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  const discardDialog = page.getByRole("alertdialog", {
    name: "Discard transaction changes?",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(discardDialog).toBeHidden();
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(editPanel.getByLabel("Memo")).toHaveValue(changedMemo);
});

test("spend entry escalates to matching journal records", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E escalation ${unique}`;
  const amount = "13.47";

  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await spendPanel.getByLabel("Date").fill("2026-05-31");
  await fillAndExpectValue(spendPanel.getByLabel("Amount"), amount);
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    "Wallet",
    "cash:Wallet",
    { scope: spendPanel },
  );
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
    {
      scope: spendPanel,
    },
  );
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: spendPanel },
  );
  await spendPanel.getByLabel("Memo").fill(memo);
  await page.getByRole("button", { name: "Edit as journal" }).click();

  await expect(
    page.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();
  const firstRecord = journalRecord(page, 1);
  const secondRecord = journalRecord(page, 2);
  await expect(
    firstRecord.getByRole("combobox", { name: "Account" }),
  ).toHaveValue("cash:Wallet");
  await expect(firstRecord.getByLabel("Amount")).toHaveValue(`-${amount}`);
  await expect(
    firstRecord.getByRole("combobox", { name: "Category" }),
  ).toHaveCount(0);
  await expect(firstRecord.getByLabel("Memo")).toHaveValue(memo);
  await expect(
    secondRecord.getByRole("combobox", { name: "Account" }),
  ).toHaveValue("merchant:PowellsBooks");
  await expect(secondRecord.getByLabel("Amount")).toHaveValue(amount);
  await expect(
    secondRecord.getByRole("combobox", { name: "Category" }),
  ).toHaveValue("Entertainment:Books");

  const saveResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Save and add another" }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok()).toBe(true);
  const escalated = (await saveResponse.json()) as TransactionDetailFixture;

  const directResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount,
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo,
      settlement: { status: "posted" },
      reconciliation_status: "unreconciled",
      tag_ids: [],
    },
  });
  expect(directResponse.ok()).toBe(true);
  const direct = (await directResponse.json()) as TransactionDetailFixture;
  expect(comparableRecords(escalated.records)).toEqual(
    comparableRecords(direct.records),
  );

  await page.getByRole("tab", { name: "Income" }).click();
  const incomePanel = entryPanel.getByRole("tabpanel", { name: "Income" });
  await fillAndExpectValue(incomePanel.getByLabel("Amount"), "7.25");
  await chooseOptionByKeyboard(
    page,
    "Destination account",
    "Wallet",
    "cash:Wallet",
    { scope: incomePanel },
  );
  await page.getByRole("button", { name: "Edit as journal" }).click();
  await expect(
    journalRecord(page, 1).getByRole("combobox", { name: "Account" }),
  ).toHaveValue("cash:Wallet");
  await expect(journalRecord(page, 1).getByLabel("Amount")).toHaveValue("7.25");
  await expect(
    journalRecord(page, 2).getByRole("combobox", { name: "Account" }),
  ).toHaveValue("");
  await expect(journalRecord(page, 2).getByLabel("Amount")).toHaveValue(
    "-7.25",
  );
});

test("advanced journal account picker follows selected category intent", async ({
  page,
}) => {
  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await page.getByRole("tab", { name: "Advanced" }).click();

  const firstRecord = journalRecord(page, 1);
  await chooseOptionByKeyboard(page, "Account", "Wallet", "cash:Wallet", {
    scope: firstRecord,
  });
  await expect(
    firstRecord.getByRole("combobox", { name: "Category" }),
  ).toHaveCount(0);

  await chooseOptionByKeyboard(
    page,
    "Account",
    "Powells",
    "merchant:PowellsBooks",
    {
      scope: firstRecord,
    },
  );
  const categoryPicker = firstRecord.getByRole("combobox", {
    name: "Category",
  });
  await expect(categoryPicker).toBeVisible();
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: firstRecord },
  );
});

test("advanced journal account picker keeps suggestions filtered but resolves exact hidden FQNs", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const hiddenFlowFqn = `e2e:advanced:${unique}:HiddenFlow`;
  const expenseCategoryFqn = `E2E:Advanced:${unique}:Expense`;
  const hiddenFlow = await createAccount(page, hiddenFlowFqn, "flow");
  await hideAccount(page, hiddenFlow);
  await createCategory(page, expenseCategoryFqn, "expense");

  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const correctionAccount = findByFqn(accounts, "system:correction");
  const memo = `E2E advanced account parity ${unique}`;

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=25");
  await ledgerLookups;
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await page.getByRole("tab", { name: "Advanced" }).click();

  const firstRecord = journalRecord(page, 1);
  const secondRecord = journalRecord(page, 2);

  await chooseOptionByKeyboard(page, "Account", "Wallet", fundingAccount.fqn, {
    scope: firstRecord,
  });
  await firstRecord.getByLabel("Amount").fill("-10.00");

  await fillAndExpectValue(
    secondRecord.getByRole("combobox", { name: "Account" }),
    "correction",
  );
  const correctionOption = page
    .locator("#advanced-record-1-account-options")
    .getByRole("option")
    .filter({ hasText: correctionAccount.fqn });
  await expect(correctionOption).toBeVisible();
  await expect(
    correctionOption.locator(".text-muted-foreground", {
      hasText: "system:",
    }),
  ).toBeVisible();
  await expect(
    correctionOption.locator(".text-foreground", { hasText: "correction" }),
  ).toBeVisible();
  await chooseOptionByKeyboard(
    page,
    "Account",
    "correction",
    correctionAccount.fqn,
    { scope: secondRecord },
  );
  await secondRecord.getByLabel("Amount").fill("10.00");

  await page.getByRole("button", { name: "Add record" }).click();
  const thirdRecord = journalRecord(page, 3);
  await chooseOptionByKeyboard(page, "Account", "Wallet", fundingAccount.fqn, {
    scope: thirdRecord,
  });
  await thirdRecord.getByLabel("Amount").fill("-20.00");

  await page.getByRole("button", { name: "Add record" }).click();
  const fourthRecord = journalRecord(page, 4);
  const hiddenAccountPicker = fourthRecord.getByRole("combobox", {
    name: "Account",
  });
  await hiddenAccountPicker.fill("HiddenFlow");
  await expect(
    page.locator("#advanced-record-3-account-options"),
  ).toContainText("No matches");
  await hiddenAccountPicker.fill(hiddenFlowFqn);
  await expect(hiddenAccountPicker).toHaveValue(hiddenFlowFqn);
  const hiddenMarker = fourthRecord.getByLabel("Hidden", { exact: true });
  await expect(hiddenMarker).toBeVisible();
  const [pickerBox, markerBox] = await Promise.all([
    hiddenAccountPicker.boundingBox(),
    hiddenMarker.boundingBox(),
  ]);
  expect(pickerBox).not.toBeNull();
  expect(markerBox).not.toBeNull();
  expect(
    Math.abs(
      pickerBox!.y +
        pickerBox!.height / 2 -
        (markerBox!.y + markerBox!.height / 2),
    ),
  ).toBeLessThanOrEqual(1);
  await chooseOptionByKeyboard(
    page,
    "Category",
    expenseCategoryFqn,
    expenseCategoryFqn,
    { scope: fourthRecord },
  );
  await fourthRecord.getByLabel("Amount").fill("20.00");
  await fourthRecord.getByLabel("Memo").fill(memo);

  await expect(
    page.getByRole("button", { name: "Save and add another" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await expect(
    page.locator("[data-transaction-row]").filter({ hasText: memo }),
  ).toBeVisible();
});

test("the entry modal blocks the command palette while an edit is active", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E palette supersede ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "34.56",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-09",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);

  await page.goto("/transactions?page=1&pageSize=50");
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit transaction" })
    .click();

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  const editSpendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(editSpendPanel.getByLabel("Amount")).toHaveValue("34.56");

  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toHaveCount(0);
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(editSpendPanel.getByLabel("Amount")).toHaveValue("34.56");
});

test("cold entry edit deep link composes over restored transaction detail", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E cold entry ${unique}`;
  const missingSearch = `No entry snapshot match ${unique}`;
  const transaction = await createSearchSpend(page, memo);
  const entry = `edit:${transaction.transaction_id}`;
  const entryModal = page.getByRole("dialog", {
    name: "Transaction editor",
  });

  await page.goto(
    `/transactions?page=1&pageSize=25&q=${encodeURIComponent(missingSearch)}` +
      `&entry=${encodeURIComponent(entry)}`,
  );

  await expect(
    entryModal.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(entryModal.getByLabel("Memo")).toHaveValue(memo);
  await expect(
    page.getByRole("heading", {
      includeHidden: true,
      name: "No transactions",
    }),
  ).toBeVisible();
  await expectTransactionsPageUrl(page, 1, 25, {
    entry,
    q: missingSearch,
  });

  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(entryModal).toHaveCount(0);
  await expectTransactionsPageUrl(page, 1, 25, { q: missingSearch });

  await page.goto(
    `/transactions?page=1&pageSize=25&q=${encodeURIComponent(missingSearch)}` +
      `&transaction=${transaction.transaction_id}` +
      `&entry=${encodeURIComponent(entry)}`,
  );

  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();
  await expect(
    entryModal.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(entryModal.getByLabel("Memo")).toHaveValue(memo);
  await expect(
    page.getByRole("heading", {
      includeHidden: true,
      name: "No transactions",
    }),
  ).toBeVisible();
  await expectTransactionsPageUrl(page, 1, 25, {
    entry,
    q: missingSearch,
    transaction: String(transaction.transaction_id),
  });

  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await expect(entryModal).toHaveCount(0);
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel).toHaveAccessibleName(transaction.display_title);
  await expect(
    detailPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(memo);
  await expectTransactionsPageUrl(page, 1, 25, {
    q: missingSearch,
    transaction: String(transaction.transaction_id),
  });
});

test("entry modal deep links compose with history and report missing transactions", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E entry deep link ${unique}`;
  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.75",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-10",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;
  const entryModal = page.getByRole("dialog", {
    name: "Transaction editor",
  });

  await page.goto("/overview");
  const overviewHeading = page.getByRole("heading", { name: "Overview" });
  await expect(overviewHeading).toBeVisible();
  await overviewHeading.focus();
  await page.keyboard.press("n");
  await expect(page).toHaveURL(/[?&]entry=new(?:&|$)/);
  await expect(entryModal).toBeVisible();
  await page.goBack();
  await expect(entryModal).toHaveCount(0);
  await expect(page).toHaveURL(/\/overview$/);

  await page.goto(`/settings?entry=edit:${transaction.transaction_id}`);
  await expect(
    entryModal.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(entryModal.getByLabel("Memo")).toHaveValue(memo);

  await page.goto(`/settings?entry=split:${transaction.transaction_id}`);
  await expect(
    entryModal.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();

  await page.goto(`/settings?entry=duplicate:${transaction.transaction_id}`);
  await expect(
    entryModal.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(entryModal.getByLabel("Memo")).toHaveValue(memo);

  await page.goto("/settings?entry=edit:999999999");
  await expect(
    entryModal.getByRole("heading", { name: "Transaction unavailable" }),
  ).toBeVisible();
  await expect(entryModal.getByRole("alert")).toContainText(
    "transaction not found",
  );
});

test("opening the entry modal exits edit mode and takes over a narrow viewport", async ({
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

  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await page.setViewportSize({ width: 600, height: 700 });
  await page.goto("/overview?entry=new");
  const entryModal = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(entryModal).toBeVisible();
  const bounds = await entryModal.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeCloseTo(0, 0);
  expect(bounds!.y).toBeCloseTo(0, 0);
  expect(bounds!.width).toBeCloseTo(600, 0);
  expect(bounds!.height).toBeCloseTo(700, 0);
});

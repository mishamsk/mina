import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  activateTransactionRow,
  type CategoryFixture,
  chooseOptionByKeyboard,
  clickRowAction,
  comparableRecords,
  createAccount,
  createExpectedRecurringFixture,
  createMember,
  createSearchSpend,
  createTag,
  deleteTransaction,
  expect,
  expectAccountLinkNavigation,
  expectDatelessReadOnlyDetailGrid,
  expectFocusedAccountLabel,
  expectKeyboardDisclosure,
  expectMouseDisclosure,
  expectTransactionFilterUrl,
  expectTransactionsPageUrl,
  fillAndExpectValue,
  findByFqn,
  journalRecord,
  listFixtures,
  type Locator,
  openAccountTransactionDetail,
  openRowActionsMenu,
  openUrlTransactionDetail,
  type Page,
  readStoredTransactionEntryDraft,
  type Route,
  type TransactionDetailFixture,
  type TransactionFixture,
  waitForLedgerLookups,
} from "@tests/e2e/transactions/support";

import type { Transaction } from "@/api";

const formatBrowserTimestamp = async (
  page: Page,
  value: string,
): Promise<string> =>
  page.evaluate(
    (timestamp) =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(timestamp)),
    value,
  );

test("cold transaction detail deep link restores outside the list snapshot", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E cold detail ${unique}`;
  const missingSearch = `No snapshot match ${unique}`;
  const transaction = await createSearchSpend(page, memo);

  await page.goto(
    `/transactions?page=1&pageSize=25&q=${encodeURIComponent(missingSearch)}` +
      `&transaction=${transaction.transaction_id}`,
  );

  await expect(
    page.getByRole("heading", { name: "No transactions" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-transaction-row]").filter({ hasText: memo }),
  ).toHaveCount(0);
  const panel = page.getByTestId("transaction-detail-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAccessibleName(transaction.display_title);
  await expect(panel.getByTestId("transaction-detail-summary-memo")).toHaveText(
    memo,
  );
  await expect(
    panel
      .getByTestId("transaction-detail-records-table")
      .locator("tr[data-detail-record-row='true']"),
  ).toHaveCount(2);
  await expect(panel.getByText("cash:Wallet").first()).toBeVisible();
  await expect(panel.getByText("merchant:PowellsBooks").first()).toBeVisible();
  await expectTransactionsPageUrl(page, 1, 25, {
    q: missingSearch,
    transaction: String(transaction.transaction_id),
  });

  await page.keyboard.press("Escape");

  await expect(panel).toHaveCount(0);
  await expectTransactionsPageUrl(page, 1, 25, { q: missingSearch });
});

test("recurring transaction detail links back to its definition", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const expected = await createExpectedRecurringFixture(
    page,
    `${slug}${Date.now()}Backlink${"LongSegment".repeat(8)}`,
  );

  await page.goto(
    `/transactions?page=1&pageSize=50&transaction=${expected.transactionId}`,
  );
  const panel = page.getByTestId("transaction-detail-panel");
  const definitionLink = panel.getByRole("link", {
    name: expected.recurringDefinitionFqn,
  });
  await expect(definitionLink).toBeVisible();
  await expect(
    panel.getByTestId("transaction-recurring-definition"),
  ).toContainText(expected.recurringDefinitionFqn);
  expect(
    (await definitionLink.locator(":scope > span").allTextContents()).join(""),
  ).toBe(expected.recurringDefinitionFqn);
  await page.setViewportSize({ width: 343, height: 900 });
  await expect
    .poll(() =>
      panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });

  await definitionLink.click();

  await expect(page).toHaveURL(
    new RegExp(`/recurring#definition-${expected.recurringDefinitionId}$`),
  );
  const definitionRow = page.locator(
    `#definition-${expected.recurringDefinitionId}`,
  );
  await expect(definitionRow).toContainText(expected.recurringDefinitionFqn);
  await expect(
    definitionRow.getByTestId("recurring-transaction-source-marker"),
  ).toHaveCount(0);
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeFocused();
  await expect(editor.getByLabel("Definition FQN")).toHaveValue(
    expected.recurringDefinitionFqn,
  );

  await editor.getByRole("button", { name: "Close definition editor" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page).toHaveURL(/\/recurring$/);
  await expect(definitionRow).toBeFocused();

  const pause = definitionRow.getByRole("button", { name: "Pause" });
  await pause.focus();
  await pause.press("Enter");
  const resume = definitionRow.getByRole("button", { name: "Resume" });
  await expect(page.getByText("Definition paused.")).toBeVisible();
  await expect(resume).toBeFocused();

  const cancelled = await page.request.delete(
    `/api/recurring-definitions/${expected.recurringDefinitionId}`,
  );
  expect(cancelled.ok(), await cancelled.text()).toBe(true);
  await page.goto(
    `/transactions?page=1&pageSize=50&transaction=${expected.transactionId}`,
  );
  const cancelledProvenance = page.getByTestId(
    "transaction-recurring-definition",
  );
  await expect(cancelledProvenance).toContainText(
    expected.recurringDefinitionFqn,
  );
  await expect(cancelledProvenance.getByRole("link")).toHaveCount(0);
});

test("definition saves refresh mounted provenance and consume the backlink", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const expected = await createExpectedRecurringFixture(
    page,
    `${slug}${Date.now()}BacklinkRefresh`,
  );
  await page.goto(
    `/transactions?page=1&pageSize=50&transaction=${expected.transactionId}`,
  );
  const panel = page.getByTestId("transaction-detail-panel");
  await panel
    .getByRole("link", { name: expected.recurringDefinitionFqn })
    .click();
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeFocused();

  await page.goBack();
  await expectTransactionsPageUrl(page, 1, 50, {
    transaction: String(expected.transactionId),
  });
  await expect(editor).toBeVisible();
  const renamedFqn = `${expected.recurringDefinitionFqn}:Renamed`;
  await editor.getByLabel("Definition FQN").fill(renamedFqn);
  await editor.getByRole("button", { name: "Save definition" }).click();

  await expect(editor).toHaveCount(0);
  await expect(panel.getByRole("link", { name: renamedFqn })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/recurring$/);
  await expect(editor).toHaveCount(0);
});

test("definition save completion preserves newer route navigation", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const expected = await createExpectedRecurringFixture(
    page,
    `${slug}${Date.now()}BacklinkSaveNavigation`,
  );
  await page.goto(
    `/transactions?page=1&pageSize=50&transaction=${expected.transactionId}`,
  );
  const panel = page.getByTestId("transaction-detail-panel");
  await panel
    .getByRole("link", { name: expected.recurringDefinitionFqn })
    .click();
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeFocused();

  let releaseSave = () => {};
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let markSaveStarted = () => {};
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  const definitionPath = `/api/recurring-definitions/${expected.recurringDefinitionId}`;
  await page.route(`**${definitionPath}`, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    markSaveStarted();
    await saveGate;
    await route.continue();
  });

  await editor
    .getByLabel("Definition FQN")
    .fill(`${expected.recurringDefinitionFqn}:Renamed`);
  await editor.getByRole("button", { name: "Save definition" }).click();
  await saveStarted;
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(page).toHaveURL(/\/accounts$/);

  releaseSave();
  await expect(editor).toHaveCount(0);
  await expect(page).toHaveURL(/\/accounts$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/recurring$/);
  await expect(editor).toHaveCount(0);
});

test("a captured BlueCash Target spend without amounts is offered for Spend and Refund", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const templateFqn = `E2E:${unique}:BlueCash Target`;
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const blueCash = findByFqn(accounts, "bank:Amex:BlueCash");
  const target = findByFqn(accounts, "merchant:Target");
  const accountFilter = `account:"${blueCash.fqn}"`;
  const transactionsResponse = await page.request.get(
    `/api/transactions?limit=500&offset=0&sort=initiated_date&sort_dir=desc&filter=${encodeURIComponent(accountFilter)}&search=${encodeURIComponent("Household supplies")}`,
  );
  expect(transactionsResponse.ok(), await transactionsResponse.text()).toBe(
    true,
  );
  const transactionsBody = (await transactionsResponse.json()) as {
    readonly transactions: readonly TransactionDetailFixture[];
  };
  const transaction = transactionsBody.transactions.find(
    (candidate) =>
      candidate.records.some(
        (record) => record.account_id === blueCash.account_id,
      ) &&
      candidate.records.some(
        (record) => record.account_id === target.account_id,
      ),
  );
  expect(transaction, "demo BlueCash to Target spend").toBeDefined();

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent("Household supplies")}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction!.transaction_id}"]`,
  );
  await expect(row).toBeVisible();
  await clickRowAction(page, row, "Create template");

  const templateEditor = page.getByRole("dialog", { name: "New template" });
  await templateEditor.getByLabel("Template FQN").fill(templateFqn);
  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });
  await templateEditor.getByRole("button", { name: "Create template" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status(), await createResponse.text()).toBe(201);
  const template = (await createResponse.json()) as {
    readonly compatible_shorthands: readonly string[];
    readonly records: readonly unknown[];
    readonly transaction_template_id: number;
  };
  expect(template.compatible_shorthands).toEqual(["spend"]);
  await expect(templateEditor).toHaveCount(0);

  await page.goto("/templates");
  const templateRow = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: templateFqn });
  await templateRow.getByRole("button", { name: "Edit template" }).click();
  const editTemplate = page.getByRole("dialog", { name: "Edit template" });
  const amountFields = editTemplate.getByLabel("Amount (optional)");
  await expect(amountFields).toHaveCount(2);
  await amountFields.nth(0).fill("");
  await amountFields.nth(1).fill("");
  await editTemplate.getByRole("button", { name: "Save template" }).click();
  await expect(editTemplate).toHaveCount(0);

  await page.goto("/transactions");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const entryEditor = page.getByRole("dialog", { name: "Transaction editor" });
  const templatePicker = entryEditor.getByRole("combobox", {
    name: "Start from a template",
  });
  await templatePicker.fill(templateFqn);
  await templatePicker.press("Enter");
  await expect(
    entryEditor.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(entryEditor.getByLabel("Funding account")).toHaveValue(
    blueCash.fqn,
  );
  const merchant = entryEditor.getByRole("group", { name: "Merchant 1" });
  await expect(merchant.getByLabel("Merchant account")).toHaveValue(target.fqn);
  await expect(merchant.getByLabel("Category")).toHaveValue(
    "Shopping:Household",
  );
  await expect(merchant.getByLabel("Amount")).toHaveValue("");
  await expect(entryEditor.getByLabel("Member")).toHaveValue("Morgan");
  await expect(entryEditor.getByLabel("Memo")).toHaveValue(
    "Household supplies",
  );

  await entryEditor.getByRole("button", { name: "Clear draft" }).click();
  await page
    .getByRole("alertdialog", { name: "Clear entry draft?" })
    .getByRole("button", { name: "Clear draft" })
    .click();
  await entryEditor.getByRole("tab", { name: "Refund" }).click();
  await templatePicker.fill(templateFqn);
  await templatePicker.press("Enter");
  await expect(
    entryEditor.getByRole("heading", { name: "New refund" }),
  ).toBeVisible();
  await expect(entryEditor.getByLabel("Destination account")).toHaveValue(
    blueCash.fqn,
  );
  await expect(entryEditor.getByLabel("Merchant", { exact: true })).toHaveValue(
    target.fqn,
  );
  await expect(entryEditor.getByLabel("Category")).toHaveValue(
    "Shopping:Household",
  );
  await expect(entryEditor.getByLabel("Amount")).toHaveValue("");

  const deleteTemplateResponse = await page.request.delete(
    `/api/transaction-templates/${template.transaction_template_id}`,
  );
  expect(deleteTemplateResponse.ok(), await deleteTemplateResponse.text()).toBe(
    true,
  );
});

test("transaction rows and detail create date-free template drafts", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 720, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories, tag, member, partyAccount] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
    createTag(page, `E2E:TemplateCapture:${unique}:Reviewed`),
    createMember(page, `Template capture ${unique}`),
    createAccount(page, `people:E2E:TemplateCapture:${unique}`, "party", "USD"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E template capture ${unique}`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-22",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-30.00000000",
          category_id: null,
          currency: "USD",
          member_id: member.member_id,
          memo,
          reconciliation_status: "reconciled",
          settlement: { status: "posted" },
          source: "manual",
          tag_ids: [tag.tag_id],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "10.00000000",
          category_id: category.category_id,
          currency: "USD",
          member_id: null,
          memo: `${memo} merchant`,
          reconciliation_status: "unreconciled",
          settlement: null,
          source: "manual",
          tag_ids: [tag.tag_id],
        },
        {
          account_id: partyAccount.account_id,
          amount: "20.00000000",
          category_id: null,
          currency: "USD",
          member_id: member.member_id,
          memo: `${memo} share`,
          reconciliation_status: "unreconciled",
          settlement: { status: "pending" },
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await expect(row).toBeVisible();
  const overflowAction = row.getByRole("button", { name: "More row actions" });
  await clickRowAction(page, row, "Create template");

  const editor = page.getByRole("dialog", { name: "New template" });
  await expect(editor.getByLabel("Template FQN")).toBeFocused();
  await expect(editor.getByLabel("Template FQN")).toHaveValue("");
  await expect(editor.getByLabel("Date")).toHaveCount(0);
  await expect(editor).not.toContainText("2026-07-22");
  const editorRecords = editor
    .getByLabel("Template records")
    .locator("section");
  await expect(editorRecords).toHaveCount(3);
  await expect(
    editorRecords.nth(0).getByLabel("Account (optional)"),
  ).toHaveValue(fundingAccount.fqn);
  await expect(
    editorRecords.nth(0).getByLabel("Amount (optional)"),
  ).toHaveValue("-30");
  await expect(
    editorRecords.nth(0).getByLabel("Currency (optional)"),
  ).toHaveValue("USD");
  await expect(
    editorRecords.nth(0).getByLabel("Member (optional)"),
  ).toHaveValue(member.name);
  await expect(editorRecords.nth(0).getByLabel("Memo (optional)")).toHaveValue(
    memo,
  );
  await expect(editorRecords.nth(0)).toContainText(tag.name);
  await expect(
    editorRecords.nth(1).getByLabel("Category (optional)"),
  ).toHaveValue(category.fqn);

  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(editor).toHaveCount(0);
  await expect(overflowAction).toBeFocused();

  await row.focus();
  await row.press("Enter");
  const panel = page.getByTestId("transaction-detail-panel");
  const detailCreateAction = panel.getByRole("button", {
    name: "Create template",
  });
  await expect(detailCreateAction).toBeVisible();
  await detailCreateAction.click();
  const detailEditor = page.getByRole("dialog", { name: "New template" });
  await expect(page.getByTestId("template-editor-overlay")).toHaveAttribute(
    "data-modal-overlay",
    "true",
  );
  const templateFqn = `E2E:${unique}:Captured transaction`;
  await detailEditor.getByLabel("Template FQN").fill(templateFqn);
  const templateRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      request.method() === "POST"
    );
  });
  const templateResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });
  await detailEditor.getByRole("button", { name: "Create template" }).click();
  const templateRequest = await templateRequestPromise;
  const templatePayload = templateRequest.postDataJSON() as Record<
    string,
    unknown
  >;
  expect(Object.keys(templatePayload).sort()).toEqual(["fqn", "records"]);
  expect(templatePayload).toEqual({
    fqn: templateFqn,
    records: transaction.records.map((record) => ({
      account_id: record.account_id,
      amount: record.amount,
      category_id: record.category_id,
      currency: record.currency,
      member_id: record.member_id ?? null,
      memo: record.memo ?? null,
      tag_ids: [...record.tag_ids],
    })),
  });
  const templateResponse = await templateResponsePromise;
  expect(templateResponse.status(), await templateResponse.text()).toBe(201);
  const createdTemplate = (await templateResponse.json()) as {
    readonly transaction_template_id: number;
  };
  await expect(detailEditor).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(detailCreateAction).toBeFocused();
  const templateNotice = page.getByRole("button", {
    name: "Dismiss notice: Template created.",
  });
  await expect(templateNotice).toBeVisible();
  const [noticeBox, deleteBox] = await Promise.all([
    templateNotice.boundingBox(),
    panel.getByRole("button", { name: "Delete" }).boundingBox(),
  ]);
  expect(noticeBox).not.toBeNull();
  expect(deleteBox).not.toBeNull();
  expect(
    noticeBox!.x < deleteBox!.x + deleteBox!.width &&
      noticeBox!.x + noticeBox!.width > deleteBox!.x &&
      noticeBox!.y < deleteBox!.y + deleteBox!.height &&
      noticeBox!.y + noticeBox!.height > deleteBox!.y,
  ).toBe(false);

  await panel.getByRole("button", { name: "Close transaction detail" }).click();
  await page.keyboard.press("Control+K");
  const commandSearch = page.getByRole("combobox", { name: "Command search" });
  await commandSearch.fill(templateFqn);
  const useTemplate = page.getByRole("option", {
    name: `Use ${templateFqn}`,
  });
  await expect(useTemplate).toBeVisible();
  await useTemplate.click();
  const entryEditor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(entryEditor.getByLabel("Start from a template")).toHaveValue("");
  await expect(entryEditor.getByLabel("Date")).not.toHaveValue("2026-07-22");
  await expect(entryEditor.getByLabel("Record 1 memo")).toHaveValue(memo);
  await expect(entryEditor.getByLabel("Record 3 amount")).toHaveValue(
    "20.00000000",
  );
  await entryEditor
    .getByRole("button", { name: "Close transaction editor" })
    .click();

  const deleteTemplateResponse = await page.request.delete(
    `/api/transaction-templates/${createdTemplate.transaction_template_id}`,
  );
  expect(deleteTemplateResponse.ok(), await deleteTemplateResponse.text()).toBe(
    true,
  );
  await deleteTransaction(page, transaction);
});

test("template save reports a failed refresh outside Templates", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E template refresh failure ${unique}`;
  const templateFqn = `E2E:${unique}:Refresh failure feedback`;
  const transaction = await createSearchSpend(page, memo);
  await page.route("**/api/transaction-templates?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "internal_error", message: "refresh unavailable" },
      }),
      contentType: "application/json",
      status: 500,
    });
  });

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await row.focus();
  await row.press("Enter");
  const panel = page.getByTestId("transaction-detail-panel");
  await panel.getByRole("button", { name: "Create template" }).click();
  const editor = page.getByRole("dialog", { name: "New template" });
  await editor.getByLabel("Template FQN").fill(templateFqn);
  const saveResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });
  await editor.getByRole("button", { name: "Create template" }).click();
  const created = (await (await saveResponsePromise).json()) as {
    readonly transaction_template_id: number;
  };

  await expect(editor).toHaveCount(0);
  const failedRefreshNotice = page.getByRole("button", {
    name: "Dismiss notice: Template created. Template choices could not be refreshed.",
  });
  await expect(failedRefreshNotice).toBeVisible();
  await page.keyboard.press("n");
  const entryEditor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(entryEditor).toBeVisible();
  await expect(failedRefreshNotice).toHaveCSS("color", "rgb(200, 30, 30)");
  await entryEditor
    .getByRole("button", { name: "Close transaction editor" })
    .click();

  const deleteTemplateResponse = await page.request.delete(
    `/api/transaction-templates/${created.transaction_template_id}`,
  );
  expect(deleteTemplateResponse.ok(), await deleteTemplateResponse.text()).toBe(
    true,
  );
  await deleteTransaction(page, transaction);
});

test("transaction detail panel shows full records and supports deep links", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const tagFqns = [
    `E2E:Detail:${unique}:Aardvark${unique}`,
    ...Array.from(
      { length: 11 },
      (_, index) =>
        `E2E:Detail:${unique}:DetailOverflow${String(index + 1).padStart(2, "0")}${unique}`,
    ),
  ];
  const createdTags = await Promise.all(
    tagFqns.map((fqn) => createTag(page, fqn)),
  );
  const [accounts, categories, member] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
    createMember(page, `E2EDetailMember${unique.repeat(6)}`),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E detail ${unique} full memo with receipt notes, household context, and enough words to be truncated on the transaction line but readable in the panel`;
  const alternateMemo = `E2E detail ${unique} alternate`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "42.19",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-06-30",
      member_id: member.member_id,
      memo,
      tag_ids: createdTags.map((tag) => tag.tag_id),
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as Transaction;
  expect(transaction.updated_at).toBe(transaction.created_at);
  expect(
    transaction.records.every(
      (record) => record.updated_at === record.created_at,
    ),
  ).toBe(true);
  const changedRecord = transaction.records[0];
  expect(changedRecord).toBeDefined();
  const changedReconciliationStatus =
    changedRecord!.reconciliation_status === "reconciled"
      ? "unreconciled"
      : "reconciled";
  const updateResponse = await page.request.post(
    "/api/records/bulk/reconciliation",
    {
      data: {
        reconciliation_status: changedReconciliationStatus,
        record_ids: [changedRecord!.record_id],
      },
    },
  );
  expect(updateResponse.ok(), await updateResponse.text()).toBe(true);
  const detailResponse = await page.request.get(
    `/api/transactions/${transaction.transaction_id}`,
  );
  expect(detailResponse.ok(), await detailResponse.text()).toBe(true);
  const updatedTransaction = (await detailResponse.json()) as Transaction;
  const changedRecordIndex = updatedTransaction.records.findIndex(
    (record) => record.record_id === changedRecord!.record_id,
  );
  const unchangedRecordIndex = updatedTransaction.records.findIndex(
    (record) => record.record_id !== changedRecord!.record_id,
  );
  expect(changedRecordIndex).toBeGreaterThanOrEqual(0);
  expect(unchangedRecordIndex).toBeGreaterThanOrEqual(0);
  const updatedRecord = updatedTransaction.records[changedRecordIndex];
  expect(updatedTransaction.updated_at).not.toBe(updatedTransaction.created_at);
  expect(updatedRecord!.updated_at).not.toBe(updatedRecord!.created_at);
  const expectedTransactionUpdate = await formatBrowserTimestamp(
    page,
    updatedTransaction.updated_at,
  );
  const expectedRecordUpdate = await formatBrowserTimestamp(
    page,
    updatedRecord!.updated_at,
  );
  const alternateSpendResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "7.18",
        category_id: category.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-07-01",
        memo: alternateMemo,
      },
    },
  );
  expect(alternateSpendResponse.ok()).toBe(true);
  const alternateTransaction =
    (await alternateSpendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const detailRow = page.getByRole("row").filter({ hasText: memo }).first();
  const alternateDetailRow = page
    .getByRole("row")
    .filter({ hasText: alternateMemo })
    .first();
  await expect(detailRow).toBeVisible();
  await expect(alternateDetailRow).toBeVisible();
  await expect(
    detailRow
      .locator(".transactions-tags-column")
      .getByTestId("transaction-tags-overflow"),
  ).toBeVisible();

  const newTransactionButton = page
    .locator("header")
    .getByRole("button", { name: "New transaction" });
  await newTransactionButton.click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(entryPanel).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(entryPanel).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]entry=/);
  await expect(newTransactionButton).toBeFocused();

  await activateTransactionRow(detailRow);

  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${transaction.transaction_id}(?:&|$)`),
  );
  const panel = page.getByTestId("transaction-detail-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveRole("dialog");
  await expect(panel.getByTestId("transaction-lifecycle")).toBeVisible();
  await expect(panel).toHaveAccessibleName(transaction.display_title);
  await expect(panel).not.toHaveAttribute("aria-modal", "true");
  const classBadge = panel.getByTestId("class-badge");
  await expect(classBadge).toHaveRole("img");
  await expect(classBadge).toHaveAccessibleName("Spend");
  await expect(classBadge.getByText("SPEND", { exact: true })).toBeVisible();
  await expect(classBadge.locator("svg")).toBeVisible();
  await classBadge.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Spend" }),
  ).toBeVisible();
  await panel.getByRole("heading", { name: "Journal records" }).hover();
  const metadata = panel.locator(
    "section[aria-labelledby='transaction-detail-metadata']",
  );
  await expect(metadata.getByText("Class", { exact: true })).toHaveCount(0);
  await expect(metadata.getByText("Source", { exact: true })).toBeVisible();
  await expect(metadata.getByText("Created", { exact: true })).toBeVisible();
  await expect(metadata.getByText("Updated", { exact: true })).toBeVisible();
  await expect(metadata.getByTestId("transaction-updated-at")).toHaveText(
    expectedTransactionUpdate,
  );
  await expect(
    panel.getByTestId("amount-chip").filter({ hasText: "-42.19 $" }).first(),
  ).toBeVisible();
  await expect(panel.getByTestId("transaction-detail-summary-memo")).toHaveText(
    memo,
  );
  await expect(panel.getByText("Journal records")).toBeVisible();
  const recordTable = panel.getByTestId("transaction-detail-records-table");
  expect(
    (await recordTable.locator("th").allTextContents()).map((text) =>
      text.trim(),
    ),
  ).toEqual(["Role", "Account", "Amount", "Category"]);
  const recordRows = recordTable.locator("tr[data-detail-record-row='true']");
  await expect(recordRows).toHaveCount(2);
  await expect(recordRows.first().locator("td")).toHaveCount(4);
  await expect(
    recordTable.locator(
      "td[data-label='Tags'], td[data-label='Member'], td[data-label='Status'], td[data-label='Memo']",
    ),
  ).toHaveCount(0);
  await expect(panel.getByText("cash:Wallet").first()).toBeVisible();
  await expect(panel.getByText("merchant:PowellsBooks").first()).toBeVisible();
  await expect(panel.getByText("Entertainment:Books").first()).toBeVisible();
  const expectAmountCategorySeparation = async () => {
    await expect
      .poll(() =>
        recordRows.evaluateAll((rows) =>
          rows.every((row) => {
            const amountCell = row.querySelector<HTMLElement>(
              "td[data-label='Amount']",
            );
            const categoryCell = row.querySelector<HTMLElement>(
              "td[data-label='Category']",
            );
            if (!amountCell || !categoryCell) {
              return false;
            }
            const amountBounds = amountCell.getBoundingClientRect();
            const categoryBounds = categoryCell.getBoundingClientRect();
            const categoryChip =
              categoryCell.querySelector<HTMLElement>("button");
            const categoryChipBounds = categoryChip?.getBoundingClientRect();
            const cellsOverlap =
              amountBounds.left < categoryBounds.right - 0.5 &&
              amountBounds.right > categoryBounds.left + 0.5 &&
              amountBounds.top < categoryBounds.bottom - 0.5 &&
              amountBounds.bottom > categoryBounds.top + 0.5;
            const chipFitsCategory =
              !categoryChipBounds ||
              (categoryChipBounds.left >= categoryBounds.left - 0.5 &&
                categoryChipBounds.right <= categoryBounds.right + 0.5);
            return !cellsOverlap && chipFitsCategory;
          }),
        ),
      )
      .toBe(true);
  };
  for (const width of [1920, 760, 740, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectAmountCategorySeparation();
  }
  await page.setViewportSize({ width: 1920, height: 760 });
  await expect
    .poll(() =>
      panel
        .getByTestId("transaction-detail-records-table")
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    )
    .toBe(true);
  for (const tag of createdTags) {
    await expect(recordTable.getByText(tag.fqn, { exact: false })).toHaveCount(
      0,
    );
  }
  await expect(recordTable.getByText(member.name, { exact: true })).toHaveCount(
    0,
  );
  await recordRows.nth(changedRecordIndex).click();
  const disclosure = recordTable.locator("tr.detail-records-disclosure-row");
  await expect(disclosure).toBeVisible();
  await expect(disclosure.getByTestId("record-updated-at")).toHaveText(
    expectedRecordUpdate,
  );
  await expect(disclosure).toContainText(memo);
  for (const tag of createdTags) {
    await expect(
      disclosure.getByTestId("record-disclosure-tags"),
    ).toContainText(tag.fqn);
  }
  await expect(disclosure.getByTestId("record-disclosure-member")).toHaveText(
    member.name,
  );
  await page.setViewportSize({ width: 760, height: 900 });
  for (const value of [
    disclosure.getByTestId("record-disclosure-tags"),
    disclosure.getByTestId("record-disclosure-member"),
  ]) {
    await expect
      .poll(() =>
        value.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 1920, height: 760 });
  await expect(
    disclosure.locator(
      "button, [data-slot='tooltip-trigger'], [data-testid*='chip']",
    ),
  ).toHaveCount(0);
  await recordRows.nth(unchangedRecordIndex).click();
  const unchangedDisclosure = recordRows
    .nth(unchangedRecordIndex)
    .locator("xpath=following-sibling::tr[1]");
  await expect(unchangedDisclosure).toBeVisible();
  await expect(unchangedDisclosure.getByTestId("record-updated-at")).toHaveText(
    "Never",
  );

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await alternateDetailRow.locator(".transactions-description-column").click();
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${alternateTransaction.transaction_id}(?:&|$)`),
  );
  const alternatePanel = page.getByRole("dialog", {
    name: alternateTransaction.display_title,
  });
  await expect(alternatePanel).toBeVisible();
  await expect(alternatePanel.getByTestId("transaction-updated-at")).toHaveText(
    "Never",
  );
  await page.keyboard.press("Escape");

  await activateTransactionRow(detailRow);
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await alternateDetailRow.scrollIntoViewIfNeeded();
  await alternateDetailRow.focus();
  await expect(alternateDetailRow).toBeFocused();
  await alternateDetailRow.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${alternateTransaction.transaction_id}(?:&|$)`),
  );
  await expect(alternatePanel).toBeVisible();
  await expect(
    alternatePanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(alternateMemo);

  await page.keyboard.press("Escape");
  await expect(alternatePanel).toBeHidden();
  await expect(entryPanel).toHaveCount(0);
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);

  await activateTransactionRow(detailRow);
  await expect(panel).toBeVisible();
  await page.keyboard.press("KeyN");
  await expect(entryPanel).toBeVisible();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(entryPanel).toHaveCount(0);
  await expect(panel).toBeVisible();

  await page.goto(
    `/transactions?page=2&pageSize=25&transaction=${transaction.transaction_id}`,
  );
  const deepLinkPanel = page.getByRole("dialog", {
    name: transaction.display_title,
  });
  await expect(deepLinkPanel).toBeVisible();
  await expect(
    deepLinkPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(memo);

  await page.keyboard.press("Escape");
  await expect(deepLinkPanel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=2&pageSize=25$/);
});

test("transaction detail account paths navigate without record-row side effects", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [account, merchant, categories] = await Promise.all([
    createAccount(
      page,
      `e2e:DetailLinks:${unique}:Household:Checking`,
      "owned",
      "USD",
    ),
    createAccount(page, `e2eDetailLinks${unique}:LinkTarget`, "flow", "USD"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E detail account links ${unique}`;
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "31.27",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: account.account_id,
      initiated_date: "2026-07-23",
      memo,
    },
  });
  expect(createResponse.ok()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionFixture;

  let panel = await openUrlTransactionDetail(page, transaction.transaction_id);
  let accountLink = panel.getByRole("link", {
    exact: true,
    name: account.display_label,
  });
  let recordRow = accountLink.locator("xpath=ancestor::tr");
  await expect(accountLink).toHaveCount(1);
  await expect(recordRow.getByRole("link")).toHaveCount(1);
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await expectFocusedAccountLabel(
    panel.locator(`a[href='/accounts/${merchant.account_id}']`),
    merchant,
  );
  await expect(page.locator("[data-slot='tooltip-content']")).toBeVisible();
  await accountLink.click();
  await expectAccountLinkNavigation(page, account);

  panel = await openUrlTransactionDetail(page, transaction.transaction_id);
  accountLink = panel.getByRole("link", {
    exact: true,
    name: account.display_label,
  });
  recordRow = accountLink.locator("xpath=ancestor::tr");
  await recordRow.focus();
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "true");
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await expectFocusedAccountLabel(accountLink, account);
  await accountLink.press("Enter");
  await expectAccountLinkNavigation(page, account);

  panel = await openAccountTransactionDetail(page, merchant, memo);
  accountLink = panel.getByRole("link", {
    exact: true,
    name: account.display_label,
  });
  recordRow = accountLink.locator("xpath=ancestor::tr");
  await expect(accountLink).toHaveCount(1);
  await expect(recordRow.getByRole("link")).toHaveCount(1);
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await accountLink.click();
  await expectAccountLinkNavigation(page, account);

  panel = await openAccountTransactionDetail(page, merchant, memo);
  accountLink = panel.getByRole("link", {
    exact: true,
    name: account.display_label,
  });
  recordRow = accountLink.locator("xpath=ancestor::tr");
  await recordRow.focus();
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "true");
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await expectFocusedAccountLabel(accountLink, account);
  await accountLink.press("Enter");
  await expectAccountLinkNavigation(page, account);
});

test("transaction detail panel is read-only while category chips keep filtering", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1920, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const [initialTag, member] = await Promise.all([
    createTag(page, `E2E:DetailReadonly:${unique}:InitialTag`),
    createMember(page, `Detail editor ${unique}`),
  ]);
  const memo = `E2E detail read-only ${unique} with a complete wrapped memo`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-17.43000000",
          category_id: null,
          currency: "USD",
          member_id: member.member_id,
          memo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          member_id: member.member_id,
          memo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&transaction=${transaction.transaction_id}`,
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(panel).toBeVisible();
  await expect(row).toBeVisible();
  await expect(
    panel.getByRole("button", { exact: true, name: "Edit" }),
  ).toBeVisible();
  await expect(panel.locator("td[data-label][tabindex]")).toHaveCount(0);
  await expect(panel.locator("input, textarea, select")).toHaveCount(0);

  const accountCell = panel.locator("td[data-label='Account']").first();
  const amountChip = panel.getByTestId("amount-chip").first();
  const detailRecordRow = panel
    .locator("tr[data-detail-record-row='true']")
    .first();
  for (const target of [accountCell, amountChip, detailRecordRow]) {
    await target.hover();
    await expect(
      panel.getByRole("button", {
        name: /^(Edit row value|Edit memo|Edit Category|Edit Tags|Edit Member)$/,
      }),
    ).toHaveCount(0);
  }

  await detailRecordRow.click();
  const disclosure = panel.locator("tr.detail-records-disclosure-row");
  await expect(disclosure).toBeVisible();
  await expect(disclosure.getByTestId("record-disclosure-tags")).toHaveText(
    initialTag.fqn,
  );
  await expect(disclosure.getByTestId("record-disclosure-member")).toHaveText(
    member.name,
  );
  await expect(disclosure).toContainText(memo);
  await expect(
    disclosure.locator(
      "button, [data-slot='tooltip-trigger'], [data-testid*='chip']",
    ),
  ).toHaveCount(0);
  await page.keyboard.press("F2");
  await expect(disclosure).toBeVisible();
  await amountChip.click();
  await expect(disclosure).toBeVisible();
  await expect(disclosure.getByText(memo, { exact: true })).toHaveCSS(
    "white-space",
    "pre-wrap",
  );

  await panel
    .getByRole("button", { name: `Filter by ${initialCategory.fqn}` })
    .first()
    .click();
  await expectTransactionFilterUrl(page, {
    filter: `category:"${initialCategory.fqn}"`,
  });
  await expect(
    page.getByRole("button", {
      name: `Remove Category ${initialCategory.name}`,
    }),
  ).toBeVisible();
  await expect(panel).toBeVisible();

  const expected = await createExpectedRecurringFixture(page, unique);
  await page.goto(
    "/transactions?page=1&pageSize=50&filter=lifecycle%3Aexpected",
  );
  const expectedRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "Expected" }) })
    .filter({
      hasText: expected.merchantFqn.split(":").at(-1) ?? "Merchant",
    })
    .first();
  await expect(expectedRow).toBeVisible();
  await activateTransactionRow(expectedRow);
  const expectedPanel = page.getByTestId("transaction-detail-panel");
  await expect(expectedPanel).toBeVisible();
  await expect(
    expectedPanel.getByRole("button", { name: "Edit Category" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit Tags" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit Member" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit row value" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit memo" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit transaction" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Duplicate" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Split" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Delete" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Create template" }),
  ).toHaveCount(0);
  await expect(
    expectedRow.getByRole("button", { name: "Create template" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Confirm occurrence" }),
  ).toBeVisible();
  await expect(
    expectedPanel.getByRole("button", { name: "Dismiss occurrence" }),
  ).toBeVisible();

  await expectedPanel
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await expectedRow.click();
  const expandedExpectedRecords = expectedRow.locator(
    "xpath=following-sibling::tr[1]",
  );
  await expect(expandedExpectedRecords).toBeVisible();
  await expect(
    expandedExpectedRecords.getByRole("button", { name: /Edit / }),
  ).toHaveCount(0);

  await deleteTransaction(page, transaction);
});

test("detail lifecycle and dateless records match across transaction surfaces", async ({
  page,
}, testInfo) => {
  test.slow();
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const [fundingAccount, splitParty] = await Promise.all([
    createAccount(
      page,
      `assets:E2E:Lifecycle:${unique}:Funding`,
      "owned",
      "USD",
    ),
    createAccount(page, `people:E2E:Lifecycle:${unique}`, "party", "USD"),
  ]);
  const [firstTag, secondTag] = await Promise.all([
    createTag(page, `E2E:Lifecycle:${unique}:First`),
    createTag(page, `E2E:Lifecycle:${unique}:Second`),
  ]);

  const simpleMemo = `E2E lifecycle uniform ${unique}`;
  const simpleResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.25",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-11",
      memo: simpleMemo,
      tag_ids: [firstTag.tag_id, secondTag.tag_id],
    },
  });
  const simpleBody = await simpleResponse.text();
  expect(simpleResponse.ok(), simpleBody).toBe(true);
  const simple = JSON.parse(simpleBody) as TransactionDetailFixture;

  const mixedMemo = `E2E lifecycle mixed ${unique}`;
  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-12",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-30.00000000",
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
          amount: "10.00000000",
          category_id: category.category_id,
          currency: "USD",
          memo: mixedMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: splitParty.account_id,
          amount: "20.00000000",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          settlement: { status: "pending" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  const mixedBody = await mixedResponse.text();
  expect(mixedResponse.ok(), mixedBody).toBe(true);
  const mixed = JSON.parse(mixedBody) as TransactionDetailFixture;

  const cancelledMemo = `E2E lifecycle cancelled ${unique}`;
  const cancelledResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-16",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-9.00000000",
          category_id: null,
          currency: "USD",
          memo: cancelledMemo,
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
          memo: cancelledMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  const cancelledBody = await cancelledResponse.text();
  expect(cancelledResponse.ok(), cancelledBody).toBe(true);
  const activeToCancel = JSON.parse(cancelledBody) as TransactionDetailFixture;
  const cancelResponse = await page.request.post(
    `/api/transactions/${activeToCancel.transaction_id}/cancel`,
  );
  const cancelBody = await cancelResponse.text();
  expect(cancelResponse.ok(), cancelBody).toBe(true);
  const cancelled = JSON.parse(cancelBody) as TransactionDetailFixture;

  const expected = await createExpectedRecurringFixture(
    page,
    `${unique}Lifecycle`,
    { anchorDate: "2026-07-23" },
  );

  await page.goto("/transactions?page=1&pageSize=50");
  const simpleRow = page
    .getByRole("row")
    .filter({ hasText: simpleMemo })
    .first();
  await expect(simpleRow).toBeVisible();
  const mixedRow = page.getByRole("row").filter({ hasText: mixedMemo }).first();
  const cancelledRow = page
    .getByRole("row")
    .filter({ hasText: cancelledMemo })
    .first();
  await expect(
    cancelledRow.getByRole("button", { name: "Edit transaction" }),
  ).toHaveCount(0);
  await expect(
    cancelledRow.getByRole("button", { name: "Split transaction" }),
  ).toHaveCount(0);
  const cancelledRowActions = await openRowActionsMenu(page, cancelledRow);
  await expect(
    cancelledRowActions.getByRole("button", { name: "Create template" }),
  ).toBeVisible();
  await expect(
    cancelledRowActions.getByRole("button", { name: "Create recurring" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const mixedIndicators = mixedRow.getByTestId("transaction-status-indicators");
  await expect(mixedIndicators).toHaveAttribute("data-display-status", "mixed");
  await expect(
    mixedIndicators.getByRole("img", { name: "Mixed settlement" }),
  ).toBeVisible();
  const expectSimpleSurface = async (
    panel: Locator,
    expectedVariant: "decluttered" | "full",
  ) => {
    await expectDatelessReadOnlyDetailGrid(panel, 2, expectedVariant);
    const recordsTable = panel.getByTestId("transaction-detail-records-table");
    const decluttered = expectedVariant === "decluttered";
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect
      .poll(() =>
        panel.evaluate((panelElement) => {
          const strip = panelElement.querySelector(
            "[data-testid='transaction-lifecycle']",
          );
          return (
            strip?.parentElement === panelElement &&
            strip.previousElementSibling?.querySelector("h2") !== null
          );
        }),
      )
      .toBe(true);
    await expect(lifecycle).toHaveText(/Initiated\s*Jul 11/);
    await expect(lifecycle).not.toContainText(
      /expected|pending|posted|cancelled|varies|→|–/i,
    );
    await expect(panel).not.toContainText("Invalid Date");
    await expect(lifecycle.locator("[tabindex]")).toHaveCount(0);
    await expect(
      lifecycle.locator("[data-slot='tooltip-trigger']"),
    ).toHaveCount(0);
    await expect(lifecycle.getByText("Initiated", { exact: true })).toHaveCSS(
      "font-size",
      "12px",
    );
    if (decluttered) {
      await expect(recordsTable.locator("td[data-label='Tags']")).toHaveCount(
        0,
      );
      await expect(
        recordsTable.getByText(firstTag.fqn, { exact: false }),
      ).toHaveCount(0);
      await expect(
        recordsTable.getByText(secondTag.fqn, { exact: false }),
      ).toHaveCount(0);
    } else {
      await expect(
        panel.getByText(firstTag.name, { exact: true }).first(),
      ).toBeVisible();
      await expect(
        panel.getByText(secondTag.name, { exact: true }).first(),
      ).toBeVisible();
    }
  };

  const expectMixedSurface = async (
    panel: Locator,
    expectedVariant: "decluttered" | "full",
  ) => {
    await expectDatelessReadOnlyDetailGrid(panel, 3, expectedVariant);
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect(lifecycle).toHaveText(/Initiated\s*Jul 12\s*Pending/);
    await expect(lifecycle).not.toContainText(/Posted|varies|2 of 3|→|–/);
    await expect(
      lifecycle.locator("[data-lifecycle-status='pending']"),
    ).toHaveText("Pending");
  };

  const expectLifecycleContentFits = async (panel: Locator) => {
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect
      .poll(() =>
        lifecycle.evaluate(
          (strip) =>
            strip.scrollWidth <= strip.clientWidth + 1 &&
            strip.scrollHeight <= strip.clientHeight + 1,
        ),
      )
      .toBe(true);
  };

  const expectExpectedSurface = async (
    panel: Locator,
    expectedVariant: "decluttered" | "full",
  ) => {
    await expectDatelessReadOnlyDetailGrid(panel, 2, expectedVariant);
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect(lifecycle).toHaveText(/Initiated\s*Jul 23\s*Expected/);
    await expect(lifecycle).not.toContainText(/Pending|Posted|Cancelled|—/);
    await expect(
      lifecycle.locator("[data-lifecycle-status='expected']"),
    ).toHaveText("Expected");
  };

  const expectCancelledSurface = async (
    panel: Locator,
    expectedVariant: "decluttered" | "full",
  ) => {
    await expectDatelessReadOnlyDetailGrid(panel, 2, expectedVariant);
    const recordsTable = panel.getByTestId("transaction-detail-records-table");
    const decluttered = expectedVariant === "decluttered";
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect(lifecycle).toHaveText(/Initiated\s*Jul 16\s*Cancelled/);
    await expect(lifecycle).not.toContainText(/Pending|Posted|varies|1 of 2|—/);
    await expect(
      lifecycle.locator("[data-lifecycle-status='cancelled']"),
    ).toHaveText("Cancelled");
    const cancelledRows = recordsTable.locator(
      "tr[data-detail-record-row='true']",
    );
    await expect(cancelledRows).toHaveCount(2);
    if (!decluttered) {
      await expect(cancelledRows.first()).toContainText("Cancelled");
    }
    await expect(cancelledRows.first()).toHaveCSS(
      "text-decoration-line",
      "line-through",
    );
  };

  await page.setViewportSize({ width: 1600, height: 900 });
  const simpleDetail = await openUrlTransactionDetail(
    page,
    simple.transaction_id,
  );
  await expectSimpleSurface(simpleDetail, "decluttered");
  await expectMouseDisclosure(simpleDetail, simpleMemo);

  const mixedDetail = await openUrlTransactionDetail(
    page,
    mixed.transaction_id,
  );
  await expectMixedSurface(mixedDetail, "decluttered");
  await expectLifecycleContentFits(mixedDetail);
  await page.setViewportSize({ width: 390, height: 900 });
  await expectLifecycleContentFits(mixedDetail);
  await page.setViewportSize({ width: 1600, height: 900 });
  await expectKeyboardDisclosure(mixedDetail);

  const expectedDetail = await openUrlTransactionDetail(
    page,
    expected.transactionId,
  );
  await expectExpectedSurface(expectedDetail, "decluttered");
  await expect(
    expectedDetail.getByRole("button", { name: "Edit transaction" }),
  ).toHaveCount(0);
  await expect(
    expectedDetail.getByRole("button", { name: "Create template" }),
  ).toHaveCount(0);
  const confirmOccurrenceButton = expectedDetail.getByRole("button", {
    name: "Confirm occurrence",
  });
  await expect(confirmOccurrenceButton).toBeVisible();
  await confirmOccurrenceButton.click();
  const confirmOccurrenceDialog = page.getByRole("alertdialog", {
    name: "Confirm occurrence",
  });
  await confirmOccurrenceDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmOccurrenceButton).toBeFocused();
  await confirmOccurrenceButton.click();
  await page.keyboard.press("Escape");
  await expect(confirmOccurrenceButton).toBeFocused();
  await expect(
    expectedDetail.getByRole("button", { name: "Dismiss occurrence" }),
  ).toBeVisible();

  const cancelledDetail = await openUrlTransactionDetail(
    page,
    cancelled.transaction_id,
  );
  await expectCancelledSurface(cancelledDetail, "decluttered");
  await expect(
    cancelledDetail.getByRole("button", { name: "Create template" }),
  ).toBeVisible();
  await expect(
    cancelledDetail.getByRole("button", { name: "Edit transaction" }),
  ).toHaveCount(0);
  await expect(
    cancelledDetail.getByRole("button", { name: "Split" }),
  ).toHaveCount(0);
  await cancelledDetail.getByRole("button", { name: "Restore" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction restored." }),
  ).toBeVisible();
  await expect(cancelledDetail.getByTestId("transaction-lifecycle")).toHaveText(
    /Initiated\s*Jul 16\s*Pending/,
  );
  await expect(
    cancelledDetail.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await cancelledDetail.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction cancelled." }),
  ).toBeVisible();
  await expectCancelledSurface(cancelledDetail, "decluttered");
  await expect(
    cancelledDetail.getByRole("button", { name: "Restore" }),
  ).toBeFocused();

  await page.setViewportSize({ width: 720, height: 900 });
  const simpleRegisterDetail = await openAccountTransactionDetail(
    page,
    fundingAccount,
    simpleMemo,
  );
  await expectSimpleSurface(simpleRegisterDetail, "decluttered");
  await expect(
    simpleRegisterDetail.getByRole("button", { name: "Create template" }),
  ).toBeVisible();
  await expectMouseDisclosure(simpleRegisterDetail, simpleMemo);

  const mixedRegisterDetail = await openAccountTransactionDetail(
    page,
    fundingAccount,
    mixedMemo,
  );
  await expectMixedSurface(mixedRegisterDetail, "decluttered");
  await expect(
    mixedRegisterDetail.getByRole("button", { name: "Create template" }),
  ).toBeVisible();
  await expectKeyboardDisclosure(mixedRegisterDetail);
});

test("toolbar filter trigger opens after transaction detail closes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E escape layered ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "31.42",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-06-29",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  await activateTransactionRow(
    page.getByRole("row").filter({ hasText: memo }).first(),
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});

test("Escape closes filter popover before transaction detail panel", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E escape order ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "32.10",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-06-30",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  await activateTransactionRow(
    page.getByRole("row").filter({ hasText: memo }).first(),
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();

  const filterToggle = page.getByRole("button", { name: "Open filters" });
  await filterToggle.focus();
  await expect(filterToggle).toBeFocused();
  await page.keyboard.press("Enter");
  const addFilterButton = page.getByRole("button", { name: "Add filter" });
  await addFilterButton.focus();
  await page.keyboard.press("Enter");
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await expect(panel).toBeVisible();

  await popover.getByRole("button", { name: "Category" }).click();
  const categoryPicker = popover.getByRole("combobox", {
    name: "Categories",
  });
  await categoryPicker.fill(category.name);
  await page.getByRole("option").filter({ hasText: category.fqn }).click();
  await expect(panel).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("filter"))
    .toBe(`category:"${category.fqn}"`);

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("transaction row activation toggles its active detail", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E keyboard detail ${unique}`;
  const alternateMemo = `E2E alternate keyboard row ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-03",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;
  const alternateSpendResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "6.12",
        category_id: category.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-07-03",
        memo: alternateMemo,
      },
    },
  );
  expect(alternateSpendResponse.ok()).toBe(true);
  const alternateTransaction =
    (await alternateSpendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const detailRow = page.getByRole("row").filter({ hasText: memo }).first();
  const alternateDetailRow = page
    .getByRole("row")
    .filter({ hasText: alternateMemo })
    .first();
  await expect(detailRow).toBeVisible();
  await expect(alternateDetailRow).toBeVisible();

  await detailRow.focus();
  await expect(detailRow).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${transaction.transaction_id}(?:&|$)`),
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();

  await detailRow.press("Enter");
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(detailRow).toBeFocused();
  await page.goBack();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);

  await detailRow.press("Space");
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${transaction.transaction_id}(?:&|$)`),
  );
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("transaction-edit-dock")).toHaveCount(0);

  await detailRow.press("Space");
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(detailRow).toBeFocused();

  await detailRow.locator(".transactions-description-column").click();
  await expect(panel).toBeVisible();
  await detailRow.locator(".transactions-description-column").click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(detailRow).toBeFocused();

  await detailRow.locator(".transactions-description-column").click();
  await alternateDetailRow.locator(".transactions-description-column").click();
  const alternatePanel = page.getByTestId("transaction-detail-panel");
  await expect(alternatePanel).toBeVisible();
  await expect(
    alternatePanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(alternateMemo);
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${alternateTransaction.transaction_id}(?:&|$)`),
  );

  await page.keyboard.press("Escape");
  await expect(alternatePanel).toBeHidden();
  await expect(alternateDetailRow).toBeFocused();
  await alternateDetailRow.press("Enter");
  await expect(alternatePanel).toBeVisible();

  await alternateDetailRow.press("Enter");
  await expect(alternatePanel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(alternateDetailRow).toBeFocused();
  await page.goBack();
  await expect(alternatePanel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);

  await detailRow.press("Enter");
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Edit mode" }).press("Enter");
  await expect(panel).toBeHidden();
  await expect(
    page.getByTestId("transaction-browser-edit-mode-header"),
  ).toBeVisible();
  await detailRow.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByTestId("transaction-browser-edit-mode-header"),
  ).toContainText("1 selected");
});

test("transaction detail delete confirms, tombstones, and refreshes the row", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E delete detail ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.45",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-02",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;
  const consoleErrors: string[] = [];
  const failedTransactionRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    if (
      request.method() === "GET" &&
      request.url().includes(`/api/transactions/${transaction.transaction_id}`)
    ) {
      failedTransactionRequests.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
      );
    }
  });
  page.on("response", (response) => {
    if (
      response.request().method() === "GET" &&
      response
        .url()
        .includes(`/api/transactions/${transaction.transaction_id}`) &&
      response.status() >= 400
    ) {
      failedTransactionRequests.push(
        `GET ${response.url()} returned ${response.status()}`,
      );
    }
  });

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const detailRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(detailRow).toBeVisible();
  await activateTransactionRow(detailRow);

  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Delete" }).click();
  const confirmDialog = page.getByRole("alertdialog", {
    name: "Delete transaction",
  });
  await expect(confirmDialog).toBeVisible();
  await expect(
    confirmDialog.getByText(transaction.display_title),
  ).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toBeHidden();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Delete" })).toBeFocused();

  await panel.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete transaction" })
    .getByRole("button", { name: "Delete transaction" })
    .click();

  await expect(
    page.getByRole("status").filter({ hasText: "Transaction deleted." }),
  ).toBeVisible();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeHidden();
  expect(consoleErrors).toEqual([]);
  expect(failedTransactionRequests).toEqual([]);
});

test("transaction detail edit preserves imported sources through a fitting shorthand replacement", async ({
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
  const member = await createMember(page, `E2E edit spend ${unique}`);
  const memo = `E2E edit spend ${unique}`;
  const updatedMemo = `E2E edit spend updated ${unique}`;

  const spendResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-04",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-21.34",
          category_id: null,
          currency: "USD",
          member_id: member.member_id,
          memo: null,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "21.34",
          category_id: category.category_id,
          currency: "USD",
          member_id: null,
          memo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
      ],
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await activateTransactionRow(
    page.getByRole("row").filter({ hasText: memo }).first(),
  );

  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();
  await detailPanel.getByRole("button", { exact: true, name: "Edit" }).click();

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expectTransactionsPageUrl(page, 1, 50, {
    entry: `edit:${transaction.transaction_id}`,
    transaction: String(transaction.transaction_id),
  });
  await expect(detailPanel).toBeVisible();
  await expect(page.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(spendPanel.getByLabel("Amount")).toHaveValue("21.34");
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(memo);

  await spendPanel.getByLabel("Amount").fill("25.67");
  await spendPanel.getByLabel("Memo").fill(updatedMemo);
  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(comparableRecords(replaced.records)).toEqual([
    {
      account_id: fundingAccount.account_id,
      amount: "-25.67000000",
      category_id: null,
      currency: "USD",
      member_id: member.member_id,
      memo: updatedMemo,
      settlement: "posted",
      reconciliation_status: "unreconciled",
      source: "imported",
      tag_ids: [],
    },
    {
      account_id: merchantAccount.account_id,
      amount: "25.67000000",
      category_id: category.category_id,
      currency: "USD",
      member_id: null,
      memo: updatedMemo,
      settlement: null,
      reconciliation_status: "unreconciled",
      source: "imported",
      tag_ids: [],
    },
  ]);
  await expect(entryPanel).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction updated." }),
  ).toBeVisible();
});

test("sparse shorthand metadata survives merchant removal while Duplicate uses Advanced", async ({
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
  const booksAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const targetAccount = findByFqn(accounts, "merchant:Target");
  const booksCategory = findByFqn(categories, "Entertainment:Books");
  const targetCategory = findByFqn(categories, "Food:Groceries");
  const member = await createMember(page, `E2E sparse merchant ${unique}`);
  const memo = `E2E sparse merchant ${unique}`;

  const response = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-05",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-30.00",
          category_id: null,
          currency: "USD",
          member_id: null,
          memo: null,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: booksAccount.account_id,
          amount: "10.00",
          category_id: booksCategory.category_id,
          currency: "USD",
          member_id: null,
          memo: null,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: targetAccount.account_id,
          amount: "20.00",
          category_id: targetCategory.category_id,
          currency: "USD",
          member_id: member.member_id,
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

  await page.goto("/transactions?page=1&pageSize=50");
  await activateTransactionRow(
    page.getByRole("row").filter({ hasText: memo }).first(),
  );
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await detailPanel.getByRole("button", { name: "Duplicate" }).click();

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(
    entryPanel.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();
  await expect(
    journalRecord(page, 1).getByRole("combobox", {
      name: "Record 1 origin",
    }),
  ).toBeVisible();
  await expect(
    journalRecord(page, 1).getByRole("button", { name: "Remove record 1" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(entryPanel).toHaveCount(0);
  await page.goto("/transactions?page=1&pageSize=50");
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Edit transaction",
  );
  await expect(
    page.getByRole("alertdialog", { name: "Discard entry draft" }),
  ).toHaveCount(0);
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(memo);
  await spendPanel
    .getByRole("group", { name: "Merchant 2" })
    .getByRole("button", { name: "Remove merchant" })
    .click();

  const replaceResponsePromise = page.waitForResponse((replaceResponse) => {
    const url = new URL(replaceResponse.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      replaceResponse.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(comparableRecords(replaced.records)).toEqual([
    {
      account_id: fundingAccount.account_id,
      amount: "-10.00000000",
      category_id: null,
      currency: "USD",
      member_id: member.member_id,
      memo,
      settlement: "posted",
      reconciliation_status: "unreconciled",
      source: "manual",
      tag_ids: [],
    },
    {
      account_id: booksAccount.account_id,
      amount: "10.00000000",
      category_id: booksCategory.category_id,
      currency: "USD",
      member_id: null,
      memo: null,
      settlement: null,
      reconciliation_status: "unreconciled",
      source: "manual",
      tag_ids: [],
    },
  ]);
});

test("journal conversion keeps surviving merchant record identities", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const booksAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const targetAccount = findByFqn(accounts, "merchant:Target");
  const groceriesAccount = findByFqn(accounts, "merchant:TraderJoes");
  const booksCategory = findByFqn(categories, "Entertainment:Books");
  const groceriesCategory = findByFqn(categories, "Food:Groceries");
  const memo = `E2E merchant identities ${unique}`;
  const response = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-05",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-60.00",
          category_id: null,
          currency: "USD",
          memo,
          reconciliation_status: "unreconciled",
          settlement: { status: "posted" },
          source: "manual",
          tag_ids: [],
        },
        ...[
          [booksAccount, booksCategory, "10.00"],
          [targetAccount, groceriesCategory, "20.00"],
          [groceriesAccount, groceriesCategory, "30.00"],
        ].map(([account, category, amount]) => ({
          account_id: (account as AccountFixture).account_id,
          amount,
          category_id: (category as CategoryFixture).category_id,
          currency: "USD",
          memo,
          reconciliation_status: "unreconciled",
          settlement: null,
          source: "manual",
          tag_ids: [],
        })),
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const transaction = (await response.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&entry=edit:${transaction.transaction_id}`,
  );
  const entryPanel = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await entryPanel
    .getByRole("group", { name: "Merchant 1" })
    .getByRole("button", { name: "Remove merchant" })
    .click();
  await entryPanel.getByRole("button", { name: "Edit as journal" }).click();

  const replaceRequestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      request.method() === "PUT",
  );
  await entryPanel.getByRole("button", { name: "Update transaction" }).click();
  const replaceRequest = await replaceRequestPromise;
  const replacement = replaceRequest.postDataJSON() as {
    readonly records: readonly {
      readonly account_id: number;
      readonly record_id?: number;
    }[];
  };
  expect(replacement.records).toMatchObject([
    {
      account_id: fundingAccount.account_id,
      record_id: transaction.records[0]!.record_id,
    },
    {
      account_id: targetAccount.account_id,
      record_id: transaction.records[2]!.record_id,
    },
    {
      account_id: groceriesAccount.account_id,
      record_id: transaction.records[3]!.record_id,
    },
  ]);
  await expect(entryPanel).toHaveCount(0);
  await deleteTransaction(page, transaction);
});

test("transaction detail edit preserves imported sources through the journal editor", async ({
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
  const incomeAccount = findByFqn(accounts, "employers:Acme:salary");
  const expenseCategory = findByFqn(categories, "Entertainment:Books");
  const incomeCategory = findByFqn(categories, "Income:Salary");
  const memo = `E2E edit mixed ${unique}`;
  const updatedMemo = `E2E edit mixed updated ${unique}`;

  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-04",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-10.00000000",
          category_id: null,
          currency: "USD",
          memo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "10.00000000",
          category_id: expenseCategory.category_id,
          currency: "USD",
          memo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
        {
          account_id: fundingAccount.account_id,
          amount: "2.00000000",
          category_id: null,
          currency: "USD",
          memo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
        {
          account_id: incomeAccount.account_id,
          amount: "-2.00000000",
          category_id: incomeCategory.category_id,
          currency: "USD",
          memo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
      ],
    },
  });
  expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);
  const transaction = (await mixedResponse.json()) as TransactionDetailFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await activateTransactionRow(
    page.getByRole("row").filter({ hasText: memo }).first(),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Advanced" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(journalRecord(page, 4)).toBeVisible();
  await journalRecord(page, 1).getByLabel("Memo").fill(updatedMemo);

  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(replaced.records.some((record) => record.memo === updatedMemo)).toBe(
    true,
  );
  expect(replaced.records).toHaveLength(4);
  expect(replaced.records.every((record) => record.source === "imported")).toBe(
    true,
  );
});

test("shorthand edit escalation saves as a replacement", async ({
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
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E edit escalate ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.90",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-04",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await activateTransactionRow(
    page.getByRole("row").filter({ hasText: memo }).first(),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit" })
    .click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await spendPanel.getByLabel("Amount").fill("19.91");
  await page.getByRole("button", { name: "Edit as journal" }).click();
  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await expect(journalRecord(page, 1).getByLabel("Amount")).toHaveValue(
    "-19.91",
  );
  await expect(journalRecord(page, 2).getByLabel("Amount")).toHaveValue(
    "19.91",
  );

  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(comparableRecords(replaced.records)).toEqual([
    {
      account_id: fundingAccount.account_id,
      amount: "-19.91000000",
      category_id: null,
      currency: "USD",
      member_id: null,
      memo,
      settlement: "posted",
      reconciliation_status: "reconciled",
      source: "manual",
      tag_ids: [],
    },
    {
      account_id: merchantAccount.account_id,
      amount: "19.91000000",
      category_id: category.category_id,
      currency: "USD",
      member_id: null,
      memo,
      settlement: null,
      reconciliation_status: "reconciled",
      source: "manual",
      tag_ids: [],
    },
  ]);
});

test("transaction detail duplicate prefills a new entry", async ({
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
  const memo = `E2E duplicate source ${unique}`;
  const duplicateMemo = `E2E duplicate copy ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "16.45",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-05",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=50");
  await ledgerLookups;
  await expect(page.getByText("Description")).toBeVisible();
  await activateTransactionRow(
    page.getByRole("row").filter({ hasText: memo }).first(),
  );

  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expectTransactionsPageUrl(page, 1, 50, {
    transaction: String(transaction.transaction_id),
  });
  const detailHeader = detailPanel.locator(":scope > div").first();
  const duplicateButton = detailPanel.getByRole("button", {
    name: "Duplicate",
  });
  const detailFooter = duplicateButton.locator("..");
  await expect(
    detailHeader.getByRole("button", {
      exact: true,
      name: "Edit transaction",
    }),
  ).toHaveCount(0);
  await expect(
    detailFooter.getByRole("button", { name: "Duplicate" }),
  ).toBeVisible();
  await expect(
    detailFooter.getByRole("button", { name: "Split" }),
  ).toBeVisible();
  await expect(
    detailFooter.getByRole("button", { name: "Delete" }),
  ).toBeVisible();
  await expect(
    detailFooter.getByRole("button", { exact: true, name: "Edit" }),
  ).toBeVisible();

  await duplicateButton.click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expectTransactionsPageUrl(page, 1, 50, {
    entry: `duplicate:${transaction.transaction_id}`,
    transaction: String(transaction.transaction_id),
  });
  await expect(detailPanel).toBeVisible();
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(spendPanel.getByLabel("Amount")).toHaveValue("16.45");
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(memo);
  await spendPanel.getByLabel("Memo").fill(duplicateMemo);
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({
      tabs: {
        spend: {
          memo: duplicateMemo,
        },
      },
    });
  await expectTransactionsPageUrl(page, 1, 50, {
    entry: `duplicate:${transaction.transaction_id}`,
    transaction: String(transaction.transaction_id),
  });
  await spendPanel.getByLabel("Memo").press("Escape");
  await expect(entryPanel).toHaveCount(0);
  await expectTransactionsPageUrl(page, 1, 50, {
    transaction: String(transaction.transaction_id),
  });
  await expect(duplicateButton).toBeFocused();
  await detailPanel
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await expect(detailPanel).toHaveCount(0);
  await expectTransactionsPageUrl(page, 1, 50);
  await page.keyboard.press("KeyN");
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(duplicateMemo);

  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions/spend" &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Save and add another" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const duplicate = (await createResponse.json()) as TransactionFixture;
  expect(duplicate.transaction_id).not.toBe(transaction.transaction_id);
  await expect(entryPanel.getByText("Entries this session: 1")).toBeVisible();
  await expect(
    page.locator("[data-transaction-row]").filter({ hasText: duplicateMemo }),
  ).toBeVisible();
});

test("transaction detail split opens journal replacement and surfaces replace errors", async ({
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
  const category = findByFqn(categories, "Entertainment:Books");
  const [splitAccount, splitTag, splitMember] = await Promise.all([
    createAccount(page, `merchant:SplitTarget:${unique}`, "flow"),
    createTag(page, `E2E:Split:${unique}`),
    createMember(page, `E2E Split ${unique}`),
  ]);
  const memo = `E2E split source ${unique}`;
  const splitMemo = `E2E split added ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "30.00",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-05",
      member_id: splitMember.member_id,
      memo,
      tag_ids: [splitTag.tag_id],
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await activateTransactionRow(
    page.getByRole("row").filter({ hasText: memo }).first(),
  );
  const detailPanel = page.getByTestId("transaction-detail-panel");
  const splitButton = detailPanel.getByRole("button", { name: "Split" });
  await splitButton.click();

  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await expectTransactionsPageUrl(page, 1, 50, {
    entry: `split:${transaction.transaction_id}`,
    transaction: String(transaction.transaction_id),
  });
  await expect(detailPanel).toBeVisible();
  await expect(page.getByRole("tab", { name: "Advanced" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(journalRecord(page, 1).getByLabel("Amount")).toHaveValue("-30");
  await expect(journalRecord(page, 2).getByLabel("Amount")).toHaveValue("30");

  const seededRecord = journalRecord(page, 3);
  await expect(seededRecord.getByLabel("Record 3 account")).toHaveValue(
    merchantAccount.fqn,
  );
  await expect(seededRecord.getByLabel("Amount")).toHaveValue("");
  await expect(seededRecord.getByLabel("Currency")).toHaveValue("USD");
  await expect(seededRecord.getByLabel("Record 3 category")).toHaveValue("");
  await expect(
    seededRecord.getByTestId("entity-multi-picker-selected"),
  ).toContainText(splitTag.name);
  await expect(seededRecord.getByLabel("Record 3 member")).toHaveValue(
    splitMember.name,
  );
  await expect(seededRecord.getByLabel("Memo")).toHaveValue(memo);

  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Discard entry draft" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await expectTransactionsPageUrl(page, 1, 50, {
    transaction: String(transaction.transaction_id),
  });
  await expect(splitButton).toBeFocused();
  await splitButton.click();
  const reopenedEditor = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(
    reopenedEditor.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await expect(reopenedEditor.getByLabel("Date")).toBeFocused();

  await fillAndExpectValue(
    journalRecord(page, 2).getByLabel("Amount"),
    "20.00",
  );
  const thirdRecord = journalRecord(page, 3);
  const accountPicker = thirdRecord.getByRole("combobox", { name: "Account" });
  await fillAndExpectValue(accountPicker, unique);
  const accountOptionsId = await accountPicker.getAttribute("aria-controls");
  expect(accountOptionsId).not.toBeNull();
  const splitAccountOption = page
    .locator(`#${accountOptionsId}`)
    .getByRole("option", { name: splitAccount.fqn });
  await expect(splitAccountOption).toBeVisible();
  await splitAccountOption.click();
  await expect(accountPicker).toHaveValue(splitAccount.fqn);
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: thirdRecord },
  );
  await thirdRecord.getByLabel("Amount").fill("10.00");
  await thirdRecord.getByLabel("Memo").fill(splitMemo);

  const replaceUrlPattern = `**/api/transactions/${transaction.transaction_id}`;
  await page.route(replaceUrlPattern, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        contentType: "application/json",
        status: 400,
        body: JSON.stringify({
          error: {
            code: "invalid_request",
            message: "Forced replace failure",
          },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  await expect(page.getByText("Forced replace failure")).toBeVisible();
  await page.unroute(replaceUrlPattern);

  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(comparableRecords(replaced.records)).toEqual(
    comparableRecords([
      {
        account_id: fundingAccount.account_id,
        amount: "-30.00000000",
        category_id: null,
        currency: "USD",
        member_id: splitMember.member_id,
        memo,
        settlement: "posted",
        reconciliation_status: "reconciled",
        source: "manual",
        tag_ids: [splitTag.tag_id],
      },
      {
        account_id: merchantAccount.account_id,
        amount: "20.00000000",
        category_id: category.category_id,
        currency: "USD",
        member_id: splitMember.member_id,
        memo,
        settlement: null,
        reconciliation_status: "reconciled",
        source: "manual",
        tag_ids: [splitTag.tag_id],
      },
      {
        account_id: splitAccount.account_id,
        amount: "10.00000000",
        category_id: category.category_id,
        currency: "USD",
        member_id: splitMember.member_id,
        memo: splitMemo,
        settlement: null,
        reconciliation_status: "unreconciled",
        source: "manual",
        tag_ids: [splitTag.tag_id],
      },
    ]),
  );
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
});

test("transaction row quick-delete confirms, handles errors, and preserves row behavior", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E quick delete ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "14.56",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-03",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const row = page.locator("[data-transaction-row='true']").filter({
    hasText: memo,
  });
  const transactionRows = page.locator("[data-transaction-row='true']");
  await expect(row).toBeVisible();
  const deletedRowIndex = await row.evaluate((element) =>
    Array.from(
      element.parentElement?.querySelectorAll(
        "tr[data-transaction-row='true']",
      ) ?? [],
    ).indexOf(element),
  );
  const rowCountBeforeDelete = await transactionRows.count();

  await activateTransactionRow(row);
  await expect(
    page.getByRole("dialog", { name: transaction.display_title }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);

  await clickRowAction(page, row, "Delete transaction");
  const confirmDialog = page.getByRole("alertdialog", {
    name: "Delete transaction",
  });
  await expect(confirmDialog).toBeVisible();
  await expect(
    confirmDialog.getByText(transaction.display_title),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toBeHidden();
  await expect(row).toBeVisible();
  await expect
    .poll(() =>
      row.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ??
          document.activeElement?.textContent?.trim(),
      ),
    )
    .toMatch(/^(Delete transaction|More row actions)$/);

  const deleteUrlPattern = `**/api/transactions/${transaction.transaction_id}`;
  let failNextDelete = true;
  const failDeleteRoute = async (route: Route) => {
    if (route.request().method() === "DELETE" && failNextDelete) {
      failNextDelete = false;
      await route.fulfill({
        contentType: "application/json",
        status: 409,
        body: JSON.stringify({
          error: {
            code: "conflict",
            message: "Mock quick delete failure.",
          },
        }),
      });
      return;
    }
    await route.fallback();
  };
  await page.route(deleteUrlPattern, failDeleteRoute);

  await clickRowAction(page, row, "Delete transaction");
  await expect(confirmDialog).toBeVisible();
  await confirmDialog
    .getByRole("button", { name: "Delete transaction" })
    .click();
  await expect(confirmDialog.getByRole("alert")).toContainText(
    "Mock quick delete failure.",
  );
  await expect(confirmDialog).toBeVisible();
  await page.unroute(deleteUrlPattern, failDeleteRoute);

  const deleteRequest = page.waitForRequest(
    (request) =>
      request.method() === "DELETE" &&
      request.url().includes(`/api/transactions/${transaction.transaction_id}`),
  );
  await confirmDialog
    .getByRole("button", { name: "Delete transaction" })
    .click();
  await deleteRequest;

  await expect(
    page.getByRole("status").filter({ hasText: "Transaction deleted." }),
  ).toBeVisible();
  await expect(confirmDialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(
    transactionRows.nth(Math.min(deletedRowIndex, rowCountBeforeDelete - 2)),
  ).toBeFocused();
});

import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  createMember,
  createSearchSpend,
  createTag,
  deleteTransaction,
  expect,
  fillAndExpectValue,
  findByFqn,
  getTransactionDetail,
  listFixtures,
  type Route,
  type TransactionFixture,
} from "@tests/e2e/transactions/support";

test("edit mode is keyboard-complete and keeps its dock in layout", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 640 });
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E edit mode ${unique}`;
  const transaction = await createSearchSpend(page, memo);
  await page.goto("/transactions?page=1&pageSize=50");
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();

  await page.getByRole("button", { name: "Edit mode" }).click();
  const header = page.getByTestId("transaction-browser-edit-mode-header");
  const dock = page.getByTestId("transaction-edit-dock");
  await expect(header).toContainText("0 selected");
  await expect(dock).toBeVisible();
  await expect(
    dock.getByRole("button", { name: "Set / clear" }),
  ).toBeDisabled();
  const table = page.getByTestId("transactions-table-scroll");
  const pagination = page.getByTestId("transactions-pagination-footer");
  const initialGeometry = await Promise.all([
    table.boundingBox(),
    dock.boundingBox(),
    pagination.boundingBox(),
  ]);
  const [tableBox, dockBoxAtZeroSelection, paginationBox] = initialGeometry;
  expect(tableBox).not.toBeNull();
  expect(dockBoxAtZeroSelection).not.toBeNull();
  expect(paginationBox).not.toBeNull();
  expect(dockBoxAtZeroSelection!.x).toBeGreaterThanOrEqual(
    tableBox!.x + tableBox!.width,
  );
  expect(dockBoxAtZeroSelection!.y).toBeLessThanOrEqual(tableBox!.y + 1);
  expect(paginationBox!.y + paginationBox!.height).toBeLessThanOrEqual(640);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollHeight <=
          document.documentElement.clientHeight + 1,
      ),
    )
    .toBe(true);

  await row.focus();
  await page.keyboard.press("Space");
  await expect(header).toContainText("1 selected");
  await page.keyboard.press("KeyC");
  const editor = page.getByTestId("edit-dock-editor");
  await expect(editor).toBeVisible();
  await editor.getByRole("combobox", { name: "Category" }).press("ArrowDown");
  const dockBox = await dock.boundingBox();
  const editorBox = await editor.boundingBox();
  expect(dockBox).not.toBeNull();
  expect(editorBox).not.toBeNull();
  expect(editorBox!.y).toBeGreaterThanOrEqual(dockBox!.y);
  const panelScroll = await dock.evaluate((panel) => {
    panel.scrollTop = panel.scrollHeight;
    return {
      clientHeight: panel.clientHeight,
      overflowY: getComputedStyle(panel).overflowY,
      scrollHeight: panel.scrollHeight,
      scrollTop: panel.scrollTop,
    };
  });
  expect(panelScroll.overflowY).toBe("auto");
  expect(panelScroll.scrollHeight).toBeGreaterThan(panelScroll.clientHeight);
  expect(panelScroll.scrollTop).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollHeight <=
          document.documentElement.clientHeight + 1,
      ),
    )
    .toBe(true);

  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("listbox")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(row).toBeFocused();
  const amountInput = page.getByTestId(
    `transaction-${transaction.transaction_id}-amount-input`,
  );
  await amountInput.fill("20.25");
  await amountInput.press("Escape");
  await expect(amountInput).toHaveValue("12.34");
  await amountInput.press("Escape");
  await expect(header).toContainText("0 selected");
  await page.keyboard.press("Escape");
  await expect(header).toHaveCount(0);
  await expect(dock).toHaveCount(0);
  await deleteTransaction(page, transaction);
});

test("edit dock applies explicit tag and member operations", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E edit dock ${unique}`;
  const [transaction, member, tag] = await Promise.all([
    createSearchSpend(page, memo),
    createMember(page, `Edit dock member ${unique}`),
    createTag(page, `E2E:EditDock:${unique.repeat(4)}`),
  ]);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Edit mode" }).click();
  await row.click();
  const dock = page.getByTestId("transaction-edit-dock");

  await dock.getByRole("button", { name: "Set / clear" }).click();
  let editor = page.getByTestId("edit-dock-editor");
  await expect(editor).toContainText("1 will update · 0 require full edit");
  const memberInput = editor.getByRole("combobox", { name: "Member" });
  await memberInput.fill(member.name);
  await memberInput.press("Enter");
  const setResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/records/bulk/member" &&
      response.request().method() === "POST",
  );
  await editor.getByRole("button", { name: "Apply" }).click();
  await setResponse;
  let detail = await getTransactionDetail(page, transaction);
  expect(
    detail.records.every((record) => record.member_id === member.member_id),
  ).toBe(true);

  await dock.getByRole("button", { name: "Set / clear" }).click();
  editor = page.getByTestId("edit-dock-editor");
  await expect(editor.getByRole("listbox")).toHaveCount(0);
  await editor.getByRole("button", { name: "Clear", exact: true }).click();
  const clearResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/records/bulk/member" &&
      response.request().method() === "POST",
  );
  await editor.getByRole("button", { name: "Apply" }).click();
  await clearResponse;
  await expect(editor).toHaveCount(0);
  detail = await getTransactionDetail(page, transaction);
  expect(
    detail.records.every(
      (record) => record.member_id === null || record.member_id === undefined,
    ),
  ).toBe(true);

  await dock.getByRole("button", { name: "Add / remove" }).click();
  editor = page.getByTestId("edit-dock-editor");
  const addTagsInput = editor.getByRole("combobox", { name: "Tags to add" });
  await addTagsInput.fill(tag.fqn);
  await addTagsInput.press("Enter");
  const selectedTag = editor
    .getByTestId("entity-multi-picker-selected")
    .getByText(tag.name, { exact: true });
  await selectedTag.hover();
  await expect(page.getByRole("tooltip")).toHaveText(tag.name);
  await editor.getByRole("button", { name: "Apply" }).click();
  await expect(editor).toHaveCount(0);
  detail = await getTransactionDetail(page, transaction);
  expect(
    detail.records.every((record) => record.tag_ids.includes(tag.tag_id)),
  ).toBe(true);

  await dock.getByRole("button", { name: "Add / remove" }).click();
  editor = page.getByTestId("edit-dock-editor");
  await editor.getByRole("button", { name: "Remove", exact: true }).click();
  const removeTagsInput = editor.getByRole("combobox", {
    name: "Tags to remove",
  });
  await removeTagsInput.fill(tag.fqn);
  await removeTagsInput.press("Enter");
  await editor.getByRole("button", { name: "Apply" }).click();
  await expect(editor).toHaveCount(0);
  detail = await getTransactionDetail(page, transaction);
  expect(
    detail.records.every((record) => !record.tag_ids.includes(tag.tag_id)),
  ).toBe(true);
  await deleteTransaction(page, transaction);
});

test("category feedback scopes ineligible reasons to counted transactions", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const search = `E2E category eligibility ${unique}`;
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const source = findByFqn(accounts, "cash:Wallet");
  const destination = findByFqn(accounts, "bank:Chase:joint_checking");
  const spend = await createSearchSpend(page, `${search} spend`);
  const transferResponse = await page.request.post(
    "/api/transactions/transfer",
    {
      data: {
        amount: "4.56",
        currency: "USD",
        destination_account_id: destination.account_id,
        initiated_date: "2026-05-31",
        memo: `${search} transfer`,
        source_account_id: source.account_id,
      },
    },
  );
  expect(transferResponse.ok(), await transferResponse.text()).toBe(true);
  const transfer = (await transferResponse.json()) as TransactionFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  await expect(page.locator("[data-transaction-row='true']")).toHaveCount(2);
  await page.getByRole("button", { name: "Edit mode" }).click();
  await page
    .getByRole("checkbox", { name: "Select page transactions" })
    .click();
  const dock = page.getByTestId("transaction-edit-dock");
  await dock.getByRole("button", { name: "Choose category" }).click();
  const editor = page.getByTestId("edit-dock-editor");
  await expect(editor).toContainText("1 will update · 1 require full edit");
  await expect(
    editor.getByText("1 transaction has no categorizable records", {
      exact: true,
    }),
  ).toBeVisible();

  await deleteTransaction(page, spend);
  await deleteTransaction(page, transfer);
});

test("eligible amount inputs save independently of selection and preserve keyboard flow", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const search = `E2E amount input ${unique}`;
  const [firstTransaction, secondTransaction] = await Promise.all([
    createSearchSpend(page, `${search} first`),
    createSearchSpend(page, `${search} second`),
  ]);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  await page.getByRole("button", { name: "Edit mode" }).click();

  const header = page.getByTestId("transaction-browser-edit-mode-header");
  const firstInput = page.getByTestId(
    `transaction-${firstTransaction.transaction_id}-amount-input`,
  );
  const secondInput = page.getByTestId(
    `transaction-${secondTransaction.transaction_id}-amount-input`,
  );
  await expect(firstInput).toBeVisible();
  await expect(secondInput).toBeVisible();
  await expect(header).toContainText("0 selected");

  await firstInput.fill("0");
  await firstInput.press("Enter");
  await expect(page.getByRole("alert")).toContainText(
    "Enter an amount greater than zero",
  );
  await expect(firstInput).toBeFocused();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(header).toBeVisible();
  await expect(firstInput).toHaveValue("0");
  await expect(page.getByRole("alert")).toContainText(
    "Enter an amount greater than zero",
  );
  await firstInput.focus();
  await firstInput.press("Escape");
  await expect(firstInput).toHaveValue("12.34");
  await expect(page.getByRole("alert")).toHaveCount(0);

  let releaseSave: (() => void) | undefined;
  let markSaveStarted: (() => void) | undefined;
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  const savePath = `/api/transactions/${firstTransaction.transaction_id}`;
  const holdSave = async (route: Route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    markSaveStarted?.();
    await new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await route.continue();
  };
  await page.route(`**${savePath}`, holdSave);

  await firstInput
    .locator("xpath=ancestor::tr")
    .click({ position: { x: 80, y: 10 } });
  await expect(header).toContainText("1 selected");
  await firstInput.fill("19.87");
  await firstInput.press("Enter");
  await saveStarted;
  await expect(firstInput).toHaveAttribute("aria-disabled", "true");
  await expect(secondInput).not.toHaveAttribute("aria-disabled", /.+/);
  await expect(
    page
      .getByTestId("transaction-edit-dock")
      .getByRole("button", { name: "Set / clear" }),
  ).toBeDisabled();
  const saveResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === savePath &&
      response.request().method() === "PUT",
  );
  releaseSave?.();
  await saveResponse;
  await page.unroute(`**${savePath}`, holdSave);
  await expect(firstInput).not.toHaveAttribute("aria-disabled", /.+/);
  await expect(
    page
      .getByTestId("transaction-edit-dock")
      .getByRole("button", { name: "Set / clear" }),
  ).toBeEnabled();
  await expect(firstInput).toHaveValue("19.87");
  const detail = await getTransactionDetail(page, firstTransaction);
  expect(
    detail.records.every(
      (record) => record.amount.replace("-", "") === "19.87000000",
    ),
  ).toBe(true);

  let releaseDockSave: (() => void) | undefined;
  let markDockSaveStarted: (() => void) | undefined;
  const dockSaveStarted = new Promise<void>((resolve) => {
    markDockSaveStarted = resolve;
  });
  const reconciliationPath = "/api/records/bulk/reconciliation";
  const holdDockSave = async (route: Route) => {
    markDockSaveStarted?.();
    await new Promise<void>((resolve) => {
      releaseDockSave = resolve;
    });
    await route.continue();
  };
  await page.route(`**${reconciliationPath}`, holdDockSave);
  await page
    .getByTestId("transaction-edit-dock")
    .getByRole("button", { name: "Reconcile", exact: true })
    .click();
  await dockSaveStarted;
  await expect(firstInput).toHaveAttribute("aria-disabled", "true");
  await expect(secondInput).not.toHaveAttribute("aria-disabled", /.+/);
  await firstInput.focus();
  await firstInput.press("Tab");
  await expect(firstInput).not.toBeFocused();
  const dockSaveResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === reconciliationPath &&
      response.request().method() === "POST",
  );
  releaseDockSave?.();
  await dockSaveResponse;
  await page.unroute(`**${reconciliationPath}`, holdDockSave);
  await expect(firstInput).not.toHaveAttribute("aria-disabled", /.+/);
  await expect(
    page.getByRole("status").filter({ hasText: "2 records updated." }),
  ).toBeVisible();

  const orderedInputs = page.locator(
    "input[data-testid^='transaction-'][data-testid$='-amount-input']",
  );
  const tabSource = orderedInputs.first();
  const tabTarget = orderedInputs.nth(1).locator("xpath=ancestor::tr");
  const tabSave = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith("/api/transactions/") &&
      response.request().method() === "PUT",
  );
  await tabSource.fill("20.25");
  await tabSource.press("Tab");
  await tabSave;
  await expect(tabTarget).toBeFocused();

  let releasePendingTabSave: (() => void) | undefined;
  let markPendingTabSaveStarted: (() => void) | undefined;
  const pendingTabSaveStarted = new Promise<void>((resolve) => {
    markPendingTabSaveStarted = resolve;
  });
  const holdPendingTabSave = async (route: Route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    markPendingTabSaveStarted?.();
    await new Promise<void>((resolve) => {
      releasePendingTabSave = resolve;
    });
    await route.continue();
  };
  await page.route("**/api/transactions/*", holdPendingTabSave);
  await tabSource.fill("20.75");
  await tabSource.press("Enter");
  await pendingTabSaveStarted;
  await tabSource.press("Tab");
  await expect(tabSource).toBeFocused();
  const pendingTabSave = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith("/api/transactions/") &&
      response.request().method() === "PUT",
  );
  releasePendingTabSave?.();
  await pendingTabSave;
  await page.unroute("**/api/transactions/*", holdPendingTabSave);
  await expect(tabTarget).toBeFocused();

  await Promise.all([
    deleteTransaction(page, firstTransaction),
    deleteTransaction(page, secondTransaction),
  ]);
});

test("Done exits Edit mode after a pending amount save succeeds", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E pending amount exit ${unique}`;
  const transaction = await createSearchSpend(page, memo);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await page.getByRole("button", { name: "Edit mode" }).click();

  const header = page.getByTestId("transaction-browser-edit-mode-header");
  const amountInput = page.getByTestId(
    `transaction-${transaction.transaction_id}-amount-input`,
  );
  await amountInput.locator("xpath=ancestor::tr").click({
    position: { x: 80, y: 10 },
  });
  await expect(header).toContainText("1 selected");

  let releaseSave: (() => void) | undefined;
  let markSaveStarted: (() => void) | undefined;
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  const savePath = `/api/transactions/${transaction.transaction_id}`;
  const holdSave = async (route: Route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    markSaveStarted?.();
    await new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await route.continue();
  };
  await page.route(`**${savePath}`, holdSave);
  await amountInput.selectText();
  await amountInput.pressSequentially("21.50");
  await expect(amountInput).toHaveValue("21.50");
  await amountInput.press("Enter");
  await saveStarted;
  await expect(
    page
      .getByTestId("transaction-edit-dock")
      .getByRole("button", { name: "Set / clear" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(header).toBeVisible();
  const saveResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === savePath &&
      response.request().method() === "PUT",
  );
  releaseSave?.();
  await saveResponse;
  await page.unroute(`**${savePath}`, holdSave);

  await expect(header).toHaveCount(0);
  await expect(page.getByTestId("transaction-edit-dock")).toHaveCount(0);
  await deleteTransaction(page, transaction);
});

test("concurrent amount saves prune selected rows that leave the active filter", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E filtered amount selection ${unique}`;
  const [firstTransaction, secondTransaction] = await Promise.all([
    createSearchSpend(page, `${memo} first`),
    createSearchSpend(page, `${memo} second`),
  ]);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}` +
      "&amountMin=10&amountMax=20",
  );
  await page.getByRole("button", { name: "Edit mode" }).click();

  const header = page.getByTestId("transaction-browser-edit-mode-header");
  const firstInput = page.getByTestId(
    `transaction-${firstTransaction.transaction_id}-amount-input`,
  );
  const secondInput = page.getByTestId(
    `transaction-${secondTransaction.transaction_id}-amount-input`,
  );
  const firstRow = firstInput.locator("xpath=ancestor::tr");
  const secondRow = secondInput.locator("xpath=ancestor::tr");
  await firstRow.click({ position: { x: 80, y: 10 } });
  await secondRow.click({ position: { x: 80, y: 10 } });
  await expect(header).toContainText("2 selected");

  let releaseSaves: (() => void) | undefined;
  let savesStartedCount = 0;
  let markSavesStarted: (() => void) | undefined;
  const savesStarted = new Promise<void>((resolve) => {
    markSavesStarted = resolve;
  });
  const savesGate = new Promise<void>((resolve) => {
    releaseSaves = resolve;
  });
  const holdSave = async (route: Route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    savesStartedCount += 1;
    if (savesStartedCount === 2) {
      markSavesStarted?.();
    }
    await savesGate;
    await route.continue();
  };
  await page.route("**/api/transactions/*", holdSave);

  await firstInput.fill("25");
  await firstInput.press("Enter");
  await secondInput.fill("26");
  await secondInput.press("Enter");
  await savesStarted;
  releaseSaves?.();
  await expect(firstRow).toHaveCount(0);
  await expect(secondRow).toHaveCount(0);
  await expect(page.locator("[data-transaction-empty-action]")).toBeFocused();
  await expect(header).toContainText("0 selected");
  await expect(
    page
      .getByTestId("transaction-edit-dock")
      .getByRole("button", { name: "Set / clear" }),
  ).toBeDisabled();

  await page.unroute("**/api/transactions/*", holdSave);
  await Promise.all([
    deleteTransaction(page, firstTransaction),
    deleteTransaction(page, secondTransaction),
  ]);
});

test("record-state updates prune selections moved off an updated-time page", async ({
  page,
}) => {
  await page.goto(
    "/transactions?page=1&pageSize=25&sort=updated_at&sortDir=asc",
  );
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  await page.getByRole("button", { name: "Edit mode" }).click();

  const selectedRow = page
    .locator("tbody tr[data-transaction-id]:not([aria-disabled='true'])")
    .first();
  const selectedTransactionId = await selectedRow.getAttribute(
    "data-transaction-id",
  );
  expect(selectedTransactionId).not.toBeNull();
  await selectedRow.click();

  const header = page.getByTestId("transaction-browser-edit-mode-header");
  await expect(header).toContainText("1 selected");
  const updateResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/records/bulk/reconciliation" &&
      response.request().method() === "POST",
  );
  await page
    .getByTestId("transaction-edit-dock")
    .getByRole("button", { name: "Reconcile", exact: true })
    .click();
  await updateResponse;

  await expect(header).toContainText("0 selected");
  await expect(
    page.locator(`tr[data-transaction-id='${selectedTransactionId}']`),
  ).toHaveCount(0);
});

test("opening transaction entry waits for a pending amount save", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E entry during amount save ${unique}`;
  const transaction = await createSearchSpend(page, memo);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await page.getByRole("button", { name: "Edit mode" }).click();

  const header = page.getByTestId("transaction-browser-edit-mode-header");
  const amountInput = page.getByTestId(
    `transaction-${transaction.transaction_id}-amount-input`,
  );
  const savePath = `/api/transactions/${transaction.transaction_id}`;
  let releaseSave: (() => void) | undefined;
  let markSaveStarted: (() => void) | undefined;
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const failSave = async (route: Route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    markSaveStarted?.();
    await saveGate;
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: { code: "temporary_failure", message: "Amount save failed." },
      },
      status: 503,
    });
  };
  await page.route(`**${savePath}`, failSave);

  await amountInput.selectText();
  await amountInput.pressSequentially("18.76");
  await expect(amountInput).toHaveValue("18.76");
  await amountInput.press("Enter");
  await saveStarted;
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(header).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);

  const failedSaveResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === savePath &&
      response.request().method() === "PUT",
  );
  releaseSave?.();
  await failedSaveResponse;
  await expect(header).toBeVisible();
  await expect(amountInput).toHaveValue("18.76");
  await expect(page.getByRole("alert")).toContainText("Amount save failed.");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await page.unroute(`**${savePath}`, failSave);
  await deleteTransaction(page, transaction);
});

test("saved entry routes load after a pending amount save", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E saved entry during amount save ${unique}`;
  const transaction = await createSearchSpend(page, memo);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await page.getByRole("button", { name: "Edit mode" }).click();

  const amountInput = page.getByTestId(
    `transaction-${transaction.transaction_id}-amount-input`,
  );
  const transactionPath = `/api/transactions/${transaction.transaction_id}`;
  let releaseSave: (() => void) | undefined;
  let markSaveStarted: (() => void) | undefined;
  let entryFetchCount = 0;
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const holdSave = async (route: Route) => {
    if (route.request().method() === "PUT") {
      markSaveStarted?.();
      await saveGate;
    } else if (route.request().method() === "GET") {
      entryFetchCount += 1;
    }
    await route.continue();
  };
  await page.route(`**${transactionPath}`, holdSave);

  await amountInput.selectText();
  await amountInput.pressSequentially("18.76");
  await expect(amountInput).toHaveValue("18.76");
  await amountInput.press("Enter");
  await saveStarted;
  await page.evaluate((entry) => {
    const url = new URL(window.location.href);
    url.searchParams.set("entry", entry);
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `edit:${transaction.transaction_id}`);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      }),
  );
  expect(entryFetchCount).toBe(0);

  const entryFetch = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === transactionPath &&
      request.method() === "GET",
  );
  releaseSave?.();
  await entryFetch;
  const entryModal = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(
    entryModal.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(entryModal.getByLabel("Memo")).toHaveValue(memo);

  await page.unroute(`**${transactionPath}`, holdSave);
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await deleteTransaction(page, transaction);
});

test("Browser Back cancels an entry route deferred behind an amount save", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E cancel deferred entry ${unique}`;
  const transaction = await createSearchSpend(page, memo);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await page.getByRole("button", { name: "Edit mode" }).click();

  const amountInput = page.getByTestId(
    `transaction-${transaction.transaction_id}-amount-input`,
  );
  const transactionPath = `/api/transactions/${transaction.transaction_id}`;
  let releaseSave: (() => void) | undefined;
  let markSaveStarted: (() => void) | undefined;
  let entryFetchCount = 0;
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  await page.route(`**${transactionPath}`, async (route) => {
    if (route.request().method() === "PUT") {
      markSaveStarted?.();
      await new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
    } else if (route.request().method() === "GET") {
      entryFetchCount += 1;
    }
    await route.continue();
  });

  await amountInput.selectText();
  await amountInput.pressSequentially("18.76");
  await expect(amountInput).toHaveValue("18.76");
  await amountInput.press("Enter");
  await saveStarted;
  await page.evaluate((entry) => {
    const url = new URL(window.location.href);
    url.searchParams.set("entry", entry);
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `edit:${transaction.transaction_id}`);
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]entry=/);

  const saveResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === transactionPath &&
      response.request().method() === "PUT",
  );
  releaseSave?.();
  await saveResponse;
  await expect(amountInput).toHaveValue("18.76");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  expect(entryFetchCount).toBe(0);

  await page.unroute(`**${transactionPath}`);
  await deleteTransaction(page, transaction);
});

test("concurrent failed amount saves do not steal focus or retry", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const search = `E2E concurrent failed amount ${unique}`;
  const [firstTransaction, secondTransaction] = await Promise.all([
    createSearchSpend(page, `${search} first`),
    createSearchSpend(page, `${search} second`),
  ]);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  await page.getByRole("button", { name: "Edit mode" }).click();

  const firstInput = page.getByTestId(
    `transaction-${firstTransaction.transaction_id}-amount-input`,
  );
  const secondInput = page.getByTestId(
    `transaction-${secondTransaction.transaction_id}-amount-input`,
  );
  let requestCount = 0;
  let releaseSaves: (() => void) | undefined;
  const savesGate = new Promise<void>((resolve) => {
    releaseSaves = resolve;
  });
  await page.route("**/api/transactions/*", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    requestCount += 1;
    await savesGate;
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: { code: "temporary_failure", message: "Amount save failed." },
      },
      status: 503,
    });
  });

  await fillAndExpectValue(firstInput, "17.01");
  await firstInput.press("Enter");
  await expect.poll(() => requestCount).toBe(1);
  await fillAndExpectValue(secondInput, "18.02");
  await secondInput.press("Enter");
  await expect.poll(() => requestCount).toBe(2);
  releaseSaves?.();
  await expect(page.getByRole("alert")).toHaveCount(2);
  await expect(secondInput).toBeFocused();
  expect(requestCount).toBe(2);

  await page.unroute("**/api/transactions/*");
  await Promise.all([
    deleteTransaction(page, firstTransaction),
    deleteTransaction(page, secondTransaction),
  ]);
});

test("failed dock Apply restores focus to its trigger", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E failed dock apply ${unique}`;
  const transaction = await createSearchSpend(page, memo);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await page.getByRole("button", { name: "Edit mode" }).click();
  await page.getByRole("row").filter({ hasText: memo }).click();
  const dock = page.getByTestId("transaction-edit-dock");
  await dock.getByRole("button", { name: "Set / clear" }).click();
  const editor = page.getByTestId("edit-dock-editor");
  await editor.getByRole("button", { name: "Clear", exact: true }).click();
  await page.route("**/api/records/bulk/member", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: { code: "temporary_failure", message: "Member update failed." },
      },
      status: 503,
    });
  });

  const apply = editor.getByRole("button", { name: "Apply" });
  await apply.focus();
  await apply.press("Enter");
  await expect(editor.getByRole("alert")).toContainText(
    "Member update failed.",
  );
  await expect(apply).toBeFocused();

  await page.unroute("**/api/records/bulk/member");
  await deleteTransaction(page, transaction);
});

test("untouched sub-cent fiat amounts remain valid", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E sub-cent amount ${unique}`;
  const transaction = await createSearchSpend(page, memo, "0.00100000");
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await page.getByRole("button", { name: "Edit mode" }).click();

  const amountInput = page.getByTestId(
    `transaction-${transaction.transaction_id}-amount-input`,
  );
  await expect(amountInput).toHaveValue("0.001");
  await amountInput.focus();
  await page.getByRole("button", { name: "Done" }).focus();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(amountInput).toHaveValue("0.001");

  await deleteTransaction(page, transaction);
});

test("a failed amount blur keeps Edit mode and its draft mounted", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const transaction = await createSearchSpend(
    page,
    `E2E failed amount blur ${unique}`,
  );
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(`E2E failed amount blur ${unique}`)}`,
  );
  await page.getByRole("button", { name: "Edit mode" }).click();

  const amountInput = page.getByTestId(
    `transaction-${transaction.transaction_id}-amount-input`,
  );
  const savePath = `/api/transactions/${transaction.transaction_id}`;
  await page.route(`**${savePath}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: {
          code: "temporary_failure",
          message: "Amount save failed.",
        },
      },
      status: 503,
    });
  });

  await amountInput.fill("18.76");
  const saveRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === savePath &&
      request.method() === "PUT",
  );
  await page.getByRole("button", { name: "Done" }).click();
  await saveRequest;

  await expect(
    page.getByTestId("transaction-browser-edit-mode-header"),
  ).toBeVisible();
  await expect(amountInput).toHaveValue("18.76");
  await expect(page.getByRole("alert")).toContainText("Amount save failed.");
  await expect(amountInput).toBeFocused();

  await page.unroute(`**${savePath}`);
  await deleteTransaction(page, transaction);
});

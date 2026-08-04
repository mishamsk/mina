import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  chooseOptionByKeyboard,
  createAccount,
  createCategory,
  expect,
  findByFqn,
  journalRecord,
  type JournalRecordFixture,
  listFixtures,
  type TransactionDetailFixture,
} from "@tests/e2e/transactions/support";

const movementRecords = (
  transaction: TransactionDetailFixture,
): readonly JournalRecordFixture[] =>
  transaction.records.filter((record) => record.settlement !== null);

const nonMovementRecords = (
  transaction: TransactionDetailFixture,
): readonly JournalRecordFixture[] =>
  transaction.records.filter((record) => record.settlement === null);

test("shorthand pending choice persists until save and then resets", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const merchant = await createAccount(
    page,
    `e2e:PendingEntry:${unique}:Merchant`,
    "flow",
  );
  const category = await createCategory(
    page,
    `E2E:PendingEntry:${unique}:Expense`,
    "expense",
  );
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const wallet = findByFqn(accounts, "cash:Wallet");

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Transaction editor" });
  for (const tabName of ["Spend", "Income", "Refund", "Transfer", "Exchange"]) {
    await dialog.getByRole("tab", { name: tabName }).click();
    await expect(
      dialog.getByRole("checkbox", { name: "Record as pending" }),
    ).toBeVisible();
  }

  await dialog.getByRole("tab", { name: "Spend" }).click();
  const pendingCheckbox = dialog.getByRole("checkbox", {
    name: "Record as pending",
  });
  await pendingCheckbox.check();
  await dialog
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(pendingCheckbox).toBeChecked();

  const spendPanel = dialog.getByRole("tabpanel", { name: "Spend" });
  await chooseOptionByKeyboard(page, "Funding account", "Wallet", wallet.fqn, {
    scope: spendPanel,
  });
  const merchantRow = spendPanel.getByRole("group", { name: "Merchant 1" });
  await chooseOptionByKeyboard(page, "Merchant", unique, merchant.fqn, {
    scope: merchantRow,
  });
  await merchantRow.getByLabel("Amount").fill("12.34");
  await chooseOptionByKeyboard(page, "Category", unique, category.fqn, {
    scope: merchantRow,
  });
  await dialog.getByRole("button", { name: "Edit as journal" }).click();
  await dialog
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(
    dialog.getByRole("tabpanel", { name: "Advanced" }),
  ).toBeVisible();

  const pendingResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      response.request().method() === "POST"
    );
  });
  await dialog.getByRole("button", { name: "Save and add another" }).click();
  const pendingResponse = await pendingResponsePromise;
  expect(pendingResponse.ok(), await pendingResponse.text()).toBe(true);
  const pending = (await pendingResponse.json()) as TransactionDetailFixture;
  expect(movementRecords(pending)).toHaveLength(1);
  expect(movementRecords(pending)[0]?.settlement).toBe("pending");
  expect(movementRecords(pending)[0]?.posted_date ?? null).toBeNull();
  expect(movementRecords(pending)[0]?.pending_date).not.toBeNull();
  expect(nonMovementRecords(pending)).toHaveLength(1);
  await dialog.getByRole("tab", { name: "Spend" }).click();
  await expect(pendingCheckbox).not.toBeChecked();

  const nextMerchantRow = spendPanel.getByRole("group", { name: "Merchant 1" });
  await nextMerchantRow.getByLabel("Amount").fill("4.56");
  await chooseOptionByKeyboard(page, "Category", unique, category.fqn, {
    scope: nextMerchantRow,
  });
  const postedResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions/spend" &&
      response.request().method() === "POST"
    );
  });
  await dialog.getByRole("button", { name: "Save and add another" }).click();
  const postedResponse = await postedResponsePromise;
  expect(postedResponse.ok(), await postedResponse.text()).toBe(true);
  const posted = (await postedResponse.json()) as TransactionDetailFixture;
  expect(movementRecords(posted)[0]?.settlement).toBe("posted");
  expect(movementRecords(posted)[0]?.pending_date ?? null).toBeNull();
  expect(movementRecords(posted)[0]?.posted_date).not.toBeNull();
});

test("composed shorthand journals apply pending only to balance records", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [merchantOne, merchantTwo, destination, category] = await Promise.all([
    createAccount(page, `e2e:PendingComposed:${unique}:MerchantOne`, "flow"),
    createAccount(page, `e2e:PendingComposed:${unique}:MerchantTwo`, "flow"),
    createAccount(
      page,
      `e2e:PendingComposed:${unique}:Destination`,
      "owned",
      "USD",
    ),
    createCategory(page, `E2E:PendingComposed:${unique}:Expense`, "expense"),
  ]);
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const wallet = findByFqn(accounts, "cash:Wallet");

  await page.goto("/transactions?page=1&pageSize=25&entry=new:spend");
  const dialog = page.getByRole("dialog", { name: "Transaction editor" });
  const spendPanel = dialog.getByRole("tabpanel", { name: "Spend" });
  await dialog.getByRole("checkbox", { name: "Record as pending" }).check();
  await chooseOptionByKeyboard(page, "Funding account", "Wallet", wallet.fqn, {
    scope: spendPanel,
  });
  const firstMerchant = spendPanel.getByRole("group", { name: "Merchant 1" });
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "MerchantOne",
    merchantOne.fqn,
    {
      scope: firstMerchant,
    },
  );
  await firstMerchant.getByLabel("Amount").fill("10.00");
  await chooseOptionByKeyboard(page, "Category", unique, category.fqn, {
    scope: firstMerchant,
  });
  await spendPanel.getByRole("button", { name: "Add merchant" }).click();
  const secondMerchant = spendPanel.getByRole("group", { name: "Merchant 2" });
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "MerchantTwo",
    merchantTwo.fqn,
    {
      scope: secondMerchant,
    },
  );
  await secondMerchant.getByLabel("Amount").fill("5.00");
  await chooseOptionByKeyboard(page, "Category", unique, category.fqn, {
    scope: secondMerchant,
  });

  const multiSpendResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/transactions") &&
      response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save and add another" }).click();
  const multiSpendResponse = await multiSpendResponsePromise;
  expect(multiSpendResponse.ok(), await multiSpendResponse.text()).toBe(true);
  const multiSpend =
    (await multiSpendResponse.json()) as TransactionDetailFixture;
  expect(movementRecords(multiSpend)).toHaveLength(1);
  expect(movementRecords(multiSpend)[0]?.settlement).toBe("pending");
  expect(nonMovementRecords(multiSpend)).toHaveLength(2);

  await dialog.getByRole("tab", { name: "Transfer" }).click();
  const transferPanel = dialog.getByRole("tabpanel", { name: "Transfer" });
  await dialog.getByRole("checkbox", { name: "Record as pending" }).check();
  await transferPanel.getByLabel("Amount").fill("20.00");
  await chooseOptionByKeyboard(page, "From account", "Wallet", wallet.fqn, {
    scope: transferPanel,
  });
  await chooseOptionByKeyboard(
    page,
    "To account",
    "Destination",
    destination.fqn,
    {
      scope: transferPanel,
    },
  );
  await transferPanel.getByRole("button", { name: "Add charge" }).click();
  const charge = transferPanel.getByRole("group", { name: "Transfer charge" });
  await chooseOptionByKeyboard(
    page,
    "Charge account",
    "MerchantOne",
    merchantOne.fqn,
    {
      scope: charge,
    },
  );
  await charge.getByLabel("Charge amount").fill("2.00");
  await chooseOptionByKeyboard(page, "Charge category", unique, category.fqn, {
    scope: charge,
  });

  const chargedTransferResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/transactions") &&
      response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save and add another" }).click();
  const chargedTransferResponse = await chargedTransferResponsePromise;
  expect(
    chargedTransferResponse.ok(),
    await chargedTransferResponse.text(),
  ).toBe(true);
  const chargedTransfer =
    (await chargedTransferResponse.json()) as TransactionDetailFixture;
  expect(movementRecords(chargedTransfer)).toHaveLength(2);
  expect(
    movementRecords(chargedTransfer).every(
      (record) =>
        record.settlement === "pending" && record.pending_date !== null,
    ),
  ).toBe(true);
  expect(nonMovementRecords(chargedTransfer)).toHaveLength(1);
});

test("advanced replacement retains pending history when posting", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [account, merchant, category] = await Promise.all([
    createAccount(page, `e2e:PendingReplace:${unique}:Account`, "owned", "USD"),
    createAccount(page, `e2e:PendingReplace:${unique}:Merchant`, "flow"),
    createCategory(page, `E2E:PendingReplace:${unique}:Expense`, "expense"),
  ]);
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "19.00",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: account.account_id,
      initiated_date: "2026-08-01",
      memo: `E2E pending replace ${unique}`,
      settlement: { status: "pending" },
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const created = (await createResponse.json()) as TransactionDetailFixture;
  const originalBalanceRecord = movementRecords(created)[0]!;
  expect(originalBalanceRecord.pending_date).not.toBeNull();

  await page.goto(
    `/transactions?page=1&pageSize=25&entry=edit:${created.transaction_id}`,
  );
  const dialog = page.getByRole("dialog", { name: "Transaction editor" });
  await dialog.getByRole("button", { name: "Edit as journal" }).click();
  const settlement = journalRecord(page, 1).getByRole("combobox", {
    name: "Record 1 settlement",
  });
  await settlement.click();
  await page.getByRole("option", { name: "Posted" }).click();

  const replaceResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/transactions/${created.transaction_id}` &&
      response.request().method() === "PUT",
  );
  await dialog.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(movementRecords(replaced)[0]).toMatchObject({
    pending_date: originalBalanceRecord.pending_date,
    settlement: "posted",
  });
  expect(movementRecords(replaced)[0]?.posted_date).not.toBeNull();
});

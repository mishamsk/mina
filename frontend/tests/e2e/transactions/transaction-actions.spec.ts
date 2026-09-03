import type { Locator, Page } from "@playwright/test";
import { test } from "@tests/e2e/test";
import {
  activateTransactionRow,
  clickRowAction,
  createAccount,
  createCategory,
  createTag,
  expect,
  formatLocalDate,
  pickerSelectedLabel,
  shiftLocalDate,
  type TransactionFixture,
} from "@tests/e2e/transactions/support";

interface PendingSpendFixture {
  readonly merchant: Awaited<ReturnType<typeof createAccount>>;
  readonly memo: string;
  readonly transaction: TransactionFixture;
  readonly wallet: Awaited<ReturnType<typeof createAccount>>;
}

const createPendingSpend = async (
  page: Page,
  unique: string,
  tagIds: readonly number[] = [],
): Promise<PendingSpendFixture> => {
  const [wallet, merchant, category] = await Promise.all([
    createAccount(page, `e2e:Actions:${unique}:Wallet`, "owned", "USD"),
    createAccount(page, `e2e:Actions:${unique}:Merchant`, "flow"),
    createCategory(page, `E2E:Actions:${unique}:Expense`, "expense"),
  ]);
  const memo = `Transaction action ${unique}`;
  const response = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "25.00",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: wallet.account_id,
      initiated_date: "2026-08-02",
      memo,
      settlement: { status: "pending" },
      tag_ids: tagIds,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);

  return {
    merchant,
    memo,
    transaction: (await response.json()) as TransactionFixture,
    wallet,
  };
};

const openTransactionRow = async (
  page: Page,
  fixture: PendingSpendFixture,
  unique: string,
): Promise<Locator> => {
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const row = page.locator(
    `[data-transaction-id="${fixture.transaction.transaction_id}"]`,
  );
  await expect(row).toBeVisible();
  return row;
};

const uniqueKey = (projectName: string): string =>
  `${projectName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;

test("pending transaction posts from its row", async ({ page }, testInfo) => {
  const unique = uniqueKey(testInfo.project.name);
  const fixture = await createPendingSpend(page, unique);
  const row = await openTransactionRow(page, fixture, unique);

  await clickRowAction(page, row, "Post transaction");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { exact: true, name: "Post transaction" })
    .click();

  await expect(
    page.getByRole("status").filter({ hasText: "Transaction posted." }),
  ).toBeVisible();
  await expect(row.getByRole("img", { name: "Pending" })).toHaveCount(0);
});

test("pending transaction cancels from its row", async ({ page }, testInfo) => {
  const unique = uniqueKey(testInfo.project.name);
  const fixture = await createPendingSpend(page, unique);
  const row = await openTransactionRow(page, fixture, unique);

  await clickRowAction(page, row, "Cancel transaction");

  await expect(
    page.getByRole("status").filter({ hasText: "Transaction cancelled." }),
  ).toBeVisible();
  await expect(row.getByRole("img", { name: "Cancelled" })).toBeVisible();
});

test("cancelled transaction restores from its row", async ({
  page,
}, testInfo) => {
  const unique = uniqueKey(testInfo.project.name);
  const fixture = await createPendingSpend(page, unique);
  const cancelResponse = await page.request.post(
    `/api/transactions/${fixture.transaction.transaction_id}/cancel`,
  );
  expect(cancelResponse.ok(), await cancelResponse.text()).toBe(true);
  const row = await openTransactionRow(page, fixture, unique);

  await clickRowAction(page, row, "Restore transaction");

  await expect(
    page.getByRole("status").filter({ hasText: "Transaction restored." }),
  ).toBeVisible();
  await expect(row.getByRole("img", { name: "Pending" })).toBeVisible();
});

test("row overflow opens a seeded recurring definition", async ({
  page,
}, testInfo) => {
  const unique = uniqueKey(testInfo.project.name);
  const tag = await createTag(page, `E2E:Actions:${unique}:Retained`);
  const fixture = await createPendingSpend(page, unique, [tag.tag_id]);
  const [hideAccountResponse, hideTagResponse] = await Promise.all([
    page.request.patch(`/api/accounts/${fixture.wallet.account_id}`, {
      data: { is_hidden: true },
    }),
    page.request.patch(`/api/tags/${tag.tag_id}`, {
      data: { is_hidden: true },
    }),
  ]);
  expect(hideAccountResponse.ok()).toBe(true);
  expect(hideTagResponse.ok()).toBe(true);
  const row = await openTransactionRow(page, fixture, unique);

  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();

  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  const records = editor.getByLabel("Definition records").locator("section");
  await expect(editor).toBeVisible();
  await expect(records).toHaveCount(2);
  await expect(records.nth(0).getByLabel("Account")).toHaveValue(
    fixture.wallet.display_label,
  );
  await expect(records.nth(0).getByLabel("Amount")).toHaveValue("-25.00000000");
  await expect(records.nth(1).getByLabel("Account")).toHaveValue(
    fixture.merchant.display_label,
  );
  await expect(records.nth(1).getByLabel("Memo")).toHaveValue(fixture.memo);
  await expect(
    records.getByRole("button", {
      name: `Remove ${pickerSelectedLabel(tag)}`,
    }),
  ).toHaveCount(2);
  await expect(
    records.nth(0).getByLabel("Hidden", { exact: true }),
  ).toHaveCount(2);
  await expect(
    records.nth(1).getByLabel("Hidden", { exact: true }),
  ).toHaveCount(1);
});

test("Split controls follow frontend transaction eligibility", async ({
  page,
}, testInfo) => {
  const unique = uniqueKey(testInfo.project.name);
  const memoPrefix = `Split eligibility ${unique}`;
  const [wallet, checking, euros, merchant, employer, expense, income] =
    await Promise.all([
      createAccount(page, `e2e:Split:${unique}:Wallet`, "owned", "USD"),
      createAccount(page, `e2e:Split:${unique}:Checking`, "owned", "USD"),
      createAccount(page, `e2e:Split:${unique}:Euros`, "owned", "EUR"),
      createAccount(page, `e2e:Split:${unique}:Merchant`, "flow"),
      createAccount(page, `e2e:Split:${unique}:Employer`, "flow"),
      createCategory(page, `E2E:Split:${unique}:Expense`, "expense"),
      createCategory(page, `E2E:Split:${unique}:Income`, "income"),
    ]);
  const createTransaction = async (
    path: string,
    data: Record<string, unknown>,
  ): Promise<TransactionFixture> => {
    const response = await page.request.post(path, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as TransactionFixture;
  };
  const common = {
    amount: "10.00",
    currency: "USD",
    initiated_date: "2026-08-02",
  };
  const memos = {
    cancelled: `${memoPrefix} cancelled`,
    exchange: `${memoPrefix} exchange`,
    imported: `${memoPrefix} imported`,
    income: `${memoPrefix} income`,
    refund: `${memoPrefix} refund`,
    spend: `${memoPrefix} spend`,
    transfer: `${memoPrefix} transfer`,
  };
  const [
    spend,
    incomeTransaction,
    refund,
    transfer,
    exchange,
    cancelled,
    imported,
  ] = await Promise.all([
    createTransaction("/api/transactions/spend", {
      ...common,
      category_id: expense.category_id,
      counterparty_account_id: merchant.account_id,
      funding_account_id: wallet.account_id,
      memo: memos.spend,
    }),
    createTransaction("/api/transactions/income", {
      ...common,
      category_id: income.category_id,
      destination_account_id: checking.account_id,
      memo: memos.income,
      source_account_id: employer.account_id,
    }),
    createTransaction("/api/transactions/refund", {
      ...common,
      category_id: expense.category_id,
      counterparty_account_id: merchant.account_id,
      destination_account_id: wallet.account_id,
      memo: memos.refund,
    }),
    createTransaction("/api/transactions/transfer", {
      ...common,
      destination_account_id: checking.account_id,
      memo: memos.transfer,
      source_account_id: wallet.account_id,
    }),
    createTransaction("/api/transactions/exchange", {
      bought_account_id: euros.account_id,
      bought_amount: "9.00",
      initiated_date: common.initiated_date,
      memo: memos.exchange,
      sold_account_id: wallet.account_id,
      sold_amount: common.amount,
    }),
    createTransaction("/api/transactions/spend", {
      ...common,
      category_id: expense.category_id,
      counterparty_account_id: merchant.account_id,
      funding_account_id: wallet.account_id,
      memo: memos.cancelled,
      settlement: { status: "pending" },
    }),
    createTransaction("/api/transactions", {
      initiated_date: common.initiated_date,
      records: [
        {
          account_id: wallet.account_id,
          amount: "-10.00",
          category_id: null,
          currency: common.currency,
          memo: memos.imported,
          reconciliation_status: "unreconciled",
          settlement: { status: "posted" },
          source: "imported",
          tag_ids: [],
        },
        {
          account_id: merchant.account_id,
          amount: "10.00",
          category_id: expense.category_id,
          currency: common.currency,
          memo: memos.imported,
          reconciliation_status: "unreconciled",
          settlement: null,
          source: "imported",
          tag_ids: [],
        },
      ],
    }),
  ]);
  const cancelResponse = await page.request.post(
    `/api/transactions/${cancelled.transaction_id}/cancel`,
  );
  expect(cancelResponse.ok(), await cancelResponse.text()).toBe(true);

  const projectionDate = shiftLocalDate(formatLocalDate(new Date()), 30);
  const projectionMemo = `${memoPrefix} projected`;
  const definitionResponse = await page.request.post(
    "/api/recurring-definitions",
    {
      data: {
        anchor_date: projectionDate,
        fqn: `E2E:Split:${unique}:Projected`,
        schedule_rule: {
          every: 1,
          kind: "interval",
          unit: "DAY",
          version: 1,
        },
        records: [
          {
            account_id: wallet.account_id,
            amount: "-10.00",
            category_id: null,
            currency: common.currency,
            memo: projectionMemo,
            tag_ids: [],
          },
          {
            account_id: merchant.account_id,
            amount: "10.00",
            category_id: expense.category_id,
            currency: common.currency,
            memo: projectionMemo,
            tag_ids: [],
          },
        ],
      },
    },
  );
  expect(definitionResponse.ok(), await definitionResponse.text()).toBe(true);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const cases = [
    { eligible: true, transactionId: spend.transaction_id },
    { eligible: true, transactionId: incomeTransaction.transaction_id },
    { eligible: false, transactionId: refund.transaction_id },
    { eligible: false, transactionId: transfer.transaction_id },
    { eligible: false, transactionId: exchange.transaction_id },
    { eligible: false, transactionId: cancelled.transaction_id },
    { eligible: false, transactionId: imported.transaction_id },
  ];
  for (const item of cases) {
    const row = page.locator(`[data-transaction-id="${item.transactionId}"]`);
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "More row actions" }).click();
    await expect(
      page
        .locator(".row-actions-menu:visible")
        .getByRole("button", { exact: true, name: "Split transaction" }),
    ).toHaveCount(item.eligible ? 1 : 0);
    await page.keyboard.press("Escape");
  }
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  await page.getByLabel("Go to day").fill(projectionDate);
  const projectionRow = page
    .locator("tbody > tr[data-transaction-id]")
    .filter({ hasText: projectionMemo })
    .first();
  await expect(projectionRow).toBeVisible();
  await expect(
    projectionRow.getByRole("button", { name: "Confirm next" }),
  ).toBeVisible();
  await projectionRow.click();
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole("button", { exact: true, name: "Split" }),
  ).toHaveCount(0);

  await page.goto(
    "/transactions?page=1&pageSize=50&q=Streaming%20subscription&filter=lifecycle%3Aexpected",
  );
  const expectedRow = page
    .locator('[data-transaction-row="true"]')
    .filter({ has: page.getByRole("img", { name: "Expected" }) })
    .first();
  await expect(expectedRow).toBeVisible();
  await activateTransactionRow(expectedRow);
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

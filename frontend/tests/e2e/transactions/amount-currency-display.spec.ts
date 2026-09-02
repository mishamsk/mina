import { test } from "@tests/e2e/test";
import {
  createAccount,
  createCategory,
  expect,
  type Page,
} from "@tests/e2e/transactions/support";

const createValuedEurTransaction = async (page: Page): Promise<string> => {
  const memo = "E2E valued EUR transaction";
  const [category, fundingAccount, merchantAccount] = await Promise.all([
    createCategory(page, "E2E:CurrencyDisplay:Expense", "expense"),
    createAccount(page, "e2e:currency-display:eur-wallet", "owned", "EUR"),
    createAccount(page, "e2e:currency-display:merchant", "flow"),
  ]);
  const response = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-04",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-30.00",
          amount_usd: "-33.00",
          category_id: null,
          currency: "EUR",
          memo,
          reconciliation_status: "unreconciled",
          settlement: { status: "posted" },
          source: "manual",
        },
        {
          account_id: merchantAccount.account_id,
          amount: "30.00",
          amount_usd: "33.00",
          category_id: category.category_id,
          currency: "EUR",
          memo,
          reconciliation_status: "unreconciled",
          settlement: null,
          source: "manual",
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return memo;
};

const transactionRow = (page: Page, memo: string) =>
  page.locator("[data-transaction-row='true']").filter({ hasText: memo });

test("transaction table switches a native amount to USD", async ({ page }) => {
  const memo = await createValuedEurTransaction(page);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );

  const row = transactionRow(page, memo);
  const amountChip = row.getByTestId("amount-chip");
  await expect(amountChip).toBeVisible();
  await expect(amountChip).toHaveText("-30.00 €");

  await page.getByRole("button", { name: "USD display mode" }).click();

  await expect(amountChip).toHaveText("-33.00 $");
});

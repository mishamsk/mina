import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  amountChipsFitCell,
  createAccount,
  createCategory,
  expect,
  expectCollapsedRowActionsKeepAmountVisible,
  openAccountTransactionPeek,
  type Page,
} from "@tests/e2e/transactions/support";

interface CurrencyDisplayFixture {
  readonly categoryId: number;
  readonly complexFunding: AccountFixture;
  readonly complexMemo: string;
  readonly cryptoMemo: string;
  readonly largeUsdMemo: string;
  readonly mixedMemo: string;
  readonly search: string;
  readonly usdMemo: string;
}

const createTransaction = async (
  page: Page,
  initiatedDate: string,
  records: readonly Record<string, unknown>[],
): Promise<void> => {
  const response = await page.request.post("/api/transactions", {
    data: { initiated_date: initiatedDate, records },
  });
  const body = await response.text();
  expect(response.ok(), body).toBe(true);
};

const balanceRecord = (
  accountId: number,
  amount: string,
  currency: string,
  memo: string,
  amountUsd?: string,
) => ({
  account_id: accountId,
  amount,
  amount_usd: amountUsd,
  category_id: null,
  currency,
  memo,
  reconciliation_status: "unreconciled",
  settlement: { status: "posted" },
  source: "manual",
});

const flowRecord = (
  accountId: number,
  categoryId: number,
  amount: string,
  currency: string,
  memo: string,
  amountUsd?: string,
) => ({
  account_id: accountId,
  amount,
  amount_usd: amountUsd,
  category_id: categoryId,
  currency,
  memo,
  reconciliation_status: "unreconciled",
  settlement: null,
  source: "manual",
});

const createCurrencyDisplayFixture = async (
  page: Page,
  unique: string,
): Promise<CurrencyDisplayFixture> => {
  const search = `E2E currency display ${unique}`;
  const cryptoCurrency = `C::E2E${unique}`;
  const [expenseCategory, incomeCategory] = await Promise.all([
    createCategory(page, `E2E:CurrencyDisplay:${unique}:Expense`, "expense"),
    createCategory(page, `E2E:CurrencyDisplay:${unique}:Income`, "income"),
  ]);
  const [complexFunding, cryptoFunding, usdFunding, incomeDestination] =
    await Promise.all([
      createAccount(
        page,
        `e2e:currency-display:${unique}:eur-wallet`,
        "owned",
        "EUR",
      ),
      createAccount(
        page,
        `e2e:currency-display:${unique}:crypto-wallet`,
        "owned",
        cryptoCurrency,
      ),
      createAccount(
        page,
        `e2e:currency-display:${unique}:usd-wallet`,
        "owned",
        "USD",
      ),
      createAccount(
        page,
        `e2e:currency-display:${unique}:income-destination`,
        "owned",
        "USD",
      ),
    ]);
  const [merchant, cryptoMerchant, usdMerchant, incomeSource] =
    await Promise.all([
      createAccount(page, `e2e:currency-display:${unique}:merchant`, "flow"),
      createAccount(
        page,
        `e2e:currency-display:${unique}:crypto-merchant`,
        "flow",
      ),
      createAccount(
        page,
        `e2e:currency-display:${unique}:usd-merchant`,
        "flow",
      ),
      createAccount(
        page,
        `e2e:currency-display:${unique}:income-source`,
        "flow",
      ),
    ]);

  const complexMemo = `${search} valued complex`;
  await createTransaction(page, "2026-07-04", [
    balanceRecord(
      complexFunding.account_id,
      "-30.00",
      "EUR",
      complexMemo,
      "-33.00",
    ),
    flowRecord(
      merchant.account_id,
      expenseCategory.category_id,
      "10.00",
      "EUR",
      complexMemo,
      "11.00",
    ),
    flowRecord(
      merchant.account_id,
      expenseCategory.category_id,
      "20.00",
      "EUR",
      complexMemo,
      "22.00",
    ),
  ]);

  const largeUsdMemo = `${search} large USD equivalent`;
  await createTransaction(page, "2026-07-05", [
    balanceRecord(
      complexFunding.account_id,
      "-1.00",
      "EUR",
      largeUsdMemo,
      "-9999999999.99999999",
    ),
    flowRecord(
      merchant.account_id,
      expenseCategory.category_id,
      "1.00",
      "EUR",
      largeUsdMemo,
      "9999999999.99999999",
    ),
  ]);

  const cryptoMemo = `${search} unavailable`;
  await createTransaction(page, "2026-07-03", [
    balanceRecord(
      cryptoFunding.account_id,
      "-12.34",
      cryptoCurrency,
      cryptoMemo,
    ),
    flowRecord(
      cryptoMerchant.account_id,
      expenseCategory.category_id,
      "12.34",
      cryptoCurrency,
      cryptoMemo,
    ),
  ]);

  const usdMemo = `${search} USD native`;
  await createTransaction(page, "2026-07-02", [
    balanceRecord(usdFunding.account_id, "-8.00", "USD", usdMemo, "-8.00"),
    flowRecord(
      usdMerchant.account_id,
      expenseCategory.category_id,
      "8.00",
      "USD",
      usdMemo,
      "8.00",
    ),
  ]);

  const mixedMemo = `${search} mixed parts`;
  await createTransaction(page, "2026-07-01", [
    balanceRecord(usdFunding.account_id, "-5.00", "USD", mixedMemo, "-5.00"),
    flowRecord(
      usdMerchant.account_id,
      expenseCategory.category_id,
      "5.00",
      "USD",
      mixedMemo,
      "5.00",
    ),
    balanceRecord(
      incomeDestination.account_id,
      "100.00",
      "USD",
      mixedMemo,
      "100.00",
    ),
    flowRecord(
      incomeSource.account_id,
      incomeCategory.category_id,
      "-100.00",
      "USD",
      mixedMemo,
      "-100.00",
    ),
  ]);

  return {
    categoryId: expenseCategory.category_id,
    complexFunding,
    complexMemo,
    cryptoMemo,
    largeUsdMemo,
    mixedMemo,
    search,
    usdMemo,
  };
};

const transactionRow = (page: Page, memo: string) =>
  page.locator("[data-transaction-row='true']").filter({ hasText: memo });

test("shared transaction tables switch native and USD amounts without changing transaction meaning", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fixture = await createCurrencyDisplayFixture(page, unique);
  let transactionListRequests = 0;
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      new URL(request.url()).pathname === "/api/transactions"
    ) {
      transactionListRequests += 1;
    }
  });

  await page.setViewportSize({ width: 1445, height: 760 });
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(fixture.search)}`,
  );
  await expect(page.locator("[data-transaction-row='true']")).toHaveCount(5);

  const toggle = page.getByTestId("transaction-amount-display-toggle");
  const complexRow = transactionRow(page, fixture.complexMemo);
  const cryptoRow = transactionRow(page, fixture.cryptoMemo);
  const largeUsdRow = transactionRow(page, fixture.largeUsdMemo);
  const usdRow = transactionRow(page, fixture.usdMemo);
  const mixedRow = transactionRow(page, fixture.mixedMemo);
  const complexAmountCell = complexRow.locator(".transactions-amount-column");
  const cryptoAmountCell = cryptoRow.locator(".transactions-amount-column");
  const largeUsdAmountCell = largeUsdRow.locator(".transactions-amount-column");
  const usdAmountCell = usdRow.locator(".transactions-amount-column");
  const mixedAmountCell = mixedRow.locator(".transactions-amount-column");

  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveAccessibleName("USD display mode");
  await expect(complexAmountCell.getByTestId("amount-chip")).toHaveCount(1);
  await expect(complexAmountCell.getByTestId("amount-chip")).toContainText(
    "-30.00 €",
  );
  await expect(cryptoAmountCell.getByTestId("amount-chip")).toHaveCount(1);
  await expect(usdAmountCell.getByTestId("amount-chip")).toHaveCount(1);
  await expect(mixedAmountCell.getByTestId("amount-chip")).toHaveCount(0);
  await expect(mixedAmountCell.getByTestId("more-parts-indicator")).toHaveText(
    "+",
  );

  const requestsBeforeToggle = transactionListRequests;
  await toggle.focus();
  await toggle.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveAccessibleName("USD display mode");
  await expect(toggle.locator("svg.lucide-dollar-sign")).toHaveCount(1);
  expect(transactionListRequests).toBe(requestsBeforeToggle);
  await expect(complexAmountCell.getByTestId("amount-chip")).toHaveCount(1);
  await expect(complexAmountCell.getByTestId("amount-chip")).toContainText(
    "-33.00 $",
  );
  await expect(largeUsdAmountCell.getByTestId("amount-chip")).toContainText(
    "-10,000,000,000.00 $",
  );
  await expect(cryptoAmountCell.getByTestId("amount-chip")).toHaveCount(0);
  expect(
    await cryptoAmountCell
      .getByTestId("usd-amount-unavailable-chip")
      .ariaSnapshot(),
  ).toContain("text: USD amount unavailable");
  await expect(usdAmountCell.getByTestId("amount-chip")).toHaveCount(1);
  await expect(usdAmountCell.getByTestId("amount-chip")).toContainText(
    "-8.00 $",
  );
  await expect(mixedAmountCell.getByTestId("amount-chip")).toHaveCount(0);
  await expect(
    mixedAmountCell.getByTestId("usd-amount-unavailable-chip"),
  ).toHaveCount(0);
  await expect(mixedAmountCell.getByTestId("more-parts-indicator")).toHaveText(
    "+",
  );

  for (const width of [1445, 1024]) {
    await page.setViewportSize({ width, height: 760 });
    await expect
      .poll(() =>
        page
          .getByTestId("transactions-table-scroll")
          .evaluate((table) => table.scrollWidth <= table.clientWidth + 1),
      )
      .toBe(true);
    await expect(amountChipsFitCell(complexRow)).resolves.toBe(true);
  }
  await expectCollapsedRowActionsKeepAmountVisible(complexRow);

  await page.setViewportSize({ width: 390, height: 760 });
  const largeUsdChip = largeUsdAmountCell.getByTestId("amount-chip");
  await expect(largeUsdChip).toHaveCSS("overflow", "hidden");
  await expect(largeUsdChip.locator(".truncate")).toHaveCSS(
    "text-overflow",
    "ellipsis",
  );
  const unavailableUsdChip = cryptoAmountCell.getByTestId(
    "usd-amount-unavailable-chip",
  );
  await expect(unavailableUsdChip).toHaveCSS("padding-left", "0px");
  await expect(unavailableUsdChip).toHaveCSS("padding-right", "0px");
  await expect(unavailableUsdChip).toHaveCSS("font-size", "12px");
  await expect
    .poll(() =>
      largeUsdAmountCell.evaluate((cell) => {
        const cellRect = cell.getBoundingClientRect();
        const content = Array.from(
          cell.querySelectorAll<HTMLElement>(
            "[data-testid='amount-chip'] > span",
          ),
        );
        return content.every((span) => {
          const spanRect = span.getBoundingClientRect();
          return (
            spanRect.left >= cellRect.left - 0.5 &&
            spanRect.right <= cellRect.right + 0.5
          );
        });
      }),
    )
    .toBe(true);

  await page.setViewportSize({ width: 1024, height: 760 });

  await page.getByRole("button", { name: "Edit mode" }).click();
  await expect(toggle).toHaveCount(0);
  const cryptoAmountInput = page.getByTestId(
    `transaction-${(await cryptoRow.getAttribute("data-transaction-id")) ?? "missing"}-amount-input`,
  );
  await expect(cryptoAmountInput).toHaveValue("12.34");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(
    cryptoAmountCell.getByTestId("usd-amount-unavailable-chip"),
  ).toBeVisible();

  await complexRow.focus();
  await complexRow.press("Enter");
  let panel = page.getByTestId("transaction-detail-panel");
  let pair = panel.getByTestId("transaction-detail-amount-pair").first();
  await expect(pair.getByTestId("amount-chip")).toHaveCount(2);
  await expect(pair.getByTestId("amount-chip").nth(0)).toContainText(
    "-30.00 €",
  );
  await expect(pair.getByTestId("amount-chip").nth(1)).toContainText(
    "-33.00 $",
  );
  await page.getByRole("button", { name: "Close transaction detail" }).click();

  await cryptoRow.focus();
  await cryptoRow.press("Enter");
  panel = page.getByTestId("transaction-detail-panel");
  pair = panel.getByTestId("transaction-detail-amount-pair").first();
  await expect(pair.getByTestId("amount-chip")).toHaveCount(1);
  await expect(
    pair
      .getByTestId("usd-amount-unavailable-chip")
      .locator('[aria-hidden="true"]'),
  ).toHaveText("N/A");
  await page.getByRole("button", { name: "Close transaction detail" }).click();

  await usdRow.focus();
  await usdRow.press("Enter");
  panel = page.getByTestId("transaction-detail-panel");
  pair = panel.getByTestId("transaction-detail-amount-pair").first();
  await expect(pair.getByTestId("amount-chip")).toHaveCount(1);
  await expect(pair.getByTestId("usd-amount-unavailable-chip")).toHaveCount(0);
  await page.getByRole("button", { name: "Close transaction detail" }).click();

  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(transactionListRequests).toBe(requestsBeforeToggle);
  await expect(complexAmountCell.getByTestId("amount-chip")).toContainText(
    "-30.00 €",
  );

  await page.goto(`/categories/${fixture.categoryId}?page=1&pageSize=50`);
  const drilldownToggle = page.getByTestId("transaction-amount-display-toggle");
  const drilldownRow = transactionRow(page, fixture.complexMemo);
  await expect(drilldownToggle).toHaveAttribute("aria-pressed", "false");
  await expect(
    drilldownRow
      .locator(".transactions-amount-column")
      .getByTestId("amount-chip"),
  ).toContainText("-30.00 €");
  await drilldownToggle.click();
  await expect(
    drilldownRow
      .locator(".transactions-amount-column")
      .getByTestId("amount-chip"),
  ).toContainText("-33.00 $");

  const peek = await openAccountTransactionPeek(
    page,
    fixture.complexFunding,
    fixture.complexMemo,
  );
  const peekPair = peek.getByTestId("transaction-detail-amount-pair").first();
  await expect(peekPair.getByTestId("amount-chip")).toHaveCount(1);
  await expect(peekPair.getByTestId("amount-chip")).toContainText("-30.00 €");
  await expect(peekPair.getByTestId("usd-amount-unavailable-chip")).toHaveCount(
    0,
  );
});

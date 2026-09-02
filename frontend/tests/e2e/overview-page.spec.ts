import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
}

interface CategoryFixture {
  readonly category_id: number;
}

interface TransactionFixture {
  readonly display_title: string;
  readonly transaction_id: number;
}

const createAccount = async (
  page: Page,
  fqn: string,
  accountType: "flow" | "owned" | "party",
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency: "USD",
      fqn,
      is_hidden: false,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as AccountFixture;
};

const createCreditLimit = async (
  page: Page,
  account: AccountFixture,
): Promise<void> => {
  const response = await page.request.post(
    `/api/accounts/${account.account_id}/credit-limit-history`,
    {
      data: {
        credit_limit: "4321.00",
        effective_date: "2026-05-01",
      },
    },
  );
  expect(response.ok(), await response.text()).toBe(true);
};

const createCategory = async (
  page: Page,
  fqn: string,
): Promise<CategoryFixture> => {
  const response = await page.request.post("/api/categories", {
    data: {
      economic_intent: "expense",
      fqn,
      is_hidden: false,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as CategoryFixture;
};

const createMultiPartSpend = async (
  page: Page,
  {
    category,
    friendAccount,
    fundingAccount,
    memo,
    merchantAccount,
  }: {
    readonly category: CategoryFixture;
    readonly friendAccount: AccountFixture;
    readonly fundingAccount: AccountFixture;
    readonly memo: string;
    readonly merchantAccount: AccountFixture;
  },
): Promise<TransactionFixture> => {
  const response = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-05-31",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-72.00",
          category_id: null,
          currency: "USD",
          memo,
          reconciliation_status: "unreconciled",
          settlement: { status: "posted" },
          source: "manual",
        },
        {
          account_id: merchantAccount.account_id,
          amount: "54.00",
          category_id: category.category_id,
          currency: "USD",
          memo,
          reconciliation_status: "unreconciled",
          settlement: null,
          source: "manual",
        },
        {
          account_id: friendAccount.account_id,
          amount: "18.00",
          category_id: null,
          currency: "USD",
          memo,
          reconciliation_status: "unreconciled",
          settlement: { status: "posted" },
          source: "manual",
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as TransactionFixture;
};

test("overview changes the household flow report to yearly activity", async ({
  page,
}) => {
  await page.goto("/overview");

  const chart = page.getByTestId("entity-overview-chart");
  const grain = page.getByTestId("flow-grain-select");
  const month = grain.getByRole("button", { exact: true, name: "Month" });
  const year = grain.getByRole("button", { exact: true, name: "Year" });
  await expect(chart).toBeVisible();
  await expect(month).toHaveAttribute("aria-pressed", "true");

  await year.click();

  await expect(year).toHaveAttribute("aria-pressed", "true");
  await expect(chart).toContainText("Yearly activity");
});

test("overview balance opens the account standing", async ({ page }) => {
  const account = await createAccount(
    page,
    "e2e-overview:Chase:Sapphire",
    "owned",
  );
  await createCreditLimit(page, account);

  await page.goto("/overview");

  const balanceGroup = page.getByTestId("overview-balance-group").filter({
    has: page.getByRole("link", { exact: true, name: "e2e-overview" }),
  });
  const balanceRow = balanceGroup.getByTestId("overview-balance-row");
  const accountLink = balanceRow.getByRole("link", {
    exact: true,
    name: "Chase:Sapphire",
  });
  await expect(accountLink).toBeVisible();
  await expect(accountLink).toHaveText("Chase:Sapphire");
  await expect(balanceRow.getByText("Remaining credit")).toBeVisible();
  await expect(balanceRow.getByTestId("amount-chip")).toHaveText("4,321.00 $");

  await accountLink.click();

  await expect(page).toHaveURL(new RegExp(`/accounts/${account.account_id}$`));
  await expect(
    page.getByRole("heading", { exact: true, name: "Chase:Sapphire" }),
  ).toBeVisible();
});

test("overview recent activity opens transaction detail", async ({ page }) => {
  const fundingAccount = await createAccount(
    page,
    "e2e-recent:Everyday:Wallet",
    "owned",
  );
  const merchantAccount = await createAccount(
    page,
    "e2e-recent:Powells:Books",
    "flow",
  );
  const friendAccount = await createAccount(
    page,
    "e2e-recent:Friends:Jordan",
    "party",
  );
  const category = await createCategory(page, "E2E:Overview:Books");
  const memo = "E2E overview recent activity";
  const transaction = await createMultiPartSpend(page, {
    category,
    friendAccount,
    fundingAccount,
    memo,
    merchantAccount,
  });

  await page.goto("/overview");

  const recentLink = page
    .getByTestId("overview-recent-activity-link")
    .filter({ hasText: memo });
  await expect(
    recentLink.getByText(transaction.display_title, { exact: true }),
  ).toBeVisible();
  await expect(recentLink.getByText(memo, { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 480, height: 844 });
  await expect(recentLink).toBeVisible();
  await expect(recentLink.getByTestId("amount-chip")).toHaveText("-54.00 $");
  await expect(recentLink.getByTestId("more-parts-indicator")).toHaveText("+");
  await expect(
    recentLink.evaluate((row) => row.scrollWidth <= row.clientWidth),
  ).resolves.toBe(true);

  await recentLink.click();

  await expect(page).toHaveURL(
    new RegExp(`/transactions\\?transaction=${transaction.transaction_id}$`),
  );
  const detail = page.getByRole("dialog", { name: transaction.display_title });
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole("heading", {
      exact: true,
      name: transaction.display_title,
    }),
  ).toBeVisible();
  await expect(
    detail.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(memo);
});

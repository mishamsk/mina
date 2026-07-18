import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface BalanceFixture {
  readonly account_id: number;
  readonly credit_limit?: string;
  readonly currency: string;
  readonly current_balance: string;
  readonly current_balance_usd: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly fqn: string;
}

interface TransactionFixture {
  readonly display_title: string;
  readonly transaction_id: number;
}

const decimalScale = 8;
const decimalFactor = 10n ** BigInt(decimalScale);

const fixedBrowserDateScript = `
{
  const fixedNow = new Date("2026-05-31T12:00:00-04:00").valueOf();
  const RealDate = Date;
  Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [fixedNow] : args));
    }
    static now() {
      return fixedNow;
    }
  };
}
`;

const listFixtures = async <T>(
  page: Page,
  path: string,
  collectionKey: string,
): Promise<readonly T[]> => {
  const response = await page.request.get(
    `${path}?limit=500&offset=0&sort=fqn&sort_dir=asc`,
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as Record<string, readonly T[]>;
  return body[collectionKey] ?? [];
};

const findByFqn = <T extends { readonly fqn: string }>(
  fixtures: readonly T[],
  fqn: string,
): T => {
  const fixture = fixtures.find((item) => item.fqn === fqn);
  expect(fixture, `${fqn} fixture`).toBeDefined();
  return fixture as T;
};

const decimalUnits = (value: string): bigint => {
  const negative = value.startsWith("-");
  const absolute = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = absolute.split(".");
  const normalizedFraction = fraction.padEnd(decimalScale, "0").slice(0, 8);
  const units =
    BigInt(whole || "0") * decimalFactor + BigInt(normalizedFraction);
  return negative ? -units : units;
};

const decimalString = (units: bigint): string => {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / decimalFactor;
  const fraction = (absolute % decimalFactor)
    .toString()
    .padStart(decimalScale, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
};

const addDecimalStrings = (values: readonly string[]): string =>
  decimalString(values.reduce((sum, value) => sum + decimalUnits(value), 0n));

const formatDecimalAmount = (value: string): string => {
  const negative = value.startsWith("-");
  const absolute = negative ? value.slice(1) : value;
  const [whole = "0", rawFraction = ""] = absolute.split(".");
  const fraction = rawFraction.padEnd(8, "0").slice(0, 8);
  const mantissa = BigInt(`${whole}${fraction}`);
  const rounded = (mantissa + 500000n) / 1000000n;
  const raw = rounded.toString().padStart(3, "0");
  const formattedWhole = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(Number(raw.slice(0, -2) || "0"));
  return `${negative ? "-" : ""}${formattedWhole}.${raw.slice(-2)}`;
};

const formatUsdMarkerAmount = (value: string): string =>
  `${formatDecimalAmount(value)} $`;

const createCurrentMonthFixtures = async (
  page: Page,
): Promise<TransactionFixture> => {
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const wallet = findByFqn(accounts, "cash:Wallet");
  const books = findByFqn(accounts, "merchant:Books");
  const joint = findByFqn(accounts, "checking:Chase:Joint");
  const payroll = findByFqn(accounts, "income:AcmePayroll");
  const booksCategory = findByFqn(categories, "Entertainment:Books");
  const salaryCategory = findByFqn(categories, "Income:Salary");

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "91.23",
      category_id: booksCategory.category_id,
      counterparty_account_id: books.account_id,
      currency: "USD",
      funding_account_id: wallet.account_id,
      initiated_date: "2026-05-31",
      memo: "E2E overview recent activity",
    },
  });
  expect(spendResponse.ok()).toBe(true);

  const incomeResponse = await page.request.post("/api/transactions/income", {
    data: {
      amount: "123.45",
      category_id: salaryCategory.category_id,
      currency: "USD",
      destination_account_id: joint.account_id,
      initiated_date: "2026-05-31",
      memo: "E2E overview month income",
      source_account_id: payroll.account_id,
    },
  });
  expect(incomeResponse.ok()).toBe(true);

  return (await spendResponse.json()) as TransactionFixture;
};

const getBalances = async (page: Page): Promise<readonly BalanceFixture[]> => {
  const response = await page.request.get("/api/accounts/balances");
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    readonly balances: readonly BalanceFixture[];
  };
  return body.balances;
};

test("overview landing page renders grouped balances, pulse, and recent activity", async ({
  page,
}) => {
  await page.addInitScript(fixedBrowserDateScript);
  const transaction = await createCurrentMonthFixtures(page);
  const balances = await getBalances(page);
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const sapphire = findByFqn(accounts, "credit_card:Chase:Sapphire");
  const sapphireBalance = balances.find(
    (balance) => balance.account_id === sapphire.account_id,
  );
  expect(sapphireBalance?.credit_limit).toBeDefined();
  const remainingCredit = addDecimalStrings([
    sapphireBalance?.credit_limit ?? "0",
    sapphireBalance?.current_balance ?? "0",
  ]);

  await page.goto("/");

  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const overviewNavLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Overview" });
  await expect(overviewNavLink).toHaveAttribute("aria-current", "page");

  const creditGroup = page
    .getByTestId("overview-balance-group")
    .filter({ hasText: "credit_card" });
  await expect(creditGroup).toBeVisible();
  await expect(creditGroup.getByTestId("approximate-usd-amount")).toContainText(
    "≈",
  );
  await expect(creditGroup.getByTestId("approximate-usd-amount")).toContainText(
    "USD",
  );
  const creditRows = creditGroup.getByTestId("overview-balance-row");
  await expect(creditRows.first()).toContainText("Sapphire");
  await expect(creditRows.nth(1)).toContainText("BlueCash");
  await expect(creditRows.first()).toContainText("Remaining credit");
  await expect(creditRows.first()).toContainText(
    formatUsdMarkerAmount(remainingCredit),
  );

  const spendTile = page
    .getByTestId("overview-pulse-tile")
    .filter({ hasText: "Spend" });
  const incomeTile = page
    .getByTestId("overview-pulse-tile")
    .filter({ hasText: "Income" });
  await expect(spendTile.getByTestId("approximate-usd-amount")).toContainText(
    "≈",
  );
  await expect(spendTile.getByTestId("approximate-usd-amount")).toContainText(
    "USD",
  );
  await expect(incomeTile.getByTestId("approximate-usd-amount")).toContainText(
    "≈",
  );
  await expect(incomeTile.getByTestId("approximate-usd-amount")).toContainText(
    "USD",
  );

  const recentLink = page
    .getByTestId("overview-recent-activity-link")
    .filter({ hasText: "E2E overview recent activity" })
    .first();
  await expect(recentLink).toBeVisible();
  await expect(recentLink).toHaveAttribute(
    "href",
    `/transactions?transaction=${transaction.transaction_id}`,
  );
  await recentLink.click();
  await expect(page).toHaveURL(
    new RegExp(`/transactions\\?transaction=${transaction.transaction_id}$`),
  );
  const detailPanel = page.getByRole("dialog", {
    name: transaction.display_title,
  });
  await expect(detailPanel).toBeVisible();
  await expect(
    detailPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText("E2E overview recent activity");
  await detailPanel
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await expect(detailPanel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions$/);

  await page.goto("/status");
  await overviewNavLink.click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(overviewNavLink).toHaveAttribute("aria-current", "page");
});

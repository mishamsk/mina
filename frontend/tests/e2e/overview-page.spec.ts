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
  const books = findByFqn(accounts, "merchant:PowellsBooks");
  const joint = findByFqn(accounts, "bank:Chase:joint_checking");
  const payroll = findByFqn(accounts, "employers:Acme:salary");
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
  const sapphire = findByFqn(accounts, "bank:Chase:Sapphire");
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

  const bankGroup = page
    .getByTestId("overview-balance-group")
    .filter({ hasText: "bank" });
  await expect(bankGroup).toBeVisible();
  await expect(bankGroup.getByTestId("approximate-usd-amount")).toContainText(
    "≈",
  );
  await expect(bankGroup.getByTestId("approximate-usd-amount")).toContainText(
    "USD",
  );
  const sapphireRow = bankGroup
    .getByTestId("overview-balance-row")
    .filter({ hasText: "Sapphire" });
  const blueCashRow = bankGroup
    .getByTestId("overview-balance-row")
    .filter({ hasText: "BlueCash" });
  await expect(sapphireRow).toContainText("Remaining credit");
  await expect(sapphireRow).toContainText(
    formatUsdMarkerAmount(remainingCredit),
  );
  await expect(blueCashRow).toBeVisible();

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

test("overview keeps multi-part activity rows single-height", async ({
  page,
}) => {
  await page.addInitScript(fixedBrowserDateScript);
  await page.setViewportSize({ width: 590, height: 720 });
  await createCurrentMonthFixtures(page);
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const wallet = findByFqn(accounts, "cash:Wallet");
  const books = findByFqn(accounts, "merchant:PowellsBooks");
  const friend = findByFqn(accounts, "person:Friend:Jordan");
  const booksCategory = findByFqn(categories, "Entertainment:Books");
  const mixedMemo = "E2E overview multi-part activity";
  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-05-31",
      records: [
        {
          account_id: wallet.account_id,
          amount: "-72.00",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: books.account_id,
          amount: "54.00",
          category_id: booksCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: friend.account_id,
          amount: "18.00",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
        },
      ],
    },
  });
  expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);

  await page.goto("/overview");
  const simpleRow = page
    .getByTestId("overview-recent-activity-link")
    .filter({ hasText: "E2E overview recent activity" })
    .first();
  const mixedRow = page
    .getByTestId("overview-recent-activity-link")
    .filter({ hasText: mixedMemo });
  await expect(simpleRow).toBeVisible();
  await expect(mixedRow).toBeVisible();
  await expect(mixedRow.getByTestId("amount-chip")).toHaveText("-54.00 $");
  await expect(mixedRow.getByTestId("more-parts-indicator")).toBeVisible();
  await expect(mixedRow.getByTestId("more-parts-indicator")).toHaveText("+");
  expect(
    await mixedRow
      .getByTestId("more-parts-indicator")
      .evaluate((indicator) => indicator.tabIndex),
  ).toBe(-1);
  await expect(mixedRow).toHaveAccessibleName(
    /More transaction parts\. All parts: -54\.00 \$, -18\.00 \$/,
  );
  await expect(
    mixedRow.evaluate((row) => row.scrollWidth <= row.clientWidth),
  ).resolves.toBe(true);
  await mixedRow.hover({ position: { x: 1, y: 1 } });
  await expect(page.getByRole("tooltip")).toContainText(
    "All parts -54.00 $, -18.00 $",
  );

  const [simpleHeight, mixedHeight] = await Promise.all([
    simpleRow.evaluate((row) => row.getBoundingClientRect().height),
    mixedRow.evaluate((row) => row.getBoundingClientRect().height),
  ]);
  expect(Math.abs(simpleHeight - mixedHeight)).toBeLessThanOrEqual(1);
});

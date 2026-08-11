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
  readonly remaining_credit?: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly fqn: string;
}

interface TransactionFixture {
  readonly display_title: string;
  readonly transaction_id: number;
}

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
  expect(sapphireBalance?.remaining_credit).toBeDefined();

  await page.goto("/");

  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const overviewNavLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Overview" });
  await expect(overviewNavLink).toHaveAttribute("aria-current", "page");

  const flowReport = page.getByTestId("overview-flow-report");
  const flowChart = flowReport.getByTestId("entity-overview-chart");
  const flowBreakdown = flowReport.getByTestId("entity-overview-breakdown");
  const flowTopLine = flowReport.getByTestId("entity-overview-top-line");
  await expect(flowTopLine).toBeVisible();
  await expect(flowTopLine.locator("dt")).toHaveText([
    /This month/,
    "3-month average",
    "Month over month",
    "Year over year",
  ]);
  await expect(flowChart).toBeVisible();
  await expect(flowBreakdown).toBeVisible();
  await expect(flowChart).toContainText("bars show net flow");
  await expect(flowChart.locator(".recharts-line-curve")).toHaveCount(1);
  await expect(flowChart.locator(".recharts-line-curve")).toHaveAttribute(
    "stroke-dasharray",
    "8 4",
  );
  await expect(page.getByTestId("entity-overview-overlay-select")).toHaveCount(
    0,
  );
  const paintedSeries = flowChart.locator(
    ".recharts-bar-rectangle, .recharts-line-curve",
  );
  await expect(paintedSeries.last()).toHaveClass(/recharts-line-curve/);
  await flowChart.locator(".recharts-bar-rectangle").last().hover();
  const flowTotals = page.getByTestId("flow-chart-totals");
  await expect(page.getByTestId("flow-chart-metric")).toContainText(
    "Rolling 3-period average",
  );
  await expect(flowTotals.getByText("Total inflow")).toBeVisible();
  await expect(flowTotals.getByText("Total outflow")).toBeVisible();
  const tooltipText =
    (await page.getByTestId("flow-chart-tooltip").textContent()) ?? "";
  expect(tooltipText.indexOf("· Inflow")).toBeLessThan(
    tooltipText.indexOf("· Outflow"),
  );

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
    formatUsdMarkerAmount(sapphireBalance?.remaining_credit ?? "0"),
  );
  await expect(sapphireRow.getByTestId("amount-chip")).toHaveText(
    formatUsdMarkerAmount(sapphireBalance?.remaining_credit ?? "0"),
  );
  await expect(blueCashRow).toBeVisible();
  const flowReportBox = await flowReport.boundingBox();
  const balancesBox = await page
    .getByRole("heading", { name: "Balances" })
    .boundingBox();
  expect(flowReportBox?.y).toBeLessThan(balancesBox?.y ?? 0);

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

  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/overview");
  const narrowChartBox = await flowChart.boundingBox();
  const narrowBreakdownBox = await flowBreakdown.boundingBox();
  expect(narrowChartBox?.y).toBeLessThan(narrowBreakdownBox?.y ?? 0);
});

test("overview flow controls form an inline anchored control deck and retain the last report on failure", async ({
  page,
}) => {
  const historyRangeResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/accounting-history/range",
  );
  await page.goto("/overview");
  expect((await historyRangeResponse).ok()).toBe(true);
  const chart = page.getByTestId("entity-overview-chart");
  const grain = page.getByTestId("flow-grain-select");
  const breakdown = page.getByTestId("flow-breakdown-select");
  const trend = chart.getByTestId("flow-trend-select");
  const windowSlider = chart.getByTestId("flow-range-slider");

  await expect(chart).toBeVisible();
  await expect(grain.getByRole("button", { name: "Month" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(windowSlider.getByRole("slider")).toHaveCount(2);
  await expect(page.getByTestId("flow-named-series-count")).toContainText("5");
  await expect(
    page.getByRole("button", { name: "Show fewer named series" }),
  ).toBeDisabled();
  await expect(trend).toContainText("Rolling average");

  const yearResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/overview/flow" &&
      url.searchParams.get("grain") === "year"
    );
  });
  await grain.getByRole("button", { name: "Year" }).click();
  const yearURL = new URL((await yearResponse).url());
  expect(yearURL.searchParams.get("period_count")).toBe("6");
  expect(yearURL.searchParams.get("trend")).toBe("rolling_sum");
  expect(yearURL.searchParams.has("anchor_date")).toBe(true);
  expect(yearURL.searchParams.has("entire_history")).toBe(false);
  await expect(chart).toContainText("Yearly activity");
  await expect(trend).toContainText("Rolling sum");

  const seriesResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/overview/flow" &&
      url.searchParams.get("named_series_count") === "6"
    );
  });
  await page.getByRole("button", { name: "Show more named series" }).click();
  await seriesResponse;
  await expect(page.getByTestId("flow-named-series-count")).toContainText("6");

  const contributor = page
    .getByTestId("entity-overview-breakdown")
    .getByRole("checkbox")
    .first();
  const filterResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/overview/flow" &&
      url.searchParams.has("excluded_contributor_id")
    );
  });
  await contributor.click();
  await filterResponse;
  await expect(contributor).not.toBeChecked();
  await expect(page.getByText(/contributors included/)).toBeVisible();

  const anchoredResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/overview/flow" &&
      url.searchParams.get("anchor_date") === "2025-01-01" &&
      url.searchParams.get("period_count") === "5"
    );
  });
  await windowSlider
    .getByRole("slider", { name: "Final visible period" })
    .press("ArrowLeft");
  await anchoredResponse;
  await expect(chart).toContainText("2021 – 2025 · 5 yr");

  await page.route("**/api/overview/flow?**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: "unavailable",
          message: "Configured report unavailable.",
        },
      }),
      contentType: "application/json",
      status: 503,
    });
  });
  await breakdown.getByRole("button", { name: "Accounts" }).click();
  await expect(page.getByTestId("flow-report-error")).toContainText(
    "Configured report unavailable.",
  );
  await expect(
    breakdown.getByRole("button", { name: "Categories" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("2021 – 2025 · 5 yr");
});

test("rapid contributor changes retain every pending selection", async ({
  page,
}) => {
  await page.goto("/overview");
  const contributors = page
    .getByTestId("entity-overview-breakdown")
    .getByRole("checkbox");
  await expect(contributors.nth(1)).toBeChecked();
  const visualization = page.getByTestId("flow-report-visualization");
  const chartTop = (
    await page.getByTestId("entity-overview-chart").boundingBox()
  )?.y;

  let releaseFirst = (): void => {};
  const firstReleased = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let markFirstReady = (): void => {};
  const firstReady = new Promise<void>((resolve) => {
    markFirstReady = resolve;
  });
  let markFirstDelivered = (): void => {};
  const firstDelivered = new Promise<void>((resolve) => {
    markFirstDelivered = resolve;
  });
  let markSecondDelivered = (): void => {};
  const secondDelivered = new Promise<void>((resolve) => {
    markSecondDelivered = resolve;
  });
  const requestURLs: URL[] = [];
  await page.route("**/api/overview/flow?**", async (route) => {
    const requestNumber = requestURLs.push(new URL(route.request().url()));
    const response = await route.fetch();
    if (requestNumber === 1) {
      markFirstReady();
      await firstReleased;
    }
    await route.fulfill({ response });
    if (requestNumber === 1) markFirstDelivered();
    if (requestNumber === 2) markSecondDelivered();
  });

  await contributors.nth(0).click();
  await firstReady;
  await expect(visualization.getByRole("status")).toHaveText(
    "Updating report…",
  );
  expect(
    (await page.getByTestId("entity-overview-chart").boundingBox())?.y,
  ).toBe(chartTop);
  await contributors.nth(1).click();
  await secondDelivered;
  expect(
    requestURLs[1]?.searchParams.getAll("excluded_contributor_id"),
  ).toHaveLength(2);
  await expect(contributors.nth(0)).not.toBeChecked();
  await expect(contributors.nth(1)).not.toBeChecked();

  releaseFirst();
  await firstDelivered;
  await expect(contributors.nth(0)).not.toBeChecked();
  await expect(contributors.nth(1)).not.toBeChecked();
});

test("structural report refresh disables the previous contributor universe", async ({
  page,
}) => {
  await page.goto("/overview");
  const contributors = page
    .getByTestId("entity-overview-breakdown")
    .getByRole("checkbox");
  await expect(contributors.first()).toBeEnabled();

  let releaseRequest = (): void => {};
  const requestReleased = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let markRequestReady = (): void => {};
  const requestReady = new Promise<void>((resolve) => {
    markRequestReady = resolve;
  });
  await page.route("**/api/overview/flow?**", async (route) => {
    const response = await route.fetch();
    markRequestReady();
    await requestReleased;
    await route.fulfill({ response });
  });

  await page
    .getByTestId("flow-breakdown-select")
    .getByRole("button", { name: "Accounts" })
    .click();
  await requestReady;
  await expect(contributors.first()).toBeDisabled();
  await expect(page.getByTestId("flow-contributors-all")).toBeDisabled();
  await expect(page.getByTestId("flow-contributors-none")).toBeDisabled();

  releaseRequest();
  await expect(contributors.first()).toBeEnabled();
});

test("overview keeps loaded sections when household flow fails and retries", async ({
  page,
}) => {
  await page.route("**/api/overview/flow", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        code: "internal_error",
        message: "chart unavailable",
      }),
      contentType: "application/json",
      status: 500,
    });
  });

  await page.goto("/overview");
  await expect(
    page.getByText("Household flow could not be refreshed."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Balances" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent activity" }),
  ).toBeVisible();

  await page.unroute("**/api/overview/flow");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("entity-overview-chart")).toBeVisible();
  await expect(
    page.getByText("Household flow could not be refreshed."),
  ).toHaveCount(0);
});

test("overview retains a delayed household flow result after navigation", async ({
  page,
}) => {
  let releaseFlow = (): void => {};
  const flowReleased = new Promise<void>((resolve) => {
    releaseFlow = resolve;
  });
  let markFlowReady = (): void => {};
  const flowReady = new Promise<void>((resolve) => {
    markFlowReady = resolve;
  });
  let markFlowDelivered = (): void => {};
  const flowDelivered = new Promise<void>((resolve) => {
    markFlowDelivered = resolve;
  });
  await page.route("**/api/overview/flow", async (route) => {
    const response = await route.fetch();
    markFlowReady();
    await flowReleased;
    await route.fulfill({ response });
    markFlowDelivered();
  });

  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Balances" })).toBeVisible();
  await flowReady;
  const balancesTopWhileLoading = (
    await page.getByRole("heading", { name: "Balances" }).boundingBox()
  )?.y;
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  releaseFlow();
  await flowDelivered;
  await page.getByRole("link", { exact: true, name: "Overview" }).click();
  await expect(page.getByTestId("entity-overview-chart")).toBeVisible();
  await expect(page.getByLabel("Loading household flow report")).toHaveCount(0);
  const balancesTopAfterLoad = (
    await page.getByRole("heading", { name: "Balances" }).boundingBox()
  )?.y;
  expect(balancesTopAfterLoad).toBeCloseTo(balancesTopWhileLoading ?? 0, 0);
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
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: books.account_id,
          amount: "54.00",
          category_id: booksCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: friend.account_id,
          amount: "18.00",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          settlement: { status: "posted" },
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

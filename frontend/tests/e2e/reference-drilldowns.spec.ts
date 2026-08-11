import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
  readonly display_label: string;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly economic_intent: "expense" | "income";
  readonly fqn: string;
  readonly name: string;
}

interface MemberFixture {
  readonly member_id: number;
  readonly name: string;
}

interface TagFixture {
  readonly fqn: string;
  readonly name: string;
  readonly tag_id: number;
}

interface TransactionFixture {
  readonly display_title: string;
  readonly transaction_id: number;
}

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

const createCategory = async (
  page: Page,
  fqn: string,
): Promise<CategoryFixture> => {
  const response = await page.request.post("/api/categories", {
    data: { economic_intent: "expense", fqn },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as CategoryFixture;
};

const createAccount = async (
  page: Page,
  fqn: string,
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: "owned",
      currency: "USD",
      fqn,
      is_hidden: false,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as AccountFixture;
};

const createTag = async (page: Page, fqn: string): Promise<TagFixture> => {
  const response = await page.request.post("/api/tags", { data: { fqn } });
  expect(response.ok()).toBe(true);
  return (await response.json()) as TagFixture;
};

const createMember = async (
  page: Page,
  name: string,
): Promise<MemberFixture> => {
  const response = await page.request.post("/api/members", { data: { name } });
  expect(response.ok()).toBe(true);
  return (await response.json()) as MemberFixture;
};

const localToday = (): string => {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
};

const createSpend = async (
  page: Page,
  {
    category,
    initiatedDate = localToday(),
    member,
    memo,
    tag,
    tags,
  }: {
    readonly category: CategoryFixture;
    readonly initiatedDate?: string;
    readonly member?: MemberFixture;
    readonly memo: string;
    readonly tag?: TagFixture;
    readonly tags?: readonly TagFixture[];
  },
): Promise<TransactionFixture> => {
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const response = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: initiatedDate,
      member_id: member?.member_id,
      memo,
      tag_ids:
        tags?.map((item) => item.tag_id) ?? (tag ? [tag.tag_id] : undefined),
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as TransactionFixture;
};

const expectReferenceRowActivation = async (
  page: Page,
  {
    destination,
    destinationReady,
    row,
    sourcePath,
  }: {
    readonly destination: RegExp | string;
    readonly destinationReady: Locator;
    readonly row: Locator;
    readonly sourcePath: string;
  },
): Promise<void> => {
  const expectDestinationReady = async () => {
    await expect(destinationReady).toBeVisible();
    await expect(page.getByTestId("featured-balance-skeleton")).toHaveCount(0);
    await expect(
      page.getByText("Featured balances could not be loaded.", {
        exact: true,
      }),
    ).toHaveCount(0);
  };

  await page.goto(sourcePath);
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(destination);
  await expectDestinationReady();

  await page.goto(sourcePath);
  await expect(row).toBeVisible();
  await row.focus();
  await expect(row).toBeFocused();
  await row.press("Enter");
  await expect(page).toHaveURL(destination);
  await expectDestinationReady();

  await page.goto(sourcePath);
  await expect(row).toBeVisible();
  await row.focus();
  await expect(row).toBeFocused();
  await row.press("Space");
  await expect(page).toHaveURL(destination);
  await expectDestinationReady();
};

const expectMutedCurrencyMarker = async (marker: Locator): Promise<void> => {
  await expect(marker).toBeVisible();
  const colors = await marker.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--muted-foreground)";
    document.body.append(probe);
    const result = {
      actual: getComputedStyle(element).color,
      expected: getComputedStyle(probe).color,
    };
    probe.remove();
    return result;
  });
  expect(colors.actual).toBe(colors.expected);
};

test("reference rows activate leaf and group destinations", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const accountPrefix = `E2ERowAccount:${unique}`;
  const categoryPrefix = `E2ERowCategory:${unique}`;
  const tagPrefix = `E2ERowTag:${unique}`;
  const account = await createAccount(page, `${accountPrefix}:Leaf`);
  const category = await createCategory(page, `${categoryPrefix}:Leaf`);
  const tag = await createTag(page, `${tagPrefix}:Leaf`);
  const member = await createMember(page, `E2E Row Route ${unique}`);

  await expectReferenceRowActivation(page, {
    destination: new RegExp(`/accounts/${account.account_id}$`),
    destinationReady: page.getByText("No records", { exact: true }),
    row: page.getByLabel(`Open account ${account.fqn}`, { exact: true }),
    sourcePath: `/accounts?q=${encodeURIComponent(account.fqn)}`,
  });
  await expectReferenceRowActivation(page, {
    destination: `/accounts/group?prefix=${encodeURIComponent(accountPrefix)}`,
    destinationReady: page.getByText("No records", { exact: true }),
    row: page.getByLabel(`Open account group ${accountPrefix}`, {
      exact: true,
    }),
    sourcePath: `/accounts?q=${encodeURIComponent(account.fqn)}`,
  });
  await expectReferenceRowActivation(page, {
    destination: new RegExp(`/categories/${category.category_id}$`),
    destinationReady: page.getByTestId("entity-overview-top-line"),
    row: page.getByLabel(`Open category ${category.fqn}`, { exact: true }),
    sourcePath: `/categories?q=${encodeURIComponent(category.fqn)}`,
  });
  await expectReferenceRowActivation(page, {
    destination: `/categories/group?prefix=${encodeURIComponent(categoryPrefix)}`,
    destinationReady: page.getByTestId("entity-overview-top-line"),
    row: page.getByLabel(`Open category ${categoryPrefix}`, { exact: true }),
    sourcePath: `/categories?q=${encodeURIComponent(category.fqn)}`,
  });
  await expectReferenceRowActivation(page, {
    destination: new RegExp(`/tags/${tag.tag_id}$`),
    destinationReady: page.getByTestId("entity-overview-top-line"),
    row: page.getByLabel(`Open tag ${tag.fqn}`, { exact: true }),
    sourcePath: `/tags?q=${encodeURIComponent(tag.fqn)}`,
  });
  await expectReferenceRowActivation(page, {
    destination: `/tags/group?prefix=${encodeURIComponent(tagPrefix)}`,
    destinationReady: page.getByTestId("entity-overview-top-line"),
    row: page.getByLabel(`Open tag ${tagPrefix}`, { exact: true }),
    sourcePath: `/tags?q=${encodeURIComponent(tag.fqn)}`,
  });
  await expectReferenceRowActivation(page, {
    destination: new RegExp(`/members/${member.member_id}$`),
    destinationReady: page.getByRole("heading", {
      level: 2,
      name: "No transactions",
    }),
    row: page.getByLabel(`Open member ${member.name}`, { exact: true }),
    sourcePath: `/members?q=${encodeURIComponent(member.name)}`,
  });
});

test("unknown category and tag overview links retain not-found guidance", async ({
  page,
}) => {
  for (const route of [
    {
      backLabel: "Back to categories",
      heading: "Category not found",
      path: "/categories/999999999",
    },
    {
      backLabel: "Back to categories",
      heading: "Category not found",
      path: "/categories/group?prefix=E2EUnknownCategory",
    },
    {
      backLabel: "Back to tags",
      heading: "Tag not found",
      path: "/tags/999999999",
    },
    {
      backLabel: "Back to tags",
      heading: "Tag not found",
      path: "/tags/group?prefix=E2EUnknownTag",
    },
  ]) {
    await page.goto(route.path);
    await expect(
      page.getByRole("heading", { name: route.heading }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: route.backLabel }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  }
});

test("category leaf overview renders net bars and a fixed line while preview detail remains interactive", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const category = await createCategory(page, `E2EOverview:${unique}`);
  const memo = `E2E overview preview ${unique}`;
  const transaction = await createSpend(page, { category, memo });

  const response = page.waitForResponse(
    (candidate) =>
      candidate
        .url()
        .includes(`/api/categories/${category.category_id}/overview`) &&
      candidate.ok(),
  );
  await page.goto(`/categories/${category.category_id}`);
  await response;

  await expect(page.getByTestId("entity-overview-top-line")).toBeVisible();
  const chart = page.getByTestId("entity-overview-chart");
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("bars show net spend");
  await expect(chart.locator(".recharts-line-curve")).toHaveCount(1);
  await expect(page.getByTestId("entity-overview-overlay-select")).toHaveCount(
    0,
  );
  const breakdown = page.getByTestId("entity-overview-breakdown");
  await expect(
    page.getByText(
      "Categories is unavailable because this page already fixes one category.",
    ),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("flow-breakdown-select")
      .getByRole("button", { name: "Categories" }),
  ).toBeDisabled();
  await expect(
    page.getByTestId("entity-overview-top-line").locator("dd").first(),
  ).toHaveText("≈ 12.34 USD");
  await expectMutedCurrencyMarker(
    page
      .getByTestId("entity-overview-top-line")
      .locator("dd")
      .first()
      .getByText("USD", { exact: true }),
  );
  const seriesToggle = breakdown.getByRole("checkbox").first();
  await expect(seriesToggle).toBeChecked();
  const filteredResponse = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return (
      url.pathname === `/api/categories/${category.category_id}/overview` &&
      url.searchParams.has("excluded_contributor_id") &&
      candidate.ok()
    );
  });
  await seriesToggle.click();
  const filteredDataset = (await filteredResponse).json() as Promise<{
    readonly dataset: {
      readonly configuration: {
        readonly excluded_contributor_ids: readonly string[];
      };
      readonly periods: readonly {
        readonly bar_group_totals: readonly {
          readonly amount_usd: string;
        }[];
        readonly trend: { readonly amount_usd: string };
      }[];
    };
  }>;
  const filteredReport = (await filteredDataset).dataset;
  expect(filteredReport.configuration.excluded_contributor_ids).toHaveLength(1);
  expect(filteredReport.periods.at(-1)?.bar_group_totals[0]?.amount_usd).toBe(
    "0.00000000",
  );
  expect(filteredReport.periods.at(-1)?.trend.amount_usd).toBe("0.00000000");
  await expect(seriesToggle).not.toBeChecked();
  await expect(
    page.getByTestId("entity-overview-top-line").locator("dd").first(),
  ).toHaveText("≈ 12.34 USD");
  await chart.locator(".recharts-line-dot").last().hover();
  const chartTooltip = page.getByTestId("flow-chart-tooltip");
  await expect(chartTooltip).toBeVisible();
  await expect(chartTooltip).toHaveAttribute("aria-live", "polite");
  await expect(chartTooltip).toHaveAttribute("role", "status");
  await expect(chartTooltip.getByText("Net total")).toBeVisible();
  await expect(
    chartTooltip
      .getByTestId("flow-chart-totals")
      .getByText("≈ 0.00 USD", { exact: true }),
  ).toBeVisible();
  await expect(
    chartTooltip.getByText("Rolling 3-period average", { exact: true }),
  ).toBeVisible();
  const tooltipTreatment = await chartTooltip.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--border-ink)";
    probe.style.color = "var(--frame-foreground)";
    probe.style.fontFamily = "var(--font-mono)";
    document.body.append(probe);
    const expected = getComputedStyle(probe);
    const actual = getComputedStyle(element);
    const currencyMarker = element.querySelector(".text-muted-foreground");
    const result = {
      background: actual.backgroundColor,
      borderWidth: actual.borderWidth,
      borderRadius: actual.borderRadius,
      color: actual.color,
      expectedBackground: expected.backgroundColor,
      expectedColor: expected.color,
      expectedFontFamily: expected.fontFamily,
      fontFamily: actual.fontFamily,
      hasVisibleShadow: [...actual.boxShadow.matchAll(/rgba?\([^)]+\)/g)].some(
        ([color]) => color !== "rgba(0, 0, 0, 0)",
      ),
      nestedColor: currencyMarker
        ? getComputedStyle(currencyMarker).color
        : undefined,
    };
    probe.remove();
    return result;
  });
  expect(tooltipTreatment.background).toBe(tooltipTreatment.expectedBackground);
  expect(tooltipTreatment.color).toBe(tooltipTreatment.expectedColor);
  expect(tooltipTreatment.nestedColor).toBe(tooltipTreatment.expectedColor);
  expect(tooltipTreatment.fontFamily).toBe(tooltipTreatment.expectedFontFamily);
  expect(tooltipTreatment.borderWidth).toBe("0px");
  expect(tooltipTreatment.borderRadius).toBe("0px");
  expect(tooltipTreatment.hasVisibleShadow).toBe(false);
  await seriesToggle.click();
  await expect(seriesToggle).toBeChecked();

  const preview = page.getByTestId("entity-overview-transactions");
  const previewHeading = preview.getByRole("heading", {
    name: "Recent transactions",
  });
  await expect(previewHeading).toBeVisible();
  expect(
    await previewHeading.evaluate((element) => getComputedStyle(element).color),
  ).toBe(
    await previewHeading.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--frame-foreground)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }),
  );
  await expect(
    preview.getByTestId("transactions-pagination-footer"),
  ).toHaveCount(0);
  await expect(
    preview.locator("[data-transaction-row='true']").filter({ hasText: memo }),
  ).toBeVisible();
  await expect
    .poll(() =>
      preview
        .getByTestId("transactions-table-scroll")
        .evaluate((element) => getComputedStyle(element).overflowY),
    )
    .toBe("visible");

  const row = preview
    .locator("[data-transaction-row='true']")
    .filter({ hasText: memo });
  await row.focus();
  await row.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`transaction=${transaction.transaction_id}`),
  );
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail).toBeVisible();
  await expect(detail.getByText("Journal records")).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Delete", exact: true }),
  ).toHaveCount(0);
  await expect(
    detail.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "Post" })).toHaveCount(0);
  await detail
    .getByRole("button", { name: "Close transaction detail" })
    .click();

  const transactionsLink = preview.getByRole("link", { name: "Transactions" });
  const href = await transactionsLink.getAttribute("href");
  expect(
    new URL(href ?? "", "http://mina.test").searchParams.getAll("category"),
  ).toEqual([String(category.category_id)]);
});

test("tag group overview uses exact prefix links and stacks chart before breakdown on small screens", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const tagPrefix = `E2EGroupTag:${unique}`;
  const tag = await createTag(page, `${tagPrefix}:Child`);
  const categories = await listFixtures<CategoryFixture>(
    page,
    "/api/categories",
    "categories",
  );
  const category = findByFqn(categories, "Entertainment:Books");
  await createSpend(page, {
    category,
    memo: `E2E tag group ${unique}`,
    tag,
  });

  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto(`/tags/group?prefix=${encodeURIComponent(tagPrefix)}`);
  const chart = page.getByTestId("entity-overview-chart");
  const breakdown = page.getByTestId("entity-overview-breakdown");
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("bars show net flow");
  await expect(chart.locator(".recharts-line-curve")).toHaveCount(1);
  await expect(page.getByTestId("entity-overview-overlay-select")).toHaveCount(
    0,
  );
  await expect(breakdown).toBeVisible();
  await expect(
    breakdown.getByRole("link", { name: category.name }),
  ).toHaveAttribute("href", `/categories/${category.category_id}`);
  const chartBox = await chart.boundingBox();
  const breakdownBox = await breakdown.boundingBox();
  expect(chartBox?.y).toBeLessThan(breakdownBox?.y ?? 0);

  const transactionsLink = page
    .getByTestId("entity-overview-transactions")
    .getByRole("link", { name: "Transactions" });
  const href = await transactionsLink.getAttribute("href");
  expect(
    new URL(href ?? "", "http://mina.test").searchParams.get("tagPrefix"),
  ).toBe(tagPrefix);

  await page.setViewportSize({ width: 1440, height: 900 });
  const wideChartBox = await chart.boundingBox();
  const wideBreakdownBox = await breakdown.boundingBox();
  expect(wideBreakdownBox?.x).toBeLessThan(wideChartBox?.x ?? 0);
});

test("tag leaf preview chips retain the fixed tag scope", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const scopedTag = await createTag(page, `E2EPreviewScope:${unique}`);
  const activatedTag = await createTag(page, `E2EPreviewFilter:${unique}`);
  const categories = await listFixtures<CategoryFixture>(
    page,
    "/api/categories",
    "categories",
  );
  const category = findByFqn(categories, "Entertainment:Books");
  await createSpend(page, {
    category,
    memo: `E2E tag preview filter ${unique}`,
    tags: [scopedTag, activatedTag],
  });

  await page.goto(`/tags/${scopedTag.tag_id}`);
  const preview = page.getByTestId("entity-overview-transactions");
  await preview
    .getByRole("button", { name: `Filter by ${activatedTag.name}` })
    .first()
    .click();

  await expect(page).toHaveURL(/\/transactions\?/);
  const activeTagIds = new URL(page.url()).searchParams.getAll("tag");
  expect(activeTagIds).toEqual(
    [scopedTag.tag_id, activatedTag.tag_id]
      .sort((left, right) => left - right)
      .map(String),
  );
});

test("entity overview preserves loaded data after refresh failure", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const category = await createCategory(page, `E2EOverviewRefresh:${unique}`);
  await createSpend(page, {
    category,
    memo: `E2E overview refresh ${unique}`,
  });
  const overviewPattern = `**/api/categories/${category.category_id}/overview*`;

  await page.goto(`/categories/${category.category_id}`);
  const topLine = page.getByTestId("entity-overview-top-line");
  await expect(topLine).toBeVisible();
  const configuredResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/categories/${category.category_id}/overview` &&
      url.searchParams.get("grain") === "year" &&
      response.ok()
    );
  });
  await page
    .getByTestId("flow-grain-select")
    .getByRole("button", { name: "Year" })
    .click();
  await configuredResponse;

  await createSpend(page, {
    category,
    memo: `E2E overview refreshed data ${unique}`,
  });
  const refreshRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === `/api/categories/${category.category_id}/overview` &&
      url.searchParams.get("grain") === "year" &&
      url.searchParams.get("period_count") === "6" &&
      url.searchParams.get("trend") === "rolling_sum"
    );
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("mina:transaction-entry-saved"));
  });
  await refreshRequest;
  await expect(topLine.locator("dd").first()).toHaveText("≈ 24.68 USD");
  const chart = page.getByTestId("entity-overview-chart");
  await chart.locator(".recharts-bar-rectangle").last().hover();
  await expect(
    page.getByTestId("flow-chart-totals").getByText("≈ 24.68 USD"),
  ).toBeVisible();

  await page.route(overviewPattern, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "unavailable", message: "Report unavailable." },
      }),
      contentType: "application/json",
      status: 503,
    });
  });
  await page.evaluate(() => {
    window.dispatchEvent(new Event("mina:transaction-entry-saved"));
  });

  await expect(
    page.getByText("Category overview could not be refreshed."),
  ).toBeVisible();
  await expect(topLine).toBeVisible();

  await page.unroute(overviewPattern);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByText("Category overview could not be refreshed."),
  ).toHaveCount(0);
  await expect(topLine).toBeVisible();
});

test("entity preview details remain usable when lookups fail and can retry", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const category = await createCategory(page, `E2ELookupFailure:${unique}`);
  const memo = `E2E lookup failure ${unique}`;
  await createSpend(page, { category, memo });

  await page.route("**/api/accounts?**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "unavailable", message: "Lookups unavailable." },
      }),
      contentType: "application/json",
      status: 503,
    });
  });
  await page.goto(`/categories/${category.category_id}`);

  const preview = page.getByTestId("entity-overview-transactions");
  await expect(preview.getByRole("button", { name: "Retry" })).toBeVisible();
  const row = preview
    .locator("[data-transaction-row='true']")
    .filter({ hasText: memo });
  await row.focus();
  await row.press("Enter");
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail.getByText("Journal records")).toBeVisible();
  await expect(detail.getByText("Loading transaction")).toHaveCount(0);
  await detail
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await expect(detail).toHaveCount(0);

  await page.unroute("**/api/accounts?**");
  await preview.getByRole("button", { name: "Retry" }).click();
  await expect(preview.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await row.focus();
  await row.press("Enter");
  await expect(detail.getByText("Journal records")).toBeVisible();
});

test("member drill-down direct navigation filters attributed transactions", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const targetMember = await createMember(page, `E2E Member Target ${unique}`);
  const alternateMember = await createMember(
    page,
    `E2E Member Alternate ${unique}`,
  );
  const categories = await listFixtures<CategoryFixture>(
    page,
    "/api/categories",
    "categories",
  );
  const category = findByFqn(categories, "Entertainment:Books");
  const targetMemo = `E2E member target ${unique}`;
  const alternateMemo = `E2E member alternate ${unique}`;
  await createSpend(page, { category, member: targetMember, memo: targetMemo });
  await createSpend(page, {
    category,
    member: alternateMember,
    memo: alternateMemo,
  });

  const filteredRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams
        .getAll("member_id")
        .includes(String(targetMember.member_id))
    );
  });
  await page.goto(`/members/${targetMember.member_id}`);
  await filteredRequest;

  await expect(
    page.getByRole("heading", {
      exact: true,
      level: 1,
      name: targetMember.name,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: targetMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: alternateMemo }),
  ).toHaveCount(0);
});

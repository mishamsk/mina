import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly fqn: string;
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
    member,
    memo,
    tags,
  }: {
    readonly category: CategoryFixture;
    readonly member?: MemberFixture;
    readonly memo: string;
    readonly tags?: readonly TagFixture[];
  },
): Promise<void> => {
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
      initiated_date: localToday(),
      member_id: member?.member_id,
      memo,
      tag_ids: tags?.map((tag) => tag.tag_id),
    },
  });
  expect(response.ok()).toBe(true);
};

const transactionRow = (page: Page, memo: string) =>
  page.locator("[data-transaction-row='true']").filter({ hasText: memo });

test("category leaf opens its report and scoped transactions", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const category = await createCategory(page, `E2E:CategoryLeaf:${unique}`);
  const unrelatedCategory = await createCategory(
    page,
    `E2E:CategoryLeafOther:${unique}`,
  );
  const memo = `E2E category leaf ${unique}`;
  const unrelatedMemo = `E2E unrelated category leaf ${unique}`;
  await createSpend(page, { category, memo });
  await createSpend(page, {
    category: unrelatedCategory,
    memo: unrelatedMemo,
  });

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const categoryRow = page.getByLabel(`Open category ${category.fqn}`, {
    exact: true,
  });
  await categoryRow.focus();
  await categoryRow.press("Space");

  await expect(page).toHaveURL(
    new RegExp(`/categories/${category.category_id}$`),
  );
  const chart = page.getByTestId("entity-overview-chart");
  await expect(chart).toBeVisible();
  await chart.locator(".recharts-line-dot").last().hover();
  const chartTooltip = page.getByTestId("flow-chart-tooltip");
  await expect(chartTooltip).toBeVisible();
  await expect(chartTooltip).toHaveAttribute("aria-live", "polite");
  await expect(chartTooltip).toHaveAttribute("role", "status");
  await expect(
    chartTooltip.getByText("Rolling 3-period average", { exact: true }),
  ).toBeVisible();
  await expect(
    chartTooltip.getByText("Net total", { exact: true }),
  ).toBeVisible();
  await expect(
    chartTooltip
      .getByTestId("flow-chart-totals")
      .getByText("≈ 12.34 USD", { exact: true }),
  ).toBeVisible();
  const preview = page.getByTestId("entity-overview-transactions");
  await expect(
    preview.locator("[data-transaction-row='true']").filter({ hasText: memo }),
  ).toBeVisible();
  await expect(
    preview
      .locator("[data-transaction-row='true']")
      .filter({ hasText: unrelatedMemo }),
  ).toHaveCount(0);

  await preview.getByRole("link", { name: "Transactions" }).click();

  await expect(page).toHaveURL(/\/transactions\?/);
  await expect(transactionRow(page, memo)).toBeVisible();
  await expect(transactionRow(page, unrelatedMemo)).toHaveCount(0);
});

test("category group row opens its group report", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const prefix = `E2E:CategoryGroup:${unique}`;
  const category = await createCategory(page, `${prefix}:Leaf`);
  await createSpend(page, {
    category,
    memo: `E2E category group ${unique}`,
  });

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  await page
    .getByLabel(`Open category ${prefix}`, {
      exact: true,
    })
    .click();

  await expect(page).toHaveURL(
    `/categories/group?prefix=${encodeURIComponent(prefix)}`,
  );
  await expect(page.getByTestId("entity-overview-top-line")).toBeVisible();
  await expect(page.getByTestId("entity-overview-chart")).toBeVisible();
});

test("tag leaf preview chips retain the fixed tag scope", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const scopedTag = await createTag(page, `E2E:TagLeaf:${unique}:Scoped`);
  const additionalTag = await createTag(
    page,
    `E2E:TagLeaf:${unique}:Additional`,
  );
  const categories = await listFixtures<CategoryFixture>(
    page,
    "/api/categories",
    "categories",
  );
  const category = findByFqn(categories, "Entertainment:Books");
  const matchingMemo = `E2E tag leaf matching ${unique}`;
  const scopedOnlyMemo = `E2E tag leaf scoped only ${unique}`;
  const additionalOnlyMemo = `E2E tag leaf additional only ${unique}`;
  await createSpend(page, {
    category,
    memo: matchingMemo,
    tags: [scopedTag, additionalTag],
  });
  await createSpend(page, {
    category,
    memo: scopedOnlyMemo,
    tags: [scopedTag],
  });
  await createSpend(page, {
    category,
    memo: additionalOnlyMemo,
    tags: [additionalTag],
  });

  await page.goto(`/tags?q=${encodeURIComponent(scopedTag.fqn)}`);
  const tagRow = page.getByLabel(`Open tag ${scopedTag.fqn}`, {
    exact: true,
  });
  await tagRow.focus();
  await tagRow.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/tags/${scopedTag.tag_id}$`));

  const preview = page.getByTestId("entity-overview-transactions");
  const matchingRow = preview
    .locator("[data-transaction-row='true']")
    .filter({ hasText: matchingMemo });
  await expect(matchingRow).toBeVisible();
  await matchingRow
    .getByRole("button", { name: `Filter by ${additionalTag.name}` })
    .click();

  await expect(page).toHaveURL(/\/transactions\?/);
  await expect(transactionRow(page, matchingMemo)).toBeVisible();
  await expect(transactionRow(page, scopedOnlyMemo)).toHaveCount(0);
  await expect(transactionRow(page, additionalOnlyMemo)).toHaveCount(0);
});

test("tag group opens its report and scoped transactions", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const prefix = `E2E:TagGroup:${unique}`;
  const tag = await createTag(page, `${prefix}:Child`);
  const unrelatedTag = await createTag(page, `E2E:TagGroupOther:${unique}`);
  const categories = await listFixtures<CategoryFixture>(
    page,
    "/api/categories",
    "categories",
  );
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E tag group ${unique}`;
  const unrelatedMemo = `E2E unrelated tag group ${unique}`;
  await createSpend(page, { category, memo, tags: [tag] });
  await createSpend(page, {
    category,
    memo: unrelatedMemo,
    tags: [unrelatedTag],
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/tags?q=${encodeURIComponent(tag.fqn)}`);
  await page.getByLabel(`Open tag ${prefix}`, { exact: true }).click();

  await expect(page).toHaveURL(
    `/tags/group?prefix=${encodeURIComponent(prefix)}`,
  );
  const chart = page.getByTestId("entity-overview-chart");
  const breakdown = page.getByTestId("entity-overview-breakdown");
  await expect(chart).toBeVisible();
  await expect(breakdown).toBeVisible();
  const wideChartBox = await chart.boundingBox();
  const wideBreakdownBox = await breakdown.boundingBox();
  expect(wideBreakdownBox).not.toBeNull();
  expect(wideChartBox).not.toBeNull();
  expect(wideBreakdownBox!.x + wideBreakdownBox!.width).toBeLessThanOrEqual(
    wideChartBox!.x,
  );

  await page.setViewportSize({ width: 640, height: 900 });
  const narrowChartBox = await chart.boundingBox();
  const narrowBreakdownBox = await breakdown.boundingBox();
  expect(narrowChartBox).not.toBeNull();
  expect(narrowBreakdownBox).not.toBeNull();
  expect(narrowChartBox!.y + narrowChartBox!.height).toBeLessThanOrEqual(
    narrowBreakdownBox!.y,
  );
  const preview = page.getByTestId("entity-overview-transactions");
  await expect(
    preview.locator("[data-transaction-row='true']").filter({ hasText: memo }),
  ).toBeVisible();

  await preview.getByRole("link", { name: "Transactions" }).click();

  await expect(page).toHaveURL(/\/transactions\?/);
  await expect(transactionRow(page, memo)).toBeVisible();
  await expect(transactionRow(page, unrelatedMemo)).toHaveCount(0);
});

test("member row opens its attributed transactions", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const member = await createMember(page, `E2E Member Target ${unique}`);
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
  const memo = `E2E member target ${unique}`;
  const alternateMemo = `E2E member alternate ${unique}`;
  await createSpend(page, { category, member, memo });
  await createSpend(page, {
    category,
    member: alternateMember,
    memo: alternateMemo,
  });

  await page.goto(`/members?q=${encodeURIComponent(member.name)}`);
  const memberRow = page.getByLabel(`Open member ${member.name}`, {
    exact: true,
  });
  await memberRow.focus();
  await memberRow.press("Space");

  await expect(page).toHaveURL(new RegExp(`/members/${member.member_id}$`));
  await expect(
    page.getByRole("heading", { exact: true, level: 1, name: member.name }),
  ).toBeVisible();
  await expect(transactionRow(page, memo)).toBeVisible();
  await expect(transactionRow(page, alternateMemo)).toHaveCount(0);
});

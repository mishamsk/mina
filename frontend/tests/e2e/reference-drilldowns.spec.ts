import { expect, type Page, type Route, test } from "@playwright/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly economic_intent:
    | "adjustment"
    | "exchange"
    | "expense"
    | "fee"
    | "fx_gain_loss"
    | "income"
    | "refund"
    | "transfer";
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
    data: {
      economic_intent: "expense",
      fqn,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as CategoryFixture;
};

const createTag = async (page: Page, fqn: string): Promise<TagFixture> => {
  const response = await page.request.post("/api/tags", {
    data: { fqn },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as TagFixture;
};

const createMember = async (
  page: Page,
  name: string,
): Promise<MemberFixture> => {
  const response = await page.request.post("/api/members", {
    data: { name },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as MemberFixture;
};

const createSpend = async (
  page: Page,
  {
    category,
    initiatedDate = "2025-01-02",
    member,
    memo,
    tag,
  }: {
    readonly category: CategoryFixture;
    readonly initiatedDate?: string;
    readonly member?: MemberFixture;
    readonly memo: string;
    readonly tag?: TagFixture;
  },
): Promise<TransactionFixture> => {
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
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
      tag_ids: tag ? [tag.tag_id] : undefined,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as TransactionFixture;
};

const expectUrlFilterIds = async (
  page: Page,
  kind: "category" | "member" | "tag",
  expectedIds: readonly number[],
): Promise<void> => {
  await expect
    .poll(() =>
      new URL(page.url()).searchParams
        .getAll(kind)
        .map((value) => Number(value))
        .sort((left, right) => left - right),
    )
    .toEqual([...expectedIds].sort((left, right) => left - right));
};

test("category drill-down direct navigation, view-all, refresh, not-found, and detail panel work", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const category = await createCategory(page, `E2EDrill:${unique}`);
  const memo = `E2E category drilldown ${unique}`;
  const transaction = await createSpend(page, { category, memo });

  const filteredRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams
        .getAll("category_id")
        .includes(String(category.category_id))
    );
  });
  await page.goto(`/categories/${category.category_id}`);
  await filteredRequest;

  const categoryHeading = page
    .getByRole("heading", { level: 1 })
    .filter({ hasText: category.name });
  await expect(categoryHeading).toBeVisible();
  await expect(categoryHeading.getByText("E2EDrill:")).toBeVisible();
  await expect(page.getByText("Expense")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();

  const dateJumpResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === "2025-01-02"
    );
  });
  await page.getByLabel("Go to day").fill("2025-01-02");
  await dateJumpResponse;
  await expect(
    page.locator('[data-date-jump-anchor="2025-01-02"]'),
  ).toBeVisible();

  await page.getByRole("button", { name: "Open filters" }).click();
  await expect(
    page.getByTestId("transaction-browser-filter-bar"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add filter" })).toBeVisible();
  await page.getByRole("button", { name: "Close filters" }).click();
  await expect(page.getByTestId("transaction-browser-filter-bar")).toBeHidden();

  const toggle = page.getByLabel("This level only");
  await toggle.click();
  await expect(page).toHaveURL(/scope=exact/);
  await expect(toggle).toBeChecked();
  await page.reload();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`transaction=${transaction.transaction_id}`),
  );
  const panel = page.getByTestId("transaction-detail-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Journal records")).toBeVisible();
  await page.reload();
  const reloadedPanel = page.getByTestId("transaction-detail-panel");
  await expect(reloadedPanel).toBeVisible();
  await expect(
    reloadedPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(memo);
  await page.getByRole("button", { name: "Close transaction detail" }).click();
  await expect(page.getByTestId("transaction-detail-panel")).toBeHidden();

  await page.getByRole("link", { name: "View all transactions" }).click();
  await expect(page).toHaveURL(/\/transactions\?/);
  await expectUrlFilterIds(page, "category", [category.category_id]);

  await page.goto("/categories/999999999");
  await expect(
    page.getByRole("heading", { name: "Category not found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to categories" }),
  ).toHaveAttribute("href", "/categories");
});

test("drill-down transaction row quick-delete confirms, tombstones, and refreshes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const category = await createCategory(page, `E2EQuickDelete:${unique}`);
  const memo = `E2E drill-down quick delete ${unique}`;
  const transaction = await createSpend(page, { category, memo });

  await page.goto(`/categories/${category.category_id}`);
  const row = page.locator("tbody > tr[aria-expanded]").filter({
    hasText: memo,
  });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Delete transaction" }).click();
  const confirmDialog = page.getByRole("alertdialog", {
    name: "Delete transaction",
  });
  await expect(confirmDialog).toBeVisible();
  await expect(
    confirmDialog.getByText(transaction.display_title),
  ).toBeVisible();

  const deleteRequest = page.waitForRequest(
    (request) =>
      request.method() === "DELETE" &&
      request.url().includes(`/api/transactions/${transaction.transaction_id}`),
  );
  await confirmDialog
    .getByRole("button", { name: "Delete transaction" })
    .click();
  await deleteRequest;

  await expect(
    page.getByRole("status").filter({ hasText: "Transaction deleted." }),
  ).toBeVisible();
  await expect(confirmDialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeHidden();
});

test("drill-down renders the transaction empty state for a matching entity with no activity", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const category = await createCategory(page, `E2EEmptyPreview:${unique}`);

  await page.goto(`/categories/${category.category_id}`);
  await expect(
    page.getByRole("heading", { name: "No transactions" }),
  ).toBeVisible();
});

test("category drill-down rolls visible descendants, excludes hidden descendants, and exact scope narrows them", async ({
  page,
}) => {
  const now = "2026-07-11T12:00:00Z";
  const parentCategory = {
    category_id: 900001,
    created_at: now,
    deletable: false,
    economic_intent: "expense",
    fqn: "E2EMocked:Parent",
    is_hidden: false,
    level: 2,
    name: "Parent",
    parent_fqn: "E2EMocked",
    updated_at: now,
  };
  const childCategory = {
    ...parentCategory,
    category_id: 900002,
    fqn: "E2EMocked:Parent:Child",
    level: 3,
    name: "Child",
    parent_fqn: "E2EMocked:Parent",
  };
  const hiddenChildCategory = {
    ...childCategory,
    category_id: 900003,
    fqn: "E2EMocked:Parent:HiddenChild",
    is_hidden: true,
    name: "HiddenChild",
  };
  const transactionFor = (
    transactionId: number,
    categoryId: number,
    title: string,
  ) => ({
    components: [],
    created_at: now,
    display_title: title,
    initiated_date: "2026-05-31",
    primary_amounts: [{ amount: "-12.34000000", currency: "USD" }],
    recurring_occurrence_id: null,
    records: [
      {
        account_id: 1,
        amount: "-12.34000000",
        amount_usd: "-12.34000000",
        category_id: categoryId,
        created_at: now,
        currency: "USD",
        memo: title,
        pending_date: now,
        posted_date: now,
        posting_status: "posted",
        reconciliation_status: "unreconciled",
        record_id: transactionId * 10,
        source: "manual",
        tag_ids: [],
        transaction_id: transactionId,
        updated_at: now,
      },
    ],
    transaction_class: "spend",
    transaction_id: transactionId,
  });

  await page.route("**/api/categories?**", async (route: Route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        categories: [parentCategory, childCategory, hiddenChildCategory],
        total_count: 3,
      },
    });
  });
  await page.route("**/api/categories/groups?**", async (route: Route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        groups: [],
      },
    });
  });
  await page.route("**/api/transactions?**", async (route: Route) => {
    const url = new URL(route.request().url());
    const categoryIds = url.searchParams.getAll("category_id");
    const transactions = [
      ...(categoryIds.includes("900001")
        ? [transactionFor(910001, 900001, "Parent scoped transaction")]
        : []),
      ...(categoryIds.includes("900002")
        ? [transactionFor(910002, 900002, "Child scoped transaction")]
        : []),
      ...(categoryIds.includes("900003")
        ? [transactionFor(910003, 900003, "Hidden child transaction")]
        : []),
    ];
    await route.fulfill({
      contentType: "application/json",
      json: {
        offset: 0,
        total_count: transactions.length,
        transactions,
      },
    });
  });

  await page.goto("/categories/900001");
  await expect(
    page.getByRole("row").filter({ hasText: "Parent scoped transaction" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Child scoped transaction" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Hidden child transaction" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "View all transactions" }),
  ).toHaveAttribute(
    "href",
    "/transactions?category=900001&category=900002&page=1&pageSize=50",
  );

  const toggle = page.getByLabel("This level only");
  await toggle.click();
  await expect(page).toHaveURL(/scope=exact/);
  await expect(toggle).toBeChecked();
  await expect(
    page.getByRole("row").filter({ hasText: "Parent scoped transaction" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Child scoped transaction" }),
  ).toHaveCount(0);
});

test("tag drill-down direct navigation, filters, view-all, not-found, and exact scope work", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const tag = await createTag(page, `E2ETagDrill:${unique}`);
  const categories = await listFixtures<CategoryFixture>(
    page,
    "/api/categories",
    "categories",
  );
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E tag drilldown ${unique}`;
  await createSpend(page, { category, memo, tag });

  const filteredRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.getAll("tag_id").includes(String(tag.tag_id))
    );
  });
  await page.goto(`/tags/${tag.tag_id}`);
  await filteredRequest;

  const tagHeading = page
    .getByRole("heading", { level: 1 })
    .filter({ hasText: tag.name });
  await expect(tagHeading).toBeVisible();
  await expect(tagHeading.getByText("E2ETagDrill:")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();

  const toggle = page.getByLabel("This level only");
  await toggle.click();
  await expect(page).toHaveURL(/scope=exact/);
  await expect(toggle).toBeChecked();
  await page.reload();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();

  await page.getByRole("link", { name: "View all transactions" }).click();
  await expect(page).toHaveURL(/\/transactions\?/);
  await expectUrlFilterIds(page, "tag", [tag.tag_id]);

  await page.goto("/tags/999999999");
  await expect(
    page.getByRole("heading", { name: "Tag not found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to tags" }),
  ).toHaveAttribute("href", "/tags");
});

test("tag drill-down rolls visible descendants, excludes hidden descendants, and exact scope narrows them", async ({
  page,
}) => {
  const now = "2026-07-11T12:00:00Z";
  const parentTag = {
    created_at: now,
    deletable: false,
    fqn: "E2EMockedTag:Parent",
    is_hidden: false,
    level: 2,
    name: "Parent",
    parent_fqn: "E2EMockedTag",
    tag_id: 900101,
    updated_at: now,
  };
  const childTag = {
    ...parentTag,
    fqn: "E2EMockedTag:Parent:Child",
    level: 3,
    name: "Child",
    parent_fqn: "E2EMockedTag:Parent",
    tag_id: 900102,
  };
  const hiddenChildTag = {
    ...childTag,
    fqn: "E2EMockedTag:Parent:HiddenChild",
    is_hidden: true,
    name: "HiddenChild",
    tag_id: 900103,
  };
  const transactionFor = (
    transactionId: number,
    tagId: number,
    title: string,
  ) => ({
    components: [],
    created_at: now,
    display_title: title,
    initiated_date: "2026-05-31",
    primary_amounts: [{ amount: "-12.34000000", currency: "USD" }],
    recurring_occurrence_id: null,
    records: [
      {
        account_id: 1,
        amount: "-12.34000000",
        amount_usd: "-12.34000000",
        category_id: 1,
        created_at: now,
        currency: "USD",
        memo: title,
        pending_date: now,
        posted_date: now,
        posting_status: "posted",
        reconciliation_status: "unreconciled",
        record_id: transactionId * 10,
        source: "manual",
        tag_ids: [tagId],
        transaction_id: transactionId,
        updated_at: now,
      },
    ],
    transaction_class: "spend",
    transaction_id: transactionId,
  });

  await page.route("**/api/tags?**", async (route: Route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        tags: [parentTag, childTag, hiddenChildTag],
        total_count: 3,
      },
    });
  });
  await page.route("**/api/tags/groups?**", async (route: Route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        groups: [],
      },
    });
  });
  await page.route("**/api/transactions?**", async (route: Route) => {
    const url = new URL(route.request().url());
    const tagIds = url.searchParams.getAll("tag_id");
    const transactions = [
      ...(tagIds.includes("900101")
        ? [transactionFor(910101, 900101, "Parent tag transaction")]
        : []),
      ...(tagIds.includes("900102")
        ? [transactionFor(910102, 900102, "Child tag transaction")]
        : []),
      ...(tagIds.includes("900103")
        ? [transactionFor(910103, 900103, "Hidden child tag transaction")]
        : []),
    ];
    await route.fulfill({
      contentType: "application/json",
      json: {
        offset: 0,
        total_count: transactions.length,
        transactions,
      },
    });
  });

  await page.goto("/tags/900101");
  await expect(
    page.getByRole("row").filter({ hasText: "Parent tag transaction" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Child tag transaction" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Hidden child tag transaction" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "View all transactions" }),
  ).toHaveAttribute(
    "href",
    "/transactions?tag=900101&tag=900102&page=1&pageSize=50",
  );

  const toggle = page.getByLabel("This level only");
  await toggle.click();
  await expect(page).toHaveURL(/scope=exact/);
  await expect(toggle).toBeChecked();
  await expect(
    page.getByRole("row").filter({ hasText: "Parent tag transaction" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Child tag transaction" }),
  ).toHaveCount(0);
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
  await createSpend(page, {
    category,
    member: targetMember,
    memo: targetMemo,
  });
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

  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: targetMemo }),
  ).toBeVisible();

  await page.getByRole("link", { name: "View all transactions" }).click();
  await expect(page).toHaveURL(/\/transactions\?/);
  await expectUrlFilterIds(page, "member", [targetMember.member_id]);

  await page.goto("/members/999999999");
  await expect(
    page.getByRole("heading", { name: "Member not found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to members" }),
  ).toHaveAttribute("href", "/members");
});

import { expect, type Page, type Route } from "@playwright/test";
import { test } from "@tests/e2e/test";

type ListRouteOptions = {
  readonly collectionKey: "accounts" | "categories" | "members" | "tags";
  readonly freshItems: readonly [unknown, unknown];
  readonly freshQuery: string;
  readonly path: string;
  readonly staleItem: unknown;
  readonly staleQuery: string;
};

const installPagedListRoute = async (page: Page, options: ListRouteOptions) => {
  let markStaleStarted: (() => void) | undefined;
  const staleStarted = new Promise<void>((resolve) => {
    markStaleStarted = resolve;
  });
  let releaseStaleRequest: (() => void) | undefined;
  const staleReleased = new Promise<void>((resolve) => {
    releaseStaleRequest = resolve;
  });
  let markStaleSettled: (() => void) | undefined;
  const staleSettled = new Promise<void>((resolve) => {
    markStaleSettled = resolve;
  });
  const freshRequests: URL[] = [];
  const staleRequests: URL[] = [];

  await page.route(`**${options.path}?*`, async (route: Route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET" || url.pathname !== options.path) {
      await route.continue();
      return;
    }

    const query = url.searchParams.get("q");
    if (query === options.staleQuery) {
      staleRequests.push(url);
      markStaleStarted?.();
      await staleReleased;
      await route.fulfill({
        body: JSON.stringify({
          [options.collectionKey]: [options.staleItem],
          total_count: 501,
        }),
        contentType: "application/json",
        status: 200,
      });
      markStaleSettled?.();
      return;
    }

    if (query !== options.freshQuery) {
      await route.continue();
      return;
    }

    freshRequests.push(url);
    const offset = Number(url.searchParams.get("offset"));
    await route.fulfill({
      body: JSON.stringify({
        [options.collectionKey]: [
          offset === 0 ? options.freshItems[0] : options.freshItems[1],
        ],
        total_count: 501,
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  return {
    freshRequests,
    releaseStaleRequest: () => releaseStaleRequest?.(),
    staleSettled,
    staleStarted,
    staleRequests,
  };
};

const timestamp = "2026-08-30T12:00:00Z";

const account = (accountId: number, fqn: string, displayLabel: string) => ({
  account_id: accountId,
  account_type: "party",
  created_at: timestamp,
  currency: "USD",
  deletable: true,
  display_label: displayLabel,
  display_label_override: displayLabel,
  external_id: null,
  external_system: null,
  fqn,
  is_featured: false,
  is_hidden: false,
  level: 2,
  name: fqn.split(":").at(-1) ?? fqn,
  parent_fqn: fqn.split(":").slice(0, -1).join(":"),
  updated_at: timestamp,
});

const category = (categoryId: number, fqn: string, displayLabel: string) => ({
  category_id: categoryId,
  created_at: timestamp,
  deletable: true,
  display_label: displayLabel,
  display_label_override: displayLabel,
  economic_intent: "income",
  fqn,
  is_featured: false,
  is_hidden: false,
  level: 2,
  name: fqn.split(":").at(-1) ?? fqn,
  parent_fqn: fqn.split(":").slice(0, -1).join(":"),
  updated_at: timestamp,
});

const tag = (tagId: number, fqn: string, displayLabel: string) => ({
  created_at: timestamp,
  deletable: true,
  display_label: displayLabel,
  display_label_override: displayLabel,
  fqn,
  is_featured: false,
  is_hidden: false,
  level: 2,
  name: fqn.split(":").at(-1) ?? fqn,
  parent_fqn: fqn.split(":").slice(0, -1).join(":"),
  tag_id: tagId,
  updated_at: timestamp,
});

const member = (memberId: number, name: string) => ({
  created_at: timestamp,
  deletable: true,
  is_hidden: false,
  member_id: memberId,
  name,
  updated_at: timestamp,
});

const expectPagedRequests = (
  requests: readonly URL[],
  expected: Readonly<Record<string, readonly string[]>>,
) => {
  expect(requests.map((url) => url.searchParams.get("offset"))).toEqual([
    "0",
    "500",
  ]);
  for (const request of requests) {
    expect(request.searchParams.get("limit")).toBe("500");
    for (const [key, values] of Object.entries(expected)) {
      expect(request.searchParams.getAll(key)).toEqual(values);
    }
  }
};

const expectStoppedStalePagination = async (
  page: Page,
  requests: readonly URL[],
) => {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  expect(requests.map((url) => url.searchParams.get("offset"))).toEqual(["0"]);
};

test("default empty management pages preserve first-use guidance", async ({
  page,
}) => {
  const emptyPages = [
    {
      collectionKey: "accounts",
      firstUse: "once accounts exist",
      path: "/accounts",
      requestPath: "/api/accounts",
    },
    {
      collectionKey: "categories",
      firstUse: "once categories exist",
      path: "/categories",
      requestPath: "/api/categories",
    },
    {
      collectionKey: "tags",
      firstUse: "once tags exist",
      path: "/tags",
      requestPath: "/api/tags",
    },
    {
      collectionKey: "members",
      firstUse: "once they exist",
      path: "/members",
      requestPath: "/api/members",
    },
  ] as const;

  for (const emptyPage of emptyPages) {
    await page.route(`**${emptyPage.requestPath}?*`, async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          [emptyPage.collectionKey]: [],
          total_count: 0,
        }),
        contentType: "application/json",
        status: 200,
      });
    });
  }

  for (const emptyPage of emptyPages) {
    await page.goto(emptyPage.path);
    await expect(
      page.getByText(emptyPage.firstUse, { exact: false }),
    ).toBeVisible();
  }
});

test("account management lists page server-filtered results and discard stale responses", async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name === "chromium" ? 1 : 2;
  const freshQuery = `Effective account ${suffix}`;
  const staleQuery = `Stale account ${suffix}`;
  const route = await installPagedListRoute(page, {
    collectionKey: "accounts",
    freshItems: [
      account(910_000 + suffix, `PagedAccounts${suffix}:Alpha`, freshQuery),
      account(920_000 + suffix, `PagedAccounts${suffix}:Zulu`, "Zulu result"),
    ],
    freshQuery,
    path: "/api/accounts",
    staleItem: account(
      930_000 + suffix,
      `StaleAccounts${suffix}:Only`,
      staleQuery,
    ),
    staleQuery,
  });

  await page.goto(
    `/accounts?hidden=true&type=party&type=flow&q=${encodeURIComponent(freshQuery)}`,
  );
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: freshQuery }),
  ).toBeVisible();
  await page.getByLabel("Search").fill(staleQuery);
  await route.staleStarted;
  await page.getByLabel("Search").fill(freshQuery);

  const rows = page.getByTestId("accounts-tree-row");
  await expect(rows.filter({ hasText: freshQuery })).toBeVisible();
  await expect(rows.filter({ hasText: "Zulu result" })).toBeVisible();
  await expect(
    rows.filter({ hasText: `PagedAccounts${suffix}` }).first(),
  ).toBeVisible();
  const rowTexts = await rows.allInnerTexts();
  expect(rowTexts.findIndex((text) => text.includes(freshQuery))).toBeLessThan(
    rowTexts.findIndex((text) => text.includes("Zulu result")),
  );

  expectPagedRequests(route.freshRequests, {
    account_type: ["flow", "party"],
    include_hidden: ["true"],
    q: [freshQuery],
    sort: ["fqn"],
    sort_dir: ["asc"],
  });
  route.releaseStaleRequest();
  await route.staleSettled;
  await expectStoppedStalePagination(page, route.staleRequests);
  await expect(rows.filter({ hasText: staleQuery })).toHaveCount(0);
  await expect(rows.filter({ hasText: freshQuery })).toBeVisible();
});

test("account management replaces a stale snapshot with refresh errors", async ({
  page,
}) => {
  const targetQuery = "Refresh failure account";
  const target = account(935_001, "RefreshFailure:Account", targetQuery);
  let failTargetQuery = true;

  await page.route("**/api/accounts?*", async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      url.pathname !== "/api/accounts"
    ) {
      await route.continue();
      return;
    }
    if (url.searchParams.get("q") === targetQuery && failTargetQuery) {
      await route.fulfill({
        contentType: "application/json",
        json: {
          error: {
            code: "temporary_failure",
            message: "Account refresh failed.",
          },
        },
        status: 503,
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      json: { accounts: [target], total_count: 1 },
    });
  });

  await page.goto("/accounts");
  const row = page.getByTestId("accounts-tree-row").filter({
    hasText: targetQuery,
  });
  await expect(row).toBeVisible();
  await page.getByLabel("Search").fill(targetQuery);

  const alert = page.getByRole("alert").filter({
    hasText: "Accounts could not be loaded.",
  });
  await expect(alert).toContainText("Accounts could not be loaded.");
  await expect(row).toHaveCount(0);

  failTargetQuery = false;
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(row).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test("category management lists page server-filtered results and discard stale responses", async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name === "chromium" ? 1 : 2;
  const freshQuery = `Effective category ${suffix}`;
  const staleQuery = `Stale category ${suffix}`;
  const route = await installPagedListRoute(page, {
    collectionKey: "categories",
    freshItems: [
      category(940_000 + suffix, `PagedCategories${suffix}:Alpha`, freshQuery),
      category(
        950_000 + suffix,
        `PagedCategories${suffix}:Zulu`,
        "Zulu result",
      ),
    ],
    freshQuery,
    path: "/api/categories",
    staleItem: category(
      960_000 + suffix,
      `StaleCategories${suffix}:Only`,
      staleQuery,
    ),
    staleQuery,
  });

  await page.goto(
    `/categories?hidden=true&economic_intent=income&q=${encodeURIComponent(freshQuery)}`,
  );
  await expect(
    page.getByTestId("categories-tree-row").filter({ hasText: "Alpha" }),
  ).toBeVisible();
  await page.getByLabel("Search").fill(staleQuery);
  await route.staleStarted;
  await page.getByLabel("Search").fill(freshQuery);

  const rows = page.getByTestId("categories-tree-row");
  await expect(rows.filter({ hasText: "Alpha" })).toBeVisible();
  await expect(rows.filter({ hasText: "Zulu" })).toBeVisible();
  await expect(
    rows.filter({ hasText: `PagedCategories${suffix}` }).first(),
  ).toBeVisible();
  const rowTexts = await rows.allInnerTexts();
  expect(rowTexts.findIndex((text) => text.includes("Alpha"))).toBeLessThan(
    rowTexts.findIndex((text) => text.includes("Zulu")),
  );

  expectPagedRequests(route.freshRequests, {
    economic_intent: ["income"],
    include_hidden: ["true"],
    q: [freshQuery],
    sort: ["fqn"],
    sort_dir: ["asc"],
  });
  route.releaseStaleRequest();
  await route.staleSettled;
  await expectStoppedStalePagination(page, route.staleRequests);
  await expect(
    rows.filter({ hasText: `StaleCategories${suffix}` }),
  ).toHaveCount(0);
  await expect(rows.filter({ hasText: "Alpha" })).toBeVisible();
});

test("tag management lists page server-filtered results and discard stale responses", async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name === "chromium" ? 1 : 2;
  const freshQuery = `Effective tag ${suffix}`;
  const staleQuery = `Stale tag ${suffix}`;
  const route = await installPagedListRoute(page, {
    collectionKey: "tags",
    freshItems: [
      tag(970_000 + suffix, `PagedTags${suffix}:Alpha`, freshQuery),
      tag(980_000 + suffix, `PagedTags${suffix}:Zulu`, "Zulu result"),
    ],
    freshQuery,
    path: "/api/tags",
    staleItem: tag(990_000 + suffix, `StaleTags${suffix}:Only`, staleQuery),
    staleQuery,
  });

  await page.goto(`/tags?hidden=true&q=${encodeURIComponent(freshQuery)}`);
  await expect(
    page.getByTestId("tags-tree-row").filter({ hasText: "Alpha" }),
  ).toBeVisible();
  await page.getByLabel("Search").fill(staleQuery);
  await route.staleStarted;
  await page.getByLabel("Search").fill(freshQuery);

  const rows = page.getByTestId("tags-tree-row");
  await expect(rows.filter({ hasText: "Alpha" })).toBeVisible();
  await expect(rows.filter({ hasText: "Zulu" })).toBeVisible();
  await expect(
    rows.filter({ hasText: `PagedTags${suffix}` }).first(),
  ).toBeVisible();
  const rowTexts = await rows.allInnerTexts();
  expect(rowTexts.findIndex((text) => text.includes("Alpha"))).toBeLessThan(
    rowTexts.findIndex((text) => text.includes("Zulu")),
  );

  expectPagedRequests(route.freshRequests, {
    include_hidden: ["true"],
    q: [freshQuery],
    sort: ["fqn"],
    sort_dir: ["asc"],
  });
  route.releaseStaleRequest();
  await route.staleSettled;
  await expectStoppedStalePagination(page, route.staleRequests);
  await expect(rows.filter({ hasText: `StaleTags${suffix}` })).toHaveCount(0);
  await expect(rows.filter({ hasText: "Alpha" })).toBeVisible();
});

test("member management lists page server-filtered results and discard stale responses", async ({
  page,
}, testInfo) => {
  const suffix = testInfo.project.name === "chromium" ? 1 : 2;
  const freshQuery = `Alpha member ${suffix}`;
  const staleQuery = `Stale member ${suffix}`;
  const route = await installPagedListRoute(page, {
    collectionKey: "members",
    freshItems: [
      member(1_010_000 + suffix, freshQuery),
      member(1_020_000 + suffix, `Zulu member ${suffix}`),
    ],
    freshQuery,
    path: "/api/members",
    staleItem: member(1_030_000 + suffix, staleQuery),
    staleQuery,
  });

  await page.goto(`/members?hidden=true&q=${encodeURIComponent(freshQuery)}`);
  await expect(
    page.getByTestId("members-list-row").filter({ hasText: freshQuery }),
  ).toBeVisible();
  await page.getByLabel("Search").fill(staleQuery);
  await route.staleStarted;
  await page.getByLabel("Search").fill(freshQuery);

  const rows = page.getByTestId("members-list-row");
  await expect(rows.filter({ hasText: freshQuery })).toBeVisible();
  await expect(rows.filter({ hasText: `Zulu member ${suffix}` })).toBeVisible();
  const rowTexts = await rows.allInnerTexts();
  expect(rowTexts.findIndex((text) => text.includes(freshQuery))).toBeLessThan(
    rowTexts.findIndex((text) => text.includes(`Zulu member ${suffix}`)),
  );

  expectPagedRequests(route.freshRequests, {
    include_hidden: ["true"],
    q: [freshQuery],
    sort: ["name"],
    sort_dir: ["asc"],
  });
  route.releaseStaleRequest();
  await route.staleSettled;
  await expectStoppedStalePagination(page, route.staleRequests);
  await expect(rows.filter({ hasText: staleQuery })).toHaveCount(0);
  await expect(rows.filter({ hasText: freshQuery })).toBeVisible();
});

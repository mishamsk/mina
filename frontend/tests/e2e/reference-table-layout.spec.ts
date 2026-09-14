import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

const createAccount = async (
  page: Page,
  fqn: string,
  currency: string | null = "USD",
): Promise<number> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: "owned",
      currency,
      fqn,
      is_hidden: false,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { account_id: number }).account_id;
};

const createCategory = async (page: Page, fqn: string): Promise<void> => {
  const response = await page.request.post("/api/categories", {
    data: { economic_intent: "expense", fqn, is_hidden: false },
  });
  expect(response.ok(), await response.text()).toBe(true);
};

const createTag = async (page: Page, fqn: string): Promise<void> => {
  const response = await page.request.post("/api/tags", {
    data: { fqn, is_hidden: false },
  });
  expect(response.ok(), await response.text()).toBe(true);
};

const createMember = async (page: Page, name: string): Promise<void> => {
  const response = await page.request.post("/api/members", {
    data: { name },
  });
  expect(response.ok(), await response.text()).toBe(true);
};

const expectNoHorizontalOverflow = async (
  page: Page,
  scroller: Locator,
): Promise<void> => {
  const pageDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const tableDimensions = await scroller.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

  expect(pageDimensions.scrollWidth).toBeLessThanOrEqual(
    pageDimensions.clientWidth + 1,
  );
  expect(tableDimensions.scrollWidth).toBeLessThanOrEqual(
    tableDimensions.clientWidth + 1,
  );
};

const expectInternalScrollWithReachableHeader = async (
  page: Page,
  scroller: Locator,
): Promise<void> => {
  const initialDimensions = await scroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(initialDimensions.scrollHeight).toBeGreaterThan(
    initialDimensions.clientHeight,
  );

  await scroller.hover();
  await page.mouse.wheel(0, 10_000);

  await expect(scroller.getByRole("row").last()).toBeInViewport();
  expect(
    await scroller.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(0);
  await expect(scroller.getByRole("columnheader").first()).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
};

test("wide Accounts and Categories tables scroll inside their frames", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fixtureCount = 18;
  const accountPrefix = `E2ELayoutAccounts:${unique}`;
  const categoryPrefix = `E2ELayoutCategories:${unique}`;

  for (let index = 0; index < fixtureCount; index += 1) {
    const suffix = `Row${String(index).padStart(2, "0")}`;
    await createAccount(page, `${accountPrefix}:${suffix}`);
    await createCategory(page, `${categoryPrefix}:${suffix}`);
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  for (const target of [
    {
      frameTestId: "accounts-table-frame",
      path: "/accounts",
      prefix: accountPrefix,
      rowLabel: `Open account ${accountPrefix}:Row00`,
      scrollerTestId: "accounts-table-scroll",
    },
    {
      frameTestId: "reference-table-frame",
      path: "/categories",
      prefix: categoryPrefix,
      rowLabel: `Open category ${categoryPrefix}:Row00`,
      scrollerTestId: "reference-table-scroll",
    },
  ]) {
    await page.goto(`${target.path}?q=${encodeURIComponent(target.prefix)}`);
    await expect(
      page.getByLabel(target.rowLabel, { exact: true }),
    ).toBeVisible();

    const frame = page.getByTestId(target.frameTestId);
    const scroller = page.getByTestId(target.scrollerTestId);
    await expect(frame).toBeVisible();
    await expectNoHorizontalOverflow(page, scroller);
    await expectInternalScrollWithReachableHeader(page, scroller);
  }
});

test("compact Tags and Members stay usable at wide and narrow widths", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const tagFqn = `E2ECompactTag:${unique}`;
  const memberName = `E2E Compact Member ${unique}`;
  await createTag(page, tagFqn);
  await createMember(page, memberName);

  const targets = [
    {
      editLabel: "Edit tag",
      path: "/tags",
      rowLabel: `Open tag ${tagFqn}`,
      search: tagFqn,
    },
    {
      editLabel: "Edit member",
      path: "/members",
      rowLabel: `Open member ${memberName}`,
      search: memberName,
    },
  ];

  await page.setViewportSize({ width: 1440, height: 800 });
  for (const target of targets) {
    await page.goto(`${target.path}?q=${encodeURIComponent(target.search)}`);
    const row = page.getByLabel(target.rowLabel, { exact: true });
    const frame = page.getByTestId("reference-table-frame");
    await expect(frame).toBeVisible();
    await expect(row).toBeVisible();
    await expect(row).toContainText(target.search);
    await expect(
      row.getByRole("button", { name: target.editLabel }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(
      page,
      page.getByTestId("reference-table-scroll"),
    );
  }

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.setViewportSize({ width: 390, height: 800 });
  for (const target of targets) {
    await page.goto(`${target.path}?q=${encodeURIComponent(target.search)}`);
    const row = page.getByLabel(target.rowLabel, { exact: true });
    await expect(row).toBeVisible();
    await expect(
      row.getByRole("button", { name: "More row actions" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(
      page,
      page.getByTestId("reference-table-scroll"),
    );
  }
});

test("Account and Tag row actions remain reachable when they fold", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const accountFqn = `E2EResponsiveAccount:${unique}`;
  const tagFqn = `E2EResponsiveTag:${unique}`;
  await createAccount(page, accountFqn);
  await createTag(page, tagFqn);

  const targets = [
    {
      actions: [
        "Edit account",
        "Hide account",
        "Feature account",
        "Move or rename",
        "Delete account",
      ],
      path: "/accounts",
      rowLabel: `Open account ${accountFqn}`,
      search: accountFqn,
    },
    {
      actions: [
        "Edit tag",
        "Hide tag",
        "Feature tag",
        "Move or rename",
        "Delete tag",
      ],
      path: "/tags",
      rowLabel: `Open tag ${tagFqn}`,
      search: tagFqn,
    },
  ];

  await page.setViewportSize({ width: 1440, height: 800 });
  for (const target of targets) {
    await page.goto(`${target.path}?q=${encodeURIComponent(target.search)}`);
    const row = page.getByLabel(target.rowLabel, { exact: true });
    await expect(row).toBeVisible();
    for (const action of target.actions) {
      await expect(row.getByRole("button", { name: action })).toBeVisible();
    }
    await expect(
      row.getByRole("button", { name: "More row actions" }),
    ).toBeHidden();
  }

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.setViewportSize({ width: 390, height: 800 });
  for (const target of targets) {
    await page.goto(`${target.path}?q=${encodeURIComponent(target.search)}`);
    const row = page.getByLabel(target.rowLabel, { exact: true });
    const overflow = row.getByRole("button", { name: "More row actions" });
    await expect(row).toBeVisible();
    await expect(overflow).toBeVisible();
    await overflow.click();

    const menu = page.locator(".row-actions-menu:visible");
    await expect(menu).toBeVisible();
    for (const action of target.actions) {
      await expect(menu.getByRole("button", { name: action })).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expectNoHorizontalOverflow(
      page,
      target.path === "/accounts"
        ? page.getByTestId("accounts-table-scroll")
        : page.getByTestId("reference-table-scroll"),
    );
  }
});

const expectNoDocumentVerticalOverflow = async (page: Page): Promise<void> => {
  const dimensions = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(
    dimensions.clientHeight + 1,
  );
};

test("desktop multi-currency account keeps balances and pagination reachable", async ({
  page,
}) => {
  const accountId = await createAccount(page, "E2ELayout:MultiCurrency", null);
  const sourceId = await createAccount(page, "E2ELayout:Source", null);
  const currencies = [
    "AUD",
    "CAD",
    "CHF",
    "CNY",
    "EUR",
    "GBP",
    "HKD",
    "JPY",
    "NZD",
    "USD",
  ];
  for (let index = 0; index < 30; index += 1) {
    const response = await page.request.post("/api/transactions/transfer", {
      data: {
        source_account_id: sourceId,
        destination_account_id: accountId,
        amount: "10",
        currency: currencies[index % currencies.length],
        initiated_date: "2026-08-15",
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }

  await page.setViewportSize({ width: 1280, height: 633 });
  await page.goto(`/accounts/${accountId}?pageSize=25`);
  const header = page.getByTestId("account-header");
  await expect(header.getByRole("definition")).toHaveCount(20);
  const footer = page.getByTestId("account-register-pagination-footer");
  await expect(footer).toBeInViewport();
  await expectNoDocumentVerticalOverflow(page);

  const summary = page.getByRole("region", { name: "Account summary" });
  await summary.focus();
  await page.keyboard.press("End");
  await expect(header.getByRole("definition").last()).toBeInViewport();
  await expectInternalScrollWithReachableHeader(
    page,
    page.getByTestId("account-register-table-scroll"),
  );
  await footer.getByRole("button", { name: "Next", exact: true }).click();
  await expect(footer).toContainText("Page 2 of 2");
  await expect(footer).toBeInViewport();
  await expectNoDocumentVerticalOverflow(page);
});

test("desktop Recurring keeps overflowing definitions inside its table", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name}${Date.now()}`;
  const fundingId = await createAccount(page, `E2ECanvas:${unique}:Funding`);
  const destinationId = await createAccount(
    page,
    `E2ECanvas:${unique}:Destination`,
  );
  const prefix = `E2ECanvasRecurring:${unique}`;
  for (let index = 0; index < 24; index += 1) {
    const response = await page.request.post("/api/recurring-definitions", {
      data: {
        anchor_date: "2099-01-01",
        fqn: `${prefix}:Definition${String(index).padStart(2, "0")}`,
        schedule_rule: { every: 1, kind: "interval", unit: "YEAR", version: 1 },
        records: [
          {
            account_id: fundingId,
            amount: "-10",
            currency: "USD",
            tag_ids: [],
          },
          {
            account_id: destinationId,
            amount: "10",
            currency: "USD",
            tag_ids: [],
          },
        ],
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }

  await page.setViewportSize({ width: 1280, height: 633 });
  await page.goto(`/recurring?q=${encodeURIComponent(prefix)}`);
  await expect(page.getByTestId("recurring-definition-row")).toHaveCount(24);
  const scroller = page.getByTestId("recurring-definitions-table-scroll");
  await expectNoDocumentVerticalOverflow(page);
  await expectInternalScrollWithReachableHeader(page, scroller);
  await expectNoDocumentVerticalOverflow(page);
});

test("desktop Categories keeps overflowing paths inside its table", async ({
  page,
}, testInfo) => {
  const prefix = `E2ECanvasCategories:${testInfo.project.name}${Date.now()}:Household`;
  for (let index = 0; index < 24; index += 1) {
    await createCategory(
      page,
      `${prefix}:Row${String(index).padStart(2, "0")}`,
    );
  }

  await page.setViewportSize({ width: 1280, height: 633 });
  await page.goto(`/categories?q=${encodeURIComponent(prefix)}`);
  await expect(
    page.getByLabel(`Open category ${prefix}:Row00`, { exact: true }),
  ).toBeVisible();
  const scroller = page.getByTestId("reference-table-scroll");
  await expectNoDocumentVerticalOverflow(page);
  await expectInternalScrollWithReachableHeader(page, scroller);
  await expectNoDocumentVerticalOverflow(page);
});

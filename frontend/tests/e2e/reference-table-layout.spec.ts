import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

const createAccount = async (page: Page, fqn: string): Promise<void> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: "owned",
      currency: "USD",
      fqn,
      is_hidden: false,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
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

  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

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

import { expect, type Locator, type Page, test } from "@playwright/test";

const longRowCount = 32;

interface ReferenceTableTarget {
  readonly frameTestId: string;
  readonly path: string;
  readonly rowTestId: string;
  readonly rowText: string;
  readonly shortNeedle: string;
}

const createAccount = async (page: Page, fqn: string): Promise<void> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: "balance",
      currency: "USD",
      fqn,
      is_hidden: false,
    },
  });
  expect(response.ok()).toBe(true);
};

const createCategory = async (page: Page, fqn: string): Promise<void> => {
  const response = await page.request.post("/api/categories", {
    data: { economic_intent: "expense", fqn, is_hidden: false },
  });
  expect(response.ok()).toBe(true);
};

const createTag = async (page: Page, fqn: string): Promise<void> => {
  const response = await page.request.post("/api/tags", {
    data: { fqn, is_hidden: false },
  });
  expect(response.ok()).toBe(true);
};

const createMember = async (page: Page, name: string): Promise<void> => {
  const response = await page.request.post("/api/members", { data: { name } });
  expect(response.ok()).toBe(true);
};

const expectFrameAlignedWithSidebarInset = async (
  frame: Locator,
): Promise<void> => {
  const geometry = await frame.evaluate((element) => {
    const sidebarControl = document.querySelector(
      "aside button[aria-label$='sidebar']",
    );
    const sidebarControlBottom = sidebarControl?.getBoundingClientRect().bottom;
    return {
      frameBottom: element.getBoundingClientRect().bottom,
      sidebarControlBottom,
    };
  });

  expect(geometry.sidebarControlBottom).toBeDefined();
  expect(
    Math.abs(geometry.frameBottom - (geometry.sidebarControlBottom ?? 0)),
  ).toBeLessThanOrEqual(4);
};

const expectLongTableToScrollInternally = async (
  page: Page,
  frame: Locator,
  scroller: Locator,
): Promise<void> => {
  const dimensions = await scroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
  await expectFrameAlignedWithSidebarInset(frame);

  const windowScrollBefore = await page.evaluate(() => window.scrollY);
  await scroller.evaluate((element) => {
    element.scrollTop = Math.floor(element.clientHeight / 2);
  });
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(windowScrollBefore);

  const stickyGeometry = await scroller.evaluate((element) => {
    const header = element.querySelector("thead");
    return {
      headerTop: header?.getBoundingClientRect().top,
      scrollerTop: element.getBoundingClientRect().top,
    };
  });
  expect(stickyGeometry.headerTop).toBeDefined();
  expect(
    Math.abs(
      (stickyGeometry.headerTop ?? 0) - (stickyGeometry.scrollerTop ?? 0),
    ),
  ).toBeLessThanOrEqual(2);
};

const expectShortTableToKeepInsetWithoutOverflow = async (
  frame: Locator,
  scroller: Locator,
): Promise<void> => {
  const dimensions = await scroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(
    dimensions.clientHeight + 1,
  );
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
  await expectFrameAlignedWithSidebarInset(frame);
};

test("reference tables keep their framed viewport inset and scroll internally", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const accountsPrefix = `E2EScrollAccounts:${unique}`;
  const categoriesPrefix = `E2EScrollCategories:${unique}`;
  const tagsPrefix = `E2EScrollTags:${unique}`;
  const membersPrefix = `E2E Scroll Members ${unique}`;
  const rowSuffixes = Array.from(
    { length: longRowCount },
    (_, index) => `Row${String(index).padStart(2, "0")}`,
  );

  for (const suffix of rowSuffixes) {
    await createAccount(page, `${accountsPrefix}:${suffix}`);
    await createCategory(page, `${categoriesPrefix}:${suffix}`);
    await createTag(page, `${tagsPrefix}:${suffix}`);
    await createMember(page, `${membersPrefix} ${suffix}`);
  }

  const tables: readonly ReferenceTableTarget[] = [
    {
      frameTestId: "accounts-table-frame",
      path: "/accounts",
      rowTestId: "accounts-tree-row",
      rowText: "Row00",
      shortNeedle: `${accountsPrefix}:Row00`,
    },
    {
      frameTestId: "reference-table-frame",
      path: "/categories",
      rowTestId: "categories-tree-row",
      rowText: "Row00",
      shortNeedle: `${categoriesPrefix}:Row00`,
    },
    {
      frameTestId: "reference-table-frame",
      path: "/tags",
      rowTestId: "tags-tree-row",
      rowText: "Row00",
      shortNeedle: `${tagsPrefix}:Row00`,
    },
    {
      frameTestId: "reference-table-frame",
      path: "/members",
      rowTestId: "members-list-row",
      rowText: "Row00",
      shortNeedle: `${membersPrefix} Row00`,
    },
  ];

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const table of tables) {
    await page.goto(table.path);
    const rows = page.getByTestId(table.rowTestId);
    await expect(rows.filter({ hasText: table.rowText }).first()).toBeVisible();
    await expect.poll(() => rows.count()).toBeGreaterThan(longRowCount - 1);
    await expectLongTableToScrollInternally(
      page,
      page.getByTestId(table.frameTestId),
      page.getByTestId(
        table.frameTestId === "accounts-table-frame"
          ? "accounts-table-scroll"
          : "reference-table-scroll",
      ),
    );
  }

  await page.setViewportSize({ width: 1200, height: 900 });
  for (const table of tables) {
    await page.goto(table.path);
    await page.getByLabel("Search").fill(table.shortNeedle);
    await expect(
      page.getByTestId(table.rowTestId).filter({ hasText: table.rowText }),
    ).toBeVisible();
    await expectShortTableToKeepInsetWithoutOverflow(
      page.getByTestId(table.frameTestId),
      page.getByTestId(
        table.frameTestId === "accounts-table-frame"
          ? "accounts-table-scroll"
          : "reference-table-scroll",
      ),
    );
  }
});

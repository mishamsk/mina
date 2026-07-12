import { expect, type Locator, type Page, test } from "@playwright/test";

const longRowCount = 32;

interface ReferenceTableTarget {
  readonly compactMaxWidth?: number;
  readonly frameTestId: string;
  readonly layout: "compact" | "wide";
  readonly path: string;
  readonly rowTestId: string;
  readonly rowText: string;
  readonly shortNeedle: string;
}

const expectReferenceFrameLayout = async (
  frame: Locator,
  layout: ReferenceTableTarget["layout"],
  compactMaxWidth?: number,
): Promise<void> => {
  const geometry = await frame.evaluate((element) => {
    const main = document.querySelector("main");
    const actionHeader = element.querySelector("thead th:last-child");
    const mainRect = main?.getBoundingClientRect();
    const mainStyles = main ? window.getComputedStyle(main) : undefined;
    const frameRect = element.getBoundingClientRect();

    return {
      actionHeaderRight: actionHeader?.getBoundingClientRect().right,
      contentLeft:
        (mainRect?.left ?? 0) +
        Number.parseFloat(mainStyles?.paddingLeft ?? "0"),
      contentRight:
        (mainRect?.right ?? 0) -
        Number.parseFloat(mainStyles?.paddingRight ?? "0"),
      frameLeft: frameRect.left,
      frameRight: frameRect.right,
      frameWidth: frameRect.width,
    };
  });

  expect(
    Math.abs(geometry.frameLeft - geometry.contentLeft),
  ).toBeLessThanOrEqual(2);
  expect(geometry.actionHeaderRight).toBeDefined();
  expect(
    geometry.frameRight - (geometry.actionHeaderRight ?? geometry.frameLeft),
  ).toBeLessThanOrEqual(3);

  if (layout === "compact") {
    expect(compactMaxWidth).toBeDefined();
    expect(geometry.frameWidth).toBeLessThanOrEqual((compactMaxWidth ?? 0) + 2);
    expect(geometry.frameWidth).toBeGreaterThanOrEqual(
      (compactMaxWidth ?? 0) - 2,
    );
    expect(geometry.frameRight).toBeLessThan(geometry.contentRight);
    return;
  }

  expect(
    Math.abs(geometry.frameRight - geometry.contentRight),
  ).toBeLessThanOrEqual(2);
};

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

const expectBlankActionHeaderWithMatchedInset = async (
  scroller: Locator,
): Promise<void> => {
  const geometry = await scroller.evaluate((element) => {
    const headers = element.querySelectorAll("thead th");
    const firstHeader = headers.item(0);
    const actionHeader = headers.item(headers.length - 1);
    const firstHeaderStyles = firstHeader
      ? window.getComputedStyle(firstHeader)
      : undefined;
    const actionHeaderStyles = actionHeader
      ? window.getComputedStyle(actionHeader)
      : undefined;

    return {
      actionHeaderText: actionHeader?.textContent?.trim(),
      leadingPadding: Number.parseFloat(firstHeaderStyles?.paddingLeft ?? "0"),
      trailingPadding: Number.parseFloat(
        actionHeaderStyles?.paddingRight ?? "0",
      ),
    };
  });

  expect(geometry.actionHeaderText).toBe("");
  expect(
    Math.abs(geometry.trailingPadding - geometry.leadingPadding),
  ).toBeLessThanOrEqual(1);
};

const expectSameHorizontalSlot = async (
  first: Locator,
  second: Locator,
): Promise<void> => {
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(firstBox?.x).toBeCloseTo(secondBox?.x ?? 0, 4);
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
      layout: "wide",
      path: "/accounts",
      rowTestId: "accounts-tree-row",
      rowText: "Row00",
      shortNeedle: `${accountsPrefix}:Row00`,
    },
    {
      frameTestId: "reference-table-frame",
      layout: "wide",
      path: "/categories",
      rowTestId: "categories-tree-row",
      rowText: "Row00",
      shortNeedle: `${categoriesPrefix}:Row00`,
    },
    {
      compactMaxWidth: 896,
      frameTestId: "reference-table-frame",
      layout: "compact",
      path: "/tags",
      rowTestId: "tags-tree-row",
      rowText: "Row00",
      shortNeedle: `${tagsPrefix}:Row00`,
    },
    {
      compactMaxWidth: 768,
      frameTestId: "reference-table-frame",
      layout: "compact",
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
    await expectBlankActionHeaderWithMatchedInset(
      page.getByTestId(
        table.frameTestId === "accounts-table-frame"
          ? "accounts-table-scroll"
          : "reference-table-scroll",
      ),
    );
    await expectReferenceFrameLayout(
      page.getByTestId(table.frameTestId),
      table.layout,
      table.compactMaxWidth,
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
    await expectBlankActionHeaderWithMatchedInset(
      page.getByTestId(
        table.frameTestId === "accounts-table-frame"
          ? "accounts-table-scroll"
          : "reference-table-scroll",
      ),
    );
  }
});

test("reference-table indicator slots keep hidden eyes aligned and stars unclipped", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const accountParent = `E2ESlotsAccounts:${unique}`;
  const accountLeaf = `${accountParent}:Leaf`;
  const categoryPrefix = `E2ESlotsCategories:${unique}`;
  const categoryFirst = `${categoryPrefix}:First`;
  const categorySecond = `${categoryPrefix}:Second`;
  const tagPrefix = `E2ESlotsTags:${unique}`;
  const tagFirst = `${tagPrefix}:First`;
  const tagSecond = `${tagPrefix}:Second`;

  await createAccount(page, accountLeaf);
  await createCategory(page, categoryFirst);
  await createCategory(page, categorySecond);
  await createTag(page, tagFirst);
  await createTag(page, tagSecond);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/accounts?q=${encodeURIComponent(accountParent)}`);
  const accountLeafRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: accountLeaf })
    .first();
  const accountGroupRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: accountParent })
    .filter({ hasNotText: "Leaf" })
    .first();
  const accountStar = accountLeafRow.getByRole("button", {
    name: "Feature account",
  });
  await expect(accountLeafRow).toBeVisible();
  await expect(accountGroupRow).toBeVisible();
  const starBox = await accountStar.locator("svg").boundingBox();
  const hiddenAccountBox = await accountLeafRow
    .getByRole("button", { name: "Hide account" })
    .boundingBox();
  expect(starBox).not.toBeNull();
  expect(hiddenAccountBox).not.toBeNull();
  expect(starBox?.x).toBeLessThan(hiddenAccountBox?.x ?? 0);
  expect(starBox?.height).toBeGreaterThanOrEqual(24);
  await expectSameHorizontalSlot(
    accountLeafRow.getByRole("button", { name: "Hide account" }),
    accountGroupRow.getByRole("button", { name: "Hide group" }),
  );

  await page.goto(`/categories?q=${encodeURIComponent(categoryPrefix)}`);
  const categoryRows = page.getByTestId("categories-tree-row");
  await expectSameHorizontalSlot(
    categoryRows
      .filter({ hasText: categoryFirst })
      .getByRole("button", { name: "Hide category" }),
    categoryRows
      .filter({ hasText: categorySecond })
      .getByRole("button", { name: "Hide category" }),
  );

  await page.goto(`/tags?q=${encodeURIComponent(tagPrefix)}`);
  const tagRows = page.getByTestId("tags-tree-row");
  await expectSameHorizontalSlot(
    tagRows
      .filter({ hasText: tagFirst })
      .getByRole("button", { name: "Hide tag" }),
    tagRows
      .filter({ hasText: tagSecond })
      .getByRole("button", { name: "Hide tag" }),
  );
});

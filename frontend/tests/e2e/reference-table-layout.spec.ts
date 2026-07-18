import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

const longRowCount = 32;

interface ReferenceTableTarget {
  readonly compactMaxWidth?: number;
  readonly createFixture: (page: Page, name: string) => Promise<void>;
  readonly fixtureName: (unique: string, suffix: string) => string;
  readonly frameTestId: string;
  readonly layout: "compact" | "wide";
  readonly name: string;
  readonly path: string;
  readonly rowTestId: string;
  readonly rowText: string;
  readonly scrollerTestId: string;
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

const referenceTableTargets: readonly ReferenceTableTarget[] = [
  {
    createFixture: createAccount,
    fixtureName: (unique, suffix) => `E2EScrollAccounts:${unique}:${suffix}`,
    frameTestId: "accounts-table-frame",
    layout: "wide",
    name: "accounts",
    path: "/accounts",
    rowTestId: "accounts-tree-row",
    rowText: "Row00",
    scrollerTestId: "accounts-table-scroll",
  },
  {
    createFixture: createCategory,
    fixtureName: (unique, suffix) => `E2EScrollCategories:${unique}:${suffix}`,
    frameTestId: "reference-table-frame",
    layout: "wide",
    name: "categories",
    path: "/categories",
    rowTestId: "categories-tree-row",
    rowText: "Row00",
    scrollerTestId: "reference-table-scroll",
  },
  {
    compactMaxWidth: 896,
    createFixture: createTag,
    fixtureName: (unique, suffix) => `E2EScrollTags:${unique}:${suffix}`,
    frameTestId: "reference-table-frame",
    layout: "compact",
    name: "tags",
    path: "/tags",
    rowTestId: "tags-tree-row",
    rowText: "Row00",
    scrollerTestId: "reference-table-scroll",
  },
  {
    compactMaxWidth: 768,
    createFixture: createMember,
    fixtureName: (unique, suffix) =>
      `ZZZ E2E Scroll Members ${unique} ${suffix}`,
    frameTestId: "reference-table-frame",
    layout: "compact",
    name: "members",
    path: "/members",
    rowTestId: "members-list-row",
    rowText: "Row00",
    scrollerTestId: "reference-table-scroll",
  },
];

for (const table of referenceTableTargets) {
  test(`reference ${table.name} table keeps its framed viewport inset and scrolls internally`, async ({
    page,
  }, testInfo) => {
    const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
    const rowSuffixes = Array.from(
      { length: longRowCount },
      (_, index) => `Row${String(index).padStart(2, "0")}`,
    );

    for (const suffix of rowSuffixes) {
      await table.createFixture(page, table.fixtureName(unique, suffix));
    }

    const frame = page.getByTestId(table.frameTestId);
    const scroller = page.getByTestId(table.scrollerTestId);
    const rows = page.getByTestId(table.rowTestId);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(table.path);
    await expect(rows.filter({ hasText: table.rowText }).first()).toBeVisible();
    await expect.poll(() => rows.count()).toBeGreaterThan(longRowCount - 1);
    await expectLongTableToScrollInternally(page, frame, scroller);
    await expectBlankActionHeaderWithMatchedInset(scroller);
    await expectReferenceFrameLayout(
      frame,
      table.layout,
      table.compactMaxWidth,
    );

    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto(table.path);
    await page.getByLabel("Search").fill(table.fixtureName(unique, "Row00"));
    await expect(rows.filter({ hasText: table.rowText })).toBeVisible();
    await expectShortTableToKeepInsetWithoutOverflow(frame, scroller);
    await expectBlankActionHeaderWithMatchedInset(scroller);
  });
}

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

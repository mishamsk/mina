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

const createAccount = async (
  page: Page,
  fqn: string,
  isFeatured = false,
): Promise<void> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: "owned",
      currency: "USD",
      fqn,
      is_featured: isFeatured,
      is_hidden: false,
    },
  });
  expect(response.ok()).toBe(true);
};

const createAccountWithId = async (
  page: Page,
  fqn: string,
  isFeatured: boolean,
): Promise<number> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: "owned",
      currency: "USD",
      fqn,
      is_featured: isFeatured,
      is_hidden: false,
    },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { readonly account_id: number })
    .account_id;
};

const createCategory = async (
  page: Page,
  fqn: string,
  isFeatured = false,
): Promise<void> => {
  const response = await page.request.post("/api/categories", {
    data: {
      economic_intent: "expense",
      fqn,
      is_featured: isFeatured,
      is_hidden: false,
    },
  });
  expect(response.ok()).toBe(true);
};

const createTag = async (
  page: Page,
  fqn: string,
  isFeatured = false,
): Promise<void> => {
  const response = await page.request.post("/api/tags", {
    data: { fqn, is_featured: isFeatured, is_hidden: false },
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

const favoriteStarGeometry = (button: Locator, focus = false) =>
  button.evaluate((element, shouldFocus) => {
    if (shouldFocus) {
      element.focus({ preventScroll: true });
    }
    const iconBox = element.querySelector<HTMLElement>(
      ".row-actions-toggle-icon, [data-favorite-star-icon-box]",
    );
    const svg = element.querySelector<SVGSVGElement>(
      "[data-favorite-star-icon]",
    );
    const path = svg?.querySelector<SVGPathElement>("path");
    if (!iconBox || !svg || !path) {
      throw new Error("favorite star geometry elements are missing");
    }

    const rect = (target: Element) => {
      const bounds = target.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const clippingAncestors: string[] = [];
    let ancestor: Element | null = path;
    while (ancestor) {
      const styles = window.getComputedStyle(ancestor);
      if (styles.overflowX !== "visible" || styles.overflowY !== "visible") {
        clippingAncestors.push(ancestor.tagName.toLowerCase());
      }
      if (ancestor === element) {
        break;
      }
      ancestor = ancestor.parentElement;
    }

    return {
      button: rect(element),
      clippingAncestors,
      controlKind: element.classList.contains("row-actions-toggle")
        ? "row-action"
        : "labeled",
      focused: document.activeElement === element,
      iconBox: rect(iconBox),
      lowerPointsFilled:
        svg.dataset.state === "filled"
          ? [
              path.isPointInFill(new DOMPoint(4, 18)),
              path.isPointInFill(new DOMPoint(20, 18)),
            ]
          : undefined,
      path: rect(path),
      state: svg.dataset.state,
      svg: rect(svg),
      viewBox: svg.getAttribute("viewBox"),
    };
  }, focus);

const expectFavoriteStarGeometry = async (
  button: Locator,
  state: "filled" | "unfilled",
): Promise<void> => {
  const expectCurrentGeometry = async (focus = false) => {
    const geometry = await favoriteStarGeometry(button, focus);
    expect(geometry.state).toBe(state);
    expect(geometry.viewBox).toBe("0 0 24 24");
    if (focus) {
      expect(geometry.focused).toBe(true);
    }
    if (geometry.controlKind === "row-action") {
      expect(geometry.button.width).toBeCloseTo(28, 4);
      expect(geometry.button.height).toBeCloseTo(28, 4);
    } else {
      expect(geometry.button.width).toBeGreaterThan(geometry.iconBox.width);
      expect(geometry.button.height).toBeGreaterThan(geometry.iconBox.height);
    }
    expect(geometry.iconBox.width).toBeCloseTo(24, 4);
    expect(geometry.iconBox.height).toBeCloseTo(24, 4);
    expect(geometry.svg.width).toBeCloseTo(24, 4);
    expect(geometry.svg.height).toBeCloseTo(24, 4);
    expect(geometry.path.left).toBeGreaterThanOrEqual(geometry.iconBox.left);
    expect(geometry.path.top).toBeGreaterThanOrEqual(geometry.iconBox.top);
    expect(geometry.path.right).toBeLessThanOrEqual(geometry.iconBox.right);
    expect(geometry.path.bottom).toBeLessThanOrEqual(geometry.iconBox.bottom);
    expect(geometry.clippingAncestors).toEqual([]);
    if (state === "filled") {
      expect(geometry.lowerPointsFilled).toEqual([true, true]);
    }
  };

  await expect(button).toBeVisible();
  await expectCurrentGeometry();
  await button.hover();
  await expectCurrentGeometry();
  await expectCurrentGeometry(true);
};

const compactTableGeometry = (frame: Locator) =>
  frame.evaluate((element) => {
    const actionHeader = element.querySelector("thead th:last-child");
    const scroller = element.querySelector<HTMLElement>(
      "[data-testid='reference-table-scroll']",
    );
    const actionRect = actionHeader?.getBoundingClientRect();
    const frameRect = element.getBoundingClientRect();

    return {
      actionOffset: (actionRect?.left ?? 0) - frameRect.left,
      actionWidth: actionRect?.width,
      frameLeft: frameRect.left,
      frameWidth: frameRect.width,
      horizontalOverflow:
        (scroller?.scrollWidth ?? 0) - (scroller?.clientWidth ?? 0),
    };
  });

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
    compactMaxWidth: 896,
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

test("Members and Tags share compact table sizing at wide and narrow viewports", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memberName = `E2E Compact Member ${unique}`;
  const tagFqn = `E2ECompactTag${unique}`;
  await createMember(page, memberName);
  await createTag(page, tagFqn);

  const visitCompactTable = async ({
    path,
    rowTestId,
    rowText,
  }: {
    readonly path: string;
    readonly rowTestId: string;
    readonly rowText: string;
  }) => {
    await page.goto(`${path}?q=${encodeURIComponent(rowText)}`);
    const row = page
      .getByTestId(rowTestId)
      .filter({ hasText: rowText })
      .first();
    await expect(row).toBeVisible();
    return {
      frame: page.getByTestId("reference-table-frame"),
      row,
    };
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  const wideTags = await visitCompactTable({
    path: "/tags",
    rowTestId: "tags-tree-row",
    rowText: tagFqn,
  });
  const wideTagGeometry = await compactTableGeometry(wideTags.frame);
  const wideMembers = await visitCompactTable({
    path: "/members",
    rowTestId: "members-list-row",
    rowText: memberName,
  });
  const wideMemberGeometry = await compactTableGeometry(wideMembers.frame);

  expect(wideTagGeometry.frameWidth).toBeLessThanOrEqual(898);
  expect(wideTagGeometry.actionWidth).toBeDefined();
  expect(wideMemberGeometry.actionWidth).toBeDefined();
  expect(
    Math.abs(wideMemberGeometry.frameWidth - wideTagGeometry.frameWidth),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(wideMemberGeometry.frameLeft - wideTagGeometry.frameLeft),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(wideMemberGeometry.actionOffset - wideTagGeometry.actionOffset),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      (wideMemberGeometry.actionWidth ?? 0) -
        (wideTagGeometry.actionWidth ?? 0),
    ),
  ).toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 390, height: 900 });
  const narrowTags = await visitCompactTable({
    path: "/tags",
    rowTestId: "tags-tree-row",
    rowText: tagFqn,
  });
  const narrowTagGeometry = await compactTableGeometry(narrowTags.frame);
  await expect(
    narrowTags.row.getByRole("button", { name: "More row actions" }),
  ).toBeVisible();
  const narrowMembers = await visitCompactTable({
    path: "/members",
    rowTestId: "members-list-row",
    rowText: memberName,
  });
  const narrowMemberGeometry = await compactTableGeometry(narrowMembers.frame);
  await expect(
    narrowMembers.row.getByRole("button", { name: "More row actions" }),
  ).toBeVisible();

  expect(narrowTagGeometry.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(narrowMemberGeometry.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(
    Math.abs(narrowMemberGeometry.frameWidth - narrowTagGeometry.frameWidth),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      narrowMemberGeometry.actionOffset - narrowTagGeometry.actionOffset,
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      (narrowMemberGeometry.actionWidth ?? 0) -
        (narrowTagGeometry.actionWidth ?? 0),
    ),
  ).toBeLessThanOrEqual(2);
});

test("favorite stars stay inside their shared unclipped slot across table layouts and font scaling", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const accountParent = `E2ESlotsAccounts:${unique}`;
  const accountFilled = `${accountParent}:Filled`;
  const accountUnfilled = `${accountParent}:Unfilled`;
  const categoryPrefix = `E2ESlotsCategories:${unique}`;
  const categoryFilled = `${categoryPrefix}:Filled`;
  const categoryUnfilled = `${categoryPrefix}:Unfilled`;
  const tagPrefix = `E2ESlotsTags:${unique}`;
  const tagFilled = `${tagPrefix}:Filled`;
  const tagUnfilled = `${tagPrefix}:Unfilled`;

  const accountFilledId = await createAccountWithId(page, accountFilled, true);
  const accountUnfilledId = await createAccountWithId(
    page,
    accountUnfilled,
    false,
  );
  expect(accountFilledId).toBeGreaterThan(0);
  expect(accountUnfilledId).toBeGreaterThan(0);
  await createCategory(page, categoryFilled, true);
  await createCategory(page, categoryUnfilled);
  await createTag(page, tagFilled, true);
  await createTag(page, tagUnfilled);

  for (const viewportWidth of [1440, 1200]) {
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    for (const rootFontSize of ["16px", "20px"]) {
      const setRootFontSize = () =>
        page.evaluate((fontSize) => {
          document.documentElement.style.fontSize = fontSize;
        }, rootFontSize);

      await page.goto(`/accounts?q=${encodeURIComponent(accountParent)}`);
      await setRootFontSize();
      const filledAccountRow = page.getByRole("button", {
        name: `Open account ${accountFilled}`,
      });
      const unfilledAccountRow = page.getByRole("button", {
        name: `Open account ${accountUnfilled}`,
      });
      const accountGroupRow = page.getByRole("button", {
        exact: true,
        name: `Open account group ${accountParent}`,
      });
      await expect(accountGroupRow).toBeVisible();
      await expectFavoriteStarGeometry(
        filledAccountRow.getByRole("button", {
          name: "Unfeature account",
        }),
        "filled",
      );
      await expectFavoriteStarGeometry(
        unfilledAccountRow.getByRole("button", {
          name: "Feature account",
        }),
        "unfilled",
      );
      await expectSameHorizontalSlot(
        filledAccountRow.getByRole("button", { name: "Hide account" }),
        unfilledAccountRow.getByRole("button", { name: "Hide account" }),
      );
      await expectSameHorizontalSlot(
        filledAccountRow.getByRole("button", { name: "Hide account" }),
        accountGroupRow.getByRole("button", { name: "Hide group" }),
      );

      for (const [accountId, label, state] of [
        [accountFilledId, "Unfeature account", "filled"],
        [accountUnfilledId, "Feature account", "unfilled"],
      ] as const) {
        await page.goto(`/accounts/${accountId}`);
        await setRootFontSize();
        await expectFavoriteStarGeometry(
          page.getByTestId("account-header").getByRole("button", {
            name: label,
          }),
          state,
        );
      }

      await page.goto(`/categories?q=${encodeURIComponent(categoryPrefix)}`);
      await setRootFontSize();
      const categoryRows = page.getByTestId("categories-tree-row");
      await expectFavoriteStarGeometry(
        categoryRows
          .filter({ hasText: categoryFilled })
          .getByRole("button", { name: "Unfeature category" }),
        "filled",
      );
      await expectFavoriteStarGeometry(
        categoryRows
          .filter({ hasText: categoryUnfilled })
          .getByRole("button", { name: "Feature category" }),
        "unfilled",
      );

      await page.goto(`/tags?q=${encodeURIComponent(tagPrefix)}`);
      await setRootFontSize();
      const tagRows = page.getByTestId("tags-tree-row");
      await expectFavoriteStarGeometry(
        tagRows
          .filter({ hasText: tagFilled })
          .getByRole("button", { name: "Unfeature tag" }),
        "filled",
      );
      await expectFavoriteStarGeometry(
        tagRows
          .filter({ hasText: tagUnfilled })
          .getByRole("button", { name: "Feature tag" }),
        "unfilled",
      );
    }
  }
});

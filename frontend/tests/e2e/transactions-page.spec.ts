import { expect, type Locator, type Page, test } from "@playwright/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly fqn: string;
}

interface TagFixture {
  readonly fqn: string;
  readonly name: string;
  readonly tag_id: number;
}

interface MemberFixture {
  readonly member_id: number;
  readonly name: string;
}

interface TransactionFixture {
  readonly display_title: string;
  readonly initiated_date?: string;
  readonly transaction_id: number;
}

interface TransactionListFixture {
  readonly offset: number;
  readonly total_count: number;
  readonly transactions: readonly TransactionFixture[];
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

const expectTransactionsPageUrl = async (
  page: Page,
  expectedPage: number,
  expectedPageSize: number,
): Promise<void> => {
  await expect
    .poll(() => {
      const searchParams = new URL(page.url()).searchParams;
      return {
        anchorDate: searchParams.get("anchor_date"),
        page: searchParams.get("page"),
        pageSize: searchParams.get("pageSize"),
      };
    })
    .toEqual({
      anchorDate: null,
      page: String(expectedPage),
      pageSize: String(expectedPageSize),
    });
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

const createAccount = async (
  page: Page,
  fqn: string,
  accountType: "balance" | "flow",
  currency?: string,
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency,
      fqn,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as AccountFixture;
};

const hideTag = async (page: Page, tag: TagFixture): Promise<void> => {
  const response = await page.request.patch(`/api/tags/${tag.tag_id}`, {
    data: { is_hidden: true },
  });
  expect(response.ok()).toBe(true);
};

const amountChipsFitCell = async (row: Locator): Promise<boolean> =>
  row
    .locator("td")
    .nth(7)
    .evaluate((cell) => {
      const cellRect = cell.getBoundingClientRect();
      const chips = Array.from(
        cell.querySelectorAll<HTMLElement>("[data-testid='amount-chip']"),
      ).map((chip) => chip.getBoundingClientRect());
      return (
        chips.length > 0 &&
        chips.every(
          (chipRect) =>
            chipRect.left >= cellRect.left - 0.5 &&
            chipRect.right <= cellRect.right + 0.5,
        )
      );
    });

const chipShadowFitsClippingAncestors = async (
  chipContent: Locator,
): Promise<boolean> =>
  chipContent.evaluate((element) => {
    const chipShadowOffsetPx = 2;
    const chip =
      element.parentElement instanceof HTMLElement
        ? element.parentElement
        : element instanceof HTMLElement
          ? element
          : null;
    const row = chip?.closest("tr");
    if (!chip || !row) {
      return false;
    }

    const chipRect = chip.getBoundingClientRect();
    const shadowBounds = {
      bottom: chipRect.bottom + chipShadowOffsetPx,
      right: chipRect.right + chipShadowOffsetPx,
    };

    let ancestor: HTMLElement | null = chip.parentElement;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      const clipsX = style.overflowX !== "visible";
      const clipsY = style.overflowY !== "visible";
      if (clipsX || clipsY) {
        const rect = ancestor.getBoundingClientRect();
        if (
          (clipsX && shadowBounds.right > rect.right + 0.5) ||
          (clipsY && shadowBounds.bottom > rect.bottom + 0.5)
        ) {
          return false;
        }
      }
      if (ancestor === row) {
        break;
      }
      ancestor = ancestor.parentElement;
    }

    return true;
  });

const tagChipLineState = async (row: Locator) =>
  row
    .locator("td")
    .nth(5)
    .evaluate((cell) => {
      const list = cell.querySelector<HTMLElement>(
        "[data-testid='transaction-tag-chips-list']",
      );
      if (!list) {
        return {
          hiddenLabels: [],
          visibleLabels: [],
          visibleRowCount: 0,
        };
      }

      const clipRect = list.getBoundingClientRect();
      const chips = Array.from(list.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      const chipStates = chips.map((chip) => {
        const rect = chip.getBoundingClientRect();
        const visible =
          rect.left >= clipRect.left - 0.5 &&
          rect.right <= clipRect.right + 0.5 &&
          rect.top >= clipRect.top - 0.5 &&
          rect.bottom <= clipRect.bottom + 0.5;
        return {
          label: chip.textContent?.trim() ?? "",
          top: Math.round(rect.top),
          visible,
        };
      });
      const visibleStates = chipStates.filter((chip) => chip.visible);

      return {
        hiddenLabels: chipStates
          .filter((chip) => !chip.visible)
          .map((chip) => chip.label),
        visibleLabels: visibleStates.map((chip) => chip.label),
        visibleRowCount: new Set(visibleStates.map((chip) => chip.top)).size,
      };
    });

test("transactions page renders demo transaction lines and expands records", async ({
  page,
}) => {
  await page.goto("/transactions");

  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  await expect(page.getByText("Description")).toBeVisible();
  await expect(page.getByText("Amount")).toBeVisible();

  const transactionRows = page.locator("tbody > tr[aria-expanded]");
  const transferRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "TRANSFER" }) })
    .filter({ hasText: "120.00 $" })
    .first();
  await expect(transferRow).toBeVisible();
  await expect(transferRow).toContainText("→");
  await expect(transferRow).not.toContainText("+120.00 $");

  const firstRowBackgroundBefore = await transactionRows
    .nth(0)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const secondRowBackgroundBefore = await transactionRows
    .nth(1)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(firstRowBackgroundBefore).not.toBe(secondRowBackgroundBefore);

  await transferRow.click();
  await expect(transferRow).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Memo")).toBeVisible();
  await page.mouse.move(0, 0);

  const firstRowBackgroundAfter = await transactionRows
    .nth(0)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const secondRowBackgroundAfter = await transactionRows
    .nth(1)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(firstRowBackgroundAfter).toBe(firstRowBackgroundBefore);
  expect(secondRowBackgroundAfter).toBe(secondRowBackgroundBefore);

  await expect(page.getByTestId("transactions-table-scroll")).toContainText(
    "Memo",
  );
  const recordsFitTableContent = await page
    .getByTestId("transactions-table-scroll")
    .evaluate((container) => {
      const records = container.querySelector<HTMLElement>(
        "[data-testid='expanded-records']",
      );
      return records
        ? records.offsetLeft >= 0 &&
            records.offsetLeft + records.offsetWidth <= container.scrollWidth
        : false;
    });
  expect(recordsFitTableContent).toBe(true);
});

test("transactions page uses server pagination controls", async ({ page }) => {
  await page.goto("/transactions?page=1&pageSize=10");

  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  await expect(
    page.locator("tbody > tr[aria-expanded]").filter({ hasText: "→" }).first(),
  ).toBeVisible();
  const firstPageFirstTitle = (
    await page
      .locator("tbody > tr[aria-expanded]")
      .first()
      .locator("td")
      .nth(3)
      .innerText()
  ).split("\n")[0];
  const firstPageFirstDate = await page
    .locator("tbody > tr[aria-expanded]")
    .first()
    .locator("td")
    .nth(1)
    .innerText();
  expect(firstPageFirstDate).toContain("May");

  const amountColumnBefore = await page
    .getByRole("columnheader", { name: "Amount" })
    .boundingBox();
  expect(amountColumnBefore).not.toBeNull();

  let releaseNextPageResponse: (() => void) | undefined;
  const nextPageRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/transactions**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("offset") === "10") {
        resolve();
        await new Promise<void>((release) => {
          releaseNextPageResponse = release;
        });
      }
      await route.continue();
    });
  });

  await page.getByRole("button", { name: "Next" }).click();
  await nextPageRequestStarted;

  try {
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId("transactions-page-busy")).toBeVisible();
    const retainedRowText = await page
      .locator("tbody > tr[aria-expanded]")
      .first()
      .innerText();
    expect(retainedRowText).toContain(firstPageFirstTitle);
  } finally {
    releaseNextPageResponse?.();
  }

  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
  const amountColumnAfter = await page
    .getByRole("columnheader", { name: "Amount" })
    .boundingBox();
  expect(amountColumnAfter).not.toBeNull();
  expect(
    Math.abs((amountColumnBefore?.x ?? 0) - (amountColumnAfter?.x ?? 0)),
  ).toBeLessThan(1);
  expect(
    Math.abs(
      (amountColumnBefore?.width ?? 0) - (amountColumnAfter?.width ?? 0),
    ),
  ).toBeLessThan(1);

  await page.getByRole("button", { name: "Previous" }).click();

  await expect(page).toHaveURL(/page=1/);
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
});

test("transactions page jumps to a date-anchored page", async ({ page }) => {
  const initialResponse = await page.request.get(
    "/api/transactions?limit=25&offset=0&sort=initiated_date&sort_dir=desc",
  );
  expect(initialResponse.ok()).toBe(true);
  const initialPage = (await initialResponse.json()) as TransactionListFixture;
  expect(initialPage.transactions.length).toBeGreaterThan(20);

  const jumpDate = initialPage.transactions[10]!.initiated_date!;
  const olderThanEverything = "2020-01-01";

  await page.goto("/transactions?page=1&pageSize=10");
  await expect(
    page.getByText(initialPage.transactions[0]!.display_title),
  ).toBeVisible();
  const retainedFirstPageRow = await page
    .locator("tbody > tr[aria-expanded]")
    .first()
    .innerText();
  expect(retainedFirstPageRow).toContain(
    initialPage.transactions[0]!.display_title,
  );

  let releaseDateJumpResponse: (() => void) | undefined;
  const dateJumpRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/transactions**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("anchor_date") === jumpDate) {
        resolve();
        await new Promise<void>((release) => {
          releaseDateJumpResponse = release;
        });
      }
      await route.continue();
    });
  });
  const dateJumpResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === jumpDate
    );
  });
  const transactionRequestUrls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/transactions") {
      transactionRequestUrls.push(request.url());
    }
  });

  await page.getByLabel("Go to day").fill(jumpDate);
  await dateJumpRequestStarted;

  try {
    await expect(page.getByTestId("transactions-page-busy")).toBeVisible();
    const retainedDuringJump = await page
      .locator("tbody > tr[aria-expanded]")
      .first()
      .innerText();
    expect(retainedDuringJump).toContain(
      initialPage.transactions[0]!.display_title,
    );
  } finally {
    releaseDateJumpResponse?.();
  }

  const dateJumpBody = (await (
    await dateJumpResponse
  ).json()) as TransactionListFixture;
  const landedPage = Math.floor(dateJumpBody.offset / 10) + 1;
  expect(dateJumpBody.total_count).toBeGreaterThan(landedPage * 10);
  const landedTransaction = dateJumpBody.transactions[0]!;
  await expectTransactionsPageUrl(page, landedPage, 10);
  await expect(
    page.getByText(new RegExp(`Page ${landedPage} of \\d+`)),
  ).toBeVisible();
  await expect(
    page.getByText(landedTransaction.display_title).first(),
  ).toBeVisible();
  expect(
    transactionRequestUrls.filter((requestUrl) => {
      const url = new URL(requestUrl);
      return (
        url.searchParams.get("anchor_date") === null &&
        url.searchParams.get("limit") === "10" &&
        url.searchParams.get("offset") === String(dateJumpBody.offset)
      );
    }),
  ).toHaveLength(0);
  await expect(page.getByLabel("Go to day")).toHaveValue("");

  await page.getByRole("button", { name: "Next" }).click();
  await expectTransactionsPageUrl(page, landedPage + 1, 10);
  await expect(
    page.getByText(new RegExp(`Page ${landedPage + 1} of \\d+`)),
  ).toBeVisible();

  const oldDateJumpResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === olderThanEverything
    );
  });
  await page.getByLabel("Go to day").fill(olderThanEverything);
  const oldDateJumpBody = (await (
    await oldDateJumpResponse
  ).json()) as TransactionListFixture;
  const oldAnchorPage = Math.floor(oldDateJumpBody.offset / 10) + 1;
  await expectTransactionsPageUrl(page, oldAnchorPage, 10);
  await expect(
    page.getByText(new RegExp(`Page ${oldAnchorPage} of \\d+`)),
  ).toBeVisible();
});

test("transactions page collapses low-priority columns instead of scrolling horizontally", async ({
  page,
}) => {
  const measureTableState = async () =>
    page.getByTestId("transactions-table-scroll").evaluate((container) => {
      const rows = Array.from(
        container.querySelectorAll("tbody > tr[aria-expanded]"),
      );
      const row =
        rows.find((candidate) =>
          candidate.textContent?.includes("BlueCash → Target"),
        ) ?? rows[0];
      const headerCells = container.querySelectorAll("thead th");
      const cells = row?.querySelectorAll("td");
      const rectFor = (cell: Element | undefined) => {
        const rect = cell?.getBoundingClientRect();
        return rect
          ? {
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              width: rect.width,
            }
          : undefined;
      };
      const isCollapsed = (cell: Element | undefined) => {
        if (!cell) {
          return true;
        }
        const style = getComputedStyle(cell);
        const rect = cell.getBoundingClientRect();
        return (
          style.display === "none" ||
          style.visibility === "collapse" ||
          rect.width < 1
        );
      };
      const amountRect = rectFor(cells?.[7]);
      const amountCell = cells?.[7];
      const containerRect = container.getBoundingClientRect();
      const memberRect = rectFor(cells?.[6]);
      const memberContentRects = Array.from(
        cells?.[6]?.querySelectorAll("*") ?? [],
      )
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const amountContentRects = Array.from(
        amountCell?.querySelectorAll("*") ?? [],
      )
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const hasTruncatedContent = (cell: Element | undefined) =>
        Array.from(cell?.querySelectorAll<HTMLElement>("*") ?? []).some(
          (element) => {
            const style = getComputedStyle(element);
            return (
              style.overflow !== "visible" &&
              element.scrollWidth > element.clientWidth + 1
            );
          },
        );
      const visibleAmountCells = rows
        .map((visibleRow) => visibleRow.querySelectorAll("td")[7])
        .filter((cell): cell is HTMLTableCellElement => !isCollapsed(cell));
      const contentOverlappingAmount = amountRect
        ? Array.from(cells ?? [])
            .slice(0, 7)
            .filter((cell) => !isCollapsed(cell))
            .flatMap((cell) => [
              cell,
              ...Array.from(cell.querySelectorAll("*")),
            ])
            .some((element) => {
              const rect = element.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.right > amountRect.left + 0.5 &&
                rect.left < amountRect.right - 0.5
              );
            })
        : true;

      return {
        categoryCollapsed: isCollapsed(cells?.[4]),
        categoryHeaderCollapsed: isCollapsed(headerCells[4]),
        containerWidth: container.getBoundingClientRect().width,
        hasHorizontalOverflow:
          container.scrollWidth > container.clientWidth + 1,
        amountCellRightWithinContainer:
          amountRect !== undefined &&
          amountRect.right <= containerRect.right + 0.5,
        amountContentRightWithinContainer: amountRect
          ? amountContentRects.every(
              (rect) => rect.right <= containerRect.right + 0.5,
            )
          : false,
        amountHasTruncatedContent: visibleAmountCells.some((cell) =>
          hasTruncatedContent(cell),
        ),
        amountTexts: visibleAmountCells.map((cell) =>
          cell.innerText.replace(/\s+/g, " ").trim(),
        ),
        amountText: amountCell?.innerText.replace(/\s+/g, " ").trim(),
        memberCollapsed: isCollapsed(cells?.[6]),
        memberFullyVisible:
          isCollapsed(cells?.[6]) ||
          (Boolean(memberRect) &&
            memberContentRects.every(
              (rect) =>
                rect.left >= (memberRect?.left ?? 0) - 0.5 &&
                rect.right <= (memberRect?.right ?? 0) + 0.5 &&
                (!amountRect || rect.right <= amountRect.left + 0.5),
            )),
        memberHeaderCollapsed: isCollapsed(headerCells[6]),
        statusCollapsed: isCollapsed(cells?.[2]),
        statusHeaderCollapsed: isCollapsed(headerCells[2]),
        tagsCollapsed: isCollapsed(cells?.[5]),
        tagsHeaderCollapsed: isCollapsed(headerCells[5]),
        visibleContentOverlapsAmount: contentOverlappingAmount,
      };
    });

  await page.setViewportSize({ width: 1000, height: 720 });
  await page.goto("/transactions?page=1&pageSize=50");

  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();

  const intermediateTableState = await measureTableState();

  expect(intermediateTableState.hasHorizontalOverflow).toBe(false);
  expect(intermediateTableState.amountCellRightWithinContainer).toBe(true);
  expect(intermediateTableState.amountContentRightWithinContainer).toBe(true);
  expect(intermediateTableState.amountHasTruncatedContent).toBe(false);
  expect(intermediateTableState.amountText).toBe("-43.98 $");
  expect(intermediateTableState.amountTexts).toContain("+3,250.00 $");
  expect(intermediateTableState.memberFullyVisible).toBe(true);
  expect(intermediateTableState.visibleContentOverlapsAmount).toBe(false);
  expect(intermediateTableState.statusHeaderCollapsed).toBe(
    intermediateTableState.statusCollapsed,
  );
  expect(intermediateTableState.memberHeaderCollapsed).toBe(
    intermediateTableState.memberCollapsed,
  );
  expect(intermediateTableState.tagsHeaderCollapsed).toBe(
    intermediateTableState.tagsCollapsed,
  );
  expect(intermediateTableState.categoryHeaderCollapsed).toBe(
    intermediateTableState.categoryCollapsed,
  );

  for (const width of [1600, 1440, 1000, 820, 800, 700]) {
    await page.setViewportSize({ width, height: 720 });
    const tableState = await measureTableState();

    expect(tableState.hasHorizontalOverflow).toBe(false);
    expect(tableState.amountCellRightWithinContainer).toBe(true);
    expect(tableState.amountContentRightWithinContainer).toBe(true);
    expect(tableState.amountHasTruncatedContent).toBe(false);
    expect(tableState.amountText).toBe("-43.98 $");
    expect(tableState.amountTexts).toContain("+3,250.00 $");
    expect(tableState.visibleContentOverlapsAmount).toBe(false);
    if (tableState.categoryCollapsed) {
      expect(tableState.tagsCollapsed).toBe(true);
    }
    if (tableState.tagsCollapsed) {
      expect(tableState.memberCollapsed).toBe(true);
    }
    if (tableState.memberCollapsed) {
      expect(tableState.statusCollapsed).toBe(true);
    }
  }

  expect(intermediateTableState.memberCollapsed).toBe(true);
});

test("transactions contain long amount chips and align the pagination footer", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const incomeDestinationAccount = findByFqn(accounts, "checking:Chase:Joint");
  const incomeSourceAccount = findByFqn(accounts, "income:AcmePayroll");
  const category = findByFqn(categories, "Entertainment:Books");
  const incomeCategory = findByFqn(categories, "Income:Salary");
  const memo = `E2E long amount ${unique}`;
  const mixedMemo = `E2E mixed long amount ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "9999999999.99",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);

  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-05-31",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-9999999999.99",
          category_id: category.category_id,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: merchantAccount.account_id,
          amount: "9999999999.99",
          category_id: category.category_id,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: incomeDestinationAccount.account_id,
          amount: "8888888888.88",
          category_id: incomeCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: incomeSourceAccount.account_id,
          amount: "-8888888888.88",
          category_id: incomeCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
        },
      ],
    },
  });
  expect(mixedResponse.ok()).toBe(true);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const footerBox = await page
    .getByTestId("transactions-pagination-footer")
    .boundingBox();
  const collapseBox = await page
    .getByRole("button", { name: "Collapse sidebar" })
    .boundingBox();
  expect(footerBox).not.toBeNull();
  expect(collapseBox).not.toBeNull();
  expect(
    Math.abs(
      (footerBox?.y ?? 0) +
        (footerBox?.height ?? 0) -
        ((collapseBox?.y ?? 0) + (collapseBox?.height ?? 0)),
    ),
  ).toBeLessThanOrEqual(1);

  for (const width of [1600, 1000, 700]) {
    await page.setViewportSize({ width, height: 720 });
    const longAmountRow = page.getByRole("row").filter({ hasText: memo });
    await expect(longAmountRow).toBeVisible();
    await expect(longAmountRow.locator("td").nth(7)).toContainText(
      "-9,999,999,999.99 $",
    );
    const mixedLongAmountRow = page
      .getByRole("row")
      .filter({ hasText: mixedMemo });
    await expect(mixedLongAmountRow).toBeVisible();
    await expect(mixedLongAmountRow.locator("td").nth(7)).toContainText(
      "-9,999,999,999.99",
    );
    await expect(mixedLongAmountRow.locator("td").nth(7)).toContainText(
      "+8,888,888,888.88",
    );
    await expect(mixedLongAmountRow.locator("td").nth(7)).toContainText("$");

    await expect(amountChipsFitCell(longAmountRow)).resolves.toBe(true);
    await expect(amountChipsFitCell(mixedLongAmountRow)).resolves.toBe(true);
  }
});

test("transactions display currency symbols with code fallback", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [categories] = await Promise.all([
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const category = findByFqn(categories, "Entertainment:Books");
  const fundingAccount = await createAccount(
    page,
    `e2e:fallback:${unique}:cash`,
    "balance",
    "XDR",
  );
  const merchantAccount = await createAccount(
    page,
    `e2e:fallback:${unique}:merchant`,
    "flow",
  );
  const memo = `E2E fallback currency ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "3.21",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "XDR",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "BlueCash → Target" })
      .first()
      .locator("td")
      .nth(7),
  ).toContainText("-43.98 $");
  await expect(
    page.getByRole("row").filter({ hasText: memo }).locator("td").nth(7),
  ).toContainText("-3.21 XDR");
});

test("transactions page help and leaf category chips", async ({ page }) => {
  await page.goto("/transactions?page=1&pageSize=50");

  await expect(
    page.getByText("Classified transaction lines with inline journal records."),
  ).toBeHidden();

  await page.getByRole("button", { name: "Transactions help" }).click();
  await expect(
    page.getByText("Classified transaction lines with inline journal records."),
  ).toBeVisible();

  const simpleSpendRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "SPEND" }) })
    .filter({ hasText: "BlueCash → Target" })
    .first();
  await expect(simpleSpendRow).toBeVisible();
  await expect(simpleSpendRow.locator("td").nth(6)).not.toContainText("Mixed");
  await expect(simpleSpendRow.locator("td").nth(7)).toContainText(/-43\.98 \$/);

  const mixedRow = page
    .getByRole("row")
    .filter({ hasText: "Mixed payroll correction" })
    .first();
  await expect(mixedRow).toBeVisible();
  await expect(
    mixedRow.locator("td").nth(4).getByText("Mixed", { exact: true }),
  ).toBeVisible();
  await expect(mixedRow.locator("td").nth(7)).toContainText(
    "-5.00 / +100.00 $",
  );
  const rowHeights = await page
    .locator("tbody > tr[aria-expanded]")
    .evaluateAll((rows) => {
      const mixed = rows.find((row) =>
        row.textContent?.includes("Mixed payroll correction"),
      );
      const ordinarySingleLine = rows.find((row) =>
        row.textContent?.includes("BlueCash → Target"),
      );
      return {
        mixed: mixed?.getBoundingClientRect().height,
        ordinary: ordinarySingleLine?.getBoundingClientRect().height,
      };
    });
  expect(rowHeights.mixed).toBe(rowHeights.ordinary);

  const exchangeRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "EXCHANGE" }) })
    .filter({ hasText: "USD → EUR" })
    .first();
  await expect(exchangeRow).toContainText("-224.00 $");
  await expect(exchangeRow).not.toContainText("200.00 €");

  const spendIcon = page.getByRole("img", { name: "SPEND" }).first();
  await expect(spendIcon).toBeVisible();
  await spendIcon.hover();
  const spendTooltip = page.getByRole("tooltip").filter({ hasText: "SPEND" });
  await expect(spendTooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(spendTooltip).toBeHidden();

  const booksCategory = page
    .locator("tbody tr")
    .filter({ hasText: "Books" })
    .first()
    .locator("td")
    .nth(4);
  await expect(booksCategory.getByText("Books", { exact: true })).toBeVisible();
  await booksCategory.getByText("Books", { exact: true }).hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Entertainment:Books" }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).toBeHidden();

  const openDetailButton = page
    .getByRole("button", { name: "Open transaction detail" })
    .first();
  await openDetailButton.focus();
  await expect(openDetailButton).toBeFocused();
  const openDetailTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Open transaction detail" });
  await expect(openDetailTooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(openDetailTooltip).toBeHidden();
});

test("transactions line composition uses compact dates and single-line leaf tags", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 720 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const fitTagFqns = [
    `E2E:WrapFit:${unique}:FitAlpha${unique}`,
    `E2E:WrapFit:${unique}:FitBravo${unique}`,
    `E2E:WrapFit:${unique}:FitCedar${unique}`,
    `E2E:WrapFit:${unique}:FitDelta${unique}`,
  ];
  const overflowTooltipTagFqn = `E2E:WrapOverflow:${unique}:Aardvark${unique}`;
  const overflowTagFqns = [
    overflowTooltipTagFqn,
    ...Array.from(
      { length: 11 },
      (_, index) =>
        `E2E:WrapOverflow:${unique}:Overflow${String(index + 1).padStart(2, "0")}${unique}`,
    ),
  ];
  const memberName = `QA${unique}`;
  const createdFitTags = await Promise.all(
    fitTagFqns.map((fqn) => createTag(page, fqn)),
  );
  const createdOverflowTags = await Promise.all(
    overflowTagFqns.map((fqn) => createTag(page, fqn)),
  );
  const overflowTagFqnsByName = new Map(
    createdOverflowTags.map((tag) => [tag.name, tag.fqn]),
  );
  const member = await createMember(page, memberName);
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const fitMemo = `E2E fitting tags ${unique}`;
  const overflowMemo = `E2E overflowing tags ${unique}`;
  const noMemoLeaf = `NoMemo${unique}`;
  const noMemoMerchantAccount = await createAccount(
    page,
    `merchant:E2E:${noMemoLeaf}`,
    "flow",
  );

  const fitSpendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "7.31",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo: fitMemo,
      tag_ids: createdFitTags.map((tag) => tag.tag_id),
    },
  });
  expect(fitSpendResponse.ok()).toBe(true);

  const overflowSpendResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "7.32",
        category_id: category.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-05-31",
        member_id: member.member_id,
        memo: overflowMemo,
        tag_ids: createdOverflowTags.map((tag) => tag.tag_id),
      },
    },
  );
  expect(overflowSpendResponse.ok()).toBe(true);

  const noMemoSpendResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "6.42",
        category_id: category.category_id,
        counterparty_account_id: noMemoMerchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-05-31",
        tag_ids: createdOverflowTags.map((tag) => tag.tag_id),
      },
    },
  );
  expect(noMemoSpendResponse.ok()).toBe(true);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const fitTagRow = page.getByRole("row").filter({ hasText: fitMemo }).first();
  await expect(fitTagRow).toBeVisible();
  const fitTagState = await tagChipLineState(fitTagRow);
  expect(fitTagState.visibleLabels.length).toBeGreaterThan(2);
  expect(fitTagState.visibleLabels).toEqual(
    expect.arrayContaining(createdFitTags.map((tag) => tag.name)),
  );
  expect(fitTagState.hiddenLabels).toEqual([]);
  expect(fitTagState.visibleRowCount).toBeLessThanOrEqual(2);
  await expect(
    fitTagRow.locator("td").nth(5).getByTestId("transaction-tags-overflow"),
  ).toHaveCount(0);

  const overflowTagRow = page
    .getByRole("row")
    .filter({ hasText: overflowMemo })
    .first();
  await expect(overflowTagRow).toBeVisible();

  const dateCell = overflowTagRow.locator("td").nth(1);
  await expect(dateCell.locator("div").nth(0)).toHaveText("May 31");
  await expect(dateCell.locator("div").nth(1)).toHaveText("2026");

  const statusCell = overflowTagRow.locator("td").nth(2);
  await expect(statusCell).toHaveText("");

  const overflowTagState = await tagChipLineState(overflowTagRow);
  expect(overflowTagState.visibleLabels.length).toBeGreaterThan(0);
  expect(overflowTagState.hiddenLabels.length).toBeGreaterThan(0);
  expect(overflowTagState.visibleRowCount).toBeLessThanOrEqual(2);

  const visibleOverflowTag = overflowTagRow
    .locator("td")
    .nth(5)
    .getByText(createdOverflowTags[0]?.name ?? "", { exact: true });
  await expect(visibleOverflowTag).toBeVisible();
  const overflowChip = overflowTagRow
    .locator("td")
    .nth(5)
    .getByTestId("transaction-tags-overflow");
  await expect(overflowChip).toBeVisible();
  const renderedOverflowTagLabels = await overflowTagRow
    .locator("td")
    .nth(5)
    .getByTestId("transaction-tag-chips-list")
    .evaluate((list) =>
      Array.from(list.children)
        .map((child) => child.textContent?.trim() ?? "")
        .filter(Boolean),
    );
  const overflowTooltipLabel = renderedOverflowTagLabels
    .map((label) => overflowTagFqnsByName.get(label) ?? label)
    .join(", ");
  await overflowChip.hover();
  const overflowTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: overflowTooltipLabel });
  await expect(overflowTooltip).toBeVisible();
  await expect(overflowTooltip).toHaveText(overflowTooltipLabel);
  expect(await chipShadowFitsClippingAncestors(visibleOverflowTag)).toBe(true);

  const memberChip = overflowTagRow
    .locator("td")
    .nth(6)
    .getByText(memberName.slice(0, 2), { exact: true });
  await expect(memberChip).toBeVisible();
  expect(await chipShadowFitsClippingAncestors(memberChip)).toBe(true);

  const noMemoRow = page
    .getByRole("row")
    .filter({ hasText: noMemoLeaf })
    .first();
  await expect(noMemoRow).toBeVisible();
  await expect(noMemoRow.getByTestId("transaction-line-title")).toContainText(
    noMemoLeaf,
  );
  await expect(noMemoRow.getByTestId("transaction-line-memo")).toHaveCount(0);
  const noMemoTagState = await tagChipLineState(noMemoRow);
  expect(noMemoTagState.visibleRowCount).toBe(2);
  const noMemoTitleCenterOffset = await noMemoRow
    .locator("td")
    .nth(3)
    .evaluate((descriptionCell) => {
      const title = descriptionCell.querySelector<HTMLElement>(
        "[data-testid='transaction-line-title']",
      );
      if (!title) {
        return Number.POSITIVE_INFINITY;
      }

      const cellRect = descriptionCell.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      return Math.abs(
        titleRect.top +
          titleRect.height / 2 -
          (cellRect.top + cellRect.height / 2),
      );
    });
  expect(noMemoTitleCenterOffset).toBeLessThanOrEqual(1);

  const rowHeights = await page
    .locator("tbody > tr[aria-expanded]")
    .evaluateAll(
      (rows, rowText) => {
        const manyTag = rows.find((row) =>
          row.textContent?.includes(rowText.withMemo),
        );
        const noMemoManyTag = rows.find((row) =>
          row.textContent?.includes(rowText.withoutMemo),
        );
        const ordinary = rows.find((row) =>
          row.textContent?.includes("BlueCash → Target"),
        );
        return {
          manyTag: manyTag?.getBoundingClientRect().height,
          noMemoManyTag: noMemoManyTag?.getBoundingClientRect().height,
          ordinary: ordinary?.getBoundingClientRect().height,
        };
      },
      { withMemo: overflowMemo, withoutMemo: noMemoLeaf },
    );
  expect(
    Math.abs((rowHeights.manyTag ?? 0) - (rowHeights.ordinary ?? 0)),
  ).toBeLessThan(1);
  expect(
    Math.abs((rowHeights.noMemoManyTag ?? 0) - (rowHeights.ordinary ?? 0)),
  ).toBeLessThan(1);
});

test("transaction detail panel shows full records and supports deep links", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const tagFqns = [
    `E2E:Detail:${unique}:Aardvark${unique}`,
    ...Array.from(
      { length: 11 },
      (_, index) =>
        `E2E:Detail:${unique}:DetailOverflow${String(index + 1).padStart(2, "0")}${unique}`,
    ),
  ];
  const createdTags = await Promise.all(
    tagFqns.map((fqn) => createTag(page, fqn)),
  );
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E detail ${unique} full memo with receipt notes, household context, and enough words to be truncated on the transaction line but readable in the panel`;
  const alternateMemo = `E2E detail ${unique} alternate`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "42.19",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-06-30",
      memo,
      tag_ids: createdTags.map((tag) => tag.tag_id),
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;
  const alternateSpendResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "7.18",
        category_id: category.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-07-01",
        memo: alternateMemo,
      },
    },
  );
  expect(alternateSpendResponse.ok()).toBe(true);
  const alternateTransaction =
    (await alternateSpendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const detailRow = page.getByRole("row").filter({ hasText: memo }).first();
  const alternateDetailRow = page
    .getByRole("row")
    .filter({ hasText: alternateMemo })
    .first();
  await expect(detailRow).toBeVisible();
  await expect(alternateDetailRow).toBeVisible();
  await expect(
    detailRow.locator("td").nth(5).getByTestId("transaction-tags-overflow"),
  ).toBeVisible();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const entryPanel = page.locator("aside[aria-labelledby='entry-panel-title']");
  await expect(entryPanel).toBeVisible();

  await detailRow
    .getByRole("button", {
      name: "Open transaction detail",
    })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${transaction.transaction_id}(?:&|$)`),
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute("aria-modal", "true");
  await expect(panel.getByText("SPEND").first()).toBeVisible();
  await expect(
    panel.getByTestId("amount-chip").filter({ hasText: "-42.19 $" }).first(),
  ).toBeVisible();
  await expect(panel.getByTestId("transaction-detail-summary-memo")).toHaveText(
    memo,
  );
  await expect(panel.getByText("Journal records")).toBeVisible();
  const journalRecords = panel.locator(
    "section[aria-labelledby='transaction-detail-records']",
  );
  await expect(
    journalRecords.getByRole("cell", { name: memo }).first(),
  ).toBeVisible();
  await expect(panel.getByText("cash:Wallet").first()).toBeVisible();
  await expect(panel.getByText("merchant:Books").first()).toBeVisible();
  await expect(panel.getByText("Entertainment:Books").first()).toBeVisible();
  await expect
    .poll(() =>
      panel
        .getByTestId("transaction-detail-records-table")
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    )
    .toBe(true);
  for (const tag of createdTags) {
    await expect(
      panel.getByText(tag.name, { exact: true }).first(),
    ).toBeVisible();
  }

  await alternateDetailRow
    .getByRole("button", {
      name: "Open transaction detail",
    })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${alternateTransaction.transaction_id}(?:&|$)`),
  );
  const alternatePanel = page.getByRole("dialog", {
    name: alternateTransaction.display_title,
  });
  await expect(alternatePanel).toBeVisible();
  await expect(
    alternatePanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(alternateMemo);

  await page.keyboard.press("Escape");
  await expect(alternatePanel).toBeHidden();
  await expect(entryPanel).toBeVisible();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await page.keyboard.press("Escape");
  await expect(entryPanel).toBeHidden();

  await detailRow
    .getByRole("button", {
      name: "Open transaction detail",
    })
    .click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("KeyN");
  await expect(entryPanel).toBeHidden();

  await page.goto(
    `/transactions?page=2&pageSize=10&transaction=${transaction.transaction_id}`,
  );
  const deepLinkPanel = page.getByRole("dialog", {
    name: transaction.display_title,
  });
  await expect(deepLinkPanel).toBeVisible();
  await expect(
    deepLinkPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(memo);

  await page.keyboard.press("Escape");
  await expect(deepLinkPanel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=2&pageSize=10$/);
});

test("focused transaction row opens detail with Enter and restores focus on Escape", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E keyboard detail ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-03",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const detailRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(detailRow).toBeVisible();
  await expect(detailRow).toHaveAttribute("aria-expanded", "false");

  await detailRow.focus();
  await expect(detailRow).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${transaction.transaction_id}(?:&|$)`),
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();
  await expect(detailRow).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(detailRow).toBeFocused();

  await page.keyboard.press("Space");
  await expect(detailRow).toHaveAttribute("aria-expanded", "true");
});

test("transaction detail delete confirms, tombstones, and refreshes the row", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E delete detail ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.45",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-02",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;
  const consoleErrors: string[] = [];
  const failedTransactionRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    if (
      request.method() === "GET" &&
      request.url().includes(`/api/transactions/${transaction.transaction_id}`)
    ) {
      failedTransactionRequests.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
      );
    }
  });
  page.on("response", (response) => {
    if (
      response.request().method() === "GET" &&
      response
        .url()
        .includes(`/api/transactions/${transaction.transaction_id}`) &&
      response.status() >= 400
    ) {
      failedTransactionRequests.push(
        `GET ${response.url()} returned ${response.status()}`,
      );
    }
  });

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const detailRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(detailRow).toBeVisible();
  await detailRow
    .getByRole("button", { name: "Open transaction detail" })
    .click();

  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Delete" }).click();
  const confirmDialog = page.getByRole("alertdialog", {
    name: "Delete transaction",
  });
  await expect(confirmDialog).toBeVisible();
  await expect(
    confirmDialog.getByText(transaction.display_title),
  ).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toBeHidden();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Delete" })).toBeFocused();

  await panel.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete transaction" })
    .getByRole("button", { name: "Delete transaction" })
    .click();

  await expect(
    page.getByRole("status").filter({ hasText: "Transaction deleted." }),
  ).toBeVisible();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeHidden();
  expect(consoleErrors).toEqual([]);
  expect(failedTransactionRequests).toEqual([]);
});

test("transactions resolve hidden referenced tags but exclude them from pickers", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const hiddenTagFqn = `E2E:Hidden:${unique}:QuietTag`;
  const hiddenTag = await createTag(page, hiddenTagFqn);

  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E hidden tag ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "8.42",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo,
      tag_ids: [hiddenTag.tag_id],
    },
  });
  expect(spendResponse.ok()).toBe(true);
  await hideTag(page, hiddenTag);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const hiddenTagRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(hiddenTagRow).toBeVisible();
  await expect(
    hiddenTagRow.locator("td").nth(5).getByText("QuietTag", { exact: true }),
  ).toBeVisible();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const tagsPicker = page.getByRole("combobox", { name: "Tags" });
  await tagsPicker.fill(hiddenTagFqn);
  await expect(page.getByText("No matches")).toBeVisible();
});

const chooseOptionByKeyboard = async (
  page: Page,
  label: string,
  query: string,
) => {
  const picker = page.getByRole("combobox", { name: label });
  await picker.fill(query);
  await picker.press("ArrowDown");
  await picker.press("Enter");
};

test("keyboard spend entry creates a transaction and keeps sticky fields", async ({
  page,
}, testInfo) => {
  const cents =
    (Array.from(testInfo.project.name).reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    ) %
      89) +
    10;
  const amount = `98.${cents}`;

  await page.goto("/transactions?page=1&pageSize=10");
  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);

  await page
    .getByRole("heading", { exact: true, name: "Transactions" })
    .click();
  await page.keyboard.press("KeyN");
  await expect(page.getByRole("heading", { name: "New spend" })).toBeVisible();
  await expect(page.getByLabel("Date")).toBeFocused();
  await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);
  await expect(
    page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    ),
  ).resolves.toBe(true);

  const currency = page.getByLabel("Currency");
  await expect(
    page.locator("datalist#entry-currency-options option[value='EUR']"),
  ).toHaveCount(1);
  await currency.fill("bitcoin");
  await expect(currency).toHaveValue("BITCOIN");
  await currency.blur();
  await expect(
    page.getByText("Use a 3-letter code or C:: crypto code."),
  ).toBeVisible();
  await currency.fill("ZZZ");
  await expect(currency).toHaveValue("ZZZ");
  await expect(
    page.getByText("Use a 3-letter code or C:: crypto code."),
  ).toBeHidden();
  await currency.fill("USD");

  const amountHeaderBox = await page
    .getByRole("columnheader", { name: "Amount" })
    .first()
    .boundingBox();
  const viewport = page.viewportSize();
  expect(amountHeaderBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(amountHeaderBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(amountHeaderBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect(
    (amountHeaderBox?.x ?? 0) + (amountHeaderBox?.width ?? 0),
  ).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect(
    (amountHeaderBox?.y ?? 0) + (amountHeaderBox?.height ?? 0),
  ).toBeLessThanOrEqual(viewport?.height ?? 0);

  await page.getByLabel("Date").fill("2026-05-31");
  await page.getByLabel("Amount").fill(amount);
  await chooseOptionByKeyboard(page, "Funding account", "cash:Wallet");
  await chooseOptionByKeyboard(page, "Merchant", "merchant:Books");
  await chooseOptionByKeyboard(page, "Category", "Entertainment:Books");
  await page.getByLabel("Memo").fill("E2E arcade spend");

  await page.getByRole("combobox", { name: "Category" }).focus();
  await page.keyboard.press("Meta+Enter");

  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await expect(page.getByLabel("Date")).toHaveValue("2026-05-31");
  await expect(
    page.getByRole("combobox", { name: "Funding account" }),
  ).toHaveValue("cash:Wallet");
  await expect(page.getByLabel("Amount")).toHaveValue("");

  await page.getByRole("button", { name: "Close entry panel" }).click();
  const savedNotice = page.getByRole("status").filter({
    hasText: "Transaction saved.",
  });
  await expect(savedNotice).toBeVisible();
  await expect(savedNotice).toBeHidden({ timeout: 6000 });
});

test("entry panel creates each shorthand transaction type", async ({
  page,
}, testInfo) => {
  const cents =
    (Array.from(testInfo.project.name).reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    ) %
      39) +
    10;

  await page.goto("/transactions?page=1&pageSize=10");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(page.getByRole("heading", { name: "New spend" })).toBeVisible();

  await page.getByLabel("Date").fill("2026-05-30");
  await page.getByLabel("Amount").fill(`31.${cents}`);
  await chooseOptionByKeyboard(page, "Funding account", "cash:Wallet");
  await chooseOptionByKeyboard(page, "Merchant", "merchant:Books");
  await chooseOptionByKeyboard(page, "Category", "Entertainment:Books");
  await page.getByLabel("Memo").fill("E2E tab spend");
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByText("Entries this session: 1")).toBeVisible();

  await page.getByRole("tab", { name: "Income" }).click();
  await expect(page.getByRole("heading", { name: "New income" })).toBeVisible();
  await page.getByLabel("Date").fill("2026-05-30");
  await page.getByLabel("Amount").fill(`41.${cents}`);
  await chooseOptionByKeyboard(
    page,
    "Destination account",
    "checking:Chase:Joint",
  );
  await chooseOptionByKeyboard(page, "Source", "income:AcmePayroll");
  await chooseOptionByKeyboard(page, "Category", "Income:Salary");
  await page.getByLabel("Memo").fill("E2E tab income");
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByText("Entries this session: 2")).toBeVisible();

  await page.getByRole("tab", { name: "Refund" }).click();
  await expect(page.getByRole("heading", { name: "New refund" })).toBeVisible();
  await page.getByLabel("Date").fill("2026-05-30");
  await page.getByLabel("Amount").fill(`12.${cents}`);
  await chooseOptionByKeyboard(
    page,
    "Destination account",
    "checking:Chase:Joint",
  );
  await chooseOptionByKeyboard(page, "Merchant", "merchant:Target");
  await chooseOptionByKeyboard(page, "Category", "Refunds:Retail");
  await page.getByLabel("Memo").fill("E2E tab refund");
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByText("Entries this session: 3")).toBeVisible();

  await page.getByRole("tab", { name: "Transfer" }).click();
  await expect(
    page.getByRole("heading", { name: "New transfer" }),
  ).toBeVisible();
  await page.getByLabel("Date").fill("2026-05-30");
  await page.getByLabel("Amount").fill(`22.${cents}`);
  await chooseOptionByKeyboard(page, "From account", "checking:Chase:Joint");
  await chooseOptionByKeyboard(page, "To account", "savings:Ally:Emergency");
  await chooseOptionByKeyboard(page, "Category", "Transfer");
  await page.getByLabel("Memo").fill("E2E tab transfer");
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByText("Entries this session: 4")).toBeVisible();
});

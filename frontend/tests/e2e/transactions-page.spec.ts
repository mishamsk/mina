import { expect, type Page, test } from "@playwright/test";

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

const createTag = async (page: Page, fqn: string): Promise<TagFixture> => {
  const response = await page.request.post("/api/tags", { data: { fqn } });
  expect(response.ok()).toBe(true);
  return (await response.json()) as TagFixture;
};

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
    .filter({ hasText: "120.00 USD" })
    .first();
  await expect(transferRow).toBeVisible();
  await expect(transferRow).toContainText("→");
  await expect(transferRow).not.toContainText("+120.00 USD");

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
  await expect(page.locator("tbody > tr[aria-expanded]").first()).toContainText(
    "→",
  );
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
  await page.goto("/transactions?page=1&pageSize=10");

  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();

  const intermediateTableState = await measureTableState();

  expect(intermediateTableState.hasHorizontalOverflow).toBe(false);
  expect(intermediateTableState.amountCellRightWithinContainer).toBe(true);
  expect(intermediateTableState.amountContentRightWithinContainer).toBe(true);
  expect(intermediateTableState.amountHasTruncatedContent).toBe(false);
  expect(intermediateTableState.amountText).toBe("-43.98 USD");
  expect(intermediateTableState.amountTexts).toContain("+3,250.00 USD");
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
    expect(tableState.amountText).toBe("-43.98 USD");
    expect(tableState.amountTexts).toContain("+3,250.00 USD");
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
  await expect(simpleSpendRow.locator("td").nth(7)).toContainText(
    /-43\.98 USD/,
  );

  const mixedRow = page
    .getByRole("row")
    .filter({ hasText: "Mixed payroll correction" })
    .first();
  await expect(mixedRow).toBeVisible();
  await expect(
    mixedRow.locator("td").nth(4).getByText("Mixed", { exact: true }),
  ).toBeVisible();
  await expect(mixedRow.locator("td").nth(7)).toContainText(
    "-5.00 / +100.00 USD",
  );
  const rowHeights = await page
    .locator("tbody > tr[aria-expanded]")
    .evaluateAll((rows) => {
      const mixed = rows.find((row) =>
        row.textContent?.includes("Mixed payroll correction"),
      );
      const ordinarySingleLine = rows.find(
        (row) =>
          !row.textContent?.includes("Mixed payroll correction") &&
          !row.querySelector("td:nth-child(4) .text-xs"),
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
  await expect(exchangeRow).toContainText("-224.00 USD");
  await expect(exchangeRow).not.toContainText("200.00 EUR");

  await expect(
    page.getByRole("img", { name: "SPEND" }).first(),
  ).toHaveAttribute("title", "SPEND");

  const booksCategory = page
    .locator("tbody tr")
    .filter({ hasText: "Books" })
    .first()
    .locator("td")
    .nth(4)
    .getByTitle("Entertainment:Books");
  await expect(booksCategory.locator("span").first()).toHaveText("Books");
});

test("transactions line composition uses compact dates and single-line leaf tags", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const lisbonTagFqn = `E2E:Wrap:${unique}:Lisbon2026`;
  const tagFqns = [
    lisbonTagFqn,
    `E2E:Wrap:${unique}:Planning`,
    `E2E:Wrap:${unique}:Receipts`,
    `E2E:Wrap:${unique}:Shared`,
    `E2E:Wrap:${unique}:LongLeafNameForEllipsis`,
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
  const memo = `E2E many tags ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "7.31",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo,
      tag_ids: createdTags.map((tag) => tag.tag_id),
    },
  });
  expect(spendResponse.ok()).toBe(true);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const manyTagRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(manyTagRow).toBeVisible();

  const dateCell = manyTagRow.locator("td").nth(1);
  await expect(dateCell.locator("div").nth(0)).toHaveText("May 31");
  await expect(dateCell.locator("div").nth(1)).toHaveText("2026");

  const statusCell = manyTagRow.locator("td").nth(2);
  await expect(statusCell).toHaveText("");

  const lisbonTag = manyTagRow.locator("td").nth(5).getByTitle(lisbonTagFqn);
  await expect(lisbonTag.locator("span").first()).toHaveText("Lisbon2026");

  const rowHeights = await page
    .locator("tbody > tr[aria-expanded]")
    .evaluateAll((rows, rowMemo) => {
      const manyTag = rows.find((row) => row.textContent?.includes(rowMemo));
      const ordinary = rows.find((row) =>
        row.textContent?.includes("BlueCash → Target"),
      );
      return {
        manyTag: manyTag?.getBoundingClientRect().height,
        ordinary: ordinary?.getBoundingClientRect().height,
      };
    }, memo);
  expect(
    Math.abs((rowHeights.manyTag ?? 0) - (rowHeights.ordinary ?? 0)),
  ).toBeLessThan(1);
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
  await expect(
    page.getByRole("status").filter({
      hasText: "Transaction saved.",
    }),
  ).toBeVisible();
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

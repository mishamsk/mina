import {
  expect,
  type Locator,
  type Page,
  type Route,
  test,
} from "@playwright/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly economic_intent: string;
  readonly fqn: string;
  readonly name: string;
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

interface JournalRecordFixture {
  readonly account_id: number;
  readonly amount: string;
  readonly category_id: number;
  readonly currency: string;
  readonly member_id?: number | null;
  readonly memo?: string | null;
  readonly posting_status: string;
  readonly reconciliation_status: string;
  readonly source: string;
  readonly tag_ids: readonly number[];
}

interface TransactionDetailFixture extends TransactionFixture {
  readonly records: readonly JournalRecordFixture[];
}

interface TransactionListFixture {
  readonly offset: number;
  readonly total_count: number;
  readonly transactions: readonly TransactionFixture[];
}

const formatLocalDate = (date: Date): string =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0"),
    )
    .join("-");

const shiftLocalDate = (anchorDate: string, days: number): string => {
  const [year = 0, month = 1, day = 1] = anchorDate.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  localDate.setDate(localDate.getDate() + days);
  return formatLocalDate(localDate);
};

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
  expectedFilters: { readonly q?: string } = {},
): Promise<void> => {
  await expect
    .poll(() => {
      const searchParams = new URL(page.url()).searchParams;
      return {
        anchorDate: searchParams.get("anchor_date"),
        page: searchParams.get("page"),
        pageSize: searchParams.get("pageSize"),
        q: searchParams.get("q"),
      };
    })
    .toEqual({
      anchorDate: null,
      page: String(expectedPage),
      pageSize: String(expectedPageSize),
      q: expectedFilters.q ?? null,
    });
};

const expectTransactionFilterUrl = async (
  page: Page,
  expected: {
    readonly amountMax?: string;
    readonly amountMin?: string;
    readonly categories?: readonly number[];
    readonly classes?: readonly string[];
    readonly initiatedFrom?: string;
    readonly initiatedTo?: string;
    readonly members?: readonly number[];
    readonly page?: string;
    readonly pageSize?: string;
    readonly q?: string;
    readonly statuses?: readonly string[];
    readonly tags?: readonly number[];
  },
): Promise<void> => {
  await expect
    .poll(() => {
      const searchParams = new URL(page.url()).searchParams;
      return {
        amountMax: searchParams.get("amountMax"),
        amountMin: searchParams.get("amountMin"),
        initiatedFrom: searchParams.get("initiatedFrom"),
        initiatedTo: searchParams.get("initiatedTo"),
        page: searchParams.get("page"),
        pageSize: searchParams.get("pageSize"),
        q: searchParams.get("q"),
        categories: searchParams
          .getAll("category")
          .map((value) => Number(value))
          .sort((left, right) => left - right),
        classes: searchParams.getAll("class").sort(),
        members: searchParams
          .getAll("member")
          .map((value) => Number(value))
          .sort((left, right) => left - right),
        statuses: searchParams.getAll("status").sort(),
        tags: searchParams
          .getAll("tag")
          .map((value) => Number(value))
          .sort((left, right) => left - right),
      };
    })
    .toEqual({
      amountMax: expected.amountMax ?? null,
      amountMin: expected.amountMin ?? null,
      initiatedFrom: expected.initiatedFrom ?? null,
      initiatedTo: expected.initiatedTo ?? null,
      page: expected.page ?? "1",
      pageSize: expected.pageSize ?? "10",
      q: expected.q ?? null,
      categories: [...(expected.categories ?? [])].sort(
        (left, right) => left - right,
      ),
      classes: [...(expected.classes ?? [])].sort(),
      members: [...(expected.members ?? [])].sort(
        (left, right) => left - right,
      ),
      statuses: [...(expected.statuses ?? [])].sort(),
      tags: [...(expected.tags ?? [])].sort((left, right) => left - right),
    });
};

const transactionRequestHasFilters = (
  requestUrl: URL,
  expected: {
    readonly amountMax?: string;
    readonly amountMin?: string;
    readonly anchorDate?: string;
    readonly classes?: readonly string[];
    readonly initiatedFrom?: string;
    readonly initiatedTo?: string;
    readonly limit?: string;
    readonly statuses?: readonly string[];
    readonly tags?: readonly number[];
  },
): boolean => {
  const params = requestUrl.searchParams;
  const tags = params
    .getAll("tag_id")
    .map((value) => Number(value))
    .sort((left, right) => left - right);
  return (
    params.get("amount_max") === (expected.amountMax ?? null) &&
    params.get("amount_min") === (expected.amountMin ?? null) &&
    params.get("anchor_date") === (expected.anchorDate ?? null) &&
    params.get("initiated_date_from") === (expected.initiatedFrom ?? null) &&
    params.get("initiated_date_to") === (expected.initiatedTo ?? null) &&
    (expected.limit === undefined || params.get("limit") === expected.limit) &&
    JSON.stringify(params.getAll("transaction_class").sort()) ===
      JSON.stringify([...(expected.classes ?? [])].sort()) &&
    JSON.stringify(params.getAll("posting_status").sort()) ===
      JSON.stringify([...(expected.statuses ?? [])].sort()) &&
    JSON.stringify(tags) ===
      JSON.stringify(
        [...(expected.tags ?? [])].sort((left, right) => left - right),
      )
  );
};

const createTag = async (page: Page, fqn: string): Promise<TagFixture> => {
  const response = await page.request.post("/api/tags", { data: { fqn } });
  expect(response.ok()).toBe(true);
  return (await response.json()) as TagFixture;
};

const createCategory = async (
  page: Page,
  fqn: string,
  economicIntent: string,
): Promise<CategoryFixture> => {
  const response = await page.request.post("/api/categories", {
    data: {
      economic_intent: economicIntent,
      fqn,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as CategoryFixture;
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

const deleteTransaction = async (
  page: Page,
  transaction: TransactionFixture,
): Promise<void> => {
  const response = await page.request.delete(
    `/api/transactions/${transaction.transaction_id}`,
  );
  expect(response.ok()).toBe(true);
};

const comparableRecords = (records: readonly JournalRecordFixture[]) =>
  records
    .map((record) => ({
      account_id: record.account_id,
      amount: record.amount,
      category_id: record.category_id,
      currency: record.currency,
      member_id: record.member_id ?? null,
      memo: record.memo ?? null,
      posting_status: record.posting_status,
      reconciliation_status: record.reconciliation_status,
      source: record.source,
      tag_ids: [...record.tag_ids].sort((left, right) => left - right),
    }))
    .sort((left, right) => left.account_id - right.account_id);

const hideTag = async (page: Page, tag: TagFixture): Promise<void> => {
  const response = await page.request.patch(`/api/tags/${tag.tag_id}`, {
    data: { is_hidden: true },
  });
  expect(response.ok()).toBe(true);
};

const hideCategory = async (
  page: Page,
  category: CategoryFixture,
): Promise<void> => {
  const response = await page.request.patch(
    `/api/categories/${category.category_id}`,
    {
      data: { is_hidden: true },
    },
  );
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

const mixedAmountChipGeometry = async (row: Locator) =>
  row.evaluate((rowElement) => {
    const rectFor = (element: Element | undefined | null) => {
      const rect = element?.getBoundingClientRect();
      return rect
        ? {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width,
          }
        : undefined;
    };
    const isCollapsed = (element: Element | undefined | null) => {
      if (!element) {
        return true;
      }
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display === "none" ||
        style.visibility === "collapse" ||
        rect.width < 1
      );
    };
    const intersects = (
      left: NonNullable<ReturnType<typeof rectFor>>,
      right: NonNullable<ReturnType<typeof rectFor>>,
    ) =>
      left.left < right.right - 0.5 &&
      left.right > right.left + 0.5 &&
      left.top < right.bottom - 0.5 &&
      left.bottom > right.top + 0.5;
    const containedBy = (
      inner: NonNullable<ReturnType<typeof rectFor>>,
      outer: NonNullable<ReturnType<typeof rectFor>>,
    ) =>
      inner.left >= outer.left - 0.5 &&
      inner.right <= outer.right + 0.5 &&
      inner.top >= outer.top - 0.5 &&
      inner.bottom <= outer.bottom + 0.5;
    const textLineCenters = (element: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const centers = Array.from(range.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => (rect.top + rect.bottom) / 2);
      range.detach();
      return centers;
    };

    const cells = rowElement.querySelectorAll("td");
    const memberCell = cells[6];
    const amountCell = cells[7];
    const amountCellRect = rectFor(amountCell);
    const memberCellRect = rectFor(memberCell);
    const chip = amountCell?.querySelector<HTMLElement>(
      "[data-testid='amount-chip']",
    );
    const chipRect = rectFor(chip);
    const childRects = Array.from(chip?.children ?? [])
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map(rectFor)
      .filter(
        (rect): rect is NonNullable<ReturnType<typeof rectFor>> =>
          rect !== undefined && rect.width > 0 && rect.height > 0,
      );
    const lineCenters = chip ? textLineCenters(chip) : [];
    const memberCollapsed = isCollapsed(memberCell);
    const scrollContainer = rowElement.closest<HTMLElement>(
      "[data-testid='transactions-table-scroll']",
    );
    const memberOverlaps =
      !memberCollapsed && memberCellRect
        ? childRects.some((rect) => intersects(rect, memberCellRect))
        : false;

    return {
      amountCellWidth: amountCellRect?.width ?? 0,
      amountChipFitsCell:
        Boolean(amountCellRect && chipRect) &&
        containedBy(
          chipRect as NonNullable<ReturnType<typeof rectFor>>,
          amountCellRect as NonNullable<ReturnType<typeof rectFor>>,
        ),
      amountChildrenFitCell:
        Boolean(amountCellRect) &&
        childRects.length > 0 &&
        childRects.every((rect) =>
          containedBy(
            rect,
            amountCellRect as NonNullable<ReturnType<typeof rectFor>>,
          ),
        ),
      chipText: chip?.innerText.replace(/\s+/g, " ").trim() ?? "",
      containerWidth: scrollContainer?.clientWidth ?? 0,
      memberCollapsed,
      memberOverlaps,
      singleLine:
        lineCenters.length > 0 &&
        Math.max(...lineCenters) - Math.min(...lineCenters) <= 1,
      tableHasHorizontalOverflow: scrollContainer
        ? scrollContainer.scrollWidth > scrollContainer.clientWidth + 1
        : true,
    };
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
  await expect(
    page.getByRole("columnheader", { name: "Amount" }),
  ).toBeVisible();

  const transactionRows = page.locator("tbody > tr[aria-expanded]");
  const transferRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "TRANSFER" }) })
    .filter({ hasText: "120.00 $" })
    .first();
  await expect(transferRow).toBeVisible();
  await expect(transferRow).toContainText("→");
  await expect(transferRow).not.toContainText("+120.00 $");

  const incomeRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "INCOME" }) })
    .filter({ hasText: "+3,250.00 $" })
    .first();
  await expect(incomeRow).toBeVisible();
  const incomeAmountChip = incomeRow
    .getByTestId("amount-chip")
    .filter({ hasText: "+3,250.00 $" })
    .first();
  await expect(incomeAmountChip).toContainText("+3,250.00 $");
  await expect(incomeAmountChip).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(incomeAmountChip).toHaveCSS("color", "rgb(15, 13, 22)");

  const firstRowBackgroundBefore = await transactionRows
    .nth(0)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const secondRowBackgroundBefore = await transactionRows
    .nth(1)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(firstRowBackgroundBefore).not.toBe(secondRowBackgroundBefore);

  await transferRow.locator("td").nth(3).click();
  await expect(transferRow).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("columnheader", { exact: true, name: "Memo" }),
  ).toBeVisible();
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

  await page.getByRole("button", { exact: true, name: "Next" }).click();
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

  await page.getByRole("button", { exact: true, name: "Previous" }).click();

  await expect(page).toHaveURL(/page=1/);
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
});

test("transactions page search filters server-side and deep-links", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E search memo ${unique}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);

  await page.goto("/transactions?page=2&pageSize=10");
  await expect(page.getByText("Description")).toBeVisible();

  const searchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === unique
    );
  });
  await page.getByRole("searchbox", { name: "Search" }).fill(unique);
  const requestUrl = new URL((await searchRequest).url());
  expect(requestUrl.searchParams.get("limit")).toBe("10");
  expect(requestUrl.searchParams.get("offset")).toBe("0");
  expect(requestUrl.searchParams.get("search")).toBe(unique);

  await expectTransactionsPageUrl(page, 1, 10, { q: unique });
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();

  const deepLinkRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === unique &&
      url.searchParams.get("limit") === "50"
    );
  });
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  await deepLinkRequest;
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    unique,
  );
  await expectTransactionsPageUrl(page, 1, 50, { q: unique });
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();
});

test("transactions page add-filter menu drives server filters and chips", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const visibleTagOne = await createTag(page, `E2E:Filter:${unique}:Groceries`);
  const visibleTagTwo = await createTag(page, `E2E:Filter:${unique}:Errands`);
  const hiddenTag = await createTag(page, `E2E:Filter:${unique}:HiddenMatch`);
  await hideTag(page, hiddenTag);

  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const targetMemo = `E2E filtered target ${unique}`;

  const targetSpend = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo: targetMemo,
      posting_status: "pending",
      tag_ids: [visibleTagOne.tag_id],
    },
  });
  expect(targetSpend.ok()).toBe(true);
  const alternateSpend = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "15.00",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-30",
      memo: `E2E filtered alternate ${unique}`,
      tag_ids: [visibleTagTwo.tag_id],
    },
  });
  expect(alternateSpend.ok()).toBe(true);

  await page.goto("/transactions?page=2&pageSize=10");
  await expect(page.getByText("Description")).toBeVisible();

  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  const tagsPicker = page.getByRole("combobox", { name: "Tags" });
  await fillAndExpectValue(tagsPicker, "HiddenMatch");
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    "No matches",
    { timeout: 10000 },
  );
  await page.getByText("Include hidden", { exact: true }).click();
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    "HiddenMatch",
  );
  await tagsPicker.fill(visibleTagOne.fqn);
  await expect(
    page.getByRole("button", { name: "Remove Groceries" }),
  ).toBeVisible();
  await tagsPicker.fill(visibleTagTwo.fqn);
  await expect(
    page.getByRole("button", { name: "Remove Errands" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Posting status" }).click();
  await page.getByText("Pending", { exact: true }).click();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { exact: true, name: "Amount" }).click();
  const amountDialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Amount" }),
  });
  const amountMinInput = amountDialog.getByRole("textbox", { name: "Min" });
  const amountMaxInput = amountDialog.getByRole("textbox", { name: "Max" });
  await amountMinInput.fill("10");
  await expect(amountMinInput).toHaveValue("10");
  await amountMaxInput.fill("20");
  await expect(amountMaxInput).toHaveValue("20");
  await expect(page.getByText("Amount 10-20")).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Initiated date" }).click();
  await page
    .getByRole("textbox", { exact: true, name: "From" })
    .fill("2026-05-01");
  const finalFilterRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        amountMax: "20",
        amountMin: "10",
        initiatedFrom: "2026-05-01",
        initiatedTo: "2026-05-31",
        limit: "10",
        statuses: ["pending"],
        tags: [visibleTagOne.tag_id, visibleTagTwo.tag_id],
      })
    );
  });
  await page
    .getByRole("textbox", { exact: true, name: "To" })
    .fill("2026-05-31");
  await finalFilterRequest;

  await expectTransactionFilterUrl(page, {
    amountMax: "20",
    amountMin: "10",
    initiatedFrom: "2026-05-01",
    initiatedTo: "2026-05-31",
    statuses: ["pending"],
    tags: [visibleTagOne.tag_id, visibleTagTwo.tag_id],
  });
  await expect(
    page.getByRole("row").filter({ hasText: targetMemo }),
  ).toBeVisible();

  const deepLinkRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        amountMax: "20",
        amountMin: "10",
        initiatedFrom: "2026-05-01",
        initiatedTo: "2026-05-31",
        limit: "10",
        statuses: ["pending"],
        tags: [visibleTagOne.tag_id, visibleTagTwo.tag_id],
      })
    );
  });
  await page.goto(
    `/transactions?page=1&pageSize=10&tag=${visibleTagOne.tag_id}` +
      `&tag=${visibleTagTwo.tag_id}&status=pending&amountMin=10` +
      `&amountMax=20&initiatedFrom=2026-05-01&initiatedTo=2026-05-31`,
  );
  await deepLinkRequest;
  await expect(page.getByText("Tag Groceries")).toBeVisible();
  await expect(page.getByText("Status Pending")).toBeVisible();
  await expect(page.getByText("Amount 10-20")).toBeVisible();
  await expect(page.getByText("Initiated 2026-05-01-2026-05-31")).toBeVisible();

  const pageSizeRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        amountMax: "20",
        amountMin: "10",
        initiatedFrom: "2026-05-01",
        initiatedTo: "2026-05-31",
        limit: "25",
        statuses: ["pending"],
        tags: [visibleTagOne.tag_id, visibleTagTwo.tag_id],
      })
    );
  });
  await page.getByLabel("Rows").selectOption("25");
  await pageSizeRequest;

  const dateJumpRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        amountMax: "20",
        amountMin: "10",
        anchorDate: "2026-05-31",
        initiatedFrom: "2026-05-01",
        initiatedTo: "2026-05-31",
        limit: "25",
        statuses: ["pending"],
        tags: [visibleTagOne.tag_id, visibleTagTwo.tag_id],
      })
    );
  });
  await page.getByLabel("Go to day").fill("2026-05-31");
  await dateJumpRequest;

  await page.getByRole("button", { name: "Remove Status Pending" }).click();
  await expectTransactionFilterUrl(page, {
    amountMax: "20",
    amountMin: "10",
    initiatedFrom: "2026-05-01",
    initiatedTo: "2026-05-31",
    pageSize: "25",
    tags: [visibleTagOne.tag_id, visibleTagTwo.tag_id],
  });

  await page.getByRole("button", { name: "Clear all" }).click();
  await expectTransactionFilterUrl(page, { pageSize: "25" });
  await expect(page.getByText("Tag Groceries")).toBeHidden();
  await expect(page.getByText("Amount 10-20")).toBeHidden();
});

test("transactions class toolbar filter owns class URL state", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `E2E class filter ${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const wallet = findByFqn(accounts, "cash:Wallet");
  const merchant = findByFqn(accounts, "merchant:Books");
  const joint = findByFqn(accounts, "checking:Chase:Joint");
  const payroll = findByFqn(accounts, "income:AcmePayroll");
  const books = findByFqn(categories, "Entertainment:Books");
  const salary = findByFqn(categories, "Income:Salary");
  const spendMemo = `${unique} spend`;
  const incomeMemo = `${unique} income`;

  const [spendResponse, incomeResponse] = await Promise.all([
    page.request.post("/api/transactions/spend", {
      data: {
        amount: "12.34",
        category_id: books.category_id,
        counterparty_account_id: merchant.account_id,
        currency: "USD",
        funding_account_id: wallet.account_id,
        initiated_date: "2026-05-31",
        memo: spendMemo,
      },
    }),
    page.request.post("/api/transactions/income", {
      data: {
        amount: "56.78",
        category_id: salary.category_id,
        currency: "USD",
        destination_account_id: joint.account_id,
        initiated_date: "2026-05-31",
        memo: incomeMemo,
        source_account_id: payroll.account_id,
      },
    }),
  ]);
  expect(spendResponse.ok()).toBe(true);
  expect(incomeResponse.ok()).toBe(true);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeVisible();

  const classFilter = page.getByLabel("Class");
  const spendRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        classes: ["spend"],
        limit: "50",
      })
    );
  });
  await classFilter.selectOption("spend");
  await spendRequest;
  await expectTransactionFilterUrl(page, {
    classes: ["spend"],
    pageSize: "50",
    q: unique,
  });
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeHidden();

  await classFilter.selectOption("all");
  await expectTransactionFilterUrl(page, { pageSize: "50", q: unique });
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeVisible();

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}&class=income`,
  );
  await expect(classFilter).toHaveValue("income");
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeHidden();
  await page.reload();
  await expect(classFilter).toHaveValue("income");

  await classFilter.selectOption("spend");
  await expect(classFilter).toHaveValue("spend");
  await page.goBack();
  await expect(classFilter).toHaveValue("income");
  await page.goForward();
  await expect(classFilter).toHaveValue("spend");

  await page.getByRole("button", { name: "Add filter" }).click();
  await expect(
    page.getByRole("button", { exact: true, name: "Transaction class" }),
  ).toHaveCount(0);

  const multiClassRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      transactionRequestHasFilters(url, {
        classes: ["spend", "income"],
        limit: "50",
      })
    );
  });
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}&class=spend&class=income`,
  );
  await multiClassRequest;
  await expect(classFilter).toHaveValue("spend");
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeVisible();
});

test("transactions filter toolbar keeps a stable inline trigger geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const toolbar = page
    .getByRole("heading", { name: "Transactions" })
    .locator("xpath=ancestor::header");
  const addFilterButton = page.getByRole("button", { name: "Add filter" });
  const dateJumpInput = page.getByLabel("Go to day");
  const previousDayButton = page.getByRole("button", {
    name: "Previous day",
  });
  const nextDayButton = page.getByRole("button", { name: "Next day" });
  const initialTriggerBox = await addFilterButton.boundingBox();
  const initialToolbarBox = await toolbar.boundingBox();
  const dateJumpInputBox = await dateJumpInput.boundingBox();
  const previousDayButtonBox = await previousDayButton.boundingBox();
  const nextDayButtonBox = await nextDayButton.boundingBox();
  expect(initialTriggerBox).not.toBeNull();
  expect(initialToolbarBox).not.toBeNull();
  expect(dateJumpInputBox).not.toBeNull();
  expect(previousDayButtonBox).not.toBeNull();
  expect(nextDayButtonBox).not.toBeNull();
  expect(initialTriggerBox?.width).toBe(36);
  expect(initialTriggerBox?.height).toBe(36);
  expect(previousDayButtonBox?.width).toBeGreaterThan(36);
  expect(previousDayButtonBox?.height).toBe(36);
  expect(nextDayButtonBox?.width).toBeGreaterThan(36);
  expect(nextDayButtonBox?.height).toBe(36);
  expect(previousDayButtonBox?.y).toBe(dateJumpInputBox?.y);
  expect(nextDayButtonBox?.y).toBe(dateJumpInputBox?.y);

  await addFilterButton.focus();
  await page.keyboard.press("Enter");
  const statusDimension = page.getByRole("button", {
    exact: true,
    name: "Posting status",
  });
  await statusDimension.focus();
  await page.keyboard.press("Enter");
  const pendingCheckbox = page.getByRole("checkbox", { name: "Pending" });
  await pendingCheckbox.focus();
  await page.keyboard.press("Space");

  const statusChip = page.getByText("Status Pending", { exact: true });
  await expect(statusChip).toBeVisible();
  const triggerWithChipBox = await addFilterButton.boundingBox();
  const chipBox = await statusChip.boundingBox();
  const toolbarWithChipBox = await toolbar.boundingBox();
  expect(triggerWithChipBox).not.toBeNull();
  expect(chipBox).not.toBeNull();
  expect(toolbarWithChipBox).not.toBeNull();
  expect(triggerWithChipBox?.x).toBe(initialTriggerBox?.x);
  expect(triggerWithChipBox?.y).toBe(initialTriggerBox?.y);
  expect(toolbarWithChipBox?.height).toBe(initialToolbarBox?.height);
  expect(chipBox?.x ?? 0).toBeGreaterThan(
    (triggerWithChipBox?.x ?? 0) + (triggerWithChipBox?.width ?? 0),
  );
  expect(
    Math.abs(
      (chipBox?.y ?? 0) +
        (chipBox?.height ?? 0) / 2 -
        ((triggerWithChipBox?.y ?? 0) + (triggerWithChipBox?.height ?? 0) / 2),
    ),
  ).toBeLessThan(1);

  const removeStatusButton = page.getByRole("button", {
    name: "Remove Status Pending",
  });
  await removeStatusButton.focus();
  await page.keyboard.press("Enter");
  await expect(statusChip).toBeHidden();
  const finalTriggerBox = await addFilterButton.boundingBox();
  const finalToolbarBox = await toolbar.boundingBox();
  expect(finalTriggerBox).not.toBeNull();
  expect(finalToolbarBox).not.toBeNull();
  expect(finalTriggerBox?.x).toBe(initialTriggerBox?.x);
  expect(finalTriggerBox?.y).toBe(initialTriggerBox?.y);
  expect(finalToolbarBox?.height).toBe(initialToolbarBox?.height);
});

test("transaction entity chips add filters in place", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = await createCategory(
    page,
    `E2E:ChipFilter:${unique}:CategoryOne`,
    "expense",
  );
  const alternateCategory = await createCategory(
    page,
    `E2E:ChipFilter:${unique}:CategoryTwo`,
    "expense",
  );
  const tag = await createTag(page, `E2E:ChipFilter:${unique}:DetailTag`);
  const member = await createMember(page, `Chip ${unique}`);
  const searchQuery = `E2E chip filter ${unique}`;
  const memo = `${searchQuery} target`;
  const alternateMemo = `${searchQuery} alternate`;

  const targetResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "21.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-04-01",
      member_id: member.member_id,
      memo,
      tag_ids: [tag.tag_id],
    },
  });
  expect(targetResponse.ok()).toBe(true);
  const target = (await targetResponse.json()) as TransactionFixture;
  const alternateResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "22.45",
      category_id: alternateCategory.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-04-01",
      memo: alternateMemo,
    },
  });
  expect(alternateResponse.ok()).toBe(true);

  await page.goto(
    `/transactions?q=${encodeURIComponent(searchQuery)}&page=1&pageSize=50`,
  );
  await expect(page.getByText("Description")).toBeVisible();
  const targetRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(targetRow).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: alternateMemo }).first(),
  ).toBeVisible();

  const memberChip = targetRow.getByRole("button", {
    name: `Filter by ${member.name}`,
  });
  await expect(memberChip).toBeVisible();
  await expect(memberChip).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(memberChip).toHaveCSS("color", "rgb(15, 13, 22)");
  await memberChip.click();
  await expectTransactionFilterUrl(page, {
    members: [member.member_id],
    pageSize: "50",
    q: searchQuery,
  });
  await expect(page.getByText(`Member ${member.name}`)).toBeVisible();
  await page
    .getByRole("button", { name: `Remove Member ${member.name}` })
    .click();
  await expectTransactionFilterUrl(page, {
    pageSize: "50",
    q: searchQuery,
  });

  await targetRow
    .getByRole("button", { name: `Filter by ${category.name}` })
    .click();
  await expectTransactionFilterUrl(page, {
    categories: [category.category_id],
    pageSize: "50",
    q: searchQuery,
  });
  await expect(page.getByText(`Category ${category.name}`)).toBeVisible();
  await expect(targetRow).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("row").filter({ hasText: alternateMemo }),
  ).toBeHidden();

  await targetRow
    .getByRole("button", { name: "Open transaction detail" })
    .click();
  const panel = page.getByRole("dialog", { name: target.display_title });
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: `Filter by ${tag.name}` })
    .first()
    .click();
  await expectTransactionFilterUrl(page, {
    categories: [category.category_id],
    pageSize: "50",
    q: searchQuery,
    tags: [tag.tag_id],
  });
  await expect(page.getByText(`Tag ${tag.name}`)).toBeVisible();
  await expect(panel).toBeVisible();
});

test("transactions sidebar restores the last-used transactions URL state", async ({
  page,
}) => {
  await page.goto("/transactions?page=2&pageSize=25&q=Target&status=posted");
  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    "Target",
  );
  await expectTransactionFilterUrl(page, {
    page: "2",
    pageSize: "25",
    q: "Target",
    statuses: ["posted"],
  });

  await page.getByRole("link", { name: "Status" }).click();
  await expect(
    page.getByRole("heading", { exact: true, name: "Status" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    "Target",
  );
  await expectTransactionFilterUrl(page, {
    page: "2",
    pageSize: "25",
    q: "Target",
    statuses: ["posted"],
  });
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
  const firstTransactionRow = page.locator("tbody > tr[aria-expanded]").first();
  await expect(firstTransactionRow).toBeVisible();
  const normalizedFirstTransactionRowText = async () =>
    firstTransactionRow.evaluate(
      (row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
  const retainedFirstPageRow = await normalizedFirstTransactionRowText();

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
    await expect
      .poll(normalizedFirstTransactionRowText)
      .toBe(retainedFirstPageRow);
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
  await expect(page.getByLabel("Go to day")).toHaveValue(jumpDate);

  await page.getByRole("button", { exact: true, name: "Next" }).click();
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

test("transactions page steps adjacent date anchors", async ({ page }) => {
  const anchorDate = "2026-05-01";
  const previousDate = shiftLocalDate(anchorDate, -1);
  const today = formatLocalDate(new Date());
  const yesterday = shiftLocalDate(today, -1);
  const tomorrow = shiftLocalDate(today, 1);

  await page.goto("/transactions?page=1&pageSize=10");
  const dateJump = page.getByLabel("Go to day");
  const previousDayButton = page.getByRole("button", {
    name: "Previous day",
  });
  const nextDayButton = page.getByRole("button", { name: "Next day" });

  const anchorResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === anchorDate
    );
  });
  await dateJump.fill(anchorDate);
  await anchorResponse;

  const previousResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === previousDate
    );
  });
  await previousDayButton.focus();
  await page.keyboard.press("Enter");
  const previousPage = (await (
    await previousResponse
  ).json()) as TransactionListFixture;
  const previousLandedPage = Math.floor(previousPage.offset / 10) + 1;
  await expect(dateJump).toHaveValue(previousDate);
  await expectTransactionsPageUrl(page, previousLandedPage, 10);
  await expect(
    page.getByText(previousPage.transactions[0]!.display_title).first(),
  ).toBeVisible();

  const nextResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === anchorDate
    );
  });
  await nextDayButton.click();
  const nextPage = (await (
    await nextResponse
  ).json()) as TransactionListFixture;
  await expect(dateJump).toHaveValue(anchorDate);
  await expectTransactionsPageUrl(
    page,
    Math.floor(nextPage.offset / 10) + 1,
    10,
  );

  await page.goto("/transactions?page=1&pageSize=10");
  await expect(dateJump).toHaveValue("");
  const noAnchorResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === yesterday
    );
  });
  await previousDayButton.click();
  const noAnchorPage = (await (
    await noAnchorResponse
  ).json()) as TransactionListFixture;
  await expect(dateJump).toHaveValue(yesterday);
  await expectTransactionsPageUrl(
    page,
    Math.floor(noAnchorPage.offset / 10) + 1,
    10,
  );

  const todayResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === today
    );
  });
  await nextDayButton.focus();
  await page.keyboard.press("Enter");
  await todayResponse;
  await expect(dateJump).toHaveValue(today);
  await expect(nextDayButton).toBeEnabled();

  const tomorrowResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === tomorrow
    );
  });
  await nextDayButton.click();
  await tomorrowResponse;
  await expect(dateJump).toHaveValue(tomorrow);
  await expect(nextDayButton).toBeEnabled();
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
      const amountCell = cells?.[7];
      const amountRect = rectFor(amountCell);
      const actionsCell = cells?.[8];
      const actionsRect = rectFor(actionsCell);
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
      const textRectsFor = (element: HTMLElement) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = Array.from(range.getClientRects())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect) => ({
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            top: rect.top,
          }));
        range.detach();
        return rects;
      };
      const amountChips = rows.flatMap((visibleRow) => {
        const cell = visibleRow.querySelectorAll("td")[7];
        if (!cell || isCollapsed(cell)) {
          return [];
        }
        return Array.from(
          cell.querySelectorAll<HTMLElement>("[data-testid='amount-chip']"),
        ).map((chip) => ({ cell, chip }));
      });
      const amountChipStates = amountChips.map(({ cell, chip }) => {
        const cellRect = cell.getBoundingClientRect();
        const chipRect = chip.getBoundingClientRect();
        const textRects = textRectsFor(chip);
        const lineCenters = textRects.map(
          (rect) => (rect.top + rect.bottom) / 2,
        );
        const minLineCenter = Math.min(...lineCenters);
        const maxLineCenter = Math.max(...lineCenters);
        return {
          fitsCell:
            chipRect.left >= cellRect.left - 0.5 &&
            chipRect.right <= cellRect.right + 0.5 &&
            textRects.every(
              (rect) =>
                rect.left >= cellRect.left - 0.5 &&
                rect.right <= cellRect.right + 0.5,
            ),
          singleLine:
            textRects.length > 0 && maxLineCenter - minLineCenter <= 1,
          text: chip.innerText.replace(/\s+/g, " ").trim(),
        };
      });
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
        actionsColumnCollapsed: isCollapsed(actionsCell),
        actionsColumnRightWithinContainer:
          actionsRect !== undefined &&
          actionsRect.right <= containerRect.right + 0.5,
        actionsFolded:
          getComputedStyle(
            actionsCell?.querySelector(".row-actions-buttons") ?? container,
          ).display === "none" &&
          getComputedStyle(
            actionsCell?.querySelector(".row-actions-overflow") ?? container,
          ).display !== "none",
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
        amountChipsFitCells: amountChipStates.every((state) => state.fitsCell),
        amountChipsSingleLine: amountChipStates.every(
          (state) => state.singleLine,
        ),
        amountChipTexts: amountChipStates.map((state) => state.text),
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
  expect(intermediateTableState.amountChipsFitCells).toBe(true);
  expect(intermediateTableState.amountChipsSingleLine).toBe(true);
  expect(intermediateTableState.actionsColumnCollapsed).toBe(false);
  expect(intermediateTableState.actionsColumnRightWithinContainer).toBe(true);
  expect(intermediateTableState.amountText).toBe("-43.98 $");
  expect(intermediateTableState.amountTexts).toContain("+3,250.00 $");
  expect(intermediateTableState.amountChipTexts).toContain("-5.00 / +100.00 $");
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

  for (const width of [1600, 1440, 1150, 1000, 900, 820, 800, 700, 640]) {
    await page.setViewportSize({ width, height: 720 });
    const tableState = await measureTableState();

    expect(tableState.hasHorizontalOverflow).toBe(false);
    expect(tableState.amountCellRightWithinContainer).toBe(true);
    expect(tableState.amountContentRightWithinContainer).toBe(true);
    expect(tableState.amountHasTruncatedContent).toBe(false);
    expect(tableState.amountChipsFitCells).toBe(true);
    expect(tableState.amountChipsSingleLine).toBe(true);
    expect(tableState.actionsColumnCollapsed).toBe(false);
    expect(tableState.actionsColumnRightWithinContainer).toBe(true);
    expect(tableState.amountText).toBe("-43.98 $");
    expect(tableState.amountTexts).toContain("+3,250.00 $");
    expect(tableState.amountChipTexts).toContain("-5.00 / +100.00 $");
    expect(tableState.visibleContentOverlapsAmount).toBe(false);
    if (tableState.categoryCollapsed) {
      expect(tableState.tagsCollapsed).toBe(true);
    }
    if (tableState.tagsCollapsed) {
      expect(tableState.actionsFolded).toBe(true);
    }
    if (tableState.actionsFolded) {
      expect(tableState.statusCollapsed).toBe(true);
    }
    if (tableState.statusCollapsed) {
      expect(tableState.memberCollapsed).toBe(true);
    }
  }

  expect(intermediateTableState.memberCollapsed).toBe(true);

  await page.setViewportSize({ width: 700, height: 720 });
  const foldedSpendRow = page
    .getByRole("row")
    .filter({ hasText: "BlueCash → Target" })
    .first();
  await expect(foldedSpendRow).toBeVisible();
  await foldedSpendRow.hover();
  await foldedSpendRow
    .getByRole("button", { name: "More row actions" })
    .click();
  await page
    .locator('[data-slot="popover-content"]')
    .getByRole("button", { name: "Open transaction detail" })
    .click();
  await expect(page).toHaveURL(/[?&]transaction=\d+(?:&|$)/);
});

test("mixed amount chips stay inside the amount column where member first appears", async ({
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
  const incomeSourceAccount = findByFqn(accounts, "income:AcmePayroll");
  const category = findByFqn(categories, "Entertainment:Books");
  const incomeCategory = findByFqn(categories, "Income:Salary");
  const member = await createMember(page, `Overlap ${unique}`);
  const incomeDestinationAccount = await createAccount(
    page,
    `e2e:overlap:${unique}:income-destination`,
    "balance",
    "USD",
  );
  const memo = `E2E mixed amount overlap ${unique}`;

  let mixedTransaction: TransactionFixture | undefined;
  try {
    const mixedResponse = await page.request.post("/api/transactions", {
      data: {
        initiated_date: "2026-05-31",
        records: [
          {
            account_id: fundingAccount.account_id,
            amount: "-5.00",
            category_id: category.category_id,
            currency: "USD",
            member_id: member.member_id,
            memo,
            posting_status: "posted",
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: merchantAccount.account_id,
            amount: "5.00",
            category_id: category.category_id,
            currency: "USD",
            member_id: member.member_id,
            memo,
            posting_status: "posted",
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: incomeDestinationAccount.account_id,
            amount: "100.00",
            category_id: incomeCategory.category_id,
            currency: "USD",
            member_id: member.member_id,
            memo,
            posting_status: "posted",
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: incomeSourceAccount.account_id,
            amount: "-100.00",
            category_id: incomeCategory.category_id,
            currency: "USD",
            member_id: member.member_id,
            memo,
            posting_status: "posted",
            reconciliation_status: "unreconciled",
            source: "manual",
          },
        ],
      },
    });
    expect(mixedResponse.ok()).toBe(true);
    mixedTransaction = (await mixedResponse.json()) as TransactionFixture;

    await page.setViewportSize({ width: 1445, height: 720 });
    await page.goto(
      `/transactions?q=${encodeURIComponent(memo)}&page=1&pageSize=50`,
    );
    await expect(page.getByText("Description")).toBeVisible();

    const mixedRow = page.getByRole("row").filter({ hasText: memo }).first();
    await expect(mixedRow).toBeVisible();

    const widthOutsideTable = await page
      .getByTestId("transactions-table-scroll")
      .evaluate((container) => window.innerWidth - container.clientWidth);
    const viewportWidthForContainer = (containerWidth: number) =>
      Math.round(widthOutsideTable + containerWidth);
    const memberRevealSamples = [
      { containerWidth: 1119, memberCollapsed: true, name: "below" },
      { containerWidth: 1120, memberCollapsed: true, name: "at" },
      { containerWidth: 1122, memberCollapsed: false, name: "above" },
    ];

    for (const sample of memberRevealSamples) {
      await page.setViewportSize({
        height: 720,
        width: viewportWidthForContainer(sample.containerWidth),
      });
      const state = await mixedAmountChipGeometry(mixedRow);

      expect(
        Math.abs(state.containerWidth - sample.containerWidth),
        `${sample.name} member breakpoint table width`,
      ).toBeLessThanOrEqual(1);
      expect(state.tableHasHorizontalOverflow, sample.name).toBe(false);
      expect(state.amountChipFitsCell, sample.name).toBe(true);
      expect(state.amountChildrenFitCell, sample.name).toBe(true);
      expect(state.memberOverlaps, sample.name).toBe(false);
      expect(state.singleLine, sample.name).toBe(true);
      expect(state.chipText, sample.name).toBe("-5.00 / +100.00 $");
      expect(state.memberCollapsed, sample.name).toBe(sample.memberCollapsed);
    }
  } finally {
    if (mixedTransaction) {
      await deleteTransaction(page, mixedTransaction);
    }
  }
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
  const incomeSourceAccount = findByFqn(accounts, "income:AcmePayroll");
  const category = findByFqn(categories, "Entertainment:Books");
  const incomeCategory = findByFqn(categories, "Income:Salary");
  const memo = `E2E long amount ${unique}`;
  const mixedMemo = `E2E mixed long amount ${unique}`;
  const incomeDestinationAccount = await createAccount(
    page,
    `e2e:long:${unique}:income-destination`,
    "balance",
    "USD",
  );

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
  await expect(
    simpleSpendRow
      .locator("td")
      .nth(3)
      .getByRole("button", { name: "Open transaction detail" }),
  ).toHaveCount(0);

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

  const openDetailButton = simpleSpendRow
    .locator("td")
    .nth(8)
    .getByRole("button", { name: "Open transaction detail" });
  const deleteButton = simpleSpendRow
    .locator("td")
    .nth(8)
    .getByRole("button", { name: "Delete transaction" });
  await expect
    .poll(() =>
      openDetailButton.evaluate((button) => getComputedStyle(button).opacity),
    )
    .toBe("0");
  await expect
    .poll(() =>
      deleteButton.evaluate((button) => getComputedStyle(button).opacity),
    )
    .toBe("0");
  await simpleSpendRow.hover();
  await expect
    .poll(() =>
      openDetailButton.evaluate((button) => getComputedStyle(button).opacity),
    )
    .toBe("1");
  await expect
    .poll(() =>
      deleteButton.evaluate((button) => getComputedStyle(button).opacity),
    )
    .toBe("1");
  await page.mouse.move(0, 0);
  await openDetailButton.focus();
  await expect(openDetailButton).toBeFocused();
  await expect
    .poll(() =>
      openDetailButton.evaluate((button) => getComputedStyle(button).opacity),
    )
    .toBe("1");
  const openDetailTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Open transaction detail" });
  await expect(openDetailTooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(openDetailTooltip).toBeHidden();
  await deleteButton.focus();
  await expect(deleteButton).toBeFocused();
  await expect
    .poll(() =>
      deleteButton.evaluate((button) => getComputedStyle(button).opacity),
    )
    .toBe("1");
  const deleteTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Delete transaction" });
  await expect(deleteTooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(deleteTooltip).toBeHidden();
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
  const firstCreatedTag = createdTags.at(0);
  if (!firstCreatedTag) {
    throw new Error("expected at least one created tag");
  }
  await expect
    .poll(() =>
      panel
        .getByRole("button", { name: `Filter by ${firstCreatedTag.name}` })
        .first()
        .evaluate((element) => {
          const wrapper = element.closest(
            "[data-label='Tags']",
          )?.firstElementChild;
          return wrapper ? window.getComputedStyle(wrapper).overflow : null;
        }),
    )
    .toBe("visible");

  await alternateDetailRow.click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(alternateDetailRow).toHaveAttribute("aria-expanded", "true");
  await alternateDetailRow.click();
  await expect(alternateDetailRow).toHaveAttribute("aria-expanded", "false");

  await detailRow
    .getByRole("button", {
      name: "Open transaction detail",
    })
    .click();
  await expect(panel).toBeVisible();

  await alternateDetailRow.evaluate((row) => {
    row.scrollIntoView({ block: "center", inline: "nearest" });
    (row as HTMLElement).focus();
  });
  await expect(alternateDetailRow).toBeFocused();
  await page.keyboard.press("Enter");
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

test("toolbar filter trigger opens after transaction detail closes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E escape layered ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "31.42",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-06-29",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  await page
    .getByRole("row")
    .filter({ hasText: memo })
    .first()
    .getByRole("button", {
      name: "Open transaction detail",
    })
    .click();
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: "Add filter" }).click();
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});

test("Escape closes filter popover before transaction detail panel", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E escape order ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "32.10",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-06-30",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  await page
    .getByRole("row")
    .filter({ hasText: memo })
    .first()
    .getByRole("button", {
      name: "Open transaction detail",
    })
    .click();
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();

  const addFilterButton = page.getByRole("button", { name: "Add filter" });
  await addFilterButton.focus();
  await expect(addFilterButton).toBeFocused();
  await page.keyboard.press("Enter");
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
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

test("transaction row quick-delete confirms, handles errors, and preserves row behavior", async ({
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
  const memo = `E2E quick delete ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "14.56",
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

  const row = page.locator("tbody > tr[aria-expanded]").filter({
    hasText: memo,
  });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");

  const openDetailButton = row.getByRole("button", {
    name: "Open transaction detail",
  });
  await openDetailButton.click();
  await expect(
    page.getByRole("dialog", { name: transaction.display_title }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(row).toHaveAttribute("aria-expanded", "false");

  const deleteButton = row.getByRole("button", { name: "Delete transaction" });
  await deleteButton.click();
  const confirmDialog = page.getByRole("alertdialog", {
    name: "Delete transaction",
  });
  await expect(confirmDialog).toBeVisible();
  await expect(
    confirmDialog.getByText(transaction.display_title),
  ).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toBeHidden();
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(deleteButton).toBeFocused();

  const deleteUrlPattern = `**/api/transactions/${transaction.transaction_id}`;
  let failNextDelete = true;
  const failDeleteRoute = async (route: Route) => {
    if (route.request().method() === "DELETE" && failNextDelete) {
      failNextDelete = false;
      await route.fulfill({
        contentType: "application/json",
        status: 409,
        body: JSON.stringify({
          error: {
            code: "conflict",
            message: "Mock quick delete failure.",
          },
        }),
      });
      return;
    }
    await route.fallback();
  };
  await page.route(deleteUrlPattern, failDeleteRoute);

  await deleteButton.focus();
  await page.keyboard.press("Enter");
  await expect(confirmDialog).toBeVisible();
  await confirmDialog
    .getByRole("button", { name: "Delete transaction" })
    .click();
  await expect(confirmDialog.getByRole("alert")).toContainText(
    "Mock quick delete failure.",
  );
  await expect(confirmDialog).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await page.unroute(deleteUrlPattern, failDeleteRoute);

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
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
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
  await expect(tagsPicker).toBeVisible();
  await expect(tagsPicker).toBeEnabled();
  await tagsPicker.fill(hiddenTagFqn);
  await expect(tagsPicker).toHaveValue(hiddenTagFqn);
  await expect(page.locator("#spend-tags-options")).toContainText("No matches");
});

test("entry category picker requests spend intents and excludes hidden categories", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const hiddenCategoryFqn = `E2E:Hidden:${unique}:QuietSpendCategory${unique}`;
  const visibleCategoryFqn = `E2E:Visible:${unique}:PickerSpendCategory${unique}`;
  const visibleCategory = await createCategory(
    page,
    visibleCategoryFqn,
    "expense",
  );
  const hiddenCategory = await createCategory(
    page,
    hiddenCategoryFqn,
    "expense",
  );

  const [accounts] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const memo = `E2E hidden category ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "9.13",
      category_id: hiddenCategory.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  await hideCategory(page, hiddenCategory);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const hiddenCategoryRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(hiddenCategoryRow).toBeVisible();
  await expect(
    hiddenCategoryRow.getByText(hiddenCategory.name, { exact: true }),
  ).toBeVisible();

  const categoryRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/categories" &&
      url.searchParams.getAll("economic_intent").length > 0
    );
  });

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const categoryRequest = await categoryRequestPromise;
  const categoryRequestUrl = new URL(categoryRequest.url());
  expect(categoryRequestUrl.searchParams.getAll("economic_intent")).toEqual([
    "expense",
    "fee",
  ]);
  expect(categoryRequestUrl.searchParams.has("include_hidden")).toBe(false);
  expect(categoryRequestUrl.searchParams.has("include_tombstoned")).toBe(false);

  const categoryPicker = page.getByRole("combobox", { name: "Category" });
  await categoryPicker.fill(visibleCategory.name);
  await expect(
    page.getByRole("option", { name: new RegExp(visibleCategory.name) }),
  ).toBeVisible();

  await categoryPicker.fill("Salary");
  await expect(page.locator("#spend-category-options")).toContainText(
    "No matches",
  );

  await categoryPicker.fill(hiddenCategory.name);
  await expect(page.locator("#spend-category-options")).toContainText(
    "No matches",
  );
});

const chooseOptionByKeyboard = async (
  page: Page,
  label: string,
  searchText: string,
  optionValue: string,
  options: {
    readonly arrowDownPresses?: number;
    readonly scope?: Locator;
  } = {},
) => {
  const arrowDownPresses = options.arrowDownPresses ?? 0;
  const pickerScope = options.scope ?? page;
  const picker = pickerScope.getByRole("combobox", { name: label });
  await picker.click();
  await expect(picker).toBeFocused();
  await picker.fill("");
  await picker.fill(searchText);
  const optionListId = await picker.getAttribute("aria-controls");
  expect(optionListId).not.toBeNull();
  const optionList = page.locator(`#${optionListId}`);
  const optionByValue = optionList
    .getByRole("option")
    .filter({ hasText: optionValue });
  await expect
    .poll(async () => await optionByValue.count(), { timeout: 10000 })
    .toBeGreaterThan(0);
  const option = optionByValue.first();
  await expect(option).toBeVisible({ timeout: 10000 });
  const optionId = await option.evaluate((element) => element.id);
  if (arrowDownPresses === 0) {
    await picker.press("ArrowDown");
    await picker.press("ArrowUp");
  } else {
    for (let press = 0; press < arrowDownPresses; press += 1) {
      await picker.press("ArrowDown");
    }
  }
  await expect(picker).toHaveAttribute("aria-activedescendant", optionId);
  await picker.press("Enter");
  await expect.poll(async () => picker.inputValue()).toContain(optionValue);
};

const fillAndExpectValue = async (
  field: Locator,
  value: string,
): Promise<void> => {
  await expect
    .poll(async () => {
      await field.fill(value);
      return field.inputValue();
    })
    .toBe(value);
};

const journalRecord = (page: Page, index: number): Locator =>
  page.locator(`[aria-label="Journal record ${index}"]`);

const expectAdvancedRecordUsableAtDockedWidth = async (
  page: Page,
  record: Locator,
) => {
  const layout = await record.evaluate((recordElement) => {
    const panel = recordElement.closest<HTMLElement>(
      "aside[aria-labelledby='entry-panel-title']",
    );
    const fields = Array.from(
      recordElement.querySelectorAll<HTMLElement>("[data-field-label]"),
    );
    const controls = Array.from(
      recordElement.querySelectorAll<HTMLElement>("input, select, textarea"),
    ).filter((element) => {
      const box = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        box.width > 0 &&
        box.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    });
    const controlWidths = controls.map(
      (element) => element.getBoundingClientRect().width,
    );

    return {
      labelsVisible: fields.every((field) => {
        const label = field.firstElementChild;
        if (!(label instanceof HTMLElement)) {
          return false;
        }
        const box = label.getBoundingClientRect();
        return label.innerText.trim().length > 0 && box.width > 0;
      }),
      minControlWidth:
        controlWidths.length > 0 ? Math.min(...controlWidths) : 0,
      noPanelHorizontalScroll: panel
        ? panel.scrollWidth <= panel.clientWidth + 1
        : false,
    };
  });

  expect(layout.labelsVisible).toBe(true);
  expect(layout.minControlWidth).toBeGreaterThanOrEqual(120);
  expect(layout.noPanelHorizontalScroll).toBe(true);

  await record.getByLabel("Amount").fill("1.23");
  await expect(record.getByLabel("Amount")).toHaveValue("1.23");
  await record.getByLabel("Amount").fill("");
  await expect
    .poll(async () =>
      page
        .locator("aside[aria-labelledby='entry-panel-title']")
        .evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1),
    )
    .toBe(true);
};

const expectAdvancedBalanceStatus = async (
  page: Page,
  currency: string,
  status: "Balanced" | "Unbalanced",
) => {
  const balanceMeter = page.getByLabel("Advanced transaction balance");
  await expect(
    balanceMeter.getByLabel(`${currency} balance status`),
  ).toHaveText(status);
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
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    "credit_card",
    "credit_card:Chase:Sapphire",
    { arrowDownPresses: 1 },
  );
  await chooseOptionByKeyboard(page, "Merchant", "Books", "merchant:Books");
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
  );
  await page.getByLabel("Memo").fill("E2E arcade spend");

  await page.getByRole("combobox", { name: "Category" }).focus();
  await page.keyboard.press("Meta+Enter");

  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await expect(page.getByLabel("Date")).toHaveValue("2026-05-31");
  await expect(
    page.getByRole("combobox", { name: "Funding account" }),
  ).toHaveValue("credit_card:Chase:Sapphire");
  await expect(page.getByLabel("Amount")).toHaveValue("");

  await page.getByRole("button", { name: "Close entry panel" }).click();
  const savedNotice = page.getByRole("status").filter({
    hasText: "Transaction saved.",
  });
  await expect(savedNotice).toBeVisible();
  await expect(savedNotice).toBeHidden({ timeout: 10000 });
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
  const saveAndExpectEntryCount = async (
    endpoint: string,
    count: number,
  ): Promise<void> => {
    const saveButton = page.getByRole("button", {
      name: "Save and add another",
    });
    await expect(saveButton).toBeEnabled();
    const saveResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === endpoint && response.request().method() === "POST"
      );
    });
    await saveButton.click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok()).toBe(true);
    await expect(
      page.getByText(`Entries this session: ${count}`),
    ).toBeVisible();
  };

  await page.goto("/transactions?page=1&pageSize=10");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(page.getByRole("heading", { name: "New spend" })).toBeVisible();
  const entryPanel = page.locator("aside[aria-labelledby='entry-panel-title']");

  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await spendPanel.getByLabel("Date").fill("2026-05-30");
  await fillAndExpectValue(spendPanel.getByLabel("Amount"), `31.${cents}`);
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    "Wallet",
    "cash:Wallet",
    { scope: spendPanel },
  );
  await chooseOptionByKeyboard(page, "Merchant", "Books", "merchant:Books", {
    scope: spendPanel,
  });
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: spendPanel },
  );
  await spendPanel.getByLabel("Memo").fill("E2E tab spend");
  await saveAndExpectEntryCount("/api/transactions/spend", 1);

  await page.getByRole("tab", { name: "Income" }).click();
  await expect(page.getByRole("heading", { name: "New income" })).toBeVisible();
  const incomePanel = entryPanel.getByRole("tabpanel", { name: "Income" });
  await incomePanel.getByLabel("Date").fill("2026-05-30");
  await fillAndExpectValue(incomePanel.getByLabel("Amount"), `41.${cents}`);
  await chooseOptionByKeyboard(
    page,
    "Destination account",
    "Chase:Joint",
    "checking:Chase:Joint",
    { scope: incomePanel },
  );
  await chooseOptionByKeyboard(
    page,
    "Source",
    "AcmePayroll",
    "income:AcmePayroll",
    { scope: incomePanel },
  );
  await chooseOptionByKeyboard(page, "Category", "Salary", "Income:Salary", {
    scope: incomePanel,
  });
  await incomePanel.getByLabel("Memo").fill("E2E tab income");
  await saveAndExpectEntryCount("/api/transactions/income", 2);

  await page.getByRole("tab", { name: "Refund" }).click();
  await expect(page.getByRole("heading", { name: "New refund" })).toBeVisible();
  const refundPanel = entryPanel.getByRole("tabpanel", { name: "Refund" });
  await refundPanel.getByLabel("Date").fill("2026-05-30");
  await fillAndExpectValue(refundPanel.getByLabel("Amount"), `12.${cents}`);
  await chooseOptionByKeyboard(
    page,
    "Destination account",
    "Chase:Joint",
    "checking:Chase:Joint",
    { scope: refundPanel },
  );
  await chooseOptionByKeyboard(page, "Merchant", "Target", "merchant:Target", {
    scope: refundPanel,
  });
  await chooseOptionByKeyboard(page, "Category", "Retail", "Refunds:Retail", {
    scope: refundPanel,
  });
  await refundPanel.getByLabel("Memo").fill("E2E tab refund");
  await saveAndExpectEntryCount("/api/transactions/refund", 3);

  await page.getByRole("tab", { name: "Transfer" }).click();
  await expect(
    page.getByRole("heading", { name: "New transfer" }),
  ).toBeVisible();
  const transferPanel = entryPanel.getByRole("tabpanel", { name: "Transfer" });
  await transferPanel.getByLabel("Date").fill("2026-05-30");
  await fillAndExpectValue(transferPanel.getByLabel("Amount"), `22.${cents}`);
  await chooseOptionByKeyboard(
    page,
    "From account",
    "Chase:Joint",
    "checking:Chase:Joint",
    { scope: transferPanel },
  );
  await chooseOptionByKeyboard(
    page,
    "To account",
    "Ally:Emergency",
    "savings:Ally:Emergency",
    { scope: transferPanel },
  );
  // Truncated text forces a real search instead of selecting an exact searchLabel match.
  await chooseOptionByKeyboard(page, "Category", "ransfer", "Transfer", {
    scope: transferPanel,
  });
  await transferPanel.getByLabel("Memo").fill("E2E tab transfer");
  await saveAndExpectEntryCount("/api/transactions/transfer", 4);
});

test("advanced journal entry gates balance, persists drafts, and saves records", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E advanced journal ${unique}`;

  await page.goto("/transactions?page=1&pageSize=10");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await page.getByRole("tab", { name: "Advanced" }).click();
  await expect(
    page.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();

  const saveButton = page.getByRole("button", { name: "Save and add another" });
  await expect(saveButton).toBeDisabled();

  const firstRecord = journalRecord(page, 1);
  const secondRecord = journalRecord(page, 2);

  await expectAdvancedRecordUsableAtDockedWidth(page, firstRecord);
  await expect(
    firstRecord.getByLabel("Record 1 reconciliation status"),
  ).toHaveCount(0);

  await firstRecord.getByLabel("Amount").fill("0");
  await firstRecord.getByLabel("Amount").blur();
  await expect(
    firstRecord.getByText(
      "Enter a signed non-zero amount with up to 8 decimals.",
    ),
  ).toBeVisible();
  await firstRecord.getByLabel("Amount").fill("-10.00");
  await secondRecord.getByLabel("Amount").fill("9.00");
  await expectAdvancedBalanceStatus(page, "USD", "Unbalanced");
  await expect(saveButton).toBeDisabled();
  await secondRecord.getByLabel("Amount").fill("10.00");
  await expectAdvancedBalanceStatus(page, "USD", "Balanced");

  await firstRecord.getByLabel("Memo").fill(memo);
  await page.getByRole("button", { name: "Close entry panel" }).click();
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(
    page.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();
  await expect(firstRecord.getByLabel("Amount")).toHaveValue("-10.00");
  await expect(firstRecord.getByLabel("Memo")).toHaveValue(memo);

  await page.getByLabel("Date").fill("2026-05-31");
  await chooseOptionByKeyboard(page, "Account", "Wallet", "cash:Wallet", {
    scope: firstRecord,
  });
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: firstRecord },
  );

  await chooseOptionByKeyboard(
    page,
    "Account",
    "Chase:Joint",
    "checking:Chase:Joint",
    { scope: secondRecord },
  );
  await secondRecord.getByLabel("Amount").fill("-5.00");
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: secondRecord },
  );

  await page.getByRole("button", { name: "Add record" }).click();
  const thirdRecord = journalRecord(page, 3);
  await chooseOptionByKeyboard(page, "Account", "Books", "merchant:Books", {
    scope: thirdRecord,
  });
  await thirdRecord.getByLabel("Amount").fill("15.00");
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: thirdRecord },
  );
  await thirdRecord.getByLabel("Memo").fill(memo);

  await expectAdvancedBalanceStatus(page, "USD", "Balanced");
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();
});

test("spend entry escalates to matching journal records", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E escalation ${unique}`;
  const amount = "13.47";

  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");

  await page.goto("/transactions?page=1&pageSize=10");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const entryPanel = page.locator("aside[aria-labelledby='entry-panel-title']");
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await spendPanel.getByLabel("Date").fill("2026-05-31");
  await fillAndExpectValue(spendPanel.getByLabel("Amount"), amount);
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    "Wallet",
    "cash:Wallet",
    { scope: spendPanel },
  );
  await chooseOptionByKeyboard(page, "Merchant", "Books", "merchant:Books", {
    scope: spendPanel,
  });
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: spendPanel },
  );
  await spendPanel.getByLabel("Memo").fill(memo);
  await page.getByRole("button", { name: "Edit as journal" }).click();

  await expect(
    page.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();
  const firstRecord = journalRecord(page, 1);
  const secondRecord = journalRecord(page, 2);
  await expect(
    firstRecord.getByRole("combobox", { name: "Account" }),
  ).toHaveValue("cash:Wallet");
  await expect(firstRecord.getByLabel("Amount")).toHaveValue(`-${amount}`);
  await expect(
    firstRecord.getByRole("combobox", { name: "Category" }),
  ).toHaveValue("Entertainment:Books");
  await expect(firstRecord.getByLabel("Memo")).toHaveValue(memo);
  await expect(
    secondRecord.getByRole("combobox", { name: "Account" }),
  ).toHaveValue("merchant:Books");
  await expect(secondRecord.getByLabel("Amount")).toHaveValue(amount);

  const saveResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Save and add another" }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok()).toBe(true);
  const escalated = (await saveResponse.json()) as TransactionDetailFixture;

  const directResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount,
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo,
      posting_status: "posted",
      reconciliation_status: "unreconciled",
      tag_ids: [],
    },
  });
  expect(directResponse.ok()).toBe(true);
  const direct = (await directResponse.json()) as TransactionDetailFixture;
  expect(comparableRecords(escalated.records)).toEqual(
    comparableRecords(direct.records),
  );

  await page.getByRole("tab", { name: "Income" }).click();
  const incomePanel = entryPanel.getByRole("tabpanel", { name: "Income" });
  await fillAndExpectValue(incomePanel.getByLabel("Amount"), "7.25");
  await chooseOptionByKeyboard(
    page,
    "Destination account",
    "Wallet",
    "cash:Wallet",
    { scope: incomePanel },
  );
  await page.getByRole("button", { name: "Edit as journal" }).click();
  await expect(
    journalRecord(page, 1).getByRole("combobox", { name: "Account" }),
  ).toHaveValue("cash:Wallet");
  await expect(journalRecord(page, 1).getByLabel("Amount")).toHaveValue("7.25");
  await expect(
    journalRecord(page, 2).getByRole("combobox", { name: "Account" }),
  ).toHaveValue("");
  await expect(journalRecord(page, 2).getByLabel("Amount")).toHaveValue(
    "-7.25",
  );
});

test("advanced journal account picker follows selected category intent", async ({
  page,
}) => {
  await page.goto("/transactions?page=1&pageSize=10");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await page.getByRole("tab", { name: "Advanced" }).click();

  const firstRecord = journalRecord(page, 1);
  await chooseOptionByKeyboard(page, "Category", "ransfer", "Transfer", {
    scope: firstRecord,
  });

  const accountPicker = firstRecord.getByRole("combobox", { name: "Account" });
  await accountPicker.fill("merchant:Books");
  await expect(
    page.locator("#advanced-record-0-account-options"),
  ).toContainText("No matches");
  await accountPicker.fill("Wallet");
  await expect(
    page.locator("#advanced-record-0-account-options").getByText("cash:Wallet"),
  ).toBeVisible();

  const categoryPicker = firstRecord.getByRole("combobox", {
    name: "Category",
  });
  await categoryPicker.fill("");
  await accountPicker.fill("merchant:Books");
  await expect(accountPicker).toHaveValue("merchant:Books");
});

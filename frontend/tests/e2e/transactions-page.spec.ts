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

interface StoredTransactionEntryDraftFixture {
  readonly tabs?: {
    readonly spend?: {
      readonly memo?: string;
    };
  };
}

interface RecurringDefinitionFixture {
  readonly recurring_definition_id: number;
}

const defaultTransactionRequestStatuses = [
  "cancelled",
  "expected",
  "pending",
  "posted",
] as const;

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
    readonly hideExpected?: boolean;
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
        hideExpected: searchParams.get("hideExpected"),
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
      hideExpected: expected.hideExpected ? "true" : null,
      page: expected.page ?? "1",
      pageSize: expected.pageSize ?? "50",
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
      JSON.stringify(
        [...(expected.statuses ?? defaultTransactionRequestStatuses)].sort(),
      ) &&
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
  accountType: "balance" | "flow" | "system",
  currency?: string,
  isFeatured?: boolean,
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency,
      fqn,
      is_featured: isFeatured,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as AccountFixture;
};

const createExpectedRecurringFixture = async (
  page: Page,
  unique: string,
  options: {
    readonly anchorDate?: string;
    readonly featured?: boolean;
  } = {},
): Promise<{
  readonly checking: AccountFixture;
  readonly merchantFqn: string;
  readonly memo: string;
}> => {
  const anchorDate = options.anchorDate ?? formatLocalDate(new Date());
  const checking = await createAccount(
    page,
    `e2e:ExpectedFilter:${unique}:Checking${unique}`,
    "balance",
    "USD",
    options.featured,
  );
  const merchant = await createAccount(
    page,
    `e2e:ExpectedFilter:${unique}:Merchant${unique}`,
    "flow",
  );
  const category = await createCategory(
    page,
    `e2e:ExpectedFilter:${unique}:Category`,
    "expense",
  );
  const memo = `E2E expected filter ${unique}`;
  const definition = await page.request.post("/api/recurring-definitions", {
    data: {
      anchor_date: anchorDate,
      fqn: `E2E:ExpectedFilter:${unique}`,
      schedule_rule: {
        every: 1,
        kind: "interval",
        unit: "YEAR",
        version: 1,
      },
      records: [
        {
          account_id: checking.account_id,
          amount: "-23.45000000",
          category_id: category.category_id,
          currency: "USD",
          memo: `${memo} funding`,
          tag_ids: [],
        },
        {
          account_id: merchant.account_id,
          amount: "23.45000000",
          category_id: category.category_id,
          currency: "USD",
          memo: `${memo} merchant`,
          tag_ids: [],
        },
      ],
    },
  });
  const definitionBody = await definition.text();
  expect(definition.ok(), definitionBody).toBe(true);
  const created = JSON.parse(definitionBody) as RecurringDefinitionFixture;

  const materialized = await page.request.get(
    `/api/recurring-occurrences?recurring_definition_id=${created.recurring_definition_id}` +
      "&status=expected&limit=500&offset=0",
  );
  expect(materialized.ok(), await materialized.text()).toBe(true);

  return { checking, merchantFqn: merchant.fqn, memo };
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

const hideAccount = async (
  page: Page,
  account: AccountFixture,
): Promise<void> => {
  const response = await page.request.patch(
    `/api/accounts/${account.account_id}`,
    { data: { is_hidden: true } },
  );
  expect(response.ok()).toBe(true);
};

const amountChipsFitCell = async (row: Locator): Promise<boolean> =>
  row
    .locator("td")
    .nth(8)
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
    const memberCell = cells[7];
    const amountCell = cells[8];
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
    .nth(6)
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
  await page.goto("/transactions?hideExpected=true");

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

  await transferRow.locator("td").nth(4).click();
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

test("expanded records edit per-record values and escalate structural changes", async ({
  page,
}, testInfo) => {
  test.slow();
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const nextCategory = await createCategory(
    page,
    `E2E:RecordEditing:${unique}:Updated`,
    "expense",
  );
  const [initialTag, addedTag, member] = await Promise.all([
    createTag(page, `E2E:RecordEditing:${unique}:Initial`),
    createTag(page, `E2E:RecordEditing:${unique}:Added`),
    createMember(page, `Record editor ${unique}`),
  ]);
  const memo = `E2E record editing ${unique}`;
  const updatedMemo = `E2E record editing updated ${unique}`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto("/transactions?page=1&pageSize=50&hideExpected=true");
  const transactionRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(transactionRow).toBeVisible();
  await transactionRow.locator("td").nth(4).click();
  await expect(transactionRow).toHaveAttribute("aria-expanded", "true");
  const records = page.getByTestId("expanded-records");

  const categoryCell = records.getByTestId("record-category-cell").first();
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = records.getByTestId("record-category-editor").first();
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  await expect(categoryCell).toContainText(nextCategory.fqn);
  await expect(transactionRow.locator("td").nth(5)).toContainText("Mixed");

  const tagCell = records.getByTestId("record-tags-cell").first();
  await tagCell.hover();
  await tagCell.getByRole("button", { name: "Edit Tags" }).click();
  const tagEditor = records.getByTestId("record-tags-editor").first();
  await tagEditor.getByRole("combobox", { name: "Tags" }).fill(addedTag.fqn);
  await tagEditor.getByRole("combobox", { name: "Tags" }).press("Enter");
  await tagEditor.getByRole("button", { name: "Save" }).click();
  await expect(tagCell).toContainText(addedTag.name);

  const memberCell = records.getByTestId("record-member-cell").first();
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  let memberEditor = records.getByTestId("record-member-editor").first();
  await memberEditor
    .getByRole("combobox", { name: "Member" })
    .fill(member.name);
  await expect(memberCell).toContainText(member.name);
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  memberEditor = records.getByTestId("record-member-editor").first();
  await memberEditor.getByRole("combobox", { name: "Member" }).press("Escape");
  await memberEditor.getByRole("button", { name: "Clear member" }).click();
  await expect(memberCell).not.toContainText(member.name);

  const memoCell = records.getByTestId("record-memo-cell").first();
  await memoCell.getByRole("button", { name: "Edit memo" }).click();
  const memoEditor = records.getByTestId("record-memo-editor").first();
  await memoEditor.getByLabel("Memo").fill(updatedMemo);
  await memoEditor.getByLabel("Memo").press("Enter");
  await expect(memoCell).toContainText(updatedMemo);

  const datesCell = records.getByTestId("record-dates-cell").first();
  await datesCell.getByRole("button", { name: "Edit dates" }).click();
  const datesEditor = records.getByTestId("record-dates-editor").first();
  await datesEditor.getByLabel("Initiated").fill("2026-07-09");
  await datesEditor.getByRole("button", { name: "Save" }).click();
  await expect(datesCell).toContainText("Initiated 2026-07-09");

  const statusCell = records.getByTestId("record-postingStatus-cell").first();
  await statusCell.focus();
  await statusCell.press("F2");
  const statusEditor = records
    .getByTestId("record-postingStatus-editor")
    .first();
  await statusEditor.getByRole("combobox", { name: "Posting status" }).click();
  await page.getByRole("option", { name: "Cancelled" }).click();
  await expect(statusEditor.getByRole("alert")).toContainText(/cancelled/i);
  const unchangedResponse = await page.request.get(
    `/api/transactions/${transaction.transaction_id}`,
  );
  expect(unchangedResponse.ok(), await unchangedResponse.text()).toBe(true);
  const unchanged =
    (await unchangedResponse.json()) as TransactionDetailFixture;
  expect(unchanged.records.map((record) => record.posting_status)).toEqual([
    "posted",
    "posted",
  ]);

  await expect(records.getByTestId("record-account-editor")).toHaveCount(0);
  await expect(records.getByTestId("record-amount-editor")).toHaveCount(0);
  await records
    .getByRole("button", { name: "Edit account in journal" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await deleteTransaction(page, transaction);
});

test("transaction-row inline editing follows the uniformity rule", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1920, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const [nextCategory, transferCategory, initialTag, nextTag, member] =
    await Promise.all([
      createCategory(
        page,
        `E2E:RowEditing:${unique}:UpdatedCategory`,
        "expense",
      ),
      createCategory(page, `E2E:RowEditing:${unique}:Transfer`, "transfer"),
      createTag(page, `E2E:RowEditing:${unique}:InitialTag`),
      createTag(page, `E2E:RowEditing:${unique}:NextTag`),
      createMember(page, `Row editor ${unique}`),
    ]);
  const personAccount = await createAccount(
    page,
    `people:RowEditing:${unique}:balance`,
    "balance",
    "USD",
  );
  const memo = `E2E row editing ${unique}`;
  const uniformResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          member_id: member.member_id,
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          member_id: member.member_id,
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
      ],
    },
  });
  expect(uniformResponse.ok(), await uniformResponse.text()).toBe(true);
  const uniform = (await uniformResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?q=${encodeURIComponent(memo)}&page=1&pageSize=50&hideExpected=true`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  const rowPrefix = `transaction-${uniform.transaction_id}`;
  await row
    .getByRole("button", { name: `Filter by ${initialCategory.name}` })
    .click();
  await expectTransactionFilterUrl(page, {
    categories: [initialCategory.category_id],
    hideExpected: true,
    q: memo,
  });
  await page.getByRole("button", { name: "Close filters" }).click();
  await expectTransactionFilterUrl(page, { hideExpected: true, q: memo });
  await expect(row).toBeVisible();
  const categoryCell = row.getByTestId(`${rowPrefix}-category-cell`);
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = row.getByTestId(`${rowPrefix}-category-editor`);
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  await row.locator("td").nth(4).click();
  const expandedRecords = page.getByTestId("expanded-records");
  await expect(
    expandedRecords.getByText(nextCategory.fqn, { exact: true }),
  ).toHaveCount(2);

  const tagCell = row.getByTestId(`${rowPrefix}-tags-cell`);
  await tagCell.hover();
  await tagCell.getByRole("button", { name: "Edit Tags" }).click();
  const tagEditor = row.getByTestId(`${rowPrefix}-tags-editor`);
  await tagEditor.getByRole("combobox", { name: "Tags" }).fill(nextTag.fqn);
  await tagEditor.getByRole("combobox", { name: "Tags" }).press("Enter");
  await tagEditor.getByRole("button", { name: "Save" }).click();
  await expect(
    expandedRecords.getByText(nextTag.fqn, { exact: true }),
  ).toHaveCount(2);

  const memberCell = row.getByTestId(`${rowPrefix}-member-cell`);
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  const memberEditor = row.getByTestId(`${rowPrefix}-member-editor`);
  await memberEditor
    .getByRole("combobox", { name: "Member" })
    .fill(member.name);
  await memberEditor.getByRole("combobox", { name: "Member" }).press("Enter");
  await expect(
    expandedRecords.getByText(member.name, { exact: true }),
  ).toHaveCount(2);

  const amountCell = row.getByTestId(`${rowPrefix}-amount-cell`);
  await amountCell.hover();
  await amountCell.getByRole("button", { name: "Edit row value" }).click();
  const amountEditor = row.getByTestId(`${rowPrefix}-amount-editor`);
  await amountEditor.getByLabel("Amount").fill("29.87");
  await amountEditor.getByRole("button", { name: "Save" }).click();
  await expect(expandedRecords).toContainText("-29.87 $");
  await expect(expandedRecords).toContainText("+29.87 $");

  const mixedMemo = `E2E row editing mixed ${unique}`;
  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-12.00000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "12.00000000",
          category_id: nextCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);
  const mixed = (await mixedResponse.json()) as TransactionDetailFixture;
  await page.goto(
    `/transactions?q=${encodeURIComponent(mixedMemo)}&page=1&pageSize=50&hideExpected=true`,
  );
  const mixedRow = page.getByRole("row").filter({ hasText: mixedMemo }).first();
  await expect(mixedRow).toContainText("Mixed");
  await expect(
    mixedRow.getByTestId(`transaction-${mixed.transaction_id}-category-cell`),
  ).toHaveCount(0);

  const nonSimpleMemo = `E2E row editing non-simple ${unique}`;
  const nonSimpleResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-20.00000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: nonSimpleMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "15.00000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: nonSimpleMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: personAccount.account_id,
          amount: "5.00000000",
          category_id: transferCategory.category_id,
          currency: "USD",
          memo: nonSimpleMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(nonSimpleResponse.ok(), await nonSimpleResponse.text()).toBe(true);
  const nonSimple =
    (await nonSimpleResponse.json()) as TransactionDetailFixture;
  await page.goto(
    `/transactions?q=${encodeURIComponent(nonSimpleMemo)}&page=1&pageSize=50&hideExpected=true`,
  );
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: nonSimpleMemo })
      .first()
      .getByTestId(`transaction-${nonSimple.transaction_id}-amount-cell`),
  ).toHaveCount(0);

  await Promise.all([
    deleteTransaction(page, uniform),
    deleteTransaction(page, mixed),
    deleteTransaction(page, nonSimple),
  ]);

  await page.goto("/transactions?page=1&pageSize=50");
  const expectedRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "Expected" }) })
    .first();
  await expect(expectedRow).toBeVisible();
  await expect(
    expectedRow.getByRole("button", { name: "Edit Category" }),
  ).toHaveCount(0);
  await expect(
    expectedRow.getByRole("button", { name: "Edit Tags" }),
  ).toHaveCount(0);
  await expect(
    expectedRow.getByRole("button", { name: "Edit Member" }),
  ).toHaveCount(0);
  await expect(
    expectedRow.getByRole("button", { name: "Edit row value" }),
  ).toHaveCount(0);
});

test("transactions page uses server pagination controls", async ({ page }) => {
  const defaultPageRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("limit") === "50" &&
      url.searchParams.get("offset") === "0"
    );
  });
  await page.goto("/transactions");
  await defaultPageRequest;
  await expect(page.getByLabel("Rows")).toContainText("50");
  await page.getByLabel("Rows").click();
  await expect(
    page.getByRole("option", { exact: true, name: "25" }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { exact: true, name: "50" }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { exact: true, name: "100" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  const legacyPageSizeRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("limit") === "50" &&
      url.searchParams.get("offset") === "0"
    );
  });
  await page.goto("/transactions?page=1&pageSize=10&hideExpected=true");
  await legacyPageSizeRequest;
  await expect(page.getByLabel("Rows")).toContainText("50");

  await page.goto("/transactions?page=1&pageSize=25&hideExpected=true");

  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  await expect(
    page.locator("tbody > tr[aria-expanded]").filter({ hasText: "→" }).first(),
  ).toBeVisible();
  const firstPageFirstTitle = (
    await page
      .locator("tbody > tr[aria-expanded]")
      .first()
      .locator("td")
      .nth(4)
      .innerText()
  ).split("\n")[0];
  const firstPageFirstDate = await page
    .locator("tbody > tr[aria-expanded]")
    .first()
    .locator("td")
    .nth(2)
    .innerText();
  expect(firstPageFirstDate).toMatch(/^[A-Z][a-z]{2} \d{1,2}\n\d{4}$/);

  const amountColumnBefore = await page
    .getByRole("columnheader", { name: "Amount" })
    .boundingBox();
  expect(amountColumnBefore).not.toBeNull();

  let releaseNextPageResponse: (() => void) | undefined;
  const nextPageRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/transactions**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("offset") === "25") {
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

  await page.goto("/transactions?page=2&pageSize=25");
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
  expect(requestUrl.searchParams.get("limit")).toBe("25");
  expect(requestUrl.searchParams.get("offset")).toBe("0");
  expect(requestUrl.searchParams.get("search")).toBe(unique);

  await expectTransactionsPageUrl(page, 1, 25, { q: unique });
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

  await page.goto("/transactions?page=2&pageSize=25");
  await expect(page.getByText("Description")).toBeVisible();

  await page.getByRole("button", { name: "Open filters" }).click();
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
        limit: "25",
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
    pageSize: "25",
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
        limit: "25",
        statuses: ["pending"],
        tags: [visibleTagOne.tag_id, visibleTagTwo.tag_id],
      })
    );
  });
  await page.goto(
    `/transactions?page=1&pageSize=25&tag=${visibleTagOne.tag_id}` +
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
        limit: "50",
        statuses: ["pending"],
        tags: [visibleTagOne.tag_id, visibleTagTwo.tag_id],
      })
    );
  });
  await page.getByLabel("Rows").click();
  await page.getByRole("option", { exact: true, name: "50" }).click();
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
        limit: "50",
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
    pageSize: "50",
    tags: [visibleTagOne.tag_id, visibleTagTwo.tag_id],
  });

  await page.getByRole("button", { name: "Close filters" }).click();
  await expectTransactionFilterUrl(page, { pageSize: "50" });
  await expect(page.getByText("Tag Groceries")).toBeHidden();
  await expect(page.getByText("Amount 10-20")).toBeHidden();
});

test("transactions inline recurring occurrences support hide, confirm, dismiss, and registers", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const overdueFixture = await createExpectedRecurringFixture(
    page,
    `${unique}Overdue`,
    {
      anchorDate: shiftLocalDate(formatLocalDate(new Date()), -1),
      featured: true,
    },
  );
  const dueFixture = await createExpectedRecurringFixture(page, `${unique}Due`);
  const search = unique;

  const defaultRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === search &&
      transactionRequestHasFilters(url, { limit: "50" })
    );
  });
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  await defaultRequest;
  const overdueRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "Expected" }) })
    .filter({
      hasText: overdueFixture.merchantFqn.split(":").at(-1) ?? "Merchant",
    });
  const dueRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "Expected" }) })
    .filter({
      hasText: dueFixture.merchantFqn.split(":").at(-1) ?? "Merchant",
    });
  await expect(overdueRow).toBeVisible();
  await expect(dueRow).toBeVisible();
  await expect(overdueRow.getByRole("img", { name: "Overdue" })).toBeVisible();
  await expect(overdueRow.getByText("-23.45 $", { exact: true })).toHaveClass(
    /text-muted-foreground/,
  );

  const hideRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === search &&
      transactionRequestHasFilters(url, {
        limit: "50",
        statuses: ["cancelled", "pending", "posted"],
      })
    );
  });
  await page.getByRole("checkbox", { name: "Hide expected" }).click();
  await hideRequest;

  await expectTransactionFilterUrl(page, {
    pageSize: "50",
    q: search,
    hideExpected: true,
  });
  await expect(overdueRow).toHaveCount(0);
  await expect(dueRow).toHaveCount(0);

  await page.getByRole("checkbox", { name: "Hide expected" }).click();
  await expectTransactionFilterUrl(page, { pageSize: "50", q: search });
  await expect(overdueRow).toBeVisible();

  await page.goto(`/accounts/${overdueFixture.checking.account_id}`);
  const registerRow = page
    .getByTestId("account-register-row")
    .filter({ hasText: overdueFixture.memo });
  await expect(registerRow).toBeVisible();
  await expect(
    registerRow.getByText("Expected", { exact: true }),
  ).toBeVisible();
  await expect(registerRow.getByRole("img", { name: "Overdue" })).toBeVisible();

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  const featuredRow = page
    .getByTestId("featured-balance-row")
    .filter({ hasText: overdueFixture.checking.fqn.split(":").at(-1) ?? "" });
  await expect(featuredRow).toContainText("0.00 $");
  await overdueRow.getByRole("button", { name: "Confirm occurrence" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Occurrence confirmed." }),
  ).toBeVisible();
  await expect(overdueRow.getByRole("img", { name: "Expected" })).toHaveCount(
    0,
  );
  await expect(featuredRow).toContainText("-23.45 $");

  await dueRow.getByRole("button", { name: "Dismiss occurrence" }).click();
  const dismissDialog = page.getByRole("alertdialog", {
    name: "Dismiss occurrence",
  });
  await expect(dismissDialog).toContainText(
    dueFixture.merchantFqn.split(":").at(-1) ?? "Merchant",
  );
  await dismissDialog
    .getByRole("button", { name: "Dismiss occurrence" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Occurrence dismissed." }),
  ).toBeVisible();
  await expect(dueRow).toHaveCount(0);
  await page.reload();
  await expect(dueRow).toHaveCount(0);
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
  await classFilter.click();
  const classListbox = page.getByRole("listbox");
  await expect(classListbox).toBeVisible();
  await expect(classListbox).toHaveClass(/border-\[var\(--border-ink\)\]/);
  await expect(
    classListbox.getByRole("option", { exact: true, name: "Spend" }),
  ).toBeVisible();
  await page.getByRole("option", { exact: true, name: "Spend" }).click();
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

  await classFilter.click();
  await page.getByRole("option", { exact: true, name: "All classes" }).click();
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
  await expect(classFilter).toHaveText("Income");
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeHidden();
  await page.reload();
  await expect(classFilter).toHaveText("Income");

  await classFilter.click();
  await page.getByRole("option", { exact: true, name: "Spend" }).click();
  await expect(classFilter).toHaveText("Spend");
  await page.goBack();
  await expect(classFilter).toHaveText("Income");
  await page.goForward();
  await expect(classFilter).toHaveText("Spend");

  await page.getByRole("button", { name: "Open filters" }).click();
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
  await expect(classFilter).toHaveText("Spend");
  await expect(
    page.getByRole("row").filter({ hasText: spendMemo }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: incomeMemo }),
  ).toBeVisible();

  await classFilter.click();
  await page.getByRole("option", { exact: true, name: "Income" }).click();
  await expectTransactionFilterUrl(page, {
    classes: ["income"],
    pageSize: "50",
    q: unique,
  });
});

test("transactions filter toolbar keeps a stable inline trigger geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  await page.goto("/transactions?page=1&pageSize=50&hideExpected=true");
  await expect(page.getByText("Description")).toBeVisible();

  const toolbarRow = page.getByTestId("transaction-browser-toolbar-row");
  const filterToggle = page.getByRole("button", { name: "Open filters" });
  const dateJumpInput = page.getByLabel("Go to day");
  const previousDayButton = page.getByRole("button", {
    name: "Previous day",
  });
  const nextDayButton = page.getByRole("button", { name: "Next day" });
  const initialTriggerBox = await filterToggle.boundingBox();
  const initialToolbarRowBox = await toolbarRow.boundingBox();
  const dateJumpInputBox = await dateJumpInput.boundingBox();
  const previousDayButtonBox = await previousDayButton.boundingBox();
  const nextDayButtonBox = await nextDayButton.boundingBox();
  expect(initialTriggerBox).not.toBeNull();
  expect(initialToolbarRowBox).not.toBeNull();
  expect(dateJumpInputBox).not.toBeNull();
  expect(previousDayButtonBox).not.toBeNull();
  expect(nextDayButtonBox).not.toBeNull();
  expect(initialTriggerBox?.width).toBe(36);
  expect(initialTriggerBox?.height).toBe(36);
  expect(previousDayButtonBox?.width).toBe(36);
  expect(previousDayButtonBox?.height).toBe(36);
  expect(nextDayButtonBox?.width).toBe(36);
  expect(nextDayButtonBox?.height).toBe(36);
  expect(previousDayButtonBox?.y).toBe(dateJumpInputBox?.y);
  expect(nextDayButtonBox?.y).toBe(dateJumpInputBox?.y);

  await filterToggle.focus();
  await page.keyboard.press("Enter");
  const closeFilterButton = page.getByRole("button", {
    name: "Close filters",
  });
  const openedTriggerBox = await closeFilterButton.boundingBox();
  const openedToolbarRowBox = await toolbarRow.boundingBox();
  expect(openedTriggerBox).not.toBeNull();
  expect(openedToolbarRowBox).not.toBeNull();
  expect(openedTriggerBox).toEqual(initialTriggerBox);
  expect(openedToolbarRowBox?.height).toBe(initialToolbarRowBox?.height);
  const addFilterButton = page.getByRole("button", { name: "Add filter" });
  await addFilterButton.focus();
  await page.keyboard.press("Enter");
  const postingStatusButton = page.getByRole("button", {
    name: "Posting status",
  });
  await expect(postingStatusButton).toBeVisible();
  await postingStatusButton.focus();
  await page.keyboard.press("Enter");
  const pendingCheckbox = page.getByRole("checkbox", { name: "Pending" });
  await expect(pendingCheckbox).toBeFocused();
  await expect(pendingCheckbox).toBeVisible();
  await page.getByText("Pending", { exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("status"))
    .toBe("pending");

  const statusChip = page.getByText("Status Pending", { exact: true });
  await expect(statusChip).toBeVisible();
  await page.keyboard.press("Escape");
  const triggerWithChipBox = await closeFilterButton.boundingBox();
  const chipBox = await statusChip.boundingBox();
  const toolbarWithChipBox = await toolbarRow.boundingBox();
  const filterBarBox = await page
    .getByTestId("transaction-browser-filter-bar")
    .boundingBox();
  expect(triggerWithChipBox).not.toBeNull();
  expect(chipBox).not.toBeNull();
  expect(toolbarWithChipBox).not.toBeNull();
  expect(filterBarBox).not.toBeNull();
  expect(triggerWithChipBox?.x).toBe(initialTriggerBox?.x);
  expect(triggerWithChipBox?.y).toBe(initialTriggerBox?.y);
  expect(toolbarWithChipBox?.height).toBe(initialToolbarRowBox?.height);
  expect(chipBox?.y ?? 0).toBeGreaterThan(filterBarBox?.y ?? 0);
  expect((chipBox?.y ?? 0) + (chipBox?.height ?? 0)).toBeLessThan(
    (filterBarBox?.y ?? 0) + (filterBarBox?.height ?? 0),
  );

  const removeStatusButton = page.getByRole("button", {
    name: "Remove Status Pending",
  });
  await removeStatusButton.focus();
  await page.keyboard.press("Enter");
  await expect(statusChip).toBeHidden();
  const finalTriggerBox = await closeFilterButton.boundingBox();
  const finalToolbarBox = await toolbarRow.boundingBox();
  expect(finalTriggerBox).not.toBeNull();
  expect(finalToolbarBox).not.toBeNull();
  expect(finalTriggerBox?.x).toBe(initialTriggerBox?.x);
  expect(finalTriggerBox?.y).toBe(initialTriggerBox?.y);
  expect(finalToolbarBox?.height).toBe(initialToolbarRowBox?.height);
});

test("transactions filter toolbar suppresses open-control tooltips and supports Tab traversal", async ({
  page,
}, testInfo) => {
  await page.goto("/transactions?page=1&pageSize=50&hideExpected=true");
  const searchInput = page.getByRole("searchbox", { name: "Search" });
  const previousDayButton = page.getByRole("button", {
    name: "Previous day",
  });
  const dateJumpInput = page.getByLabel("Go to day");
  const nextDayButton = page.getByRole("button", { name: "Next day" });
  const todayButton = page.getByRole("button", { name: "Today" });
  const classFilter = page.getByLabel("Class");
  const hideExpectedToggle = page.getByRole("checkbox", {
    name: "Hide expected",
  });
  const filterToggle = page.getByRole("button", { name: "Open filters" });
  const filterTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Open filters" });
  const tabTo = async (target: Locator) => {
    await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
  };

  await filterToggle.hover();
  await expect(filterTooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(filterTooltip).toBeHidden();

  if (testInfo.project.name === "webkit") {
    await filterToggle.click();
    await expect(
      page.getByTestId("transaction-browser-filter-bar"),
    ).toBeVisible();
    const addFilterButton = page.getByRole("button", { name: "Add filter" });
    const addFilterTooltip = page
      .getByRole("tooltip")
      .filter({ hasText: "Add filter" });
    await addFilterButton.hover();
    await expect(addFilterTooltip).toBeVisible();
    await addFilterButton.click();
    await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();
    await addFilterButton.hover();
    await page.waitForTimeout(200);
    await expect(addFilterTooltip).toBeHidden();
    return;
  }

  await searchInput.focus();
  await searchInput.press("Tab");
  await expect(previousDayButton).toBeFocused();
  await tabTo(dateJumpInput);
  await nextDayButton.focus();
  await expect(nextDayButton).toBeFocused();
  await tabTo(todayButton);
  await tabTo(classFilter);
  await tabTo(hideExpectedToggle);
  await tabTo(filterToggle);
  await page.keyboard.press("Enter");

  const closeFilterButton = page.getByRole("button", {
    name: "Close filters",
  });
  await expect(
    page.getByTestId("transaction-browser-filter-bar"),
  ).toBeVisible();
  await closeFilterButton.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Close filters" }),
  ).toBeVisible();

  await page.keyboard.press("Tab");
  const addFilterButton = page.getByRole("button", { name: "Add filter" });
  await expect(addFilterButton).toBeFocused();
  const addFilterTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Add filter" });
  await addFilterButton.hover();
  await expect(addFilterTooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(addFilterTooltip).toBeHidden();
  await addFilterButton.click();
  await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();
  await addFilterButton.hover();
  await page.waitForTimeout(200);
  await expect(addFilterTooltip).toBeHidden();
});

test("filter X dismiss clears chips while retaining standing search and class filters", async ({
  page,
}) => {
  const categories = await listFixtures<CategoryFixture>(
    page,
    "/api/categories",
    "categories",
  );
  const category = findByFqn(categories, "Entertainment:Books");
  const search = "E2E X dismiss standing controls";

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}&class=spend&category=${category.category_id}`,
  );

  await expect(
    page.getByTestId("transaction-browser-filter-bar"),
  ).toBeVisible();
  await expect(page.getByText(`Category ${category.name}`)).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    search,
  );
  await expect(page.getByLabel("Class")).toHaveText("Spend");

  await page.getByRole("button", { name: "Close filters" }).click();

  await expect(page.getByTestId("transaction-browser-filter-bar")).toBeHidden();
  await expectTransactionFilterUrl(page, {
    classes: ["spend"],
    pageSize: "50",
    q: search,
  });
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    search,
  );
  await expect(page.getByLabel("Class")).toHaveText("Spend");
  await expect(
    page.getByRole("button", { name: "Open filters" }),
  ).toBeVisible();
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
  await expect(
    page.getByTestId("transaction-browser-filter-bar"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close filters" }),
  ).toBeVisible();
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

  await page.goto("/transactions?page=1&pageSize=25");
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
  const landedPage = Math.floor(dateJumpBody.offset / 25) + 1;
  expect(dateJumpBody.total_count).toBeGreaterThan(landedPage * 25);
  const landedTransaction = dateJumpBody.transactions[0]!;
  await expectTransactionsPageUrl(page, landedPage, 25);
  await expect(
    page.getByText(new RegExp(`Page ${landedPage} of \\d+`)),
  ).toBeVisible();
  await expect(
    page.getByText(landedTransaction.display_title).first(),
  ).toBeVisible();
  await expect(
    page.locator(`[data-date-jump-anchor="${jumpDate}"]`),
  ).toBeVisible();
  expect(
    transactionRequestUrls.filter((requestUrl) => {
      const url = new URL(requestUrl);
      return (
        url.searchParams.get("anchor_date") === null &&
        url.searchParams.get("limit") === "25" &&
        url.searchParams.get("offset") === String(dateJumpBody.offset)
      );
    }),
  ).toHaveLength(0);
  await expect(page.getByLabel("Go to day")).toHaveValue(jumpDate);

  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await expectTransactionsPageUrl(page, landedPage + 1, 25);
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
  const oldAnchorPage = Math.floor(oldDateJumpBody.offset / 25) + 1;
  await expectTransactionsPageUrl(page, oldAnchorPage, 25);
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

  await page.goto("/transactions?page=1&pageSize=25");
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
  await expect(previousDayButton).toBeEnabled();

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
  const previousLandedPage = Math.floor(previousPage.offset / 25) + 1;
  await expect(dateJump).toHaveValue(previousDate);
  await expectTransactionsPageUrl(page, previousLandedPage, 25);
  await expect(
    page.getByText(previousPage.transactions[0]!.display_title).first(),
  ).toBeVisible();
  await expect(nextDayButton).toBeEnabled();

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
    Math.floor(nextPage.offset / 25) + 1,
    25,
  );

  await page.goto("/transactions?page=1&pageSize=25");
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
  await expect(nextDayButton).toBeEnabled();
  await expect(dateJump).toHaveValue(yesterday);
  await expectTransactionsPageUrl(
    page,
    Math.floor(noAnchorPage.offset / 25) + 1,
    25,
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
  await expect(nextDayButton).toBeEnabled();
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

test("transactions page repositions a same-page day jump, then keeps stepping and offers Today", async ({
  page,
}) => {
  const mishaReviewDate = "2026-05-27";
  const previousDate = shiftLocalDate(mishaReviewDate, -1);

  await page.goto("/transactions?page=1&pageSize=50");
  const dateJump = page.getByLabel("Go to day");
  const samePageJumpResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === mishaReviewDate
    );
  });

  await dateJump.fill(mishaReviewDate);
  const samePageJump = (await (
    await samePageJumpResponse
  ).json()) as TransactionListFixture;
  expect(samePageJump.offset).toBe(0);
  const samePageJumpAnchor = page.locator(
    `[data-date-jump-anchor="${mishaReviewDate}"]`,
  );
  await expect(samePageJumpAnchor).toBeVisible();
  const samePageJumpBounds = await page
    .getByTestId("transactions-table-scroll")
    .evaluate((container, anchorDate) => {
      const row = container.querySelector(
        `[data-date-jump-anchor="${anchorDate}"]`,
      );
      if (!row) {
        return undefined;
      }

      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        containerBottom: containerRect.bottom,
        containerLeft: containerRect.left,
        containerRight: containerRect.right,
        containerTop: containerRect.top,
        rowBottom: rowRect.bottom,
        rowLeft: rowRect.left,
        rowRight: rowRect.right,
        rowTop: rowRect.top,
      };
    }, mishaReviewDate);
  expect(samePageJumpBounds).toBeDefined();
  expect(samePageJumpBounds!.rowTop).toBeGreaterThanOrEqual(
    samePageJumpBounds!.containerTop - 1,
  );
  expect(samePageJumpBounds!.rowBottom).toBeLessThanOrEqual(
    samePageJumpBounds!.containerBottom + 1,
  );
  expect(samePageJumpBounds!.rowLeft).toBeGreaterThanOrEqual(
    samePageJumpBounds!.containerLeft - 1,
  );
  expect(samePageJumpBounds!.rowRight).toBeLessThanOrEqual(
    samePageJumpBounds!.containerRight + 1,
  );

  const previousResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === previousDate
    );
  });
  await page.getByRole("button", { name: "Previous day" }).click();
  await previousResponse;
  await expect(dateJump).toHaveValue(previousDate);

  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();

  const today = formatLocalDate(new Date());
  const todayResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === today
    );
  });
  await page.getByRole("button", { name: "Today" }).click();
  const todayPage = (await (
    await todayResponse
  ).json()) as TransactionListFixture;
  await expect(dateJump).toHaveValue(today);
  await expectTransactionsPageUrl(
    page,
    Math.floor(todayPage.offset / 50) + 1,
    50,
  );
  await expect(
    page.locator(`[data-date-jump-anchor="${today}"]`),
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
      const amountCell = cells?.[8];
      const amountRect = rectFor(amountCell);
      const actionsCell = cells?.[9];
      const actionsRect = rectFor(actionsCell);
      const containerRect = container.getBoundingClientRect();
      const memberRect = rectFor(cells?.[7]);
      const memberContentRects = Array.from(
        cells?.[7]?.querySelectorAll("*") ?? [],
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
        const cell = visibleRow.querySelectorAll("td")[8];
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
        .map((visibleRow) => visibleRow.querySelectorAll("td")[8])
        .filter((cell): cell is HTMLTableCellElement => !isCollapsed(cell));
      const contentOverlappingAmount = amountRect
        ? Array.from(cells ?? [])
            .slice(0, 8)
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
        categoryCollapsed: isCollapsed(cells?.[5]),
        categoryHeaderCollapsed: isCollapsed(headerCells[5]),
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
        memberCollapsed: isCollapsed(cells?.[7]),
        memberFullyVisible:
          isCollapsed(cells?.[7]) ||
          (Boolean(memberRect) &&
            memberContentRects.every(
              (rect) =>
                rect.left >= (memberRect?.left ?? 0) - 0.5 &&
                rect.right <= (memberRect?.right ?? 0) + 0.5 &&
                (!amountRect || rect.right <= amountRect.left + 0.5),
            )),
        memberHeaderCollapsed: isCollapsed(headerCells[7]),
        statusCollapsed: isCollapsed(cells?.[3]),
        statusHeaderCollapsed: isCollapsed(headerCells[3]),
        tagsCollapsed: isCollapsed(cells?.[6]),
        tagsHeaderCollapsed: isCollapsed(headerCells[6]),
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
    await expect(longAmountRow.locator("td").nth(8)).toContainText(
      "-9,999,999,999.99 $",
    );
    const mixedLongAmountRow = page
      .getByRole("row")
      .filter({ hasText: mixedMemo });
    await expect(mixedLongAmountRow).toBeVisible();
    await expect(mixedLongAmountRow.locator("td").nth(8)).toContainText(
      "-9,999,999,999.99",
    );
    await expect(mixedLongAmountRow.locator("td").nth(8)).toContainText(
      "+8,888,888,888.88",
    );
    await expect(mixedLongAmountRow.locator("td").nth(8)).toContainText("$");

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
      .nth(8),
  ).toContainText("-43.98 $");
  await expect(
    page.getByRole("row").filter({ hasText: memo }).locator("td").nth(8),
  ).toContainText("-3.21 XDR");
});

test("transactions page help and leaf category chips", async ({ page }) => {
  await page.goto("/transactions?page=1&pageSize=50&hideExpected=true");

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
  await expect(simpleSpendRow.locator("td").nth(7)).not.toContainText("Mixed");
  await expect(simpleSpendRow.locator("td").nth(8)).toContainText(/-43\.98 \$/);
  await expect(
    simpleSpendRow
      .locator("td")
      .nth(4)
      .getByRole("button", { name: "Open transaction detail" }),
  ).toHaveCount(0);

  const mixedRow = page
    .getByRole("row")
    .filter({ hasText: "Mixed payroll correction" })
    .first();
  await expect(mixedRow).toBeVisible();
  await expect(
    mixedRow.locator("td").nth(5).getByText("Mixed", { exact: true }),
  ).toBeVisible();
  await expect(mixedRow.locator("td").nth(8)).toContainText(
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
    .getByRole("button", { name: "Filter by Books" })
    .first();
  await expect(booksCategory).toBeVisible();
  await booksCategory.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Entertainment:Books" }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).toBeHidden();

  const openDetailButton = simpleSpendRow.getByRole("button", {
    name: "Open transaction detail",
  });
  const deleteButton = simpleSpendRow.getByRole("button", {
    name: "Delete transaction",
  });
  await expect(openDetailButton).toBeVisible();
  await expect(deleteButton).toBeVisible();
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
  await openDetailButton.hover();
  const openDetailTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Open transaction detail" });
  await expect(openDetailTooltip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(openDetailTooltip).toBeHidden();
  await openDetailButton.focus();
  await expect(openDetailTooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(openDetailTooltip).toBeHidden();
  await expect(openDetailButton).toBeFocused();
  await deleteButton.hover();
  const deleteTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Delete transaction" });
  await expect(deleteTooltip).toBeVisible();
  await page.mouse.move(0, 0);
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
    fitTagRow.locator("td").nth(6).getByTestId("transaction-tags-overflow"),
  ).toHaveCount(0);

  const overflowTagRow = page
    .getByRole("row")
    .filter({ hasText: overflowMemo })
    .first();
  await expect(overflowTagRow).toBeVisible();

  const dateCell = overflowTagRow.locator("td").nth(2);
  await expect(dateCell.locator("div").nth(0)).toHaveText("May 31");
  await expect(dateCell.locator("div").nth(1)).toHaveText("2026");

  const statusCell = overflowTagRow.locator("td").nth(3);
  await expect(statusCell).toHaveText("");

  const overflowTagState = await tagChipLineState(overflowTagRow);
  expect(overflowTagState.visibleLabels.length).toBeGreaterThan(0);
  expect(overflowTagState.hiddenLabels.length).toBeGreaterThan(0);
  expect(overflowTagState.visibleRowCount).toBeLessThanOrEqual(2);

  const visibleOverflowTag = overflowTagRow
    .locator("td")
    .nth(6)
    .getByText(createdOverflowTags[0]?.name ?? "", { exact: true });
  await expect(visibleOverflowTag).toBeVisible();
  const overflowChip = overflowTagRow
    .locator("td")
    .nth(6)
    .getByTestId("transaction-tags-overflow");
  await expect(overflowChip).toBeVisible();
  const renderedOverflowTagLabels = await overflowTagRow
    .locator("td")
    .nth(6)
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
    .nth(7)
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
    .nth(4)
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
    detailRow.locator("td").nth(6).getByTestId("transaction-tags-overflow"),
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
      journalRecords
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

  await alternateDetailRow.locator("td").nth(4).click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(alternateDetailRow).toHaveAttribute("aria-expanded", "true");
  await alternateDetailRow.locator("td").nth(4).click();
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
  await alternateDetailRow.press("Enter");
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
    `/transactions?page=2&pageSize=25&transaction=${transaction.transaction_id}`,
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
  await expect(page).toHaveURL(/\/transactions\?page=2&pageSize=25$/);
});

test("transaction detail panel reuses inline editors and keeps expected occurrences read-only", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1920, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const [nextCategory, initialTag, member] = await Promise.all([
    createCategory(
      page,
      `E2E:DetailEditing:${unique}:UpdatedCategory`,
      "expense",
    ),
    createTag(page, `E2E:DetailEditing:${unique}:InitialTag`),
    createMember(page, `Detail editor ${unique}`),
  ]);
  const memo = `E2E detail editing ${unique}`;
  const updatedMemo = `E2E detail editing updated ${unique}`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          member_id: member.member_id,
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          member_id: member.member_id,
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&hideExpected=true&transaction=${transaction.transaction_id}`,
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(panel).toBeVisible();
  await expect(row).toBeVisible();

  const categoryCell = panel.getByTestId("transaction-detail-category-cell");
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = panel.getByTestId(
    "transaction-detail-category-editor",
  );
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  await expect(categoryCell).toContainText(nextCategory.fqn);
  await expect(row).toContainText(nextCategory.name);

  const amountCell = panel.getByTestId(
    `transaction-detail-${transaction.transaction_id}-amount-cell`,
  );
  await amountCell.hover();
  await amountCell.getByRole("button", { name: "Edit row value" }).click();
  const amountEditor = panel.getByTestId(
    `transaction-detail-${transaction.transaction_id}-amount-editor`,
  );
  await amountEditor.getByLabel("Amount").fill("29.87");
  await amountEditor.getByRole("button", { name: "Save" }).click();
  await expect(amountCell).toContainText("-29.87 $");
  await expect(row).toContainText("-29.87 $");

  const memoCell = panel.getByTestId("record-memo-cell").first();
  await memoCell.hover();
  await memoCell.getByRole("button", { name: "Edit memo" }).click();
  const memoEditor = panel.getByTestId("record-memo-editor").first();
  await memoEditor.getByLabel("Memo").fill(updatedMemo);
  await memoEditor.getByLabel("Memo").press("Enter");
  await expect(memoCell).toContainText(updatedMemo);
  const savedResponse = await page.request.get(
    `/api/transactions/${transaction.transaction_id}`,
  );
  expect(savedResponse.ok(), await savedResponse.text()).toBe(true);
  const saved = (await savedResponse.json()) as TransactionDetailFixture;
  expect(saved.records[0]?.memo).toBe(updatedMemo);

  const expected = await createExpectedRecurringFixture(page, unique);
  await page.goto("/transactions?page=1&pageSize=50");
  const expectedRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "Expected" }) })
    .filter({
      hasText: expected.merchantFqn.split(":").at(-1) ?? "Merchant",
    })
    .first();
  await expect(expectedRow).toBeVisible();
  await expectedRow
    .getByRole("button", { name: "Open transaction detail" })
    .click();
  const expectedPanel = page.getByTestId("transaction-detail-panel");
  await expect(expectedPanel).toBeVisible();
  await expect(
    expectedPanel.getByRole("button", { name: "Edit Category" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit Tags" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit Member" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit row value" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit memo" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { exact: true, name: "Edit" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Duplicate" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Split" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Delete" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Confirm occurrence" }),
  ).toBeVisible();
  await expect(
    expectedPanel.getByRole("button", { name: "Dismiss occurrence" }),
  ).toBeVisible();

  await expectedPanel
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await expectedRow.click();
  const expandedExpectedRecords = expectedRow.locator(
    "xpath=following-sibling::tr[1]",
  );
  await expect(expandedExpectedRecords).toBeVisible();
  await expect(
    expandedExpectedRecords.getByRole("button", { name: /Edit / }),
  ).toHaveCount(0);

  await deleteTransaction(page, transaction);
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

  await page.getByRole("button", { name: "Open filters" }).click();
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

  const filterToggle = page.getByRole("button", { name: "Open filters" });
  await filterToggle.focus();
  await expect(filterToggle).toBeFocused();
  await page.keyboard.press("Enter");
  const addFilterButton = page.getByRole("button", { name: "Add filter" });
  await addFilterButton.focus();
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
  await expect(page.getByTestId("bulk-action-bar")).toContainText("1 selected");
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

test("transaction detail edit opens a fitting spend and replaces the same transaction", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E edit spend ${unique}`;
  const updatedMemo = `E2E edit spend updated ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "21.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-04",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: memo })
    .first()
    .getByRole("button", { name: "Open transaction detail" })
    .click();

  const detailPanel = page.getByRole("dialog", {
    name: transaction.display_title,
  });
  await expect(detailPanel).toBeVisible();
  await detailPanel.getByRole("button", { exact: true, name: "Edit" }).click();

  const entryPanel = page.locator("aside[aria-labelledby='entry-panel-title']");
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(spendPanel.getByLabel("Amount")).toHaveValue("21.34");
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(memo);

  await spendPanel.getByLabel("Amount").fill("25.67");
  await spendPanel.getByLabel("Memo").fill(updatedMemo);
  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(comparableRecords(replaced.records)).toEqual([
    {
      account_id: fundingAccount.account_id,
      amount: "-25.67000000",
      category_id: category.category_id,
      currency: "USD",
      member_id: null,
      memo: updatedMemo,
      posting_status: "posted",
      reconciliation_status: "reconciled",
      source: "manual",
      tag_ids: [],
    },
    {
      account_id: merchantAccount.account_id,
      amount: "25.67000000",
      category_id: category.category_id,
      currency: "USD",
      member_id: null,
      memo: updatedMemo,
      posting_status: "posted",
      reconciliation_status: "reconciled",
      source: "manual",
      tag_ids: [],
    },
  ]);
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction updated." }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: updatedMemo }),
  ).toBeVisible();
});

test("transaction detail edit opens non-fitting transactions in the journal editor", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const incomeAccount = findByFqn(accounts, "income:AcmePayroll");
  const expenseCategory = findByFqn(categories, "Entertainment:Books");
  const incomeCategory = findByFqn(categories, "Income:Salary");
  const memo = `E2E edit mixed ${unique}`;
  const updatedMemo = `E2E edit mixed updated ${unique}`;

  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-04",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-10.00000000",
          category_id: expenseCategory.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "10.00000000",
          category_id: expenseCategory.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: fundingAccount.account_id,
          amount: "2.00000000",
          category_id: incomeCategory.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: incomeAccount.account_id,
          amount: "-2.00000000",
          category_id: incomeCategory.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);
  const transaction = (await mixedResponse.json()) as TransactionDetailFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: memo })
    .first()
    .getByRole("button", { name: "Open transaction detail" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Advanced" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(journalRecord(page, 4)).toBeVisible();
  await journalRecord(page, 1).getByLabel("Memo").fill(updatedMemo);

  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(replaced.records.some((record) => record.memo === updatedMemo)).toBe(
    true,
  );
});

test("shorthand edit escalation saves as a replacement", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E edit escalate ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.90",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-04",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: memo })
    .first()
    .getByRole("button", { name: "Open transaction detail" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit" })
    .click();
  const entryPanel = page.locator("aside[aria-labelledby='entry-panel-title']");
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await spendPanel.getByLabel("Amount").fill("19.91");
  await page.getByRole("button", { name: "Edit as journal" }).click();
  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await expect(journalRecord(page, 1).getByLabel("Amount")).toHaveValue(
    "-19.91",
  );
  await expect(journalRecord(page, 2).getByLabel("Amount")).toHaveValue(
    "19.91",
  );

  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(comparableRecords(replaced.records)).toEqual([
    {
      account_id: fundingAccount.account_id,
      amount: "-19.91000000",
      category_id: category.category_id,
      currency: "USD",
      member_id: null,
      memo,
      posting_status: "posted",
      reconciliation_status: "reconciled",
      source: "manual",
      tag_ids: [],
    },
    {
      account_id: merchantAccount.account_id,
      amount: "19.91000000",
      category_id: category.category_id,
      currency: "USD",
      member_id: null,
      memo,
      posting_status: "posted",
      reconciliation_status: "reconciled",
      source: "manual",
      tag_ids: [],
    },
  ]);
});

test("transaction detail duplicate prefills a new entry", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E duplicate source ${unique}`;
  const duplicateMemo = `E2E duplicate copy ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "16.45",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-05",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: memo })
    .first()
    .getByRole("button", { name: "Open transaction detail" })
    .click();

  const detailPanel = page.getByRole("dialog", {
    name: transaction.display_title,
  });
  await expect(
    detailPanel.getByRole("button", { exact: true, name: "Edit" }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("button", { name: "Duplicate" }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("button", { name: "Split" }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("button", { name: "Delete" }),
  ).toBeVisible();

  await detailPanel.getByRole("button", { name: "Duplicate" }).click();
  const entryPanel = page.locator("aside[aria-labelledby='entry-panel-title']");
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(spendPanel.getByLabel("Amount")).toHaveValue("16.45");
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(memo);
  await spendPanel.getByLabel("Memo").fill(duplicateMemo);

  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions/spend" &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Save and add another" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const duplicate = (await createResponse.json()) as TransactionFixture;
  expect(duplicate.transaction_id).not.toBe(transaction.transaction_id);
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction saved." }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: duplicateMemo }),
  ).toBeVisible();
});

test("transaction detail split opens journal replacement and surfaces replace errors", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const splitAccount = await createAccount(
    page,
    `merchant:SplitTarget:${unique}`,
    "flow",
  );
  const memo = `E2E split source ${unique}`;
  const splitMemo = `E2E split added ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "30.00",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-05",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: memo })
    .first()
    .getByRole("button", { name: "Open transaction detail" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Split" }).click();

  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Advanced" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(journalRecord(page, 1).getByLabel("Amount")).toHaveValue("-30");
  await expect(journalRecord(page, 2).getByLabel("Amount")).toHaveValue("30");

  await journalRecord(page, 2).getByLabel("Amount").fill("20.00");
  await page.getByRole("button", { name: "Add record" }).click();
  const thirdRecord = journalRecord(page, 3);
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: thirdRecord },
  );
  await chooseOptionByKeyboard(page, "Account", unique, splitAccount.fqn, {
    scope: thirdRecord,
  });
  await thirdRecord.getByLabel("Amount").fill("10.00");
  await thirdRecord.getByLabel("Memo").fill(splitMemo);

  const replaceUrlPattern = `**/api/transactions/${transaction.transaction_id}`;
  await page.route(replaceUrlPattern, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        contentType: "application/json",
        status: 400,
        body: JSON.stringify({
          error: {
            code: "invalid_request",
            message: "Forced replace failure",
          },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  await expect(page.getByText("Forced replace failure")).toBeVisible();
  await page.unroute(replaceUrlPattern);

  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(comparableRecords(replaced.records)).toEqual(
    comparableRecords([
      {
        account_id: fundingAccount.account_id,
        amount: "-30.00000000",
        category_id: category.category_id,
        currency: "USD",
        member_id: null,
        memo,
        posting_status: "posted",
        reconciliation_status: "reconciled",
        source: "manual",
        tag_ids: [],
      },
      {
        account_id: merchantAccount.account_id,
        amount: "20.00000000",
        category_id: category.category_id,
        currency: "USD",
        member_id: null,
        memo,
        posting_status: "posted",
        reconciliation_status: "reconciled",
        source: "manual",
        tag_ids: [],
      },
      {
        account_id: splitAccount.account_id,
        amount: "10.00000000",
        category_id: category.category_id,
        currency: "USD",
        member_id: null,
        memo: splitMemo,
        posting_status: "posted",
        reconciliation_status: "unreconciled",
        source: "manual",
        tag_ids: [],
      },
    ]),
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction updated." }),
  ).toBeVisible();
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
  const transactionRows = page.locator("tbody > tr[aria-expanded]");
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  const deletedRowIndex = await row.evaluate((element) =>
    Array.from(
      element.parentElement?.querySelectorAll("tr[aria-expanded]") ?? [],
    ).indexOf(element),
  );
  const rowCountBeforeDelete = await transactionRows.count();

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
  await expect(
    transactionRows.nth(Math.min(deletedRowIndex, rowCountBeforeDelete - 2)),
  ).toBeFocused();
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
    hiddenTagRow.locator("td").nth(6).getByText("QuietTag", { exact: true }),
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

test("bulk selection updates uniform transactions and skips mixed records", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const [targetCategory, tag, member] = await Promise.all([
    createCategory(page, `E2E:Bulk:${unique}:Category`, "expense"),
    createTag(page, `E2E:Bulk:${unique}:Tag`),
    createMember(page, `Bulk member ${unique}`),
  ]);
  const uniformMemo = `E2E bulk uniform ${unique}`;
  const mixedMemo = `E2E bulk mixed ${unique}`;
  const uniformResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-12",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-11.00000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: uniformMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "11.00000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: uniformMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(uniformResponse.ok(), await uniformResponse.text()).toBe(true);
  const uniform = (await uniformResponse.json()) as TransactionDetailFixture;
  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-12",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-7.00000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "7.00000000",
          category_id: targetCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);
  const expectedFixture = await createExpectedRecurringFixture(page, unique);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  const uniformRow = page
    .getByRole("row")
    .filter({ hasText: uniformMemo })
    .first();
  const mixedRow = page.getByRole("row").filter({ hasText: mixedMemo }).first();
  const expectedRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "Expected" }) })
    .filter({
      hasText: expectedFixture.merchantFqn.split(":").at(-1) ?? "Merchant",
    });
  await expect(uniformRow).toBeVisible();
  await expect(mixedRow).toBeVisible();
  await expect(expectedRow).toBeVisible();
  await expect(expectedRow.getByRole("checkbox")).toHaveCount(0);

  await uniformRow.focus();
  await page.keyboard.press("Space");
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  await expect(bulkActionBar).toContainText("1 selected");
  await mixedRow.getByRole("checkbox", { name: /^Select / }).click();
  await expect(bulkActionBar).toContainText("2 selected");

  await bulkActionBar.getByRole("button", { name: "Categorize" }).click();
  const categoryPicker = page.getByTestId("bulk-action-picker");
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .fill(targetCategory.fqn);
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .press("Enter");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "1 updated, 1 skipped: mixed records." }),
  ).toBeVisible();
  await expect(uniformRow).toContainText(targetCategory.name);
  await expect(mixedRow).toContainText("Mixed");
  await expect(bulkActionBar).toHaveCount(0);

  await uniformRow.getByRole("checkbox", { name: /^Select / }).click();
  await bulkActionBar.getByRole("button", { name: "Tag" }).click();
  const tagPicker = page.getByTestId("bulk-action-picker");
  await tagPicker.getByRole("combobox", { name: "Tags to add" }).fill(tag.fqn);
  await tagPicker.getByRole("combobox", { name: "Tags to add" }).press("Enter");
  await tagPicker.getByRole("button", { name: "Add tags" }).click();
  await expect(uniformRow).toContainText(tag.name);

  await uniformRow.getByRole("checkbox", { name: /^Select / }).click();
  await bulkActionBar.getByRole("button", { name: "Member" }).click();
  const memberPicker = page.getByTestId("bulk-action-picker");
  await memberPicker
    .getByRole("combobox", { name: "Member" })
    .fill(member.name);
  await memberPicker.getByRole("combobox", { name: "Member" }).press("Enter");
  await expect(bulkActionBar).toHaveCount(0);
  const updatedResponse = await page.request.get(
    `/api/transactions/${uniform.transaction_id}`,
  );
  expect(updatedResponse.ok(), await updatedResponse.text()).toBe(true);
  const updated = (await updatedResponse.json()) as TransactionDetailFixture;
  expect(updated.records.map((record) => record.member_id)).toEqual([
    member.member_id,
    member.member_id,
  ]);

  await uniformRow.getByRole("checkbox", { name: /^Select / }).click();
  await expect(bulkActionBar).toBeVisible();
  await bulkActionBar.getByRole("button", { name: "Clear selection" }).click();
  await expect(bulkActionBar).toHaveCount(0);
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
  if ((await picker.inputValue()) === optionValue) {
    await expect(picker).toHaveAttribute("aria-expanded", "false");
    return;
  }
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
  await expect(picker).toHaveAttribute("aria-expanded", "false");
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

const readStoredTransactionEntryDraft = async (
  page: Page,
): Promise<StoredTransactionEntryDraftFixture | undefined> =>
  page.evaluate<StoredTransactionEntryDraftFixture | undefined>(
    () =>
      new Promise<StoredTransactionEntryDraftFixture | undefined>(
        (resolve, reject) => {
          const openRequest = indexedDB.open("mina-ui-state", 3);
          openRequest.onerror = () => {
            reject(
              new Error(
                openRequest.error?.message ??
                  "Failed to open transaction draft store.",
              ),
            );
          };
          openRequest.onsuccess = () => {
            const database = openRequest.result;
            const transaction = database.transaction(
              "transaction_entry_draft",
              "readonly",
            );
            const getRequest = transaction
              .objectStore("transaction_entry_draft")
              .get("transaction-entry");
            getRequest.onerror = () => {
              database.close();
              reject(
                new Error(
                  getRequest.error?.message ??
                    "Failed to read transaction draft.",
                ),
              );
            };
            getRequest.onsuccess = () => {
              database.close();
              resolve(
                getRequest.result as
                  StoredTransactionEntryDraftFixture | undefined,
              );
            };
          };
        },
      ),
  );

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
      if (element.closest('[aria-hidden="true"]')) {
        return false;
      }
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

  await page.goto("/transactions?page=1&pageSize=25");
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

  await page.goto("/transactions?page=1&pageSize=25");
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
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "merchant:Target",
    "merchant:Target",
    {
      scope: refundPanel,
    },
  );
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

  await page.goto("/transactions?page=1&pageSize=25");
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
  await page.getByLabel("Search").fill(memo);
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();
});

test("create-mode advanced drafts stay independent when switching tabs and keeping a launch draft", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const advancedMemo = `E2E advanced independent ${unique}`;
  const keptMemo = `E2E keep draft ${unique}`;
  const editMemo = `E2E discard prompt edit ${unique}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.00",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-08",
      memo: editMemo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await page.getByRole("tab", { name: "Advanced" }).click();
  await expect(
    page.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();

  const firstRecord = journalRecord(page, 1);
  const secondRecord = journalRecord(page, 2);
  await firstRecord.getByLabel("Amount").fill("-88.10");
  await firstRecord.getByLabel("Memo").fill(advancedMemo);
  await secondRecord.getByLabel("Amount").fill("88.10");

  await page.getByRole("tab", { name: "Spend" }).click();
  const entryPanel = page.locator("aside[aria-labelledby='entry-panel-title']");
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await spendPanel.getByLabel("Memo").fill(keptMemo);
  await page.getByRole("tab", { name: "Advanced" }).click();

  await expect(
    entryPanel.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();
  await expect(firstRecord.getByLabel("Amount")).toHaveValue("-88.10");
  await expect(firstRecord.getByLabel("Memo")).toHaveValue(advancedMemo);
  await expect(secondRecord.getByLabel("Amount")).toHaveValue("88.10");

  await page.getByRole("tab", { name: "Spend" }).click();
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(keptMemo);
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({
      tabs: {
        spend: {
          memo: keptMemo,
        },
      },
    });
  await page.getByRole("button", { name: "Close entry panel" }).click();

  await page
    .getByRole("row")
    .filter({ hasText: editMemo })
    .first()
    .getByRole("button", { name: "Open transaction detail" })
    .click();
  const detailPanel = page.getByRole("dialog", {
    name: transaction.display_title,
  });
  await expect(detailPanel).toBeVisible();
  await detailPanel.getByRole("button", { exact: true, name: "Edit" }).click();

  const discardDialog = page.getByRole("alertdialog", {
    name: "Discard entry draft",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Keep draft" }).click();
  await expect(discardDialog).toBeHidden();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(keptMemo);
});

test("launching another saved-transaction action protects an in-flight edit", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const initialMemo = `E2E in-flight edit ${unique}`;
  const nextMemo = `E2E next saved transaction ${unique}`;
  const changedMemo = `E2E changed in-flight edit ${unique}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");

  for (const memo of [initialMemo, nextMemo]) {
    const response = await page.request.post("/api/transactions/spend", {
      data: {
        amount: "12.00",
        category_id: category.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-07-08",
        memo,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
  );
  await page
    .getByRole("row")
    .filter({ hasText: initialMemo })
    .first()
    .getByRole("button", { name: "Open transaction detail" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit" })
    .click();

  const entryPanel = page.locator("aside[aria-labelledby='entry-panel-title']");
  const editPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await editPanel.getByLabel("Memo").fill(changedMemo);

  const nextRow = page.getByRole("row").filter({ hasText: nextMemo }).first();
  await expect(nextRow).toBeVisible();
  await nextRow.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Duplicate" })
    .click();

  const discardDialog = page.getByRole("alertdialog", {
    name: "Discard entry draft",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Keep draft" }).click();
  await expect(discardDialog).toBeHidden();
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(editPanel.getByLabel("Memo")).toHaveValue(changedMemo);
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

  await page.goto("/transactions?page=1&pageSize=25");
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
  await page.goto("/transactions?page=1&pageSize=25");
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
  await accountPicker.fill("merchant:Book");
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

test("advanced journal account picker keeps suggestions filtered but resolves exact hidden FQNs", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const visibleSystemFqn = `e2e:advanced:${unique}:VisibleFeeSystem`;
  const hiddenSystemFqn = `e2e:advanced:${unique}:HiddenFeeSystem`;
  const feeCategoryFqn = `E2E:Advanced:${unique}:Fee`;
  const visibleSystem = await createAccount(page, visibleSystemFqn, "system");
  const hiddenSystem = await createAccount(page, hiddenSystemFqn, "system");
  await hideAccount(page, hiddenSystem);
  await createCategory(page, feeCategoryFqn, "fee");

  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const memo = `E2E advanced account parity ${unique}`;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await page.getByRole("tab", { name: "Advanced" }).click();

  const firstRecord = journalRecord(page, 1);
  const secondRecord = journalRecord(page, 2);
  const firstAccountPicker = firstRecord.getByRole("combobox", {
    name: "Account",
  });

  await firstAccountPicker.fill("VisibleFeeSystem");
  await expect(
    page
      .locator("#advanced-record-0-account-options")
      .getByText(visibleSystem.fqn),
  ).toBeVisible();
  await chooseOptionByKeyboard(
    page,
    "Category",
    feeCategoryFqn,
    feeCategoryFqn,
    { scope: firstRecord },
  );
  await chooseOptionByKeyboard(page, "Account", "Wallet", fundingAccount.fqn, {
    scope: firstRecord,
  });
  await firstRecord.getByLabel("Amount").fill("-10.00");

  await chooseOptionByKeyboard(
    page,
    "Category",
    feeCategoryFqn,
    feeCategoryFqn,
    { scope: secondRecord },
  );
  await chooseOptionByKeyboard(
    page,
    "Account",
    "VisibleFeeSystem",
    visibleSystem.fqn,
    { scope: secondRecord },
  );
  await secondRecord.getByLabel("Amount").fill("10.00");

  await page.getByRole("button", { name: "Add record" }).click();
  const thirdRecord = journalRecord(page, 3);
  await chooseOptionByKeyboard(
    page,
    "Category",
    feeCategoryFqn,
    feeCategoryFqn,
    { scope: thirdRecord },
  );
  await chooseOptionByKeyboard(page, "Account", "Wallet", fundingAccount.fqn, {
    scope: thirdRecord,
  });
  await thirdRecord.getByLabel("Amount").fill("-20.00");

  await page.getByRole("button", { name: "Add record" }).click();
  const fourthRecord = journalRecord(page, 4);
  const hiddenAccountPicker = fourthRecord.getByRole("combobox", {
    name: "Account",
  });
  await chooseOptionByKeyboard(
    page,
    "Category",
    feeCategoryFqn,
    feeCategoryFqn,
    { scope: fourthRecord },
  );
  await hiddenAccountPicker.fill("HiddenFeeSystem");
  await expect(
    page.locator("#advanced-record-3-account-options"),
  ).toContainText("No matches");
  await hiddenAccountPicker.fill(hiddenSystemFqn);
  await expect(hiddenAccountPicker).toHaveValue(hiddenSystemFqn);
  await fourthRecord.getByLabel("Amount").fill("20.00");
  await fourthRecord.getByLabel("Memo").fill(memo);

  await expect(
    page.getByRole("button", { name: "Save and add another" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeVisible();
});

test("command palette new spend supersedes an active edit launch", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E palette supersede ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "34.56",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-09",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);

  await page.goto("/transactions?page=1&pageSize=50");
  await page
    .getByRole("row")
    .filter({ hasText: memo })
    .first()
    .getByRole("button", { name: "Open transaction detail" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit" })
    .click();

  const entryPanel = page.locator("aside[aria-labelledby='entry-panel-title']");
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  const editSpendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(editSpendPanel.getByLabel("Amount")).toHaveValue("34.56");

  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Command search" }).fill("spend");
  await page.getByRole("option", { name: "New spend" }).click();

  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const newSpendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(newSpendPanel.getByLabel("Amount")).toHaveValue("");
  await expect(newSpendPanel.getByLabel("Memo")).toHaveValue("");
});

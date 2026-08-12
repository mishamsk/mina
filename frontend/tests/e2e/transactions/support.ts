import { expect, type Locator, type Page, type Route } from "@playwright/test";
import {
  captureSearchDebounce,
  runCapturedSearchDebounce,
} from "@tests/e2e/search-debounce";

interface AccountFixture {
  readonly account_id: number;
  readonly display_label: string;
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
  readonly lifecycle_status?: string;
  readonly settlement?: string;
  readonly transaction_id: number;
}

interface JournalRecordFixture {
  readonly account_id: number;
  readonly amount: string;
  readonly category_id: number | null;
  readonly currency: string;
  readonly member_id?: number | null;
  readonly memo?: string | null;
  readonly lifecycle_status?: string;
  readonly pending_date?: string | null;
  readonly posted_date?: string | null;
  readonly record_id?: number;
  readonly reconciliation_status: string;
  readonly settlement: string | null;
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
    readonly exchange?: {
      readonly boughtAccountId?: number;
      readonly boughtCurrency?: string;
      readonly currency?: string;
      readonly soldAccountId?: number;
    };
    readonly spend?: {
      readonly memo?: string;
    };
  };
}

interface StoredTransactionEntryDraftEnvelopeFixture {
  readonly draft: StoredTransactionEntryDraftFixture;
}

interface StoredTransactionEntryDraftShapeFixture {
  advanced: {
    date: string;
    records: { currency: string }[];
  };
  tabs: Record<
    "exchange" | "income" | "refund" | "spend" | "transfer",
    { currency: string; date: string }
  >;
}

interface StoredTransactionEntryDraftSeedEnvelopeFixture {
  baseline: StoredTransactionEntryDraftShapeFixture;
  draft: StoredTransactionEntryDraftShapeFixture;
  persistBaseline: boolean;
}

interface RecurringDefinitionFixture {
  readonly recurring_definition_id: number;
}

const defaultTransactionRequestLifecycles = [
  "active",
  "expected",
  "cancelled",
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

const waitForLedgerLookups = async (page: Page): Promise<void> => {
  const responses = await Promise.all(
    ["/api/accounts", "/api/categories", "/api/tags", "/api/members"].map(
      (path) =>
        page.waitForResponse((response) => {
          const url = new URL(response.url());
          return response.request().method() === "GET" && url.pathname === path;
        }),
    ),
  );
  for (const response of responses) {
    expect(response.ok(), `${response.url()} lookup response`).toBe(true);
  }
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
  expectedFilters: {
    readonly entry?: string;
    readonly q?: string;
    readonly transaction?: string;
  } = {},
): Promise<void> => {
  await expect
    .poll(() => {
      const searchParams = new URL(page.url()).searchParams;
      return {
        anchorDate: searchParams.get("anchor_date"),
        entry: searchParams.get("entry"),
        page: searchParams.get("page"),
        pageSize: searchParams.get("pageSize"),
        q: searchParams.get("q"),
        transaction: searchParams.get("transaction"),
      };
    })
    .toEqual({
      anchorDate: null,
      entry: expectedFilters.entry ?? null,
      page: String(expectedPage),
      pageSize: String(expectedPageSize),
      q: expectedFilters.q ?? null,
      transaction: expectedFilters.transaction ?? null,
    });
};

const expectTransactionFilterUrl = async (
  page: Page,
  expected: {
    readonly amountMax?: string;
    readonly amountMin?: string;
    readonly categories?: readonly number[];
    readonly classes?: readonly string[];
    readonly currencies?: readonly string[];
    readonly initiatedFrom?: string;
    readonly initiatedTo?: string;
    readonly lifecycles?: readonly string[];
    readonly members?: readonly number[];
    readonly page?: string;
    readonly pageSize?: string;
    readonly q?: string;
    readonly settlements?: readonly string[];
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
        lifecycles: searchParams.getAll("lifecycle").sort(),
        page: searchParams.get("page"),
        pageSize: searchParams.get("pageSize"),
        q: searchParams.get("q"),
        categories: searchParams
          .getAll("category")
          .map((value) => Number(value))
          .sort((left, right) => left - right),
        classes: searchParams.getAll("class").sort(),
        currencies: searchParams.getAll("currency").sort(),
        members: searchParams
          .getAll("member")
          .map((value) => Number(value))
          .sort((left, right) => left - right),
        settlements: searchParams.getAll("settlement").sort(),
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
      lifecycles: [...(expected.lifecycles ?? [])].sort(),
      page: expected.page ?? "1",
      pageSize: expected.pageSize ?? "50",
      q: expected.q ?? null,
      categories: [...(expected.categories ?? [])].sort(
        (left, right) => left - right,
      ),
      classes: [...(expected.classes ?? [])].sort(),
      currencies: [...(expected.currencies ?? [])].sort(),
      members: [...(expected.members ?? [])].sort(
        (left, right) => left - right,
      ),
      settlements: [...(expected.settlements ?? [])].sort(),
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
    readonly currencies?: readonly string[];
    readonly initiatedFrom?: string;
    readonly initiatedTo?: string;
    readonly limit?: string;
    readonly lifecycles?: readonly string[];
    readonly settlements?: readonly string[];
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
    JSON.stringify(params.getAll("currency").sort()) ===
      JSON.stringify([...(expected.currencies ?? [])].sort()) &&
    JSON.stringify(params.getAll("lifecycle_status").sort()) ===
      JSON.stringify(
        [
          ...(expected.lifecycles ?? defaultTransactionRequestLifecycles),
        ].sort(),
      ) &&
    JSON.stringify(params.getAll("settlement").sort()) ===
      JSON.stringify([...(expected.settlements ?? [])].sort()) &&
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
  accountType: "flow" | "owned" | "party",
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
  readonly category: CategoryFixture;
  readonly checking: AccountFixture;
  readonly merchant: AccountFixture;
  readonly merchantFqn: string;
  readonly memo: string;
  readonly transactionId: number;
}> => {
  const anchorDate = options.anchorDate ?? formatLocalDate(new Date());
  const checking = await createAccount(
    page,
    `e2e:ExpectedFilter:${unique}:Checking${unique}`,
    "owned",
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
          category_id: null,
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
  const materializedBody = await materialized.text();
  expect(materialized.ok(), materializedBody).toBe(true);
  const occurrenceList = JSON.parse(materializedBody) as {
    readonly recurring_occurrences: readonly {
      readonly generated_transaction_id: number | null;
    }[];
  };
  const transactionId =
    occurrenceList.recurring_occurrences[0]?.generated_transaction_id;
  expect(transactionId).not.toBeNull();
  expect(transactionId).not.toBeUndefined();
  if (transactionId === null || transactionId === undefined) {
    throw new Error("Expected occurrence has no generated transaction");
  }

  return {
    category,
    checking,
    merchant,
    merchantFqn: merchant.fqn,
    memo,
    transactionId,
  };
};

const createSearchSpend = async (
  page: Page,
  memo: string,
  amount = "12.34",
): Promise<TransactionFixture> => {
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const response = await page.request.post("/api/transactions/spend", {
    data: {
      amount,
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-31",
      memo,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as TransactionFixture;
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

const getTransactionDetail = async (
  page: Page,
  transaction: TransactionFixture,
): Promise<TransactionDetailFixture> => {
  const response = await page.request.get(
    `/api/transactions/${transaction.transaction_id}`,
  );
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as TransactionDetailFixture;
};

const openUrlTransactionDetail = async (
  page: Page,
  transactionId: number,
): Promise<Locator> => {
  await page.goto(
    `/transactions?page=1&pageSize=50&transaction=${transactionId}`,
  );
  const panel = page.getByTestId("transaction-detail-panel");
  await expect(panel).toBeVisible();
  return panel;
};

const openAccountTransactionDetail = async (
  page: Page,
  account: AccountFixture,
  memo: string,
): Promise<Locator> => {
  await page.goto(`/accounts/${account.account_id}?page=1&pageSize=50`);
  for (;;) {
    await expect(page.getByText(/Page \d+ of \d+/)).toBeVisible();
    await expect(page.getByTestId("account-register-page-busy")).toHaveCount(0);
    const registerRow = page
      .getByTestId("account-register-row")
      .filter({ hasText: memo })
      .first();
    if ((await registerRow.count()) > 0) {
      await registerRow.click();
      break;
    }
    const nextPage = page.getByRole("button", { name: "Next" });
    if (await nextPage.isDisabled()) {
      throw new Error(`Account register does not contain record ${memo}`);
    }
    await nextPage.click();
  }
  const panel = page.getByTestId("transaction-detail-panel");
  await expect(panel).toBeVisible();
  return panel;
};

const expectDatelessReadOnlyDetailGrid = async (
  panel: Locator,
  recordCount: number,
  expectedVariant: "decluttered" | "full",
): Promise<void> => {
  const table = panel.getByTestId("transaction-detail-records-table");
  const decluttered = expectedVariant === "decluttered";
  const expectedHeaders = decluttered
    ? ["Role", "Account", "Amount", "Category"]
    : [
        "Role",
        "Account",
        "Amount",
        "Category",
        "Tags",
        "Member",
        "Settlement",
        "Memo",
      ];
  await expect(table.locator("th")).toHaveCount(expectedHeaders.length);
  await expect(table.locator("th", { hasText: "Dates" })).toHaveCount(0);
  expect(
    (await table.locator("th").allTextContents()).map((text) => text.trim()),
  ).toEqual(expectedHeaders);
  await expect(table.locator("tr[data-detail-record-row='true']")).toHaveCount(
    recordCount,
  );
  if (!decluttered) {
    await expect(table.locator("td[data-label='Settlement']")).toHaveCount(
      recordCount,
    );
    await expect(table.locator("td[data-label='Status']")).toHaveCount(0);
  }
  await expect(panel.locator("input, textarea, select")).toHaveCount(0);
  await expect(
    panel.getByRole("button", {
      name: /^(Edit row value|Edit memo|Edit Category|Edit Tags|Edit Member)$/,
    }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      table.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    )
    .toBe(true);
};

const expectRecordRoleIndicators = async (
  table: Locator,
  rowSelector: string,
  expectedLabels: readonly string[],
  layoutChecks: {
    readonly narrowDetail?: boolean;
  } = {},
): Promise<void> => {
  const indicators = table.getByRole("img", { name: / role$/ });
  await expect(indicators).toHaveCount(expectedLabels.length);
  expect(
    await indicators.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-label")),
    ),
  ).toEqual(expectedLabels);

  for (const label of new Set(expectedLabels)) {
    await table.getByRole("img", { name: label, exact: true }).first().hover();
    await expect(
      table.page().getByRole("tooltip").filter({ hasText: label }).last(),
    ).toBeVisible();
    await table.locator("thead").hover();
  }

  const rows = table.locator(rowSelector);
  const heightsWithIndicators = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  await rows.evaluateAll((elements) => {
    for (const element of elements) {
      const indicator = element.querySelector<HTMLElement>(
        "[role='img'][aria-label$=' role']",
      );
      indicator?.parentElement?.style.setProperty("display", "none");
    }
  });
  const heightsWithoutIndicators = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  await rows.evaluateAll((elements) => {
    for (const element of elements) {
      const indicator = element.querySelector<HTMLElement>(
        "[role='img'][aria-label$=' role']",
      );
      indicator?.parentElement?.style.removeProperty("display");
    }
  });

  expect(heightsWithIndicators).toHaveLength(expectedLabels.length);
  expect(heightsWithoutIndicators).toHaveLength(expectedLabels.length);
  for (const [index, height] of heightsWithIndicators.entries()) {
    expect(
      Math.abs(height - (heightsWithoutIndicators[index] ?? 0)),
    ).toBeLessThanOrEqual(1);
  }

  if (layoutChecks.narrowDetail) {
    const page = table.page();
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 680, height: 900 });
    try {
      await expect
        .poll(() =>
          table.locator(rowSelector).evaluateAll((elements) =>
            elements.every((element) => {
              const indicator = element.querySelector<HTMLElement>(
                "td.detail-records-role-column [role='img']",
              )?.parentElement;
              const accountCell = element.querySelector<HTMLElement>(
                "td.detail-records-account-column",
              );
              if (!accountCell || !indicator) {
                return false;
              }

              const indicatorBounds = indicator.getBoundingClientRect();
              const accountBounds = accountCell.getBoundingClientRect();
              const accountLabelStart =
                accountBounds.left +
                Number.parseFloat(getComputedStyle(accountCell).paddingLeft);
              return indicatorBounds.right <= accountLabelStart - 1;
            }),
          ),
        )
        .toBe(true);
    } finally {
      if (originalViewport) {
        await page.setViewportSize(originalViewport);
      }
    }
  }
};

const expectMouseDisclosure = async (
  panel: Locator,
  memo: string,
): Promise<void> => {
  const row = panel.locator("tr[data-detail-record-row='true']").first();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.page().mouse.move(0, 0);
  const restingBackground = await row.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await row.hover();
  await expect
    .poll(() =>
      row.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe(restingBackground);
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  const disclosure = panel
    .locator("tr.detail-records-disclosure-row")
    .filter({ hasText: memo });
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText("Initiated");
  await expect(disclosure).toContainText("Posted");
  await expect(disclosure).toContainText("Settlement");
  await expect(disclosure).toContainText("Source");
  await expect(disclosure).toContainText(memo);
  await expect(disclosure).not.toContainText(/pending date|posted date/i);
  await expect(disclosure).not.toContainText("Invalid Date");
  await expect(
    disclosure.locator(
      "button, input, textarea, select, [data-slot='tooltip-trigger'], [data-testid*='chip']",
    ),
  ).toHaveCount(0);
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(disclosure).toHaveCount(0);
};

const expectKeyboardDisclosure = async (panel: Locator): Promise<void> => {
  const row = panel.locator("tr[data-detail-record-row='true']").first();
  await row.focus();
  await expect(row).toBeFocused();
  await row.press("Enter");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await row.press("F2");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await row.press(" ");
  await expect(row).toHaveAttribute("aria-expanded", "false");
};

const expectFocusedAccountLabel = async (
  link: Locator,
  account: AccountFixture,
): Promise<void> => {
  await expect(link).toHaveText(account.display_label);
  expect(await link.evaluate((element) => element.tabIndex)).toBe(0);
  await link.focus();
  await expect(link).toBeFocused();
  await expect(link.page().getByRole("tooltip")).toHaveText(
    account.display_label === account.fqn
      ? account.fqn
      : `${account.display_label} · ${account.fqn}`,
  );
};

const expectAccountLinkNavigation = async (
  page: Page,
  account: AccountFixture,
): Promise<void> => {
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`/accounts/${account.account_id}`);
  await expect(page.getByTestId("account-header")).toBeVisible();
  const searchParams = new URL(page.url()).searchParams;
  for (const filter of ["account", "category", "member", "q", "tag"]) {
    expect(searchParams.has(filter), `${filter} filter`).toBe(false);
  }
  expect(searchParams.has("entry"), "entry editor state").toBe(false);
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
};

const editorButtonsFitContainer = (container: Locator) =>
  container.evaluate((element) => {
    const containerRect = element.getBoundingClientRect();
    return Array.from(
      element.querySelectorAll<HTMLElement>("[data-slot='button']"),
    ).every((button) => {
      const buttonRect = button.getBoundingClientRect();
      return (
        buttonRect.left >= containerRect.left - 0.5 &&
        buttonRect.right <= containerRect.right + 0.5
      );
    });
  });

const requiredBoundingBox = async (locator: Locator) => {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) {
    throw new Error("expected visible element bounds");
  }
  return bounds;
};

const expectAmountMarkerRightEdgesAligned = async (
  rows: readonly Locator[],
  tolerance = 1,
): Promise<void> => {
  const bounds = await Promise.all(
    rows.map(async (row) => {
      await expect(row).toBeVisible();
      const amountChip = row.getByTestId("amount-chip").last();
      const rightAlignedMarker =
        (await amountChip.count()) > 0
          ? amountChip
          : row.getByTestId("more-parts-indicator").last();
      await expect(rightAlignedMarker).toBeVisible();
      return requiredBoundingBox(rightAlignedMarker);
    }),
  );
  const referenceRight = bounds[0]!.x + bounds[0]!.width;

  for (const box of bounds.slice(1)) {
    expect(Math.abs(box.x + box.width - referenceRight)).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

const boundingBoxesOverlap = (
  first: Awaited<ReturnType<typeof requiredBoundingBox>>,
  second: Awaited<ReturnType<typeof requiredBoundingBox>>,
): boolean =>
  first.x < second.x + second.width - 0.5 &&
  first.x + first.width > second.x + 0.5 &&
  first.y < second.y + second.height - 0.5 &&
  first.y + first.height > second.y + 0.5;

const openRowActionsMenu = async (
  page: Page,
  row: Locator,
): Promise<Locator> => {
  const overflow = row.getByRole("button", { name: "More row actions" });
  await expect(overflow).toBeVisible();
  await overflow.click();
  const menu = page.locator(".row-actions-menu:visible");
  await expect(menu).toBeVisible();
  return menu;
};

const clickRowAction = async (
  page: Page,
  row: Locator,
  label: string,
): Promise<void> => {
  await expect(row).toBeVisible();
  const directAction = row
    .locator(".row-actions-buttons")
    .getByRole("button", { name: label });
  if (await directAction.isVisible()) {
    await directAction.click();
    return;
  }

  const overflow = row.getByRole("button", { name: "More row actions" });
  if (await overflow.isVisible()) {
    const menu = await openRowActionsMenu(page, row);
    await menu.getByRole("button", { name: label }).click();
    return;
  }

  await expect(overflow).toBeVisible();
  const menu = await openRowActionsMenu(page, row);
  await menu.getByRole("button", { name: label }).click();
};

const activateTransactionRow = async (row: Locator): Promise<void> => {
  await expect(row).toBeVisible();
  await row.focus();
  await row.press("Enter");
};

const expectCollapsedRowActionsKeepAmountVisible = async (row: Locator) => {
  const directActions = row.locator(".row-actions-buttons");
  const overflow = row.getByRole("button", { name: "More row actions" });
  const amountCell = row.locator(".transactions-amount-column");
  const actionsCell = row.locator(".transactions-actions-column");
  const amountChip = amountCell.getByTestId("amount-chip");

  await expect(directActions).toBeHidden();
  await expect(overflow).toBeVisible();
  await expect(amountChip).toBeVisible();

  const [
    amountCellBounds,
    amountChipBounds,
    actionsCellBounds,
    overflowBounds,
  ] = await Promise.all([
    requiredBoundingBox(amountCell),
    requiredBoundingBox(amountChip),
    requiredBoundingBox(actionsCell),
    requiredBoundingBox(overflow),
  ]);
  expect(amountChipBounds.x).toBeGreaterThanOrEqual(amountCellBounds.x - 0.5);
  expect(amountChipBounds.x + amountChipBounds.width).toBeLessThanOrEqual(
    amountCellBounds.x + amountCellBounds.width + 0.5,
  );
  expect(overflowBounds.x + overflowBounds.width).toBeLessThanOrEqual(
    actionsCellBounds.x + actionsCellBounds.width + 0.5,
  );
  expect(boundingBoxesOverlap(amountChipBounds, overflowBounds)).toBe(false);
  await expect(
    amountChip.evaluate((chip) => {
      const chipBounds = chip.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(chip);
      const textFits = Array.from(range.getClientRects()).every(
        (bounds) =>
          bounds.left >= chipBounds.left - 0.5 &&
          bounds.right <= chipBounds.right + 0.5,
      );
      range.detach();
      return textFits;
    }),
  ).resolves.toBe(true);
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
      reconciliation_status: record.reconciliation_status,
      settlement: record.settlement,
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

const hideMember = async (page: Page, member: MemberFixture): Promise<void> => {
  const response = await page.request.put(
    `/api/members/${member.member_id}/hidden`,
    { data: { is_hidden: true } },
  );
  expect(response.ok()).toBe(true);
};

const amountChipsFitCell = async (row: Locator): Promise<boolean> =>
  row.locator(".transactions-amount-column").evaluate((cell) => {
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

const mixedPartsIndicatorGeometry = async (row: Locator) =>
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

    const memberCell = rowElement.querySelector<HTMLTableCellElement>(
      ".transactions-member-column",
    );
    const amountCell = rowElement.querySelector<HTMLTableCellElement>(
      ".transactions-amount-column",
    );
    const amountCellRect = rectFor(amountCell);
    const memberCellRect = rectFor(memberCell);
    const indicator = amountCell?.querySelector<HTMLElement>(
      "[data-testid='more-parts-indicator']",
    );
    const indicatorRect = rectFor(indicator);
    const lineCenters = indicator ? textLineCenters(indicator) : [];
    const memberCollapsed = isCollapsed(memberCell);
    const scrollContainer = rowElement.closest<HTMLElement>(
      "[data-testid='transactions-table-scroll']",
    );
    const memberOverlaps =
      !memberCollapsed && memberCellRect && indicatorRect
        ? intersects(indicatorRect, memberCellRect)
        : false;

    return {
      amountCellWidth: amountCellRect?.width ?? 0,
      indicatorFitsCell:
        Boolean(amountCellRect && indicatorRect) &&
        containedBy(
          indicatorRect as NonNullable<ReturnType<typeof rectFor>>,
          amountCellRect as NonNullable<ReturnType<typeof rectFor>>,
        ),
      chipText: indicator?.innerText.replace(/\s+/g, " ").trim() ?? "",
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
  row.locator(".transactions-tags-column").evaluate((cell) => {
    const list = cell.querySelector<HTMLElement>(
      "[data-testid='transaction-tag-chips-list']",
    );
    if (!list) {
      return {
        hiddenLabels: [],
        visibleLabels: [],
        visibleRowCount: 0,
        verticalCenterOffset: null,
      };
    }

    const cellRect = cell.getBoundingClientRect();
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
        bottom: rect.bottom,
        label: chip.textContent?.trim() ?? "",
        rowTop: Math.round(rect.top),
        top: rect.top,
        visible,
      };
    });
    const visibleStates = chipStates.filter((chip) => chip.visible);
    const chipShadowOffset = 2;
    const visualCenterDelta =
      visibleStates.length === 0
        ? null
        : (Math.min(...visibleStates.map((chip) => chip.top)) +
            Math.max(
              ...visibleStates.map((chip) => chip.bottom + chipShadowOffset),
            )) /
            2 -
          (cellRect.top + cellRect.bottom) / 2;

    return {
      hiddenLabels: chipStates
        .filter((chip) => !chip.visible)
        .map((chip) => chip.label),
      visibleLabels: visibleStates.map((chip) => chip.label),
      visibleRowCount: new Set(visibleStates.map((chip) => chip.rowTop)).size,
      verticalCenterOffset:
        visualCenterDelta === null ? null : Math.abs(visualCenterDelta),
    };
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
  await fillAndExpectValue(picker, searchText);
  if ((await picker.inputValue()) === optionValue) {
    await expect(picker).toHaveAttribute("aria-expanded", "false");
    return;
  }
  const optionListId = await picker.getAttribute("aria-controls");
  expect(optionListId).not.toBeNull();
  const optionList = page.locator(`#${optionListId}`);
  const option = optionList
    .getByRole("option")
    .filter({ hasText: optionValue })
    .first();
  await expect(option).toBeVisible({ timeout: 10000 });
  const optionId = await option.evaluate((element) => element.id);
  for (let press = 0; press < arrowDownPresses; press += 1) {
    await picker.press("ArrowDown");
  }
  const optionCount = await optionList.getByRole("option").count();
  for (let attempt = 0; attempt <= optionCount; attempt += 1) {
    if ((await picker.getAttribute("aria-activedescendant")) === optionId) {
      break;
    }
    await picker.press("ArrowDown");
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
  await expect(field).toBeEditable();
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
              const storedValue = getRequest.result as
                | StoredTransactionEntryDraftEnvelopeFixture
                | StoredTransactionEntryDraftFixture
                | undefined;
              database.close();
              resolve(
                storedValue && "draft" in storedValue
                  ? storedValue.draft
                  : storedValue,
              );
            };
          };
        },
      ),
  );

const seedStoredPristineTransactionEntryDefaults = async (
  page: Page,
  date: string,
  currency: string,
  changedTab?: {
    readonly currency?: string;
    readonly date?: string;
    readonly name: keyof StoredTransactionEntryDraftShapeFixture["tabs"];
  },
): Promise<void> =>
  page.evaluate(
    ({
      changedTab: seededChangedTab,
      currency: seededCurrency,
      date: seededDate,
    }) =>
      new Promise<void>((resolve, reject) => {
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
            "readwrite",
          );
          const store = transaction.objectStore("transaction_entry_draft");
          const getRequest = store.get("transaction-entry");
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
            const storedValue = getRequest.result as
              | StoredTransactionEntryDraftSeedEnvelopeFixture
              | StoredTransactionEntryDraftShapeFixture;
            const storedBaseline =
              "baseline" in storedValue ? storedValue.baseline : storedValue;
            const baseline = JSON.parse(
              JSON.stringify(storedBaseline),
            ) as StoredTransactionEntryDraftShapeFixture;
            baseline.advanced.date = seededDate;
            for (const record of baseline.advanced.records) {
              record.currency = seededCurrency;
            }
            for (const tab of Object.values(baseline.tabs)) {
              tab.currency = seededCurrency;
              tab.date = seededDate;
            }
            const draft = JSON.parse(
              JSON.stringify(baseline),
            ) as StoredTransactionEntryDraftShapeFixture;
            if (seededChangedTab) {
              const tab = draft.tabs[seededChangedTab.name];
              if (seededChangedTab.currency) {
                tab.currency = seededChangedTab.currency;
              }
              if (seededChangedTab.date) {
                tab.date = seededChangedTab.date;
              }
            }
            store.put(draft, "transaction-entry");
          };
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(
              new Error(
                transaction.error?.message ??
                  "Failed to seed transaction draft.",
              ),
            );
          };
        };
      }),
    { changedTab, currency, date },
  );

const delayTransactionEntryDraftDeletion = async (
  page: Page,
): Promise<() => Promise<void>> => {
  await page.evaluate(() => {
    const originalDelete: IDBObjectStore["delete"] = Reflect.get(
      IDBObjectStore.prototype,
      "delete",
    );
    let releaseDeletion!: () => void;
    const deletionGate = new Promise<void>((resolve) => {
      releaseDeletion = resolve;
    });
    const testWindow = window as typeof window & {
      releaseTransactionEntryDraftDeletion?: () => void;
    };
    testWindow.releaseTransactionEntryDraftDeletion = () => {
      IDBObjectStore.prototype.delete = originalDelete;
      releaseDeletion();
      delete testWindow.releaseTransactionEntryDraftDeletion;
    };
    IDBObjectStore.prototype.delete = function delayedDelete(
      key,
    ): IDBRequest<undefined> {
      const request = originalDelete.call(this, key);
      return deletionGate.then(
        () => request,
      ) as unknown as IDBRequest<undefined>;
    };
  });

  return async () => {
    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        releaseTransactionEntryDraftDeletion?: () => void;
      };
      testWindow.releaseTransactionEntryDraftDeletion?.();
    });
  };
};

const failTransactionEntryDraftDeletion = async (
  page: Page,
): Promise<() => Promise<void>> => {
  await page.evaluate(() => {
    const originalDelete: IDBObjectStore["delete"] = Reflect.get(
      IDBObjectStore.prototype,
      "delete",
    );
    const testWindow = window as typeof window & {
      restoreTransactionEntryDraftDeletion?: () => void;
    };
    testWindow.restoreTransactionEntryDraftDeletion = () => {
      IDBObjectStore.prototype.delete = originalDelete;
      delete testWindow.restoreTransactionEntryDraftDeletion;
    };
    IDBObjectStore.prototype.delete = () => {
      throw new DOMException("Synthetic draft deletion failure", "AbortError");
    };
  });

  return async () => {
    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        restoreTransactionEntryDraftDeletion?: () => void;
      };
      testWindow.restoreTransactionEntryDraftDeletion?.();
    });
  };
};

const journalRecord = (page: Page, index: number): Locator =>
  page.locator(`[aria-label="Journal record ${index}"]`);

const expectAdvancedRecordUsableAtDockedWidth = async (
  page: Page,
  record: Locator,
) => {
  const layout = await record.evaluate((recordElement) => {
    const panel = recordElement.closest<HTMLElement>(
      '[role="dialog"][aria-labelledby]',
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
        .getByRole("dialog", { name: "Transaction editor" })
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

export {
  activateTransactionRow,
  amountChipsFitCell,
  boundingBoxesOverlap,
  captureSearchDebounce,
  chipShadowFitsClippingAncestors,
  chooseOptionByKeyboard,
  clickRowAction,
  comparableRecords,
  createAccount,
  createCategory,
  createExpectedRecurringFixture,
  createMember,
  createSearchSpend,
  createTag,
  defaultTransactionRequestLifecycles,
  delayTransactionEntryDraftDeletion,
  deleteTransaction,
  editorButtonsFitContainer,
  expect,
  expectAccountLinkNavigation,
  expectAdvancedBalanceStatus,
  expectAdvancedRecordUsableAtDockedWidth,
  expectAmountMarkerRightEdgesAligned,
  expectCollapsedRowActionsKeepAmountVisible,
  expectDatelessReadOnlyDetailGrid,
  expectFocusedAccountLabel,
  expectKeyboardDisclosure,
  expectMouseDisclosure,
  expectRecordRoleIndicators,
  expectTransactionFilterUrl,
  expectTransactionsPageUrl,
  failTransactionEntryDraftDeletion,
  fillAndExpectValue,
  findByFqn,
  formatLocalDate,
  getTransactionDetail,
  hideAccount,
  hideCategory,
  hideMember,
  hideTag,
  journalRecord,
  listFixtures,
  mixedPartsIndicatorGeometry,
  openAccountTransactionDetail,
  openRowActionsMenu,
  openUrlTransactionDetail,
  readStoredTransactionEntryDraft,
  requiredBoundingBox,
  runCapturedSearchDebounce,
  seedStoredPristineTransactionEntryDefaults,
  shiftLocalDate,
  tagChipLineState,
  transactionRequestHasFilters,
  waitForLedgerLookups,
};
export type {
  AccountFixture,
  CategoryFixture,
  JournalRecordFixture,
  Locator,
  MemberFixture,
  Page,
  RecurringDefinitionFixture,
  Route,
  StoredTransactionEntryDraftEnvelopeFixture,
  StoredTransactionEntryDraftFixture,
  StoredTransactionEntryDraftSeedEnvelopeFixture,
  StoredTransactionEntryDraftShapeFixture,
  TagFixture,
  TransactionDetailFixture,
  TransactionFixture,
  TransactionListFixture,
};

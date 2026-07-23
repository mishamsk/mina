import { expect, type Locator, type Page, type Route } from "@playwright/test";
import { test } from "@tests/e2e/test";

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
  readonly pending_date?: string;
  readonly posted_date?: string | null;
  readonly posting_status: string;
  readonly record_id?: number;
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

const openAccountTransactionPeek = async (
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
  const panel = page.getByTestId("account-peek-panel");
  await expect(panel).toBeVisible();
  return panel;
};

const expectDatelessReadOnlyDetailGrid = async (
  panel: Locator,
  recordCount: number,
): Promise<void> => {
  const table = panel.getByTestId("transaction-detail-records-table");
  await expect(table.locator("th", { hasText: "Dates" })).toHaveCount(0);
  await expect(table.locator("tr[data-detail-record-row='true']")).toHaveCount(
    recordCount,
  );
  await expect(panel.locator("[data-inline-editor-id]")).toHaveCount(0);
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

const expectMouseDisclosure = async (
  panel: Locator,
  memo: string,
): Promise<void> => {
  const row = panel
    .locator("tr[data-detail-record-row='true']")
    .filter({ hasText: memo })
    .first();
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
  await row.locator("td[data-label='Memo']").click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  const disclosure = panel
    .locator("tr.detail-records-disclosure-row")
    .filter({ hasText: memo });
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText("Initiated");
  await expect(disclosure).toContainText("Pending");
  await expect(disclosure).toContainText("Posted");
  await expect(disclosure).toContainText("Posting status");
  await expect(disclosure).toContainText("Source");
  await expect(disclosure).toContainText(memo);
  await expect(
    disclosure.locator("button, input, textarea, select"),
  ).toHaveCount(0);
  await row.locator("td[data-label='Memo']").click();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(disclosure).toHaveCount(0);
};

const expectKeyboardDisclosure = async (
  panel: Locator,
  memo: string,
): Promise<void> => {
  const row = panel
    .locator("tr[data-detail-record-row='true']")
    .filter({ hasText: memo })
    .first();
  await row.focus();
  await expect(row).toBeFocused();
  await row.press("Enter");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await row.press("F2");
  await expect(panel.locator("[data-inline-editor-id]")).toHaveCount(0);
  await row.press(" ");
  await expect(row).toHaveAttribute("aria-expanded", "false");
};

const expectFocusedAccountPathExpanded = async (
  link: Locator,
  value: string,
): Promise<void> => {
  const segments = value.split(":");
  const collapsedAncestors = `${segments[0]}:…:`;
  const fullAncestors = `${segments.slice(0, -1).join(":")}:`;
  const visualAncestors = link.locator("span[aria-hidden='true']");
  const collapsed = visualAncestors.filter({
    hasText: collapsedAncestors,
  });
  const expanded = visualAncestors.filter({ hasText: fullAncestors });

  await expect(collapsed).toBeVisible();
  await expect(expanded).toBeHidden();
  expect(await link.evaluate((element) => element.tabIndex)).toBe(0);
  await link.focus();
  await expect(link).toBeFocused();
  await expect(collapsed).toBeHidden();
  await expect(expanded).toBeVisible();
};

const expectFocusedTwoSegmentAccountPathWhole = async (
  link: Locator,
  value: string,
): Promise<void> => {
  const segments = value.split(":");
  expect(segments).toHaveLength(2);
  const ancestor = link.locator("span").filter({ hasText: `${segments[0]}:` });

  await expect(ancestor).toBeVisible();
  expect(await link.evaluate((element) => element.tabIndex)).toBe(0);
  await link.focus();
  await expect(link).toBeFocused();
  await expect(ancestor).toBeVisible();
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

const expectAmountChipRightEdgesAligned = async (
  rows: readonly Locator[],
  tolerance = 1,
): Promise<void> => {
  const bounds = await Promise.all(
    rows.map(async (row) => {
      await expect(row).toBeVisible();
      const trailingChip = row.getByTestId("amount-chip").last();
      await expect(trailingChip).toBeVisible();
      return requiredBoundingBox(trailingChip);
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

  if (label === "Open transaction detail") {
    await row.focus();
    await page.keyboard.press("Enter");
    return;
  }

  await expect(overflow).toBeVisible();
  const menu = await openRowActionsMenu(page, row);
  await menu.getByRole("button", { name: label }).click();
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

const expectInlineSaveKeepsTransactionTableStable = async (
  page: Page,
  transactionId: number,
  focusTarget: Locator,
  save: () => Promise<void>,
  expectUpdatedValue: () => Promise<void>,
): Promise<void> => {
  const transactionListPattern = "**/api/transactions**";
  const tableScroll = page.getByTestId("transactions-table-scroll");
  const table = tableScroll.locator("table.transactions-table");
  const stabilityMarker = `save-${transactionId}-${Date.now()}`;
  await table.evaluate((element, marker) => {
    element.dataset.e2eStabilityMarker = marker;
  }, stabilityMarker);
  const scrollTop = await tableScroll.evaluate((element) => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  const visibleTransactionIds = await tableScroll.evaluate((element) => {
    const containerBounds = element.getBoundingClientRect();
    return Array.from(
      element.querySelectorAll<HTMLElement>("[data-transaction-row='true']"),
    )
      .filter((row) => {
        const rowBounds = row.getBoundingClientRect();
        return (
          rowBounds.bottom > containerBounds.top &&
          rowBounds.top < containerBounds.bottom
        );
      })
      .map((row) => row.dataset.transactionId ?? "");
  });
  expect(visibleTransactionIds.length).toBeGreaterThan(0);

  let releaseRefetch: (() => void) | undefined;
  let markRefetchStarted: (() => void) | undefined;
  const refetchStarted = new Promise<void>((resolve) => {
    markRefetchStarted = resolve;
  });
  const refetchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/transactions"
    );
  });
  const holdRefetch = async (route: Route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      url.pathname !== "/api/transactions"
    ) {
      await route.continue();
      return;
    }

    markRefetchStarted?.();
    await new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    await route.continue();
  };
  await page.route(transactionListPattern, holdRefetch);

  try {
    await save();
    await refetchStarted;
    await expectUpdatedValue();

    await expect(tableScroll).toBeVisible();
    await expect(page.locator("[data-slot='skeleton']")).toHaveCount(0);
    await expect(page.getByTestId("transactions-page-busy")).toHaveCount(0);
    await expect(table).toHaveAttribute(
      "data-e2e-stability-marker",
      stabilityMarker,
    );
    await expect(
      page.locator(`[data-transaction-id="${transactionId}"]`),
    ).toHaveAttribute("aria-expanded", "true");
    for (const visibleTransactionId of visibleTransactionIds) {
      await expect(
        page.locator(`[data-transaction-id="${visibleTransactionId}"]`),
      ).toBeVisible();
    }
    expect(await tableScroll.evaluate((element) => element.scrollTop)).toBe(
      scrollTop,
    );
  } finally {
    releaseRefetch?.();
    await refetchResponse;
    await page.unroute(transactionListPattern, holdRefetch);
  }

  await expect(tableScroll).toBeVisible();
  await expect(page.locator("[data-slot='skeleton']")).toHaveCount(0);
  await expect(page.getByTestId("transactions-page-busy")).toHaveCount(0);
  await expect(table).toHaveAttribute(
    "data-e2e-stability-marker",
    stabilityMarker,
  );
  await expect(
    page.locator(`[data-transaction-id="${transactionId}"]`),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(focusTarget).toBeFocused();
  expect(await tableScroll.evaluate((element) => element.scrollTop)).toBe(
    scrollTop,
  );
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
  await page.goto("/transactions?hideExpected=true");

  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  await expect(page.getByText("Description")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Amount" }),
  ).toBeVisible();

  const transactionRows = page.locator("tbody > tr[aria-expanded]");
  await expect(
    transactionRows.locator(".transactions-description-column svg"),
  ).toHaveCount(0);
  await expect(
    transactionRows.getByRole("button", { name: /expand|collapse/i }),
  ).toHaveCount(0);
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

  const transferRowBackgroundBefore = await transferRow.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await transferRow.locator("td").nth(3).click();
  await expect(transferRow).toHaveAttribute("aria-expanded", "true");
  await expect(transferRow).toHaveAttribute(
    "aria-controls",
    /^transaction-records-\d+$/,
  );
  const recordsRowId = await transferRow.getAttribute("aria-controls");
  expect(recordsRowId).not.toBeNull();
  const recordsRow = page.locator(`[id="${recordsRowId}"]`);
  await expect(recordsRow).toBeVisible();
  await expect(recordsRow).toHaveCSS("border-bottom-width", "2px");
  await expect(
    page.getByRole("columnheader", { exact: true, name: "Memo" }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(transferRow).toHaveCSS("border-bottom-width", "0px");
  await expect(transferRow).toHaveCSS("box-shadow", "none");
  const transferRowBackgroundAfter = await transferRow.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(transferRowBackgroundAfter).not.toBe(transferRowBackgroundBefore);
  const transferTitle = transferRow.getByTestId("transaction-line-title");
  await expect(transferTitle).toHaveCSS("font-weight", "600");
  await expect(transferTitle).toHaveCSS("font-family", /IBM Plex Mono/i);

  const firstRowBackgroundAfter = await transactionRows
    .nth(0)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(firstRowBackgroundAfter).toBe(firstRowBackgroundBefore);

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

  await transferRow.locator("td").nth(3).click();
  await expect(transferRow).toHaveAttribute("aria-expanded", "false");
  await expect(transferRow).not.toHaveAttribute("aria-controls", /.+/);
  await expect(recordsRow).toHaveCount(0);

  await transferRow.focus();
  await page.keyboard.press("Space");
  await expect(transferRow).toHaveAttribute("aria-expanded", "true");
  await expect(transferRow).toHaveAttribute(
    "aria-controls",
    recordsRowId ?? "",
  );
  await page.keyboard.press("Space");
  await expect(transferRow).toHaveAttribute("aria-expanded", "false");
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
  await transactionRow.locator("td").nth(3).click();
  await expect(transactionRow).toHaveAttribute("aria-expanded", "true");
  const records = page.getByTestId("expanded-records");

  const categoryCell = records.getByTestId("record-category-cell").first();
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = records.getByTestId("record-category-editor").first();
  const categoryInput = categoryEditor.getByRole("combobox", {
    name: "Category",
  });
  await expect(categoryInput).toBeFocused();
  await categoryInput.fill(nextCategory.fqn);
  await categoryEditor.getByRole("button", { name: "Save category" }).click();
  await expect(categoryCell).toContainText(nextCategory.fqn);
  await expect(transactionRow.locator("td").nth(4)).toContainText("Mixed");

  const tagCell = records.getByTestId("record-tags-cell").first();
  await tagCell.hover();
  await tagCell.getByRole("button", { name: "Edit Tags" }).click();
  const tagEditor = records.getByTestId("record-tags-editor").first();
  const tagInput = tagEditor.getByRole("combobox", { name: "Tags" });
  await expect(tagInput).toBeFocused();
  await tagInput.fill(addedTag.fqn);
  await tagInput.press("Enter");
  await tagEditor.getByRole("button", { name: "Save tags" }).click();
  await expect(tagCell).toContainText(addedTag.name);

  const memberCell = records.getByTestId("record-member-cell").first();
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  let memberEditor = records.getByTestId("record-member-editor").first();
  const initialMemberInput = memberEditor.getByRole("combobox", {
    name: "Member",
  });
  await expect(initialMemberInput).toBeFocused();
  await initialMemberInput.fill(member.name);
  await memberEditor.getByRole("button", { name: "Save member" }).click();
  await expect(memberCell).toContainText(member.name);
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  memberEditor = records.getByTestId("record-member-editor").first();
  const memberInput = memberEditor.getByRole("combobox", { name: "Member" });
  await memberInput.fill(`${member.name} typo`);
  const saveMember = memberEditor.getByRole("button", { name: "Save member" });
  await expect(saveMember).toBeDisabled();
  await memberEditor
    .getByRole("button", { name: "Cancel member edit" })
    .click();
  await expect(memberCell).toContainText(member.name);
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  memberEditor = records.getByTestId("record-member-editor").first();
  await memberEditor.getByRole("button", { name: "Clear member" }).click();
  await expect(
    memberEditor.getByRole("combobox", { name: "Member" }),
  ).toHaveValue("");
  await expect(
    memberEditor.getByRole("button", { name: "Save member" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(memberEditor).toHaveCount(0);
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
  const editAccountInJournal = records
    .getByRole("button", { name: "Edit account in journal" })
    .first();
  await editAccountInJournal.click();
  await expect(statusEditor).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Edit journal" })).toHaveCount(
    0,
  );
  await editAccountInJournal.click();
  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await deleteTransaction(page, transaction);
});

test("tag editor keeps many assignments and controls separate in a narrow viewport", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1024, height: 480 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const assignedTags = await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      createTag(
        page,
        `E2E:TagEditor:${unique}:Assigned${String(index + 1).padStart(2, "0")}`,
      ),
    ),
  );
  const suggestion = await createTag(
    page,
    `E2E:TagEditor:${unique}:Suggestion${unique}`,
  );
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E tag editor overlap ${unique}`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-23.45000000",
          category_id: category.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: assignedTags.map((tag) => tag.tag_id),
        },
        {
          account_id: merchantAccount.account_id,
          amount: "23.45000000",
          category_id: category.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [assignedTags[0]!.tag_id],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto("/transactions?page=1&pageSize=100&hideExpected=true");
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await expect(row).toBeVisible();
  await row.getByTestId("transaction-line-title").click();
  await expect(row).toHaveAttribute("aria-expanded", "true");

  const tableScroll = page.getByTestId("transactions-table-scroll");
  const tagCell = page
    .getByTestId("expanded-records")
    .getByTestId("record-tags-cell")
    .first();
  await tableScroll.evaluate((container, transactionId) => {
    const target = container.querySelector<HTMLElement>(
      `[data-transaction-id="${transactionId}"] + tr [data-testid="record-tags-cell"]`,
    );
    if (!target) {
      return;
    }
    const containerBounds = container.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    container.scrollTop += targetBounds.bottom - containerBounds.bottom + 12;
  }, transaction.transaction_id);

  await tagCell.focus();
  await tagCell.press("F2");
  const tagEditor = page
    .getByTestId("expanded-records")
    .getByTestId("record-tags-editor")
    .first();
  await expect(tagEditor).toBeVisible();
  const searchInput = tagEditor.getByRole("combobox", { name: "Tags" });
  await searchInput.fill(`Suggestion${unique}`);
  const suggestionList = tagEditor.getByRole("listbox");
  await expect(
    suggestionList.getByRole("option", { name: suggestion.name }),
  ).toBeVisible();

  const selectedTags = tagEditor.getByTestId("entity-multi-picker-selected");
  const saveButton = tagEditor.getByRole("button", { name: "Save tags" });
  const cancelButton = tagEditor.getByRole("button", {
    name: "Cancel tags edit",
  });
  await expect(
    selectedTags.getByRole("button", { name: /^Remove / }),
  ).toHaveCount(assignedTags.length);
  await expect(saveButton).toBeVisible();
  await expect(cancelButton).toBeVisible();

  const editorBounds = await requiredBoundingBox(tagEditor);
  const inputBounds = await requiredBoundingBox(searchInput);
  const listBounds = await requiredBoundingBox(suggestionList);
  const selectedBounds = await requiredBoundingBox(selectedTags);
  const saveBounds = await requiredBoundingBox(saveButton);
  const cancelBounds = await requiredBoundingBox(cancelButton);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(editorBounds.x).toBeGreaterThanOrEqual(7.5);
  expect(editorBounds.y).toBeGreaterThanOrEqual(7.5);
  expect(editorBounds.x + editorBounds.width).toBeLessThanOrEqual(
    (viewport?.width ?? 0) - 7.5,
  );
  expect(editorBounds.y + editorBounds.height).toBeLessThanOrEqual(
    (viewport?.height ?? 0) - 7.5,
  );
  expect(boundingBoxesOverlap(inputBounds, listBounds)).toBe(false);
  expect(boundingBoxesOverlap(listBounds, selectedBounds)).toBe(false);
  expect(boundingBoxesOverlap(selectedBounds, saveBounds)).toBe(false);
  expect(boundingBoxesOverlap(selectedBounds, cancelBounds)).toBe(false);
  expect(boundingBoxesOverlap(listBounds, saveBounds)).toBe(false);
  expect(boundingBoxesOverlap(listBounds, cancelBounds)).toBe(false);
  await expect
    .poll(() =>
      selectedTags.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true);

  await selectedTags
    .getByRole("button", {
      name: `Remove ${assignedTags.at(-1)?.name ?? "missing tag"}`,
    })
    .click();
  await expect(
    selectedTags.getByRole("button", { name: /^Remove / }),
  ).toHaveCount(assignedTags.length - 1);
  await cancelButton.click();
  await expect(tagEditor).toHaveCount(0);

  const bottomEdgeTagCell = page
    .getByTestId("expanded-records")
    .getByTestId("record-tags-cell")
    .nth(1);
  await tableScroll.evaluate((container, transactionId) => {
    const target = container.querySelectorAll<HTMLElement>(
      `[data-transaction-id="${transactionId}"] + tr [data-testid="record-tags-cell"]`,
    )[1];
    if (!target) {
      return;
    }
    const targetBounds = target.getBoundingClientRect();
    container.scrollTop += targetBounds.bottom - 500;
  }, transaction.transaction_id);

  await bottomEdgeTagCell.focus();
  await bottomEdgeTagCell.press("F2");
  const bottomEdgeEditor = page
    .getByTestId("expanded-records")
    .getByTestId("record-tags-editor")
    .first();
  const bottomEdgeSearchInput = bottomEdgeEditor.getByRole("combobox", {
    name: "Tags",
  });
  const bottomEdgeSelectedTags = bottomEdgeEditor.getByTestId(
    "entity-multi-picker-selected",
  );
  await bottomEdgeSelectedTags
    .getByRole("button", { name: `Remove ${assignedTags[0]!.name}` })
    .click();
  await expect(bottomEdgeSelectedTags).toHaveCount(0);
  await expect(bottomEdgeEditor.getByRole("listbox")).toHaveCount(0);

  await bottomEdgeSearchInput.focus();
  await bottomEdgeSearchInput.fill(`Suggestion${unique}`);
  const bottomEdgeSuggestionList = bottomEdgeEditor.getByRole("listbox");
  await expect(
    bottomEdgeSuggestionList.getByRole("option", { name: suggestion.name }),
  ).toBeVisible();
  const refocusedListBounds = await requiredBoundingBox(
    bottomEdgeSuggestionList,
  );
  const refocusedSaveBounds = await requiredBoundingBox(
    bottomEdgeEditor.getByRole("button", { name: "Save tags" }),
  );
  const refocusedCancelBounds = await requiredBoundingBox(
    bottomEdgeEditor.getByRole("button", { name: "Cancel tags edit" }),
  );
  expect(refocusedListBounds.height).toBeGreaterThan(4);
  expect(boundingBoxesOverlap(refocusedListBounds, refocusedSaveBounds)).toBe(
    false,
  );
  expect(boundingBoxesOverlap(refocusedListBounds, refocusedCancelBounds)).toBe(
    false,
  );
  await bottomEdgeEditor
    .getByRole("button", { name: "Cancel tags edit" })
    .click();
  await expect(bottomEdgeEditor).toHaveCount(0);

  await tagCell.focus();
  await tagCell.press("F2");
  const reopenedEditor = page
    .getByTestId("expanded-records")
    .getByTestId("record-tags-editor")
    .first();
  await reopenedEditor.getByRole("button", { name: "Save tags" }).click();
  await expect(reopenedEditor).toHaveCount(0);
  const savedResponse = await page.request.get(
    `/api/transactions/${transaction.transaction_id}`,
  );
  expect(savedResponse.ok(), await savedResponse.text()).toBe(true);
  const saved = (await savedResponse.json()) as TransactionDetailFixture;
  expect(saved.records[0]?.tag_ids).toHaveLength(assignedTags.length);
});

test("inline category tag member and amount saves keep the transaction table stable", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1600, height: 800 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const initialCategory = findByFqn(categories, "Income:Salary");
  const [nextCategory, nextTag, nextMember] = await Promise.all([
    createCategory(page, `E2E:ResponsiveSave:${unique}:Category`, "refund"),
    createTag(page, `E2E:ResponsiveSave:${unique}:Tag`),
    createMember(page, `Responsive save ${unique}`),
  ]);
  const memo = `E2E responsive inline save ${unique}`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-21",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "-17.43000000",
          category_id: initialCategory.category_id,
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
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto("/transactions?page=1&pageSize=100&hideExpected=true");
  const tableScroll = page.getByTestId("transactions-table-scroll");
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await expect(row).toBeVisible();
  await expect(row.getByRole("checkbox")).toHaveCount(0);
  await row.getByTestId("transaction-line-title").click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await tableScroll.evaluate((element, transactionId) => {
    const transactionRow = element.querySelector<HTMLElement>(
      `[data-transaction-id="${transactionId}"]`,
    );
    const header = element.querySelector<HTMLElement>("thead");
    if (!transactionRow) {
      return;
    }
    const containerBounds = element.getBoundingClientRect();
    const rowBounds = transactionRow.getBoundingClientRect();
    element.scrollTop +=
      rowBounds.top -
      containerBounds.top -
      (header?.getBoundingClientRect().height ?? 0) -
      8;
    element.scrollTop = Math.max(element.scrollTop, 16);
  }, transaction.transaction_id);
  const expandedRecords = page.getByTestId("expanded-records");
  await expect(expandedRecords).toBeVisible();

  const rowPrefix = `transaction-${transaction.transaction_id}`;
  const categoryCell = row.getByTestId(`${rowPrefix}-category-cell`);
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = row.getByTestId(`${rowPrefix}-category-editor`);
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  await expectInlineSaveKeepsTransactionTableStable(
    page,
    transaction.transaction_id,
    categoryCell,
    () => categoryEditor.getByRole("button", { name: "Save category" }).click(),
    async () => {
      await expect(row.getByRole("img", { name: "REFUND" })).toBeVisible();
      await expect(
        expandedRecords.getByText(nextCategory.fqn, { exact: true }),
      ).toHaveCount(2);
    },
  );
  await expect(categoryEditor).toHaveCount(0);
  await expect(
    expandedRecords.getByText(nextCategory.fqn, { exact: true }),
  ).toHaveCount(2);
  await expect(row.getByRole("img", { name: "REFUND" })).toBeVisible();

  const tagCell = row.getByTestId(`${rowPrefix}-tags-cell`);
  await tagCell.focus();
  await tagCell.press("F2");
  const tagEditor = row.getByTestId(`${rowPrefix}-tags-editor`);
  await tagEditor.getByRole("combobox", { name: "Tags" }).fill(nextTag.fqn);
  await tagEditor.getByRole("combobox", { name: "Tags" }).press("Enter");
  await expectInlineSaveKeepsTransactionTableStable(
    page,
    transaction.transaction_id,
    tagCell,
    () => tagEditor.getByRole("button", { name: "Save tags" }).click(),
    async () => {
      await expect(
        expandedRecords.getByText(nextTag.fqn, { exact: true }),
      ).toHaveCount(2);
    },
  );
  await expect(tagEditor).toHaveCount(0);
  await expect(
    expandedRecords.getByText(nextTag.fqn, { exact: true }),
  ).toHaveCount(2);

  const memberCell = row.getByTestId(`${rowPrefix}-member-cell`);
  await memberCell.focus();
  await memberCell.press("F2");
  const memberEditor = row.getByTestId(`${rowPrefix}-member-editor`);
  await memberEditor
    .getByRole("combobox", { name: "Member" })
    .fill(nextMember.name);
  await memberEditor.getByRole("combobox", { name: "Member" }).press("Enter");
  await expectInlineSaveKeepsTransactionTableStable(
    page,
    transaction.transaction_id,
    memberCell,
    () => memberEditor.getByRole("button", { name: "Save member" }).click(),
    async () => {
      await expect(
        expandedRecords.getByText(nextMember.name, { exact: true }),
      ).toHaveCount(2);
    },
  );
  await expect(memberEditor).toHaveCount(0);
  await expect(
    expandedRecords.getByText(nextMember.name, { exact: true }),
  ).toHaveCount(2);

  const amountCell = row.getByTestId(`${rowPrefix}-amount-cell`);
  await amountCell.focus();
  await amountCell.press("F2");
  const amountEditor = row.getByTestId(`${rowPrefix}-amount-editor`);
  await amountEditor.getByRole("textbox", { name: "Amount" }).fill("29.87");
  await expectInlineSaveKeepsTransactionTableStable(
    page,
    transaction.transaction_id,
    amountCell,
    () => amountEditor.getByRole("button", { name: "Save amount" }).click(),
    async () => {
      await expect(expandedRecords).toContainText("-29.87 $");
      await expect(expandedRecords).toContainText("+29.87 $");
    },
  );
  await expect(amountEditor).toHaveCount(0);
  await expect(expandedRecords).toContainText("-29.87 $");
  await expect(expandedRecords).toContainText("+29.87 $");
  await expect(row.getByRole("checkbox")).toHaveCount(0);

  await deleteTransaction(page, transaction);
});

test("transaction-row inline editing follows the uniformity rule", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1600, height: 900 });
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
  await page.reload();
  await expect(row).toBeVisible();
  const categoryCell = row.getByTestId(`${rowPrefix}-category-cell`);
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = row.getByTestId(`${rowPrefix}-category-editor`);
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  await categoryEditor.getByRole("button", { name: "Save category" }).click();
  await expect(categoryEditor).toHaveCount(0);
  await row.locator("td").nth(3).click();
  const expandedRecords = page.getByTestId("expanded-records");
  await expect(
    expandedRecords.getByText(nextCategory.fqn, { exact: true }),
  ).toHaveCount(2);

  const tagCell = row.getByTestId(`${rowPrefix}-tags-cell`);
  await tagCell.hover();
  await tagCell.getByRole("button", { name: "Edit Tags" }).click();
  const tagEditor = row.getByTestId(`${rowPrefix}-tags-editor`);
  const tagInput = tagEditor.getByRole("combobox", { name: "Tags" });
  await expect(tagCell.getByRole("button", { name: "Edit Tags" })).toHaveCount(
    0,
  );
  await tagInput.press("Shift+Tab");
  await expect
    .poll(() =>
      tagCell.evaluate((cell) => cell.contains(document.activeElement)),
    )
    .toBe(false);
  await expect(tagEditor).toBeVisible();
  await tagInput.fill(nextTag.fqn);
  await tagInput.press("Enter");
  await tagEditor.getByRole("button", { name: "Save tags" }).click();
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
  await memberEditor.getByRole("button", { name: "Save member" }).click();
  await expect(
    expandedRecords.getByText(member.name, { exact: true }),
  ).toHaveCount(2);

  const amountCell = row.getByTestId(`${rowPrefix}-amount-cell`);
  await amountCell.hover();
  await amountCell.getByRole("button", { name: "Edit row value" }).click();
  const amountEditor = row.getByTestId(`${rowPrefix}-amount-editor`);
  await amountEditor.getByRole("textbox", { name: "Amount" }).fill("29.87");
  await amountEditor.getByRole("button", { name: "Save amount" }).click();
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

test("inline editing keeps one explicit-commit draft across transaction rows", async ({
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
  const [draftCategory, savedCategory] = await Promise.all([
    createCategory(page, `E2E:ExplicitCommit:${unique}:Draft`, "expense"),
    createCategory(page, `E2E:ExplicitCommit:${unique}:Saved`, "expense"),
  ]);
  const memoPrefix = `E2E explicit commit ${unique}`;
  const firstMemo = `${memoPrefix} first`;
  const secondMemo = `${memoPrefix} second`;

  const firstCreateResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-11",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: firstMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: firstMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(firstCreateResponse.ok(), await firstCreateResponse.text()).toBe(true);
  const firstTransaction =
    (await firstCreateResponse.json()) as TransactionDetailFixture;

  const secondCreateResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-12",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-23.58000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: secondMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "23.58000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: secondMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(secondCreateResponse.ok(), await secondCreateResponse.text()).toBe(
    true,
  );
  const secondTransaction =
    (await secondCreateResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?q=${encodeURIComponent(memoPrefix)}&page=1&pageSize=50&hideExpected=true`,
  );
  const firstRow = page.getByRole("row").filter({ hasText: firstMemo }).first();
  const secondRow = page
    .getByRole("row")
    .filter({ hasText: secondMemo })
    .first();
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toBeVisible();

  const firstPrefix = `transaction-${firstTransaction.transaction_id}`;
  const secondPrefix = `transaction-${secondTransaction.transaction_id}`;
  const firstCategoryCell = firstRow.getByTestId(
    `${firstPrefix}-category-cell`,
  );
  const firstCategoryEditor = firstRow.getByTestId(
    `${firstPrefix}-category-editor`,
  );
  const secondCategoryCell = secondRow.getByTestId(
    `${secondPrefix}-category-cell`,
  );
  const secondCategoryEditor = secondRow.getByTestId(
    `${secondPrefix}-category-editor`,
  );
  const firstAmountCell = firstRow.getByTestId(`${firstPrefix}-amount-cell`);
  const firstAmountEditor = firstRow.getByTestId(
    `${firstPrefix}-amount-editor`,
  );
  await firstCategoryCell.focus();
  await firstCategoryCell.press("F2");
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(draftCategory.fqn);
  await expect(
    firstCategoryEditor
      .getByRole("button", { name: "Save category" })
      .locator("svg"),
  ).toHaveCSS("width", "16px");
  await expect(
    firstCategoryEditor
      .getByRole("button", { name: "Cancel category edit" })
      .locator("svg"),
  ).toHaveCSS("width", "16px");
  await expect(editorButtonsFitContainer(firstCategoryEditor)).resolves.toBe(
    true,
  );
  await firstCategoryEditor
    .getByRole("button", { name: "Save category" })
    .focus();
  await page.keyboard.press("n");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await expect(firstCategoryEditor).toBeVisible();

  await firstRow.locator("td").nth(3).dispatchEvent("pointerdown", {
    button: 2,
    buttons: 2,
    pointerType: "mouse",
  });
  await expect(firstCategoryEditor).toHaveCount(0);
  await secondRow.locator("td").nth(3).click();
  await expect(secondRow).toHaveAttribute("aria-expanded", "true");
  await secondRow.locator("td").nth(3).click();
  await expect(secondRow).toHaveAttribute("aria-expanded", "false");

  await firstCategoryCell.focus();
  await firstCategoryCell.press("F2");
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(draftCategory.fqn);
  await firstAmountCell.hover();
  await firstAmountCell.getByRole("button", { name: "Edit row value" }).click();
  await expect(firstCategoryEditor).toHaveCount(0);
  await expect(firstAmountEditor).toHaveCount(0);
  let storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    initialCategory.category_id,
    initialCategory.category_id,
  ]);

  const firstMemberCell = firstRow.getByTestId(`${firstPrefix}-member-cell`);
  await firstMemberCell.focus();
  await firstMemberCell.press("F2");
  const firstMemberEditor = firstRow.getByTestId(
    `${firstPrefix}-member-editor`,
  );
  await expect(editorButtonsFitContainer(firstMemberEditor)).resolves.toBe(
    true,
  );
  const cancelMember = firstMemberEditor.getByRole("button", {
    name: "Cancel member edit",
  });
  await cancelMember.focus();
  await page.keyboard.press("Enter");
  await expect(firstMemberEditor).toHaveCount(0);

  await firstAmountCell.focus();
  await firstAmountCell.press("F2");
  await expect(firstAmountEditor).toBeVisible();
  const amountInput = firstAmountEditor.getByRole("textbox", {
    name: "Amount",
  });
  let releaseFailedSave: (() => void) | undefined;
  const failedSaveStarted = new Promise<void>((resolve) => {
    void page.route(
      `**/api/transactions/${firstTransaction.transaction_id}`,
      async (route) => {
        if (route.request().method() !== "PUT") {
          await route.continue();
          return;
        }
        resolve();
        await new Promise<void>((release) => {
          releaseFailedSave = release;
        });
        await route.fulfill({
          contentType: "application/json",
          json: { message: "Inline save failed" },
          status: 500,
        });
      },
    );
  });
  await amountInput.fill("99.12");
  await firstAmountEditor.getByRole("button", { name: "Save amount" }).click();
  await failedSaveStarted;
  await page.keyboard.press("Escape");
  await expect(firstAmountEditor).toBeVisible();
  await expect(amountInput).toHaveValue("99.12");
  await page.getByRole("heading", { name: "Transactions" }).click();
  await expect(firstAmountEditor).toBeVisible();
  await expect(amountInput).toHaveValue("99.12");
  releaseFailedSave?.();
  await expect(firstAmountEditor.getByRole("alert")).toBeVisible();
  await expect(amountInput).toHaveValue("99.12");
  await page.unroute(`**/api/transactions/${firstTransaction.transaction_id}`);
  await firstAmountEditor
    .getByRole("button", { name: "Cancel amount edit" })
    .click();

  await firstCategoryCell.focus();
  await firstCategoryCell.press("F2");
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(draftCategory.fqn);
  await secondCategoryCell.focus();
  await secondCategoryCell.press("F2");
  await expect(firstCategoryEditor).toHaveCount(0);
  await expect(secondCategoryEditor).toHaveCount(0);
  storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    initialCategory.category_id,
    initialCategory.category_id,
  ]);

  await firstCategoryCell.focus();
  await firstCategoryCell.press("F2");
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(draftCategory.fqn);
  await page.getByRole("heading", { name: "Transactions" }).click();
  await expect(firstCategoryEditor).toHaveCount(0);
  storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    initialCategory.category_id,
    initialCategory.category_id,
  ]);

  await firstCategoryCell.focus();
  await firstCategoryCell.press("F2");
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(draftCategory.fqn);
  await page.keyboard.press("Escape");
  await expect(firstCategoryEditor).toHaveCount(0);
  await expect(firstCategoryCell).toBeFocused();
  storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    initialCategory.category_id,
    initialCategory.category_id,
  ]);

  await firstCategoryCell.press("F2");
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(`${draftCategory.fqn}:typo`);
  const invalidSaveCategory = firstCategoryEditor.getByRole("button", {
    name: "Save category",
  });
  const invalidCancelCategory = firstCategoryEditor.getByRole("button", {
    name: "Cancel category edit",
  });
  await expect(invalidSaveCategory).toBeDisabled();
  await expect(invalidCancelCategory).toBeEnabled();
  await invalidCancelCategory.focus();
  await expect(invalidCancelCategory).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(firstCategoryEditor).toHaveCount(0);
  await expect(firstCategoryCell).toBeFocused();
  storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    initialCategory.category_id,
    initialCategory.category_id,
  ]);

  await firstCategoryCell.press("F2");
  const categoryInput = firstCategoryEditor.getByRole("combobox", {
    name: "Category",
  });
  const saveCategory = firstCategoryEditor.getByRole("button", {
    name: "Save category",
  });
  const cancelCategory = firstCategoryEditor.getByRole("button", {
    name: "Cancel category edit",
  });
  await categoryInput.fill(savedCategory.fqn);
  if (testInfo.project.name === "chromium") {
    await page.keyboard.press("Tab");
    await expect(saveCategory).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancelCategory).toBeFocused();
  }
  await saveCategory.click();
  await expect(firstCategoryEditor).toHaveCount(0);
  await expect(firstCategoryCell).toContainText(savedCategory.name);
  storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    savedCategory.category_id,
    savedCategory.category_id,
  ]);

  await firstRow.locator("td").nth(3).click();
  const expandedRecords = page.getByTestId("expanded-records");
  await expect(
    expandedRecords.getByText(savedCategory.fqn, { exact: true }),
  ).toHaveCount(2);

  await Promise.all([
    deleteTransaction(page, firstTransaction),
    deleteTransaction(page, secondTransaction),
  ]);
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
      .nth(3)
      .innerText()
  ).split("\n")[0];
  const firstPageFirstDate = await page
    .locator("tbody > tr[aria-expanded]")
    .first()
    .locator("td")
    .nth(1)
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

test("bulk mode keyboard ranges stay page-local across pagination", async ({
  page,
}) => {
  await page.goto("/transactions?page=1&pageSize=25&hideExpected=true");
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  const selectableRows = page.locator(
    "tbody tr[data-transaction-id]:not([aria-disabled='true'])",
  );
  await expect(selectableRows.nth(1)).toBeVisible();
  const selectableCount = await selectableRows.count();

  await page.getByRole("button", { name: "Bulk edit" }).click();
  const modeBar = page.getByTestId("transaction-browser-bulk-mode-bar");
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveCount(0);

  await selectableRows.first().focus();
  await page.keyboard.press("Space");
  await expect(modeBar).toContainText("1 selected");
  await selectableRows.nth(1).focus();
  await page.keyboard.press("Shift+Space");
  await expect(modeBar).toContainText("2 selected");
  await selectableRows.first().focus();
  await page.keyboard.press("Shift+Space");
  await expect(modeBar).toContainText("1 selected");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(modeBar).toContainText("2 selected");

  await modeBar.getByRole("button", { name: "Clear" }).click();
  await selectableRows.first().focus();
  await page.keyboard.press("Control+A");
  await expect(modeBar).toContainText(`${selectableCount} selected`);
  await expect(
    page.getByRole("checkbox", { name: "Select page transactions" }),
  ).toBeChecked();

  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
  await expect(modeBar).toContainText("0 selected");
  await expect(page.getByTestId("bulk-action-bar")).toBeVisible();
  await expect(page.getByTestId("bulk-action-picker")).toHaveCount(0);
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

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=2&pageSize=25");
  await ledgerLookups;
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
  await fillAndExpectValue(tagsPicker, visibleTagOne.fqn);
  await expect(
    page.getByRole("button", { name: "Remove Groceries" }),
  ).toBeVisible();
  await fillAndExpectValue(tagsPicker, visibleTagTwo.fqn);
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
  await fillAndExpectValue(amountMinInput, "10");
  await fillAndExpectValue(amountMaxInput, "20");
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
  await page.setViewportSize({ width: 700, height: 720 });
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
  const ordinaryMemo = `E2E recurring layout ${unique} ordinary`;
  const ordinaryResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "34.56",
      category_id: dueFixture.category.category_id,
      counterparty_account_id: dueFixture.merchant.account_id,
      currency: "USD",
      funding_account_id: dueFixture.checking.account_id,
      initiated_date: formatLocalDate(new Date()),
      memo: ordinaryMemo,
    },
  });
  expect(ordinaryResponse.ok(), await ordinaryResponse.text()).toBe(true);
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
  const overdueRow = page.getByRole("row").filter({
    hasText: overdueFixture.merchantFqn.split(":").at(-1) ?? "Merchant",
  });
  const dueRow = page
    .getByRole("row")
    .filter({
      hasText: dueFixture.merchantFqn.split(":").at(-1) ?? "Merchant",
    })
    .filter({ has: page.getByRole("img", { name: "Expected" }) });
  const ordinaryRow = page.getByRole("row").filter({ hasText: ordinaryMemo });
  await expect(overdueRow).toBeVisible();
  await expect(dueRow).toBeVisible();
  await expect(ordinaryRow).toBeVisible();

  for (const width of [1280, 700]) {
    await page.setViewportSize({ width, height: 720 });

    const overdueExpected = overdueRow.getByRole("img", { name: "Expected" });
    const overdueMarker = overdueRow.getByRole("img", { name: "Overdue" });
    const dueExpected = dueRow.getByRole("img", { name: "Expected" });
    await expect(overdueExpected).toBeVisible();
    await expect(overdueMarker).toBeVisible();
    await expect(dueExpected).toBeVisible();
    await expect(dueRow.getByRole("img", { name: "Overdue" })).toHaveCount(0);
    await expect(ordinaryRow.getByTestId("recurring-indicators")).toHaveCount(
      0,
    );

    const geometry = await Promise.all(
      [overdueRow, dueRow, ordinaryRow].map((row) =>
        row.evaluate((element) => {
          const cell = element.querySelector<HTMLElement>(
            ".transactions-description-column",
          );
          const text = element.querySelector<HTMLElement>(
            "[data-testid='transaction-description-text']",
          );
          const indicators = element.querySelector<HTMLElement>(
            "[data-testid='recurring-indicators']",
          );
          const title = element.querySelector<HTMLElement>(
            "[data-testid='transaction-line-title']",
          );
          if (!cell || !text || !title) {
            throw new Error("expected transaction description geometry");
          }
          const cellBounds = cell.getBoundingClientRect();
          const textBounds = text.getBoundingClientRect();
          const indicatorBounds = indicators?.getBoundingClientRect();
          const rowBounds = element.getBoundingClientRect();
          return {
            cell: {
              bottom: cellBounds.bottom,
              left: cellBounds.left,
              right: cellBounds.right,
              top: cellBounds.top,
            },
            indicators: indicatorBounds
              ? {
                  bottom: indicatorBounds.bottom,
                  left: indicatorBounds.left,
                  right: indicatorBounds.right,
                  top: indicatorBounds.top,
                }
              : undefined,
            rowHeight: rowBounds.height,
            text: {
              right: textBounds.right,
              width: textBounds.width,
            },
            titleOverflow: getComputedStyle(title).textOverflow,
            titleWhiteSpace: getComputedStyle(title).whiteSpace,
          };
        }),
      ),
    );
    const [overdueGeometry, dueGeometry, ordinaryGeometry] = geometry;
    expect(overdueGeometry?.indicators).toBeDefined();
    expect(dueGeometry?.indicators).toBeDefined();
    expect(ordinaryGeometry?.indicators).toBeUndefined();

    for (const recurringGeometry of [overdueGeometry, dueGeometry]) {
      expect(
        (recurringGeometry?.indicators?.left ?? 0) -
          (recurringGeometry?.text.right ?? 0),
      ).toBeGreaterThanOrEqual(-0.5);
      expect(recurringGeometry?.indicators?.left ?? 0).toBeGreaterThanOrEqual(
        (recurringGeometry?.cell.left ?? 0) - 0.5,
      );
      expect(recurringGeometry?.indicators?.right ?? 0).toBeLessThanOrEqual(
        (recurringGeometry?.cell.right ?? 0) + 0.5,
      );
      expect(recurringGeometry?.indicators?.top ?? 0).toBeGreaterThanOrEqual(
        (recurringGeometry?.cell.top ?? 0) - 0.5,
      );
      expect(recurringGeometry?.indicators?.bottom ?? 0).toBeLessThanOrEqual(
        (recurringGeometry?.cell.bottom ?? 0) + 0.5,
      );
      expect(recurringGeometry?.titleOverflow).toBe("ellipsis");
      expect(recurringGeometry?.titleWhiteSpace).toBe("nowrap");
    }

    expect(ordinaryGeometry?.text.width ?? 0).toBeGreaterThan(
      (dueGeometry?.text.width ?? 0) + 20,
    );
    expect(dueGeometry?.text.width ?? 0).toBeGreaterThan(
      (overdueGeometry?.text.width ?? 0) + 20,
    );
    expect(
      Math.abs(
        (ordinaryGeometry?.rowHeight ?? 0) -
          (dueGeometry?.rowHeight ?? Number.POSITIVE_INFINITY),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        (ordinaryGeometry?.rowHeight ?? 0) -
          (overdueGeometry?.rowHeight ?? Number.POSITIVE_INFINITY),
      ),
    ).toBeLessThanOrEqual(1);
  }

  await overdueRow.getByRole("img", { name: "Expected" }).hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Expected" }),
  ).toBeVisible();
  await overdueRow.getByRole("img", { name: "Overdue" }).hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Overdue occurrence" }),
  ).toBeVisible();
  await expect(overdueRow.getByText("-23.45 $", { exact: true })).toHaveClass(
    /text-muted-foreground/,
  );
  await expectCollapsedRowActionsKeepAmountVisible(overdueRow);
  await expectCollapsedRowActionsKeepAmountVisible(dueRow);
  const overdueActionsMenu = await openRowActionsMenu(page, overdueRow);
  await expect(
    overdueActionsMenu.getByRole("button", {
      name: "Open transaction detail",
    }),
  ).toBeVisible();
  await expect(
    overdueActionsMenu.getByRole("button", { name: "Confirm occurrence" }),
  ).toBeVisible();
  await expect(
    overdueActionsMenu.getByRole("button", { name: "Dismiss occurrence" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overdueActionsMenu).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 720 });
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(entryPanel).toBeVisible();
  await expect(dueRow).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(entryPanel).toHaveCount(0);
  await page.setViewportSize({ width: 700, height: 720 });

  const hideExpectedToggle = page.getByRole("button", {
    name: "Hide expected",
  });
  await expect(hideExpectedToggle).toHaveAttribute("aria-pressed", "false");
  await expect(
    hideExpectedToggle.locator('[data-icon="calendar-weeks"]'),
  ).toBeVisible();

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
  await hideExpectedToggle.click();
  await hideRequest;

  await expectTransactionFilterUrl(page, {
    pageSize: "50",
    q: search,
    hideExpected: true,
  });
  await expect(hideExpectedToggle).toHaveAttribute("aria-pressed", "true");
  await expect(
    hideExpectedToggle.locator('[data-icon="calendar-weeks-off"]'),
  ).toBeVisible();
  await expect(overdueRow).toHaveCount(0);
  await expect(dueRow).toHaveCount(0);

  await hideExpectedToggle.click();
  await expectTransactionFilterUrl(page, { pageSize: "50", q: search });
  await expect(hideExpectedToggle).toHaveAttribute("aria-pressed", "false");
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
  await clickRowAction(page, overdueRow, "Confirm occurrence");
  await expect(
    page.getByRole("status").filter({ hasText: "Occurrence confirmed." }),
  ).toBeVisible();
  await expect(overdueRow.locator('[aria-label="Expected"]')).toHaveCount(0);
  await expect(
    overdueRow.getByText("-23.45 $", { exact: true }),
  ).not.toHaveClass(/text-muted-foreground/);
  await expect(featuredRow).toContainText("-23.45 $");

  await clickRowAction(page, dueRow, "Dismiss occurrence");
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

test("transaction amount chips share one right edge across row variants", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const overdueFixture = await createExpectedRecurringFixture(
    page,
    `${unique}AmountAlignment`,
    {
      anchorDate: shiftLocalDate(formatLocalDate(new Date()), -1),
    },
  );
  const incomeAccount = await createAccount(
    page,
    `e2e:amount-alignment:${unique}:income`,
    "balance",
    "USD",
  );
  const incomeSource = await createAccount(
    page,
    `e2e:amount-alignment:${unique}:source`,
    "flow",
  );
  const incomeCategory = await createCategory(
    page,
    `E2E:AmountAlignment:${unique}:Income`,
    "income",
  );
  const ordinaryMemo = `E2E amount alignment ${unique} ordinary memo`;
  const mixedMemo = `E2E amount alignment ${unique} mixed`;
  let ordinaryTransaction: TransactionFixture | undefined;
  let mixedTransaction: TransactionFixture | undefined;

  try {
    const ordinaryResponse = await page.request.post(
      "/api/transactions/spend",
      {
        data: {
          amount: "34.56",
          category_id: overdueFixture.category.category_id,
          counterparty_account_id: overdueFixture.merchant.account_id,
          currency: "USD",
          funding_account_id: overdueFixture.checking.account_id,
          initiated_date: formatLocalDate(new Date()),
          memo: ordinaryMemo,
        },
      },
    );
    expect(ordinaryResponse.ok(), await ordinaryResponse.text()).toBe(true);
    ordinaryTransaction = (await ordinaryResponse.json()) as TransactionFixture;

    const mixedResponse = await page.request.post("/api/transactions", {
      data: {
        initiated_date: formatLocalDate(new Date()),
        records: [
          {
            account_id: overdueFixture.checking.account_id,
            amount: "-5.00",
            category_id: overdueFixture.category.category_id,
            currency: "USD",
            memo: mixedMemo,
            posting_status: "posted",
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: overdueFixture.merchant.account_id,
            amount: "5.00",
            category_id: overdueFixture.category.category_id,
            currency: "USD",
            memo: mixedMemo,
            posting_status: "posted",
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: incomeAccount.account_id,
            amount: "100.00",
            category_id: incomeCategory.category_id,
            currency: "USD",
            memo: mixedMemo,
            posting_status: "posted",
            reconciliation_status: "unreconciled",
            source: "manual",
          },
          {
            account_id: incomeSource.account_id,
            amount: "-100.00",
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
    expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);
    mixedTransaction = (await mixedResponse.json()) as TransactionFixture;

    await page.goto(
      `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}`,
    );
    const ordinaryRow = page.getByRole("row").filter({ hasText: ordinaryMemo });
    const overdueRow = page
      .getByRole("row")
      .filter({
        hasText:
          overdueFixture.merchantFqn.split(":").at(-1) ?? "AmountAlignment",
      })
      .filter({ has: page.getByRole("img", { name: "Expected" }) });
    const mixedRow = page.getByRole("row").filter({ hasText: mixedMemo });

    await expect(
      overdueRow.getByRole("img", { name: "Overdue" }),
    ).toBeVisible();
    await expect(mixedRow.getByTestId("amount-chip")).toContainText(
      "-5.00 / +100.00 $",
    );

    for (const width of [1440, 700]) {
      await page.setViewportSize({ width, height: 720 });
      await expectAmountChipRightEdgesAligned([
        ordinaryRow,
        overdueRow,
        mixedRow,
      ]);
    }
  } finally {
    if (ordinaryTransaction) {
      await deleteTransaction(page, ordinaryTransaction);
    }
    if (mixedTransaction) {
      await deleteTransaction(page, mixedTransaction);
    }
  }
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
  const hideExpectedToggle = page.getByRole("button", {
    name: "Hide expected",
  });
  const bulkEditButton = page.getByRole("button", { name: "Bulk edit" });
  const filterToggle = page.getByRole("button", { name: "Open filters" });
  const filterTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Open filters" });
  const tabTo = async (target: Locator) => {
    await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
  };

  await expect(hideExpectedToggle).toHaveAttribute("aria-pressed", "true");

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
  await tabTo(bulkEditButton);
  await tabTo(filterToggle);
  await expect(filterTooltip).toBeVisible();
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
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}&class=spend&category=${category.category_id}&hideExpected=true`,
  );

  await expect(
    page.getByTestId("transaction-browser-filter-bar"),
  ).toBeVisible();
  await expect(page.getByText(`Category ${category.name}`)).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    search,
  );
  await expect(page.getByLabel("Class")).toHaveText("Spend");
  const hideExpectedToggle = page.getByRole("button", {
    name: "Hide expected",
  });
  await expect(hideExpectedToggle).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Close filters" }).click();

  await expect(page.getByTestId("transaction-browser-filter-bar")).toBeHidden();
  await expectTransactionFilterUrl(page, {
    classes: ["spend"],
    hideExpected: true,
    pageSize: "50",
    q: search,
  });
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue(
    search,
  );
  await expect(page.getByLabel("Class")).toHaveText("Spend");
  await expect(hideExpectedToggle).toHaveAttribute("aria-pressed", "true");
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

  await clickRowAction(page, targetRow, "Open transaction detail");
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
  const firstTransactionRow = page
    .locator("tbody > tr[data-transaction-id]")
    .first();
  await expect(firstTransactionRow).toBeVisible();
  const normalizedFirstTransactionRowText = async () =>
    firstTransactionRow.evaluate(
      (row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
  const retainedFirstPageRow = await normalizedFirstTransactionRowText();

  let releaseDateJumpResponse: (() => void) | undefined;
  let delayDateJumpResponse = true;
  const dateJumpRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/transactions**", async (route) => {
      const url = new URL(route.request().url());
      if (
        delayDateJumpResponse &&
        url.searchParams.get("anchor_date") === jumpDate
      ) {
        delayDateJumpResponse = false;
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
    await page.getByRole("button", { name: "Bulk edit" }).click();
    await page
      .locator("tbody > tr[data-transaction-id]:not([aria-disabled='true'])")
      .first()
      .click();
    await expect(
      page.getByTestId("transaction-browser-bulk-mode-bar"),
    ).toContainText("1 selected");
  } finally {
    releaseDateJumpResponse?.();
  }

  const cancelledDateJumpBody = (await (
    await dateJumpResponse
  ).json()) as TransactionListFixture;
  await expectTransactionsPageUrl(page, 1, 25);
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("1 selected");
  await expect(
    page.locator(`[data-date-jump-anchor="${jumpDate}"]`),
  ).toHaveCount(0);
  await page
    .getByTestId("transaction-browser-bulk-mode-bar")
    .getByRole("button", { name: "Done" })
    .click();

  await page.unroute("**/api/transactions**");
  const retryDateJumpResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("anchor_date") === jumpDate
    );
  });
  await page.getByLabel("Go to day").fill("");
  await page.getByLabel("Go to day").fill(jumpDate);
  const dateJumpBody = (await (
    await retryDateJumpResponse
  ).json()) as TransactionListFixture;
  const landedPage = Math.floor(dateJumpBody.offset / 25) + 1;
  expect(cancelledDateJumpBody.offset).toBe(dateJumpBody.offset);
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

  for (const width of [
    1600, 1440, 1280, 1249, 1150, 1000, 900, 820, 800, 700, 640,
  ]) {
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

  for (const width of [1600, 1000, 700, 390]) {
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

  await page.setViewportSize({ width: 1000, height: 720 });
  const fullAmountLabel = "-9,999,999,999.99 $";
  const longAmountRow = page.getByRole("row").filter({ hasText: memo });
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  const longAmountChip = longAmountRow.getByTestId("amount-chip");
  await expect(longAmountChip.locator(".truncate")).toHaveCount(0);
  await expect(longAmountChip).toHaveCSS("overflow", "visible");
  await longAmountChip.scrollIntoViewIfNeeded();
  const tableScroll = page.getByTestId("transactions-table-scroll");
  const longAmountTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: fullAmountLabel });
  await tableScroll.hover({ position: { x: 1, y: 1 } });
  await longAmountChip.hover();
  await tableScroll.hover({ position: { x: 1, y: 1 } });
  await longAmountChip.hover();
  await expect(longAmountTooltip).toBeVisible();

  await page.setViewportSize({ width: 1000, height: 720 });
  await page.getByRole("button", { name: "Bulk edit" }).click();
  const bulkFooterBox = await page
    .getByTestId("transactions-pagination-footer")
    .boundingBox();
  const sidebarControlBox = await page
    .getByRole("button", { name: "Expand sidebar" })
    .boundingBox();
  expect(bulkFooterBox).not.toBeNull();
  expect(sidebarControlBox).not.toBeNull();
  expect(
    Math.abs(
      (bulkFooterBox?.y ?? 0) +
        (bulkFooterBox?.height ?? 0) -
        ((sidebarControlBox?.y ?? 0) + (sidebarControlBox?.height ?? 0)),
    ),
  ).toBeLessThanOrEqual(1);
  const bulkModeBar = page.getByTestId("transaction-browser-bulk-mode-bar");
  await longAmountRow.click();
  await expect(bulkModeBar).toContainText("1 selected");
  await longAmountRow.getByTestId("amount-chip").hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: fullAmountLabel }),
  ).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(bulkModeBar).toContainText("0 selected");
  await page.keyboard.press("Escape");
  await expect(bulkModeBar).toHaveCount(0);
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

test("transactions page help and leaf category chips", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, exchangeCategory] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    createCategory(page, `E2E:Exchange:${unique}:FXBucket`, "exchange"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const exchangeProvider = await createAccount(
    page,
    `merchant:E2EExchange:${unique}:Provider`,
    "flow",
  );
  const cashEUR = await createAccount(
    page,
    `cash:E2EExchange:${unique}:EUR`,
    "balance",
    "EUR",
  );
  const exchangeMemo = `E2E exchange row ${unique}`;
  const exchangeResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-224.00000000",
          category_id: exchangeCategory.category_id,
          currency: "USD",
          memo: exchangeMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: exchangeProvider.account_id,
          amount: "224.00000000",
          category_id: exchangeCategory.category_id,
          currency: "USD",
          memo: exchangeMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: exchangeProvider.account_id,
          amount: "-200.00000000",
          category_id: exchangeCategory.category_id,
          currency: "EUR",
          memo: exchangeMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: cashEUR.account_id,
          amount: "200.00000000",
          category_id: exchangeCategory.category_id,
          currency: "EUR",
          memo: exchangeMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(exchangeResponse.ok(), await exchangeResponse.text()).toBe(true);

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
  expect(rowHeights.mixed).toBeGreaterThan(0);
  expect(rowHeights.ordinary).toBeGreaterThan(0);
  expect(
    Math.abs((rowHeights.mixed ?? 0) - (rowHeights.ordinary ?? 0)),
  ).toBeLessThanOrEqual(1);

  await page.goto(
    `/transactions?q=${encodeURIComponent(exchangeMemo)}&page=1&pageSize=50&hideExpected=true`,
  );
  const exchangeRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "EXCHANGE" }) })
    .filter({ hasText: "USD → EUR" })
    .first();
  await expect(exchangeRow).toContainText("-224.00 $");
  await expect(exchangeRow).not.toContainText("200.00 €");

  await page.goto("/transactions?page=1&pageSize=50&hideExpected=true");
  await expect(simpleSpendRow).toBeVisible();

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

  const directRowActions = simpleSpendRow.locator(".row-actions-buttons");
  await expect(
    directRowActions.getByRole("button", { name: "Open transaction detail" }),
  ).toBeVisible();
  await expect(
    directRowActions.getByRole("button", { name: "Delete transaction" }),
  ).toBeVisible();
  await expect(
    simpleSpendRow.getByRole("button", { name: "More row actions" }),
  ).toBeHidden();
});

test("transactions line composition uses compact dates and single-line leaf tags", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 720 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const fitTagFqns = [
    `E2E:WrapFit:${unique}:A`,
    `E2E:WrapFit:${unique}:B`,
    `E2E:WrapFit:${unique}:C`,
    `E2E:WrapFit:${unique}:D`,
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
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(entryPanel).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(entryPanel).toHaveCount(0);

  await clickRowAction(page, detailRow, "Open transaction detail");

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

  await alternateDetailRow.locator("td").nth(3).click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(alternateDetailRow).toHaveAttribute("aria-expanded", "true");
  await alternateDetailRow.locator("td").nth(3).click();
  await expect(alternateDetailRow).toHaveAttribute("aria-expanded", "false");

  await clickRowAction(page, detailRow, "Open transaction detail");
  await expect(panel).toBeVisible();

  await alternateDetailRow.scrollIntoViewIfNeeded();
  await alternateDetailRow.focus();
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
  await expect(entryPanel).toHaveCount(0);
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);

  await clickRowAction(page, detailRow, "Open transaction detail");
  await expect(panel).toBeVisible();
  await page.keyboard.press("KeyN");
  await expect(entryPanel).toBeVisible();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(entryPanel).toHaveCount(0);
  await expect(panel).toBeVisible();

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

test("detail and peek account paths navigate without record-row side effects", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [account, merchant, categories] = await Promise.all([
    createAccount(
      page,
      `e2e:DetailLinks:${unique}:Household:Checking`,
      "balance",
      "USD",
    ),
    createAccount(page, `e2eDetailLinks${unique}:LinkTarget`, "flow", "USD"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E detail account links ${unique}`;
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "31.27",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: account.account_id,
      initiated_date: "2026-07-23",
      memo,
    },
  });
  expect(createResponse.ok()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionFixture;

  let panel = await openUrlTransactionDetail(page, transaction.transaction_id);
  let accountLink = panel.getByRole("link", {
    exact: true,
    name: account.fqn,
  });
  let recordRow = accountLink.locator("xpath=ancestor::tr");
  await expect(accountLink).toHaveCount(1);
  await expect(recordRow.getByRole("link")).toHaveCount(1);
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await expectFocusedTwoSegmentAccountPathWhole(
    panel.locator(`a[href='/accounts/${merchant.account_id}']`),
    merchant.fqn,
  );
  await accountLink.click();
  await expectAccountLinkNavigation(page, account);

  panel = await openUrlTransactionDetail(page, transaction.transaction_id);
  accountLink = panel.getByRole("link", {
    exact: true,
    name: account.fqn,
  });
  recordRow = accountLink.locator("xpath=ancestor::tr");
  await recordRow.focus();
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "true");
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await expectFocusedAccountPathExpanded(accountLink, account.fqn);
  await accountLink.press("Enter");
  await expectAccountLinkNavigation(page, account);

  panel = await openAccountTransactionPeek(page, merchant, memo);
  accountLink = panel.getByRole("link", {
    exact: true,
    name: account.fqn,
  });
  recordRow = accountLink.locator("xpath=ancestor::tr");
  await expect(accountLink).toHaveCount(1);
  await expect(recordRow.getByRole("link")).toHaveCount(1);
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await accountLink.click();
  await expectAccountLinkNavigation(page, account);

  panel = await openAccountTransactionPeek(page, merchant, memo);
  accountLink = panel.getByRole("link", {
    exact: true,
    name: account.fqn,
  });
  recordRow = accountLink.locator("xpath=ancestor::tr");
  await recordRow.focus();
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "true");
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await expectFocusedAccountPathExpanded(accountLink, account.fqn);
  await accountLink.press("Enter");
  await expectAccountLinkNavigation(page, account);
});

test("transaction detail panel is read-only while chips keep filtering", async ({
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
  const [initialTag, member] = await Promise.all([
    createTag(page, `E2E:DetailReadonly:${unique}:InitialTag`),
    createMember(page, `Detail editor ${unique}`),
  ]);
  const memo = `E2E detail read-only ${unique} with a complete wrapped memo`;
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
  await expect(
    panel.getByRole("button", { exact: true, name: "Edit transaction" }),
  ).toBeVisible();
  await expect(panel.locator("td[data-label][tabindex]")).toHaveCount(0);
  await expect(panel.locator("[data-inline-editor-id]")).toHaveCount(0);
  await expect(panel.locator("input, textarea, select")).toHaveCount(0);

  const accountCell = panel.locator("td[data-label='Account']").first();
  const amountChip = panel.getByTestId("amount-chip").first();
  const memoCell = panel.getByRole("cell", { name: memo }).first();
  for (const target of [accountCell, amountChip, memoCell]) {
    await target.hover();
    await expect(
      panel.getByRole("button", {
        name: /^(Edit row value|Edit memo|Edit Category|Edit Tags|Edit Member)$/,
      }),
    ).toHaveCount(0);
  }

  await accountCell.click();
  await page.keyboard.press("F2");
  await expect(panel.locator("[data-inline-editor-id]")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(panel.locator("[data-inline-editor-id]")).toHaveCount(0);
  await amountChip.click();
  await memoCell.click();
  await expect(panel.locator("[data-inline-editor-id]")).toHaveCount(0);
  await expect(memoCell.locator("span")).toHaveCSS("white-space", "pre-wrap");

  await panel
    .getByRole("button", { name: `Filter by ${initialCategory.fqn}` })
    .first()
    .click();
  await expectTransactionFilterUrl(page, {
    categories: [initialCategory.category_id],
    hideExpected: true,
  });
  await expect(
    page.getByRole("button", {
      name: `Remove Category ${initialCategory.name}`,
    }),
  ).toBeVisible();
  await expect(panel).toBeVisible();

  await panel
    .getByRole("button", { name: `Filter by ${initialTag.name}` })
    .first()
    .click();
  await expectTransactionFilterUrl(page, {
    categories: [initialCategory.category_id],
    hideExpected: true,
    tags: [initialTag.tag_id],
  });
  await expect(
    page.getByRole("button", { name: `Remove Tag ${initialTag.name}` }),
  ).toBeVisible();
  await expect(panel).toBeVisible();

  await panel
    .getByRole("button", { name: `Filter by ${member.name}` })
    .first()
    .click();
  await expectTransactionFilterUrl(page, {
    categories: [initialCategory.category_id],
    hideExpected: true,
    members: [member.member_id],
    tags: [initialTag.tag_id],
  });
  await expect(panel).toBeVisible();

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
  await clickRowAction(page, expectedRow, "Open transaction detail");
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
    expectedPanel.getByRole("button", { name: "Edit transaction" }),
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

test("detail lifecycle and dateless records cover variants in detail and peek", async ({
  page,
}, testInfo) => {
  test.slow();
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const [fundingAccount, splitMerchant] = await Promise.all([
    createAccount(
      page,
      `assets:E2E:Lifecycle:${unique}:Funding`,
      "balance",
      "USD",
    ),
    createAccount(page, `merchant:E2E:Lifecycle:${unique}`, "flow"),
  ]);
  const [firstTag, secondTag] = await Promise.all([
    createTag(page, `E2E:Lifecycle:${unique}:First`),
    createTag(page, `E2E:Lifecycle:${unique}:Second`),
  ]);

  const simpleMemo = `E2E lifecycle uniform ${unique}`;
  const simpleResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.25",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-11",
      memo: simpleMemo,
      tag_ids: [firstTag.tag_id, secondTag.tag_id],
    },
  });
  const simpleBody = await simpleResponse.text();
  expect(simpleResponse.ok(), simpleBody).toBe(true);
  const simple = JSON.parse(simpleBody) as TransactionDetailFixture;

  const mixedMemo = `E2E lifecycle mixed ${unique}`;
  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-12",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-30.00000000",
          category_id: category.category_id,
          currency: "USD",
          memo: mixedMemo,
          pending_date: "2026-07-12T16:00:00Z",
          posted_date: "2026-07-13T16:00:00Z",
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "10.00000000",
          category_id: category.category_id,
          currency: "USD",
          memo: mixedMemo,
          pending_date: "2026-07-12T16:00:00Z",
          posted_date: "2026-07-14T16:00:00Z",
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: splitMerchant.account_id,
          amount: "20.00000000",
          category_id: category.category_id,
          currency: "USD",
          memo: mixedMemo,
          pending_date: "2026-07-12T16:00:00Z",
          posted_date: null,
          posting_status: "pending",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  const mixedBody = await mixedResponse.text();
  expect(mixedResponse.ok(), mixedBody).toBe(true);
  const mixed = JSON.parse(mixedBody) as TransactionDetailFixture;

  const missingPostedDateMemo = `E2E lifecycle missing posted date ${unique}`;
  const missingPostedDateResponse = await page.request.post(
    "/api/transactions",
    {
      data: {
        initiated_date: "2026-07-18",
        records: [
          {
            account_id: fundingAccount.account_id,
            amount: "-7.00000000",
            category_id: category.category_id,
            currency: "USD",
            memo: missingPostedDateMemo,
            pending_date: "2026-07-18T16:00:00Z",
            posted_date: "2026-07-19T16:00:00Z",
            posting_status: "posted",
            reconciliation_status: "unreconciled",
            source: "manual",
            tag_ids: [],
          },
          {
            account_id: merchantAccount.account_id,
            amount: "7.00000000",
            category_id: category.category_id,
            currency: "USD",
            memo: missingPostedDateMemo,
            pending_date: "2026-07-18T16:00:00Z",
            posted_date: null,
            posting_status: "pending",
            reconciliation_status: "unreconciled",
            source: "manual",
            tag_ids: [],
          },
        ],
      },
    },
  );
  const missingPostedDateBody = await missingPostedDateResponse.text();
  expect(missingPostedDateResponse.ok(), missingPostedDateBody).toBe(true);
  const missingPostedDate = JSON.parse(
    missingPostedDateBody,
  ) as TransactionDetailFixture;
  const datelessRecord = missingPostedDate.records.find(
    (record) => record.posting_status === "pending",
  );
  if (datelessRecord?.record_id === undefined) {
    throw new Error("missing posted-date record id");
  }
  const postDatelessRecordResponse = await page.request.post(
    "/api/records/bulk/status",
    {
      data: {
        posting_status: "posted",
        record_ids: [datelessRecord.record_id],
      },
    },
  );
  const postDatelessRecordBody = await postDatelessRecordResponse.text();
  expect(postDatelessRecordResponse.ok(), postDatelessRecordBody).toBe(true);

  const cancelledMemo = `E2E lifecycle cancelled ${unique}`;
  const cancelledResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-16",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-9.00000000",
          category_id: category.category_id,
          currency: "USD",
          memo: cancelledMemo,
          pending_date: "2026-07-15T16:00:00Z",
          posted_date: "2026-07-16T16:00:00Z",
          posting_status: "cancelled",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "9.00000000",
          category_id: category.category_id,
          currency: "USD",
          memo: cancelledMemo,
          pending_date: "2026-07-15T16:00:00Z",
          posted_date: "2026-07-16T16:00:00Z",
          posting_status: "cancelled",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  const cancelledBody = await cancelledResponse.text();
  expect(cancelledResponse.ok(), cancelledBody).toBe(true);
  const cancelled = JSON.parse(cancelledBody) as TransactionDetailFixture;

  const expected = await createExpectedRecurringFixture(
    page,
    `${unique}Lifecycle`,
    { anchorDate: "2026-07-23" },
  );
  const lifecycleDateLabels = await page.evaluate(
    ({ cancelledFirstPosted, cancelledPending, firstPosted, secondPosted }) => {
      const dayLabel = (value: string) => {
        const date = new Date(value);
        return new Intl.DateTimeFormat(undefined, {
          day: "numeric",
          month: "short",
          year:
            date.getFullYear() === new Date().getFullYear()
              ? undefined
              : "numeric",
        }).format(date);
      };
      const exactDateLabel = (value: string) =>
        new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
        }).format(new Date(value));

      return {
        cancelledFirstPosted: dayLabel(cancelledFirstPosted),
        cancelledPending: dayLabel(cancelledPending),
        firstPosted: dayLabel(firstPosted),
        firstPostedExact: exactDateLabel(firstPosted),
        secondPosted: dayLabel(secondPosted),
        secondPostedExact: exactDateLabel(secondPosted),
      };
    },
    {
      cancelledFirstPosted: "2026-07-16T16:00:00Z",
      cancelledPending: "2026-07-15T16:00:00Z",
      firstPosted: "2026-07-13T16:00:00Z",
      secondPosted: "2026-07-14T16:00:00Z",
    },
  );

  const expectSimpleSurface = async (panel: Locator) => {
    await expectDatelessReadOnlyDetailGrid(panel, 2);
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect
      .poll(() =>
        panel.evaluate((panelElement) => {
          const strip = panelElement.querySelector(
            "[data-testid='transaction-lifecycle']",
          );
          return (
            strip?.parentElement === panelElement &&
            strip.previousElementSibling?.querySelector("h2") !== null
          );
        }),
      )
      .toBe(true);
    await expect(lifecycle).toContainText("Initiated");
    await expect(lifecycle).toContainText("Pending");
    await expect(lifecycle).toContainText("Posted");
    await expect(lifecycle).not.toContainText("varies");
    await expect(lifecycle.locator("[tabindex]")).toHaveCount(0);
    await expect(lifecycle.getByText("Initiated", { exact: true })).toHaveCSS(
      "font-size",
      "12px",
    );
    await expect(panel.locator("[aria-label^='Dates differ:']")).toHaveCount(0);
    await expect(
      panel.getByText(firstTag.name, { exact: true }).first(),
    ).toBeVisible();
    await expect(
      panel.getByText(secondTag.name, { exact: true }).first(),
    ).toBeVisible();
  };

  const expectMixedSurface = async (panel: Locator) => {
    await expectDatelessReadOnlyDetailGrid(panel, 3);
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    const postedStage = lifecycle
      .getByRole("listitem")
      .filter({ hasText: "Posted" });
    await expect(postedStage).toContainText(
      `${lifecycleDateLabels.firstPosted}–${lifecycleDateLabels.secondPosted}`,
    );
    await expect(postedStage).toContainText("varies");
    await expect(postedStage).toContainText("2 of 3");
    await expect
      .poll(() =>
        postedStage
          .locator("[data-lifecycle-qualifier='posted']")
          .evaluate((qualifier) => {
            const qualifierBounds = qualifier.getBoundingClientRect();
            const stageBounds = qualifier
              .closest("li")
              ?.getBoundingClientRect();
            return (
              stageBounds !== undefined &&
              qualifierBounds.left >= stageBounds.left &&
              qualifierBounds.right <= stageBounds.right
            );
          }),
      )
      .toBe(true);
    await expect(panel.locator("[aria-label^='Dates differ:']")).toHaveCount(3);
    await expect(
      panel.locator("td[data-label='Status']").filter({ hasText: "→" }),
    ).toHaveCount(3);
    const statusContent = panel.locator(
      "[data-record-status-content]:has([aria-label^='Dates differ:'])",
    );
    await expect(statusContent).toHaveCount(3);
    await expect
      .poll(() =>
        statusContent.evaluateAll((elements) =>
          Math.max(
            ...elements.map(
              (element) => element.getBoundingClientRect().height,
            ),
          ),
        ),
      )
      .toBeLessThanOrEqual(26);
    await postedStage.locator("[data-slot='tooltip-trigger']").hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toContainText(lifecycleDateLabels.firstPostedExact);
    await expect(tooltip).toContainText(lifecycleDateLabels.secondPostedExact);
    await expect(tooltip).toContainText(/\d{1,2}:\d{2}:\d{2}/);
  };

  const expectLifecycleContentFits = async (panel: Locator) => {
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect
      .poll(() =>
        lifecycle.evaluate((strip) =>
          Array.from(
            strip.querySelectorAll<HTMLElement>(
              "[data-lifecycle-stage-content]",
            ),
          ).every(
            (stage) =>
              stage.scrollWidth <= stage.clientWidth + 1 &&
              stage.scrollHeight <= stage.clientHeight + 1,
          ),
        ),
      )
      .toBe(true);
  };

  const expectExpectedSurface = async (panel: Locator) => {
    await expectDatelessReadOnlyDetailGrid(panel, 2);
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    const expectedStage = lifecycle
      .getByRole("listitem")
      .filter({ hasText: "Expected" });
    await expect(expectedStage).toContainText("Jul 23");
    await expect(
      lifecycle.getByRole("listitem").filter({ hasText: "Pending" }),
    ).toContainText("—");
    await expect(
      lifecycle.getByRole("listitem").filter({ hasText: "Posted" }),
    ).toContainText("—");
    await expect(panel.locator("[aria-label^='Dates differ:']")).toHaveCount(0);
  };

  const expectMissingPostedDateSurface = async (panel: Locator) => {
    await expectDatelessReadOnlyDetailGrid(panel, 2);
    const postedStage = panel
      .getByTestId("transaction-lifecycle")
      .getByRole("listitem")
      .filter({ hasText: "Posted" });
    await expect(postedStage).toContainText("varies");
    await expect(postedStage).not.toContainText("of 2");
    await expect(panel.locator("[aria-label^='Dates differ:']")).toHaveCount(1);
  };

  const expectCancelledSurface = async (panel: Locator) => {
    await expectDatelessReadOnlyDetailGrid(panel, 2);
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect(
      lifecycle.getByRole("listitem").filter({ hasText: "Pending" }),
    ).toContainText(lifecycleDateLabels.cancelledPending);
    const postedStage = lifecycle
      .getByRole("listitem")
      .filter({ hasText: "Posted" });
    await expect(postedStage).toContainText(
      lifecycleDateLabels.cancelledFirstPosted,
    );
    await expect(postedStage).not.toContainText("varies");
    const cancelledRows = panel
      .locator("tr[data-detail-record-row='true']")
      .filter({ hasText: "Cancelled" });
    await expect(cancelledRows).toHaveCount(2);
    await expect(cancelledRows.first()).toHaveCSS(
      "text-decoration-line",
      "line-through",
    );
    await expect(panel.locator("[aria-label^='Dates differ:']")).toHaveCount(0);
    await expect(
      panel.locator("[aria-label^='Cancelled lifecycle:']"),
    ).toHaveCount(2);
  };

  await page.setViewportSize({ width: 1600, height: 900 });
  const simpleDetail = await openUrlTransactionDetail(
    page,
    simple.transaction_id,
  );
  await expectSimpleSurface(simpleDetail);
  await expectMouseDisclosure(simpleDetail, simpleMemo);

  const mixedDetail = await openUrlTransactionDetail(
    page,
    mixed.transaction_id,
  );
  await expectMixedSurface(mixedDetail);
  await expectLifecycleContentFits(mixedDetail);
  await page.setViewportSize({ width: 390, height: 900 });
  await expectLifecycleContentFits(mixedDetail);
  await page.setViewportSize({ width: 1600, height: 900 });
  await expectKeyboardDisclosure(mixedDetail, mixedMemo);

  const missingPostedDateDetail = await openUrlTransactionDetail(
    page,
    missingPostedDate.transaction_id,
  );
  await expectMissingPostedDateSurface(missingPostedDateDetail);

  const expectedDetail = await openUrlTransactionDetail(
    page,
    expected.transactionId,
  );
  await expectExpectedSurface(expectedDetail);
  await expect(
    expectedDetail.getByRole("button", { name: "Edit transaction" }),
  ).toHaveCount(0);
  await expect(
    expectedDetail.getByRole("button", { name: "Confirm occurrence" }),
  ).toBeVisible();
  await expect(
    expectedDetail.getByRole("button", { name: "Dismiss occurrence" }),
  ).toBeVisible();

  const cancelledDetail = await openUrlTransactionDetail(
    page,
    cancelled.transaction_id,
  );
  await expectCancelledSurface(cancelledDetail);

  await page.setViewportSize({ width: 720, height: 900 });
  const simplePeek = await openAccountTransactionPeek(
    page,
    fundingAccount,
    simpleMemo,
  );
  await expectSimpleSurface(simplePeek);
  await expectMouseDisclosure(simplePeek, simpleMemo);

  const mixedPeek = await openAccountTransactionPeek(
    page,
    fundingAccount,
    mixedMemo,
  );
  await expectMixedSurface(mixedPeek);
  await expectKeyboardDisclosure(mixedPeek, mixedMemo);

  const expectedPeek = await openAccountTransactionPeek(
    page,
    expected.checking,
    expected.memo,
  );
  await expectExpectedSurface(expectedPeek);

  const cancelledPeek = await openAccountTransactionPeek(
    page,
    fundingAccount,
    cancelledMemo,
  );
  await expectCancelledSurface(cancelledPeek);
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

  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
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

  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
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
  await expect(detailRow).toHaveAttribute("aria-expanded", "true");
  await expect(detailRow).toHaveAttribute(
    "aria-controls",
    `transaction-records-${transaction.transaction_id}`,
  );
  await expect(page.getByTestId("bulk-action-bar")).toHaveCount(0);

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await detailRow.focus();
  await page.keyboard.press("Space");
  await expect(detailRow).not.toHaveAttribute("aria-expanded", /.+/);
  await expect(detailRow).not.toHaveAttribute("aria-controls", /.+/);
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("1 selected");
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
  await clickRowAction(page, detailRow, "Open transaction detail");

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
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );

  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();
  await detailPanel
    .getByRole("button", { exact: true, name: "Edit transaction" })
    .click();

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(detailPanel).toBeVisible();
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
  await expect(entryPanel).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction updated." }),
  ).toBeVisible();
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel.getByText(updatedMemo).first()).toBeVisible();
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
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit transaction" })
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
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit transaction" })
    .click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
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

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=50");
  await ledgerLookups;
  await expect(page.getByText("Description")).toBeVisible();
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );

  const detailPanel = page.getByTestId("transaction-detail-panel");
  const detailHeader = detailPanel.locator(":scope > div").first();
  const detailFooter = detailPanel.locator(":scope > div").nth(2);
  await expect(
    detailHeader.getByRole("button", {
      exact: true,
      name: "Edit transaction",
    }),
  ).toBeVisible();
  await expect(
    detailFooter.getByRole("button", { name: "Duplicate" }),
  ).toBeVisible();
  await expect(
    detailFooter.getByRole("button", { name: "Split" }),
  ).toBeVisible();
  await expect(
    detailFooter.getByRole("button", { name: "Delete" }),
  ).toBeVisible();
  await expect(
    detailFooter.getByRole("button", { name: "Edit transaction" }),
  ).toHaveCount(0);

  const duplicateButton = detailPanel.getByRole("button", {
    name: "Duplicate",
  });
  await duplicateButton.click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(detailPanel).toBeVisible();
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(spendPanel.getByLabel("Amount")).toHaveValue("16.45");
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(memo);
  await spendPanel.getByLabel("Memo").fill(duplicateMemo);
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({
      tabs: {
        spend: {
          memo: duplicateMemo,
        },
      },
    });
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(entryPanel).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]entry=/);
  await expect(duplicateButton).toBeFocused();
  await page
    .locator("aside")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(duplicateMemo);

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
  await expect(entryPanel.getByText("Entries this session: 1")).toBeVisible();
  await expect(
    page.locator("[data-transaction-row]").filter({ hasText: duplicateMemo }),
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
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await detailPanel.getByRole("button", { name: "Split" }).click();

  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await expect(detailPanel).toBeVisible();
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
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel.getByText(splitMemo).first()).toBeVisible();
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

  const row = page.locator("[data-transaction-row='true']").filter({
    hasText: memo,
  });
  const transactionRows = page.locator("[data-transaction-row='true']");
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  const deletedRowIndex = await row.evaluate((element) =>
    Array.from(
      element.parentElement?.querySelectorAll(
        "tr[data-transaction-row='true']",
      ) ?? [],
    ).indexOf(element),
  );
  const rowCountBeforeDelete = await transactionRows.count();

  await clickRowAction(page, row, "Open transaction detail");
  await expect(
    page.getByRole("dialog", { name: transaction.display_title }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(row).toHaveAttribute("aria-expanded", "false");

  await clickRowAction(page, row, "Delete transaction");
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
  await expect
    .poll(() =>
      row.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ??
          document.activeElement?.textContent?.trim(),
      ),
    )
    .toMatch(/^(Delete transaction|More row actions)$/);

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

  await clickRowAction(page, row, "Delete transaction");
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

test("inline editors hide hidden controls and results while broader pickers retain the control", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const hiddenTagFqn = `E2E:Hidden:${unique}:QuietTag`;
  const hiddenCategoryFqn = `E2E:Hidden:${unique}:QuietCategory`;
  const [hiddenTag, hiddenCategory] = await Promise.all([
    createTag(page, hiddenTagFqn),
    createCategory(page, hiddenCategoryFqn, "expense"),
  ]);

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
  const transaction = (await spendResponse.json()) as TransactionDetailFixture;
  await Promise.all([
    hideTag(page, hiddenTag),
    hideCategory(page, hiddenCategory),
  ]);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const hiddenTagRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(hiddenTagRow).toBeVisible();
  await expect(
    hiddenTagRow.locator("td").nth(5).getByText("QuietTag", { exact: true }),
  ).toBeVisible();

  const rowPrefix = `transaction-${transaction.transaction_id}`;
  const categoryCell = hiddenTagRow.getByTestId(`${rowPrefix}-category-cell`);
  await categoryCell.hover();
  await categoryCell.getByRole("button", { name: "Edit Category" }).click();
  const categoryEditor = hiddenTagRow.getByTestId(
    `${rowPrefix}-category-editor`,
  );
  await expect(
    categoryEditor.getByText("Include hidden", { exact: true }),
  ).toHaveCount(0);
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(hiddenCategoryFqn);
  await expect(categoryEditor.getByRole("listbox")).toContainText("No matches");
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .press("Escape");
  await categoryEditor
    .getByRole("button", { name: "Cancel category edit" })
    .click();

  const tagsCell = hiddenTagRow.getByTestId(`${rowPrefix}-tags-cell`);
  await tagsCell.hover();
  await tagsCell.getByRole("button", { name: "Edit Tags" }).click();
  const tagsEditor = hiddenTagRow.getByTestId(`${rowPrefix}-tags-editor`);
  await expect(
    tagsEditor.getByText("Include hidden", { exact: true }),
  ).toHaveCount(0);
  await tagsEditor.getByRole("combobox", { name: "Tags" }).press("Escape");
  await tagsEditor.getByRole("button", { name: "Cancel tags edit" }).click();

  const memberCell = hiddenTagRow.getByTestId(`${rowPrefix}-member-cell`);
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  const memberEditor = hiddenTagRow.getByTestId(`${rowPrefix}-member-editor`);
  await expect(
    memberEditor.getByText("Include hidden", { exact: true }),
  ).toHaveCount(0);
  await memberEditor.getByRole("combobox", { name: "Member" }).press("Escape");
  await memberEditor
    .getByRole("button", { name: "Cancel member edit" })
    .click();

  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  const filterTagsPicker = page.getByRole("combobox", { name: "Tags" });
  await filterTagsPicker.fill(hiddenTagFqn);
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    "No matches",
  );
  const includeHiddenToggle = page.getByText("Include hidden", {
    exact: true,
  });
  await expect(includeHiddenToggle).toBeVisible();
  await includeHiddenToggle.click();
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    "QuietTag",
  );
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Close filters" }).click();

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
    page
      .locator("#spend-category-options")
      .getByRole("option")
      .filter({ hasText: visibleCategory.name })
      .first(),
  ).toBeVisible();

  await categoryPicker.fill("Salary");
  await expect(page.locator("#spend-category-options")).toContainText(
    "Create “Salary”",
  );

  await categoryPicker.fill(hiddenCategory.name);
  await expect(
    page.locator(`#spend-category-option-${hiddenCategory.category_id}`),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", {
      name: `Create ${hiddenCategory.name}`,
    }),
  ).toBeVisible();
});

test("member pickers keep colon-containing names flat", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const member = await createMember(page, `Household:${slug}${Date.now()}`);

  await page.goto("/transactions?page=1&pageSize=25");
  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Member" }).click();

  const memberPicker = page.getByRole("combobox", { name: "Members" });
  const memberOptions = page.locator("#transactions-filter-member-options");
  await memberPicker.fill("Household:");
  await expect(memberOptions).toHaveAttribute("data-picker-mode", "search");
  await expect(
    page.getByTestId("transactions-filter-member-breadcrumb"),
  ).toHaveCount(0);
  await expect(
    memberOptions.getByRole("option", { name: member.name }),
  ).toBeVisible();

  await memberPicker.fill(member.name);
  await expect(page.getByTestId("entity-multi-picker-selected")).toContainText(
    member.name,
  );
  await expect(memberPicker).toHaveValue("");
});

test("bulk mode updates uniform fields and skips mixed rows", async ({
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
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const [targetCategory, initialMember, targetMember] = await Promise.all([
    createCategory(page, `E2E:Bulk:${unique}:Category`, "expense"),
    createMember(page, `Initial bulk member ${unique}`),
    createMember(page, `Target bulk member ${unique}`),
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
          member_id: initialMember.member_id,
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
  const mixed = (await mixedResponse.json()) as TransactionDetailFixture;
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
  await expect(page.getByTestId("bulk-action-bar")).toHaveCount(0);

  await page.getByRole("button", { name: "Bulk edit" }).click();
  const modeBar = page.getByTestId("transaction-browser-bulk-mode-bar");
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  await expect(modeBar).toBeVisible();
  await expect(modeBar).toContainText("0 selected");
  await expect(expectedRow.getByRole("checkbox")).toHaveCount(0);
  await expect(expectedRow).toHaveAttribute("aria-disabled", "true");
  await uniformRow.click();
  await expect(modeBar).toContainText("1 selected");
  await mixedRow.click();
  await expect(modeBar).toContainText("2 selected");
  await expect(uniformRow).toHaveAttribute("aria-selected", "true");
  await expect(mixedRow).toHaveAttribute("aria-selected", "true");

  await bulkActionBar.getByRole("button", { name: "Categorize" }).click();
  const categoryPicker = page.getByTestId("bulk-action-picker");
  await expect(categoryPicker).toContainText("1 mixed row will be skipped");
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .fill(targetCategory.fqn);
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .press("Enter");
  let releaseRefresh: (() => void) | undefined;
  let markRefreshStarted: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    markRefreshStarted = resolve;
  });
  let transactionReadbackCount = 0;
  const holdRefresh = async (route: Route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === "GET" &&
      url.pathname === `/api/transactions/${uniform.transaction_id}`
    ) {
      transactionReadbackCount += 1;
    }
    if (
      route.request().method() !== "GET" ||
      url.pathname !== "/api/transactions"
    ) {
      await route.continue();
      return;
    }
    markRefreshStarted?.();
    await new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    await route.continue();
  };
  await page.route("**/api/transactions**", holdRefresh);
  await categoryPicker.getByRole("button", { name: "Apply category" }).click();
  await refreshStarted;
  expect(transactionReadbackCount).toBe(0);
  await expect(categoryPicker).toBeVisible();
  await expect(
    categoryPicker.getByRole("combobox", { name: "Category" }),
  ).toHaveValue(targetCategory.fqn);
  await expect(
    categoryPicker.getByRole("button", { name: "Cancel" }),
  ).toBeDisabled();
  releaseRefresh?.();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "1 updated, 1 skipped: mixed records." }),
  ).toBeVisible();
  await page.unroute("**/api/transactions**", holdRefresh);
  await expect(uniformRow).toContainText(targetCategory.name);
  await expect(mixedRow).toContainText("Mixed");
  await expect(modeBar).toContainText("2 selected");

  await bulkActionBar.getByRole("button", { name: "Member" }).click();
  const memberPicker = page.getByTestId("bulk-action-picker");
  await memberPicker
    .getByRole("combobox", { name: "Member" })
    .fill(targetMember.name);
  await memberPicker.getByRole("combobox", { name: "Member" }).press("Enter");
  await memberPicker.getByRole("button", { name: "Set member" }).click();
  await expect(memberPicker).toHaveCount(0);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "1 updated, 1 skipped: mixed records." }),
  ).toBeVisible();

  const [partialMemberResponse, updatedMemberResponse] = await Promise.all([
    page.request.get(`/api/transactions/${uniform.transaction_id}`),
    page.request.get(`/api/transactions/${mixed.transaction_id}`),
  ]);
  expect(partialMemberResponse.ok(), await partialMemberResponse.text()).toBe(
    true,
  );
  expect(updatedMemberResponse.ok(), await updatedMemberResponse.text()).toBe(
    true,
  );
  const partialMemberTransaction =
    (await partialMemberResponse.json()) as TransactionDetailFixture;
  const updatedMemberTransaction =
    (await updatedMemberResponse.json()) as TransactionDetailFixture;
  expect(
    partialMemberTransaction.records.map((record) => record.member_id ?? null),
  ).toEqual([initialMember.member_id, null]);
  expect(
    updatedMemberTransaction.records.map((record) => record.member_id ?? null),
  ).toEqual([targetMember.member_id, targetMember.member_id]);

  const tagButton = bulkActionBar.getByRole("button", { name: "Tag" });
  await tagButton.click();
  const tagCombobox = page
    .getByTestId("bulk-action-picker")
    .getByRole("combobox", { name: "Tags to add" });
  await expect(tagCombobox).toHaveAttribute("aria-expanded", "true");
  await tagCombobox.press("Escape");
  await tagCombobox.press("Escape");
  await expect(tagButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modeBar).toContainText("0 selected");
  await expect(mixedRow).toBeFocused();
  await modeBar.getByRole("button", { name: "Select page" }).click();
  await bulkActionBar.getByRole("button", { name: "Tag" }).click();
  const pageTagCombobox = page
    .getByTestId("bulk-action-picker")
    .getByRole("combobox", { name: "Tags to add" });
  await expect(pageTagCombobox).toHaveAttribute("aria-expanded", "true");
  await pageTagCombobox.press("Escape");
  await pageTagCombobox.press("Escape");
  await expect(tagButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modeBar).toContainText("0 selected");
  await expect(modeBar.getByRole("button", { name: "Done" })).toBeFocused();
  await uniformRow.click();
  await mixedRow.click();
  await expect(modeBar).toContainText("2 selected");

  const rowCategoryCell = uniformRow.getByTestId(
    `transaction-${uniform.transaction_id}-category-bulk-cell`,
  );
  await rowCategoryCell.hover();
  await uniformRow.getByRole("button", { name: "Bulk edit category" }).click();
  const rowCategoryPicker = page.getByTestId(
    `transaction-${uniform.transaction_id}-category-bulk-editor`,
  );
  const rowCategoryCombobox = rowCategoryPicker.getByRole("combobox", {
    name: "Category",
  });
  await expect(rowCategoryCombobox).toHaveAttribute("aria-expanded", "true");
  await rowCategoryCombobox.press("Escape");
  await expect(rowCategoryCombobox).toHaveAttribute("aria-expanded", "false");
  await expect(rowCategoryPicker).toBeVisible();
  await rowCategoryCombobox.press("Escape");
  await expect(rowCategoryPicker).toHaveCount(0);
  await expect(rowCategoryCell).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(modeBar).toContainText("1 selected");
  await expect(uniformRow).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modeBar).toContainText("0 selected");
  await expect(uniformRow).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modeBar).toHaveCount(0);
  await expect(bulkActionBar).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bulk edit" })).toBeFocused();
  await expect(uniformRow.getByRole("checkbox")).toHaveCount(0);
});

test("bulk selection keeps mutation targets after an edit changes the active filter", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const [targetCategory, tag] = await Promise.all([
    createCategory(page, `E2E:BulkFilter:${unique}:Category`, "expense"),
    createTag(page, `E2E:BulkFilter:${unique}:Tag`),
  ]);
  const selectedMemo = `E2E bulk filter ${unique} selected`;
  const guardMemo = `E2E bulk filter ${unique} guard`;
  const createSpend = async (memo: string, amount: string) => {
    const response = await page.request.post("/api/transactions/spend", {
      data: {
        amount,
        category_id: initialCategory.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-07-12",
        memo,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as TransactionDetailFixture;
  };
  const [selectedTransaction] = await Promise.all([
    createSpend(selectedMemo, "13.00"),
    createSpend(guardMemo, "17.00"),
  ]);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(`E2E bulk filter ${unique}`)}&category=${initialCategory.category_id}`,
  );
  const selectedRow = page
    .getByRole("row")
    .filter({ hasText: selectedMemo })
    .first();
  const guardRow = page.getByRole("row").filter({ hasText: guardMemo }).first();
  await expect(selectedRow).toBeVisible();
  await expect(guardRow).toBeVisible();

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await selectedRow.click();
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  await selectedRow
    .getByTestId(
      `transaction-${selectedTransaction.transaction_id}-category-bulk-cell`,
    )
    .hover();
  await selectedRow.getByRole("button", { name: "Bulk edit category" }).click();
  const categoryPicker = page.getByTestId(
    `transaction-${selectedTransaction.transaction_id}-category-bulk-editor`,
  );
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .fill(targetCategory.fqn);
  await categoryPicker
    .getByRole("combobox", { name: "Category" })
    .press("Enter");
  await categoryPicker.getByRole("button", { name: "Apply category" }).click();

  await expect(selectedRow).toHaveCount(0);
  await expect(guardRow).toBeVisible();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("1 selected");
  await expect(
    bulkActionBar.getByRole("button", { name: "Categorize" }),
  ).toBeFocused();
  await bulkActionBar.getByRole("button", { name: "Tag" }).click();
  const tagPicker = page.getByTestId("bulk-action-picker");
  await tagPicker.getByRole("combobox", { name: "Tags to add" }).fill(tag.fqn);
  await tagPicker.getByRole("combobox", { name: "Tags to add" }).press("Enter");
  await tagPicker.getByRole("button", { name: "Add tags" }).click();

  await expect(tagPicker).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "1 updated, 0 skipped." }),
  ).toBeVisible();
  const updatedResponse = await page.request.get(
    `/api/transactions/${selectedTransaction.transaction_id}`,
  );
  expect(updatedResponse.ok(), await updatedResponse.text()).toBe(true);
  const updated = (await updatedResponse.json()) as TransactionDetailFixture;
  expect(
    updated.records.every((record) => record.tag_ids.includes(tag.tag_id)),
  ).toBe(true);
});

test("browser history navigation exits bulk mode before restoring transaction detail", async ({
  page,
}) => {
  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  const row = page
    .locator("tbody tr[data-transaction-id]")
    .filter({
      hasNot: page.getByRole("img", { name: "Expected" }),
    })
    .first();
  await clickRowAction(page, row, "Open transaction detail");
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();
  const detailUrl = page.url();

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await expect(detailPanel).toHaveCount(0);
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  await expect(bulkActionBar).toBeVisible();
  await page
    .locator("tbody tr[data-transaction-id]:not([aria-disabled='true'])")
    .first()
    .click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("1 selected");

  await page.goBack();
  await expect(bulkActionBar).toHaveCount(0);
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toHaveCount(0);
  for (let attempt = 0; attempt < 5 && page.url() !== detailUrl; attempt += 1) {
    await page.goBack();
  }
  await expect(page).toHaveURL(detailUrl);
  await expect(detailPanel).toBeVisible();
  await expect(
    detailPanel.getByRole("button", {
      name: "Edit transaction",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("button", { name: "Delete", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("tbody tr").first().getByRole("checkbox"),
  ).toHaveCount(0);
});

test("active Transactions navigation exits bulk mode", async ({ page }) => {
  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  await page
    .locator("tbody tr[data-transaction-id]:not([aria-disabled='true'])")
    .first()
    .click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("1 selected");

  await page.getByRole("link", { name: "Transactions" }).click();

  await expect(bulkActionBar).toHaveCount(0);
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toHaveCount(0);
  await expect(
    page.locator("tbody tr").first().getByRole("checkbox"),
  ).toHaveCount(0);
});

test("narrow row bulk shortcuts use the visible bulk bar editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  const row = page
    .locator("tbody tr[data-transaction-id]:not([aria-disabled='true'])")
    .first();
  const transactionId = await row.getAttribute("data-transaction-id");
  expect(transactionId).not.toBeNull();
  await row.click();
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  const bulkActionBarBounds = await bulkActionBar.boundingBox();
  expect(bulkActionBarBounds).not.toBeNull();
  expect(bulkActionBarBounds!.x).toBeGreaterThanOrEqual(0);
  expect(
    bulkActionBarBounds!.x + bulkActionBarBounds!.width,
  ).toBeLessThanOrEqual(390);

  const shortcuts = [
    {
      action: "category",
      barButton: "Categorize",
      combobox: "Category",
      key: "c",
    },
    {
      action: "tags",
      barButton: "Tag",
      combobox: "Tags to add",
      key: "t",
    },
    {
      action: "member",
      barButton: "Member",
      combobox: "Member",
      key: "m",
    },
  ] as const;
  for (const shortcut of shortcuts) {
    await row.focus();
    await page.keyboard.press(shortcut.key);
    const picker = bulkActionBar.getByTestId("bulk-action-picker");
    await expect(picker).toBeVisible();
    await expect(
      picker.getByRole("combobox", { name: shortcut.combobox }),
    ).toBeFocused();
    await expect(
      page.getByTestId(
        `transaction-${transactionId}-${shortcut.action}-bulk-editor`,
      ),
    ).toHaveCount(0);
    await picker
      .getByRole("button", { name: "Close bulk action picker" })
      .click();
    await expect(picker).toHaveCount(0);
    await expect(
      bulkActionBar.getByRole("button", { name: shortcut.barButton }),
    ).toBeFocused();
  }
});

test("bulk action surface remains visible for an empty transaction result", async ({
  page,
}, testInfo) => {
  const missing = `no-bulk-results-${testInfo.project.name}-${Date.now()}`;
  await page.goto(`/transactions?q=${encodeURIComponent(missing)}`);
  await expect(
    page.getByRole("heading", { name: "No transactions" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("0 selected");
  await expect(page.getByTestId("bulk-action-bar")).not.toContainText(
    "selected",
  );
  await expect(page.getByRole("button", { name: "Select page" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Clear" })).toHaveCount(0);
  await expect(
    page
      .getByTestId("transaction-browser-bulk-mode-bar")
      .getByRole("button", { name: "Done" }),
  ).toBeFocused();
  const bulkActionBar = page.getByTestId("bulk-action-bar");
  const categorizeRemedy = bulkActionBar
    .getByRole("button", { name: "Categorize" })
    .locator("..");
  const tagRemedy = bulkActionBar
    .getByRole("button", { name: "Tag" })
    .locator("..");
  const memberRemedy = bulkActionBar
    .getByRole("button", { name: "Member" })
    .locator("..");
  await expect(categorizeRemedy).toHaveAttribute("tabindex", "0");
  await expect(tagRemedy).toHaveAttribute("tabindex", "0");
  await expect(memberRemedy).toHaveAttribute("tabindex", "0");
  await categorizeRemedy.focus();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Select transactions first",
  );
});

test("bulk mode removes the empty actions column at wide widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  await page.goto("/transactions?page=1&pageSize=50");
  const table = page.locator("table.transactions-table");
  await expect(table).toBeVisible();

  await page.getByRole("button", { name: "Bulk edit" }).click();

  await expect(table.locator("col.transactions-actions-column")).toBeHidden();
  await expect(
    table.locator("thead .transactions-actions-column"),
  ).toBeHidden();
  await expect(
    table.locator("tbody .transactions-actions-column").first(),
  ).toBeHidden();
});

test("bulk mode leaves amount chip shadows unclipped", async ({ page }) => {
  await page.goto("/transactions?page=1&pageSize=50");
  const row = page.locator("tbody tr[data-transaction-id]").first();
  const amountContainer = row.locator("td.transactions-amount-column > div");
  await expect(amountContainer).toBeVisible();

  await page.getByRole("button", { name: "Bulk edit" }).click();

  await expect(amountContainer).toHaveCSS("overflow", "visible");
});

test("bulk action surface remains visible during initial loading and errors", async ({
  page,
}) => {
  let releaseTransactions: (() => void) | undefined;
  const transactionRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/transactions**", async (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().method() !== "GET" ||
        url.pathname !== "/api/transactions"
      ) {
        await route.continue();
        return;
      }
      resolve();
      await new Promise<void>((release) => {
        releaseTransactions = release;
      });
      await route.fulfill({
        contentType: "application/json",
        json: { message: "Transaction loading failed" },
        status: 500,
      });
    });
  });

  await page.goto("/transactions?page=1&pageSize=50");
  await transactionRequestStarted;
  await expect(page.locator("[data-slot='skeleton']").first()).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("0 selected");

  releaseTransactions?.();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Transactions could not be loaded" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("0 selected");
});

test("bulk selection clears when a filtered snapshot replaces retained rows", async ({
  page,
}, testInfo) => {
  await page.goto("/transactions?page=1&pageSize=50");
  const retainedRow = page
    .locator("tbody tr[data-transaction-id]:not([aria-disabled='true'])")
    .first();
  await expect(retainedRow).toBeVisible();

  const missing = `no-filter-results-${testInfo.project.name}-${Date.now()}`;
  let releaseFilteredResponse: (() => void) | undefined;
  const filteredRequestStarted = new Promise<void>((resolve) => {
    void page.route("**/api/transactions**", async (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().method() !== "GET" ||
        url.pathname !== "/api/transactions" ||
        url.searchParams.get("search") !== missing
      ) {
        await route.continue();
        return;
      }

      resolve();
      await new Promise<void>((release) => {
        releaseFilteredResponse = release;
      });
      await route.fulfill({
        contentType: "application/json",
        json: { offset: 0, total_count: 0, transactions: [] },
      });
    });
  });

  await page.getByRole("searchbox", { name: "Search" }).fill(missing);
  await filteredRequestStarted;

  try {
    await page.getByRole("button", { name: "Bulk edit" }).click();
    await retainedRow.click();
    await expect(
      page.getByTestId("transaction-browser-bulk-mode-bar"),
    ).toContainText("1 selected");
  } finally {
    releaseFilteredResponse?.();
  }

  await expect(
    page.getByRole("heading", { name: "No transactions" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("0 selected");
});

test("switching bulk edit mode preserves the transaction list scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/transactions?page=1&pageSize=50");
  const tableScroll = page.getByTestId("transactions-table-scroll");
  await expect(tableScroll).toBeVisible();
  await tableScroll.evaluate((element) => {
    element.scrollTop = Math.min(
      160,
      element.scrollHeight - element.clientHeight,
    );
  });
  const initialScrollTop = await tableScroll.evaluate(
    (element) => element.scrollTop,
  );
  expect(initialScrollTop).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await expect(tableScroll).toBeVisible();
  expect(await tableScroll.evaluate((element) => element.scrollTop)).toBe(
    initialScrollTop,
  );

  await page
    .getByTestId("transaction-browser-bulk-mode-bar")
    .getByRole("button", { name: "Done" })
    .click();
  expect(await tableScroll.evaluate((element) => element.scrollTop)).toBe(
    initialScrollTop,
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

test("entry category picker completes hierarchy segments and preserves full-path escape hatches", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const base = `E2ESegment:${unique}`;
  const diningFqn = `${base}:Food:Dining`;
  const pantryFqn = `${base}:Food:Pantry`;
  const fallbackFqn = `${base}:Food:Supermarket:Groceries`;
  await Promise.all([
    createCategory(page, diningFqn, "expense"),
    createCategory(page, pantryFqn, "expense"),
    createCategory(page, fallbackFqn, "expense"),
    createCategory(page, `${base}:Travel:Flights`, "expense"),
  ]);

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const categoryPicker = page.getByRole("combobox", { name: "Category" });
  await page.getByRole("combobox", { name: "Funding account" }).focus();
  await categoryPicker.focus();
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "true");
  await expect(categoryPicker).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(categoryPicker).not.toBeFocused();
  await expect(categoryPicker).toHaveValue("");

  await categoryPicker.fill(`${base}:`);
  const categoryOptions = page.locator("#spend-category-options");
  await expect(categoryOptions).toHaveAttribute("data-picker-mode", "level");
  await expect(page.locator("#spend-category-announcement")).toHaveText(
    `Browsing under ${base}`,
  );
  await expect(categoryPicker).toHaveAttribute(
    "aria-activedescendant",
    /spend-category-option-group-/,
  );
  await expect(
    categoryOptions.getByRole("option", {
      name: "Food, group, 3 children",
    }),
  ).toBeVisible();

  await categoryPicker.press("Enter");
  await expect(categoryPicker).toHaveValue(`${base}:Food:`);
  await expect(page.getByTestId("spend-category-breadcrumb")).toContainText(
    "Food",
  );
  await expect(page.locator("#spend-category-context")).toHaveText(
    `Browsing under ${base}:Food`,
  );

  const currentCrumb = page.getByRole("button", {
    name: `Browse ${base}:Food`,
  });
  await currentCrumb.focus();
  await currentCrumb.press("Tab");
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "false");
  await expect(categoryPicker).not.toBeFocused();
  await categoryPicker.focus();

  const rootCrumb = page.getByRole("button", { name: "Browse from root" });
  await rootCrumb.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Browse from root" }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await rootCrumb.focus();
  await rootCrumb.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toBeVisible();
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "false");
  await expect(categoryPicker).toBeFocused();
  await categoryPicker.press("ArrowDown");
  await rootCrumb.focus();
  await rootCrumb.press("Enter");
  await expect(categoryPicker).toHaveValue("");
  await expect(categoryPicker).toBeFocused();
  await categoryPicker.fill(`${base}:`);
  await categoryPicker.press("Enter");
  await expect(categoryPicker).toHaveValue(`${base}:Food:`);

  await categoryPicker.press("ArrowLeft");
  await expect(categoryPicker).toHaveValue(`${base}:`);
  await categoryPicker.press("ArrowRight");
  await expect(categoryPicker).toHaveValue(`${base}:Food:`);
  await categoryPicker.press("ArrowLeft");
  await expect(categoryPicker).toHaveValue(`${base}:`);
  await categoryPicker.press("Backspace");
  await expect(categoryPicker).toHaveValue(base);
  await categoryPicker.pressSequentially(":");
  await expect(categoryPicker).toHaveValue(`${base}:`);

  await categoryPicker.fill(`${base}:Food:market:Gro`);
  await expect(categoryOptions).toHaveAttribute("data-picker-mode", "search");
  await expect(page.locator("#spend-category-announcement")).toHaveText(
    "Searching full paths",
  );
  await expect(
    categoryOptions.getByRole("option", { name: /Groceries/ }),
  ).toBeVisible();

  await categoryPicker.fill(diningFqn);
  await expect(categoryPicker).toHaveValue(diningFqn);
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "false");

  await categoryPicker.fill(`${base}:Food:Pan`);
  await expect(
    categoryOptions.getByRole("option", { name: /Pantry/ }),
  ).toBeVisible();
  await categoryPicker.press("Shift+Tab");
  await expect(categoryPicker).toHaveValue(`${base}:Food:Pan`);
  await expect(page.getByRole("combobox", { name: "Merchant" })).toBeFocused();
  await categoryPicker.focus();
  await categoryPicker.press("Tab");
  await expect(categoryPicker).toHaveValue(pantryFqn);
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "false");
  await categoryPicker.press("Tab");
  await expect(categoryPicker).not.toBeFocused();
  await expect(categoryPicker).toHaveValue(pantryFqn);
  await page.getByRole("combobox", { name: "Funding account" }).focus();
  await categoryPicker.focus();
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "true");
  await categoryPicker.press("Tab");
  await expect(categoryPicker).not.toBeFocused();
  await expect(categoryPicker).toHaveValue(pantryFqn);
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "false");

  const createdFqn = `${base}:Food:New:Bakery`;
  await page
    .getByRole("combobox", { name: "Creation economic intent" })
    .click();
  await page.getByRole("option", { name: "Fee", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Creation economic intent" }),
  ).toBeFocused();
  await categoryPicker.fill(createdFqn);
  await expect(
    categoryOptions.getByRole("option", {
      name: `Create ${createdFqn}`,
    }),
  ).toBeVisible();
  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      response.request().method() === "POST"
    );
  });
  const accountRefreshPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts" && response.request().method() === "GET"
    );
  });
  await categoryPicker.press("Enter");
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBe(true);
  const createdCategory = (await createResponse.json()) as CategoryFixture;
  expect(createdCategory.fqn).toBe(createdFqn);
  expect(createdCategory.economic_intent).toBe("fee");
  await expect(categoryPicker).toHaveValue(createdFqn);
  await expect(categoryPicker).toBeFocused();
  await categoryPicker.press("Tab");
  await expect(categoryPicker).not.toBeFocused();
  await expect(categoryPicker).toHaveValue(createdFqn);
  await accountRefreshPromise;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );

  const fundingPicker = page.getByRole("combobox", {
    name: "Funding account",
  });
  await fundingPicker.fill("merchant");
  await expect(page.locator("#spend-fundingAccountId-options")).toContainText(
    "No matches",
  );
  await expect(
    page
      .locator("#spend-fundingAccountId-options")
      .getByRole("option", { name: /merchant/i }),
  ).toHaveCount(0);

  const merchantPicker = page.getByRole("combobox", { name: "Merchant" });
  await merchantPicker.fill("cash");
  await expect(page.locator("#spend-merchantAccountId-options")).toContainText(
    "No matches",
  );
  await expect(
    page
      .locator("#spend-merchantAccountId-options")
      .getByRole("option", { name: /cash/i }),
  ).toHaveCount(0);
});

test("late category creation preserves newer shorthand edits", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const createdFqn = `E2ELateCategory:${slug}${Date.now()}`;
  let releaseCreate: (() => void) | undefined;
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });
  let markCreateStarted: (() => void) | undefined;
  const createStarted = new Promise<void>((resolve) => {
    markCreateStarted = resolve;
  });

  await page.route("**/api/categories", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    markCreateStarted?.();
    await createGate;
    await route.continue();
  });

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const categoryPicker = page.getByRole("combobox", { name: "Category" });
  await expect(categoryPicker).toBeEnabled();
  await categoryPicker.fill(createdFqn);
  await categoryPicker.press("Enter");
  await createStarted;

  const memo = page.getByLabel("Memo");
  await memo.fill("must survive the category response");
  const createResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/categories" &&
      response.request().method() === "POST",
  );
  releaseCreate?.();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBe(true);

  await expect(categoryPicker).toHaveValue(createdFqn);
  await expect(memo).toHaveValue("must survive the category response");
});

test("constrained inline category picker renders an unsliced level and selects its leaf", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const prefix = `E2EInlineSegment:${unique}:Group`;
  const categories = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      createCategory(
        page,
        `${prefix}:Leaf${String(index).padStart(2, "0")}`,
        "expense",
      ),
    ),
  );
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const initialCategory = await createCategory(
    page,
    `E2EInlineSegment:${unique}:Initial`,
    "expense",
  );
  const memo = `E2E constrained segment picker ${unique}`;
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "8.31",
      category_id: initialCategory.category_id,
      counterparty_account_id: findByFqn(accounts, "merchant:Books").account_id,
      currency: "USD",
      funding_account_id: findByFqn(accounts, "cash:Wallet").account_id,
      initiated_date: "2026-05-31",
      memo,
    },
  });
  expect(createResponse.ok()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionFixture;

  await page.goto(
    `/transactions?q=${encodeURIComponent(memo)}&page=1&pageSize=50&hideExpected=true`,
  );
  const row = page
    .locator(`[data-transaction-id="${transaction.transaction_id}"]`)
    .first();
  await expect(row).toBeVisible();
  const rowPrefix = `transaction-${transaction.transaction_id}`;
  const categoryCell = row.getByTestId(`${rowPrefix}-category-cell`);
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = row.getByTestId(`${rowPrefix}-category-editor`);
  const categoryPicker = categoryEditor.getByRole("combobox", {
    name: "Category",
  });
  await categoryPicker.fill(`E2EInlineSegment:${unique}:`);
  await expect(
    categoryEditor.getByRole("option", {
      name: "Group, group, 10 children",
    }),
  ).toBeVisible();
  await categoryPicker.press("ArrowRight");
  await expect(categoryPicker).toHaveValue(`${prefix}:`);
  const inlineOptions = categoryEditor.getByRole("listbox");
  await expect(inlineOptions).toHaveAttribute("data-picker-mode", "level");
  await expect(inlineOptions.getByRole("option")).toHaveCount(10);
  await expect(categoryPicker).toHaveAttribute(
    "aria-activedescendant",
    /-option-/,
  );
  const constrainedGeometry = await inlineOptions.evaluate((options) => {
    const input = options.parentElement?.querySelector("input");
    return {
      inputWidth: input?.getBoundingClientRect().width ?? 0,
      optionsWidth: options.getBoundingClientRect().width,
      overflowY: window.getComputedStyle(options).overflowY,
    };
  });
  expect(constrainedGeometry.optionsWidth).toBeLessThanOrEqual(
    constrainedGeometry.inputWidth + 1,
  );
  expect(constrainedGeometry.overflowY).toBe("auto");

  await categoryPicker.fill(categories[0]!.fqn);
  await expect(categoryPicker).toHaveValue(categories[0]!.fqn);
  await expect(inlineOptions).toHaveCount(0);
  await categoryEditor.getByRole("button", { name: "Save category" }).click();
  await expect(categoryEditor).toHaveCount(0);
});

test("tags multi-picker retains its prefix for sibling batching", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const prefix = `E2ETagBatch:${unique}:Trip`;
  const [flights, hotels, rootSearchTag] = await Promise.all([
    createTag(page, `${prefix}:Flights`),
    createTag(page, `${prefix}:Hotels`),
    createTag(page, `E2ERootSearch:${unique}:RootPick${unique}`),
  ]);

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const tagsPicker = page.getByRole("combobox", { name: "Tags" });
  const selectedTags = page.getByTestId("entity-multi-picker-selected");

  await tagsPicker.fill(rootSearchTag.name);
  await tagsPicker.press("Enter");
  await expect(tagsPicker).toHaveValue("");
  await expect(selectedTags).toContainText(rootSearchTag.name);

  await tagsPicker.fill(`${prefix}:`);
  const tagsOptions = page.locator("#spend-tags-options");
  await expect(tagsOptions).toHaveAttribute("data-picker-mode", "level");
  await expect(tagsOptions.getByRole("option")).toHaveCount(2);
  await tagsPicker.press("Enter");
  await expect(tagsPicker).toHaveValue(`${prefix}:`);
  await expect(page.getByTestId("entity-multi-picker-selected")).toContainText(
    flights.name,
  );

  await tagsPicker.pressSequentially("Hot");
  await expect(tagsPicker).toHaveValue(`${prefix}:Hot`);
  await expect(
    tagsOptions.getByRole("option", { name: /Flights/ }),
  ).toHaveCount(0);
  await expect(
    tagsOptions.getByRole("option", { name: /Hotels/ }),
  ).toBeVisible();
  await tagsPicker.press("Tab");
  await expect(tagsPicker).toHaveValue(`${prefix}:`);
  await expect(selectedTags).toContainText(flights.name);
  await expect(selectedTags).toContainText(hotels.name);
  await expect(tagsPicker).toHaveAttribute("aria-expanded", "false");
  await expect(tagsPicker).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(tagsPicker).not.toBeFocused();
  await expect(selectedTags).toContainText(flights.name);
  await expect(selectedTags).toContainText(hotels.name);

  const createdFqn = `${prefix}:Created`;
  let releaseTagRefresh: (() => void) | undefined;
  const tagRefreshGate = new Promise<void>((resolve) => {
    releaseTagRefresh = resolve;
  });
  await page.route("**/api/tags*", async (route) => {
    if (route.request().method() === "GET") {
      await tagRefreshGate;
    }
    await route.continue();
  });
  await tagsPicker.fill(createdFqn);
  await expect(
    tagsOptions.getByRole("option", { name: `Create ${createdFqn}` }),
  ).toBeVisible();
  await tagsPicker.press("Enter");
  await expect(selectedTags).toContainText("Created");
  await tagsPicker.focus();
  await expect(tagsPicker).toHaveValue(`${prefix}:`);
  await tagsPicker.fill(createdFqn);
  await expect(
    tagsOptions.getByRole("option", { name: /Created/ }),
  ).toHaveCount(0);
  await expect(
    tagsOptions.getByRole("option", { name: `Create ${createdFqn}` }),
  ).toHaveCount(0);
  releaseTagRefresh?.();
});

test("late inline tag creation preserves a newer selection", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const existing = await createTag(page, `E2ELateCreate:${unique}:Existing`);
  let releaseCreate: (() => void) | undefined;
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });
  let markCreateStarted: (() => void) | undefined;
  const createStarted = new Promise<void>((resolve) => {
    markCreateStarted = resolve;
  });

  await page.route("**/api/tags", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    markCreateStarted?.();
    await createGate;
    await route.continue();
  });

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const tagsPicker = page.getByRole("combobox", { name: "Tags" });
  const createdFqn = `E2ELateCreate:${unique}:Created`;
  await tagsPicker.fill(createdFqn);
  await tagsPicker.press("Enter");
  await createStarted;

  await tagsPicker.fill(existing.fqn);
  const selectedTags = page.getByTestId("entity-multi-picker-selected");
  await expect(selectedTags).toContainText(existing.name);

  const createResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/tags" &&
      response.request().method() === "POST",
  );
  releaseCreate?.();
  await createResponse;
  await expect(selectedTags.getByText("Created", { exact: true })).toHaveCount(
    0,
  );
  await expect(selectedTags).toContainText(existing.name);
});

test("keyboard spend entry creates a transaction and keeps sticky fields", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 700 });
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
  await page.keyboard.press("Shift+KeyN");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await page.keyboard.press("KeyN");
  await expect(page.getByRole("heading", { name: "New spend" })).toBeVisible();
  await expect(page.getByLabel("Start from a template")).toBeFocused();
  await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);
  await expect(
    page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    ),
  ).resolves.toBe(true);

  const currency = page.getByRole("combobox", { name: "Currency" });
  await expect(
    page.locator("datalist#entry-currency-options option[value='EUR']"),
  ).toHaveCount(1);
  await currency.fill("bitcoin");
  await expect(currency).toHaveValue("BITCOIN");
  await currency.blur();
  await expect(
    page.getByText("Use a 3-letter code or C:: crypto code."),
  ).toBeVisible();
  const attentionStrip = page.getByRole("button", {
    name: /fields? needs? attention/,
  });
  await expect(attentionStrip).toHaveCount(0);
  await page.getByTestId("entry-scroll-region").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(attentionStrip).toBeVisible();
  await attentionStrip.click();
  await expect(currency).toBeFocused();
  await expect(attentionStrip).toHaveCount(0);
  await currency.fill("ZZZ");
  await expect(currency).toHaveValue("ZZZ");
  await expect(
    page.getByText("Use a 3-letter code or C:: crypto code."),
  ).toBeHidden();
  await currency.fill("USD");

  await page
    .getByRole("textbox", { exact: true, name: "Date" })
    .fill("2026-05-31");
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

  let generalFailureReturned = false;
  await page.route("**/api/transactions/spend", async (route) => {
    if (route.request().method() === "POST" && !generalFailureReturned) {
      generalFailureReturned = true;
      await route.fulfill({
        contentType: "application/json",
        json: { message: "Entry save failed" },
        status: 500,
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole("combobox", { name: "Category" }).focus();
  await page.keyboard.press("Meta+Enter");
  await expect(
    page.getByRole("alert").filter({
      hasText: "Transaction could not be saved.",
    }),
  ).toBeVisible();
  await expect(attentionStrip).toHaveCount(0);
  await page.unroute("**/api/transactions/spend");
  await page.keyboard.press("Meta+Enter");

  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction saved." }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { exact: true, name: "Date" }),
  ).toHaveValue("2026-05-31");
  await expect(
    page.getByRole("combobox", { name: "Funding account" }),
  ).toHaveValue("credit_card:Chase:Sapphire");
  await expect(page.getByLabel("Amount")).toHaveValue("");

  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await page.getByLabel("Search").fill("E2E arcade spend");
  await expect(page.getByText("E2E arcade spend").first()).toBeVisible();
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
    await expect(page.getByRole("button", { name: "Saving" })).toHaveCount(0);
  };

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=25");
  await ledgerLookups;
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(page.getByRole("heading", { name: "New spend" })).toBeVisible();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });

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
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(
    page.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();
  await expect(firstRecord.getByLabel("Amount")).toHaveValue("-10.00");
  await expect(firstRecord.getByLabel("Memo")).toHaveValue(memo);

  await page
    .getByRole("textbox", { exact: true, name: "Date" })
    .fill("2026-05-31");
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
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
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
  await fillAndExpectValue(firstRecord.getByLabel("Amount"), "-88.10");
  await fillAndExpectValue(firstRecord.getByLabel("Memo"), advancedMemo);
  await fillAndExpectValue(secondRecord.getByLabel("Amount"), "88.10");

  await page.getByRole("tab", { name: "Spend" }).click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await spendPanel.getByLabel("Memo").fill(keptMemo);
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({
      tabs: {
        spend: {
          memo: keptMemo,
        },
      },
    });
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
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: editMemo }).first(),
    "Open transaction detail",
  );
  const detailPanel = page.getByRole("dialog", {
    name: transaction.display_title,
  });
  await expect(detailPanel).toBeVisible();
  await detailPanel
    .getByRole("button", { exact: true, name: "Edit transaction" })
    .click();

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

test("the modal protects an in-flight edit from underlying saved-transaction actions", async ({
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
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: initialMemo }).first(),
    "Open transaction detail",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit transaction" })
    .click();

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  const editPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await fillAndExpectValue(editPanel.getByLabel("Memo"), changedMemo);

  const nextRow = page.getByRole("row").filter({ hasText: nextMemo }).first();
  await expect(nextRow).toHaveCount(0);
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  const discardDialog = page.getByRole("alertdialog", {
    name: "Discard transaction changes?",
  });
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Keep editing" }).click();
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

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
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

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=25");
  await ledgerLookups;
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

  await fillAndExpectValue(firstAccountPicker, "VisibleFeeSystem");
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
  await expect(
    page.locator("[data-transaction-row]").filter({ hasText: memo }),
  ).toBeVisible();
});

test("the entry modal blocks the command palette while an edit is active", async ({
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
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit transaction" })
    .click();

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  const editSpendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(editSpendPanel.getByLabel("Amount")).toHaveValue("34.56");

  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toHaveCount(0);
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(editSpendPanel.getByLabel("Amount")).toHaveValue("34.56");
});

test("entry modal deep links compose with history and report missing transactions", async ({
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
  const memo = `E2E entry deep link ${unique}`;
  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.75",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-10",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;
  const entryModal = page.getByRole("dialog", {
    name: "Transaction editor",
  });

  await page.goto("/overview");
  await page
    .locator("main")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(page).toHaveURL(/[?&]entry=new(?:&|$)/);
  await expect(entryModal).toBeVisible();
  await page.goBack();
  await expect(entryModal).toHaveCount(0);
  await expect(page).toHaveURL(/\/overview$/);

  await page.goto(`/settings?entry=edit:${transaction.transaction_id}`);
  await expect(
    entryModal.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expect(entryModal.getByLabel("Memo")).toHaveValue(memo);

  await page.goto(`/settings?entry=split:${transaction.transaction_id}`);
  await expect(
    entryModal.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();

  await page.goto(`/settings?entry=duplicate:${transaction.transaction_id}`);
  await expect(
    entryModal.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(entryModal.getByLabel("Memo")).toHaveValue(memo);

  await page.goto("/settings?entry=edit:999999999");
  await expect(
    entryModal.getByRole("heading", { name: "Transaction unavailable" }),
  ).toBeVisible();
  await expect(entryModal.getByRole("alert")).toContainText(
    "transaction not found",
  );
});

test("opening the entry modal exits bulk mode and takes over a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  await page.goto("/transactions?page=1&pageSize=25");
  await page.getByRole("button", { name: "Bulk edit" }).click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toBeVisible();
  await page
    .locator("main")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await page.setViewportSize({ width: 600, height: 700 });
  await page.goto("/overview?entry=new");
  const entryModal = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(entryModal).toBeVisible();
  const bounds = await entryModal.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeCloseTo(0, 0);
  expect(bounds!.y).toBeCloseTo(0, 0);
  expect(bounds!.width).toBeCloseTo(600, 0);
  expect(bounds!.height).toBeCloseTo(700, 0);
});

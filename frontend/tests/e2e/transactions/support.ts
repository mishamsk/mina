import { expect, type Locator, type Page } from "@playwright/test";

interface AccountFixture {
  readonly account_id: number;
  readonly display_label: string;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly display_label: string;
  readonly economic_intent: string;
  readonly fqn: string;
  readonly name: string;
}

interface TagFixture {
  readonly display_label: string;
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
  readonly transaction_id: number;
}

interface RecurringDefinitionFixture {
  readonly fqn: string;
  readonly recurring_definition_id: number;
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

const pickerSelectedLabel = (fixture: {
  readonly display_label: string;
  readonly fqn: string;
}): string =>
  fixture.display_label === fixture.fqn
    ? fixture.fqn
    : `${fixture.fqn} (${fixture.display_label})`;

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

const createExpectedRecurringFixture = async (
  page: Page,
  unique: string,
): Promise<{
  readonly category: CategoryFixture;
  readonly checking: AccountFixture;
  readonly merchant: AccountFixture;
  readonly memo: string;
  readonly recurringDefinitionFqn: string;
  readonly recurringDefinitionId: number;
  readonly transactionId: number;
}> => {
  const anchorDate = formatLocalDate(new Date());
  const checking = await createAccount(
    page,
    `e2e:ExpectedFilter:${unique}:Checking${unique}`,
    "owned",
    "USD",
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
    memo,
    recurringDefinitionFqn: created.fqn,
    recurringDefinitionId: created.recurring_definition_id,
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

const chooseOptionByKeyboard = async (
  page: Page,
  label: string,
  searchText: string,
  optionValue: string,
  options: {
    readonly scope?: Locator;
  } = {},
) => {
  const displayValue = optionValue.split(":").slice(-2).join(":");
  const pickerScope = options.scope ?? page;
  const picker = pickerScope.getByRole("combobox", { name: label });
  await picker.click();
  await expect(picker).toBeFocused();
  if (searchText === optionValue) {
    await picker.fill(searchText);
    await expect(picker).toHaveAttribute("aria-expanded", "false");
    await expect(picker).toHaveValue(displayValue);
    return;
  }
  await picker.fill(searchText);
  await expect(picker).toHaveValue(searchText);
  if ((await picker.inputValue()) === optionValue) {
    await expect(picker).toHaveAttribute("aria-expanded", "false");
    return;
  }
  const optionListId = await picker.getAttribute("aria-controls");
  expect(optionListId).not.toBeNull();
  const optionList = page.locator(`#${optionListId}`);
  const option = optionList
    .getByRole("option")
    .filter({ hasText: displayValue })
    .first();
  await expect(option).toBeVisible({ timeout: 10000 });
  const optionId = await option.evaluate((element) => element.id);
  const optionCount = await optionList.getByRole("option").count();
  for (let attempt = 0; attempt <= optionCount; attempt += 1) {
    if ((await picker.getAttribute("aria-activedescendant")) === optionId) {
      break;
    }
    await picker.press("ArrowDown");
  }
  await expect(picker).toHaveAttribute("aria-activedescendant", optionId);
  await picker.press("Enter");
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await expect(picker).toHaveValue(displayValue);
};

const journalRecord = (page: Page, index: number): Locator =>
  page.locator(`[aria-label="Journal record ${index}"]`);

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
  chooseOptionByKeyboard,
  clickRowAction,
  createAccount,
  createCategory,
  createExpectedRecurringFixture,
  createMember,
  createSearchSpend,
  createTag,
  deleteTransaction,
  expect,
  expectAdvancedBalanceStatus,
  findByFqn,
  formatLocalDate,
  journalRecord,
  listFixtures,
  pickerSelectedLabel,
  shiftLocalDate,
};
export type { AccountFixture, CategoryFixture, Page, TransactionFixture };

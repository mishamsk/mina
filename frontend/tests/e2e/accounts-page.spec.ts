import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
  readonly account_type: "flow" | "owned" | "party" | "system";
  readonly currency: string | null;
  readonly display_label: string;
  readonly display_label_override: string | null;
  readonly fqn: string;
}

const accountTreeAccessibleName = (
  account: Pick<AccountFixture, "display_label_override" | "fqn">,
): string =>
  `Open account ${account.fqn}${
    account.display_label_override ? ` (${account.display_label_override})` : ""
  }`;

interface CategoryFixture {
  readonly category_id: number;
  readonly fqn: string;
}

interface BalanceFixture {
  readonly account_id: number;
  readonly credit_limit?: string;
  readonly currency: string;
  readonly current_balance: string;
  readonly current_balance_usd: string;
  readonly posted_balance: string;
  readonly remaining_credit?: string;
  readonly unconverted_count: number;
}

interface JournalRecordFixture {
  readonly account_id: number;
  readonly amount: string;
  readonly currency: string;
  readonly initiated_date: string;
  readonly memo?: string | null;
  readonly pending_date: string | null;
  readonly posted_date: string | null;
  readonly record_id: number;
  readonly running_balance?: string | null;
  readonly remaining_credit?: string;
  readonly transaction_id: number;
}

interface TransactionFixture {
  readonly display_title: string;
  readonly transaction_id: number;
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

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const decimalScale = 8;

const createAccount = async (
  page: Page,
  {
    accountType = "owned",
    currency = "USD",
    displayLabel,
    fqn,
    hidden = false,
  }: {
    readonly accountType?: "flow" | "owned" | "party";
    readonly currency?: string | null;
    readonly displayLabel?: string;
    readonly fqn: string;
    readonly hidden?: boolean;
  },
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency,
      display_label: displayLabel,
      fqn,
      is_hidden: hidden,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as AccountFixture;
};

const createHiddenAccount = async (
  page: Page,
  fqn: string,
): Promise<AccountFixture> => {
  return createAccount(page, { fqn, hidden: true });
};

const createCategory = async (
  page: Page,
  fqn: string,
): Promise<CategoryFixture> => {
  const response = await page.request.post("/api/categories", {
    data: {
      economic_intent: "expense",
      fqn,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as CategoryFixture;
};

const findByFqn = <T extends { readonly fqn: string }>(
  fixtures: readonly T[],
  fqn: string,
): T => {
  const fixture = fixtures.find((item) => item.fqn === fqn);
  expect(fixture, `${fqn} fixture`).toBeDefined();
  return fixture as T;
};

const requireDefined = <T>(value: T | undefined, label: string): T => {
  expect(value, label).toBeDefined();
  return value as T;
};

const quickDeleteTransactionFromRow = async (
  page: Page,
  row: Locator,
): Promise<void> => {
  const directDelete = row
    .locator(".row-actions-buttons")
    .getByRole("button", { name: "Delete transaction" });
  if (await directDelete.isVisible()) {
    await directDelete.click();
  } else {
    await row.getByRole("button", { name: "More row actions" }).click();
    const menu = page.locator(".row-actions-menu:visible");
    await expect(menu).toBeVisible();
    await menu.getByRole("button", { name: "Delete transaction" }).click();
  }
  const dialog = page.getByRole("alertdialog", {
    name: "Delete transaction",
  });
  await expect(dialog).toBeVisible();
  const deletion = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith("/api/transactions/") &&
      response.request().method() === "DELETE",
  );
  await dialog.getByRole("button", { name: "Delete transaction" }).click();
  expect((await deletion).status()).toBe(204);
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction deleted." }),
  ).toBeVisible();
  await expect(row).toBeHidden();
};

const formatDecimalAmount = (value: string): string => {
  const negative = value.startsWith("-");
  const absolute = negative ? value.slice(1) : value;
  const [whole = "0", rawFraction = ""] = absolute.split(".");
  const fraction = rawFraction.padEnd(decimalScale, "0").slice(0, decimalScale);
  const mantissa = BigInt(`${whole}${fraction}`);
  const rounded = (mantissa + 500000n) / 1000000n;
  const raw = rounded.toString().padStart(3, "0");
  const formattedWhole = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(Number(raw.slice(0, -2) || "0"));
  return `${negative ? "-" : ""}${formattedWhole}.${raw.slice(-2)}`;
};

const formatUsdMarkerAmount = (value: string): string =>
  `${formatDecimalAmount(value)} $`;

const expectAccountRegisterUrl = async (
  page: Page,
  expectedPage: number,
  expectedPageSize: number,
): Promise<void> => {
  await expect
    .poll(() => {
      const searchParams = new URL(page.url()).searchParams;
      return {
        page: searchParams.get("page"),
        pageSize: searchParams.get("pageSize"),
      };
    })
    .toEqual({
      page: String(expectedPage),
      pageSize: String(expectedPageSize),
    });
};

const renderedLineHeight = async (locator: Locator) => {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    const parsedLineHeight = Number.parseFloat(styles.lineHeight);
    const parsedFontSize = Number.parseFloat(styles.fontSize);
    const lineHeight = Number.isFinite(parsedLineHeight)
      ? parsedLineHeight
      : parsedFontSize * 1.4;
    return {
      height: rect.height,
      lineHeight,
    };
  });
};

const filledFeaturedStarPath =
  "M11 1H13V3H15V7H23V11H21V13H19V16H21V22H16V20H14V18H10V20H8V22H3V16H5V13H3V11H1V7H9V3H11V1Z";

const expectFeaturedStarTreatment = async (
  button: Locator,
  color: string,
  expectedPath?: string,
) => {
  const icon = button.locator("svg");
  await expect(icon).toHaveCSS("color", color);
  await expect(icon).toHaveCSS("fill", color);
  if (expectedPath !== undefined) {
    await expect(icon.locator("path")).toHaveAttribute("d", expectedPath);
  }
};

test("accounts page renders tree, URL toolbar state, balances, and sidebar navigation", async ({
  browserName,
  page,
}) => {
  const unique = Date.now().toString(36);
  const hiddenAccount = await createHiddenAccount(
    page,
    `e2e:hidden:${browserName}:${unique}:Vault`,
  );
  const zeroBalanceAccount = await createAccount(page, {
    fqn: `e2e:zero:${browserName}:${unique}:Empty`,
  });
  const accountsResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts" &&
      url.searchParams.get("include_hidden") === "false"
    );
  });
  const balancesResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts/balances" &&
      url.searchParams.get("include_hidden") === "false"
    );
  });

  await page.goto("/accounts");
  const accountsBody = (await (await accountsResponse).json()) as {
    readonly accounts: readonly AccountFixture[];
  };
  const balancesBody = (await (await balancesResponse).json()) as {
    readonly balances: readonly BalanceFixture[];
  };
  const accounts = accountsBody.accounts;
  const balances = balancesBody.balances;
  const joint = findByFqn(accounts, "bank:Chase:joint_checking");
  const jointBalance = balances.find(
    (balance) => balance.account_id === joint.account_id,
  );
  const sapphire = findByFqn(accounts, "bank:Chase:Sapphire");
  const expenses = findByFqn(accounts, "employers:Acme:expenses");
  const sapphireBalance = balances.find(
    (balance) => balance.account_id === sapphire.account_id,
  );
  expect(jointBalance).toBeDefined();
  expect(sapphireBalance?.credit_limit).toBeDefined();
  expect(sapphireBalance?.remaining_credit).toBeDefined();

  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  const accountsNavLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Accounts" });
  await expect(accountsNavLink).toHaveAttribute("aria-current", "page");

  const bankGroup = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "bank" })
    .first();
  await expect(bankGroup).toBeVisible();
  const jointRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "joint_checking" })
    .first();
  await expect(jointRow).toBeVisible();
  await expect(jointRow).toContainText("Owned");
  await expect(jointRow).toContainText("USD");
  await expect(jointRow).toContainText(
    formatUsdMarkerAmount(jointBalance?.current_balance ?? "0"),
  );
  await expect(jointRow.getByTestId("credit-limit-indicator")).toHaveCount(0);
  await expect(
    jointRow.getByRole("button", { name: "Edit account" }),
  ).toBeVisible();
  await expect(
    jointRow.getByRole("button", { name: "Move or rename" }),
  ).toBeVisible();

  const traderJoesRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "TraderJoes" })
    .first();
  const sapphireRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Sapphire" });
  await expect(traderJoesRow).toContainText("Flow");
  await expect(traderJoesRow.getByTestId("amount-text")).toHaveCount(0);

  await expect(
    page
      .getByTestId("accounts-tree-row")
      .filter({ hasText: hiddenAccount.fqn }),
  ).toHaveCount(0);

  await page.getByLabel("Type").click();
  const typePopover = page.getByRole("dialog", { name: "Account types" });
  await expect(typePopover).toBeVisible();
  const jointRowBox = await jointRow.boundingBox();
  expect(jointRowBox).not.toBeNull();
  await page.mouse.click(
    (jointRowBox?.x ?? 0) + 8,
    (jointRowBox?.y ?? 0) + (jointRowBox?.height ?? 0) / 2,
  );
  await expect(typePopover).toBeHidden();
  await expect(page).toHaveURL(/\/accounts$/);

  const zeroBalanceRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: zeroBalanceAccount.fqn });
  const hideZeroBalancesToggle = page.getByLabel("Hide zero-standing accounts");
  await expect(zeroBalanceRow).toBeVisible();
  await expect(hideZeroBalancesToggle).toHaveAttribute("aria-pressed", "false");
  await expect(
    hideZeroBalancesToggle.locator('[data-icon="zero-standing-shown"]'),
  ).toBeVisible();
  await hideZeroBalancesToggle.click();
  await expect(page).toHaveURL(/\/accounts\?nonzero=true$/);
  await expect(zeroBalanceRow).toHaveCount(0);
  await expect(traderJoesRow).toBeVisible();
  await expect(sapphireRow).toBeVisible();
  await expect(hideZeroBalancesToggle).toHaveAttribute("aria-pressed", "true");
  await expect(
    hideZeroBalancesToggle.locator('[data-icon="zero-standing-hidden"]'),
  ).toBeVisible();
  await hideZeroBalancesToggle.click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(zeroBalanceRow).toBeVisible();

  await page.getByLabel("Type").click();
  await page.getByRole("checkbox", { exact: true, name: "Flow" }).click();
  await expect(page).toHaveURL(/\/accounts\?type=flow$/);
  await page.getByRole("checkbox", { exact: true, name: "Party" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("type"))
    .toEqual(["party", "flow"]);
  await page.keyboard.press("Escape");
  const typeTrigger = page.getByRole("button", {
    exact: true,
    name: "Type: Party, Flow",
  });
  await expect(typeTrigger).toBeVisible();
  await expect(typeTrigger).toBeFocused();
  await typeTrigger.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Party, Flow");
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "TraderJoes" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: expenses.fqn }),
  ).toBeVisible();
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "joint_checking" }),
  ).toHaveCount(0);

  await page.getByLabel("Search").fill("bank:Chase:Sapphire");
  await expect(page).toHaveURL(
    /type=party&type=flow&q=bank%3AChase%3ASapphire/,
  );
  await expect(page.getByTestId("accounts-tree-row")).toHaveCount(0);

  await page.getByLabel("Type").click();
  await page.getByRole("checkbox", { exact: true, name: "Party" }).click();
  await page.getByRole("checkbox", { exact: true, name: "Flow" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/q=bank%3AChase%3ASapphire/);
  await expect(sapphireRow).toBeVisible();
  await expect(sapphireRow).toContainText("Remaining credit");
  await expect(sapphireRow.getByTestId("amount-text")).toHaveText(
    formatUsdMarkerAmount(sapphireBalance?.remaining_credit ?? "0"),
  );
  await expect(sapphireRow.getByTestId("credit-limit-indicator")).toBeVisible();
  await expect(
    sapphireRow.getByRole("button", { exact: true, name: "Has credit limit" }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "BlueCash" }),
  ).toHaveCount(0);

  await page.getByLabel("Search").fill(hiddenAccount.fqn);
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "Vault" }),
  ).toHaveCount(0);

  const includeHiddenToggle = page.getByLabel("Include hidden");
  await expect(includeHiddenToggle).toHaveAttribute("aria-pressed", "false");
  await includeHiddenToggle.click();
  await expect(page).toHaveURL(/hidden=true/);
  await expect(includeHiddenToggle).toHaveAttribute("aria-pressed", "true");
  const hiddenRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Vault" })
    .first();
  await expect(hiddenRow).toBeVisible();
  await expect(hiddenRow.getByLabel("Hidden account")).toBeVisible();
});

test("transaction quick-delete refreshes reference deleteability without a reload", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const feesAccount = findByFqn(accounts, "bank:Chase:fees");
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");

  await page.goto("/accounts");
  await page.getByLabel("Search").fill(feesAccount.fqn);
  const feesRow = page.getByRole("button", {
    name: accountTreeAccessibleName(feesAccount),
  });
  const feesRowDelete = feesRow.getByRole("button", {
    name: "Delete account",
  });
  await expect(feesRow).toBeVisible();
  await expect(feesRowDelete).toHaveAttribute("aria-disabled", "true");

  await page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Transactions" })
    .click();
  await expect(page).toHaveURL(/\/transactions(?:\?|$)/);
  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search" })
    .fill("Wire transfer with fee");
  const feesTransactionRows = page.locator("[data-transaction-row='true']");
  await expect(feesTransactionRows).toHaveCount(1);
  await quickDeleteTransactionFromRow(page, feesTransactionRows.first());

  await page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Accounts" })
    .click();
  await expect(page).toHaveURL(/\/accounts(?:\?|$)/);
  await expect(
    page.getByRole("heading", { exact: true, name: "Accounts" }),
  ).toBeVisible();
  await page.getByLabel("Search").fill(feesAccount.fqn);
  await expect(feesRow).toBeVisible();
  await expect(feesRowDelete).not.toHaveAttribute("aria-disabled", "true");
  await feesRowDelete.click();
  const accountDeleteDialog = page.getByRole("alertdialog", {
    name: "Delete account",
  });
  await expect(accountDeleteDialog).toBeVisible();
  await accountDeleteDialog.getByRole("button", { name: "Cancel" }).click();

  await feesRow.getByRole("button", { name: "Edit account" }).click();
  const accountPanel = page.getByRole("dialog", { name: "Edit account" });
  const accountPanelDelete = accountPanel.getByRole("button", {
    name: "Delete",
  });
  await expect(accountPanelDelete).not.toHaveAttribute("aria-disabled", "true");
  await accountPanelDelete.click();
  const accountDeletion = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${feesAccount.account_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await accountDeleteDialog
    .getByRole("button", { name: "Delete account" })
    .click();
  expect((await accountDeletion).status()).toBe(204);
  await expect(feesRow).toHaveCount(0);

  const category = await createCategory(page, `E2E:Deleteability:${unique}`);
  const categoryMemo = `E2E deleteability category ${unique}`;
  const categoryTransaction = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "14.56",
        category_id: category.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-07-03",
        memo: categoryMemo,
      },
    },
  );
  expect(categoryTransaction.ok()).toBe(true);

  await page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Categories" })
    .click();
  await expect(page).toHaveURL(/\/categories(?:\?|$)/);
  await expect(
    page.getByRole("heading", { exact: true, name: "Categories" }),
  ).toBeVisible();
  await page.getByLabel("Search").fill(category.fqn);
  const categoryRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn })
    .first();
  const categoryDelete = categoryRow.getByRole("button", {
    name: "Delete category",
  });
  await expect(categoryRow).toBeVisible();
  await expect(categoryDelete).toHaveAttribute("aria-disabled", "true");

  await page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Transactions" })
    .click();
  await expect(page).toHaveURL(/\/transactions(?:\?|$)/);
  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search" }).fill(categoryMemo);
  const categoryTransactionRows = page.locator("[data-transaction-row='true']");
  await expect(categoryTransactionRows).toHaveCount(1);
  await quickDeleteTransactionFromRow(page, categoryTransactionRows.first());

  await page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Categories" })
    .click();
  await expect(page).toHaveURL(/\/categories(?:\?|$)/);
  await expect(
    page.getByRole("heading", { exact: true, name: "Categories" }),
  ).toBeVisible();
  await page.getByLabel("Search").fill(category.fqn);
  await expect(categoryRow).toBeVisible();
  await expect(categoryDelete).not.toHaveAttribute("aria-disabled", "true");
  await categoryDelete.click();
  const categoryDeleteDialog = page.getByRole("alertdialog", {
    name: "Delete category",
  });
  const categoryDeletion = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/categories/${category.category_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await categoryDeleteDialog
    .getByRole("button", { name: "Delete category" })
    .click();
  expect((await categoryDeletion).status()).toBe(204);
  await expect(categoryRow).toHaveCount(0);
});

test("accounts tree shows full FQNs with custom labels in parentheses", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName[0]}${Date.now().toString(36).slice(-5)}`;
  const shortFqn = `bank:Chase${unique}:fees`;
  const deepFqn = [
    "bank",
    `institution${unique}`,
    "checking",
    "household",
    "recurring",
    "fees",
  ].join(":");
  const [shortAccount, deepAccount] = await Promise.all([
    createAccount(page, { fqn: shortFqn }),
    createAccount(page, { displayLabel: "Household fees", fqn: deepFqn }),
  ]);

  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto("/accounts");
  const shortRow = page.getByRole("button", {
    name: accountTreeAccessibleName(shortAccount),
  });
  const shortPath = shortRow.getByTestId("accounts-tree-fqn");
  await expect(shortPath).toHaveText(shortFqn);
  await expect(shortRow.getByTestId("accounts-tree-display-label")).toHaveCount(
    0,
  );

  await page.setViewportSize({ width: 1200, height: 900 });
  const deepPath = page
    .getByRole("button", {
      name: accountTreeAccessibleName(deepAccount),
    })
    .getByTestId("accounts-tree-fqn");
  await expect(deepPath).toHaveText(deepFqn);
  const deepRow = page.getByRole("button", {
    name: accountTreeAccessibleName(deepAccount),
  });
  await expect(deepRow.getByTestId("accounts-tree-display-label")).toHaveText(
    "(Household fees)",
  );
  await deepRow.focus();
  await expect(deepRow).toBeFocused();
});

test("register headers fit display labels while group headers retain FQNs", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName[0]}${Date.now().toString(36).slice(-5)}`;
  const groupFqn = `banks:${unique}:Home`;
  const account = await createAccount(page, {
    fqn: `${groupFqn}:Primary`,
  });
  const longGroupFqn = `banks:${unique}:ExtraordinarilyLongHouseholdGroup`;
  const longAccount = await createAccount(page, {
    fqn: `${longGroupFqn}:ExtraordinarilyLongPrimaryCheckingAccount`,
  });
  const leafDominatedAccount = await createAccount(page, {
    fqn: `x:${unique}LongPrimaryChecking`,
  });

  const expectFullPath = async (path: Locator, value: string) => {
    await expect(path).toHaveText(value);
    await expect
      .poll(() =>
        path.evaluate((element) =>
          [...element.querySelectorAll<HTMLElement>("span")].every(
            (span) => span.scrollWidth <= span.clientWidth + 1,
          ),
        ),
      )
      .toBe(true);
  };
  const expectMiddleTruncation = async (path: Locator, value: string) => {
    const ancestors = path.locator(":scope > span").first();
    const leaf = path.locator(":scope > span").last();
    await expect
      .poll(() =>
        ancestors.evaluate((element) => ({
          hasVisibleWidth: element.clientWidth > 1,
          isTruncated: element.scrollWidth > element.clientWidth + 1,
        })),
      )
      .toEqual({ hasVisibleWidth: true, isTruncated: true });
    await expect
      .poll(() =>
        leaf.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      )
      .toBe(true);
    await path.hover();
    await expect(page.getByRole("tooltip")).toHaveText(value);
    await page.mouse.move(0, 0);
  };
  const expectLongLeafTruncation = async (path: Locator, value: string) => {
    const ancestors = path.locator(":scope > span").first();
    const leaf = path.locator(":scope > span").last();
    await expect
      .poll(() =>
        Promise.all(
          [ancestors, leaf].map((segment) =>
            segment.evaluate((element) => ({
              hasVisibleWidth: element.clientWidth > 1,
              isTruncated: element.scrollWidth > element.clientWidth + 1,
            })),
          ),
        ),
      )
      .toEqual([
        { hasVisibleWidth: true, isTruncated: true },
        { hasVisibleWidth: true, isTruncated: true },
      ]);
    await path.hover();
    await expect(page.getByRole("tooltip")).toHaveText(value);
    await page.mouse.move(0, 0);
  };
  const expectNoHeaderOverflow = async (header: Locator) => {
    await expect
      .poll(() =>
        header.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      )
      .toBe(true);
  };
  const expectDisplayLabel = async (
    header: Locator,
    displayLabel: string,
    fqn: string,
  ) => {
    const label = header.getByText(displayLabel, { exact: true }).first();
    await expect(label).toBeVisible();
    await label.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      displayLabel === fqn ? fqn : `${displayLabel} · ${fqn}`,
    );
    await page.mouse.move(0, 0);
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    `/accounts/${leafDominatedAccount.account_id}?page=1&pageSize=25`,
  );
  const leafDominatedAccountHeader = page.getByTestId("account-header");
  await expectDisplayLabel(
    leafDominatedAccountHeader,
    leafDominatedAccount.display_label,
    leafDominatedAccount.fqn,
  );
  await expectNoHeaderOverflow(leafDominatedAccountHeader);

  await page.goto(
    `/accounts/group?prefix=${encodeURIComponent(leafDominatedAccount.fqn)}&page=1&pageSize=25`,
  );
  const leafDominatedGroupTitle = page.locator("#account-group-title");
  const leafDominatedGroupPath = leafDominatedGroupTitle
    .locator(".inline-flex.overflow-hidden.font-mono")
    .first();
  const leafDominatedGroupHeader = page
    .locator("header")
    .filter({ has: leafDominatedGroupTitle });
  await expectFullPath(leafDominatedGroupPath, leafDominatedAccount.fqn);
  await expectNoHeaderOverflow(leafDominatedGroupHeader);

  await page.goto(`/accounts/${account.account_id}?page=1&pageSize=25`);
  const accountHeader = page.getByTestId("account-header");
  await expectDisplayLabel(accountHeader, account.display_label, account.fqn);
  await expectNoHeaderOverflow(accountHeader);

  await page.setViewportSize({ width: 480, height: 900 });
  await expectDisplayLabel(accountHeader, account.display_label, account.fqn);
  await expectNoHeaderOverflow(accountHeader);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    `/accounts/group?prefix=${encodeURIComponent(groupFqn)}&page=1&pageSize=25`,
  );
  const groupTitle = page.locator("#account-group-title");
  const groupPath = groupTitle
    .locator(".inline-flex.overflow-hidden.font-mono")
    .first();
  const groupHeader = page.locator("header").filter({ has: groupTitle });
  await expectFullPath(groupPath, groupFqn);
  await expectNoHeaderOverflow(groupHeader);

  await page.setViewportSize({ width: 480, height: 900 });
  await expectMiddleTruncation(groupPath, groupFqn);
  await expectNoHeaderOverflow(groupHeader);

  await page.goto(`/accounts/${longAccount.account_id}?page=1&pageSize=25`);
  const longAccountHeader = page.getByTestId("account-header");
  await expectDisplayLabel(
    longAccountHeader,
    longAccount.display_label,
    longAccount.fqn,
  );
  await expectNoHeaderOverflow(longAccountHeader);

  await page.goto(
    `/accounts/group?prefix=${encodeURIComponent(longGroupFqn)}&page=1&pageSize=25`,
  );
  const longGroupTitle = page.locator("#account-group-title");
  const longGroupPath = longGroupTitle
    .locator(".inline-flex.overflow-hidden.font-mono")
    .first();
  const longGroupHeader = page
    .locator("header")
    .filter({ has: longGroupTitle });
  await expectLongLeafTruncation(longGroupPath, longGroupFqn);
  await expectNoHeaderOverflow(longGroupHeader);
});

test("register standing cells stay single-line through the collapse ladder", async ({
  page,
}) => {
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const joint = findByFqn(accounts, "bank:Chase:joint_checking");
  const sapphire = findByFqn(accounts, "bank:Chase:Sapphire");

  for (const { account, viewports } of [
    {
      account: joint,
      viewports: [
        { width: 1440, height: 900 },
        { width: 620, height: 900 },
      ],
    },
    {
      account: sapphire,
      viewports: [
        { width: 1440, height: 900 },
        { width: 620, height: 900 },
        { width: 480, height: 900 },
      ],
    },
  ]) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`/accounts/${account.account_id}?page=1&pageSize=50`);
      const amountCells = page.locator(
        ".account-register-amount-column [data-testid='amount-text'], .account-register-running-column [data-testid='amount-text'], .account-register-remaining-column [data-testid='amount-text']",
      );
      await expect(amountCells.first()).toBeVisible();
      await expect
        .poll(() =>
          amountCells.evaluateAll((elements) =>
            elements.every((element) => {
              const styles = window.getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              const lineHeight = Number.parseFloat(styles.lineHeight);
              const fontSize = Number.parseFloat(styles.fontSize);
              return (
                rect.width > 1 &&
                styles.whiteSpace === "nowrap" &&
                rect.height <=
                  (Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.4) *
                    1.35
              );
            }),
          ),
        )
        .toBe(true);
      const narrowCreditRegister =
        account.account_id === sapphire.account_id && viewport.width <= 620;
      const balanceHeader = page.getByRole("columnheader", {
        exact: true,
        name: "Balance",
      });
      const remainingHeader = page.getByRole("columnheader", {
        exact: true,
        name: "Remaining credit",
      });
      await expect(balanceHeader).toHaveCount(1);
      await expect(remainingHeader).toHaveCount(
        account.account_id === sapphire.account_id ? 1 : 0,
      );
      if (!narrowCreditRegister) {
        await expect(balanceHeader).toBeVisible();
        if (account.account_id === sapphire.account_id) {
          await expect(remainingHeader).toBeVisible();
        }
      }
      if (narrowCreditRegister) {
        await expect
          .poll(() =>
            page
              .getByTestId("account-register-table-scroll")
              .evaluate((container) => {
                const counterparty = container.querySelector<HTMLElement>(
                  "td.account-register-counterparty-column",
                );
                const containerRect = container.getBoundingClientRect();
                const counterpartyRect = counterparty?.getBoundingClientRect();
                return (
                  counterpartyRect !== undefined &&
                  Math.min(counterpartyRect.right, containerRect.right) -
                    Math.max(counterpartyRect.left, containerRect.left) >
                    1
                );
              }),
          )
          .toBe(true);
        await expect
          .poll(() =>
            page
              .getByTestId("account-register-table-scroll")
              .evaluate((container) => {
                const styles = window.getComputedStyle(container);
                const amountTexts = container.querySelectorAll<HTMLElement>(
                  "tbody tr:first-child :is(.account-register-amount-column, .account-register-running-column, .account-register-remaining-column) [data-testid='amount-text']",
                );
                return {
                  amountCount: amountTexts.length,
                  amountsContained: Array.from(amountTexts).every(
                    (amountText) => {
                      const cell = amountText.closest<HTMLElement>("td");
                      if (!cell) {
                        return false;
                      }
                      const amountRect = amountText.getBoundingClientRect();
                      const cellRect = cell.getBoundingClientRect();
                      return (
                        amountRect.left >= cellRect.left - 1 &&
                        amountRect.right <= cellRect.right + 1
                      );
                    },
                  ),
                  overflowX: styles.overflowX,
                };
              }),
          )
          .toEqual({
            amountCount: 3,
            amountsContained: true,
            overflowX: "hidden",
          });
        await expect
          .poll(() =>
            page.getByTestId("account-header").evaluate((header) => {
              const balanceRows = header.querySelectorAll<HTMLElement>(
                ".account-header-standing dl > div",
              );
              const markers = header.querySelectorAll<HTMLElement>(
                "[data-testid='amount-text'] > .shrink-0",
              );
              return (
                balanceRows.length > 0 &&
                Array.from(balanceRows).every((row) => {
                  const labels = row.querySelectorAll<HTMLElement>("dt");
                  const values = row.querySelectorAll<HTMLElement>("dd");
                  return Array.from(labels).every((label, index) => {
                    const value = values[index];
                    if (!value) {
                      return false;
                    }
                    const labelRect = label.getBoundingClientRect();
                    const valueRect = value.getBoundingClientRect();
                    return labelRect.right <= valueRect.left + 1;
                  });
                }) &&
                markers.length > 0 &&
                Array.from(markers).every(
                  (marker) =>
                    window.getComputedStyle(marker).display !== "none",
                )
              );
            }),
          )
          .toBe(true);
        await expect
          .poll(() =>
            page
              .getByTestId("account-register-table-scroll")
              .evaluate((container) => {
                const row = container.querySelector<HTMLElement>(
                  "[data-testid='account-register-row']",
                );
                if (!row) {
                  return false;
                }
                const containerRect = container.getBoundingClientRect();
                const rowRect = row.getBoundingClientRect();
                const visibleHeight =
                  Math.min(rowRect.bottom, containerRect.bottom) -
                  Math.max(rowRect.top, containerRect.top);
                return visibleHeight >= rowRect.height - 1;
              }),
          )
          .toBe(true);
      }
      if (!narrowCreditRegister) {
        await expect
          .poll(() =>
            page
              .getByTestId("account-register-table-scroll")
              .evaluate((container) => {
                const date = container.querySelector<HTMLElement>(
                  "th.account-register-date-column",
                );
                const remaining = container.querySelector<HTMLElement>(
                  "th.account-register-remaining-column",
                );
                const containerRect = container.getBoundingClientRect();
                const remainingRect = remaining?.getBoundingClientRect();
                return (
                  container.scrollWidth <= container.clientWidth + 1 &&
                  (date?.clientWidth ?? 0) > 1 &&
                  (remainingRect === undefined ||
                    remainingRect.right <= containerRect.right + 1)
                );
              }),
          )
          .toBe(true);
      }
    }
  }
});

test("register skeleton renders while its credit shape resolves", async ({
  page,
}) => {
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const sapphire = findByFqn(accounts, "bank:Chase:Sapphire");
  let releaseHeader: () => void = () => undefined;
  let releaseRecords: () => void = () => undefined;
  let markHeaderRequested: () => void = () => undefined;
  let markRecordsRequested: () => void = () => undefined;
  const headerReleased = new Promise<void>((resolve) => {
    releaseHeader = resolve;
  });
  const recordsReleased = new Promise<void>((resolve) => {
    releaseRecords = resolve;
  });
  const headerRequested = new Promise<void>((resolve) => {
    markHeaderRequested = resolve;
  });
  const recordsRequested = new Promise<void>((resolve) => {
    markRecordsRequested = resolve;
  });
  await page.route(
    new RegExp(`/api/accounts/${sapphire.account_id}(?:\\?|$)`),
    async (route) => {
      markHeaderRequested();
      await headerReleased;
      await route.continue();
    },
  );
  await page.route(
    new RegExp(`/api/accounts/${sapphire.account_id}/records(?:\\?|$)`),
    async (route) => {
      markRecordsRequested();
      await recordsReleased;
      await route.continue();
    },
  );

  try {
    await page.goto(`/accounts/${sapphire.account_id}?page=1&pageSize=50`);
    await Promise.all([headerRequested, recordsRequested]);
    await expect(page.getByTestId("account-register-skeleton")).toHaveAttribute(
      "data-column-count",
      "8",
    );
    releaseHeader();
    await expect(
      page.getByTestId("account-header").getByText("Remaining credit"),
    ).toBeVisible();
    await expect(page.getByTestId("account-register-skeleton")).toHaveAttribute(
      "data-column-count",
      "8",
    );
  } finally {
    releaseHeader();
    releaseRecords();
  }
});

test("register and transaction detail recover after lookup failures", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const account = await createAccount(page, {
    fqn: `e2e:register-lookup-failure:${unique}`,
  });
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const merchant = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E register lookup failure ${unique}`;
  const transactionResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "18.00",
        category_id: category.category_id,
        counterparty_account_id: merchant.account_id,
        currency: "USD",
        funding_account_id: account.account_id,
        initiated_date: "2026-08-01",
        memo,
      },
    },
  );
  expect(transactionResponse.ok()).toBe(true);
  const transaction = (await transactionResponse.json()) as TransactionFixture;

  let transactionFetchCount = 0;
  await page.route(
    `**/api/transactions/${transaction.transaction_id}`,
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      transactionFetchCount += 1;
      if (transactionFetchCount === 1) {
        await route.fulfill({
          body: JSON.stringify({
            code: "internal_error",
            message: "Transaction unavailable",
          }),
          contentType: "application/json",
          status: 500,
        });
        return;
      }
      await route.continue();
    },
  );

  await page.route("**/api/categories?**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        code: "internal_error",
        message: "Lookup unavailable",
      }),
      contentType: "application/json",
      status: 500,
    });
  });

  await page.goto(`/accounts/${account.account_id}`);
  await expect(
    page.getByText("Reference data could not be loaded."),
  ).toBeVisible();
  await page
    .getByTestId("account-register-row")
    .filter({ hasText: memo })
    .click();

  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(
    detailPanel.getByRole("heading", { name: transaction.display_title }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("heading", { name: "Loading transaction" }),
  ).toHaveCount(0);
  await expect(
    detailPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(memo);
  await expect(
    page
      .getByTestId("account-register-row")
      .filter({ hasText: transaction.display_title }),
  ).toBeVisible();
  await detailPanel
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await page
    .getByTestId("account-register-row")
    .filter({ hasText: memo })
    .click();
  await expect(
    detailPanel.getByRole("heading", { name: transaction.display_title }),
  ).toBeVisible();
  expect(transactionFetchCount).toBe(2);

  await page.goto(`/transactions?transaction=${transaction.transaction_id}`);
  const transactionDetailPanel = page.getByTestId("transaction-detail-panel");
  await expect(
    transactionDetailPanel.getByRole("heading", {
      name: transaction.display_title,
    }),
  ).toBeVisible();
  await expect(
    transactionDetailPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(memo);
  await expect(
    transactionDetailPanel.getByRole("heading", {
      name: "Loading transaction",
    }),
  ).toHaveCount(0);

  await page.goto(`/accounts/${account.account_id}?transaction=2147483647`);

  const unavailableDetailPanel = page.getByTestId("transaction-detail-panel");
  await expect(
    unavailableDetailPanel.getByRole("heading", {
      name: "Transaction unavailable",
    }),
  ).toBeVisible();
  await expect(
    unavailableDetailPanel.getByText("Transaction could not be loaded."),
  ).toBeVisible();
  await expect(
    unavailableDetailPanel.getByRole("heading", {
      name: "Loading transaction",
    }),
  ).toHaveCount(0);
});

test("register lifecycle refresh keeps cached transaction detail visible", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const account = await createAccount(page, {
    fqn: `e2e:register-lifecycle:${unique}`,
  });
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const merchant = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E register lifecycle ${unique}`;
  const transactionResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "18.00",
        category_id: category.category_id,
        counterparty_account_id: merchant.account_id,
        currency: "USD",
        funding_account_id: account.account_id,
        initiated_date: "2026-08-01",
        memo,
        settlement: { status: "pending" },
      },
    },
  );
  expect(transactionResponse.ok()).toBe(true);
  const transaction = (await transactionResponse.json()) as TransactionFixture;

  let releaseStaleFetch: (() => void) | undefined;
  const staleFetchReleased = new Promise<void>((resolve) => {
    releaseStaleFetch = resolve;
  });
  let markStaleFetchStarted: (() => void) | undefined;
  const staleFetchStarted = new Promise<void>((resolve) => {
    markStaleFetchStarted = resolve;
  });
  let markStaleFetchSettled: (() => void) | undefined;
  const staleFetchSettled = new Promise<void>((resolve) => {
    markStaleFetchSettled = resolve;
  });
  let transactionFetchCount = 0;
  await page.route(
    `**/api/transactions/${transaction.transaction_id}`,
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      transactionFetchCount += 1;
      if (transactionFetchCount !== 1) {
        await route.continue();
        return;
      }

      const staleResponse = await route.fetch();
      markStaleFetchStarted?.();
      await staleFetchReleased;
      await route.fulfill({ response: staleResponse });
      markStaleFetchSettled?.();
    },
  );

  await page.goto(`/accounts/${account.account_id}`);
  await staleFetchStarted;
  const row = page
    .getByTestId("account-register-row")
    .filter({ hasText: memo });
  await expect(row).toContainText("Resolving transaction");
  await row.click();
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(
    detailPanel.getByRole("heading", { name: transaction.display_title }),
  ).toBeVisible();

  let releaseRefresh: (() => void) | undefined;
  const refreshReleased = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let markRefreshStarted: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    markRefreshStarted = resolve;
  });
  let nextRefreshGate:
    | {
        readonly markStarted: () => void;
        readonly released: Promise<void>;
      }
    | undefined = {
    markStarted: () => {
      markRefreshStarted?.();
    },
    released: refreshReleased,
  };
  await page.route("**/api/accounts?**", async (route) => {
    const url = new URL(route.request().url());
    const refreshGate = nextRefreshGate;
    if (
      refreshGate &&
      route.request().method() === "GET" &&
      url.searchParams.get("is_featured") === "true"
    ) {
      nextRefreshGate = undefined;
      refreshGate.markStarted();
      await refreshGate.released;
    }
    await route.continue();
  });

  await detailPanel.getByRole("button", { name: "Cancel" }).click();
  await refreshStarted;
  await expect(
    detailPanel.getByRole("heading", { name: transaction.display_title }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("button", { name: "Restore" }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("heading", { name: "Loading transaction" }),
  ).toHaveCount(0);
  expect(transactionFetchCount).toBe(2);

  releaseRefresh?.();
  await expect(page.getByText("Transaction cancelled.")).toBeVisible();

  releaseStaleFetch?.();
  await staleFetchSettled;
  await detailPanel
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await expect(detailPanel).toBeHidden();
  await row.click();
  await expect(
    detailPanel.getByRole("button", { name: "Restore" }),
  ).toBeVisible();
  expect(transactionFetchCount).toBe(2);

  await detailPanel.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Transaction restored.")).toBeVisible();
  await expect(
    detailPanel.getByRole("button", { exact: true, name: "Post" }),
  ).toBeVisible();

  let releasePostRefresh: (() => void) | undefined;
  const postRefreshReleased = new Promise<void>((resolve) => {
    releasePostRefresh = resolve;
  });
  let markPostRefreshStarted: (() => void) | undefined;
  const postRefreshStarted = new Promise<void>((resolve) => {
    markPostRefreshStarted = resolve;
  });
  nextRefreshGate = {
    markStarted: () => {
      markPostRefreshStarted?.();
    },
    released: postRefreshReleased,
  };

  await detailPanel.getByRole("button", { exact: true, name: "Post" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { exact: true, name: "Post transaction" })
    .click();
  await postRefreshStarted;
  await expect(
    detailPanel.getByRole("heading", { name: transaction.display_title }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("heading", { name: "Loading transaction" }),
  ).toHaveCount(0);

  releasePostRefresh?.();
  await expect(page.getByText("Transaction posted.")).toBeVisible();
  await detailPanel
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await row.click();
  await expect(
    detailPanel.getByRole("button", { exact: true, name: "Post" }),
  ).toHaveCount(0);
  await expect(
    detailPanel.getByRole("button", { exact: true, name: "Cancel" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Feature account" }).click();
  await expect(page.getByText("Account featured.")).toBeVisible();
  const registerNotice = page.getByRole("button", {
    name: "Dismiss notice: Transaction posted.",
  });
  const featuredNotice = page.getByRole("button", {
    name: "Dismiss notice: Account featured.",
  });
  const [registerNoticeBox, featuredNoticeBox] = await Promise.all([
    registerNotice.boundingBox(),
    featuredNotice.boundingBox(),
  ]);
  expect(registerNoticeBox).not.toBeNull();
  expect(featuredNoticeBox).not.toBeNull();
  expect(
    (registerNoticeBox?.y ?? 0) + (registerNoticeBox?.height ?? 0),
  ).toBeLessThanOrEqual(featuredNoticeBox?.y ?? 0);
});

test("account page renders header and paginated running-balance register", async ({
  browserName,
  page,
}) => {
  const slug = browserName.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const account = await createAccount(page, {
    fqn: `e2e:accountpage:${unique}:Card`,
  });
  const hiddenAccount = await createHiddenAccount(
    page,
    `e2e:accountpage:${unique}:Hidden`,
  );
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const merchant = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const transactions: TransactionFixture[] = [];

  const creditLimitResponse = await page.request.post(
    `/api/accounts/${account.account_id}/credit-limit-history`,
    {
      data: {
        credit_limit: "5000.00",
        effective_date: "2026-05-01",
      },
    },
  );
  expect(creditLimitResponse.ok()).toBe(true);

  for (let index = 1; index <= 27; index += 1) {
    const response = await page.request.post("/api/transactions/spend", {
      data: {
        amount: `${10 + index}.00`,
        category_id: category.category_id,
        counterparty_account_id: merchant.account_id,
        currency: "USD",
        funding_account_id: account.account_id,
        initiated_date: `2026-05-${String(index).padStart(2, "0")}`,
        memo: `E2E account register ${unique} ${String(index).padStart(2, "0")}`,
        ...(index === 27 ? { settlement: { status: "pending" } } : {}),
      },
    });
    expect(response.ok()).toBe(true);
    transactions.push((await response.json()) as TransactionFixture);
  }

  await page.route(
    `**/api/accounts/${account.account_id}/records**`,
    async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("offset") === "25") {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      await route.continue();
    },
  );

  const headerBalanceResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts/balances" &&
      url.searchParams
        .getAll("account_ids")
        .includes(String(account.account_id))
    );
  });
  const recordsRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === `/api/accounts/${account.account_id}/records` &&
      url.searchParams.get("include_running_balance") === "true" &&
      url.searchParams.get("limit") === "25" &&
      url.searchParams.get("offset") === "0" &&
      url.searchParams.get("sort") === "initiated_date" &&
      url.searchParams.get("sort_dir") === "desc"
    );
  });
  const recordsResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${account.account_id}/records` &&
      url.searchParams.get("offset") === "0"
    );
  });

  await page.goto(`/accounts/${account.account_id}?page=1&pageSize=25`);
  await recordsRequest;
  const balancesBody = (await (await headerBalanceResponse).json()) as {
    readonly balances: readonly BalanceFixture[];
  };
  const recordsBody = (await (await recordsResponse).json()) as {
    readonly records: readonly JournalRecordFixture[];
    readonly total_count: number;
  };
  const firstRecord = requireDefined(recordsBody.records[0], "first record");
  const secondRecord = requireDefined(recordsBody.records[1], "second record");
  const thirdRecord = requireDefined(recordsBody.records[2], "third record");
  const firstTransaction = requireDefined(
    transactions.find(
      (transaction) =>
        transaction.transaction_id === firstRecord.transaction_id,
    ),
    "first transaction",
  );
  const secondTransaction = requireDefined(
    transactions.find(
      (transaction) =>
        transaction.transaction_id === secondRecord.transaction_id,
    ),
    "second transaction",
  );
  const thirdTransaction = requireDefined(
    transactions.find(
      (transaction) =>
        transaction.transaction_id === thirdRecord.transaction_id,
    ),
    "third transaction",
  );
  expect(firstRecord.posted_date).toBeUndefined();
  expect(firstRecord.pending_date).toBeTruthy();
  expect(secondRecord.posted_date).toBeTruthy();
  expect(recordsBody.total_count).toBe(27);
  expect(
    Date.parse(firstRecord.initiated_date),
    "records are reverse chronological",
  ).toBeGreaterThan(Date.parse(secondRecord.initiated_date));

  const balance = balancesBody.balances.find(
    (row) => row.account_id === account.account_id,
  );
  expect(balance).toBeDefined();
  expect(firstRecord.running_balance).toBe(balance?.current_balance);
  expect(firstRecord.remaining_credit).toBe(balance?.remaining_credit);

  await expect(
    page.getByRole("heading", { name: account.display_label }),
  ).toBeVisible();
  await expect(page.getByText("Owned", { exact: true })).toBeVisible();
  await expect(page.getByText("USD", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Remaining credit", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Full balance", { exact: true })).toBeVisible();
  await expect(page.getByText("Posted balance", { exact: true })).toBeVisible();
  await expect(page.getByText("Current", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Posted", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Current USD")).toHaveCount(0);
  await expect(page.getByText("Posted USD")).toHaveCount(0);
  const accountHeader = page.getByTestId("account-header");
  const currentBalanceText = formatUsdMarkerAmount(
    balance?.current_balance ?? "0",
  );
  const postedBalanceText = formatUsdMarkerAmount(
    balance?.posted_balance ?? "0",
  );
  expect(balance?.posted_balance).not.toBe(balance?.current_balance);
  await expect(accountHeader.getByText(currentBalanceText)).toHaveCount(1);
  await expect(accountHeader.getByText(postedBalanceText)).toHaveCount(1);
  await expect(
    accountHeader.getByText(
      formatUsdMarkerAmount(balance?.remaining_credit ?? "0"),
    ),
  ).toHaveCount(1);
  await expect(page.getByText("Credit limit", { exact: true })).toBeVisible();
  await expect(page.getByText("Credit limit USD")).toHaveCount(0);
  await expect(accountHeader.getByText("5,000.00 $")).toHaveCount(2);
  await expect(
    page.locator("li").filter({ hasText: "5,000.00 $" }).getByText("May 1"),
  ).toBeVisible();
  await expect(
    accountHeader.getByTestId("credit-limit-indicator"),
  ).toBeVisible();
  await expect(
    accountHeader.getByRole("button", {
      exact: true,
      name: "Has credit limit",
    }),
  ).toHaveCount(0);

  const firstRow = page
    .getByTestId("account-register-row")
    .filter({ hasText: firstRecord.memo ?? "" })
    .first();
  await expect(firstRow).toBeVisible();
  await expect(firstRow).toContainText(
    `${account.display_label} → ${merchant.display_label}`,
  );
  await expect(firstRow).toContainText("PowellsBooks");
  await expect(firstRow).toContainText(
    formatUsdMarkerAmount(firstRecord.amount),
  );
  await expect(firstRow).toContainText(
    formatUsdMarkerAmount(firstRecord.running_balance ?? "0"),
  );
  await expect(firstRow).toContainText(
    formatUsdMarkerAmount(firstRecord.remaining_credit ?? "0"),
  );

  await expect(
    page.getByTestId("account-register-pagination-footer"),
  ).toContainText("Page 1 of 2");

  await firstRow.click();
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${firstTransaction.transaction_id}(?:&|$)`),
  );
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();
  await detailPanel
    .getByRole("button", { name: "Close transaction detail" })
    .hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Close transaction detail" }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("heading", {
      name: firstTransaction.display_title,
    }),
  ).toBeVisible();
  await expect(detailPanel.getByText("Journal records")).toBeVisible();
  await expect(
    detailPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(firstRecord.memo ?? "");
  await expect(detailPanel.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(
    detailPanel.getByRole("button", { name: "Create template" }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("button", { name: "Duplicate" }),
  ).toBeVisible();
  await expect(
    detailPanel.getByRole("button", { name: "Split" }),
  ).toBeVisible();
  await expect(detailPanel.getByRole("button", { name: "Post" })).toBeVisible();
  await expect(
    detailPanel.getByRole("button", { name: "Cancel" }),
  ).toBeVisible();
  await expect(
    detailPanel.getByText(account.display_label, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    detailPanel.getByText("merchant:PowellsBooks").first(),
  ).toBeVisible();
  const detailRecordsTable = detailPanel.getByTestId(
    "transaction-detail-records-table",
  );
  const detailAmountText = detailRecordsTable
    .locator("[data-label='Amount'] [data-testid='amount-text']")
    .filter({ hasText: formatUsdMarkerAmount(firstRecord.amount) })
    .first();
  const detailAccountPath = detailRecordsTable
    .locator("[data-label='Account']")
    .filter({ hasText: "merchant:PowellsBooks" })
    .locator("[data-slot='tooltip-trigger']")
    .first();
  await expect(detailAmountText).toBeVisible();
  await expect(detailAccountPath).toBeVisible();
  await expect
    .poll(async () => {
      const { height, lineHeight } = await renderedLineHeight(detailAmountText);
      return height <= lineHeight * 1.35;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const { height, lineHeight } =
        await renderedLineHeight(detailAccountPath);
      return height <= lineHeight * 1.35;
    })
    .toBe(true);

  const secondRow = page
    .getByTestId("account-register-row")
    .filter({ hasText: secondRecord.memo ?? "" })
    .first();
  await page
    .getByRole("heading", { exact: true, name: account.display_label })
    .click();
  await expect(detailPanel).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]transaction=/);

  await firstRow.click();
  await expect(detailPanel).toBeVisible();
  await secondRow.click({ position: { x: 16, y: 16 } });
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${secondTransaction.transaction_id}(?:&|$)`),
  );
  await expect(
    detailPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(secondRecord.memo ?? "");

  await page.goBack();
  await expect(detailPanel).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]transaction=/);
  await page.goForward();
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(detailPanel).toBeHidden();
  await firstRow.focus();
  await expect(firstRow).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(detailPanel).toBeVisible();
  await expect(firstRow).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(secondRow).toBeFocused();
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${secondTransaction.transaction_id}(?:&|$)`),
  );
  await expect(
    detailPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(secondRecord.memo ?? "");

  await page.keyboard.press("ArrowDown");
  const thirdRow = page
    .getByTestId("account-register-row")
    .filter({ hasText: thirdRecord.memo ?? "" })
    .first();
  await expect(thirdRow).toBeFocused();
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${thirdTransaction.transaction_id}(?:&|$)`),
  );
  await expect(
    detailPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(thirdRecord.memo ?? "");

  await page.keyboard.press("Escape");
  await expect(detailPanel).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]transaction=/);
  await expect(thirdRow).toBeFocused();

  await page.goto(
    `/accounts/${account.account_id}?page=1&pageSize=25&transaction=${firstTransaction.transaction_id}`,
  );
  const deepLinkedDetailPanel = page.getByTestId("transaction-detail-panel");
  await expect(deepLinkedDetailPanel).toBeVisible();
  await expect(
    deepLinkedDetailPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(firstRecord.memo ?? "");
  await expect(deepLinkedDetailPanel).toBeFocused();
  const pageSizeResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${account.account_id}/records` &&
      url.searchParams.get("include_running_balance") === "true" &&
      url.searchParams.get("limit") === "50" &&
      url.searchParams.get("offset") === "0"
    );
  });
  await page.getByLabel("Rows").click();
  await page.getByRole("option", { exact: true, name: "50" }).click();
  await pageSizeResponse;
  await expectAccountRegisterUrl(page, 1, 50);
  await expect(page).not.toHaveURL(/[?&]transaction=/);
  await expect(deepLinkedDetailPanel).toBeHidden();

  await page.goto(
    `/accounts/${account.account_id}?page=1&pageSize=25&transaction=${firstTransaction.transaction_id}`,
  );
  await expect(deepLinkedDetailPanel).toBeVisible();
  await deepLinkedDetailPanel
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await expect(deepLinkedDetailPanel).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]transaction=/);

  const secondPageResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${account.account_id}/records` &&
      url.searchParams.get("include_running_balance") === "true" &&
      url.searchParams.get("limit") === "25" &&
      url.searchParams.get("offset") === "25"
    );
  });
  await page.goto(
    `/accounts/${account.account_id}?page=1&pageSize=25&transaction=${firstTransaction.transaction_id}`,
  );
  await expect(deepLinkedDetailPanel).toBeVisible();
  await page.getByRole("button", { name: "Next" }).evaluate((element) => {
    if (element instanceof HTMLButtonElement) {
      element.click();
    }
  });
  await secondPageResponse;
  await expectAccountRegisterUrl(page, 2, 25);
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${firstTransaction.transaction_id}(?:&|$)`),
  );
  await expect(deepLinkedDetailPanel).toBeVisible();
  await expect(
    page.getByTestId("account-register-pagination-footer"),
  ).toContainText("Page 2 of 2");
  await expect(
    page
      .getByTestId("account-register-row")
      .filter({ hasText: `E2E account register ${unique} 02` }),
  ).toBeVisible();
  await deepLinkedDetailPanel
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await page.getByRole("button", { name: "Previous" }).click();
  await expectAccountRegisterUrl(page, 1, 25);
  await expect(page).not.toHaveURL(/[?&]transaction=/);
  await expect(deepLinkedDetailPanel).toBeHidden();

  await page.goto(`/accounts/${hiddenAccount.account_id}`);
  await expect(page.getByRole("heading", { name: "Hidden" })).toBeVisible();
  await expect(page.getByLabel("Hidden account")).toBeVisible();
});

test("account group page renders subtotals and combined prefix register", async ({
  browserName,
  page,
}) => {
  const slug = browserName.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const prefix = `aaa_group:${unique}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const siblingWallet = findByFqn(accounts, "bank:Ally:emergency_savings");
  const siblingMerchant = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const [wallet, fees] = await Promise.all([
    createAccount(page, { fqn: `${prefix}:GroupBalance${unique}` }),
    createAccount(page, { accountType: "flow", fqn: `${prefix}:Fees` }),
  ]);
  const fundingAccounts = Array.from({ length: 13 }, () => wallet);
  const groupRecords = fundingAccounts.flatMap((fundingAccount, index) => {
    const transactionIndex = index + 1;
    const amount = `${10 + transactionIndex}.00`;
    const memo = `E2E group register ${unique} ${String(transactionIndex).padStart(2, "0")}`;
    return [
      {
        account_id: fundingAccount.account_id,
        amount: `-${amount}`,
        category_id: null,
        currency: "USD",
        memo,
        settlement: { status: "posted" },
        reconciliation_status: "unreconciled",
        source: "manual",
      },
      {
        account_id: fees.account_id,
        amount,
        category_id: category.category_id,
        currency: "USD",
        memo,
        settlement: null,
        reconciliation_status: "unreconciled",
        source: "manual",
      },
    ];
  });
  const groupResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-05-01",
      records: groupRecords,
    },
  });
  expect(groupResponse.ok()).toBe(true);
  const groupTransaction = (await groupResponse.json()) as TransactionFixture;

  const siblingResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "19.00",
      category_id: category.category_id,
      counterparty_account_id: siblingMerchant.account_id,
      currency: "USD",
      funding_account_id: siblingWallet.account_id,
      initiated_date: "2026-05-20",
      memo: `E2E sibling group ${unique}`,
    },
  });
  expect(siblingResponse.ok()).toBe(true);

  const groupUrl = `/accounts/group?prefix=${encodeURIComponent(prefix)}&page=1&pageSize=25`;
  const recordsRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/records" &&
      url.searchParams.get("account_fqn_prefix") === prefix &&
      url.searchParams.get("limit") === "25" &&
      url.searchParams.get("offset") === "0" &&
      url.searchParams.get("sort") === "initiated_date" &&
      url.searchParams.get("sort_dir") === "desc" &&
      !url.searchParams.has("include_running_balance") &&
      !url.searchParams.has("account_id")
    );
  });
  const recordsResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/records" &&
      url.searchParams.get("account_fqn_prefix") === prefix &&
      url.searchParams.get("offset") === "0"
    );
  });

  await page.goto(groupUrl);
  await recordsRequest;
  const recordsBody = (await (await recordsResponse).json()) as {
    readonly records: readonly JournalRecordFixture[];
    readonly total_count: number;
  };
  expect(recordsBody.total_count).toBe(26);
  const walletRecord = requireDefined(
    recordsBody.records.find(
      (record) => record.account_id === wallet.account_id,
    ),
    "wallet record",
  );
  const feesRecord = requireDefined(
    recordsBody.records.find((record) => record.account_id === fees.account_id),
    "fees record",
  );
  const firstRecord = requireDefined(recordsBody.records[0], "first record");
  const secondRecord = requireDefined(recordsBody.records[1], "second record");
  expect(firstRecord.transaction_id).toBe(groupTransaction.transaction_id);

  await expect(
    page.getByRole("heading", {
      name: new RegExp(`^${escapeRegExp(prefix).replace(":", ":\\s*")}$`),
    }),
  ).toBeVisible();
  await expect(page.getByTestId("account-group-subtotals")).toContainText(
    "Owned funds · 1 account",
  );
  await expect(
    page
      .getByTestId("account-group-balance-row")
      .filter({ hasText: `GroupBalance${unique}` })
      .getByRole("link"),
  ).toHaveAttribute("href", `/accounts/${wallet.account_id}`);
  await expect(
    page
      .getByTestId("account-group-subtotals")
      .getByTestId("approximate-usd-amount"),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Account" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Running" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("columnheader", { name: "Remaining credit" }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(`[data-record-id="${walletRecord.record_id}"]`)
      .locator("td")
      .nth(1),
  ).toContainText(`GroupBalance${unique}`);
  await expect(
    page
      .locator(`[data-record-id="${feesRecord.record_id}"]`)
      .locator("td")
      .nth(1),
  ).toContainText("Fees");
  await expect(page.getByText(`E2E sibling group ${unique}`)).toHaveCount(0);
  await expect(
    page.getByTestId("account-register-pagination-footer"),
  ).toContainText("Page 1 of 2");

  const firstRow = page.locator(`[data-record-id="${firstRecord.record_id}"]`);
  const secondRow = page.locator(
    `[data-record-id="${secondRecord.record_id}"]`,
  );
  await firstRow.click();
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${firstRecord.transaction_id}(?:&|$)`),
  );
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();
  await expect(
    detailPanel.getByRole("heading", {
      name: groupTransaction.display_title,
    }),
  ).toBeVisible();
  const visibleTransactionRows = page.locator(
    `[data-transaction-id="${groupTransaction.transaction_id}"]`,
  );
  expect(
    await visibleTransactionRows.evaluateAll((rows) =>
      rows.every((row) => getComputedStyle(row).outlineStyle === "none"),
    ),
  ).toBe(true);

  await secondRow.click({ position: { x: 16, y: 16 } });
  await expect(detailPanel).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${secondRecord.transaction_id}(?:&|$)`),
  );

  await firstRow.focus();
  await Promise.all([
    expect(secondRow).toBeFocused(),
    page.keyboard.press("ArrowDown"),
  ]);
  await expect
    .poll(() => secondRow.evaluate((row) => getComputedStyle(row).outlineStyle))
    .toBe("solid");
  expect(
    await visibleTransactionRows.evaluateAll(
      (rows, focusedRecordId) =>
        rows
          .filter(
            (row) => row.getAttribute("data-record-id") !== focusedRecordId,
          )
          .every((row) => getComputedStyle(row).outlineStyle === "none"),
      String(secondRecord.record_id),
    ),
  ).toBe(true);
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${secondRecord.transaction_id}(?:&|$)`),
  );

  await page.keyboard.press("Escape");
  await expect(detailPanel).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]transaction=/);
  await expect(secondRow).toBeFocused();

  await page.goto(
    `/accounts/group?prefix=${encodeURIComponent(prefix)}&page=1&pageSize=25&transaction=${firstRecord.transaction_id}`,
  );
  await expect(detailPanel).toBeVisible();
  await expect(
    detailPanel.getByRole("heading", {
      name: groupTransaction.display_title,
    }),
  ).toBeVisible();
  await expect(detailPanel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detailPanel).toBeHidden();

  const secondPageResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/records" &&
      url.searchParams.get("account_fqn_prefix") === prefix &&
      url.searchParams.get("limit") === "25" &&
      url.searchParams.get("offset") === "25"
    );
  });
  await page.getByRole("button", { name: "Next" }).click();
  await secondPageResponse;
  await expectAccountRegisterUrl(page, 2, 25);
  await expect(page).not.toHaveURL(/[?&]transaction=/);
  await expect(
    page.getByTestId("account-register-pagination-footer"),
  ).toContainText("Page 2 of 2");

  await page.goto("/accounts");
  const groupTreeRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: unique })
    .first();
  await expect(groupTreeRow).toHaveAttribute(
    "aria-label",
    `Open account group ${prefix}`,
  );
  await groupTreeRow.click();
  await expect(page).toHaveURL(
    new RegExp(`/accounts/group\\?prefix=${encodeURIComponent(prefix)}$`),
  );

  await page.goto("/overview");
  const overviewGroupLink = page
    .getByTestId("overview-balance-group")
    .filter({ hasText: "bank" })
    .getByRole("link", { exact: true, name: "bank" });
  await expect(overviewGroupLink).toHaveAttribute(
    "href",
    "/accounts/group?prefix=bank",
  );
  await overviewGroupLink.click();
  await expect(page).toHaveURL("/accounts/group?prefix=bank");
});

test("account tree rows and entry links navigate to account register pages", async ({
  page,
}) => {
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const joint = findByFqn(accounts, "bank:Chase:joint_checking");
  const sapphire = findByFqn(accounts, "bank:Chase:Sapphire");

  await page.goto("/accounts");
  const jointTreeRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "joint_checking" })
    .first();
  await expect(jointTreeRow).toHaveAttribute(
    "aria-label",
    accountTreeAccessibleName(joint),
    { timeout: 10_000 },
  );
  await jointTreeRow.click();
  await expect(page).toHaveURL(new RegExp(`/accounts/${joint.account_id}$`));
  await expect(
    page.getByRole("heading", { name: "joint_checking" }),
  ).toBeVisible();

  await page.goto("/status");
  const jointStripLink = page
    .getByTestId("featured-balance-row")
    .filter({ hasText: "joint_checking" })
    .getByTestId("featured-balance-name");
  await expect(jointStripLink).toHaveAttribute(
    "href",
    `/accounts/${joint.account_id}`,
  );
  await jointStripLink.click();
  await expect(page).toHaveURL(new RegExp(`/accounts/${joint.account_id}$`));
  await expect(
    page.getByRole("heading", { name: "joint_checking" }),
  ).toBeVisible();

  await page.goto("/overview");
  const sapphireOverviewLink = page
    .getByTestId("overview-balance-row")
    .filter({ hasText: "Sapphire" })
    .getByRole("link");
  await expect(sapphireOverviewLink).toHaveAttribute(
    "href",
    `/accounts/${sapphire.account_id}`,
  );
  await sapphireOverviewLink.click();
  await expect(page).toHaveURL(new RegExp(`/accounts/${sapphire.account_id}$`));
  await expect(page.getByRole("heading", { name: "Sapphire" })).toBeVisible();
});

test("accounts tree moves and renames account paths", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const sourcePrefix = `aaa_restructure:${unique}:Old`;
  const destinationPrefix = `aaa_restructure:${unique}:New`;
  const leafSource = `aaa_restructure:${unique}:Solo`;
  const leafDestination = `aaa_restructure:${unique}:SoloRenamed`;
  await Promise.all([
    createAccount(page, { fqn: `${sourcePrefix}:Checking` }),
    createAccount(page, { fqn: `${sourcePrefix}:Savings` }),
    createAccount(page, { fqn: leafSource }),
  ]);

  await page.goto("/accounts");
  await page.getByLabel("Search").fill(sourcePrefix);
  await expect
    .poll(() =>
      page
        .getByTestId("accounts-table-scroll")
        .getByRole("columnheader")
        .evaluateAll((headers) =>
          headers
            .filter((header) => {
              const style = getComputedStyle(header);
              return (
                style.display !== "none" &&
                style.visibility !== "collapse" &&
                header.getBoundingClientRect().width >= 1
              );
            })
            .map((header) => header.textContent?.trim() ?? ""),
        ),
    )
    .toEqual(["Name", "Type", "Currency", "Balance", ""]);
  const sourceGroupRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: sourcePrefix })
    .first();
  await expect(sourceGroupRow).toBeVisible({ timeout: 10_000 });
  const sourceGroupMoveButton = sourceGroupRow.getByRole("button", {
    name: "Move or rename",
  });
  await expect
    .poll(() =>
      sourceGroupMoveButton.evaluate(
        (button) => getComputedStyle(button).opacity,
      ),
    )
    .toBe("1");
  await sourceGroupMoveButton.click();
  const groupDialog = page.getByRole("dialog", { name: "Move or rename" });
  await expect(groupDialog).toBeVisible();
  await expect(groupDialog.getByLabel("From")).toContainText("Old");
  await groupDialog.getByLabel("To").fill(destinationPrefix);
  const groupMove = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts/restructure" &&
      response.request().method() === "POST"
    );
  });
  await groupDialog.getByRole("button", { name: "Move" }).click();
  const groupResponse = await groupMove;
  expect(groupResponse.status()).toBe(200);
  await expect(page.getByText("Moved 2 account(s).")).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: sourcePrefix }),
  ).toHaveCount(0, { timeout: 10_000 });

  await page.getByLabel("Search").fill(destinationPrefix);
  await expect(
    page
      .getByTestId("accounts-tree-row")
      .filter({ hasText: destinationPrefix })
      .first(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "Checking" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "Savings" }),
  ).toBeVisible();

  await page.getByLabel("Search").fill(leafSource);
  const leafRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Solo" })
    .first();
  await expect(leafRow).toBeVisible({ timeout: 10_000 });
  await leafRow.getByRole("button", { name: "Move or rename" }).click();
  const leafDialog = page.getByRole("dialog", { name: "Move or rename" });
  await leafDialog.getByLabel("To").fill(leafDestination);
  const leafMove = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts/restructure" &&
      response.request().method() === "POST"
    );
  });
  await leafDialog.getByRole("button", { name: "Move" }).click();
  const leafResponse = await leafMove;
  expect(leafResponse.status()).toBe(200);
  await expect(page.getByText("Moved 1 account(s).")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByLabel("Search").fill(leafDestination);
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "SoloRenamed" }),
  ).toBeVisible({ timeout: 10_000 });
});

test("account restructure invalidates a cached register before revisit", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const sourceFqn = `e2e:register-invalidation:${unique}:Old`;
  const destinationFqn = `e2e:register-invalidation:${unique}:New`;
  const transactionMemo = `E2E register invalidation ${unique}`;
  const [account, destinationAccount] = await Promise.all([
    createAccount(page, { fqn: sourceFqn }),
    createAccount(page, {
      fqn: `e2e:register-invalidation-destination:${unique}`,
    }),
  ]);
  await page.goto(`/accounts/${account.account_id}`);
  await expect(page.getByText("No records", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New transaction" }),
  ).toHaveCount(0);

  await page.goto("/accounts");
  const transferResponse = await page.request.post(
    "/api/transactions/transfer",
    {
      data: {
        amount: "12.34",
        currency: "USD",
        destination_account_id: destinationAccount.account_id,
        initiated_date: "2026-07-31",
        memo: transactionMemo,
        source_account_id: account.account_id,
      },
    },
  );
  expect(transferResponse.ok()).toBe(true);
  await page.getByLabel("Search").fill(sourceFqn);
  const sourceRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Old" })
    .first();
  await expect(sourceRow).toBeVisible({ timeout: 10_000 });
  await sourceRow.getByRole("button", { name: "Move or rename" }).click();
  const restructureDialog = page.getByRole("dialog", {
    name: "Move or rename",
  });
  await fillAndExpectValue(restructureDialog.getByLabel("To"), destinationFqn);
  await restructureDialog.getByRole("button", { name: "Move" }).click();
  await expect(page.getByText("Moved 1 account(s).")).toBeVisible();
  await page.getByLabel("Search").fill(destinationFqn);
  const destinationRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "New" })
    .first();
  await expect(destinationRow).toBeVisible({ timeout: 10_000 });
  await destinationRow.click();

  await expect(page.getByRole("heading", { name: "New" })).toBeVisible();
  await expect(page.getByTestId("account-header")).toContainText(
    `${unique}:New`,
  );
  await expect(
    page.getByTestId("account-register-row").filter({
      hasText: transactionMemo,
    }),
  ).toBeVisible();
});

test("accounts tree restructure handles conflicts and cancel focus", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const source = `aaa_restructure:${unique}:Source`;
  const target = `aaa_restructure:${unique}:Target:Child`;
  const cancelSource = `aaa_restructure:${unique}:Cancel`;
  const cancelDestination = `aaa_restructure:${unique}:Cancelled`;
  await Promise.all([
    createAccount(page, { fqn: source }),
    createAccount(page, { fqn: target }),
    createAccount(page, { fqn: cancelSource }),
  ]);

  await page.goto("/accounts");
  await page.getByLabel("Search").fill(source);
  const sourceRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Source" })
    .first();
  await expect(sourceRow).toBeVisible({ timeout: 10_000 });
  await sourceRow.getByRole("button", { name: "Move or rename" }).click();
  const conflictDialog = page.getByRole("dialog", { name: "Move or rename" });
  await conflictDialog
    .getByLabel("To")
    .fill(`aaa_restructure:${unique}:Target`);
  const conflictMove = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts/restructure" &&
      response.request().method() === "POST"
    );
  });
  await conflictDialog.getByRole("button", { name: "Move" }).click();
  const conflictResponse = await conflictMove;
  expect(conflictResponse.status()).toBe(409);
  await expect(conflictDialog).toBeVisible();
  await expect(
    conflictDialog.getByText(
      "account destination fqn conflicts with existing account hierarchy",
    ),
  ).toBeVisible();
  await conflictDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(conflictDialog).toBeHidden();

  await fillAndExpectValue(page.getByLabel("Search"), cancelSource);
  const cancelRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Cancel" })
    .first();
  await expect(cancelRow).toBeVisible({ timeout: 10_000 });
  const cancelOpenButton = cancelRow.getByRole("button", {
    name: "Move or rename",
  });
  await expect
    .poll(() =>
      cancelOpenButton.evaluate((button) => getComputedStyle(button).opacity),
    )
    .toBe("1");
  await cancelOpenButton.focus();
  await expect(cancelOpenButton).toBeFocused();
  await cancelOpenButton.click();
  const escapeDialog = page.getByRole("dialog", { name: "Move or rename" });
  await expect(escapeDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(escapeDialog).toBeHidden();
  await expect(cancelOpenButton).toBeFocused();

  await cancelOpenButton.click();
  const cancelDialog = page.getByRole("dialog", { name: "Move or rename" });
  await cancelDialog.getByLabel("To").fill(cancelDestination);
  await cancelDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(cancelDialog).toBeHidden();
  await expect(cancelOpenButton).toBeFocused();
  await expect(cancelRow).toBeVisible();
  await page.getByLabel("Search").fill(cancelDestination);
  await expect(
    page
      .getByTestId("accounts-tree-row")
      .filter({ hasText: cancelDestination }),
  ).toHaveCount(0);
});

test("accounts tree row quick actions hide feature and delete rows", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const base = `aaa_quick:${unique}`;
  const hiddenAccount = await createAccount(page, {
    fqn: `${base}:HideMe`,
  });
  const featuredAccount = await createAccount(page, {
    fqn: `${base}:FeatureMe`,
  });
  const leafDeleteAccount = await createAccount(page, {
    fqn: `${base}:DeleteLeaf`,
  });
  const blockedAccount = await createAccount(page, {
    fqn: `${base}:BlockedLeaf`,
  });

  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const merchant = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const createBlockingSpend = async (
    fundingAccountId: number,
    memo: string,
  ): Promise<void> => {
    const response = await page.request.post("/api/transactions/spend", {
      data: {
        amount: "4.25",
        category_id: category.category_id,
        counterparty_account_id: merchant.account_id,
        currency: "USD",
        funding_account_id: fundingAccountId,
        initiated_date: "2026-03-01",
        memo,
      },
    });
    expect(response.ok()).toBe(true);
  };
  await createBlockingSpend(blockedAccount.account_id, `${base}:blocked`);

  await page.goto("/accounts");

  await page.getByLabel("Search").fill(hiddenAccount.fqn);
  const hiddenRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "HideMe" })
    .first();
  await expect(hiddenRow).toBeVisible();
  const hideRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${hiddenAccount.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  await hiddenRow.getByRole("button", { name: "Hide account" }).click();
  await hideRequest;
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "HideMe" }),
  ).toHaveCount(0);
  await page.getByLabel("Include hidden").click();
  const includedHiddenRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "HideMe" })
    .first();
  await expect(includedHiddenRow.getByLabel("Hidden account")).toBeVisible();

  await page.getByLabel("Search").fill(featuredAccount.fqn);
  const featuredRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "FeatureMe" })
    .first();
  await expect(featuredRow).toBeVisible();
  await expectFeaturedStarTreatment(
    featuredRow.getByRole("button", { name: "Feature account" }),
    "rgb(107, 102, 127)",
  );
  const featureRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${featuredAccount.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  await featuredRow.getByRole("button", { name: "Feature account" }).click();
  await featureRequest;
  await expect(
    featuredRow.getByRole("button", { name: "Unfeature account" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expectFeaturedStarTreatment(
    featuredRow.getByRole("button", { name: "Unfeature account" }),
    "rgb(122, 93, 0)",
    filledFeaturedStarPath,
  );
  await expect(
    page.getByTestId("featured-balance-row").filter({ hasText: "FeatureMe" }),
  ).toBeVisible({ timeout: 10_000 });
  const unfeatureRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${featuredAccount.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  await featuredRow.getByRole("button", { name: "Unfeature account" }).click();
  await unfeatureRequest;
  const revertedFeatureToggle = featuredRow.getByRole("button", {
    name: "Feature account",
  });
  await expect(revertedFeatureToggle).toHaveAttribute("aria-pressed", "false");
  await page.mouse.move(0, 0);
  await expectFeaturedStarTreatment(
    revertedFeatureToggle,
    "rgb(107, 102, 127)",
  );
  await featuredRow.hover();
  await expect(
    featuredRow.getByRole("button", { name: "Delete account" }),
  ).not.toHaveAttribute("aria-disabled", "true");

  await page.getByLabel("Search").fill(blockedAccount.fqn);
  const blockedRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "BlockedLeaf" })
    .first();
  await expect(blockedRow).toBeVisible();
  await blockedRow.hover();
  const blockedDelete = blockedRow.getByRole("button", {
    name: "Delete account",
  });
  await expect(blockedDelete).toHaveAttribute("aria-disabled", "true");
  await blockedDelete.hover();
  await expect(
    page.getByText("Account has active dependent records."),
  ).toBeVisible();
  const blockedEditButton = blockedRow.getByRole("button", {
    name: "Edit account",
  });
  await blockedEditButton.click();
  const blockedEditPanel = page.getByRole("dialog", {
    name: "Edit account",
  });
  await expect(blockedEditPanel).toBeVisible();
  const blockedPanelDelete = blockedEditPanel.getByRole("button", {
    name: "Delete",
  });
  await expect(blockedPanelDelete).toHaveAttribute("aria-disabled", "true");
  await blockedPanelDelete.hover();
  await expect(
    page.getByText("Account has active dependent records."),
  ).toBeVisible();
  await blockedPanelDelete.click({ force: true });
  await expect(
    page.getByRole("alertdialog", { name: "Delete account" }),
  ).toHaveCount(0);
  await blockedPanelDelete.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("alertdialog", { name: "Delete account" }),
  ).toHaveCount(0);
  await blockedEditPanel
    .getByRole("button", { name: "Close account panel" })
    .click();
  await expect(blockedEditPanel).toHaveCount(0);
  await expect(blockedEditButton).toBeFocused();

  await page.getByLabel("Search").fill(leafDeleteAccount.fqn);
  const leafDeleteRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "DeleteLeaf" })
    .first();
  await expect(leafDeleteRow).toBeVisible();
  await leafDeleteRow.hover();
  await leafDeleteRow.getByRole("button", { name: "Delete account" }).click();
  const leafDeleteDialog = page.getByRole("alertdialog", {
    name: "Delete account",
  });
  await expect(leafDeleteDialog).toContainText(leafDeleteAccount.fqn);
  const leafDeleteRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${leafDeleteAccount.account_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await leafDeleteDialog
    .getByRole("button", { name: "Delete account" })
    .click();
  await leafDeleteRequest;
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "DeleteLeaf" }),
  ).toHaveCount(0);
});

test("accounts page manages account forms, credit limits, and tombstone delete", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const unique = Date.now().toString(36);
  const fqn = `aaa_e2e:accounts:${browserName}:${unique}:Checking`;

  await page.goto("/accounts");
  await expect(
    page
      .getByTestId("accounts-tree-row")
      .filter({ hasText: "joint_checking" })
      .first(),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "New account" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create account" });
  await expect(createPanel).toBeVisible();

  await createPanel.getByRole("button", { name: "Create" }).click();
  await expect(createPanel.getByText("FQN is required.")).toBeVisible();

  await createPanel.getByLabel("FQN").fill(fqn);
  const typeFilterTrigger = page.getByRole("button", {
    exact: true,
    name: "Type: All types",
  });
  await typeFilterTrigger.click();
  const typeFilterPopover = page.getByRole("dialog", {
    name: "Account types",
  });
  await expect(typeFilterPopover).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(typeFilterPopover).toBeHidden();
  await expect(createPanel).toBeVisible();
  await expect(createPanel.getByLabel("FQN")).toHaveValue(fqn);
  await createPanel.getByLabel("FQN").blur();
  await expect(createPanel.getByText("FQN is required.")).toHaveCount(0);
  await createPanel.getByLabel("Type").click();
  await page.getByRole("option", { exact: true, name: "Owned" }).click();
  await createPanel.getByLabel("Currency", { exact: true }).fill("USD");
  const createAccountRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts" && response.request().method() === "POST"
    );
  });
  const lookupRefresh = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts" &&
      url.searchParams.get("include_tombstoned") === "true"
    );
  });
  await createPanel.getByRole("button", { name: "Create" }).click();
  await createAccountRequest;
  await lookupRefresh;
  await expect(page.getByText("Account created.")).toBeVisible({
    timeout: 10_000,
  });

  await page.getByLabel("Search").fill(fqn);
  const createdRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Checking" })
    .first();
  await expect(createdRow).toBeVisible({ timeout: 10_000 });

  await page.getByLabel("Include hidden").click();
  await createdRow.getByRole("button", { name: "Edit account" }).click();
  const editPanel = page.getByRole("dialog", { name: "Edit account" });
  await expect(editPanel).toBeVisible();
  await expect(editPanel.getByLabel("FQN")).toHaveValue(fqn);
  await editPanel.getByLabel("Hidden").click();
  const updateAccountRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/accounts/") &&
      response.request().method() === "PATCH"
    );
  });
  await editPanel.getByRole("button", { name: "Save" }).click();
  await updateAccountRequest;
  await expect(page.getByText("Account updated.")).toBeVisible({
    timeout: 10_000,
  });
  const hiddenCreatedRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Checking" })
    .first();
  await expect(hiddenCreatedRow.getByLabel("Hidden account")).toBeVisible();

  await page.getByLabel("Include hidden").click();
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "Checking" }),
  ).toHaveCount(0);

  await page.getByLabel("Include hidden").click();
  const creditLimitRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Checking" })
    .first();
  await expect(creditLimitRow).toBeVisible();
  await creditLimitRow.getByRole("button", { name: "Edit account" }).click();
  await expect(editPanel).toBeVisible();
  const addCreditLimitRevealButton = editPanel.getByRole("button", {
    name: "Add credit limit",
  });
  await expect(addCreditLimitRevealButton).toBeVisible();
  await editPanel.getByLabel("Currency mode").click();
  await page.getByRole("option", { name: "Multi-currency" }).click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(editPanel.getByLabel("Currency", { exact: true })).toHaveCount(
    0,
  );
  await expect(editPanel.getByLabel("Amount")).toHaveCount(0);
  await addCreditLimitRevealButton.click();
  await expect(editPanel.getByLabel("Amount")).toBeFocused();
  await editPanel.getByLabel("Amount").fill("23000.00");
  await expect(editPanel.getByLabel("Limit currency")).toHaveCount(0);
  await editPanel.getByLabel("Effective").fill("2026-07-05");
  await editPanel.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Credit limit added.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(editPanel.getByText("2026-07-05")).toBeVisible();
  await expect(editPanel.getByText("23,000.00 $")).toBeVisible();
  await expect(editPanel.getByLabel("Currency mode")).toBeDisabled();
  await expect(editPanel.getByLabel("Currency mode")).toContainText(
    "Single-currency",
  );
  await expect(
    editPanel.getByLabel("Currency", { exact: true }),
  ).toBeDisabled();
  await expect(editPanel.getByLabel("Currency", { exact: true })).toHaveValue(
    "USD",
  );
  await expect(
    editPanel.getByText(
      "Currency cannot be changed while credit-limit history exists. Delete all credit-limit history to unlock it.",
    ),
  ).toBeVisible();
  await expect(
    editPanel.getByRole("button", { name: "Add credit limit" }),
  ).toHaveCount(0);
  await expect(editPanel.getByLabel("Amount")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(editPanel).toBeHidden();
  await creditLimitRow.getByRole("button", { name: "Edit account" }).click();
  await expect(editPanel).toBeVisible();
  await expect(editPanel.getByText("2026-07-05")).toBeVisible();

  await editPanel
    .getByRole("listitem")
    .filter({ hasText: "2026-07-05" })
    .getByRole("button", { name: "Delete" })
    .click();
  const creditLimitDialog = page.getByRole("alertdialog", {
    name: "Delete credit limit",
  });
  await expect(creditLimitDialog).toContainText("2026-07-05");
  await page.keyboard.press("Escape");
  await expect(creditLimitDialog).toBeHidden();
  await expect(editPanel).toBeVisible();
  await expect(
    editPanel
      .getByRole("listitem")
      .filter({ hasText: "2026-07-05" })
      .getByRole("button", { name: "Delete" }),
  ).toBeFocused();
  await editPanel
    .getByRole("listitem")
    .filter({ hasText: "2026-07-05" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(creditLimitDialog).toBeVisible();
  const creditLimitDelete = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/credit-limit-history/") &&
      response.request().method() === "DELETE"
    );
  });
  await creditLimitDialog
    .getByRole("button", { name: "Delete credit limit" })
    .click();
  await creditLimitDelete;
  await expect(page.getByText("Credit limit deleted.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(editPanel.getByText("2026-07-05")).toHaveCount(0);
  await expect(editPanel.getByLabel("Currency mode")).toBeEnabled();
  await expect(
    editPanel.getByLabel("Currency", { exact: true }),
  ).toBeEditable();
  await expect(
    editPanel.getByText(
      "Currency cannot be changed while credit-limit history exists. Delete all credit-limit history to unlock it.",
    ),
  ).toHaveCount(0);

  await editPanel.getByRole("button", { name: "Close account panel" }).click();
  await page.getByLabel("Search").fill(fqn);
  const deleteRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Checking" })
    .first();
  await expect(deleteRow).toBeVisible();
  await deleteRow.getByRole("button", { name: "Edit account" }).click();
  await expect(editPanel).toBeVisible();
  await expect(editPanel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editPanel).toBeHidden();
  await expect(
    deleteRow.getByRole("button", { name: "Edit account" }),
  ).toBeFocused();
  await deleteRow.getByRole("button", { name: "Edit account" }).click();
  await expect(editPanel).toBeVisible();
  await expect(editPanel).toBeFocused();
  await expect(
    editPanel.getByRole("button", { name: "Add credit limit" }),
  ).toBeVisible();
  await editPanel.getByRole("button", { name: "Delete" }).click();
  const accountDeleteDialog = page.getByRole("alertdialog", {
    name: "Delete account",
  });
  await expect(accountDeleteDialog).toContainText(fqn);
  await page.keyboard.press("Escape");
  await expect(accountDeleteDialog).toBeHidden();
  await expect(editPanel).toBeVisible();
  await expect(editPanel.getByRole("button", { name: "Delete" })).toBeFocused();
  await editPanel.getByRole("button", { name: "Delete" }).click();
  await expect(accountDeleteDialog).toBeVisible();
  const accountDelete = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/accounts/") &&
      response.request().method() === "DELETE"
    );
  });
  await accountDeleteDialog
    .getByRole("button", { name: "Delete account" })
    .click();
  await accountDelete;
  await expect(page.getByText("Account deleted.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "Checking" }),
  ).toHaveCount(0, { timeout: 10_000 });
});

test("account form creates edits and clears display label overrides", async ({
  browserName,
  page,
}) => {
  const unique = Date.now().toString(36);
  const fqn = `e2e:labels:${browserName}:${unique}:Primary`;
  const fallbackLabel = `${unique}:Primary`;

  await page.goto("/accounts");
  await page.getByRole("button", { name: "New account" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create account" });
  const createLabel = createPanel.getByLabel("Display label (optional)");
  await expect(createPanel).toBeVisible();
  await expect(createLabel).toHaveValue("");
  await expect(
    createPanel.getByText(
      "Leave blank to use the final one or two FQN segments automatically.",
    ),
  ).toBeVisible();

  await createLabel.fill(" Daily spending");
  await createLabel.blur();
  await expect(
    createPanel.getByText("Remove leading or trailing whitespace."),
  ).toBeVisible();
  await expect(createLabel).toHaveAccessibleDescription(
    "Leave blank to use the final one or two FQN segments automatically. Remove leading or trailing whitespace.",
  );
  await createLabel.fill("Daily spending");
  await expect(
    createPanel.getByText("Remove leading or trailing whitespace."),
  ).toHaveCount(0);
  await expect(createLabel).toHaveAccessibleDescription(
    "Leave blank to use the final one or two FQN segments automatically.",
  );
  await createPanel.getByLabel("FQN").fill(fqn);

  const createAccountResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts" && response.request().method() === "POST"
    );
  });
  await createPanel.getByRole("button", { name: "Create" }).click();
  const createdResponse = await createAccountResponse;
  expect(createdResponse.status()).toBe(201);
  expect(createdResponse.request().postDataJSON()).toMatchObject({
    display_label: "Daily spending",
  });
  const created = (await createdResponse.json()) as AccountFixture;
  expect(created.display_label_override).toBe("Daily spending");
  await expect(page.getByText("Account created.")).toBeVisible();

  await page.getByLabel("Search").fill(fqn);
  const createdAccountRow = page.getByRole("button", {
    name: `Open account ${fqn} (Daily spending)`,
  });
  await expect(createdAccountRow.getByTestId("accounts-tree-fqn")).toHaveText(
    fqn,
  );
  await expect(
    createdAccountRow.getByTestId("accounts-tree-display-label"),
  ).toHaveText("(Daily spending)");

  await createdAccountRow.getByRole("button", { name: "Edit account" }).click();
  const editPanel = page.getByRole("dialog", { name: "Edit account" });
  const editLabel = editPanel.getByLabel("Display label (optional)");
  await expect(editLabel).toHaveValue("Daily spending");
  await editLabel.fill("Everyday");
  const updateLabelResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${created.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  await editPanel.getByRole("button", { name: "Save" }).click();
  const updatedResponse = await updateLabelResponse;
  expect(updatedResponse.status()).toBe(200);
  expect(updatedResponse.request().postDataJSON()).toMatchObject({
    display_label: "Everyday",
  });
  await expect(editPanel).toBeHidden();
  const updatedAccountRow = page.getByRole("button", {
    name: `Open account ${fqn} (Everyday)`,
  });
  await expect(updatedAccountRow.getByTestId("accounts-tree-fqn")).toHaveText(
    fqn,
  );
  await expect(
    updatedAccountRow.getByTestId("accounts-tree-display-label"),
  ).toHaveText("(Everyday)");

  await updatedAccountRow.getByRole("button", { name: "Edit account" }).click();
  await expect(editPanel).toBeVisible();
  await expect(editLabel).toHaveValue("Everyday");
  await expect(async () => {
    await editLabel.fill("");
    await expect(editLabel).toHaveValue("", { timeout: 250 });
  }).toPass();
  const clearLabelResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${created.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  await editPanel.getByRole("button", { name: "Save" }).click();
  const clearedResponse = await clearLabelResponse;
  expect(clearedResponse.status()).toBe(200);
  expect(clearedResponse.request().postDataJSON()).toMatchObject({
    display_label: null,
  });
  const cleared = (await clearedResponse.json()) as AccountFixture;
  expect(cleared.display_label).toBe(fallbackLabel);
  expect(cleared.display_label_override).toBeNull();
  await expect(editPanel).toBeHidden();
  const automaticAccountRow = page.getByRole("button", {
    name: `Open account ${fqn}`,
  });
  await expect(automaticAccountRow.getByTestId("accounts-tree-fqn")).toHaveText(
    fqn,
  );
  await expect(
    automaticAccountRow.getByTestId("accounts-tree-display-label"),
  ).toHaveCount(0);

  await automaticAccountRow
    .getByRole("button", { name: "Edit account" })
    .click();
  await expect(editLabel).toHaveValue("");
});

test("account form uses a single-line display label while saving", async ({
  browserName,
  page,
}) => {
  const unique = Date.now().toString(36);
  const fqn = `e2e:single-line-label:${browserName}:${unique}`;
  const originalLabel = "Daily Spending";
  const updatedLabel = "Daily Spending account";
  const account = await createAccount(page, {
    displayLabel: originalLabel,
    fqn,
  });

  await page.goto(`/accounts?q=${encodeURIComponent(fqn)}`);
  const accountRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: originalLabel });
  await accountRow.getByRole("button", { name: "Edit account" }).click();
  const editPanel = page.getByRole("dialog", { name: "Edit account" });
  const displayLabel = editPanel.getByLabel("Display label (optional)");
  await expect(displayLabel).toHaveAttribute("type", "text");
  await expect(displayLabel).toHaveValue(originalLabel);
  await displayLabel.fill(updatedLabel);

  let releasePatch = () => {};
  const patchGate = new Promise<void>((resolve) => {
    releasePatch = resolve;
  });
  await page.route(
    `**/api/accounts/${account.account_id}`,
    async (route) => {
      await patchGate;
      await route.continue();
    },
    { times: 1 },
  );
  const updateResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${account.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  await editPanel.getByRole("button", { name: "Save" }).click();
  await expect(displayLabel).toBeDisabled();
  releasePatch();
  const response = await updateResponse;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toMatchObject({
    display_label: updatedLabel,
  });
});

test("accounts form clears API field errors after editing the field", async ({
  browserName,
  page,
}) => {
  const unique = Date.now().toString(36);
  const duplicateFqn = `e2e:accounts:${browserName}:${unique}:Duplicate`;
  await createHiddenAccount(page, duplicateFqn);

  await page.goto("/accounts");
  await page.getByRole("button", { name: "New account" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create account" });
  const fqnInput = createPanel.getByLabel("FQN");
  await expect(createPanel).toBeVisible();

  await fqnInput.fill(duplicateFqn);
  await createPanel.getByLabel("Type").click();
  await page.getByRole("option", { exact: true, name: "Owned" }).click();
  await createPanel.getByLabel("Currency", { exact: true }).fill("USD");
  const duplicateCreate = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts" && response.request().method() === "POST"
    );
  });
  await createPanel.getByRole("button", { name: "Create" }).click();
  const duplicateResponse = await duplicateCreate;
  expect(duplicateResponse.status()).toBe(409);
  await expect(
    createPanel.getByText("active account fqn already exists"),
  ).toBeVisible();

  await fqnInput.fill(`${duplicateFqn}:Renamed`);
  await fqnInput.blur();
  await expect(
    createPanel.getByText("active account fqn already exists"),
  ).toHaveCount(0);
});

test("account edit changes type and retains values after a rejected type change", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const editableFqn = `e2e:accounts:${unique}:EditableType`;
  const [editableAccount, accounts] = await Promise.all([
    createAccount(page, { fqn: editableFqn }),
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
  ]);
  const blockedAccount = findByFqn(accounts, "merchant:TraderJoes");
  const blockedFqn = blockedAccount.fqn;

  await page.goto(`/accounts?q=${encodeURIComponent(editableFqn)}`);
  const editableRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "EditableType" })
    .first();
  await expect(editableRow).toBeVisible({ timeout: 10_000 });
  await editableRow.getByRole("button", { name: "Edit account" }).click();
  const editablePanel = page.getByRole("dialog", { name: "Edit account" });
  await editablePanel.getByLabel("Type").click();
  await page.getByRole("option", { exact: true, name: "Flow" }).click();
  const typeChangeRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${editableAccount.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  await editablePanel.getByRole("button", { name: "Save" }).click();
  const typeChangeResponse = await typeChangeRequest;
  expect(typeChangeResponse.status()).toBe(200);
  expect(typeChangeResponse.request().postDataJSON()).toMatchObject({
    account_type: "flow",
  });
  await expect(page.getByText("Account updated.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(editableRow).toContainText("Flow");

  await page.goto(`/accounts/${editableAccount.account_id}`);
  await expect(page.getByTestId("account-header")).toContainText("Flow");

  await page.goto(`/accounts?q=${encodeURIComponent(blockedFqn)}`);
  const blockedRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "TraderJoes" })
    .first();
  await expect(blockedRow).toBeVisible({ timeout: 10_000 });
  await blockedRow.getByRole("button", { name: "Edit account" }).click();
  const blockedPanel = page.getByRole("dialog", { name: "Edit account" });
  await expect(blockedPanel).toBeFocused();
  await blockedPanel.getByLabel("External system").fill("e2e-system");
  await blockedPanel.getByLabel("External ID").fill("e2e-id");
  await blockedPanel.getByLabel("Hidden").click();
  await blockedPanel.getByLabel("Featured").click();
  await blockedPanel.getByLabel("Type").click();
  await page.getByRole("option", { exact: true, name: "Owned" }).click();
  const rejectedTypeChange = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${blockedAccount.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  await blockedPanel.getByRole("button", { name: "Save" }).click();
  expect((await rejectedTypeChange).status()).toBe(409);
  await expect(blockedPanel).toBeVisible();
  const typeField = blockedPanel.getByLabel("Type").locator("..");
  await expect(
    typeField.getByText(
      "account type change would invalidate existing transaction records",
    ),
  ).toBeVisible();
  await expect(blockedPanel.getByRole("alert")).toHaveCount(0);
  await expect(blockedPanel.getByLabel("FQN")).toHaveValue(blockedFqn);
  await expect(blockedPanel.getByLabel("Type")).toContainText("Owned");
  await expect(blockedPanel.getByLabel("External system")).toHaveValue(
    "e2e-system",
  );
  await expect(blockedPanel.getByLabel("External ID")).toHaveValue("e2e-id");
  await expect(blockedPanel.getByLabel("Hidden")).toHaveAttribute(
    "data-state",
    "checked",
  );
  await expect(blockedPanel.getByLabel("Featured")).toHaveAttribute(
    "data-state",
    "checked",
  );

  await blockedPanel
    .getByRole("button", { name: "Close account panel" })
    .click();
  await blockedRow.getByRole("button", { name: "Edit account" }).click();
  await expect(blockedPanel.getByLabel("Type")).toContainText("Flow");
});

test("account header favorite toggle replaces a failure with retry success", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const account = await createAccount(page, {
    fqn: `e2e:accounts:${unique}:HeaderFavoriteFailure`,
  });
  const errorMessage = "Favorite update failed.";
  let failUpdate = true;

  await page.route(`/api/accounts/${account.account_id}`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    if (!failUpdate) {
      await route.continue();
      return;
    }
    failUpdate = false;
    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: "temporary_failure",
          message: errorMessage,
        },
      }),
      contentType: "application/json",
      status: 503,
    });
  });

  await page.goto(`/accounts/${account.account_id}`);
  const toggle = page
    .getByTestId("account-header")
    .getByRole("button", { name: "Feature account" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText("Feature account");
  await toggle.click();

  await expect(
    page.getByRole("status").filter({ hasText: errorMessage }),
  ).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  const featuredToggle = page
    .getByTestId("account-header")
    .getByRole("button", { name: "Unfeature account" });
  await expect(featuredToggle).toHaveAttribute("aria-pressed", "true");
  await expect(featuredToggle).toContainText("Unfeature account");
  await expect(
    page.getByRole("status").filter({ hasText: "Account featured." }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: errorMessage }),
  ).toHaveCount(0);
});

test("account header stays mounted and focused while favorite refreshes", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const account = await createAccount(page, {
    fqn: `e2e:accounts:${unique}:HeaderFavoriteFocus`,
  });
  let holdRefresh = false;
  let releaseRefresh: (() => void) | undefined;
  const refreshReleased = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let markRefreshStarted: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    markRefreshStarted = resolve;
  });

  await page.route("**/api/accounts?*", async (route) => {
    if (!holdRefresh || route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    markRefreshStarted?.();
    await refreshReleased;
    await route.continue();
  });

  await page.goto(`/accounts/${account.account_id}`);
  const accountHeader = page.getByTestId("account-header");
  const toggle = accountHeader.getByRole("button", {
    name: "Feature account",
  });
  await expect(toggle).toBeVisible();
  const typeBadge = accountHeader
    .locator('[data-slot="badge"]')
    .filter({ hasText: "Owned" });
  await expect(typeBadge).toHaveCount(1);
  expect(
    await typeBadge.evaluate((element) =>
      element.nextElementSibling?.textContent?.trim(),
    ),
  ).toBe("USD");
  await toggle.focus();
  holdRefresh = true;

  const updateResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${account.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  await toggle.press("Enter");
  expect((await updateResponse).status()).toBe(200);
  await refreshStarted;

  await expect(accountHeader).toBeVisible();
  await expect(
    accountHeader.getByRole("button", { name: "Unfeature account" }),
  ).toBeFocused();

  releaseRefresh?.();
  await expect(
    accountHeader.getByRole("button", { name: "Unfeature account" }),
  ).toBeFocused();
});

test("account header ignores favorite reactivation while pending", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const account = await createAccount(page, {
    fqn: `e2e:accounts:${unique}:HeaderFavoritePending`,
  });
  let favoriteRequestCount = 0;
  let releaseFavoriteRequest: (() => void) | undefined;
  const favoriteRequestReleased = new Promise<void>((resolve) => {
    releaseFavoriteRequest = resolve;
  });
  let markFavoriteRequestStarted: (() => void) | undefined;
  const favoriteRequestStarted = new Promise<void>((resolve) => {
    markFavoriteRequestStarted = resolve;
  });

  await page.route(`/api/accounts/${account.account_id}`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    favoriteRequestCount += 1;
    markFavoriteRequestStarted?.();
    await favoriteRequestReleased;
    await route.continue();
  });

  await page.goto(`/accounts/${account.account_id}`);
  const accountHeader = page.getByTestId("account-header");
  const toggle = accountHeader.getByRole("button", {
    name: "Feature account",
  });
  await toggle.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await favoriteRequestStarted;
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  expect(favoriteRequestCount).toBe(1);

  const favoriteResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${account.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  releaseFavoriteRequest?.();
  expect((await favoriteResponse).ok()).toBe(true);
  await expect(
    page.getByRole("status").filter({ hasText: "Account featured." }),
  ).toBeVisible();
  await expect(
    accountHeader.getByRole("button", { name: "Unfeature account" }),
  ).not.toHaveAttribute("aria-disabled", "true");
});

test("account header ignores favorite feedback after account navigation", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [firstAccount, secondAccount] = await Promise.all([
    createAccount(page, {
      fqn: `e2e:accounts:${unique}:HeaderFavoriteFirst`,
    }),
    createAccount(page, {
      fqn: `e2e:accounts:${unique}:HeaderFavoriteSecond`,
    }),
  ]);
  let releaseFavoriteRequest: (() => void) | undefined;
  const favoriteRequestReleased = new Promise<void>((resolve) => {
    releaseFavoriteRequest = resolve;
  });
  let markFavoriteRequestStarted: (() => void) | undefined;
  const favoriteRequestStarted = new Promise<void>((resolve) => {
    markFavoriteRequestStarted = resolve;
  });

  await page.route(
    `/api/accounts/${firstAccount.account_id}`,
    async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      markFavoriteRequestStarted?.();
      await favoriteRequestReleased;
      await route.continue();
    },
  );

  await page.goto(`/accounts/${firstAccount.account_id}`);
  await page
    .getByTestId("account-header")
    .getByRole("button", { name: "Feature account" })
    .click();
  await favoriteRequestStarted;
  await page.goto(`/accounts/${secondAccount.account_id}`);
  await expect(
    page.getByRole("heading", { name: "HeaderFavoriteSecond" }),
  ).toBeVisible();
  releaseFavoriteRequest?.();
  await expect(
    page.getByTestId("account-header").getByRole("button", {
      name: "Feature account",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Account featured." }),
  ).toHaveCount(0);
});

test("account register discards lookups after unmount but preserves them across query changes", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const categories = await listFixtures<CategoryFixture>(
    page,
    "/api/categories",
    "categories",
  );
  const category = findByFqn(categories, "Entertainment:Books");
  const [filteredAccount, balancingAccount] = await Promise.all([
    createAccount(page, {
      accountType: "flow",
      fqn: `e2e:accounts:${unique}:FilteredFlow`,
    }),
    createAccount(page, {
      accountType: "flow",
      fqn: `e2e:accounts:${unique}:BalancingFlow`,
    }),
  ]);
  const memo = `E2E stale account category lookup ${unique}`;
  const transaction = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-08-23",
      records: [
        {
          account_id: balancingAccount.account_id,
          amount: "-8.75",
          category_id: category.category_id,
          currency: "USD",
          memo,
          reconciliation_status: "unreconciled",
          settlement: null,
          source: "manual",
        },
        {
          account_id: filteredAccount.account_id,
          amount: "8.75",
          category_id: category.category_id,
          currency: "USD",
          memo,
          reconciliation_status: "unreconciled",
          settlement: null,
          source: "manual",
        },
      ],
    },
  });
  expect(transaction.ok()).toBe(true);

  const accountUrl = `/accounts/${filteredAccount.account_id}`;
  await page.goto(accountUrl);
  const registerRow = page
    .getByTestId("account-register-row")
    .filter({ hasText: memo });
  await expect(registerRow).toBeVisible();
  await registerRow.click();
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();

  let releaseLookup: (() => void) | undefined;
  const lookupReleased = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });
  let markLookupStarted: (() => void) | undefined;
  const lookupStarted = new Promise<void>((resolve) => {
    markLookupStarted = resolve;
  });
  await page.route(`/api/categories/${category.category_id}`, async (route) => {
    markLookupStarted?.();
    await lookupReleased;
    await route.continue().catch(() => undefined);
  });

  await detailPanel
    .getByRole("button", { name: `Filter by ${category.fqn}` })
    .first()
    .click();
  await lookupStarted;
  await page.goto("/overview");
  await page.goto(accountUrl);
  await expect(
    page.getByRole("heading", { name: "FilteredFlow" }),
  ).toBeVisible();

  releaseLookup?.();
  await expect(page).toHaveURL(
    new RegExp(`/accounts/${filteredAccount.account_id}$`),
  );

  await page.unroute(`/api/categories/${category.category_id}`);
  let releaseSamePageLookup: (() => void) | undefined;
  const samePageLookupReleased = new Promise<void>((resolve) => {
    releaseSamePageLookup = resolve;
  });
  let markSamePageLookupStarted: (() => void) | undefined;
  const samePageLookupStarted = new Promise<void>((resolve) => {
    markSamePageLookupStarted = resolve;
  });
  await page.route(`/api/categories/${category.category_id}`, async (route) => {
    markSamePageLookupStarted?.();
    await samePageLookupReleased;
    await route.continue().catch(() => undefined);
  });

  await registerRow.click();
  await expect(detailPanel).toBeVisible();
  await detailPanel
    .getByRole("button", { name: `Filter by ${category.fqn}` })
    .first()
    .click();
  await samePageLookupStarted;
  await page.getByLabel("Rows").click();
  await page.getByRole("option", { exact: true, name: "25" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/accounts/${filteredAccount.account_id}\\?page=1&pageSize=25$`),
  );

  const samePageLookupFinished = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === `/api/categories/${category.category_id}`;
  });
  releaseSamePageLookup?.();
  await samePageLookupFinished;
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return { filter: url.searchParams.get("filter"), pathname: url.pathname };
    })
    .toEqual({
      filter: `category:"${category.fqn}"`,
      pathname: "/transactions",
    });
});

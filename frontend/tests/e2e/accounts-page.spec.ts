import { expect, type Locator, type Page, test } from "@playwright/test";

interface AccountFixture {
  readonly account_id: number;
  readonly account_type: "balance" | "flow" | "system";
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

interface BalanceFixture {
  readonly account_id: number;
  readonly credit_limit?: string;
  readonly currency: string;
  readonly current_balance: string;
  readonly current_balance_usd: string;
  readonly posted_balance: string;
  readonly unconverted_count: number;
}

interface JournalRecordFixture {
  readonly account_id: number;
  readonly amount: string;
  readonly currency: string;
  readonly memo?: string | null;
  readonly pending_date: string;
  readonly record_id: number;
  readonly running_balance?: string | null;
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

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const decimalScale = 8;

const createAccount = async (
  page: Page,
  {
    accountType = "balance",
    fqn,
    hidden = false,
  }: {
    readonly accountType?: "balance" | "flow" | "system";
    readonly fqn: string;
    readonly hidden?: boolean;
  },
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency: "USD",
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

const createTag = async (page: Page, fqn: string): Promise<TagFixture> => {
  const response = await page.request.post("/api/tags", {
    data: { fqn, is_hidden: false },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as TagFixture;
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
  "M11 1H13V3H15V7H23V11H21V13H19V16H17V18H16V20H21V22H16V20H14V18H10V20H8V22H3V20H8V18H7V16H5V13H3V11H1V7H9V3H11V1Z";

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
  const accountsResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts" &&
      url.searchParams.get("include_hidden") === "true"
    );
  });
  const balancesResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts/balances" &&
      url.searchParams.get("include_hidden") === "true"
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
  const joint = findByFqn(accounts, "checking:Chase:Joint");
  const jointBalance = balances.find(
    (balance) => balance.account_id === joint.account_id,
  );
  const sapphire = findByFqn(accounts, "credit_card:Chase:Sapphire");
  const sapphireBalance = balances.find(
    (balance) => balance.account_id === sapphire.account_id,
  );
  expect(jointBalance).toBeDefined();
  expect(sapphireBalance?.credit_limit).toBeDefined();

  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  const accountsNavLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Accounts" });
  await expect(accountsNavLink).toHaveAttribute("aria-current", "page");

  const checkingGroup = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "checking" })
    .first();
  await expect(checkingGroup).toBeVisible();
  const jointRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Joint" })
    .first();
  await expect(jointRow).toBeVisible();
  await expect(jointRow).toContainText("Balance");
  await expect(jointRow).toContainText("USD");
  await expect(jointRow).toContainText(
    formatUsdMarkerAmount(jointBalance?.current_balance ?? "0"),
  );
  await expect(jointRow.getByTestId("credit-limit-indicator")).toHaveCount(0);

  const traderJoesRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "TraderJoes" })
    .first();
  await expect(traderJoesRow).toContainText("Flow");
  await expect(traderJoesRow.getByTestId("amount-text")).toHaveCount(0);

  await expect(
    page
      .getByTestId("accounts-tree-row")
      .filter({ hasText: hiddenAccount.fqn }),
  ).toHaveCount(0);

  await page.getByLabel("Type").click();
  await page.getByRole("option", { exact: true, name: "Flow" }).click();
  await expect(page).toHaveURL(/\/accounts\?type=flow$/);
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "TraderJoes" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "Joint" }),
  ).toHaveCount(0);

  await page.getByLabel("Search").fill("credit_card:Chase:Sapphire");
  await expect(page).toHaveURL(/type=flow&q=credit_card%3AChase%3ASapphire/);
  await expect(page.getByTestId("accounts-tree-row")).toHaveCount(0);

  await page.getByLabel("Type").click();
  await page.getByRole("option", { exact: true, name: "All types" }).click();
  await expect(page).toHaveURL(/q=credit_card%3AChase%3ASapphire/);
  const sapphireRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Sapphire" });
  await expect(sapphireRow).toBeVisible();
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

test("accounts tree gives Name column available width before truncating FQNs", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName}${Date.now()}`;
  const shortFqn = `bank:Chase${unique}:fees`;
  const deepFqn = [
    "bank",
    `institution${unique}`,
    "checking",
    "household",
    "recurring",
    "fees",
  ].join(":");
  await Promise.all([
    createAccount(page, { fqn: shortFqn }),
    createAccount(page, { fqn: deepFqn }),
  ]);

  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto("/accounts");
  const shortPath = page
    .getByTestId("accounts-tree-fqn")
    .filter({ hasText: shortFqn });
  await expect(shortPath).toHaveText(shortFqn);
  await expect
    .poll(() =>
      shortPath.evaluate((element) =>
        [...element.querySelectorAll<HTMLElement>("span")].every(
          (span) => span.scrollWidth <= span.clientWidth + 1,
        ),
      ),
    )
    .toBe(true);

  await page.setViewportSize({ width: 1200, height: 900 });
  const deepPath = page
    .getByTestId("accounts-tree-fqn")
    .filter({ hasText: deepFqn });
  await expect(deepPath).toHaveText(deepFqn);
  await expect
    .poll(() =>
      deepPath.evaluate((element) => {
        const ancestors = element.querySelector<HTMLElement>(
          ".text-muted-foreground",
        );
        return (
          ancestors !== null && ancestors.scrollWidth > ancestors.clientWidth
        );
      }),
    )
    .toBe(true);
});

test("register amount cells stay single-line through the collapse ladder", async ({
  page,
}) => {
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const joint = findByFqn(accounts, "checking:Chase:Joint");

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 620, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/accounts/${joint.account_id}?page=1&pageSize=50`);
    const amountCells = page.locator(
      ".account-register-amount-column [data-testid='amount-text'], .account-register-running-column [data-testid='amount-text']",
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
              styles.whiteSpace === "nowrap" &&
              rect.height <=
                (Number.isFinite(lineHeight) ? lineHeight : fontSize * 1.4) *
                  1.35
            );
          }),
        ),
      )
      .toBe(true);
  }
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
  const merchant = findByFqn(accounts, "merchant:Books");
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
      url.searchParams.get("offset") === "0"
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
  const firstTransaction = requireDefined(
    transactions.find(
      (transaction) =>
        transaction.transaction_id === firstRecord.transaction_id,
    ),
    "first transaction",
  );
  expect(recordsBody.total_count).toBe(27);
  expect(
    Date.parse(firstRecord.pending_date),
    "records are chronological",
  ).toBeLessThan(Date.parse(secondRecord.pending_date));

  const balance = balancesBody.balances.find(
    (row) => row.account_id === account.account_id,
  );
  expect(balance).toBeDefined();

  await expect(page.getByRole("heading", { name: "Card" })).toBeVisible();
  await expect(page.getByText("Balance", { exact: true })).toBeVisible();
  await expect(page.getByText("USD", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Current", { exact: true })).toBeVisible();
  await expect(page.getByText("Posted", { exact: true })).toBeVisible();
  await expect(page.getByText("Current USD")).toHaveCount(0);
  await expect(page.getByText("Posted USD")).toHaveCount(0);
  const currentBalanceText = formatUsdMarkerAmount(
    balance?.current_balance ?? "0",
  );
  expect(balance?.posted_balance).toBe(balance?.current_balance);
  await expect(page.getByText(currentBalanceText)).toHaveCount(2);
  await expect(page.getByText("Credit limit", { exact: true })).toBeVisible();
  await expect(page.getByText("Credit limit USD")).toHaveCount(0);
  await expect(page.getByText("5,000.00 $")).toHaveCount(2);
  await expect(
    page.locator("li").filter({ hasText: "5,000.00 $" }).getByText("May 1"),
  ).toBeVisible();
  const accountHeader = page.getByTestId("account-header");
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
  await expect(firstRow).toContainText("Card → Books");
  await expect(firstRow).toContainText("Books");
  await expect(firstRow).toContainText(
    formatUsdMarkerAmount(firstRecord.amount),
  );
  await expect(firstRow).toContainText(
    formatUsdMarkerAmount(firstRecord.running_balance ?? "0"),
  );

  await expect(
    page.getByTestId("account-register-pagination-footer"),
  ).toContainText("Page 1 of 2");

  await firstRow.click();
  await expect(page).toHaveURL(
    new RegExp(`[?&]record=${firstRecord.record_id}(?:&|$)`),
  );
  const peekPanel = page.getByTestId("account-peek-panel");
  await expect(peekPanel).toBeVisible();
  await expect(
    peekPanel.getByRole("heading", { name: firstTransaction.display_title }),
  ).toBeVisible();
  await expect(peekPanel.getByText("Journal records")).toBeVisible();
  await expect(
    peekPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(firstRecord.memo ?? "");
  await expect(
    peekPanel.getByTestId("transaction-detail-records-table"),
  ).toContainText(firstRecord.memo ?? "");
  await expect(peekPanel.getByText("Card").first()).toBeVisible();
  await expect(peekPanel.getByText("merchant:Books").first()).toBeVisible();
  const peekRecordsTable = peekPanel.getByTestId(
    "transaction-detail-records-table",
  );
  const peekAmountText = peekRecordsTable
    .locator("[data-label='Amount'] [data-testid='amount-text']")
    .filter({ hasText: formatUsdMarkerAmount(firstRecord.amount) })
    .first();
  const peekAccountPath = peekRecordsTable
    .locator("[data-label='Account']")
    .filter({ hasText: "merchant:Books" })
    .locator("[data-slot='tooltip-trigger']")
    .first();
  await expect(peekAmountText).toBeVisible();
  await expect(peekAccountPath).toBeVisible();
  await expect
    .poll(async () => {
      const { height, lineHeight } = await renderedLineHeight(peekAmountText);
      return height <= lineHeight * 1.35;
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const { height, lineHeight } = await renderedLineHeight(peekAccountPath);
      return height <= lineHeight * 1.35;
    })
    .toBe(true);

  const secondRow = page
    .getByTestId("account-register-row")
    .filter({ hasText: secondRecord.memo ?? "" })
    .first();
  await page.getByRole("heading", { exact: true, name: "Card" }).click();
  await expect(peekPanel).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]record=/);

  await firstRow.click();
  await expect(peekPanel).toBeVisible();
  await secondRow.click({ position: { x: 16, y: 16 } });
  await expect(page).toHaveURL(
    new RegExp(`[?&]record=${secondRecord.record_id}(?:&|$)`),
  );
  await expect(
    peekPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(secondRecord.memo ?? "");

  await firstRow.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.focus();
    }
  });
  await expect(firstRow).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(secondRow).toBeFocused();
  await expect(page).toHaveURL(
    new RegExp(`[?&]record=${secondRecord.record_id}(?:&|$)`),
  );
  await expect(
    peekPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(secondRecord.memo ?? "");

  await page.keyboard.press("Escape");
  await expect(peekPanel).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]record=/);
  await expect(secondRow).toBeFocused();

  await firstRow.click();
  await expect(peekPanel).toBeVisible();
  await peekPanel.getByRole("link", { name: "Open transaction" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/transactions\\?transaction=${firstTransaction.transaction_id}$`,
    ),
  );
  await expect(
    page.getByRole("dialog", { name: firstTransaction.display_title }),
  ).toBeVisible();

  await page.goto(
    `/accounts/${account.account_id}?page=1&pageSize=25&record=${firstRecord.record_id}`,
  );
  const deepLinkedPeekPanel = page.getByTestId("account-peek-panel");
  await expect(deepLinkedPeekPanel).toBeVisible();
  await expect(
    deepLinkedPeekPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(firstRecord.memo ?? "");
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
  await expect(page).not.toHaveURL(/[?&]record=/);
  await expect(deepLinkedPeekPanel).toBeHidden();

  await page.goto(
    `/accounts/${account.account_id}?page=1&pageSize=25&record=${firstRecord.record_id}`,
  );
  await expect(deepLinkedPeekPanel).toBeVisible();
  await deepLinkedPeekPanel
    .getByRole("button", { name: "Close transaction peek" })
    .click();
  await expect(deepLinkedPeekPanel).toBeHidden();

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
    `/accounts/${account.account_id}?page=1&pageSize=25&record=${firstRecord.record_id}`,
  );
  await expect(deepLinkedPeekPanel).toBeVisible();
  await page.getByRole("button", { name: "Next" }).evaluate((element) => {
    if (element instanceof HTMLButtonElement) {
      element.click();
    }
  });
  await expect(page.getByTestId("account-register-page-busy")).toBeVisible();
  await expect(firstRow).toBeVisible();
  await secondPageResponse;
  await expectAccountRegisterUrl(page, 2, 25);
  await expect(page).not.toHaveURL(/[?&]record=/);
  await expect(
    page.getByTestId("account-register-pagination-footer"),
  ).toContainText("Page 2 of 2");
  await expect(
    page
      .getByTestId("account-register-row")
      .filter({ hasText: `E2E account register ${unique} 26` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous" }).click();
  await expectAccountRegisterUrl(page, 1, 25);

  await page.goto(`/accounts/${hiddenAccount.account_id}`);
  await expect(page.getByRole("heading", { name: "Hidden" })).toBeVisible();
  await expect(page.getByLabel("Hidden account")).toBeVisible();
});

test("account register peek tag chips open transactions with tag filter", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const tag = await createTag(page, `E2E:PeekFilter:${unique}:RegisterTag`);
  const memo = `E2E register peek tag filter ${unique}`;

  const transactionResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "13.57",
        category_id: category.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-04-01",
        memo,
        tag_ids: [tag.tag_id],
      },
    },
  );
  expect(transactionResponse.ok()).toBe(true);

  await page.goto(`/accounts/${fundingAccount.account_id}?page=1&pageSize=50`);
  await expect(page.getByText("Register", { exact: true })).toBeVisible();
  const recordRow = page
    .getByTestId("account-register-row")
    .filter({ hasText: memo })
    .first();
  await expect(recordRow).toBeVisible();
  await recordRow.click();
  const peekPanel = page.getByTestId("account-peek-panel");
  await expect(peekPanel).toBeVisible();
  await peekPanel
    .getByRole("button", { name: `Filter by ${tag.name}` })
    .first()
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/transactions\\?tag=${tag.tag_id}$`),
  );
  await expect(page.getByText(`Tag ${tag.name}`)).toBeVisible();
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
  const siblingWallet = findByFqn(accounts, "savings:Ally:Emergency");
  const siblingMerchant = findByFqn(accounts, "merchant:Books");
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
        category_id: category.category_id,
        currency: "USD",
        memo,
        posting_status: "posted",
        reconciliation_status: "unreconciled",
        source: "manual",
      },
      {
        account_id: fees.account_id,
        amount,
        category_id: category.category_id,
        currency: "USD",
        memo,
        posting_status: "posted",
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
    "1 balance account",
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
  await firstRow.click();
  await expect(page).toHaveURL(
    new RegExp(`[?&]record=${firstRecord.record_id}(?:&|$)`),
  );
  const peekPanel = page.getByTestId("account-peek-panel");
  await expect(peekPanel).toBeVisible();
  await expect(
    peekPanel.getByRole("heading", { name: groupTransaction.display_title }),
  ).toBeVisible();

  await firstRow.focus();
  await page.keyboard.press("ArrowDown");
  const secondRow = page.locator(
    `[data-record-id="${secondRecord.record_id}"]`,
  );
  await expect(secondRow).toBeFocused();
  await expect(page).toHaveURL(
    new RegExp(`[?&]record=${secondRecord.record_id}(?:&|$)`),
  );

  await page.keyboard.press("Escape");
  await expect(peekPanel).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]record=/);
  await expect(secondRow).toBeFocused();

  await page.goto(
    `/accounts/group?prefix=${encodeURIComponent(prefix)}&page=1&pageSize=25&record=${firstRecord.record_id}`,
  );
  await expect(peekPanel).toBeVisible();
  await expect(
    peekPanel.getByRole("heading", { name: groupTransaction.display_title }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(peekPanel).toBeHidden();

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
  await expect(page).not.toHaveURL(/[?&]record=/);
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
    .filter({ hasText: "checking" })
    .getByRole("link", { exact: true, name: "checking" });
  await expect(overviewGroupLink).toHaveAttribute(
    "href",
    "/accounts/group?prefix=checking",
  );
  await overviewGroupLink.click();
  await expect(page).toHaveURL("/accounts/group?prefix=checking");
});

test("account tree rows and entry links navigate to account register pages", async ({
  page,
}) => {
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const joint = findByFqn(accounts, "checking:Chase:Joint");
  const sapphire = findByFqn(accounts, "credit_card:Chase:Sapphire");

  await page.goto("/accounts");
  const jointTreeRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Joint" })
    .first();
  await expect(jointTreeRow).toHaveAttribute(
    "aria-label",
    "Open account checking:Chase:Joint",
    { timeout: 10_000 },
  );
  await jointTreeRow.click();
  await expect(page).toHaveURL(new RegExp(`/accounts/${joint.account_id}$`));
  await expect(page.getByRole("heading", { name: "Joint" })).toBeVisible();

  await page.goto("/status");
  const jointStripLink = page
    .getByTestId("featured-balance-row")
    .filter({ hasText: "Joint" })
    .getByTestId("featured-balance-name");
  await expect(jointStripLink).toHaveAttribute(
    "href",
    `/accounts/${joint.account_id}`,
  );
  await jointStripLink.click();
  await expect(page).toHaveURL(new RegExp(`/accounts/${joint.account_id}$`));
  await expect(page.getByRole("heading", { name: "Joint" })).toBeVisible();

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
  await expect(page.getByTestId("accounts-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });

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

  await page.getByLabel("Search").fill(cancelSource);
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
  await expect(page.getByTestId("accounts-tree-row")).toHaveCount(0);
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
  const merchant = findByFqn(accounts, "merchant:Books");
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
  await blockedRow.getByRole("button", { name: "Edit account" }).click();
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
    page.getByTestId("accounts-tree-row").filter({ hasText: "Joint" }).first(),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "New account" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create account" });
  await expect(createPanel).toBeVisible();

  await createPanel.getByRole("button", { name: "Create" }).click();
  await expect(createPanel.getByText("FQN is required.")).toBeVisible();

  await createPanel.getByLabel("FQN").fill(fqn);
  await createPanel.getByLabel("FQN").blur();
  await expect(createPanel.getByText("FQN is required.")).toHaveCount(0);
  await createPanel.getByLabel("Type").click();
  await page.getByRole("option", { exact: true, name: "Balance" }).click();
  await createPanel.getByLabel("Currency").fill("USD");
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
  await expect(editPanel.getByLabel("Amount")).toHaveCount(0);
  await addCreditLimitRevealButton.focus();
  await expect(addCreditLimitRevealButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(editPanel.getByLabel("Amount")).toBeFocused();
  await editPanel.getByLabel("Amount").fill("23000.00");
  await editPanel.getByLabel("Effective").fill("2026-07-05");
  const creditLimitCreate = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.endsWith("/credit-limit-history") &&
      response.request().method() === "POST"
    );
  });
  await editPanel.getByRole("button", { name: "Add" }).click();
  await creditLimitCreate;
  await expect(page.getByText("Credit limit added.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(editPanel.getByText("2026-07-05")).toBeVisible();
  await expect(editPanel.getByText("23,000.00 $")).toBeVisible();
  await expect(
    editPanel.getByRole("button", { name: "Add credit limit" }),
  ).toHaveCount(0);
  await expect(editPanel.getByLabel("Amount")).toBeVisible();

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

  await editPanel.getByRole("button", { name: "Close account panel" }).click();
  await page.getByLabel("Search").fill(fqn);
  const deleteRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Checking" })
    .first();
  await expect(deleteRow).toBeVisible();
  await deleteRow.getByRole("button", { name: "Edit account" }).click();
  await expect(editPanel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editPanel).toBeHidden();
  await expect(
    deleteRow.getByRole("button", { name: "Edit account" }),
  ).toBeFocused();
  await deleteRow.getByRole("button", { name: "Edit account" }).click();
  await expect(editPanel).toBeVisible();
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
  await page.getByRole("option", { exact: true, name: "Balance" }).click();
  await createPanel.getByLabel("Currency").fill("USD");
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

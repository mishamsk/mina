import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly fqn: string;
}

interface TagFixture {
  readonly tag_id: number;
}

interface MemberFixture {
  readonly member_id: number;
  readonly name: string;
}

interface TransactionFixture {
  readonly display_title: string;
  readonly initiated_date: string;
  readonly transaction_id: number;
}

const openPalette = async (page: Page) => {
  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Command search" }),
  ).toBeFocused();
};

const listAccountFixtures = async (
  page: Page,
): Promise<readonly AccountFixture[]> => {
  const response = await page.request.get(
    "/api/accounts?limit=500&offset=0&sort=fqn&sort_dir=asc",
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    readonly accounts?: readonly AccountFixture[];
  };
  return body.accounts ?? [];
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

const createMember = async (
  page: Page,
  name: string,
): Promise<MemberFixture> => {
  const response = await page.request.post("/api/members", { data: { name } });
  expect(response.ok()).toBe(true);
  return (await response.json()) as MemberFixture;
};

const createSearchFixtureTransaction = async (
  page: Page,
  options: {
    readonly amount: string;
    readonly category: CategoryFixture;
    readonly initiatedDate: string;
    readonly member?: MemberFixture;
    readonly memo: string;
    readonly tag?: TagFixture;
  },
): Promise<TransactionFixture> => {
  const accounts = await listAccountFixtures(page);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const response = await page.request.post("/api/transactions/spend", {
    data: {
      amount: options.amount,
      category_id: options.category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: options.initiatedDate,
      member_id: options.member?.member_id,
      memo: options.memo,
      tag_ids: options.tag ? [options.tag.tag_id] : undefined,
    },
  });
  expect(response.ok()).toBe(true);
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

test("command palette opens globally, filters, navigates, and restores focus", async ({
  page,
}) => {
  await page.goto("/overview");

  const overviewLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Overview" });
  await overviewLink.focus();
  await expect(overviewLink).toBeFocused();

  await openPalette(page);
  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  const search = page.getByRole("combobox", { name: "Command search" });
  await expect(search).toHaveAttribute(
    "aria-controls",
    "command-palette-results",
  );
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await expect(
    dialog.getByRole("listbox", { name: "Command results" }),
  ).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Navigation" })).toBeVisible();

  await search.fill("status");
  await expect(dialog.getByRole("option", { name: /Status/ })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /Overview/ })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(overviewLink).toBeFocused();

  await openPalette(page);
  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toHaveCount(0);

  await openPalette(page);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
});

test("command palette opens from the transactions page", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page.locator("body")).toBeFocused();
  await page.getByRole("searchbox", { name: "Search" }).focus();
  await openPalette(page);
  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await expect(dialog).toHaveCount(1);

  const overviewOption = dialog.getByRole("option", { name: /Overview/ });
  await page.keyboard.press("Tab");
  await expect(overviewOption).toHaveAttribute("aria-selected", "true");
  if (!(await overviewOption.evaluate((option) => option.matches(":focus")))) {
    await overviewOption.focus();
  }
  await expect(overviewOption).toBeFocused();
  await page.keyboard.press("KeyN");
  await expect(page.getByRole("heading", { name: "New spend" })).toHaveCount(0);
});

test("command palette toggles transaction bulk-edit mode", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search" }).focus();

  await openPalette(page);
  const search = page.getByRole("combobox", { name: "Command search" });
  await search.fill("bulk edit");
  await page
    .getByRole("dialog", { name: "Command Palette" })
    .getByRole("option", { name: /Toggle bulk edit/ })
    .click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toBeVisible();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("0 selected");

  await openPalette(page);
  const doneButton = page
    .getByTestId("transaction-browser-bulk-mode-bar")
    .getByRole("button", { name: "Done" });
  const doneBounds = await doneButton.boundingBox();
  expect(doneBounds).not.toBeNull();
  await page.mouse.click(
    doneBounds!.x + doneBounds!.width / 2,
    doneBounds!.y + doneBounds!.height / 2,
  );
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toHaveCount(0);

  await openPalette(page);
  await page
    .getByRole("combobox", { name: "Command search" })
    .fill("bulk edit");
  await page
    .getByRole("dialog", { name: "Command Palette" })
    .getByRole("option", { name: /Toggle bulk edit/ })
    .click();
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toHaveCount(0);
  await expect(page.getByTestId("bulk-action-bar")).toHaveCount(0);
});

test("current Settings command restores focus to the sidebar link", async ({
  page,
}) => {
  await page.goto("/settings/");
  const settingsLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Settings" });
  await settingsLink.focus();

  await openPalette(page);
  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await page.getByRole("combobox", { name: "Command search" }).fill("settings");
  await expect(dialog.getByRole("option", { name: /Settings/ })).toContainText(
    "Current",
  );
  await page.keyboard.press("Enter");

  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/$/);
  await expect(settingsLink).toBeFocused();
});

test("Settings navigation keeps palette focus trapped during history", async ({
  page,
}) => {
  await page.goto("/overview");
  await page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Overview" })
    .focus();
  await openPalette(page);

  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await page.getByRole("combobox", { name: "Command search" }).fill("settings");
  await page.keyboard.press("Enter");

  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeFocused();

  await page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Overview" })
    .click();
  await page.locator("header").getByRole("link", { name: "View all" }).focus();
  await openPalette(page);
  await page.goBack();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Command search" }),
  ).toBeFocused();
  const lastOption = dialog.getByRole("option").last();
  await page.keyboard.press("Shift+Tab");
  await expect(lastOption).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("combobox", { name: "Command search" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeFocused();
});

test("palette restores focus when history detaches the Settings opener", async ({
  page,
}) => {
  await page.goto("/status");
  await page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Settings" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeFocused();

  await openPalette(page);
  await page.goBack();

  await expect(page).toHaveURL(/\/status$/);
  await expect(
    page.getByRole("combobox", { name: "Command search" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { level: 1, name: "Status" }),
  ).toBeFocused();
});

test("command palette transaction search renders results and opens off-page detail", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 600, height: 720 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const member = await createMember(page, `zzPaletteTxn ${unique}`);
  const tag = await createTag(page, `zzE2EPaletteTxn:${unique}:Reference`);
  const category = await createCategory(
    page,
    `zzE2EPaletteTxn:${unique}:Category`,
  );
  const memo = `E2E palette transaction search ${unique}`;
  const transaction = await createSearchFixtureTransaction(page, {
    amount: "9999999999.87",
    category,
    initiatedDate: "2026-01-09",
    member,
    memo,
    tag,
  });

  await page.goto("/transactions?page=1&pageSize=25");
  await expect(page.getByText("Description")).toBeVisible();
  await expect(
    page.getByTestId("transactions-table-scroll").getByText(memo),
  ).toHaveCount(0);

  await openPalette(page);
  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  const search = page.getByRole("combobox", { name: "Command search" });
  const searchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === member.name &&
      url.searchParams.get("limit") === "20" &&
      url.searchParams.get("offset") === "0"
    );
  });
  await search.fill(`'${member.name}`);
  await searchRequest;

  const option = dialog.getByRole("option").filter({ hasText: memo });
  await expect(option).toBeVisible();
  await expect(option).toContainText("Jan 9");
  await expect(option).toContainText(transaction.display_title);
  await expect(option).toContainText(memo);
  await expect(option.getByRole("img", { name: "Spend" })).toBeVisible();
  const amountChip = option.getByTestId("amount-chip");
  await expect(amountChip).toContainText("-9,999,999,999.87 $");
  await expect(amountChip).toHaveCSS("height", "28px");

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${transaction.transaction_id}(?:&|$)`),
  );
  const detailPanel = page.getByRole("dialog", {
    name: transaction.display_title,
  });
  await expect(detailPanel).toBeVisible();
  await expect(
    detailPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(memo);
  await deleteTransaction(page, transaction);
});

test("command palette keeps narrow multi-part results single-height", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 720 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const category = await createCategory(
    page,
    `zzE2EPaletteHeight:${unique}:Category`,
  );
  const accounts = await listAccountFixtures(page);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const partyAccount = findByFqn(accounts, "person:Friend:Jordan");
  const simpleMemo = `E2E palette height ${unique} simple`;
  const multiPartMemo = `E2E palette height ${unique} multi`;
  const decoyMemo = `E2E palette height ${unique} decoy`;

  const decoyTransaction = await createSearchFixtureTransaction(page, {
    amount: "11.00",
    category,
    initiatedDate: "2026-05-31",
    memo: decoyMemo,
  });
  const simpleTransaction = await createSearchFixtureTransaction(page, {
    amount: "999999.99",
    category,
    initiatedDate: "2026-05-30",
    memo: simpleMemo,
  });
  const multiPartResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-05-29",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-1000000.00",
          category_id: null,
          currency: "USD",
          memo: multiPartMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: merchantAccount.account_id,
          amount: "999999.99",
          category_id: category.category_id,
          currency: "USD",
          memo: multiPartMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
        },
        {
          account_id: partyAccount.account_id,
          amount: "0.01",
          category_id: null,
          currency: "USD",
          memo: multiPartMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
        },
      ],
    },
  });
  expect(multiPartResponse.ok()).toBe(true);
  const multiPartTransaction =
    (await multiPartResponse.json()) as TransactionFixture;

  await page.goto("/overview");
  await page.getByRole("button", { name: "Command palette" }).click();
  await page
    .getByRole("combobox", { name: "Command search" })
    .fill(`'palette height ${unique}`);

  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  const simpleOption = dialog
    .getByRole("option")
    .filter({ hasText: simpleMemo });
  const multiPartOption = dialog
    .getByRole("option")
    .filter({ hasText: multiPartMemo });
  await expect(simpleOption).toHaveAttribute("aria-selected", "false");
  await expect(multiPartOption).toHaveAttribute("aria-selected", "false");
  await expect(multiPartOption.getByTestId("amount-chip")).toHaveText(
    "-999,999.99 $",
  );
  await expect(
    multiPartOption.getByTestId("more-parts-indicator"),
  ).toBeVisible();
  await expect(multiPartOption).toHaveAttribute(
    "aria-label",
    /more transaction parts, all parts -999,999\.99 \$, -0\.01 \$/,
  );
  await expect(
    multiPartOption.evaluate(
      (option) => option.scrollWidth <= option.clientWidth,
    ),
  ).resolves.toBe(true);
  const [descriptionBounds, amountBounds] = await Promise.all([
    multiPartOption.getByTestId("transaction-result-description").boundingBox(),
    multiPartOption.getByTestId("transaction-result-amounts").boundingBox(),
  ]);
  expect(descriptionBounds).not.toBeNull();
  expect(amountBounds).not.toBeNull();
  expect(descriptionBounds?.width ?? 0).toBeGreaterThan(0);
  expect(descriptionBounds?.x ?? 0).toBeLessThan((amountBounds?.x ?? 0) + 0.5);
  expect(
    (descriptionBounds?.x ?? 0) + (descriptionBounds?.width ?? 0),
  ).toBeLessThanOrEqual((amountBounds?.x ?? 0) + 0.5);

  const [simpleHeight, multiPartHeight] = await Promise.all([
    simpleOption.evaluate((option) => option.getBoundingClientRect().height),
    multiPartOption.evaluate((option) => option.getBoundingClientRect().height),
  ]);
  expect(Math.abs(simpleHeight - multiPartHeight)).toBeLessThanOrEqual(1);
  await deleteTransaction(page, multiPartTransaction);
  await deleteTransaction(page, simpleTransaction);
  await deleteTransaction(page, decoyTransaction);
});

test("command palette transaction search preserves spaces and supports keyboard selection", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const category = await createCategory(
    page,
    `zzE2EPaletteKeyboard:${unique}:Category`,
  );
  const firstMemo = `E2E palette keyboard ${unique} first result`;
  const secondMemo = `E2E palette keyboard ${unique} second result`;
  await createSearchFixtureTransaction(page, {
    amount: "11.00",
    category,
    initiatedDate: "2026-05-09",
    memo: firstMemo,
  });
  const secondTransaction = await createSearchFixtureTransaction(page, {
    amount: "12.00",
    category,
    initiatedDate: "2026-05-08",
    memo: secondMemo,
  });

  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await openPalette(page);
  const search = page.getByRole("combobox", { name: "Command search" });
  await page.keyboard.press("Space");
  await expect(search).toHaveValue("'");

  const searchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("search") === `palette keyboard ${unique}`
    );
  });
  await page.keyboard.type(`palette keyboard ${unique}`);
  await searchRequest;
  await expect(search).toHaveValue(`'palette keyboard ${unique}`);
  await expect(page.getByRole("option", { name: /Transaction/ })).toHaveCount(
    2,
  );

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${secondTransaction.transaction_id}(?:&|$)`),
  );
  await expect(
    page.getByRole("dialog", { name: secondTransaction.display_title }),
  ).toBeVisible();
});

test("command palette transaction search shows empty and error states and exits mode", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const emptyQuery = `no transaction palette match ${unique}`;
  const errorQuery = `palette error ${unique}`;

  await page.route("**/api/transactions?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("search") !== errorQuery) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: "invalid_request",
          message: "Palette transaction search failed.",
        },
      }),
      contentType: "application/json",
      status: 400,
    });
  });

  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await openPalette(page);
  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  const search = page.getByRole("combobox", { name: "Command search" });

  await search.fill(`'${emptyQuery}`);
  await expect(dialog.getByText("No matching transactions.")).toBeVisible();

  await search.fill(`'${errorQuery}`);
  await expect(
    dialog.getByText("Palette transaction search failed."),
  ).toBeVisible();

  await search.fill("'");
  await page.keyboard.press("Backspace");
  await expect(search).toHaveValue("");
  await expect(dialog.getByRole("group", { name: "Navigation" })).toBeVisible();
  await search.fill("status");
  await expect(dialog.getByRole("option", { name: /Status/ })).toBeVisible();
});

const createHiddenAccount = async (
  page: Page,
  fqn: string,
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: "owned",
      currency: "USD",
      fqn,
      is_hidden: true,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as AccountFixture;
};

test("command palette navigates to account and account group matches", async ({
  browserName,
  page,
}) => {
  const unique = Date.now().toString(36);
  const hiddenAccount = await createHiddenAccount(
    page,
    `e2e:hidden:${browserName}:${unique}:Vault`,
  );

  await page.goto("/overview");
  const overviewLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Overview" });
  await overviewLink.focus();

  await openPalette(page);
  const search = page.getByRole("combobox", { name: "Command search" });
  await search.fill("Joint");
  await expect(
    page.getByRole("option", { name: /Account checking:Chase:Joint/ }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/accounts\/\d+$/);
  await expect(page.getByRole("heading", { name: /Joint/ })).toBeVisible();

  await openPalette(page);
  await search.fill("checking");
  const checkingGroup = page.getByRole("option", {
    exact: true,
    name: "Account group checking",
  });
  await expect(checkingGroup).toBeVisible();
  await checkingGroup.click();
  await expect(page).toHaveURL(/\/accounts\/group\?prefix=checking$/);
  await expect(page.getByRole("heading", { name: /checking/ })).toBeVisible();

  await openPalette(page);
  await search.fill(hiddenAccount.fqn);
  await expect(
    page.getByRole("option", { name: new RegExp(hiddenAccount.fqn) }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`/accounts/${hiddenAccount.account_id}$`),
  );
});

test("command palette opens entry tabs from any page without clobbering plain open", async ({
  page,
}) => {
  await page.goto("/overview");
  const overviewLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Overview" });
  await overviewLink.focus();

  await openPalette(page);
  await page.getByRole("combobox", { name: "Command search" }).fill("exchange");
  await page.getByRole("option", { name: "New exchange" }).click();
  await expect(page).toHaveURL(/\/overview\?entry=new%3Aexchange$/);
  await expect(page.getByRole("tab", { name: "Exchange" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const pageNewTransactionButton = page
    .locator("main")
    .getByRole("button", { name: "New transaction" });

  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await pageNewTransactionButton.click();
  await expect(page.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(pageNewTransactionButton).toBeFocused();
  await openPalette(page);
  await page.getByRole("combobox", { name: "Command search" }).fill("income");
  await page.getByRole("option", { name: "New income" }).click();
  await expect(page).toHaveURL(/\/overview\?entry=new%3Aincome$/);
  await expect(page.getByRole("tab", { name: "Income" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await pageNewTransactionButton.click();
  await expect(page.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("command palette runs exchange-rate action", async ({ page }) => {
  await page.goto("/overview");
  const overviewLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Overview" });
  await overviewLink.focus();

  await openPalette(page);
  await page.getByRole("combobox", { name: "Command search" }).fill("reload");
  const reloadRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      request.method() === "POST" &&
      url.pathname === "/api/background-operations/exchange-rate-loading/runs"
    );
  });
  await page.getByRole("option", { name: "Reload exchange rates" }).click();
  await reloadRequest;
  await expect(page.getByRole("status")).toContainText(
    "Exchange-rate reload started: run",
  );
});

test("command palette surfaces database backup action result", async ({
  page,
}) => {
  await page.goto("/overview");
  const overviewLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Overview" });
  await overviewLink.focus();

  await openPalette(page);
  await page.getByRole("combobox", { name: "Command search" }).fill("backup");
  const backupRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      request.method() === "POST" &&
      url.pathname === "/api/background-operations/database-backup/runs"
    );
  });
  await page.getByRole("option", { name: "Run database backup" }).click();
  await backupRequest;
  await expect(page.getByRole("status")).toContainText(
    "Database backup started: run",
  );
});

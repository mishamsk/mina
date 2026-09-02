import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
}

interface CategoryFixture {
  readonly category_id: number;
}

interface TransactionFixture {
  readonly transaction_id: number;
}

const createAccount = async (
  page: Page,
  fqn: string,
  accountType: "flow" | "owned" | "party" = "owned",
  currency: string | null = "USD",
  displayLabel?: string,
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency,
      display_label: displayLabel,
      fqn,
      is_hidden: false,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as AccountFixture;
};

const createCategory = async (
  page: Page,
  fqn: string,
): Promise<CategoryFixture> => {
  const response = await page.request.post("/api/categories", {
    data: {
      economic_intent: "expense",
      fqn,
      is_hidden: false,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as CategoryFixture;
};

const createSpend = async (
  page: Page,
  {
    amount,
    categoryId,
    currency,
    fundingAccountId,
    initiatedDate = "2026-08-15",
    memo,
    merchantAccountId,
  }: {
    readonly amount: string;
    readonly categoryId: number;
    readonly fundingAccountId: number;
    readonly initiatedDate?: string;
    readonly memo: string;
    readonly merchantAccountId: number;
    readonly currency?: string;
  },
): Promise<TransactionFixture> => {
  const response = await page.request.post("/api/transactions/spend", {
    data: {
      amount,
      category_id: categoryId,
      counterparty_account_id: merchantAccountId,
      currency: currency ?? "USD",
      funding_account_id: fundingAccountId,
      initiated_date: initiatedDate,
      memo,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as TransactionFixture;
};

const createCreditLimit = async (
  page: Page,
  accountId: number,
  amount = "5000",
): Promise<void> => {
  const response = await page.request.post(
    `/api/accounts/${accountId}/credit-limit-history`,
    {
      data: {
        credit_limit: amount,
        effective_date: "2026-08-15",
      },
    },
  );
  expect(response.ok(), await response.text()).toBe(true);
};

test("account form creates an account in the chart", async ({ page }) => {
  const fqn = "e2e:created:Checking";
  const displayLabel = "Household checking";

  await page.goto("/accounts");
  await page.getByRole("button", { name: "New account" }).click();

  const panel = page.getByRole("dialog", { name: "Create account" });
  await panel.getByLabel("FQN").fill(fqn);
  await panel.getByLabel("Display label (optional)").fill(displayLabel);
  await panel.getByLabel("Type").click();
  await page.getByRole("option", { exact: true, name: "Owned" }).click();
  await panel.getByLabel("Currency", { exact: true }).fill("USD");
  await panel.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Account created.")).toBeVisible();
  const row = page.getByRole("button", { name: `Open account ${fqn}` });
  await expect(row.getByTestId("accounts-tree-fqn")).toHaveText(fqn);
  await expect(row.getByTestId("accounts-tree-display-label")).toHaveText(
    `(${displayLabel})`,
  );
});

test("account search retains a trailing space while keeping its query canonical", async ({
  page,
}) => {
  await page.goto("/accounts");
  const search = page.getByRole("searchbox", { name: "Search" });

  await search.fill("cash");
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "cash");
  await search.press("End");
  await search.press("Space");

  await expect(search).toHaveValue("cash ");
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "cash");
});

test("account editor changes a multi-currency account to single currency", async ({
  page,
}) => {
  const fqn = "e2e:currency:Wallet";
  await createAccount(page, fqn, "owned", null);

  await page.goto(`/accounts?q=${encodeURIComponent(fqn)}`);
  const row = page.getByRole("button", { name: `Open account ${fqn}` });
  await row.getByRole("button", { name: "Edit account" }).click();

  const panel = page.getByRole("dialog", { name: "Edit account" });
  await panel.getByLabel("Currency mode").click();
  await page.getByRole("option", { name: "Single-currency" }).click();
  await panel.getByLabel("Currency", { exact: true }).fill("EUR");
  await panel.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Account updated.")).toBeVisible();
  await expect(row).toContainText("EUR");
});

test("account group restructure moves its visible subtree", async ({
  page,
}) => {
  const sourcePrefix = "e2e:restructure:Old";
  const destinationPrefix = "e2e:restructure:New";
  await Promise.all([
    createAccount(page, `${sourcePrefix}:Checking`),
    createAccount(page, `${sourcePrefix}:Savings`),
  ]);

  await page.goto(`/accounts?q=${encodeURIComponent(sourcePrefix)}`);
  const sourceGroup = page.getByRole("button", {
    exact: true,
    name: `Open account group ${sourcePrefix}`,
  });
  await sourceGroup.getByRole("button", { name: "Move or rename" }).click();

  const dialog = page.getByRole("dialog", { name: "Move or rename" });
  await dialog.getByLabel("To").fill(destinationPrefix);
  await dialog.getByRole("button", { name: "Move" }).click();

  await expect(page.getByText("Moved 2 account(s).")).toBeVisible();
  await page.getByLabel("Search").fill(destinationPrefix);
  await expect(
    page.getByRole("button", {
      exact: true,
      name: `Open account group ${destinationPrefix}`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `Open account ${destinationPrefix}:Checking`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `Open account ${destinationPrefix}:Savings`,
    }),
  ).toBeVisible();
});

test("account register walks transaction detail by keyboard", async ({
  page,
}) => {
  const accountFqn = "e2e:register:Checking";
  const account = await createAccount(page, accountFqn);
  const merchant = await createAccount(
    page,
    "e2e:register-merchant:Books",
    "flow",
  );
  const category = await createCategory(page, "E2E:Register:Books");
  const newestMemo = "E2E account register newest";
  const middleMemo = "E2E account register middle";
  const oldestMemo = "E2E account register oldest";
  const newestTransaction = await createSpend(page, {
    amount: "18.25",
    categoryId: category.category_id,
    fundingAccountId: account.account_id,
    initiatedDate: "2026-08-17",
    memo: newestMemo,
    merchantAccountId: merchant.account_id,
  });
  const middleTransaction = await createSpend(page, {
    amount: "12.50",
    categoryId: category.category_id,
    fundingAccountId: account.account_id,
    initiatedDate: "2026-08-16",
    memo: middleMemo,
    merchantAccountId: merchant.account_id,
  });
  const oldestTransaction = await createSpend(page, {
    amount: "7.75",
    categoryId: category.category_id,
    fundingAccountId: account.account_id,
    initiatedDate: "2026-08-15",
    memo: oldestMemo,
    merchantAccountId: merchant.account_id,
  });

  await page.goto(`/accounts?q=${encodeURIComponent(accountFqn)}`);
  const accountRow = page.getByRole("button", {
    name: `Open account ${accountFqn}`,
  });
  await accountRow.focus();
  await accountRow.press("Enter");

  await expect(page).toHaveURL(new RegExp(`/accounts/${account.account_id}$`));
  const newestRow = page
    .getByTestId("account-register-row")
    .filter({ hasText: newestMemo });
  const middleRow = page
    .getByTestId("account-register-row")
    .filter({ hasText: middleMemo });
  const oldestRow = page
    .getByTestId("account-register-row")
    .filter({ hasText: oldestMemo });
  await expect(newestRow).toBeVisible();
  await newestRow.focus();
  await newestRow.press("Enter");

  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${newestTransaction.transaction_id}(?:&|$)`),
  );
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail).toBeVisible();
  await expect(
    detail.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(newestMemo);

  await page.keyboard.press("ArrowDown");
  await expect(middleRow).toBeFocused();
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${middleTransaction.transaction_id}(?:&|$)`),
  );
  await expect(
    detail.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(middleMemo);

  await page.keyboard.press("ArrowDown");
  await expect(oldestRow).toBeFocused();
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${oldestTransaction.transaction_id}(?:&|$)`),
  );
  await expect(
    detail.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(oldestMemo);

  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]transaction=/);
  await expect(oldestRow).toBeFocused();
});

test("account group register shows its subtotal and combined activity", async ({
  page,
}) => {
  const prefix = "e2e:group-register";
  const wallet = await createAccount(page, `${prefix}:Wallet`);
  await createAccount(page, `${prefix}:Savings`);
  const merchant = await createAccount(
    page,
    "e2e:group-merchant:Books",
    "flow",
  );
  const category = await createCategory(page, "E2E:GroupRegister:Books");
  const memo = "E2E group register";
  await createSpend(page, {
    amount: "24.50",
    categoryId: category.category_id,
    fundingAccountId: wallet.account_id,
    memo,
    merchantAccountId: merchant.account_id,
  });

  await page.goto(`/accounts?q=${encodeURIComponent(prefix)}`);
  await page
    .getByRole("button", {
      exact: true,
      name: `Open account group ${prefix}`,
    })
    .click();

  await expect(page).toHaveURL(
    new RegExp(`/accounts/group\\?prefix=${encodeURIComponent(prefix)}(?:&|$)`),
  );
  await expect(page.getByTestId("account-group-subtotals")).toContainText(
    "Owned funds · 2 accounts",
  );
  await expect(
    page.getByTestId("account-register-row").filter({ hasText: memo }),
  ).toBeVisible();
});

test("account editor adds a credit limit", async ({ page }) => {
  const accountFqn = "e2e:credit-limit:Card";
  await createAccount(page, accountFqn);

  await page.goto(`/accounts?q=${encodeURIComponent(accountFqn)}`);
  const row = page.getByRole("button", {
    name: `Open account ${accountFqn}`,
  });
  await row.getByRole("button", { name: "Edit account" }).click();

  const panel = page.getByRole("dialog", { name: "Edit account" });
  await panel.getByRole("button", { name: "Add credit limit" }).click();
  await panel.getByLabel("Amount").fill("23000.00");
  await panel.getByLabel("Effective").fill("2026-08-15");
  await panel.getByRole("button", { name: "Add" }).click();

  await expect(page.getByText("Credit limit added.")).toBeVisible();
  await expect(
    panel.getByRole("listitem").filter({ hasText: "2026-08-15" }),
  ).toContainText("23,000.00 $");
  await expect(row.getByTestId("credit-limit-indicator")).toBeVisible();
});

test("system account is visible with read-only UI", async ({ page }) => {
  const fqn = "system:exchange";

  await page.goto(`/accounts?q=${encodeURIComponent(fqn)}`);
  const row = page.getByRole("button", { name: `Open account ${fqn}` });
  await expect(row).toBeVisible();
  await expect(row.getByText("System", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Edit account" })).toHaveCount(
    0,
  );
  await expect(row.getByRole("button", { name: "Delete account" })).toHaveCount(
    0,
  );
  await expect(row.getByRole("button", { name: "Move or rename" })).toHaveCount(
    0,
  );

  await row.click();
  await expect(page.getByText("Read-only system account")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit account" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Feature account" }),
  ).toHaveCount(0);
});

test("account deletion is available or explained from the backend signal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const groupFqn = "e2e:deleteability";
  const deletableFqn = "e2e:deleteability:Unused";
  const dependentFqn = "e2e:deleteability:InUse";
  await createAccount(page, deletableFqn);
  const dependent = await createAccount(page, dependentFqn);
  const merchant = await createAccount(
    page,
    "e2e:deleteability-merchant:Shop",
    "flow",
  );
  const category = await createCategory(page, "E2E:Deleteability");
  await createSpend(page, {
    amount: "4.25",
    categoryId: category.category_id,
    fundingAccountId: dependent.account_id,
    memo: "E2E account deleteability dependency",
    merchantAccountId: merchant.account_id,
  });

  await page.goto(`/accounts?q=${encodeURIComponent(deletableFqn)}`);
  const deletableRow = page.getByRole("button", {
    name: `Open account ${deletableFqn}`,
  });
  await deletableRow.getByRole("button", { name: "Delete account" }).click();
  const deleteDialog = page.getByRole("alertdialog", {
    name: "Delete account",
  });
  await expect(deleteDialog).toContainText(deletableFqn);
  await deleteDialog.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText("Account deleted.")).toBeVisible();
  await expect(deletableRow).toHaveCount(0);

  await page.getByLabel("Search").fill(dependentFqn);
  const dependentRow = page.getByRole("button", {
    name: `Open account ${dependentFqn}`,
  });
  const rowDelete = dependentRow.getByRole("button", {
    name: "Delete account",
  });
  await expect(rowDelete).toHaveAttribute("aria-disabled", "true");
  await rowDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Account has active dependent records.",
  );
  await rowDelete.focus();
  await page.keyboard.press("Enter");
  await expect(deleteDialog).toHaveCount(0);

  await dependentRow.getByRole("button", { name: "Edit account" }).click();
  const editPanel = page.getByRole("dialog", { name: "Edit account" });
  const panelDelete = editPanel.getByRole("button", { name: "Delete" });
  await expect(panelDelete).toHaveAttribute("aria-disabled", "true");
  await panelDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Account has active dependent records.",
  );
  await panelDelete.focus();
  await page.keyboard.press("Enter");
  await expect(deleteDialog).toHaveCount(0);

  const groupRow = page.getByRole("button", {
    exact: true,
    name: `Open account group ${groupFqn}`,
  });
  await expect(groupRow).toBeVisible();
  await expect(
    groupRow.getByRole("button", { name: "Delete account" }),
  ).toHaveCount(0);
});

test("hidden account can be included", async ({ page }) => {
  const fqn = "e2e:hidden:Everyday";
  await createAccount(page, fqn);

  await page.goto(`/accounts?q=${encodeURIComponent(fqn)}`);
  const row = page.getByRole("button", { name: `Open account ${fqn}` });
  await row.getByRole("button", { name: "Hide account" }).click();
  await expect(row).toHaveCount(0);

  await page.getByLabel("Include hidden").click();
  await expect(row).toBeVisible();
  await expect(row.getByLabel("Hidden account")).toBeVisible();
});

test("legacy credit limit locks a party account currency until deletion", async ({
  page,
}) => {
  const fqn = "e2e:credit-limit:Party";
  const account = await createAccount(page, fqn, "party");
  await createCreditLimit(page, account.account_id);

  await page.goto(`/accounts?q=${encodeURIComponent(fqn)}`);
  const row = page.getByRole("button", { name: `Open account ${fqn}` });
  await row.getByRole("button", { name: "Edit account" }).click();
  const panel = page.getByRole("dialog", { name: "Edit account" });
  const lockReason =
    "Currency cannot be changed while credit-limit history exists. Delete all credit-limit history to unlock it.";
  await expect(panel.getByLabel("Currency mode")).toBeDisabled();
  await expect(panel.getByLabel("Currency", { exact: true })).toBeDisabled();
  await expect(panel.getByText(lockReason)).toBeVisible();

  const historyRow = panel
    .getByRole("listitem")
    .filter({ hasText: "2026-08-15" });
  await expect(historyRow).toContainText("5,000.00 $");
  await historyRow.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Delete credit limit",
  });
  await dialog.getByRole("button", { name: "Delete credit limit" }).click();

  await expect(page.getByText("Credit limit deleted.")).toBeVisible();
  await expect(panel.getByLabel("Currency mode")).toBeEnabled();
  await expect(panel.getByLabel("Currency", { exact: true })).toBeEditable();
  await expect(panel.getByText(lockReason)).toHaveCount(0);
});

test("account register stays usable across representative widths", async ({
  page,
}) => {
  const currency = "USD";
  const longCurrency = "C::THISISAREALLYLONGTOKEN";
  const fqn = "e2e:responsive:household:long-term-reserves";
  const longCurrencyFqn = "e2e:responsive:LongCurrency";
  const displayLabel = "Household reserves";
  const account = await createAccount(
    page,
    fqn,
    "owned",
    currency,
    displayLabel,
  );
  const merchant = await createAccount(
    page,
    "e2e:responsive-merchant:Subscriptions",
    "flow",
    currency,
  );
  await createAccount(page, longCurrencyFqn, "owned", longCurrency);
  const category = await createCategory(page, "E2E:Responsive");
  await createCreditLimit(page, account.account_id, "25000");
  await createSpend(page, {
    amount: "18.25",
    categoryId: category.category_id,
    currency,
    fundingAccountId: account.account_id,
    memo: "E2E responsive register",
    merchantAccountId: merchant.account_id,
  });

  await page.goto(`/accounts/${account.account_id}`);
  const header = page.getByTestId("account-header");
  const label = header.getByText(displayLabel, { exact: true });
  const currencyBadge = header
    .locator('[data-slot="badge"]')
    .filter({ hasText: currency });
  const standing = header.locator(".account-header-standing");
  const featureAction = header.getByRole("button", {
    name: "Feature account",
  });
  const categoryHeader = page.getByRole("columnheader", { name: "Category" });
  const memoHeader = page.getByRole("columnheader", { name: "Memo" });
  const statusHeader = page.getByRole("columnheader", { name: "Status" });
  const registerScroll = page.getByTestId("account-register-table-scroll");
  const registerRow = page.getByTestId("account-register-row");

  for (const viewport of [
    { name: "wide", width: 1440 },
    { name: "tablet", width: 768 },
    { name: "phone", width: 480 },
  ] as const) {
    await page.setViewportSize({ width: viewport.width, height: 900 });
    await expect(label, `${viewport.name} account identity`).toBeVisible();
    await expect(currencyBadge).toBeVisible();
    await expect(header.getByText("Balances", { exact: true })).toBeVisible();
    await expect(
      header.getByText("Credit history", { exact: true }),
    ).toBeVisible();
    await expect(featureAction).toBeVisible();
    await expect(registerRow).toBeVisible();
    const standingArrangement = await standing.evaluate((element) => {
      const [balances, creditHistory] = Array.from(element.children);
      if (
        !(balances instanceof HTMLElement) ||
        !(creditHistory instanceof HTMLElement)
      ) {
        return "missing";
      }
      const balancesRect = balances.getBoundingClientRect();
      const creditHistoryRect = creditHistory.getBoundingClientRect();
      if (creditHistoryRect.left >= balancesRect.right - 1) {
        return "side-by-side";
      }
      if (creditHistoryRect.top >= balancesRect.bottom - 1) {
        return "stacked";
      }
      return "overlapping";
    });
    expect(standingArrangement).toBe(
      viewport.name === "phone" ? "stacked" : "side-by-side",
    );
    if (viewport.name === "phone") {
      expect(
        await header.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
        "phone account header stays contained",
      ).toBe(true);
      expect(
        await registerScroll.evaluate((element) => {
          const row = element.querySelector<HTMLElement>(
            '[data-testid="account-register-row"]',
          );
          const elementRect = element.getBoundingClientRect();
          const rowRect = row?.getBoundingClientRect();
          return (
            rowRect !== undefined &&
            rowRect.left >= elementRect.left - 1 &&
            rowRect.right <= elementRect.right + 1
          );
        }),
        "phone account register stays contained",
      ).toBe(true);
    } else {
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
        `${viewport.name} page has no horizontal overflow`,
      ).toBe(true);
    }

    if (viewport.name === "wide") {
      await expect(categoryHeader).toBeVisible();
      await expect(memoHeader).toBeVisible();
      await expect(statusHeader).toBeVisible();
    } else {
      await expect(categoryHeader).toBeHidden();
      await expect(memoHeader).toBeHidden();
      await expect(statusHeader).toBeHidden();
    }
  }

  await label.focus();
  await expect(label).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText(
    `${displayLabel} · ${fqn}`,
  );

  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto(`/accounts?q=${encodeURIComponent(longCurrencyFqn)}`);
  const longCurrencyRow = page.getByRole("button", {
    name: `Open account ${longCurrencyFqn}`,
  });
  await expect(
    longCurrencyRow.locator("td").nth(2).getByText(longCurrency, {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
    "tablet account chart has no horizontal overflow",
  ).toBe(true);
});

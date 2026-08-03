import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
  readonly account_type: "flow" | "owned" | "party" | "system";
  readonly currency: string | null;
  readonly display_label: string;
  readonly fqn: string;
}

const createAccount = async (
  page: Page,
  {
    accountType = "owned",
    currency = "USD",
    fqn,
    hidden = false,
  }: {
    readonly accountType?: "flow" | "owned" | "party";
    readonly currency?: string | null;
    readonly fqn: string;
    readonly hidden?: boolean;
  },
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency,
      fqn,
      is_hidden: hidden,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as AccountFixture;
};

const accountTreeRow = (page: Page, account: AccountFixture) =>
  page.getByRole("button", {
    name: `Open account ${account.fqn}`,
  });

test("accounts tree shows single-currency credit-limit history without a matching balance row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const unique = Date.now().toString(36);
  const account = await createAccount(page, {
    fqn: `accounts:single-limit:${unique}`,
  });
  const limitResponse = await page.request.post(
    `/api/accounts/${account.account_id}/credit-limit-history`,
    {
      data: {
        credit_limit: "5000",
        effective_date: "2026-07-01",
      },
    },
  );
  expect(limitResponse.ok()).toBe(true);

  await page.goto(`/accounts?q=${encodeURIComponent(account.fqn)}`);
  const accountRow = accountTreeRow(page, account);
  await expect(accountRow).toBeVisible();
  await expect(accountRow.getByTestId("credit-limit-indicator")).toBeVisible();

  const featureRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${account.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  await accountRow.getByRole("button", { name: "Feature account" }).click();
  await featureRequest;
  await expect(accountRow.getByTestId("credit-limit-indicator")).toBeVisible();
});

test("non-owned credit-limit history can be deleted to unlock currency", async ({
  page,
}) => {
  const unique = Date.now().toString(36);
  const account = await createAccount(page, {
    accountType: "party",
    fqn: `accounts:party-limit:${unique}`,
  });
  const limitResponse = await page.request.post(
    `/api/accounts/${account.account_id}/credit-limit-history`,
    {
      data: {
        credit_limit: "5000",
        effective_date: "2026-07-01",
      },
    },
  );
  expect(limitResponse.ok()).toBe(true);

  await page.goto(`/accounts?q=${encodeURIComponent(account.fqn)}`);
  const accountRow = accountTreeRow(page, account);
  await accountRow.getByRole("button", { name: "Edit account" }).click();
  const editPanel = page.getByRole("dialog", { name: "Edit account" });
  await expect(editPanel.getByLabel("Currency mode")).toBeDisabled();
  await page.waitForTimeout(100);
  await expect(
    editPanel.getByLabel("Currency", { exact: true }),
  ).toBeDisabled();
  await expect(
    editPanel.getByText(
      "Currency cannot be changed while credit-limit history exists. Delete all credit-limit history to unlock it.",
    ),
  ).toBeVisible();
  const historyRow = editPanel
    .getByRole("listitem")
    .filter({ hasText: "2026-07-01" });
  await expect(historyRow).toContainText("5,000.00 $");
  await historyRow.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Delete credit limit",
  });
  await dialog.getByRole("button", { name: "Delete credit limit" }).click();
  await expect(editPanel.getByLabel("Currency mode")).toBeEnabled();
  await expect(
    editPanel.getByLabel("Currency", { exact: true }),
  ).toBeEditable();
  await expect(
    editPanel.getByText(
      "Currency cannot be changed while credit-limit history exists. Delete all credit-limit history to unlock it.",
    ),
  ).toHaveCount(0);
});

test("empty credit-limit history does not lock currency controls while loading", async ({
  page,
}) => {
  const unique = Date.now().toString(36);
  const account = await createAccount(page, {
    fqn: `accounts:empty-limit-history:${unique}`,
  });
  let releaseHistory: (() => void) | undefined;
  const historyReleased = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  await page.route(
    `**/api/accounts/${account.account_id}/credit-limit-history**`,
    async (route) => {
      await historyReleased;
      await route.continue();
    },
  );

  await page.goto(`/accounts?q=${encodeURIComponent(account.fqn)}`);
  const accountRow = accountTreeRow(page, account);
  await accountRow.getByRole("button", { name: "Edit account" }).click();
  const editPanel = page.getByRole("dialog", { name: "Edit account" });

  try {
    await expect(editPanel.getByLabel("Currency mode")).toBeEnabled();
    await expect(
      editPanel.getByLabel("Currency", { exact: true }),
    ).toBeEditable();
    await expect(
      editPanel.getByText(
        "Currency cannot be changed while credit-limit history exists. Delete all credit-limit history to unlock it.",
      ),
    ).toHaveCount(0);
  } finally {
    releaseHistory?.();
  }

  await expect(
    editPanel.getByRole("button", { name: "Add credit limit" }),
  ).toBeVisible();
});

test("a concurrent credit limit leaves a visible currency save error", async ({
  page,
}) => {
  const unique = Date.now().toString(36);
  const account = await createAccount(page, {
    fqn: `accounts:concurrent-limit:${unique}`,
  });

  await page.goto(`/accounts?q=${encodeURIComponent(account.fqn)}`);
  const row = accountTreeRow(page, account);
  await row.getByRole("button", { name: "Edit account" }).click();
  const editPanel = page.getByRole("dialog", { name: "Edit account" });
  await expect(
    editPanel.getByRole("button", { name: "Add credit limit" }),
  ).toBeVisible();
  await editPanel.getByLabel("Currency mode").click();
  await page.getByRole("option", { name: "Multi-currency" }).click();

  const concurrentPage = await page.context().newPage();
  await concurrentPage.goto(`/accounts?q=${encodeURIComponent(account.fqn)}`);
  const concurrentRow = accountTreeRow(concurrentPage, account);
  await concurrentRow.getByRole("button", { name: "Edit account" }).click();
  const concurrentPanel = concurrentPage.getByRole("dialog", {
    name: "Edit account",
  });
  await concurrentPanel
    .getByRole("button", { name: "Add credit limit" })
    .click();
  await concurrentPanel.getByLabel("Amount").fill("5000");
  await concurrentPanel.getByLabel("Effective").fill("2026-07-01");
  await concurrentPanel.getByRole("button", { name: "Add" }).click();
  await expect(concurrentPage.getByText("Credit limit added.")).toBeVisible();
  await concurrentPage.close();

  await editPanel.getByRole("button", { name: "Save" }).click();
  await expect(editPanel).toBeVisible();
  await expect(
    editPanel.getByText(
      "account currency cannot change while active credit limit history exists",
    ),
  ).toBeVisible();
});

test("long crypto currency codes remain fully visible", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 760 });
  const unique = Date.now().toString(36);
  const currency = "C::THISISAREALLYLONGTOKEN";
  const account = await createAccount(page, {
    currency,
    fqn: `accounts:crypto-layout:${unique}`,
  });

  await page.goto(`/accounts?q=${encodeURIComponent(account.fqn)}`);
  const row = accountTreeRow(page, account);
  const renderedCurrency = row.locator("td").nth(2).getByText(currency, {
    exact: true,
  });
  await expect(renderedCurrency).toBeVisible();
  const overflow = await renderedCurrency.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
});

test("currency save keeps its account form mounted until refresh completes", async ({
  page,
}) => {
  const unique = Date.now().toString(36);
  const account = await createAccount(page, {
    fqn: `accounts:close-save:${unique}`,
  });
  await page.goto(`/accounts?q=${encodeURIComponent(account.fqn)}`);
  const row = accountTreeRow(page, account);
  await row.getByRole("button", { name: "Edit account" }).click();
  const editPanel = page.getByRole("dialog", { name: "Edit account" });
  await editPanel.getByLabel("Currency mode").click();
  await page.getByRole("option", { name: "Multi-currency" }).click();

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
  const patchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/accounts/${account.account_id}` &&
      response.request().method() === "PATCH"
    );
  });
  const accountsRefresh = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts" && response.request().method() === "GET"
    );
  });

  await editPanel.getByRole("button", { name: "Save" }).click();
  await expect(
    editPanel.getByRole("button", { name: "Saving" }),
  ).toBeDisabled();
  const closeButton = editPanel.getByRole("button", {
    name: "Close account panel",
  });
  await expect(closeButton).toHaveAttribute("aria-disabled", "true");
  await closeButton.focus();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Saving prevents closing the account panel.",
  );
  await page.keyboard.press("Escape");
  await expect(editPanel).toBeVisible();
  releasePatch();
  await patchResponse;
  await accountsRefresh;

  await expect(editPanel).toBeHidden();
  await expect(row).toContainText("Multi-currency");
});

test("account forms save manual multi-to-single and single-currency edits", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `aaa_currency_mode:${unique}:Multi`;

  await page.goto("/accounts");
  await page.getByRole("button", { name: "New account" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create account" });
  await createPanel.getByLabel("FQN").fill(fqn);
  await createPanel.getByLabel("Currency mode").click();
  await page.getByRole("option", { name: "Multi-currency" }).click();
  await expect(createPanel.getByLabel("Currency", { exact: true })).toHaveCount(
    0,
  );

  await createPanel.getByRole("button", { name: "Create" }).click();
  await expect(createPanel).toBeHidden();
  await expect(page.getByText("Account created.")).toBeVisible();

  await page.getByLabel("Search").fill(fqn);
  const row = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Multi" })
    .first();
  await expect(row).toContainText("Multi-currency");

  await row.getByRole("button", { name: "Edit account" }).click();
  const editPanel = page.getByRole("dialog", { name: "Edit account" });
  await expect(
    editPanel.getByRole("button", { name: "Add credit limit" }),
  ).toHaveCount(0);
  await expect(
    editPanel.getByRole("heading", { name: "Credit-limit history" }),
  ).toHaveCount(0);
  await expect(editPanel.getByLabel("Limit currency")).toHaveCount(0);
  await editPanel.getByLabel("Currency mode").click();
  await page.getByRole("option", { name: "Single-currency" }).click();
  const currencyInput = editPanel.getByLabel("Currency", { exact: true });
  await expect(currencyInput).toBeEditable();
  await currencyInput.click();
  await page.keyboard.type("EUR");
  await expect(currencyInput).toHaveValue("EUR");
  await editPanel.getByRole("button", { name: "Save" }).click();
  await expect(editPanel).toBeHidden();
  await expect(page.getByText("Account updated.")).toBeVisible();
  await expect(row).toContainText("EUR");

  await row.getByRole("button", { name: "Edit account" }).click();
  await expect(currencyInput).toHaveValue("EUR");
  await currencyInput.click();
  await page.keyboard.type("CAD");
  await expect(currencyInput).toHaveValue("CAD");
  await editPanel.getByRole("button", { name: "Save" }).click();
  await expect(editPanel).toBeHidden();
  await expect(page.getByText("Account updated.")).toBeVisible();
  await expect(row).toContainText("CAD");

  await row.getByRole("button", { name: "Edit account" }).click();
  await expect(currencyInput).toHaveValue("CAD");
  await editPanel.getByRole("button", { name: "Add credit limit" }).click();
  await expect(editPanel.getByLabel("Limit currency")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(editPanel).toBeHidden();
});

test("an unmatched currency datalist value does not swallow panel Escape", async ({
  page,
}) => {
  await page.goto("/accounts");
  await page.getByRole("button", { name: "New account" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create account" });
  const currency = createPanel.getByLabel("Currency", { exact: true });
  await currency.fill("ZZZ");
  await currency.press("ArrowDown");
  await currency.press("Escape");
  await expect(createPanel).toBeHidden();
});

test("typing a matching currency lets Escape dismiss datalist suggestions first", async ({
  page,
}) => {
  await page.goto("/accounts");
  await page.getByRole("button", { name: "New account" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create account" });
  const currency = createPanel.getByLabel("Currency", { exact: true });
  await currency.fill("USD");
  await currency.press("Escape");
  await expect(createPanel).toBeVisible();
  await currency.press("Escape");
  await expect(createPanel).toBeHidden();

  await page.getByRole("button", { name: "New account" }).click();
  await currency.fill("USD");
  await currency.press("ArrowDown");
  await currency.press("Enter");
  await expect(currency).toHaveValue("USD");
  await currency.press("Escape");
  await expect(createPanel).toBeHidden();
});

test("pointer-opening currency suggestions lets Escape dismiss them first", async ({
  page,
}) => {
  await page.goto("/accounts");
  await page.getByRole("button", { name: "New account" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create account" });
  const currency = createPanel.getByLabel("Currency", { exact: true });
  const box = await currency.boundingBox();
  expect(box).not.toBeNull();
  await currency.click({ position: { x: box!.width - 8, y: box!.height / 2 } });
  await currency.press("Escape");
  await expect(createPanel).toBeVisible();
  await currency.press("Escape");
  await expect(createPanel).toBeHidden();
});

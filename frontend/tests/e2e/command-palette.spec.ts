import { expect, type Page, test } from "@playwright/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
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

const createHiddenAccount = async (
  page: Page,
  fqn: string,
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: "balance",
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
  await page.getByRole("combobox", { name: "Command search" }).fill("transfer");
  await page.getByRole("option", { name: "New transfer" }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByRole("tab", { name: "Transfer" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const transactionsRegion = page.getByLabel("Transactions", { exact: true });
  const pageNewTransactionButton = transactionsRegion.getByRole("button", {
    name: "New transaction",
  });

  await page.getByRole("button", { name: "Close entry panel" }).click();
  await pageNewTransactionButton.click();
  await expect(page.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("button", { name: "Close entry panel" }).click();
  await openPalette(page);
  await page.getByRole("combobox", { name: "Command search" }).fill("income");
  await page.getByRole("option", { name: "New income" }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByRole("tab", { name: "Income" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("button", { name: "Close entry panel" }).click();
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
    "Database backup failed: backup file directory is not configured",
  );
});

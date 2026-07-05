import { expect, type Page, test } from "@playwright/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface BalanceFixture {
  readonly account_id: number;
  readonly currency: string;
  readonly current_balance: string;
}

const decimalScale = 8;

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

const findByFqn = <T extends { readonly fqn: string }>(
  fixtures: readonly T[],
  fqn: string,
): T => {
  const fixture = fixtures.find((item) => item.fqn === fqn);
  expect(fixture, `${fqn} fixture`).toBeDefined();
  return fixture as T;
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
  expect(jointBalance).toBeDefined();

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

  await page.getByLabel("Type").selectOption("flow");
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

  await page.getByLabel("Type").selectOption("all");
  await expect(page).toHaveURL(/q=credit_card%3AChase%3ASapphire/);
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "Sapphire" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "BlueCash" }),
  ).toHaveCount(0);

  await page.getByLabel("Search").fill(hiddenAccount.fqn);
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "Vault" }),
  ).toHaveCount(0);

  await page.getByLabel("Include hidden").click();
  await expect(page).toHaveURL(/hidden=true/);
  const hiddenRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Vault" })
    .first();
  await expect(hiddenRow).toBeVisible();
  await expect(hiddenRow.getByLabel("Hidden account")).toBeVisible();
});

test("accounts page manages account forms, credit limits, and tombstone delete", async ({
  browserName,
  page,
}) => {
  const unique = Date.now().toString(36);
  const fqn = `e2e:accounts:${browserName}:${unique}:Checking`;

  await page.goto("/accounts");
  await page.getByRole("button", { name: "New account" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create account" });
  await expect(createPanel).toBeVisible();

  await createPanel.getByRole("button", { name: "Create" }).click();
  await expect(createPanel.getByText("FQN is required.")).toBeVisible();

  await createPanel.getByLabel("FQN").fill(fqn);
  await createPanel.getByLabel("FQN").blur();
  await expect(createPanel.getByText("FQN is required.")).toHaveCount(0);
  await createPanel.getByLabel("Type").selectOption("balance");
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
  await expect(page.getByText("Account created.")).toBeVisible();

  await page.getByLabel("Search").fill(fqn);
  const createdRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Checking" })
    .first();
  await expect(createdRow).toBeVisible();

  await page.getByLabel("Include hidden").click();
  await createdRow.click();
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
  await expect(page.getByText("Account updated.")).toBeVisible();
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
  await creditLimitRow.click();
  await expect(editPanel).toBeVisible();
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
  await expect(page.getByText("Credit limit added.")).toBeVisible();
  await expect(editPanel.getByText("2026-07-05")).toBeVisible();
  await expect(editPanel.getByText("23,000.00 $")).toBeVisible();

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
  await expect(page.getByText("Credit limit deleted.")).toBeVisible();
  await expect(editPanel.getByText("2026-07-05")).toHaveCount(0);

  await editPanel.getByRole("button", { name: "Close account panel" }).click();
  await page.getByLabel("Search").fill(fqn);
  const deleteRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "Checking" })
    .first();
  await expect(deleteRow).toBeVisible();
  await deleteRow.click();
  await expect(editPanel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editPanel).toBeHidden();
  await expect(deleteRow).toBeFocused();
  await deleteRow.click();
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
  await expect(page.getByText("Account deleted.")).toBeVisible();
  await expect(
    page.getByTestId("accounts-tree-row").filter({ hasText: "Checking" }),
  ).toHaveCount(0);
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
  await createPanel.getByLabel("Type").selectOption("balance");
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

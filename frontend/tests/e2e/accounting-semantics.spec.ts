import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

const chooseOption = async (
  page: Page,
  scope: Locator,
  label: string,
  search: string,
  value: string,
): Promise<void> => {
  const picker = scope.getByRole("combobox", { name: label });
  await picker.selectText();
  await picker.pressSequentially(search);
  await expect(picker).toHaveValue(search);
  const optionsId = await picker.getAttribute("aria-controls");
  expect(optionsId).not.toBeNull();
  const option = page
    .locator(`#${optionsId}`)
    .getByRole("option")
    .filter({ hasText: value })
    .first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(picker).toHaveValue(value);
};

const openEntry = async (page: Page): Promise<Locator> => {
  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(editor).toBeVisible();
  await expect(page.getByLabel("Start from a template")).toBeFocused();
  return editor;
};

const journalRecord = (page: Page, index: number): Locator =>
  page.locator(`[aria-label="Journal record ${index}"]`);

test("Spend submits multiple categorized merchants against one uncategorized funding record", async ({
  page,
}) => {
  const editor = await openEntry(page);
  const spend = editor.getByRole("tabpanel", { name: "Spend" });

  await spend.getByLabel("Date").fill("2026-05-30");
  await chooseOption(page, spend, "Funding account", "Wallet", "cash:Wallet");

  const firstMerchant = spend.getByRole("group", { name: "Merchant 1" });
  await chooseOption(
    page,
    firstMerchant,
    "Merchant account",
    "Powells",
    "merchant:PowellsBooks",
  );
  await firstMerchant.getByLabel("Amount").fill("12.00");
  await chooseOption(
    page,
    firstMerchant,
    "Category",
    "Books",
    "Entertainment:Books",
  );

  await spend.getByRole("button", { name: "Add merchant" }).click();
  const secondMerchant = spend.getByRole("group", { name: "Merchant 2" });
  await editor.getByRole("button", { name: "Save and add another" }).click();
  await expect(
    secondMerchant.getByText("Merchant account is required."),
  ).toBeVisible();
  await expect(
    secondMerchant.getByText("Enter a positive amount with up to 8 decimals."),
  ).toBeVisible();
  await expect(secondMerchant.getByText("Category is required.")).toBeVisible();
  await expect(
    secondMerchant.getByRole("combobox", { name: "Merchant account" }),
  ).toBeFocused();

  await chooseOption(
    page,
    secondMerchant,
    "Merchant account",
    "Target",
    "merchant:Target",
  );
  await secondMerchant.getByLabel("Amount").fill("19.00");
  await chooseOption(
    page,
    secondMerchant,
    "Category",
    "Household",
    "Shopping:Household",
  );

  const createRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/transactions" && request.method() === "POST";
  });
  await editor.getByRole("button", { name: "Save and add another" }).click();

  const payload = (await createRequest).postDataJSON() as {
    readonly records: readonly {
      readonly account_id: number;
      readonly amount: string;
      readonly category_id?: number | null;
    }[];
  };
  expect(payload.records).toHaveLength(3);
  expect(payload.records[0]).toMatchObject({
    amount: "-31",
    category_id: null,
  });
  expect(payload.records.slice(1)).toEqual([
    expect.objectContaining({
      amount: "12.00000000",
      category_id: expect.any(Number),
    }),
    expect.objectContaining({
      amount: "19.00000000",
      category_id: expect.any(Number),
    }),
  ]);
});

test("Refund is money coming back and Exchange shows the server-derived effective rate", async ({
  page,
}) => {
  test.slow();
  const editor = await openEntry(page);

  await editor.getByRole("tab", { name: "Refund" }).click();
  const refund = editor.getByRole("tabpanel", { name: "Refund" });
  await refund.getByLabel("Date").fill("2026-05-30");
  await refund.getByLabel("Amount received").fill("34.99");
  await chooseOption(
    page,
    refund,
    "Destination account",
    "Joint",
    "bank:Chase:joint_checking",
  );
  await chooseOption(page, refund, "Merchant", "Target", "merchant:Target");
  await chooseOption(
    page,
    refund,
    "Expense category",
    "Household",
    "Shopping:Household",
  );

  const refundResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/transactions/refund" &&
      response.request().method() === "POST",
  );
  await editor.getByRole("button", { name: "Save and add another" }).click();
  const savedRefund = await refundResponse;
  expect(savedRefund.ok()).toBe(true);
  expect(savedRefund.request().postDataJSON()).toMatchObject({
    amount: "34.99000000",
  });
  await expect(editor.getByText("Entries this session: 1")).toBeVisible();

  const exchangeTab = editor.getByRole("tab", { name: "Exchange" });
  await exchangeTab.click();
  await expect(exchangeTab).toHaveAttribute("aria-selected", "true");
  const exchange = editor.getByRole("tabpanel", { name: "Exchange" });
  await exchange.getByLabel("Date").fill("2026-05-30");
  await chooseOption(
    page,
    exchange,
    "From account",
    "joint_checking",
    "bank:Chase:joint_checking",
  );
  await exchange.getByLabel("Amount sold").fill("110.00");
  await chooseOption(
    page,
    exchange,
    "To account",
    "Fidelity:EUR",
    "bank:Fidelity:EUR",
  );
  await exchange.getByLabel("Amount bought").fill("100.00");
  await expect(
    exchange.getByText("1 EUR = 1.10000000 USD", { exact: true }),
  ).toBeVisible();

  const exchangeResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/transactions/exchange" &&
      response.request().method() === "POST",
  );
  await editor.getByRole("button", { name: "Save and add another" }).click();
  const savedExchangeResponse = await exchangeResponse;
  expect(savedExchangeResponse.ok()).toBe(true);
  const savedExchange = (await savedExchangeResponse.json()) as {
    readonly display_title: string;
  };
  await expect(exchange.getByLabel("Date")).toBeFocused();

  await page.setViewportSize({ width: 1000, height: 800 });
  const savedExchangeContext = editor.getByLabel(/^Saved transaction /);
  await savedExchangeContext.focus();
  await expect(savedExchangeContext).toBeFocused();
  const savedExchangeTooltip = page.getByRole("tooltip");
  await expect(savedExchangeTooltip).toBeVisible();
  await expect(savedExchangeTooltip).toContainText(savedExchange.display_title);
  await expect(savedExchangeTooltip).toContainText("bank:Chase:joint_checking");
  await expect(savedExchangeTooltip).toContainText("bank:Fidelity:EUR");
});

test("Exchange excludes destination accounts in the sold currency", async ({
  page,
}) => {
  const editor = await openEntry(page);
  await editor.getByRole("tab", { name: "Exchange" }).click();
  const exchange = editor.getByRole("tabpanel", { name: "Exchange" });
  await chooseOption(
    page,
    exchange,
    "From account",
    "joint_checking",
    "bank:Chase:joint_checking",
  );

  const destination = exchange.getByRole("combobox", { name: "To account" });
  await destination.fill("bank:Fidelity:USD");
  const optionsId = await destination.getAttribute("aria-controls");
  expect(optionsId).not.toBeNull();
  await expect(
    page
      .locator(`#${optionsId}`)
      .getByRole("option")
      .filter({ hasText: "bank:Fidelity:USD" }),
  ).toHaveCount(0);

  await destination.fill("Fidelity:EUR");
  await expect(
    page
      .locator(`#${optionsId}`)
      .getByRole("option")
      .filter({ hasText: "bank:Fidelity:EUR" }),
  ).toBeVisible();
});

test("Spend and Income allow party balance accounts", async ({ page }) => {
  const partyFqn = `people:E2EParty${Date.now()}:balance`;
  const accountResponse = await page.request.post("/api/accounts", {
    data: {
      account_type: "party",
      currency: "USD",
      fqn: partyFqn,
    },
  });
  expect(accountResponse.ok(), await accountResponse.text()).toBe(true);
  const partyAccount = (await accountResponse.json()) as {
    readonly account_id: number;
  };
  const editor = await openEntry(page);
  const spend = editor.getByRole("tabpanel", { name: "Spend" });

  await chooseOption(page, spend, "Funding account", "E2EParty", partyFqn);
  const merchant = spend.getByRole("group", { name: "Merchant 1" });
  await chooseOption(
    page,
    merchant,
    "Merchant account",
    "Powells",
    "merchant:PowellsBooks",
  );
  await merchant.getByLabel("Amount").fill("8.00");
  await chooseOption(
    page,
    merchant,
    "Category",
    "Books",
    "Entertainment:Books",
  );

  const spendResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/transactions/spend" &&
      response.request().method() === "POST",
  );
  await editor.getByRole("button", { name: "Save and add another" }).click();
  const spendTransaction = (await (await spendResponse).json()) as {
    readonly records: readonly {
      readonly account_id: number;
      readonly amount: string;
    }[];
  };
  expect(
    spendTransaction.records.find(
      (record) => record.account_id === partyAccount.account_id,
    )?.amount,
  ).toBe("-8.00000000");

  const incomeEditor = await openEntry(page);
  await incomeEditor.getByRole("tab", { name: "Income" }).click();
  const income = incomeEditor.getByRole("tabpanel", { name: "Income" });
  await income.getByLabel("Amount").fill("25.00");
  await chooseOption(page, income, "Destination account", "E2EParty", partyFqn);
  await chooseOption(page, income, "Source", "Acme", "employers:Acme:salary");
  await chooseOption(page, income, "Category", "Salary", "Income:Salary");

  const incomeResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/transactions/income" &&
      response.request().method() === "POST",
  );
  await incomeEditor
    .getByRole("button", { name: "Save and add another" })
    .click();
  const incomeTransaction = (await (await incomeResponse).json()) as {
    readonly records: readonly {
      readonly account_id: number;
      readonly amount: string;
    }[];
  };
  expect(
    incomeTransaction.records.find(
      (record) => record.account_id === partyAccount.account_id,
    )?.amount,
  ).toBe("25.00000000");
});

test("Advanced offers categories only on flow rows and previews server classification", async ({
  page,
}) => {
  const editor = await openEntry(page);
  await editor.getByRole("tab", { name: "Advanced" }).click();

  const funding = journalRecord(page, 1);
  const merchant = journalRecord(page, 2);
  await chooseOption(page, funding, "Account", "Wallet", "cash:Wallet");
  await expect(funding.getByRole("combobox", { name: "Category" })).toHaveCount(
    0,
  );
  await expect(
    funding.getByText("Not applicable", { exact: true }),
  ).toHaveCount(0);
  await funding.getByLabel("Amount").fill("-15.00");

  await chooseOption(
    page,
    merchant,
    "Account",
    "Powells",
    "merchant:PowellsBooks",
  );
  await expect(
    merchant.getByRole("combobox", { name: "Category" }),
  ).toBeVisible();
  await chooseOption(
    page,
    merchant,
    "Category",
    "Books",
    "Entertainment:Books",
  );
  await merchant.getByLabel("Amount").fill("15.00");

  const classifyResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/transactions/classify" &&
      response.request().method() === "POST" &&
      response.ok(),
  );
  await merchant.getByLabel("Amount").blur();
  await classifyResponse;

  const preview = editor.getByTestId("classification-preview");
  await expect(preview).toContainText("Spend");
  await expect(preview).toContainText("-15.00 $");
  await expect(funding.getByText("Balance", { exact: true })).toBeVisible();
  await expect(merchant.getByText("Expense", { exact: true })).toBeVisible();
});

test("clawback is available in class and record-role filters", async ({
  page,
}) => {
  await page.goto("/transactions?page=1&pageSize=25");

  const classFilter = page.getByLabel("Class");
  await classFilter.click();
  await expect(
    page.getByRole("option", { name: "Clawback", exact: true }),
  ).toBeVisible();

  const classRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.getAll("transaction_class").includes("clawback")
    );
  });
  await page.getByRole("option", { name: "Clawback", exact: true }).click();
  await classRequest;

  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { name: "Record role", exact: true }).click();
  await expect(page.getByText("Refund", { exact: true })).toBeVisible();
  const clawbackRole = page.getByRole("checkbox", {
    name: "Clawback",
    exact: true,
  });
  await expect(clawbackRole).toBeVisible();

  const roleRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.getAll("record_role").includes("clawback")
    );
  });
  await clawbackRole.click();
  await roleRequest;
  await expect(
    page.getByRole("button", { name: "Remove Record role Clawback" }),
  ).toBeVisible();
});

test("fixed system accounts are visible but read-only", async ({ page }) => {
  await page.goto("/accounts?q=system%3Aexchange");
  const row = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: "system:exchange" })
    .first();
  await expect(row).toBeVisible();
  await expect(row.getByText("System", { exact: true })).toBeVisible();

  for (const action of [
    "Edit account",
    "Delete account",
    "Move or rename",
    "Hide account",
    "Feature account",
  ]) {
    await expect(row.getByRole("button", { name: action })).toHaveCount(0);
  }

  await row.click();
  await expect(page.getByText("Read-only system account")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit account" })).toHaveCount(
    0,
  );
});

test("revealing a transfer charge focuses its account field", async ({
  page,
}) => {
  const editor = await openEntry(page);
  await editor.getByRole("tab", { name: "Transfer" }).click();

  const addCharge = editor.getByRole("button", { name: "Add charge" });
  await addCharge.focus();
  await page.keyboard.press("Enter");

  await expect(
    editor.getByRole("combobox", { name: "Charge account" }),
  ).toBeFocused();
});

test("adding a spend merchant focuses its account field", async ({ page }) => {
  const editor = await openEntry(page);
  const spend = editor.getByRole("tabpanel", { name: "Spend" });
  const addMerchant = spend.getByRole("button", { name: "Add merchant" });
  await addMerchant.focus();
  await page.keyboard.press("Enter");

  await expect(
    spend
      .getByRole("group", { name: "Merchant 2" })
      .getByRole("combobox", { name: "Merchant account" }),
  ).toBeFocused();
});

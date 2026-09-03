import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  chooseOptionByKeyboard,
  createAccount,
  createCategory,
  createTag,
  expect,
  findByFqn,
  listFixtures,
} from "@tests/e2e/transactions/support";

test("entry template picker browses hierarchy and applies defaults", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const base = `E2ETemplatePicker:${unique}`;
  const templateFqn = `${base}:Food:Coffee`;
  const memo = `Template coffee ${unique}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const funding = findByFqn(accounts, "cash:Wallet");
  const merchant = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const response = await page.request.post("/api/transaction-templates", {
    data: {
      fqn: templateFqn,
      records: [
        {
          account_id: funding.account_id,
          amount: "-12.50",
          currency: "USD",
          memo,
        },
        {
          account_id: merchant.account_id,
          amount: "12.50",
          category_id: category.category_id,
          currency: "USD",
          memo,
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const templateId = (
    (await response.json()) as { transaction_template_id: number }
  ).transaction_template_id;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const templatePicker = editor.getByRole("combobox", {
    name: "Start from a template",
  });
  await templatePicker.fill(`${base}:`);
  await page
    .getByRole("option", { name: new RegExp(`${base}:Food, group`) })
    .click();
  await page.locator(`#entry-template-option-${templateId}`).click();

  const spendPanel = editor.getByRole("tabpanel", { name: "Spend" });
  await expect(spendPanel.getByLabel("Funding account")).toHaveValue(
    funding.display_label,
  );
  const merchantRow = spendPanel.getByRole("group", { name: "Merchant 1" });
  await expect(merchantRow.getByLabel("Merchant account")).toHaveValue(
    merchant.display_label,
  );
  await expect(merchantRow.getByLabel("Amount")).toHaveValue("12.5");
  await expect(merchantRow.getByLabel("Category")).toHaveValue(
    category.display_label,
  );
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(memo);
});

test("category picker browses hierarchy and creates a namespaced leaf", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const base = `E2ECategoryPicker:${unique}`;
  await createCategory(page, `${base}:Food:Existing`, "expense");
  const createdFqn = `${base}:Food:Bakery`;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const spendPanel = page.getByRole("tabpanel", { name: "Spend" });
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
    { scope: spendPanel },
  );
  const categoryPicker = spendPanel.getByRole("combobox", { name: "Category" });
  await categoryPicker.fill(`${base}:`);
  await page.getByRole("option", { name: "Food, group, 1 child" }).click();
  await expect(categoryPicker).toHaveValue(`${base}:Food:`);
  await categoryPicker.fill(createdFqn);
  await page.getByRole("option", { name: `Create ${createdFqn}` }).click();

  await expect(categoryPicker).toHaveValue("Food:Bakery");
  await expect(categoryPicker).toHaveAccessibleDescription(
    new RegExp(`Selected full name: ${createdFqn}$`),
  );
});

test("tag multi-picker selects sibling leaves and retains their prefix", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const prefix = `E2ETagPicker:${unique}:Trip`;
  const [flights, hotels] = await Promise.all([
    createTag(page, `${prefix}:Flights`),
    createTag(page, `${prefix}:Hotels`),
  ]);

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const tagsPicker = page.getByRole("combobox", { name: "Tags" });
  const options = page.locator("#spend-tags-options");
  const selected = page.getByTestId("entity-multi-picker-selected");
  await tagsPicker.fill(`${prefix}:`);
  await options.locator(`#spend-tags-option-${flights.tag_id}`).click();
  await expect(tagsPicker).toHaveValue(`${prefix}:`);
  await tagsPicker.pressSequentially("Hot");
  await options.locator(`#spend-tags-option-${hotels.tag_id}`).click();

  await expect(selected).toContainText(flights.name);
  await expect(selected).toContainText(hotels.name);
  await expect(tagsPicker).toHaveValue(`${prefix}:`);
});

test("spend entry saves multiple merchant records", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E multi-merchant spend ${unique}`;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const spendPanel = editor.getByRole("tabpanel", { name: "Spend" });
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    "Wallet",
    "cash:Wallet",
    { scope: spendPanel },
  );
  const firstMerchant = spendPanel.getByRole("group", { name: "Merchant 1" });
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
    { scope: firstMerchant },
  );
  await firstMerchant.getByLabel("Amount").fill("10.25");
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: firstMerchant },
  );
  await spendPanel.getByRole("button", { name: "Add merchant" }).click();
  const secondMerchant = spendPanel.getByRole("group", { name: "Merchant 2" });
  await chooseOptionByKeyboard(page, "Merchant", "Target", "merchant:Target", {
    scope: secondMerchant,
  });
  await secondMerchant.getByLabel("Amount").fill("4.75");
  await chooseOptionByKeyboard(page, "Category", "Retail", "Refunds:Retail", {
    scope: secondMerchant,
  });
  await spendPanel.getByLabel("Memo").fill(memo);
  await editor.getByRole("button", { name: "Save and close" }).click();

  await expect(editor).toBeHidden();
  await page.getByLabel("Search").fill(memo);
  const transactionRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(transactionRow).toBeVisible();
  await transactionRow.locator(".transactions-description-column").click();
  const detail = page.getByTestId("transaction-detail-panel");
  const records = detail.locator("tr[data-detail-record-row='true']");
  await expect(records).toHaveCount(3);
  await expect(detail.getByText("cash:Wallet", { exact: true })).toBeVisible();
  await expect(
    detail.getByText("merchant:PowellsBooks", { exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByText("merchant:Target", { exact: true }),
  ).toBeVisible();
  await expect(
    detail
      .getByTestId("transaction-detail-records-table")
      .locator("td[data-label='Amount']"),
  ).toHaveText(["-15.00 $", "+10.25 $", "+4.75 $"]);
});

test("income entry saves money from a source", async ({ page }, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E income ${unique}`;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });

  await editor.getByRole("tab", { name: "Income" }).click();
  const incomePanel = editor.getByRole("tabpanel", { name: "Income" });
  await incomePanel.getByLabel("Amount").fill("41.25");
  await chooseOptionByKeyboard(
    page,
    "Destination account",
    "joint_checking",
    "bank:Chase:joint_checking",
    { scope: incomePanel },
  );
  await chooseOptionByKeyboard(
    page,
    "Source",
    "Acme",
    "employers:Acme:salary",
    { scope: incomePanel },
  );
  await chooseOptionByKeyboard(page, "Category", "Salary", "Income:Salary", {
    scope: incomePanel,
  });
  await incomePanel.getByLabel("Memo").fill(memo);
  await editor.getByRole("button", { name: "Save and close" }).click();

  await expect(editor).toBeHidden();
  await page.getByLabel("Search").fill(memo);
  const transactionRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(transactionRow).toBeVisible();
  await expect(
    transactionRow.getByRole("img", { name: "Income" }),
  ).toBeVisible();
  await transactionRow.locator(".transactions-description-column").click();
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(
    detail.getByRole("link", { name: "Acme:salary", exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByRole("link", { name: "Chase:joint_checking", exact: true }),
  ).toBeVisible();
  await expect(
    detail
      .getByTestId("transaction-detail-records-table")
      .locator("td[data-label='Amount']"),
  ).toHaveText(["+41.25 $", "-41.25 $"]);
});

test("refund entry saves money returned by a merchant", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E refund ${unique}`;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });

  await editor.getByRole("tab", { name: "Refund" }).click();
  const refundPanel = editor.getByRole("tabpanel", { name: "Refund" });
  await refundPanel.getByLabel("Amount").fill("12.75");
  await chooseOptionByKeyboard(
    page,
    "Destination account",
    "joint_checking",
    "bank:Chase:joint_checking",
    { scope: refundPanel },
  );
  await chooseOptionByKeyboard(page, "Merchant", "Target", "merchant:Target", {
    scope: refundPanel,
  });
  await chooseOptionByKeyboard(page, "Category", "Retail", "Refunds:Retail", {
    scope: refundPanel,
  });
  await refundPanel.getByLabel("Memo").fill(memo);
  await editor.getByRole("button", { name: "Save and close" }).click();

  await expect(editor).toBeHidden();
  await page.getByLabel("Search").fill(memo);
  const transactionRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(transactionRow).toBeVisible();
  await expect(
    transactionRow.getByRole("img", { name: "Refund" }),
  ).toBeVisible();
  await transactionRow.locator(".transactions-description-column").click();
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(
    detail.getByRole("link", { name: "merchant:Target", exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByRole("link", { name: "Chase:joint_checking", exact: true }),
  ).toBeVisible();
  await expect(
    detail
      .getByTestId("transaction-detail-records-table")
      .locator("td[data-label='Amount']"),
  ).toHaveText(["+12.75 $", "-12.75 $"]);
});

test("transfer entry moves money between accounts", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E transfer ${unique}`;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });

  await editor.getByRole("tab", { name: "Transfer" }).click();
  const transferPanel = editor.getByRole("tabpanel", { name: "Transfer" });
  await expect(
    editor.getByRole("heading", { name: "New transfer" }),
  ).toBeVisible();
  await transferPanel.getByLabel("Amount").fill("22.50");
  await chooseOptionByKeyboard(
    page,
    "From account",
    "joint_checking",
    "bank:Chase:joint_checking",
    { scope: transferPanel },
  );
  await chooseOptionByKeyboard(
    page,
    "To account",
    "emergency_savings",
    "bank:Ally:emergency_savings",
    { scope: transferPanel },
  );
  await expect(
    transferPanel.getByRole("button", { name: "Add charge" }),
  ).toBeVisible();
  await transferPanel.getByLabel("Memo").fill(memo);
  await editor.getByRole("button", { name: "Save and close" }).click();

  await expect(editor).toBeHidden();
  await page.getByLabel("Search").fill(memo);
  const transactionRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(transactionRow).toBeVisible();
  await expect(
    transactionRow.getByRole("img", { name: "Transfer" }),
  ).toBeVisible();
  await transactionRow.locator(".transactions-description-column").click();
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(
    detail.getByRole("link", { name: "Chase:joint_checking", exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByRole("link", {
      name: "Ally:emergency_savings",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    detail
      .getByTestId("transaction-detail-records-table")
      .locator("td[data-label='Amount']"),
  ).toHaveText(["-22.50 $", "+22.50 $"]);
});

test("exchange entry shows its effective rate before and after save", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const accountPrefix = `e2e:exchange:${unique}`;
  const soldFqn = `${accountPrefix}:Sold`;
  const usdDestinationFqn = `${accountPrefix}:USD destination`;
  const boughtFqn = `${accountPrefix}:EUR destination`;
  const [soldAccount, usdDestinationAccount, boughtAccount] = await Promise.all(
    [
      createAccount(page, soldFqn, "owned", "USD"),
      createAccount(page, usdDestinationFqn, "owned", "USD"),
      createAccount(page, boughtFqn, "owned", "EUR"),
    ],
  );
  const memo = `E2E exchange ${unique}`;
  const effectiveRate = "1 EUR = 1.10000000 USD";

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByRole("tab", { name: "Exchange" }).click();
  const exchangePanel = editor.getByRole("tabpanel", { name: "Exchange" });
  await chooseOptionByKeyboard(page, "From account", "Sold", soldFqn, {
    scope: exchangePanel,
  });
  await expect(exchangePanel.getByLabel("Currency sold")).toHaveValue("USD");
  await exchangePanel.getByLabel("Amount sold").fill("110");
  const destinationPicker = exchangePanel.getByRole("combobox", {
    name: "To account",
  });
  await destinationPicker.fill(`${accountPrefix}:`);
  const destinationOptionsId =
    await destinationPicker.getAttribute("aria-controls");
  expect(destinationOptionsId).not.toBeNull();
  const destinationOptions = page.locator(`#${destinationOptionsId}`);
  const boughtOption = destinationOptions
    .getByRole("option")
    .filter({ hasText: boughtAccount.display_label });
  await expect(boughtOption).toBeVisible();
  await expect(
    destinationOptions
      .getByRole("option")
      .filter({ hasText: usdDestinationAccount.display_label }),
  ).toHaveCount(0);
  await boughtOption.click();
  await expect(exchangePanel.getByLabel("Currency bought")).toHaveValue("EUR");
  await exchangePanel.getByLabel("Amount bought").fill("100");
  await exchangePanel.getByLabel("Memo").fill(memo);
  await expect(
    exchangePanel.getByText(effectiveRate, { exact: true }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Save and close" }).click();

  await expect(editor).toBeHidden();
  await page.getByLabel("Search").fill(memo);
  const transactionRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(transactionRow).toBeVisible();
  await expect(transactionRow.getByTestId("transaction-line-title")).toHaveText(
    `${soldAccount.display_label} ($) → ${boughtAccount.display_label} (€)`,
  );
  await transactionRow.locator(".transactions-description-column").click();
  await expect(page.getByTestId("exchange-effective-rate")).toHaveText(
    `Effective rate: ${effectiveRate}`,
  );
});

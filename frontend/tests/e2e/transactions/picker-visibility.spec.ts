import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  chooseOptionByKeyboard,
  createCategory,
  createMember,
  createTag,
  expect,
  findByFqn,
  formatLocalDate,
  hideCategory,
  hideTag,
  listFixtures,
  type TransactionDetailFixture,
  waitForLedgerLookups,
} from "@tests/e2e/transactions/support";

test("inline editors hide hidden controls and results while broader pickers retain the control", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const hiddenTagFqn = `E2E:Hidden:${unique}:QuietTag`;
  const hiddenCategoryFqn = `E2E:Hidden:${unique}:QuietCategory`;
  const [hiddenTag, hiddenCategory] = await Promise.all([
    createTag(page, hiddenTagFqn),
    createCategory(page, hiddenCategoryFqn, "expense"),
  ]);

  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E hidden tag ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "8.42",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: formatLocalDate(new Date()),
      memo,
      tag_ids: [hiddenTag.tag_id],
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionDetailFixture;
  await Promise.all([
    hideTag(page, hiddenTag),
    hideCategory(page, hiddenCategory),
  ]);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const hiddenTagRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(hiddenTagRow).toBeVisible();
  await expect(
    hiddenTagRow
      .locator(".transactions-tags-column")
      .getByText("QuietTag", { exact: true }),
  ).toBeVisible();

  const rowPrefix = `transaction-${transaction.transaction_id}`;
  const categoryCell = hiddenTagRow.getByTestId(`${rowPrefix}-category-cell`);
  await categoryCell.hover();
  await categoryCell.getByRole("button", { name: "Edit Category" }).click();
  const categoryEditor = hiddenTagRow.getByTestId(
    `${rowPrefix}-category-editor`,
  );
  await expect(
    categoryEditor.getByText("Include hidden", { exact: true }),
  ).toHaveCount(0);
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(hiddenCategoryFqn);
  await expect(categoryEditor.getByRole("listbox")).toContainText("No matches");
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .press("Escape");
  await categoryEditor
    .getByRole("button", { name: "Cancel category edit" })
    .click();
  await expect(categoryEditor).toHaveCount(0);
  await expect(categoryCell).toBeFocused();

  const tagsCell = hiddenTagRow.getByTestId(`${rowPrefix}-tags-cell`);
  await tagsCell.hover();
  await tagsCell.getByRole("button", { name: "Edit Tags" }).click();
  const tagsEditor = hiddenTagRow.getByTestId(`${rowPrefix}-tags-editor`);
  await expect(
    tagsEditor.getByText("Include hidden", { exact: true }),
  ).toHaveCount(0);
  await tagsEditor.getByRole("combobox", { name: "Tags" }).press("Escape");
  await tagsEditor.getByRole("button", { name: "Cancel tags edit" }).click();
  await expect(tagsEditor).toHaveCount(0);
  await expect(tagsCell).toBeFocused();

  const memberCell = hiddenTagRow.getByTestId(`${rowPrefix}-member-cell`);
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  const memberEditor = hiddenTagRow.getByTestId(`${rowPrefix}-member-editor`);
  await expect(
    memberEditor.getByText("Include hidden", { exact: true }),
  ).toHaveCount(0);
  await memberEditor.getByRole("combobox", { name: "Member" }).press("Escape");
  await memberEditor
    .getByRole("button", { name: "Cancel member edit" })
    .click();
  await expect(memberEditor).toHaveCount(0);
  await expect(memberCell).toBeFocused();

  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  const includeHiddenToggle = page.getByRole("checkbox", {
    name: "Include hidden",
  });
  await expect(includeHiddenToggle).toBeFocused();
  const filterTagsPicker = page.getByRole("combobox", { name: "Tags" });
  await filterTagsPicker.fill(hiddenTagFqn);
  await expect(filterTagsPicker).toHaveValue(hiddenTagFqn);
  await expect(filterTagsPicker).toBeFocused();
  await expect(filterTagsPicker).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    "No matches",
  );
  await expect(includeHiddenToggle).toBeVisible();
  await includeHiddenToggle.click();
  await expect(includeHiddenToggle).toBeChecked();
  await filterTagsPicker.focus();
  await expect(filterTagsPicker).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    "QuietTag",
  );
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Close filters" }).click();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const tagsPicker = page.getByRole("combobox", { name: "Tags" });
  await expect(tagsPicker).toBeVisible();
  await expect(tagsPicker).toBeEnabled();
  await tagsPicker.fill(hiddenTagFqn);
  await expect(tagsPicker).toHaveValue(hiddenTagFqn);
  await expect(page.locator("#spend-tags-options")).toContainText("No matches");
});

test("entry category picker requests spend intents and excludes hidden categories", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const hiddenCategoryFqn = `E2E:Hidden:${unique}:QuietSpendCategory${unique}`;
  const visibleCategoryFqn = `E2E:Visible:${unique}:PickerSpendCategory${unique}`;
  const visibleCategory = await createCategory(
    page,
    visibleCategoryFqn,
    "expense",
  );
  const hiddenCategory = await createCategory(
    page,
    hiddenCategoryFqn,
    "expense",
  );

  const [accounts] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const memo = `E2E hidden category ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "9.13",
      category_id: hiddenCategory.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: formatLocalDate(new Date()),
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  await hideCategory(page, hiddenCategory);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const hiddenCategoryRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(hiddenCategoryRow).toBeVisible();
  await expect(
    hiddenCategoryRow.getByText(hiddenCategory.name, { exact: true }),
  ).toBeVisible();

  const categoryRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/categories" &&
      url.searchParams.getAll("economic_intent").length > 0
    );
  });

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const categoryRequest = await categoryRequestPromise;
  const categoryRequestUrl = new URL(categoryRequest.url());
  expect(categoryRequestUrl.searchParams.getAll("economic_intent")).toEqual([
    "expense",
  ]);
  expect(categoryRequestUrl.searchParams.has("include_hidden")).toBe(false);
  expect(categoryRequestUrl.searchParams.has("include_tombstoned")).toBe(false);

  const spendPanel = page.getByRole("tabpanel", { name: "Spend" });
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
    {
      scope: spendPanel,
    },
  );
  const categoryPicker = page.getByRole("combobox", { name: "Category" });
  await categoryPicker.fill(visibleCategory.name);
  await expect(
    page
      .locator("#spend-merchant-0-category-options")
      .getByRole("option")
      .filter({ hasText: visibleCategory.name })
      .first(),
  ).toBeVisible();

  await categoryPicker.fill("Salary");
  await expect(
    page.locator("#spend-merchant-0-category-options"),
  ).toContainText("Create “Salary”");

  await categoryPicker.fill(hiddenCategory.name);
  await expect(
    page.locator(
      `#spend-merchant-0-category-option-${hiddenCategory.category_id}`,
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", {
      name: `Create ${hiddenCategory.name}`,
    }),
  ).toBeVisible();
});

test("member pickers keep colon-containing names flat", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const member = await createMember(page, `Household:${slug}${Date.now()}`);

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=25");
  await ledgerLookups;
  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Member" }).click();

  const memberPicker = page.getByRole("combobox", { name: "Members" });
  const memberOptions = page.locator("#transactions-filter-member-options");
  await memberPicker.fill("Household:");
  await expect(memberOptions).toHaveAttribute("data-picker-mode", "search");
  await expect(
    page.getByTestId("transactions-filter-member-breadcrumb"),
  ).toHaveCount(0);
  await expect(
    memberOptions.getByRole("option", { name: member.name }),
  ).toBeVisible();

  await memberPicker.fill(member.name);
  await expect(page.getByTestId("entity-multi-picker-selected")).toContainText(
    member.name,
  );
  await expect(memberPicker).toHaveValue("");
});

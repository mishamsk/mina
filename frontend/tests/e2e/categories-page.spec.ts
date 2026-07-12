import { expect, type Locator, type Page, test } from "@playwright/test";

interface CategoryFixture {
  readonly category_id: number;
  readonly economic_intent:
    | "adjustment"
    | "exchange"
    | "expense"
    | "fee"
    | "fx_gain_loss"
    | "income"
    | "refund"
    | "transfer";
  readonly fqn: string;
}

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface TransactionFixture {
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

const findByFqn = <T extends { readonly fqn: string }>(
  fixtures: readonly T[],
  fqn: string,
): T => {
  const fixture = fixtures.find((item) => item.fqn === fqn);
  expect(fixture, `${fqn} fixture`).toBeDefined();
  return fixture as T;
};

const activateRowAction = async (
  page: Page,
  row: Locator,
  actionName: string,
) => {
  const action = row.getByRole("button", { name: actionName });
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press("Tab");
  await action.focus();
  await expect(action).toBeFocused();
  await page.keyboard.press("Enter");
};

const createCategory = async (
  page: Page,
  {
    economicIntent = "expense",
    fqn,
    hidden = false,
  }: {
    readonly economicIntent?: CategoryFixture["economic_intent"];
    readonly fqn: string;
    readonly hidden?: boolean;
  },
): Promise<CategoryFixture> => {
  const response = await page.request.post("/api/categories", {
    data: {
      economic_intent: economicIntent,
      fqn,
      is_hidden: hidden,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as CategoryFixture;
};

test("category row delete closes the matching open editor", async ({
  browserName,
  page,
}) => {
  const category = await createCategory(page, {
    fqn: `E2EDeleteOpen:${browserName}${Date.now()}`,
  });

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  const panel = page.getByRole("dialog", { name: "Edit category" });
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();

  await activateRowAction(page, row, "Delete category");
  const dialog = page.getByRole("alertdialog", { name: "Delete category" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(panel).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Delete category" }),
  ).toBeFocused();

  await activateRowAction(page, row, "Delete category");
  const deleteResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/categories/${category.category_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await dialog.getByRole("button", { name: "Delete category" }).click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(panel).toBeHidden();
});

test("categories page renders demo hierarchy, intent badges, URL search, and hidden toggle", async ({
  browserName,
  page,
}) => {
  const unique = Date.now().toString(36);
  const hiddenCategory = await createCategory(page, {
    fqn: `E2EHidden:${browserName}${unique}`,
    hidden: true,
  });
  const categoriesResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      url.searchParams.get("include_hidden") === "true"
    );
  });
  const groupsResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories/groups" &&
      url.searchParams.get("include_hidden") === "true"
    );
  });

  await page.goto("/categories");
  await categoriesResponse;
  await groupsResponse;

  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
  const categoriesNavLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Categories" });
  await expect(categoriesNavLink).toHaveAttribute("aria-current", "page");

  const foodGroup = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Food" })
    .first();
  await expect(foodGroup).toBeVisible();
  await expect(foodGroup).not.toContainText("Expense");

  const groceriesRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Groceries" })
    .first();
  await expect(groceriesRow).toBeVisible();
  await expect(groceriesRow).toContainText("Expense");

  const mortgageGroup = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Mortgage" })
    .first();
  await expect(mortgageGroup).toBeVisible();
  const principalRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Principal" })
    .first();
  await expect(principalRow).toBeVisible();
  await expect(principalRow).toContainText("Transfer");
  const interestRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Interest" })
    .first();
  await expect(interestRow).toContainText("Expense");

  await expect(
    page
      .getByTestId("categories-tree-row")
      .filter({ hasText: hiddenCategory.fqn }),
  ).toHaveCount(0);

  await page.getByLabel("Search").fill("Housing:Mortgage:Principal");
  await expect(page).toHaveURL(
    /\/categories\?q=Housing%3AMortgage%3APrincipal$/,
  );
  await expect(
    page
      .getByTestId("categories-tree-row")
      .filter({ hasText: "Housing" })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("categories-tree-row")
      .filter({ hasText: "Mortgage" })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByTestId("categories-tree-row").filter({ hasText: "Principal" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("categories-tree-row").filter({ hasText: "Groceries" }),
  ).toHaveCount(0);

  await page.getByLabel("Search").fill(hiddenCategory.fqn);
  await expect(
    page
      .getByTestId("categories-tree-row")
      .filter({ hasText: hiddenCategory.fqn }),
  ).toHaveCount(0);

  await page.getByLabel("Include hidden").click();
  await expect(page).toHaveURL(/hidden=true/);
  const hiddenRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: hiddenCategory.fqn })
    .first();
  await expect(hiddenRow).toBeVisible();
  await expect(hiddenRow.getByLabel("Hidden item")).toBeVisible();
});

test("categories row actions hide groups and move renamed paths into transaction filters", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const leafFqn = `E2EActions:${unique}:Leaf`;
  const groupPrefix = `E2EActions:${unique}:Group`;
  const moveSource = `E2ERename:${unique}:Old`;
  const moveDestination = `E2ERename:${unique}:New`;
  await Promise.all([
    createCategory(page, { fqn: leafFqn }),
    createCategory(page, { fqn: `${groupPrefix}:One` }),
    createCategory(page, { fqn: `${groupPrefix}:Two` }),
    createCategory(page, { fqn: `${moveSource}:Alpha` }),
    createCategory(page, { fqn: `${moveSource}:Beta` }),
  ]);

  await page.goto("/transactions");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Category" }).click();
  const categoryPicker = page.getByRole("combobox", { name: "Categories" });
  await categoryPicker.fill(moveSource);
  await expect(
    page.locator("#transactions-filter-category-options"),
  ).toContainText(`${moveSource}:Alpha`);

  await page.goto("/categories");
  await page.getByLabel("Search").fill(leafFqn);
  const leafRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Leaf" })
    .first();
  await expect(leafRow).toBeVisible({ timeout: 10_000 });
  await leafRow.getByRole("button", { name: "Hide category" }).click();
  await expect(page.getByText("Category hidden.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("categories-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });
  await page.getByLabel("Include hidden").click();
  await expect(
    page.getByTestId("categories-tree-row").filter({ hasText: "Leaf" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page
      .getByTestId("categories-tree-row")
      .filter({ hasText: "Leaf" })
      .getByLabel("Hidden item"),
  ).toBeVisible();

  await page.goto(`/categories?q=${encodeURIComponent(groupPrefix)}`);
  const groupRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Group" })
    .first();
  await expect(groupRow).toBeVisible({ timeout: 10_000 });
  await groupRow.getByRole("button", { name: "Hide group" }).click();
  await expect(page.getByText("Category group hidden.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("categories-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });
  await page.getByLabel("Include hidden").click();
  await expect(
    page.getByTestId("categories-tree-row").filter({ hasText: "One" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByTestId("categories-tree-row").filter({ hasText: "Two" }),
  ).toBeVisible();

  await page.goto(`/categories?q=${encodeURIComponent(moveSource)}`);
  const moveGroupRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Old" })
    .first();
  await expect(moveGroupRow).toBeVisible({ timeout: 10_000 });
  await moveGroupRow.hover();
  await moveGroupRow.getByRole("button", { name: "Move or rename" }).click();
  const moveDialog = page.getByRole("dialog", { name: "Move or rename" });
  await expect(moveDialog).toBeVisible();
  await moveDialog.getByLabel("To").fill(moveDestination);
  const moveRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories/restructure" &&
      response.request().method() === "POST"
    );
  });
  await moveDialog.getByRole("button", { name: "Move" }).click();
  const moveResponse = await moveRequest;
  expect(moveResponse.status()).toBe(200);
  await expect(page.getByText("Moved 2 categories.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("categories-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });
  await page.getByLabel("Search").fill(moveDestination);
  await expect(
    page.getByTestId("categories-tree-row").filter({ hasText: "Alpha" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByTestId("categories-tree-row").filter({ hasText: "Beta" }),
  ).toBeVisible();

  await page.goto("/transactions");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Category" }).click();
  const refreshedCategoryPicker = page.getByRole("combobox", {
    name: "Categories",
  });
  await refreshedCategoryPicker.fill(moveDestination);
  await expect(
    page.locator("#transactions-filter-category-options"),
  ).toContainText(`${moveDestination}:Alpha`);
  await refreshedCategoryPicker.fill(moveSource);
  await expect(
    page.locator("#transactions-filter-category-options"),
  ).toContainText("No matches");
});

test("category delete row actions respect the API deleteability signal", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const blockedFqn = `E2EBlockedCategory:${unique}`;
  const eligibleFqn = `E2EEligibleCategory:${unique}`;
  const conflictFqn = `E2EConflictCategory:${unique}`;
  const groupFqn = `E2ECategoryGroup:${unique}`;
  const [blockedCategory, eligibleCategory, conflictCategory, , , accounts] =
    await Promise.all([
      createCategory(page, { fqn: blockedFqn }),
      createCategory(page, { fqn: eligibleFqn }),
      createCategory(page, { fqn: conflictFqn }),
      createCategory(page, { fqn: `${groupFqn}:One` }),
      createCategory(page, { fqn: `${groupFqn}:Two` }),
      listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const transactionResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "12.34",
        category_id: blockedCategory.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-05-31",
        memo: `E2E category deleteability ${unique}`,
      },
    },
  );
  expect(transactionResponse.ok()).toBe(true);

  await page.goto(`/categories?q=${encodeURIComponent(blockedFqn)}`);
  const blockedRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: blockedFqn })
    .first();
  const blockedDelete = blockedRow.getByRole("button", {
    name: "Delete category",
  });
  await expect(blockedRow).toBeVisible({ timeout: 10_000 });
  await expect(blockedDelete).toHaveAttribute("aria-disabled", "true");
  await blockedDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Category has active dependent records.",
  );
  await blockedDelete.click({ force: true });
  await expect(
    page.getByRole("alertdialog", { name: "Delete category" }),
  ).toBeHidden();
  await blockedDelete.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("alertdialog", { name: "Delete category" }),
  ).toBeHidden();

  await page.goto(`/categories?q=${encodeURIComponent(groupFqn)}`);
  const groupRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: groupFqn })
    .first();
  await expect(groupRow).toBeVisible({ timeout: 10_000 });
  await expect(
    groupRow.getByRole("button", { name: "Delete category" }),
  ).toHaveCount(0);

  await page.goto(`/categories?q=${encodeURIComponent(eligibleFqn)}`);
  const eligibleRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: eligibleFqn })
    .first();
  const eligibleDelete = eligibleRow.getByRole("button", {
    name: "Delete category",
  });
  await expect(eligibleRow).toBeVisible({ timeout: 10_000 });
  await expect(eligibleDelete).not.toHaveAttribute("aria-disabled", "true");
  await eligibleDelete.click();
  const eligibleDialog = page.getByRole("alertdialog", {
    name: "Delete category",
  });
  await expect(eligibleDialog).toContainText(eligibleFqn);
  await eligibleDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(eligibleDialog).toBeHidden();
  await expect(eligibleRow).toBeVisible();

  await eligibleDelete.click();
  const deleteResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/categories/${eligibleCategory.category_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await eligibleDialog.getByRole("button", { name: "Delete category" }).click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(page.getByText("Category deleted.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(eligibleRow).toHaveCount(0, { timeout: 10_000 });

  await page.goto(`/categories?q=${encodeURIComponent(conflictFqn)}`);
  const conflictRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: conflictFqn })
    .first();
  await expect(conflictRow).toBeVisible({ timeout: 10_000 });
  await page.route(
    `/api/categories/${conflictCategory.category_id}`,
    async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue();
        return;
      }
      await route.fulfill({
        body: JSON.stringify({
          error: {
            code: "conflict",
            message: "Category has active dependent records.",
          },
        }),
        contentType: "application/json",
        status: 409,
      });
    },
  );
  await conflictRow.getByRole("button", { name: "Delete category" }).click();
  const conflictDialog = page.getByRole("alertdialog", {
    name: "Delete category",
  });
  const conflictResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/categories/${conflictCategory.category_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await conflictDialog.getByRole("button", { name: "Delete category" }).click();
  expect((await conflictResponse).status()).toBe(409);
  await expect(conflictDialog.getByRole("alert")).toHaveText(
    "Category has active dependent records.",
  );
  await page.unroute(`/api/categories/${conflictCategory.category_id}`);
});

test("categories side panel creates edits and deletes categories with conflict feedback", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2EPanel:${unique}:Income`;
  const staleFqn = `E2EStaleDelete:${unique}`;

  await page.goto("/categories");
  await page.getByRole("button", { name: "New category" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create category" });
  await expect(createPanel).toBeVisible();
  await createPanel.getByLabel("FQN").fill(fqn);
  await createPanel.getByLabel("Intent").click();
  await page.getByRole("option", { exact: true, name: "Income" }).click();
  await expect(createPanel).toContainText("Counts toward income totals.");
  const createResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      response.request().method() === "POST"
    );
  });
  await createPanel.getByRole("button", { name: "Create" }).click();
  expect((await createResponse).status()).toBe(201);
  await expect(page.getByText("Category created.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(createPanel).toBeHidden();

  await page.getByLabel("Search").fill(fqn);
  const createdRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Income" })
    .first();
  await expect(createdRow).toBeVisible({ timeout: 10_000 });
  await expect(createdRow).toContainText("Income");
  await createdRow.click();

  const editPanel = page.getByRole("dialog", { name: "Edit category" });
  await expect(editPanel).toBeVisible();
  await expect(editPanel.getByLabel("FQN")).toHaveAttribute("readonly", "");
  await expect(editPanel).toContainText("Income");
  await expect(editPanel).toContainText("Counts toward income totals.");
  await editPanel.getByLabel("Hidden").click();
  const updateResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/categories/") &&
      response.request().method() === "PATCH"
    );
  });
  await editPanel.getByRole("button", { name: "Save" }).click();
  expect((await updateResponse).status()).toBe(200);
  await expect(page.getByText("Category updated.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("categories-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });

  await page.getByLabel("Include hidden").click();
  const hiddenRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Income" })
    .first();
  await expect(hiddenRow).toBeVisible({ timeout: 10_000 });
  await expect(hiddenRow.getByLabel("Hidden item")).toBeVisible();
  await hiddenRow.click();
  const hiddenEditPanel = page.getByRole("dialog", { name: "Edit category" });
  await hiddenEditPanel.getByRole("button", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("alertdialog", {
    name: "Delete category",
  });
  await expect(deleteDialog).toContainText(fqn);
  const deleteResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/categories/") &&
      response.request().method() === "DELETE"
    );
  });
  await deleteDialog.getByRole("button", { name: "Delete category" }).click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(page.getByText("Category deleted.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("categories-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });

  await page.goto("/categories?q=Food%3AGroceries");
  const groceriesRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Groceries" })
    .first();
  await expect(groceriesRow).toBeVisible({ timeout: 10_000 });
  await groceriesRow.click();
  const groceriesPanel = page.getByRole("dialog", { name: "Edit category" });
  const groceriesDelete = groceriesPanel.getByRole("button", {
    name: "Delete",
  });
  await expect(groceriesDelete).toHaveAttribute("aria-disabled", "true");
  await groceriesDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Category has active dependent records.",
  );
  await groceriesPanel
    .getByRole("button", { name: "Close category panel" })
    .click();

  const [staleCategory, accounts] = await Promise.all([
    createCategory(page, { fqn: staleFqn }),
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  await page.goto(`/categories?q=${encodeURIComponent(staleFqn)}`);
  const staleRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: staleFqn })
    .first();
  await expect(staleRow).toBeVisible({ timeout: 10_000 });
  await staleRow.click();
  const stalePanel = page.getByRole("dialog", { name: "Edit category" });
  const staleDelete = stalePanel.getByRole("button", { name: "Delete" });
  await expect(staleDelete).not.toHaveAttribute("aria-disabled", "true");

  const transactionResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "12.34",
        category_id: staleCategory.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-05-31",
        memo: `E2E category stale delete ${unique}`,
      },
    },
  );
  expect(transactionResponse.ok()).toBe(true);
  const staleTransaction =
    (await transactionResponse.json()) as TransactionFixture;

  await staleDelete.click();
  const conflictDialog = page.getByRole("alertdialog", {
    name: "Delete category",
  });
  const conflictResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/categories/${staleCategory.category_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await conflictDialog.getByRole("button", { name: "Delete category" }).click();
  expect((await conflictResponse).status()).toBe(409);
  await expect(conflictDialog.getByRole("alert")).toContainText(
    /active|depend|reference|could not/i,
  );

  const transactionDeleteResponse = await page.request.delete(
    `/api/transactions/${staleTransaction.transaction_id}`,
  );
  expect(transactionDeleteResponse.ok()).toBe(true);
  const categoryDeleteResponse = await page.request.delete(
    `/api/categories/${staleCategory.category_id}`,
  );
  expect(categoryDeleteResponse.ok()).toBe(true);
});

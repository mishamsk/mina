import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface CategoryFixture {
  readonly category_id: number;
  readonly economic_intent: "expense" | "income";
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
  await row.getByRole("button", { name: "Edit category" }).click();
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

test("category favorite toggle ignores reactivation while pending", async ({
  browserName,
  page,
}) => {
  const category = await createCategory(page, {
    fqn: `E2EFavoritePending:${browserName}${Date.now()}`,
  });
  let favoriteRequestCount = 0;
  let releaseFavoriteRequest: (() => void) | undefined;
  const favoriteRequestReleased = new Promise<void>((resolve) => {
    releaseFavoriteRequest = resolve;
  });
  let markFavoriteRequestStarted: (() => void) | undefined;
  const favoriteRequestStarted = new Promise<void>((resolve) => {
    markFavoriteRequestStarted = resolve;
  });

  await page.route(`/api/categories/${category.category_id}`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    favoriteRequestCount += 1;
    markFavoriteRequestStarted?.();
    await favoriteRequestReleased;
    await route.continue();
  });

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn })
    .first();
  const toggle = row.getByRole("button", { name: "Feature category" });
  await expect(toggle).toBeVisible();
  await toggle.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await favoriteRequestStarted;

  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  expect(favoriteRequestCount).toBe(1);

  const favoriteResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/categories/${category.category_id}` &&
      response.request().method() === "PATCH"
    );
  });
  releaseFavoriteRequest?.();
  expect((await favoriteResponse).ok()).toBe(true);
  await expect(
    row.getByRole("button", { name: "Unfeature category" }),
  ).not.toHaveAttribute("aria-disabled", "true");
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
  await expect(
    groceriesRow.getByRole("button", { name: "Edit category" }),
  ).toBeVisible();
  await expect(
    groceriesRow.getByRole("button", { name: "Move or rename" }),
  ).toBeVisible();

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
  await expect(principalRow).toContainText("Expense");
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

test("categories economic intent filter is URL-backed and filters API requests", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const incomeCategory = await createCategory(page, {
    economicIntent: "income",
    fqn: `E2EIntent:${unique}:IncomeLeaf`,
  });
  const expenseCategory = await createCategory(page, {
    economicIntent: "expense",
    fqn: `E2EIntent:${unique}:ExpenseLeaf`,
  });
  const intentSelect = page.getByRole("combobox", { name: "Economic intent" });
  const incomeRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: incomeCategory.fqn });
  const expenseRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: expenseCategory.fqn });
  const waitForCategories = (economicIntent: "expense" | "income" | null) =>
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/categories" &&
        url.searchParams.get("economic_intent") === economicIntent
      );
    });
  const chooseIntent = async (label: "All" | "Expense" | "Income") => {
    await intentSelect.click();
    await page.getByRole("option", { exact: true, name: label }).click();
  };
  const expectNewCategoryIntent = async (
    label: "Income" | "Expense" | "Select intent",
  ) => {
    await page.getByRole("button", { name: "New category" }).click();
    const panel = page.getByRole("dialog", { name: "Create category" });
    await expect(panel.getByRole("combobox", { name: "Intent" })).toHaveText(
      label,
    );
    await panel.getByRole("button", { name: "Close category panel" }).click();
  };

  const allResponse = waitForCategories(null);
  await page.goto(`/categories?q=${encodeURIComponent(`E2EIntent:${unique}`)}`);
  await allResponse;
  await expect(intentSelect).toHaveText("All");
  await expect(incomeRow).toBeVisible();
  await expect(expenseRow).toBeVisible();
  await expectNewCategoryIntent("Select intent");

  const incomeResponse = waitForCategories("income");
  await chooseIntent("Income");
  await incomeResponse;
  await expect(page).toHaveURL(/economic_intent=income/);
  await expect(intentSelect).toHaveText("Income");
  await expect(incomeRow).toBeVisible();
  await expect(expenseRow).toHaveCount(0);
  await expectNewCategoryIntent("Income");

  const reloadResponse = waitForCategories("income");
  await page.reload();
  await reloadResponse;
  await expect(intentSelect).toHaveText("Income");
  await expect(incomeRow).toBeVisible();
  await expect(expenseRow).toHaveCount(0);

  const expenseResponse = waitForCategories("expense");
  await chooseIntent("Expense");
  await expenseResponse;
  await expect(page).toHaveURL(/economic_intent=expense/);
  await expect(intentSelect).toHaveText("Expense");
  await expect(incomeRow).toHaveCount(0);
  await expect(expenseRow).toBeVisible();
  await expectNewCategoryIntent("Expense");

  const backResponse = waitForCategories("income");
  await page.goBack();
  await backResponse;
  await expect(intentSelect).toHaveText("Income");
  await expect(incomeRow).toBeVisible();
  await expect(expenseRow).toHaveCount(0);

  const forwardResponse = waitForCategories("expense");
  await page.goForward();
  await forwardResponse;
  await expect(intentSelect).toHaveText("Expense");
  await expect(incomeRow).toHaveCount(0);
  await expect(expenseRow).toBeVisible();

  const resetResponse = waitForCategories(null);
  await chooseIntent("All");
  await resetResponse;
  await expect(page).not.toHaveURL(/economic_intent=(?:expense|income)/);
  await expect(intentSelect).toHaveText("All");
  await expect(incomeRow).toBeVisible();
  await expect(expenseRow).toBeVisible();
});

test("category editor survives intent filters and adopts refreshed deleteability", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName}${Date.now()}`;
  const category = await createCategory(page, {
    economicIntent: "income",
    fqn: `E2EIntentEditor:${unique}`,
  });
  const expenseCategory = await createCategory(page, {
    economicIntent: "expense",
    fqn: `E2EIntentRefresh:${unique}`,
  });
  let incomeRequestCount = 0;
  let markDeleteabilityRefreshed: (() => void) | undefined;
  const deleteabilityRefreshed = new Promise<void>((resolve) => {
    markDeleteabilityRefreshed = resolve;
  });
  await page.route("**/api/categories?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("economic_intent") !== "income") {
      await route.continue();
      return;
    }
    incomeRequestCount += 1;
    if (incomeRequestCount === 1) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = (await response.json()) as {
      readonly categories: readonly (CategoryFixture & {
        readonly deletable?: boolean;
      })[];
    };
    await route.fulfill({
      response,
      json: {
        ...body,
        categories: body.categories.map((listedCategory) =>
          listedCategory.category_id === category.category_id
            ? { ...listedCategory, deletable: false }
            : listedCategory,
        ),
      },
    });
    markDeleteabilityRefreshed?.();
  });

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "Edit category" }).click();

  const panel = page.getByRole("dialog", { name: "Edit category" });
  await expect(panel.getByLabel("FQN")).toHaveValue(category.fqn);
  await panel.getByLabel("Hidden").click();
  const deleteButton = panel.getByRole("button", {
    exact: true,
    name: "Delete",
  });
  await expect(deleteButton).not.toHaveAttribute("aria-disabled", "true");

  const intentSelect = page.getByRole("combobox", { name: "Economic intent" });
  const chooseExpenseIntent = async () => {
    await intentSelect.click();
    const intentResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/categories" &&
        url.searchParams.get("economic_intent") === "expense"
      );
    });
    await page.getByRole("option", { exact: true, name: "Expense" }).click();
    await intentResponse;
  };
  await chooseExpenseIntent();

  await expect(row).toHaveCount(0);
  await expect(panel.getByLabel("FQN")).toHaveValue(category.fqn);
  await expect(panel.getByLabel("Hidden")).toBeChecked();
  await page.getByLabel("Search").fill(expenseCategory.fqn);
  const expenseRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: expenseCategory.fqn });
  await expect(expenseRow).toBeVisible();
  const hideExpense = expenseRow.getByRole("button", {
    name: "Hide category",
  });
  await hideExpense.focus();
  await page.keyboard.press("Enter");
  await deleteabilityRefreshed;
  await expect(panel.getByLabel("Hidden")).toBeChecked();
  await expect(deleteButton).toHaveAttribute("aria-disabled", "true");
  const updateResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "PATCH" &&
      url.pathname === `/api/categories/${category.category_id}`
    );
  });
  await panel.getByRole("button", { name: "Save" }).click();
  expect((await updateResponse).ok()).toBe(true);
  await expect(panel).toBeHidden();
});

test("Escape closes the intent selector before a category editor", async ({
  browserName,
  page,
}) => {
  const category = await createCategory(page, {
    fqn: `E2EIntentEscape:${browserName}${Date.now()}`,
  });

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "Edit category" }).click();

  const panel = page.getByRole("dialog", { name: "Edit category" });
  await panel.getByLabel("Hidden").click();
  const intentSelect = page.locator("#categories-economic-intent");
  await intentSelect.click();
  await expect(intentSelect).toHaveAttribute("data-state", "open");

  await page.keyboard.press("Escape");

  await expect(intentSelect).toHaveAttribute("data-state", "closed");
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Hidden")).toBeChecked();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("Escape closes Categories help before a category editor", async ({
  browserName,
  page,
}) => {
  const category = await createCategory(page, {
    fqn: `E2EHelpEscape:${browserName}${Date.now()}`,
  });

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "Edit category" }).click();

  const panel = page.getByRole("dialog", { name: "Edit category" });
  await panel.getByLabel("Hidden").click();
  await page.getByRole("button", { name: "Categories help" }).click();
  const help = page.locator("[data-page-help-content]");
  await expect(help).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(help).toBeHidden();
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Hidden")).toBeChecked();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("returning to cached categories supersedes the abandoned intent request", async ({
  browserName,
  page,
}) => {
  const category = await createCategory(page, {
    fqn: `E2EIntentCache:${browserName}${Date.now()}`,
  });
  const startResolvers: (() => void)[] = [];
  const releaseResolvers: (() => void)[] = [];
  const starts = [0, 1].map(
    () =>
      new Promise<void>((resolve) => {
        startResolvers.push(resolve);
      }),
  );
  const releases = [0, 1].map(
    () =>
      new Promise<void>((resolve) => {
        releaseResolvers.push(resolve);
      }),
  );
  let incomeRequestCount = 0;
  await page.route("**/api/categories?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("economic_intent") !== "income") {
      await route.continue();
      return;
    }

    const requestIndex = incomeRequestCount;
    incomeRequestCount += 1;
    startResolvers[requestIndex]?.();
    await releases[requestIndex];
    if (requestIndex === 0) {
      await route.continue();
    } else {
      await route.fulfill({
        body: JSON.stringify({
          error: { code: "internal", message: "Abandoned intent failed." },
        }),
        contentType: "application/json",
        status: 500,
      });
    }
  });

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn });
  await expect(row).toBeVisible({ timeout: 10_000 });
  const intentSelect = page.getByRole("combobox", { name: "Economic intent" });
  const chooseIntent = async (label: "All" | "Income") => {
    await intentSelect.click();
    await page.getByRole("option", { exact: true, name: label }).click();
  };

  await chooseIntent("Income");
  await starts[0];
  await chooseIntent("All");
  const lateSuccess = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      url.searchParams.get("economic_intent") === "income"
    );
  });
  releaseResolvers[0]?.();
  await lateSuccess;
  await expect(row).toBeVisible();

  await chooseIntent("Income");
  await starts[1];
  await chooseIntent("All");
  const lateFailure = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.status() === 500 &&
      url.pathname === "/api/categories" &&
      url.searchParams.get("economic_intent") === "income"
    );
  });
  releaseResolvers[1]?.();
  await lateFailure;
  await expect(
    page.getByText("Categories could not be refreshed."),
  ).toHaveCount(0);
  await expect(row).toBeVisible();
});

test("returning to cached categories cancels a delayed intent retry", async ({
  browserName,
  page,
}) => {
  const category = await createCategory(page, {
    fqn: `E2EIntentRetry:${browserName}${Date.now()}`,
  });
  let incomeRequestCount = 0;
  await page.route("**/api/categories?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("economic_intent") !== "income") {
      await route.continue();
      return;
    }
    incomeRequestCount += 1;
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "internal", message: "Retry this request." },
      }),
      contentType: "application/json",
      status: 500,
    });
  });

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn });
  await expect(row).toBeVisible({ timeout: 10_000 });
  const intentSelect = page.getByRole("combobox", { name: "Economic intent" });
  await page.clock.install();

  await intentSelect.click();
  const firstFailure = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.status() === 500 &&
      url.pathname === "/api/categories" &&
      url.searchParams.get("economic_intent") === "income"
    );
  });
  await page.getByRole("option", { exact: true, name: "Income" }).click();
  await firstFailure;
  await page.clock.runFor(50);

  await intentSelect.click();
  await page.getByRole("option", { exact: true, name: "All" }).click();
  await expect(row).toBeVisible();
  await page.clock.runFor(300);

  expect(incomeRequestCount).toBe(1);
});

test("returning to an intent refetches a mutation-invalidated snapshot", async ({
  browserName,
  page,
}) => {
  const category = await createCategory(page, {
    fqn: `E2EIntentMutation:${browserName}${Date.now()}`,
  });
  let allRequestCount = 0;
  let markMutationRefreshStarted: (() => void) | undefined;
  const mutationRefreshStarted = new Promise<void>((resolve) => {
    markMutationRefreshStarted = resolve;
  });
  let releaseMutationRefresh: (() => void) | undefined;
  const mutationRefreshReleased = new Promise<void>((resolve) => {
    releaseMutationRefresh = resolve;
  });
  let markIncomeRefreshStarted: (() => void) | undefined;
  const incomeRefreshStarted = new Promise<void>((resolve) => {
    markIncomeRefreshStarted = resolve;
  });
  let releaseIncomeRefresh: (() => void) | undefined;
  const incomeRefreshReleased = new Promise<void>((resolve) => {
    releaseIncomeRefresh = resolve;
  });
  let markReplacementRefreshStarted: (() => void) | undefined;
  const replacementRefreshStarted = new Promise<void>((resolve) => {
    markReplacementRefreshStarted = resolve;
  });
  await page.route("**/api/categories?*", async (route) => {
    const url = new URL(route.request().url());
    const economicIntent = url.searchParams.get("economic_intent");
    if (economicIntent === "income") {
      markIncomeRefreshStarted?.();
      await incomeRefreshReleased;
      await route.continue();
      return;
    }
    if (economicIntent !== null) {
      await route.continue();
      return;
    }

    allRequestCount += 1;
    if (allRequestCount === 2) {
      markMutationRefreshStarted?.();
      await mutationRefreshReleased;
    } else if (allRequestCount === 3) {
      markReplacementRefreshStarted?.();
    }
    await route.continue();
  });

  await page.goto(
    `/categories?hidden=true&q=${encodeURIComponent(category.fqn)}`,
  );
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "Hide category" }).click();
  await mutationRefreshStarted;

  const intentSelect = page.getByRole("combobox", { name: "Economic intent" });
  await intentSelect.click();
  await page.getByRole("option", { exact: true, name: "Income" }).click();
  await incomeRefreshStarted;

  const replacementResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/categories" &&
      url.searchParams.get("economic_intent") === null
    );
  });
  await intentSelect.click();
  await page.getByRole("option", { exact: true, name: "All" }).click();
  await replacementRefreshStarted;
  await replacementResponse;

  await expect(row.getByLabel("Hidden item")).toBeVisible();

  const abandonedResponses = Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/categories" &&
        url.searchParams.get("economic_intent") === null
      );
    }),
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/categories" &&
        url.searchParams.get("economic_intent") === "income"
      );
    }),
  ]);
  releaseMutationRefresh?.();
  releaseIncomeRefresh?.();
  await abandonedResponses;
});

test("changing category intent keeps previous rows while loading", async ({
  browserName,
  page,
}) => {
  const category = await createCategory(page, {
    fqn: `E2EIntentLoading:${browserName}${Date.now()}`,
  });
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let releaseRequest: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/api/categories?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("economic_intent") !== "income") {
      await route.continue();
      return;
    }
    markStarted?.();
    await released;
    await route.continue();
  });

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn });
  await expect(row).toBeVisible({ timeout: 10_000 });

  const intentSelect = page.getByRole("combobox", { name: "Economic intent" });
  await intentSelect.click();
  await page.getByRole("option", { exact: true, name: "Income" }).click();
  await started;

  await expect(row).toBeVisible();
  await expect(page.getByTestId("reference-tree-loading")).toHaveCount(0);
  await expect(page.getByTestId("reference-table-frame")).toBeVisible();

  const incomeResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      url.searchParams.get("economic_intent") === "income"
    );
  });
  releaseRequest?.();
  await incomeResponse;
  await expect(row).toHaveCount(0);
});

test("an intent with no categories uses the filtered empty state", async ({
  page,
}) => {
  await page.route("**/api/categories?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("economic_intent") !== "income") {
      await route.continue();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        categories: [],
        limit: 500,
        offset: 0,
        total_count: 0,
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/categories?economic_intent=income");

  await expect(page.getByText("No categories", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "No categories match the current search and filters. The tree shows category paths, economic intent, and hidden state.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The category tree will show category paths, economic intent, and hidden state once categories exist.",
    ),
  ).toHaveCount(0);
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
  await expect(
    page.getByRole("checkbox", { name: "Include hidden" }),
  ).toBeFocused();
  await categoryPicker.fill(moveSource);
  await expect(
    page.getByRole("option", { name: /Old, group, 2 children/ }),
  ).toBeVisible();
  await categoryPicker.press("Enter");
  await expect(
    page.locator("#transactions-filter-category-options"),
  ).toContainText(`${moveSource}:Alpha`, { timeout: 10_000 });

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
  await expect(moveDialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New category" }),
  ).toBeFocused();
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
  await expect(
    page.getByRole("checkbox", { name: "Include hidden" }),
  ).toBeFocused();
  await refreshedCategoryPicker.fill(moveDestination);
  await expect(
    page.getByRole("option", { name: /New, group, 2 children/ }),
  ).toBeVisible();
  await refreshedCategoryPicker.press("Enter");
  await expect(
    page.locator("#transactions-filter-category-options"),
  ).toContainText(`${moveDestination}:Alpha`);
  await refreshedCategoryPicker.fill(moveSource);
  await refreshedCategoryPicker.press("ArrowDown");
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
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
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
  await expect(createPanel).toContainText(
    "Negative flow records are income; positive flow records are clawback.",
  );
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
  await expect(
    page.getByRole("button", { name: "New category" }),
  ).toBeFocused();

  await page.getByLabel("Search").fill(fqn);
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(fqn);
  const createdRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: "Income" })
    .first();
  await expect(createdRow).toBeVisible({ timeout: 10_000 });
  await expect(createdRow).toContainText("Income");
  await createdRow.getByRole("button", { name: "Edit category" }).click();

  const editPanel = page.getByRole("dialog", { name: "Edit category" });
  await expect(editPanel).toBeVisible();
  await expect(editPanel.getByLabel("FQN")).toHaveAttribute("readonly", "");
  await expect(editPanel).toContainText("Income");
  await expect(editPanel).toContainText(
    "Negative flow records are income; positive flow records are clawback.",
  );
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
  await hiddenRow.getByRole("button", { name: "Edit category" }).click();
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
  await groceriesRow.getByRole("button", { name: "Edit category" }).click();
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
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  await page.goto(`/categories?q=${encodeURIComponent(staleFqn)}`);
  const staleRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: staleFqn })
    .first();
  await expect(staleRow).toBeVisible({ timeout: 10_000 });
  await staleRow.getByRole("button", { name: "Edit category" }).click();
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

test("category creation refreshes the entry category picker after navigation", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const name = `PickerExpense${unique}`;
  const fqn = `E2EPickerRefresh:${unique}:${name}`;

  await page.goto("/categories");
  await page.getByRole("button", { name: "New category" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create category" });
  await createPanel.getByLabel("FQN").fill(fqn);
  await createPanel.getByLabel("Intent").click();
  await page.getByRole("option", { exact: true, name: "Expense" }).click();
  await createPanel.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Category created.")).toBeVisible({
    timeout: 10_000,
  });

  await page.goto("/transactions");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const categoryPicker = page.getByRole("combobox", { name: "Category" });
  await categoryPicker.fill(fqn);
  await expect(categoryPicker).toHaveValue(fqn);
});

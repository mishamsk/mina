import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  findByFqn,
  listFixtures,
} from "@tests/e2e/transactions/support";

interface CategoryFixture {
  readonly category_id: number;
  readonly economic_intent: "expense" | "income";
  readonly fqn: string;
}

const createCategory = async (
  page: Page,
  {
    economicIntent = "expense",
    fqn,
  }: {
    readonly economicIntent?: CategoryFixture["economic_intent"];
    readonly fqn: string;
  },
): Promise<CategoryFixture> => {
  const response = await page.request.post("/api/categories", {
    data: {
      economic_intent: economicIntent,
      fqn,
      is_hidden: false,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as CategoryFixture;
};

test("creating a category makes it available in transaction entry", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName}${Date.now()}`;
  const name = `Entry expense ${unique}`;
  const fqn = `E2ECreate:${unique}:${name}`;

  await page.goto("/categories");
  await page.getByRole("button", { name: "New category" }).click();
  const panel = page.getByRole("dialog", { name: "Create category" });
  await panel.getByLabel("FQN").fill(fqn);
  await panel.getByLabel("Intent").click();
  await page.getByRole("option", { exact: true, name: "Expense" }).click();
  await panel.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Category created.")).toBeVisible();

  await page.goto("/transactions");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const categoryPicker = page.getByRole("combobox", { name: "Category" });
  await categoryPicker.fill(fqn);
  await expect(categoryPicker).toHaveValue(`${unique}:${name}`);
});

test("editing a category display label makes its row searchable", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName}${Date.now()}`;
  const category = await createCategory(page, {
    fqn: `E2EEdit:${unique}:Groceries`,
  });
  const label = `Weekly food ${unique}`;

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn })
    .first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Edit category" }).click();

  const panel = page.getByRole("dialog", { name: "Edit category" });
  await panel.getByLabel("Display label (optional)").fill(label);
  await panel.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Category updated.")).toBeVisible();
  await page.getByLabel("Search").fill(label);
  await expect(row).toBeVisible();
});

test("deleting a category removes it from the list", async ({
  browserName,
  page,
}) => {
  const category = await createCategory(page, {
    fqn: `E2EDelete:${browserName}${Date.now()}`,
  });

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn })
    .first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Delete category" }).click();

  const dialog = page.getByRole("alertdialog", { name: "Delete category" });
  await expect(dialog).toContainText(category.fqn);
  await dialog.getByRole("button", { name: "Delete category" }).click();

  await expect(page.getByText("Category deleted.")).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("categories with active dependents explain why deletion is unavailable", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName}${Date.now()}`;
  const category = await createCategory(page, {
    fqn: `E2EBlockedDelete:${unique}`,
  });
  const accounts = await listFixtures<AccountFixture>(
    page,
    "/api/accounts",
    "accounts",
  );
  const transactionResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "12.34",
        category_id: category.category_id,
        counterparty_account_id: findByFqn(accounts, "merchant:PowellsBooks")
          .account_id,
        currency: "USD",
        funding_account_id: findByFqn(accounts, "cash:Wallet").account_id,
        initiated_date: "2026-05-31",
        memo: `E2E blocked category deletion ${unique}`,
      },
    },
  );
  expect(transactionResponse.ok(), await transactionResponse.text()).toBe(true);

  await page.goto(`/categories?q=${encodeURIComponent(category.fqn)}`);
  const row = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: category.fqn })
    .first();
  const rowDelete = row.getByRole("button", { name: "Delete category" });
  await expect(row).toBeVisible();
  await expect(rowDelete).toHaveAttribute("aria-disabled", "true");
  await rowDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Category has active dependent records.",
  );
});

test("economic intent filters the category list through the URL", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName}${Date.now()}`;
  const prefix = `E2EIntent:${unique}`;
  const [incomeCategory, expenseCategory] = await Promise.all([
    createCategory(page, {
      economicIntent: "income",
      fqn: `${prefix}:IncomeLeaf`,
    }),
    createCategory(page, {
      fqn: `${prefix}:ExpenseLeaf`,
    }),
  ]);

  await page.goto(`/categories?q=${encodeURIComponent(prefix)}`);
  const incomeRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: incomeCategory.fqn });
  const expenseRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: expenseCategory.fqn });
  await expect(incomeRow).toBeVisible();
  await expect(expenseRow).toBeVisible();

  await page.getByRole("combobox", { name: "Economic intent" }).click();
  await page.getByRole("option", { exact: true, name: "Income" }).click();

  await expect(page).toHaveURL(/economic_intent=income/);
  await expect(incomeRow).toBeVisible();
  await expect(expenseRow).toHaveCount(0);
});

test("moving a category group moves its visible subtree", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName}${Date.now()}`;
  const source = `E2EMove:${unique}:Old`;
  const destination = `E2EMove:${unique}:New`;
  await Promise.all([
    createCategory(page, { fqn: `${source}:Alpha` }),
    createCategory(page, { fqn: `${source}:Beta` }),
  ]);

  await page.goto(`/categories?q=${encodeURIComponent(source)}`);
  const sourceRow = page
    .getByTestId("categories-tree-row")
    .filter({ hasText: source })
    .first();
  await expect(sourceRow).toBeVisible();
  await sourceRow.getByRole("button", { name: "Move or rename" }).click();

  const dialog = page.getByRole("dialog", { name: "Move or rename" });
  await dialog.getByLabel("To").fill(destination);
  await dialog.getByRole("button", { name: "Move" }).click();

  await expect(page.getByText("Moved 2 categories.")).toBeVisible();
  await expect(sourceRow).toHaveCount(0);
  await page.getByLabel("Search").fill(destination);
  const rows = page.getByTestId("categories-tree-row");
  await expect(rows.filter({ hasText: "Alpha" })).toBeVisible();
  await expect(rows.filter({ hasText: "Beta" })).toBeVisible();
  await expect(rows.filter({ hasText: source })).toHaveCount(0);
});

import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

const createTemplate = async (
  page: Page,
  fqn: string,
  records: readonly Record<string, unknown>[],
): Promise<void> => {
  const response = await page.request.post("/api/transaction-templates", {
    data: { fqn, records },
  });
  expect(response.ok(), await response.text()).toBe(true);
};

const templateRow = (page: Page, fqn: string) =>
  page.getByTestId("templates-tree-row").filter({ hasText: fqn });

test("template search updates the URL and matching tree", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const targetFqn = `E2E:${unique}:Utilities:Electricity`;
  const unrelatedFqn = `E2E:${unique}:Household:Cleaning`;
  await Promise.all([
    createTemplate(page, targetFqn, [{}]),
    createTemplate(page, unrelatedFqn, [{}]),
  ]);

  await page.goto("/templates");
  await page.getByRole("searchbox", { name: "Search" }).fill(targetFqn);

  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/templates" && url.searchParams.get("q") === targetFqn,
  );
  await expect(templateRow(page, targetFqn)).toBeVisible();
  await expect(templateRow(page, unrelatedFqn)).toHaveCount(0);
});

test("template editor creates representative partial defaults", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Partial defaults`;

  await page.goto("/templates");
  await page.getByRole("button", { name: "New template" }).click();
  const editor = page.getByRole("dialog", { name: "New template" });
  await editor.getByLabel("Template FQN").fill(fqn);
  await editor.getByLabel("Amount (optional)").fill("10.25");
  await editor.getByLabel("Currency (optional)").fill("USD");
  await editor.getByLabel("Memo (optional)").fill(`Electricity ${unique}`);
  await editor.getByRole("button", { name: "Create template" }).click();

  await expect(page.getByText("Template created.")).toBeVisible();
  const row = templateRow(page, fqn);
  await expect(row).toBeVisible();
  await expect(row).toContainText("1 record · 0 accounts · 1 amount");
});

test("template row activation edits its partial defaults", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Edited defaults`;
  await createTemplate(page, fqn, [{ memo: "Before", tag_ids: [] }]);

  await page.goto(`/templates?q=${encodeURIComponent(fqn)}`);
  const row = templateRow(page, fqn);
  await expect(row).toBeVisible();
  await row.click();
  const editor = page.getByRole("dialog", { name: "Edit template" });
  await editor.getByLabel("Amount (optional)").fill("7.50");
  await editor.getByRole("button", { name: "Save template" }).click();

  await expect(page.getByText("Template updated.")).toBeVisible();
  await expect(row).toContainText("1 record · 0 accounts · 1 amount");
});

test("using a template row opens a seeded transaction entry", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Use template`;
  const memo = `Seeded memo ${unique}`;
  await createTemplate(page, fqn, [{ memo, tag_ids: [] }]);

  await page.goto(`/templates?q=${encodeURIComponent(fqn)}`);
  const row = templateRow(page, fqn);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Use template" }).click();

  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Record 1 memo")).toHaveValue(memo);
});

test("moving a template group updates its visible subtree", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const source = `E2E:${unique}:Utilities`;
  const destination = `E2E:${unique}:Bills`;
  await Promise.all([
    createTemplate(page, `${source}:Electricity`, [{}]),
    createTemplate(page, `${source}:Gas`, [{}]),
  ]);

  await page.goto(`/templates?q=${encodeURIComponent(source)}`);
  const sourceRow = templateRow(page, source).first();
  await expect(sourceRow).toBeVisible();
  await sourceRow.getByRole("button", { name: "Move or rename" }).click();
  const dialog = page.getByRole("dialog", { name: "Move or rename" });
  await dialog.getByLabel("To").fill(destination);
  await dialog.getByRole("button", { name: "Move" }).click();

  await expect(page.getByText("Moved 2 templates.")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search" }).fill(destination);
  await expect(templateRow(page, `${destination}:Electricity`)).toBeVisible();
  await expect(templateRow(page, `${destination}:Gas`)).toBeVisible();
  await expect(templateRow(page, source)).toHaveCount(0);
});

test("deleting a template removes its row", async ({ page }, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Delete template`;
  await createTemplate(page, fqn, [{}]);

  await page.goto(`/templates?q=${encodeURIComponent(fqn)}`);
  const row = templateRow(page, fqn);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Delete template" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete template" });
  await expect(dialog).toContainText(fqn);
  await dialog.getByRole("button", { name: "Delete template" }).click();

  await expect(page.getByText("Template deleted.")).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("narrow template actions open a copied recurring draft", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Recurring defaults`;
  await createTemplate(page, fqn, [
    {
      amount: "42.50000000",
      currency: "USD",
      memo: `Electricity ${unique}`,
      tag_ids: [],
    },
  ]);

  await page.setViewportSize({ height: 900, width: 600 });
  await page.goto(`/templates?q=${encodeURIComponent(fqn)}`);
  const row = templateRow(page, fqn);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();

  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await expect(editor).toBeVisible();
  const record = editor.getByLabel("Definition records").locator("section");
  await expect(record.getByLabel("Amount")).toHaveValue("42.50000000");
  await expect(record.getByLabel("Account")).toHaveValue("");
});

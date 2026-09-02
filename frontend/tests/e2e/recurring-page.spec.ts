import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

const definitionRow = (page: Page, fqn: string) =>
  page.getByTestId("recurring-definition-row").filter({ hasText: fqn });

const chooseRowAction = async (
  page: Page,
  row: Locator,
  actionName: string,
) => {
  const directAction = row.getByRole("button", {
    exact: true,
    name: actionName,
  });
  if (await directAction.isVisible()) {
    await directAction.click();
    return;
  }
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: actionName })
    .click();
};

test("recurring definition search updates the URL and matching rows", async ({
  page,
}) => {
  await page.goto("/recurring");

  await page.getByRole("searchbox", { name: "Search" }).fill("Mortgage");

  await expect(page).toHaveURL(/\/recurring\?q=Mortgage$/);
  await expect(page.getByTestId("recurring-definition-row")).toHaveCount(1);
  await expect(definitionRow(page, "Household:Mortgage")).toBeVisible();
});

test("recurring definition editor creates a balanced definition", async ({
  page,
}) => {
  const fqn = "E2E:Recurring:BookClub";
  await page.goto("/recurring");
  await page.getByRole("button", { name: "New definition" }).click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Definition FQN").fill(fqn);

  const records = editor.getByLabel("Definition records").locator("section");
  const fundingRecord = records.nth(0);
  const expenseRecord = records.nth(1);
  const fundingAccount = fundingRecord.getByLabel("Account");
  await fundingAccount.fill("bank:Chase:joint_checking");
  await expect(fundingAccount).toHaveAttribute("aria-expanded", "false");
  await fundingRecord.getByLabel("Amount").fill("-12.34");
  const expenseAccount = expenseRecord.getByLabel("Account");
  await expenseAccount.fill("merchant:PowellsBooks");
  await expect(expenseAccount).toHaveAttribute("aria-expanded", "false");
  await expenseRecord.getByLabel("Amount").fill("12.34");
  const expenseCategory = expenseRecord.getByLabel("Category");
  await expenseCategory.fill("Entertainment:Books");
  await expect(expenseCategory).toHaveAttribute("aria-expanded", "false");

  await editor.getByRole("button", { name: "Save definition" }).click();

  await expect(page.getByText("Definition created.")).toBeVisible();
  await expect(definitionRow(page, fqn)).toBeVisible();
});

test("recurring definition row activation edits its schedule", async ({
  page,
}) => {
  await page.goto("/recurring");
  const row = definitionRow(page, "Household:Mortgage");
  await expect(row).toBeVisible();

  await row.click();
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await editor.getByLabel("Every").fill("2");
  await editor.getByRole("button", { name: "Save definition" }).click();

  await expect(page.getByText("Definition updated.")).toBeVisible();
  await expect(row).toContainText("Every 2 months");
});

test("recurring definition row actions stay reachable across widths", async ({
  page,
}) => {
  const actionLabels = [
    "Edit definition",
    "Confirm next",
    "Pause",
    "Defer",
    "Cancel definition",
  ];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/recurring");
  const row = definitionRow(page, "Household:Mortgage");
  await expect(row).toBeVisible();

  for (const label of actionLabels) {
    await expect(
      row.getByRole("button", { exact: true, name: label }),
    ).toBeVisible();
  }
  await expect(
    row.getByRole("button", { name: "More row actions" }),
  ).toBeHidden();

  await page.setViewportSize({ width: 390, height: 900 });
  const overflow = row.getByRole("button", { name: "More row actions" });
  await expect(overflow).toBeVisible();
  await overflow.click();
  const menu = page.locator(".row-actions-menu:visible");
  for (const label of actionLabels) {
    await expect(
      menu.getByRole("button", { exact: true, name: label }),
    ).toBeVisible();
  }
});

test("recurring definition pauses and resumes from its row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/recurring");
  const row = definitionRow(page, "Household:Mortgage");
  await expect(row).toBeVisible();

  await chooseRowAction(page, row, "Pause");
  await expect(page.getByText("Definition paused.")).toBeVisible();
  await expect(row).toContainText("Paused");

  const confirmNext = row.getByRole("button", {
    exact: true,
    name: "Confirm next",
  });
  await expect(confirmNext).toHaveAttribute("aria-disabled", "true");
  await confirmNext.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Resume the definition before confirming its next occurrence.",
  );

  const defer = row.getByRole("button", { exact: true, name: "Defer" });
  await expect(defer).toHaveAttribute("aria-disabled", "true");
  await defer.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Resume the definition before deferring it.",
  );

  await chooseRowAction(page, row, "Resume");
  await expect(page.getByText("Definition resumed.")).toBeVisible();
  await expect(row).toContainText("Active");
});

test("recurring definition defer advances its visible next date", async ({
  page,
}) => {
  await page.goto("/recurring");
  const row = definitionRow(page, "Household:Mortgage");
  await expect(row).toBeVisible();
  const nextDate = row.locator("td").nth(3);
  const previousNextDate = await nextDate.innerText();

  await chooseRowAction(page, row, "Defer");
  const dialog = page.getByRole("alertdialog", {
    name: "Defer next occurrence",
  });
  await dialog.getByRole("button", { name: "Defer definition" }).click();

  await expect(page.getByText("Next occurrence deferred.")).toBeVisible();
  await expect(nextDate).not.toHaveText(previousNextDate);
});

test("recurring definition confirms and advances its next occurrence", async ({
  page,
}) => {
  await page.goto("/recurring");
  const row = definitionRow(page, "Household:Mortgage");
  await expect(row).toBeVisible();
  const nextDate = row.locator("td").nth(3);
  const previousNextDate = await nextDate.innerText();

  await chooseRowAction(page, row, "Confirm next");

  await expect(page.getByText("Next occurrence confirmed.")).toBeVisible();
  await expect(nextDate).not.toHaveText(previousNextDate);
});

test("recurring definition cancellation removes its row", async ({ page }) => {
  const fqn = "Subscriptions:Netflix";
  await page.goto("/recurring");
  const row = definitionRow(page, fqn);
  await expect(row).toBeVisible();

  await chooseRowAction(page, row, "Cancel definition");
  const dialog = page.getByRole("alertdialog", {
    name: "Cancel recurring definition",
  });
  await expect(dialog).toContainText(fqn);
  await dialog.getByRole("button", { name: "Cancel definition" }).click();

  await expect(page.getByText("Definition cancelled.")).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("recurring editor guards interaction across route navigation", async ({
  page,
}) => {
  await page.goto("/templates");
  const row = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: "Household:Cleaning:Cash Payment" });
  await expect(row).toBeVisible();
  await chooseRowAction(page, row, "Create recurring");
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await expect(editor).toBeFocused();
  await page.keyboard.press("n");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toHaveCount(0);

  const fqn = editor.getByLabel("Definition FQN");
  await fqn.fill("E2E:Recurring:UnsavedDraft");

  await page.getByRole("link", { name: "Accounts" }).click();

  await expect(page).toHaveURL(/\/accounts$/);
  await expect(editor).toBeVisible();
  await expect(fqn).toHaveValue("E2E:Recurring:UnsavedDraft");

  await editor.getByRole("button", { name: "Close definition editor" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeFocused();
});

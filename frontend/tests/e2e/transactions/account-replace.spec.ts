import { test } from "@tests/e2e/test";
import {
  createAccount,
  createCategory,
  createSearchSpend,
  deleteTransaction,
  expect,
  type TransactionFixture,
} from "@tests/e2e/transactions/support";

test("edit mode replaces a common account across selected transactions", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const search = `E2E account replace ${unique}`;
  const [first, second] = await Promise.all([
    createSearchSpend(page, `${search} first`),
    createSearchSpend(page, `${search} second`),
  ]);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  const rows = page.locator("[data-transaction-row='true']");
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: "Edit mode" }).click();
  await page
    .getByRole("checkbox", { name: "Select page transactions" })
    .click();

  const dock = page.getByTestId("transaction-edit-dock");
  await dock.getByRole("button", { name: "Replace account" }).click();
  const editor = page.getByTestId("edit-dock-editor");
  const sourcePicker = editor.getByRole("combobox", {
    name: "Common source account",
  });
  await sourcePicker.fill("merchant:PowellsBooks");
  await sourcePicker.press("Enter");

  const replacementPicker = editor.getByRole("combobox", {
    name: "Compatible replacement account",
  });
  await replacementPicker.fill("merchant:Target");
  await replacementPicker.press("Enter");

  await editor.getByRole("button", { name: "Review replacement" }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Replace account?",
  });
  await expect(confirmation).toContainText(
    "2 records across 2 transactions will change.",
  );

  await confirmation
    .getByRole("button", { name: "Replace account", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "2 transactions updated · 2 records replaced" }),
  ).toBeVisible();

  await Promise.all([
    deleteTransaction(page, first),
    deleteTransaction(page, second),
  ]);
});

test("account replacement can include a hidden compatible account", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E hidden account replace ${unique}`;
  const [source, replacement, funding, category] = await Promise.all([
    createAccount(page, `e2e:HiddenReplace:${unique}:Source`, "flow"),
    createAccount(page, `e2e:HiddenReplace:${unique}:Replacement`, "flow"),
    createAccount(page, `e2e:HiddenReplace:${unique}:Funding`, "owned", "USD"),
    createCategory(page, `E2E:HiddenReplace:${unique}`, "expense"),
  ]);
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "10.00",
      category_id: category.category_id,
      counterparty_account_id: source.account_id,
      currency: "USD",
      funding_account_id: funding.account_id,
      initiated_date: "2026-08-31",
      memo,
    },
  });
  expect(createResponse.ok()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionFixture;
  const hideResponse = await page.request.patch(
    `/api/accounts/${replacement.account_id}`,
    { data: { is_hidden: true } },
  );
  expect(hideResponse.ok()).toBe(true);

  await page.goto(`/transactions?q=${encodeURIComponent(memo)}`);
  const row = page.getByRole("row").filter({ hasText: memo });
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Edit mode" }).click();
  await row.click();

  const dock = page.getByTestId("transaction-edit-dock");
  await dock.getByRole("button", { name: "Replace account" }).click();
  const editor = page.getByTestId("edit-dock-editor");
  const sourcePicker = editor.getByRole("combobox", {
    name: "Common source account",
  });
  await sourcePicker.fill(source.fqn);
  await sourcePicker.press("Enter");

  const replacementPicker = editor.getByRole("combobox", {
    name: "Compatible replacement account",
  });
  const replacementOptions = page.locator(
    "#edit-dock-account-replacement-options",
  );
  await replacementPicker.fill(unique);
  await expect(replacementOptions).toContainText("No matches");

  await editor.getByRole("checkbox", { name: "Include hidden" }).click();
  await replacementPicker.click();
  const hiddenReplacement = replacementOptions
    .getByRole("option")
    .filter({ hasText: replacement.fqn.split(":").slice(-2).join(":") });
  await expect(hiddenReplacement).toBeVisible();
  await expect(
    hiddenReplacement.getByLabel("Hidden", { exact: true }),
  ).toBeVisible();
  await hiddenReplacement.click();
  await expect(
    editor.getByRole("button", { name: "Review replacement" }),
  ).toBeEnabled();

  await deleteTransaction(page, transaction);
});

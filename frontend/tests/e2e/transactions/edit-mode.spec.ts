import { test } from "@tests/e2e/test";
import {
  createAccount,
  createCategory,
  createSearchSpend,
  createTag,
  deleteTransaction,
  expect,
  type TransactionFixture,
} from "@tests/e2e/transactions/support";

test("edit mode adds a tag to a selected transaction", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E edit tag ${unique}`;
  const transaction = await createSearchSpend(page, memo);
  const tag = await createTag(page, `E2E:EditTag:${unique}:Added`);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();

  await page.getByRole("button", { name: "Edit mode" }).click();
  const editModeHeader = page.getByTestId(
    "transaction-browser-edit-mode-header",
  );
  const selection = row.getByRole("checkbox");
  await expect(selection).toBeVisible();
  await selection.scrollIntoViewIfNeeded();
  await expect(selection).not.toBeChecked();
  await row.focus();
  await expect(row).toBeFocused();
  await row.press("Space");
  await expect(editModeHeader).toContainText("1 selected");
  await expect(selection).toBeChecked();
  const selectedRow = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"][aria-selected="true"]`,
  );
  await selectedRow.focus();
  await expect(selectedRow).toBeFocused();
  await selectedRow.press("t");

  const editor = page.getByTestId("edit-dock-editor");
  await expect(editor).toBeVisible();
  const tags = editor.getByRole("combobox", { name: "Tags to add" });
  await tags.fill(tag.fqn);
  await tags.press("Enter");
  await editor.getByRole("button", { name: "Apply" }).click();

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "1 updated · 0 require full edit" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    row.getByTestId("transaction-tag-chips-list").getByText(tag.name, {
      exact: true,
    }),
  ).toBeVisible();

  await deleteTransaction(page, transaction);
});

test("category edit updates eligible rows and explains skipped rows", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const search = `E2E category eligibility ${unique}`;
  const [source, destination, category, spend] = await Promise.all([
    createAccount(page, `e2e:EditEligibility:${unique}:Source`, "owned", "USD"),
    createAccount(
      page,
      `e2e:EditEligibility:${unique}:Destination`,
      "owned",
      "USD",
    ),
    createCategory(
      page,
      `E2E:EditEligibility:${unique}:Reviewed${unique}`,
      "expense",
    ),
    createSearchSpend(page, `${search} spend`),
  ]);
  const transferResponse = await page.request.post(
    "/api/transactions/transfer",
    {
      data: {
        amount: "4.56",
        currency: "USD",
        destination_account_id: destination.account_id,
        initiated_date: "2026-05-31",
        memo: `${search} transfer`,
        source_account_id: source.account_id,
      },
    },
  );
  expect(transferResponse.ok(), await transferResponse.text()).toBe(true);
  const transfer = (await transferResponse.json()) as TransactionFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  const spendRow = page.locator(
    `[data-transaction-id="${spend.transaction_id}"]`,
  );
  const transferRow = page.locator(
    `[data-transaction-id="${transfer.transaction_id}"]`,
  );
  await expect(spendRow).toBeVisible();
  await expect(transferRow).toBeVisible();

  await page.getByRole("button", { name: "Edit mode" }).click();
  await spendRow.getByRole("checkbox").click();
  await transferRow.getByRole("checkbox").click();
  await expect(
    page.getByTestId("transaction-browser-edit-mode-header"),
  ).toContainText("2 selected");

  const dock = page.getByTestId("transaction-edit-dock");
  await dock.getByRole("button", { name: "Choose category" }).click();
  const editor = page.getByTestId("edit-dock-editor");
  await expect(editor).toContainText("1 will update · 1 require full edit");
  await expect(
    editor.getByText("1 transaction has no categorizable records", {
      exact: true,
    }),
  ).toBeVisible();

  const categoryPicker = editor.getByRole("combobox", { name: "Category" });
  await categoryPicker.fill(category.fqn);
  await expect(categoryPicker).toHaveValue(category.display_label);
  await editor.getByRole("button", { name: "Apply" }).click();

  await expect(
    page.getByRole("status").filter({
      hasText:
        "1 updated · 1 require full edit: 1 transaction has no categorizable records",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    spendRow.getByText(category.name, { exact: true }),
  ).toBeVisible();

  await deleteTransaction(page, spend);
  await deleteTransaction(page, transfer);
});

test("edit dock keeps its editor reachable at compact width", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E responsive edit dock ${unique}`;
  const transaction = await createSearchSpend(page, memo);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 680, height: 800 });

  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Edit mode" }).click();
  await row.getByRole("checkbox").click();

  const dock = page.getByTestId("transaction-edit-dock");
  const categoryAction = dock.getByRole("button", {
    name: "Choose category",
  });
  await categoryAction.scrollIntoViewIfNeeded();
  await expect(categoryAction).toBeInViewport();
  await categoryAction.click();

  const editor = page.getByTestId("edit-dock-editor");
  const categoryPicker = editor.getByRole("combobox", { name: "Category" });
  const apply = editor.getByRole("button", { name: "Apply" });
  await expect(editor).toBeVisible();
  await expect(categoryPicker).toBeVisible();
  await apply.scrollIntoViewIfNeeded();
  await expect(apply).toBeInViewport();

  const layoutFits = await dock.evaluate((dockElement) => {
    const editorElement = dockElement.querySelector<HTMLElement>(
      "[data-testid='edit-dock-editor']",
    );
    const dockBounds = dockElement.getBoundingClientRect();
    const editorBounds = editorElement?.getBoundingClientRect();
    return {
      dockHasNoHorizontalOverflow:
        dockElement.scrollWidth <= dockElement.clientWidth + 1,
      editorContained:
        editorBounds !== undefined &&
        editorBounds.left >= dockBounds.left - 1 &&
        editorBounds.right <= dockBounds.right + 1,
      pageHasNoHorizontalOverflow:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    };
  });
  expect(layoutFits).toEqual({
    dockHasNoHorizontalOverflow: true,
    editorContained: true,
    pageHasNoHorizontalOverflow: true,
  });

  await deleteTransaction(page, transaction);
});

test("edit mode changes an eligible amount without selecting the row", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E edit amount ${unique}`;
  const transaction = await createSearchSpend(page, memo);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();

  await page.getByRole("button", { name: "Edit mode" }).click();
  await expect(
    page.getByTestId("transaction-browser-edit-mode-header"),
  ).toContainText("0 selected");
  const amount = page.getByTestId(
    `transaction-${transaction.transaction_id}-amount-input`,
  );
  await amount.fill("20.25");
  await amount.press("Enter");
  await page.getByRole("button", { name: "Done" }).click();

  await expect(row.getByTestId("amount-chip")).toHaveText("-20.25 $");

  await deleteTransaction(page, transaction);
});

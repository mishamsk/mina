import { test } from "@tests/e2e/test";
import {
  createAccount,
  createCategory,
  deleteTransaction,
  expect,
  hideAccount,
  type TransactionFixture,
} from "@tests/e2e/transactions/support";

test("edit mode replaces a common account across a changing selection", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const search = `E2E account replace ${unique}`;
  const [source, replacement, firstMerchant, secondMerchant, category] =
    await Promise.all([
      createAccount(
        page,
        `e2e:AccountReplace:${unique}:Source`,
        "owned",
        "USD",
      ),
      createAccount(page, `e2e:AccountReplace:${unique}:Replacement`, "party"),
      createAccount(page, `e2e:AccountReplace:${unique}:FirstMerchant`, "flow"),
      createAccount(
        page,
        `e2e:AccountReplace:${unique}:SecondMerchant`,
        "flow",
      ),
      createCategory(page, `E2E:AccountReplace:${unique}`, "expense"),
    ]);

  const createTransaction = async (
    merchantAccountId: number,
    suffix: string,
  ): Promise<TransactionFixture> => {
    const response = await page.request.post("/api/transactions", {
      data: {
        initiated_date: "2026-05-31",
        records: [
          {
            account_id: source.account_id,
            amount: "-10.00",
            category_id: null,
            currency: "USD",
            memo: `${search} ${suffix}`,
            reconciliation_status: "reconciled",
            settlement: { status: "posted" },
            source: "manual",
            tag_ids: [],
          },
          {
            account_id: merchantAccountId,
            amount: "10.00",
            category_id: category.category_id,
            currency: "USD",
            memo: `${search} ${suffix}`,
            reconciliation_status: "reconciled",
            settlement: null,
            source: "manual",
            tag_ids: [],
          },
        ],
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as TransactionFixture;
  };

  const [first, second] = await Promise.all([
    createTransaction(firstMerchant.account_id, "first"),
    createTransaction(secondMerchant.account_id, "second"),
  ]);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  const rows = page.locator("[data-transaction-row='true']");
  await expect(rows).toHaveCount(2);
  const firstRow = rows.filter({ hasText: `${search} first` });
  const secondRow = rows.filter({ hasText: `${search} second` });
  await page.getByRole("button", { name: "Edit mode" }).click();
  await firstRow.click();

  const dock = page.getByTestId("transaction-edit-dock");
  await dock.getByRole("button", { name: "Replace account" }).click();
  const editor = page.getByTestId("edit-dock-editor");
  const sourcePicker = editor.getByRole("combobox", {
    name: "Common source account",
  });
  await sourcePicker.fill(firstMerchant.fqn);
  await sourcePicker.press("Enter");
  await expect(sourcePicker).toHaveValue(firstMerchant.display_label);

  const replacementPicker = editor.getByRole("combobox", {
    name: "Compatible replacement account",
  });
  await replacementPicker.fill(secondMerchant.fqn);
  await replacementPicker.press("Enter");
  await expect(replacementPicker).toHaveValue(secondMerchant.display_label);

  await secondRow.focus();
  await secondRow.press("Space");
  await expect(sourcePicker).toHaveValue(firstMerchant.display_label);
  await expect(replacementPicker).toHaveValue(secondMerchant.display_label);
  await expect(editor).toContainText(
    "Search shows up to 6 common non-system accounts. Type to narrow.",
  );
  await expect(
    editor.getByRole("button", { name: "Review replacement" }),
  ).toBeEnabled();

  await sourcePicker.fill(source.fqn);
  await sourcePicker.press("Enter");

  await replacementPicker.fill(replacement.fqn);
  await replacementPicker.press("Enter");

  await expect(sourcePicker).toHaveValue(source.display_label);
  await expect(replacementPicker).toHaveValue(replacement.display_label);
  await expect(editor.getByTestId("account-replace-prediction")).toHaveText(
    "2 records across 2 transactions will change.",
  );

  await editor.getByRole("button", { name: "Review replacement" }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Replace account?",
  });
  const sourceLabel = confirmation.getByText(source.display_label, {
    exact: true,
  });
  await expect(sourceLabel).toBeVisible();
  await sourceLabel.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    source.display_label === source.fqn
      ? source.fqn
      : `${source.display_label} · ${source.fqn}`,
  );
  await expect(confirmation).toContainText(
    "2 records across 2 transactions will change.",
  );

  const replaceResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        "/api/transactions/bulk/account-replace" &&
      response.request().method() === "POST",
  );
  await confirmation
    .getByRole("button", { name: "Replace account", exact: true })
    .click();
  expect((await replaceResponse).ok()).toBe(true);
  await expect(confirmation).toBeHidden();
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

test("account replacement bounded search follows the hidden source filter", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const search = `E2E hidden account replace ${unique}`;
  const [source, firstMerchant, secondMerchant, category] = await Promise.all([
    createAccount(
      page,
      `e2e:HiddenAccountReplace:${unique}:Source`,
      "owned",
      "USD",
    ),
    createAccount(page, `e2e:HiddenAccountReplace:${unique}:First`, "flow"),
    createAccount(page, `e2e:HiddenAccountReplace:${unique}:Second`, "flow"),
    createCategory(page, `E2E:HiddenAccountReplace:${unique}`, "expense"),
  ]);

  const createTransaction = async (
    merchantAccountId: number,
    suffix: string,
  ): Promise<TransactionFixture> => {
    const response = await page.request.post("/api/transactions", {
      data: {
        initiated_date: "2026-05-31",
        records: [
          {
            account_id: source.account_id,
            amount: "-10.00",
            category_id: null,
            currency: "USD",
            memo: `${search} ${suffix}`,
            reconciliation_status: "reconciled",
            settlement: { status: "posted" },
            source: "manual",
            tag_ids: [],
          },
          {
            account_id: merchantAccountId,
            amount: "10.00",
            category_id: category.category_id,
            currency: "USD",
            memo: `${search} ${suffix}`,
            reconciliation_status: "reconciled",
            settlement: null,
            source: "manual",
            tag_ids: [],
          },
        ],
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as TransactionFixture;
  };

  const [first, second] = await Promise.all([
    createTransaction(firstMerchant.account_id, "first"),
    createTransaction(secondMerchant.account_id, "second"),
  ]);
  await hideAccount(page, source);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}`,
  );
  await expect(page.locator("[data-transaction-row='true']")).toHaveCount(2);
  await page.getByRole("button", { name: "Edit mode" }).click();
  await page
    .getByRole("checkbox", { name: "Select page transactions" })
    .click();
  const dock = page.getByTestId("transaction-edit-dock");
  await dock.getByRole("button", { name: "Replace account" }).click();
  const editor = page.getByTestId("edit-dock-editor");
  await expect(editor).toContainText(
    "Search shows up to 6 common non-system accounts. Type to narrow.",
  );
  const hiddenSearchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/accounts/search" &&
      url.searchParams.get("context") === "bulk_source" &&
      url.searchParams.get("include_hidden") === "true"
    );
  });
  await editor.getByText("Include hidden", { exact: true }).click();
  expect(
    new URL((await hiddenSearchRequest).url()).searchParams.get("limit"),
  ).toBe("6");

  await Promise.all([
    deleteTransaction(page, first),
    deleteTransaction(page, second),
  ]);
});

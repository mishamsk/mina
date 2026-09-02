import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  createSearchSpend,
  createTag,
  expect,
  findByFqn,
  listFixtures,
  pickerSelectedLabel,
} from "@tests/e2e/transactions/support";

test("filter rows compose all-of tags with an OR class and restore through Back", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [allA, allB, accounts, categories] = await Promise.all([
    createTag(page, `E2E:FilterComposition:${unique}:AllA`),
    createTag(page, `E2E:FilterComposition:${unique}:AllB`),
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const wallet = findByFqn(accounts, "cash:Wallet");
  const merchant = findByFqn(accounts, "merchant:PowellsBooks");
  const checking = findByFqn(accounts, "bank:Chase:joint_checking");
  const employer = findByFqn(accounts, "employers:Acme:salary");
  const books = findByFqn(categories, "Entertainment:Books");
  const salary = findByFqn(categories, "Income:Salary");
  const allOfMemo = `E2E filter composition ${unique} all of`;
  const incomeMemo = `E2E filter composition ${unique} income`;
  const excludedMemo = `E2E filter composition ${unique} excluded`;

  const [allOfResponse, incomeResponse] = await Promise.all([
    page.request.post("/api/transactions/spend", {
      data: {
        amount: "12.34",
        category_id: books.category_id,
        counterparty_account_id: merchant.account_id,
        currency: "USD",
        funding_account_id: wallet.account_id,
        initiated_date: "2026-05-31",
        memo: allOfMemo,
        tag_ids: [allA.tag_id, allB.tag_id],
      },
    }),
    page.request.post("/api/transactions/income", {
      data: {
        amount: "56.78",
        category_id: salary.category_id,
        currency: "USD",
        destination_account_id: checking.account_id,
        initiated_date: "2026-05-31",
        memo: incomeMemo,
        source_account_id: employer.account_id,
      },
    }),
    createSearchSpend(page, excludedMemo),
  ]);
  expect(allOfResponse.ok(), await allOfResponse.text()).toBe(true);
  expect(incomeResponse.ok(), await incomeResponse.text()).toBe(true);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(`E2E filter composition ${unique}`)}`,
  );
  const allOfRow = page.getByRole("row").filter({ hasText: allOfMemo });
  const incomeRow = page.getByRole("row").filter({ hasText: incomeMemo });
  const excludedRow = page.getByRole("row").filter({ hasText: excludedMemo });
  await expect(allOfRow).toBeVisible();
  await expect(incomeRow).toBeVisible();
  await expect(excludedRow).toBeVisible();

  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  await page.getByLabel("Filter operator").click();
  await page.getByRole("option", { name: "All of" }).click();
  const tags = page.getByRole("combobox", { name: "Tags" });
  const tagOptions = page.getByRole("listbox");
  await tags.click();
  await expect(tagOptions.getByRole("option").first()).toBeVisible();
  await tags.fill(allA.fqn);
  await expect(
    page.getByRole("button", {
      name: `Edit Tag ${pickerSelectedLabel(allA)} · all of`,
    }),
  ).toBeVisible();
  await tags.fill(allB.fqn);
  await expect(
    page.getByRole("button", {
      name: `Edit Tag ${pickerSelectedLabel(allA)}, ${pickerSelectedLabel(allB)} · all of`,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Add OR row" }).click();
  await page
    .getByRole("button", { exact: true, name: "Transaction class" })
    .click();
  await page.getByRole("checkbox", { name: "Income" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.keyboard.press("Escape");

  const allOfChip = page.getByText(
    `Tag ${pickerSelectedLabel(allA)}, ${pickerSelectedLabel(allB)} · all of`,
  );
  const incomeChip = page.getByText(/Transaction class Income · any of/);
  await expect(allOfChip).toBeVisible();
  await expect(incomeChip).toBeVisible();
  await expect(allOfRow).toBeVisible();
  await expect(incomeRow).toBeVisible();
  await expect(excludedRow).toBeHidden();

  await page.getByRole("button", { name: "Remove row 2" }).click();
  await expect(incomeRow).toBeHidden();
  await expect(allOfRow).toBeVisible();

  await page.goBack();
  await expect(allOfChip).toBeVisible();
  await expect(incomeChip).toBeVisible();
  await expect(allOfRow).toBeVisible();
  await expect(incomeRow).toBeVisible();
  await expect(excludedRow).toBeHidden();
});

test("advanced filters preserve their exact source and clear visibly", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const search = `E2E advanced filter ${unique}`;
  const matchingMemo = `${search} matching`;
  const excludedMemo = `${search} excluded`;
  await createSearchSpend(page, matchingMemo, "75.00");
  await createSearchSpend(page, excludedMemo, "12.34");

  const source = "  amount > 50 \t\n";
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(search)}&filter=${encodeURIComponent(source)}`,
  );

  const advanced = page.getByTestId("transaction-filter-advanced");
  const matchingRow = page.getByRole("row").filter({ hasText: matchingMemo });
  const excludedRow = page.getByRole("row").filter({ hasText: excludedMemo });
  await expect(advanced).toBeVisible();
  await expect(advanced.locator("code")).toHaveJSProperty(
    "textContent",
    source,
  );
  await expect(matchingRow).toBeVisible();
  await expect(excludedRow).toBeHidden();

  await advanced.getByRole("button", { name: "Clear" }).click();
  await expect(advanced).toBeHidden();
  await expect(matchingRow).toBeVisible();
  await expect(excludedRow).toBeVisible();
});

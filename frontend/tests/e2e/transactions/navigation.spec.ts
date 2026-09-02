import { test } from "@tests/e2e/test";
import {
  activateTransactionRow,
  createAccount,
  createCategory,
  expect,
  formatLocalDate,
  shiftLocalDate,
} from "@tests/e2e/transactions/support";

test("future date navigation shows recurring projections and eligible actions", async ({
  page,
}) => {
  const nextProjectionDate = shiftLocalDate(formatLocalDate(new Date()), 30);
  const futureDate = shiftLocalDate(nextProjectionDate, 1);
  const activeMemo = "E2E future navigation active transaction";
  const projectionMemo = "E2E future navigation recurring projection";
  const checking = await createAccount(
    page,
    "e2e:FutureNavigation:Checking",
    "owned",
    "USD",
  );
  const merchant = await createAccount(
    page,
    "e2e:FutureNavigation:Merchant",
    "flow",
  );
  const category = await createCategory(
    page,
    "e2e:FutureNavigation:Category",
    "expense",
  );
  const activeResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "17.25",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: checking.account_id,
      initiated_date: futureDate,
      memo: activeMemo,
    },
  });
  expect(activeResponse.ok(), await activeResponse.text()).toBe(true);

  const definitionResponse = await page.request.post(
    "/api/recurring-definitions",
    {
      data: {
        anchor_date: nextProjectionDate,
        fqn: "E2E:FutureNavigation:Daily",
        schedule_rule: {
          every: 1,
          kind: "interval",
          unit: "DAY",
          version: 1,
        },
        records: [
          {
            account_id: checking.account_id,
            amount: "-8.75",
            category_id: null,
            currency: "USD",
            memo: projectionMemo,
            tag_ids: [],
          },
          {
            account_id: merchant.account_id,
            amount: "8.75",
            category_id: category.category_id,
            currency: "USD",
            memo: projectionMemo,
            tag_ids: [],
          },
        ],
      },
    },
  );
  expect(definitionResponse.ok(), await definitionResponse.text()).toBe(true);

  const params = new URLSearchParams({
    filter: `category:${JSON.stringify(category.fqn)}`,
    page: "1",
    pageSize: "25",
  });
  await page.goto(`/transactions?${params.toString()}`);
  await page.getByLabel("Go to day").fill(futureDate);

  await expect(page).toHaveURL(
    (url) => url.searchParams.get("anchor_date") === futureDate,
  );
  const transactionRows = page.locator("tbody > tr[data-transaction-id]");
  await expect(transactionRows.filter({ hasText: activeMemo })).toBeVisible();
  const projectionRows = transactionRows.filter({ hasText: projectionMemo });
  await expect(projectionRows).toHaveCount(2);
  await expect(
    projectionRows.getByRole("img", { name: "Expected" }),
  ).toHaveCount(2);
  await expect(
    projectionRows.getByRole("button", { name: "Confirm next" }),
  ).toHaveCount(1);
  await expect(
    projectionRows.getByRole("button", { exact: true, name: "Defer" }),
  ).toHaveCount(1);

  await activateTransactionRow(projectionRows.first());
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(projectionMemo);
  await expect(detail.locator("input, textarea, select")).toHaveCount(0);
});

test("transactions jump to a day, step once, and return to Today", async ({
  page,
}) => {
  const jumpDate = "2026-05-30";
  const previousDate = "2026-05-29";
  const today = formatLocalDate(new Date());
  const transactionRows = page.locator("tbody > tr[data-transaction-id]");

  await page.goto("/transactions?page=1&pageSize=25");
  const dateJump = page.getByLabel("Go to day");
  await dateJump.fill(jumpDate);

  await expect(page).toHaveURL(
    (url) => url.searchParams.get("anchor_date") === jumpDate,
  );
  await expect(dateJump).toHaveValue(jumpDate);
  await expect(
    transactionRows.filter({ hasText: "Amazon gift card purchase" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Previous day" }).click();

  await expect(page).toHaveURL(
    (url) => url.searchParams.get("anchor_date") === previousDate,
  );
  await expect(dateJump).toHaveValue(previousDate);
  await expect(
    transactionRows.filter({ hasText: "Fund Amazon gift card" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Today" }).click();

  await expect(page).toHaveURL(
    (url) => url.searchParams.get("anchor_date") === today,
  );
  await expect(dateJump).toHaveValue(today);
  await expect(transactionRows.first()).toBeVisible();
});

test("transactions choose an alternate sort field and direction", async ({
  page,
}) => {
  await page.goto("/transactions?page=2&pageSize=25");
  await expect(
    page.locator("tbody > tr[data-transaction-id]").first(),
  ).toBeVisible();

  const sortMenu = page.getByRole("button", {
    name: /^Sort transactions:/,
  });
  await sortMenu.click();
  const sortDialog = page.getByRole("dialog", { name: "Sort transactions" });
  const updated = sortDialog.getByRole("button", {
    exact: true,
    name: "Updated",
  });
  await updated.click();

  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("sort") === "updated_at" &&
      url.searchParams.get("sortDir") === "desc",
  );
  await expect(updated).toHaveAttribute("aria-pressed", "true");

  const oldestFirst = sortDialog.getByRole("button", {
    exact: true,
    name: "Oldest first",
  });
  await oldestFirst.click();

  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("sort") === "updated_at" &&
      url.searchParams.get("sortDir") === "asc",
  );
  await expect(oldestFirst).toHaveAttribute("aria-pressed", "true");
  await expect(sortMenu).toHaveAccessibleName(
    "Sort transactions: updated, oldest first",
  );
});

test("browser Back returns from transaction detail to the prior list", async ({
  page,
}) => {
  const memo = "Amazon gift card purchase";
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = page
    .locator("tbody > tr[data-transaction-id]")
    .filter({ hasText: memo });
  await expect(row).toBeVisible();
  const listURL = page.url();

  await activateTransactionRow(row);
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail).toBeVisible();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("transaction") !== null,
  );

  await page.goBack();

  await expect(page).toHaveURL(listURL);
  await expect(detail).toHaveCount(0);
  await expect(row).toBeVisible();
});

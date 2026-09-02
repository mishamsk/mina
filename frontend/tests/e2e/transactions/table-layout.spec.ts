import type { Locator } from "@playwright/test";
import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  createSearchSpend,
  createTag,
  expect,
  findByFqn,
  listFixtures,
  type Page,
} from "@tests/e2e/transactions/support";

const transactionRow = (page: Page, memo: string) =>
  page.locator("[data-transaction-row='true']").filter({ hasText: memo });

const expectNoHorizontalOverflow = async (locator: Locator) => {
  await expect(locator).toBeVisible();
  const dimensions = await locator.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(
    dimensions.scrollWidth,
    `horizontal overflow ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
};

test("transaction table stays usable at representative widths", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo =
    `E2E responsive transaction ${unique} with a deliberately long memo ` +
    "that must remain discoverable when the summary line is truncated";
  await createSearchSpend(page, memo);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );

  const row = transactionRow(page, memo);
  const tableScroll = page.getByTestId("transactions-table-scroll");
  const date = row.locator(".transactions-date-column");
  const memberHeading = page.locator("th.transactions-member-column");
  const tagsHeading = page.locator("th.transactions-tags-column");
  const categoryHeading = page.locator("th.transactions-category-column");

  for (const width of [1600, 1100]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("amount-chip")).toBeVisible();
    await expect(
      row.getByRole("button", { name: "More row actions" }),
    ).toBeInViewport();
    await expectNoHorizontalOverflow(tableScroll);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    expect(
      await date.evaluate((cell) =>
        Array.from(cell.children).every(
          (line) => line.scrollWidth <= line.clientWidth + 1,
        ),
      ),
    ).toBe(true);
  }

  await page.setViewportSize({ width: 1600, height: 800 });
  await expect(memberHeading).toBeVisible();
  await expect(tagsHeading).toBeVisible();
  await expect(categoryHeading).toBeVisible();

  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(memberHeading).toBeHidden();
  await expect(tagsHeading).toBeVisible();
  const memoLine = row.getByTestId("transaction-line-memo");
  await expect(memoLine).toBeInViewport();
  await page.setViewportSize({ width: 480, height: 800 });
  await expect(
    page.getByRole("button", { name: "Table controls" }),
  ).toBeInViewport();
  await expect(row).toBeVisible();
  await expect(row.getByTestId("amount-chip")).toBeVisible();
  await expect(
    row.getByRole("button", { name: "More row actions" }),
  ).toBeInViewport();
  await expectNoHorizontalOverflow(tableScroll);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  const phoneDateLines = date.locator("div");
  await expect(phoneDateLines).toHaveText(["May 31", "2026"]);
  await expect(date).toBeInViewport();
  await expect(
    row.getByTestId("transaction-description-text"),
  ).toBeInViewport();
  await expect(memberHeading).toBeHidden();
  await expect(tagsHeading).toBeHidden();
  await expect(categoryHeading).toBeHidden();
  await row.getByRole("button", { name: "More row actions" }).click();
  const actions = page.locator(".row-actions-menu:visible");
  await expect(
    actions.getByRole("button", { name: "Edit transaction" }),
  ).toBeVisible();
});

test("a narrow long-amount row keeps its value and actions reachable", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E responsive long amount ${unique}`;
  const amountLabel = "-9,999,999,999.12 $";
  await createSearchSpend(page, memo, "9999999999.12345678");
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await page.setViewportSize({ width: 390, height: 800 });

  const row = transactionRow(page, memo);
  const amount = row.getByTestId("amount-chip");
  const overflow = row.getByRole("button", { name: "More row actions" });
  await expect(amount).toHaveText(amountLabel);
  await expect(amount).toBeInViewport();
  await amount.hover();
  await expect(page.getByRole("tooltip")).toHaveText(amountLabel);
  await expect(overflow).toBeInViewport();
  await overflow.click();
  await expect(page.locator(".row-actions-menu:visible")).toBeVisible();
});

test("dense transaction tags remain discoverable at desktop and compact widths", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E responsive dense tags ${unique}`;
  const tags = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      createTag(
        page,
        `E2E:Responsive:${unique}:LongTag${String(index + 1).padStart(2, "0")}`,
      ),
    ),
  );
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const response = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "42.75",
      category_id: findByFqn(categories, "Entertainment:Books").category_id,
      counterparty_account_id: findByFqn(accounts, "merchant:PowellsBooks")
        .account_id,
      currency: "USD",
      funding_account_id: findByFqn(accounts, "cash:Wallet").account_id,
      initiated_date: "2026-05-31",
      memo,
      tag_ids: tags.map((tag) => tag.tag_id),
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );

  const row = transactionRow(page, memo);
  const lastTag = tags.at(-1);
  expect(lastTag).toBeDefined();

  for (const width of [1600, 1100]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(row).toBeVisible();
    const tagList = row.getByTestId("transaction-tag-chips-list");
    const overflow = row.getByTestId("transaction-tags-overflow");
    await expect(tagList).toBeVisible();
    await expect(overflow).toBeVisible();
    await expect(
      tagList.locator(`[data-tag-id="${lastTag?.tag_id}"]`),
    ).toHaveAttribute("aria-hidden", "true");
    await overflow.hover();
    await expect(page.getByRole("tooltip")).toContainText(lastTag?.fqn ?? "");
    await expect(row.getByTestId("amount-chip")).toBeInViewport();
    await expect(
      row.getByRole("button", { name: "More row actions" }),
    ).toBeInViewport();
    await expectNoHorizontalOverflow(
      page.getByTestId("transactions-table-scroll"),
    );
  }
});

test("narrow transaction detail keeps records and disclosure reachable", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E responsive detail ${unique}`;
  await createSearchSpend(page, memo, "73.25");
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await page.setViewportSize({ width: 680, height: 800 });

  const row = transactionRow(page, memo);
  await row.focus();
  await row.press("Enter");
  const panel = page.getByTestId("transaction-detail-panel");
  const recordsTable = panel.getByTestId("transaction-detail-records-table");
  const records = recordsTable.locator("tr[data-detail-record-row='true']");
  await expect(panel).toBeVisible();
  await expect(records).toHaveCount(2);
  await expect(
    records.getByRole("img", { name: "Balance role" }),
  ).toBeVisible();
  await expect(
    records.getByRole("img", { name: "Expense role" }),
  ).toBeVisible();
  await expect(
    recordsTable.getByText("cash:Wallet", { exact: true }),
  ).toBeVisible();
  await expect(
    recordsTable.getByText("-73.25 $", { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(recordsTable);

  await records.first().click();
  const disclosure = recordsTable.locator("tr.detail-records-disclosure-row");
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText("Role");
  await expect(disclosure).toContainText("Balance");
  await expect(disclosure).toContainText(memo);
});

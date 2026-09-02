import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  createCategory,
  createTag,
  expect,
  findByFqn,
  listFixtures,
  pickerSelectedLabel,
} from "@tests/e2e/transactions/support";

test("clearing filters cancels pending entity-chip additions", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [category, tag, accounts] = await Promise.all([
    createCategory(page, `E2E:ChipClear:${unique}:Category`, "expense"),
    createTag(page, `E2E:ChipClear:${unique}:Tag`),
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
  ]);
  const memo = `E2E clear pending chip ${unique}`;
  const created = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: category.category_id,
      counterparty_account_id: findByFqn(accounts, "merchant:PowellsBooks")
        .account_id,
      currency: "USD",
      funding_account_id: findByFqn(accounts, "cash:Wallet").account_id,
      initiated_date: "2026-08-12",
      memo,
      tag_ids: [tag.tag_id],
    },
  });
  expect(created.ok(), await created.text()).toBe(true);

  let releaseCategory = () => {};
  const categoryRequested = new Promise<void>((resolveRequested) => {
    void page.route(
      `**/api/categories/${category.category_id}`,
      async (route) => {
        resolveRequested();
        await new Promise<void>((resolve) => {
          releaseCategory = resolve;
        });
        await route.continue().catch(() => {});
      },
    );
  });
  await page.goto(
    `/transactions?q=${encodeURIComponent(memo)}&filter=${encodeURIComponent(`tag:"${tag.fqn}"`)}`,
  );
  const row = page.getByRole("row").filter({ hasText: memo });
  await row.getByRole("button", { name: `Filter by ${category.name}` }).click();
  await categoryRequested;
  await page.getByRole("button", { name: "Close filters" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("filter"))
    .toBeNull();

  releaseCategory();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("filter"))
    .toBeNull();
});

test("operator typeahead does not queue the new-transaction shortcut", async ({
  page,
}) => {
  await page.goto(`/transactions?filter=${encodeURIComponent("currency:USD")}`);
  await page
    .getByRole("button", { name: "Edit Currency USD · any of" })
    .click();

  const operator = page.getByLabel("Filter operator");
  await expect(operator).toBeFocused();
  await operator.press("n");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("filter"))
    .toBe("not currency:USD");

  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Filter operator")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("entry")).toBe(false);
  await expect(page.getByRole("heading", { name: "NEW SPEND" })).toHaveCount(0);
});

test("overview group filters restore selected picker state", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const group = `E2E:FilterGroup:${unique}`;
  await Promise.all([
    createTag(page, `${group}:One`),
    createTag(page, `${group}:Two`),
  ]);

  await page.goto(`/tags/group?prefix=${encodeURIComponent(group)}`);
  await page
    .getByTestId("entity-overview-transactions")
    .getByRole("link", { name: "Transactions" })
    .click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("filter") === `tag:"${group}:*"`,
  );

  await page
    .getByRole("button", {
      name: `Edit Tag ${group}:* (entire group) · any of`,
    })
    .click();
  const tags = page.getByRole("combobox", { name: "Tags" });
  await expect(tags).toHaveValue(`${group}:`);
  await tags.click();
  await expect(
    page.getByRole("option", {
      name: `Select entire group ${group}`,
      selected: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Remove group ${group}` }),
  ).toBeVisible();

  await page.reload();
  await page
    .getByRole("button", {
      name: `Edit Tag ${group}:* (entire group) · any of`,
    })
    .click();
  await expect(page.getByRole("combobox", { name: "Tags" })).toHaveValue(
    `${group}:`,
  );
});

test("hierarchical filters drill into, clear, and replace groups", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const group = `E2E:FilterGroup:${unique}:Drill`;
  const replacement = `E2E:FilterGroup:${unique}:Replacement`;
  const literalStar = await createTag(
    page,
    `E2E:FilterGroup:${unique}:Literal:*`,
  );
  await Promise.all([
    createTag(page, `${group}:One`),
    createTag(page, `${group}:Two`),
    createTag(page, `${replacement}:One`),
    createTag(page, `${replacement}:Two`),
  ]);

  await page.goto("/transactions");
  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  const tags = page.getByRole("combobox", { name: "Tags" });
  await tags.fill(group);
  await page
    .getByRole("option", { name: `${group}, group, 2 children` })
    .click();
  await tags.press("Enter");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("filter") === `tag:"${group}:*"`,
  );

  await page.getByRole("button", { name: `Remove group ${group}` }).click();
  await expect(page).toHaveURL((url) => !url.searchParams.has("filter"));
  await tags.fill(`${replacement}:*`);
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("filter") === `tag:"${replacement}:*"`,
  );

  await page
    .getByRole("button", { name: `Remove group ${replacement}` })
    .click();
  await tags.fill(literalStar.fqn);
  await expect(
    page.getByRole("button", {
      name: `Remove ${pickerSelectedLabel(literalStar)}`,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("filter") ===
      `tag:"${literalStar.fqn.slice(0, -1)}\\*"`,
  );
});

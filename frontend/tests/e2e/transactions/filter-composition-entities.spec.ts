import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  createCategory,
  createTag,
  expect,
  findByFqn,
  listFixtures,
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

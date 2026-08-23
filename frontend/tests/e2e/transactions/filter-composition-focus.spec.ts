import { test } from "@tests/e2e/test";
import { expect } from "@tests/e2e/transactions/support";

test("escape closes the filter editor without opening its trigger tooltip", async ({
  page,
}) => {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Open filters" }).click();
  const addFilter = page.getByRole("button", { name: "Add filter" });
  await addFilter.click();
  await page.keyboard.press("Escape");

  await expect(addFilter).toBeFocused();
  await expect(page.getByRole("tooltip", { name: "Add filter" })).toHaveCount(
    0,
  );
});

test("Back restores focus to the originating filter dimension", async ({
  page,
}) => {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  await page.getByRole("button", { name: "Back" }).click();

  await expect(
    page.getByRole("button", { exact: true, name: "Tag" }),
  ).toBeFocused();
});

test("browser history into Advanced state restores Clear focus", async ({
  page,
}) => {
  const advanced = "(currency:USD and (settlement:pending or class:spend))";
  await page.goto(`/transactions?filter=${encodeURIComponent(advanced)}`);
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("filter", "currency:USD");
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page
    .getByRole("button", { name: "Edit Currency USD · any of" })
    .click();

  await page.goBack();

  const advancedState = page.getByTestId("transaction-filter-advanced");
  await expect(advancedState.locator("code")).toHaveText(advanced);
  await expect(
    advancedState.getByRole("button", { name: "Clear" }),
  ).toBeFocused();
});

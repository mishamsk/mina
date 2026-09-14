import { expect } from "@playwright/test";
import { test } from "@tests/e2e/test";

test("navigation links preserve the current view on modified clicks", async ({
  page,
}) => {
  const response = await page.request.post("/api/accounts", {
    data: {
      fqn: "LinkTest:Checking",
      account_type: "owned",
      currency: "USD",
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const account = (await response.json()) as { account_id: number };
  const destination = `/accounts/${account.account_id}`;

  await page.goto("/accounts");
  const accountLink = page.getByRole("link", {
    name: "LinkTest:Checking",
    exact: true,
  });
  await expect(accountLink).toHaveAttribute("href", destination);
  await accountLink.click({ modifiers: ["ControlOrMeta"] });
  await expect(page).toHaveURL(/\/accounts$/);

  await accountLink.click();
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Navigation", exact: true }).click();
  const navigation = page.locator("[data-mobile-navigation-content]");
  const transactions = navigation.getByRole("link", {
    name: "Transactions",
    exact: true,
  });
  await transactions.click({ modifiers: ["ControlOrMeta"] });
  await expect(page).toHaveURL(new RegExp(`${destination}$`));
  await expect(navigation).toBeVisible();

  await transactions.focus();
  await transactions.press("Enter");
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(navigation).toBeHidden();
});

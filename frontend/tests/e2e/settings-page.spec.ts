import { expect } from "@playwright/test";
import { test } from "@tests/e2e/test";

test("settings navigation renders the server startup snapshot", async ({
  page,
}) => {
  await page.goto("/overview");
  await page
    .getByLabel("Primary")
    .getByRole("link", { name: "Settings" })
    .click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Config file", { exact: true })).toBeVisible();
  await expect(
    page.locator("code").filter({ hasText: "config.toml" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Storage and startup" }),
  ).toBeVisible();

  const database = page.getByTestId("setting-db");
  await expect(database).toContainText("Database file");
  await expect(database).toContainText("mina.db");
  await expect(database.getByLabel("CLI override")).toBeVisible();
  await expect(database.getByLabel("Non-default value")).toBeVisible();

  const startupValidation = page.getByTestId("setting-startup_validation");
  await expect(startupValidation).toContainText("Startup validation");
  await expect(startupValidation).toContainText("none");
  await expect(
    startupValidation.getByLabel("Environment variable override"),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: /Save/i })).toHaveCount(0);
});

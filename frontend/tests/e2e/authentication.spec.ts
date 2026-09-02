import { expect } from "@playwright/test";
import { test } from "@tests/e2e/test";

test.use({ backendAuthentication: true });

test("authentication gates the shell, preserves the session, and logs out", async ({
  authenticationCredentials,
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );

  await page.getByLabel("Email").fill(authenticationCredentials.email);
  await page.getByLabel("Password").fill(authenticationCredentials.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );
});

test("a protected request after session loss returns to login", async ({
  authenticationCredentials,
  context,
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Email").fill(authenticationCredentials.email);
  await page.getByLabel("Password").fill(authenticationCredentials.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByTestId("entity-overview-chart")).toBeVisible();

  await context.clearCookies();
  await page.getByRole("link", { name: "Settings" }).click();

  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );
});

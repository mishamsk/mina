import { expect, test } from "@playwright/test";

test("status page reports backend health", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Mina" })).toBeVisible();
  await expect(page.getByText("API status")).toBeVisible();
  await expect(page.getByText("ok")).toBeVisible();
  await expect(page.getByText("Schema version")).toBeVisible();
  await expect(page.getByText("Server time")).toBeVisible();
});

test("status page UI preference survives reload", async ({ page }) => {
  await page.goto("/");

  const details = page.getByRole("checkbox", { name: "Details" });
  await details.check();
  await expect(page.getByText("Backend health route")).toBeVisible();

  await page.reload();

  await expect(page.getByRole("checkbox", { name: "Details" })).toBeChecked();
  await expect(page.getByText("Backend health route")).toBeVisible();
});

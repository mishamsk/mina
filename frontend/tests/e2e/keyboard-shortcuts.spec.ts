import { expect } from "@playwright/test";
import { test } from "@tests/e2e/test";

test("keyboard help shows route shortcuts, restores focus, and respects entry context", async ({
  page,
}) => {
  await page.goto("/transactions");
  const row = page.locator("[data-transaction-row='true']").first();
  await expect(row).toBeVisible();
  await row.focus();
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Transaction entry", exact: true }),
  ).toBeHidden();
  await expect(
    dialog.getByRole("heading", { name: "Command palette", exact: true }),
  ).toBeHidden();
  await expect(
    dialog.getByText("Open command palette", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Transactions", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Move row focus", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(row).toBeFocused();
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command Palette" });
  await palette
    .getByRole("combobox", { name: "Command search" })
    .fill("Keyboard shortcuts");
  await palette.getByRole("option", { name: "Keyboard shortcuts" }).click();
  await dialog
    .getByRole("button", { name: "Close keyboard shortcuts" })
    .click();
  await expect(row).toBeFocused();

  const input = page.getByRole("searchbox", { name: "Search", exact: true });
  await input.focus();
  await page.keyboard.press("?");
  await expect(input).toHaveValue("?");
  await expect(dialog).toBeHidden();
  await input.fill("");
  await page
    .getByRole("heading", { name: "Transactions", exact: true })
    .focus();
  await page.keyboard.press("n");
  const entry = page.getByTestId("transaction-entry-modal");
  await entry.getByRole("tab", { name: "Spend", exact: true }).focus();
  await page.keyboard.press("?");
  await expect(
    dialog.getByRole("heading", { name: "Transaction entry", exact: true }),
  ).toBeVisible();
});

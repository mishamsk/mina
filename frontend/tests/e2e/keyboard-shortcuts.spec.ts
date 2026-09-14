import { expect } from "@playwright/test";
import { test } from "@tests/e2e/test";

test("keyboard help shows route shortcuts, restores focus, and supports scrolling", async ({
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
  ).toBeVisible();
  await expect(
    page.getByRole("tooltip", { name: "Close keyboard shortcuts" }),
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
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.getByRole("button", { name: "Edit mode", exact: true }).click();
  await page.keyboard.press("?");
  await expect(
    dialog.getByRole("region", { name: "Available keyboard shortcuts" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close keyboard shortcuts" }),
  ).toBeFocused();
  const lastShortcut = dialog.getByText(
    "Close dock, clear selection, then leave Edit mode",
    { exact: true },
  );
  await expect(lastShortcut).not.toBeInViewport();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("region", { name: "Available keyboard shortcuts" }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(lastShortcut).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("palette keyboard help returns focus to the pre-palette invoker", async ({
  page,
}) => {
  await page.goto("/transactions");
  const row = page.locator("[data-transaction-row='true']").first();
  await expect(row).toBeVisible();
  await row.focus();
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command Palette" });
  const search = palette.getByRole("combobox", { name: "Command search" });
  await expect(search).toBeFocused();
  await search.fill("Keyboard shortcuts");
  await palette.getByRole("option", { name: "Keyboard shortcuts" }).click();
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(palette).toBeHidden();
  const closeButton = dialog.getByRole("button", {
    name: "Close keyboard shortcuts",
  });
  await closeButton.hover();
  await expect(
    page.getByRole("tooltip", { name: "Close keyboard shortcuts" }),
  ).toBeVisible();
  await closeButton.click();

  await expect(dialog).toBeHidden();
  await expect(row).toBeFocused();
  await page.keyboard.press("Enter");
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail).toBeVisible();
  await page.keyboard.press("?");
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
  await expect(detail).toBeVisible();
});

test("keyboard help stays closed while typing or using modal overlays", async ({
  page,
}) => {
  await page.goto("/transactions");
  const input = page.getByRole("searchbox", { name: "Search", exact: true });
  await expect(input).toBeVisible();
  await input.focus();
  await page.keyboard.press("?");
  await expect(input).toHaveValue("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeHidden();
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command Palette" });
  const search = palette.getByRole("combobox", { name: "Command search" });
  await expect(search).toBeFocused();
  await page.keyboard.press("?");
  await expect(search).toHaveValue("?");
  await expect(dialog).toBeHidden();
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await input.fill("");
  await page
    .getByRole("heading", { name: "Transactions", exact: true })
    .focus();
  await page.keyboard.press("n");
  const entry = page.getByRole("dialog", {
    name: "Transaction editor",
    exact: true,
  });
  await expect(entry).toBeVisible();
  await entry.getByRole("tab", { name: "Spend", exact: true }).focus();
  await page.keyboard.press("?");
  await expect(page.getByTestId("keyboard-shortcuts-dialog")).toHaveCount(0);
  await page.keyboard.press("Control+K");
  await expect(palette).toBeHidden();
  await expect(
    entry.getByRole("tab", { name: "Spend", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(entry).toBeHidden();
});

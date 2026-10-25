import { expect } from "@playwright/test";
import { test } from "@tests/e2e/test";

test("keyboard help shows route shortcuts, restores focus, and respects entry context", async ({
  page,
}) => {
  await page.goto("/transactions");
  const heading = page.getByRole("heading", {
    name: "Transactions",
    exact: true,
  });
  const paletteButton = page.getByRole("button", {
    name: "Command palette",
    exact: true,
  });
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await heading.hover();
  await paletteButton.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Command palette");
  await paletteButton.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Command palette · Cmd/Ctrl+K (outside editors and overlays)",
  );
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await heading.hover();
  await paletteButton.focus();
  await expect(page.getByRole("tooltip")).toBeHidden();
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
  await expect(
    dialog.getByText("Focus list search", { exact: true }),
  ).toHaveCount(2);
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
  await page.keyboard.press("/");
  await expect(input).toBeFocused();
  await page.keyboard.press("?");
  await expect(input).toHaveValue("?");
  await expect(dialog).toBeHidden();
  await input.fill("");
  await page
    .getByRole("heading", { name: "Transactions", exact: true })
    .focus();
  await page.keyboard.press("n");
  const entry = page.getByTestId("transaction-entry-modal");
  const saveClose = entry.getByRole("button", { name: "Save and close" });
  const saveAnother = entry.getByRole("button", {
    name: "Save and add another",
  });
  await saveClose.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Save and close · Ctrl+Shift+Enter",
  );
  await saveAnother.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Save and add another · Ctrl+Enter",
  );
  await entry.getByRole("heading", { name: "New spend" }).hover();
  await saveClose.focus();
  await expect(page.getByRole("tooltip")).toBeHidden();
  await page.keyboard.press("Tab");
  // Native WebKit Tab navigation may skip buttons according to macOS settings.
  expect(
    await entry.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await expect(page.getByRole("tooltip")).toBeHidden();
  await saveAnother.focus();
  await expect(saveAnother).toBeFocused();
  await expect(page.getByRole("tooltip")).toBeHidden();
  await entry.getByRole("tab", { name: "Spend", exact: true }).focus();
  await page.keyboard.press("?");
  await expect(
    dialog.getByRole("heading", { name: "Transaction entry", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Ctrl is the physical Control key, including on Mac."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    entry.getByRole("tab", { name: "Spend", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Control+Enter");
  await expect(entry.getByText("Entries this session: 0")).toBeVisible();
  await expect(
    entry.getByText("Funding account is required.", { exact: true }),
  ).toBeVisible();
});

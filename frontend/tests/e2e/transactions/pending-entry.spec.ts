import { test } from "@tests/e2e/test";
import {
  chooseOptionByKeyboard,
  expect,
} from "@tests/e2e/transactions/support";

test("pending spend entry shows its pending state", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E pending spend ${unique}`;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const spend = editor.getByRole("tabpanel", { name: "Spend" });
  const merchant = spend.getByRole("group", { name: "Merchant 1" });
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    "Wallet",
    "cash:Wallet",
    { scope: spend },
  );
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
    { scope: merchant },
  );
  await merchant.getByLabel("Amount").fill("12.34");
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: merchant },
  );
  await spend.getByLabel("Memo").fill(memo);
  await editor.getByRole("checkbox", { name: "Record as pending" }).check();
  await editor.getByRole("button", { name: "Save and close" }).click();

  await expect(editor).toBeHidden();
  await page.getByLabel("Search").fill(memo);
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole("img", { name: "Pending" })).toBeVisible();

  await row.locator(".transactions-description-column").click();
  await expect(page.getByTestId("transaction-lifecycle")).toContainText(
    "Pending",
  );
});

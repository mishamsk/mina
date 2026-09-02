import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  createMember,
  findByFqn,
  listFixtures,
} from "@tests/e2e/transactions/support";

const memberRow = (page: Page, name: string) =>
  page.getByTestId("members-list-row").filter({ hasText: name }).first();

test("search filters the flat member list through the URL", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const targetName = `E2E Search Target ${unique}`;
  const otherName = `E2E Search Other ${unique}`;
  await createMember(page, targetName);
  await createMember(page, otherName);

  await page.goto("/members");
  await page.getByRole("searchbox", { name: "Search" }).fill(targetName);

  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/members" && url.searchParams.get("q") === targetName,
  );
  await expect(memberRow(page, targetName)).toBeVisible();
  await expect(memberRow(page, otherName)).toHaveCount(0);
});

test("creating a member adds it to the list", async ({ browserName, page }) => {
  const name = `E2E Created Member ${browserName}${Date.now()}`;

  await page.goto("/members");
  await page.getByRole("button", { name: "New member" }).click();
  const panel = page.getByRole("dialog", { name: "Create member" });
  await panel.getByLabel("Name").fill(name);
  await panel.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Member created.")).toBeVisible();
  await expect(memberRow(page, name)).toBeVisible();
});

test("renaming a member updates its list row", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const originalName = `E2E Rename Member ${unique}`;
  const renamedName = `E2E Renamed Member ${unique}`;
  await createMember(page, originalName);

  await page.goto("/members");
  const originalRow = memberRow(page, originalName);
  await expect(originalRow).toBeVisible();
  await originalRow.getByRole("button", { name: "Edit member" }).click();
  const panel = page.getByRole("dialog", { name: "Edit member" });
  await panel.getByLabel("Name").fill(renamedName);
  await panel.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Member updated.")).toBeVisible();
  await expect(originalRow).toHaveCount(0);
  await expect(memberRow(page, renamedName)).toBeVisible();
});

test("deleting an eligible member removes it from the list", async ({
  browserName,
  page,
}) => {
  const name = `E2E Delete Member ${browserName}${Date.now()}`;
  await createMember(page, name);

  await page.goto(`/members?q=${encodeURIComponent(name)}`);
  const row = memberRow(page, name);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Delete member" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete member" });
  await expect(dialog).toContainText(name);
  await dialog.getByRole("button", { name: "Delete member" }).click();

  await expect(page.getByText("Member deleted.")).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("members with attributed records explain why deletion is unavailable", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const member = await createMember(page, `E2E Blocked Member ${unique}`);
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const transactionResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "12.34",
        category_id: findByFqn(categories, "Entertainment:Books").category_id,
        counterparty_account_id: findByFqn(accounts, "merchant:PowellsBooks")
          .account_id,
        currency: "USD",
        funding_account_id: findByFqn(accounts, "cash:Wallet").account_id,
        initiated_date: "2026-05-31",
        member_id: member.member_id,
        memo: `E2E blocked member deletion ${unique}`,
      },
    },
  );
  expect(transactionResponse.ok(), await transactionResponse.text()).toBe(true);

  await page.goto(`/members?q=${encodeURIComponent(member.name)}`);
  const row = memberRow(page, member.name);
  const rowDelete = row.getByRole("button", { name: "Delete member" });
  await expect(row).toBeVisible();
  await expect(rowDelete).toHaveAttribute("aria-disabled", "true");
  await rowDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Member has attributed records.",
  );
});

test("hidden members can be included and restored", async ({
  browserName,
  page,
}) => {
  const name = `E2E Hidden Member ${browserName}${Date.now()}`;
  await createMember(page, name);

  await page.goto(`/members?q=${encodeURIComponent(name)}`);
  const row = memberRow(page, name);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Hide member" }).click();
  await expect(page.getByText("Member hidden.")).toBeVisible();
  await expect(row).toHaveCount(0);

  await page.getByRole("button", { name: "Include hidden" }).click();
  await expect(row).toBeVisible();
  await expect(row.getByLabel("Hidden item")).toBeVisible();

  await row.getByRole("button", { name: "Unhide member" }).click();
  await expect(page.getByText("Member unhidden.")).toBeVisible();
  await expect(row.getByLabel("Hidden item")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Hide member" })).toBeVisible();
});

import { test } from "@tests/e2e/test";
import {
  createMember,
  createSearchSpend,
  createTag,
  deleteTransaction,
  expect,
} from "@tests/e2e/transactions/support";

const uniqueSuffix = (projectName: string): string =>
  `${projectName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;

test("edit mode can include and apply a hidden tag", async ({
  page,
}, testInfo) => {
  const unique = uniqueSuffix(testInfo.project.name);
  const memo = `E2E hidden tag picker ${unique}`;
  const [tag, transaction] = await Promise.all([
    createTag(page, `E2E:HiddenPicker:${unique}:QuietTag`),
    createSearchSpend(page, memo),
  ]);
  const hideResponse = await page.request.patch(`/api/tags/${tag.tag_id}`, {
    data: { is_hidden: true },
  });
  expect(hideResponse.ok(), await hideResponse.text()).toBe(true);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();

  await page.getByRole("button", { name: "Edit mode" }).click();
  await row.click();
  const dock = page.getByTestId("transaction-edit-dock");
  await dock.getByRole("button", { name: "Add / remove" }).click();
  const editor = page.getByTestId("edit-dock-editor");
  const tags = editor.getByRole("combobox", { name: "Tags to add" });
  const options = page.locator("#edit-dock-tags-options");

  await tags.fill(tag.name);
  await expect(options).toContainText("No matches");
  await editor.getByRole("checkbox", { name: "Include hidden" }).click();
  await tags.focus();

  const hiddenOption = options
    .getByRole("option")
    .filter({ hasText: tag.name });
  await expect(hiddenOption).toBeVisible();
  await expect(
    hiddenOption.getByLabel("Hidden", { exact: true }),
  ).toBeVisible();
  await hiddenOption.click();
  await expect(
    editor.getByTestId("entity-multi-picker-selected"),
  ).toContainText(tag.display_label);

  await editor.getByRole("button", { name: "Apply" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "1 updated · 0 require full edit" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    row.getByTestId("transaction-tag-chips-list").getByText(tag.name, {
      exact: true,
    }),
  ).toBeVisible();

  await deleteTransaction(page, transaction);
});

test("member filters treat colon-containing names as one flat choice", async ({
  page,
}, testInfo) => {
  const unique = uniqueSuffix(testInfo.project.name);
  const member = await createMember(page, `Household:${unique}`);

  await page.goto("/transactions?page=1&pageSize=25");
  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Member" }).click();

  const memberPicker = page.getByRole("combobox", { name: "Members" });
  const memberOptions = page.locator("#transactions-filter-member-options");
  await memberPicker.fill("Household:");
  await memberOptions
    .getByRole("option")
    .filter({ hasText: member.name })
    .click();

  await expect(page.getByTestId("entity-multi-picker-selected")).toContainText(
    member.name,
  );
  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("button", {
      name: `Edit Member ${member.name} · any of`,
    }),
  ).toBeVisible();
});

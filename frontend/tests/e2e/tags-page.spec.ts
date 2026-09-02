import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  findByFqn,
  listFixtures,
} from "@tests/e2e/transactions/support";

interface TagFixture {
  readonly fqn: string;
  readonly tag_id: number;
}

const createTag = async (page: Page, fqn: string): Promise<TagFixture> => {
  const response = await page.request.post("/api/tags", { data: { fqn } });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as TagFixture;
};

test("hierarchical tag search updates the URL and matching tree", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const prefix = `E2ESearch${unique}:Trips`;
  const targetFqn = `${prefix}:Summer`;
  const unrelatedFqn = `E2EOther${unique}:Trips:Winter`;
  await Promise.all([
    createTag(page, targetFqn),
    createTag(page, unrelatedFqn),
  ]);

  await page.goto("/tags");
  await page.getByRole("searchbox", { name: "Search" }).fill(targetFqn);

  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/tags" && url.searchParams.get("q") === targetFqn,
  );
  await expect(
    page.getByLabel(`Open tag ${prefix}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel(`Open tag ${targetFqn}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel(`Open tag ${unrelatedFqn}`, { exact: true }),
  ).toHaveCount(0);
});

test("creating a tag adds it to the tree", async ({ page }, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2ECreate${unique}:Trips:Beach`;

  await page.goto("/tags");
  await page.getByRole("button", { name: "New tag" }).click();
  const panel = page.getByRole("dialog", { name: "Create tag" });
  await panel.getByLabel("FQN").fill(fqn);
  await panel.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Tag created.")).toBeVisible();
  await expect(
    page.getByLabel(`Open tag ${fqn}`, { exact: true }),
  ).toBeVisible();
});

test("editing a tag display label makes its row searchable", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const tag = await createTag(page, `E2EEdit${unique}:Routine:Weekly`);
  const label = `Weekend routine ${unique}`;

  await page.goto(`/tags?q=${encodeURIComponent(tag.fqn)}`);
  const row = page.getByLabel(`Open tag ${tag.fqn}`, { exact: true });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Edit tag" }).click();

  const panel = page.getByRole("dialog", { name: "Edit tag" });
  await panel.getByLabel("Display label (optional)").fill(label);
  await panel.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Tag updated.")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search" }).fill(label);
  await expect(row).toBeVisible();
});

test("moving a tag group refreshes a stable-ID transaction filter", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const source = `E2EOld${unique}`;
  const destination = `E2ENew${unique}`;
  const sourceLeafFqn = `${source}:Alpha`;
  const destinationLeafFqn = `${destination}:Alpha`;
  const [filteredTag] = await Promise.all([
    createTag(page, sourceLeafFqn),
    createTag(page, `${source}:Beta`),
  ]);
  const filter = `tag:#${filteredTag.tag_id}`;

  await page.goto(`/transactions?filter=${encodeURIComponent(filter)}`);
  await expect(
    page.getByRole("button", {
      exact: true,
      name: `Edit Tag #${filteredTag.tag_id} (${sourceLeafFqn}) · any of`,
    }),
  ).toBeVisible();

  await page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Tags" })
    .click();
  await page.getByRole("searchbox", { name: "Search" }).fill(source);
  const groupRow = page.getByLabel(`Open tag ${source}`, { exact: true });
  await expect(groupRow).toBeVisible();
  await groupRow.getByRole("button", { name: "Move or rename" }).click();
  const dialog = page.getByRole("dialog", { name: "Move or rename" });
  await dialog.getByLabel("To").fill(destination);
  await dialog.getByRole("button", { name: "Move" }).click();
  await expect(page.getByText("Moved 2 tags.")).toBeVisible();

  await page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Transactions" })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/transactions" &&
      url.searchParams.get("filter") === filter,
  );
  const filters = page.getByLabel("Transaction filters");
  await expect(
    filters.getByRole("button", {
      exact: true,
      name: `Edit Tag #${filteredTag.tag_id} (${destinationLeafFqn}) · any of`,
    }),
  ).toBeVisible();
  await expect(filters).not.toContainText(sourceLeafFqn);
});

test("deleting an eligible tag removes it from the tree", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const tag = await createTag(page, `E2EDelete${unique}:Unused`);

  await page.goto(`/tags?q=${encodeURIComponent(tag.fqn)}`);
  const row = page.getByLabel(`Open tag ${tag.fqn}`, { exact: true });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Delete tag" }).click();

  const dialog = page.getByRole("alertdialog", { name: "Delete tag" });
  await expect(dialog).toContainText(tag.fqn);
  await dialog.getByRole("button", { name: "Delete tag" }).click();

  await expect(page.getByText("Tag deleted.")).toBeVisible();
  await expect(row).toHaveCount(0);
});

test("tags with dependents explain why deletion is unavailable", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const tag = await createTag(page, `E2EBlockedDelete${unique}:InUse`);
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
        memo: `E2E blocked tag deletion ${unique}`,
        tag_ids: [tag.tag_id],
      },
    },
  );
  expect(transactionResponse.ok(), await transactionResponse.text()).toBe(true);

  await page.goto(`/tags?q=${encodeURIComponent(tag.fqn)}`);
  const row = page.getByLabel(`Open tag ${tag.fqn}`, { exact: true });
  const rowDelete = row.getByRole("button", { name: "Delete tag" });
  await expect(row).toBeVisible();
  await expect(rowDelete).toHaveAttribute("aria-disabled", "true");
  await rowDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Tag has active dependent records.",
  );
});

test("hidden tag can be included", async ({ page }, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const tag = await createTag(page, `E2EHidden${unique}:Everyday`);

  await page.goto(`/tags?q=${encodeURIComponent(tag.fqn)}`);
  const row = page.getByLabel(`Open tag ${tag.fqn}`, { exact: true });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Hide tag" }).click();

  await expect(page.getByText("Tag hidden.")).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Include hidden" }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/tags" && url.searchParams.get("hidden") === "true",
  );
  await expect(row).toBeVisible();
  await expect(row.getByLabel("Hidden item")).toBeVisible();
});

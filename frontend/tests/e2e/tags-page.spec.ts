import { expect, type Page, test } from "@playwright/test";

interface TagFixture {
  readonly fqn: string;
  readonly is_hidden: boolean;
  readonly name: string;
  readonly tag_id: number;
}

const createTag = async (
  page: Page,
  {
    fqn,
    hidden = false,
  }: {
    readonly fqn: string;
    readonly hidden?: boolean;
  },
): Promise<TagFixture> => {
  const response = await page.request.post("/api/tags", {
    data: {
      fqn,
      is_hidden: hidden,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as TagFixture;
};

test("tags page renders demo hierarchy, URL search, and hidden toggle", async ({
  browserName,
  page,
}) => {
  const unique = Date.now().toString(36);
  const hiddenTag = await createTag(page, {
    fqn: `E2EHidden:${browserName}${unique}`,
    hidden: true,
  });
  const tagsResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/tags" &&
      url.searchParams.get("include_hidden") === "true"
    );
  });
  const groupsResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/tags/groups" &&
      url.searchParams.get("include_hidden") === "true"
    );
  });

  await page.goto("/tags");
  await tagsResponse;
  await groupsResponse;

  await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible();
  const tagsNavLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Tags" });
  await expect(tagsNavLink).toHaveAttribute("aria-current", "page");

  const sharedGroup = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: "Shared" })
    .first();
  await expect(sharedGroup).toBeVisible();
  const familyRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: "Family" })
    .first();
  await expect(familyRow).toBeVisible();
  const cashRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: "Cash" })
    .first();
  await expect(cashRow).toBeVisible();

  await expect(
    page.getByTestId("tags-tree-row").filter({ hasText: hiddenTag.fqn }),
  ).toHaveCount(0);

  await page.getByLabel("Search").fill("Shared:Family");
  await expect(page).toHaveURL(/\/tags\?q=Shared%3AFamily$/);
  await expect(
    page.getByTestId("tags-tree-row").filter({ hasText: "Shared" }).first(),
  ).toBeVisible();
  await expect(
    page.getByTestId("tags-tree-row").filter({ hasText: "Family" }),
  ).toBeVisible();
  await expect(
    page.getByTestId("tags-tree-row").filter({ hasText: "Cash" }),
  ).toHaveCount(0);

  await page.getByLabel("Search").fill(hiddenTag.fqn);
  await expect(
    page.getByTestId("tags-tree-row").filter({ hasText: hiddenTag.fqn }),
  ).toHaveCount(0);

  await page.getByLabel("Include hidden").click();
  await expect(page).toHaveURL(/hidden=true/);
  const hiddenRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: hiddenTag.fqn })
    .first();
  await expect(hiddenRow).toBeVisible();
  await expect(hiddenRow.getByLabel("Hidden item")).toBeVisible();
});

test("tags row actions hide groups and move renamed paths into transaction filters", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const leafFqn = `E2EActions:${unique}:Leaf`;
  const groupPrefix = `E2EActions:${unique}:Group`;
  const moveSource = `E2ERename:${unique}:Old`;
  const moveDestination = `E2ERename:${unique}:New`;
  await Promise.all([
    createTag(page, { fqn: leafFqn }),
    createTag(page, { fqn: `${groupPrefix}:One` }),
    createTag(page, { fqn: `${groupPrefix}:Two` }),
    createTag(page, { fqn: `${moveSource}:Alpha` }),
    createTag(page, { fqn: `${moveSource}:Beta` }),
  ]);

  await page.goto("/transactions");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  const tagPicker = page.getByRole("combobox", { name: "Tags" });
  await tagPicker.fill(moveSource);
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    `${moveSource}:Alpha`,
  );

  await page.goto("/tags");
  await page.getByLabel("Search").fill(leafFqn);
  const leafRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: "Leaf" })
    .first();
  await expect(leafRow).toBeVisible({ timeout: 10_000 });
  await leafRow.getByRole("button", { name: "Hide tag" }).click();
  await expect(page.getByText("Tag hidden.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("tags-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });
  await page.getByLabel("Include hidden").click();
  await expect(
    page.getByTestId("tags-tree-row").filter({ hasText: "Leaf" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page
      .getByTestId("tags-tree-row")
      .filter({ hasText: "Leaf" })
      .getByLabel("Hidden item"),
  ).toBeVisible();

  await page.goto(`/tags?q=${encodeURIComponent(groupPrefix)}`);
  const groupRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: "Group" })
    .first();
  await expect(groupRow).toBeVisible({ timeout: 10_000 });
  await groupRow.getByRole("button", { name: "Hide group" }).click();
  await expect(page.getByText("Tag group hidden.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("tags-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });
  await page.getByLabel("Include hidden").click();
  await expect(
    page.getByTestId("tags-tree-row").filter({ hasText: "One" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByTestId("tags-tree-row").filter({ hasText: "Two" }),
  ).toBeVisible();

  await page.goto(`/tags?q=${encodeURIComponent(moveSource)}`);
  const moveGroupRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: "Old" })
    .first();
  await expect(moveGroupRow).toBeVisible({ timeout: 10_000 });
  await moveGroupRow.hover();
  await moveGroupRow.getByRole("button", { name: "Move or rename" }).click();
  const moveDialog = page.getByRole("dialog", { name: "Move or rename" });
  await expect(moveDialog).toBeVisible();
  await moveDialog.getByLabel("To").fill(moveDestination);
  const moveRequest = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/tags/restructure" &&
      response.request().method() === "POST"
    );
  });
  await moveDialog.getByRole("button", { name: "Move" }).click();
  const moveResponse = await moveRequest;
  expect(moveResponse.status()).toBe(200);
  await expect(page.getByText("Moved 2 tags.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("tags-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });
  await page.getByLabel("Search").fill(moveDestination);
  await expect(
    page.getByTestId("tags-tree-row").filter({ hasText: "Alpha" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByTestId("tags-tree-row").filter({ hasText: "Beta" }),
  ).toBeVisible();

  await page.goto("/transactions");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  const refreshedTagPicker = page.getByRole("combobox", { name: "Tags" });
  await refreshedTagPicker.fill(moveDestination);
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    `${moveDestination}:Alpha`,
  );
  await refreshedTagPicker.fill(moveSource);
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    "No matches",
  );
});

test("tags side panel creates edits and deletes tags with conflict feedback", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2EPanel:${unique}:Leaf`;

  await page.goto("/tags");
  await page.getByRole("button", { name: "New tag" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create tag" });
  await expect(createPanel).toBeVisible();
  await createPanel.getByLabel("FQN").fill(fqn);
  const createResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/tags" && response.request().method() === "POST"
    );
  });
  await createPanel.getByRole("button", { name: "Create" }).click();
  expect((await createResponse).status()).toBe(201);
  await expect(page.getByText("Tag created.")).toBeVisible({
    timeout: 10_000,
  });

  await page.getByLabel("Search").fill(fqn);
  const createdRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: "Leaf" })
    .first();
  await expect(createdRow).toBeVisible({ timeout: 10_000 });
  await createdRow.click();

  const editPanel = page.getByRole("dialog", { name: "Edit tag" });
  await expect(editPanel).toBeVisible();
  await expect(editPanel.getByLabel("FQN")).toHaveAttribute("readonly", "");
  await editPanel.getByLabel("Hidden").click();
  const updateResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/tags/") &&
      response.request().method() === "PATCH"
    );
  });
  await editPanel.getByRole("button", { name: "Save" }).click();
  expect((await updateResponse).status()).toBe(200);
  await expect(page.getByText("Tag updated.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("tags-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });

  await page.getByLabel("Include hidden").click();
  const hiddenRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: "Leaf" })
    .first();
  await expect(hiddenRow).toBeVisible({ timeout: 10_000 });
  await expect(hiddenRow.getByLabel("Hidden item")).toBeVisible();
  await hiddenRow.click();
  const hiddenEditPanel = page.getByRole("dialog", { name: "Edit tag" });
  await hiddenEditPanel.getByRole("button", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("alertdialog", {
    name: "Delete tag",
  });
  await expect(deleteDialog).toContainText(fqn);
  const deleteResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/tags/") &&
      response.request().method() === "DELETE"
    );
  });
  await deleteDialog.getByRole("button", { name: "Delete tag" }).click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(page.getByText("Tag deleted.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("tags-tree-row")).toHaveCount(0, {
    timeout: 10_000,
  });

  await page.goto("/tags?q=Cash");
  const cashRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: "Cash" })
    .first();
  await expect(cashRow).toBeVisible({ timeout: 10_000 });
  await cashRow.click();
  const cashPanel = page.getByRole("dialog", { name: "Edit tag" });
  await cashPanel.getByRole("button", { name: "Delete" }).click();
  const conflictDialog = page.getByRole("alertdialog", {
    name: "Delete tag",
  });
  const conflictResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/tags/") &&
      response.request().method() === "DELETE"
    );
  });
  await conflictDialog.getByRole("button", { name: "Delete tag" }).click();
  expect((await conflictResponse).status()).toBe(409);
  await expect(conflictDialog.getByRole("alert")).toContainText(
    /active|depend|reference|could not/i,
  );
});

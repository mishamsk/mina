import { expect, type Page, test } from "@playwright/test";

interface MemberFixture {
  readonly member_id: number;
  readonly name: string;
}

const createMember = async (
  page: Page,
  name: string,
): Promise<MemberFixture> => {
  const response = await page.request.post("/api/members", { data: { name } });
  expect(response.ok()).toBe(true);
  return (await response.json()) as MemberFixture;
};

test("members page renders sorted demo members and URL search", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const spacedName = `Uncle Bob ${unique}`;
  await createMember(page, spacedName);

  const membersResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/members" && url.searchParams.get("sort") === "name"
    );
  });

  await page.goto("/members");
  await membersResponse;

  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  const membersNavLink = page
    .getByLabel("Primary")
    .getByRole("link", { exact: true, name: "Members" });
  await expect(membersNavLink).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("button", { name: "Include hidden" }),
  ).toHaveCount(0);

  const rows = page.getByTestId("members-list-row");
  await expect(rows.nth(0)).toContainText("Avery");
  await expect(rows.nth(1)).toContainText("Morgan");
  await expect(rows.nth(2)).toContainText("Riley");

  const searchInput = page.getByLabel("Search");
  await searchInput.fill("Morgan");
  await expect(page).toHaveURL(/\/members\?q=Morgan$/);
  await expect(page.getByTestId("members-list-row")).toHaveCount(1);
  await expect(page.getByTestId("members-list-row").first()).toContainText(
    "Morgan",
  );

  await searchInput.fill("");
  await searchInput.pressSequentially(spacedName);
  await expect(searchInput).toHaveValue(spacedName);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe(spacedName);
  await expect(page.getByTestId("members-list-row")).toHaveCount(1);
  await expect(page.getByTestId("members-list-row").first()).toContainText(
    spacedName,
  );
});

test("members side panel creates renames and deletes members with conflict feedback", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const originalName = `E2E Member ${unique}`;
  const renamedName = `E2E Renamed ${unique}`;
  const deleteName = `E2E Delete ${unique}`;
  await createMember(page, originalName);

  await page.goto("/transactions");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Member" }).click();
  const memberPicker = page.getByRole("combobox", { name: "Members" });
  await memberPicker.fill(originalName.slice(0, -1));
  await expect(
    page.locator("#transactions-filter-member-options"),
  ).toContainText(originalName);

  await page.goto("/members");
  await page.getByRole("button", { name: "New member" }).click();
  const createPanel = page.getByRole("dialog", { name: "Create member" });
  await expect(createPanel).toBeVisible();
  await createPanel.getByLabel("Name").fill(deleteName);
  const createResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/members" && response.request().method() === "POST"
    );
  });
  await createPanel.getByRole("button", { name: "Create" }).click();
  expect((await createResponse).status()).toBe(201);
  await expect(page.getByText("Member created.")).toBeVisible({
    timeout: 10_000,
  });

  await page.getByLabel("Search").fill(originalName);
  const originalRow = page
    .getByTestId("members-list-row")
    .filter({ hasText: originalName })
    .first();
  await expect(originalRow).toBeVisible({ timeout: 10_000 });
  await originalRow.click();

  const editPanel = page.getByRole("dialog", { name: "Edit member" });
  await expect(editPanel).toBeVisible();
  await editPanel.getByLabel("Name").fill(renamedName);
  const updateResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/members/") &&
      response.request().method() === "PATCH"
    );
  });
  await editPanel.getByRole("button", { name: "Save" }).click();
  expect((await updateResponse).status()).toBe(200);
  await expect(page.getByText("Member updated.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("members-list-row")).toHaveCount(0, {
    timeout: 10_000,
  });
  await page.getByLabel("Search").fill(renamedName);
  await expect(
    page.getByTestId("members-list-row").filter({ hasText: renamedName }),
  ).toBeVisible({ timeout: 10_000 });

  await page.goto("/transactions");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Member" }).click();
  const refreshedMemberPicker = page.getByRole("combobox", {
    name: "Members",
  });
  await refreshedMemberPicker.fill(renamedName.slice(0, -1));
  await expect(
    page.locator("#transactions-filter-member-options"),
  ).toContainText(renamedName);
  await refreshedMemberPicker.fill(originalName);
  await expect(
    page.locator("#transactions-filter-member-options"),
  ).toContainText("No matches");

  await page.goto(`/members?q=${encodeURIComponent(deleteName)}`);
  const deleteRow = page
    .getByTestId("members-list-row")
    .filter({ hasText: deleteName })
    .first();
  await expect(deleteRow).toBeVisible({ timeout: 10_000 });
  await deleteRow.click();
  const deletePanel = page.getByRole("dialog", { name: "Edit member" });
  await deletePanel.getByRole("button", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("alertdialog", {
    name: "Delete member",
  });
  await expect(deleteDialog).toContainText(deleteName);
  const deleteResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/members/") &&
      response.request().method() === "DELETE"
    );
  });
  await deleteDialog.getByRole("button", { name: "Delete member" }).click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(page.getByText("Member deleted.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId("members-list-row")).toHaveCount(0, {
    timeout: 10_000,
  });

  await page.goto("/members?q=Avery");
  const averyRow = page
    .getByTestId("members-list-row")
    .filter({ hasText: "Avery" })
    .first();
  await expect(averyRow).toBeVisible({ timeout: 10_000 });
  await averyRow.click();
  const averyPanel = page.getByRole("dialog", { name: "Edit member" });
  await averyPanel.getByRole("button", { name: "Delete" }).click();
  const conflictDialog = page.getByRole("alertdialog", {
    name: "Delete member",
  });
  const conflictResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/members/") &&
      response.request().method() === "DELETE"
    );
  });
  await conflictDialog.getByRole("button", { name: "Delete member" }).click();
  expect((await conflictResponse).status()).toBe(409);
  await expect(conflictDialog.getByRole("alert")).toContainText(
    /active|depend|reference|could not/i,
  );
});

import { expect, type Locator, type Page, test } from "@playwright/test";

interface MemberFixture {
  readonly member_id: number;
  readonly name: string;
}

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly fqn: string;
}

const createMember = async (
  page: Page,
  name: string,
): Promise<MemberFixture> => {
  const response = await page.request.post("/api/members", { data: { name } });
  expect(response.ok()).toBe(true);
  return (await response.json()) as MemberFixture;
};

const listFixtures = async <T>(
  page: Page,
  path: string,
  collectionKey: string,
): Promise<readonly T[]> => {
  const response = await page.request.get(
    `${path}?limit=500&offset=0&sort=fqn&sort_dir=asc`,
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as Record<string, readonly T[]>;
  return body[collectionKey] ?? [];
};

const findByFqn = <T extends { readonly fqn: string }>(
  fixtures: readonly T[],
  fqn: string,
): T => {
  const fixture = fixtures.find((item) => item.fqn === fqn);
  expect(fixture, `${fqn} fixture`).toBeDefined();
  return fixture as T;
};

const activateRowAction = async (
  page: Page,
  row: Locator,
  actionName: string,
) => {
  const action = row.getByRole("button", { name: actionName });
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press("Tab");
  await action.focus();
  await expect(action).toBeFocused();
  await page.keyboard.press("Enter");
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
  ).toBeVisible();

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

test("member hide controls round-trip through the editor and entry picker", async ({
  page,
}, testInfo) => {
  const name = `E2E Hidden Member ${testInfo.project.name}${Date.now()}`;
  const member = await createMember(page, name);

  await page.goto(`/members?q=${encodeURIComponent(name)}`);
  const row = page
    .getByTestId("members-list-row")
    .filter({ hasText: name })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });

  const hideResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/members/${member.member_id}/hidden` &&
      response.request().method() === "PUT"
    );
  });
  await activateRowAction(page, row, "Hide member");
  expect((await hideResponse).status()).toBe(200);
  await expect(page.getByText("Member hidden.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(row).toHaveCount(0, { timeout: 10_000 });

  const includeHiddenResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/members" &&
      url.searchParams.get("include_hidden") === "true"
    );
  });
  await page.getByRole("button", { name: "Include hidden" }).click();
  await includeHiddenResponse;
  await expect(page).toHaveURL(/hidden=true/);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.getByLabel("Hidden item")).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Unhide member" }),
  ).toBeVisible();

  const unhideResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/members/${member.member_id}/hidden` &&
      response.request().method() === "PUT"
    );
  });
  await row.getByRole("button", { name: "Unhide member" }).click();
  expect((await unhideResponse).status()).toBe(200);
  await expect(page.getByText("Member unhidden.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(row.getByRole("button", { name: "Hide member" })).toBeVisible({
    timeout: 10_000,
  });

  await row.getByRole("button", { name: "Edit member" }).click();
  const panel = page.getByRole("dialog", { name: "Edit member" });
  const hiddenCheckbox = panel.getByLabel("Hidden");
  await expect(hiddenCheckbox).toHaveAttribute("data-state", "unchecked");
  await hiddenCheckbox.click();
  const editorHideResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/members/${member.member_id}/hidden` &&
      response.request().method() === "PUT"
    );
  });
  await panel.getByRole("button", { name: "Save" }).click();
  expect((await editorHideResponse).status()).toBe(200);
  await expect(page.getByText("Member updated.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(row.getByLabel("Hidden item")).toBeVisible({ timeout: 10_000 });

  await page.goto("/transactions");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const memberPicker = page.getByRole("combobox", { name: "Member" });
  await expect(memberPicker).toBeVisible();
  await memberPicker.fill(name);
  await expect(page.locator("#spend-member-options")).toContainText(
    "No matches",
  );

  await page.goto(`/members?hidden=true&q=${encodeURIComponent(name)}`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  const editorUnhideResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/members/${member.member_id}/hidden` &&
      response.request().method() === "PUT"
    );
  });
  await row.getByRole("button", { name: "Unhide member" }).click();
  expect((await editorUnhideResponse).status()).toBe(200);
  await expect(page.getByText("Member unhidden.")).toBeVisible({
    timeout: 10_000,
  });

  await page.goto("/transactions");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const refreshedMemberPicker = page.getByRole("combobox", {
    name: "Member",
  });
  await expect(refreshedMemberPicker).toBeVisible();
  await refreshedMemberPicker.fill(name.slice(0, -1));
  await expect(page.locator("#spend-member-options")).toContainText(name);
});

test("members side panel creates renames and deletes members with conflict feedback", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const originalName = `E2E Member ${unique}`;
  const renamedName = `E2E Renamed ${unique}`;
  const deleteName = `E2E Delete ${unique}`;
  const originalMember = await createMember(page, originalName);

  await page.goto("/transactions");
  await expect(page.getByText("Description")).toBeVisible();
  await page.getByRole("button", { name: "Open filters" }).click();
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
  await originalRow.getByRole("button", { name: "Edit member" }).click();

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
  await page.getByRole("button", { name: "Open filters" }).click();
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
  await deleteRow.getByRole("button", { name: "Edit member" }).click();
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

  await page.goto(`/members?q=${encodeURIComponent(renamedName)}`);
  const renamedRow = page
    .getByTestId("members-list-row")
    .filter({ hasText: renamedName })
    .first();
  await expect(renamedRow).toBeVisible({ timeout: 10_000 });
  await renamedRow.getByRole("button", { name: "Edit member" }).click();
  const renamedPanel = page.getByRole("dialog", { name: "Edit member" });
  await expect(
    renamedPanel.getByRole("button", { name: "Delete" }),
  ).not.toHaveAttribute("aria-disabled", "true");
  await page.route(
    `/api/members/${originalMember.member_id}`,
    async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue();
        return;
      }
      await route.fulfill({
        body: JSON.stringify({
          code: "conflict",
          message: "Member has active dependent records.",
        }),
        contentType: "application/json",
        status: 409,
      });
    },
  );
  await renamedPanel.getByRole("button", { name: "Delete" }).click();
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
  await page.unroute(`/api/members/${originalMember.member_id}`);
});

test("member row actions edit and delete without activating the row", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const name = `E2E Row Action ${unique}`;
  const conflictName = `E2E Row Conflict ${unique}`;
  const [, conflictMember] = await Promise.all([
    createMember(page, name),
    createMember(page, conflictName),
  ]);

  await page.goto(`/members?q=${encodeURIComponent(name)}`);
  const row = page
    .getByTestId("members-list-row")
    .filter({ hasText: name })
    .first();
  const editAction = row.getByRole("button", { name: "Edit member" });
  const deleteAction = row.getByRole("button", { name: "Delete member" });
  await expect(row).toBeVisible({ timeout: 10_000 });

  await page.mouse.move(0, 0);
  await expect(editAction).toHaveCSS("opacity", "1");
  await expect(deleteAction).toHaveCSS("opacity", "1");

  await expect(editAction).toBeVisible();
  await expect(deleteAction).toBeVisible();
  await editAction.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Edit member");
  await deleteAction.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Delete member");

  await editAction.focus();
  await expect(editAction).toBeFocused();
  await page.keyboard.press("Enter");
  const editPanel = page.getByRole("dialog", { name: "Edit member" });
  await expect(editPanel).toBeVisible();
  await expect(page).toHaveURL(`/members?q=${encodeURIComponent(name)}`);
  await editPanel.getByRole("button", { name: "Close member panel" }).click();
  await expect(editPanel).toBeHidden();

  await deleteAction.click();
  await expect(editPanel).toBeHidden();
  await expect(page).toHaveURL(`/members?q=${encodeURIComponent(name)}`);
  const deleteDialog = page.getByRole("alertdialog", {
    name: "Delete member",
  });
  await expect(deleteDialog).toContainText(name);
  await page.keyboard.press("Escape");
  await expect(deleteDialog).toBeHidden();
  await expect(editPanel).toBeHidden();
  await expect(deleteAction).toBeFocused();
  await expect(row).toBeVisible();

  await deleteAction.click();
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
  await expect(row).toHaveCount(0, { timeout: 10_000 });

  await page.goto(`/members?q=${encodeURIComponent(conflictName)}`);
  const conflictRow = page
    .getByTestId("members-list-row")
    .filter({ hasText: conflictName })
    .first();
  await expect(conflictRow).toBeVisible({ timeout: 10_000 });
  await expect(
    conflictRow.getByRole("button", { name: "Delete member" }),
  ).not.toHaveAttribute("aria-disabled", "true");
  await page.route(
    `/api/members/${conflictMember.member_id}`,
    async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.continue();
        return;
      }
      await route.fulfill({
        body: JSON.stringify({
          code: "conflict",
          message: "Member has active dependent records.",
        }),
        contentType: "application/json",
        status: 409,
      });
    },
  );
  await conflictRow.getByRole("button", { name: "Delete member" }).click();
  const conflictResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.startsWith("/api/members/") &&
      response.request().method() === "DELETE"
    );
  });
  await deleteDialog.getByRole("button", { name: "Delete member" }).click();
  expect((await conflictResponse).status()).toBe(409);
  await expect(deleteDialog.getByRole("alert")).toContainText(
    /active|depend|reference|could not/i,
  );
  await page.unroute(`/api/members/${conflictMember.member_id}`);
});

test("member row delete closes the matching open editor and leaves it open on Escape", async ({
  page,
}, testInfo) => {
  const member = await createMember(
    page,
    `E2E delete editor ${testInfo.project.name}${Date.now()}`,
  );

  await page.goto(`/members?q=${encodeURIComponent(member.name)}`);
  const row = page
    .getByTestId("members-list-row")
    .filter({ hasText: member.name })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "Edit member" }).click();
  const panel = page.getByRole("dialog", { name: "Edit member" });
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();

  await activateRowAction(page, row, "Delete member");
  const dialog = page.getByRole("alertdialog", { name: "Delete member" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(panel).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Delete member" }),
  ).toBeFocused();

  await activateRowAction(page, row, "Delete member");
  const deleteResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/members/${member.member_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await dialog.getByRole("button", { name: "Delete member" }).click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(panel).toBeHidden();
});

test("member delete affordances respect the API deleteability signal", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const blockedName = `E2E Blocked Member ${unique}`;
  const eligibleName = `E2E Eligible Member ${unique}`;
  const [blockedMember, eligibleMember, accounts, categories] =
    await Promise.all([
      createMember(page, blockedName),
      createMember(page, eligibleName),
      listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
      listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
    ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  const transactionResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "12.34",
        category_id: category.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-05-31",
        member_id: blockedMember.member_id,
        memo: `E2E member deleteability ${unique}`,
      },
    },
  );
  expect(transactionResponse.ok()).toBe(true);

  await page.goto(`/members?q=${encodeURIComponent(blockedName)}`);
  const blockedRow = page
    .getByTestId("members-list-row")
    .filter({ hasText: blockedName })
    .first();
  const blockedDelete = blockedRow.getByRole("button", {
    name: "Delete member",
  });
  await expect(blockedRow).toBeVisible({ timeout: 10_000 });
  await expect(blockedDelete).toHaveAttribute("aria-disabled", "true");
  await blockedDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Member has attributed records.",
  );
  await blockedDelete.click({ force: true });
  await expect(
    page.getByRole("alertdialog", { name: "Delete member" }),
  ).toBeHidden();
  await blockedDelete.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("alertdialog", { name: "Delete member" }),
  ).toBeHidden();

  await blockedRow.getByRole("button", { name: "Edit member" }).click();
  const blockedPanel = page.getByRole("dialog", { name: "Edit member" });
  const blockedPanelDelete = blockedPanel.getByRole("button", {
    name: "Delete",
  });
  await expect(blockedPanel).toBeVisible();
  await expect(blockedPanelDelete).toHaveAttribute("aria-disabled", "true");
  await blockedPanelDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Member has attributed records.",
  );
  await blockedPanelDelete.click({ force: true });
  await expect(
    page.getByRole("alertdialog", { name: "Delete member" }),
  ).toBeHidden();
  await blockedPanelDelete.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("alertdialog", { name: "Delete member" }),
  ).toBeHidden();
  await blockedPanel
    .getByRole("button", { name: "Close member panel" })
    .click();

  await page.goto(`/members?q=${encodeURIComponent(eligibleName)}`);
  const eligibleRow = page
    .getByTestId("members-list-row")
    .filter({ hasText: eligibleName })
    .first();
  const eligibleDelete = eligibleRow.getByRole("button", {
    name: "Delete member",
  });
  await expect(eligibleRow).toBeVisible({ timeout: 10_000 });
  await expect(eligibleDelete).not.toHaveAttribute("aria-disabled", "true");
  await eligibleDelete.click();
  const eligibleDialog = page.getByRole("alertdialog", {
    name: "Delete member",
  });
  await expect(eligibleDialog).toContainText(eligibleName);
  const deleteResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/members/${eligibleMember.member_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await eligibleDialog.getByRole("button", { name: "Delete member" }).click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(page.getByText("Member deleted.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(eligibleRow).toHaveCount(0, { timeout: 10_000 });
});

import { expect, type Locator, type Page, test } from "@playwright/test";

interface TagFixture {
  readonly fqn: string;
  readonly is_hidden: boolean;
  readonly name: string;
  readonly tag_id: number;
}

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly fqn: string;
}

interface TransactionFixture {
  readonly transaction_id: number;
}

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

test("tag row delete closes the matching open editor", async ({
  browserName,
  page,
}) => {
  const tag = await createTag(page, {
    fqn: `E2EDeleteOpen:${browserName}${Date.now()}`,
  });

  await page.goto(`/tags?q=${encodeURIComponent(tag.fqn)}`);
  const row = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: tag.fqn })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: "Edit tag" }).click();
  const panel = page.getByRole("dialog", { name: "Edit tag" });
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();

  await activateRowAction(page, row, "Delete tag");
  const dialog = page.getByRole("alertdialog", { name: "Delete tag" });
  const deleteResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/tags/${tag.tag_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await dialog.getByRole("button", { name: "Delete tag" }).click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(panel).toBeHidden();
});

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
  await page.getByRole("button", { name: "Open filters" }).click();
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
  await page.getByRole("button", { name: "Open filters" }).click();
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

test("tag delete row actions respect the API deleteability signal", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const blockedFqn = `E2EBlockedTag:${unique}`;
  const eligibleFqn = `E2EEligibleTag:${unique}`;
  const conflictFqn = `E2EConflictTag:${unique}`;
  const groupFqn = `E2ETagGroup:${unique}`;
  const [blockedTag, eligibleTag, conflictTag, , , accounts, categories] =
    await Promise.all([
      createTag(page, { fqn: blockedFqn }),
      createTag(page, { fqn: eligibleFqn }),
      createTag(page, { fqn: conflictFqn }),
      createTag(page, { fqn: `${groupFqn}:One` }),
      createTag(page, { fqn: `${groupFqn}:Two` }),
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
        memo: `E2E tag deleteability ${unique}`,
        tag_ids: [blockedTag.tag_id],
      },
    },
  );
  expect(transactionResponse.ok()).toBe(true);

  await page.goto(`/tags?q=${encodeURIComponent(blockedFqn)}`);
  const blockedRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: blockedFqn })
    .first();
  const blockedDelete = blockedRow.getByRole("button", {
    name: "Delete tag",
  });
  await expect(blockedRow).toBeVisible({ timeout: 10_000 });
  await expect(blockedDelete).toHaveAttribute("aria-disabled", "true");
  await blockedDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Tag has active dependent records.",
  );
  await blockedDelete.click({ force: true });
  await expect(
    page.getByRole("alertdialog", { name: "Delete tag" }),
  ).toBeHidden();
  await blockedDelete.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("alertdialog", { name: "Delete tag" }),
  ).toBeHidden();

  await page.goto(`/tags?q=${encodeURIComponent(groupFqn)}`);
  const groupRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: groupFqn })
    .first();
  await expect(groupRow).toBeVisible({ timeout: 10_000 });
  await expect(
    groupRow.getByRole("button", { name: "Delete tag" }),
  ).toHaveCount(0);

  await page.goto(`/tags?q=${encodeURIComponent(eligibleFqn)}`);
  const eligibleRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: eligibleFqn })
    .first();
  const eligibleDelete = eligibleRow.getByRole("button", {
    name: "Delete tag",
  });
  await expect(eligibleRow).toBeVisible({ timeout: 10_000 });
  await expect(eligibleDelete).not.toHaveAttribute("aria-disabled", "true");
  await eligibleDelete.click();
  const eligibleDialog = page.getByRole("alertdialog", {
    name: "Delete tag",
  });
  await expect(eligibleDialog).toContainText(eligibleFqn);
  await eligibleDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(eligibleDialog).toBeHidden();
  await expect(eligibleRow).toBeVisible();

  await eligibleDelete.click();
  const deleteResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/tags/${eligibleTag.tag_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await eligibleDialog.getByRole("button", { name: "Delete tag" }).click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(page.getByText("Tag deleted.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(eligibleRow).toHaveCount(0, { timeout: 10_000 });

  await page.goto(`/tags?q=${encodeURIComponent(conflictFqn)}`);
  const conflictRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: conflictFqn })
    .first();
  await expect(conflictRow).toBeVisible({ timeout: 10_000 });
  await page.route(`/api/tags/${conflictTag.tag_id}`, async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: "conflict",
          message: "Tag has active dependent records.",
        },
      }),
      contentType: "application/json",
      status: 409,
    });
  });
  await conflictRow.getByRole("button", { name: "Delete tag" }).click();
  const conflictDialog = page.getByRole("alertdialog", {
    name: "Delete tag",
  });
  const conflictResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/tags/${conflictTag.tag_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await conflictDialog.getByRole("button", { name: "Delete tag" }).click();
  expect((await conflictResponse).status()).toBe(409);
  await expect(conflictDialog.getByRole("alert")).toHaveText(
    "Tag has active dependent records.",
  );
  await page.unroute(`/api/tags/${conflictTag.tag_id}`);
});

test("tags side panel creates edits and deletes tags with conflict feedback", async ({
  browserName,
  page,
}) => {
  const unique = `${browserName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2EPanel:${unique}:Leaf`;
  const staleFqn = `E2EStaleDelete:${unique}`;

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
  await expect(createPanel).toBeHidden();

  await page.getByLabel("Search").fill(fqn);
  const createdRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: "Leaf" })
    .first();
  await expect(createdRow).toBeVisible({ timeout: 10_000 });
  await createdRow.getByRole("button", { name: "Edit tag" }).click();

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
  await hiddenRow.getByRole("button", { name: "Edit tag" }).click();
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
  await cashRow.getByRole("button", { name: "Edit tag" }).click();
  const cashPanel = page.getByRole("dialog", { name: "Edit tag" });
  const cashDelete = cashPanel.getByRole("button", { name: "Delete" });
  await expect(cashDelete).toHaveAttribute("aria-disabled", "true");
  await cashDelete.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Tag has active dependent records.",
  );
  await cashPanel.getByRole("button", { name: "Close tag panel" }).click();

  const [staleTag, accounts, categories] = await Promise.all([
    createTag(page, { fqn: staleFqn }),
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:Books");
  const category = findByFqn(categories, "Entertainment:Books");
  await page.goto(`/tags?q=${encodeURIComponent(staleFqn)}`);
  const staleRow = page
    .getByTestId("tags-tree-row")
    .filter({ hasText: staleFqn })
    .first();
  await expect(staleRow).toBeVisible({ timeout: 10_000 });
  await staleRow.getByRole("button", { name: "Edit tag" }).click();
  const stalePanel = page.getByRole("dialog", { name: "Edit tag" });
  const staleDelete = stalePanel.getByRole("button", { name: "Delete" });
  await expect(staleDelete).not.toHaveAttribute("aria-disabled", "true");

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
        memo: `E2E tag stale delete ${unique}`,
        tag_ids: [staleTag.tag_id],
      },
    },
  );
  expect(transactionResponse.ok()).toBe(true);
  const staleTransaction =
    (await transactionResponse.json()) as TransactionFixture;

  await staleDelete.click();
  const conflictDialog = page.getByRole("alertdialog", {
    name: "Delete tag",
  });
  const conflictResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/tags/${staleTag.tag_id}` &&
      response.request().method() === "DELETE"
    );
  });
  await conflictDialog.getByRole("button", { name: "Delete tag" }).click();
  expect((await conflictResponse).status()).toBe(409);
  await expect(conflictDialog.getByRole("alert")).toContainText(
    /active|depend|reference|could not/i,
  );

  const transactionDeleteResponse = await page.request.delete(
    `/api/transactions/${staleTransaction.transaction_id}`,
  );
  expect(transactionDeleteResponse.ok()).toBe(true);
  const tagDeleteResponse = await page.request.delete(
    `/api/tags/${staleTag.tag_id}`,
  );
  expect(tagDeleteResponse.ok()).toBe(true);
});

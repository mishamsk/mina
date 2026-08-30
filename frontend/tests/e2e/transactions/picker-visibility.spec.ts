import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  chooseOptionByKeyboard,
  createCategory,
  createMember,
  createSearchSpend,
  createTag,
  deleteTransaction,
  expect,
  findByFqn,
  formatLocalDate,
  hideCategory,
  hideMember,
  hideTag,
  listFixtures,
  type Locator,
  type Page,
  pickerSelectedLabel,
  waitForLedgerLookups,
} from "@tests/e2e/transactions/support";

const expectListboxAboveSelectedChips = async (
  page: Page,
  listbox: Locator,
  selectedChips: Locator,
) => {
  const [listboxBox, selectedBox, listboxId] = await Promise.all([
    listbox.boundingBox(),
    selectedChips.boundingBox(),
    listbox.getAttribute("id"),
  ]);
  expect(listboxBox).not.toBeNull();
  expect(selectedBox).not.toBeNull();
  expect(listboxId).not.toBeNull();
  const overlapLeft = Math.max(listboxBox!.x, selectedBox!.x);
  const overlapRight = Math.min(
    listboxBox!.x + listboxBox!.width,
    selectedBox!.x + selectedBox!.width,
  );
  const overlapTop = Math.max(listboxBox!.y, selectedBox!.y);
  const overlapBottom = Math.min(
    listboxBox!.y + listboxBox!.height,
    selectedBox!.y + selectedBox!.height,
  );
  expect(overlapRight).toBeGreaterThan(overlapLeft);
  if (overlapBottom <= overlapTop) {
    expect(
      listboxBox!.y + listboxBox!.height <= selectedBox!.y ||
        selectedBox!.y + selectedBox!.height <= listboxBox!.y,
    ).toBe(true);
    return;
  }
  expect(overlapBottom).toBeGreaterThan(overlapTop);
  const paintedElement = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return {
        className: element?.getAttribute("class"),
        closestListboxId: element?.closest('[role="listbox"]')?.id,
        tagName: element?.tagName,
        testId: element?.getAttribute("data-testid"),
      };
    },
    {
      x: overlapLeft + Math.min(4, (overlapRight - overlapLeft) / 2),
      y: overlapTop + Math.min(4, (overlapBottom - overlapTop) / 2),
    },
  );
  expect(paintedElement.closestListboxId, JSON.stringify(paintedElement)).toBe(
    listboxId,
  );
};

const expectActiveOptionVisible = async (
  combobox: Locator,
  listbox: Locator,
) => {
  await expect(combobox).toHaveAttribute("aria-activedescendant", /.+/);
  const comboboxId = await combobox.getAttribute("id");
  expect(comboboxId).not.toBeNull();
  const geometry = await listbox.evaluate((element, inputId) => {
    const input = document.getElementById(inputId);
    const activeId = input?.getAttribute("aria-activedescendant");
    const active = activeId ? document.getElementById(activeId) : null;
    const listboxRect = element.getBoundingClientRect();
    const activeRect = active?.getBoundingClientRect();
    return {
      activeBottom: activeRect?.bottom,
      activeTop: activeRect?.top,
      listboxBottom: listboxRect.bottom,
      listboxTop: listboxRect.top,
      viewportHeight: window.innerHeight,
    };
  }, comboboxId!);
  expect(geometry.activeTop).toBeGreaterThanOrEqual(geometry.listboxTop);
  expect(geometry.activeBottom).toBeLessThanOrEqual(geometry.listboxBottom);
  expect(geometry.listboxTop).toBeGreaterThanOrEqual(0);
  expect(geometry.listboxBottom).toBeLessThanOrEqual(geometry.viewportHeight);
};

test("multi-picker options paint above selected chips in edit and entry surfaces", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E picker layering ${unique}`;
  const [tags, transaction] = await Promise.all([
    Promise.all(
      Array.from({ length: 9 }, (_, index) =>
        createTag(
          page,
          `E2E:Layering:${unique}:Tag${index === 0 ? "Long".repeat(40) : index + 1}`,
        ),
      ),
    ),
    createSearchSpend(page, memo),
  ]);
  const tag = tags[0]!;
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Edit mode" }).click();
  await row.click();
  const dock = page.getByTestId("transaction-edit-dock");
  await dock.getByRole("button", { name: "Add / remove" }).click();
  await page.setViewportSize({ width: 700, height: 720 });
  const dockEditor = page.getByTestId("edit-dock-editor");
  const dockTags = dockEditor.getByRole("combobox", { name: "Tags to add" });
  await dockTags.fill(tag.fqn);
  await dockTags.press("Enter");
  const dockSelected = dockEditor.getByTestId("entity-multi-picker-selected");
  await expect(dockSelected).toContainText(tag.display_label);
  const selectedChip = dockSelected.locator(":scope > span").first();
  const removeTag = selectedChip.getByRole("button", {
    name: `Remove ${pickerSelectedLabel(tag)}`,
  });
  const [chipBox, editorBox, removeBox] = await Promise.all([
    selectedChip.boundingBox(),
    dockEditor.boundingBox(),
    removeTag.boundingBox(),
  ]);
  expect(chipBox).not.toBeNull();
  expect(editorBox).not.toBeNull();
  expect(removeBox).not.toBeNull();
  expect(chipBox!.x + chipBox!.width).toBeLessThanOrEqual(
    editorBox!.x + editorBox!.width,
  );
  expect(removeBox!.x + removeBox!.width).toBeLessThanOrEqual(
    editorBox!.x + editorBox!.width,
  );
  await dockTags.press("ArrowDown");
  const dockListbox = page.locator("#edit-dock-tags-options");
  await expect(dockListbox).toBeVisible();
  for (let index = 0; index < 7; index += 1) {
    await dockTags.press("ArrowDown");
  }
  await expectActiveOptionVisible(dockTags, dockListbox);
  await dockTags.press("Escape");
  await page.setViewportSize({ width: 1600, height: 1200 });
  await dockTags.press("ArrowDown");
  await expectListboxAboveSelectedChips(page, dockListbox, dockSelected);
  await dockTags.press("Escape");
  await dockEditor.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const spendPanel = page.getByRole("tabpanel", { name: "Spend" });
  const entryTags = spendPanel.getByRole("combobox", { name: "Tags" });
  await entryTags.fill(tag.fqn);
  await entryTags.press("Enter");
  const entrySelected = spendPanel.getByTestId("entity-multi-picker-selected");
  await expect(entrySelected).toContainText(tag.display_label);
  await entrySelected.scrollIntoViewIfNeeded();
  await entryTags.press("ArrowDown");
  const entryListbox = page.locator("#spend-tags-options");
  await expect(entryListbox).toBeVisible();
  await expectListboxAboveSelectedChips(page, entryListbox, entrySelected);
  await entryTags.press("Escape");
  await page.keyboard.press("Escape");
  await deleteTransaction(page, transaction);
});

test("edit dock and broader pickers expose explicit hidden-entity controls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const hiddenTagFqn = `E2E:Hidden:${unique}:QuietTag`;
  const hiddenCategoryFqn = `E2E:Hidden:${unique}:QuietCategory`;
  const hiddenMemberName = `E2E Hidden Member ${unique}`;
  const [hiddenTag, hiddenCategory, hiddenMember] = await Promise.all([
    createTag(page, hiddenTagFqn),
    createCategory(page, hiddenCategoryFqn, "expense"),
    createMember(page, hiddenMemberName),
  ]);

  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E hidden tag ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "8.42",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: formatLocalDate(new Date()),
      memo,
      tag_ids: [hiddenTag.tag_id],
    },
  });
  expect(spendResponse.ok()).toBe(true);
  await Promise.all([
    hideTag(page, hiddenTag),
    hideCategory(page, hiddenCategory),
    hideMember(page, hiddenMember),
  ]);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const hiddenTagRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(hiddenTagRow).toBeVisible();
  await expect(
    hiddenTagRow
      .locator(".transactions-tags-column")
      .getByText("QuietTag", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit mode" }).click();
  await hiddenTagRow.click();
  const dock = page.getByTestId("transaction-edit-dock");
  await dock.getByRole("button", { name: "Choose category" }).click();
  let editor = page.getByTestId("edit-dock-editor");
  const includeHidden = editor.getByRole("checkbox", {
    name: "Include hidden",
  });
  await expect(includeHidden).toBeVisible();
  const categoryPicker = editor.getByRole("combobox", { name: "Category" });
  await categoryPicker.fill("QuietCategory");
  await expect(page.locator("#edit-dock-category-options")).toContainText(
    "No matches",
  );
  await includeHidden.click();
  await categoryPicker.focus();
  await expect(page.locator("#edit-dock-category-options")).toContainText(
    "QuietCategory",
  );
  await categoryPicker.press("Escape");
  await editor.getByRole("button", { name: "Cancel" }).click();

  await dock.getByRole("button", { name: "Add / remove" }).click();
  editor = page.getByTestId("edit-dock-editor");
  const tagsPicker = editor.getByRole("combobox", { name: "Tags to add" });
  await tagsPicker.fill("QuietTag");
  await expect(page.locator("#edit-dock-tags-options")).toContainText(
    "No matches",
  );
  await editor.getByRole("checkbox", { name: "Include hidden" }).click();
  await tagsPicker.focus();
  await expect(page.locator("#edit-dock-tags-options")).toContainText(
    "QuietTag",
  );
  await tagsPicker.press("Escape");
  await editor.getByRole("button", { name: "Cancel" }).click();

  await dock.getByRole("button", { name: "Set / clear" }).click();
  editor = page.getByTestId("edit-dock-editor");
  const memberPicker = editor.getByRole("combobox", { name: "Member" });
  await memberPicker.fill(hiddenMemberName);
  await expect(page.locator("#edit-dock-member-options")).toContainText(
    "No matches",
  );
  await editor.getByRole("checkbox", { name: "Include hidden" }).click();
  await memberPicker.focus();
  await expect(page.locator("#edit-dock-member-options")).toContainText(
    hiddenMemberName,
  );
  await memberPicker.press("Escape");
  await editor.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  const includeHiddenToggle = page.getByRole("checkbox", {
    name: "Include hidden",
  });
  await expect(
    page.getByRole("combobox", { name: "Filter operator" }),
  ).toBeFocused();
  const filterTagsPicker = page.getByRole("combobox", { name: "Tags" });
  await filterTagsPicker.fill("QuietTag");
  await expect(filterTagsPicker).toHaveValue("QuietTag");
  await expect(filterTagsPicker).toBeFocused();
  await expect(filterTagsPicker).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    "No matches",
  );
  await expect(includeHiddenToggle).toBeVisible();
  await includeHiddenToggle.click();
  await expect(includeHiddenToggle).toBeChecked();
  await filterTagsPicker.focus();
  await expect(filterTagsPicker).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#transactions-filter-tag-options")).toContainText(
    "QuietTag",
  );
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Close filters" }).click();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const entryTagsPicker = page.getByRole("combobox", { name: "Tags" });
  await expect(entryTagsPicker).toBeVisible();
  await expect(entryTagsPicker).toBeEnabled();
  await entryTagsPicker.fill("QuietTag");
  await expect(entryTagsPicker).toHaveValue("QuietTag");
  await expect(
    page
      .locator("#spend-tags-options")
      .getByRole("option", { name: "Create QuietTag" }),
  ).toBeVisible();
});

test("entry category picker requests spend context and excludes hidden categories", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const hiddenCategoryFqn = `E2E:Hidden:${unique}:QuietSpendCategory${unique}`;
  const visibleCategoryFqn = `E2E:Visible:${unique}:PickerSpendCategory${unique}`;
  const visibleCategory = await createCategory(
    page,
    visibleCategoryFqn,
    "expense",
  );
  const hiddenCategory = await createCategory(
    page,
    hiddenCategoryFqn,
    "expense",
  );

  const [accounts] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const memo = `E2E hidden category ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "9.13",
      category_id: hiddenCategory.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: formatLocalDate(new Date()),
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  await hideCategory(page, hiddenCategory);

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const hiddenCategoryRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(hiddenCategoryRow).toBeVisible();
  await expect(
    hiddenCategoryRow.getByText(hiddenCategory.name, { exact: true }),
  ).toBeVisible();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const categoryPicker = page.getByRole("combobox", { name: "Category" });
  const categoryRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/categories/search" &&
      url.searchParams.get("context") === "shorthand_expense"
    );
  });

  await categoryPicker.focus();

  const categoryRequest = await categoryRequestPromise;
  const categoryRequestUrl = new URL(categoryRequest.url());
  expect(categoryRequestUrl.searchParams.get("context")).toBe(
    "shorthand_expense",
  );
  expect(categoryRequestUrl.searchParams.has("include_hidden")).toBe(false);

  const spendPanel = page.getByRole("tabpanel", { name: "Spend" });
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
    {
      scope: spendPanel,
    },
  );
  await categoryPicker.fill(visibleCategory.name);
  await expect(
    page
      .locator("#spend-merchant-0-category-options")
      .getByRole("option")
      .filter({ hasText: visibleCategory.name })
      .first(),
  ).toBeVisible();

  await categoryPicker.fill("Salary");
  await expect(
    page.locator("#spend-merchant-0-category-options"),
  ).toContainText("Create “Salary”");

  await categoryPicker.fill(hiddenCategory.name);
  await expect(
    page.locator(
      `#spend-merchant-0-category-option-${hiddenCategory.category_id}`,
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", {
      name: `Create ${hiddenCategory.name}`,
    }),
  ).toBeVisible();
});

test("member pickers keep colon-containing names flat", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const member = await createMember(page, `Household:${slug}${Date.now()}`);

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=25");
  await ledgerLookups;
  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Member" }).click();

  const memberPicker = page.getByRole("combobox", { name: "Members" });
  const memberOptions = page.locator("#transactions-filter-member-options");
  await memberPicker.fill("Household:");
  await expect(memberOptions).toHaveAttribute("data-picker-mode", "search");
  await expect(
    page.getByTestId("transactions-filter-member-breadcrumb"),
  ).toHaveCount(0);
  await expect(
    memberOptions.getByRole("option", { name: member.name }),
  ).toBeVisible();

  await memberPicker.fill(member.name);
  await expect(page.getByTestId("entity-multi-picker-selected")).toContainText(
    member.name,
  );
  await expect(memberPicker).toHaveValue("");
});

test("filter editors do not inherit hidden choices from other chips", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [hiddenCategory, visibleCategory] = await Promise.all([
    createCategory(page, `E2E:HiddenOtherChip:${unique}:Hidden`, "expense"),
    createCategory(page, `E2E:HiddenOtherChip:${unique}:Visible`, "expense"),
  ]);
  await hideCategory(page, hiddenCategory);
  const filter = `category:"${hiddenCategory.fqn}" and not category:"${visibleCategory.fqn}"`;
  const lookups = waitForLedgerLookups(page);
  await page.goto(`/transactions?filter=${encodeURIComponent(filter)}`);
  await lookups;

  await page
    .getByRole("button", {
      name: `Edit Category ${pickerSelectedLabel(visibleCategory)} · none of`,
    })
    .click();
  const picker = page.getByRole("combobox", { name: "Categories" });
  const options = page.locator(
    "#transactions-filter-row-0-category-none-options",
  );
  await picker.fill(hiddenCategory.display_label);
  await expect(options).toContainText("No matches");

  await page.getByRole("checkbox", { name: "Include hidden" }).click();
  await picker.focus();
  await expect(options).toContainText(hiddenCategory.display_label);
});

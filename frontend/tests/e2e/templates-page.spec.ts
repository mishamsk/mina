import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface TemplateFixture {
  readonly transaction_template_id: number;
  readonly fqn: string;
}

const createTemplate = async (
  page: Page,
  fqn: string,
  records: readonly Record<string, unknown>[],
): Promise<TemplateFixture> => {
  const response = await page.request.post("/api/transaction-templates", {
    data: { fqn, records },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as TemplateFixture;
};

const deleteTemplate = async (
  page: Page,
  templateId: number,
): Promise<void> => {
  const response = await page.request.delete(
    `/api/transaction-templates/${templateId}`,
  );
  expect(response.ok(), await response.text()).toBe(true);
};

const openPalette = async (page: Page): Promise<void> => {
  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("combobox", { name: "Command search" }),
  ).toBeFocused();
};

const postFixture = async <T>(
  page: Page,
  path: string,
  data: Record<string, unknown>,
): Promise<T> => {
  const response = await page.request.post(path, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
};

const choosePickerOption = async (
  page: Page,
  dialog: Locator,
  label: string,
  query: string,
  optionText: string,
  hidden = false,
): Promise<void> => {
  const displayTitle = optionText.split(":").slice(-2).join(":");
  const picker = dialog.getByRole("combobox", { name: label });
  await picker.fill(query);
  await picker.press("ArrowDown");
  const option = page
    .getByRole("option")
    .filter({ hasText: displayTitle })
    .first();
  await expect(option).toBeVisible();
  if (hidden) {
    await expect(option.getByLabel("Hidden")).toBeVisible();
  }
  await option.click();
};

test("templates navigation manages hierarchy and refreshes consumers", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const oldGroup = `E2E:${unique}:Utilities`;
  const newGroup = `E2E:${unique}:Bills`;
  const electricityFqn = `${oldGroup}:Electricity`;
  const gasFqn = `${oldGroup}:Gas`;
  const movedElectricityFqn = `${newGroup}:Electricity`;
  await createTemplate(page, electricityFqn, [
    {
      amount: "42.50000000",
      currency: "USD",
      memo: `Electricity ${unique}`,
      tag_ids: [],
    },
  ]);
  const gas = await createTemplate(page, gasFqn, [
    { currency: "USD", memo: `Gas ${unique}`, tag_ids: [] },
    { amount: "-9.25000000", tag_ids: [] },
  ]);

  await page.goto("/overview");
  const templatesNav = page
    .getByLabel("Primary")
    .getByRole("link", { name: "Templates" });
  await expect(templatesNav).toHaveAttribute("href", "/templates");

  await openPalette(page);
  await page
    .getByRole("combobox", { name: "Command search" })
    .fill("Templates");
  await page.getByRole("option", { exact: true, name: "Templates" }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();

  const electricityRow = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: electricityFqn });
  const gasRow = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: gasFqn });
  await expect(electricityRow).toContainText(
    "1 record · 0 accounts · 1 amount",
  );
  await expect(gasRow).toContainText("2 records · 0 accounts · 1 amount");
  await expect(electricityRow.locator(".row-actions")).toHaveAttribute(
    "data-row-actions-count",
    "7",
  );
  await expect(
    electricityRow.locator(".row-actions-buttons > span[aria-hidden='true']"),
  ).toHaveCount(2);

  await gasRow.click();
  let editEditor = page.getByRole("dialog", { name: "Edit template" });
  await expect(editEditor.getByLabel("Template FQN")).toHaveValue(gasFqn);
  await editEditor.getByRole("button", { name: "Cancel" }).click();
  await expect(gasRow).toBeFocused();

  await electricityRow.focus();
  await electricityRow.press("Enter");
  editEditor = page.getByRole("dialog", { name: "Edit template" });
  await expect(editEditor.getByLabel("Template FQN")).toHaveValue(
    electricityFqn,
  );
  await editEditor.getByRole("button", { name: "Cancel" }).click();
  await expect(electricityRow).toBeFocused();

  const search = page.getByRole("searchbox", { name: "Search" });
  await search.fill(gasFqn);
  await expect(gasRow).toBeVisible();
  await expect(electricityRow).toHaveCount(0);
  await search.fill("");

  const useElectricity = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: electricityFqn })
    .getByRole("button", { name: "Use template" });
  await useElectricity.click();
  const entryModal = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(entryModal).toBeVisible();
  await expect(entryModal.getByLabel("Start from a template")).toHaveValue("");
  await expect(
    entryModal.getByRole("tab", { name: "Advanced" }),
  ).toHaveAttribute("aria-selected", "true");
  await entryModal
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await expect(entryModal).toHaveCount(0);
  await expect(useElectricity).toBeFocused();

  const createRecurring = electricityRow.getByRole("button", {
    name: "Create recurring",
  });
  await createRecurring.click();
  const recurringEditor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await expect(recurringEditor).toBeVisible();
  const recurringRecords = recurringEditor
    .getByLabel("Definition records")
    .locator("section");
  await expect(recurringRecords).toHaveCount(1);
  await expect(recurringRecords.getByLabel("Account")).toHaveValue("");
  await expect(recurringRecords.getByLabel("Amount")).toHaveValue(
    "42.50000000",
  );
  await expect(recurringRecords.getByLabel("Currency")).toHaveValue("USD");
  await expect(recurringRecords.getByLabel("Memo")).toHaveValue(
    `Electricity ${unique}`,
  );
  await recurringEditor
    .getByLabel("Definition FQN")
    .fill(`E2E:${unique}:Recurring`);
  const saveDefinition = recurringEditor.getByRole("button", {
    name: "Save definition",
  });
  await expect(saveDefinition).toBeEnabled();
  await saveDefinition.click();
  await expect(recurringEditor).toContainText(
    "At least two records are required.",
  );
  await expect(recurringEditor).toContainText("Account is required.");
  await page.setViewportSize({ height: 900, width: 600 });
  await expect(createRecurring).toBeHidden();
  await recurringEditor
    .getByRole("button", { name: "Close definition editor" })
    .click();
  await expect(
    electricityRow.getByRole("button", { name: "More row actions" }),
  ).toBeFocused();
  await page.setViewportSize({ height: 720, width: 1280 });

  const groupRow = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: oldGroup })
    .first();
  await groupRow.getByRole("button", { name: "Move or rename" }).click();
  const restructure = page.getByRole("dialog", { name: "Move or rename" });
  await expect(restructure.getByLabel("To")).toBeFocused();
  await restructure.getByLabel("To").fill(newGroup);
  await restructure.getByRole("button", { name: "Move" }).click();
  await expect(page.getByText("Moved 2 templates.")).toBeVisible();
  await expect(
    page
      .getByTestId("templates-tree-row")
      .filter({ hasText: movedElectricityFqn }),
  ).toBeVisible();
  await expect(electricityRow).toHaveCount(0);

  await openPalette(page);
  await page
    .getByRole("combobox", { name: "Command search" })
    .fill(movedElectricityFqn);
  await expect(
    page.getByRole("option", { name: `Use ${movedElectricityFqn}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: `Use ${electricityFqn}` }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  const movedElectricityRow = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: movedElectricityFqn });
  await movedElectricityRow
    .getByRole("button", { name: "Delete template" })
    .click();
  const deleteDialog = page.getByRole("alertdialog", {
    name: "Delete template",
  });
  await expect(deleteDialog).toContainText(movedElectricityFqn);
  await deleteDialog.getByRole("button", { name: "Delete template" }).click();
  await expect(movedElectricityRow).toHaveCount(0);
  await expect(search).toBeFocused();

  await openPalette(page);
  await page
    .getByRole("combobox", { name: "Command search" })
    .fill(movedElectricityFqn);
  await expect(
    page.getByRole("option", { name: `Use ${movedElectricityFqn}` }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await deleteTemplate(page, gas.transaction_template_id);
});

test("template recurring focus follows responsive action placement", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Responsive recurring focus`;
  const template = await createTemplate(page, fqn, [
    { amount: "1.00", currency: "USD", tag_ids: [] },
  ]);
  await page.setViewportSize({ height: 900, width: 600 });
  await page.goto("/templates");
  const row = page.getByTestId("templates-tree-row").filter({ hasText: fqn });
  await row.getByRole("button", { name: "More row actions" }).click();
  await page
    .locator(".row-actions-menu:visible")
    .getByRole("button", { exact: true, name: "Create recurring" })
    .click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await expect(editor).toBeVisible();

  await page.setViewportSize({ height: 720, width: 1280 });
  const directAction = row.getByRole("button", { name: "Create recurring" });
  await expect(directAction).toBeVisible();
  await editor.getByRole("button", { name: "Close definition editor" }).click();

  await expect(editor).toBeHidden();
  await expect(directAction).toBeFocused();
  await deleteTemplate(page, template.transaction_template_id);
});

test("cold recurring launch keeps seeded picker references while lookups load", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const accountFqn = `e2e:${unique}:Cold recurring account`;
  const memberName = `E2E Cold Recurring ${unique}`;
  const account = await postFixture<{ account_id: number }>(
    page,
    "/api/accounts",
    {
      account_type: "owned",
      currency: "USD",
      fqn: accountFqn,
      is_hidden: false,
    },
  );
  const member = await postFixture<{ member_id: number }>(
    page,
    "/api/members",
    { name: memberName },
  );
  const template = await createTemplate(
    page,
    `E2E:${unique}:Cold recurring template`,
    [
      {
        account_id: account.account_id,
        member_id: member.member_id,
        tag_ids: [],
      },
    ],
  );
  let releaseAccounts!: () => void;
  const accountsReleased = new Promise<void>((resolve) => {
    releaseAccounts = resolve;
  });
  await page.route("**/api/accounts?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("include_tombstoned") === "true") {
      await accountsReleased;
    }
    await route.continue();
  });

  await page.goto("/templates");
  const row = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: `E2E:${unique}:Cold recurring template` });
  await row.getByRole("button", { name: "Create recurring" }).click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  const accountPicker = editor.getByLabel("Account");
  const accountLabel = `${unique}:Cold recurring account`;
  await expect(accountPicker).toHaveValue(accountLabel);
  await expect(editor.getByLabel("Member")).toHaveValue(memberName);
  await accountPicker.focus();
  releaseAccounts();
  await expect(accountPicker).toHaveValue(accountLabel);
  await expect(editor.getByLabel("Member")).toHaveValue(memberName);
  await expect(accountPicker).toBeFocused();

  await deleteTemplate(page, template.transaction_template_id);
});

test("recurring drafts can clear invalid non-flow template categories", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const account = await postFixture<{ account_id: number }>(
    page,
    "/api/accounts",
    {
      account_type: "owned",
      currency: "USD",
      fqn: `e2e:${unique}:Non-flow account`,
      is_hidden: false,
    },
  );
  const categoryFqn = `E2E:${unique}:Invalid category default`;
  const category = await postFixture<{ category_id: number }>(
    page,
    "/api/categories",
    { economic_intent: "expense", fqn: categoryFqn },
  );
  const templateFqn = `E2E:${unique}:Invalid recurring defaults`;
  const template = await createTemplate(page, templateFqn, [
    {
      account_id: account.account_id,
      amount: "1.00",
      category_id: category.category_id,
      currency: "USD",
      tag_ids: [],
    },
  ]);

  await page.goto("/templates");
  const row = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: templateFqn });
  await row.getByRole("button", { name: "Create recurring" }).click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await expect(editor.getByText(categoryFqn, { exact: true })).toBeVisible();
  await editor.getByLabel("Show full category path").hover();
  await expect(page.getByRole("tooltip")).toHaveText(categoryFqn);
  await page.mouse.move(0, 0);
  await editor.getByRole("button", { name: "Save definition" }).click();
  await expect(
    editor.getByText("Only flow records can have a category."),
  ).toBeVisible();

  await editor.getByRole("button", { name: "Clear category" }).click();
  await expect(editor.getByText(categoryFqn, { exact: true })).toBeHidden();
  await editor.getByRole("button", { name: "Save definition" }).click();
  await expect(
    editor.getByText("Only flow records can have a category."),
  ).toBeHidden();

  await editor.getByRole("button", { name: "Close definition editor" }).click();
  await deleteTemplate(page, template.transaction_template_id);
});

test("template editor creates and replaces partial defaults without balance validation", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Partial defaults`;
  const conflictFqn = `E2E:${unique}:Existing`;
  const accountFqn = `e2e:${unique}:Hidden cash`;
  const categoryFqn = `E2E:${unique}:Expense`;
  const tagFqn = `E2E:${unique}:Review`;
  const memberName = `E2E ${unique} Member ${"long flat name ".repeat(16).trim()}`;
  await postFixture<{ account_id: number }>(page, "/api/accounts", {
    account_type: "owned",
    currency: "USD",
    fqn: accountFqn,
    is_hidden: false,
  });
  await postFixture<{ category_id: number }>(page, "/api/categories", {
    economic_intent: "expense",
    fqn: categoryFqn,
  });
  await postFixture<{ tag_id: number }>(page, "/api/tags", {
    fqn: tagFqn,
    is_hidden: false,
  });
  await postFixture<{ member_id: number }>(page, "/api/members", {
    name: memberName,
  });
  await createTemplate(page, conflictFqn, [{}]);

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/templates");
  const newTemplateButton = page.getByRole("button", { name: "New template" });
  await newTemplateButton.click();
  const editor = page.getByRole("dialog", { name: "New template" });
  await expect
    .poll(async () =>
      editor.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(1200);
  await expect
    .poll(async () =>
      editor.evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBe(836);
  const fqnField = editor.getByLabel("Template FQN");
  await expect(fqnField).toBeFocused();
  for (const label of [
    "Template FQN",
    "Amount (optional)",
    "Currency (optional)",
    "Memo (optional)",
  ]) {
    const control = editor.getByLabel(label).first();
    await expect(control).toHaveCSS("border-top-width", "2px");
    await expect(control).not.toHaveCSS("box-shadow", "none");
  }
  await fqnField.fill("Bad:");
  await editor.getByLabel("Amount (optional)").first().focus();
  await expect(
    editor.getByText(
      "Enter a colon-separated template path with no empty segments.",
    ),
  ).toBeVisible();
  await fqnField.fill(conflictFqn);

  await page.keyboard.press("Escape");
  const discardDialog = page.getByRole("alertdialog", {
    name: "Discard template changes?",
  });
  await expect(discardDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(discardDialog).toHaveCount(0);
  await expect(editor).toBeVisible();
  await expect(fqnField).toHaveValue(conflictFqn);
  await expect(fqnField).toBeFocused();

  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(discardDialog).toBeVisible();
  await discardDialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(discardDialog).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Cancel" })).toBeFocused();

  const accountPicker = editor.getByRole("combobox", {
    name: "Account (optional)",
  });
  await accountPicker.fill(unique);
  await expect(
    page.getByRole("option").filter({ hasText: `${unique}:Hidden cash` }),
  ).toBeVisible();
  const accountOption = page
    .getByRole("option")
    .filter({ hasText: `${unique}:Hidden cash` })
    .first();
  const accountDisplayTitle = accountOption.getByTestId(
    "entity-picker-display-title",
  );
  await expect(accountDisplayTitle).toHaveText(`${unique}:Hidden cash`);
  await expect(accountOption).toContainText("owned · USD · Single-currency");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("option").filter({ hasText: `${unique}:Hidden cash` }),
  ).toHaveCount(0);
  await expect(editor).toBeVisible();

  await choosePickerOption(
    page,
    editor,
    "Account (optional)",
    unique,
    accountFqn,
  );
  await choosePickerOption(
    page,
    editor,
    "Category (optional)",
    unique,
    categoryFqn,
  );
  await editor.getByLabel("Amount (optional)").fill("10");
  await editor.getByLabel("Currency (optional)").fill("c::btc");
  await choosePickerOption(page, editor, "Tags (optional)", unique, tagFqn);
  const memberPicker = editor.getByRole("combobox", {
    name: "Member (optional)",
  });
  await memberPicker.fill(unique);
  const memberOption = page
    .getByRole("option")
    .filter({ hasText: memberName })
    .first();
  await expect(memberOption).toBeVisible();
  const memberLabel = memberOption.getByText(memberName, { exact: true });
  await expect
    .poll(() =>
      memberLabel.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    )
    .toBe(true);
  await page.keyboard.down("Meta");
  await expect(page.getByRole("tooltip")).toHaveText(memberName);
  await page.keyboard.up("Meta");
  await memberOption.click();
  await editor.getByLabel("Memo (optional)").fill(`Initial ${unique}`);
  await editor.getByRole("button", { name: "Add record" }).click();
  const records = editor.getByLabel("Template records").locator("section");
  const secondRecord = records.nth(1);
  await secondRecord.getByLabel("Amount (optional)").fill("0");
  await secondRecord.getByLabel("Memo (optional)").fill(`Second ${unique}`);
  await expect(
    secondRecord.getByText("Enter a signed non-zero amount"),
  ).toBeVisible();
  await expect(fqnField).toHaveValue(conflictFqn);
  await secondRecord.getByLabel("Amount (optional)").fill("-1.25");
  await secondRecord.getByLabel("Currency (optional)").fill("US");
  await secondRecord.getByLabel("Memo (optional)").focus();
  await expect(
    secondRecord.getByText("Use a 3-letter code or C:: crypto code"),
  ).toBeVisible();
  await secondRecord.getByLabel("Currency (optional)").fill("");

  const conflictResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });
  await editor.getByRole("button", { name: "Create template" }).click();
  expect((await conflictResponsePromise).status()).toBe(409);
  await expect(editor.getByRole("alert")).toContainText("transaction template");
  await expect(secondRecord.getByLabel("Memo (optional)")).toHaveValue(
    `Second ${unique}`,
  );
  await fqnField.fill(fqn);

  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });
  await editor.getByRole("button", { name: "Create template" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as TemplateFixture & {
    readonly records: readonly Record<string, unknown>[];
  };
  expect(created.records).toHaveLength(2);
  expect(created.records[0]).toMatchObject({ currency: "C::BTC" });
  await expect(editor).toHaveCount(0);
  await expect(newTemplateButton).toBeFocused();

  const row = page.getByTestId("templates-tree-row").filter({ hasText: fqn });
  await expect(row).toContainText("2 records · 1 account · 2 amounts");
  await openPalette(page);
  await page.getByRole("combobox", { name: "Command search" }).fill(fqn);
  await expect(page.getByRole("option", { name: `Use ${fqn}` })).toBeVisible();
  await page.keyboard.press("Escape");

  const editButton = row.getByRole("button", { name: "Edit template" });
  await editButton.click();
  const editEditor = page.getByRole("dialog", { name: "Edit template" });
  const editFqnField = editEditor.getByLabel("Template FQN");
  await expect(editFqnField).toHaveAttribute("readonly", "");
  await expect(editFqnField).toHaveCSS(
    "background-color",
    "rgb(243, 239, 251)",
  );
  const editRecords = editEditor
    .getByLabel("Template records")
    .locator("section");
  const firstEditRecord = editRecords.nth(0);
  const clearTarget = editEditor.getByRole("heading", {
    name: "Partial record defaults",
  });
  for (const label of [
    "Account (optional)",
    "Category (optional)",
    "Member (optional)",
  ]) {
    await firstEditRecord.getByRole("combobox", { name: label }).fill("");
    await clearTarget.click();
  }
  await firstEditRecord
    .getByRole("button", { name: `Remove ${tagFqn} (${unique}:Review)` })
    .click();
  await firstEditRecord.getByLabel("Amount (optional)").fill("");
  await firstEditRecord.getByLabel("Currency (optional)").fill("");
  await firstEditRecord.getByLabel("Memo (optional)").fill("");
  const updatedMemo = `Updated ${unique}`;
  await editRecords.nth(1).getByLabel("Memo (optional)").fill(updatedMemo);

  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname ===
        `/api/transaction-templates/${created.transaction_template_id}` &&
      response.request().method() === "PUT"
    );
  });
  await editEditor.getByRole("button", { name: "Save template" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as {
    readonly records: readonly {
      readonly account_id: number | null;
      readonly amount: string | null;
      readonly category_id: number | null;
      readonly currency: string | null;
      readonly member_id: number | null;
      readonly memo: string | null;
      readonly tag_ids: readonly number[];
    }[];
  };
  expect(replaced.records[0]).toMatchObject({
    account_id: null,
    amount: null,
    category_id: null,
    currency: null,
    member_id: null,
    memo: null,
    tag_ids: [],
  });
  await expect(editEditor).toHaveCount(0);
  await expect(editButton).toBeFocused();

  await row.getByRole("button", { name: "Use template" }).click();
  const entryModal = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(entryModal.getByLabel("Start from a template")).toHaveValue("");
  await expect(entryModal.getByLabel("Record 1 amount")).toHaveValue("");
  await expect(entryModal.getByLabel("Record 1 account")).toHaveValue("");
  await expect(entryModal.getByLabel("Record 2 memo")).toHaveValue(updatedMemo);
  await entryModal
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await expect(entryModal).toHaveCount(0);

  await deleteTemplate(page, created.transaction_template_id);
});

test("template editor rejects uncommitted optional picker searches", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Uncommitted searches`;
  const accountFqn = `e2e:${unique}:Cash`;
  const categoryFqn = `E2E:${unique}:Category`;
  const tagFqn = `E2E:${unique}:Tag`;
  const memberName = `E2E ${unique} Member`;
  await Promise.all([
    postFixture(page, "/api/accounts", {
      account_type: "owned",
      currency: "USD",
      fqn: accountFqn,
      is_hidden: false,
    }),
    postFixture(page, "/api/categories", {
      economic_intent: "expense",
      fqn: categoryFqn,
    }),
    postFixture(page, "/api/tags", {
      fqn: tagFqn,
      is_hidden: false,
    }),
    postFixture(page, "/api/members", { name: memberName }),
  ]);

  await page.goto("/templates");
  await page
    .locator("header")
    .getByRole("button", { name: "New template" })
    .click();
  const editor = page.getByRole("dialog", { name: "New template" });
  await editor.getByLabel("Template FQN").fill(fqn);
  const createButton = editor.getByRole("button", {
    name: "Create template",
  });
  for (const [label, message] of [
    ["Account (optional)", "Select an account or clear the search text."],
    ["Category (optional)", "Select a category or clear the search text."],
    ["Tags (optional)", "Select a tag or clear the search text."],
    ["Member (optional)", "Select a member or clear the search text."],
  ] as const) {
    const picker = editor.getByRole("combobox", { name: label });
    await picker.fill(unique);
    await expect(page.getByRole("option").first()).toBeVisible();
    await editor.getByLabel("Template FQN").focus();
    await expect(editor.getByText(message)).toBeVisible();
    await picker.fill("");
  }

  const tagPicker = editor.getByRole("combobox", { name: "Tags (optional)" });
  await tagPicker.fill(tagFqn);
  await expect(tagPicker).toHaveValue("");
  await expect(
    editor.getByTestId("entity-multi-picker-selected"),
  ).toContainText(tagFqn.split(":").slice(-2).join(":"));

  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });
  await createButton.click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const template = (await createResponse.json()) as TemplateFixture;
  await deleteTemplate(page, template.transaction_template_id);
});

test("partial income and refund templates project flow amounts", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const destination = await postFixture<{ account_id: number }>(
    page,
    "/api/accounts",
    {
      account_type: "owned",
      currency: "USD",
      fqn: `e2e:${unique}:Destination`,
      is_hidden: false,
    },
  );
  const incomeSource = await postFixture<{ account_id: number }>(
    page,
    "/api/accounts",
    {
      account_type: "flow",
      currency: null,
      fqn: `e2e:${unique}:Income source`,
      is_hidden: false,
    },
  );
  const merchant = await postFixture<{ account_id: number }>(
    page,
    "/api/accounts",
    {
      account_type: "flow",
      currency: null,
      fqn: `e2e:${unique}:Merchant`,
      is_hidden: false,
    },
  );
  const incomeCategory = await postFixture<{ category_id: number }>(
    page,
    "/api/categories",
    {
      economic_intent: "income",
      fqn: `E2E:${unique}:Income`,
    },
  );
  const expenseCategory = await postFixture<{ category_id: number }>(
    page,
    "/api/categories",
    {
      economic_intent: "expense",
      fqn: `E2E:${unique}:Expense`,
    },
  );
  const incomeFqn = `E2E:${unique}:Partial income`;
  const refundFqn = `E2E:${unique}:Partial refund`;
  const income = await createTemplate(page, incomeFqn, [
    {
      account_id: incomeSource.account_id,
      amount: "-45",
      category_id: incomeCategory.category_id,
      currency: "USD",
      tag_ids: [],
    },
    {
      account_id: destination.account_id,
      amount: null,
      currency: "USD",
      tag_ids: [],
    },
  ]);
  const refund = await createTemplate(page, refundFqn, [
    {
      account_id: merchant.account_id,
      amount: "-12",
      category_id: expenseCategory.category_id,
      currency: "USD",
      tag_ids: [],
    },
    {
      account_id: destination.account_id,
      amount: null,
      currency: "USD",
      tag_ids: [],
    },
  ]);

  await page.goto("/transactions");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const templatePicker = editor.getByRole("combobox", {
    name: "Start from a template",
  });
  await editor.getByRole("tab", { name: "Income" }).click();
  await templatePicker.fill(incomeFqn);
  await templatePicker.press("Enter");
  await expect(editor.getByLabel("Amount")).toHaveValue("45");

  await editor.getByRole("button", { name: "Clear draft" }).click();
  await page
    .getByRole("alertdialog", { name: "Clear entry draft?" })
    .getByRole("button", { name: "Clear draft" })
    .click();
  await editor.getByRole("tab", { name: "Refund" }).click();
  await templatePicker.fill(refundFqn);
  await templatePicker.press("Enter");
  await expect(editor.getByLabel("Amount")).toHaveValue("12");

  await deleteTemplate(page, income.transaction_template_id);
  await deleteTemplate(page, refund.transaction_template_id);
});

test("successful template moves restore focus before refresh settles", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fromFqn = `E2E:${unique}:Before`;
  const toFqn = `E2E:${unique}:After`;
  const template = await createTemplate(page, fromFqn, [{}]);
  await page.goto("/templates");
  const row = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: fromFqn });
  await expect(row).toBeVisible();

  let releaseRefresh = (): void => {};
  const refreshStarted = new Promise<void>((resolveStarted) => {
    void page.route("**/api/transaction-templates?*", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      resolveStarted();
      await new Promise<void>((resolveRefresh) => {
        releaseRefresh = resolveRefresh;
      });
      await route.continue();
    });
  });

  await row.getByRole("button", { name: "Move or rename" }).click();
  const restructure = page.getByRole("dialog", { name: "Move or rename" });
  await restructure.getByLabel("To").fill(toFqn);
  await restructure.getByRole("button", { name: "Move" }).click();
  await refreshStarted;
  await expect(restructure).toHaveCount(0);
  const search = page.getByRole("searchbox", { name: "Search" });
  await expect(search).toBeFocused();

  const newTemplateButton = page
    .locator("header")
    .getByRole("button", { name: "New template" });
  await newTemplateButton.focus();
  const refreshResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "GET"
    );
  });
  releaseRefresh();
  await refreshResponse;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await expect(newTemplateButton).toBeFocused();
  await page.unroute("**/api/transaction-templates?*");
  await deleteTemplate(page, template.transaction_template_id);
});

test("Escape closes a template editor before its restructure panel", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Escape order`;
  const destination = `E2E:${unique}:Unsaved destination`;
  const template = await createTemplate(page, fqn, [{}]);

  await page.goto("/templates");
  const row = page.getByTestId("templates-tree-row").filter({ hasText: fqn });
  await row.getByRole("button", { name: "Move or rename" }).click();
  const restructure = page.getByRole("dialog", { name: "Move or rename" });
  await restructure.getByLabel("To").fill(destination);
  await row.click({ position: { x: 24, y: 24 } });

  const editor = page.getByRole("dialog", { name: "Edit template" });
  await expect(editor).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(editor).toHaveCount(0);
  await expect(restructure).toBeVisible();
  await expect(restructure.getByLabel("To")).toHaveValue(destination);
  await page.keyboard.press("Escape");
  await expect(restructure).toHaveCount(0);
  await deleteTemplate(page, template.transaction_template_id);
});

test("creating the first template restores focus to the header action", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:First template`;
  let listRequestCount = 0;
  await page.route("**/api/transaction-templates?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    listRequestCount += 1;
    if (listRequestCount === 1) {
      await route.fulfill({
        body: JSON.stringify({
          transaction_templates: [],
          total_count: 0,
        }),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/templates");
  await expect(page.getByText("No templates")).toBeVisible();
  const emptyAction = page.getByRole("button", { name: "New template" }).last();
  await emptyAction.click();
  const editor = page.getByRole("dialog", { name: "New template" });
  const fqnInput = editor.getByLabel("Template FQN");
  await fqnInput.pressSequentially(fqn);
  await fqnInput.press("Tab");
  await expect(
    editor.getByText(
      "Enter a colon-separated template path with no empty segments.",
    ),
  ).toHaveCount(0);
  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });
  await editor.getByRole("button", { name: "Create template" }).click();
  const created = (await (
    await createResponsePromise
  ).json()) as TemplateFixture;

  const headerAction = page
    .locator("header")
    .getByRole("button", { name: "New template" });
  await expect(headerAction).toBeFocused();
  await page.unroute("**/api/transaction-templates?*");
  await deleteTemplate(page, created.transaction_template_id);
});

test("templates page renders loading, error, retry, and empty states", async ({
  page,
}) => {
  let releaseInitialRequest = (): void => {};
  const initialRequestReleased = new Promise<void>((resolve) => {
    releaseInitialRequest = resolve;
  });
  let requestCount = 0;
  await page.route("**/api/transaction-templates?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    requestCount += 1;
    if (requestCount === 1) {
      await initialRequestReleased;
      await route.fulfill({
        body: JSON.stringify({
          error: { code: "internal_error", message: "templates unavailable" },
        }),
        contentType: "application/json",
        status: 500,
      });
      return;
    }
    await route.fulfill({
      body: JSON.stringify({ transaction_templates: [], total_count: 0 }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/templates");
  await expect(page.getByTestId("reference-tree-loading")).toBeVisible();
  releaseInitialRequest();
  await expect(page.getByText("Templates could not be loaded.")).toBeVisible();
  await page.getByText("API error").click();
  await expect(page.getByText("templates unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  const search = page.getByRole("searchbox", { name: "Search" });
  await expect(search).toBeFocused();
  await expect(page.getByText("No templates")).toBeVisible();
  await expect(search).toBeFocused();
  const emptySprite = page.getByTestId("templates-empty-sprite");
  await expect(emptySprite).toBeVisible();
  await expect(emptySprite.locator("path").nth(2)).toHaveCSS(
    "fill",
    "rgb(111, 227, 184)",
  );
  await expect(page.getByText("Reusable transaction shapes")).toBeVisible();
});

test("removing a template record remaps validation errors", async ({
  page,
}) => {
  await page.goto("/templates");
  await page
    .locator("header")
    .getByRole("button", { name: "New template" })
    .click();
  const editor = page.getByRole("dialog", { name: "New template" });
  const records = editor.getByLabel("Template records").locator("section");
  await records.nth(0).getByLabel("Amount (optional)").fill("0");
  await editor.getByRole("button", { name: "Add record" }).click();
  await records.nth(1).getByLabel("Amount (optional)").fill("1");

  await editor.getByRole("button", { name: "Create template" }).click();
  await expect(
    records.nth(0).getByText("Enter a signed non-zero amount"),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Remove record 1" }).click();

  await expect(records).toHaveCount(1);
  await expect(records.nth(0).getByLabel("Amount (optional)")).toHaveValue("1");
  await expect(editor.getByText("Enter a signed non-zero amount")).toHaveCount(
    0,
  );
  await editor.getByRole("button", { name: "Cancel" }).click();
  await page
    .getByRole("alertdialog", { name: "Discard template changes?" })
    .getByRole("button", { name: "Discard changes" })
    .click();
});

test("template editor flashes attention after a backdrop click", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto("/templates");
  await page
    .locator("header")
    .getByRole("button", { name: "New template" })
    .click();
  const editor = page.getByRole("dialog", { name: "New template" });

  await page.keyboard.press("Control+K");
  await page.locator("body").press("n");
  await expect(
    page.getByRole("combobox", { name: "Command search" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);

  await editor.evaluate((element) => {
    element.setAttribute("data-animation-starts", "");
    element.addEventListener("animationstart", (event) => {
      const animationName = (event as AnimationEvent).animationName;
      element.setAttribute(
        "data-animation-starts",
        `${element.getAttribute("data-animation-starts") ?? ""}${animationName},`,
      );
    });
  });

  await page
    .getByTestId("template-editor-overlay")
    .click({ position: { x: 8, y: 450 } });

  await expect(editor).toHaveCSS("animation-name", "entry-attention-flash");
  await expect
    .poll(() => editor.getAttribute("data-animation-starts"))
    .toContain("entry-attention-flash");

  await editor.evaluate((element) => {
    element.setAttribute("data-animation-starts", "");
  });
  await page
    .getByTestId("template-editor-overlay")
    .click({ position: { x: 8, y: 450 } });
  await expect
    .poll(() => editor.getAttribute("data-animation-starts"))
    .toContain("entry-attention-flash");
  await expect
    .poll(() => editor.getAttribute("data-animation-starts"))
    .not.toContain("entry-stage-in");
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Cancel" }).click();
});

test("template editor saves reference-free records after lookup failure", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Reference free`;
  let failedCategories = false;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (
      !failedCategories &&
      route.request().method() === "GET" &&
      url.pathname === "/api/categories" &&
      url.searchParams.get("include_tombstoned") === "true"
    ) {
      failedCategories = true;
      await route.fulfill({
        body: JSON.stringify({
          error: { code: "internal_error", message: "lookups unavailable" },
        }),
        contentType: "application/json",
        status: 500,
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/templates");
  await page
    .locator("header")
    .getByRole("button", { name: "New template" })
    .click();
  const editor = page.getByRole("dialog", { name: "New template" });
  await expect(editor.getByText("lookups unavailable")).toBeVisible();
  await editor.getByLabel("Template FQN").fill(fqn);
  await editor.getByLabel("Memo (optional)").fill(`Memo ${unique}`);
  const saveButton = editor.getByRole("button", { name: "Create template" });
  await expect(saveButton).toBeEnabled();

  const createdResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });
  await saveButton.click();
  const response = await createdResponse;
  expect(response.ok(), await response.text()).toBe(true);
  const created = (await response.json()) as TemplateFixture;
  await expect(
    page.getByTestId("templates-tree-row").filter({ hasText: fqn }),
  ).toBeVisible();

  await deleteTemplate(page, created.transaction_template_id);
});

test("template editor submits with modified Enter", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Keyboard submit`;
  await page.goto("/templates");
  await page
    .locator("header")
    .getByRole("button", { name: "New template" })
    .click();
  const editor = page.getByRole("dialog", { name: "New template" });
  await editor.getByLabel("Template FQN").fill(fqn);
  const saveResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });

  await page.keyboard.press("Control+Enter");

  const created = (await (await saveResponsePromise).json()) as TemplateFixture;
  await expect(editor).toHaveCount(0);
  await deleteTemplate(page, created.transaction_template_id);
});

test("template editor clears an FQN conflict after correction", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const conflictFqn = `E2E:${unique}:Existing conflict`;
  const conflict = await createTemplate(page, conflictFqn, [{}]);
  await page.goto("/templates");
  await page
    .locator("header")
    .getByRole("button", { name: "New template" })
    .click();
  const editor = page.getByRole("dialog", { name: "New template" });
  const fqnField = editor.getByLabel("Template FQN");
  await fqnField.fill(conflictFqn);
  const conflictResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });
  await editor.getByRole("button", { name: "Create template" }).click();
  expect((await conflictResponsePromise).status()).toBe(409);
  const conflictMessage = await editor.getByRole("alert").textContent();
  expect(conflictMessage).not.toBeNull();
  await expect(editor.getByText(conflictMessage!, { exact: true })).toHaveCount(
    1,
  );

  await fqnField.fill(`E2E:${unique}:Corrected`);

  await expect(editor.getByText(conflictMessage!, { exact: true })).toHaveCount(
    0,
  );
  await editor.getByRole("button", { name: "Cancel" }).click();
  await page
    .getByRole("alertdialog", { name: "Discard template changes?" })
    .getByRole("button", { name: "Discard changes" })
    .click();
  await deleteTemplate(page, conflict.transaction_template_id);
});

test("template consumers retry after a transient initial failure", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Retry choice`;
  const template = await createTemplate(page, fqn, [{}]);
  let requestCount = 0;
  await page.route("**/api/transaction-templates?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        body: JSON.stringify({
          error: { code: "internal_error", message: "templates unavailable" },
        }),
        contentType: "application/json",
        status: 500,
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/accounts");
  await page.getByRole("button", { name: "Command palette" }).click();
  await expect(
    page.getByRole("combobox", { name: "Command search" }),
  ).toBeFocused();
  await expect.poll(() => requestCount).toBe(1);
  await page.getByRole("combobox", { name: "Command search" }).fill(fqn);
  await expect(page.getByRole("option", { name: `Use ${fqn}` })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Command palette" }).click();
  await expect(
    page.getByRole("combobox", { name: "Command search" }),
  ).toBeFocused();
  await page.getByRole("combobox", { name: "Command search" }).fill(fqn);
  await expect(page.getByRole("option", { name: `Use ${fqn}` })).toBeVisible();
  expect(requestCount).toBe(2);

  await deleteTemplate(page, template.transaction_template_id);
});

test("template editor closes while its post-save refresh is pending", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Pending refresh`;
  let releaseRefresh = (): void => {};
  const refreshReleased = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let requestCount = 0;
  await page.route("**/api/transaction-templates?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    requestCount += 1;
    if (requestCount > 1) {
      await refreshReleased;
    }
    await route.continue();
  });

  await page.goto("/templates");
  const newTemplateButton = page
    .locator("header")
    .getByRole("button", { name: "New template" });
  await newTemplateButton.click();
  const editor = page.getByRole("dialog", { name: "New template" });
  await editor.getByLabel("Template FQN").fill(fqn);
  const saveResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });
  await editor.getByRole("button", { name: "Create template" }).click();
  const created = (await (await saveResponsePromise).json()) as TemplateFixture;

  await expect(editor).toHaveCount(0);
  await expect(newTemplateButton).toBeFocused();

  releaseRefresh();
  await deleteTemplate(page, created.transaction_template_id);
});

test("superseded successful template refreshes do not report failure", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const firstFqn = `E2E:${unique}:First overlap`;
  const secondFqn = `E2E:${unique}:Second overlap`;
  let releaseFirstRefresh = (): void => {};
  let markFirstRefreshStarted = (): void => {};
  const firstRefreshStarted = new Promise<void>((resolve) => {
    markFirstRefreshStarted = resolve;
  });
  let requestCount = 0;
  await page.route("**/api/transaction-templates?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    requestCount += 1;
    if (requestCount === 2) {
      markFirstRefreshStarted();
      await new Promise<void>((resolve) => {
        releaseFirstRefresh = resolve;
      });
    }
    await route.continue();
  });

  await page.goto("/templates");
  const newTemplateButton = page
    .locator("header")
    .getByRole("button", { name: "New template" });
  const createTemplateFromEditor = async (fqn: string) => {
    await newTemplateButton.click();
    const editor = page.getByRole("dialog", { name: "New template" });
    await editor.getByLabel("Template FQN").fill(fqn);
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/transaction-templates" &&
        response.request().method() === "POST"
      );
    });
    await editor.getByRole("button", { name: "Create template" }).click();
    return (await (await responsePromise).json()) as TemplateFixture;
  };

  const first = await createTemplateFromEditor(firstFqn);
  await firstRefreshStarted;
  const second = await createTemplateFromEditor(secondFqn);
  await expect.poll(() => requestCount).toBe(3);
  await expect(
    page.getByRole("status").filter({ hasText: "Template created." }),
  ).toBeVisible();

  const staleRefreshResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "GET"
    );
  });
  releaseFirstRefresh();
  await staleRefreshResponse;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await expect(page.getByText(/could not be refreshed/i)).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Template created." }),
  ).toBeVisible();

  await page.unroute("**/api/transaction-templates?*");
  await deleteTemplate(page, first.transaction_template_id);
  await deleteTemplate(page, second.transaction_template_id);
});

test("failed template refresh preserves the loaded tree", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const existingFqn = `E2E:${unique}:Existing snapshot`;
  const createdFqn = `E2E:${unique}:Refresh failure`;
  const existing = await createTemplate(page, existingFqn, [{}]);
  let requestCount = 0;
  await page.route("**/api/transaction-templates?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    requestCount += 1;
    if (requestCount === 2) {
      await route.fulfill({
        body: JSON.stringify({
          error: { code: "internal_error", message: "refresh unavailable" },
        }),
        contentType: "application/json",
        status: 500,
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/templates");
  const existingRow = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: existingFqn });
  await expect(existingRow).toBeVisible();
  await page
    .locator("header")
    .getByRole("button", { name: "New template" })
    .click();
  const editor = page.getByRole("dialog", { name: "New template" });
  const fqnField = editor.getByLabel("Template FQN");
  await fqnField.fill(createdFqn);
  await expect(fqnField).toHaveValue(createdFqn);
  const saveResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transaction-templates" &&
      response.request().method() === "POST"
    );
  });
  await editor.getByRole("button", { name: "Create template" }).click();
  const created = (await (await saveResponsePromise).json()) as TemplateFixture;

  await expect(
    page.getByText("Templates could not be refreshed."),
  ).toBeVisible();
  await page.getByText("API error").click();
  await expect(page.getByText(/internal_error/)).toBeVisible();
  await expect(page.getByText(/refresh unavailable/)).toBeVisible();
  await expect(existingRow).toBeVisible();
  const createdRow = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: createdFqn });
  await expect(createdRow).toBeVisible();

  const refreshRetry = page
    .getByRole("alert")
    .getByRole("button", { name: "Retry" });
  await refreshRetry.click();
  await expect(page.getByRole("searchbox", { name: "Search" })).toBeFocused();
  await expect(page.getByText("Templates could not be refreshed.")).toHaveCount(
    0,
  );

  await page.goto("/accounts");
  await expect(page.getByRole("searchbox", { name: "Search" })).toBeVisible();
  await openPalette(page);
  await page.getByRole("combobox", { name: "Command search" }).fill(createdFqn);
  await expect(
    page.getByRole("option", { name: `Use ${createdFqn}` }),
  ).toBeVisible();
  expect(requestCount).toBe(4);
  await page.keyboard.press("Escape");

  await deleteTemplate(page, existing.transaction_template_id);
  await deleteTemplate(page, created.transaction_template_id);
});

test("late failed refresh preserves a saved edit and newer transaction notice", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Optimistic edit`;
  const template = await createTemplate(page, fqn, [{ memo: "Before" }]);
  let requestCount = 0;
  let releaseRefresh: (() => void) | undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let markRefreshStarted: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    markRefreshStarted = resolve;
  });
  await page.route("**/api/transaction-templates?*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    requestCount += 1;
    if (requestCount === 2) {
      markRefreshStarted?.();
      await refreshGate;
      await route.fulfill({
        body: JSON.stringify({
          error: { code: "internal_error", message: "refresh unavailable" },
        }),
        contentType: "application/json",
        status: 500,
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/templates");
  const row = page.getByTestId("templates-tree-row").filter({ hasText: fqn });
  await row.getByRole("button", { name: "Edit template" }).click();
  let editor = page.getByRole("dialog", { name: "Edit template" });
  await editor.getByLabel("Memo (optional)").fill("After");
  await editor.getByRole("button", { name: "Save template" }).click();
  await refreshStarted;

  await page.keyboard.press("n");
  const entryEditor = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  const spendPanel = entryEditor.getByRole("tabpanel", { name: "Spend" });
  await spendPanel.getByLabel("Amount").fill("4.25");
  await choosePickerOption(
    page,
    spendPanel,
    "Funding account",
    "Wallet",
    "cash:Wallet",
  );
  await choosePickerOption(
    page,
    spendPanel,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
  );
  await choosePickerOption(
    page,
    spendPanel,
    "Category",
    "Books",
    "Entertainment:Books",
  );
  await entryEditor.getByRole("button", { name: "Save and close" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction saved." }),
  ).toBeVisible();

  releaseRefresh?.();

  await expect(
    page.getByText("Templates could not be refreshed."),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction saved." }),
  ).toBeVisible();
  await expect(
    page.getByText("Template choices could not be refreshed."),
  ).toHaveCount(0);
  await row.getByRole("button", { name: "Edit template" }).click();
  editor = page.getByRole("dialog", { name: "Edit template" });
  await expect(editor.getByLabel("Memo (optional)")).toHaveValue("After");
  await editor.getByRole("button", { name: "Cancel" }).click();

  await deleteTemplate(page, template.transaction_template_id);
});

test("template editor keeps saving independent of failed lookups", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Delayed references`;
  const accountFqn = `e2e:${unique}:Cash`;
  const categoryFqn = `E2E:${unique}:Expense`;
  const memberName = `E2E ${unique} Member`;
  const tagFqn = `E2E:${unique}:Hidden-${"x".repeat(72)}`;
  const account = await postFixture<{ account_id: number }>(
    page,
    "/api/accounts",
    {
      account_type: "owned",
      currency: "USD",
      fqn: accountFqn,
      is_hidden: true,
    },
  );
  const category = await postFixture<{ category_id: number }>(
    page,
    "/api/categories",
    {
      economic_intent: "expense",
      fqn: categoryFqn,
      is_hidden: true,
    },
  );
  const member = await postFixture<{ member_id: number }>(
    page,
    "/api/members",
    { name: memberName },
  );
  const tag = await postFixture<{ tag_id: number }>(page, "/api/tags", {
    fqn: tagFqn,
    is_hidden: true,
  });
  const template = await createTemplate(page, fqn, [
    {
      account_id: account.account_id,
      category_id: category.category_id,
      member_id: member.member_id,
      tag_ids: [tag.tag_id],
    },
  ]);
  let categoryRequestCount = 0;
  let releaseRetry: (() => void) | undefined;
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  let markRetryStarted: (() => void) | undefined;
  const retryStarted = new Promise<void>((resolve) => {
    markRetryStarted = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === "GET" &&
      url.pathname === "/api/categories" &&
      url.searchParams.get("include_tombstoned") === "true"
    ) {
      categoryRequestCount += 1;
      if (categoryRequestCount === 1) {
        await route.fulfill({
          body: JSON.stringify({
            error: { code: "internal_error", message: "lookups unavailable" },
          }),
          contentType: "application/json",
          status: 500,
        });
        return;
      }
      if (categoryRequestCount === 2) {
        markRetryStarted?.();
        await retryGate;
      }
    }
    await route.continue();
  });

  await page.goto("/templates");
  const row = page.getByTestId("templates-tree-row").filter({ hasText: fqn });
  await row.getByRole("button", { name: "Edit template" }).click();
  const editor = page.getByRole("dialog", { name: "Edit template" });
  await expect(editor.getByLabel("Account (optional)")).toHaveValue(
    `${unique}:Cash`,
  );
  await expect(editor.getByLabel("Category (optional)")).toHaveValue(
    `${unique}:Expense`,
  );
  await expect(editor.getByLabel("Member (optional)")).toHaveValue(memberName);
  await expect(editor.getByText("lookups unavailable")).toBeVisible();
  await editor.getByLabel("Memo (optional)").fill(`Retained ${unique}`);
  const saveButton = editor.getByRole("button", { name: "Save template" });
  await expect(saveButton).toBeEnabled();

  const retryButton = editor.getByRole("button", {
    name: "Retry references",
  });
  await retryButton.click();
  await retryStarted;
  await expect(retryButton).toBeFocused();
  await expect(retryButton).toHaveAttribute("aria-disabled", "true");
  const amount = editor.getByLabel("Amount (optional)");
  await amount.fill("12.34");
  await expect(amount).toBeFocused();
  releaseRetry?.();
  await expect(editor.getByLabel("Account (optional)")).toHaveValue(
    `${unique}:Cash`,
  );
  await expect(editor.getByLabel("Category (optional)")).toHaveValue(
    `${unique}:Expense`,
  );
  await expect(editor.getByLabel("Member (optional)")).toHaveValue(memberName);
  await expect(amount).toBeFocused();
  await expect(editor.getByLabel("Hidden")).toHaveCount(4);
  const selectedTags = editor.getByTestId("entity-multi-picker-selected");
  await expect(
    selectedTags.getByLabel("Hidden", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      selectedTags.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    )
    .toBe(true);
  await expect(
    editor.getByRole("button", {
      name: `Remove ${tagFqn} (${unique}:Hidden-${"x".repeat(72)})`,
    }),
  ).toBeVisible();

  await editor.getByRole("button", { name: "Add record" }).click();
  const secondRecord = editor
    .getByLabel("Template records")
    .locator("section")
    .nth(1);
  for (const [label, hiddenFqn] of [
    ["Account (optional)", accountFqn],
    ["Category (optional)", categoryFqn],
    ["Tags (optional)", tagFqn],
  ] as const) {
    const picker = secondRecord.getByRole("combobox", { name: label });
    await picker.fill(unique);
    await expect(
      page.getByRole("option").filter({ hasText: hiddenFqn }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
  }

  await editor.getByRole("button", { name: "Cancel" }).click();
  await page
    .getByRole("alertdialog", { name: "Discard template changes?" })
    .getByRole("button", { name: "Discard changes" })
    .click();
  await deleteTemplate(page, template.transaction_template_id);
});

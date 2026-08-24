import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface DefinitionFixture {
  readonly anchor_date: string;
  readonly definition_version: number;
  readonly fqn: string;
  readonly next_due_date: string | null;
  readonly paused_at: string | null;
  readonly recurring_definition_id: number;
}

const uniqueName = (projectName: string): string =>
  `E2E:Recurring:${projectName.replace(/[^A-Za-z0-9]/g, "")}:${Date.now()}`;

const definitionRow = (page: Page, definition: DefinitionFixture) =>
  page.locator(
    `[data-recurring-definition-id="${definition.recurring_definition_id}"]`,
  );

const rowActionFitState = async (rowActions: Locator) =>
  rowActions.evaluate((element) => {
    const overflow = element.querySelector<HTMLElement>(
      ".row-actions-overflow",
    );
    const primaryActions = Array.from(
      element.querySelectorAll<HTMLElement>(
        ".row-actions-buttons :is(.row-actions-button, .row-actions-toggle)",
      ),
    );
    const availableWidth = element.getBoundingClientRect().width;
    const actionCount = Number(element.dataset.rowActionsCount ?? "0");
    const fullClusterWidth =
      actionCount === 0 ? 0 : actionCount * 28 + (actionCount - 1) * 4;

    return {
      availableWidth,
      buttonsFolded: primaryActions.every(
        (action) => window.getComputedStyle(action).display === "none",
      ),
      fullClusterWidth,
      overflowVisible:
        overflow !== null &&
        window.getComputedStyle(overflow).display !== "none",
    };
  });

const definitionByFqn = async (
  page: Page,
  fqn: string,
): Promise<DefinitionFixture> => {
  const response = await page.request.get(
    "/api/recurring-definitions?limit=500&offset=0&sort=fqn&sort_dir=asc",
  );
  expect(response.ok(), await response.text()).toBe(true);
  const body = (await response.json()) as {
    readonly recurring_definitions: readonly DefinitionFixture[];
  };
  const definition = body.recurring_definitions.find(
    (item) => item.fqn === fqn,
  );
  expect(definition, `${fqn} definition`).toBeDefined();
  return definition as DefinitionFixture;
};

const selectDefinitionAction = async (
  page: Page,
  row: ReturnType<typeof definitionRow>,
  label: string,
) => {
  const inlineAction = row.getByRole("button", { name: label });
  if (await inlineAction.isVisible().catch(() => false)) {
    await inlineAction.click();
    return;
  }
  await row.getByRole("button", { name: "More row actions" }).click();
  await page.getByRole("button", { name: label }).last().click();
};

const completeEditor = async (page: Page, fqn: string) => {
  await page.getByRole("button", { name: "New definition" }).click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await expect(editor).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Save definition" }),
  ).toBeEnabled();
  await editor.getByLabel("Definition FQN").fill(fqn);
  const records = editor.getByLabel("Definition records").locator("section");
  const first = records.nth(0);
  const second = records.nth(1);
  const firstAccount = first.getByLabel("Account");
  await firstAccount.fill("bank:Chase:joint_checking");
  await expect(firstAccount).toHaveAttribute("aria-expanded", "false");
  await first.getByLabel("Amount").fill("-12.34");
  const secondAccount = second.getByLabel("Account");
  await secondAccount.fill("merchant:PowellsBooks");
  await expect(secondAccount).toHaveAttribute("aria-expanded", "false");
  await second.getByLabel("Amount").fill("12.34");
  const secondCategory = second.getByLabel("Category");
  await expect(secondCategory).toBeVisible();
  await secondCategory.fill("Entertainment:Books");
  await expect(secondCategory).toHaveAttribute("aria-expanded", "false");
  return editor;
};

test("recurring definitions table renders seeded definitions and schedule details", async ({
  page,
}) => {
  const definitionsRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/recurring-definitions" &&
      request.method() === "GET"
    );
  });
  await page.goto("/recurring");
  const definitionsURL = new URL((await definitionsRequest).url());
  expect(definitionsURL.searchParams.get("sort")).toBe("next_due_date");
  expect(definitionsURL.searchParams.get("sort_dir")).toBe("asc");
  await expect(page.getByRole("heading", { name: "Recurring" })).toBeVisible();
  const table = page.getByTestId("recurring-definitions-table");
  await expect(table).toBeVisible();
  const rows = table.getByTestId("recurring-definition-row");
  await expect(rows).toHaveCount(4);
  for (const [index, fqn] of [
    "Household:Mortgage",
    "Savings:WeeklyTransfer",
    "Subscriptions:Netflix",
    "Debt:CreditCardPayment",
  ].entries()) {
    await expect(rows.nth(index)).toContainText(fqn);
  }
  await expect(table).toContainText("Every 1 month");
  await expect(table).toContainText("Active");
  await expect(table.getByRole("columnheader", { name: "Next" })).toBeVisible();
});

test("recurring definition row actions unfold at desktop width and fold when constrained", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/recurring");
  const row = page
    .getByTestId("recurring-definition-row")
    .filter({ hasText: "Household:Mortgage" });
  const rowActions = row.locator(".row-actions");
  await expect(row).toBeVisible();
  await expect(rowActions).toHaveAttribute("data-row-actions-count", "5");
  for (const label of [
    "Edit definition",
    "Confirm next",
    "Pause",
    "Defer",
    "Cancel definition",
  ]) {
    await expect(row.getByRole("button", { name: label })).toBeVisible();
  }
  await expect(
    rowActions.locator(".row-actions-buttons > .row-actions-button"),
  ).toHaveCount(5);
  await expect(rowActions.locator(".row-actions-toggle")).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "More row actions" }),
  ).toBeHidden();
  let fit = await rowActionFitState(rowActions);
  expect(fit.availableWidth).toBeGreaterThanOrEqual(fit.fullClusterWidth);
  expect(fit.buttonsFolded).toBe(false);
  expect(fit.overflowVisible).toBe(false);

  await page.setViewportSize({ width: 390, height: 900 });
  fit = await rowActionFitState(rowActions);
  expect(fit.availableWidth).toBeLessThan(fit.fullClusterWidth);
  expect(fit.buttonsFolded).toBe(true);
  expect(fit.overflowVisible).toBe(true);
  const overflow = row.getByRole("button", { name: "More row actions" });
  await expect(overflow).toBeVisible();
  await overflow.click();
  const overflowMenu = page.locator(".row-actions-menu:visible");
  for (const label of [
    "Edit definition",
    "Confirm next",
    "Pause",
    "Defer",
    "Cancel definition",
  ]) {
    await expect(
      overflowMenu.getByRole("button", { name: label }),
    ).toBeVisible();
  }
});

test("definition fragment opens its editor without adding a source marker", async ({
  page,
}) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  await page.goto("/recurring");
  const row = definitionRow(page, definition);
  const definitionCell = row.locator("td").first();
  await expect(definitionCell).toHaveText(definition.fqn);
  const plainRowScreenshot = await row.screenshot({ animations: "disabled" });

  await page.evaluate((definitionId) => {
    window.history.pushState({}, "", `/recurring#definition-${definitionId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, definition.recurring_definition_id);
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeFocused();
  await expect(editor.getByLabel("Definition FQN")).toHaveValue(definition.fqn);
  await expect(definitionCell).toHaveText(definition.fqn);
  await editor.evaluate((element) => {
    element.style.visibility = "hidden";
  });
  expect(await row.screenshot({ animations: "disabled" })).toEqual(
    plainRowScreenshot,
  );
  await page
    .locator("[data-recurring-definition-editor]")
    .evaluate((element) => {
      element.style.visibility = "";
    });

  await editor.getByRole("button", { name: "Close definition editor" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page).toHaveURL(/\/recurring$/);
  await expect(row).toBeFocused();
});

test("missing definition fragments clear with feedback", async ({ page }) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  const cancelled = await page.request.delete(
    `/api/recurring-definitions/${definition.recurring_definition_id}`,
  );
  expect(cancelled.ok(), await cancelled.text()).toBe(true);

  await page.goto(
    `/recurring#definition-${definition.recurring_definition_id}`,
  );

  await expect(page).toHaveURL(/\/recurring$/);
  await expect(
    page.getByText("Recurring definition is no longer available."),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Edit recurring definition" }),
  ).toHaveCount(0);
});

test("pausing a reordered definition restores its visible button focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/recurring");
  const definition = await definitionByFqn(page, "Household:Mortgage");
  const row = definitionRow(page, definition);
  const scrollContainer = page
    .getByTestId("recurring-definitions-table")
    .locator("table")
    .locator("..");
  const tableHeader = scrollContainer.locator("thead");
  await scrollContainer.evaluate((element) => {
    element.style.flex = "none";
    element.style.height = "120px";
    element.scrollTop = 0;
  });

  const pause = row.getByRole("button", { name: "Pause" });
  await pause.focus();
  await pause.press("Enter");
  await expect(page.getByText("Definition paused.")).toBeVisible();

  const resume = row.getByRole("button", { name: "Resume" });
  await expect(resume).toBeFocused();
  await expect
    .poll(async () => {
      const [rowBounds, containerBounds, headerBounds] = await Promise.all([
        row.boundingBox(),
        scrollContainer.boundingBox(),
        tableHeader.boundingBox(),
      ]);
      return Boolean(
        containerBounds &&
        headerBounds &&
        rowBounds &&
        rowBounds.y >= headerBounds.y + headerBounds.height &&
        rowBounds.y + rowBounds.height <=
          containerBounds.y + containerBounds.height,
      );
    })
    .toBe(true);

  await scrollContainer.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await resume.press("Enter");
  await expect(page.getByText("Definition resumed.")).toBeVisible();

  const pauseAgain = row.getByRole("button", { name: "Pause" });
  await expect(pauseAgain).toBeFocused();
  await expect
    .poll(async () => {
      const [rowBounds, containerBounds, headerBounds] = await Promise.all([
        row.boundingBox(),
        scrollContainer.boundingBox(),
        tableHeader.boundingBox(),
      ]);
      return Boolean(
        containerBounds &&
        headerBounds &&
        rowBounds &&
        rowBounds.y >= headerBounds.y + headerBounds.height &&
        rowBounds.y + rowBounds.height <=
          containerBounds.y + containerBounds.height,
      );
    })
    .toBe(true);
});

test("date-rule definitions defer by schedule periods", async ({
  page,
}, testInfo) => {
  await page.goto("/recurring");
  const fqn = uniqueName(`${testInfo.project.name}DateRule`);
  const editor = await completeEditor(page, fqn);
  await editor.getByLabel("Schedule").selectOption("day_of_month");
  await editor.getByRole("spinbutton", { name: "Day of month" }).fill("15");
  await editor.getByRole("button", { name: "Save definition" }).click();
  await expect(page.getByText("Definition created.")).toBeVisible();

  let definition = await definitionByFqn(page, fqn);
  const beforeDefer = definition.next_due_date;
  await selectDefinitionAction(page, definitionRow(page, definition), "Defer");
  const dialog = page.getByRole("alertdialog", {
    name: "Defer next occurrence",
  });
  await expect(dialog.getByLabel("Periods")).toHaveValue("1");
  await expect(dialog.getByLabel("Defer unit")).toHaveCount(0);
  const periodInputStyle = await dialog
    .getByLabel("Periods")
    .evaluate((input) => {
      const style = window.getComputedStyle(input);
      return { borderWidth: style.borderTopWidth, boxShadow: style.boxShadow };
    });
  expect(periodInputStyle.borderWidth).toBe("2px");
  expect(periodInputStyle.boxShadow).not.toBe("none");
  await dialog.getByLabel("Periods").fill("2");
  const deferRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname ===
        `/api/recurring-definitions/${definition.recurring_definition_id}/defer`,
  );
  await dialog.getByRole("button", { name: "Defer definition" }).click();
  expect((await deferRequest).postDataJSON()).toEqual({ every: 2 });
  await expect(page.getByText("Next occurrence deferred.")).toBeVisible();
  definition = await definitionByFqn(page, fqn);
  expect(definition.next_due_date).not.toBe(beforeDefer);
});

test("definition editor blocks past anchors and maps server errors", async ({
  page,
}) => {
  await page.goto("/recurring");
  const definition = await definitionByFqn(page, "Household:Mortgage");
  const row = definitionRow(page, definition);
  await row.click();
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  const anchor = editor.getByLabel("Anchor date");
  let replaceRequests = 0;
  await page.route(
    `**/api/recurring-definitions/${definition.recurring_definition_id}`,
    async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      replaceRequests += 1;
      await route.fulfill({
        body: JSON.stringify({
          error: {
            code: "invalid_request",
            message: "anchor_date must be today or later when changed",
          },
        }),
        contentType: "application/json",
        status: 400,
      });
    },
  );
  const save = editor.getByRole("button", { name: "Save definition" });
  await expect(save).toBeEnabled();
  await anchor.fill("2000-01-01");
  await save.click();
  await expect(
    editor.getByText("A changed anchor date cannot be in the past."),
  ).toBeVisible();
  expect(replaceRequests).toBe(0);

  await anchor.fill("2099-01-01");
  await save.click();
  await expect(
    editor.getByText("anchor_date must be today or later when changed").last(),
  ).toBeVisible();
  expect(replaceRequests).toBe(1);
});

test("definition actions preserve newer row focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/recurring");
  const definition = await definitionByFqn(page, "Household:Mortgage");
  const row = definitionRow(page, definition);
  let markPauseStarted!: () => void;
  const pauseStarted = new Promise<void>((resolve) => {
    markPauseStarted = resolve;
  });
  let releasePause!: () => void;
  const pauseReleased = new Promise<void>((resolve) => {
    releasePause = resolve;
  });
  await page.route("**/api/recurring-definitions/*/pause", async (route) => {
    markPauseStarted();
    await pauseReleased;
    await route.continue();
  });

  const pause = row.getByRole("button", { name: "Pause" });
  await pause.focus();
  await pause.press("Enter");
  await pauseStarted;
  await row.focus();
  releasePause();

  await expect(page.getByText("Definition paused.")).toBeVisible();
  await expect(row).toBeFocused();
});

test("a local editor consumes a definition fragment before loading finishes", async ({
  page,
}) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  let releaseDefinitions!: () => void;
  const definitionsReleased = new Promise<void>((resolve) => {
    releaseDefinitions = resolve;
  });
  await page.route("**/api/recurring-definitions?**", async (route) => {
    await definitionsReleased;
    await route.continue();
  });

  await page.goto(
    `/recurring#definition-${definition.recurring_definition_id}`,
  );
  await page.getByRole("button", { name: "New definition" }).click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await expect(editor).toBeFocused();

  releaseDefinitions();
  await expect(page.getByTestId("recurring-definitions-table")).toBeVisible();
  await expect(page).toHaveURL(/\/recurring$/);
  await expect(editor).toBeFocused();
});

test("an open local editor consumes a later definition fragment", async ({
  page,
}) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  await page.goto("/recurring");
  await page.getByRole("button", { name: "New definition" }).click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await expect(editor).toBeFocused();

  await page.evaluate((definitionId) => {
    window.history.pushState({}, "", `/recurring#definition-${definitionId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, definition.recurring_definition_id);

  await expect(page).toHaveURL(/\/recurring$/);
  await expect(editor).toBeFocused();
  await editor.getByRole("button", { name: "Close definition editor" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page).toHaveURL(/\/recurring$/);
});

test("a delayed definition fragment opens its editor", async ({ page }) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  let releaseDefinitions!: () => void;
  const definitionsReleased = new Promise<void>((resolve) => {
    releaseDefinitions = resolve;
  });
  await page.route("**/api/recurring-definitions?**", async (route) => {
    await definitionsReleased;
    await route.continue();
  });

  await page.goto(
    `/recurring#definition-${definition.recurring_definition_id}`,
  );
  const newerFocusTarget = page.getByRole("button", {
    name: "New definition",
  });
  await newerFocusTarget.focus();

  releaseDefinitions();
  await expect(page.getByTestId("recurring-definitions-table")).toBeVisible();
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeFocused();
  await expect(editor.getByLabel("Definition FQN")).toHaveValue(definition.fqn);
});

test("a delayed definition fragment waits for the command palette", async ({
  page,
}) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  let releaseDefinitions!: () => void;
  const definitionsReleased = new Promise<void>((resolve) => {
    releaseDefinitions = resolve;
  });
  await page.route("**/api/recurring-definitions?**", async (route) => {
    await definitionsReleased;
    await route.continue();
  });

  await page.goto(
    `/recurring#definition-${definition.recurring_definition_id}`,
  );
  await expect(
    page.getByRole("button", { name: "New definition" }),
  ).toBeVisible();
  const palette = page.getByRole("dialog", { name: "Command Palette" });
  const commandSearch = palette.getByRole("combobox", {
    name: "Command search",
  });
  await Promise.all([
    expect(commandSearch).toBeFocused(),
    page.keyboard.press("Control+K"),
  ]);

  releaseDefinitions();
  await expect(page.getByTestId("recurring-definitions-table")).toBeVisible();
  await expect(commandSearch).toBeFocused();
  await expect(
    page.getByRole("complementary", { name: "Edit recurring definition" }),
  ).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeFocused();
  await expect(editor.getByLabel("Definition FQN")).toHaveValue(definition.fqn);
});

test("a definition fragment supersedes persistent navigation focus", async ({
  page,
}) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  let releaseDefinitions!: () => void;
  const definitionsReleased = new Promise<void>((resolve) => {
    releaseDefinitions = resolve;
  });
  await page.route("**/api/recurring-definitions?**", async (route) => {
    await definitionsReleased;
    await route.continue();
  });

  await page.goto(
    `/recurring#definition-${definition.recurring_definition_id}`,
  );
  const accountsLink = page.getByRole("link", { name: "Accounts" });
  await accountsLink.focus();

  releaseDefinitions();
  await expect(page.getByTestId("recurring-definitions-table")).toBeVisible();
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeFocused();
});

test("cold definition fragment opens its editor after loading", async ({
  page,
}) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  let releaseDefinitions!: () => void;
  const definitionsReleased = new Promise<void>((resolve) => {
    releaseDefinitions = resolve;
  });
  await page.route("**/api/recurring-definitions?**", async (route) => {
    await definitionsReleased;
    await route.continue();
  });

  await page.goto(
    `/recurring#definition-${definition.recurring_definition_id}`,
  );
  await expect(page.getByRole("heading", { name: "Recurring" })).toBeFocused();

  releaseDefinitions();
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeFocused();
  await expect(editor.getByLabel("Definition FQN")).toHaveValue(definition.fqn);
});

test("fragment editor drafts survive route navigation", async ({ page }) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  await page.goto(
    `/recurring#definition-${definition.recurring_definition_id}`,
  );
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeFocused();
  const fqn = editor.getByLabel("Definition FQN");
  await fqn.fill("Household:UnsavedMortgage");

  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(editor).toBeVisible();
  await expect(fqn).toHaveValue("Household:UnsavedMortgage");

  await page.goBack();
  await expect(page).toHaveURL(
    new RegExp(`/recurring#definition-${definition.recurring_definition_id}$`),
  );
  await expect(fqn).toHaveValue("Household:UnsavedMortgage");
  await editor.getByRole("button", { name: "Close definition editor" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page).toHaveURL(/\/recurring$/);
  await expect(definitionRow(page, definition)).toBeFocused();
});

test("a fresh definition fragment reopens its editor after close", async ({
  page,
}) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  await page.goto(
    `/recurring#definition-${definition.recurring_definition_id}`,
  );
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeFocused();
  await editor.getByRole("button", { name: "Close definition editor" }).click();
  await expect(page).toHaveURL(/\/recurring$/);
  await expect(editor).toHaveCount(0);

  await page.goto("/overview");
  await page.goto(
    `/recurring#definition-${definition.recurring_definition_id}`,
  );
  await expect(editor).toBeFocused();
});

test("definition fragment opens its editor after a failed load retry", async ({
  page,
}) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  let failNextList = true;
  await page.route("**/api/recurring-definitions?**", async (route) => {
    if (!failNextList) {
      await route.continue();
      return;
    }
    failNextList = false;
    await route.fulfill({
      contentType: "application/json",
      json: {
        error: {
          code: "temporary_failure",
          message: "Definition list temporarily unavailable.",
        },
      },
      status: 503,
    });
  });
  await page.goto(
    `/recurring#definition-${definition.recurring_definition_id}`,
  );
  await expect(
    page.getByText("Recurring definitions could not be loaded."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await expect(editor).toBeFocused();
  await expect(editor.getByLabel("Definition FQN")).toHaveValue(definition.fqn);
});

test("definition fragment waits for the global recurring editor to close", async ({
  page,
}, testInfo) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  const templateFqn = `E2E:${testInfo.project.name.replace(/[^A-Za-z0-9]/g, "")}:${Date.now()}:Fragment editor`;
  const createTemplateResponse = await page.request.post(
    "/api/transaction-templates",
    {
      data: { fqn: templateFqn, records: [{}] },
    },
  );
  expect(createTemplateResponse.ok(), await createTemplateResponse.text()).toBe(
    true,
  );
  const template = (await createTemplateResponse.json()) as {
    readonly transaction_template_id: number;
  };
  await page.goto("/templates");
  const createRecurring = page
    .getByTestId("templates-tree-row")
    .filter({ hasText: templateFqn })
    .getByRole("button", { exact: true, name: "Create recurring" });
  await expect(createRecurring).toBeVisible();
  await createRecurring.click();
  const editor = page.getByRole("complementary", {
    name: "New recurring definition",
  });
  await expect(editor).toBeFocused();

  await page.evaluate((definitionId) => {
    window.history.pushState({}, "", `/recurring#definition-${definitionId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, definition.recurring_definition_id);
  await expect(page).toHaveURL(
    new RegExp(`/recurring#definition-${definition.recurring_definition_id}$`),
  );
  const linkedEditor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await Promise.all([
    expect(linkedEditor).toBeFocused(),
    editor.getByRole("button", { name: "Close definition editor" }).click(),
  ]);
  await expect(editor).toHaveCount(0);
  await expect(linkedEditor.getByLabel("Definition FQN")).toHaveValue(
    definition.fqn,
  );

  const deleteTemplateResponse = await page.request.delete(
    `/api/transaction-templates/${template.transaction_template_id}`,
  );
  expect(deleteTemplateResponse.ok(), await deleteTemplateResponse.text()).toBe(
    true,
  );
});

test("definition fragment waits for the global template editor to close", async ({
  page,
}) => {
  const definition = await definitionByFqn(page, "Household:Mortgage");
  await page.goto("/templates");
  await page.getByRole("button", { name: "New template" }).first().click();
  const editor = page.getByRole("dialog", { name: "New template" });
  const fqnInput = editor.getByLabel("Template FQN");
  await expect(fqnInput).toBeFocused();

  await page.evaluate((definitionId) => {
    window.history.pushState({}, "", `/recurring#definition-${definitionId}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, definition.recurring_definition_id);
  const linkedEditor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await Promise.all([
    expect(linkedEditor).toBeFocused(),
    editor.getByRole("button", { name: "Close template editor" }).click(),
  ]);
  await expect(editor).toHaveCount(0);
  await expect(linkedEditor.getByLabel("Definition FQN")).toHaveValue(
    definition.fqn,
  );
});

test("saving a reordered definition restores its visible row focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/recurring");
  const definition = await definitionByFqn(page, "Household:Mortgage");
  const row = definitionRow(page, definition);
  const scrollContainer = page
    .getByTestId("recurring-definitions-table")
    .locator("table")
    .locator("..");
  const tableHeader = scrollContainer.locator("thead");
  await scrollContainer.evaluate((element) => {
    element.style.flex = "none";
    element.style.height = "120px";
    element.scrollTop = 0;
  });

  await row.click();
  const editor = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  await editor.getByLabel("Anchor date").fill("2099-01-01");
  await editor.getByRole("button", { name: "Save definition" }).click();
  await expect(page.getByText("Definition updated.")).toBeVisible();

  await expect(row).toBeFocused();
  await expect
    .poll(async () => {
      const [rowBounds, containerBounds, headerBounds] = await Promise.all([
        row.boundingBox(),
        scrollContainer.boundingBox(),
        tableHeader.boundingBox(),
      ]);
      return Boolean(
        containerBounds &&
        headerBounds &&
        rowBounds &&
        rowBounds.y >= headerBounds.y + headerBounds.height &&
        rowBounds.y + rowBounds.height <=
          containerBounds.y + containerBounds.height,
      );
    })
    .toBe(true);
});

test("recurring definitions create, edit, pause, defer, resume, and cancel", async ({
  page,
}, testInfo) => {
  const memberName = `Recurring:Member:${testInfo.project.name.replace(
    /[^A-Za-z0-9]/g,
    "",
  )}:${Date.now()}`;
  const memberResponse = await page.request.post("/api/members", {
    data: { name: memberName },
  });
  expect(memberResponse.ok(), await memberResponse.text()).toBe(true);
  const member = (await memberResponse.json()) as {
    readonly member_id: number;
  };
  await page.goto("/recurring");
  const fqn = uniqueName(testInfo.project.name);
  const editor = await completeEditor(page, fqn);
  const memberPicker = editor
    .getByLabel("Definition records")
    .locator("section")
    .first()
    .getByLabel("Member");
  await memberPicker.fill("Recurring:Member:");
  const memberOptionsId = await memberPicker.getAttribute("aria-controls");
  const memberOptions = page.locator(`#${memberOptionsId}`);
  await expect(memberOptions).toHaveAttribute("data-picker-mode", "search");
  await expect(memberOptions.locator("[data-picker-breadcrumb]")).toHaveCount(
    0,
  );
  await expect(
    memberOptions.getByRole("option", { name: memberName }),
  ).toBeVisible();
  await memberPicker.fill(memberName);
  await expect(memberPicker).toHaveValue(memberName);
  await expect(memberPicker).toHaveAttribute("aria-expanded", "false");
  const save = editor.getByRole("button", { name: "Save definition" });
  await expect(save).toBeEnabled();
  const createRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/recurring-definitions" &&
      request.method() === "POST",
  );
  await save.click();
  const createBody = (await createRequest).postDataJSON() as {
    readonly records: readonly { readonly member_id: number | null }[];
  };
  expect(createBody.records[0]?.member_id).toBe(member.member_id);
  await expect(page.getByText("Definition created.")).toBeVisible();
  let definition = await definitionByFqn(page, fqn);
  const row = definitionRow(page, definition);
  await expect(row).toContainText("Every 1 month");

  const occurrencesResponse = await page.request.get(
    `/api/recurring-occurrences?recurring_definition_id=${definition.recurring_definition_id}&limit=500&offset=0`,
  );
  expect(occurrencesResponse.ok(), await occurrencesResponse.text()).toBe(true);
  await expect
    .poll(async () => {
      const response = await page.request.get(
        `/api/recurring-occurrences?recurring_definition_id=${definition.recurring_definition_id}&limit=500&offset=0`,
      );
      const body = (await response.json()) as {
        readonly recurring_occurrences: readonly unknown[];
      };
      return body.recurring_occurrences.length;
    })
    .toBeGreaterThan(0);

  await row.click();
  const editPanel = page.getByRole("complementary", {
    name: "Edit recurring definition",
  });
  const everyInput = editPanel.getByLabel("Every");
  await everyInput.selectText();
  await everyInput.pressSequentially("2");
  await expect(everyInput).toHaveValue("2");
  await everyInput.press("Tab");
  await expect(everyInput).toHaveValue("2");
  await editPanel.getByRole("button", { name: "Save definition" }).click();
  await expect(page.getByText("Definition updated.")).toBeVisible();
  definition = await definitionByFqn(page, fqn);
  expect(definition.definition_version).toBe(2);
  await expect(definitionRow(page, definition)).toContainText(
    "Every 2 months",
    { timeout: 10_000 },
  );

  await selectDefinitionAction(page, definitionRow(page, definition), "Pause");
  await expect(page.getByText("Definition paused.")).toBeVisible();
  definition = await definitionByFqn(page, fqn);
  expect(definition.paused_at).not.toBeNull();
  await selectDefinitionAction(page, definitionRow(page, definition), "Resume");
  await expect(page.getByText("Definition resumed.")).toBeVisible();
  definition = await definitionByFqn(page, fqn);
  expect(definition.paused_at).toBeNull();

  const beforeDefer = definition.next_due_date;
  await selectDefinitionAction(page, definitionRow(page, definition), "Defer");
  await page.getByRole("button", { name: "Defer definition" }).click();
  await expect(page.getByText("Next occurrence deferred.")).toBeVisible();
  definition = await definitionByFqn(page, fqn);
  expect(definition.next_due_date).not.toBe(beforeDefer);

  await selectDefinitionAction(
    page,
    definitionRow(page, definition),
    "Cancel definition",
  );
  await expect(
    page.getByRole("alertdialog", { name: "Cancel recurring definition" }),
  ).toContainText(fqn);
  await page.getByRole("button", { name: "Cancel definition" }).last().click();
  await expect(page.getByText("Definition cancelled.")).toBeVisible();
  await expect(definitionRow(page, definition)).toHaveCount(0);
});

test("definition editor gates unbalanced saves, maps row errors, and confirms next", async ({
  page,
}, testInfo) => {
  await page.goto("/recurring");
  const fqn = uniqueName(`${testInfo.project.name}Errors`);
  const editor = await completeEditor(page, fqn);
  const records = editor.getByLabel("Definition records").locator("section");
  await records.nth(1).getByLabel("Amount").fill("10");
  await editor.getByRole("button", { name: "Save definition" }).click();
  await expect(
    editor.getByText("Every currency must balance to zero."),
  ).toBeVisible();
  await records.nth(1).getByLabel("Amount").fill("12.34");
  await page.route("**/api/recurring-definitions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: "invalid_request",
          message: "records[0] account is invalid",
        },
      }),
      contentType: "application/json",
      status: 400,
    });
  });
  await editor.getByRole("button", { name: "Save definition" }).click();
  await expect(
    editor.locator("[role=alert]").filter({
      hasText: "records[0] account is invalid",
    }),
  ).toBeVisible();
  await page.unroute("**/api/recurring-definitions");
  await editor.getByRole("button", { name: "Save definition" }).click();
  await expect(page.getByText("Definition created.")).toBeVisible();
  const definition = await definitionByFqn(page, fqn);
  await selectDefinitionAction(
    page,
    definitionRow(page, definition),
    "Confirm next",
  );
  await expect(page.getByText("Next occurrence confirmed.")).toBeVisible();
  const response = await page.request.get(
    `/api/recurring-occurrences?recurring_definition_id=${definition.recurring_definition_id}&limit=500&offset=0`,
  );
  expect(response.ok(), await response.text()).toBe(true);
  const body = (await response.json()) as {
    readonly recurring_occurrences: readonly {
      readonly generated_transaction_id: number | null;
      readonly status: string;
    }[];
  };
  const confirmed = body.recurring_occurrences.find(
    (occurrence) => occurrence.status === "confirmed",
  );
  expect(confirmed).toBeDefined();
  expect(confirmed?.generated_transaction_id).not.toBeNull();
  const deleteResponse = await page.request.delete(
    `/api/transactions/${confirmed?.generated_transaction_id}`,
  );
  expect(deleteResponse.ok(), await deleteResponse.text()).toBe(true);
});

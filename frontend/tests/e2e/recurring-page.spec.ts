import { expect, type Locator, type Page, test } from "@playwright/test";

interface DefinitionFixture {
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
  await editor.getByLabel("Definition FQN").fill(fqn);
  const records = editor.getByLabel("Definition records").locator("section");
  const first = records.nth(0);
  const second = records.nth(1);
  await first.getByLabel("Account").fill("checking:Chase:Joint");
  await first.getByLabel("Account").press("Enter");
  await first.getByLabel("Amount").fill("-12.34");
  await first.getByLabel("Category").fill("Entertainment:Books");
  await first.getByLabel("Category").press("Enter");
  await second.getByLabel("Account").fill("merchant:Books");
  await second.getByLabel("Account").press("Enter");
  await second.getByLabel("Amount").fill("12.34");
  await second.getByLabel("Category").fill("Entertainment:Books");
  await second.getByLabel("Category").press("Enter");
  return editor;
};

test("recurring definitions table renders seeded definitions and schedule details", async ({
  page,
}) => {
  await page.goto("/recurring");
  await expect(page.getByRole("heading", { name: "Recurring" })).toBeVisible();
  const table = page.getByTestId("recurring-definitions-table");
  await expect(table).toBeVisible();
  await expect(table.getByTestId("recurring-definition-row")).toHaveCount(4);
  await expect(table).toContainText("Household:Mortgage");
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

test("recurring definitions create, edit, pause, defer, resume, and cancel", async ({
  page,
}, testInfo) => {
  await page.goto("/recurring");
  const fqn = uniqueName(testInfo.project.name);
  const editor = await completeEditor(page, fqn);
  const save = editor.getByRole("button", { name: "Save definition" });
  await expect(save).toBeEnabled();
  await save.click();
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
  await editPanel.getByLabel("Every").fill("2");
  await editPanel.getByRole("button", { name: "Save definition" }).click();
  await expect(page.getByText("Definition updated.")).toBeVisible();
  definition = await definitionByFqn(page, fqn);
  expect(definition.definition_version).toBe(2);
  await expect(definitionRow(page, definition)).toContainText("Every 2 months");

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

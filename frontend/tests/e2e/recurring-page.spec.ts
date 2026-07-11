import { expect, type Page, test } from "@playwright/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly fqn: string;
}

interface RecurringDefinitionFixture {
  readonly recurring_definition_id: number;
  readonly fqn: string;
}

interface RecurringOccurrenceFixture {
  readonly generated_transaction_id: number | null;
  readonly recurring_definition_fqn: string;
  readonly recurring_occurrence_id: number;
  readonly recurring_definition_id: number;
  readonly scheduled_date: string;
  readonly status: string;
}

interface RecurringReviewFixture {
  readonly due: RecurringDefinitionFixture;
  readonly dueOccurrence: RecurringOccurrenceFixture;
  readonly dueMerchant: AccountFixture;
  readonly overdue: RecurringDefinitionFixture;
  readonly overdueDate: string;
  readonly overdueOccurrence: RecurringOccurrenceFixture;
  readonly overdueMerchant: AccountFixture;
  readonly slug: string;
  readonly today: string;
}

const formatLocalDate = (date: Date): string =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0"),
    )
    .join("-");

const uniqueSlug = (label: string, projectName: string): string =>
  `${label}${projectName.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;

const createAccount = async (
  page: Page,
  fqn: string,
  accountType: "balance" | "flow",
  currency?: string,
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency,
      fqn,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as AccountFixture;
};

const createCategory = async (
  page: Page,
  fqn: string,
): Promise<CategoryFixture> => {
  const response = await page.request.post("/api/categories", {
    data: {
      economic_intent: "expense",
      fqn,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as CategoryFixture;
};

const createRecurringDefinition = async (
  page: Page,
  params: {
    readonly amount: string;
    readonly anchorDate: string;
    readonly category: CategoryFixture;
    readonly checking: AccountFixture;
    readonly fqn: string;
    readonly merchant: AccountFixture;
    readonly memoPrefix: string;
  },
): Promise<RecurringDefinitionFixture> => {
  const response = await page.request.post("/api/recurring-definitions", {
    data: {
      anchor_date: params.anchorDate,
      fqn: params.fqn,
      schedule_rule: {
        every: 1,
        kind: "interval",
        unit: "YEAR",
        version: 1,
      },
      records: [
        {
          account_id: params.checking.account_id,
          amount: `-${params.amount}`,
          category_id: params.category.category_id,
          currency: "USD",
          memo: `${params.memoPrefix} funding`,
          tag_ids: [],
        },
        {
          account_id: params.merchant.account_id,
          amount: params.amount,
          category_id: params.category.category_id,
          currency: "USD",
          memo: `${params.memoPrefix} merchant`,
          tag_ids: [],
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as RecurringDefinitionFixture;
};

const waitForExpectedOccurrences = async (
  page: Page,
  definitions: readonly RecurringDefinitionFixture[],
): Promise<ReadonlyMap<number, RecurringOccurrenceFixture>> => {
  const expectedDefinitionIds = new Set(
    definitions.map((definition) => definition.recurring_definition_id),
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await page.request.get(
      "/api/recurring-occurrences?limit=500&offset=0&sort=scheduled_date&sort_dir=asc&status=expected",
    );
    if (response.ok()) {
      const body = (await response.json()) as {
        readonly recurring_occurrences: readonly RecurringOccurrenceFixture[];
      };
      const seenDefinitionIds = new Set(
        body.recurring_occurrences
          .filter((occurrence) => occurrence.status === "expected")
          .map((occurrence) => occurrence.recurring_definition_id),
      );
      if (
        [...expectedDefinitionIds].every((definitionId) =>
          seenDefinitionIds.has(definitionId),
        )
      ) {
        return new Map(
          body.recurring_occurrences
            .filter((occurrence) =>
              expectedDefinitionIds.has(occurrence.recurring_definition_id),
            )
            .map((occurrence) => [
              occurrence.recurring_definition_id,
              occurrence,
            ]),
        );
      }
    }
    await page.waitForTimeout(150);
  }

  throw new Error("Expected recurring occurrences were not materialized.");
};

const dismissExpectedOccurrences = async (
  page: Page,
  definitions: readonly RecurringDefinitionFixture[],
) => {
  const expectedDefinitionIds = new Set(
    definitions.map((definition) => definition.recurring_definition_id),
  );
  const response = await page.request.get(
    "/api/recurring-occurrences?limit=500&offset=0&sort=scheduled_date&sort_dir=asc&status=expected",
  );
  expect(response.ok(), await response.text()).toBe(true);
  const body = (await response.json()) as {
    readonly recurring_occurrences: readonly RecurringOccurrenceFixture[];
  };
  for (const occurrence of body.recurring_occurrences) {
    if (!expectedDefinitionIds.has(occurrence.recurring_definition_id)) {
      continue;
    }
    const dismissResponse = await page.request.post(
      `/api/recurring-occurrences/${occurrence.recurring_occurrence_id}/dismiss`,
    );
    expect(dismissResponse.ok(), await dismissResponse.text()).toBe(true);
  }
};

const deleteGeneratedTransaction = async (
  page: Page,
  occurrence: RecurringOccurrenceFixture,
) => {
  expect(occurrence.generated_transaction_id).not.toBeNull();
  const response = await page.request.delete(
    `/api/transactions/${occurrence.generated_transaction_id}`,
  );
  expect(response.ok(), await response.text()).toBe(true);
};

const seedRecurringReviewFixture = async (
  page: Page,
  projectName: string,
): Promise<RecurringReviewFixture> => {
  const slug = uniqueSlug("RecurringReview", projectName);
  const testRunDate = new Date();
  const today = formatLocalDate(testRunDate);
  const overdueDate = formatLocalDate(
    new Date(
      testRunDate.getFullYear(),
      testRunDate.getMonth(),
      testRunDate.getDate() - 1,
    ),
  );
  const checking = await createAccount(
    page,
    `e2e:${slug}:Checking`,
    "balance",
    "USD",
  );
  const overdueMerchant = await createAccount(
    page,
    `e2e:${slug}:OverdueMerchant`,
    "flow",
  );
  const dueMerchant = await createAccount(
    page,
    `e2e:${slug}:DueMerchant`,
    "flow",
  );
  const category = await createCategory(page, `e2e:${slug}:Recurring`);
  const overdue = await createRecurringDefinition(page, {
    amount: "12.34000000",
    anchorDate: overdueDate,
    category,
    checking,
    fqn: `E2E:${slug}:Overdue`,
    merchant: overdueMerchant,
    memoPrefix: `${slug} overdue`,
  });
  const due = await createRecurringDefinition(page, {
    amount: "56.78000000",
    anchorDate: today,
    category,
    checking,
    fqn: `E2E:${slug}:Due`,
    merchant: dueMerchant,
    memoPrefix: `${slug} due`,
  });
  const occurrencesByDefinitionId = await waitForExpectedOccurrences(page, [
    overdue,
    due,
  ]);
  const overdueOccurrence = occurrencesByDefinitionId.get(
    overdue.recurring_definition_id,
  );
  const dueOccurrence = occurrencesByDefinitionId.get(
    due.recurring_definition_id,
  );
  expect(overdueOccurrence).toBeDefined();
  expect(dueOccurrence).toBeDefined();

  return {
    due,
    dueOccurrence: dueOccurrence as RecurringOccurrenceFixture,
    dueMerchant,
    overdue,
    overdueDate,
    overdueOccurrence: overdueOccurrence as RecurringOccurrenceFixture,
    overdueMerchant,
    slug,
    today,
  };
};

const recurringOccurrenceRow = (
  page: Page,
  occurrence: RecurringOccurrenceFixture,
) =>
  page.locator(
    `[data-recurring-occurrence-id="${occurrence.recurring_occurrence_id}"]`,
  );

const expectFixtureRows = async (
  page: Page,
  fixture: RecurringReviewFixture,
) => {
  const overdueRow = page
    .getByTestId("recurring-review-row")
    .and(recurringOccurrenceRow(page, fixture.overdueOccurrence));
  const dueRow = page
    .getByTestId("recurring-review-row")
    .and(recurringOccurrenceRow(page, fixture.dueOccurrence));
  await expect(overdueRow).toHaveCount(1);
  await expect(dueRow).toHaveCount(1);

  const fixtureRowIds = await page
    .getByTestId("recurring-review-row")
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-recurring-occurrence-id")),
    );
  const overdueIndex = fixtureRowIds.indexOf(
    String(fixture.overdueOccurrence.recurring_occurrence_id),
  );
  const dueIndex = fixtureRowIds.indexOf(
    String(fixture.dueOccurrence.recurring_occurrence_id),
  );
  expect(overdueIndex).toBeGreaterThanOrEqual(0);
  expect(dueIndex).toBeGreaterThanOrEqual(0);
  expect(
    fixture.overdueOccurrence.scheduled_date <=
      fixture.dueOccurrence.scheduled_date,
  ).toBe(true);
  expect(overdueIndex).toBeLessThan(dueIndex);

  return { dueRow, overdueRow };
};

test("recurring page renders seeded demo occurrences", async ({ page }) => {
  const response = await page.request.get(
    "/api/recurring-occurrences?limit=500&offset=0&sort=scheduled_date&sort_dir=asc&status=expected",
  );
  expect(response.ok(), await response.text()).toBe(true);
  const body = (await response.json()) as {
    readonly recurring_occurrences: readonly RecurringOccurrenceFixture[];
  };
  const mortgageOccurrence = body.recurring_occurrences.find(
    (occurrence) =>
      occurrence.recurring_definition_fqn === "Household:Mortgage" &&
      occurrence.status === "expected",
  );
  expect(
    mortgageOccurrence,
    "Expected seeded Mortgage occurrence was not materialized.",
  ).toBeDefined();

  await page.goto("/recurring");

  const rows = page.getByTestId("recurring-review-row");
  const mortgageRow = rows.and(
    recurringOccurrenceRow(page, mortgageOccurrence!),
  );
  await expect(mortgageRow).toHaveCount(1);
  await expect(mortgageRow).toContainText("Mortgage");
  await expect(mortgageRow.getByRole("img", { name: "Overdue" })).toBeVisible();
});

test("recurring page reviews expected occurrences", async ({
  page,
}, testInfo) => {
  const fixture = await seedRecurringReviewFixture(page, testInfo.project.name);

  await page.goto("/recurring");
  await expect(page.getByRole("heading", { name: "Recurring" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Recurring" })).toBeVisible();

  await page.goto("/overview");
  await page
    .getByLabel("Primary")
    .getByRole("link", { name: "Recurring" })
    .click();
  await expect(page).toHaveURL(/\/recurring$/);

  const { dueRow, overdueRow } = await expectFixtureRows(page, fixture);
  await expect(overdueRow).toContainText("Overdue");
  await expect(overdueRow.getByLabel("Overdue")).toBeVisible();
  await expect(dueRow).toContainText("Due");
  await expect(dueRow.getByLabel("Overdue")).toHaveCount(0);

  await overdueRow.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Occurrence confirmed.")).toBeVisible();
  await expect(overdueRow).toHaveCount(0);

  await page.goto(
    `/transactions?q=${encodeURIComponent(fixture.overdueMerchant.fqn.split(":").at(-1) ?? fixture.slug)}`,
  );
  await expect(page.locator("[data-transaction-row='true']")).toHaveCount(1);
  await expect(
    page.locator("[data-transaction-row='true']").first(),
  ).toContainText("OverdueMerchant");
  await deleteGeneratedTransaction(page, fixture.overdueOccurrence);

  await page.goto("/recurring");
  const remainingDueRow = page
    .getByTestId("recurring-review-row")
    .and(recurringOccurrenceRow(page, fixture.dueOccurrence));
  await expect(remainingDueRow).toHaveCount(1);
  await remainingDueRow.getByRole("button", { name: "Dismiss" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Dismiss occurrence" }),
  ).toContainText(fixture.due.fqn);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(remainingDueRow).toHaveCount(1);

  await remainingDueRow.getByRole("button", { name: "Dismiss" }).click();
  await page.getByRole("button", { name: "Dismiss occurrence" }).click();
  await expect(page.getByText("Occurrence dismissed.")).toBeVisible();
  await expect(remainingDueRow).toHaveCount(0);
});

test("recurring page renders confirm API failures", async ({
  page,
}, testInfo) => {
  const fixture = await seedRecurringReviewFixture(
    page,
    `${testInfo.project.name}Failure`,
  );
  await page.route("**/api/recurring-occurrences/*/confirm", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 400,
      body: JSON.stringify({
        error: {
          code: "invalid_request",
          message: "Injected confirm failure",
        },
      }),
    });
  });

  await page.goto("/recurring");
  const { overdueRow } = await expectFixtureRows(page, fixture);
  await overdueRow.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Occurrence action failed.",
  );
  await expect(page.getByRole("alert")).toContainText(
    "Injected confirm failure",
  );
  await expect(overdueRow).toHaveCount(1);
  await dismissExpectedOccurrences(page, [fixture.overdue, fixture.due]);
});

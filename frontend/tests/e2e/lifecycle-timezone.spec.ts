import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
}

interface CategoryFixture {
  readonly category_id: number;
}

interface TransactionFixture {
  readonly transaction_id: number;
}

interface TransactionDetailFixture extends TransactionFixture {
  readonly records: readonly {
    readonly posted_date: string | null;
  }[];
}

test.use({ timezoneId: "America/Los_Angeles" });

const createAccount = async (
  page: Page,
  fqn: string,
  accountType: "flow" | "owned",
  currency?: string,
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency,
      fqn,
    },
  });
  const body = await response.text();
  expect(response.ok(), body).toBe(true);
  return JSON.parse(body) as AccountFixture;
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
  const body = await response.text();
  expect(response.ok(), body).toBe(true);
  return JSON.parse(body) as CategoryFixture;
};

const openTransactionDetail = async (
  page: Page,
  transactionId: number,
): Promise<Locator> => {
  await page.goto(`/transactions?transaction=${transactionId}`);
  const panel = page.getByTestId("transaction-detail-panel");
  await expect(panel).toBeVisible();
  return panel;
};

const lifecycleStage = (panel: Locator, label: string): Locator =>
  panel
    .getByTestId("transaction-lifecycle")
    .getByRole("listitem")
    .filter({ hasText: label });

const firstRecordDisclosure = async (panel: Locator): Promise<Locator> => {
  const row = panel.locator("tr[data-detail-record-row='true']").first();
  await row.click();
  const disclosure = row.locator("xpath=following-sibling::tr[1]");
  await expect(disclosure).toBeVisible();
  return disclosure;
};

test("lifecycle markers stay civil while real instants cross the local day boundary", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const initiatedDate = "2026-07-27";
  const realInstant = "2026-07-27T01:00:00Z";
  const [fundingAccount, merchantAccount, category] = await Promise.all([
    createAccount(
      page,
      `e2e:LifecycleTimezone:${unique}:Funding`,
      "owned",
      "USD",
    ),
    createAccount(page, `e2e:LifecycleTimezone:${unique}:Merchant`, "flow"),
    createCategory(page, `E2E:LifecycleTimezone:${unique}`),
  ]);

  const directResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: initiatedDate,
      memo: `E2E lifecycle day marker ${unique}`,
    },
  });
  const directBody = await directResponse.text();
  expect(directResponse.ok(), directBody).toBe(true);
  const direct = JSON.parse(directBody) as TransactionFixture;

  const instantResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: initiatedDate,
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-7.00",
          category_id: null,
          currency: "USD",
          memo: `E2E lifecycle real instant ${unique}`,
          pending_date: realInstant,
          posted_date: null,
          posting_status: "pending",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "7.00",
          category_id: category.category_id,
          currency: "USD",
          memo: `E2E lifecycle real instant ${unique}`,
          pending_date: realInstant,
          posted_date: null,
          posting_status: "pending",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  const instantBody = await instantResponse.text();
  expect(instantResponse.ok(), instantBody).toBe(true);
  const instant = JSON.parse(instantBody) as TransactionFixture;

  const labels = await page.evaluate(
    ({ instantValue, markerDate }) => ({
      exactInstant: new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(instantValue)),
      marker: new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
      }).format(
        new Date(
          Number(markerDate.slice(0, 4)),
          Number(markerDate.slice(5, 7)) - 1,
          Number(markerDate.slice(8, 10)),
        ),
      ),
    }),
    { instantValue: realInstant, markerDate: initiatedDate },
  );

  const directBeforeResponse = await page.request.get(
    `/api/transactions/${direct.transaction_id}`,
  );
  const directBeforeBody = await directBeforeResponse.text();
  expect(directBeforeResponse.ok(), directBeforeBody).toBe(true);
  const directBefore = JSON.parse(directBeforeBody) as TransactionDetailFixture;

  await page.goto("/transactions?page=1&pageSize=50&hideExpected=true");
  const directRow = page
    .locator("[data-transaction-row='true']")
    .filter({ hasText: `E2E lifecycle day marker ${unique}` });
  await expect(directRow).toBeVisible();
  await directRow.locator("td").nth(3).click();
  const directRecords = page.getByTestId("expanded-records");
  const datesCell = directRecords.getByTestId("record-dates-cell").first();
  await expect(datesCell).toContainText(`posted ${initiatedDate}`);
  await datesCell.getByRole("button", { name: "Edit dates" }).click();
  const datesEditor = directRecords.getByTestId("record-dates-editor").first();
  await expect(datesEditor.getByLabel("Posted")).toHaveValue(initiatedDate);
  await datesEditor.getByRole("button", { name: "Save" }).click();
  await expect(datesEditor).toHaveCount(0);

  const directAfterResponse = await page.request.get(
    `/api/transactions/${direct.transaction_id}`,
  );
  const directAfterBody = await directAfterResponse.text();
  expect(directAfterResponse.ok(), directAfterBody).toBe(true);
  const directAfter = JSON.parse(directAfterBody) as TransactionDetailFixture;
  expect(directAfter.records.map((record) => record.posted_date)).toEqual(
    directBefore.records.map((record) => record.posted_date),
  );

  const directPanel = await openTransactionDetail(page, direct.transaction_id);
  await expect(lifecycleStage(directPanel, "Initiated")).toContainText(
    "Jul 27",
  );
  const postedStage = lifecycleStage(directPanel, "Posted");
  await expect(postedStage).toContainText("Jul 27");
  await postedStage.locator("[data-slot='tooltip-trigger']").hover();
  const markerTooltip = page.getByRole("tooltip");
  await expect(markerTooltip).toContainText(labels.marker);
  await expect(markerTooltip).not.toContainText(/\d{1,2}:\d{2}/);
  const markerDisclosure = await firstRecordDisclosure(directPanel);
  await expect(markerDisclosure).toContainText(labels.marker);
  await expect(markerDisclosure).not.toContainText(/\d{1,2}:\d{2}/);
  await expect(directPanel).not.toContainText("Invalid Date");

  const instantPanel = await openTransactionDetail(
    page,
    instant.transaction_id,
  );
  await expect(lifecycleStage(instantPanel, "Initiated")).toContainText(
    "Jul 27",
  );
  const pendingStage = lifecycleStage(instantPanel, "Pending");
  await expect(pendingStage).toContainText("Jul 26");
  await pendingStage.locator("[data-slot='tooltip-trigger']").hover();
  await expect(page.getByRole("tooltip")).toContainText(labels.exactInstant);
  await expect(page.getByRole("tooltip")).toContainText(/\d{1,2}:\d{2}/);
  const instantDisclosure = await firstRecordDisclosure(instantPanel);
  await expect(instantDisclosure).toContainText(labels.exactInstant);
  await expect(instantPanel).not.toContainText("Invalid Date");
});

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

const firstRecordDisclosure = async (panel: Locator): Promise<Locator> => {
  const row = panel.locator("tr[data-detail-record-row='true']").first();
  await row.click();
  const disclosure = row.locator("xpath=following-sibling::tr[1]");
  await expect(disclosure).toBeVisible();
  return disclosure;
};

test("end-of-day lifecycle stamps stay on the initiated day while exact instants render locally", async ({
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
      memo: `E2E lifecycle end of day ${unique}`,
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

  const derivedStamp = `${initiatedDate}T23:59:59Z`;
  const labels = await page.evaluate(
    ({ derivedValue, instantValue }) => ({
      derivedInstant: new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(derivedValue)),
      exactInstant: new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(instantValue)),
    }),
    { derivedValue: derivedStamp, instantValue: realInstant },
  );

  await page.goto("/transactions?page=1&pageSize=50&hideExpected=true");
  const directRow = page
    .locator("[data-transaction-row='true']")
    .filter({ hasText: `E2E lifecycle end of day ${unique}` });
  const pendingRow = page
    .locator("[data-transaction-row='true']")
    .filter({ hasText: `E2E lifecycle real instant ${unique}` });
  await expect(directRow).toBeVisible();
  await expect(pendingRow).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Status" })).toHaveCount(
    0,
  );
  await expect(
    directRow.getByTestId("transaction-status-indicators"),
  ).toHaveCount(0);
  const pendingIndicators = pendingRow.getByTestId(
    "transaction-status-indicators",
  );
  await expect(pendingIndicators).toHaveAttribute(
    "data-posting-status",
    "pending",
  );
  await expect(
    pendingIndicators.getByRole("img", { name: "Pending" }),
  ).toBeVisible();
  await expect(
    pendingRow
      .locator(".transactions-description-column")
      .getByTestId("transaction-status-indicators"),
  ).toBeVisible();
  const [directRowHeight, pendingRowHeight] = await Promise.all([
    directRow.evaluate((row) => row.getBoundingClientRect().height),
    pendingRow.evaluate((row) => row.getBoundingClientRect().height),
  ]);
  expect(Math.abs(directRowHeight - pendingRowHeight)).toBeLessThanOrEqual(1);

  const directPanel = await openTransactionDetail(page, direct.transaction_id);
  const directLifecycle = directPanel.getByTestId("transaction-lifecycle");
  await expect(directLifecycle).toHaveText(/Initiated\s*Jul 27/);
  await expect(directLifecycle).not.toContainText(
    /expected|pending|posted|cancelled/i,
  );
  await expect(
    directLifecycle.locator("[data-slot='tooltip-trigger']"),
  ).toHaveCount(0);
  const derivedDisclosure = await firstRecordDisclosure(directPanel);
  await expect(derivedDisclosure).toContainText(labels.derivedInstant);
  await expect(derivedDisclosure).toContainText(/\d{1,2}:\d{2}:\d{2}/);
  await expect(directPanel).not.toContainText("Invalid Date");

  const instantPanel = await openTransactionDetail(
    page,
    instant.transaction_id,
  );
  const instantLifecycle = instantPanel.getByTestId("transaction-lifecycle");
  await expect(instantLifecycle).toHaveText(/Initiated\s*Jul 27\s*pending/);
  await expect(instantLifecycle).not.toContainText(/Jul 26|Posted|varies|→|–/);
  const instantDisclosure = await firstRecordDisclosure(instantPanel);
  await expect(instantDisclosure).toContainText(labels.exactInstant);
  await expect(instantDisclosure).toContainText(/\d{1,2}:\d{2}:\d{2}/);
  await expect(instantPanel).not.toContainText("Invalid Date");
});

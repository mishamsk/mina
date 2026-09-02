import { expect, type Page } from "@playwright/test";
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

const formatBrowserTimestamp = async (
  page: Page,
  value: string,
): Promise<string> =>
  page.evaluate(
    (timestamp) =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(timestamp)),
    value,
  );

test("settlement timestamps render locally while initiated dates remain civil", async ({
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
          settlement: {
            pending_date: realInstant,
            posted_date: null,
            status: "pending",
          },
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
          settlement: null,
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
  const expectedPendingTimestamp = await formatBrowserTimestamp(
    page,
    realInstant,
  );

  await page.goto(`/transactions?transaction=${instant.transaction_id}`);
  const panel = page.getByTestId("transaction-detail-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("transaction-lifecycle")).toHaveText(
    /Initiated\s*Jul 27/,
  );

  const record = panel.locator("tr[data-detail-record-row='true']").first();
  await record.click();
  const disclosure = record.locator("xpath=following-sibling::tr[1]");
  await expect(disclosure).toBeVisible();
  const pendingTimestamp = disclosure
    .locator("dt", { hasText: /^Pending$/ })
    .locator("xpath=following-sibling::dd[1]");
  await expect(pendingTimestamp).toHaveText(expectedPendingTimestamp);
  await expect(pendingTimestamp).toContainText("Jul 26");
});

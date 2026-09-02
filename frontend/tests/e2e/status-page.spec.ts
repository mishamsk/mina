import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

const createAccount = async (
  page: Page,
  fqn: string,
  accountType: "flow" | "owned",
  isFeatured = false,
): Promise<void> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency: "USD",
      fqn,
      is_featured: isFeatured,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
};

const createCategory = async (page: Page, fqn: string): Promise<void> => {
  const response = await page.request.post("/api/categories", {
    data: {
      economic_intent: "expense",
      fqn,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
};

const selectEntity = async (
  page: Page,
  label: string,
  searchText: string,
  optionText: string,
): Promise<void> => {
  const picker = page.getByRole("combobox", { name: label });
  await picker.fill(searchText);
  const displayTitle = optionText.split(":").slice(-2).join(":");
  const option = page
    .getByRole("option")
    .filter({ hasText: displayTitle })
    .first();
  await expect(option).toBeVisible();
  await option.click();
};

test("primary navigation opens real status health", async ({ page }) => {
  await page.goto("/overview");
  await page
    .getByLabel("Primary")
    .getByRole("link", { name: "Status" })
    .click();

  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
  await page.getByRole("button", { name: "Server info" }).click();
  await expect(page.getByRole("dialog", { name: "Server info" })).toBeVisible();
  await expect(page.getByText("ok", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Database encryption", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Not encrypted", { exact: true })).toBeVisible();
});

test("status starts and opens an audit-log compaction run", async ({
  page,
}) => {
  await page.goto("/status");
  await page.getByRole("combobox", { name: "Operation" }).click();
  await page.getByTestId("select-option-audit-log-compaction").click();
  await page.getByRole("button", { name: "Run now" }).click();

  await expect(page).toHaveURL((url) => {
    const run = url.searchParams.get("run");
    return (
      url.pathname === "/status" &&
      url.searchParams.get("operation") === "audit-log-compaction" &&
      run !== null &&
      /^\d+$/.test(run)
    );
  });
  const detail = page.getByTestId("operation-run-detail");
  await expect(detail).toContainText("API audit-log compaction");
  await expect(detail).toContainText("Expired audit-history deletion");
});

test("audit log opens a mutation made through the web UI", async ({ page }) => {
  const memberName = "E2E visible audit member";
  await page.goto("/members");
  await page.getByRole("button", { name: "New member" }).click();
  const panel = page.getByRole("dialog", { name: "Create member" });
  await panel.getByLabel("Name").fill(memberName);
  await panel.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Member created.")).toBeVisible();

  await page
    .getByLabel("Primary")
    .getByRole("link", { name: "Status" })
    .click();
  await page.getByRole("tab", { name: "Audit log" }).click();
  await page.getByRole("combobox", { name: "Surface filter" }).click();
  await page.getByTestId("select-option-web-ui").click();

  const auditRow = page
    .getByTestId("audit-log-table")
    .locator("tbody tr")
    .filter({ hasText: "createMember" })
    .first();
  await expect(auditRow).toContainText("web-ui");
  await auditRow.click();
  await expect(page).toHaveURL(/[?&]auditEntry=\d+(?:&|$)/);
  const detail = page.getByTestId("audit-entry-detail");
  await expect(detail).toContainText("createMember");
  await expect(detail).toContainText("web-ui");
});

test("transaction save updates the featured balance strip", async ({
  page,
}) => {
  const fundingFqn = "e2e:featured:StripWallet";
  const merchantFqn = "e2e:featured:StripMerchant";
  const categoryFqn = "E2E:Featured:StripExpense";
  await createAccount(page, fundingFqn, "owned", true);
  await createAccount(page, merchantFqn, "flow");
  await createCategory(page, categoryFqn);

  await page.goto("/transactions");
  const featuredRow = page
    .getByTestId("featured-balance-row")
    .filter({ hasText: "StripWallet" });
  await expect(featuredRow.getByTestId("featured-balance-amount")).toHaveText(
    "0.00 $",
  );

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await page.getByLabel("Date").fill("2026-04-01");
  await selectEntity(page, "Funding account", "StripWallet", fundingFqn);
  await selectEntity(page, "Merchant", "StripMerchant", merchantFqn);
  await selectEntity(page, "Category", "StripExpense", categoryFqn);
  await page.getByLabel("Amount").fill("12.34");
  await page.getByRole("button", { name: "Save and add another" }).click();

  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await expect(featuredRow.getByTestId("featured-balance-amount")).toHaveText(
    "-12.34 $",
  );
});

import { expect, type Page, test } from "@playwright/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface CategoryFixture {
  readonly category_id: number;
  readonly fqn: string;
}

const waitForStatusDetailsPreference = async (page: Page) => {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const openRequest = indexedDB.open("mina-ui-state");
        openRequest.onerror = () => {
          reject(new Error("mina-ui-state could not be opened"));
        };
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction(
            "status_page_ui_state",
            "readonly",
          );
          const getRequest = transaction
            .objectStore("status_page_ui_state")
            .get("status-page");

          getRequest.onerror = () => {
            reject(new Error("status page state could not be read"));
          };
          getRequest.onsuccess = () => {
            const result = getRequest.result as
              { readonly showDetails?: unknown } | undefined;
            resolve(result?.showDetails === true);
          };
        };
      }),
  );
};

const createAccount = async (
  page: Page,
  fqn: string,
  accountType: "balance" | "flow",
  currency?: string,
  isFeatured = false,
): Promise<AccountFixture> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: accountType,
      currency,
      fqn,
      is_featured: isFeatured,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as AccountFixture;
};

const updateAccountFeatured = async (
  page: Page,
  account: AccountFixture,
  isFeatured: boolean,
): Promise<void> => {
  const response = await page.request.patch(
    `/api/accounts/${account.account_id}`,
    {
      data: {
        is_featured: isFeatured,
      },
    },
  );
  expect(response.ok()).toBe(true);
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
  expect(response.ok()).toBe(true);
  return (await response.json()) as CategoryFixture;
};

const chooseOptionByKeyboard = async (
  page: Page,
  label: string,
  searchText: string,
  optionValue: string,
) => {
  const picker = page.getByRole("combobox", { name: label });
  await picker.click();
  await expect(picker).toBeFocused();
  await picker.fill("");
  await picker.fill(searchText);
  await expect(picker).toHaveValue(searchText);
  const optionListId = await picker.getAttribute("aria-controls");
  expect(optionListId).not.toBeNull();
  const optionList = page.locator(`#${optionListId}`);
  const optionByValue = optionList
    .getByRole("option")
    .filter({ hasText: optionValue });
  await expect
    .poll(async () => await optionByValue.count(), { timeout: 10000 })
    .toBeGreaterThan(0);
  const option = optionByValue.first();
  await expect(option).toBeVisible({ timeout: 10000 });
  const optionId = (await option.getAttribute("id")) ?? "";
  await picker.press("ArrowDown");
  await picker.press("ArrowUp");
  await expect(picker).toHaveAttribute("aria-activedescendant", optionId);
  await picker.press("Enter");
  await expect.poll(async () => picker.inputValue()).toContain(searchText);
};

test("status page reports backend health", async ({ page }) => {
  await page.goto("/status");

  await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
  await expect(page.getByText("API status")).toBeVisible();
  await expect(page.getByText("ok")).toBeVisible();
  await expect(page.getByText("Schema version")).toBeVisible();
  await expect(page.getByText("Server time")).toBeVisible();
  await expect(page.getByText("GMT")).toHaveCount(0);

  await expect(
    page.getByText("Backend health and local UI state for this Mina process."),
  ).toBeHidden();
  await page.getByRole("button", { name: "Status help" }).click();
  await expect(
    page.getByText("Backend health and local UI state for this Mina process."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Backend health and local UI state for this Mina process."),
  ).toBeHidden();
});

test("legacy ui deep links redirect to root routes preserving query", async ({
  page,
}) => {
  await page.goto("/ui/status");

  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();

  await page.goto("/ui/transactions?page=2&pageSize=25");

  await expect(page).toHaveURL(/\/transactions\?page=2&pageSize=25$/);
  await expect(page.getByText("Page 2")).toBeVisible();
});

test("legacy ui redirects keep slash-prefixed paths same-origin", async ({
  request,
}) => {
  const response = await request.get("/ui//example.com/path?q=1", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(308);
  expect(response.headers()["location"]).toBe("/example.com/path?q=1");
});

test("shell renders and navigates between routed pages", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/overview$/);
  const primaryNav = page.getByLabel("Primary");
  await expect(primaryNav).toBeVisible();
  await expect(
    primaryNav.getByRole("button", { name: "New transaction" }),
  ).toBeDisabled();
  await expect(
    primaryNav.getByRole("link", { name: "Overview" }),
  ).toBeVisible();
  await expect(
    primaryNav.getByRole("link", { name: "Transactions" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const balanceStrip = page.getByTestId("featured-balance-strip");
  await expect(balanceStrip).toBeVisible();
  await expect(balanceStrip.getByText("Joint")).toBeVisible();
  await expect(balanceStrip.getByText("Emergency")).toBeVisible();
  await expect(balanceStrip.getByText("Sapphire")).toBeVisible();
  await expect(balanceStrip).not.toContainText("BlueCash");

  await primaryNav.getByRole("link", { name: "Status" }).click();

  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
  await expect(balanceStrip.getByText("Joint")).toBeVisible();

  await primaryNav.getByRole("link", { name: "Transactions" }).click();

  await expect(page).toHaveURL(/\/transactions$/);
  await expect(
    page.getByRole("heading", { name: "Transactions" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(
    primaryNav.getByRole("link", { name: "Transactions" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Settings" })).toBeDisabled();
  await expect(balanceStrip.getByTestId("featured-balance-row")).toHaveCount(0);
  const featuredIcon = balanceStrip.locator("svg").first();
  await expect(featuredIcon).toBeVisible();
  await featuredIcon.hover();
  const featuredTooltip = page
    .getByRole("tooltip")
    .filter({ hasText: "Joint" });
  await expect(featuredTooltip).toContainText("Sapphire");
  await expect(featuredTooltip).toContainText("$");
  await page.mouse.move(0, 0);

  const statusIcon = primaryNav
    .getByRole("link", { name: "Status" })
    .locator("svg")
    .first();
  const settingsIcon = page
    .getByRole("button", { name: "Settings" })
    .locator("svg")
    .first();
  await expect(statusIcon).toBeVisible();
  await expect(settingsIcon).toBeVisible();

  const [statusIconBox, settingsIconBox] = await Promise.all([
    statusIcon.boundingBox(),
    settingsIcon.boundingBox(),
  ]);
  expect(statusIconBox).not.toBeNull();
  expect(settingsIconBox).not.toBeNull();
  expect(
    Math.abs(
      (statusIconBox?.x ?? 0) +
        (statusIconBox?.width ?? 0) / 2 -
        ((settingsIconBox?.x ?? 0) + (settingsIconBox?.width ?? 0) / 2),
    ),
  ).toBeLessThanOrEqual(1);
});

test("featured balance strip follows account metadata and transaction saves", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const featuredLeaf = `Featured${unique}`;
  const featuredFqn = `e2e:featured:${featuredLeaf}`;
  const fundingAccount = await createAccount(
    page,
    featuredFqn,
    "balance",
    "USD",
  );
  const merchantAccount = await createAccount(
    page,
    `e2e:merchant:${unique}`,
    "flow",
    "USD",
  );
  const category = await createCategory(page, `E2E:Featured:${unique}`);

  await page.goto("/transactions?page=1&pageSize=25");
  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  const balanceStrip = page.getByTestId("featured-balance-strip");
  await expect(balanceStrip).not.toContainText(featuredLeaf);

  await updateAccountFeatured(page, fundingAccount, true);
  await page.reload();

  const featuredRow = balanceStrip
    .getByTestId("featured-balance-row")
    .filter({ hasText: featuredLeaf });
  await expect(featuredRow).toContainText("0.00 $");
  const beforeSaveText = await featuredRow.innerText();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(page.getByRole("heading", { name: "New spend" })).toBeVisible();
  await page.getByLabel("Date").fill("2026-04-01");
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    featuredLeaf,
    featuredFqn,
  );
  await chooseOptionByKeyboard(page, "Merchant", unique, merchantAccount.fqn);
  await chooseOptionByKeyboard(page, "Category", unique, category.fqn);
  await page.getByLabel("Amount").fill("12.34");
  await expect(page.getByLabel("Amount")).toHaveValue("12.34");
  await page.getByLabel("Memo").fill(`E2E featured strip ${unique}`);
  await page.getByRole("button", { name: "Save and add another" }).click();

  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await expect.poll(() => featuredRow.innerText()).not.toBe(beforeSaveText);
  await expect(featuredRow).toContainText("-12.34 $");
});

test("status page UI preference survives reload", async ({ page }) => {
  await page.goto("/status");

  const details = page.getByRole("checkbox", { name: "Details" });
  await details.check();
  await expect(page.getByText("Backend health route")).toBeVisible();
  await waitForStatusDetailsPreference(page);

  await page.reload();

  await expect(page.getByRole("checkbox", { name: "Details" })).toBeChecked();
  await expect(page.getByText("Backend health route")).toBeVisible();
});

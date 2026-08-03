import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
  readonly display_label: string;
  readonly display_label_override: string | null;
  readonly fqn: string;
}

const accountTreeAccessibleName = (account: AccountFixture): string =>
  `Open account ${account.fqn}${
    account.display_label_override ? ` (${account.display_label_override})` : ""
  }`;

const listAccounts = async (page: Page): Promise<readonly AccountFixture[]> => {
  const response = await page.request.get(
    "/api/accounts?limit=500&offset=0&sort=fqn&sort_dir=asc",
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    readonly accounts: readonly AccountFixture[];
  };
  return body.accounts;
};

const accountByFqn = (
  accounts: readonly AccountFixture[],
  fqn: string,
): AccountFixture => {
  const account = accounts.find((candidate) => candidate.fqn === fqn);
  expect(account, `${fqn} fixture`).toBeDefined();
  return account as AccountFixture;
};

const expectFqnTooltip = async (
  page: Page,
  label: Locator,
  fqn: string,
): Promise<void> => {
  await label.hover();
  await expect(page.getByRole("tooltip")).toContainText(fqn);
  await page.mouse.move(0, 0);
};

const fillAndExpectValue = async (
  field: Locator,
  value: string,
): Promise<void> => {
  await expect(field).toBeEditable();
  await expect
    .poll(async () => {
      await field.fill(value);
      return field.inputValue();
    })
    .toBe(value);
};

test("contextual account labels disambiguate while account controls keep FQNs", async ({
  page,
}) => {
  test.slow();
  const accounts = await listAccounts(page);
  const flow = accountByFqn(accounts, "merchant:Amazon:flow");
  const giftCard = accountByFqn(accounts, "merchant:Amazon:gift_card");

  await page.goto(
    `/transactions?q=${encodeURIComponent("Amazon gift card purchase")}&page=1&pageSize=25`,
  );
  const transactionRow = page
    .locator("[data-transaction-row]")
    .filter({ hasText: "Amazon gift card purchase" });
  await expect(transactionRow.getByTestId("transaction-line-title")).toHaveText(
    "Amazon:gift_card → Amazon",
  );
  await transactionRow.getByTestId("transaction-line-title").hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "Amazon:gift_card → Amazon",
  );
  await expect(page.getByRole("tooltip")).toContainText(giftCard.fqn);
  await expect(page.getByRole("tooltip")).toContainText(flow.fqn);
  await expect(page.getByRole("tooltip")).toContainText(
    `Accounts: ${giftCard.fqn}; ${flow.fqn}`,
  );
  await page.mouse.move(0, 0);
  await transactionRow.getByTestId("transaction-line-title").click();
  const expandedRecords = page.getByTestId("expanded-records");
  const expandedGiftCard = expandedRecords.getByText("Amazon:gift_card", {
    exact: true,
  });
  const expandedFlow = expandedRecords.getByText("Amazon", { exact: true });
  await expect(expandedGiftCard).toBeVisible();
  await expect(expandedFlow).toBeVisible();
  await expectFqnTooltip(page, expandedGiftCard, giftCard.fqn);
  await expectFqnTooltip(page, expandedFlow, flow.fqn);

  await transactionRow.focus();
  await transactionRow.press("Enter");
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail).toBeVisible();
  const detailTitle = detail.getByRole("heading", {
    name: "Amazon:gift_card → Amazon",
  });
  await detailTitle.hover();
  await expect(page.getByRole("tooltip")).toContainText(giftCard.fqn);
  await expect(page.getByRole("tooltip")).toContainText(flow.fqn);
  await page.mouse.move(0, 0);
  const detailGiftCard = detail.getByText("Amazon:gift_card", { exact: true });
  const detailFlow = detail.getByText("Amazon", { exact: true });
  await expectFqnTooltip(page, detailGiftCard, giftCard.fqn);
  await expectFqnTooltip(page, detailFlow, flow.fqn);

  await page.goto(`/accounts/${giftCard.account_id}?page=1&pageSize=25`);
  const pageTitle = page.getByRole("heading", {
    name: "Amazon:gift_card",
  });
  await expect(pageTitle).toBeVisible();
  await expect(pageTitle).toHaveCSS("text-transform", "none");
  await expect(
    pageTitle.getByText("Amazon:gift_card", { exact: true }),
  ).toHaveCSS("font-weight", "700");
  await expect(pageTitle.locator('[tabindex="0"]')).toHaveCount(0);
  await expectFqnTooltip(
    page,
    pageTitle.getByText("Amazon:gift_card", { exact: true }),
    giftCard.fqn,
  );
  const giftCardHeader = page.getByTestId("account-header");
  await expect(giftCardHeader).toContainText("65.00");
  const registerRow = page
    .getByTestId("account-register-row")
    .filter({ hasText: "Amazon gift card purchase" });
  await expect(registerRow).toContainText("Amazon:gift_card → Amazon");
  await registerRow.click();
  const peek = page.getByTestId("account-peek-panel");
  await expect(peek).toBeVisible();
  const peekTitle = peek.getByRole("heading", {
    name: "Amazon:gift_card → Amazon",
  });
  await peekTitle.hover();
  await expect(page.getByRole("tooltip")).toContainText(
    `Accounts: ${giftCard.fqn}; ${flow.fqn}`,
  );
  await page.mouse.move(0, 0);
  await expect(peek.getByText("Amazon", { exact: true })).toBeVisible();
  await expectFqnTooltip(
    page,
    peek.getByText("Amazon", { exact: true }),
    flow.fqn,
  );

  await page.goto(
    `/accounts/group?prefix=${encodeURIComponent("merchant:Amazon")}&page=1&pageSize=25`,
  );
  const groupBalanceRow = page.getByTestId("account-group-balance-row");
  await expect(groupBalanceRow).toContainText("Amazon:gift_card");
  await expectFqnTooltip(
    page,
    groupBalanceRow.getByText("Amazon:gift_card", { exact: true }),
    giftCard.fqn,
  );
  const groupBalanceLink = groupBalanceRow.getByRole("link", {
    name: "Amazon:gift_card",
  });
  await groupBalanceLink.focus();
  await expect(page.getByRole("tooltip")).toContainText(giftCard.fqn);
  const groupRegisterRows = page
    .getByTestId("account-register-row")
    .filter({ hasText: "Amazon gift card purchase" });
  await expect(groupRegisterRows).toHaveCount(2);
  const groupAccountCells = groupRegisterRows.locator(
    ".account-register-account-column",
  );
  await expect(
    groupAccountCells.getByText("Amazon:gift_card", { exact: true }),
  ).toHaveCount(1);
  await expect(
    groupAccountCells.getByText("Amazon", { exact: true }),
  ).toHaveCount(1);
  await expect(groupRegisterRows.first()).toContainText(
    "Amazon:gift_card → Amazon",
  );
  await groupRegisterRows
    .first()
    .locator(".account-register-counterparty-column")
    .hover();
  await expect(page.getByRole("tooltip")).toContainText(giftCard.fqn);
  await expect(page.getByRole("tooltip")).toContainText(flow.fqn);
  await page.mouse.move(0, 0);

  await page.goto(`/accounts?q=${encodeURIComponent("merchant:Amazon")}`);
  const flowTreeRow = page.getByRole("button", {
    name: accountTreeAccessibleName(flow),
  });
  const giftCardTreeRow = page.getByRole("button", {
    name: accountTreeAccessibleName(giftCard),
  });
  await expect(flowTreeRow.getByTestId("accounts-tree-fqn")).toHaveText(
    flow.fqn,
  );
  await expect(
    flowTreeRow.getByTestId("accounts-tree-display-label"),
  ).toHaveText("(Amazon)");
  await expect(giftCardTreeRow.getByTestId("accounts-tree-fqn")).toHaveText(
    giftCard.fqn,
  );
  await expect(
    giftCardTreeRow.getByTestId("accounts-tree-display-label"),
  ).toHaveCount(0);
  await flowTreeRow.focus();
  await expect(flowTreeRow).toBeFocused();
  await expectFqnTooltip(
    page,
    flowTreeRow.getByTestId("accounts-tree-display-label"),
    flow.fqn,
  );
  await flowTreeRow.getByTestId("accounts-tree-display-label").hover();
  await expect(page.getByRole("tooltip")).toHaveText(`${flow.fqn} (Amazon)`);
  await page.mouse.move(0, 0);
  await giftCardTreeRow.getByRole("button", { name: "Edit account" }).hover();
  await expect(page.getByRole("tooltip")).toHaveCount(1);
  await expect(page.getByRole("tooltip")).toHaveText("Edit account");
  await expect(flowTreeRow).toBeFocused();
  await page.mouse.move(0, 0);

  await page.goto("/overview");
  const overviewGiftCard = page
    .getByTestId("overview-balance-row")
    .filter({ hasText: "Amazon:gift_card" });
  await expect(overviewGiftCard).toContainText("65.00");
  await expectFqnTooltip(
    page,
    overviewGiftCard.getByText("Amazon:gift_card", { exact: true }),
    giftCard.fqn,
  );
  const overviewBalanceLink = overviewGiftCard.getByRole("link", {
    name: "Amazon:gift_card",
  });
  await overviewBalanceLink.focus();
  await expect(page.getByRole("tooltip")).toContainText(giftCard.fqn);
  const overviewTransactionTitle = page
    .getByTestId("overview-recent-activity-link")
    .filter({ hasText: "Amazon gift card purchase" })
    .getByText("Amazon:gift_card → Amazon", { exact: true });
  await overviewTransactionTitle.hover();
  const overviewTransactionTooltip = page.getByRole("tooltip");
  await expect(overviewTransactionTooltip).toContainText(giftCard.fqn);
  await expect(overviewTransactionTooltip).toContainText(flow.fqn);
  expect(
    (await overviewTransactionTooltip.innerText()).split(
      "Amazon:gift_card → Amazon",
    ),
  ).toHaveLength(2);
  await page.mouse.move(0, 0);
  const featuredChecking = page
    .getByTestId("featured-balance-row")
    .filter({ hasText: "Chase:joint_checking" })
    .getByTestId("featured-balance-name");
  await expect(featuredChecking).toHaveText("Chase:joint_checking");
  await expectFqnTooltip(page, featuredChecking, "bank:Chase:joint_checking");

  await page.goto(`/accounts?q=${encodeURIComponent(flow.fqn)}`);
  const editableFlowRow = page.getByRole("button", {
    name: accountTreeAccessibleName(flow),
  });
  await editableFlowRow.hover();
  await editableFlowRow.getByRole("button", { name: "Edit account" }).click();
  const accountEditor = page.getByRole("dialog", { name: "Edit account" });
  await expect(accountEditor.getByLabel("FQN")).toHaveValue(flow.fqn);
  await accountEditor
    .getByRole("button", { name: "Close account panel" })
    .click();

  await page.goto("/transactions?page=1&pageSize=25");
  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const accountFilter = page.getByRole("combobox", { name: "Accounts" });
  await fillAndExpectValue(accountFilter, "merchant:Amazon:flo");
  await expect(
    page.locator("#transactions-filter-account-options"),
  ).toContainText(flow.fqn);

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const spend = page.getByRole("tabpanel", { name: "Spend" });
  const merchantPicker = spend.getByRole("combobox", {
    name: "Merchant account",
  });
  await merchantPicker.fill("merchant:Amazon:flo");
  const merchantOptionsId = await merchantPicker.getAttribute("aria-controls");
  expect(merchantOptionsId).not.toBeNull();
  await expect(page.locator(`#${merchantOptionsId}`)).toContainText(flow.fqn);
  await page.getByRole("button", { name: "Close transaction editor" }).click();

  await page.keyboard.press("Control+K");
  const paletteSearch = page.getByRole("combobox", { name: "Command search" });
  await paletteSearch.fill(flow.fqn);
  await expect(
    page.getByRole("option", { name: new RegExp(flow.fqn) }),
  ).toBeVisible();
});

import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  chooseOptionByKeyboard,
  clickRowAction,
  comparableRecords,
  createAccount,
  createExpectedRecurringFixture,
  createMember,
  createSearchSpend,
  createTag,
  deleteTransaction,
  expect,
  expectAccountLinkNavigation,
  expectDatelessReadOnlyDetailGrid,
  expectFocusedAccountPathExpanded,
  expectFocusedTwoSegmentAccountPathWhole,
  expectKeyboardDisclosure,
  expectMouseDisclosure,
  expectTransactionFilterUrl,
  expectTransactionsPageUrl,
  findByFqn,
  journalRecord,
  listFixtures,
  type Locator,
  openAccountTransactionPeek,
  openUrlTransactionDetail,
  readStoredTransactionEntryDraft,
  type Route,
  type TransactionDetailFixture,
  type TransactionFixture,
  waitForLedgerLookups,
} from "@tests/e2e/transactions/support";

test("cold transaction detail deep link restores outside the list snapshot", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E cold detail ${unique}`;
  const missingSearch = `No snapshot match ${unique}`;
  const transaction = await createSearchSpend(page, memo);

  await page.goto(
    `/transactions?page=1&pageSize=25&q=${encodeURIComponent(missingSearch)}` +
      `&transaction=${transaction.transaction_id}`,
  );

  await expect(
    page.getByRole("heading", { name: "No transactions" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-transaction-row]").filter({ hasText: memo }),
  ).toHaveCount(0);
  const panel = page.getByTestId("transaction-detail-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAccessibleName(transaction.display_title);
  await expect(panel.getByTestId("transaction-detail-summary-memo")).toHaveText(
    memo,
  );
  await expect(
    panel
      .getByTestId("transaction-detail-records-table")
      .locator("tr[data-detail-record-row='true']"),
  ).toHaveCount(2);
  await expect(panel.getByText("cash:Wallet").first()).toBeVisible();
  await expect(panel.getByText("merchant:PowellsBooks").first()).toBeVisible();
  await expectTransactionsPageUrl(page, 1, 25, {
    q: missingSearch,
    transaction: String(transaction.transaction_id),
  });

  await page.keyboard.press("Escape");

  await expect(panel).toHaveCount(0);
  await expectTransactionsPageUrl(page, 1, 25, { q: missingSearch });
});

test("transaction detail panel shows full records and supports deep links", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const tagFqns = [
    `E2E:Detail:${unique}:Aardvark${unique}`,
    ...Array.from(
      { length: 11 },
      (_, index) =>
        `E2E:Detail:${unique}:DetailOverflow${String(index + 1).padStart(2, "0")}${unique}`,
    ),
  ];
  const createdTags = await Promise.all(
    tagFqns.map((fqn) => createTag(page, fqn)),
  );
  const [accounts, categories, member] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
    createMember(page, `E2EDetailMember${unique.repeat(6)}`),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E detail ${unique} full memo with receipt notes, household context, and enough words to be truncated on the transaction line but readable in the panel`;
  const alternateMemo = `E2E detail ${unique} alternate`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "42.19",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-06-30",
      member_id: member.member_id,
      memo,
      tag_ids: createdTags.map((tag) => tag.tag_id),
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;
  const alternateSpendResponse = await page.request.post(
    "/api/transactions/spend",
    {
      data: {
        amount: "7.18",
        category_id: category.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-07-01",
        memo: alternateMemo,
      },
    },
  );
  expect(alternateSpendResponse.ok()).toBe(true);
  const alternateTransaction =
    (await alternateSpendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const detailRow = page.getByRole("row").filter({ hasText: memo }).first();
  const alternateDetailRow = page
    .getByRole("row")
    .filter({ hasText: alternateMemo })
    .first();
  await expect(detailRow).toBeVisible();
  await expect(alternateDetailRow).toBeVisible();
  await expect(
    detailRow
      .locator(".transactions-tags-column")
      .getByTestId("transaction-tags-overflow"),
  ).toBeVisible();

  const newTransactionButton = page
    .locator("header")
    .getByRole("button", { name: "New transaction" });
  await newTransactionButton.click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(entryPanel).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(entryPanel).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]entry=/);
  await expect(newTransactionButton).toBeFocused();

  await clickRowAction(page, detailRow, "Open transaction detail");

  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${transaction.transaction_id}(?:&|$)`),
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute("aria-modal", "true");
  const classBadge = panel.getByTestId("class-badge");
  await expect(classBadge).toHaveRole("img");
  await expect(classBadge).toHaveAccessibleName("Spend");
  await expect(classBadge.getByText("SPEND", { exact: true })).toBeVisible();
  await expect(classBadge.locator("svg")).toBeVisible();
  await classBadge.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Spend" }),
  ).toBeVisible();
  await panel.getByRole("heading", { name: "Journal records" }).hover();
  const metadata = panel.locator(
    "section[aria-labelledby='transaction-detail-metadata']",
  );
  await expect(metadata.getByText("Class", { exact: true })).toHaveCount(0);
  await expect(metadata.getByText("Source", { exact: true })).toBeVisible();
  await expect(metadata.getByText("Created", { exact: true })).toBeVisible();
  await expect(
    panel.getByTestId("amount-chip").filter({ hasText: "-42.19 $" }).first(),
  ).toBeVisible();
  await expect(panel.getByTestId("transaction-detail-summary-memo")).toHaveText(
    memo,
  );
  await expect(panel.getByText("Journal records")).toBeVisible();
  const recordTable = panel.getByTestId("transaction-detail-records-table");
  expect(
    (await recordTable.locator("th").allTextContents()).map((text) =>
      text.trim(),
    ),
  ).toEqual(["Role", "Account", "Amount", "Category"]);
  const recordRows = recordTable.locator("tr[data-detail-record-row='true']");
  await expect(recordRows).toHaveCount(2);
  await expect(recordRows.first().locator("td")).toHaveCount(4);
  await expect(
    recordTable.locator(
      "td[data-label='Tags'], td[data-label='Member'], td[data-label='Status'], td[data-label='Memo']",
    ),
  ).toHaveCount(0);
  await expect(panel.getByText("cash:Wallet").first()).toBeVisible();
  await expect(panel.getByText("merchant:PowellsBooks").first()).toBeVisible();
  await expect(panel.getByText("Entertainment:Books").first()).toBeVisible();
  const expectAmountCategorySeparation = async () => {
    await expect
      .poll(() =>
        recordRows.evaluateAll((rows) =>
          rows.every((row) => {
            const amountCell = row.querySelector<HTMLElement>(
              "td[data-label='Amount']",
            );
            const categoryCell = row.querySelector<HTMLElement>(
              "td[data-label='Category']",
            );
            if (!amountCell || !categoryCell) {
              return false;
            }
            const amountBounds = amountCell.getBoundingClientRect();
            const categoryBounds = categoryCell.getBoundingClientRect();
            const categoryChip =
              categoryCell.querySelector<HTMLElement>("button");
            const categoryChipBounds = categoryChip?.getBoundingClientRect();
            const cellsOverlap =
              amountBounds.left < categoryBounds.right - 0.5 &&
              amountBounds.right > categoryBounds.left + 0.5 &&
              amountBounds.top < categoryBounds.bottom - 0.5 &&
              amountBounds.bottom > categoryBounds.top + 0.5;
            const chipFitsCategory =
              !categoryChipBounds ||
              (categoryChipBounds.left >= categoryBounds.left - 0.5 &&
                categoryChipBounds.right <= categoryBounds.right + 0.5);
            return !cellsOverlap && chipFitsCategory;
          }),
        ),
      )
      .toBe(true);
  };
  for (const width of [1920, 760, 740, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectAmountCategorySeparation();
  }
  await page.setViewportSize({ width: 1920, height: 760 });
  await expect
    .poll(() =>
      panel
        .getByTestId("transaction-detail-records-table")
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    )
    .toBe(true);
  for (const tag of createdTags) {
    await expect(recordTable.getByText(tag.fqn, { exact: false })).toHaveCount(
      0,
    );
  }
  await expect(recordTable.getByText(member.name, { exact: true })).toHaveCount(
    0,
  );
  await recordRows.first().click();
  const disclosure = recordTable.locator("tr.detail-records-disclosure-row");
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText(memo);
  for (const tag of createdTags) {
    await expect(
      disclosure.getByTestId("record-disclosure-tags"),
    ).toContainText(tag.fqn);
  }
  await expect(disclosure.getByTestId("record-disclosure-member")).toHaveText(
    member.name,
  );
  await page.setViewportSize({ width: 760, height: 900 });
  for (const value of [
    disclosure.getByTestId("record-disclosure-tags"),
    disclosure.getByTestId("record-disclosure-member"),
  ]) {
    await expect
      .poll(() =>
        value.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 1920, height: 760 });
  await expect(
    disclosure.locator(
      "button, [data-slot='tooltip-trigger'], [data-testid*='chip']",
    ),
  ).toHaveCount(0);

  await alternateDetailRow.locator(".transactions-description-column").click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(alternateDetailRow).toHaveAttribute("aria-expanded", "true");
  await alternateDetailRow.locator(".transactions-description-column").click();
  await expect(alternateDetailRow).toHaveAttribute("aria-expanded", "false");

  await clickRowAction(page, detailRow, "Open transaction detail");
  await expect(panel).toBeVisible();

  await alternateDetailRow.scrollIntoViewIfNeeded();
  await alternateDetailRow.focus();
  await expect(alternateDetailRow).toBeFocused();
  await alternateDetailRow.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${alternateTransaction.transaction_id}(?:&|$)`),
  );
  const alternatePanel = page.getByRole("dialog", {
    name: alternateTransaction.display_title,
  });
  await expect(alternatePanel).toBeVisible();
  await expect(
    alternatePanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(alternateMemo);

  await page.keyboard.press("Escape");
  await expect(alternatePanel).toBeHidden();
  await expect(entryPanel).toHaveCount(0);
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);

  await clickRowAction(page, detailRow, "Open transaction detail");
  await expect(panel).toBeVisible();
  await page.keyboard.press("KeyN");
  await expect(entryPanel).toBeVisible();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(entryPanel).toHaveCount(0);
  await expect(panel).toBeVisible();

  await page.goto(
    `/transactions?page=2&pageSize=25&transaction=${transaction.transaction_id}`,
  );
  const deepLinkPanel = page.getByRole("dialog", {
    name: transaction.display_title,
  });
  await expect(deepLinkPanel).toBeVisible();
  await expect(
    deepLinkPanel.getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(memo);

  await page.keyboard.press("Escape");
  await expect(deepLinkPanel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=2&pageSize=25$/);
});

test("detail and peek account paths navigate without record-row side effects", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [account, merchant, categories] = await Promise.all([
    createAccount(
      page,
      `e2e:DetailLinks:${unique}:Household:Checking`,
      "owned",
      "USD",
    ),
    createAccount(page, `e2eDetailLinks${unique}:LinkTarget`, "flow", "USD"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E detail account links ${unique}`;
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "31.27",
      category_id: category.category_id,
      counterparty_account_id: merchant.account_id,
      currency: "USD",
      funding_account_id: account.account_id,
      initiated_date: "2026-07-23",
      memo,
    },
  });
  expect(createResponse.ok()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionFixture;

  let panel = await openUrlTransactionDetail(page, transaction.transaction_id);
  let accountLink = panel.getByRole("link", {
    exact: true,
    name: account.fqn,
  });
  let recordRow = accountLink.locator("xpath=ancestor::tr");
  await expect(accountLink).toHaveCount(1);
  await expect(recordRow.getByRole("link")).toHaveCount(1);
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await expectFocusedTwoSegmentAccountPathWhole(
    panel.locator(`a[href='/accounts/${merchant.account_id}']`),
    merchant.fqn,
  );
  await expect(page.locator("[data-slot='tooltip-content']")).toBeVisible();
  await accountLink.click();
  await expectAccountLinkNavigation(page, account);

  panel = await openUrlTransactionDetail(page, transaction.transaction_id);
  accountLink = panel.getByRole("link", {
    exact: true,
    name: account.fqn,
  });
  recordRow = accountLink.locator("xpath=ancestor::tr");
  await recordRow.focus();
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "true");
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await expectFocusedAccountPathExpanded(accountLink, account.fqn);
  await accountLink.press("Enter");
  await expectAccountLinkNavigation(page, account);

  panel = await openAccountTransactionPeek(page, merchant, memo);
  accountLink = panel.getByRole("link", {
    exact: true,
    name: account.fqn,
  });
  recordRow = accountLink.locator("xpath=ancestor::tr");
  await expect(accountLink).toHaveCount(1);
  await expect(recordRow.getByRole("link")).toHaveCount(1);
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await accountLink.click();
  await expectAccountLinkNavigation(page, account);

  panel = await openAccountTransactionPeek(page, merchant, memo);
  accountLink = panel.getByRole("link", {
    exact: true,
    name: account.fqn,
  });
  recordRow = accountLink.locator("xpath=ancestor::tr");
  await recordRow.focus();
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "true");
  await recordRow.press("Enter");
  await expect(recordRow).toHaveAttribute("aria-expanded", "false");
  await expectFocusedAccountPathExpanded(accountLink, account.fqn);
  await accountLink.press("Enter");
  await expectAccountLinkNavigation(page, account);
});

test("transaction detail panel is read-only while category chips keep filtering", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1920, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const [initialTag, member] = await Promise.all([
    createTag(page, `E2E:DetailReadonly:${unique}:InitialTag`),
    createMember(page, `Detail editor ${unique}`),
  ]);
  const memo = `E2E detail read-only ${unique} with a complete wrapped memo`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-17.43000000",
          category_id: null,
          currency: "USD",
          member_id: member.member_id,
          memo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          member_id: member.member_id,
          memo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&transaction=${transaction.transaction_id}`,
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(panel).toBeVisible();
  await expect(row).toBeVisible();
  await expect(
    panel.getByRole("button", { exact: true, name: "Edit transaction" }),
  ).toBeVisible();
  await expect(panel.locator("td[data-label][tabindex]")).toHaveCount(0);
  await expect(panel.locator("[data-inline-editor-id]")).toHaveCount(0);
  await expect(panel.locator("input, textarea, select")).toHaveCount(0);

  const accountCell = panel.locator("td[data-label='Account']").first();
  const amountChip = panel.getByTestId("amount-chip").first();
  const detailRecordRow = panel
    .locator("tr[data-detail-record-row='true']")
    .first();
  for (const target of [accountCell, amountChip, detailRecordRow]) {
    await target.hover();
    await expect(
      panel.getByRole("button", {
        name: /^(Edit row value|Edit memo|Edit Category|Edit Tags|Edit Member)$/,
      }),
    ).toHaveCount(0);
  }

  await detailRecordRow.click();
  const disclosure = panel.locator("tr.detail-records-disclosure-row");
  await expect(disclosure).toBeVisible();
  await expect(disclosure.getByTestId("record-disclosure-tags")).toHaveText(
    initialTag.fqn,
  );
  await expect(disclosure.getByTestId("record-disclosure-member")).toHaveText(
    member.name,
  );
  await expect(disclosure).toContainText(memo);
  await expect(
    disclosure.locator(
      "button, [data-slot='tooltip-trigger'], [data-testid*='chip']",
    ),
  ).toHaveCount(0);
  await page.keyboard.press("F2");
  await expect(panel.locator("[data-inline-editor-id]")).toHaveCount(0);
  await amountChip.click();
  await expect(panel.locator("[data-inline-editor-id]")).toHaveCount(0);
  await expect(disclosure.getByText(memo, { exact: true })).toHaveCSS(
    "white-space",
    "pre-wrap",
  );

  await panel
    .getByRole("button", { name: `Filter by ${initialCategory.fqn}` })
    .first()
    .click();
  await expectTransactionFilterUrl(page, {
    categories: [initialCategory.category_id],
  });
  await expect(
    page.getByRole("button", {
      name: `Remove Category ${initialCategory.name}`,
    }),
  ).toBeVisible();
  await expect(panel).toBeVisible();

  const expected = await createExpectedRecurringFixture(page, unique);
  await page.goto("/transactions?page=1&pageSize=50");
  const expectedRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "Expected" }) })
    .filter({
      hasText: expected.merchantFqn.split(":").at(-1) ?? "Merchant",
    })
    .first();
  await expect(expectedRow).toBeVisible();
  await clickRowAction(page, expectedRow, "Open transaction detail");
  const expectedPanel = page.getByTestId("transaction-detail-panel");
  await expect(expectedPanel).toBeVisible();
  await expect(
    expectedPanel.getByRole("button", { name: "Edit Category" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit Tags" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit Member" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit row value" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit memo" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Edit transaction" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Duplicate" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Split" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Delete" }),
  ).toHaveCount(0);
  await expect(
    expectedPanel.getByRole("button", { name: "Confirm occurrence" }),
  ).toBeVisible();
  await expect(
    expectedPanel.getByRole("button", { name: "Dismiss occurrence" }),
  ).toBeVisible();

  await expectedPanel
    .getByRole("button", { name: "Close transaction detail" })
    .click();
  await expectedRow.click();
  const expandedExpectedRecords = expectedRow.locator(
    "xpath=following-sibling::tr[1]",
  );
  await expect(expandedExpectedRecords).toBeVisible();
  await expect(
    expandedExpectedRecords.getByRole("button", { name: /Edit / }),
  ).toHaveCount(0);

  await deleteTransaction(page, transaction);
});

test("detail lifecycle and dateless records cover variants in detail and peek", async ({
  page,
}, testInfo) => {
  test.slow();
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const [fundingAccount, splitParty] = await Promise.all([
    createAccount(
      page,
      `assets:E2E:Lifecycle:${unique}:Funding`,
      "owned",
      "USD",
    ),
    createAccount(page, `people:E2E:Lifecycle:${unique}`, "party", "USD"),
  ]);
  const [firstTag, secondTag] = await Promise.all([
    createTag(page, `E2E:Lifecycle:${unique}:First`),
    createTag(page, `E2E:Lifecycle:${unique}:Second`),
  ]);

  const simpleMemo = `E2E lifecycle uniform ${unique}`;
  const simpleResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.25",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-11",
      memo: simpleMemo,
      tag_ids: [firstTag.tag_id, secondTag.tag_id],
    },
  });
  const simpleBody = await simpleResponse.text();
  expect(simpleResponse.ok(), simpleBody).toBe(true);
  const simple = JSON.parse(simpleBody) as TransactionDetailFixture;

  const mixedMemo = `E2E lifecycle mixed ${unique}`;
  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-12",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-30.00000000",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "10.00000000",
          category_id: category.category_id,
          currency: "USD",
          memo: mixedMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: splitParty.account_id,
          amount: "20.00000000",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          settlement: { status: "pending" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  const mixedBody = await mixedResponse.text();
  expect(mixedResponse.ok(), mixedBody).toBe(true);
  const mixed = JSON.parse(mixedBody) as TransactionDetailFixture;

  const cancelledMemo = `E2E lifecycle cancelled ${unique}`;
  const cancelledResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-16",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-9.00000000",
          category_id: null,
          currency: "USD",
          memo: cancelledMemo,
          settlement: { status: "pending" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "9.00000000",
          category_id: category.category_id,
          currency: "USD",
          memo: cancelledMemo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  const cancelledBody = await cancelledResponse.text();
  expect(cancelledResponse.ok(), cancelledBody).toBe(true);
  const activeToCancel = JSON.parse(cancelledBody) as TransactionDetailFixture;
  const cancelResponse = await page.request.post(
    `/api/transactions/${activeToCancel.transaction_id}/cancel`,
  );
  const cancelBody = await cancelResponse.text();
  expect(cancelResponse.ok(), cancelBody).toBe(true);
  const cancelled = JSON.parse(cancelBody) as TransactionDetailFixture;

  const expected = await createExpectedRecurringFixture(
    page,
    `${unique}Lifecycle`,
    { anchorDate: "2026-07-23" },
  );

  await page.goto("/transactions?page=1&pageSize=50");
  const simpleRow = page
    .getByRole("row")
    .filter({ hasText: simpleMemo })
    .first();
  await expect(simpleRow).toBeVisible();
  const mixedRow = page.getByRole("row").filter({ hasText: mixedMemo }).first();
  const cancelledRow = page
    .getByRole("row")
    .filter({ hasText: cancelledMemo })
    .first();
  await expect(
    cancelledRow.getByRole("button", { name: "Edit transaction" }),
  ).toHaveCount(0);
  await expect(
    cancelledRow.getByRole("button", { name: "Split transaction" }),
  ).toHaveCount(0);
  const mixedIndicators = mixedRow.getByTestId("transaction-status-indicators");
  await expect(mixedIndicators).toHaveAttribute("data-display-status", "mixed");
  await expect(
    mixedIndicators.getByRole("img", { name: "Mixed settlement" }),
  ).toBeVisible();
  await simpleRow.locator(".transactions-description-column").click();
  const simpleExpandedRecords = simpleRow.locator(
    "xpath=following-sibling::tr[1]",
  );
  await expect(simpleExpandedRecords).toContainText("Initiated 2026-07-11");
  await expect(simpleExpandedRecords).not.toContainText(
    /pending date|posted date/i,
  );

  const expectSimpleSurface = async (
    panel: Locator,
    expectedVariant: "decluttered" | "full",
  ) => {
    await expectDatelessReadOnlyDetailGrid(panel, 2, expectedVariant);
    const recordsTable = panel.getByTestId("transaction-detail-records-table");
    const decluttered = expectedVariant === "decluttered";
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect
      .poll(() =>
        panel.evaluate((panelElement) => {
          const strip = panelElement.querySelector(
            "[data-testid='transaction-lifecycle']",
          );
          return (
            strip?.parentElement === panelElement &&
            strip.previousElementSibling?.querySelector("h2") !== null
          );
        }),
      )
      .toBe(true);
    await expect(lifecycle).toHaveText(/Initiated\s*Jul 11/);
    await expect(lifecycle).not.toContainText(
      /expected|pending|posted|cancelled|varies|→|–/i,
    );
    await expect(panel).not.toContainText("Invalid Date");
    await expect(lifecycle.locator("[tabindex]")).toHaveCount(0);
    await expect(
      lifecycle.locator("[data-slot='tooltip-trigger']"),
    ).toHaveCount(0);
    await expect(lifecycle.getByText("Initiated", { exact: true })).toHaveCSS(
      "font-size",
      "12px",
    );
    if (decluttered) {
      await expect(recordsTable.locator("td[data-label='Tags']")).toHaveCount(
        0,
      );
      await expect(
        recordsTable.getByText(firstTag.fqn, { exact: false }),
      ).toHaveCount(0);
      await expect(
        recordsTable.getByText(secondTag.fqn, { exact: false }),
      ).toHaveCount(0);
    } else {
      await expect(
        panel.getByText(firstTag.name, { exact: true }).first(),
      ).toBeVisible();
      await expect(
        panel.getByText(secondTag.name, { exact: true }).first(),
      ).toBeVisible();
    }
  };

  const expectMixedSurface = async (
    panel: Locator,
    expectedVariant: "decluttered" | "full",
  ) => {
    await expectDatelessReadOnlyDetailGrid(panel, 3, expectedVariant);
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect(lifecycle).toHaveText(/Initiated\s*Jul 12\s*Pending/);
    await expect(lifecycle).not.toContainText(/Posted|varies|2 of 3|→|–/);
    await expect(
      lifecycle.locator("[data-lifecycle-status='pending']"),
    ).toHaveText("Pending");
  };

  const expectLifecycleContentFits = async (panel: Locator) => {
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect
      .poll(() =>
        lifecycle.evaluate(
          (strip) =>
            strip.scrollWidth <= strip.clientWidth + 1 &&
            strip.scrollHeight <= strip.clientHeight + 1,
        ),
      )
      .toBe(true);
  };

  const expectExpectedSurface = async (
    panel: Locator,
    expectedVariant: "decluttered" | "full",
  ) => {
    await expectDatelessReadOnlyDetailGrid(panel, 2, expectedVariant);
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect(lifecycle).toHaveText(/Initiated\s*Jul 23\s*Expected/);
    await expect(lifecycle).not.toContainText(/Pending|Posted|Cancelled|—/);
    await expect(
      lifecycle.locator("[data-lifecycle-status='expected']"),
    ).toHaveText("Expected");
  };

  const expectCancelledSurface = async (
    panel: Locator,
    expectedVariant: "decluttered" | "full",
  ) => {
    await expectDatelessReadOnlyDetailGrid(panel, 2, expectedVariant);
    const recordsTable = panel.getByTestId("transaction-detail-records-table");
    const decluttered = expectedVariant === "decluttered";
    const lifecycle = panel.getByTestId("transaction-lifecycle");
    await expect(lifecycle).toHaveText(/Initiated\s*Jul 16\s*Cancelled/);
    await expect(lifecycle).not.toContainText(/Pending|Posted|varies|1 of 2|—/);
    await expect(
      lifecycle.locator("[data-lifecycle-status='cancelled']"),
    ).toHaveText("Cancelled");
    const cancelledRows = recordsTable.locator(
      "tr[data-detail-record-row='true']",
    );
    await expect(cancelledRows).toHaveCount(2);
    if (!decluttered) {
      await expect(cancelledRows.first()).toContainText("Cancelled");
    }
    await expect(cancelledRows.first()).toHaveCSS(
      "text-decoration-line",
      "line-through",
    );
  };

  await page.setViewportSize({ width: 1600, height: 900 });
  const simpleDetail = await openUrlTransactionDetail(
    page,
    simple.transaction_id,
  );
  await expectSimpleSurface(simpleDetail, "decluttered");
  await expectMouseDisclosure(simpleDetail, simpleMemo);

  const mixedDetail = await openUrlTransactionDetail(
    page,
    mixed.transaction_id,
  );
  await expectMixedSurface(mixedDetail, "decluttered");
  await expectLifecycleContentFits(mixedDetail);
  await page.setViewportSize({ width: 390, height: 900 });
  await expectLifecycleContentFits(mixedDetail);
  await page.setViewportSize({ width: 1600, height: 900 });
  await expectKeyboardDisclosure(mixedDetail);

  const expectedDetail = await openUrlTransactionDetail(
    page,
    expected.transactionId,
  );
  await expectExpectedSurface(expectedDetail, "decluttered");
  await expect(
    expectedDetail.getByRole("button", { name: "Edit transaction" }),
  ).toHaveCount(0);
  await expect(
    expectedDetail.getByRole("button", { name: "Confirm occurrence" }),
  ).toBeVisible();
  await expect(
    expectedDetail.getByRole("button", { name: "Dismiss occurrence" }),
  ).toBeVisible();

  const cancelledDetail = await openUrlTransactionDetail(
    page,
    cancelled.transaction_id,
  );
  await expectCancelledSurface(cancelledDetail, "decluttered");
  await expect(
    cancelledDetail.getByRole("button", { name: "Edit transaction" }),
  ).toHaveCount(0);
  await expect(
    cancelledDetail.getByRole("button", { name: "Split" }),
  ).toHaveCount(0);
  await cancelledDetail.getByRole("button", { name: "Restore" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction restored." }),
  ).toBeVisible();
  await expect(cancelledDetail.getByTestId("transaction-lifecycle")).toHaveText(
    /Initiated\s*Jul 16\s*Pending/,
  );
  await expect(
    cancelledDetail.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await cancelledDetail.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction cancelled." }),
  ).toBeVisible();
  await expectCancelledSurface(cancelledDetail, "decluttered");
  await expect(
    cancelledDetail.getByRole("button", { name: "Restore" }),
  ).toBeFocused();

  await page.setViewportSize({ width: 720, height: 900 });
  const simplePeek = await openAccountTransactionPeek(
    page,
    fundingAccount,
    simpleMemo,
  );
  await expectSimpleSurface(simplePeek, "full");
  await expectMouseDisclosure(simplePeek, simpleMemo);

  const mixedPeek = await openAccountTransactionPeek(
    page,
    fundingAccount,
    mixedMemo,
  );
  await expectMixedSurface(mixedPeek, "full");
  await expectKeyboardDisclosure(mixedPeek);
});

test("toolbar filter trigger opens after transaction detail closes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E escape layered ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "31.42",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-06-29",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: "Open filters" }).click();
  await page.getByRole("button", { name: "Add filter" }).click();
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});

test("Escape closes filter popover before transaction detail panel", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E escape order ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "32.10",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-06-30",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();

  const filterToggle = page.getByRole("button", { name: "Open filters" });
  await filterToggle.focus();
  await expect(filterToggle).toBeFocused();
  await page.keyboard.press("Enter");
  const addFilterButton = page.getByRole("button", { name: "Add filter" });
  await addFilterButton.focus();
  await page.keyboard.press("Enter");
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("focused transaction row closes detail with one Escape", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E keyboard detail ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-03",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const detailRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(detailRow).toBeVisible();
  await expect(detailRow).toHaveAttribute("aria-expanded", "false");

  await detailRow.focus();
  await expect(detailRow).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${transaction.transaction_id}(?:&|$)`),
  );
  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();
  await expect(detailRow).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(detailRow).toBeFocused();

  await page.keyboard.press("Space");
  await expect(detailRow).toHaveAttribute("aria-expanded", "true");
  await expect(detailRow).toHaveAttribute(
    "aria-controls",
    `transaction-records-${transaction.transaction_id}`,
  );
  await expect(page.getByTestId("bulk-action-bar")).toHaveCount(0);

  await page.getByRole("button", { name: "Bulk edit" }).click();
  await detailRow.focus();
  await page.keyboard.press("Space");
  await expect(detailRow).not.toHaveAttribute("aria-expanded", /.+/);
  await expect(detailRow).not.toHaveAttribute("aria-controls", /.+/);
  await expect(
    page.getByTestId("transaction-browser-bulk-mode-bar"),
  ).toContainText("1 selected");
});

test("transaction detail delete confirms, tombstones, and refreshes the row", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E delete detail ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.45",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-02",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;
  const consoleErrors: string[] = [];
  const failedTransactionRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    if (
      request.method() === "GET" &&
      request.url().includes(`/api/transactions/${transaction.transaction_id}`)
    ) {
      failedTransactionRequests.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`,
      );
    }
  });
  page.on("response", (response) => {
    if (
      response.request().method() === "GET" &&
      response
        .url()
        .includes(`/api/transactions/${transaction.transaction_id}`) &&
      response.status() >= 400
    ) {
      failedTransactionRequests.push(
        `GET ${response.url()} returned ${response.status()}`,
      );
    }
  });

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const detailRow = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(detailRow).toBeVisible();
  await clickRowAction(page, detailRow, "Open transaction detail");

  const panel = page.getByRole("dialog", { name: transaction.display_title });
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Delete" }).click();
  const confirmDialog = page.getByRole("alertdialog", {
    name: "Delete transaction",
  });
  await expect(confirmDialog).toBeVisible();
  await expect(
    confirmDialog.getByText(transaction.display_title),
  ).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toBeHidden();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Delete" })).toBeFocused();

  await panel.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete transaction" })
    .getByRole("button", { name: "Delete transaction" })
    .click();

  await expect(
    page.getByRole("status").filter({ hasText: "Transaction deleted." }),
  ).toBeVisible();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeHidden();
  expect(consoleErrors).toEqual([]);
  expect(failedTransactionRequests).toEqual([]);
});

test("transaction detail edit preserves imported sources through a fitting shorthand replacement", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const member = await createMember(page, `E2E edit spend ${unique}`);
  const memo = `E2E edit spend ${unique}`;
  const updatedMemo = `E2E edit spend updated ${unique}`;

  const spendResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-04",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-21.34",
          category_id: null,
          currency: "USD",
          member_id: member.member_id,
          memo: null,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "21.34",
          category_id: category.category_id,
          currency: "USD",
          member_id: null,
          memo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
      ],
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );

  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeVisible();
  await detailPanel
    .getByRole("button", { exact: true, name: "Edit transaction" })
    .click();

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  await expectTransactionsPageUrl(page, 1, 50, {
    entry: `edit:${transaction.transaction_id}`,
    transaction: String(transaction.transaction_id),
  });
  await expect(detailPanel).toBeVisible();
  await expect(page.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(spendPanel.getByLabel("Amount")).toHaveValue("21.34");
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(memo);

  await spendPanel.getByLabel("Amount").fill("25.67");
  await spendPanel.getByLabel("Memo").fill(updatedMemo);
  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(comparableRecords(replaced.records)).toEqual([
    {
      account_id: fundingAccount.account_id,
      amount: "-25.67000000",
      category_id: null,
      currency: "USD",
      member_id: member.member_id,
      memo: updatedMemo,
      settlement: "posted",
      reconciliation_status: "unreconciled",
      source: "imported",
      tag_ids: [],
    },
    {
      account_id: merchantAccount.account_id,
      amount: "25.67000000",
      category_id: category.category_id,
      currency: "USD",
      member_id: null,
      memo: updatedMemo,
      settlement: null,
      reconciliation_status: "unreconciled",
      source: "imported",
      tag_ids: [],
    },
  ]);
  await expect(entryPanel).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction updated." }),
  ).toBeVisible();
});

test("sparse shorthand metadata survives merchant removal while Duplicate uses Advanced", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const booksAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const targetAccount = findByFqn(accounts, "merchant:Target");
  const booksCategory = findByFqn(categories, "Entertainment:Books");
  const targetCategory = findByFqn(categories, "Food:Groceries");
  const member = await createMember(page, `E2E sparse merchant ${unique}`);
  const memo = `E2E sparse merchant ${unique}`;

  const response = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-05",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-30.00",
          category_id: null,
          currency: "USD",
          member_id: null,
          memo: null,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: booksAccount.account_id,
          amount: "10.00",
          category_id: booksCategory.category_id,
          currency: "USD",
          member_id: null,
          memo: null,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: targetAccount.account_id,
          amount: "20.00",
          category_id: targetCategory.category_id,
          currency: "USD",
          member_id: member.member_id,
          memo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const transaction = (await response.json()) as TransactionDetailFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await detailPanel.getByRole("button", { name: "Duplicate" }).click();

  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(
    entryPanel.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(entryPanel).toHaveCount(0);
  await page.goto("/transactions?page=1&pageSize=50");
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Edit transaction",
  );
  await expect(
    page.getByRole("alertdialog", { name: "Discard entry draft" }),
  ).toHaveCount(0);
  await expect(
    entryPanel.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(memo);
  await spendPanel
    .getByRole("group", { name: "Merchant 2" })
    .getByRole("button", { name: "Remove merchant" })
    .click();

  const replaceResponsePromise = page.waitForResponse((replaceResponse) => {
    const url = new URL(replaceResponse.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      replaceResponse.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(comparableRecords(replaced.records)).toEqual([
    {
      account_id: fundingAccount.account_id,
      amount: "-10.00000000",
      category_id: null,
      currency: "USD",
      member_id: member.member_id,
      memo,
      settlement: "posted",
      reconciliation_status: "unreconciled",
      source: "manual",
      tag_ids: [],
    },
    {
      account_id: booksAccount.account_id,
      amount: "10.00000000",
      category_id: booksCategory.category_id,
      currency: "USD",
      member_id: null,
      memo: null,
      settlement: null,
      reconciliation_status: "unreconciled",
      source: "manual",
      tag_ids: [],
    },
  ]);
});

test("transaction detail edit preserves imported sources through the journal editor", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const incomeAccount = findByFqn(accounts, "employers:Acme:salary");
  const expenseCategory = findByFqn(categories, "Entertainment:Books");
  const incomeCategory = findByFqn(categories, "Income:Salary");
  const memo = `E2E edit mixed ${unique}`;
  const updatedMemo = `E2E edit mixed updated ${unique}`;

  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-04",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-10.00000000",
          category_id: null,
          currency: "USD",
          memo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "10.00000000",
          category_id: expenseCategory.category_id,
          currency: "USD",
          memo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
        {
          account_id: fundingAccount.account_id,
          amount: "2.00000000",
          category_id: null,
          currency: "USD",
          memo,
          settlement: { status: "posted" },
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
        {
          account_id: incomeAccount.account_id,
          amount: "-2.00000000",
          category_id: incomeCategory.category_id,
          currency: "USD",
          memo,
          settlement: null,
          reconciliation_status: "unreconciled",
          source: "imported",
          tag_ids: [],
        },
      ],
    },
  });
  expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);
  const transaction = (await mixedResponse.json()) as TransactionDetailFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit transaction" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Advanced" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(journalRecord(page, 4)).toBeVisible();
  await journalRecord(page, 1).getByLabel("Memo").fill(updatedMemo);

  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(replaced.records.some((record) => record.memo === updatedMemo)).toBe(
    true,
  );
  expect(replaced.records).toHaveLength(4);
  expect(replaced.records.every((record) => record.source === "imported")).toBe(
    true,
  );
});

test("shorthand edit escalation saves as a replacement", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E edit escalate ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "18.90",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-04",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { exact: true, name: "Edit transaction" })
    .click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await spendPanel.getByLabel("Amount").fill("19.91");
  await page.getByRole("button", { name: "Edit as journal" }).click();
  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await expect(journalRecord(page, 1).getByLabel("Amount")).toHaveValue(
    "-19.91",
  );
  await expect(journalRecord(page, 2).getByLabel("Amount")).toHaveValue(
    "19.91",
  );

  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(comparableRecords(replaced.records)).toEqual([
    {
      account_id: fundingAccount.account_id,
      amount: "-19.91000000",
      category_id: null,
      currency: "USD",
      member_id: null,
      memo,
      settlement: "posted",
      reconciliation_status: "reconciled",
      source: "manual",
      tag_ids: [],
    },
    {
      account_id: merchantAccount.account_id,
      amount: "19.91000000",
      category_id: category.category_id,
      currency: "USD",
      member_id: null,
      memo,
      settlement: null,
      reconciliation_status: "reconciled",
      source: "manual",
      tag_ids: [],
    },
  ]);
});

test("transaction detail duplicate prefills a new entry", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E duplicate source ${unique}`;
  const duplicateMemo = `E2E duplicate copy ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "16.45",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-05",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=50");
  await ledgerLookups;
  await expect(page.getByText("Description")).toBeVisible();
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );

  const detailPanel = page.getByTestId("transaction-detail-panel");
  const detailHeader = detailPanel.locator(":scope > div").first();
  const duplicateButton = detailPanel.getByRole("button", {
    name: "Duplicate",
  });
  const detailFooter = duplicateButton.locator("..");
  await expect(
    detailHeader.getByRole("button", {
      exact: true,
      name: "Edit transaction",
    }),
  ).toBeVisible();
  await expect(
    detailFooter.getByRole("button", { name: "Duplicate" }),
  ).toBeVisible();
  await expect(
    detailFooter.getByRole("button", { name: "Split" }),
  ).toBeVisible();
  await expect(
    detailFooter.getByRole("button", { name: "Delete" }),
  ).toBeVisible();
  await expect(
    detailFooter.getByRole("button", { name: "Edit transaction" }),
  ).toHaveCount(0);

  await duplicateButton.click();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(detailPanel).toBeVisible();
  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await expect(spendPanel.getByLabel("Amount")).toHaveValue("16.45");
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(memo);
  await spendPanel.getByLabel("Memo").fill(duplicateMemo);
  await expect
    .poll(async () => readStoredTransactionEntryDraft(page))
    .toMatchObject({
      tabs: {
        spend: {
          memo: duplicateMemo,
        },
      },
    });
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(entryPanel).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]entry=/);
  await expect(duplicateButton).toBeFocused();
  await page
    .locator("aside")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(
    entryPanel.getByRole("heading", { name: "New spend" }),
  ).toBeVisible();
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(duplicateMemo);

  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/transactions/spend" &&
      response.request().method() === "POST"
    );
  });
  await page.getByRole("button", { name: "Save and add another" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const duplicate = (await createResponse.json()) as TransactionFixture;
  expect(duplicate.transaction_id).not.toBe(transaction.transaction_id);
  await expect(entryPanel.getByText("Entries this session: 1")).toBeVisible();
  await expect(
    page.locator("[data-transaction-row]").filter({ hasText: duplicateMemo }),
  ).toBeVisible();
});

test("transaction detail split opens journal replacement and surfaces replace errors", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const splitAccount = await createAccount(
    page,
    `merchant:SplitTarget:${unique}`,
    "flow",
  );
  const memo = `E2E split source ${unique}`;
  const splitMemo = `E2E split added ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "30.00",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-05",
      memo,
    },
  });
  expect(spendResponse.ok(), await spendResponse.text()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Open transaction detail",
  );
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await detailPanel.getByRole("button", { name: "Split" }).click();

  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await expectTransactionsPageUrl(page, 1, 50, {
    entry: `split:${transaction.transaction_id}`,
    transaction: String(transaction.transaction_id),
  });
  await expect(detailPanel).toBeVisible();
  await expect(page.getByRole("tab", { name: "Advanced" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(journalRecord(page, 1).getByLabel("Amount")).toHaveValue("-30");
  await expect(journalRecord(page, 2).getByLabel("Amount")).toHaveValue("30");

  await journalRecord(page, 2).getByLabel("Amount").fill("20.00");
  await page.getByRole("button", { name: "Add record" }).click();
  const thirdRecord = journalRecord(page, 3);
  await chooseOptionByKeyboard(page, "Account", unique, splitAccount.fqn, {
    scope: thirdRecord,
  });
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: thirdRecord },
  );
  await thirdRecord.getByLabel("Amount").fill("10.00");
  await thirdRecord.getByLabel("Memo").fill(splitMemo);

  const replaceUrlPattern = `**/api/transactions/${transaction.transaction_id}`;
  await page.route(replaceUrlPattern, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        contentType: "application/json",
        status: 400,
        body: JSON.stringify({
          error: {
            code: "invalid_request",
            message: "Forced replace failure",
          },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  await expect(page.getByText("Forced replace failure")).toBeVisible();
  await page.unroute(replaceUrlPattern);

  const replaceResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT"
    );
  });
  await page.getByRole("button", { name: "Update transaction" }).click();
  const replaceResponse = await replaceResponsePromise;
  expect(replaceResponse.ok(), await replaceResponse.text()).toBe(true);
  const replaced = (await replaceResponse.json()) as TransactionDetailFixture;
  expect(replaced.transaction_id).toBe(transaction.transaction_id);
  expect(comparableRecords(replaced.records)).toEqual(
    comparableRecords([
      {
        account_id: fundingAccount.account_id,
        amount: "-30.00000000",
        category_id: null,
        currency: "USD",
        member_id: null,
        memo,
        settlement: "posted",
        reconciliation_status: "reconciled",
        source: "manual",
        tag_ids: [],
      },
      {
        account_id: merchantAccount.account_id,
        amount: "20.00000000",
        category_id: category.category_id,
        currency: "USD",
        member_id: null,
        memo,
        settlement: null,
        reconciliation_status: "reconciled",
        source: "manual",
        tag_ids: [],
      },
      {
        account_id: splitAccount.account_id,
        amount: "10.00000000",
        category_id: category.category_id,
        currency: "USD",
        member_id: null,
        memo: splitMemo,
        settlement: null,
        reconciliation_status: "unreconciled",
        source: "manual",
        tag_ids: [],
      },
    ]),
  );
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
});

test("transaction row quick-delete confirms, handles errors, and preserves row behavior", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E quick delete ${unique}`;

  const spendResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "14.56",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-03",
      memo,
    },
  });
  expect(spendResponse.ok()).toBe(true);
  const transaction = (await spendResponse.json()) as TransactionFixture;

  await page.goto("/transactions?page=1&pageSize=50");
  await expect(page.getByText("Description")).toBeVisible();

  const row = page.locator("[data-transaction-row='true']").filter({
    hasText: memo,
  });
  const transactionRows = page.locator("[data-transaction-row='true']");
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  const deletedRowIndex = await row.evaluate((element) =>
    Array.from(
      element.parentElement?.querySelectorAll(
        "tr[data-transaction-row='true']",
      ) ?? [],
    ).indexOf(element),
  );
  const rowCountBeforeDelete = await transactionRows.count();

  await clickRowAction(page, row, "Open transaction detail");
  await expect(
    page.getByRole("dialog", { name: transaction.display_title }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(row).toHaveAttribute("aria-expanded", "false");

  await clickRowAction(page, row, "Delete transaction");
  const confirmDialog = page.getByRole("alertdialog", {
    name: "Delete transaction",
  });
  await expect(confirmDialog).toBeVisible();
  await expect(
    confirmDialog.getByText(transaction.display_title),
  ).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toBeHidden();
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(() =>
      row.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ??
          document.activeElement?.textContent?.trim(),
      ),
    )
    .toMatch(/^(Delete transaction|More row actions)$/);

  const deleteUrlPattern = `**/api/transactions/${transaction.transaction_id}`;
  let failNextDelete = true;
  const failDeleteRoute = async (route: Route) => {
    if (route.request().method() === "DELETE" && failNextDelete) {
      failNextDelete = false;
      await route.fulfill({
        contentType: "application/json",
        status: 409,
        body: JSON.stringify({
          error: {
            code: "conflict",
            message: "Mock quick delete failure.",
          },
        }),
      });
      return;
    }
    await route.fallback();
  };
  await page.route(deleteUrlPattern, failDeleteRoute);

  await clickRowAction(page, row, "Delete transaction");
  await expect(confirmDialog).toBeVisible();
  await confirmDialog
    .getByRole("button", { name: "Delete transaction" })
    .click();
  await expect(confirmDialog.getByRole("alert")).toContainText(
    "Mock quick delete failure.",
  );
  await expect(confirmDialog).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await page.unroute(deleteUrlPattern, failDeleteRoute);

  const deleteRequest = page.waitForRequest(
    (request) =>
      request.method() === "DELETE" &&
      request.url().includes(`/api/transactions/${transaction.transaction_id}`),
  );
  await confirmDialog
    .getByRole("button", { name: "Delete transaction" })
    .click();
  await deleteRequest;

  await expect(
    page.getByRole("status").filter({ hasText: "Transaction deleted." }),
  ).toBeVisible();
  await expect(confirmDialog).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: memo })).toBeHidden();
  await expect(page).toHaveURL(/\/transactions\?page=1&pageSize=50$/);
  await expect(
    transactionRows.nth(Math.min(deletedRowIndex, rowCountBeforeDelete - 2)),
  ).toBeFocused();
});

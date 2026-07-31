import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  boundingBoxesOverlap,
  type CategoryFixture,
  createAccount,
  createCategory,
  createMember,
  createSearchSpend,
  createTag,
  deleteTransaction,
  editorButtonsFitContainer,
  expect,
  expectInlineSaveKeepsTransactionTableStable,
  expectTransactionFilterUrl,
  findByFqn,
  getTransactionDetail,
  listFixtures,
  type Locator,
  requiredBoundingBox,
  type Route,
  type TransactionDetailFixture,
  type TransactionFixture,
} from "@tests/e2e/transactions/support";

test("transactions page renders demo transaction lines and expands records", async ({
  page,
}) => {
  await page.goto("/transactions?hideExpected=true");

  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  await expect(page.getByText("Description")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Amount" }),
  ).toBeVisible();

  const transactionRows = page.locator("tbody > tr[aria-expanded]");
  await expect(
    transactionRows.getByRole("button", { name: /expand|collapse/i }),
  ).toHaveCount(0);
  const transferRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "TRANSFER" }) })
    .filter({ hasText: "120.00 $" })
    .first();
  await expect(transferRow).toBeVisible();
  await expect(transferRow).toContainText("→");
  await expect(transferRow).not.toContainText("+120.00 $");

  const incomeRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "INCOME" }) })
    .filter({ hasText: "+3,250.00 $" })
    .first();
  await expect(incomeRow).toBeVisible();
  const incomeAmountChip = incomeRow
    .getByTestId("amount-chip")
    .filter({ hasText: "+3,250.00 $" })
    .first();
  await expect(incomeAmountChip).toContainText("+3,250.00 $");
  await expect(incomeAmountChip).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(incomeAmountChip).toHaveCSS("color", "rgb(15, 13, 22)");

  const firstRowBackgroundBefore = await transactionRows
    .nth(0)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  const secondRowBackgroundBefore = await transactionRows
    .nth(1)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(firstRowBackgroundBefore).not.toBe(secondRowBackgroundBefore);

  const transferRowBackgroundBefore = await transferRow.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await transferRow.locator(".transactions-description-column").click();
  await expect(transferRow).toHaveAttribute("aria-expanded", "true");
  await expect(transferRow).toHaveAttribute(
    "aria-controls",
    /^transaction-records-\d+$/,
  );
  const recordsRowId = await transferRow.getAttribute("aria-controls");
  expect(recordsRowId).not.toBeNull();
  const recordsRow = page.locator(`[id="${recordsRowId}"]`);
  await expect(recordsRow).toBeVisible();
  await expect(recordsRow.locator(":scope > td")).toHaveAttribute(
    "colspan",
    "8",
  );
  await expect(recordsRow).toHaveCSS("border-bottom-width", "2px");
  await expect(
    page.getByRole("columnheader", { exact: true, name: "Memo" }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(transferRow).toHaveCSS("border-bottom-width", "0px");
  await expect(transferRow).toHaveCSS("box-shadow", "none");
  const transferRowBackgroundAfter = await transferRow.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(transferRowBackgroundAfter).not.toBe(transferRowBackgroundBefore);
  const transferTitle = transferRow.getByTestId("transaction-line-title");
  await expect(transferTitle).toHaveCSS("font-weight", "600");
  await expect(transferTitle).toHaveCSS("font-family", /IBM Plex Mono/i);

  const firstRowBackgroundAfter = await transactionRows
    .nth(0)
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(firstRowBackgroundAfter).toBe(firstRowBackgroundBefore);

  await expect(page.getByTestId("transactions-table-scroll")).toContainText(
    "Memo",
  );
  const recordsFitTableContent = await page
    .getByTestId("transactions-table-scroll")
    .evaluate((container) => {
      const records = container.querySelector<HTMLElement>(
        "[data-testid='expanded-records']",
      );
      return records
        ? records.offsetLeft >= 0 &&
            records.offsetLeft + records.offsetWidth <= container.scrollWidth
        : false;
    });
  expect(recordsFitTableContent).toBe(true);

  await transferRow.locator(".transactions-description-column").click();
  await expect(transferRow).toHaveAttribute("aria-expanded", "false");
  await expect(transferRow).not.toHaveAttribute("aria-controls", /.+/);
  await expect(recordsRow).toHaveCount(0);

  await transferRow.focus();
  await page.keyboard.press("Space");
  await expect(transferRow).toHaveAttribute("aria-expanded", "true");
  await expect(transferRow).toHaveAttribute(
    "aria-controls",
    recordsRowId ?? "",
  );
  await page.keyboard.press("Space");
  await expect(transferRow).toHaveAttribute("aria-expanded", "false");
});

test("expanded records edit per-record values and escalate structural changes", async ({
  page,
}, testInfo) => {
  test.slow();
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const nextCategory = await createCategory(
    page,
    `E2E:RecordEditing:${unique}:Updated`,
    "expense",
  );
  const [initialTag, addedTag, member] = await Promise.all([
    createTag(page, `E2E:RecordEditing:${unique}:Initial`),
    createTag(page, `E2E:RecordEditing:${unique}:Added`),
    createMember(page, `Record editor ${unique}`),
  ]);
  const memo = `E2E record editing ${unique}`;
  const updatedMemo = `E2E record editing updated ${unique}`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-17.43000000",
          category_id: null,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto("/transactions?page=1&pageSize=50&hideExpected=true");
  const transactionRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(transactionRow).toBeVisible();
  await transactionRow.locator(".transactions-description-column").click();
  await expect(transactionRow).toHaveAttribute("aria-expanded", "true");
  const records = page.getByTestId("expanded-records");

  const categoryCell = records.getByTestId("record-category-cell").last();
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = records.getByTestId("record-category-editor").last();
  const categoryInput = categoryEditor.getByRole("combobox", {
    name: "Category",
  });
  await expect(categoryInput).toBeFocused();
  await categoryInput.fill(nextCategory.fqn);
  await categoryEditor.getByRole("button", { name: "Save category" }).click();
  await expect(categoryCell).toContainText(nextCategory.fqn);
  await expect(
    transactionRow.locator(".transactions-category-column"),
  ).toContainText(nextCategory.name);

  const tagCell = records.getByTestId("record-tags-cell").first();
  await tagCell.hover();
  await tagCell.getByRole("button", { name: "Edit Tags" }).click();
  const tagEditor = records.getByTestId("record-tags-editor").first();
  const tagInput = tagEditor.getByRole("combobox", { name: "Tags" });
  await expect(tagInput).toBeFocused();
  await tagInput.fill(addedTag.fqn);
  await tagInput.press("Enter");
  await tagEditor.getByRole("button", { name: "Save tags" }).click();
  await expect(tagCell).toContainText(addedTag.name);

  const memberCell = records.getByTestId("record-member-cell").first();
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  let memberEditor = records.getByTestId("record-member-editor").first();
  const initialMemberInput = memberEditor.getByRole("combobox", {
    name: "Member",
  });
  await expect(initialMemberInput).toBeFocused();
  await initialMemberInput.fill(member.name);
  await memberEditor.getByRole("button", { name: "Save member" }).click();
  await expect(memberCell).toContainText(member.name);
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  memberEditor = records.getByTestId("record-member-editor").first();
  const memberInput = memberEditor.getByRole("combobox", { name: "Member" });
  await memberInput.fill(`${member.name} typo`);
  const saveMember = memberEditor.getByRole("button", { name: "Save member" });
  await expect(saveMember).toBeDisabled();
  await memberEditor
    .getByRole("button", { name: "Cancel member edit" })
    .click();
  await expect(memberCell).toContainText(member.name);
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  memberEditor = records.getByTestId("record-member-editor").first();
  await memberEditor.getByRole("button", { name: "Clear member" }).click();
  await expect(
    memberEditor.getByRole("combobox", { name: "Member" }),
  ).toHaveValue("");
  await expect(
    memberEditor.getByRole("button", { name: "Save member" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(memberEditor).toHaveCount(0);
  await expect(memberCell).not.toContainText(member.name);

  const memoCell = records.getByTestId("record-memo-cell").first();
  await memoCell.getByRole("button", { name: "Edit memo" }).click();
  const memoEditor = records.getByTestId("record-memo-editor").first();
  await memoEditor.getByLabel("Memo").fill(updatedMemo);
  await memoEditor.getByLabel("Memo").press("Enter");
  await expect(memoCell).toContainText(updatedMemo);

  const datesCell = records.getByTestId("record-dates-cell").first();
  await datesCell.getByRole("button", { name: "Edit dates" }).click();
  const datesEditor = records.getByTestId("record-dates-editor").first();
  await datesEditor.getByLabel("Initiated").fill("2026-07-09");
  await datesEditor.getByRole("button", { name: "Save" }).click();
  await expect(datesCell).toContainText("Initiated 2026-07-09");

  const statusCell = records.getByTestId("record-postingStatus-cell").first();
  await statusCell.focus();
  await statusCell.press("F2");
  const statusEditor = records
    .getByTestId("record-postingStatus-editor")
    .first();
  await statusEditor.getByRole("combobox", { name: "Posting status" }).click();
  await page.getByRole("option", { name: "Cancelled" }).click();
  await expect(statusEditor.getByRole("alert")).toContainText(/cancelled/i);
  const unchangedResponse = await page.request.get(
    `/api/transactions/${transaction.transaction_id}`,
  );
  expect(unchangedResponse.ok(), await unchangedResponse.text()).toBe(true);
  const unchanged =
    (await unchangedResponse.json()) as TransactionDetailFixture;
  expect(unchanged.records.map((record) => record.posting_status)).toEqual([
    "posted",
    "posted",
  ]);

  await expect(records.getByTestId("record-account-editor")).toHaveCount(0);
  await expect(records.getByTestId("record-amount-editor")).toHaveCount(0);
  const editAccountInJournal = records
    .getByRole("button", { name: "Edit account in journal" })
    .first();
  await editAccountInJournal.click();
  await expect(statusEditor).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Edit journal" })).toHaveCount(
    0,
  );
  await editAccountInJournal.click();
  await expect(
    page.getByRole("heading", { name: "Edit journal" }),
  ).toBeVisible();
  await deleteTransaction(page, transaction);
});

test("replacement edits preserve server-stamped pending dates", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E pending timestamp ${unique}`;
  const updatedMemo = `${memo} updated`;
  const created = await createSearchSpend(page, memo);
  const transaction = await getTransactionDetail(page, created);
  const targetRecord = transaction.records[0];
  const targetRecordId = targetRecord?.record_id;
  expect(targetRecordId).toBeDefined();
  if (!targetRecord || targetRecordId === undefined) {
    throw new Error("Created record has no id");
  }

  await page.goto("/transactions?page=1&pageSize=50&hideExpected=true");
  const transactionRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(transactionRow).toBeVisible();
  await transactionRow.locator(".transactions-description-column").click();
  const records = page.getByTestId("expanded-records");
  await expect(records).toBeVisible();

  let releaseListRefresh = () => {};
  const listRefreshReleased = new Promise<void>((resolve) => {
    releaseListRefresh = resolve;
  });
  await page.route("**/api/transactions?**", async (route) => {
    await listRefreshReleased;
    await route.continue();
  });
  await page.route("**/api/records/bulk/status", async (route) => {
    const response = await route.fetch();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    await route.fulfill({ response });
  });

  const statusCell = records.getByTestId("record-postingStatus-cell").first();
  await statusCell.focus();
  await statusCell.press("F2");
  const statusEditor = records
    .getByTestId("record-postingStatus-editor")
    .first();
  await statusEditor.getByRole("combobox", { name: "Posting status" }).click();
  await page.getByRole("option", { name: "Pending" }).click();
  await expect(statusEditor).toHaveCount(0);

  const afterStatus = await getTransactionDetail(page, transaction);
  const authoritativePendingDate = afterStatus.records.find(
    (record) => record.record_id === targetRecordId,
  )?.pending_date;
  expect(authoritativePendingDate).not.toBeNull();
  expect(authoritativePendingDate).not.toBeUndefined();

  const memoCell = records.getByTestId("record-memo-cell").first();
  await memoCell.getByRole("button", { name: "Edit memo" }).click();
  const memoEditor = records.getByTestId("record-memo-editor").first();
  await memoEditor.getByLabel("Memo").fill(updatedMemo);
  await memoEditor.getByLabel("Memo").press("Enter");
  await expect(memoCell).toContainText(updatedMemo);

  const afterReplacement = await getTransactionDetail(page, transaction);
  expect(
    afterReplacement.records.find(
      (record) => record.account_id === targetRecord.account_id,
    )?.pending_date,
  ).toBe(authoritativePendingDate);

  releaseListRefresh();
  await page.unroute("**/api/transactions?**");
  await page.unroute("**/api/records/bulk/status");
  await deleteTransaction(page, transaction);
});

test("successful status saves tolerate an authoritative refetch failure", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const memo = `E2E status refetch ${unique}`;
  const created = await createSearchSpend(page, memo);
  const transaction = await getTransactionDetail(page, created);
  const targetRecord = transaction.records[0];
  if (!targetRecord) {
    throw new Error("Created transaction has no records");
  }

  await page.goto("/transactions?page=1&pageSize=50&hideExpected=true");
  const transactionRow = page
    .getByRole("row")
    .filter({ hasText: memo })
    .first();
  await expect(transactionRow).toBeVisible();
  await transactionRow.locator(".transactions-description-column").click();
  const records = page.getByTestId("expanded-records");
  await expect(records).toBeVisible();

  let failedRefetches = 0;
  await page.route(
    `**/api/transactions/${transaction.transaction_id}`,
    async (route) => {
      if (failedRefetches === 0) {
        failedRefetches += 1;
        await route.fulfill({
          body: JSON.stringify({
            code: "internal_error",
            message: "forced authoritative refetch failure",
          }),
          contentType: "application/json",
          status: 500,
        });
        return;
      }
      await route.continue();
    },
  );

  const statusCell = records.getByTestId("record-postingStatus-cell").first();
  await statusCell.focus();
  await statusCell.press("F2");
  const statusEditor = records
    .getByTestId("record-postingStatus-editor")
    .first();
  await statusEditor.getByRole("combobox", { name: "Posting status" }).click();
  await page.getByRole("option", { name: "Pending" }).click();

  await expect(statusEditor).toHaveCount(0);
  await expect(statusCell).toContainText("pending");
  expect(failedRefetches).toBe(1);

  await page.unroute(`**/api/transactions/${transaction.transaction_id}`);
  const afterStatus = await getTransactionDetail(page, transaction);
  const updatedRecord = afterStatus.records.find(
    (record) => record.record_id === targetRecord.record_id,
  );
  expect(updatedRecord?.posting_status).toBe("pending");
  expect(updatedRecord?.pending_date).not.toBeNull();
  await deleteTransaction(page, transaction);
});

test("tag editor keeps many assignments and controls separate in a narrow viewport", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1024, height: 480 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const assignedTags = await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      createTag(
        page,
        `E2E:TagEditor:${unique}:Assigned${String(index + 1).padStart(2, "0")}`,
      ),
    ),
  );
  const suggestion = await createTag(
    page,
    `E2E:TagEditor:${unique}:Suggestion${unique}`,
  );
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const memo = `E2E tag editor overlap ${unique}`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-23.45000000",
          category_id: null,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: assignedTags.map((tag) => tag.tag_id),
        },
        {
          account_id: merchantAccount.account_id,
          amount: "23.45000000",
          category_id: category.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [assignedTags[0]!.tag_id],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto("/transactions?page=1&pageSize=100&hideExpected=true");
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await expect(row).toBeVisible();
  await row.getByTestId("transaction-line-title").click();
  await expect(row).toHaveAttribute("aria-expanded", "true");

  const tableScroll = page.getByTestId("transactions-table-scroll");
  const tagCell = page
    .getByTestId("expanded-records")
    .getByTestId("record-tags-cell")
    .first();
  await tableScroll.evaluate((container, transactionId) => {
    const target = container.querySelector<HTMLElement>(
      `[data-transaction-id="${transactionId}"] + tr [data-testid="record-tags-cell"]`,
    );
    if (!target) {
      return;
    }
    const containerBounds = container.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    container.scrollTop += targetBounds.bottom - containerBounds.bottom + 12;
  }, transaction.transaction_id);

  await tagCell.focus();
  await tagCell.press("F2");
  const tagEditor = page
    .getByTestId("expanded-records")
    .getByTestId("record-tags-editor")
    .first();
  await expect(tagEditor).toBeVisible();
  const searchInput = tagEditor.getByRole("combobox", { name: "Tags" });
  await searchInput.fill(`Suggestion${unique}`);
  const suggestionList = tagEditor.getByRole("listbox");
  await expect(
    suggestionList.getByRole("option", { name: suggestion.name }),
  ).toBeVisible();

  const selectedTags = tagEditor.getByTestId("entity-multi-picker-selected");
  const saveButton = tagEditor.getByRole("button", { name: "Save tags" });
  const cancelButton = tagEditor.getByRole("button", {
    name: "Cancel tags edit",
  });
  await expect(
    selectedTags.getByRole("button", { name: /^Remove / }),
  ).toHaveCount(assignedTags.length);
  await expect(saveButton).toBeVisible();
  await expect(cancelButton).toBeVisible();

  const editorBounds = await requiredBoundingBox(tagEditor);
  const inputBounds = await requiredBoundingBox(searchInput);
  const listBounds = await requiredBoundingBox(suggestionList);
  const selectedBounds = await requiredBoundingBox(selectedTags);
  const saveBounds = await requiredBoundingBox(saveButton);
  const cancelBounds = await requiredBoundingBox(cancelButton);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(editorBounds.x).toBeGreaterThanOrEqual(7.5);
  expect(editorBounds.y).toBeGreaterThanOrEqual(7.5);
  expect(editorBounds.x + editorBounds.width).toBeLessThanOrEqual(
    (viewport?.width ?? 0) - 7.5,
  );
  expect(editorBounds.y + editorBounds.height).toBeLessThanOrEqual(
    (viewport?.height ?? 0) - 7.5,
  );
  expect(boundingBoxesOverlap(inputBounds, listBounds)).toBe(false);
  expect(boundingBoxesOverlap(listBounds, selectedBounds)).toBe(false);
  expect(boundingBoxesOverlap(selectedBounds, saveBounds)).toBe(false);
  expect(boundingBoxesOverlap(selectedBounds, cancelBounds)).toBe(false);
  expect(boundingBoxesOverlap(listBounds, saveBounds)).toBe(false);
  expect(boundingBoxesOverlap(listBounds, cancelBounds)).toBe(false);
  await expect
    .poll(() =>
      selectedTags.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true);

  await selectedTags
    .getByRole("button", {
      name: `Remove ${assignedTags.at(-1)?.name ?? "missing tag"}`,
    })
    .click();
  await expect(
    selectedTags.getByRole("button", { name: /^Remove / }),
  ).toHaveCount(assignedTags.length - 1);
  await cancelButton.click();
  await expect(tagEditor).toHaveCount(0);

  const bottomEdgeTagCell = page
    .getByTestId("expanded-records")
    .getByTestId("record-tags-cell")
    .nth(1);
  await tableScroll.evaluate((container, transactionId) => {
    const target = container.querySelectorAll<HTMLElement>(
      `[data-transaction-id="${transactionId}"] + tr [data-testid="record-tags-cell"]`,
    )[1];
    if (!target) {
      return;
    }
    const targetBounds = target.getBoundingClientRect();
    container.scrollTop += targetBounds.bottom - 500;
  }, transaction.transaction_id);

  await bottomEdgeTagCell.focus();
  await bottomEdgeTagCell.press("F2");
  const bottomEdgeEditor = page
    .getByTestId("expanded-records")
    .getByTestId("record-tags-editor")
    .first();
  const bottomEdgeSearchInput = bottomEdgeEditor.getByRole("combobox", {
    name: "Tags",
  });
  const bottomEdgeSelectedTags = bottomEdgeEditor.getByTestId(
    "entity-multi-picker-selected",
  );
  await bottomEdgeSelectedTags
    .getByRole("button", { name: `Remove ${assignedTags[0]!.name}` })
    .click();
  await expect(bottomEdgeSelectedTags).toHaveCount(0);
  await expect(bottomEdgeEditor.getByRole("listbox")).toHaveCount(0);

  await bottomEdgeSearchInput.focus();
  await bottomEdgeSearchInput.fill(`Suggestion${unique}`);
  const bottomEdgeSuggestionList = bottomEdgeEditor.getByRole("listbox");
  await expect(
    bottomEdgeSuggestionList.getByRole("option", { name: suggestion.name }),
  ).toBeVisible();
  const refocusedListBounds = await requiredBoundingBox(
    bottomEdgeSuggestionList,
  );
  const refocusedSaveBounds = await requiredBoundingBox(
    bottomEdgeEditor.getByRole("button", { name: "Save tags" }),
  );
  const refocusedCancelBounds = await requiredBoundingBox(
    bottomEdgeEditor.getByRole("button", { name: "Cancel tags edit" }),
  );
  expect(refocusedListBounds.height).toBeGreaterThan(4);
  expect(boundingBoxesOverlap(refocusedListBounds, refocusedSaveBounds)).toBe(
    false,
  );
  expect(boundingBoxesOverlap(refocusedListBounds, refocusedCancelBounds)).toBe(
    false,
  );
  await bottomEdgeEditor
    .getByRole("button", { name: "Cancel tags edit" })
    .click();
  await expect(bottomEdgeEditor).toHaveCount(0);

  await tagCell.focus();
  await tagCell.press("F2");
  const reopenedEditor = page
    .getByTestId("expanded-records")
    .getByTestId("record-tags-editor")
    .first();
  await reopenedEditor.getByRole("button", { name: "Save tags" }).click();
  await expect(reopenedEditor).toHaveCount(0);
  const savedResponse = await page.request.get(
    `/api/transactions/${transaction.transaction_id}`,
  );
  expect(savedResponse.ok(), await savedResponse.text()).toBe(true);
  const saved = (await savedResponse.json()) as TransactionDetailFixture;
  expect(saved.records[0]?.tag_ids).toHaveLength(assignedTags.length);
});

test("inline category tag member and amount saves keep the transaction table stable", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1600, height: 800 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const initialCategory = findByFqn(categories, "Income:Salary");
  const [nextCategory, nextTag, nextMember] = await Promise.all([
    createCategory(page, `E2E:ResponsiveSave:${unique}:Category`, "expense"),
    createTag(page, `E2E:ResponsiveSave:${unique}:Tag`),
    createMember(page, `Responsive save ${unique}`),
  ]);
  const memo = `E2E responsive inline save ${unique}`;
  const createResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-21",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "17.43000000",
          category_id: null,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "-17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionDetailFixture;

  await page.goto("/transactions?page=1&pageSize=100&hideExpected=true");
  const tableScroll = page.getByTestId("transactions-table-scroll");
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await expect(row).toBeVisible();
  await expect(row.getByRole("checkbox")).toHaveCount(0);
  await row.getByTestId("transaction-line-title").click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await tableScroll.evaluate((element, transactionId) => {
    const transactionRow = element.querySelector<HTMLElement>(
      `[data-transaction-id="${transactionId}"]`,
    );
    const header = element.querySelector<HTMLElement>("thead");
    if (!transactionRow) {
      return;
    }
    const containerBounds = element.getBoundingClientRect();
    const rowBounds = transactionRow.getBoundingClientRect();
    element.scrollTop +=
      rowBounds.top -
      containerBounds.top -
      (header?.getBoundingClientRect().height ?? 0) -
      8;
    element.scrollTop = Math.max(element.scrollTop, 16);
  }, transaction.transaction_id);
  const expandedRecords = page.getByTestId("expanded-records");
  await expect(expandedRecords).toBeVisible();

  const rowPrefix = `transaction-${transaction.transaction_id}`;
  const categoryCell = row.getByTestId(`${rowPrefix}-category-cell`);
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = row.getByTestId(`${rowPrefix}-category-editor`);
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  await expectInlineSaveKeepsTransactionTableStable(
    page,
    transaction.transaction_id,
    categoryCell,
    () => categoryEditor.getByRole("button", { name: "Save category" }).click(),
    async () => {
      await expect(row.getByRole("img", { name: "REFUND" })).toBeVisible();
      await expect(
        expandedRecords.getByText(nextCategory.fqn, { exact: true }),
      ).toHaveCount(1);
    },
  );
  await expect(categoryEditor).toHaveCount(0);
  await expect(
    expandedRecords.getByText(nextCategory.fqn, { exact: true }),
  ).toHaveCount(1);
  await expect(row.getByRole("img", { name: "REFUND" })).toBeVisible();

  const tagCell = row.getByTestId(`${rowPrefix}-tags-cell`);
  await tagCell.focus();
  await tagCell.press("F2");
  const tagEditor = row.getByTestId(`${rowPrefix}-tags-editor`);
  await tagEditor.getByRole("combobox", { name: "Tags" }).fill(nextTag.fqn);
  await tagEditor.getByRole("combobox", { name: "Tags" }).press("Enter");
  await expectInlineSaveKeepsTransactionTableStable(
    page,
    transaction.transaction_id,
    tagCell,
    () => tagEditor.getByRole("button", { name: "Save tags" }).click(),
    async () => {
      await expect(
        expandedRecords.getByText(nextTag.fqn, { exact: true }),
      ).toHaveCount(2);
    },
  );
  await expect(tagEditor).toHaveCount(0);
  await expect(
    expandedRecords.getByText(nextTag.fqn, { exact: true }),
  ).toHaveCount(2);

  const memberCell = row.getByTestId(`${rowPrefix}-member-cell`);
  await memberCell.focus();
  await memberCell.press("F2");
  const memberEditor = row.getByTestId(`${rowPrefix}-member-editor`);
  await memberEditor
    .getByRole("combobox", { name: "Member" })
    .fill(nextMember.name);
  await memberEditor.getByRole("combobox", { name: "Member" }).press("Enter");
  await expectInlineSaveKeepsTransactionTableStable(
    page,
    transaction.transaction_id,
    memberCell,
    () => memberEditor.getByRole("button", { name: "Save member" }).click(),
    async () => {
      await expect(
        expandedRecords.getByText(nextMember.name, { exact: true }),
      ).toHaveCount(2);
    },
  );
  await expect(memberEditor).toHaveCount(0);
  await expect(
    expandedRecords.getByText(nextMember.name, { exact: true }),
  ).toHaveCount(2);

  const amountCell = row.getByTestId(`${rowPrefix}-amount-cell`);
  await amountCell.focus();
  await amountCell.press("F2");
  const amountEditor = row.getByTestId(`${rowPrefix}-amount-editor`);
  await amountEditor.getByRole("textbox", { name: "Amount" }).fill("29.87");
  await expectInlineSaveKeepsTransactionTableStable(
    page,
    transaction.transaction_id,
    amountCell,
    () => amountEditor.getByRole("button", { name: "Save amount" }).click(),
    async () => {
      await expect(expandedRecords).toContainText("-29.87 $");
      await expect(expandedRecords).toContainText("+29.87 $");
    },
  );
  await expect(amountEditor).toHaveCount(0);
  await expect(expandedRecords).toContainText("-29.87 $");
  await expect(expandedRecords).toContainText("+29.87 $");
  await expect(row.getByRole("checkbox")).toHaveCount(0);

  await deleteTransaction(page, transaction);
});

test("filtered inline category save restores focus after its row disappears", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, initialCategory, nextCategory] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    createCategory(page, `E2E:FilteredInlineSave:${unique}:Initial`, "expense"),
    createCategory(page, `E2E:FilteredInlineSave:${unique}:Next`, "expense"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const sourceMemo = `E2E filtered inline source ${unique}`;
  const neighborMemo = `E2E filtered inline neighbor ${unique}`;
  const createSpend = async (
    memo: string,
    initiatedDate: string,
  ): Promise<TransactionFixture> => {
    const response = await page.request.post("/api/transactions/spend", {
      data: {
        amount: "12.34",
        category_id: initialCategory.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: initiatedDate,
        memo,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as TransactionFixture;
  };
  const [sourceTransaction, neighborTransaction] = await Promise.all([
    createSpend(sourceMemo, "2026-07-20"),
    createSpend(neighborMemo, "2026-07-19"),
  ]);

  await page.goto(
    `/transactions?page=1&pageSize=50&hideExpected=true&q=${encodeURIComponent(
      unique,
    )}&category=${initialCategory.category_id}`,
  );
  const sourceRow = page.locator(
    `[data-transaction-id="${sourceTransaction.transaction_id}"]`,
  );
  const neighborRow = page.locator(
    `[data-transaction-id="${neighborTransaction.transaction_id}"]`,
  );
  await expect(sourceRow).toBeVisible();
  await expect(neighborRow).toBeVisible();

  let refreshAttempts = 0;
  const failFirstListRefresh = async (route: Route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      url.pathname !== "/api/transactions"
    ) {
      await route.continue();
      return;
    }

    refreshAttempts += 1;
    if (refreshAttempts === 1) {
      await route.fulfill({
        body: JSON.stringify({
          error: {
            code: "forced_transient_refresh_failure",
            message: "Forced transient transaction refresh failure.",
          },
        }),
        contentType: "application/json",
        status: 503,
      });
      return;
    }
    await route.continue();
  };
  await page.route("**/api/transactions**", failFirstListRefresh);

  const categoryCell = sourceRow.getByTestId(
    `transaction-${sourceTransaction.transaction_id}-category-cell`,
  );
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = sourceRow.getByTestId(
    `transaction-${sourceTransaction.transaction_id}-category-editor`,
  );
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  await categoryEditor.getByRole("button", { name: "Save category" }).click();

  await expect.poll(() => refreshAttempts).toBe(2);
  await expect(sourceRow).toHaveCount(0);
  await expect(neighborRow).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.activeElement === document.body))
    .toBe(false);

  await page.unroute("**/api/transactions**", failFirstListRefresh);
  await Promise.all([
    deleteTransaction(page, sourceTransaction),
    deleteTransaction(page, neighborTransaction),
  ]);
});

test("filtered inline category save focuses the empty-list action", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, initialCategory, nextCategory] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    createCategory(page, `E2E:FilteredEmptySave:${unique}:Initial`, "expense"),
    createCategory(page, `E2E:FilteredEmptySave:${unique}:Next`, "expense"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: initialCategory.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-20",
      memo: `E2E filtered empty inline save ${unique}`,
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&hideExpected=true&q=${encodeURIComponent(
      unique,
    )}&category=${initialCategory.category_id}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await expect(row).toBeVisible();

  const categoryCell = row.getByTestId(
    `transaction-${transaction.transaction_id}-category-cell`,
  );
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = row.getByTestId(
    `transaction-${transaction.transaction_id}-category-editor`,
  );
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  await categoryEditor.getByRole("button", { name: "Save category" }).click();

  await expect(row).toHaveCount(0);
  await expect(page.locator("[data-transaction-empty-action]")).toBeFocused();

  await deleteTransaction(page, transaction);
});

test("filtered expanded and amount saves restore focus after row removal", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, initialCategory, nextCategory] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    createCategory(page, `E2E:FilteredPaths:${unique}:Initial`, "expense"),
    createCategory(page, `E2E:FilteredPaths:${unique}:Next`, "expense"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const createSpend = async (
    memo: string,
    amount: string,
  ): Promise<TransactionFixture> => {
    const response = await page.request.post("/api/transactions/spend", {
      data: {
        amount,
        category_id: initialCategory.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: "2026-07-20",
        memo,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as TransactionFixture;
  };
  const categoryMemo = `E2E filtered expanded category ${unique}`;
  const statusMemo = `E2E filtered expanded status ${unique}`;
  const amountMemo = `E2E filtered amount ${unique}`;
  const [categoryTransaction, amountTransaction] = await Promise.all([
    createSpend(categoryMemo, "12.50"),
    createSpend(amountMemo, "12.34"),
  ]);
  const statusResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-20",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-13.34000000",
          category_id: null,
          currency: "USD",
          memo: statusMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "13.34000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: statusMemo,
          posting_status: "pending",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(statusResponse.ok(), await statusResponse.text()).toBe(true);
  const statusTransaction = (await statusResponse.json()) as TransactionFixture;
  const transactionRows = page.locator("[data-transaction-row='true']");
  const neighborAfterRemoval = async (
    transactionId: number,
  ): Promise<Locator> => {
    const rowIds = await transactionRows.evaluateAll((rows) =>
      rows.map((row) => Number((row as HTMLElement).dataset.transactionId)),
    );
    const sourceIndex = rowIds.indexOf(transactionId);
    expect(sourceIndex).toBeGreaterThanOrEqual(0);
    const survivingRowIds = rowIds.filter((id) => id !== transactionId);
    const neighborId =
      survivingRowIds[Math.min(sourceIndex, survivingRowIds.length - 1)];
    expect(neighborId).toBeDefined();
    return page.locator(`[data-transaction-id="${neighborId}"]`);
  };

  await page.goto(
    `/transactions?page=1&pageSize=50&hideExpected=true&q=${encodeURIComponent(
      unique,
    )}&category=${initialCategory.category_id}`,
  );
  const categoryRow = page.locator(
    `[data-transaction-id="${categoryTransaction.transaction_id}"]`,
  );
  await expect(categoryRow).toBeVisible();
  await categoryRow.getByTestId("transaction-line-title").click();
  const categoryCell = page
    .getByTestId("expanded-records")
    .getByTestId("record-category-cell")
    .last();
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = page
    .getByTestId("expanded-records")
    .getByTestId("record-category-editor")
    .last();
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  const categoryNeighbor = await neighborAfterRemoval(
    categoryTransaction.transaction_id,
  );
  await categoryEditor.getByRole("button", { name: "Save category" }).click();
  await expect(categoryRow).toHaveCount(0);
  await expect(categoryNeighbor).toBeFocused();

  await page.goto(
    `/transactions?page=1&pageSize=50&hideExpected=true&q=${encodeURIComponent(
      unique,
    )}&status=posted`,
  );
  const statusRow = page.locator(
    `[data-transaction-id="${statusTransaction.transaction_id}"]`,
  );
  await expect(statusRow).toBeVisible();
  await statusRow.getByTestId("transaction-line-title").click();
  const statusCell = page
    .getByTestId("expanded-records")
    .getByTestId("record-postingStatus-cell")
    .first();
  await statusCell.focus();
  await statusCell.press("F2");
  await page
    .getByTestId("record-postingStatus-editor")
    .getByRole("combobox", { name: "Posting status" })
    .click();
  const statusNeighbor = await neighborAfterRemoval(
    statusTransaction.transaction_id,
  );
  await page.getByRole("option", { name: "Pending" }).click();
  await expect(statusRow).toHaveCount(0);
  await expect(statusNeighbor).toBeFocused();

  await page.goto(
    `/transactions?page=1&pageSize=50&hideExpected=true&q=${encodeURIComponent(
      unique,
    )}&amountMin=12&amountMax=13`,
  );
  const amountRow = page.locator(
    `[data-transaction-id="${amountTransaction.transaction_id}"]`,
  );
  await expect(amountRow).toBeVisible();
  const amountCell = amountRow.getByTestId(
    `transaction-${amountTransaction.transaction_id}-amount-cell`,
  );
  await amountCell.focus();
  await amountCell.press("F2");
  const amountEditor = amountRow.getByTestId(
    `transaction-${amountTransaction.transaction_id}-amount-editor`,
  );
  await amountEditor.getByRole("textbox", { name: "Amount" }).fill("29.87");
  const amountNeighbor = await neighborAfterRemoval(
    amountTransaction.transaction_id,
  );
  await amountEditor.getByRole("button", { name: "Save amount" }).click();
  await expect(amountRow).toHaveCount(0);
  await expect(amountNeighbor).toBeFocused();

  await Promise.all([
    deleteTransaction(page, categoryTransaction),
    deleteTransaction(page, statusTransaction),
    deleteTransaction(page, amountTransaction),
  ]);
});

test("reference editor releases while its page refresh is pending", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, initialCategory, nextCategory] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    createCategory(page, `E2E:RefreshRelease:${unique}:Initial`, "expense"),
    createCategory(page, `E2E:RefreshRelease:${unique}:Next`, "expense"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const memo = `E2E reference refresh release ${unique}`;
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: initialCategory.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-20",
      memo,
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionFixture;
  const neighborResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "23.45",
      category_id: initialCategory.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-19",
      memo: `E2E reference refresh release neighbor ${unique}`,
    },
  });
  expect(neighborResponse.ok(), await neighborResponse.text()).toBe(true);
  const neighborTransaction =
    (await neighborResponse.json()) as TransactionFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&hideExpected=true&q=${encodeURIComponent(unique)}&category=${initialCategory.category_id}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  const neighborRow = page.locator(
    `[data-transaction-id="${neighborTransaction.transaction_id}"]`,
  );
  await expect(row).toBeVisible();
  await expect(neighborRow).toBeVisible();

  let releaseRefresh: (() => void) | undefined;
  let markRefreshStarted: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    markRefreshStarted = resolve;
  });
  const holdListRefresh = async (route: Route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      url.pathname !== "/api/transactions"
    ) {
      await route.continue();
      return;
    }

    markRefreshStarted?.();
    await new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    await route.continue();
  };
  await page.route("**/api/transactions**", holdListRefresh);

  const categoryCell = row.getByTestId(
    `transaction-${transaction.transaction_id}-category-cell`,
  );
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = row.getByTestId(
    `transaction-${transaction.transaction_id}-category-editor`,
  );
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  await categoryEditor.getByRole("button", { name: "Save category" }).click();
  await refreshStarted;

  await expect(categoryEditor).toHaveCount(0);
  await expect(categoryCell).toBeFocused();
  const amountCell = neighborRow.getByTestId(
    `transaction-${neighborTransaction.transaction_id}-amount-cell`,
  );
  await amountCell.focus();
  await amountCell.press("F2");
  const amountEditor = neighborRow.getByTestId(
    `transaction-${neighborTransaction.transaction_id}-amount-editor`,
  );
  await expect(amountEditor).toBeVisible();
  const amountInput = amountEditor.getByRole("textbox", { name: "Amount" });
  await expect(amountInput).toBeFocused();

  releaseRefresh?.();
  await expect(row).toHaveCount(0);
  await expect(amountEditor).toBeVisible();
  await expect(amountInput).toBeFocused();

  await amountEditor
    .getByRole("button", { name: "Cancel amount edit" })
    .click();
  await page.unroute("**/api/transactions**", holdListRefresh);
  await Promise.all([
    deleteTransaction(page, transaction),
    deleteTransaction(page, neighborTransaction),
  ]);
});

test("overlapping filtered saves restore focus for the latest save", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, initialCategory, nextCategory] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    createCategory(page, `E2E:OverlappingSave:${unique}:Initial`, "expense"),
    createCategory(page, `E2E:OverlappingSave:${unique}:Next`, "expense"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const createSpend = async (
    memo: string,
    initiatedDate: string,
  ): Promise<TransactionFixture> => {
    const response = await page.request.post("/api/transactions/spend", {
      data: {
        amount: "12.34",
        category_id: initialCategory.category_id,
        counterparty_account_id: merchantAccount.account_id,
        currency: "USD",
        funding_account_id: fundingAccount.account_id,
        initiated_date: initiatedDate,
        memo,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as TransactionFixture;
  };
  const [
    firstSourceTransaction,
    firstNeighborTransaction,
    latestSourceTransaction,
    latestNeighborTransaction,
  ] = await Promise.all([
    createSpend(`E2E overlapping first source ${unique}`, "2026-07-20"),
    createSpend(`E2E overlapping first neighbor ${unique}`, "2026-07-19"),
    createSpend(`E2E overlapping latest source ${unique}`, "2026-07-18"),
    createSpend(`E2E overlapping latest neighbor ${unique}`, "2026-07-17"),
  ]);

  await page.goto(
    `/transactions?page=1&pageSize=50&hideExpected=true&q=${encodeURIComponent(
      unique,
    )}&category=${initialCategory.category_id}`,
  );
  const rowFor = (transaction: TransactionFixture) =>
    page.locator(`[data-transaction-id="${transaction.transaction_id}"]`);
  const firstSourceRow = rowFor(firstSourceTransaction);
  const firstNeighborRow = rowFor(firstNeighborTransaction);
  const latestSourceRow = rowFor(latestSourceTransaction);
  const latestNeighborRow = rowFor(latestNeighborTransaction);
  await expect(firstSourceRow).toBeVisible();
  await expect(firstNeighborRow).toBeVisible();
  await expect(latestSourceRow).toBeVisible();
  await expect(latestNeighborRow).toBeVisible();

  let refreshAttempts = 0;
  const releaseRefreshes: Array<() => void> = [];
  const holdListRefresh = async (route: Route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      url.pathname !== "/api/transactions"
    ) {
      await route.continue();
      return;
    }

    const attempt = refreshAttempts;
    refreshAttempts += 1;
    await new Promise<void>((resolve) => {
      releaseRefreshes[attempt] = resolve;
    });
    await route.continue();
  };
  await page.route("**/api/transactions**", holdListRefresh);

  const saveCategory = async (
    row: Locator,
    transaction: TransactionFixture,
  ) => {
    const categoryCell = row.getByTestId(
      `transaction-${transaction.transaction_id}-category-cell`,
    );
    await categoryCell.focus();
    await categoryCell.press("F2");
    const categoryEditor = row.getByTestId(
      `transaction-${transaction.transaction_id}-category-editor`,
    );
    await categoryEditor
      .getByRole("combobox", { name: "Category" })
      .fill(nextCategory.fqn);
    await categoryEditor.getByRole("button", { name: "Save category" }).click();
    await expect(categoryEditor).toHaveCount(0);
  };

  await saveCategory(firstSourceRow, firstSourceTransaction);
  await expect.poll(() => refreshAttempts).toBe(1);
  await saveCategory(latestSourceRow, latestSourceTransaction);
  await expect.poll(() => refreshAttempts).toBe(2);

  const firstRefreshResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/transactions"
    );
  });
  releaseRefreshes[0]?.();
  await (await firstRefreshResponse).finished();

  releaseRefreshes[1]?.();
  await expect(firstSourceRow).toHaveCount(0);
  await expect(latestSourceRow).toHaveCount(0);
  await expect(latestNeighborRow).toBeFocused();
  await expect(firstNeighborRow).not.toBeFocused();

  await page.unroute("**/api/transactions**", holdListRefresh);
  await Promise.all(
    [
      firstSourceTransaction,
      firstNeighborTransaction,
      latestSourceTransaction,
      latestNeighborTransaction,
    ].map((transaction) => deleteTransaction(page, transaction)),
  );
});

test("repeated background refresh failures surface stale transactions", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, initialCategory, nextCategory] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    createCategory(page, `E2E:RepeatedRefresh:${unique}:Initial`, "expense"),
    createCategory(page, `E2E:RepeatedRefresh:${unique}:Next`, "expense"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const memo = `E2E repeated refresh ${unique}`;
  const createResponse = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: initialCategory.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-07-20",
      memo,
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBe(true);
  const transaction = (await createResponse.json()) as TransactionFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&hideExpected=true&q=${encodeURIComponent(
      unique,
    )}`,
  );
  const row = page.locator(
    `[data-transaction-id="${transaction.transaction_id}"]`,
  );
  await expect(row).toBeVisible();

  let failedRefreshes = 0;
  let holdSuccessfulRefresh = false;
  let releaseSuccessfulRefresh: (() => void) | undefined;
  let markSuccessfulRefreshStarted: (() => void) | undefined;
  const successfulRefreshStarted = new Promise<void>((resolve) => {
    markSuccessfulRefreshStarted = resolve;
  });
  const failTwoListRefreshes = async (route: Route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      url.pathname !== "/api/transactions"
    ) {
      await route.continue();
      return;
    }
    if (failedRefreshes < 2) {
      failedRefreshes += 1;
      await route.fulfill({
        body: JSON.stringify({
          error: {
            code: "forced_repeated_refresh_failure",
            message: "Forced repeated transaction refresh failure.",
          },
        }),
        contentType: "application/json",
        status: 503,
      });
      return;
    }
    if (holdSuccessfulRefresh) {
      markSuccessfulRefreshStarted?.();
      await new Promise<void>((resolve) => {
        releaseSuccessfulRefresh = resolve;
      });
    }
    await route.continue();
  };
  await page.route("**/api/transactions**", failTwoListRefreshes);

  const categoryCell = row.getByTestId(
    `transaction-${transaction.transaction_id}-category-cell`,
  );
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = row.getByTestId(
    `transaction-${transaction.transaction_id}-category-editor`,
  );
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  await categoryEditor.getByRole("button", { name: "Save category" }).click();

  await expect.poll(() => failedRefreshes).toBe(2);
  const staleAlert = page
    .getByRole("alert")
    .filter({ hasText: "Transactions may be stale." });
  await expect(staleAlert).toBeVisible();
  await staleAlert.getByText("Refresh error").click();
  await expect(staleAlert).toContainText(
    "Forced repeated transaction refresh failure.",
  );
  await expect(staleAlert).toContainText("forced_repeated_refresh_failure");
  await expect(row).toBeVisible();
  await page.waitForTimeout(250);
  expect(failedRefreshes).toBe(2);

  holdSuccessfulRefresh = true;
  await categoryCell.focus();
  await categoryCell.press("F2");
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(initialCategory.fqn);
  await categoryEditor.getByRole("button", { name: "Save category" }).click();
  await successfulRefreshStarted;
  await expect(staleAlert).toBeVisible();

  releaseSuccessfulRefresh?.();
  await expect(staleAlert).toHaveCount(0);
  await expect(row).toContainText(initialCategory.name);

  await page.unroute("**/api/transactions**", failTwoListRefreshes);
  await deleteTransaction(page, transaction);
});

test("transaction-row inline editing follows the uniformity rule", async ({
  page,
}, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1600, height: 900 });
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const initialCategory = findByFqn(categories, "Entertainment:Books");
  const [nextCategory, initialTag, nextTag, member] = await Promise.all([
    createCategory(page, `E2E:RowEditing:${unique}:UpdatedCategory`, "expense"),
    createTag(page, `E2E:RowEditing:${unique}:InitialTag`),
    createTag(page, `E2E:RowEditing:${unique}:NextTag`),
    createMember(page, `Row editor ${unique}`),
  ]);
  const personAccount = await createAccount(
    page,
    `people:RowEditing:${unique}:balance`,
    "owned",
    "USD",
  );
  const memo = `E2E row editing ${unique}`;
  const uniformResponse = await page.request.post("/api/transactions", {
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
          posting_status: "posted",
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
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [initialTag.tag_id],
        },
      ],
    },
  });
  expect(uniformResponse.ok(), await uniformResponse.text()).toBe(true);
  const uniform = (await uniformResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?q=${encodeURIComponent(memo)}&page=1&pageSize=50&hideExpected=true`,
  );
  const row = page.getByRole("row").filter({ hasText: memo }).first();
  await expect(row).toBeVisible();
  const rowPrefix = `transaction-${uniform.transaction_id}`;
  await row
    .getByRole("button", { name: `Filter by ${initialCategory.name}` })
    .click();
  await expectTransactionFilterUrl(page, {
    categories: [initialCategory.category_id],
    hideExpected: true,
    q: memo,
  });
  await page.getByRole("button", { name: "Close filters" }).click();
  await expectTransactionFilterUrl(page, { hideExpected: true, q: memo });
  await page.reload();
  await expect(row).toBeVisible();
  const categoryCell = row.getByTestId(`${rowPrefix}-category-cell`);
  await categoryCell.focus();
  await categoryCell.press("F2");
  const categoryEditor = row.getByTestId(`${rowPrefix}-category-editor`);
  await categoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(nextCategory.fqn);
  await categoryEditor.getByRole("button", { name: "Save category" }).click();
  await expect(categoryEditor).toHaveCount(0);
  await row.locator(".transactions-description-column").click();
  const expandedRecords = page.getByTestId("expanded-records");
  await expect(
    expandedRecords.getByText(nextCategory.fqn, { exact: true }),
  ).toHaveCount(1);

  const tagCell = row.getByTestId(`${rowPrefix}-tags-cell`);
  await tagCell.hover();
  await tagCell.getByRole("button", { name: "Edit Tags" }).click();
  const tagEditor = row.getByTestId(`${rowPrefix}-tags-editor`);
  const tagInput = tagEditor.getByRole("combobox", { name: "Tags" });
  await expect(tagCell.getByRole("button", { name: "Edit Tags" })).toHaveCount(
    0,
  );
  await tagInput.press("Shift+Tab");
  await expect
    .poll(() =>
      tagCell.evaluate((cell) => cell.contains(document.activeElement)),
    )
    .toBe(false);
  await expect(tagEditor).toBeVisible();
  await tagInput.fill(nextTag.fqn);
  await tagInput.press("Enter");
  await tagEditor.getByRole("button", { name: "Save tags" }).click();
  await expect(
    expandedRecords.getByText(nextTag.fqn, { exact: true }),
  ).toHaveCount(2);

  const memberCell = row.getByTestId(`${rowPrefix}-member-cell`);
  await memberCell.hover();
  await memberCell.getByRole("button", { name: "Edit Member" }).click();
  const memberEditor = row.getByTestId(`${rowPrefix}-member-editor`);
  await memberEditor
    .getByRole("combobox", { name: "Member" })
    .fill(member.name);
  await memberEditor.getByRole("combobox", { name: "Member" }).press("Enter");
  await memberEditor.getByRole("button", { name: "Save member" }).click();
  await expect(
    expandedRecords.getByText(member.name, { exact: true }),
  ).toHaveCount(2);

  const amountCell = row.getByTestId(`${rowPrefix}-amount-cell`);
  await amountCell.hover();
  await amountCell.getByRole("button", { name: "Edit row value" }).click();
  const amountEditor = row.getByTestId(`${rowPrefix}-amount-editor`);
  await amountEditor.getByRole("textbox", { name: "Amount" }).fill("29.87");
  await amountEditor.getByRole("button", { name: "Save amount" }).click();
  await expect(expandedRecords).toContainText("-29.87 $");
  await expect(expandedRecords).toContainText("+29.87 $");

  const mixedMemo = `E2E row editing mixed ${unique}`;
  const mixedResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-12.00000000",
          category_id: null,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "6.00000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "6.00000000",
          category_id: nextCategory.category_id,
          currency: "USD",
          memo: mixedMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(mixedResponse.ok(), await mixedResponse.text()).toBe(true);
  const mixed = (await mixedResponse.json()) as TransactionDetailFixture;
  await page.goto(
    `/transactions?q=${encodeURIComponent(mixedMemo)}&page=1&pageSize=50&hideExpected=true`,
  );
  const mixedRow = page.getByRole("row").filter({ hasText: mixedMemo }).first();
  await expect(mixedRow).toContainText("Mixed");
  await expect(
    mixedRow.getByTestId(`transaction-${mixed.transaction_id}-category-cell`),
  ).toHaveCount(0);

  const nonSimpleMemo = `E2E row editing non-simple ${unique}`;
  const nonSimpleResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-10",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-20.00000000",
          category_id: null,
          currency: "USD",
          memo: nonSimpleMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "15.00000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: nonSimpleMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: personAccount.account_id,
          amount: "5.00000000",
          category_id: null,
          currency: "USD",
          memo: nonSimpleMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(nonSimpleResponse.ok(), await nonSimpleResponse.text()).toBe(true);
  const nonSimple =
    (await nonSimpleResponse.json()) as TransactionDetailFixture;
  await page.goto(
    `/transactions?q=${encodeURIComponent(nonSimpleMemo)}&page=1&pageSize=50&hideExpected=true`,
  );
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: nonSimpleMemo })
      .first()
      .getByTestId(`transaction-${nonSimple.transaction_id}-amount-cell`),
  ).toHaveCount(0);

  await Promise.all([
    deleteTransaction(page, uniform),
    deleteTransaction(page, mixed),
    deleteTransaction(page, nonSimple),
  ]);

  await page.goto("/transactions?page=1&pageSize=50");
  const expectedRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("img", { name: "Expected" }) })
    .first();
  await expect(expectedRow).toBeVisible();
  await expect(
    expectedRow.getByRole("button", { name: "Edit Category" }),
  ).toHaveCount(0);
  await expect(
    expectedRow.getByRole("button", { name: "Edit Tags" }),
  ).toHaveCount(0);
  await expect(
    expectedRow.getByRole("button", { name: "Edit Member" }),
  ).toHaveCount(0);
  await expect(
    expectedRow.getByRole("button", { name: "Edit row value" }),
  ).toHaveCount(0);
});

test("inline editing keeps one explicit-commit draft across transaction rows", async ({
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
  const [draftCategory, savedCategory] = await Promise.all([
    createCategory(page, `E2E:ExplicitCommit:${unique}:Draft`, "expense"),
    createCategory(page, `E2E:ExplicitCommit:${unique}:Saved`, "expense"),
  ]);
  const memoPrefix = `E2E explicit commit ${unique}`;
  const firstMemo = `${memoPrefix} first`;
  const secondMemo = `${memoPrefix} second`;

  const firstCreateResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-11",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-17.43000000",
          category_id: null,
          currency: "USD",
          memo: firstMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "17.43000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: firstMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(firstCreateResponse.ok(), await firstCreateResponse.text()).toBe(true);
  const firstTransaction =
    (await firstCreateResponse.json()) as TransactionDetailFixture;

  const secondCreateResponse = await page.request.post("/api/transactions", {
    data: {
      initiated_date: "2026-07-12",
      records: [
        {
          account_id: fundingAccount.account_id,
          amount: "-23.58000000",
          category_id: null,
          currency: "USD",
          memo: secondMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
        {
          account_id: merchantAccount.account_id,
          amount: "23.58000000",
          category_id: initialCategory.category_id,
          currency: "USD",
          memo: secondMemo,
          posting_status: "posted",
          reconciliation_status: "unreconciled",
          source: "manual",
          tag_ids: [],
        },
      ],
    },
  });
  expect(secondCreateResponse.ok(), await secondCreateResponse.text()).toBe(
    true,
  );
  const secondTransaction =
    (await secondCreateResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?q=${encodeURIComponent(memoPrefix)}&page=1&pageSize=50&hideExpected=true`,
  );
  const firstRow = page.getByRole("row").filter({ hasText: firstMemo }).first();
  const secondRow = page
    .getByRole("row")
    .filter({ hasText: secondMemo })
    .first();
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toBeVisible();

  const firstPrefix = `transaction-${firstTransaction.transaction_id}`;
  const secondPrefix = `transaction-${secondTransaction.transaction_id}`;
  const firstCategoryCell = firstRow.getByTestId(
    `${firstPrefix}-category-cell`,
  );
  const firstCategoryEditor = firstRow.getByTestId(
    `${firstPrefix}-category-editor`,
  );
  const secondCategoryCell = secondRow.getByTestId(
    `${secondPrefix}-category-cell`,
  );
  const secondCategoryEditor = secondRow.getByTestId(
    `${secondPrefix}-category-editor`,
  );
  const firstAmountCell = firstRow.getByTestId(`${firstPrefix}-amount-cell`);
  const firstAmountEditor = firstRow.getByTestId(
    `${firstPrefix}-amount-editor`,
  );
  await firstCategoryCell.focus();
  await firstCategoryCell.press("F2");
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(draftCategory.fqn);
  await expect(
    firstCategoryEditor
      .getByRole("button", { name: "Save category" })
      .locator("svg"),
  ).toHaveCSS("width", "16px");
  await expect(
    firstCategoryEditor
      .getByRole("button", { name: "Cancel category edit" })
      .locator("svg"),
  ).toHaveCSS("width", "16px");
  await expect(editorButtonsFitContainer(firstCategoryEditor)).resolves.toBe(
    true,
  );
  await firstCategoryEditor
    .getByRole("button", { name: "Save category" })
    .focus();
  await page.keyboard.press("n");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await expect(firstCategoryEditor).toBeVisible();

  await firstRow
    .locator(".transactions-description-column")
    .dispatchEvent("pointerdown", {
      button: 2,
      buttons: 2,
      pointerType: "mouse",
    });
  await expect(firstCategoryEditor).toHaveCount(0);
  await secondRow.locator(".transactions-description-column").click();
  await expect(secondRow).toHaveAttribute("aria-expanded", "true");
  await secondRow.locator(".transactions-description-column").click();
  await expect(secondRow).toHaveAttribute("aria-expanded", "false");

  await firstCategoryCell.focus();
  await firstCategoryCell.press("F2");
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(draftCategory.fqn);
  await firstAmountCell.hover();
  await firstAmountCell.getByRole("button", { name: "Edit row value" }).click();
  await expect(firstCategoryEditor).toHaveCount(0);
  await expect(firstAmountEditor).toHaveCount(0);
  let storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    null,
    initialCategory.category_id,
  ]);

  const firstMemberCell = firstRow.getByTestId(`${firstPrefix}-member-cell`);
  await firstMemberCell.focus();
  await firstMemberCell.press("F2");
  const firstMemberEditor = firstRow.getByTestId(
    `${firstPrefix}-member-editor`,
  );
  await expect(editorButtonsFitContainer(firstMemberEditor)).resolves.toBe(
    true,
  );
  const cancelMember = firstMemberEditor.getByRole("button", {
    name: "Cancel member edit",
  });
  await cancelMember.focus();
  await page.keyboard.press("Enter");
  await expect(firstMemberEditor).toHaveCount(0);

  await firstAmountCell.focus();
  await firstAmountCell.press("F2");
  await expect(firstAmountEditor).toBeVisible();
  const amountInput = firstAmountEditor.getByRole("textbox", {
    name: "Amount",
  });
  let releaseFailedSave: (() => void) | undefined;
  const failedSaveStarted = new Promise<void>((resolve) => {
    void page.route(
      `**/api/transactions/${firstTransaction.transaction_id}`,
      async (route) => {
        if (route.request().method() !== "PUT") {
          await route.continue();
          return;
        }
        resolve();
        await new Promise<void>((release) => {
          releaseFailedSave = release;
        });
        await route.fulfill({
          contentType: "application/json",
          json: { message: "Inline save failed" },
          status: 500,
        });
      },
    );
  });
  await amountInput.fill("99.12");
  await firstAmountEditor.getByRole("button", { name: "Save amount" }).click();
  await failedSaveStarted;
  await page.keyboard.press("Escape");
  await expect(firstAmountEditor).toBeVisible();
  await expect(amountInput).toHaveValue("99.12");
  await page.getByRole("heading", { name: "Transactions" }).click();
  await expect(firstAmountEditor).toBeVisible();
  await expect(amountInput).toHaveValue("99.12");
  releaseFailedSave?.();
  await expect(firstAmountEditor.getByRole("alert")).toBeVisible();
  await expect(amountInput).toHaveValue("99.12");
  await page.unroute(`**/api/transactions/${firstTransaction.transaction_id}`);
  await firstAmountEditor
    .getByRole("button", { name: "Cancel amount edit" })
    .click();
  await expect(firstAmountEditor).toHaveCount(0);

  await firstCategoryCell.hover();
  await firstCategoryCell
    .getByRole("button", { name: "Edit Category" })
    .click();
  await expect(firstCategoryEditor).toBeVisible();
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(draftCategory.fqn);
  await secondCategoryCell.focus();
  await secondCategoryCell.press("F2");
  await expect(firstCategoryEditor).toHaveCount(0);
  await expect(secondCategoryEditor).toHaveCount(0);
  storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    null,
    initialCategory.category_id,
  ]);

  await firstCategoryCell.focus();
  await firstCategoryCell.press("F2");
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(draftCategory.fqn);
  await page.getByRole("heading", { name: "Transactions" }).click();
  await expect(firstCategoryEditor).toHaveCount(0);
  storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    null,
    initialCategory.category_id,
  ]);

  await firstCategoryCell.focus();
  await firstCategoryCell.press("F2");
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(draftCategory.fqn);
  await page.keyboard.press("Escape");
  await expect(firstCategoryEditor).toHaveCount(0);
  await expect(firstCategoryCell).toBeFocused();
  storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    null,
    initialCategory.category_id,
  ]);

  await firstCategoryCell.press("F2");
  await firstCategoryEditor
    .getByRole("combobox", { name: "Category" })
    .fill(`${draftCategory.fqn}:typo`);
  const invalidSaveCategory = firstCategoryEditor.getByRole("button", {
    name: "Save category",
  });
  const invalidCancelCategory = firstCategoryEditor.getByRole("button", {
    name: "Cancel category edit",
  });
  await expect(invalidSaveCategory).toBeDisabled();
  await expect(invalidCancelCategory).toBeEnabled();
  await invalidCancelCategory.focus();
  await expect(invalidCancelCategory).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(firstCategoryEditor).toHaveCount(0);
  await expect(firstCategoryCell).toBeFocused();
  storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    null,
    initialCategory.category_id,
  ]);

  await firstCategoryCell.press("F2");
  const categoryInput = firstCategoryEditor.getByRole("combobox", {
    name: "Category",
  });
  const saveCategory = firstCategoryEditor.getByRole("button", {
    name: "Save category",
  });
  const cancelCategory = firstCategoryEditor.getByRole("button", {
    name: "Cancel category edit",
  });
  await categoryInput.fill(savedCategory.fqn);
  if (testInfo.project.name === "chromium") {
    await page.keyboard.press("Tab");
    await expect(saveCategory).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancelCategory).toBeFocused();
  }
  await saveCategory.click();
  await expect(firstCategoryEditor).toHaveCount(0);
  await expect(firstCategoryCell).toContainText(savedCategory.name);
  storedFirst = await getTransactionDetail(page, firstTransaction);
  expect(storedFirst.records.map((record) => record.category_id)).toEqual([
    null,
    savedCategory.category_id,
  ]);

  await firstRow.locator(".transactions-description-column").click();
  const expandedRecords = page.getByTestId("expanded-records");
  await expect(
    expandedRecords.getByText(savedCategory.fqn, { exact: true }),
  ).toHaveCount(1);

  await Promise.all([
    deleteTransaction(page, firstTransaction),
    deleteTransaction(page, secondTransaction),
  ]);
});

import { test } from "@tests/e2e/test";
import {
  createAccount,
  createSearchSpend,
  deleteTransaction,
  expect,
  getTransactionDetail,
  type TransactionDetailFixture,
} from "@tests/e2e/transactions/support";

const existingRecordUpdateBody = (
  transaction: TransactionDetailFixture,
  memo: string,
) => ({
  initiated_date: transaction.initiated_date,
  records: transaction.records.map((record) => ({
    account_id: record.account_id,
    amount: record.amount,
    amount_usd: record.amount_usd,
    category_id: record.category_id,
    currency: record.currency,
    member_id: record.member_id ?? null,
    memo,
    reconciliation_status: record.reconciliation_status,
    record_id: record.record_id,
    settlement: record.settlement
      ? {
          ...(record.pending_date ? { pending_date: record.pending_date } : {}),
          ...(record.posted_date ? { posted_date: record.posted_date } : {}),
          status: record.settlement,
        }
      : null,
    tag_ids: [...record.tag_ids],
  })),
});

test("stale Advanced retries preserve a concurrent USD valuation", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const transaction = await createSearchSpend(
    page,
    `E2E stale valuation ${unique}`,
  );
  const baseline = await getTransactionDetail(page, transaction);
  await page.goto(
    `/transactions?page=1&pageSize=50&entry=edit:${transaction.transaction_id}`,
  );
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByRole("tab", { name: "Advanced" }).click();

  const winnerBody = existingRecordUpdateBody(baseline, `winner-${unique}`);
  winnerBody.records.forEach((record) => {
    record.amount_usd = record.amount.startsWith("-") ? "-99.00" : "99.00";
  });
  const winnerResponse = await page.request.put(
    `/api/transactions/${transaction.transaction_id}`,
    {
      data: winnerBody,
      headers: { "If-Match": baseline.etag },
    },
  );
  expect(winnerResponse.ok(), await winnerResponse.text()).toBe(true);
  const winner = (await winnerResponse.json()) as TransactionDetailFixture;

  let releaseWinnerFetch = () => {};
  const winnerFetchGate = new Promise<void>((resolve) => {
    releaseWinnerFetch = resolve;
  });
  let markWinnerFetchStarted = () => {};
  const winnerFetchStarted = new Promise<void>((resolve) => {
    markWinnerFetchStarted = resolve;
  });
  const transactionPath = `/api/transactions/${transaction.transaction_id}`;
  await page.route(`**${transactionPath}`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    markWinnerFetchStarted();
    await winnerFetchGate;
    await route.continue();
  });

  await editor.getByRole("button", { name: "Update transaction" }).click();
  await winnerFetchStarted;
  const memoInput = editor.getByLabel("Record 1 memo");
  await memoInput.fill(`local-${unique}`);
  releaseWinnerFetch();
  await expect(editor.getByRole("alert")).toContainText("changed elsewhere");
  await expect(memoInput).toBeFocused();
  await memoInput.press("Space");
  await expect(memoInput).toHaveValue(`local-${unique} `);

  const retryRequestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      request.method() === "PUT",
  );
  await editor.getByRole("button", { name: "Update transaction" }).click();
  const retryRequest = await retryRequestPromise;
  const retryBody = retryRequest.postDataJSON() as {
    readonly records: readonly { readonly amount_usd?: string | null }[];
  };
  expect(retryRequest.headers()["if-match"]).toBe(winner.etag);
  expect(retryBody.records.map((record) => record.amount_usd)).toEqual([
    "-99.00000000",
    "99.00000000",
  ]);

  const reapplied = await getTransactionDetail(page, transaction);
  expect(reapplied.records.map((record) => record.amount_usd)).toEqual([
    "-99.00000000",
    "99.00000000",
  ]);
  await page.unroute(`**${transactionPath}`);
  await deleteTransaction(page, transaction);
});

test("switching to Advanced during a stale shorthand save rebases valuations", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const transaction = await createSearchSpend(
    page,
    `E2E pending shorthand valuations ${unique}`,
  );
  const baseline = await getTransactionDetail(page, transaction);
  await page.goto(
    `/transactions?page=1&pageSize=50&entry=edit:${transaction.transaction_id}`,
  );
  const editor = page.getByRole("dialog", { name: "Transaction editor" });

  let releaseSave = () => {};
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let markSaveStarted = () => {};
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  const transactionPath = `/api/transactions/${transaction.transaction_id}`;
  await page.route(`**${transactionPath}`, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    markSaveStarted();
    await saveGate;
    await route.continue();
  });

  const staleResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === transactionPath &&
      response.request().method() === "PUT",
  );
  await editor.getByRole("button", { name: "Update transaction" }).click();
  await saveStarted;
  await editor.getByRole("tab", { name: "Advanced" }).click();

  const winnerBody = existingRecordUpdateBody(baseline, `winner-${unique}`);
  const winnerValuations = winnerBody.records.map((record) =>
    record.amount.startsWith("-") ? "-123.45" : "123.45",
  );
  const winnerResponse = await page.request.put(transactionPath, {
    data: {
      ...winnerBody,
      records: winnerBody.records.map((record, index) => ({
        ...record,
        amount_usd: winnerValuations[index],
      })),
    },
    headers: { "If-Match": baseline.etag },
  });
  expect(winnerResponse.ok(), await winnerResponse.text()).toBe(true);
  const winner = (await winnerResponse.json()) as TransactionDetailFixture;

  releaseSave();
  const staleResponse = await staleResponsePromise;
  expect(staleResponse.status()).toBe(412);
  await expect(editor.getByRole("alert")).toContainText("changed elsewhere");

  const retryRequestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === transactionPath &&
      request.method() === "PUT",
  );
  const retryResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === transactionPath &&
      response.request().method() === "PUT",
  );
  await editor.getByRole("button", { name: "Update transaction" }).click();
  const retryRequest = await retryRequestPromise;
  const retryResponse = await retryResponsePromise;
  const retryBody = retryRequest.postDataJSON() as {
    readonly records: readonly { readonly amount_usd?: string | null }[];
  };
  expect(retryRequest.headers()["if-match"]).toBe(winner.etag);
  expect(retryBody.records.map((record) => record.amount_usd)).toEqual(
    winner.records.map((record) => record.amount_usd),
  );
  expect(retryResponse.ok(), await retryResponse.text()).toBe(true);

  await page.unroute(`**${transactionPath}`);
  await deleteTransaction(page, transaction);
});

test("stale rebases clear hidden valuations from removed record identities", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const transaction = await createSearchSpend(
    page,
    `E2E removed identity valuation ${unique}`,
  );
  const baseline = await getTransactionDetail(page, transaction);
  await page.goto(
    `/transactions?page=1&pageSize=50&entry=edit:${transaction.transaction_id}`,
  );
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByRole("tab", { name: "Advanced" }).click();

  const winnerBody = existingRecordUpdateBody(baseline, `winner-${unique}`);
  const removedIndex = winnerBody.records.findIndex(
    (record) => !record.amount.startsWith("-"),
  );
  const removedRecord = winnerBody.records[removedIndex]!;
  const { record_id: _removedRecordId, ...newRecord } = removedRecord;
  const winnerResponse = await page.request.put(
    `/api/transactions/${transaction.transaction_id}`,
    {
      data: {
        ...winnerBody,
        records: winnerBody.records.map((record, index) =>
          index === removedIndex
            ? { ...newRecord, amount_usd: "987.65", source: "manual" }
            : { ...record, amount_usd: "-987.65" },
        ),
      },
      headers: { "If-Match": baseline.etag },
    },
  );
  expect(winnerResponse.ok(), await winnerResponse.text()).toBe(true);

  await editor.getByRole("button", { name: "Update transaction" }).click();
  await expect(editor.getByRole("alert")).toContainText(
    "rebased with the latest record identities",
  );

  const retryRequestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      request.method() === "PUT",
  );
  const retryResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT",
  );
  await editor.getByRole("button", { name: "Update transaction" }).click();
  const retryRequest = await retryRequestPromise;
  const retryResponse = await retryResponsePromise;
  const retryBody = retryRequest.postDataJSON() as {
    readonly records: readonly {
      readonly amount_usd?: string | null;
      readonly record_id?: number;
    }[];
  };
  const retriedNewRecord = retryBody.records.find(
    (record) => record.record_id === undefined,
  );
  expect(retriedNewRecord).toBeDefined();
  expect(retriedNewRecord).not.toHaveProperty("amount_usd");
  expect(retryResponse.ok(), await retryResponse.text()).toBe(true);

  await deleteTransaction(page, transaction);
});

test("structural recovery refreshes lookups for imported winner records", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const transaction = await createSearchSpend(
    page,
    `E2E structural shorthand ${unique}`,
  );
  const baseline = await getTransactionDetail(page, transaction);
  await page.goto(
    `/transactions?page=1&pageSize=50&entry=edit:${transaction.transaction_id}`,
  );
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor
    .getByRole("tabpanel", { name: "Spend" })
    .getByLabel("Memo")
    .fill(`losing-${unique}`);

  const concurrentAccount = await createAccount(
    page,
    `e2e:ConcurrentConflictAccount:${unique}`,
    "owned",
    "USD",
  );
  const winnerBody = existingRecordUpdateBody(baseline, `winner-${unique}`);
  const movementRecord = winnerBody.records.find(
    (record) => record.settlement,
  )!;
  const flowRecord = winnerBody.records.find((record) => !record.settlement)!;
  const { record_id: _movementRecordId, ...newMovementRecord } = movementRecord;
  const { record_id: _flowRecordId, ...newFlowRecord } = flowRecord;
  const winnerResponse = await page.request.put(
    `/api/transactions/${transaction.transaction_id}`,
    {
      data: {
        ...winnerBody,
        records: [
          ...winnerBody.records,
          {
            ...newMovementRecord,
            account_id: concurrentAccount.account_id,
            amount: "1.00",
            amount_usd: "1.00",
            external_id: `imported-${unique}`,
            external_system: "e2e",
            source: "imported",
          },
          {
            ...newFlowRecord,
            amount: "-1.00",
            amount_usd: "-1.00",
            external_id: `imported-counter-${unique}`,
            external_system: "e2e",
            source: "imported",
          },
        ],
      },
      headers: { "If-Match": baseline.etag },
    },
  );
  expect(winnerResponse.ok(), await winnerResponse.text()).toBe(true);

  await editor.getByRole("button", { name: "Update transaction" }).click();
  await expect(editor.getByRole("alert")).toContainText(
    "rebased with the latest record identities",
  );
  await expect(editor.getByRole("tab", { name: "Advanced" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(editor.getByRole("tab", { name: "Spend" })).toBeDisabled();

  const retryRequestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      request.method() === "PUT",
  );
  const retryResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT",
  );
  await editor.getByRole("button", { name: "Update transaction" }).click();
  const retryRequest = await retryRequestPromise;
  const retryResponse = await retryResponsePromise;
  const retryBody = retryRequest.postDataJSON() as {
    readonly records: readonly {
      readonly account_id: number;
      readonly settlement: { readonly status: string } | null;
    }[];
  };
  expect(
    retryBody.records.find(
      (record) => record.account_id === concurrentAccount.account_id,
    )?.settlement,
  ).toMatchObject({ status: "posted" });
  expect(retryResponse.ok(), await retryResponse.text()).toBe(true);

  await deleteTransaction(page, transaction);
});

test("a local merchant removal stays in Spend after a nonstructural conflict", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const transaction = await createSearchSpend(
    page,
    `E2E local merchant removal ${unique}`,
  );
  const baseline = await getTransactionDetail(page, transaction);
  const secondMerchant = await createAccount(
    page,
    `e2e:SecondConflictMerchant:${unique}`,
    "flow",
  );
  const initialBody = existingRecordUpdateBody(baseline, `baseline-${unique}`);
  initialBody.records[0]!.amount = "-24.68";
  const multiMerchantResponse = await page.request.put(
    `/api/transactions/${transaction.transaction_id}`,
    {
      data: {
        ...initialBody,
        records: [
          ...initialBody.records,
          {
            ...initialBody.records[1],
            account_id: secondMerchant.account_id,
            record_id: undefined,
            source: "manual",
          },
        ],
      },
      headers: { "If-Match": baseline.etag },
    },
  );
  expect(multiMerchantResponse.ok(), await multiMerchantResponse.text()).toBe(
    true,
  );
  const multiMerchant =
    (await multiMerchantResponse.json()) as TransactionDetailFixture;

  await page.goto(
    `/transactions?page=1&pageSize=50&entry=edit:${transaction.transaction_id}`,
  );
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByRole("button", { name: "Remove merchant" }).last().click();

  const winnerResponse = await page.request.put(
    `/api/transactions/${transaction.transaction_id}`,
    {
      data: existingRecordUpdateBody(multiMerchant, `winner-${unique}`),
      headers: { "If-Match": multiMerchant.etag },
    },
  );
  expect(winnerResponse.ok(), await winnerResponse.text()).toBe(true);
  const winner = (await winnerResponse.json()) as TransactionDetailFixture;

  await editor.getByRole("button", { name: "Update transaction" }).click();
  await expect(editor.getByRole("alert")).toContainText(
    "Your draft is preserved",
  );
  await expect(editor.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const retryResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT",
  );
  await editor.getByRole("button", { name: "Update transaction" }).click();
  const retryResponse = await retryResponsePromise;
  expect(retryResponse.ok(), await retryResponse.text()).toBe(true);
  expect(retryResponse.request().headers()["if-match"]).toBe(winner.etag);
  const replaced = (await retryResponse.json()) as TransactionDetailFixture;
  expect(replaced.records).toHaveLength(2);
  await deleteTransaction(page, transaction);
});

test("closing during a stale save skips the conflict refetch", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const transaction = await createSearchSpend(
    page,
    `E2E close stale save ${unique}`,
  );
  const baseline = await getTransactionDetail(page, transaction);
  await page.goto(
    `/transactions?page=1&pageSize=50&entry=edit:${transaction.transaction_id}`,
  );
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor
    .getByRole("tabpanel", { name: "Spend" })
    .getByLabel("Memo")
    .fill(`losing-${unique}`);

  let releaseSave = () => {};
  let markSaveStarted = () => {};
  let transactionGetCount = 0;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const saveStarted = new Promise<void>((resolve) => {
    markSaveStarted = resolve;
  });
  const transactionURL = `**/api/transactions/${transaction.transaction_id}`;
  await page.route(transactionURL, async (route) => {
    if (route.request().method() === "GET") {
      transactionGetCount += 1;
      await route.continue();
      return;
    }
    if (route.request().method() === "PUT") {
      markSaveStarted();
      await saveGate;
    }
    await route.continue();
  });

  await editor.getByRole("button", { name: "Update transaction" }).click();
  await saveStarted;
  const winnerResponse = await page.request.put(
    `/api/transactions/${transaction.transaction_id}`,
    {
      data: existingRecordUpdateBody(baseline, `winner-${unique}`),
      headers: { "If-Match": baseline.etag },
    },
  );
  expect(winnerResponse.ok(), await winnerResponse.text()).toBe(true);

  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  const discardDialog = page.getByRole("alertdialog", {
    name: "Discard transaction changes?",
  });
  await discardDialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(editor).toHaveCount(0);

  const staleResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT",
  );
  releaseSave();
  const staleResponse = await staleResponsePromise;
  expect(staleResponse.status()).toBe(412);
  await staleResponse.finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  expect(transactionGetCount).toBe(0);

  await page.unroute(transactionURL);
  await deleteTransaction(page, transaction);
});

test("failed stale winner fetch is reported and retried before replacement", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const transaction = await createSearchSpend(
    page,
    `E2E failed winner fetch ${unique}`,
  );
  const baseline = await getTransactionDetail(page, transaction);
  await page.goto(
    `/transactions?page=1&pageSize=50&entry=edit:${transaction.transaction_id}`,
  );
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const spendPanel = editor.getByRole("tabpanel", { name: "Spend" });
  const draftMemo = `losing-${unique}`;
  await spendPanel.getByLabel("Memo").fill(draftMemo);

  const winnerResponse = await page.request.put(
    `/api/transactions/${transaction.transaction_id}`,
    {
      data: existingRecordUpdateBody(baseline, `winner-${unique}`),
      headers: { "If-Match": baseline.etag },
    },
  );
  expect(winnerResponse.ok(), await winnerResponse.text()).toBe(true);
  const winner = (await winnerResponse.json()) as TransactionDetailFixture;

  let getCount = 0;
  let putCount = 0;
  const transactionURL = `**/api/transactions/${transaction.transaction_id}`;
  await page.route(transactionURL, async (route) => {
    if (route.request().method() === "PUT") {
      putCount += 1;
      await route.continue();
      return;
    }
    if (route.request().method() === "GET") {
      getCount += 1;
      if (getCount === 1) {
        await route.fulfill({ status: 503, body: "unavailable" });
        return;
      }
    }
    await route.continue();
  });

  await editor.getByRole("button", { name: "Update transaction" }).click();
  await expect(editor.getByRole("alert")).toContainText(
    "latest version could not be loaded",
  );
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(draftMemo);
  expect(putCount).toBe(1);

  await editor.getByRole("button", { name: "Update transaction" }).click();
  await expect(editor.getByRole("alert")).toContainText(
    "Your draft is preserved",
  );
  await expect(spendPanel.getByLabel("Memo")).toHaveValue(draftMemo);
  expect(getCount).toBe(2);
  expect(putCount).toBe(1);

  const retryRequestPromise = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      request.method() === "PUT",
  );
  await editor.getByRole("button", { name: "Update transaction" }).click();
  const retryRequest = await retryRequestPromise;
  expect(retryRequest.headers()["if-match"]).toBe(winner.etag);
  await expect(editor).toHaveCount(0);

  await page.unroute(transactionURL);
  await deleteTransaction(page, transaction);
});

test("discarding an editor conflict publishes the newest transaction", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const initialMemo = `E2E discard refresh initial ${unique}`;
  const transaction = await createSearchSpend(page, initialMemo);
  const finalAccount = await createAccount(
    page,
    `e2e:ConflictFinalAccount:${unique}`,
    "flow",
  );
  await page.goto(`/accounts/${finalAccount.account_id}`);
  await expect(page.getByText("No records", { exact: true })).toBeVisible();
  const baseline = await getTransactionDetail(page, transaction);
  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(unique)}&transaction=${transaction.transaction_id}&entry=edit:${transaction.transaction_id}`,
  );
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const detail = page.getByTestId("transaction-detail-panel");
  await expect(detail).toContainText(initialMemo);
  await editor
    .getByRole("tabpanel", { name: "Spend" })
    .getByLabel("Memo")
    .fill(`losing-${unique}`);

  const winnerMemo = `E2E discard refresh winner ${unique}`;
  const winnerResponse = await page.request.put(
    `/api/transactions/${transaction.transaction_id}`,
    {
      data: existingRecordUpdateBody(baseline, winnerMemo),
      headers: { "If-Match": baseline.etag },
    },
  );
  expect(winnerResponse.ok(), await winnerResponse.text()).toBe(true);
  const winner = (await winnerResponse.json()) as TransactionDetailFixture;
  await editor.getByRole("button", { name: "Update transaction" }).click();
  await expect(editor.getByRole("alert")).toContainText("changed elsewhere");

  let releasePageRefresh = () => {};
  const pageRefreshGate = new Promise<void>((resolve) => {
    releasePageRefresh = resolve;
  });
  let markPageRefreshStarted = () => {};
  const pageRefreshStarted = new Promise<void>((resolve) => {
    markPageRefreshStarted = resolve;
  });
  await page.route("**/api/transactions?**", async (route) => {
    markPageRefreshStarted();
    await pageRefreshGate;
    await route.continue();
  });

  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await page
    .getByRole("alertdialog", { name: "Discard transaction changes?" })
    .getByRole("button", { name: "Discard changes" })
    .click();
  await pageRefreshStarted;

  const newestMemo = `E2E discard refresh newest ${unique}`;
  const newestBody = existingRecordUpdateBody(winner, newestMemo);
  for (const record of newestBody.records) {
    if (!record.amount.startsWith("-")) {
      record.account_id = finalAccount.account_id;
    }
  }
  const newestResponse = await page.request.put(
    `/api/transactions/${transaction.transaction_id}`,
    {
      data: newestBody,
      headers: { "If-Match": winner.etag },
    },
  );
  expect(newestResponse.ok(), await newestResponse.text()).toBe(true);
  await page.route(
    `**/api/transactions/${transaction.transaction_id}`,
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 503, body: "unavailable" });
        return;
      }
      await route.continue();
    },
  );
  releasePageRefresh();

  await expect(editor).toHaveCount(0);
  await expect(detail).toContainText(newestMemo);
  await expect(detail).not.toContainText(winnerMemo);

  await page.unroute(`**/api/transactions/${transaction.transaction_id}`);
  await page.unroute("**/api/transactions?**");
  await page.goto(`/accounts/${finalAccount.account_id}`);
  await expect(
    page.getByTestId("account-register-row").filter({ hasText: newestMemo }),
  ).toBeVisible();
  await deleteTransaction(page, transaction);
});

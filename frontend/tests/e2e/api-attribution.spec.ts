import { type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";
import {
  createSearchSpend,
  createTag,
  expect,
  journalRecord,
} from "@tests/e2e/transactions/support";

interface AuditEntry {
  readonly client_surface: "cli" | "mcp" | "rest" | "web-ui";
  readonly operation_id: string;
}

interface AuditEntryList {
  readonly entries: readonly AuditEntry[];
  readonly total_count: number;
}

const expectAuditSurface = async (
  page: Page,
  operationId: string,
  surface: AuditEntry["client_surface"],
): Promise<void> => {
  const response = await page.request.get("/api/audit-log/entries", {
    params: { operation_id: operationId },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const audit = (await response.json()) as AuditEntryList;
  expect(audit.total_count, `${operationId} audit count`).toBeGreaterThan(0);
  expect(
    audit.entries.map((entry) => entry.client_surface),
    `${operationId} audit surfaces`,
  ).toEqual(audit.entries.map(() => surface));
};

test("transaction UI requests use the web UI audit surface", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `E2E audit attribution ${unique}`;
  const [transaction, tag] = await Promise.all([
    createSearchSpend(page, memo),
    createTag(page, `E2E:AuditAttribution:${unique}`),
  ]);
  await expectAuditSurface(page, "createTag", "rest");

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}&entry=edit:${transaction.transaction_id}`,
  );
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(
    editor.getByRole("heading", { name: "Edit spend" }),
  ).toBeVisible();
  const classifyResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/transactions/classify" &&
      response.request().method() === "POST",
  );
  await editor.getByRole("button", { name: "Edit as journal" }).click();
  expect((await classifyResponse).ok()).toBe(true);
  await journalRecord(page, 1).getByLabel("Memo").fill(`${memo} updated`);

  const replaceResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/transactions/${transaction.transaction_id}` &&
      response.request().method() === "PUT",
  );
  await editor.getByRole("button", { name: "Update transaction" }).click();
  expect((await replaceResponse).ok()).toBe(true);

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  const rows = page.locator("[data-transaction-row='true']");
  await expect(rows).toHaveCount(1);
  const row = rows.first();
  await page.getByRole("button", { name: "Edit mode" }).click();
  await row.click();
  const dock = page.getByTestId("transaction-edit-dock");
  await dock.getByRole("button", { name: "Add / remove" }).click();
  const dockEditor = page.getByTestId("edit-dock-editor");
  const addTagsInput = dockEditor.getByRole("combobox", {
    name: "Tags to add",
  });
  await addTagsInput.fill(tag.fqn);
  await addTagsInput.press("Enter");
  const tagsResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/records/bulk/tags" &&
      response.request().method() === "POST",
  );
  await dockEditor.getByRole("button", { name: "Apply" }).click();
  expect((await tagsResponse).ok()).toBe(true);

  await expectAuditSurface(page, "classifyTransaction", "web-ui");
  await expectAuditSurface(page, "replaceTransaction", "web-ui");
  await expectAuditSurface(page, "bulkUpdateJournalRecordTags", "web-ui");
});

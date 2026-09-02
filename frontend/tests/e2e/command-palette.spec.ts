import { expect, type Page } from "@playwright/test";
import { test } from "@tests/e2e/test";

interface AccountFixture {
  readonly account_id: number;
  readonly fqn: string;
}

interface TransactionFixture {
  readonly transaction_id: number;
}

const openPalette = async (page: Page) => {
  await expect(
    page.locator(
      'button[aria-label="Command palette"]:visible, button[aria-label="Navigation"]:visible',
    ),
  ).toBeVisible();
  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Command search" }),
  ).toBeFocused();
};

const listAccountFixtures = async (
  page: Page,
): Promise<readonly AccountFixture[]> => {
  const response = await page.request.get(
    "/api/accounts?limit=500&offset=0&sort=fqn&sort_dir=asc",
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    readonly accounts?: readonly AccountFixture[];
  };
  return body.accounts ?? [];
};

const findByFqn = <T extends { readonly fqn: string }>(
  fixtures: readonly T[],
  fqn: string,
): T => {
  const fixture = fixtures.find((item) => item.fqn === fqn);
  expect(fixture, `${fqn} fixture`).toBeDefined();
  return fixture as T;
};

const createSearchFixtureTransaction = async (
  page: Page,
  memo: string,
): Promise<TransactionFixture> => {
  const accounts = await listAccountFixtures(page);
  const fundingAccount = findByFqn(accounts, "cash:Wallet");
  const merchantAccount = findByFqn(accounts, "merchant:PowellsBooks");
  const categoryResponse = await page.request.post("/api/categories", {
    data: {
      economic_intent: "expense",
      fqn: `zzE2EPalette:${memo}:Category`,
    },
  });
  expect(categoryResponse.ok()).toBe(true);
  const category = (await categoryResponse.json()) as {
    readonly category_id: number;
  };
  const response = await page.request.post("/api/transactions/spend", {
    data: {
      amount: "12.34",
      category_id: category.category_id,
      counterparty_account_id: merchantAccount.account_id,
      currency: "USD",
      funding_account_id: fundingAccount.account_id,
      initiated_date: "2026-05-08",
      memo,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as TransactionFixture;
};

test("command palette navigates to Status", async ({ page }) => {
  await page.goto("/overview");
  await openPalette(page);

  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await page.keyboard.insertText("status");
  await expect(dialog.getByRole("option", { name: "Status" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
});

test("command palette discovers and navigates to an account", async ({
  page,
}) => {
  await page.goto("/overview");
  await openPalette(page);

  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await dialog
    .getByRole("combobox", { name: "Command search" })
    .fill("joint_checking");
  await dialog
    .getByRole("option", { name: /Account bank:Chase:joint_checking/ })
    .click();

  await expect(page).toHaveURL(/\/accounts\/\d+$/);
  await expect(
    page.getByRole("heading", { name: /joint_checking/ }),
  ).toBeVisible();
});

test("command palette searches transactions and opens the selected detail", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const memo = `Palette multiword search ${unique}`;
  const transaction = await createSearchFixtureTransaction(page, memo);
  await page.goto("/overview");
  await openPalette(page);

  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await dialog
    .getByRole("combobox", { name: "Command search" })
    .fill(`'${memo}`);
  const result = dialog.getByRole("option").filter({ hasText: memo });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page).toHaveURL(
    new RegExp(`[?&]transaction=${transaction.transaction_id}(?:&|$)`),
  );
  await expect(
    page
      .getByTestId("transaction-detail-panel")
      .getByTestId("transaction-detail-summary-memo"),
  ).toHaveText(memo);
});

test("command palette suppresses global entry and opens a new spend", async ({
  page,
}) => {
  await page.goto("/overview");
  await openPalette(page);

  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  const overviewOption = dialog.getByRole("option", { name: /Overview/ });
  await page.keyboard.press("Tab");
  await expect(overviewOption).toHaveAttribute("aria-selected", "true");
  if (!(await overviewOption.evaluate((option) => option.matches(":focus")))) {
    await overviewOption.focus();
  }
  await expect(overviewOption).toBeFocused();
  await page.keyboard.press("KeyN");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);

  await dialog
    .getByRole("combobox", { name: "Command search" })
    .fill("new spend");
  await dialog.getByRole("option", { name: "New spend" }).click();

  await expect(page).toHaveURL(/\/overview\?entry=new%3Aspend$/);
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const templatePicker = editor.getByRole("combobox", {
    name: "Start from a template",
  });
  await expect(templatePicker).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  await expect(templatePicker).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(editor).toHaveCount(0);
});

test("command palette applies a discovered transaction template", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:Palette:${unique}:Coffee`;
  const memo = `Template prefill ${unique}`;
  const response = await page.request.post("/api/transaction-templates", {
    data: { fqn, records: [{ memo }] },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/overview");
  await openPalette(page);

  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await dialog.getByRole("combobox", { name: "Command search" }).fill(unique);
  await dialog.getByRole("option", { name: `Use ${fqn}` }).click();

  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Memo")).toHaveValue(memo);
});

test("long template paths stay usable in the narrow command palette", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:${"UnbrokenTemplateSegment".repeat(12)}`;
  const response = await page.request.post("/api/transaction-templates", {
    data: { fqn, records: [{}] },
  });
  expect(response.ok()).toBe(true);

  await page.setViewportSize({ height: 800, width: 390 });
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const pageOverflowBefore = await page
    .locator("html")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  await openPalette(page);

  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await dialog.getByRole("combobox", { name: "Command search" }).fill(unique);
  const result = dialog.getByRole("option", { name: `Use ${fqn}` });
  await expect(result).toBeVisible();

  const results = dialog.getByRole("listbox", { name: "Command results" });
  const pageOverflowAfter = await page
    .locator("html")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(
    pageOverflowAfter,
    "the palette does not add page-level horizontal overflow",
  ).toBeLessThanOrEqual(pageOverflowBefore + 1);
  for (const [name, surface] of [
    ["dialog", dialog],
    ["results", results],
    ["result", result],
  ] as const) {
    expect(
      await surface.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
      `${name} has no horizontal overflow`,
    ).toBe(true);
  }

  await result.locator("[data-slot='tooltip-trigger']").hover();
  await expect(page.getByRole("tooltip")).toHaveText(fqn);
});

test("command palette starts a database backup", async ({ page }) => {
  await page.goto("/overview");
  await openPalette(page);

  const dialog = page.getByRole("dialog", { name: "Command Palette" });
  await dialog.getByRole("combobox", { name: "Command search" }).fill("backup");
  await dialog.getByRole("option", { name: "Run database backup" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Database backup started: run",
  );
});

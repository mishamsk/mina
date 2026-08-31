import { test } from "@tests/e2e/test";
import {
  type AccountFixture,
  type CategoryFixture,
  chooseOptionByKeyboard,
  clickRowAction,
  createAccount,
  createCategory,
  createTag,
  expect,
  fillAndExpectValue,
  findByFqn,
  journalRecord,
  listFixtures,
  type Route,
  waitForLedgerLookups,
} from "@tests/e2e/transactions/support";

test("template picker stays available while its initial search loads", async ({
  page,
}) => {
  let releaseSearch: (() => void) | undefined;
  const searchRequested = new Promise<void>((resolve) => {
    void page.route("**/api/transaction-templates**", async (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().method() !== "GET" ||
        url.pathname !== "/api/transaction-templates/search"
      ) {
        await route.continue();
        return;
      }
      resolve();
      await new Promise<void>((release) => {
        releaseSearch = release;
      });
      await route.continue();
    });
  });

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await searchRequested;
  const templatePicker = page.getByRole("combobox", {
    name: "Start from a template",
  });
  await expect(templatePicker).toBeVisible();
  await expect(templatePicker).toBeFocused();
  await expect(
    page.getByText("Loading options…", { exact: true }),
  ).toBeVisible();
  releaseSearch?.();
});

test("template picker reports initial search failures", async ({ page }) => {
  const searchRequested = new Promise<void>((resolve) => {
    void page.route("**/api/transaction-templates**", async (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().method() !== "GET" ||
        url.pathname !== "/api/transaction-templates/search"
      ) {
        await route.continue();
        return;
      }
      resolve();
      await route.fulfill({
        contentType: "application/json",
        status: 500,
        body: JSON.stringify({ code: "internal", message: "unavailable" }),
      });
    });
  });

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await searchRequested;
  await expect(
    page.getByRole("combobox", { name: "Start from a template" }),
  ).toBeFocused();
  await expect(page.getByRole("alert")).toContainText(
    "Templates could not be loaded.",
  );
});

test("picker debounces search and retains stable rows until replacement", async ({
  page,
}, testInfo) => {
  const suffix =
    `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`.slice(
      -6,
    );
  const baselineLabel = `Base${suffix}`;
  const targetLabel = `Next${suffix}`;
  const [baseline, target] = await Promise.all([
    createCategory(
      page,
      `E2E:Debounce:${suffix}:Baseline`,
      "expense",
      baselineLabel,
    ),
    createCategory(
      page,
      `E2E:Debounce:${suffix}:Target`,
      "expense",
      targetLabel,
    ),
  ]);

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const categoryPicker = page.getByRole("combobox", { name: "Category" });
  const options = page.locator("#spend-merchant-0-category-options");
  await categoryPicker.fill(baselineLabel);
  const baselineOption = options.locator(
    `#spend-merchant-0-category-option-${baseline.category_id}`,
  );
  await expect(baselineOption).toBeVisible();
  const baselineCreateOption = options.locator(
    "#spend-merchant-0-category-option-create",
  );
  await expect(baselineCreateOption).toBeVisible();
  const stableClass = await baselineOption.getAttribute("class");
  expect(stableClass).not.toBeNull();

  let releaseTarget!: () => void;
  const targetReleased = new Promise<void>((resolve) => {
    releaseTarget = resolve;
  });
  let targetRequested!: () => void;
  const targetRequest = new Promise<void>((resolve) => {
    targetRequested = resolve;
  });
  const requestedQueries: string[] = [];
  await page.route(
    (url) => url.pathname === "/api/categories/search",
    async (route) => {
      const query = new URL(route.request().url()).searchParams.get("q") ?? "";
      requestedQueries.push(query);
      if (query === targetLabel) {
        targetRequested();
        await targetReleased;
      }
      await route.continue();
    },
  );

  await categoryPicker.selectText();
  await categoryPicker.pressSequentially(targetLabel, { delay: 10 });
  await targetRequest;
  await expect(baselineOption).toBeVisible();
  await expect(baselineOption).toHaveAttribute("class", stableClass!);

  releaseTarget();
  await expect(
    options.locator(`#spend-merchant-0-category-option-${target.category_id}`),
  ).toBeVisible();
  expect(requestedQueries).toEqual([targetLabel]);
});

test("entity picker composes bounded search, local selection, and creation availability", async ({
  page,
}) => {
  const selectedTagID = 9_000_001;
  const searchRequests: URL[] = [];
  const availabilityQueries: string[] = [];
  let releaseAvailability: (() => void) | undefined;
  const availabilityReleased = new Promise<void>((resolve) => {
    releaseAvailability = resolve;
  });
  let markAvailabilityRequested: (() => void) | undefined;
  const availabilityRequested = new Promise<void>((resolve) => {
    markAvailabilityRequested = resolve;
  });
  let releaseAgain: (() => void) | undefined;
  const againReleased = new Promise<void>((resolve) => {
    releaseAgain = resolve;
  });
  let markAgainRequested: (() => void) | undefined;
  const againRequested = new Promise<void>((resolve) => {
    markAgainRequested = resolve;
  });
  await page.route(
    (url) => url.pathname === "/api/tags/search",
    async (route) => {
      const url = new URL(route.request().url());
      searchRequests.push(url);
      const excludedIDs = url.searchParams.getAll("exclude_ids").map(Number);
      const query = url.searchParams.get("q") ?? "";
      if (query === "Again") {
        markAgainRequested?.();
        await againReleased;
        await route.fulfill({
          contentType: "application/json",
          json: {
            has_more: false,
            items: [
              {
                fqn: "E2E:Bounded:Replacement",
                is_hidden: false,
                kind: "leaf",
                tag_id: selectedTagID + 100,
                title: "E2E:Bounded:Replacement",
              },
            ],
          },
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        json: {
          has_more: true,
          items: Array.from({ length: 6 }, (_, index) => ({
            fqn: `E2E:Bounded:Tag${index + 1}`,
            is_hidden: index === 0,
            kind: "leaf",
            tag_id: selectedTagID + index,
            title: `E2E:Bounded:Tag${index + 1}`,
          })).filter((item) => !excludedIDs.includes(item.tag_id)),
        },
      });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/tags/creation-availability",
    async (route) => {
      const fqn = new URL(route.request().url()).searchParams.get("fqn") ?? "";
      availabilityQueries.push(fqn);
      if (fqn === "Bounded") {
        markAvailabilityRequested?.();
        await availabilityReleased;
      }
      await route.fulfill({
        contentType: "application/json",
        json: { available: true },
      });
    },
  );

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const picker = page.getByRole("combobox", { name: "Tags" });
  await picker.fill("Bounded");
  const options = page.locator("#spend-tags-options");
  await availabilityRequested;
  await expect(options.getByRole("option")).toHaveCount(6);
  await expect(
    options.locator(`#spend-tags-option-${selectedTagID}`),
  ).toBeEnabled();
  releaseAvailability?.();
  await expect(options.getByRole("option")).toHaveCount(7);
  await expect(page.getByTestId("spend-tags-type-to-narrow")).toHaveText(
    "More matches available. Type to narrow.",
  );
  await expect(
    options.getByRole("option", { name: "Create Bounded" }),
  ).toBeVisible();
  expect(searchRequests.at(-1)?.searchParams.get("limit")).toBe("6");
  expect(availabilityQueries).toContain("Bounded");

  await options.locator(`#spend-tags-option-${selectedTagID}`).click();
  await expect(page.getByTestId("entity-multi-picker-selected")).toContainText(
    "E2E:Bounded:Tag1",
  );
  await picker.fill("Again");
  await againRequested;
  await expect(page.getByTestId("spend-tags-type-to-narrow")).toBeVisible();
  await expect(
    options.locator(`#spend-tags-option-${selectedTagID + 1}`),
  ).toBeVisible();
  releaseAgain?.();
  await expect(
    options.locator(`#spend-tags-option-${selectedTagID + 100}`),
  ).toBeVisible();
  await expect(page.getByTestId("spend-tags-type-to-narrow")).toHaveCount(0);
  await expect
    .poll(() =>
      searchRequests.some((request) =>
        request.searchParams.getAll("exclude_ids").includes(`${selectedTagID}`),
      ),
    )
    .toBe(true);
  await expect(
    options.locator(`#spend-tags-option-${selectedTagID}`),
  ).toHaveCount(0);
});

test("entity picker retries failed creation availability", async ({ page }) => {
  let availabilityRequests = 0;
  let availabilityShouldFail = true;
  await page.route(
    (url) => url.pathname === "/api/tags/search",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        json: { has_more: false, items: [] },
      });
    },
  );
  await page.route(
    (url) => url.pathname === "/api/tags/creation-availability",
    async (route) => {
      availabilityRequests += 1;
      if (availabilityShouldFail) {
        await route.fulfill({ status: 503 });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        json: { available: true },
      });
    },
  );

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const picker = page.getByRole("combobox", { name: "Tags" });
  await picker.fill("AvailabilityRetry");
  const options = page.locator("#spend-tags-options");
  await expect(options.getByRole("alert")).toBeVisible();
  const failedRequestCount = availabilityRequests;
  availabilityShouldFail = false;
  await options.getByRole("button", { name: "Retry" }).click();
  await expect(
    options.getByRole("option", { name: "Create AvailabilityRetry" }),
  ).toBeVisible();
  expect(availabilityRequests).toBeGreaterThan(failedRequestCount);
});

test("template picker constrains long paths and exposes the full path", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const leaf = "UnbrokenTemplateSegment".repeat(12);
  const fqn = `E2E:${unique}:${leaf}`;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByRole("tab", { name: "Advanced" }).click();
  const templatePicker = editor.getByRole("combobox", {
    name: "Start from a template",
  });
  await expect(templatePicker).toBeVisible();
  const response = await page.request.post("/api/transaction-templates", {
    data: { fqn, records: [{ memo: unique }] },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const templateId = (
    (await response.json()) as { transaction_template_id: number }
  ).transaction_template_id;
  const rankedTemplateRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transaction-templates/search" &&
      url.searchParams.get("q") === unique
    );
  });
  await templatePicker.fill(unique);
  const rankedTemplateURL = new URL((await rankedTemplateRequest).url());
  expect(rankedTemplateURL.searchParams.get("context")).toBe(
    "transaction_entry",
  );
  expect(rankedTemplateURL.searchParams.get("limit")).toBe("6");
  expect(rankedTemplateURL.searchParams.get("compatible_shorthand")).toBeNull();
  const option = page.getByRole("option").filter({ hasText: fqn });
  await expect(option).toBeVisible();
  const optionId = await option.getAttribute("id");
  await templatePicker.press("ArrowDown");
  await expect(templatePicker).toHaveAttribute(
    "aria-activedescendant",
    optionId!,
  );
  const activeLabel = option.getByTestId("entity-picker-fqn");
  await expect(activeLabel).toHaveText(fqn);
  await expect(activeLabel).toHaveCSS("white-space", "normal");
  const [optionBox, listboxBox] = await Promise.all([
    option.boundingBox(),
    page.getByRole("listbox").boundingBox(),
  ]);
  expect(optionBox).not.toBeNull();
  expect(listboxBox).not.toBeNull();
  expect(optionBox!.width).toBeLessThanOrEqual(listboxBox!.width);
  await expect
    .poll(() =>
      activeLabel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    )
    .toBe(true);
  await option.locator("[data-slot='tooltip-trigger']").last().hover();
  await expect(page.getByRole("tooltip")).toHaveText(`${fqn} (${leaf})`);
  const exactTemplateRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === `/api/transaction-templates/${templateId}`;
  });
  await option.click();
  await exactTemplateRequest;
  await expect(journalRecord(page, 1).getByLabel("Memo")).toHaveValue(unique);

  const deleted = await page.request.delete(
    `/api/transaction-templates/${templateId}`,
  );
  expect(deleted.ok(), await deleted.text()).toBe(true);
});

test("clear and tab changes discard pending template reads", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Delayed template`;
  const created = await page.request.post("/api/transaction-templates", {
    data: { fqn, records: [{ memo: unique }] },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const templateId = (
    (await created.json()) as { transaction_template_id: number }
  ).transaction_template_id;
  const releaseReads: (() => void)[] = [];
  const readGates = [0, 1].map(
    () =>
      new Promise<void>((resolve) => {
        releaseReads.push(resolve);
      }),
  );
  const markReadStarted: (() => void)[] = [];
  const readsStarted = [0, 1].map(
    () =>
      new Promise<void>((resolve) => {
        markReadStarted.push(resolve);
      }),
  );
  const markReadFinished: (() => void)[] = [];
  const readsFinished = [0, 1].map(
    () =>
      new Promise<void>((resolve) => {
        markReadFinished.push(resolve);
      }),
  );
  let readCount = 0;
  await page.route(
    `**/api/transaction-templates/${templateId}`,
    async (route) => {
      const readIndex = readCount;
      readCount += 1;
      markReadStarted[readIndex]?.();
      await readGates[readIndex];
      const response = await route.fetch();
      await route.fulfill({ response });
      markReadFinished[readIndex]?.();
    },
  );

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const picker = editor.getByRole("combobox", {
    name: "Start from a template",
  });
  await editor.getByRole("tab", { name: "Advanced" }).click();
  await picker.fill(unique);
  await page.getByRole("option").filter({ hasText: fqn }).click();
  await readsStarted[0];
  await editor.getByRole("button", { name: "Clear draft" }).click();
  await expect(picker).toBeFocused();
  releaseReads[0]!();
  await readsFinished[0];
  await expect(editor.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(editor.getByLabel("Memo")).toHaveValue("");

  await editor.getByRole("tab", { name: "Advanced" }).click();
  await picker.fill(unique);
  await page.getByRole("option").filter({ hasText: fqn }).click();
  await readsStarted[1];
  await editor.getByRole("tab", { name: "Income" }).click();
  releaseReads[1]!();
  await readsFinished[1];
  await expect(editor.getByRole("tab", { name: "Income" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(editor.getByLabel("Memo")).toHaveValue("");

  const deleted = await page.request.delete(
    `/api/transaction-templates/${templateId}`,
  );
  expect(deleted.ok(), await deleted.text()).toBe(true);
});

test("keeping a restored draft preserves its active tab after a template launch", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `E2E:${unique}:Spend launch`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const funding = findByFqn(accounts, "cash:Wallet");
  const merchant = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const response = await page.request.post("/api/transaction-templates", {
    data: {
      fqn,
      records: [
        {
          account_id: funding.account_id,
          amount: "-6.00000000",
          currency: "USD",
        },
        {
          account_id: merchant.account_id,
          amount: "6.00000000",
          category_id: category.category_id,
          currency: "USD",
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const templateId = (
    (await response.json()) as { transaction_template_id: number }
  ).transaction_template_id;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  await editor.getByRole("tab", { name: "Income" }).click();
  await editor.getByLabel("Memo").fill(`Keep ${unique}`);
  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();

  await page.keyboard.press("Control+K");
  await page.getByRole("combobox", { name: "Command search" }).fill(fqn);
  await page.getByRole("option", { name: `Use ${fqn}` }).click();
  const replaceDialog = page.getByRole("alertdialog", {
    name: "Replace entry draft?",
  });
  await expect(replaceDialog).toBeVisible();
  await expect(page.locator("#income-entry-tab")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(replaceDialog).toBeHidden();
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("tab", { name: "Income" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(editor.getByLabel("Memo")).toHaveValue(`Keep ${unique}`);

  const deleted = await page.request.delete(
    `/api/transaction-templates/${templateId}`,
  );
  expect(deleted.ok(), await deleted.text()).toBe(true);
});

test("template picker filters server matches, browses hierarchy, and applies without provenance", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const base = `E2ETemplatePicker:${unique}`;
  const coffeeFqn = `${base}:Food:Coffee`;
  const teaFqn = `${base}:Food:Tea`;
  const partialFqn = `${base}:Advanced:Partial`;
  const [accounts, categories] = await Promise.all([
    listFixtures<AccountFixture>(page, "/api/accounts", "accounts"),
    listFixtures<CategoryFixture>(page, "/api/categories", "categories"),
  ]);
  const funding = findByFqn(accounts, "cash:Wallet");
  const merchant = findByFqn(accounts, "merchant:PowellsBooks");
  const category = findByFqn(categories, "Entertainment:Books");
  const createTemplate = async (
    fqn: string,
    amount: string,
    memo: string,
    complete = true,
  ): Promise<number> => {
    const response = await page.request.post("/api/transaction-templates", {
      data: {
        fqn,
        records: [
          {
            account_id: funding.account_id,
            amount: complete ? `-${amount}` : undefined,
            currency: "USD",
            memo,
            tag_ids: [],
          },
          {
            account_id: merchant.account_id,
            amount,
            category_id: category.category_id,
            currency: "USD",
            memo,
            tag_ids: [],
          },
        ],
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { transaction_template_id: number })
      .transaction_template_id;
  };
  const [coffeeId, teaId] = await Promise.all([
    createTemplate(coffeeFqn, "12.50000000", `Coffee ${unique}`),
    createTemplate(teaFqn, "8.25000000", `Tea ${unique}`, false),
  ]);
  const partialResponse = await page.request.post(
    "/api/transaction-templates",
    { data: { fqn: partialFqn, records: [{ memo: `Partial ${unique}` }] } },
  );
  expect(partialResponse.ok(), await partialResponse.text()).toBe(true);
  const partialId = (
    (await partialResponse.json()) as { transaction_template_id: number }
  ).transaction_template_id;

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const editor = page.getByRole("dialog", { name: "Transaction editor" });
  const templatePicker = editor.getByRole("combobox", {
    name: "Start from a template",
  });
  await expect(templatePicker).toBeFocused();

  await templatePicker.fill(`${base}:`);
  await expect(page.getByTestId("entry-template-breadcrumb")).toBeVisible();
  await expect(
    page.getByRole("option", { name: new RegExp(`${base}:Food, group`) }),
  ).toBeVisible();
  await page
    .getByRole("option", { name: new RegExp(`${base}:Food, group`) })
    .click();
  await expect(page.getByTestId("entry-template-breadcrumb")).toContainText(
    "Food",
  );
  await expect(
    page.getByRole("option").filter({ hasText: coffeeFqn }),
  ).toBeVisible();
  await expect(
    page.getByRole("option").filter({ hasText: partialFqn }),
  ).toHaveCount(0);

  await templatePicker.fill(unique);
  await expect(
    page.getByRole("option").filter({ hasText: coffeeFqn }),
  ).toBeVisible();
  await expect(
    page.getByRole("option").filter({ hasText: teaFqn }),
  ).toBeVisible();
  await expect(
    page.getByRole("option").filter({ hasText: partialFqn }),
  ).toHaveCount(0);
  await templatePicker.fill("Coffee");
  await templatePicker.press("Enter");

  await expect(templatePicker).toHaveValue("");
  await expect(templatePicker).toBeFocused();
  await expect(templatePicker).toHaveAttribute("aria-expanded", "false");
  await expect(editor.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    editor.getByRole("combobox", { name: "Funding account" }),
  ).toHaveValue(funding.fqn);
  await expect(editor.getByRole("combobox", { name: "Merchant" })).toHaveValue(
    merchant.fqn,
  );
  await expect(editor.getByRole("combobox", { name: "Category" })).toHaveValue(
    category.fqn,
  );
  await expect(
    editor.getByRole("group", { name: "Merchant 1" }).getByLabel("Amount"),
  ).toHaveValue("12.5");
  await expect(editor.getByLabel("Memo")).toHaveValue(`Coffee ${unique}`);

  await editor.getByRole("tab", { name: "Income" }).click();
  await templatePicker.fill(unique);
  await expect(
    page.getByRole("option").filter({ hasText: coffeeFqn }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option").filter({ hasText: partialFqn }),
  ).toHaveCount(0);
  await editor.getByRole("tab", { name: "Advanced" }).click();
  await templatePicker.fill(unique);
  await expect(
    page.getByRole("option").filter({ hasText: coffeeFqn }),
  ).toBeVisible();
  await expect(
    page.getByRole("option").filter({ hasText: partialFqn }),
  ).toBeVisible();
  await editor.getByRole("tab", { name: "Spend" }).click();
  await expect(editor.getByLabel("Memo")).toHaveValue(`Coffee ${unique}`);

  await templatePicker.fill("Tea");
  await templatePicker.press("Enter");
  const replaceDialog = page.getByRole("alertdialog", {
    name: "Replace entry draft?",
  });
  await expect(replaceDialog).toBeVisible();
  await replaceDialog.getByRole("button", { name: "Keep draft" }).click();
  await expect(editor.getByLabel("Memo")).toHaveValue(`Coffee ${unique}`);
  await expect(templatePicker).toBeFocused();
  await expect(templatePicker).toHaveAttribute("aria-expanded", "false");
  await templatePicker.fill("Tea");
  await templatePicker.press("Enter");
  await replaceDialog.getByRole("button", { name: "Replace draft" }).click();
  await expect(editor.getByLabel("Memo")).toHaveValue(`Tea ${unique}`);
  await expect(
    editor.getByRole("group", { name: "Merchant 1" }).getByLabel("Amount"),
  ).toHaveValue("8.25");
  await expect(templatePicker).toHaveValue("");
  await expect(templatePicker).toBeFocused();
  await expect(templatePicker).toHaveAttribute("aria-expanded", "false");

  await editor.getByRole("button", { name: "Clear draft" }).click();
  const clearDialog = page.getByRole("alertdialog", {
    name: "Clear entry draft?",
  });
  await expect(clearDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(clearDialog).toBeHidden();
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Memo")).toHaveValue(`Tea ${unique}`);
  await editor.getByRole("button", { name: "Clear draft" }).click();
  await clearDialog.getByRole("button", { name: "Clear draft" }).click();
  await expect(editor.getByLabel("Memo")).toHaveValue("");
  await expect(templatePicker).toBeFocused();
  await expect(page.getByRole("button", { name: /undo/i })).toHaveCount(0);

  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();
  await page.keyboard.press("Control+K");
  const commandSearch = page.getByRole("combobox", { name: "Command search" });
  await commandSearch.fill(coffeeFqn);
  await page.getByRole("option", { name: `Use ${coffeeFqn}` }).click();
  await expect(editor.getByRole("tab", { name: "Spend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    editor.getByRole("group", { name: "Merchant 1" }).getByLabel("Amount"),
  ).toHaveValue("12.5");
  await expect(templatePicker).toHaveValue("");
  await editor
    .getByRole("button", { name: "Close transaction editor" })
    .click();

  for (const templateId of [coffeeId, teaId, partialId]) {
    const response = await page.request.delete(
      `/api/transaction-templates/${templateId}`,
    );
    expect(response.ok(), await response.text()).toBe(true);
  }
});

test("entry category picker completes hierarchy segments and preserves full-path escape hatches", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const base = `E2ESegment:${unique}`;
  const diningFqn = `${base}:Food:Dining`;
  const pantryFqn = `${base}:Food:Pantry`;
  const fallbackFqn = `${base}:Food:Supermarket:Groceries`;
  await Promise.all([
    createCategory(page, diningFqn, "expense"),
    createCategory(page, pantryFqn, "expense", "Pantry Pick"),
    createCategory(page, fallbackFqn, "expense"),
    createCategory(page, `${base}:Travel:Flights`, "expense"),
  ]);

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const spendPanel = page.getByRole("tabpanel", { name: "Spend" });
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
    {
      scope: spendPanel,
    },
  );
  const categoryPicker = page.getByRole("combobox", { name: "Category" });
  await page.getByRole("combobox", { name: "Funding account" }).focus();
  await categoryPicker.focus();
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "true");
  await expect(categoryPicker).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(categoryPicker).not.toBeFocused();
  await expect(categoryPicker).toHaveValue("");

  await categoryPicker.fill(`${base}:`);
  const categoryOptions = page.locator("#spend-merchant-0-category-options");
  await expect(categoryOptions).toHaveAttribute("data-picker-mode", "level");
  await expect(
    page.locator("#spend-merchant-0-category-announcement"),
  ).toHaveText(`Browsing under ${base}`);
  await expect(categoryPicker).toHaveAttribute(
    "aria-activedescendant",
    /spend-merchant-0-category-option-group-/,
  );
  await expect(
    categoryOptions.getByRole("option", {
      name: "Food, group, 3 children",
    }),
  ).toBeVisible();

  await categoryPicker.press("Enter");
  await expect(categoryPicker).toHaveValue(`${base}:Food:`);
  await expect(
    page.getByTestId("spend-merchant-0-category-breadcrumb"),
  ).toContainText("Food");
  await expect(page.locator("#spend-merchant-0-category-context")).toHaveText(
    `Browsing under ${base}:Food`,
  );

  const currentCrumb = page.getByRole("button", {
    name: `Browse ${base}:Food`,
  });
  await expect(
    page.getByRole("button", { name: "Browse from root" }),
  ).toHaveAttribute("tabindex", "-1");
  await expect(currentCrumb).toHaveAttribute("tabindex", "-1");

  const rootCrumb = page.getByRole("button", { name: "Browse from root" });
  await rootCrumb.hover();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "Browse from root" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toBeVisible();
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "false");
  await expect(categoryPicker).toHaveValue(`${base}:Food:`);
  await expect(categoryPicker).toBeFocused();
  await categoryPicker.press("ArrowDown");
  await rootCrumb.click();
  await expect(categoryPicker).toHaveValue("");
  await expect(categoryPicker).toBeFocused();
  await categoryPicker.fill(`${base}:`);
  await expect(categoryPicker).toHaveAttribute(
    "aria-activedescendant",
    /spend-merchant-0-category-option-group-/,
  );
  await categoryPicker.press("Enter");
  await expect(categoryPicker).toHaveValue(`${base}:Food:`);

  await categoryPicker.press("End");
  await categoryPicker.press("ArrowLeft");
  await expect(categoryPicker).toHaveValue(`${base}:`);
  await expect(categoryPicker).toHaveAttribute(
    "aria-activedescendant",
    /spend-merchant-0-category-option-group-/,
  );
  await categoryPicker.press("ArrowRight");
  await expect(categoryPicker).toHaveValue(`${base}:Food:`);
  await categoryPicker.press("End");
  await categoryPicker.press("ArrowLeft");
  await expect(categoryPicker).toHaveValue(`${base}:`);
  await categoryPicker.press("Backspace");
  await expect(categoryPicker).toHaveValue(base);
  await categoryPicker.pressSequentially(":");
  await expect(categoryPicker).toHaveValue(`${base}:`);

  await categoryPicker.fill(`${base}:Food:market:Gro`);
  await expect(categoryOptions).toHaveAttribute("data-picker-mode", "search");
  await expect(
    page.locator("#spend-merchant-0-category-announcement"),
  ).toHaveText("Searching full paths");
  await expect(
    categoryOptions.getByRole("option", { name: /Groceries/ }),
  ).toBeVisible();

  await categoryPicker.fill(diningFqn);
  await expect(categoryPicker).toHaveValue(`${diningFqn} (Food:Dining)`);
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "false");

  await categoryPicker.fill(`${base}:Food:Pan`);
  await expect(
    categoryOptions.getByRole("option", { name: /Pantry/ }),
  ).toBeVisible();
  await categoryPicker.press("Shift+Tab");
  await expect(categoryPicker).toHaveValue(`${base}:Food:Pan`);
  await expect(spendPanel.getByLabel("Amount")).toBeFocused();
  await categoryPicker.focus();
  await categoryPicker.fill(`${base}:Food:Pa`);
  await categoryPicker.pressSequentially("n");
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "true");
  const pantryOption = categoryOptions.getByRole("option", {
    name: new RegExp(`${pantryFqn}.*Pantry Pick`),
  });
  await expect(pantryOption).toBeVisible();
  const pantryOptionId = await pantryOption.evaluate((option) => option.id);
  await expect(categoryPicker).toHaveAttribute(
    "aria-activedescendant",
    pantryOptionId,
  );
  await categoryPicker.press("Tab");
  await expect(categoryPicker).toHaveValue(`${pantryFqn} (Pantry Pick)`);
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "false");
  await categoryPicker.press("Tab");
  await expect(categoryPicker).not.toBeFocused();
  await expect(categoryPicker).toHaveValue(`${pantryFqn} (Pantry Pick)`);
  await page.getByRole("combobox", { name: "Funding account" }).focus();
  await categoryPicker.focus();
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "true");
  await categoryPicker.press("Tab");
  await expect(categoryPicker).not.toBeFocused();
  await expect(categoryPicker).toHaveValue(`${pantryFqn} (Pantry Pick)`);
  await expect(categoryPicker).toHaveAttribute("aria-expanded", "false");
  await page.mouse.move(0, 0);
  await categoryPicker.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    `${pantryFqn} (Pantry Pick)`,
  );

  const createdFqn = `${base}:Food:New:Bakery`;
  await categoryPicker.fill(createdFqn);
  await expect(
    categoryOptions.getByRole("option", {
      name: `Create ${createdFqn}`,
    }),
  ).toBeVisible();
  const createResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/categories" &&
      response.request().method() === "POST"
    );
  });
  const accountRefreshPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/accounts" && response.request().method() === "GET"
    );
  });
  await categoryPicker.press("Enter");
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBe(true);
  const createdCategory = (await createResponse.json()) as CategoryFixture;
  expect(createdCategory.fqn).toBe(createdFqn);
  expect(createdCategory.economic_intent).toBe("expense");
  await expect(categoryPicker).toHaveValue(`${createdFqn} (New:Bakery)`);
  await expect(categoryPicker).toBeFocused();
  await categoryPicker.press("Tab");
  await expect(categoryPicker).not.toBeFocused();
  await expect(categoryPicker).toHaveValue(`${createdFqn} (New:Bakery)`);
  await accountRefreshPromise;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );

  const fundingPicker = page.getByRole("combobox", {
    name: "Funding account",
  });
  await fundingPicker.fill("merchant");
  await expect(page.locator("#spend-fundingAccountId-options")).toContainText(
    "merchant:Amazon:gift_card",
  );
  await expect(
    page
      .locator("#spend-fundingAccountId-options")
      .getByRole("option", { name: /merchant:Amazon:flow/i }),
  ).toHaveCount(0);

  const merchantPicker = page.getByRole("combobox", { name: "Merchant" });
  await merchantPicker.fill("cash");
  await expect(
    page
      .locator("#spend-merchant-0-account-options")
      .getByRole("option", { name: /cash/i }),
  ).toHaveCount(0);
});

test("late category creation preserves newer shorthand edits", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const createdFqn = `E2ELateCategory:${slug}${Date.now()}`;
  let releaseCreate: (() => void) | undefined;
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });
  let markCreateStarted: (() => void) | undefined;
  const createStarted = new Promise<void>((resolve) => {
    markCreateStarted = resolve;
  });

  await page.route("**/api/categories", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    markCreateStarted?.();
    await createGate;
    await route.continue();
  });

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const categoryPicker = page.getByRole("combobox", { name: "Category" });
  await expect(categoryPicker).toBeEnabled();
  await categoryPicker.fill(createdFqn);
  await expect(
    page.getByRole("option", { name: `Create ${createdFqn}` }),
  ).toBeVisible();
  await categoryPicker.press("Enter");
  await createStarted;

  const memo = page.getByLabel("Memo");
  await memo.fill("must survive the category response");
  const createResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/categories" &&
      response.request().method() === "POST",
  );
  releaseCreate?.();
  const createResponse = await createResponsePromise;
  expect(createResponse.ok()).toBe(true);

  await expect(categoryPicker).toHaveValue(createdFqn);
  await expect(memo).toHaveValue("must survive the category response");
  await categoryPicker.focus();
  await expect(
    page
      .locator("#spend-merchant-0-category-options")
      .getByRole("option", { selected: true }),
  ).toHaveCount(0);
});

test("late category creation failures remain visible after blur", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const createdFqn = `E2ELateFailure:${slug}${Date.now()}`;
  let releaseCreate: (() => void) | undefined;
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });
  let markCreateStarted: (() => void) | undefined;
  const createStarted = new Promise<void>((resolve) => {
    markCreateStarted = resolve;
  });

  await page.route("**/api/categories", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    markCreateStarted?.();
    await createGate;
    await route.abort("failed");
  });

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const categoryPicker = page.getByRole("combobox", { name: "Category" });
  await categoryPicker.fill(createdFqn);
  await expect(
    page.getByRole("option", { name: `Create ${createdFqn}` }),
  ).toBeVisible();
  await categoryPicker.press("Enter");
  await createStarted;

  const memo = page.getByLabel("Memo");
  await memo.focus();
  releaseCreate?.();

  await expect(categoryPicker).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("group", { name: "Merchant 1" }).getByRole("alert"),
  ).toBeVisible();
  await expect(memo).toBeFocused();
});

test("tags multi-picker retains its prefix for sibling batching", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const prefix = `E2ETagBatch:${unique}:Trip`;
  const [flights, hotels, rootSearchTag] = await Promise.all([
    createTag(page, `${prefix}:Flights`),
    createTag(page, `${prefix}:Hotels`),
    createTag(page, `E2ERootSearch:${unique}:RootPick${unique}`),
  ]);

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  const tagsPicker = page.getByRole("combobox", { name: "Tags" });
  const selectedTags = page.getByTestId("entity-multi-picker-selected");
  const tagsOptions = page.locator("#spend-tags-options");

  await tagsPicker.fill(rootSearchTag.name);
  const rootSearchOptionId = `spend-tags-option-${rootSearchTag.tag_id}`;
  const rootSearchOption = tagsOptions.locator(`#${rootSearchOptionId}`);
  await expect(rootSearchOption).toBeVisible();
  await expect(rootSearchOption.getByTestId("entity-picker-fqn")).toHaveText(
    rootSearchTag.fqn,
  );
  const rootSearchDisplayTitle = rootSearchOption.getByTestId(
    "entity-picker-display-title",
  );
  await expect(rootSearchDisplayTitle).toHaveText(
    `(${rootSearchTag.display_label})`,
  );
  await expect(rootSearchDisplayTitle).toHaveClass(/text-muted-foreground/);
  await expect(tagsPicker).toHaveAttribute(
    "aria-activedescendant",
    rootSearchOptionId,
  );
  await tagsPicker.press("Enter");
  await expect(tagsPicker).toHaveValue("");
  await expect(selectedTags).toContainText(rootSearchTag.name);

  await tagsPicker.fill(`${prefix}:`);
  await expect(tagsOptions).toHaveAttribute("data-picker-mode", "level");
  await expect(tagsOptions.getByRole("option")).toHaveCount(2);
  await tagsPicker.press("Enter");
  await expect(tagsPicker).toHaveValue(`${prefix}:`);
  await expect(page.getByTestId("entity-multi-picker-selected")).toContainText(
    flights.name,
  );

  await tagsPicker.pressSequentially("Hot");
  await expect(tagsPicker).toHaveValue(`${prefix}:Hot`);
  await expect(
    tagsOptions.getByRole("option", { name: /Flights/ }),
  ).toHaveCount(0);
  await expect(
    tagsOptions.getByRole("option", { name: /Hotels/ }),
  ).toBeVisible();
  await tagsPicker.press("Tab");
  await expect(tagsPicker).toHaveValue(`${prefix}:`);
  await expect(selectedTags).toContainText(flights.name);
  await expect(selectedTags).toContainText(hotels.name);
  await expect(tagsPicker).toHaveAttribute("aria-expanded", "false");
  await expect(tagsPicker).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(tagsPicker).not.toBeFocused();
  await expect(selectedTags).toContainText(flights.name);
  await expect(selectedTags).toContainText(hotels.name);

  const createdFqn = `${prefix}:Created`;
  let releaseTagRefresh: (() => void) | undefined;
  const tagRefreshGate = new Promise<void>((resolve) => {
    releaseTagRefresh = resolve;
  });
  await page.route("**/api/tags*", async (route) => {
    if (route.request().method() === "GET") {
      await tagRefreshGate;
    }
    await route.continue();
  });
  await tagsPicker.fill(createdFqn);
  await expect(
    tagsOptions.getByRole("option", { name: `Create ${createdFqn}` }),
  ).toBeVisible();
  await tagsPicker.press("Enter");
  await expect(selectedTags).toContainText("Created");
  await tagsPicker.focus();
  await expect(tagsPicker).toHaveValue(`${prefix}:`);
  await tagsPicker.fill(createdFqn);
  await expect(
    tagsOptions.getByRole("option", { name: /Created/ }),
  ).toHaveCount(0);
  await expect(
    tagsOptions.getByRole("option", { name: `Create ${createdFqn}` }),
  ).toHaveCount(0);
  releaseTagRefresh?.();
});

test("late inline tag creation preserves a newer selection", async ({
  page,
}, testInfo) => {
  const slug = testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "");
  const unique = `${slug}${Date.now()}`;
  const existing = await createTag(page, `E2ELateCreate:${unique}:Existing`);
  let releaseCreate: (() => void) | undefined;
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });
  let markCreateStarted: (() => void) | undefined;
  const createStarted = new Promise<void>((resolve) => {
    markCreateStarted = resolve;
  });

  await page.route("**/api/tags", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    markCreateStarted?.();
    await createGate;
    await route.continue();
  });

  await page.goto("/transactions?page=1&pageSize=25");
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();

  const tagsPicker = page.getByRole("combobox", { name: "Tags" });
  const createdFqn = `E2ELateCreate:${unique}:Created`;
  await tagsPicker.fill(createdFqn);
  await expect(
    page.getByRole("option", { name: `Create ${createdFqn}` }),
  ).toBeVisible();
  await tagsPicker.press("Enter");
  await createStarted;

  const pendingCreate = page.getByRole("option", {
    name: `Create ${createdFqn}`,
  });
  await expect(pendingCreate).toHaveAttribute("aria-disabled", "true");
  await expect(pendingCreate).toHaveAccessibleDescription(
    "Wait for creation to finish.",
  );
  const pendingAppearance = await pendingCreate.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--muted)";
    probe.style.color = "var(--muted-foreground)";
    document.body.append(probe);
    const style = window.getComputedStyle(element);
    const probeStyle = window.getComputedStyle(probe);
    const appearance = {
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      color: style.color,
      cursor: style.cursor,
      mutedBackground: probeStyle.backgroundColor,
      mutedForeground: probeStyle.color,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      transform: style.transform,
      glyphColor: window.getComputedStyle(element.querySelector("svg")!).color,
    };
    probe.remove();
    return appearance;
  });
  expect(pendingAppearance).toMatchObject({
    backgroundColor: pendingAppearance.mutedBackground,
    color: pendingAppearance.mutedForeground,
    cursor: "not-allowed",
    glyphColor: pendingAppearance.mutedForeground,
    outlineColor: pendingAppearance.mutedForeground,
    outlineStyle: "solid",
  });
  await pendingCreate.hover();
  await expect(
    page.getByRole("tooltip").filter({
      hasText: "Wait for creation to finish.",
    }),
  ).toBeVisible();
  await page.mouse.down();
  const pressedAppearance = await pendingCreate.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      transform: style.transform,
    };
  });
  await page.mouse.up();
  expect(pressedAppearance).toEqual({
    backgroundColor: pendingAppearance.backgroundColor,
    boxShadow: pendingAppearance.boxShadow,
    transform: pendingAppearance.transform,
  });

  await tagsPicker.fill(existing.fqn);
  const selectedTags = page.getByTestId("entity-multi-picker-selected");
  await expect(selectedTags).toContainText(existing.name);

  const createResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/tags" &&
      response.request().method() === "POST",
  );
  releaseCreate?.();
  await createResponse;
  await expect(selectedTags.getByText("Created", { exact: true })).toHaveCount(
    0,
  );
  await expect(selectedTags).toContainText(existing.name);
});

test("keyboard spend entry creates a transaction and keeps sticky fields", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  const cents =
    (Array.from(testInfo.project.name).reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    ) %
      89) +
    10;
  const amount = `98.${cents}`;

  await page.goto("/transactions?page=1&pageSize=25");
  await expect(
    page.getByRole("heading", { exact: true, name: "Transactions" }),
  ).toBeVisible();
  await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);

  await page
    .getByRole("heading", { exact: true, name: "Transactions" })
    .click();
  await page.keyboard.press("Shift+KeyN");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await page.keyboard.press("KeyN");
  await expect(page.getByRole("heading", { name: "New spend" })).toBeVisible();
  await expect(page.getByLabel("Start from a template")).toBeFocused();
  await page.getByLabel("Start from a template").press("Escape");
  await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);
  await expect(
    page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1,
    ),
  ).resolves.toBe(true);

  const currency = page.getByRole("combobox", { name: "Currency" });
  await expect(
    page.locator("datalist#entry-currency-options option[value='EUR']"),
  ).toHaveCount(1);
  const currencyBox = await currency.boundingBox();
  expect(currencyBox).not.toBeNull();
  await currency.click({
    position: { x: currencyBox!.width - 8, y: currencyBox!.height / 2 },
  });
  await currency.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toBeVisible();
  await currency.fill("bitcoin");
  await expect(currency).toHaveValue("BITCOIN");
  await currency.blur();
  await expect(
    page.getByText("Use a 3-letter code or C:: crypto code."),
  ).toBeVisible();
  const attentionStrip = page.getByRole("button", {
    name: /fields? needs? attention/,
  });
  await expect(attentionStrip).toHaveCount(0);
  await page.getByTestId("entry-scroll-region").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(attentionStrip).toBeVisible();
  await attentionStrip.click();
  await expect(currency).toBeFocused();
  await expect(attentionStrip).toHaveCount(0);
  await currency.fill("ZZZ");
  await expect(currency).toHaveValue("ZZZ");
  await expect(
    page.getByText("Use a 3-letter code or C:: crypto code."),
  ).toBeHidden();
  await currency.fill("USD");

  await page
    .getByRole("textbox", { exact: true, name: "Date" })
    .fill("2026-05-31");
  await page.getByLabel("Amount").fill(amount);
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    "Sapphire",
    "bank:Chase:Sapphire",
    { arrowDownPresses: 1 },
  );
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
  );
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
  );
  await page.getByLabel("Memo").fill("E2E arcade spend");

  let generalFailureReturned = false;
  await page.route("**/api/transactions/spend", async (route) => {
    if (route.request().method() === "POST" && !generalFailureReturned) {
      generalFailureReturned = true;
      await route.fulfill({
        contentType: "application/json",
        json: { message: "Entry save failed" },
        status: 500,
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole("combobox", { name: "Category" }).focus();
  await page.keyboard.press("Meta+Enter");
  await expect(
    page.getByRole("alert").filter({
      hasText: "Transaction could not be saved.",
    }),
  ).toBeVisible();
  await expect(attentionStrip).toHaveCount(0);
  await page.unroute("**/api/transactions/spend");
  const tags = page.locator("#spend-tags");
  await tags.focus();
  let releaseRefresh: (() => void) | undefined;
  let markRefreshStarted: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    markRefreshStarted = resolve;
  });
  const holdTransactionRefresh = async (route: Route) => {
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
  await page.route("**/api/transactions**", holdTransactionRefresh);
  await page.keyboard.press("Meta+Enter");
  await refreshStarted;
  await expect(tags).toBeFocused();
  releaseRefresh?.();

  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Transaction saved." }),
  ).toBeVisible();
  await page.unroute("**/api/transactions**", holdTransactionRefresh);
  const dateInput = page.getByRole("textbox", { exact: true, name: "Date" });
  await expect(dateInput).toBeFocused();
  await expect(dateInput).toHaveValue("2026-05-31");
  await expect(
    page.getByRole("combobox", { name: "Funding account" }),
  ).toHaveValue("bank:Chase:Sapphire (Chase:Sapphire)");
  await expect(page.getByLabel("Amount")).toHaveValue("");

  await page.getByRole("button", { name: "Clear draft" }).click();
  const clearDialog = page.getByRole("alertdialog", {
    name: "Clear entry draft?",
  });
  await clearDialog.getByRole("button", { name: "Clear draft" }).click();
  await expect(page.getByText("Entries this session: 1")).toBeVisible();
  await expect(page.getByLabel("Start from a template")).toBeFocused();
  await expect(
    page.getByRole("combobox", { name: "Funding account" }),
  ).toHaveValue("");

  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toHaveCount(0);
  await page.getByLabel("Search").fill("E2E arcade spend");
  await expect(page.getByText("E2E arcade spend").first()).toBeVisible();

  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(page.getByLabel("Start from a template")).toBeFocused();
  const committedCurrency = page.getByRole("combobox", { name: "Currency" });
  await committedCurrency.fill("USD");
  await committedCurrency.press("ArrowDown");
  await committedCurrency.press("Enter");
  await expect(committedCurrency).toHaveValue("USD");
  await page.getByRole("button", { name: "Close transaction editor" }).click();
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toBeHidden();
});

test("entry panel creates each shorthand transaction type", async ({
  page,
}, testInfo) => {
  const cents =
    (Array.from(testInfo.project.name).reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    ) %
      39) +
    10;
  const saveAndExpectEntryCount = async (
    endpoint: string,
    count: number,
  ): Promise<void> => {
    const saveButton = page.getByRole("button", {
      name: "Save and add another",
    });
    await expect(saveButton).toBeEnabled();
    const saveResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === endpoint && response.request().method() === "POST"
      );
    });
    await saveButton.click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.ok()).toBe(true);
    await expect(
      page.getByText(`Entries this session: ${count}`),
    ).toBeVisible();
    await expect(saveButton).toBeEnabled();
  };

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=25");
  await ledgerLookups;
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await expect(page.getByRole("heading", { name: "New spend" })).toBeVisible();
  const entryPanel = page.getByRole("dialog", {
    name: "Transaction editor",
  });

  const spendPanel = entryPanel.getByRole("tabpanel", { name: "Spend" });
  await spendPanel.getByLabel("Date").fill("2026-05-30");
  await fillAndExpectValue(spendPanel.getByLabel("Amount"), `31.${cents}`);
  await chooseOptionByKeyboard(
    page,
    "Funding account",
    "Wallet",
    "cash:Wallet",
    { scope: spendPanel },
  );
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "Powells",
    "merchant:PowellsBooks",
    {
      scope: spendPanel,
    },
  );
  await chooseOptionByKeyboard(
    page,
    "Category",
    "Books",
    "Entertainment:Books",
    { scope: spendPanel },
  );
  await spendPanel.getByLabel("Memo").fill("E2E tab spend");
  await saveAndExpectEntryCount("/api/transactions/spend", 1);

  await page.getByRole("tab", { name: "Income" }).click();
  await expect(page.getByRole("heading", { name: "New income" })).toBeVisible();
  const incomePanel = entryPanel.getByRole("tabpanel", { name: "Income" });
  await incomePanel.getByLabel("Date").fill("2026-05-30");
  await fillAndExpectValue(incomePanel.getByLabel("Amount"), `41.${cents}`);
  await chooseOptionByKeyboard(
    page,
    "Destination account",
    "joint_checking",
    "bank:Chase:joint_checking",
    { scope: incomePanel },
  );
  await chooseOptionByKeyboard(
    page,
    "Source",
    "Acme",
    "employers:Acme:salary",
    {
      scope: incomePanel,
    },
  );
  await chooseOptionByKeyboard(page, "Category", "Salary", "Income:Salary", {
    scope: incomePanel,
  });
  await incomePanel.getByLabel("Memo").fill("E2E tab income");
  await saveAndExpectEntryCount("/api/transactions/income", 2);

  await page.getByRole("tab", { name: "Refund" }).click();
  await expect(page.getByRole("heading", { name: "New refund" })).toBeVisible();
  const refundPanel = entryPanel.getByRole("tabpanel", { name: "Refund" });
  await refundPanel.getByLabel("Date").fill("2026-05-30");
  await fillAndExpectValue(refundPanel.getByLabel("Amount"), `12.${cents}`);
  await chooseOptionByKeyboard(
    page,
    "Destination account",
    "joint_checking",
    "bank:Chase:joint_checking",
    { scope: refundPanel },
  );
  await chooseOptionByKeyboard(
    page,
    "Merchant",
    "merchant:Target",
    "merchant:Target",
    {
      scope: refundPanel,
    },
  );
  await chooseOptionByKeyboard(page, "Category", "Retail", "Refunds:Retail", {
    scope: refundPanel,
  });
  await refundPanel.getByLabel("Memo").fill("E2E tab refund");
  await saveAndExpectEntryCount("/api/transactions/refund", 3);

  await page.getByRole("tab", { name: "Transfer" }).click();
  await expect(
    page.getByRole("heading", { name: "New transfer" }),
  ).toBeVisible();
  const transferPanel = entryPanel.getByRole("tabpanel", { name: "Transfer" });
  await transferPanel.getByLabel("Date").fill("2026-05-30");
  await fillAndExpectValue(transferPanel.getByLabel("Amount"), `22.${cents}`);
  await chooseOptionByKeyboard(
    page,
    "From account",
    "joint_checking",
    "bank:Chase:joint_checking",
    { scope: transferPanel },
  );
  await chooseOptionByKeyboard(
    page,
    "To account",
    "emergency_savings",
    "bank:Ally:emergency_savings",
    { scope: transferPanel },
  );
  await transferPanel.getByLabel("Memo").fill("E2E tab transfer");
  await saveAndExpectEntryCount("/api/transactions/transfer", 4);

  await page.getByRole("tab", { name: "Exchange" }).click();
  await expect(
    page.getByRole("heading", { name: "New exchange" }),
  ).toBeVisible();
  const exchangePanel = entryPanel.getByRole("tabpanel", { name: "Exchange" });
  await exchangePanel.getByLabel("Date").fill("2026-05-30");
  await chooseOptionByKeyboard(
    page,
    "From account",
    "joint_checking",
    "bank:Chase:joint_checking",
    { scope: exchangePanel },
  );
  await expect(exchangePanel.getByLabel("Currency sold")).toHaveValue("USD");
  await expect(exchangePanel.getByLabel("Currency sold")).not.toBeEditable();
  await fillAndExpectValue(
    exchangePanel.getByLabel("Amount sold"),
    `32.${cents}`,
  );
  await chooseOptionByKeyboard(
    page,
    "To account",
    "Fidelity:EUR",
    "bank:Fidelity:EUR",
    { scope: exchangePanel },
  );
  await expect(exchangePanel.getByLabel("Currency bought")).toHaveValue("EUR");
  await expect(exchangePanel.getByLabel("Currency bought")).not.toBeEditable();
  await fillAndExpectValue(
    exchangePanel.getByLabel("Amount bought"),
    `30.${cents}`,
  );
  await exchangePanel.getByLabel("Memo").fill("E2E tab exchange");
  await saveAndExpectEntryCount("/api/transactions/exchange", 5);
  const lockedSoldCurrency = exchangePanel.getByLabel("Currency sold");
  await expect(lockedSoldCurrency).not.toBeEditable();
  await lockedSoldCurrency.press("ArrowDown");
  await lockedSoldCurrency.press("Escape");
  await expect(entryPanel).toBeHidden();
});

test("exchange entry accepts explicit currencies for multi-currency accounts", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const soldFqn = `e2e:exchange:${unique}:MultiSold`;
  const boughtFqn = `e2e:exchange:${unique}:MultiBought`;
  await Promise.all([
    createAccount(page, soldFqn, "owned"),
    createAccount(page, boughtFqn, "owned"),
  ]);

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=25");
  await ledgerLookups;
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await page.getByRole("tab", { name: "Exchange" }).click();
  const exchangePanel = page
    .getByRole("dialog", { name: "Transaction editor" })
    .getByRole("tabpanel", { name: "Exchange" });

  await exchangePanel.getByLabel("Date").fill("2026-05-30");
  await chooseOptionByKeyboard(page, "From account", "MultiSold", soldFqn, {
    scope: exchangePanel,
  });
  await expect(exchangePanel.getByLabel("Currency sold")).toBeEditable();
  const soldCurrency = exchangePanel.getByLabel("Currency sold");
  await soldCurrency.fill("USD");
  await soldCurrency.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toBeVisible();
  await soldCurrency.fill("U");
  await soldCurrency.press("ArrowDown");
  await soldCurrency.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toBeVisible();
  await soldCurrency.fill("CAD");
  await exchangePanel.getByLabel("Amount sold").fill("12.34");
  await chooseOptionByKeyboard(page, "To account", "MultiBought", boughtFqn, {
    scope: exchangePanel,
  });
  await expect(exchangePanel.getByLabel("Currency bought")).toBeEditable();
  const boughtCurrency = exchangePanel.getByLabel("Currency bought");
  await boughtCurrency.fill("CAD");
  await boughtCurrency.blur();
  await expect(
    exchangePanel.getByText("Sold and bought currencies must differ."),
  ).toBeVisible();
  await soldCurrency.fill("");
  await boughtCurrency.fill("");
  await boughtCurrency.blur();
  await expect(
    exchangePanel.getByText("Bought currency is required."),
  ).toBeVisible();
  await expect(
    exchangePanel.getByText("Sold and bought currencies must differ."),
  ).toBeHidden();
  await page.getByRole("button", { name: "Edit as journal" }).click();
  await expect(
    page.getByRole("heading", { name: "New journal" }),
  ).toBeVisible();
  await expect(journalRecord(page, 3).getByLabel("Currency")).toHaveValue("");
  await expect(journalRecord(page, 4).getByLabel("Currency")).toHaveValue("");
  await page.getByRole("tab", { name: "Exchange" }).click();
  await soldCurrency.fill("USD");
  await expect(
    exchangePanel.getByText("Sold and bought currencies must differ."),
  ).toBeHidden();
  await boughtCurrency.fill("JPY");
  await exchangePanel.getByLabel("Amount bought").fill("1500");
  const memo = `E2E multi-currency exchange ${unique}`;
  await exchangePanel.getByLabel("Memo").fill(memo);
  await exchangePanel.getByRole("button", { name: "Save and close" }).click();
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toBeHidden();

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Edit transaction",
  );
  const reopenedExchangePanel = page
    .getByRole("dialog", { name: "Transaction editor" })
    .getByRole("tabpanel", { name: "Exchange" });
  await expect(reopenedExchangePanel.getByLabel("Currency sold")).toHaveValue(
    "USD",
  );
  await expect(reopenedExchangePanel.getByLabel("Currency bought")).toHaveValue(
    "JPY",
  );
});

test("exchange edit preserves record currencies when selecting a multi-currency account", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const soldFqn = `e2e:exchange-edit:${unique}:CadSold`;
  const boughtFqn = `e2e:exchange-edit:${unique}:JpyBought`;
  const multiSoldFqn = `e2e:exchange-edit:${unique}:MultiSold`;
  await Promise.all([
    createAccount(page, soldFqn, "owned", "CAD"),
    createAccount(page, boughtFqn, "owned", "JPY"),
    createAccount(page, multiSoldFqn, "owned"),
  ]);
  const memo = `E2E exchange edit ${unique}`;

  const ledgerLookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=25");
  await ledgerLookups;
  await page
    .locator("header")
    .getByRole("button", { name: "New transaction" })
    .click();
  await page.getByRole("tab", { name: "Exchange" }).click();
  let exchangePanel = page
    .getByRole("dialog", { name: "Transaction editor" })
    .getByRole("tabpanel", { name: "Exchange" });
  await exchangePanel.getByLabel("Date").fill("2026-07-30");
  await chooseOptionByKeyboard(page, "From account", "CadSold", soldFqn, {
    scope: exchangePanel,
  });
  await exchangePanel.getByLabel("Amount sold").fill("14");
  await chooseOptionByKeyboard(page, "To account", "JpyBought", boughtFqn, {
    scope: exchangePanel,
  });
  await exchangePanel.getByLabel("Amount bought").fill("1500");
  await exchangePanel.getByLabel("Memo").fill(memo);
  await exchangePanel.getByRole("button", { name: "Save and close" }).click();
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toBeHidden();

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Edit transaction",
  );
  exchangePanel = page
    .getByRole("dialog", { name: "Transaction editor" })
    .getByRole("tabpanel", { name: "Exchange" });
  await expect(exchangePanel.getByLabel("Currency sold")).toHaveValue("CAD");
  await expect(exchangePanel.getByLabel("Currency sold")).not.toBeEditable();

  await chooseOptionByKeyboard(
    page,
    "From account",
    "MultiSold",
    multiSoldFqn,
    { scope: exchangePanel },
  );
  await expect(exchangePanel.getByLabel("Currency sold")).toBeEditable();
  await expect(exchangePanel.getByLabel("Currency sold")).toHaveValue("CAD");

  await page.getByRole("button", { name: "Update transaction" }).click();
  await expect(
    page.getByRole("dialog", { name: "Transaction editor" }),
  ).toBeHidden();

  await page.goto(
    `/transactions?page=1&pageSize=50&q=${encodeURIComponent(memo)}`,
  );
  await clickRowAction(
    page,
    page.getByRole("row").filter({ hasText: memo }).first(),
    "Edit transaction",
  );
  exchangePanel = page
    .getByRole("dialog", { name: "Transaction editor" })
    .getByRole("tabpanel", { name: "Exchange" });
  await expect(exchangePanel.getByLabel("Currency sold")).toHaveValue("CAD");
  await expect(exchangePanel.getByLabel("Currency bought")).toHaveValue("JPY");
});

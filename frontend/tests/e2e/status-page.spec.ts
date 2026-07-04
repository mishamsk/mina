import { expect, type Page, test } from "@playwright/test";

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

  await page.goto("/ui/transactions?page=2&pageSize=10");

  await expect(page).toHaveURL(/\/transactions\?page=2&pageSize=10$/);
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

  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByLabel("Primary")).toBeVisible();
  await expect(
    page.getByLabel("Primary").getByRole("button", { name: "New transaction" }),
  ).toBeDisabled();
  await expect(page.getByRole("link", { name: "Transactions" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Transactions" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Status" }).click();

  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).click();

  await expect(page).toHaveURL(/\/transactions$/);
  await expect(
    page.getByRole("heading", { name: "Transactions" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(
    page.getByRole("link", { name: "Transactions" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Settings" })).toBeDisabled();
  const statusIcon = page
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

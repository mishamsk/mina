import { expect } from "@playwright/test";
import { test } from "@tests/e2e/test";

test("login validates required fields inline", async ({
  authenticatedBackend,
  page,
}) => {
  await page.goto(authenticatedBackend.baseURL);

  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");
  await email.blur();
  await expect(page.getByText("Email is required.")).toBeVisible();
  await password.focus();
  await password.blur();
  await expect(page.getByText("Password is required.")).toBeVisible();

  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(email).toBeFocused();
  await email.fill(authenticatedBackend.email);
  await password.fill(authenticatedBackend.password);
  await expect(page.getByText("Email is required.")).toHaveCount(0);
  await expect(page.getByText("Password is required.")).toHaveCount(0);
});

test("pending login explains why submission is disabled", async ({
  authenticatedBackend,
  page,
}) => {
  let releaseLogin = (): void => {};
  const loginReleased = new Promise<void>((resolve) => {
    releaseLogin = resolve;
  });
  await page.route("**/api/auth/login", async (route) => {
    await loginReleased;
    await route.continue();
  });
  await page.goto(authenticatedBackend.baseURL);
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();

  const pendingLogin = page.getByRole("button", {
    name: "Checking access...",
  });
  await expect(pendingLogin).toBeDisabled();
  await pendingLogin.locator("..").focus();
  await expect(page.getByRole("tooltip")).toHaveText("Checking access...");

  releaseLogin();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("authentication gates the shell, remembers the session, and logs out", async ({
  authenticatedBackend,
  page,
}) => {
  await page.goto(authenticatedBackend.baseURL);

  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );

  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill("incorrect-password");
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "invalid email or password",
  );
  await expect(page.getByLabel("Password")).toHaveValue("");
  await expect(page.getByLabel("Password")).toBeFocused();

  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  const overviewHeading = page.getByRole("heading", { name: "Overview" });
  await expect(overviewHeading).toBeVisible();
  await expect(overviewHeading).toBeFocused();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();
});

test("reauthentication preserves transaction detail focus", async ({
  authenticatedBackend,
  context,
  page,
}) => {
  await page.goto(authenticatedBackend.baseURL);
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(
    page.getByRole("heading", { name: "Transactions" }),
  ).toBeVisible();
  const postedRow = page
    .locator("[data-transaction-row]:not(:has([data-display-status]))")
    .first();
  await postedRow.focus();
  await postedRow.press("Enter");
  const detailPanel = page.getByTestId("transaction-detail-panel");
  await expect(detailPanel).toBeFocused();

  await context.clearCookies();
  await detailPanel.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete transaction" })
    .getByRole("button", { name: "Delete transaction" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();

  await expect(detailPanel).toBeVisible();
  await expect(detailPanel).toBeFocused();
});

test("bootstrap failure does not retry page-heading focus", async ({
  authenticatedBackend,
  page,
}) => {
  await page.goto(authenticatedBackend.baseURL);
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.addInitScript(() => {
    const runtime = globalThis as typeof globalThis & {
      __minaAnimationFrameCount: number;
    };
    runtime.__minaAnimationFrameCount = 0;
    const requestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      runtime.__minaAnimationFrameCount += 1;
      return requestAnimationFrame(callback);
    };
    IDBFactory.prototype.open = () => {
      throw new Error("IndexedDB unavailable for test.");
    };
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "IndexedDB unavailable for test.",
  );

  const animationFrameCount = await page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __minaAnimationFrameCount: number;
        }
      ).__minaAnimationFrameCount,
  );
  await page.waitForTimeout(100);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __minaAnimationFrameCount: number;
            }
          ).__minaAnimationFrameCount,
      ),
    )
    .toBe(animationFrameCount);
});

test("a protected request after session loss returns to login", async ({
  authenticatedBackend,
  context,
  page,
}) => {
  await page.goto(authenticatedBackend.baseURL);
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await context.clearCookies();
  await page.getByRole("link", { name: "Settings" }).click();

  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();
});

test("failed logout restores focus to the logout button", async ({
  authenticatedBackend,
  page,
}) => {
  await page.goto(authenticatedBackend.baseURL);
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  let releaseLogout = (): void => {};
  const logoutReleased = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  await page.route("**/api/auth/logout", async (route) => {
    await logoutReleased;
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "method_not_allowed", message: "Logout failed." },
      }),
      contentType: "application/json",
      status: 405,
    });
  });
  const logout = page.getByRole("button", { name: "Log out" });
  await logout.click();

  const loggingOut = page.getByRole("button", { name: "Logging out…" });
  await expect(loggingOut).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Command palette" }),
  ).toBeEnabled();
  await loggingOut.locator("..").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Logging out…");
  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toBeVisible();
  releaseLogout();

  await expect(
    page.getByRole("button", { name: "Dismiss notice: Logout failed." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(logout).toBeEnabled();
  await expect(logout).toBeFocused();
});

test("logout failure remains visible while the transaction editor is open", async ({
  authenticatedBackend,
  page,
}) => {
  await page.goto(authenticatedBackend.baseURL);
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  let releaseLogout = (): void => {};
  const logoutReleased = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  await page.route("**/api/auth/logout", async (route) => {
    await logoutReleased;
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "method_not_allowed", message: "Logout failed." },
      }),
      contentType: "application/json",
      status: 405,
    });
  });
  await page.getByRole("button", { name: "Log out" }).click();
  const overviewHeading = page.getByRole("heading", { name: "Overview" });
  await overviewHeading.focus();
  await page.keyboard.press("n");
  await expect(
    page.getByRole("button", { name: "Close transaction editor" }),
  ).toBeVisible();

  releaseLogout();
  const logoutNotice = page.getByRole("button", {
    name: "Dismiss notice: Logout failed.",
  });
  await expect(logoutNotice).toBeVisible();
  const noticeLayer = await logoutNotice.evaluate((notice) =>
    Number(getComputedStyle(notice.parentElement!).zIndex),
  );
  const editorLayer = await page
    .getByRole("dialog", { name: "Transaction editor" })
    .evaluate((editor) => Number(getComputedStyle(editor).zIndex));
  expect(noticeLayer).toBeGreaterThan(editorLayer);
  await logoutNotice.click();
  await expect(logoutNotice).toHaveCount(0);
});

test("a delayed response from an earlier session does not undo login", async ({
  authenticatedBackend,
  context,
  page,
}) => {
  await page.goto(authenticatedBackend.baseURL);
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  let releaseOldResponse = (): void => {};
  const oldResponseReleased = new Promise<void>((resolve) => {
    releaseOldResponse = resolve;
  });
  let markOldResponseReady = (): void => {};
  const oldResponseReady = new Promise<void>((resolve) => {
    markOldResponseReady = resolve;
  });
  let markOldResponseDelivered = (): void => {};
  const oldResponseDelivered = new Promise<void>((resolve) => {
    markOldResponseDelivered = resolve;
  });
  let heldSettingsRequest = false;
  await page.route("**/api/settings", async (route) => {
    if (heldSettingsRequest) {
      await route.continue();
      return;
    }
    heldSettingsRequest = true;
    const response = await route.fetch();
    markOldResponseReady();
    await oldResponseReleased;
    await route.fulfill({ response });
    markOldResponseDelivered();
  });

  await context.clearCookies();
  await page.getByRole("link", { name: "Settings" }).click();
  await oldResponseReady;
  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();

  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

  releaseOldResponse();
  await oldResponseDelivered;
  await page.waitForTimeout(250);
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
});

test("a delayed logout hydration does not undo a newer login", async ({
  authenticatedBackend,
  page,
}) => {
  await page.goto(authenticatedBackend.baseURL);
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  let releaseStatus = (): void => {};
  const statusReleased = new Promise<void>((resolve) => {
    releaseStatus = resolve;
  });
  let markStatusReady = (): void => {};
  const statusReady = new Promise<void>((resolve) => {
    markStatusReady = resolve;
  });
  await page.route("**/api/auth/status", async (route) => {
    const response = await route.fetch();
    markStatusReady();
    await statusReleased;
    await route.fulfill({ response });
  });

  await page.getByRole("button", { name: "Log out" }).click();
  await statusReady;
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();

  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  releaseStatus();
  await expect(page.getByRole("button", { name: "Log out" })).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("a delayed logout response cannot clear a newer login", async ({
  authenticatedBackend,
  context,
  page,
}) => {
  await page.goto(authenticatedBackend.baseURL);
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  let releaseLogout = (): void => {};
  const logoutReleased = new Promise<void>((resolve) => {
    releaseLogout = resolve;
  });
  let markLogoutStarted = (): void => {};
  const logoutStarted = new Promise<void>((resolve) => {
    markLogoutStarted = resolve;
  });
  let markLogoutSettled = (): void => {};
  const logoutSettled = new Promise<void>((resolve) => {
    markLogoutSettled = resolve;
  });
  await page.route("**/api/auth/logout", async (route) => {
    markLogoutStarted();
    await logoutReleased;
    try {
      await route.fulfill({ status: 204 });
    } catch {
      // Login aborts the superseded logout request before it can clear cookies.
    }
    markLogoutSettled();
  });

  await page.getByRole("button", { name: "Log out" }).click();
  await logoutStarted;
  await context.clearCookies();
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();

  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  releaseLogout();
  await logoutSettled;
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("auth-disabled startup opens the existing shell", async ({
  baseURL,
  page,
}) => {
  await page.goto(baseURL ?? "/");

  const overviewHeading = page.getByRole("heading", { name: "Overview" });
  await expect(overviewHeading).toBeVisible();
  await expect(overviewHeading).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toHaveCount(0);
});

test("a login tab recovers when authentication becomes disabled", async ({
  authenticatedBackend,
  page,
}) => {
  const fulfillJSON = (body: unknown) => ({
    body: JSON.stringify(body),
    contentType: "application/json",
    status: 200,
  });
  await page.route("**/api/accounts?**", async (route) => {
    await route.fulfill(fulfillJSON({ accounts: [], total_count: 0 }));
  });
  await page.route("**/api/accounts/balances**", async (route) => {
    await route.fulfill(fulfillJSON({ balances: [] }));
  });
  await page.route("**/api/transactions/month-totals?**", async (route) => {
    const month = new URL(route.request().url()).searchParams.get("month");
    const emptyTotal = {
      amount: "0.00000000",
      amount_usd: "0.00000000",
      unconverted_count: 0,
    };
    await route.fulfill(
      fulfillJSON({ income: emptyTotal, month, spend: emptyTotal }),
    );
  });
  await page.route("**/api/transactions?**", async (route) => {
    await route.fulfill(
      fulfillJSON({ offset: 0, total_count: 0, transactions: [] }),
    );
  });
  let authenticationDisabled = false;
  await page.route("**/api/auth/status", async (route) => {
    if (!authenticationDisabled) {
      await route.continue();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({ enabled: false, authenticated: false }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/auth/login", async (route) => {
    authenticationDisabled = true;
    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: "unauthenticated",
          message: "authentication is disabled",
        },
      }),
      contentType: "application/json",
      status: 401,
    });
  });

  await page.goto(authenticatedBackend.baseURL);
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();

  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("an authenticated tab recovers after logout disables authentication", async ({
  authenticatedBackend,
  page,
}) => {
  await page.goto(authenticatedBackend.baseURL);
  await page.getByLabel("Email").fill(authenticatedBackend.email);
  await page.getByLabel("Password").fill(authenticatedBackend.password);
  await page.getByRole("button", { name: "Enter Mina" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.route("**/api/auth/logout", async (route) => {
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/auth/status", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ enabled: false, authenticated: false }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.getByRole("button", { name: "Log out" }).click();

  const overviewHeading = page.getByRole("heading", { name: "Overview" });
  await expect(overviewHeading).toBeVisible();
  await expect(overviewHeading).toBeFocused();
  await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Command palette" }),
  ).toBeEnabled();
  await page.keyboard.press("Control+K");
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toBeVisible();
});

test("a protected 401 gates a tab opened before auth was enabled", async ({
  baseURL,
  page,
}) => {
  await page.goto(baseURL ?? "/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.route("**/api/settings", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        error: { code: "unauthenticated", message: "authentication required" },
      }),
      contentType: "application/json",
      status: 401,
    });
  });
  await page.getByRole("link", { name: "Settings" }).click();

  await expect(
    page.getByRole("heading", { name: "Household access" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );
});

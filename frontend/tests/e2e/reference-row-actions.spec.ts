import { expect, type Locator, type Page, test } from "@playwright/test";

interface RowActionTarget {
  readonly actionCount: number;
  readonly buttonActionLabels: readonly string[];
  readonly compact?: boolean;
  readonly create: (page: Page, fqn: string) => Promise<void>;
  readonly foldedActionLabels: readonly string[];
  readonly path: string;
  readonly rowTestId: string;
  readonly toggleCount: number;
}

const createAccount = async (page: Page, fqn: string): Promise<void> => {
  const response = await page.request.post("/api/accounts", {
    data: {
      account_type: "balance",
      currency: "USD",
      fqn,
      is_hidden: false,
    },
  });
  expect(response.ok()).toBe(true);
};

const createCategory = async (page: Page, fqn: string): Promise<void> => {
  const response = await page.request.post("/api/categories", {
    data: { economic_intent: "expense", fqn, is_hidden: false },
  });
  expect(response.ok()).toBe(true);
};

const createTag = async (page: Page, fqn: string): Promise<void> => {
  const response = await page.request.post("/api/tags", {
    data: { fqn, is_hidden: false },
  });
  expect(response.ok()).toBe(true);
};

const rowActionFitState = async (rowActions: Locator) =>
  rowActions.evaluate((element) => {
    const overflow = element.querySelector<HTMLElement>(
      ".row-actions-overflow",
    );
    const primaryActions = Array.from(
      element.querySelectorAll<HTMLElement>(
        ".row-actions-buttons :is(.row-actions-button, .row-actions-toggle)",
      ),
    );
    const availableWidth = element.getBoundingClientRect().width;
    const actionCount = Number(element.dataset.rowActionsCount ?? "0");
    const fullClusterWidth =
      actionCount === 0 ? 0 : actionCount * 28 + (actionCount - 1) * 4;
    const buttonsFolded = primaryActions.every(
      (action) => window.getComputedStyle(action).display === "none",
    );
    const overflowVisible =
      overflow !== null && window.getComputedStyle(overflow).display !== "none";

    return {
      availableWidth,
      buttonsFolded,
      fullClusterWidth,
      overflowVisible,
    };
  });

const expectActionColumnInsetMatchesTable = async (rowActions: Locator) => {
  const insets = await rowActions.evaluate((element) => {
    const actionCell = element.closest("td");
    const firstCell = actionCell?.parentElement?.querySelector("td");
    const actionCellStyles = actionCell
      ? window.getComputedStyle(actionCell)
      : undefined;
    const firstCellStyles = firstCell
      ? window.getComputedStyle(firstCell)
      : undefined;

    return {
      leading: Number.parseFloat(firstCellStyles?.paddingLeft ?? "0"),
      trailing: Number.parseFloat(actionCellStyles?.paddingRight ?? "0"),
    };
  });

  expect(insets.trailing).toBeCloseTo(insets.leading, 4);
};

const expectCompactActionClusterHugsFrame = async (rowActions: Locator) => {
  const geometry = await rowActions.evaluate((element) => {
    const frame = document.querySelector(
      "[data-testid='reference-table-frame']",
    );
    const actionCell = element.closest("td");
    const actionCellStyles = actionCell
      ? window.getComputedStyle(actionCell)
      : undefined;
    const visibleControls = Array.from(
      element.querySelectorAll<HTMLElement>(
        ".row-actions-buttons :is(.row-actions-button, .row-actions-toggle), .row-actions-overflow",
      ),
    ).filter((control) => {
      const styles = window.getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      return styles.display !== "none" && rect.width > 0 && rect.height > 0;
    });
    const clusterRight = visibleControls.reduce(
      (right, control) =>
        Math.max(right, control.getBoundingClientRect().right),
      Number.NEGATIVE_INFINITY,
    );

    return {
      clusterRight:
        clusterRight === Number.NEGATIVE_INFINITY ? undefined : clusterRight,
      expectedRight:
        (frame?.getBoundingClientRect().right ?? 0) -
        Number.parseFloat(actionCellStyles?.paddingRight ?? "0"),
    };
  });

  expect(geometry.clusterRight).toBeDefined();
  expect(
    Math.abs((geometry.clusterRight ?? 0) - geometry.expectedRight),
  ).toBeLessThanOrEqual(3);
};

test("reference row actions fold only when their action cell cannot fit them, including compact tags", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const targets: readonly RowActionTarget[] = [
    {
      actionCount: 5,
      buttonActionLabels: ["Edit account", "Move or rename", "Delete account"],
      create: createAccount,
      foldedActionLabels: [
        "Hide account",
        "Feature account",
        "Edit account",
        "Move or rename",
        "Delete account",
      ],
      path: "/accounts",
      rowTestId: "accounts-tree-row",
      toggleCount: 2,
    },
    {
      actionCount: 5,
      buttonActionLabels: [
        "Edit category",
        "Move or rename",
        "Delete category",
      ],
      create: createCategory,
      foldedActionLabels: [
        "Hide category",
        "Edit category",
        "Move or rename",
        "Delete category",
      ],
      path: "/categories",
      rowTestId: "categories-tree-row",
      toggleCount: 1,
    },
    {
      actionCount: 5,
      buttonActionLabels: ["Edit tag", "Move or rename", "Delete tag"],
      compact: true,
      create: createTag,
      foldedActionLabels: [
        "Hide tag",
        "Edit tag",
        "Move or rename",
        "Delete tag",
      ],
      path: "/tags",
      rowTestId: "tags-tree-row",
      toggleCount: 1,
    },
  ];

  for (const [index, target] of targets.entries()) {
    await target.create(page, `zzE2EFold${index}:${unique}`);
  }

  for (const viewportWidth of [1600, 1440]) {
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    for (const [index, target] of targets.entries()) {
      const fqn = `zzE2EFold${index}:${unique}`;
      await page.goto(target.path);
      await page.getByLabel("Search").fill(fqn);
      const row = page
        .getByTestId(target.rowTestId)
        .filter({ hasText: fqn })
        .first();
      const rowActions = row.locator(".row-actions");
      await expect(row).toBeVisible();
      await expect(rowActions).toHaveAttribute(
        "data-row-actions-count",
        target.actionCount.toString(),
      );

      for (const label of target.buttonActionLabels) {
        const action = row.getByRole("button", { name: label });
        await expect(action).toBeVisible();
        await expect(action).toHaveCSS("opacity", "1");
      }
      await expect(
        row.getByRole("button", { name: "More row actions" }),
      ).toBeHidden();

      const fit = await rowActionFitState(rowActions);
      expect(fit.availableWidth).toBeGreaterThanOrEqual(fit.fullClusterWidth);
      expect(fit.buttonsFolded).toBe(false);
      expect(fit.overflowVisible).toBe(false);
      if (target.compact) {
        await expectCompactActionClusterHugsFrame(rowActions);
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 900 });
  for (const [index, target] of targets.entries()) {
    const fqn = `zzE2EFold${index}:${unique}`;
    await page.goto(target.path);
    await page.getByLabel("Search").fill(fqn);
    const row = page
      .getByTestId(target.rowTestId)
      .filter({ hasText: fqn })
      .first();
    const rowActions = row.locator(".row-actions");
    const overflow = row.getByRole("button", { name: "More row actions" });
    await expect(row).toBeVisible();
    const fit = await rowActionFitState(rowActions);
    expect(fit.availableWidth).toBeLessThan(fit.fullClusterWidth);
    expect(fit.buttonsFolded).toBe(true);
    expect(fit.overflowVisible).toBe(true);
    await expect(row.locator(".row-actions-toggle")).toHaveCount(
      target.toggleCount,
    );
    for (
      let toggleIndex = 0;
      toggleIndex < target.toggleCount;
      toggleIndex += 1
    ) {
      await expect(
        row.locator(".row-actions-toggle").nth(toggleIndex),
      ).toBeHidden();
    }
    await expect(overflow).toBeVisible();
    await expectActionColumnInsetMatchesTable(rowActions);
    if (target.compact) {
      await expectCompactActionClusterHugsFrame(rowActions);
    }

    await overflow.focus();
    await page.keyboard.press("Enter");
    const overflowMenu = page.locator(".row-actions-menu:visible");
    const firstAction = overflowMenu.getByRole("button", {
      name: target.foldedActionLabels[0],
    });
    const moveAction = overflowMenu.getByRole("button", {
      name: "Move or rename",
    });
    for (const label of target.foldedActionLabels) {
      await expect(
        overflowMenu.getByRole("button", { name: label }),
      ).toBeVisible();
    }
    await expect(firstAction).toBeVisible();
    await expect(moveAction).toBeVisible();
    await expect(overflowMenu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(overflowMenu).toBeHidden();
    await expect(overflow).toBeFocused();

    await overflow.focus();
    await page.keyboard.press("Enter");
    await moveAction.click();
    const dialog = page.getByRole("dialog", { name: "Move or rename" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
});

test("Accounts rows fold independently when their action counts differ", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const parentFqn = `zzE2EMixed${unique}:Parent`;
  const childFqn = `${parentFqn}:Child`;
  const leafFqn = `zzE2EMixed${unique}:Leaf`;
  await createAccount(page, childFqn);
  await createAccount(page, leafFqn);

  await page.route("**/api/accounts?*", async (route) => {
    const response = await route.fetch();
    const url = new URL(route.request().url());
    if (
      url.searchParams.get("limit") !== "500" ||
      url.searchParams.has("include_tombstoned")
    ) {
      await route.fulfill({ response });
      return;
    }

    const body = (await response.json()) as {
      accounts: Record<string, unknown>[];
    };
    const child = body.accounts.find((account) => account.fqn === childFqn);
    if (!child) {
      await route.fulfill({ response });
      return;
    }
    await route.fulfill({
      response,
      json: {
        ...body,
        accounts: [
          ...body.accounts,
          {
            ...child,
            account_id: -1,
            fqn: parentFqn,
            name: "Parent",
          },
        ],
      },
    });
  });

  await page.goto("/accounts");
  await page.getByLabel("Search").fill(`zzE2EMixed${unique}`);
  const parentRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: parentFqn })
    .first();
  const leafRow = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: leafFqn })
    .first();
  const parentActions = parentRow.locator(".row-actions");
  const leafActions = leafRow.locator(".row-actions");
  await expect(parentRow).toBeVisible();
  await expect(leafRow).toBeVisible();
  await expect(parentActions).toHaveAttribute("data-row-actions-count", "6");
  await expect(leafActions).toHaveAttribute("data-row-actions-count", "5");

  let parentFit: Awaited<ReturnType<typeof rowActionFitState>> | undefined;
  let leafFit: Awaited<ReturnType<typeof rowActionFitState>> | undefined;
  for (const width of [
    1600, 1560, 1520, 1480, 1440, 1400, 1360, 1320, 1280, 1240, 1200, 1180,
    1140, 1100, 1060, 1020, 1000, 960, 920, 880,
  ]) {
    await page.setViewportSize({ width, height: 900 });
    const nextParentFit = await rowActionFitState(parentActions);
    const nextLeafFit = await rowActionFitState(leafActions);
    if (
      nextParentFit.availableWidth < nextParentFit.fullClusterWidth &&
      nextLeafFit.availableWidth >= nextLeafFit.fullClusterWidth
    ) {
      parentFit = nextParentFit;
      leafFit = nextLeafFit;
      break;
    }
  }

  expect(parentFit).toBeDefined();
  expect(leafFit).toBeDefined();
  expect(parentFit?.fullClusterWidth).toBe(188);
  expect(leafFit?.fullClusterWidth).toBe(156);
  expect(parentFit?.availableWidth).toBeLessThan(
    parentFit?.fullClusterWidth ?? 0,
  );
  expect(leafFit?.availableWidth).toBeGreaterThanOrEqual(
    leafFit?.fullClusterWidth ?? 0,
  );
  expect(parentFit?.buttonsFolded).toBe(true);
  expect(parentFit?.overflowVisible).toBe(true);
  expect(leafFit?.buttonsFolded).toBe(false);
  expect(leafFit?.overflowVisible).toBe(false);

  await expect(parentRow.locator(".row-actions-toggle")).toHaveCount(3);
  await expect(parentRow.locator(".row-actions-toggle").first()).toBeHidden();
  await expect(parentRow.locator(".row-actions-toggle").nth(1)).toBeHidden();
  await expect(parentRow.locator(".row-actions-toggle").nth(2)).toBeHidden();
  await expect(
    parentRow.getByRole("button", { name: "More row actions" }),
  ).toBeVisible();
  await expectActionColumnInsetMatchesTable(parentActions);

  for (const label of ["Edit account", "Move or rename", "Delete account"]) {
    const action = leafRow.getByRole("button", { name: label });
    await expect(action).toBeVisible();
    await expect(action).toHaveCSS("opacity", "1");
  }
});

test("disabled row delete stays still and does not invoke its action", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const fqn = `zzE2EDisabledDelete:${unique}`;
  let deleteRequests = 0;

  await createAccount(page, fqn);
  await page.route("**/api/accounts?*", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      accounts: Record<string, unknown>[];
    };
    await route.fulfill({
      response,
      json: {
        ...body,
        accounts: body.accounts.map((account) =>
          account.fqn === fqn ? { ...account, deletable: false } : account,
        ),
      },
    });
  });
  await page.route("**/api/accounts/*", async (route) => {
    if (route.request().method() === "DELETE") {
      deleteRequests += 1;
    }
    await route.continue();
  });

  await page.goto(`/accounts?q=${encodeURIComponent(fqn)}`);
  const row = page
    .getByTestId("accounts-tree-row")
    .filter({ hasText: fqn })
    .first();
  const deleteButton = row.getByRole("button", { name: "Delete account" });
  await expect(row).toBeVisible();
  await expect(deleteButton).toHaveAttribute("aria-disabled", "true");
  await expect(deleteButton).toHaveCSS("cursor", "not-allowed");

  await deleteButton.focus();
  await expect(deleteButton).toBeFocused();
  const before = await deleteButton.boundingBox();
  expect(before).not.toBeNull();

  await deleteButton.hover();
  await page.mouse.down();
  const pressed = await deleteButton.boundingBox();
  await page.mouse.up();
  const after = await deleteButton.boundingBox();
  expect(pressed).not.toBeNull();
  expect(after).not.toBeNull();
  expect(pressed?.x).toBeCloseTo(before?.x ?? 0, 4);
  expect(pressed?.y).toBeCloseTo(before?.y ?? 0, 4);
  expect(after?.x).toBeCloseTo(before?.x ?? 0, 4);
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 4);

  await deleteButton.click({ force: true });
  await expect(deleteButton).toBeFocused();
  expect(deleteRequests).toBe(0);
  await expect(
    page.getByRole("alertdialog", { name: "Delete account" }),
  ).toHaveCount(0);
});

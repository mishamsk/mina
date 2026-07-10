import { expect, type Locator, type Page, test } from "@playwright/test";

interface RowActionTarget {
  readonly actionCount: number;
  readonly buttonActionLabels: readonly string[];
  readonly create: (page: Page, fqn: string) => Promise<void>;
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
    const buttonActions = Array.from(
      element.querySelectorAll<HTMLElement>(
        ".row-actions-buttons .row-actions-button",
      ),
    );
    const availableWidth = element.getBoundingClientRect().width;
    const actionCount = Number(element.dataset.rowActionsCount ?? "0");
    const fullClusterWidth =
      actionCount === 0 ? 0 : actionCount * 28 + (actionCount - 1) * 4;
    const buttonsFolded = buttonActions.every(
      (button) => window.getComputedStyle(button).display === "none",
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

const expectFoldedClusterCentered = async (rowActions: Locator) => {
  const geometry = await rowActions.evaluate((element) => {
    const cell = element.closest("td");
    const controls = Array.from(
      element.querySelectorAll<HTMLElement>(
        ".row-actions-toggle, .row-actions-overflow",
      ),
    ).filter((control) => {
      const styles = window.getComputedStyle(control);
      return styles.display !== "none" && control.getBoundingClientRect().width;
    });
    const controlRects = controls.map((control) =>
      control.getBoundingClientRect(),
    );
    const cellRect = cell?.getBoundingClientRect();
    const clusterLeft = Math.min(...controlRects.map((rect) => rect.left));
    const clusterRight = Math.max(...controlRects.map((rect) => rect.right));

    return {
      cellCenter: cellRect ? (cellRect.left + cellRect.right) / 2 : 0,
      clusterCenter: (clusterLeft + clusterRight) / 2,
    };
  });

  expect(
    Math.abs(geometry.clusterCenter - geometry.cellCenter),
  ).toBeLessThanOrEqual(2);
};

test("reference row actions fold only when their action cell cannot fit them", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const targets: readonly RowActionTarget[] = [
    {
      actionCount: 4,
      buttonActionLabels: ["Move or rename", "Delete account"],
      create: createAccount,
      path: "/accounts",
      rowTestId: "accounts-tree-row",
      toggleCount: 2,
    },
    {
      actionCount: 3,
      buttonActionLabels: ["Move or rename", "Delete category"],
      create: createCategory,
      path: "/categories",
      rowTestId: "categories-tree-row",
      toggleCount: 1,
    },
    {
      actionCount: 3,
      buttonActionLabels: ["Move or rename", "Delete tag"],
      create: createTag,
      path: "/tags",
      rowTestId: "tags-tree-row",
      toggleCount: 1,
    },
  ];

  for (const [index, target] of targets.entries()) {
    await target.create(page, `zzE2EFold${index}:${unique}`);
  }

  for (const viewportWidth of [1440, 1200]) {
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

      if (viewportWidth === 1440) {
        await row.hover();
      } else {
        await row.focus();
      }

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
    await row.focus();

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
      ).toBeVisible();
    }
    await expect(overflow).toBeVisible();
    await expectFoldedClusterCentered(rowActions);

    await overflow.focus();
    await page.keyboard.press("Enter");
    const overflowMenu = page.locator(".row-actions-menu");
    const moveAction = overflowMenu.getByRole("button", {
      name: "Move or rename",
    });
    await expect(moveAction).toBeVisible();
    await moveAction.focus();
    await page.keyboard.press("Enter");
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
  await expect(parentActions).toHaveAttribute("data-row-actions-count", "5");
  await expect(leafActions).toHaveAttribute("data-row-actions-count", "4");

  let parentFit: Awaited<ReturnType<typeof rowActionFitState>> | undefined;
  let leafFit: Awaited<ReturnType<typeof rowActionFitState>> | undefined;
  for (const width of [1180, 1140, 1100, 1060, 1020, 1000, 960, 920, 880]) {
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
  expect(parentFit?.fullClusterWidth).toBe(156);
  expect(leafFit?.fullClusterWidth).toBe(124);
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
  await expect(parentRow.locator(".row-actions-toggle").first()).toBeVisible();
  await expect(parentRow.locator(".row-actions-toggle").nth(1)).toBeVisible();
  await expect(parentRow.locator(".row-actions-toggle").nth(2)).toBeVisible();
  await expect(
    parentRow.getByRole("button", { name: "More row actions" }),
  ).toBeVisible();
  await expectFoldedClusterCentered(parentActions);

  await leafRow.hover();
  for (const label of ["Move or rename", "Delete account"]) {
    const action = leafRow.getByRole("button", { name: label });
    await expect(action).toBeVisible();
    await expect(action).toHaveCSS("opacity", "1");
  }
});

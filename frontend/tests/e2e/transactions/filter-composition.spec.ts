import { test } from "@tests/e2e/test";
import {
  createTag,
  expect,
  pickerSelectedLabel,
  waitForLedgerLookups,
} from "@tests/e2e/transactions/support";

test("filter rows compose all-of and none-of chips and survive navigation", async ({
  page,
}, testInfo) => {
  const unique = `${testInfo.project.name.replace(/[^A-Za-z0-9]+/g, "")}${Date.now()}`;
  const [allA, allB, onlyC] = await Promise.all([
    createTag(page, `E2E:FilterComposition:${unique}:AllA`),
    createTag(page, `E2E:FilterComposition:${unique}:AllB`),
    createTag(page, `E2E:FilterComposition:${unique}:OnlyC`),
  ]);

  const lookups = waitForLedgerLookups(page);
  await page.goto("/transactions?page=1&pageSize=50");
  await lookups;
  await page.getByRole("button", { name: "Open filters" }).click();
  const addFilterBox = await page
    .getByRole("button", { name: "Add filter" })
    .boundingBox();
  const addOrRow = page.getByRole("button", { name: "Add OR row" });
  const addRowBox = await addOrRow.boundingBox();
  expect(addFilterBox).not.toBeNull();
  expect(addRowBox).not.toBeNull();
  await expect(addOrRow.locator("svg")).toHaveCSS("width", "16px");
  await expect(addOrRow).toHaveAttribute("data-variant", "outline");
  await expect(addOrRow).toHaveText(/Add OR row/);
  expect(addFilterBox!.y + addFilterBox!.height / 2).toBe(
    addRowBox!.y + addRowBox!.height / 2,
  );
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  await page.getByLabel("Filter operator").click();
  await page.getByRole("option", { name: "All of" }).click();
  const tags = page.getByRole("combobox", { name: "Tags" });
  await tags.fill(allA.fqn);
  await expect(
    page
      .getByRole("button", { name: `Remove ${pickerSelectedLabel(allA)}` })
      .last(),
  ).toBeVisible();
  await tags.fill(allB.fqn);
  await expect(
    page
      .getByRole("button", { name: `Remove ${pickerSelectedLabel(allB)}` })
      .last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Add OR row" }).click();
  await expect(page.getByRole("separator", { name: "OR" })).toBeVisible();
  await expect(
    page.getByRole("separator", { name: "OR" }).getByText("OR"),
  ).toHaveCSS("color", "rgb(15, 13, 22)");
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  await tags.fill(onlyC.fqn);
  await expect(
    page
      .getByRole("button", { name: `Remove ${pickerSelectedLabel(onlyC)}` })
      .last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { exact: true, name: "Tag" }).click();
  await page.getByLabel("Filter operator").click();
  await page.getByRole("option", { name: "None of" }).click();
  await tags.click();
  await tags.fill(allA.fqn);
  await expect(
    page
      .getByRole("button", { name: `Remove ${pickerSelectedLabel(allA)}` })
      .last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.keyboard.press("Escape");

  await page
    .getByRole("button", { exact: true, name: "Add filter to row 2" })
    .click();
  await page
    .getByRole("button", { exact: true, name: "Transaction class" })
    .click();
  await page.getByRole("checkbox", { name: "Spend" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.keyboard.press("Escape");

  const expression = `((tag:"${allA.fqn}" and tag:"${allB.fqn}") or (tag:"${onlyC.fqn}" and not tag:"${allA.fqn}" and class:spend))`;
  await expect
    .poll(() => new URL(page.url()).searchParams.get("filter"))
    .toBe(expression);
  await expect(
    page.getByText(
      `Tag ${pickerSelectedLabel(allA)}, ${pickerSelectedLabel(allB)} · all of`,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(`Tag ${pickerSelectedLabel(allA)} · none of`),
  ).toBeVisible();
  await expect(
    page.getByText(/Transaction class Spend · any of/),
  ).toBeVisible();
  await expect(
    page.getByTestId("transaction-filter-row-2").getByText("AND").first(),
  ).toHaveCSS("font-size", "12px");

  const reloadLookups = waitForLedgerLookups(page);
  await page.reload();
  await reloadLookups;
  await expect(page.getByTestId("transaction-filter-row-2")).toBeVisible();
  await expect(
    page.getByTestId("transaction-filter-row-2").getByText("Row 2"),
  ).toHaveCSS("color", "rgb(15, 13, 22)");
  await expect(
    page.getByText(
      `Tag ${pickerSelectedLabel(allA)}, ${pickerSelectedLabel(allB)} · all of`,
    ),
  ).toBeVisible();
  const removeRow = page.getByRole("button", { name: "Remove row 2" });
  await expect(removeRow).toHaveText("Remove row");
  await removeRow.click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("filter"))
    .not.toBe(expression);
  await expect(
    page.getByRole("button", { exact: true, name: "Add filter" }),
  ).toBeFocused();
  await page.goBack();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("filter"))
    .toBe(expression);
  await expect(page.getByTestId("transaction-filter-row-2")).toBeVisible();

  await page
    .getByRole("button", {
      name: `Edit Tag ${pickerSelectedLabel(allA)}, ${pickerSelectedLabel(allB)} · all of`,
    })
    .click();
  await page.getByLabel("Filter operator").click();
  await page.getByRole("option", { name: "None of" }).click();
  await expect(
    page.getByRole("button", {
      name: `Edit Tag ${pickerSelectedLabel(allA)}, ${pickerSelectedLabel(allB)} · all of`,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: `Edit Tag ${pickerSelectedLabel(allA)}, ${pickerSelectedLabel(allB)} · none of`,
    }),
  ).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("filter"))
    .toContain(`not (tag:"${allA.fqn}" or tag:"${allB.fqn}")`);
});

test("many OR rows scroll without collapsing the transaction browser", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 720 });
  const expression = `(${Array.from({ length: 10 }, () => "(currency:USD)").join(" or ")})`;
  await page.goto(
    `/transactions?page=1&pageSize=50&filter=${encodeURIComponent(expression)}`,
  );

  const filterBar = page.getByTestId("transaction-browser-filter-bar");
  const browserLayout = page.getByTestId("transaction-browser-layout");
  await expect(page.getByTestId("transaction-filter-row-10")).toBeVisible();
  await expect(browserLayout).toBeVisible();
  const filterOverflow = await filterBar.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  const browserBox = await browserLayout.boundingBox();
  expect(filterOverflow.scrollHeight).toBeGreaterThan(
    filterOverflow.clientHeight,
  );
  expect(browserBox).not.toBeNull();
  expect(browserBox!.height).toBeGreaterThan(filterOverflow.clientHeight);
});

test("non-renderable deep links remain exact in the advanced filter state", async ({
  page,
}) => {
  const expression = "amount > -5";
  const source = `  ${expression} \t\n`;
  const lookups = waitForLedgerLookups(page);
  const filteredRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/transactions" &&
      url.searchParams.get("filter") === source
    );
  });
  await page.goto(
    `/transactions?page=1&pageSize=50&filter=${encodeURIComponent(source)}`,
  );
  await filteredRequest;
  await lookups;

  const advanced = page.getByTestId("transaction-filter-advanced");
  await expect(advanced).toBeVisible();
  await expect(advanced.getByText("Advanced filter")).toBeVisible();
  await expect(advanced.getByText("Advanced filter")).toHaveCSS(
    "color",
    "rgb(15, 13, 22)",
  );
  await expect(advanced.locator("code")).toHaveText(source);
  await expect(advanced.locator("code")).toHaveCSS("white-space", "pre-wrap");
  expect(new URL(page.url()).searchParams.get("filter")).toBe(source);
  await expect(advanced.locator("code")).toHaveCSS("color", "rgb(15, 13, 22)");
  await expect(
    advanced.getByRole("button", { name: "Clear" }).locator("svg"),
  ).toHaveCSS("width", "16px");

  const reloadLookups = waitForLedgerLookups(page);
  await page.reload();
  await reloadLookups;
  await expect(advanced.locator("code")).toHaveText(source);
  await advanced.getByRole("button", { name: "Clear" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("filter"))
    .toBeNull();
  await expect(advanced).toBeHidden();
  await expect(page.getByRole("button", { name: "Add filter" })).toBeFocused();
});

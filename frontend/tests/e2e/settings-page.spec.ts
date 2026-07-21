import { expect, type Route } from "@playwright/test";
import { test } from "@tests/e2e/test";

import type { SettingsResponse } from "@/api";

const settingsFixture: SettingsResponse = {
  config_file_path: "/fixture/mina/config.toml",
  groups: [
    {
      fields: [
        {
          control: "text",
          help: "Runtime hostname supplied by backend configuration.",
          label: "Fixture path",
          order: 10,
          setting_key: "fixture.path",
          source: "cli_override",
          value: "/fixture/mina/data.duckdb",
        },
        {
          control: "integer",
          help: "Integer help supplied by the backend.",
          label: "Fixture count",
          order: 20,
          setting_key: "fixture.count",
          source: "config_file",
          value: "7",
        },
        {
          control: "boolean",
          help: "Boolean help supplied by the backend.",
          label: "Fixture switch",
          order: 30,
          setting_key: "fixture.enabled",
          source: "environment",
          value: "true",
        },
        {
          control: "select",
          help: "Select help supplied by the backend.",
          label: "Fixture mode",
          order: 40,
          setting_key: "fixture.mode",
          source: "default",
          value: "shallow",
        },
        {
          control: "text",
          help: "Empty values remain canonical strings.",
          label: "Empty fixture value",
          order: 50,
          setting_key: "fixture.empty",
          source: "default",
          value: "",
        },
      ],
      group_key: "fixture_group",
      label: "Backend fixture group",
      order: 10,
    },
  ],
};

const fulfillJson = async (route: Route, body: unknown, status = 200) => {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
};

test("settings navigation renders the immutable backend snapshot", async ({
  page,
}) => {
  await page.route("**/api/settings", async (route) => {
    await fulfillJson(route, settingsFixture);
  });

  await page.goto("/overview");
  const settingsLink = page
    .getByLabel("Primary")
    .getByRole("link", { name: "Settings" });
  await settingsLink.focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeFocused();
  await expect(page.getByText("/fixture/mina/config.toml")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Backend fixture group" }),
  ).toBeVisible();

  const text = page.getByTestId("setting-fixture.path");
  await expect(text).toContainText(
    "Runtime hostname supplied by backend configuration.",
  );
  await expect(text).toContainText("/fixture/mina/data.duckdb");
  const cliOverride = text.getByLabel("CLI override");
  await expect(cliOverride).toBeVisible();
  await expect(text.getByLabel("Non-default value")).toBeVisible();
  await cliOverride.hover();
  await expect(page.getByRole("tooltip")).toHaveText("CLI override");
  const integer = page.getByTestId("setting-fixture.count");
  await expect(integer).toContainText("7");
  await expect(integer.getByLabel("Non-default value")).toBeVisible();
  await expect(integer.getByLabel(/override/i)).toHaveCount(0);
  const boolean = page.getByTestId("setting-fixture.enabled");
  await expect(boolean).toContainText("Enabled");
  await expect(
    boolean.getByLabel("Environment variable override"),
  ).toBeVisible();
  await expect(boolean.getByLabel("Non-default value")).toBeVisible();
  const select = page.getByTestId("setting-fixture.mode");
  await expect(select).toContainText("shallow");
  await expect(select.locator("dt [aria-label]")).toHaveCount(0);
  const emptyValue = page
    .getByTestId("setting-fixture.empty")
    .locator("dd > div")
    .first();
  await expect(emptyValue).toHaveText("");
  await expect(
    page.locator("[data-testid^='setting-'] [data-slot='badge']"),
  ).toHaveCount(0);

  await expect(page.getByRole("button", { name: /Save/ })).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("settings metadata remains readable at the narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route("**/api/settings", async (route) => {
    await fulfillJson(route, settingsFixture);
  });

  await page.goto("/settings");
  const row = page.getByTestId("setting-fixture.path");
  await expect(row).toContainText(
    "Runtime hostname supplied by backend configuration.",
  );
  await expect(row.getByLabel("CLI override")).toBeVisible();
  await expect(row.getByLabel("Non-default value")).toBeVisible();

  const geometry = await row.evaluate((element) => {
    const card = element.closest<HTMLElement>("[data-slot='card']");
    const help = element.querySelector<HTMLElement>("dt p:last-child");
    const indicators = Array.from(
      element.querySelectorAll<HTMLElement>("dt [aria-label]"),
    );
    if (!card || !help || indicators.length === 0) {
      throw new Error("settings metadata geometry targets missing");
    }
    const cardRect = card.getBoundingClientRect();
    return {
      cardOverflow: card.scrollWidth - card.clientWidth,
      helpOverflow: help.scrollWidth - help.clientWidth,
      indicatorsFitCard: indicators.every((indicator) => {
        const indicatorRect = indicator.getBoundingClientRect();
        return (
          indicatorRect.left >= cardRect.left - 1 &&
          indicatorRect.right <= cardRect.right + 1
        );
      }),
    };
  });

  expect(geometry).toEqual({
    cardOverflow: 0,
    helpOverflow: 0,
    indicatorsFitCard: true,
  });
});

test("settings load failure retries without losing the page", async ({
  page,
}) => {
  let requests = 0;
  let releaseRetry: (() => void) | undefined;
  const retryReleased = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  await page.route("**/api/settings", async (route) => {
    requests += 1;
    if (requests <= 2) {
      if (requests === 2) {
        await retryReleased;
      }
      await fulfillJson(
        route,
        { error: { code: "internal_error", message: "fixture unavailable" } },
        500,
      );
      return;
    }
    await fulfillJson(route, settingsFixture);
  });

  await page.goto("/settings");
  await expect(page.getByText("Settings could not be loaded.")).toBeVisible();
  await page.getByText("API error").click();
  await expect(page.getByText("internal_error")).toBeVisible();
  await expect(page.getByText("fixture unavailable")).toBeVisible();
  const retry = page.getByRole("button", { name: "Retry" });
  await retry.focus();
  await page.keyboard.press("Enter");

  await expect.poll(() => requests).toBe(2);
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeFocused();
  await page.keyboard.press("Control+KeyK");
  const paletteSearch = page.getByRole("combobox", {
    name: "Command search",
  });
  await expect(paletteSearch).toBeFocused();
  releaseRetry?.();
  await expect(page.getByText("Settings could not be loaded.")).toBeVisible();
  await expect(paletteSearch).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");

  const loadedGroup = page.getByRole("heading", {
    level: 2,
    name: "Backend fixture group",
  });
  await expect(loadedGroup).toBeVisible();
  await expect(loadedGroup).toBeFocused();
  expect(requests).toBe(3);
  await expect(page.getByText("Settings could not be loaded.")).toHaveCount(0);
});

import { expect, type Page } from "@playwright/test";

export const expectNoDocumentVerticalOverflow = async (
  page: Page,
): Promise<void> => {
  const dimensions = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(
    dimensions.clientHeight + 1,
  );
};

export const expectNoDocumentHorizontalOverflow = async (
  page: Page,
): Promise<void> => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
};

import { expect, type Locator, type Page } from "@playwright/test";

type SearchDebounceCaptureWindow = typeof window & {
  __minaSearchDebounceCapture?: {
    readonly originalSetTimeout: typeof window.setTimeout;
    readonly timers: {
      readonly run: () => void;
      readonly timer: number;
    }[];
  };
};

export const captureSearchDebounce = async (
  page: Page,
  searchInput: Locator,
  search: string,
): Promise<void> => {
  await page.evaluate(() => {
    const testWindow = window as SearchDebounceCaptureWindow;
    if (testWindow.__minaSearchDebounceCapture) {
      throw new Error("search debounce capture is already installed");
    }

    const originalSetTimeout = window.setTimeout;
    const timers: {
      readonly run: () => void;
      readonly timer: number;
    }[] = [];
    testWindow.__minaSearchDebounceCapture = {
      originalSetTimeout,
      timers,
    };
    window.setTimeout = ((
      ...args: Parameters<typeof window.setTimeout>
    ): number => {
      const [handler, timeout] = args;
      const timer = originalSetTimeout(...args);
      // Coupled to the 300 ms debounce in transaction-search-input.tsx.
      if (timeout === 300 && typeof handler === "function") {
        timers.push({
          run: () => {
            handler();
          },
          timer,
        });
      }
      return timer;
    }) as typeof window.setTimeout;
  });

  let fillError: unknown;
  try {
    await searchInput.fill(search);
  } catch (error: unknown) {
    fillError = error;
  }
  const captureResult = await page.evaluate(() => {
    const testWindow = window as SearchDebounceCaptureWindow;
    const capture = testWindow.__minaSearchDebounceCapture;
    if (!capture) {
      return { count: -1 };
    }

    window.setTimeout = capture.originalSetTimeout;
    if (capture.timers.length !== 1) {
      for (const captured of capture.timers) {
        window.clearTimeout(captured.timer);
      }
      delete testWindow.__minaSearchDebounceCapture;
    }
    return { count: capture.timers.length };
  });

  if (fillError !== undefined) {
    throw fillError instanceof Error
      ? fillError
      : new Error("failed to fill search while capturing its debounce", {
          cause: fillError,
        });
  }
  if (captureResult.count !== 1) {
    throw new Error(
      captureResult.count < 0
        ? "search debounce capture disappeared before restoration"
        : `expected exactly one TransactionSearchInput 300ms debounce timer, captured ${captureResult.count}; a non-search timer may have matched or the debounce duration changed`,
    );
  }
};

export const runCapturedSearchDebounce = async (
  page: Page,
  expectedSearch: string,
): Promise<void> => {
  await page.evaluate(() => {
    const testWindow = window as SearchDebounceCaptureWindow;
    const capture = testWindow.__minaSearchDebounceCapture;
    delete testWindow.__minaSearchDebounceCapture;
    const captured = capture?.timers[0];
    if (!captured) {
      throw new Error("search debounce callback was not captured");
    }

    window.clearTimeout(captured.timer);
    captured.run();
  });

  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"), {
      message:
        "captured 300ms timer did not commit the expected search; the capture may have matched a non-search timer",
    })
    .toBe(expectedSearch);
};

import type { FullConfig } from "@playwright/test";
import { createE2EInvocation } from "@tests/e2e/backend-lifecycle";

const globalSetup = async (
  _config: FullConfig,
): Promise<() => Promise<void>> => {
  const setupPromise = createE2EInvocation();
  const existingSIGINTHandlers = process.listeners("SIGINT");
  process.removeAllListeners("SIGINT");

  const cleanup = async (): Promise<void> => {
    const invocationCleanup = await setupPromise;
    await invocationCleanup();
  };
  let interrupted = false;
  const handleSIGINT = (): void => {
    interrupted = true;
    void cleanup()
      .catch((error: unknown) => {
        console.error(`frontend e2e SIGINT cleanup failed: ${String(error)}`);
      })
      .finally(() => {
        process.exit(128 + 2);
      });
  };
  const restoreSIGINTHandlers = (): void => {
    process.off("SIGINT", handleSIGINT);
    for (const handler of existingSIGINTHandlers) {
      process.on("SIGINT", handler);
    }
  };
  const handleSIGTERM = (): void => {
    void cleanup()
      .catch((error: unknown) => {
        console.error(`frontend e2e SIGTERM cleanup failed: ${String(error)}`);
      })
      .finally(() => {
        process.exit(128 + 15);
      });
  };
  process.once("SIGINT", handleSIGINT);
  process.once("SIGTERM", handleSIGTERM);

  try {
    await setupPromise;
  } catch (error) {
    if (!interrupted) {
      restoreSIGINTHandlers();
    }
    process.off("SIGTERM", handleSIGTERM);
    throw error;
  }

  if (!interrupted) {
    restoreSIGINTHandlers();
  }
  return async () => {
    try {
      await cleanup();
    } finally {
      process.off("SIGTERM", handleSIGTERM);
    }
  };
};

export default globalSetup;

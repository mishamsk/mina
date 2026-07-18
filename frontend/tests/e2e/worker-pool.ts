import process from "node:process";

const defaultWorkerCount = 4;
const workerSetting = "MINA_FRONTEND_E2E_WORKERS";

const getConfiguredWorkerCount = (): number => {
  const rawValue = process.env[workerSetting];
  if (rawValue === undefined) {
    return defaultWorkerCount;
  }

  const workerCount = Number(rawValue);
  if (!Number.isSafeInteger(workerCount) || workerCount <= 0) {
    throw new Error(
      `${workerSetting} must be a positive integer; received ${JSON.stringify(rawValue)}`,
    );
  }

  return workerCount;
};

export { getConfiguredWorkerCount, workerSetting };

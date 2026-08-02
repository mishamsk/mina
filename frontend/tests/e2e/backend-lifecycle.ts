import { type ChildProcessByStdio, execFile, spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const invocationRootEnvironment = "MINA_FRONTEND_E2E_INVOCATION_TEMP_DIRECTORY";
const lifecyclePathLogEnvironment = "MINA_FRONTEND_E2E_PATH_LOG";
const templateDatabaseEnvironment = "MINA_FRONTEND_E2E_TEMPLATE_DATABASE";

const demoAnchorDate = "2026-05-31";
const healthTimeoutMilliseconds = 30_000;
const gracefulStopMilliseconds = 5_000;
const forcedStopMilliseconds = 2_000;
const ownershipRegistrationMilliseconds = 2_000;
const outputLimit = 32 * 1024;
const minaBinary = fileURLToPath(new URL("../../../bin/mina", import.meta.url));
const invocationActiveFilename = "active";
const invocationCleanupFilename = "cleanup-started";
const processRecordFilename = "mina-process.json";
const processStartingFilename = "mina-process-starting.json";

type ProcessExit = {
  readonly code: number | null;
  readonly error?: Error;
  readonly signal: NodeJS.Signals | null;
};

type ProcessRecord = {
  readonly backupDirectory: string;
  readonly binary: string;
  readonly database: string;
  readonly pid: number;
  readonly stderrLog: string;
  readonly stdoutLog: string;
};

type OwnedMinaProcess = {
  readonly child: ChildProcessByStdio<null, Readable, Readable>;
  readonly command: readonly string[];
  readonly exit: Promise<ProcessExit>;
  readonly recordPath: string;
  readonly stderr: BoundedOutput;
  readonly stdout: BoundedOutput;
};

type StartedMinaProcess = OwnedMinaProcess & {
  readonly baseURL: string;
};

type TestBackend = {
  readonly authentication?: {
    readonly email: string;
    readonly password: string;
  };
  readonly baseURL: string;
  cleanup(): Promise<void>;
};

type TestBackendOptions = {
  readonly authentication?: boolean;
};

const testAuthentication = {
  email: "@",
  password: "mina-e2e-password",
} as const;

class BoundedOutput {
  readonly #limit: number;
  #text = "";
  #truncated = false;

  constructor(limit: number) {
    this.#limit = limit;
  }

  append(chunk: string): void {
    this.#text += chunk;
    if (this.#text.length <= this.#limit) {
      return;
    }

    this.#text = this.#text.slice(-this.#limit);
    this.#truncated = true;
  }

  toString(): string {
    if (this.#text.length === 0) {
      return "<empty>";
    }
    return this.#truncated
      ? `[earlier output truncated]\n${this.#text}`
      : this.#text;
  }
}

const delay = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolveDelay) => {
    const timer = setTimeout(resolveDelay, milliseconds);
    timer.unref();
  });
};

const appendLifecyclePath = (kind: string, path: string): void => {
  const pathLog = process.env[lifecyclePathLogEnvironment];
  if (pathLog === undefined) {
    return;
  }

  appendFileSync(pathLog, `${JSON.stringify({ kind, path })}\n`, {
    encoding: "utf8",
    flag: "a",
  });
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "<unprintable error>";
  }
};

const isWithin = (parent: string, child: string): boolean => {
  const childRelative = relative(resolve(parent), resolve(child));
  return (
    childRelative !== "" &&
    childRelative !== ".." &&
    !childRelative.startsWith(`..${sep}`)
  );
};

const requiredOwnedPath = (
  environmentName: string,
  invocationRoot?: string,
): string => {
  const path = process.env[environmentName];
  if (path === undefined) {
    throw new Error(`missing frontend e2e lifecycle path: ${environmentName}`);
  }
  if (invocationRoot !== undefined && !isWithin(invocationRoot, path)) {
    throw new Error(
      `${environmentName} is outside the invocation temp directory`,
    );
  }
  return path;
};

const formatProcessOutput = (owned: OwnedMinaProcess): string =>
  [
    `command: ${owned.command.join(" ")}`,
    `stdout:\n${owned.stdout.toString()}`,
    `stderr:\n${owned.stderr.toString()}`,
  ].join("\n");

const formatRecordedOutput = async (record: ProcessRecord): Promise<string> => {
  const readTail = async (path: string): Promise<string> => {
    try {
      const contents = await readFile(path, "utf8");
      return contents.length > outputLimit
        ? `[earlier output truncated]\n${contents.slice(-outputLimit)}`
        : contents || "<empty>";
    } catch {
      return "<unavailable>";
    }
  };

  const [stdout, stderr] = await Promise.all([
    readTail(record.stdoutLog),
    readTail(record.stderrLog),
  ]);
  return [
    `pid: ${record.pid}`,
    `database: ${record.database}`,
    `stdout:\n${stdout}`,
    `stderr:\n${stderr}`,
  ].join("\n");
};

const signalProcessGroup = (pid: number, signal: NodeJS.Signals): boolean => {
  try {
    process.kill(process.platform === "win32" ? pid : -pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      return false;
    }
    throw error;
  }
};

const resolvesWithin = async <T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<boolean> =>
  await Promise.race([
    promise.then(() => true),
    delay(milliseconds).then(() => false),
  ]);

const stopOwnedProcess = async (owned: OwnedMinaProcess): Promise<void> => {
  const pid = owned.child.pid;
  if (pid === undefined || (await resolvesWithin(owned.exit, 0))) {
    await unlink(owned.recordPath).catch(() => undefined);
    return;
  }

  signalProcessGroup(pid, "SIGTERM");
  if (!(await resolvesWithin(owned.exit, gracefulStopMilliseconds))) {
    signalProcessGroup(pid, "SIGKILL");
    if (!(await resolvesWithin(owned.exit, forcedStopMilliseconds))) {
      throw new Error(
        `Mina process ${pid} did not exit after SIGKILL\n${formatProcessOutput(owned)}`,
      );
    }
  }

  await unlink(owned.recordPath).catch(() => undefined);
};

const startMina = async ({
  args,
  backupDirectory,
  database,
  environment,
  invocationRoot,
  ownerDirectory,
}: {
  readonly args: readonly string[];
  readonly backupDirectory: string;
  readonly database: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly invocationRoot: string;
  readonly ownerDirectory: string;
}): Promise<StartedMinaProcess> => {
  const stdout = new BoundedOutput(outputLimit);
  const stderr = new BoundedOutput(outputLimit);
  const stdoutLog = join(ownerDirectory, "mina.stdout.log");
  const stderrLog = join(ownerDirectory, "mina.stderr.log");
  const recordPath = join(ownerDirectory, processRecordFilename);
  const startingPath = join(ownerDirectory, processStartingFilename);
  const command = [minaBinary, ...args];
  await writeFile(
    startingPath,
    `${JSON.stringify({
      backupDirectory,
      binary: minaBinary,
      database,
      pid: null,
      stderrLog,
      stdoutLog,
    })}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  try {
    await access(join(invocationRoot, invocationActiveFilename));
  } catch (error) {
    await unlink(startingPath).catch(() => undefined);
    throw new Error("frontend e2e invocation cleanup has started", {
      cause: error,
    });
  }
  const child = spawn(minaBinary, args, {
    cwd: resolve(dirname(minaBinary), ".."),
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      MINA_BACKUP_FILE_DIRECTORY: backupDirectory,
      MINA_FX_AUTO_LOAD_ENABLED: "false",
      ...environment,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout.append(chunk);
    appendFileSync(stdoutLog, chunk, { encoding: "utf8", flag: "a" });
  });
  child.stderr.on("data", (chunk: string) => {
    stderr.append(chunk);
    appendFileSync(stderrLog, chunk, { encoding: "utf8", flag: "a" });
  });

  let exitResult: ProcessExit | undefined;
  const exit = new Promise<ProcessExit>((resolveExit) => {
    child.once("error", (error) => {
      exitResult = { code: null, error, signal: null };
      resolveExit(exitResult);
    });
    child.once("exit", (code, signal) => {
      exitResult = { code, signal };
      resolveExit(exitResult);
    });
  });
  const owned: OwnedMinaProcess = {
    child,
    command,
    exit,
    recordPath,
    stderr,
    stdout,
  };

  try {
    if (child.pid === undefined) {
      const result = await exit;
      throw new Error(
        `failed to spawn Mina: ${result.error?.message ?? "missing process id"}`,
      );
    }

    const record: ProcessRecord = {
      backupDirectory,
      binary: minaBinary,
      database,
      pid: child.pid,
      stderrLog,
      stdoutLog,
    };
    writeFileSync(startingPath, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(startingPath, recordPath);

    const deadline = Date.now() + healthTimeoutMilliseconds;
    let baseURL: string | undefined;
    let healthError: unknown;
    while (Date.now() < deadline) {
      if (exitResult !== undefined) {
        throw new Error(
          `Mina exited before readiness (code ${String(exitResult.code)}, signal ${String(exitResult.signal)}): ${exitResult.error?.message ?? "no spawn error"}`,
        );
      }

      const listening = stdout
        .toString()
        .match(/listening (http:\/\/127\.0\.0\.1:\d+)/);
      baseURL = listening?.[1];
      if (baseURL !== undefined) {
        try {
          const response = await fetch(new URL("/api/health", baseURL), {
            signal: AbortSignal.timeout(1_000),
          });
          if (response.ok) {
            return { ...owned, baseURL };
          }
          healthError = new Error(
            `health returned HTTP ${response.status} ${response.statusText}`,
          );
        } catch (error) {
          healthError = error;
        }
      }

      await delay(25);
    }

    throw new Error(
      baseURL === undefined
        ? `Mina did not report a listener within ${healthTimeoutMilliseconds}ms`
        : `Mina health did not succeed within ${healthTimeoutMilliseconds}ms: ${String(healthError)}`,
    );
  } catch (error) {
    let cleanupError: unknown;
    try {
      await stopOwnedProcess(owned);
    } catch (stopError) {
      cleanupError = stopError;
    }
    throw new Error(
      [
        `frontend e2e Mina startup failed: ${errorMessage(error)}`,
        cleanupError === undefined
          ? undefined
          : `startup cleanup failed: ${errorMessage(cleanupError)}`,
        formatProcessOutput(owned),
      ]
        .filter((part) => part !== undefined)
        .join("\n"),
      { cause: error },
    );
  } finally {
    await unlink(startingPath).catch(() => undefined);
  }
};

const initializeAuthentication = async (
  configFile: string,
  testDirectory: string,
): Promise<void> => {
  const output = new BoundedOutput(outputLimit);
  const args = [
    "--config-file",
    configFile,
    "auth",
    "init",
    testAuthentication.email,
  ];
  const child = spawn(minaBinary, args, {
    cwd: resolve(dirname(minaBinary), ".."),
    env: process.env,
    stdio: ["pipe", "ignore", "pipe"],
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    output.append(chunk);
  });
  child.stdin.end(
    `${testAuthentication.password}\n${testAuthentication.password}\n`,
  );
  const result = await new Promise<ProcessExit>((resolveExit) => {
    child.once("error", (error) => {
      resolveExit({ code: null, error, signal: null });
    });
    child.once("exit", (code, signal) => {
      resolveExit({ code, signal });
    });
  });
  if (result.code !== 0) {
    throw new Error(
      `frontend e2e authentication setup failed (code ${String(result.code)}, signal ${String(result.signal)}): ${result.error?.message ?? output.toString()}`,
    );
  }
  await chmod(testDirectory, 0o700);
};

const processCommand = async (pid: number): Promise<string | undefined> => {
  try {
    const { stdout } = await execFileAsync("ps", [
      "-ww",
      "-p",
      String(pid),
      "-o",
      "command=",
    ]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
};

const recordedProcessIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      return false;
    }
    throw error;
  }
};

const waitForRecordedExit = async (
  pid: number,
  milliseconds: number,
): Promise<boolean> => {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (!recordedProcessIsAlive(pid)) {
      return true;
    }
    await delay(25);
  }
  return !recordedProcessIsAlive(pid);
};

const stopRecordedProcess = async (record: ProcessRecord): Promise<void> => {
  if (!recordedProcessIsAlive(record.pid)) {
    return;
  }

  const command = await processCommand(record.pid);
  if (
    command === undefined ||
    !command.includes(record.database) ||
    !command.includes(basename(record.binary))
  ) {
    throw new Error(
      `refusing to stop pid ${record.pid}: command does not match owned Mina database ${record.database}`,
    );
  }

  signalProcessGroup(record.pid, "SIGTERM");
  if (
    !(await waitForRecordedExit(record.pid, gracefulStopMilliseconds)) &&
    signalProcessGroup(record.pid, "SIGKILL") &&
    !(await waitForRecordedExit(record.pid, forcedStopMilliseconds))
  ) {
    throw new Error(`owned Mina pid ${record.pid} survived SIGKILL`);
  }
};

const readProcessRecord = async (
  recordPath: string,
): Promise<ProcessRecord | undefined> => {
  try {
    return JSON.parse(await readFile(recordPath, "utf8")) as ProcessRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw new Error(`read Mina ownership record ${recordPath}`, {
      cause: error,
    });
  }
};

const readOwnerProcessRecord = async (
  ownerDirectory: string,
): Promise<ProcessRecord | undefined> => {
  const recordPath = join(ownerDirectory, processRecordFilename);
  const startingPath = join(ownerDirectory, processStartingFilename);
  const deadline = Date.now() + ownershipRegistrationMilliseconds;

  while (true) {
    for (const path of [recordPath, startingPath]) {
      try {
        const record = await readProcessRecord(path);
        if (
          record !== undefined &&
          typeof record.pid === "number" &&
          record.pid > 0
        ) {
          return record;
        }
      } catch (error) {
        if (Date.now() >= deadline) {
          throw error;
        }
      }
    }

    try {
      await access(startingPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Mina ownership record did not settle for ${ownerDirectory}`,
      );
    }
    await delay(25);
  }
};

const cleanupInvocationRoot = async (root: string): Promise<void> => {
  try {
    await rename(
      join(root, invocationActiveFilename),
      join(root, invocationCleanupFilename),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const ownerDirectories = [join(root, "template")];
  try {
    const entries = await readdir(join(root, "tests"), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        ownerDirectories.push(join(root, "tests", entry.name));
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const cleanupErrors: string[] = [];
  const records = (
    await Promise.all(
      ownerDirectories.map(async (ownerDirectory) => {
        try {
          return await readOwnerProcessRecord(ownerDirectory);
        } catch (error) {
          cleanupErrors.push(
            `resolve Mina ownership for ${ownerDirectory}: ${String(error)}`,
          );
          return undefined;
        }
      }),
    )
  ).filter((record): record is ProcessRecord => record !== undefined);
  await Promise.all(
    records.map(async (record) => {
      try {
        await stopRecordedProcess(record);
      } catch (error) {
        cleanupErrors.push(
          `${String(error)}\n${await formatRecordedOutput(record)}`,
        );
      }
    }),
  );

  if (cleanupErrors.length === 0) {
    await chmod(join(root, "template", "mina-template.db"), 0o600).catch(
      () => undefined,
    );
    try {
      await rm(root, { force: true, recursive: true });
    } catch (error) {
      cleanupErrors.push(
        `remove invocation temp directory ${root}: ${String(error)}`,
      );
    }
  }
  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join("\n"));
  }
};

const createE2EInvocation = async (): Promise<() => Promise<void>> => {
  const root = await mkdtemp(join(tmpdir(), "mina-frontend-e2e-"));

  let cleanupPromise: Promise<void> | undefined;
  const cleanup = async (): Promise<void> => {
    cleanupPromise ??= cleanupInvocationRoot(root);
    await cleanupPromise;
  };

  try {
    appendLifecyclePath("invocation", root);
    await writeFile(join(root, invocationActiveFilename), "", {
      encoding: "utf8",
      mode: 0o600,
    });
    process.env[invocationRootEnvironment] = root;

    const templateDirectory = join(root, "template");
    const templateDatabase = join(templateDirectory, "mina-template.db");
    const backupDirectory = join(templateDirectory, "backups");
    await mkdir(join(root, "tests"));
    await mkdir(backupDirectory, { recursive: true });
    appendLifecyclePath("template-database", templateDatabase);
    appendLifecyclePath("template-backups", backupDirectory);

    const seedProcess = await startMina({
      args: [
        "serve",
        "--db",
        templateDatabase,
        "--yes",
        "--host",
        "127.0.0.1",
        "--port",
        "0",
        "--quiet",
        "--demo",
        "--demo-anchor-date",
        demoAnchorDate,
        "--demo-max-months",
        "2",
      ],
      backupDirectory,
      database: templateDatabase,
      invocationRoot: root,
      ownerDirectory: templateDirectory,
    });
    await stopOwnedProcess(seedProcess);
    await rm(backupDirectory, { force: true, recursive: true });
    await rm(join(templateDirectory, "mina.stdout.log"), { force: true });
    await rm(join(templateDirectory, "mina.stderr.log"), { force: true });

    const templateWAL = `${templateDatabase}.wal`;
    const templateWALStats = await stat(templateWAL).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    });
    if (templateWALStats !== undefined) {
      throw new Error(
        `frontend e2e demo template shutdown left a ${templateWALStats.size}-byte WAL`,
      );
    }

    const templateStats = await stat(templateDatabase);
    if (!templateStats.isFile() || templateStats.size === 0) {
      throw new Error("frontend e2e demo template was not created");
    }
    await chmod(templateDatabase, 0o400);
    process.env[templateDatabaseEnvironment] = templateDatabase;

    return cleanup;
  } catch (error) {
    let cleanupError: unknown;
    try {
      await cleanup();
    } catch (caughtCleanupError) {
      cleanupError = caughtCleanupError;
    }
    if (cleanupError !== undefined) {
      throw new Error(
        `frontend e2e suite setup failed: ${errorMessage(error)}\nsuite cleanup failed: ${errorMessage(cleanupError)}`,
        { cause: error },
      );
    }
    throw error;
  }
};

const createTestBackend = async (
  options: TestBackendOptions = {},
): Promise<TestBackend> => {
  const invocationRoot = requiredOwnedPath(invocationRootEnvironment);
  const templateDatabase = requiredOwnedPath(
    templateDatabaseEnvironment,
    invocationRoot,
  );
  try {
    await access(join(invocationRoot, invocationActiveFilename));
  } catch (error) {
    throw new Error("frontend e2e invocation cleanup has started", {
      cause: error,
    });
  }
  const testsDirectory = join(invocationRoot, "tests");
  const testDirectory = await mkdtemp(join(testsDirectory, "test-"));
  const database = join(testDirectory, "mina.db");
  const backupDirectory = join(testDirectory, "backups");
  appendLifecyclePath("test-directory", testDirectory);
  appendLifecyclePath("test-database", database);
  appendLifecyclePath("test-backups", backupDirectory);

  let mina: StartedMinaProcess | undefined;
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = async (): Promise<void> => {
    cleanupPromise ??= (async () => {
      let stopError: unknown;
      if (mina !== undefined) {
        try {
          await stopOwnedProcess(mina);
        } catch (error) {
          stopError = error;
        }
      }
      let removeError: unknown;
      if (stopError === undefined) {
        try {
          await rm(testDirectory, { force: true, recursive: true });
        } catch (error) {
          removeError = error;
        }
      }
      const cleanupErrors = [stopError, removeError].filter(
        (error) => error !== undefined,
      );
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          [
            stopError === undefined
              ? undefined
              : `stop test Mina: ${errorMessage(stopError)}`,
            removeError === undefined
              ? undefined
              : `remove test temp directory: ${errorMessage(removeError)}`,
          ]
            .filter((part) => part !== undefined)
            .join("\n"),
        );
      }
    })();
    await cleanupPromise;
  };

  try {
    await copyFile(templateDatabase, database);
    await chmod(database, 0o600);
    await mkdir(backupDirectory);
    const configFile = join(testDirectory, "config.toml");
    await writeFile(
      configFile,
      options.authentication === true ? 'auth_file = "auth.toml"\n' : "",
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
    if (options.authentication === true) {
      await initializeAuthentication(configFile, testDirectory);
    }
    mina = await startMina({
      args: [
        "--config-file",
        configFile,
        "serve",
        "--db",
        database,
        "--yes",
        "--host",
        "127.0.0.1",
        "--port",
        "0",
        "--quiet",
      ],
      backupDirectory,
      database,
      environment: {
        MINA_STARTUP_VALIDATION: "none",
      },
      invocationRoot,
      ownerDirectory: testDirectory,
    });
    return {
      authentication:
        options.authentication === true ? testAuthentication : undefined,
      baseURL: mina.baseURL,
      cleanup,
    };
  } catch (error) {
    let cleanupError: unknown;
    try {
      await cleanup();
    } catch (caughtCleanupError) {
      cleanupError = caughtCleanupError;
    }
    if (cleanupError !== undefined) {
      throw new Error(
        `frontend e2e test setup failed: ${errorMessage(error)}\ntest cleanup failed: ${errorMessage(cleanupError)}`,
        { cause: error },
      );
    }
    throw error;
  }
};

export { createE2EInvocation, createTestBackend };

import type { ChildProcess } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { dirname } from "node:path";

export const waitForFixtureReady = async ({
  readyPath,
  completion,
  diagnostics,
}: {
  readonly readyPath: string;
  readonly completion: Promise<number | null>;
  readonly diagnostics: () => string;
}) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watcher: ReturnType<typeof watch> | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        const check = () => {
          if (existsSync(readyPath)) resolve();
        };
        watcher = watch(dirname(readyPath), check);
        watcher.on("error", reject);
        check();
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Fixture did not become ready within 2000 ms. ${diagnostics()}`,
              ),
            ),
          2000,
        );
      }),
      completion.then((status) => {
        throw new Error(
          `Fixture exited before readiness (status ${status}). ${diagnostics()}`,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    watcher?.close();
  }
};

export const stopFixture = async (
  child: ChildProcess,
  completion: Promise<number | null>,
) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    await completion;
    return;
  }
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
  try {
    await completion;
  } finally {
    clearTimeout(timer);
  }
};

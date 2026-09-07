import { waitForFixtureReady, stopFixture } from "./process-fixture";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  runBoundedProcess,
  exitedProcessGroupHasNoWriters,
} from "../../packages/studio/src/process/bounded-process";

test("bounded processes terminate hung commands and preserve partial diagnostic output", async () => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-process-"));
  try {
    const logPath = join(root, "process.log");
    await assert.rejects(
      runBoundedProcess(
        process.execPath,
        ["-e", "console.log('started');setInterval(()=>{},1000)"],
        { timeoutMs: 300, logPath },
      ),
      /timed out.*300/u,
    );
    assert.match(await readFile(logPath, "utf8"), /started/u);
    assert.match(await readFile(logPath, "utf8"), /timed out/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bounded process reports a failed exit with its diagnostic output", async () => {
  const result = await runBoundedProcess(process.execPath, [
    "-e",
    "console.error('bad input');process.exit(7)",
  ]);
  assert.equal(result.status, 7);
  assert.match(result.stderr, /bad input/u);
});

test("interruption rejects through finally so callers can release exclusive preparation locks", async () => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-process-signal-"));
  try {
    const { spawn } = await import("node:child_process");
    const source = new URL(
      "../../packages/studio/src/process/bounded-process.ts",
      import.meta.url,
    ).href;
    const ready = join(root, "ready");
    const released = join(root, "released");
    const script = `import {runBoundedProcess} from ${JSON.stringify(source)}; import {writeFileSync} from 'node:fs'; try { await runBoundedProcess(process.execPath,['-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000)`)}]); } catch(e) { process.stderr.write(e.message); } finally { writeFileSync(${JSON.stringify(released)},'released'); }`;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (bytes) => {
      stderr += String(bytes);
    });
    const completion = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    try {
      await waitForFixtureReady({
        readyPath: ready,
        completion,
        diagnostics: () => stderr,
      });
      child.kill("SIGTERM");
      assert.equal(await completion, 0);
      assert.match(stderr, /interrupted by SIGTERM/u);
      assert.equal(await readFile(released, "utf8"), "released");
    } finally {
      await stopFixture(child, completion);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ownership registration failure drains child output before closing its log", async () => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-process-registration-"));
  const logPath = join(root, "process.log");
  try {
    await assert.rejects(
      runBoundedProcess(
        process.execPath,
        [
          "-e",
          "setInterval(()=>process.stdout.write('streaming-output\\n'),1)",
        ],
        { trackOwnership: true, timeoutMs: 2000, logPath },
        {
          registerOwnedProcess: async () => ({
            started: async () => {
              const { watch, existsSync, readFileSync } =
                await import("node:fs");
              await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => {
                  observer.close();
                  reject(new Error("Fixture output absent"));
                }, 2000);
                const observer = watch(logPath, () => {
                  if (
                    existsSync(logPath) &&
                    readFileSync(logPath, "utf8").includes("streaming-output")
                  ) {
                    clearTimeout(timer);
                    observer.close();
                    resolve();
                  }
                });
              });
              throw new Error("Registration write failed");
            },
            spawnFailed: async () => undefined,
          }),
        },
      ),
      /Registration write failed/u,
    );
    assert.match(await readFile(logPath, "utf8"), /streaming-output/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fixture startup failure reports child diagnostics before the readiness timeout", async () => {
  const { spawn } = await import("node:child_process");
  const root = await mkdtemp(join(tmpdir(), "axmorf-fixture-failure-"));
  const child = spawn(
    process.execPath,
    ["-e", "console.error('fixture startup failure');process.exit(9)"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (bytes) => {
    stderr += String(bytes);
  });
  const completion = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  try {
    await assert.rejects(
      waitForFixtureReady({
        readyPath: join(root, "ready"),
        completion,
        diagnostics: () => stderr,
      }),
      /exited before readiness \(status 9\).*fixture startup failure/u,
    );
  } finally {
    await stopFixture(child, completion);
    await rm(root, { recursive: true, force: true });
  }
});

const stopOwnedFixture = (target: number | undefined) => {
  if (target === undefined) return;
  try {
    process.kill(target, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
};

const permissionError = () =>
  Object.assign(new Error("kill EPERM"), { code: "EPERM" });
const missingGroupError = () =>
  Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });

test("an EPERM cleanup race is accepted only after signal zero proves the group disappeared", async () => {
  const calls: Array<string | number> = [];
  const result = await runBoundedProcess(
    process.execPath,
    ["-e", "console.log('rendered')"],
    {},
    {
      registerOwnedProcess: async () => {
        throw new Error("unexpected registration");
      },
      signalProcess: (_pid, signal) => {
        calls.push(signal);
        throw signal === 0 ? missingGroupError() : permissionError();
      },
    },
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /rendered/u);
  assert.deepEqual(calls, ["SIGKILL", 0]);
});

for (const probe of ["active", "denied"] as const) {
  test(`real cleanup EPERM remains a caught failure when signal zero is ${probe}`, async () => {
    const before = [
      process.listenerCount("exit"),
      process.listenerCount("SIGTERM"),
      process.listenerCount("SIGINT"),
    ];
    await assert.rejects(
      runBoundedProcess(
        process.execPath,
        [
          "-e",
          "console.log('original stdout');console.error('original stderr');process.exit(7)",
        ],
        {},
        {
          registerOwnedProcess: async () => {
            throw new Error("unexpected registration");
          },
          exitedGroupHasNoWriters: () => false,
          signalProcess: (_pid, signal) => {
            if (signal === 0 && probe === "active") return true;
            throw permissionError();
          },
        },
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /EPERM/u);
        assert.equal((error as Error & { status: number }).status, 7);
        assert.match(
          (error as Error & { stdout: string }).stdout,
          /original stdout/u,
        );
        assert.match(
          (error as Error & { stderr: string }).stderr,
          /original stderr/u,
        );
        return true;
      },
    );
    assert.deepEqual(
      [
        process.listenerCount("exit"),
        process.listenerCount("SIGTERM"),
        process.listenerCount("SIGINT"),
      ],
      before,
    );
  });
}

test(
  "timeout cleanup permission failure settles with captured output and does not retry a signal",
  { timeout: 5000 },
  async () => {
    let target: number | undefined;
    const signals: Array<NodeJS.Signals | 0> = [];
    try {
      await assert.rejects(
        runBoundedProcess(
          process.execPath,
          ["-e", "console.error('writer started');setInterval(()=>{},1000)"],
          { timeoutMs: 500 },
          {
            signalProcess: (pid, signal) => {
              target = pid;
              signals.push(signal);
              if (signal === 0) return true;
              throw permissionError();
            },
          },
        ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /timed out after 500.*EPERM/u);
          assert.match(
            (error as Error & { stderr: string }).stderr,
            /writer started/u,
          );
          return true;
        },
      );
      assert.deepEqual(signals, ["SIGTERM", 0]);
    } finally {
      // The fixture owns this deliberately unkillable-by-the-adapter child.
      stopOwnedFixture(target);
    }
  },
);

test(
  "a closed process cannot hang forever on pending ownership registration",
  { timeout: 5000 },
  async () => {
    await assert.rejects(
      runBoundedProcess(
        process.execPath,
        ["-e", "console.error('registration pending');process.exit(7)"],
        { timeoutMs: 500, trackOwnership: true },
        {
          registerOwnedProcess: async () => ({
            started: () => new Promise<void>(() => {}),
            spawnFailed: async () => undefined,
          }),
        },
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /timed out after 500/u);
        assert.equal((error as Error & { status: number }).status, 7);
        assert.match(
          (error as Error & { stderr: string }).stderr,
          /registration pending/u,
        );
        return true;
      },
    );
  },
);

test("Darwin exited-group proof accepts only a complete snapshot with no live group member", () => {
  assert.equal(
    exitedProcessGroupHasNoWriters(42, () => "  1 Ss\n 99 S+\n"),
    true,
  );
  assert.equal(
    exitedProcessGroupHasNoWriters(42, () => " 42 Z\n 42 Z+\n 99 R\n"),
    true,
  );
  assert.equal(
    exitedProcessGroupHasNoWriters(42, () => " 42 Z\n 42 S+\n"),
    false,
  );
  assert.throws(
    () => exitedProcessGroupHasNoWriters(42, () => "garbled"),
    /Process-group inspection via \/bin\/ps unavailable \(snapshot-invalid\)/u,
  );
  assert.throws(
    () => exitedProcessGroupHasNoWriters(42, () => ""),
    /Process-group inspection via \/bin\/ps unavailable \(snapshot-empty\)/u,
  );
  assert.throws(
    () =>
      exitedProcessGroupHasNoWriters(42, () => {
        throw new Error("ps denied");
      }),
    /Process-group inspection via \/bin\/ps unavailable \(snapshot-read-failed; unknown\)/u,
  );
});

test("process inspection errors expose only fixed reasons and approved system codes", () => {
  for (const code of ["EPERM", "ETIMEDOUT", "PRIVATE_SECRET"]) {
    assert.throws(
      () =>
        exitedProcessGroupHasNoWriters(42, () => {
          throw Object.assign(
            new Error("spawnSync /private/secret EPERM TOKEN=secret"),
            {
              code,
              stderr: "private diagnostic bytes",
            },
          );
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /snapshot-read-failed/u);
        assert.match(
          error.message,
          code === "PRIVATE_SECRET" ? /unknown/u : new RegExp(code),
        );
        assert.doesNotMatch(
          error.message,
          /PRIVATE_SECRET|private|TOKEN|secret/u,
        );
        return true;
      },
    );
  }
});

test("unavailable post-close inspection preserves the cleanup error and original exit output", async () => {
  await assert.rejects(
    runBoundedProcess(
      process.execPath,
      [
        "-e",
        "console.log('original output');console.error('original diagnostic');process.exit(7)",
      ],
      {},
      {
        signalProcess: () => {
          throw permissionError();
        },
        exitedGroupHasNoWriters: () =>
          exitedProcessGroupHasNoWriters(42, () => {
            throw Object.assign(
              new Error("spawnSync /bin/ps EPERM PRIVATE_SECRET"),
              { code: "EPERM" },
            );
          }),
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Could not send SIGKILL.*kill EPERM/u);
      if (process.platform === "darwin") {
        assert.match(
          error.message,
          /Process-group inspection via \/bin\/ps unavailable \(snapshot-read-failed; EPERM\)/u,
        );
      }
      assert.doesNotMatch(error.message, /PRIVATE_SECRET/u);
      assert.equal((error as Error & { status: number }).status, 7);
      assert.match(error.message, /original output/u);
      assert.match(error.message, /original diagnostic/u);
      return true;
    },
  );
});

test(
  "Darwin sandbox process inspection reports the real spawnSync EPERM",
  {
    skip: process.platform !== "darwin",
  },
  () => {
    const source = new URL(
      "../../packages/studio/src/process/bounded-process.ts",
      import.meta.url,
    ).href;
    const script = `import {exitedProcessGroupHasNoWriters} from ${JSON.stringify(source)}; try { exitedProcessGroupHasNoWriters(process.pid); process.stdout.write('unexpected success'); } catch(error) { process.stdout.write(error.message); }`;
    const output = execFileSync(
      "/usr/bin/sandbox-exec",
      [
        "-p",
        "(version 1)(allow default)",
        process.execPath,
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        script,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    assert.equal(
      output,
      "Process-group inspection via /bin/ps unavailable (snapshot-read-failed; EPERM).",
    );
  },
);

test(
  "registration and cleanup failures preserve the original failure, process identity, and streamed log",
  { timeout: 5000 },
  async () => {
    const root = await mkdtemp(
      join(tmpdir(), "axmorf-process-register-cleanup-"),
    );
    const logPath = join(root, "process.log");
    let target: number | undefined;
    const before = [
      process.listenerCount("exit"),
      process.listenerCount("SIGTERM"),
      process.listenerCount("SIGINT"),
    ];
    try {
      await assert.rejects(
        runBoundedProcess(
          process.execPath,
          [
            "-e",
            "console.log('registered writer output');setInterval(()=>{},1000)",
          ],
          { trackOwnership: true, timeoutMs: 3000, logPath },
          {
            registerOwnedProcess: async () => ({
              started: async () => {
                const { watch, readFileSync } = await import("node:fs");
                await new Promise<void>((resolve, reject) => {
                  const observer = watch(logPath, () => {
                    if (
                      readFileSync(logPath, "utf8").includes(
                        "registered writer output",
                      )
                    ) {
                      observer.close();
                      clearTimeout(timer);
                      resolve();
                    }
                  });
                  const timer = setTimeout(() => {
                    observer.close();
                    reject(new Error("fixture output missing"));
                  }, 2000);
                });
                throw new Error("original registration failure");
              },
              spawnFailed: async () => undefined,
            }),
            signalProcess: (pid, signal) => {
              target = pid;
              if (signal === 0) return true;
              throw permissionError();
            },
          },
        ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(
            error.message,
            /original registration failure.*owned process(?: group)? [0-9]+.*EPERM/u,
          );
          assert.match(
            (error as Error & { stdout: string }).stdout,
            /registered writer output/u,
          );
          return true;
        },
      );
      const log = await readFile(logPath, "utf8");
      assert.match(log, /registered writer output/u);
      assert.match(log, /original registration failure/u);
      assert.match(log, /EPERM/u);
      assert.deepEqual(
        [
          process.listenerCount("exit"),
          process.listenerCount("SIGTERM"),
          process.listenerCount("SIGINT"),
        ],
        before,
      );
    } finally {
      stopOwnedFixture(target);
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("unrelated Darwin unknown states do not invalidate proof for a missing or zombie-only group", () => {
  assert.equal(
    exitedProcessGroupHasNoWriters(87610, () => "    1 Ss\n87611 ?E\n"),
    true,
  );
  assert.equal(
    exitedProcessGroupHasNoWriters(87610, () => "87610 Z\n87611 ?E\n"),
    true,
  );
  assert.equal(
    exitedProcessGroupHasNoWriters(87610, () => "87610 ?E\n87611 Ss\n"),
    false,
  );
  assert.equal(
    exitedProcessGroupHasNoWriters(87610, () => "87610 Z\n87610 ?\n"),
    false,
  );
});

test("after close a successful signal zero still permits one Darwin no-writer proof", async () => {
  const calls: Array<string | number> = [];
  const operation = runBoundedProcess(
    process.execPath,
    ["-e", "console.log('finished')"],
    {},
    {
      signalProcess: (_pid, signal) => {
        calls.push(signal);
        if (signal === 0) return true;
        throw permissionError();
      },
      exitedGroupHasNoWriters: () => {
        calls.push("snapshot");
        return true;
      },
    },
  );
  if (process.platform === "darwin") {
    const result = await operation;
    assert.equal(result.status, 0);
    assert.match(result.stdout, /finished/u);
    assert.deepEqual(calls, ["SIGKILL", 0, "snapshot"]);
  } else {
    await assert.rejects(operation, /EPERM/u);
    assert.deepEqual(calls, ["SIGKILL", 0]);
  }
});

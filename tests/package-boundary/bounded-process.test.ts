import { waitForFixtureReady, stopFixture } from "./process-fixture";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runBoundedProcess } from "../../packages/studio/src/process/bounded-process";

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

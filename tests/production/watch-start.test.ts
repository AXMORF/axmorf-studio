import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test, { type TestContext } from "node:test";

import { launchDetachedProductionWatcher } from "../../scripts/production/adapters/watcher-launch";
import { startProductionWatcher } from "../../scripts/production/application/watch-start";
import {
  createProductionFixture,
  markProductionBaselineReady,
  markProductionSceneInputsFrozen,
  FIXED_PRODUCTION_NOW,
} from "./fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("detached watcher adapter uses fixed cwd, no shell, detached stdio, and spawn acknowledgement", async () => {
  const child = new EventEmitter() as EventEmitter & { unref: () => void };
  let unrefs = 0;
  child.unref = () => { unrefs += 1; };
  const calls: unknown[][] = [];
  await launchDetachedProductionWatcher({
    rootDir: "/repo",
    command: "/node",
    args: ["watch-worker", "--run", "story-example-run-001"],
    logPath: "/repo/watch.log",
    openLog: async () => ({ fd: 19, close: async () => undefined }),
    spawnChild: (...args) => {
      calls.push(args);
      queueMicrotask(() => child.emit("spawn"));
      return child;
    },
  });
  assert.equal(unrefs, 1);
  assert.deepEqual(calls[0]?.[2], {
    cwd: "/repo",
    detached: true,
    shell: false,
    stdio: ["ignore", 19, 19],
  });
  assert.equal(child.listenerCount("exit"), 0);
  assert.equal(child.listenerCount("close"), 0);
});

const createFrozenFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-watch-start-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = await createProductionFixture(context, rootDir);
  await markProductionBaselineReady(fixture);
  await markProductionSceneInputsFrozen({
    ...fixture,
    assignmentFingerprints: [
      { meaningId: "opening", fingerprint: sha("1") },
    ],
    globalVisualAssignmentFingerprint: sha("2"),
  });
  return fixture;
};

test("watch start writes intent before spawn and receipt only after acknowledgement", async (context) => {
  const fixture = await createFrozenFixture(context);
  let launches = 0;
  const started = await startProductionWatcher({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    command: "/fixed/node",
    validateInputs: async () => undefined,
    clock: () => FIXED_PRODUCTION_NOW,
    launch: async () => {
      launches += 1;
      assert.match(
        await readFile(
          join(fixture.rootDir, `.producer-runs/${fixture.runId}/watcher-launch-intent.json`),
          "utf8",
        ),
        /production-watcher-launch-intent-v1/u,
      );
      await assert.rejects(
        readFile(
          join(fixture.rootDir, `.producer-runs/${fixture.runId}/watcher-launch-receipt.json`),
        ),
      );
    },
  });
  assert.equal(started.status, "watcher-started");
  assert.equal(started.noOp, false);
  assert.equal(launches, 1);
  const repeated = await startProductionWatcher({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    command: "/fixed/node",
    validateInputs: async () => undefined,
    launch: async () => { launches += 1; },
  });
  assert.equal(repeated.noOp, true);
  assert.equal(launches, 1);
});

test("spawn failure leaves launch ambiguous and is never retried", async (context) => {
  const fixture = await createFrozenFixture(context);
  let launches = 0;
  const request = {
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    command: "/fixed/node",
    validateInputs: async () => undefined,
    launch: async () => {
      launches += 1;
      throw new Error("injected watcher spawn failure");
    },
  } as const;
  await assert.rejects(startProductionWatcher(request), /spawn failure/iu);
  await assert.rejects(
    startProductionWatcher(request),
    /ambiguous|refusing to retry/iu,
  );
  assert.equal(launches, 1);
});

test("concurrent watcher starts install one intent and never spawn twice", async (context) => {
  const fixture = await createFrozenFixture(context);
  let launches = 0;
  let acknowledgeLaunch!: () => void;
  let reportLaunchEntered!: () => void;
  const launchEntered = new Promise<void>((resolve) => {
    reportLaunchEntered = resolve;
  });
  const acknowledgement = new Promise<void>((resolve) => {
    acknowledgeLaunch = resolve;
  });
  const request = {
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    command: "/fixed/node",
    validateInputs: async () => undefined,
    clock: () => FIXED_PRODUCTION_NOW,
    launch: async () => {
      launches += 1;
      reportLaunchEntered();
      await acknowledgement;
    },
  } as const;
  const first = startProductionWatcher(request);
  await launchEntered;
  await assert.rejects(
    startProductionWatcher(request),
    /ambiguous|refusing to retry/iu,
  );
  acknowledgeLaunch();
  assert.equal((await first).status, "watcher-started");
  assert.equal(launches, 1);
});

test("detached worker survives its starter and consumes a receipt published later", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-detached-worker-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const inbox = join(rootDir, "owner-ready.json");
  const consumed = join(rootDir, "consumed.json");
  const worker = join(rootDir, "worker.mjs");
  const starter = join(rootDir, "starter.mjs");
  const launchModule = pathToFileURL(
    join(process.cwd(), "scripts/production/adapters/watcher-launch.ts"),
  ).href;
  await writeFile(
    worker,
    `import {readFile, writeFile} from "node:fs/promises";\nconst [inbox, consumed] = process.argv.slice(2);\nconst deadline = Date.now() + 5000;\nfor (;;) {\n  try {\n    const bytes = await readFile(inbox, "utf8");\n    await writeFile(consumed, bytes);\n    break;\n  } catch (error) {\n    if (error.code !== "ENOENT" || Date.now() >= deadline) throw error;\n    await new Promise((resolve) => setTimeout(resolve, 25));\n  }\n}\n`,
  );
  await writeFile(
    starter,
    `import {launchDetachedProductionWatcher} from ${JSON.stringify(launchModule)};\nawait launchDetachedProductionWatcher({rootDir: ${JSON.stringify(rootDir)}, command: process.execPath, args: [${JSON.stringify(worker)}, ${JSON.stringify(inbox)}, ${JSON.stringify(consumed)}], logPath: ${JSON.stringify(join(rootDir, "watcher.log"))}});\n`,
  );
  const parent = spawn(process.execPath, ["--import", "tsx", starter], {
    cwd: process.cwd(),
    shell: false,
    stdio: "ignore",
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    parent.once("error", reject);
    parent.once("exit", resolve);
  });
  assert.equal(exitCode, 0);
  await writeFile(inbox, '{"status":"owner-ready"}\n');
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      await access(consumed);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || Date.now() >= deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  assert.equal(await readFile(consumed, "utf8"), '{"status":"owner-ready"}\n');
});

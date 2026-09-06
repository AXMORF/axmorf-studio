import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  getProcessOwnership,
  inspectOwnedProcesses,
  registerOwnedProcess,
} from "../../packages/studio/src/process/process-ownership";

const root = async (context: {
  after: (callback: () => Promise<void>) => void;
}) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-process-owner-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return rootDir;
};

test("owned subprocess tracking detects a live group and verifies exit after SIGKILL", async (context) => {
  const rootDir = await root(context);
  const owner = getProcessOwnership();
  const tracking = await registerOwnedProcess({ rootDir });
  assert.equal(await inspectOwnedProcesses({ rootDir, owner }), "unknown");
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  context.after(async () => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  });
  assert.ok(child.pid);
  await tracking.started({
    pid: child.pid,
    processGroup: process.platform !== "win32",
  });
  assert.equal(await inspectOwnedProcesses({ rootDir, owner }), "active");
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  assert.equal(await inspectOwnedProcesses({ rootDir, owner }), "exited");
});

test("subprocess tracking refuses a symlinked registry before writing outside the Workspace", async (context) => {
  const rootDir = await root(context);
  const outside = await root(context);
  await mkdir(join(rootDir, ".producer-attempts"));
  await symlink(outside, join(rootDir, ".producer-attempts", ".processes"));
  await assert.rejects(
    registerOwnedProcess({ rootDir }),
    /registry is unsafe/u,
  );
});

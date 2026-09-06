import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveProcessTimeout,
  withProcessDeadline,
} from "../../scripts/shared/process-deadline";

test("production deadline clamps command timeout and rejects elapsed budgets", async () => {
  await withProcessDeadline(Date.now() + 1000, async () => {
    assert.ok(resolveProcessTimeout(10_000) <= 1000);
    assert.equal(resolveProcessTimeout(5), 5);
  });
  await assert.rejects(
    withProcessDeadline(Date.now() - 1, async () => resolveProcessTimeout()),
    /Production deadline exceeded/u,
  );
  assert.equal(resolveProcessTimeout(), 900_000);
});

test("nested deadlines cannot extend the parent and independent async work is isolated", async () => {
  await withProcessDeadline(Date.now() + 1000, async () => {
    await withProcessDeadline(Date.now() + 10_000, async () => {
      await Promise.resolve();
      assert.ok(resolveProcessTimeout() <= 1000);
    });
  });
  assert.equal(resolveProcessTimeout(), 900_000);
});

test("read-only media probes do not persist logs or process ownership outside production", async () => {
  const { mkdtemp, readdir, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { runMediaProcess } =
    await import("../../scripts/shared/media-process");
  const root = await mkdtemp(join(tmpdir(), "axmorf-media-readonly-"));
  try {
    const cli = join(root, "remotion-cli.js");
    await writeFile(cli, 'process.stdout.write("probe-ok")');
    assert.equal(
      (await runMediaProcess(process.execPath, [cli], { cwd: root })).stdout,
      "probe-ok",
    );
    assert.deepEqual(await readdir(root), ["remotion-cli.js"]);
    await withProcessDeadline(Date.now() + 1000, async () => {
      assert.equal(
        (await runMediaProcess(process.execPath, [cli], { cwd: root })).status,
        0,
      );
    });
    assert.ok((await readdir(root)).includes(".producer-attempts"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeTextFileAtomic } from "../../scripts/shared/atomic-file";

test("atomic text writes can stage outside an authority-only destination directory", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-atomic-file-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const authorityDirectory = join(rootDir, "events");
  await mkdir(authorityDirectory);
  const destination = join(authorityDirectory, "event.json");
  const bytes = `${"x".repeat(1024 * 1024)}\n`;
  let complete = false;

  const write = writeTextFileAtomic({
    destination,
    bytes,
    mode: "create",
    temporaryDirectory: rootDir,
  }).finally(() => {
    complete = true;
  });
  while (!complete) {
    assert.deepEqual(
      (await readdir(authorityDirectory)).filter(
        (entry) => entry !== "event.json",
      ),
      [],
    );
  }

  assert.deepEqual(await write, { written: true });
  assert.equal(await readFile(destination, "utf8"), bytes);
  assert.deepEqual(await readdir(authorityDirectory), ["event.json"]);
  assert.deepEqual(await readdir(rootDir), ["events"]);
});

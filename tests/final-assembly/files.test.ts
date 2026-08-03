import assert from "node:assert/strict";
import {mkdtemp, readFile, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import {createFinalAssemblyPlan} from "../../src/contracts/final-assembly";
import {
  checkPersistedFinalAssembly,
  serializeFinalAssembly,
  writeFinalAssemblyIfPassed,
} from "../../scripts/final-assembly/files";
import {finalAssemblyInput} from "../fixtures/m8/final-assembly";

test("final assembly writer is canonical pass-only idempotent and checker is read-only", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-m8-assembly-"));
  const assembly = createFinalAssemblyPlan(finalAssemblyInput());
  const first = await writeFinalAssemblyIfPassed({rootDir, assembly});
  const before = await readFile(first.destination, "utf8");
  const mtime = (await stat(first.destination)).mtimeMs;
  assert.equal(before, serializeFinalAssembly(assembly));
  const second = await writeFinalAssemblyIfPassed({rootDir, assembly});
  assert.equal(second.written, false);
  assert.equal((await stat(first.destination)).mtimeMs, mtime);
  await checkPersistedFinalAssembly({rootDir, expectedAssembly: assembly});
  await writeFile(first.destination, `${before} `, "utf8");
  await assert.rejects(() => checkPersistedFinalAssembly({rootDir, expectedAssembly: assembly}));
  assert.equal(await readFile(first.destination, "utf8"), `${before} `);
});

test("final assembly writer refuses non-pass declarations", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-m8-assembly-fail-"));
  await assert.rejects(() => writeFinalAssemblyIfPassed({rootDir, assembly: {aggregateStatus: "fail"}}));
});

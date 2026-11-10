import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const scoreModule = resolve("scripts/films/score/synth-score.mjs");

test("bundled score imports do not execute the standalone score CLI", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "axmorf-score-bundle-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const outfile = join(directory, "main.mjs");
  await build({
    entryPoints: [scoreModule],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    outfile,
  });
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    outfile,
    "film",
    "voice",
    "--film",
    "cache-test",
  ]);
  assert.equal(stdout, "");
  assert.equal(stderr, "");
});

test("the standalone score CLI still rejects invalid arguments before generating audio", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [scoreModule, "--invalid"]),
    (error: Error & { code?: number; stderr?: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr ?? "", /Usage: node synth-score\.mjs/u);
      return true;
    },
  );
});

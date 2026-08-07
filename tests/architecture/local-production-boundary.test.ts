import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const rootDir = new URL("../..", import.meta.url).pathname;

test("Git excludes all local Project source and public production artifacts", async () => {
  const tracked = await execFileAsync(
    "git",
    [
      "ls-files",
      "--",
      "public",
      "src/projects",
      "src/remotion/catalog/resource-catalog.generated.json",
    ],
    { cwd: rootDir },
  );
  assert.equal(tracked.stdout, "");

  for (const path of [
    "public/projects/example/narration/complete.wav",
    "public/assets/library/example.svg",
    "src/projects/example/Composition.tsx",
    "src/projects/project-registry.generated.ts",
    "src/remotion/catalog/resource-catalog.generated.json",
  ]) {
    const ignored = await execFileAsync(
      "git",
      ["check-ignore", "--no-index", "--quiet", path],
      { cwd: rootDir },
    );
    assert.equal(ignored.stderr, "");
  }
});

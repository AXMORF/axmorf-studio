import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("documentation separates active authorities, guides, and archived plans", async () => {
  const docsRoot = path.join(process.cwd(), "docs");
  const rootEntries = await readdir(docsRoot, { withFileTypes: true });
  const rootDirectories = rootEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(rootDirectories, [
    "archive",
    "contracts",
    "evidence",
    "guides",
    "promotions",
  ]);

  // This whitelist protects lifecycle ownership: active authorities stay at
  // docs root, while guides, evidence, proposals, contracts, and history have
  // distinct directories instead of accumulating milestone-shaped folders.

  const archivedPlans = path.join(docsRoot, "archive", "implementation-plans");
  const planFiles = (await readdir(archivedPlans))
    .filter((entry) => entry.endsWith(".md") && entry !== "README.md")
    .sort();
  assert.ok(planFiles.length > 0);

  for (const planFile of planFiles) {
    const source = await readFile(path.join(archivedPlans, planFile), "utf8");
    assert.match(source, /归档(?:说明|状态)/u, planFile);
  }
});

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

test("active production docs expose resolved bounded execution and fixed continuation", async () => {
  const rootDir = process.cwd();
  const operationalPaths = [
    "README.md",
    "docs/PRODUCTION_WORKFLOW.md",
    "docs/guides/LOCAL_DELIVERY.md",
    "docs/guides/PRODUCTION_ORCHESTRATION.md",
  ] as const;
  const authorityPaths = [
    "docs/ARCHITECTURE.md",
    "docs/DETERMINISTIC_EXECUTION.md",
    "docs/FINAL_PRODUCT_GOAL.md",
    "docs/ITERATION_STATUS.md",
    "docs/ROADMAP.md",
    "docs/TERMINOLOGY.md",
  ] as const;
  const operational = await Promise.all(
    operationalPaths.map(async (relativePath) => ({
      relativePath,
      source: await readFile(path.join(rootDir, relativePath), "utf8"),
    })),
  );
  const authorities = await Promise.all(
    authorityPaths.map(async (relativePath) => ({
      relativePath,
      source: await readFile(path.join(rootDir, relativePath), "utf8"),
    })),
  );

  for (const { relativePath, source } of operational) {
    assert.match(source, /project:produce:continue/u, relativePath);
    assert.doesNotMatch(
      source,
      /npm run project:produce:converge/u,
      relativePath,
    );
  }
  for (const { relativePath, source } of authorities) {
    assert.match(source, /fixed continuation/iu, relativePath);
    assert.match(
      source,
      /(?:atomic|one-shot)[\s\S]{0,40}claim|claim[\s\S]{0,40}(?:atomic|one-shot)/iu,
      relativePath,
    );
    assert.match(source, /一小时|one-hour/iu, relativePath);
  }
  const active = [...operational, ...authorities]
    .map(({ source }) => source)
    .join("\n");
  assert.doesNotMatch(
    active,
    /Root (?:waits for|supervises)|Root 等待全部|Root 全程监督/iu,
  );
  assert.match(active, /immutable (?:task-terminal )?event log/iu);
  assert.match(active, /user prompt|用户提示词/iu);
  assert.match(active, /bounded pool|受限并发/iu);
});

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const docsRoot = path.join(process.cwd(), "docs");
const read = (relativePath: string) =>
  readFile(path.join(process.cwd(), relativePath), "utf8");

test("active documentation is a short set of authorities and guides", async () => {
  const entries = await readdir(docsRoot, { withFileTypes: true });
  assert.deepEqual(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    ["archive", "evidence", "guides", "promotions"],
  );
  assert.deepEqual(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort(),
    [
      "ARCHITECTURE.md",
      "DOCUMENTATION_POLICY.md",
      "FINAL_PRODUCT_GOAL.md",
      "ITERATION_STATUS.md",
      "README.md",
      "ROADMAP.md",
      "TERMINOLOGY.md",
    ],
  );
  assert.deepEqual((await readdir(path.join(docsRoot, "guides"))).sort(), [
    "AGENT_COMPATIBILITY.md",
    "PRODUCER_CONFIG.md",
    "RELEASE.md",
  ]);
});

test("archived plans and the removed Project chain carry archive notes", async () => {
  const archivedPlans = path.join(docsRoot, "archive", "implementation-plans");
  const planFiles = (await readdir(archivedPlans)).filter(
    (entry) => entry.endsWith(".md") && entry !== "README.md",
  );
  assert.ok(planFiles.length > 0);
  for (const planFile of planFiles) {
    const source = await readFile(path.join(archivedPlans, planFile), "utf8");
    assert.match(source, /归档(?:说明|状态)/u, planFile);
  }
  const archiveIndex = await read("docs/archive/README.md");
  assert.match(archiveIndex, /project-production\/[\s\S]*0\.3\.0/u);
  assert.match(
    await read("docs/archive/iteration-status-0.1.23-and-earlier.md"),
    /归档说明/u,
  );
});

test("active docs describe direct films only", async () => {
  const activePaths = [
    "README.md",
    "AGENTS.md",
    "docs/README.md",
    "docs/ARCHITECTURE.md",
    "docs/FINAL_PRODUCT_GOAL.md",
    "docs/ROADMAP.md",
    "docs/TERMINOLOGY.md",
    "docs/guides/AGENT_COMPATIBILITY.md",
    "docs/guides/PRODUCER_CONFIG.md",
    "docs/guides/RELEASE.md",
    "packages/studio/README.md",
    "packages/create-axmorf-studio/README.md",
    "packages/create-axmorf-studio/template/README.md",
    "packages/create-axmorf-studio/template/AGENTS.md",
  ];
  for (const relativePath of activePaths) {
    const source = await read(relativePath);
    assert.doesNotMatch(
      source,
      /project:(?:create|task|produce|revise|attempt)|TaskExecutionContract|PRODUCTION_WORKFLOW\.md/u,
      relativePath,
    );
  }
});

test("the product goal, roadmap and release guide match the film flow", async () => {
  const plan = "promotions/2026-10-14-direct-film-production.md";
  const [goal, roadmap, index, promotion, release, architecture] =
    await Promise.all([
      read("docs/FINAL_PRODUCT_GOAL.md"),
      read("docs/ROADMAP.md"),
      read("docs/README.md"),
      read(`docs/${plan}`),
      read("docs/guides/RELEASE.md"),
      read("docs/ARCHITECTURE.md"),
    ]);

  assert.match(promotion, /状态：已批准/u);
  for (const source of [goal, roadmap, index]) {
    assert.ok(source.includes(plan));
  }
  for (const command of [
    "film:voice",
    "film:music",
    "film:review",
    "film:check",
    "film:deliver",
  ]) {
    assert.match(goal, new RegExp(command, "u"));
    assert.match(architecture, new RegExp(command, "u"));
  }
  assert.match(
    goal,
    /cover-4x3\.png[\s\S]*cover-3x4\.png[\s\S]*publish\.json/u,
  );
  assert.match(goal, /ceilDiv\(cumulativeSamples × fps, sampleRate\)/u);
  assert.match(goal, /## 6\. 非目标[\s\S]*任务 DAG[\s\S]*原创性指纹/u);
  assert.match(roadmap, /0\.3\.0：删除 Project production 主链/u);
  assert.match(release, /next[\s\S]*latest/u);
  assert.match(release, /30 分钟/u);
  assert.match(architecture, /legacyProjectData/u);
});

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

test("the completed npm workspace release plan is archived", async () => {
  const docsRoot = path.join(process.cwd(), "docs");
  const fileName =
    "2026-08-30-npm-workspace-open-source-implementation-plan.md";
  const [promotions, archived, index, status, roadmap] = await Promise.all([
    readdir(path.join(docsRoot, "promotions")),
    readdir(path.join(docsRoot, "archive", "implementation-plans")),
    readFile(path.join(docsRoot, "README.md"), "utf8"),
    readFile(path.join(docsRoot, "ITERATION_STATUS.md"), "utf8"),
    readFile(path.join(docsRoot, "ROADMAP.md"), "utf8"),
  ]);

  assert.equal(promotions.includes(fileName), false);
  assert.equal(archived.includes(fileName), true);
  assert.match(index, /archive\/implementation-plans\/2026-08-30/u);
  assert.doesNotMatch(index, /仍待 closeout|发布 gates 待完成/u);
  assert.match(status, /@axmorf\/studio@0\.1\.0[\s\S]*公开发布/u);
  assert.match(roadmap, /Trusted Publisher[\s\S]*纯 OIDC/u);
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

test("active npm docs expose bound TaskExecutionContract and explicit failed-attempt recovery", async () => {
  const rootDir = process.cwd();
  const commandPaths = [
    "README.md",
    "docs/PRODUCTION_WORKFLOW.md",
    "docs/guides/PRODUCTION_ORCHESTRATION.md",
    ".agents/skills/axmorf-video/references/direct-production-workflow.md",
  ] as const;
  const authorityPaths = [
    "AGENTS.md",
    "docs/ARCHITECTURE.md",
    "docs/FINAL_PRODUCT_GOAL.md",
    "docs/ITERATION_STATUS.md",
    "docs/ROADMAP.md",
  ] as const;
  const commands = await Promise.all(
    commandPaths.map((relativePath) =>
      readFile(path.join(rootDir, relativePath), "utf8"),
    ),
  );
  for (const source of commands) {
    assert.match(source, /project:task:bind/u);
    assert.match(source, /project:task:finalize/u);
    assert.match(source, /project:attempt:recover-inspect/u);
    assert.match(source, /project:attempt:reissue/u);
    for (const command of source.matchAll(
      /npm run project:task:(?:describe|finalize|check|commit|fail)[^\n]*/gu,
    )) {
      assert.match(command[0], /--attempt/u);
      if (command[0].includes("--assignment")) {
        assert.match(command[0], /--project/u);
        assert.doesNotMatch(command[0], /--task|--binding/u);
      } else {
        assert.match(command[0], /--task/u);
        assert.match(command[0], /--binding/u);
      }
    }
  }
  const authorities = await Promise.all(
    authorityPaths.map((relativePath) =>
      readFile(path.join(rootDir, relativePath), "utf8"),
    ),
  );
  const active = [...commands, ...authorities].join("\n");
  assert.match(active, /TaskExecutionContract/u);
  assert.match(active, /zero-write/u);
  assert.match(active, /shared-workspace[\s\S]*controller-io/u);
  assert.match(active, /full (?:valid )?binding/u);
  assert.match(active, /same-Revision/u);
  assert.match(active, /不要求 current delivery|needs no current delivery/iu);
  assert.doesNotMatch(active, /policy schema v1[689] \/ policy v1[89]/u);
});

test("active npm docs expose exact-base isolated Project revision promotion", async () => {
  const rootDir = process.cwd();
  const operationalPaths = [
    "README.md",
    "docs/PRODUCTION_WORKFLOW.md",
    "docs/guides/PROJECT_REVISION.md",
    ".agents/skills/axmorf-video/references/project-revision.md",
  ] as const;
  const authorityPaths = [
    "AGENTS.md",
    "docs/ARCHITECTURE.md",
    "docs/FINAL_PRODUCT_GOAL.md",
    "docs/ITERATION_STATUS.md",
    "docs/ROADMAP.md",
  ] as const;
  const operational = await Promise.all(
    operationalPaths.map((relativePath) =>
      readFile(path.join(rootDir, relativePath), "utf8"),
    ),
  );
  for (const source of operational) {
    assert.match(source, /project:revise:context/u);
    assert.match(source, /project:revise:validate/u);
    assert.match(source, /project:revise(?:`|\s|:)/u);
    assert.match(source, /project:revision:promote/u);
    assert.match(source, /--candidate/u);
  }
  const authorities = await Promise.all(
    authorityPaths.map((relativePath) =>
      readFile(path.join(rootDir, relativePath), "utf8"),
    ),
  );
  const active = [...operational, ...authorities].join("\n");
  assert.match(active, /baseRevisionId[\s\S]*baseDeliveryBuildId/u);
  assert.match(active, /isolated|隔离/iu);
  assert.match(active, /source\/public\/narration\/delivery/u);
  assert.match(active, /rollback/u);
  assert.match(active, /promotion[\s\S]*(?:独立|only)[\s\S]*(?:retry|重试)/iu);
  assert.doesNotMatch(active, /edit existing inputs/u);
  assert.doesNotMatch(
    active,
    /Existing Project authoring inputs\s*\|\s*Root authoring Agent/u,
  );
});

test("active docs expose originality, bound capabilities, layered GlobalVisual, and reissue", async () => {
  const rootDir = process.cwd();
  const read = (relativePath: string) =>
    readFile(path.join(rootDir, relativePath), "utf8");
  const [goal, deterministic, terminology, status, workflow, review] =
    await Promise.all([
      read("docs/FINAL_PRODUCT_GOAL.md"),
      read("docs/DETERMINISTIC_EXECUTION.md"),
      read("docs/TERMINOLOGY.md"),
      read("docs/ITERATION_STATUS.md"),
      read("docs/PRODUCTION_WORKFLOW.md"),
      read("docs/guides/REVIEW_MODEL.md"),
    ]);

  assert.match(goal, /originality baseline/iu);
  assert.match(goal, /72 caption display half-units/iu);
  for (const term of [
    "TaskExecutionContract",
    "task-worker-bound",
    "shared-workspace",
    "controller-io",
    "Scene originality baseline",
    "GlobalVisual layer policy",
    "attempt reissue",
  ]) {
    assert.match(`${deterministic}\n${terminology}`, new RegExp(term, "iu"));
  }
  for (const command of [
    "project:originality:freeze",
    "project:revise:context",
    "project:revise:validate",
    "project:revise",
    "project:revision:promote",
  ]) {
    assert.match(status, new RegExp(command, "u"));
  }
  assert.match(workflow, /authoring-validation-failed/u);
  assert.match(workflow, /caption-display-budget-exceeded/u);
  assert.match(review, /project:task:bind/u);
  assert.match(review, /project:task:finalize/u);
  assert.match(review, /spawn\/fixed failure/u);

  const templateDocs = (
    await Promise.all([
      read("packages/create-axmorf-studio/template/AGENTS.md"),
      read(
        "packages/create-axmorf-studio/template/.agents/skills/axmorf-video/SKILL.md",
      ),
      read(
        "packages/create-axmorf-studio/template/.agents/skills/axmorf-video/references/production-workflow.md",
      ),
    ])
  ).join("\n");
  assert.match(templateDocs, /GlobalVisualBaseLayer/u);
  assert.match(templateDocs, /GlobalVisualDecorationLayers/u);
  assert.match(templateDocs, /local frame zero/iu);

  const transportDocs = (
    await Promise.all([
      read(
        ".agents/skills/axmorf-video/references/global-visual-agent-orchestration.md",
      ),
      read(
        ".agents/skills/axmorf-video/references/cover-agent-orchestration.md",
      ),
      read("docs/guides/PRODUCTION_ORCHESTRATION.md"),
    ])
  ).join("\n");
  assert.match(
    transportDocs,
    /controller-io[\s\S]{0,100}没有[\s\S]{0,80}filesystem/iu,
  );
  assert.doesNotMatch(transportDocs, /在共享 checkout/u);

  const deletionDocs = `${await read("docs/guides/PRODUCER_CONFIG.md")}\n${await read(
    "docs/guides/FORMAL_PROJECT_VERIFICATION.md",
  )}`;
  assert.match(deletionDocs, /revision candidates/u);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const readRepositoryFile = (relativePath: string) =>
  readFile(path.join(process.cwd(), relativePath), "utf8");

test("mainstream agent entrypoints import one repository authority", async () => {
  const [
    agents,
    claude,
    gemini,
    readme,
    guide,
    workflow,
    status,
    producerConfig,
    architecture,
    product,
    roadmap,
  ] = await Promise.all([
    readRepositoryFile("AGENTS.md"),
    readRepositoryFile("CLAUDE.md"),
    readRepositoryFile("GEMINI.md"),
    readRepositoryFile("README.md"),
    readRepositoryFile("docs/guides/AGENT_COMPATIBILITY.md"),
    readRepositoryFile("docs/PRODUCTION_WORKFLOW.md"),
    readRepositoryFile("docs/ITERATION_STATUS.md"),
    readRepositoryFile("docs/guides/PRODUCER_CONFIG.md"),
    readRepositoryFile("docs/ARCHITECTURE.md"),
    readRepositoryFile("docs/DESKTOP_APP_PRODUCT.md"),
    readRepositoryFile("docs/ROADMAP.md"),
  ]);

  assert.equal(claude.trim(), "@AGENTS.md");
  assert.equal(gemini.trim(), "@./AGENTS.md");
  assert.match(agents, /AGENTS\.md` 是唯一仓库级 Agent 指令 authority/u);
  assert.match(
    agents,
    /\.agents\/skills\/remotion-story-producer-video\/SKILL\.md/u,
  );
  assert.match(agents, /内置执行默认是 `inline`/u);
  assert.match(readme, /docs\/guides\/AGENT_COMPATIBILITY\.md/u);
  assert.match(guide, /其他 shell-capable Agent/u);
  assert.match(guide, /不依赖.*Agent API|不创建 Agent/su);
  assert.match(workflow, /Resolved execution mode/u);
  assert.match(workflow, /inline default/u);
  assert.match(workflow, /仓库只产出通用 workspace 与 shell command/u);
  assert.match(status, /policy schema v17 \/ policy v20/u);
  assert.match(status, /内置 `inline` 默认/u);
  assert.match(producerConfig, /private\/execution-preferences\.json/u);
  assert.match(producerConfig, /文件不存在时内置使用 `inline`/u);
  assert.match(producerConfig, /transport 不是 App.*execution preferences/su);
  assert.match(architecture, /single repository Agent instruction authority/u);
  assert.match(architecture, /Built-in inline default/u);
  assert.match(architecture, /宿主原生 delegate tool[\s\S]*bounded[\s\S]*transport/u);
  assert.match(readme, /--worker-transport/u);
  assert.match(readme, /project:task:bind/u);
  assert.match(product, /schema task-worker/u);
  assert.match(product, /task bind[\s\S]*--binding <bindingId>/u);
  assert.match(product, /attempt recover-inspect[\s\S]*attempt reissue/u);
  assert.match(product, /不提供 worker-transport 设置/u);
  assert.match(roadmap, /task bind[\s\S]*controller-IO capability/u);
});

test("generic production surfaces do not call vendor agent runtimes", async () => {
  const [packageJson, productionSkill, remotionSkill, prepareProduction] =
    await Promise.all([
      readRepositoryFile("package.json"),
      readRepositoryFile(
        ".agents/skills/remotion-story-producer-video/SKILL.md",
      ),
      readRepositoryFile(".agents/skills/remotion-best-practices/SKILL.md"),
      readRepositoryFile(
        "scripts/project-production/application/prepare-production.ts",
      ),
    ]);
  const genericSurface = [
    packageJson,
    productionSkill,
    remotionSkill,
    prepareProduction,
  ].join("\n");

  assert.doesNotMatch(
    genericSurface,
    /@openai\/codex|codex app|agents sdk|create_thread|spawn_agent/iu,
  );
  assert.match(prepareProduction, /dirtyAgentTasks/u);
  assert.match(prepareProduction, /continuationCommand/u);
});

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
    runtimeReadme,
    creatorReadme,
    guide,
    workflow,
    status,
    producerConfig,
    architecture,
    productGoal,
    roadmap,
    workspaceAgents,
    workspaceSkill,
    workspaceWorkflow,
  ] = await Promise.all([
    readRepositoryFile("AGENTS.md"),
    readRepositoryFile("CLAUDE.md"),
    readRepositoryFile("GEMINI.md"),
    readRepositoryFile("README.md"),
    readRepositoryFile("packages/studio/README.md"),
    readRepositoryFile("packages/create-axmorf-studio/README.md"),
    readRepositoryFile("docs/guides/AGENT_COMPATIBILITY.md"),
    readRepositoryFile("docs/PRODUCTION_WORKFLOW.md"),
    readRepositoryFile("docs/ITERATION_STATUS.md"),
    readRepositoryFile("docs/guides/PRODUCER_CONFIG.md"),
    readRepositoryFile("docs/ARCHITECTURE.md"),
    readRepositoryFile("docs/FINAL_PRODUCT_GOAL.md"),
    readRepositoryFile("docs/ROADMAP.md"),
    readRepositoryFile("packages/create-axmorf-studio/template/AGENTS.md"),
    readRepositoryFile(
      "packages/create-axmorf-studio/template/.agents/skills/axmorf-video/SKILL.md",
    ),
    readRepositoryFile(
      "packages/create-axmorf-studio/template/.agents/skills/axmorf-video/references/production-workflow.md",
    ),
  ]);

  assert.equal(claude.trim(), "@AGENTS.md");
  assert.equal(gemini.trim(), "@./AGENTS.md");
  assert.match(agents, /AGENTS\.md` 是唯一仓库级 Agent 指令 authority/u);
  assert.match(agents, /\.agents\/skills\/axmorf-video\/SKILL\.md/u);
  assert.match(agents, /内置执行默认是 `subagents`/u);
  assert.match(agents, /TaskExecutionContract/u);
  assert.match(agents, /project:task:bind/u);
  assert.match(readme, /docs\/guides\/AGENT_COMPATIBILITY\.md/u);
  assert.match(readme, /`doctor` capability gate/u);
  assert.match(readme, /把这段提示词交给你的 Agent/u);
  assert.match(readme, /## 快速开始/u);
  assert.doesNotMatch(readme, /## 人工快速开始/u);
  const publicPrompts = [readme, runtimeReadme, creatorReadme].map(
    (source) => source.match(/```text\n([\s\S]*?)\n```/u)?.[1] ?? "",
  );
  for (const prompt of publicPrompts) {
    assert.equal(prompt.trim().split(/\r?\n/u).length, 1);
    assert.match(prompt, /https:\/\/github\.com\/AXMORF\/axmorf-studio/u);
    assert.match(prompt, /最新 README|latest README/iu);
    assert.match(prompt, /不要?开始制作视频|Stop before video production/iu);
    assert.doesNotMatch(prompt, /npm create|npm run|Node\.js|npm >=/iu);
    assert.doesNotMatch(prompt, /请打开|Open https:/iu);
  }
  assert.match(guide, /其他 shell-capable Agent/u);
  assert.match(guide, /不依赖.*Agent API|不创建 Agent/su);
  assert.match(guide, /Workspace capability gate/u);
  assert.match(guide, /不得修改 `node_modules`/u);
  assert.match(guide, /README Agent 入口分层/u);
  assert.match(
    guide,
    /一句 Agent prompt[\s\S]*creator template[\s\S]*下一次视频/u,
  );
  assert.match(guide, /shared-workspace[\s\S]*controller-io/u);
  assert.match(status, /macOS 15 ARM64.*reference environment/su);
  assert.match(workflow, /Resolved execution mode/u);
  assert.match(workflow, /explicit inline/u);
  assert.match(workflow, /仓库只产出通用 workspace 与 shell command/u);
  assert.match(status, /policy schema v18 \/ policy v22/u);
  assert.match(status, /内置 `subagents`\/4 默认/u);
  assert.match(status, /project:attempt:recover-inspect/u);
  assert.match(producerConfig, /private\/execution-preferences\.json/u);
  assert.match(producerConfig, /文件不存在时内置使用 `subagents`/u);
  assert.match(producerConfig, /transport[\s\S]*不是表单字段/u);
  assert.match(architecture, /single repository Agent instruction authority/u);
  assert.match(architecture, /Built-in subagents default: max 4/u);
  assert.match(architecture, /attempt-bound zero-write gate/u);
  assert.match(readme, /--worker-transport/u);
  assert.match(readme, /project:task:bind/u);
  assert.match(readme, /project:attempt:recover-inspect/u);
  assert.match(readme, /project:revise:context/u);
  assert.match(readme, /project:revision:promote/u);
  assert.match(productGoal, /TaskExecutionContract/u);
  assert.match(productGoal, /current delivery/u);
  assert.match(roadmap, /controller-io/u);
  assert.match(roadmap, /same-Revision reissue/u);
  for (const source of [workspaceAgents, workspaceSkill, workspaceWorkflow]) {
    assert.match(source, /inputs\/task-contract\.json/u);
    assert.match(source, /project:attempt:recover-inspect/u);
    assert.match(source, /project:revise:context/u);
    assert.match(source, /project:revision:promote/u);
    assert.doesNotMatch(
      source,
      /\brsp\b|Desktop|DeliveryPolicy|source-current/iu,
    );
  }
  assert.match(
    `${workspaceAgents}\n${workspaceSkill}\n${workspaceWorkflow}`,
    /isolated[\s\S]{0,120}candidate|candidate[\s\S]{0,120}isolated/iu,
  );
});

test("generic production surfaces do not call vendor agent runtimes", async () => {
  const [packageJson, productionSkill, remotionSkill, prepareProduction] =
    await Promise.all([
      readRepositoryFile("package.json"),
      readRepositoryFile(".agents/skills/axmorf-video/SKILL.md"),
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

test("native execution guides support wait-any and native batch completion", async () => {
  const [repository, workspace] = await Promise.all([
    readRepositoryFile(
      ".agents/skills/axmorf-video/references/execution-capabilities.md",
    ),
    readRepositoryFile(
      "packages/create-axmorf-studio/template/.agents/skills/axmorf-video/references/execution-capabilities.md",
    ),
  ]);
  assert.equal(workspace, repository);
  assert.match(workspace, /With wait-any[\s\S]*immediately admit/u);
  assert.match(
    workspace,
    /With a synchronous native batch[\s\S]*effectiveMaxConcurrency[\s\S]*next bounded batch/u,
  );
  assert.match(
    workspace,
    /With native asynchronous batch completion[\s\S]*completion notification/u,
  );
  assert.match(workspace, /Root never authors task outputs/u);
  assert.match(workspace, /Do not wrap shell jobs as children/u);
  assert.match(workspace, /continuation once and suspend/u);
  assert.doesNotMatch(workspace, /do not wait for the whole batch/u);
});

test("assigned-worker routing precedes global preflight in both instruction bundles", async () => {
  for (const prefix of ["", "packages/create-axmorf-studio/template/"]) {
    const [agents, skill, worker, execution] = await Promise.all([
      readRepositoryFile(`${prefix}AGENTS.md`),
      readRepositoryFile(`${prefix}.agents/skills/axmorf-video/SKILL.md`),
      readRepositoryFile(
        `${prefix}.agents/skills/axmorf-video/references/${prefix ? "production-workflow.md" : "task-execution-protocol.md"}`,
      ),
      readRepositoryFile(
        `${prefix}.agents/skills/axmorf-video/references/execution-capabilities.md`,
      ),
    ]);
    // A fresh child loading only AGENTS + the local Skill must route before global work.
    assert.ok(
      agents.indexOf("exact attempt-bound") < agents.indexOf("npm run doctor"),
    );
    assert.ok(
      skill.indexOf("exact attempt-bound") < skill.indexOf("project:create"),
    );
    assert.match(worker, /Root owns global doctor[\s\S]*preflight/u);
    assert.match(worker, /TaskExecutionContract[\s\S]*validators/u);
    assert.match(worker, /finalize[\s\S]*check[\s\S]*commit/u);
    assert.match(worker, /no automatic retry|automatically retry/u);
    assert.match(execution, /Workspace root: <absolute Workspace root>/u);
    assert.match(
      execution,
      /exact attempt-bound bind command returned by prepare/u,
    );
    assert.match(execution, /Do not rely on inherited conversation/u);
  }
});

test("different task revisions require fresh native children while same-task corrections stay with their owner", async () => {
  for (const prefix of ["", "packages/create-axmorf-studio/template/"]) {
    const execution = await readRepositoryFile(
      `${prefix}.agents/skills/axmorf-video/references/execution-capabilities.md`,
    );
    const worker = await readRepositoryFile(
      `${prefix}.agents/skills/axmorf-video/references/${prefix ? "production-workflow.md" : "task-execution-protocol.md"}`,
    );
    assert.match(
      execution,
      /Each different TaskRevision requires a fresh native child\/session/u,
    );
    assert.match(
      execution,
      /finished child must not receive another TaskRevision[\s\S]*follow-up, resume/u,
    );
    assert.match(
      execution,
      /Own only the bound TaskRevision; do not accept a different TaskRevision/u,
    );
    assert.match(
      execution,
      /Same-task corrections by the original owning executor[\s\S]*before[\s\S]*terminal/u,
    );
    assert.match(
      worker,
      /each different TaskRevision needs a fresh native child\/session/u,
    );
    assert.match(worker, /follow-up[\s\S]*resume/u);
    assert.match(worker, /same-task[\s\S]*before terminal/u);
  }
});

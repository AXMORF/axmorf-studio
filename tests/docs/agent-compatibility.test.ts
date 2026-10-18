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
    workspaceAgents,
    workspaceClaude,
  ] = await Promise.all([
    readRepositoryFile("AGENTS.md"),
    readRepositoryFile("CLAUDE.md"),
    readRepositoryFile("GEMINI.md"),
    readRepositoryFile("README.md"),
    readRepositoryFile("packages/studio/README.md"),
    readRepositoryFile("packages/create-axmorf-studio/README.md"),
    readRepositoryFile("docs/guides/AGENT_COMPATIBILITY.md"),
    readRepositoryFile("packages/create-axmorf-studio/template/AGENTS.md"),
    readRepositoryFile("packages/create-axmorf-studio/template/CLAUDE.md"),
  ]);

  assert.equal(claude.trim(), "@AGENTS.md");
  assert.equal(gemini.trim(), "@./AGENTS.md");
  assert.equal(workspaceClaude.trim(), "@AGENTS.md");
  assert.match(agents, /AGENTS\.md` 是唯一仓库级 Agent 指令 authority/u);
  assert.match(agents, /\.agents\/skills\/axmorf-film\/SKILL\.md/u);
  assert.match(readme, /docs\/guides\/AGENT_COMPATIBILITY\.md/u);
  assert.match(readme, /`doctor` capability gate/u);
  assert.match(readme, /把这段提示词交给你的 Agent/u);
  assert.match(readme, /## 快速开始/u);
  const publicPrompts = [readme, runtimeReadme, creatorReadme].map(
    (source) => source.match(/```text\n([\s\S]*?)\n```/u)?.[1] ?? "",
  );
  for (const prompt of publicPrompts) {
    assert.equal(prompt.trim().split(/\r?\n/u).length, 1);
    assert.match(prompt, /https:\/\/github\.com\/AXMORF\/axmorf-studio/u);
    assert.match(prompt, /最新 README|latest README/iu);
    assert.match(prompt, /不要?开始制作视频|Stop before video production/iu);
    assert.doesNotMatch(prompt, /npm create|npm run|Node\.js|npm >=/iu);
  }
  assert.match(guide, /其他 shell-capable Agent/u);
  assert.match(guide, /不调用 Codex\/Claude\/Gemini\/Cursor\/Copilot SDK/u);
  assert.match(guide, /Workspace capability gate/u);
  assert.match(guide, /不得修改 `node_modules`/u);
  assert.match(guide, /\.claude\/skills\/axmorf-film/u);
  assert.match(workspaceAgents, /\.agents\/skills\/axmorf-film\/SKILL\.md/u);
  assert.match(workspaceAgents, /film:deliver/u);
  assert.match(workspaceAgents, /legacyProjectData/u);
  assert.doesNotMatch(workspaceAgents, /\brsp\b|Desktop|axmorf-video/iu);
});

test("generic production surfaces do not call vendor agent runtimes", async () => {
  const sources = await Promise.all([
    readRepositoryFile("package.json"),
    readRepositoryFile(".agents/skills/axmorf-film/SKILL.md"),
    readRepositoryFile("scripts/films/cli.ts"),
    readRepositoryFile("packages/studio/src/cli/main.ts"),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /@openai\/codex|@anthropic-ai\/claude|claude-agent-sdk|codex exec|spawn_agent/u,
    );
  }
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
} from "@axmorf/studio/contracts";

import { validateRendererReadabilitySourceGraph } from "../../scripts/project-production/application/readability-source-validator";
import { compileTypeScriptImportGraph } from "../../scripts/project-production/application/typescript-compile";

const rootDir = join(import.meta.dirname, "../..");
const exemplarPath =
  "packages/create-axmorf-studio/template/.agents/skills/remotion-best-practices/references/exemplar-scenes.md";

const readExemplars = async () => {
  const guide = await readFile(join(rootDir, exemplarPath), "utf8");
  return [...guide.matchAll(/```tsx\n([\s\S]*?)```/gu)].map(
    (match) => match[1]!,
  );
};

test("shipped exemplar Scenes pass the production Scene source checker", async () => {
  const exemplars = await readExemplars();
  assert.equal(exemplars.length, 2);
  const viewport = resolveSceneViewport(
    resolveSceneReadabilityPolicy({ width: 1080, height: 1920 }),
  );
  for (const source of exemplars) {
    const dir = await mkdtemp(join(tmpdir(), "axmorf-exemplar-"));
    try {
      await writeFile(join(dir, "Renderer.tsx"), source);
      await validateRendererReadabilitySourceGraph({
        rootDir: dir,
        rendererPath: "Renderer.tsx",
        sourcePaths: ["Renderer.tsx"],
        sceneViewport: viewport,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("shipped exemplar Scenes typecheck against the installed public API", async () => {
  for (const [index, source] of (await readExemplars()).entries()) {
    compileTypeScriptImportGraph({
      rootDir,
      rootPath: join(rootDir, `src/exemplar-scene-${index}.tsx`),
      label: `exemplar-scene-${index}`,
      virtualSource: source,
    });
  }
});

test("exemplar permission is scoped to the shipped file, not user history", async () => {
  const agents = await readFile(join(rootDir, "AGENTS.md"), "utf8");
  assert.match(agents, /exemplar-scenes\.md/u);
  assert.match(agents, /不得搜索、比较、模仿或复制用户历史 Scene/u);
  const skill = await readFile(
    join(
      rootDir,
      "packages/create-axmorf-studio/template/.agents/skills/remotion-best-practices/SKILL.md",
    ),
    "utf8",
  );
  assert.match(skill, /\(references\/exemplar-scenes\.md\)/u);
});

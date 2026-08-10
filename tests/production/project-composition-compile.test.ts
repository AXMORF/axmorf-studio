import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectGlobalVisualSourceGraph } from "../../scripts/production/application/global-visual-validator";
import { compileTargetProjectComposition } from "../../scripts/production/application/project-composition-compiler";
import { renderProductionRenderProjectScaffold } from "../../scripts/production/application/project-scaffold";

const repositoryRoot = process.cwd();

const noPropsGlobalVisualSource = `
import React from "react";
import {AbsoluteFill, useCurrentFrame} from "remotion";
import {opacityForFrame} from "./motif";

export const GlobalVisualLayers: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{pointerEvents: "none", opacity: opacityForFrame(frame)}} />;
};
`;

const writeJson = (path: string) => writeFile(path, "{}\n");

const createCompileFixture = async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-compile-"));
  const projectRoot = join(rootDir, "src/projects/story-example");
  const generatedRoot = join(projectRoot, "generated");
  const globalVisualRoot = join(projectRoot, "global-visual");
  await mkdir(generatedRoot, { recursive: true });
  await mkdir(globalVisualRoot, { recursive: true });
  await mkdir(join(projectRoot, "production"), { recursive: true });
  await symlink(
    join(repositoryRoot, "node_modules"),
    join(rootDir, "node_modules"),
    "dir",
  );
  await symlink(
    join(repositoryRoot, "src/contracts"),
    join(rootDir, "src/contracts"),
    "dir",
  );
  await symlink(
    join(repositoryRoot, "src/remotion"),
    join(rootDir, "src/remotion"),
    "dir",
  );
  await writeFile(
    join(rootDir, "tsconfig.json"),
    await readFile(join(repositoryRoot, "tsconfig.json"), "utf8"),
  );
  await Promise.all(
    [
      "brief.json",
      "global-visual-plan.json",
      "narration.json",
      "render.json",
      "story.json",
      "production/requirements.json",
      "generated/global-visual-projection.generated.json",
      "generated/production-render-plan.generated.json",
      "generated/mastered-narration.generated.json",
      "generated/sealed-narration.generated.json",
      "generated/semantic-timing.generated.json",
    ].map((path) => writeJson(join(projectRoot, path))),
  );
  await writeFile(
    join(projectRoot, "production-scene-runtime.generated.ts"),
    `export const productionRendererPropsByMeaning = {};
export const productionRendererRegistry = {};
export const productionStoryVisualProjection = {} as never;
`,
  );
  await writeFile(
    join(globalVisualRoot, "GlobalVisualLayers.tsx"),
    noPropsGlobalVisualSource,
  );
  await writeFile(
    join(globalVisualRoot, "motif.ts"),
    "export const opacityForFrame = (frame: number) => frame >= 0 ? 1 : 0;\n",
  );
  const compositionPath = join(projectRoot, "Composition.tsx");
  await writeFile(
    compositionPath,
    renderProductionRenderProjectScaffold({
      storyId: "story-example",
      sceneLocalSoundPresent: false,
    }),
  );
  return { rootDir, compositionPath } as const;
};

test("validator-accepted no-Props GlobalVisual compiles with the production scaffold", async (context) => {
  const fixture = await createCompileFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));

  await collectGlobalVisualSourceGraph({
    rootDir: fixture.rootDir,
    storyId: "story-example",
  });

  assert.deepEqual(
    await compileTargetProjectComposition({
      rootDir: fixture.rootDir,
      storyId: "story-example",
    }),
    {
      storyId: "story-example",
      compositionPath: "src/projects/story-example/Composition.tsx",
    },
  );
});

test("compile gate rejects scaffold Props drift", async (context) => {
  const fixture = await createCompileFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const source = await readFile(fixture.compositionPath, "utf8");
  await writeFile(
    fixture.compositionPath,
    source.replace(
      "<ProductionGlobalVisualLayers />",
      "<ProductionGlobalVisualLayers plan={globalVisualPlan} projection={globalVisualProjection} />",
    ),
  );

  await assert.rejects(
    compileTargetProjectComposition({
      rootDir: fixture.rootDir,
      storyId: "story-example",
    }),
    /Target Project Composition TypeScript compile failed \(TS2322\)/u,
  );
});

test("compile gate ignores unrelated ignored Projects", async (context) => {
  const fixture = await createCompileFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const unrelatedRoot = join(fixture.rootDir, "src/projects/unrelated-project");
  await mkdir(unrelatedRoot, { recursive: true });
  await writeFile(
    join(unrelatedRoot, "Composition.tsx"),
    "const broken: string = 42; export default broken;\n",
  );

  await compileTargetProjectComposition({
    rootDir: fixture.rootDir,
    storyId: "story-example",
  });
});

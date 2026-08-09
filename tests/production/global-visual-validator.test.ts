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

const validSource = `
import React from "react";
import {AbsoluteFill, useCurrentFrame} from "remotion";
import {opacityForFrame} from "./motif";

export const GlobalVisualLayers: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{pointerEvents: "none", opacity: opacityForFrame(frame)}} />;
};
`;

const prepareTypeScriptFixture = async (rootDir: string) => {
  await mkdir(join(rootDir, "src"), { recursive: true });
  await symlink(
    join(process.cwd(), "src/remotion"),
    join(rootDir, "src/remotion"),
    "dir",
  );
  await symlink(
    join(process.cwd(), "node_modules"),
    join(rootDir, "node_modules"),
    "dir",
  );
  await writeFile(
    join(rootDir, "tsconfig.json"),
    await readFile(join(process.cwd(), "tsconfig.json"), "utf8"),
  );
};

test("collects a project-local frame-driven GlobalVisual source graph", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-visual-source-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await prepareTypeScriptFixture(rootDir);
  const sourceDir = join(rootDir, "src/projects/story-example/global-visual");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "GlobalVisualLayers.tsx"), validSource);
  await writeFile(
    join(sourceDir, "motif.ts"),
    "export const opacityForFrame = (frame: number) => frame >= 0 ? 1 : 0;\n",
  );

  const graph = await collectGlobalVisualSourceGraph({
    rootDir,
    storyId: "story-example",
  });
  assert.equal(graph.files.length, 2);
  assert.match(graph.sourceGraphFingerprint, /^sha256:/u);
});

test("rejects Scene caption audio visible text CSS and external runtime access", async (context) => {
  for (const source of [
    validSource.replace("./motif", "../scenes/opening/Renderer"),
    validSource.replace(
      "const frame = useCurrentFrame();",
      "const frame = useCurrentFrame(); const CaptionLayer = 'forbidden';",
    ),
    validSource.replace(
      "opacity: opacityForFrame(frame)",
      "transition: 'all 1s'",
    ),
    validSource.replace(" />", ">visible text</AbsoluteFill>"),
    validSource.replace(
      'import React from "react";',
      'import React from "react"; import {Audio} from "remotion";',
    ),
    validSource.replace(
      'import React from "react";',
      'import React from "react"; fetch("https://example.invalid");',
    ),
  ]) {
    await context.test(source.slice(0, 40), async (child) => {
      const rootDir = await mkdtemp(
        join(tmpdir(), "rsp-global-visual-invalid-"),
      );
      child.after(() => rm(rootDir, { recursive: true, force: true }));
      await prepareTypeScriptFixture(rootDir);
      const sourceDir = join(
        rootDir,
        "src/projects/story-example/global-visual",
      );
      await mkdir(sourceDir, { recursive: true });
      await writeFile(join(sourceDir, "GlobalVisualLayers.tsx"), source);
      await writeFile(
        join(sourceDir, "motif.ts"),
        "export const opacityForFrame = () => 1;\n",
      );
      await assert.rejects(() =>
        collectGlobalVisualSourceGraph({ rootDir, storyId: "story-example" }),
      );
    });
  }
});

test("rejects a GlobalVisual component with required Props", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-visual-props-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await prepareTypeScriptFixture(rootDir);
  const sourceDir = join(rootDir, "src/projects/story-example/global-visual");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "GlobalVisualLayers.tsx"),
    validSource
      .replace("React.FC = () =>", "React.FC<{required: string}> = ({required}) =>")
      .replace(
        "opacity: opacityForFrame(frame)",
        "opacity: required.length > 0 ? opacityForFrame(frame) : 0",
      ),
  );
  await writeFile(
    join(sourceDir, "motif.ts"),
    "export const opacityForFrame = (frame: number) => frame >= 0 ? 1 : 0;\n",
  );

  await assert.rejects(
    collectGlobalVisualSourceGraph({ rootDir, storyId: "story-example" }),
    /GlobalVisualLayers component interface compile failed \(TS2322\)/u,
  );
});

test("rejects loose GlobalVisual Props", async (context) => {
  for (const declaration of [
    "React.FC<{plan?: string}> = () =>",
    "React.FC<any> = () =>",
    "React.FC<unknown> = () =>",
    "React.FC<{} | {plan?: string}> = () =>",
  ]) {
    await context.test(declaration, async (child) => {
      const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-visual-loose-props-"));
      child.after(() => rm(rootDir, { recursive: true, force: true }));
      await prepareTypeScriptFixture(rootDir);
      const sourceDir = join(
        rootDir,
        "src/projects/story-example/global-visual",
      );
      await mkdir(sourceDir, { recursive: true });
      await writeFile(
        join(sourceDir, "GlobalVisualLayers.tsx"),
        validSource.replace("React.FC = () =>", declaration),
      );
      await writeFile(
        join(sourceDir, "motif.ts"),
        "export const opacityForFrame = (frame: number) => frame >= 0 ? 1 : 0;\n",
      );

      await assert.rejects(
        collectGlobalVisualSourceGraph({ rootDir, storyId: "story-example" }),
        /GlobalVisualLayers component interface compile failed \(TS2322\)/u,
      );
    });
  }
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("collects a project-local frame-driven GlobalVisual source graph", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-visual-source-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
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

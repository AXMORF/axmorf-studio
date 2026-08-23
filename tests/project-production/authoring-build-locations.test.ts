import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { deriveCoverCompositionBaseId } from "../../src/contracts";
import { collectRendererSourceGraph } from "../../scripts/renderer-registry/domain";
import { collectDeliveryCoverSourceGraph } from "../../scripts/project-production/adapters/cover-source";
import { collectGlobalVisualSourceGraph } from "../../scripts/project-production/application/global-visual-validator";
import { compileTargetProjectComposition } from "../../scripts/project-production/application/project-composition-compiler";
import { createWorkspaceProductionLocations } from "../../scripts/project-production/application/production-locations";
import { ensureProjectAuthoringBuildScaffold } from "../../scripts/project-production/application/project-scaffold";

const write = async (path: string, source: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source, "utf8");
};

const storyId = "workspace-proof";

test("Workspace authoring helpers use only the explicitly injected source and runtime roots", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-authoring-locations-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const projectSourceRoot = join(root, "workspace/projects");
  const runtimeResources = join(root, "app-resources/runtime-pack");
  const projectRoot = join(projectSourceRoot, storyId);
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(root, "workspace"),
    applicationSupportRoot: join(root, "application-support"),
    runtimeResources,
    cacheRoot: join(root, "cache"),
  });

  await write(
    join(projectRoot, "scenes/opening/Renderer.tsx"),
    'import {Shot} from "./Shot"; export default () => <Shot />;\n',
  );
  await write(
    join(projectRoot, "scenes/opening/Shot.tsx"),
    "export const Shot = () => <div />;\n",
  );
  await write(
    join(root, "src/projects", storyId, "scenes/opening/Renderer.tsx"),
    "throw new Error('repository probing');\n",
  );

  const graph = await collectRendererSourceGraph({
    locations,
    projectId: storyId,
    rendererPath: `src/projects/${storyId}/scenes/opening/Renderer.tsx`,
  });
  assert.deepEqual(
    graph.files.map(({ sourcePath }) => sourcePath),
    [
      `src/projects/${storyId}/scenes/opening/Renderer.tsx`,
      `src/projects/${storyId}/scenes/opening/Shot.tsx`,
    ],
  );

  const fingerprint = `sha256:${"a".repeat(64)}`;
  const scaffold = await ensureProjectAuthoringBuildScaffold({
    locations,
    storyId,
    meaningIds: ["opening"],
    runtimeInputFingerprint: fingerprint,
  });
  assert.equal(scaffold.destination, join(projectRoot, "Composition.tsx"));
  assert.match(
    await readFile(scaffold.destination, "utf8"),
    new RegExp(fingerprint),
  );
  await assert.rejects(
    readFile(join(root, "src/projects", storyId, "Composition.tsx")),
  );

  await write(
    join(runtimeResources, "source/tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { jsx: "react-jsx", strict: true, resolveJsonModule: true, esModuleInterop: true } })}\n`,
  );
  await cp(
    join(import.meta.dirname, "../../node_modules/typescript/lib"),
    join(runtimeResources, "node_modules/typescript/lib"),
    { recursive: true },
  );
  await write(
    join(projectRoot, "Composition.tsx"),
    'import value from "./fixture.json"; export const enabled = value.enabled; export default () => null;\n',
  );
  await write(join(projectRoot, "fixture.json"), '{"enabled":true}\n');
  assert.deepEqual(
    await compileTargetProjectComposition({ locations, storyId }),
    {
      storyId,
      compositionPath: `src/projects/${storyId}/Composition.tsx`,
    },
  );
});

test("Workspace Cover source keeps repository-stable logical identity", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-cover-locations-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const projectSourceRoot = join(root, "projects");
  const coverRoot = join(projectSourceRoot, storyId, "delivery/cover");
  const compositionId = deriveCoverCompositionBaseId(storyId);
  await Promise.all([
    write(
      join(coverRoot, "Cover4x3.tsx"),
      "const Cover4x3 = () => <div />; export default Cover4x3;\n",
    ),
    write(
      join(coverRoot, "Cover3x4.tsx"),
      "const Cover3x4 = () => <div />; export default Cover3x4;\n",
    ),
    write(
      join(coverRoot, "Root.tsx"),
      `import {Composition} from "remotion";
import Cover4x3 from "./Cover4x3";
import Cover3x4 from "./Cover3x4";
export const CoverRoot = () => <>
  <Composition id="${compositionId}DeliveryCover4x3V2" component={Cover4x3} width={1600} height={1200} fps={30} durationInFrames={1} />
  <Composition id="${compositionId}DeliveryCover3x4V2" component={Cover3x4} width={1200} height={1600} fps={30} durationInFrames={1} />
</>;
`,
    ),
    write(
      join(coverRoot, "index.ts"),
      'import {registerRoot} from "remotion"; import {CoverRoot} from "./Root"; registerRoot(CoverRoot);\n',
    ),
  ]);

  const graph = await collectDeliveryCoverSourceGraph({
    locations: { projectSourceRoot },
    storyId,
    compositionId,
  });
  assert.deepEqual(
    graph.files.map(({ relativePath }) => relativePath),
    [
      `src/projects/${storyId}/delivery/cover/Cover4x3.tsx`,
      `src/projects/${storyId}/delivery/cover/Cover3x4.tsx`,
      `src/projects/${storyId}/delivery/cover/Root.tsx`,
      `src/projects/${storyId}/delivery/cover/index.ts`,
    ],
  );
});

test("Workspace GlobalVisual source uses only injected Project and Runtime Pack roots", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-global-visual-locations-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const projectSourceRoot = join(root, "workspace/projects");
  const runtimeResources = join(root, "runtime-pack");
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(root, "workspace"),
    applicationSupportRoot: join(root, "application-support"),
    runtimeResources,
    cacheRoot: join(root, "cache"),
  });
  const entryPath = join(
    projectSourceRoot,
    storyId,
    "global-visual/GlobalVisualLayers.tsx",
  );
  await Promise.all([
    write(
      entryPath,
      `export const GlobalVisualLayers = () => {
  const useCurrentFrame = () => 0;
  useCurrentFrame();
  const style = {pointerEvents: "none"};
  void style;
  return null;
};
`,
    ),
    write(
      join(runtimeResources, "source/src/remotion/runtime/global-visual.ts"),
      "export type GlobalVisualLayersComponent<T> = T;\n",
    ),
    write(
      join(runtimeResources, "source/tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { jsx: "preserve", strict: true } })}\n`,
    ),
    write(
      join(
        root,
        "src/projects",
        storyId,
        "global-visual/GlobalVisualLayers.tsx",
      ),
      "throw new Error('repository probing');\n",
    ),
    cp(
      join(import.meta.dirname, "../../node_modules/typescript/lib"),
      join(runtimeResources, "node_modules/typescript/lib"),
      { recursive: true },
    ),
  ]);

  const graph = await collectGlobalVisualSourceGraph({ locations, storyId });
  assert.deepEqual(
    graph.files.map(({ sourcePath }) => sourcePath),
    [`src/projects/${storyId}/global-visual/GlobalVisualLayers.tsx`],
  );
});

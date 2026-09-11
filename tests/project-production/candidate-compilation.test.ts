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
import { join, resolve } from "node:path";
import test, { type TestContext } from "node:test";

import { collectGlobalVisualSourceGraph } from "../../scripts/project-production/application/global-visual-validator";
import { compileTargetProjectComposition } from "../../scripts/project-production/application/project-composition-compiler";

const validSource = `import {useCurrentFrame} from "remotion";
export const GlobalVisualBaseLayer = () => <div style={{pointerEvents: "none"}} />;
export const GlobalVisualDecorationLayers = () => {
  const frame = useCurrentFrame();
  return <div style={{opacity: frame >= 0 ? 1 : 0, pointerEvents: "none"}} />;
};
`;

const fixture = async (context: TestContext) => {
  const runtimeRootDir = await mkdtemp(
    join(tmpdir(), "axmorf-candidate-compile-"),
  );
  context.after(() => rm(runtimeRootDir, { recursive: true, force: true }));
  const repositoryRoot = resolve(import.meta.dirname, "../..");
  await symlink(
    join(repositoryRoot, "node_modules"),
    join(runtimeRootDir, "node_modules"),
  );
  await writeFile(
    join(runtimeRootDir, "tsconfig.json"),
    JSON.stringify({
      extends: join(repositoryRoot, "tsconfig.json"),
      compilerOptions: { baseUrl: repositoryRoot },
    }),
  );
  const rootDir = join(
    runtimeRootDir,
    ".producer-revisions",
    "candidate",
    "scope",
  );
  const storyId = "candidate-compile";
  const projectDir = join(rootDir, "src/projects", storyId);
  const sourcePath = join(projectDir, "global-visual/GlobalVisualLayers.tsx");
  await mkdir(join(projectDir, "global-visual"), { recursive: true });
  await writeFile(sourcePath, validSource);
  await writeFile(
    join(projectDir, "Composition.tsx"),
    `
import {GlobalVisualBaseLayer, GlobalVisualDecorationLayers} from "./global-visual/GlobalVisualLayers";
export const Composition = () => <><GlobalVisualBaseLayer /><GlobalVisualDecorationLayers /></>;
`,
  );
  await assert.rejects(readFile(join(rootDir, "tsconfig.json")), {
    code: "ENOENT",
  });
  return { rootDir, runtimeRootDir, storyId, sourcePath };
};

test("candidate GlobalVisual graph uses Workspace compiler config with isolated source", async (context) => {
  const input = await fixture(context);
  const graph = await collectGlobalVisualSourceGraph(input);
  assert.deepEqual(
    graph.files.map(({ sourcePath }) => sourcePath),
    [`src/projects/${input.storyId}/global-visual/GlobalVisualLayers.tsx`],
  );
});

test("candidate GlobalVisual graph still rejects incompatible layer props", async (context) => {
  const input = await fixture(context);
  await writeFile(
    input.sourcePath,
    validSource.replace(
      "GlobalVisualBaseLayer = ()",
      "GlobalVisualBaseLayer = (_props: {required: string})",
    ),
  );
  await assert.rejects(
    collectGlobalVisualSourceGraph(input),
    /compile failed \(TS2322/u,
  );
});

test("candidate GlobalVisual graph revalidates the themed base against its current VisualStyle", async (context) => {
  const input = await fixture(context);
  const theme = {
    background: "#111827",
    primaryText: "#f9fafb",
    secondaryText: "#d1d5db",
    accent: "#fbbf24",
  };
  await assert.rejects(
    collectGlobalVisualSourceGraph({ ...input, theme }),
    /GlobalVisualBaseLayer must directly return null without parameters/u,
  );
  await writeFile(
    input.sourcePath,
    validSource.replace(
      '() => <div style={{pointerEvents: "none"}} />',
      "() => null",
    ),
  );
  const graph = await collectGlobalVisualSourceGraph({ ...input, theme });
  assert.equal(graph.files.length, 1);
});

test("candidate Composition compiles its isolated import graph and rejects its type errors", async (context) => {
  const input = await fixture(context);
  await compileTargetProjectComposition(input);
  await writeFile(
    input.sourcePath,
    `${validSource}\nexport const invalid: string = 123;\n`,
  );
  await assert.rejects(
    compileTargetProjectComposition(input),
    /compile failed \(TS2322/u,
  );
});

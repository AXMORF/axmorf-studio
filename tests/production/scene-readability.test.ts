import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  createFingerprint,
  resolveProductionReadabilityPolicy,
} from "../../src/contracts";
import { validatePolicyAwareRendererSourceGraph } from "../../scripts/production/readability-source-validator";
import { validateSceneReadability } from "../../scripts/production/readability-validator";
import type { SceneAssignment } from "../../src/contracts";
import { collectRendererSourceGraph } from "../../scripts/renderer-registry/domain";

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-readability-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const rendererPath = "src/projects/future-story/scenes/opening/Renderer.tsx";
  const write = async (path: string, source: string) => {
    const destination = join(rootDir, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, source);
    return path;
  };
  return {
    rootDir,
    rendererPath,
    policy: resolveProductionReadabilityPolicy({ width: 1080, height: 1920 }),
    write,
  } as const;
};

const renderer = (content: string) => `
import {SceneBackground, SceneContentFrame} from "../../../../remotion/runtime/readability";
const Renderer = ({readabilityPolicy}: {readabilityPolicy: unknown}) => (
  <>
    <SceneBackground><svg><rect width="1080" height="1920" /></svg></SceneBackground>
    <SceneContentFrame policy={readabilityPolicy}>${content}</SceneContentFrame>
  </>
);
export default Renderer;
`;

const semanticRenderer = (content: string) => `
const Renderer = () => (
  <div style={{position: "absolute", inset: 0}}>${content}</div>
);
export default Renderer;
`;

test("accepts static HTML and SVG text at the frozen minimum", async (context) => {
  const fixture = await createFixture(context);
  await fixture.write(
    fixture.rendererPath,
    renderer(`
      <div style={{fontSize: "36px"}}>Readable HTML</div>
      <svg><text fontSize={36}>Readable SVG</text></svg>
    `),
  );
  const result = await validatePolicyAwareRendererSourceGraph({
    ...fixture,
    sourcePaths: [fixture.rendererPath],
  });
  assert.equal(result.policyFingerprint, fixture.policy.policyFingerprint);
  assert.equal(result.minimumEffectiveFontSizePx, 36);
});

test("rejects 32 34 and 35px while accepting constants at 36px", async (context) => {
  for (const size of [32, 34, 35] as const) {
    await context.test(String(size), async (child) => {
      const fixture = await createFixture(child);
      await fixture.write(
        fixture.rendererPath,
        renderer(`<div style={{fontSize: ${size}}}>Too small</div>`),
      );
      await assert.rejects(
        () =>
          validatePolicyAwareRendererSourceGraph({
            ...fixture,
            sourcePaths: [fixture.rendererPath],
          }),
        new RegExp(`${size}.*36|36.*${size}`, "iu"),
      );
    });
  }
  const fixture = await createFixture(context);
  await fixture.write(
    fixture.rendererPath,
    `const BODY_SIZE = 36;\n${renderer(
      `<div style={{fontSize: BODY_SIZE}}>Constant size</div>`,
    )}`,
  );
  await validatePolicyAwareRendererSourceGraph({
    ...fixture,
    sourcePaths: [fixture.rendererPath],
  });
});

test("fails closed for inherited unknown relative and scaled-down font sizes", async (context) => {
  const cases = [
    `<div>Inherited</div>`,
    `<div style={{fontSize: dynamicSize}}>Unknown</div>`,
    `<div style={{fontSize: "2rem"}}>Relative</div>`,
    `<div style={{fontSize: "calc(36px + 1px)"}}>Calculated</div>`,
    `<div style={{transform: "scale(0.9)", fontSize: 36}}>Scaled</div>`,
    `<g transform={dynamicTransform}><text fontSize="40">Unknown scale</text></g>`,
  ];
  for (const [index, content] of cases.entries()) {
    await context.test(String(index), async (child) => {
      const fixture = await createFixture(child);
      await fixture.write(fixture.rendererPath, renderer(content));
      await assert.rejects(() =>
        validatePolicyAwareRendererSourceGraph({
          ...fixture,
          sourcePaths: [fixture.rendererPath],
        }),
      );
    });
  }
});

test("checks project-local component files in the complete source graph", async (context) => {
  const fixture = await createFixture(context);
  const labelPath = "src/projects/future-story/scenes/opening/Label.tsx";
  await fixture.write(
    fixture.rendererPath,
    `import {Label} from "./Label";\n${renderer("<Label />")}`,
  );
  await fixture.write(
    labelPath,
    `export const Label = () => <div style={{fontSize: "32px"}}>Local label</div>;`,
  );
  await assert.rejects(
    () =>
      validatePolicyAwareRendererSourceGraph({
        ...fixture,
        sourcePaths: [fixture.rendererPath, labelPath],
      }),
    /32.*36|36.*32/iu,
  );
});

test("requires one guarded content root and rejects Scene-owned captions", async (context) => {
  const fixture = await createFixture(context);
  for (const source of [
    `const Renderer = () => <div style={{fontSize: 36}}>No safe frame</div>; export default Renderer;`,
    `import {CaptionLayer} from "x"; ${renderer("<CaptionLayer />")}`,
    `
      import {SceneBackground, SceneContentFrame} from "../../../../remotion/runtime/readability";
      const Renderer = ({readabilityPolicy}: {readabilityPolicy: unknown}) => (
        <>
          <SceneBackground />
          <SceneContentFrame policy={readabilityPolicy}><div style={{fontSize: 36}}>Inside</div></SceneContentFrame>
          <div style={{fontSize: 36}}>Bypass</div>
        </>
      );
      export default Renderer;
    `,
  ]) {
    await fixture.write(fixture.rendererPath, source);
    await assert.rejects(() =>
      validatePolicyAwareRendererSourceGraph({
        ...fixture,
        sourcePaths: [fixture.rendererPath],
      }),
    );
  }
});

test("the shared submit watcher checker is check-only and byte-mtime stable", async (context) => {
  const fixture = await createFixture(context);
  await fixture.write(
    fixture.rendererPath,
    renderer(`<div style={{fontSize: 36}}>Stable</div>`),
  );
  const destination = join(fixture.rootDir, fixture.rendererPath);
  const before = {
    bytes: await readFile(destination),
    mtime: (await stat(destination)).mtimeMs,
  };
  const assignment = {
    schemaVersion: 2,
    readabilityPolicy: fixture.policy,
  } as SceneAssignment;
  const graph = {
    rendererPath: fixture.rendererPath,
    files: [{ sourcePath: fixture.rendererPath, checksum: "unused" }],
    sourceGraphFingerprint: createFingerprint({
      namespace: "scene-readability-test-source-graph",
      version: 1,
      value: [fixture.rendererPath],
    }),
  } as const;
  const first = await validateSceneReadability({
    rootDir: fixture.rootDir,
    assignment,
    graph,
  });
  const second = await validateSceneReadability({
    rootDir: fixture.rootDir,
    assignment,
    graph,
  });
  assert.deepEqual(second, first);
  assert.deepEqual(await readFile(destination), before.bytes);
  assert.equal((await stat(destination)).mtimeMs, before.mtime);
});

test("v3 accepts semantic-only Renderer and binds the shared boundary identities", async (context) => {
  const fixture = await createFixture(context);
  await fixture.write(
    fixture.rendererPath,
    semanticRenderer(`<div style={{fontSize: 36}}>Shared boundary</div>`),
  );
  const graph = await collectRendererSourceGraph({
    rootDir: fixture.rootDir,
    projectId: "future-story",
    rendererPath: fixture.rendererPath,
  });
  const assignment = {
    schemaVersion: 3,
    storyId: "future-story",
    readabilityPolicy: fixture.policy,
    sceneCompositionBoundaryVersion: "scene-composition-boundary-v1",
    taskInput: {
      schemaVersion: 3,
      sceneCompositionBoundaryVersion: "scene-composition-boundary-v1",
    },
  } as SceneAssignment;
  const result = await validateSceneReadability({
    rootDir: fixture.rootDir,
    assignment,
    graph,
  });
  assert.equal(result.policyFingerprint, fixture.policy.policyFingerprint);
  assert.equal(result.legacy, false);
  assert.ok("sceneCompositionBoundaryVersion" in result);
  assert.equal(
    result.sceneCompositionBoundaryVersion,
    "scene-composition-boundary-v1",
  );
});

test("v3 rejects Renderer-owned boundary shell caption audio and raw policy", async (context) => {
  for (const [label, source] of [
    ["safe area", semanticRenderer("<SceneSafeArea />")],
    ["background", semanticRenderer("<SceneBackground />")],
    ["caption", semanticRenderer("<CaptionLayer />")],
    ["audio", semanticRenderer("<Audio />")],
    ["raw policy", "const Renderer = ({readabilityPolicy}: any) => <div />; export default Renderer;"],
  ] as const) {
    await context.test(label, async (child) => {
      const fixture = await createFixture(child);
      await fixture.write(fixture.rendererPath, source);
      await assert.rejects(() =>
        validatePolicyAwareRendererSourceGraph({
          ...fixture,
          sourcePaths: [fixture.rendererPath],
          boundaryMode: "shared-v3",
        }),
      );
    });
  }
});

test("the Renderer source graph admits only the fixed readability runtime boundary", async (context) => {
  const fixture = await createFixture(context);
  await fixture.write(
    fixture.rendererPath,
    renderer(`<div style={{fontSize: 36}}>Graph checked</div>`),
  );
  for (const path of [
    "src/remotion/runtime/readability/index.ts",
    "src/remotion/runtime/readability/SceneReadability.tsx",
    "src/remotion/runtime/readability/SceneSafeArea.tsx",
  ]) {
    await fixture.write(
      path,
      await readFile(join(process.cwd(), path), "utf8"),
    );
  }
  const graph = await collectRendererSourceGraph({
    rootDir: fixture.rootDir,
    projectId: "future-story",
    rendererPath: fixture.rendererPath,
  });
  assert.deepEqual(
    graph.files.map(({ sourcePath }) => sourcePath),
    [
      fixture.rendererPath,
      "src/remotion/runtime/readability/index.ts",
      "src/remotion/runtime/readability/SceneReadability.tsx",
      "src/remotion/runtime/readability/SceneSafeArea.tsx",
    ],
  );
});

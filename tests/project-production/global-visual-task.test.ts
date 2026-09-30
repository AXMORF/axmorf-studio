import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildProducerTaskSpec,
  createGlobalVisualPlan,
  deriveGlobalVisualLayerPolicy,
  generateSemanticTiming,
  NarrationSpecSchema,
  RenderSpecSchema,
  resolveSceneReadabilityPolicy,
  serializeCanonicalJson,
  StorySpecSchema,
} from "@axmorf/studio/contracts";
import { checkGlobalVisualTask } from "../../scripts/project-production/application/global-visual-task-check";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const checksum = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const;

const validSource = `
import {useCurrentFrame} from "remotion";
export const GlobalVisualBaseLayer = () => {
  return <div style={{pointerEvents: "none"}} />;
};
export const GlobalVisualDecorationLayers = () => {
  const frame = useCurrentFrame();
  return <div style={{opacity: frame >= 0 ? 1 : 0, pointerEvents: "none"}} />;
};
`;

const theme = {
  background: "#111827",
  primaryText: "#f9fafb",
  secondaryText: "#d1d5db",
  accent: "#fbbf24",
} as const;
const themedSource = validSource.replace(
  'return <div style={{pointerEvents: "none"}} />;',
  "return null;",
);

const buildFixture = ({
  planWidth = 1920,
  planCompositionId = validRenderSpec.compositionId,
  motifWindows = [],
  selectedResources = [],
  source = validSource,
  visualTheme,
}: {
  readonly planWidth?: number;
  readonly planCompositionId?: string;
  readonly motifWindows?: readonly Readonly<{
    startFrame: number;
    endFrame: number;
    axis: "x" | "y";
    direction: -1 | 1;
  }>[];
  readonly selectedResources?: readonly unknown[];
  readonly source?: string;
  readonly visualTheme?: typeof theme;
} = {}) => {
  const timing = generateSemanticTiming({
    story: StorySpecSchema.parse(validStorySpec),
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    render: RenderSpecSchema.parse(validRenderSpec),
    sealedNarration: buildValidSealedNarrationManifest(),
  });
  const readabilityPolicy = resolveSceneReadabilityPolicy({
    width: validRenderSpec.width,
    height: validRenderSpec.height,
  });
  const catalogFingerprint = sha("a");
  const context = {
    story: { storyId: validStorySpec.storyId },
    render: RenderSpecSchema.parse(validRenderSpec),
    timing,
    layerPolicy: deriveGlobalVisualLayerPolicy(timing),
    requirements: { readabilityPolicy },
    resourcePool: {
      allowedResourceIds: ["asset.allowed-global"],
      resourceCatalogFingerprint: catalogFingerprint,
    },
    ...(visualTheme === undefined
      ? {}
      : { visualStyle: { theme: visualTheme } }),
  };
  const plan = createGlobalVisualPlan({
    schemaVersion: 1,
    planVersion: "global-visual-plan-v1",
    storyId: validStorySpec.storyId,
    compositionId: planCompositionId,
    width: planWidth,
    height: validRenderSpec.height,
    fps: timing.fps,
    durationInFrames: timing.durationInFrames,
    captionSafeArea: readabilityPolicy.captionSafeAreaPx,
    catalogFingerprint,
    frameTreatment: {
      inset: 24,
      borderWidth: 2,
      borderColor: "#ffffff",
      borderOpacity: 0.2,
      vignetteOpacity: 0.1,
      grainOpacity: 0.05,
    },
    continuityMotif: {
      color: "#00ccee",
      strokeWidth: 3,
      opacity: 0.3,
      motionPolicy: "linear-frame-progress-v1",
      windows: motifWindows,
    },
  });
  return { context, plan, selectedResources, source } as const;
};

const createGlobalWorkspace = async ({
  rootDir,
  fixture = buildFixture(),
}: {
  readonly rootDir: string;
  readonly fixture?: ReturnType<typeof buildFixture>;
}) => {
  const contextBytes = `${serializeCanonicalJson(fixture.context)}\n`;
  const task = buildProducerTaskSpec({
    taskKind: "global-visual-owner",
    storyId: validStorySpec.storyId,
    semanticId: null,
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      {
        id: "read:inputs/context.json",
        fingerprint: checksum(contextBytes),
      },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: [
      "project/global-visual-plan.json",
      "src/GlobalVisualLayers.tsx",
      "src/selected-resources.json",
    ],
    validatorPolicyVersion: "global-visual-owner-validator-v3",
  });
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: { "inputs/context.json": contextBytes },
  });
  await mkdir(join(workspace, "project"), { recursive: true });
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(
    join(workspace, "project/global-visual-plan.json"),
    `${JSON.stringify(fixture.plan)}\n`,
  );
  await writeFile(
    join(workspace, "src/GlobalVisualLayers.tsx"),
    fixture.source,
  );
  await writeFile(
    join(workspace, "src/selected-resources.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      selectedResources: fixture.selectedResources,
    })}\n`,
  );
  const repositoryRoot = join(import.meta.dirname, "../..");
  const compilerConfig = JSON.parse(
    await readFile(join(repositoryRoot, "tsconfig.json"), "utf8"),
  ) as { compilerOptions: Record<string, unknown> };
  compilerConfig.compilerOptions.baseUrl = repositoryRoot;
  compilerConfig.compilerOptions.paths = {
    ...(compilerConfig.compilerOptions.paths as Record<string, string[]>),
    remotion: [
      join(repositoryRoot, "node_modules/remotion/dist/cjs/index.d.ts"),
    ],
    "react/jsx-runtime": [
      join(repositoryRoot, "node_modules/@types/react/jsx-runtime.d.ts"),
    ],
  };
  await writeFile(
    join(rootDir, "tsconfig.json"),
    `${JSON.stringify(compilerConfig, null, 2)}\n`,
  );
  return task;
};

test("GlobalVisual task accepts canonical context whose inset key order differs from the parsed plan", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-task-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({ rootDir });

  assert.equal(
    (
      await checkGlobalVisualTask({
        rootDir,
        taskRevision: task.taskRevision,
      })
    ).status,
    "task-workspace-valid",
  );
});

test("themed GlobalVisual task accepts an empty base while Composition owns the background", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-global-themed-base-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({ source: themedSource, visualTheme: theme }),
  });
  assert.equal(
    (await checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }))
      .status,
    "task-workspace-valid",
  );
});

test("themed GlobalVisual task rejects any authored base rendering or indirect null", async (context) => {
  for (const [index, source] of [
    validSource,
    themedSource.replace("return null;", "const value = null; return value;"),
    themedSource.replace("return null;", "if (true) return null; return null;"),
    themedSource.replace(
      "GlobalVisualBaseLayer = ()",
      "GlobalVisualBaseLayer = (_props = {})",
    ),
  ].entries()) {
    const rootDir = await mkdtemp(
      join(tmpdir(), `axmorf-global-themed-reject-${index}-`),
    );
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    const task = await createGlobalWorkspace({
      rootDir,
      fixture: buildFixture({ source, visualTheme: theme }),
    });
    await assert.rejects(
      checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
      /GlobalVisualBaseLayer must directly return null without parameters/u,
    );
  }
});

test("GlobalVisual task rejects a valid plan whose dimensions cross the frozen context", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-plan-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({ planWidth: 1919 }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
    /plan is stale/u,
  );
});

test("GlobalVisual task rejects a plan whose Composition identity crosses RenderSpec", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-global-composition-boundary-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({ planCompositionId: validStorySpec.storyId }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
    /plan is stale/u,
  );
});

test("GlobalVisual task rejects resources outside its exact role and allowlist", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-global-resource-boundary-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({
      selectedResources: [
        {
          schemaVersion: 1,
          resourceId: "asset.not-allowed",
          kind: "asset",
          role: "scene-visual",
          descriptorFingerprint: sha("b"),
          catalogFingerprint: sha("a"),
        },
      ],
    }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
    /outside the task allowlist/u,
  );
});

test("GlobalVisual task rejects source that crosses into audio ownership", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-source-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({
      source: `${validSource}\nconst Audio = null;\nvoid Audio;\n`,
    }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
    /visual-only boundary/u,
  );
});

test("GlobalVisual task rejects decoration windows outside narrated content", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-window-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({
      motifWindows: [{ startFrame: 0, endFrame: 10, axis: "x", direction: 1 }],
    }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
    /plan is stale/u,
  );
});

test("GlobalVisual task rejects the legacy single-layer export", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-legacy-layer-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({
      source: `
import {useCurrentFrame} from "remotion";
export const GlobalVisualLayers = () => {
  const frame = useCurrentFrame();
  return <div style={{opacity: frame >= 0 ? 1 : 0, pointerEvents: "none"}} />;
};
`,
    }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
    /GlobalVisualBaseLayer and GlobalVisualDecorationLayers/u,
  );
});

test("GlobalVisual task requires both layer exports to be zero-props components", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-props-layer-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({
      source: `
import {useCurrentFrame} from "remotion";
type BaseProps = {readonly opacity: number};
export const GlobalVisualBaseLayer = (_props: BaseProps) => {
  return <div style={{pointerEvents: "none"}} />;
};
export const GlobalVisualDecorationLayers = () => {
  const frame = useCurrentFrame();
  return <div style={{opacity: frame >= 0 ? 1 : 0, pointerEvents: "none"}} />;
};
`,
    }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
    /component interface compile/u,
  );
});

test("GlobalVisual task requires the base component to own pointer transparency", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-base-pointer-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({
      source: validSource.replace(
        '<div style={{pointerEvents: "none"}} />',
        "<div />",
      ),
    }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
    /GlobalVisualBaseLayer root must declare pointerEvents none/u,
  );
});

test("GlobalVisual task requires the decoration component to own pointer transparency", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-global-decoration-pointer-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({
      source: validSource.replace(
        '<div style={{opacity: frame >= 0 ? 1 : 0, pointerEvents: "none"}} />',
        "<div style={{opacity: frame >= 0 ? 1 : 0}} />",
      ),
    }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
    /GlobalVisualDecorationLayers root must declare pointerEvents none/u,
  );
});

test("GlobalVisual task requires frame motion inside the decoration component", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-decoration-frame-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({
      source: `
import {useCurrentFrame} from "remotion";
export const GlobalVisualBaseLayer = () => {
  return <div style={{pointerEvents: "none"}} />;
};
export const GlobalVisualDecorationLayers = () => {
  return <div style={{pointerEvents: "none"}} />;
};
`,
    }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
    /must directly call useCurrentFrame imported from remotion/u,
  );
});

test("GlobalVisual task requires a direct Remotion useCurrentFrame binding", async (context) => {
  const invalidSources = [
    validSource.replace(
      'import {useCurrentFrame} from "remotion";',
      "const useCurrentFrame = () => 0;",
    ),
    validSource.replace(
      "  const frame = useCurrentFrame();",
      "  const useCurrentFrame = () => 0;\n  const frame = useCurrentFrame();",
    ),
    validSource
      .replace(
        'import {useCurrentFrame} from "remotion";',
        'import {useCurrentFrame as remotionFrame} from "remotion";\nconst readFrame = () => remotionFrame();',
      )
      .replace("useCurrentFrame()", "readFrame()"),
  ];

  for (const [index, source] of invalidSources.entries()) {
    const rootDir = await mkdtemp(
      join(tmpdir(), `rsp-global-frame-binding-${index}-`),
    );
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    const task = await createGlobalWorkspace({
      rootDir,
      fixture: buildFixture({ source }),
    });

    await assert.rejects(
      checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
      /must directly call useCurrentFrame imported from remotion/u,
    );
  }
});

test("GlobalVisual task rejects visible or unproven JSX child expressions", async (context) => {
  for (const [index, expression] of [
    '{"VISIBLE TEXT"}',
    "{123}",
    "{label}",
    "{makeText()}",
  ].entries()) {
    const rootDir = await mkdtemp(
      join(tmpdir(), `rsp-global-expression-copy-${index}-`),
    );
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    const source = validSource.replace(
      '<div style={{opacity: frame >= 0 ? 1 : 0, pointerEvents: "none"}} />',
      `<div style={{opacity: frame >= 0 ? 1 : 0, pointerEvents: "none"}}>${expression}</div>`,
    );
    const task = await createGlobalWorkspace({
      rootDir,
      fixture: buildFixture({ source }),
    });

    await assert.rejects(
      checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
      /visual-only boundary: visible text/u,
    );
  }
});

test("GlobalVisual task preserves element-valued dynamic visual expressions", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-dynamic-visual-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const source = validSource.replace(
    '<div style={{opacity: frame >= 0 ? 1 : 0, pointerEvents: "none"}} />',
    '<div style={{opacity: frame >= 0 ? 1 : 0, pointerEvents: "none"}}>{frame >= 0 ? <span /> : null}</div>',
  );
  const task = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({ source }),
  });

  assert.equal(
    (await checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }))
      .status,
    "task-workspace-valid",
  );
});

test("GlobalVisual task rejects pointer transparency detached from the returned root", async (context) => {
  const invalidBaseBodies = [
    `const unusedStyle = {pointerEvents: "none"};
  void unusedStyle;
  return <div />;`,
    'return <div><span style={{pointerEvents: "none"}} /></div>;',
  ];

  for (const [index, baseBody] of invalidBaseBodies.entries()) {
    const rootDir = await mkdtemp(
      join(tmpdir(), `rsp-global-detached-pointer-${index}-`),
    );
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    const source = validSource.replace(
      'return <div style={{pointerEvents: "none"}} />;',
      baseBody,
    );
    const task = await createGlobalWorkspace({
      rootDir,
      fixture: buildFixture({ source }),
    });

    await assert.rejects(
      checkGlobalVisualTask({ rootDir, taskRevision: task.taskRevision }),
      /GlobalVisualBaseLayer root must declare pointerEvents none/u,
    );
  }
});

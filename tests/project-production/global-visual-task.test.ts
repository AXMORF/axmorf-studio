import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildProducerTaskSpec,
  createGlobalVisualPlan,
  generateSemanticTiming,
  NarrationSpecSchema,
  RenderSpecSchema,
  resolveSceneReadabilityPolicy,
  serializeCanonicalJson,
  StorySpecSchema,
} from "../../src/contracts";
import { checkGlobalVisualTask } from "../../scripts/project-production/application/global-visual-task-check";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import {
  createProductionLocations,
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";
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
const useCurrentFrame = () => 0;
const rootStyle = {pointerEvents: "none"};
export const GlobalVisualLayers = () => {
  const frame = useCurrentFrame();
  return frame >= 0 ? null : null;
};
void rootStyle;
`;

const buildFixture = ({
  planWidth = 1920,
  planCompositionId = validRenderSpec.compositionId,
  selectedResources = [],
  source = validSource,
}: {
  readonly planWidth?: number;
  readonly planCompositionId?: string;
  readonly selectedResources?: readonly unknown[];
  readonly source?: string;
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
    requirements: { readabilityPolicy },
    resourcePool: {
      allowedResourceIds: ["asset.allowed-global"],
      resourceCatalogFingerprint: catalogFingerprint,
    },
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
      windows: [],
    },
  });
  return { context, plan, selectedResources, source } as const;
};

const createGlobalWorkspace = async ({
  rootDir,
  fixture = buildFixture(),
  locations = createProductionLocations({
    ...createRepositoryProductionLocations({ repositoryRoot: rootDir }),
    runtimeResources: join(import.meta.dirname, "../.."),
  }),
}: {
  readonly rootDir: string;
  readonly fixture?: ReturnType<typeof buildFixture>;
  readonly locations?: ReturnType<typeof createProductionLocations>;
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
    validatorPolicyVersion: "global-visual-owner-validator-v1",
  });
  const workspace = await createTaskWorkspace({
    locations,
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
  return { locations, task } as const;
};

test("GlobalVisual task accepts canonical context whose inset key order differs from the parsed plan", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-task-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { locations, task } = await createGlobalWorkspace({ rootDir });

  assert.equal(
    (
      await checkGlobalVisualTask({
        locations,
        taskRevision: task.taskRevision,
      })
    ).status,
    "task-workspace-valid",
  );
});

test("Workspace GlobalVisual task compiles against the Runtime Pack source root", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-pack-source-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const runtimeResources = join(rootDir, "runtime-pack");
  await mkdir(join(runtimeResources, "source"), { recursive: true });
  await writeFile(
    join(runtimeResources, "source/tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "Preserve",
        moduleResolution: "Bundler",
        jsx: "preserve",
        strict: true,
        noEmit: true,
      },
    })}\n`,
  );
  await cp(
    join(import.meta.dirname, "../../node_modules/typescript/lib"),
    join(runtimeResources, "node_modules/typescript/lib"),
    { recursive: true },
  );
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(rootDir, "workspace"),
    applicationSupportRoot: join(rootDir, "support"),
    runtimeResources,
    cacheRoot: join(rootDir, "cache"),
  });
  const { task } = await createGlobalWorkspace({ rootDir, locations });

  assert.equal(
    (await checkGlobalVisualTask({ locations, taskRevision: task.taskRevision }))
      .status,
    "task-workspace-valid",
  );
});

test("GlobalVisual task rejects a valid plan whose dimensions cross the frozen context", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-plan-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { locations, task } = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({ planWidth: 1919 }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ locations, taskRevision: task.taskRevision }),
    /plan is stale/u,
  );
});

test("GlobalVisual task rejects a plan whose Composition identity crosses RenderSpec", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-global-composition-boundary-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { locations, task } = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({ planCompositionId: validStorySpec.storyId }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ locations, taskRevision: task.taskRevision }),
    /plan is stale/u,
  );
});

test("GlobalVisual task rejects resources outside its exact role and allowlist", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-global-resource-boundary-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { locations, task } = await createGlobalWorkspace({
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
    checkGlobalVisualTask({ locations, taskRevision: task.taskRevision }),
    /outside the task allowlist/u,
  );
});

test("GlobalVisual task rejects source that crosses into audio ownership", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-source-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const { locations, task } = await createGlobalWorkspace({
    rootDir,
    fixture: buildFixture({
      source: `${validSource}\nconst Audio = null;\nvoid Audio;\n`,
    }),
  });

  await assert.rejects(
    checkGlobalVisualTask({ locations, taskRevision: task.taskRevision }),
    /visual-only boundary/u,
  );
});

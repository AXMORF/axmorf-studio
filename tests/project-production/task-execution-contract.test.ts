import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  GlobalVisualPlanSchema,
  NarrationSpecSchema,
  RenderSpecSchema,
  SCENE_ORIGINALITY_INPUT_ID,
  SceneVisualPlanSchema,
  StorySpecSchema,
  buildProducerTaskSpec,
  buildSceneOriginalityBaseline,
  deriveGlobalVisualLayerPolicy,
  generateSemanticTiming,
  resolveSceneReadabilityPolicy,
  serializeCanonicalJson,
  type ProducerTaskSpec,
} from "@axmorf/studio/contracts";
import { reportCliFailure } from "../../packages/studio/src/cli/failure";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import {
  AgentTaskFinalizationError,
  finalizeAgentTaskWorkspace,
} from "../../scripts/project-production/application/finalize-agent-task";
import {
  assertTaskExecutionContractMatchesTask,
  buildTaskExecutionContract,
} from "../../scripts/project-production/application/task-execution-contract";
import { createScenePackageInput } from "../fixtures/scene/package-input";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

const checksum = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const;

const writeOutputExamples = async ({
  workspace,
  contract,
}: {
  readonly workspace: string;
  readonly contract: ReturnType<typeof buildTaskExecutionContract>;
}) => {
  for (const output of contract.outputs) {
    const destination = join(workspace, output.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(
      destination,
      output.format === "json"
        ? `${serializeCanonicalJson(output.example)}\n`
        : String(output.example),
    );
  }
};

const createAgentWorkspace = async ({
  rootDir,
  taskKind,
  storyId,
  semanticId,
  context,
  validatorPolicyVersion,
  additionalInputFingerprints = [],
}: {
  readonly rootDir: string;
  readonly taskKind: "scene-owner" | "global-visual-owner" | "cover-owner";
  readonly storyId: string;
  readonly semanticId: string | null;
  readonly context: unknown;
  readonly validatorPolicyVersion: string;
  readonly additionalInputFingerprints?: ProducerTaskSpec["inputFingerprints"];
}) => {
  const contract = buildTaskExecutionContract({ taskKind, context });
  const contextBytes = `${serializeCanonicalJson(context)}\n`;
  const contractBytes = `${serializeCanonicalJson(contract)}\n`;
  const task = buildProducerTaskSpec({
    taskKind,
    storyId,
    semanticId,
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      {
        id: "read:inputs/context.json",
        fingerprint: checksum(contextBytes),
      },
      {
        id: "read:inputs/task-contract.json",
        fingerprint: checksum(contractBytes),
      },
      ...additionalInputFingerprints,
    ].sort((left, right) => left.id.localeCompare(right.id)),
    declaredReadSet: ["inputs/context.json", "inputs/task-contract.json"],
    declaredOutputSet: contract.outputs.map(({ path }) => path),
    validatorPolicyVersion,
  });
  assertTaskExecutionContractMatchesTask({ task, contract });
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: {
      "inputs/context.json": contextBytes,
      "inputs/task-contract.json": contractBytes,
    },
  });
  await writeOutputExamples({ workspace, contract });
  return { contract, task, workspace } as const;
};

const buildGlobalContext = () => {
  const story = StorySpecSchema.parse(validStorySpec);
  const render = RenderSpecSchema.parse(validRenderSpec);
  const timing = generateSemanticTiming({
    story,
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    render,
    sealedNarration: buildValidSealedNarrationManifest(),
  });
  return {
    story,
    render,
    timing,
    layerPolicy: deriveGlobalVisualLayerPolicy(timing),
    requirements: {
      readabilityPolicy: resolveSceneReadabilityPolicy({
        width: render.width,
        height: render.height,
      }),
    },
    resourcePool: {
      allowedResourceIds: [],
      resourceCatalogFingerprint: `sha256:${"a".repeat(64)}`,
    },
    visualStyle: {},
    globalVisualBrief: {},
  } as const;
};

test("TaskExecutionContract is npm-native, attempt-neutral, and mechanically matches each Agent output set", () => {
  const sceneFixture = createScenePackageInput();
  const contracts = [
    buildTaskExecutionContract({
      taskKind: "scene-owner",
      context: { scene: { taskInput: sceneFixture.task } },
    }),
    buildTaskExecutionContract({
      taskKind: "global-visual-owner",
      context: buildGlobalContext(),
    }),
    buildTaskExecutionContract({
      taskKind: "cover-owner",
      context: { story: validStorySpec },
    }),
  ];

  for (const contract of contracts) {
    assert.equal(contract.schemaVersion, 1);
    assert.equal(contract.contractVersion, "agent-task-execution-contract-v1");
    assert.deepEqual(contract.immutableInputs, [
      "task.json",
      "inputs/context.json",
      "inputs/task-contract.json",
    ]);
    assert.deepEqual(contract.preflight, {
      bindingRequiredBeforeWrites: true,
      immutableInputFailurePolicy: "abort-zero-write",
      repairableValidationOwner: "agent-output",
    });
    assert.deepEqual(
      contract.outputs.map(({ path }) => path),
      contract.outputs.map(({ path }) => path).sort(),
    );
    for (const output of contract.outputs) {
      assert.ok(
        ["agent", "fixed-finalize", "agent-draft-fixed-finalize"].includes(
          output.owner,
        ),
      );
      assert.ok(output.instructions.length > 0);
      if (output.format === "json") assert.ok(output.jsonSchema);
    }
    const serialized = serializeCanonicalJson(contract);
    assert.doesNotMatch(serialized, /\.rsp|attemptId|bindingId/u);
  }

  const globalSource = contracts[1].outputs.find(
    ({ path }) => path === "src/GlobalVisualLayers.tsx",
  )?.example;
  assert.match(String(globalSource), /GlobalVisualBaseLayer/u);
  assert.match(String(globalSource), /GlobalVisualDecorationLayers/u);

  const coverContract = contracts[2];
  const changedCoverContract = {
    ...coverContract,
    purpose: `${coverContract.purpose} Keep the title independently readable.`,
  };
  const buildCoverTask = (contractBytes: string) =>
    buildProducerTaskSpec({
      taskKind: "cover-owner",
      storyId: validStorySpec.storyId,
      semanticId: null,
      revisionId: `revision-${"1".repeat(64)}`,
      dependencyArtifacts: [],
      inputFingerprints: [
        {
          id: "read:inputs/context.json",
          fingerprint: checksum("{}\n"),
        },
        {
          id: "read:inputs/task-contract.json",
          fingerprint: checksum(contractBytes),
        },
      ],
      declaredReadSet: ["inputs/context.json", "inputs/task-contract.json"],
      declaredOutputSet: coverContract.outputs.map(({ path }) => path),
      validatorPolicyVersion: "cover-owner-validator-v1",
    });
  assert.notEqual(
    buildCoverTask(`${serializeCanonicalJson(coverContract)}\n`).taskRevision,
    buildCoverTask(`${serializeCanonicalJson(changedCoverContract)}\n`)
      .taskRevision,
  );
});

test("Scene finalization recomputes task-bound derived JSON atomically and passes the fixed checker", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-task-finalize-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = createScenePackageInput();
  const originalityBaseline = buildSceneOriginalityBaseline({
    subjectStoryId: fixture.task.storyId,
    entries: [],
  });
  const created = await createAgentWorkspace({
    rootDir,
    taskKind: "scene-owner",
    storyId: fixture.task.storyId,
    semanticId: fixture.task.meaningId,
    context: {
      originalityBaseline,
      scene: { taskInput: fixture.task },
    },
    validatorPolicyVersion: "scene-owner-validator-v4",
    additionalInputFingerprints: [
      {
        id: SCENE_ORIGINALITY_INPUT_ID,
        fingerprint: originalityBaseline.baselineFingerprint,
      },
    ],
  });
  const repositoryRoot = join(import.meta.dirname, "../..");
  const compilerConfig = JSON.parse(
    await readFile(join(repositoryRoot, "tsconfig.json"), "utf8"),
  ) as { compilerOptions: Record<string, unknown> };
  compilerConfig.compilerOptions.baseUrl = repositoryRoot;
  await writeFile(
    join(rootDir, "tsconfig.json"),
    `${JSON.stringify(compilerConfig, null, 2)}\n`,
  );

  const visualPath = join(created.workspace, "src/visual-plan.json");
  const visualDraft = JSON.parse(await readFile(visualPath, "utf8")) as Record<
    string,
    unknown
  >;
  visualDraft.taskInputFingerprint = `sha256:${"b".repeat(64)}`;
  visualDraft.meaningId = "stale-meaning";
  visualDraft.visualPlanFingerprint = `sha256:${"c".repeat(64)}`;
  await writeFile(visualPath, `${JSON.stringify(visualDraft, null, 2)}\n`);

  const result = await finalizeAgentTaskWorkspace({
    rootDir,
    taskRevision: created.task.taskRevision,
  });
  assert.deepEqual(result, {
    status: "agent-task-finalized",
    taskRevision: created.task.taskRevision,
    taskKind: "scene-owner",
    checkStatus: "task-workspace-valid",
  });
  const finalizedVisual = SceneVisualPlanSchema.parse(
    JSON.parse(await readFile(visualPath, "utf8")),
  );
  assert.equal(finalizedVisual.meaningId, fixture.task.meaningId);
  assert.equal(
    finalizedVisual.taskInputFingerprint,
    fixture.task.taskInputFingerprint,
  );
  assert.equal(
    await readFile(visualPath, "utf8"),
    `${serializeCanonicalJson(finalizedVisual)}\n`,
  );
});

test("Scene shot range schema failures identify agent output and write no derived outputs", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-task-finalize-range-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = createScenePackageInput();
  const baseline = buildSceneOriginalityBaseline({
    subjectStoryId: fixture.task.storyId,
    entries: [],
  });
  const created = await createAgentWorkspace({
    rootDir,
    taskKind: "scene-owner",
    storyId: fixture.task.storyId,
    semanticId: fixture.task.meaningId,
    context: {
      originalityBaseline: baseline,
      scene: { taskInput: fixture.task },
    },
    validatorPolicyVersion: "scene-owner-validator-v4",
    additionalInputFingerprints: [
      {
        id: SCENE_ORIGINALITY_INPUT_ID,
        fingerprint: baseline.baselineFingerprint,
      },
    ],
  });
  await writeOutputExamples({
    workspace: created.workspace,
    contract: created.contract,
  });
  const shotPath = join(created.workspace, "src/shot-plan.json");
  const shot = JSON.parse(await readFile(shotPath, "utf8")) as {
    shots: Array<{ primaryRange: { endFrame: number } }>;
  };
  shot.shots[0]!.primaryRange.endFrame += 1;
  await writeFile(shotPath, `${JSON.stringify(shot)}\n`);
  const before = await Promise.all(
    created.contract.outputs.map(
      async ({ path }) =>
        [path, await readFile(join(created.workspace, path))] as const,
    ),
  );
  await assert.rejects(
    finalizeAgentTaskWorkspace({
      rootDir,
      taskRevision: created.task.taskRevision,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AgentTaskFinalizationError);
      assert.equal(error.code, "task-output-invalid");
      assert.deepEqual(error.diagnostic, {
        file: "src/shot-plan.json",
        path: ["shots", 0, "primaryRange", "endFrame"],
        code: "custom",
        message: `Shot endFrame ${shot.shots[0]!.primaryRange.endFrame} exceeds the immutable Scene duration ${shot.shots[0]!.primaryRange.endFrame - 1}; use a Scene-local exclusive end no greater than ${shot.shots[0]!.primaryRange.endFrame - 1}.`,
        failureOwner: "agent-output",
        repairHint:
          "Correct the authored JSON in src/shot-plan.json at the reported path to satisfy the schema; keep immutable timing and inputs unchanged, then rerun finalize.",
      });
      const report = reportCliFailure(error);
      assert.equal(report.exitCode, 2);
      assert.deepEqual(
        JSON.parse(report.serialized).diagnostic,
        error.diagnostic,
      );
      return true;
    },
  );
  assert.deepEqual(
    await Promise.all(
      created.contract.outputs.map(
        async ({ path }) =>
          [path, await readFile(join(created.workspace, path))] as const,
      ),
    ),
    before,
  );
  shot.shots[0]!.primaryRange.endFrame -= 1;
  await writeFile(shotPath, `${JSON.stringify(shot)}\n`);
  const repositoryRoot = join(import.meta.dirname, "../..");
  const compilerConfig = JSON.parse(
    await readFile(join(repositoryRoot, "tsconfig.json"), "utf8"),
  );
  compilerConfig.compilerOptions.baseUrl = repositoryRoot;
  await writeFile(
    join(rootDir, "tsconfig.json"),
    JSON.stringify(compilerConfig),
  );
  const finalized = await finalizeAgentTaskWorkspace({
    rootDir,
    taskRevision: created.task.taskRevision,
  });
  assert.equal(finalized.checkStatus, "task-workspace-valid");
  SceneVisualPlanSchema.parse(
    JSON.parse(
      await readFile(join(created.workspace, "src/visual-plan.json"), "utf8"),
    ),
  );
});

test("authored draft schema diagnostics retain exact file ownership and zero-write behavior", async (context) => {
  const cases = [
    [
      "src/visual-plan.json",
      (draft: Record<string, unknown>) => {
        draft.semanticObjective = 42;
      },
    ],
    [
      "src/sound-plan.json",
      (draft: Record<string, unknown>) => {
        draft.contributions = [{}];
      },
    ],
    [
      "src/sync-anchors.json",
      (draft: Record<string, unknown>) => {
        draft.anchors = [
          { eventId: "out-of-range", sceneLocalFrame: 121, purpose: "invalid" },
        ];
      },
    ],
    [
      "src/selected-resources.json",
      (draft: Record<string, unknown>) => {
        draft.selectedResources = [42];
      },
    ],
    [
      "src/shot-recipe-selection.json",
      (draft: Record<string, unknown>) => {
        draft.selections = [{}];
      },
    ],
  ] as const;
  for (const [file, mutate] of cases) {
    const rootDir = await mkdtemp(
      join(tmpdir(), "axmorf-task-draft-diagnostic-"),
    );
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    const fixture = createScenePackageInput();
    const baseline = buildSceneOriginalityBaseline({
      subjectStoryId: fixture.task.storyId,
      entries: [],
    });
    const created = await createAgentWorkspace({
      rootDir,
      taskKind: "scene-owner",
      storyId: fixture.task.storyId,
      semanticId: fixture.task.meaningId,
      context: {
        originalityBaseline: baseline,
        scene: { taskInput: fixture.task },
      },
      validatorPolicyVersion: "scene-owner-validator-v4",
      additionalInputFingerprints: [
        {
          id: SCENE_ORIGINALITY_INPUT_ID,
          fingerprint: baseline.baselineFingerprint,
        },
      ],
    });
    await writeOutputExamples({
      workspace: created.workspace,
      contract: created.contract,
    });
    const target = join(created.workspace, file);
    const draft = JSON.parse(await readFile(target, "utf8")) as Record<
      string,
      unknown
    >;
    mutate(draft);
    await writeFile(target, `${JSON.stringify(draft)}\n`);
    const before = await Promise.all(
      created.contract.outputs.map(
        async ({ path }) =>
          [path, await readFile(join(created.workspace, path))] as const,
      ),
    );
    await assert.rejects(
      finalizeAgentTaskWorkspace({
        rootDir,
        taskRevision: created.task.taskRevision,
      }),
      (error: unknown) => {
        assert.ok(error instanceof AgentTaskFinalizationError);
        assert.equal(error.code, "task-output-invalid");
        assert.equal(error.diagnostic?.file, file);
        assert.equal(error.diagnostic?.failureOwner, "agent-output");
        assert.ok(error.diagnostic?.path.length);
        const report = reportCliFailure(error);
        assert.deepEqual(
          JSON.parse(report.serialized).diagnostic,
          error.diagnostic,
        );
        return true;
      },
    );
    assert.deepEqual(
      await Promise.all(
        created.contract.outputs.map(
          async ({ path }) =>
            [path, await readFile(join(created.workspace, path))] as const,
        ),
      ),
      before,
    );
  }
});

test("Cover finalization is a checked no-op over Agent-authored source", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-cover-finalize-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const created = await createAgentWorkspace({
    rootDir,
    taskKind: "cover-owner",
    storyId: validStorySpec.storyId,
    semanticId: null,
    context: { story: validStorySpec },
    validatorPolicyVersion: "cover-owner-validator-v1",
  });
  const before = await Promise.all(
    created.contract.outputs.map(
      async ({ path }) =>
        [path, await readFile(join(created.workspace, path), "utf8")] as const,
    ),
  );

  const result = await finalizeAgentTaskWorkspace({
    rootDir,
    taskRevision: created.task.taskRevision,
  });

  assert.deepEqual(result, {
    status: "agent-task-finalized",
    taskRevision: created.task.taskRevision,
    taskKind: "cover-owner",
    checkStatus: "task-workspace-valid",
  });
  assert.deepEqual(
    await Promise.all(
      created.contract.outputs.map(
        async ({ path }) =>
          [
            path,
            await readFile(join(created.workspace, path), "utf8"),
          ] as const,
      ),
    ),
    before,
  );
});

test("GlobalVisual finalization rebuilds its canonical plan fingerprint", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-global-finalize-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const created = await createAgentWorkspace({
    rootDir,
    taskKind: "global-visual-owner",
    storyId: validStorySpec.storyId,
    semanticId: null,
    context: buildGlobalContext(),
    validatorPolicyVersion: "global-visual-owner-validator-v2",
  });
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
  const planPath = join(created.workspace, "project/global-visual-plan.json");
  const draft = JSON.parse(await readFile(planPath, "utf8")) as Record<
    string,
    unknown
  >;
  draft.planFingerprint = `sha256:${"b".repeat(64)}`;
  await writeFile(planPath, `${JSON.stringify(draft, null, 2)}\n`);

  const result = await finalizeAgentTaskWorkspace({
    rootDir,
    taskRevision: created.task.taskRevision,
  });
  const plan = GlobalVisualPlanSchema.parse(
    JSON.parse(await readFile(planPath, "utf8")),
  );
  assert.equal(result.taskKind, "global-visual-owner");
  assert.notEqual(plan.planFingerprint, draft.planFingerprint);
  assert.equal(
    await readFile(planPath, "utf8"),
    `${serializeCanonicalJson(plan)}\n`,
  );
});

test("finalization rejects an output contract that does not exactly match task.json", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-task-contract-drift-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const coverContext = { story: validStorySpec };
  const contract = buildTaskExecutionContract({
    taskKind: "cover-owner",
    context: coverContext,
  });
  const contextBytes = `${serializeCanonicalJson(coverContext)}\n`;
  const contractBytes = `${serializeCanonicalJson(contract)}\n`;
  const task = buildProducerTaskSpec({
    taskKind: "cover-owner",
    storyId: validStorySpec.storyId,
    semanticId: null,
    revisionId: `revision-${"2".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      {
        id: "read:inputs/context.json",
        fingerprint: checksum(contextBytes),
      },
      {
        id: "read:inputs/task-contract.json",
        fingerprint: checksum(contractBytes),
      },
    ],
    declaredReadSet: ["inputs/context.json", "inputs/task-contract.json"],
    declaredOutputSet: ["src/index.ts"],
    validatorPolicyVersion: "cover-owner-validator-v1",
  });
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: {
      "inputs/context.json": contextBytes,
      "inputs/task-contract.json": contractBytes,
    },
  });
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "src/index.ts"), "export {};\n");

  await assert.rejects(
    finalizeAgentTaskWorkspace({ rootDir, taskRevision: task.taskRevision }),
    (error: unknown) => {
      assert.ok(error instanceof AgentTaskFinalizationError);
      assert.equal(error.code, "task-contract-mismatch");
      return true;
    },
  );
});

test("immutable input drift aborts finalization before any Agent output write", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-task-zero-write-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = createScenePackageInput();
  const created = await createAgentWorkspace({
    rootDir,
    taskKind: "scene-owner",
    storyId: fixture.task.storyId,
    semanticId: fixture.task.meaningId,
    context: { scene: { taskInput: fixture.task } },
    validatorPolicyVersion: "scene-owner-validator-v2",
  });
  const visualPath = join(created.workspace, "src/visual-plan.json");
  const visualBefore = '{"agentDraft":"must-remain-byte-identical"}\n';
  await writeFile(visualPath, visualBefore);
  await writeFile(
    join(created.workspace, "inputs/context.json"),
    '{"drifted":true}\n',
  );

  await assert.rejects(
    finalizeAgentTaskWorkspace({
      rootDir,
      taskRevision: created.task.taskRevision,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AgentTaskFinalizationError);
      assert.equal(error.code, "task-workspace-invalid");
      assert.equal(error.diagnostic, undefined);
      return true;
    },
  );
  assert.equal(await readFile(visualPath, "utf8"), visualBefore);
});

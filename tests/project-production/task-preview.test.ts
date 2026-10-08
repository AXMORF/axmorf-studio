import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import {
  SCENE_ORIGINALITY_INPUT_ID,
  buildAuthoringRequirements,
  buildProducerPlan,
  buildProducerTaskSpec,
  buildProjectSoundPlan,
  buildSceneOriginalityBaseline,
  buildSceneTaskInputV7,
  buildTaskWorkerBindingId,
  computeRenderSpecFingerprint,
  computeStoryFingerprint,
  generateVisualSemanticTiming,
  RenderSpecSchema,
  ResourceAssetDescriptorSchema,
  SceneSelectedResourceSchema,
  computeResourceDescriptorFingerprint,
  resolveSceneViewport,
  serializeCanonicalJson,
  StorySpecSchema,
  TaskRevisionSchema,
  VisualStyleSpecSchema,
  type TaskDiagnosticSnapshot,
} from "@axmorf/studio/contracts";
import { createExecutionAttemptForPlan } from "../../scripts/project-production/adapters/attempt-store";
import { checksumBytes } from "../../scripts/project-production/adapters/project-input-snapshot";
import {
  buildSceneTaskPreviewEntry,
  loadSceneTaskPreviewInputs,
  readSceneTaskPreviewSnapshot,
  renderSceneTaskPreview,
  resolveSceneTaskPreviewSize,
} from "../../scripts/project-production/adapters/task-preview-render";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import { buildTaskExecutionContract } from "../../scripts/project-production/application/task-execution-contract";
import type { finalizeAgentTaskWorkspace } from "../../scripts/project-production/application/finalize-agent-task";
import { previewBoundSceneTask } from "../../scripts/project-production/application/task-preview";
import { bindTaskWorker } from "../../scripts/project-production/application/task-worker-binding";
import { runProjectProductionCli } from "../../scripts/project-production/cli";
import type { ProcessRunner } from "../../scripts/shared/process";
import { validRenderSpec, validVideoBrief } from "../fixtures/narrative";
import { createSceneTaskInput, sha } from "../fixtures/scene/scene-input";
import { createSoundRuntimeFixture } from "../fixtures/scene/sound-runtime";

const fixture = async () => {
  const rootDir = await realpath(
    await mkdtemp(join(tmpdir(), "axmorf-task-preview-")),
  );
  const story = StorySpecSchema.parse({
    schemaVersion: 3,
    storyId: "synthetic-proof",
    title: "State change preview",
    beats: [
      {
        kind: "visual-scene",
        meaningId: "meaning-one",
        narrativePurpose: "Show a deterministic state change.",
        durationInFrames: 120,
      },
    ],
  });
  const render = RenderSpecSchema.parse({
    ...validRenderSpec,
    compositionId: "SceneTaskPreview",
  });
  const timing = generateVisualSemanticTiming({ story, render });
  const brief = {
    ...validVideoBrief,
    storyId: story.storyId,
    title: story.title,
  };
  const sound = buildProjectSoundPlan({
    storyId: story.storyId,
    contributions: [],
  });
  const requirements = buildAuthoringRequirements({
    source: { brief, story, narration: null, render, projectSound: sound },
    sourceChecksums: {
      videoBrief: sha("1"),
      storySpec: sha("2"),
      narrationSpec: sha("3"),
      renderSpec: sha("4"),
      projectSound: sha("5"),
    },
    enhancementSelection: {
      storyVisual: "required",
      sound: "allowed",
      globalVisual: "required",
    },
    resourcePolicy: {
      selfAuthoredVisualsAllowed: true,
      unlistedThirdPartyResources: "deny",
    },
    additionalRequirements: [],
    readability: { edgeInsetPx: 90 },
  });
  const taskInput = buildSceneTaskInputV7({
    ...createSceneTaskInput(),
    storyBeat: story.beats[0],
    timingBeat: timing.storyBeats[0],
    storyFingerprint: computeStoryFingerprint(story),
    renderFingerprint: computeRenderSpecFingerprint(render),
    sceneViewport: resolveSceneViewport(requirements.readabilityPolicy),
    allowedResourceIds: [],
    allowedSnapshots: [],
  });
  const visualStyle = VisualStyleSpecSchema.parse({
    schemaVersion: 1,
    storyId: story.storyId,
    styleProfileId: "studio-balanced-v1",
    resourceCatalogFingerprint: taskInput.resourceCatalogFingerprint,
    artDirection: {
      medium: "SVG",
      palette: "Theme roles",
      lighting: "Matte",
      texture: "Minimal",
      compositionGrammar: "One state transition",
      motionLanguage: "Cause then effect",
      typography: "Readable",
    },
    theme: {
      background: "#020617",
      primaryText: "#f8fafc",
      secondaryText: "#cbd5e1",
      accent: "#67e8f9",
    },
    continuityRules: [],
    forbiddenTreatments: [],
  });
  const originalityBaseline = buildSceneOriginalityBaseline({
    subjectStoryId: story.storyId,
    entries: [],
  });
  const taskContext = {
    originalityBaseline,
    scene: {
      taskInput,
      brief: {
        meaningId: taskInput.meaningId,
        visualIntent: "Show the state change.",
        compositionIntent: "Keep one focal object.",
        motionIntent: "Cause then effect.",
        soundIntent: "No narration.",
        continuityBrief: taskInput.continuity.continuityBrief,
        candidateResourceIds: [],
        allowedSnapshotCards: [],
      },
      visualStyle,
      availableResources: [],
      narrationCues: [],
      fps: render.fps,
    },
  };
  const contract = buildTaskExecutionContract({
    taskKind: "scene-owner",
    context: taskContext,
  });
  const contextBytes = `${serializeCanonicalJson(taskContext)}\n`;
  const contractBytes = `${serializeCanonicalJson(contract)}\n`;
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: story.storyId,
    semanticId: taskInput.meaningId,
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      {
        id: "read:inputs/context.json",
        fingerprint: checksumBytes(new TextEncoder().encode(contextBytes)),
      },
      {
        id: "read:inputs/task-contract.json",
        fingerprint: checksumBytes(new TextEncoder().encode(contractBytes)),
      },
      {
        id: SCENE_ORIGINALITY_INPUT_ID,
        fingerprint: originalityBaseline.baselineFingerprint,
      },
    ].sort((left, right) => left.id.localeCompare(right.id)),
    declaredReadSet: ["inputs/context.json", "inputs/task-contract.json"],
    declaredOutputSet: contract.outputs.map(({ path }) => path),
    validatorPolicyVersion: "scene-owner-validator-v6",
  });
  const seedFiles = Object.fromEntries(
    contract.outputs.map((output) => [
      output.path,
      output.format === "json"
        ? `${serializeCanonicalJson(output.example)}\n`
        : String(output.example),
    ]),
  );
  seedFiles["src/Renderer.tsx"] =
    `import type {SceneRendererProps} from "@axmorf/studio/remotion";
const Renderer = ({viewportWidth, viewportHeight, sceneFrame}: SceneRendererProps) => <div style={{width: viewportWidth, height: viewportHeight, opacity: sceneFrame < 60 ? .5 : 1}}/>;
export default Renderer;\n`;
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: {
      ...seedFiles,
      "inputs/context.json": contextBytes,
      "inputs/task-contract.json": contractBytes,
    },
  });
  const decision = {
    taskRevision: task.taskRevision,
    baselineTaskRevision: null,
    taskKind: task.taskKind,
    subject: { kind: "meaning" as const, id: taskInput.meaningId },
    action: "dispatch-agent" as const,
    artifactState: "missing" as const,
    directChanges: [],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "baseline-unavailable" as const,
  };
  const plan = buildProducerPlan({
    storyId: task.storyId,
    revisionId: task.revisionId,
    artifactSetFingerprint: sha("2"),
    tasks: [decision],
    summary: {
      reusedTaskCount: 0,
      dirtyAgentTaskCount: 1,
      dirtyFixedTaskCount: 0,
      blockedTaskCount: 0,
    },
  });
  const taskSnapshot: TaskDiagnosticSnapshot = {
    taskKind: task.taskKind,
    subject: decision.subject,
    taskRevision: task.taskRevision,
    inputFingerprints: [],
    validatorPolicyVersion: task.validatorPolicyVersion,
    declaredReadSet: task.declaredReadSet,
    declaredOutputSet: task.declaredOutputSet,
    dependencies: [],
    decision,
  };
  const attempt = await createExecutionAttemptForPlan({
    rootDir,
    plan,
    taskSnapshots: [taskSnapshot],
    estimatedCost: {
      providerRequests: 0,
      providerCacheHits: 0,
      agentTasks: 1,
      deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
    },
    actualCost: {
      providerRequests: 0,
      providerCacheHits: 0,
      agentTasks: 1,
      deliveryMedia: [],
    },
    state: "waiting-for-agent",
  });
  const bindingId = buildTaskWorkerBindingId({
    taskRevision: task.taskRevision,
    attemptId: attempt.attemptId,
  });
  const write = async (path: string, bytes: Uint8Array | string) => {
    const destination = join(rootDir, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  };
  for (const [path, value] of Object.entries({
    "story.json": story,
    "render.json": render,
    "brief.json": brief,
    "narration.json": null,
    "production/requirements.json": requirements,
    "generated/semantic-timing.generated.json": timing,
    "generated/sealed-narration.generated.json": null,
    "generated/mastered-narration.generated.json": null,
  })) {
    await write(
      `src/projects/${task.storyId}/${path}`,
      `${serializeCanonicalJson(value)}\n`,
    );
  }
  // Process results are injected. These files exercise the local invocation
  // resolver without launching Chromium or claiming a real rendered video.
  await write("package.json", '{"name":"preview-fixture","type":"module"}\n');
  await write(
    "node_modules/@remotion/cli/package.json",
    '{"name":"@remotion/cli","bin":{"remotion":"remotion-cli.js"}}\n',
  );
  await write(
    "node_modules/@remotion/cli/remotion-cli.js",
    "// Mock CLI used only by injected test runner.\n",
  );
  const repositoryRoot = join(import.meta.dirname, "../..");
  const compilerConfig = JSON.parse(
    await readFile(join(repositoryRoot, "tsconfig.json"), "utf8"),
  );
  compilerConfig.compilerOptions.baseUrl = repositoryRoot;
  await write("tsconfig.json", `${JSON.stringify(compilerConfig)}\n`);
  return { rootDir, task, workspace, attempt, bindingId, render, write };
};

const renderRunner = ({
  beforeInspection,
  incorrectFrameCount = false,
  decodeFailure = false,
}: {
  beforeInspection?: () => Promise<void>;
  incorrectFrameCount?: boolean;
  decodeFailure?: boolean;
} = {}) => {
  const calls: { args: readonly string[] }[] = [];
  const runProcess: ProcessRunner = async (_command, args) => {
    calls.push({ args });
    if (args.includes("render")) {
      await writeFile(
        args[args.indexOf("render") + 3]!,
        "mock-video-process-output",
      );
      await beforeInspection?.();
    }
    // The bundled FFmpeg null muxer defaults to wrapped_avframe, whose encoder
    // is absent. Model that real boundary instead of accepting any decode args.
    const decoderUnavailable =
      args.includes("ffmpeg") &&
      (!args.includes("rawvideo") || !args.includes("pcm_s16le"));
    const failedDecode =
      args.includes("ffmpeg") && (decodeFailure || decoderUnavailable);
    return {
      status: failedDecode ? 1 : 0,
      stderr: failedDecode ? "EOF decode failed" : "",
      stdout: args.includes("ffprobe")
        ? JSON.stringify({
            streams: [
              {
                codec_name: "h264",
                width: 960,
                height: 540,
                r_frame_rate: "30/1",
                nb_read_frames: incorrectFrameCount ? "119" : "120",
              },
            ],
          })
        : "",
    };
  };
  return { runProcess, calls };
};

const preview = (
  current: Awaited<ReturnType<typeof fixture>>,
  runner: ReturnType<typeof renderRunner>,
  finalizeTask?: typeof finalizeAgentTaskWorkspace,
) =>
  previewBoundSceneTask({
    rootDir: current.rootDir,
    taskRevision: current.task.taskRevision,
    attemptId: current.attempt.attemptId,
    bindingId: current.bindingId,
    transport: "shared-workspace",
    dependencies: {
      ...(finalizeTask ? { finalizeTask } : {}),
      renderPreview: (input) =>
        renderSceneTaskPreview({ ...input, runProcess: runner.runProcess }),
    },
  });

test("Scene binding exposes exact preview only for shared workspace, and controller preview reads no outputs", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.rootDir, { recursive: true, force: true }));
  const input = {
    rootDir: current.rootDir,
    taskRevision: current.task.taskRevision,
    attemptId: current.attempt.attemptId,
    bindingId: current.bindingId,
  };
  const shared = await bindTaskWorker({
    ...input,
    transport: "shared-workspace",
  });
  assert.match(
    shared.commands.preview!,
    /project:task:preview.*--binding binding-.*--transport shared-workspace/u,
  );
  const controller = await bindTaskWorker({
    ...input,
    transport: "controller-io",
  });
  assert.equal(controller.commands.preview, null);
  await rm(join(current.workspace, "src/Renderer.tsx"));
  const result = await previewBoundSceneTask({
    ...input,
    transport: "controller-io",
    dependencies: {
      finalizeTask: async () => {
        throw new Error("must not finalize");
      },
    },
  });
  assert.equal(result.status, "task-preview-unavailable");
  await assert.rejects(readdir(join(current.rootDir, "out")), /ENOENT/u);
  await assert.rejects(
    previewBoundSceneTask({
      ...input,
      bindingId: `binding-${"f".repeat(64)}`,
      transport: "shared-workspace",
    }),
    /binding identity is stale/u,
  );
});

test("visual preview verifies explicit null narration manifests and uses the real viewport, top caption layer and authored duration", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.rootDir, { recursive: true, force: true }));
  const snapshot = await readSceneTaskPreviewSnapshot(current);
  const inputs = await loadSceneTaskPreviewInputs({
    rootDir: current.rootDir,
    runtimeRootDir: current.rootDir,
    snapshot,
  });
  assert.equal(inputs.narrationAudio, null);
  assert.deepEqual(inputs.captionCues, []);
  assert.deepEqual(inputs.publicFiles, []);
  const entry = buildSceneTaskPreviewEntry({ snapshot, inputs });
  assert.match(entry, /<SceneViewport policy=\{policy\}><Renderer/u);
  assert.match(entry, /<CaptionLayer captionCues=\{captions\}/u);
  assert.match(entry, /durationInFrames=\{120\} fps=\{30\}/u);
  assert.match(entry, /const narration = null/u);
  assert.doesNotMatch(
    entry,
    /GlobalVisualLayers|NarrationAudioTrack|producer-work/u,
  );
  assert.deepEqual(resolveSceneTaskPreviewSize(current.render), {
    scale: 0.5,
    width: 960,
    height: 540,
  });
  await current.write(
    `src/projects/${current.task.storyId}/generated/sealed-narration.generated.json`,
    "{}\n",
  );
  await assert.rejects(
    loadSceneTaskPreviewInputs({
      rootDir: current.rootDir,
      runtimeRootDir: current.rootDir,
      snapshot,
    }),
    /explicit null narration manifests/u,
  );
});

test("bound preview finalizes and checks first, snapshots exact outputs, retains fps and all Scene frames, and stays outside artifact authority", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.rootDir, { recursive: true, force: true }));
  const before = await readdir(current.workspace, { recursive: true });
  const runner = renderRunner();
  const output = await preview(current, runner);
  assert.equal(output.status, "scene-task-preview-complete");
  if (output.status !== "scene-task-preview-complete")
    throw new Error("preview expected");
  assert.equal(output.reviewStatus, "needs-temporal-review");
  assert.ok(output.notAssessed.includes("aesthetic-quality"));
  assert.equal(output.preview.frameCount, 120);
  assert.equal(output.preview.fps, 30);
  assert.equal(output.preview.narration, "not-applicable");
  assert.match(
    output.preview.videoPath,
    /^out\/synthetic-proof\/task-preview\/task-/u,
  );
  assert.deepEqual(
    await readdir(current.workspace, { recursive: true }),
    before,
  );
  assert.equal(
    output.sourceFiles.length,
    current.task.declaredOutputSet.length,
  );
  const renderCall = runner.calls[0]!.args;
  assert.ok(renderCall.includes("--concurrency=1"));
  assert.ok(renderCall.includes("--scale=0.5"));
  assert.ok(renderCall.includes("--frames=0-119"));
  assert.ok(renderCall.includes("--pixel-format=yuv420p"));
  assert.equal(
    renderCall.some(
      (arg) =>
        arg.startsWith("--fps") ||
        arg.startsWith("--every-nth-frame") ||
        arg.includes("disable-sandbox"),
    ),
    false,
  );
  const manifest = JSON.parse(
    await readFile(join(current.rootDir, output.preview.manifestPath), "utf8"),
  );
  assert.equal(manifest.sourceFingerprint, output.sourceFingerprint);
  assert.equal(manifest.attemptId, current.attempt.attemptId);
  await assert.rejects(
    readdir(join(current.rootDir, ".producer-artifacts")),
    /ENOENT/u,
  );
});

test("preview decode failure rejects success and removes diagnostics without changing outputs or committing artifacts", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.rootDir, { recursive: true, force: true }));
  const before = await readSceneTaskPreviewSnapshot(current);
  await assert.rejects(
    preview(current, renderRunner({ decodeFailure: true })),
    /did not decode completely to EOF/u,
  );
  const after = await readSceneTaskPreviewSnapshot(current);
  assert.equal(after.sourceFingerprint, before.sourceFingerprint);
  assert.deepEqual(
    await readdir(
      join(
        current.rootDir,
        "out",
        current.task.storyId,
        "task-preview",
        current.task.taskRevision,
      ),
    ),
    [],
  );
  await assert.rejects(
    readdir(join(current.rootDir, ".producer-artifacts")),
    /ENOENT/u,
  );
});

test("preview rejects output drift during render and incorrect full frame count, removing only its newly created diagnostic directory", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.rootDir, { recursive: true, force: true }));
  const finalized = async () => ({
    status: "agent-task-finalized" as const,
    taskRevision: current.task.taskRevision,
    taskKind: "scene-owner" as const,
    checkStatus: "task-workspace-valid" as const,
  });
  await assert.rejects(
    preview(
      current,
      renderRunner({
        beforeInspection: async () => {
          const renderer = join(current.workspace, "src/Renderer.tsx");
          await writeFile(
            renderer,
            `${await readFile(renderer, "utf8")}\n// Output edit during render\n`,
          );
        },
      }),
      finalized,
    ),
    /outputs changed during preview/u,
  );
  const previewRoot = join(
    current.rootDir,
    "out",
    current.task.storyId,
    "task-preview",
    current.task.taskRevision,
  );
  assert.deepEqual(await readdir(previewRoot), []);
  await assert.rejects(
    preview(current, renderRunner({ incorrectFrameCount: true }), finalized),
    /complete Scene frame count drifted/u,
  );
  assert.deepEqual(await readdir(previewRoot), []);
  assert.match(
    await readFile(join(current.workspace, "src/Renderer.tsx"), "utf8"),
    /Output edit/u,
  );
});

test("preview snapshot cannot bundle another Scene through an undeclared relative import or symlink", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.rootDir, { recursive: true, force: true }));
  const renderer = join(current.workspace, "src/Renderer.tsx");
  await writeFile(
    renderer,
    'import Other from "../../../other-scene/Renderer"; export default Other;\n',
  );
  await assert.rejects(
    readSceneTaskPreviewSnapshot(current),
    /outside declared outputs/u,
  );
  await rm(renderer);
  await symlink(join(current.rootDir, "package.json"), renderer);
  await assert.rejects(
    readSceneTaskPreviewSnapshot(current),
    /must be a regular file/u,
  );
});

test("task-preview CLI requires transport and the full exact binding before delegated preview work", async () => {
  const calls: unknown[] = [];
  const cliContext = {
    rootDir: "/fixture",
    stdout: (line: string) => calls.push(line),
    previewTask: async (input: Parameters<typeof previewBoundSceneTask>[0]) => {
      calls.push(input);
      return {
        status: "task-preview-unavailable" as const,
        taskRevision: TaskRevisionSchema.parse(input.taskRevision),
        attemptId: input.attemptId,
        reason: "scene-owner-task-required" as const,
        scope: "Fixture",
      };
    },
  };
  await assert.rejects(
    runProjectProductionCli(
      [
        "task-preview",
        "--task",
        `task-${"1".repeat(64)}`,
        "--attempt",
        "attempt",
        "--binding",
        "binding",
      ],
      cliContext,
    ),
    /Missing --transport/u,
  );
  assert.deepEqual(calls, []);
  await runProjectProductionCli(
    [
      "task-preview",
      "--task",
      `task-${"1".repeat(64)}`,
      "--attempt",
      "attempt",
      "--binding",
      "binding",
      "--transport",
      "shared-workspace",
    ],
    cliContext,
  );
  assert.equal(calls.length, 2);
});

test("preview resolves only visual assets through the browser static base, matching final runtime", async (context) => {
  const current = await fixture();
  context.after(() => rm(current.rootDir, { recursive: true, force: true }));
  const snapshot = await readSceneTaskPreviewSnapshot(current);
  const inputs = await loadSceneTaskPreviewInputs({
    rootDir: current.rootDir,
    runtimeRootDir: current.rootDir,
    snapshot,
  });
  const sound = createSoundRuntimeFixture();
  const image = ResourceAssetDescriptorSchema.parse({
    ...sound.descriptor,
    id: "asset.preview-image",
    assetKind: "image",
    mediaRole: "scene-visual",
    localPath: "public/projects/synthetic-proof/image.png",
  });
  const entry = buildSceneTaskPreviewEntry({
    snapshot: {
      ...snapshot,
      resources: [
        SceneSelectedResourceSchema.parse({
          selected: sound.selected,
          descriptor: sound.descriptor,
        }),
        SceneSelectedResourceSchema.parse({
          selected: {
            ...sound.selected,
            resourceId: image.id,
            role: "scene-visual",
            descriptorFingerprint: computeResourceDescriptorFingerprint(image),
          },
          descriptor: image,
        }),
      ],
    },
    inputs,
  });
  const staticPaths: string[] = [];
  type Element = {
    props: {
      component?: () => Element;
      children?: Element | Element[];
      visualResources?: unknown;
    };
  };
  let root: (() => Element) | undefined;
  const jsx = (_type: unknown, props: Element["props"]) => ({ props });
  const modules: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    remotion: {
      AbsoluteFill: "AbsoluteFill",
      Audio: "Audio",
      Composition: "Composition",
      useCurrentFrame: () => 0,
      registerRoot: (component: () => Element) => {
        root = component;
      },
      staticFile: (path: string) => {
        staticPaths.push(path);
        return `/public/${path}`;
      },
    },
    "@axmorf/studio/remotion": {
      CaptionLayer: "CaptionLayer",
      SceneViewport: "SceneViewport",
      SoundContribution: "SoundContribution",
    },
    "./source/src/Renderer": { __esModule: true, default: "Renderer" },
  };
  const compiled = ts.transpileModule(entry, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  runInNewContext(compiled, {
    exports: {},
    require: (specifier: string) => {
      assert.ok(
        Object.hasOwn(modules, specifier),
        `unexpected preview import ${specifier}`,
      );
      return modules[specifier];
    },
  });
  assert.deepEqual(staticPaths, ["projects/synthetic-proof/image.png"]);
  assert.ok(root);
  const component = root().props.component;
  assert.ok(component);
  const viewport = (component().props.children as Element[])[0];
  const renderer = viewport.props.children as Element;
  assert.deepEqual(JSON.parse(JSON.stringify(renderer.props.visualResources)), [
    {
      resourceId: image.id,
      descriptorFingerprint: computeResourceDescriptorFingerprint(image),
      src: "/public/projects/synthetic-proof/image.png",
    },
  ]);
});

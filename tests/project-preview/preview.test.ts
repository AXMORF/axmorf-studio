import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  RenderSpecSchema,
  buildProducerTaskSpec,
  type ArtifactAttestation,
  type ProducerTaskSpec,
  type ProductionRevisionId,
  type Sha256Digest,
} from "@axmorf/studio/contracts";
import { createPreviewProfile } from "../../scripts/project-preview/domain";
import {
  generateProjectPreview,
  type ProjectPreviewDependencies,
} from "../../scripts/project-preview/generate";
import {
  loadVerifiedPreviewSource,
  inspectPreviewPrerequisiteArtifacts,
  type VerifiedPreviewSource,
} from "../../scripts/project-preview/source";
import {
  createLiveProjectProductionScope,
  createProjectRevisionProductionScope,
  type ProductionScope,
} from "../../scripts/project-production/application/production-scope";
import {
  capturePreviewSnapshot,
  freezePreviewSnapshot,
  pathState,
} from "../../scripts/project-preview/filesystem";
import { renderProjectPreview } from "../../scripts/project-preview/media";
import {
  parseProjectPreviewArguments,
  runProjectPreviewCli,
  isProjectPreviewScriptEntrypoint,
} from "../../scripts/project-preview/cli";
import { prepareProjectPreviewView } from "../../scripts/project-preview/projection";
import { buildRuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";

const projectId = "preview-example";
const candidateId = `revision-candidate-${"b".repeat(64)}`;
const source: VerifiedPreviewSource = {
  revisionId: `revision-${"a".repeat(64)}` as ProductionRevisionId,
  runtimePolicyFingerprint: `sha256:${"c".repeat(64)}` as Sha256Digest,
  artifactSetFingerprint: `sha256:${"e".repeat(64)}` as Sha256Digest,
  render: RenderSpecSchema.parse({
    schemaVersion: 1,
    compositionId: "PreviewExample",
    width: 1920,
    height: 1080,
    fps: 30,
    locale: "zh-CN",
    leadInFrames: 0,
    tailFrames: 0,
    output: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      audioChannels: 2,
    },
  }),
  frameCount: 120,
};

const createFixture = async (rootDir: string, scope: ProductionScope) => {
  for (const directory of [
    join(scope.projectSourceRoot, projectId),
    join(scope.projectPublicRoot, projectId),
    join(rootDir, "src/contracts"),
    join(rootDir, "src/remotion"),
    join(rootDir, "public/assets"),
  ])
    await mkdir(directory, { recursive: true });
  await writeFile(
    join(scope.projectSourceRoot, projectId, "Composition.tsx"),
    "current project source",
  );
  await writeFile(
    join(scope.projectPublicRoot, projectId, "narration.wav"),
    "current sealed narration",
  );
  await writeFile(join(rootDir, "public/assets/shared.bin"), "shared bytes");
  await writeFile(join(rootDir, "src/index.css"), "body { margin: 0 }");
  await writeFile(join(rootDir, "package.json"), "{}");
  await writeFile(join(rootDir, "package-lock.json"), "{}");
  await writeFile(join(rootDir, "remotion.config.ts"), "// current config");
};

const fixture = async (context: TestContext, candidate = false) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-preview-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const scope = candidate
    ? createProjectRevisionProductionScope({
        rootDir,
        storyId: projectId,
        candidateId,
      })
    : createLiveProjectProductionScope({ rootDir, storyId: projectId });
  await createFixture(rootDir, scope);
  let renders = 0;
  let inspections = 0;
  let sourceChecks = 0;
  const dependencies: ProjectPreviewDependencies = {
    prepareView: async () => {},
    loadSource: async (request) => {
      assert.equal(request.scope.isolatedRoot, scope.isolatedRoot);
      sourceChecks++;
      return source;
    },
    inspectCandidate: async ({ scope: bound }) => {
      assert.equal(bound.candidateId, candidateId);
      assert.equal(bound.storyId, projectId);
    },
    renderVideo: async (request) => {
      renders++;
      const copied = join(
        request.entryPoint,
        "..",
        "projects",
        projectId,
        "Composition.tsx",
      );
      assert.equal(
        await readFile(copied, "utf8"),
        await readFile(
          join(scope.projectSourceRoot, projectId, "Composition.tsx"),
          "utf8",
        ),
      );
      assert.equal(
        await readFile(
          join(request.publicDir, "projects", projectId, "narration.wav"),
          "utf8",
        ),
        "current sealed narration",
      );
      const entry = await readFile(request.entryPoint, "utf8");
      assert.match(entry, /width=\{1920\}/u);
      assert.match(entry, /height=\{1080\}/u);
      assert.match(entry, /durationInFrames=\{120\}/u);
      await writeFile(request.outputPath, "verified fixture video");
    },
    inspectVideo: async (request) => {
      inspections++;
      return {
        codec: "h264",
        audioCodec: "aac",
        audioChannels: request.render.output.audioChannels,
        width: request.render.width,
        height: request.render.height,
        fps: request.render.fps,
        frameCount: request.frameCount,
        decodedToEof: true,
      };
    },
  };
  const run = (overrides: ProjectPreviewDependencies = {}) =>
    generateProjectPreview({
      rootDir,
      projectId,
      ...(candidate ? { candidateId } : {}),
      dependencies: { ...dependencies, ...overrides },
    });
  return {
    rootDir,
    scope,
    dependencies,
    run,
    counts: () => ({ renders, inspections, sourceChecks }),
  };
};

test("preview profile preserves exact aspect ratio, fps, duration and audio", () => {
  const profile = createPreviewProfile(source.render, 120);
  assert.equal(profile.width, 960);
  assert.equal(profile.height, 540);
  assert.equal(
    profile.width * source.render.height,
    profile.height * source.render.width,
  );
  assert.equal(profile.fps, source.render.fps);
  assert.equal(profile.frameCount, 120);
  assert.equal(profile.audioChannels, 2);
  const portrait = createPreviewProfile(
    { ...source.render, width: 1080, height: 1920 },
    120,
  );
  assert.equal(portrait.width, 540);
  assert.equal(portrait.height, 960);
  const large = createPreviewProfile(
    { ...source.render, width: 3840, height: 2160 },
    120,
  );
  assert.equal(large.scale, 0.25);
  assert.throws(
    () =>
      createPreviewProfile(
        { ...source.render, width: 1002, height: 1000 },
        120,
      ),
    /no smaller proportional/u,
  );
});

test("source-ready preview needs no formal delivery and cache hits revalidate", async (context) => {
  const f = await fixture(context);
  const before = await capturePreviewSnapshot(f.scope);
  const first = await f.run();
  const receiptBytes = await readFile(first.receiptPath, "utf8");
  const second = await f.run();
  assert.equal(first.status, "project-preview-ready");
  assert.equal(second.status, "project-preview-current");
  assert.equal(second.noOp, true);
  assert.equal(first.previewBuildId, second.previewBuildId);
  assert.deepEqual(f.counts(), { renders: 1, inspections: 2, sourceChecks: 4 });
  assert.deepEqual((await readdir(first.outputDir)).sort(), [
    "preview.json",
    "preview.mp4",
  ]);
  assert.equal(await readFile(first.receiptPath, "utf8"), receiptBytes);
  assert.equal(
    (await capturePreviewSnapshot(f.scope)).fingerprint,
    before.fingerprint,
  );
  assert.equal(await pathState(f.scope.deliveryRoot), null);
  assert.equal(await pathState(f.scope.producerAttemptsRoot), null);
  assert.deepEqual(first.assessment, {
    motion: "not-assessed",
    continuity: "not-assessed",
    listening: "not-assessed",
  });
});

test("changed Project source creates a new preview identity without reusing old receipt", async (context) => {
  const f = await fixture(context);
  const first = await f.run();
  const oldReceipt = await readFile(first.receiptPath, "utf8");
  await writeFile(
    join(f.scope.projectSourceRoot, projectId, "Composition.tsx"),
    "changed project source",
  );
  const second = await f.run();
  assert.equal(second.noOp, false);
  assert.notEqual(first.sourceFingerprint, second.sourceFingerprint);
  assert.notEqual(first.previewBuildId, second.previewBuildId);
  assert.equal(await readFile(first.receiptPath, "utf8"), oldReceipt);
  assert.equal(f.counts().renders, 2);
});

test("current Workspace facades and compiler configuration invalidate preview identity", async (context) => {
  const f = await fixture(context);
  await mkdir(join(f.rootDir, "src/runtime"), { recursive: true });
  await writeFile(
    join(f.rootDir, "src/runtime/capabilities.ts"),
    "current facade",
  );
  await writeFile(join(f.rootDir, "tsconfig.json"), "current aliases");
  const first = await f.run();
  await writeFile(
    join(f.rootDir, "src/runtime/capabilities.ts"),
    "changed facade",
  );
  const changedFacade = await f.run();
  assert.notEqual(changedFacade.previewBuildId, first.previewBuildId);
  await writeFile(join(f.rootDir, "tsconfig.json"), "changed aliases");
  const changedCompiler = await f.run();
  assert.notEqual(changedCompiler.previewBuildId, changedFacade.previewBuildId);
  assert.equal(f.counts().renders, 3);
});

test("cached preview rejects corrupted media instead of overwriting it", async (context) => {
  const f = await fixture(context);
  const first = await f.run();
  await writeFile(first.videoPath, "tampered media");
  await assert.rejects(f.run(), /checksum or media binding drifted/u);
  assert.equal(await readFile(first.videoPath, "utf8"), "tampered media");
  assert.equal(f.counts().renders, 1);
});

test("cached preview rejects profile drift and unknown files", async (context) => {
  const f = await fixture(context);
  const first = await f.run();
  const receipt = JSON.parse(await readFile(first.receiptPath, "utf8"));
  receipt.profile.scale = 0.25;
  await writeFile(first.receiptPath, JSON.stringify(receipt));
  await assert.rejects(f.run(), /another source or profile/u);
  receipt.profile.scale = 0.5;
  await writeFile(first.receiptPath, JSON.stringify(receipt));
  await writeFile(join(first.outputDir, "extra.txt"), "unknown");
  await assert.rejects(f.run(), /unknown artifacts/u);
});

test("missing prerequisite artifacts block rendering and receipt reuse", async (context) => {
  const f = await fixture(context);
  await assert.rejects(
    f.run({
      loadSource: async () => {
        throw new Error("source is not materialized");
      },
    }),
    /not materialized/u,
  );
  assert.equal(f.counts().renders, 0);
  assert.equal(await pathState(f.scope.outputRoot), null);
  const first = await f.run();
  await assert.rejects(
    f.run({
      loadSource: async () => {
        throw new Error("source owner attestation is stale");
      },
    }),
    /attestation is stale/u,
  );
  assert.equal(f.counts().renders, 1);
  assert.ok(await pathState(first.receiptPath));
});

test("source/public drift during rendering produces no accepted receipt", async (context) => {
  const f = await fixture(context);
  await assert.rejects(
    f.run({
      renderVideo: async (request) => {
        await f.dependencies.renderVideo!(request);
        await writeFile(
          join(f.scope.projectPublicRoot, projectId, "narration.wav"),
          "drifted narration",
        );
      },
    }),
    /source changed during/u,
  );
  assert.deepEqual(
    await readdir(join(f.scope.outputRoot, projectId, "preview")),
    [],
  );
  assert.equal(
    await pathState(join(f.rootDir, ".project-operation.lock")),
    null,
  );
});

test("source authority changes during rendering fail closed", async (context) => {
  const f = await fixture(context);
  let checks = 0;
  await assert.rejects(
    f.run({
      loadSource: async () =>
        ++checks === 1
          ? source
          : {
              ...source,
              runtimePolicyFingerprint:
                `sha256:${"d".repeat(64)}` as Sha256Digest,
            },
    }),
    /source authority became stale/u,
  );
  assert.deepEqual(
    await readdir(join(f.scope.outputRoot, projectId, "preview")),
    [],
  );
});

test("frozen source/public drift during rendering rejects the draft receipt", async (context) => {
  const f = await fixture(context);
  const before = await capturePreviewSnapshot(f.scope);
  await assert.rejects(
    f.run({
      renderVideo: async (request) => {
        await f.dependencies.renderVideo!(request);
        await writeFile(
          join(request.publicDir, "projects", projectId, "narration.wav"),
          "changed frozen narration",
        );
      },
    }),
    /frozen source\/public changed/u,
  );
  assert.equal(
    (await capturePreviewSnapshot(f.scope)).fingerprint,
    before.fingerprint,
  );
  assert.deepEqual(
    await readdir(join(f.scope.outputRoot, projectId, "preview")),
    [],
  );
});

test("candidate preview reads and writes exact isolated Project scope", async (context) => {
  const f = await fixture(context, true);
  const liveSource = join(f.rootDir, "src/projects", projectId);
  const livePublic = join(f.rootDir, "public/projects", projectId);
  const liveDelivery = join(f.rootDir, "deliveries", projectId);
  for (const directory of [liveSource, livePublic, liveDelivery])
    await mkdir(directory, { recursive: true });
  await writeFile(join(liveSource, "Composition.tsx"), "live source sentinel");
  await writeFile(join(livePublic, "narration.wav"), "live public sentinel");
  await writeFile(join(liveDelivery, "publish.json"), "live delivery sentinel");
  const first = await f.run();
  assert.ok(first.outputDir.startsWith(f.scope.outputRoot));
  assert.equal(await pathState(join(f.rootDir, "out")), null);
  assert.equal(
    await readFile(join(liveSource, "Composition.tsx"), "utf8"),
    "live source sentinel",
  );
  assert.equal(
    await readFile(join(livePublic, "narration.wav"), "utf8"),
    "live public sentinel",
  );
  assert.equal(
    await readFile(join(liveDelivery, "publish.json"), "utf8"),
    "live delivery sentinel",
  );
});

test("candidate definition failure blocks before Project content or output", async (context) => {
  const f = await fixture(context, true);
  await assert.rejects(
    f.run({
      inspectCandidate: async () => {
        throw new Error("candidate definition is cross-bound");
      },
    }),
    /cross-bound/u,
  );
  assert.deepEqual(f.counts(), { renders: 0, inspections: 0, sourceChecks: 0 });
  assert.equal(await pathState(f.scope.outputRoot), null);
});

test("source symlinks fail closed before rendering", async (context) => {
  const f = await fixture(context);
  const projectRoot = join(f.scope.projectSourceRoot, projectId);
  await symlink(
    join(f.rootDir, "package.json"),
    join(projectRoot, "unsafe.json"),
  );
  await assert.rejects(f.run(), /symbolic link/u);
  assert.equal(f.counts().renders, 0);
  assert.equal(await pathState(f.scope.outputRoot), null);
});

test("preview CLI accepts only exact scope arguments and passes runtime policy", async () => {
  assert.deepEqual(parseProjectPreviewArguments(["--project", projectId]), {
    projectId,
  });
  assert.deepEqual(
    parseProjectPreviewArguments([
      "--project",
      projectId,
      "--candidate",
      candidateId,
    ]),
    { projectId, candidateId },
  );
  for (const args of [
    ["--project", "../escape"],
    ["--project", projectId, "--scale", "2"],
    ["--project", projectId, "--candidate", "../escape"],
    ["--project", projectId, "--project", projectId],
  ]) {
    assert.throws(() => parseProjectPreviewArguments(args));
  }
  const output: string[] = [];
  const runtimePolicyManifest = buildRuntimePolicyManifest({
    packageVersion: "0.0.1",
    files: [
      {
        logicalPath: "dist/core/contracts.js",
        bytes: new Uint8Array([1]),
        scopes: ["composition", "delivery", "global-visual", "scene"],
      },
    ],
  });
  const fakeResult = { status: "fixture" } as unknown as Awaited<
    ReturnType<typeof generateProjectPreview>
  >;
  await runProjectPreviewCli(
    ["--project", projectId, "--candidate", candidateId],
    {
      rootDir: "/workspace",
      runtimePolicyManifest,
      stdout: (line) => output.push(line),
      generatePreview: async (request) => {
        assert.equal(request.candidateId, candidateId);
        assert.equal(request.rootDir, "/workspace");
        assert.equal(request.runtimePolicyManifest, runtimePolicyManifest);
        return fakeResult;
      },
    },
  );
  assert.equal(output[0], JSON.stringify(fakeResult));
  assert.equal(
    isProjectPreviewScriptEntrypoint(
      "file:///workspace/dist/cli/main.js",
      "/workspace/dist/cli/main.js",
    ),
    false,
  );
});

test("preview media adapter scales output while preserving Composition geometry and audio", async (context) => {
  const outputDir = await mkdtemp(join(tmpdir(), "axmorf-preview-adapter-"));
  context.after(() => rm(outputDir, { recursive: true, force: true }));
  const calls: string[][] = [];
  const profile = createPreviewProfile(source.render, 120);
  await renderProjectPreview({
    rootDir: "/workspace",
    entryPoint: "/workspace/out/frozen/src/index.tsx",
    publicDir: "/workspace/out/frozen/public",
    compositionId: source.render.compositionId,
    outputPath: join(outputDir, "preview.mp4"),
    profile,
    resolveInvocation: async () => ({
      command: process.execPath,
      argsPrefix: ["/workspace/node_modules/@remotion/cli/remotion-cli.js"],
    }),
    resolveMediaTool: async ({ args }) => ({
      command: "ffmpeg-fixture",
      args,
    }),
    runProcess: async (_command, args) => {
      calls.push([...args]);
      if (args.includes("render")) {
        await writeFile(args[args.indexOf("render") + 3]!, "rendered h264");
        const pcmPath = args.find((arg) =>
          arg.startsWith("--separate-audio-to="),
        );
        assert.ok(pcmPath);
        await writeFile(
          pcmPath.slice("--separate-audio-to=".length),
          "mixed PCM",
        );
      } else {
        await writeFile(args.at(-1)!, "muxed h264/aac");
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.ok(calls[0]?.includes("--scale=0.5"));
  assert.ok(calls[0]?.includes("--audio-codec=pcm-16"));
  assert.ok(calls[0]?.includes("--disallow-parallel-encoding"));
  assert.ok(calls[1]?.includes("libfdk_aac"));
  assert.ok(calls[0]?.includes("--enforce-audio-track"));
  assert.ok(calls[0]?.includes("--crf=28"));
  assert.ok(calls[0]?.includes("--public-dir=/workspace/out/frozen/public"));
  assert.equal(
    calls[0]?.some((arg) => /--(?:width|height|fps|frames|muted)/u.test(arg)),
    false,
  );
});

test("default source gate rejects incomplete configured source without generating missing files", async (context) => {
  const f = await fixture(context);
  await assert.rejects(
    loadVerifiedPreviewSource({
      rootDir: f.rootDir,
      projectId,
      scope: f.scope,
    }),
    /incomplete/u,
  );
  assert.deepEqual(await readdir(join(f.scope.projectSourceRoot, projectId)), [
    "Composition.tsx",
  ]);
  assert.equal(await pathState(f.scope.deliveryRoot), null);
});

test("artifact identity changes invalidate a cached preview even when authoring bytes match", async (context) => {
  const f = await fixture(context);
  const first = await f.run();
  const second = await f.run({
    loadSource: async () => ({
      ...source,
      artifactSetFingerprint: `sha256:${"f".repeat(64)}` as Sha256Digest,
    }),
  });
  assert.notEqual(first.sourceFingerprint, second.sourceFingerprint);
  assert.notEqual(first.previewBuildId, second.previewBuildId);
  assert.notEqual(first.artifactSetFingerprint, second.artifactSetFingerprint);
  assert.equal(
    first.sourceSnapshotFingerprint,
    second.sourceSnapshotFingerprint,
  );
  assert.equal(second.noOp, false);
});

test("artifact-ready preview projects only frozen view and leaves original source unmaterialized", async (context) => {
  const f = await fixture(context);
  const original = await capturePreviewSnapshot(f.scope);
  let projections = 0;
  const first = await f.run({
    prepareView: async ({ request, view, expectedSource }) => {
      projections++;
      assert.equal(request.scope.isolatedRoot, f.scope.isolatedRoot);
      assert.equal(
        expectedSource.artifactSetFingerprint,
        source.artifactSetFingerprint,
      );
      await writeFile(
        join(view, "src/projects", projectId, "Composition.tsx"),
        "projected verified artifact",
      );
    },
    renderVideo: async ({ entryPoint, outputPath }) => {
      assert.equal(
        await readFile(
          join(entryPoint, "..", "projects", projectId, "Composition.tsx"),
          "utf8",
        ),
        "projected verified artifact",
      );
      await writeFile(outputPath, "projected video");
    },
  });
  assert.equal(projections, 1);
  assert.equal(
    await readFile(
      join(f.scope.projectSourceRoot, projectId, "Composition.tsx"),
      "utf8",
    ),
    "current project source",
  );
  assert.equal(
    (await capturePreviewSnapshot(f.scope)).fingerprint,
    original.fingerprint,
  );
  const receipt = JSON.parse(await readFile(first.receiptPath, "utf8"));
  assert.equal(receipt.artifactSetFingerprint, source.artifactSetFingerprint);
  assert.equal(receipt.sourceSnapshotFingerprint, original.fingerprint);
  assert.equal(await pathState(f.scope.deliveryRoot), null);
});

const prerequisiteTask = (taskKind: ProducerTaskSpec["taskKind"]) =>
  buildProducerTaskSpec({
    taskKind,
    storyId: projectId,
    semanticId: taskKind === "scene-owner" ? "beat-a" : null,
    revisionId: source.revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "fixture", fingerprint: source.runtimePolicyFingerprint },
    ],
    declaredReadSet: [],
    declaredOutputSet: ["project/result.json"],
    validatorPolicyVersion: "preview-fixture-v1",
  });

test("preview verifies every fixed and owner prerequisite and excludes formal downstream tasks", async () => {
  const tasks = [
    "narration-chunk",
    "narration-seal",
    "semantic-timing",
    "scene-owner",
    "global-visual-owner",
    "cover-owner",
    "composition-convergence",
    "delivery-build",
  ].map((kind) => prerequisiteTask(kind as ProducerTaskSpec["taskKind"]));
  const inspected: string[] = [];
  const prerequisites = await inspectPreviewPrerequisiteArtifacts({
    rootDir: "/workspace",
    tasks,
    inspect: async ({ task }) => {
      inspected.push(task.taskKind);
      return {
        artifactFingerprint: source.artifactSetFingerprint,
      } as ArtifactAttestation;
    },
  });
  assert.deepEqual(inspected, [
    "narration-chunk",
    "narration-seal",
    "semantic-timing",
    "scene-owner",
    "global-visual-owner",
    "cover-owner",
  ]);
  assert.equal(prerequisites.length, 6);
  await assert.rejects(
    inspectPreviewPrerequisiteArtifacts({
      rootDir: "/workspace",
      tasks,
      inspect: async ({ task }) =>
        task.taskKind === "semantic-timing"
          ? null
          : ({
              artifactFingerprint: source.artifactSetFingerprint,
            } as ArtifactAttestation),
    }),
    /unavailable: semantic-timing/u,
  );
  await assert.rejects(
    inspectPreviewPrerequisiteArtifacts({
      rootDir: "/workspace",
      tasks: [prerequisiteTask("semantic-timing")],
      inspect: async () =>
        ({
          artifactFingerprint: source.artifactSetFingerprint,
        }) as ArtifactAttestation,
    }),
    /no verified owner/u,
  );
});

test("projection uses scratch roots for materialization, generation and verification", async (context) => {
  const f = await fixture(context);
  const before = await capturePreviewSnapshot(f.scope);
  const view = join(f.rootDir, "out/projection-view");
  await freezePreviewSnapshot({
    rootDir: f.rootDir,
    destination: view,
    snapshot: before,
  });
  const phases: string[] = [];
  const projection = {
    source,
    inputs: {
      sceneInputs: [{ meaningId: "beat-a", taskInput: { fixture: true } }],
    },
    ownerArtifacts: [],
  } as unknown as Awaited<
    ReturnType<
      typeof import("../../scripts/project-preview/source").loadProjectPreviewProjection
    >
  >;
  await prepareProjectPreviewView({
    request: { rootDir: f.rootDir, projectId, scope: f.scope },
    view,
    expectedSource: source,
    dependencies: {
      loadProjection: async () => projection,
      materialize: async (request) => {
        phases.push("materialize");
        assert.equal(request.rootDir, view);
        assert.equal(request.artifactRootDir, f.rootDir);
        assert.equal(
          request.sceneTaskInputs.get("beat-a"),
          projection.inputs.sceneInputs[0]!.taskInput,
        );
        const sceneRoot = join(
          view,
          "src/projects",
          projectId,
          "scenes/beat-a/generated",
        );
        await mkdir(sceneRoot, { recursive: true });
        await writeFile(join(sceneRoot, "scene-package.generated.json"), "{}");
      },
      prepare: async (request) => {
        phases.push("prepare");
        assert.equal(request.rootDir, view);
        assert.equal(request.scope!.isolatedRoot, view);
        assert.equal(
          request.scope!.projectSourceRoot,
          join(view, "src/projects"),
        );
        assert.equal(request.scope!.shared.runtimeRoot, f.rootDir);
        await writeFile(
          join(view, "src/projects", projectId, "Composition.tsx"),
          "scratch generated Composition",
        );
        return {
          render: source.render,
          frameCount: source.frameCount,
        } as Awaited<
          ReturnType<
            typeof import("../../scripts/project-production/application/prepare-delivery").prepareProjectAuthoringBuild
          >
        >;
      },
      verifyMaterialized: async (request) => {
        phases.push("verify");
        assert.equal(request.rootDir, view);
        assert.equal(request.artifactRootDir, f.rootDir);
        assert.ok(
          request.additionalSceneFiles
            ?.get("beat-a")
            ?.has("generated/scene-package.generated.json"),
        );
      },
    },
  });
  assert.deepEqual(phases, ["materialize", "prepare", "verify"]);
  assert.equal(
    (await capturePreviewSnapshot(f.scope)).fingerprint,
    before.fingerprint,
  );
  assert.equal(
    await readFile(
      join(view, "src/projects", projectId, "Composition.tsx"),
      "utf8",
    ),
    "scratch generated Composition",
  );
  assert.equal(await pathState(f.scope.deliveryRoot), null);
});

test("media changes during verification reject an accepted preview receipt", async (context) => {
  const f = await fixture(context);
  await assert.rejects(
    f.run({
      inspectVideo: async (request) => {
        const media = await f.dependencies.inspectVideo!(request);
        await writeFile(request.absolutePath, "changed during EOF inspection");
        return media;
      },
    }),
    /artifact changed during verification/u,
  );
  assert.deepEqual(
    await readdir(join(f.scope.outputRoot, projectId, "preview")),
    [],
  );
});

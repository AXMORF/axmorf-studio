import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import {
  NarrativeAutoCheckReportSchema,
  ProductionPreviewAssemblySchema,
  ProductionPreviewEvidenceSchema,
  ProductionPreviewMechanicalCheckSchema,
  RenderSpecSchema,
  ResourceDescriptorSchema,
  SceneCoverageMapSchema,
  ScenePackageSchema,
  SceneProductionResultSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SealedNarrationManifestSchema,
  SelectedResourceRefSchema,
  SemanticTimingSchema,
  Sha256DigestSchema,
  buildProductionPreviewAssembly,
  buildProductionPreviewEvidence,
  buildProductionPreviewMechanicalCheck,
  createFingerprint,
} from "../../src/contracts";
import type { ProcessRunner } from "../baseline/evidence";
import {
  resolveCurrentM3Entry,
  resolveM3GeneratedRegistryChecksum,
} from "../baseline/evidence";
import { generateProjectRegistry } from "../registry/generate";
import { generateRendererRegistryFromProjectFiles } from "../renderer-registry/generate";
import { resolveSceneSound } from "../../src/remotion/runtime/scene-sound";
import { buildSoundDesignProjection } from "../../src/remotion/runtime/sound-design";
import { buildStoryVisualProjection } from "../../src/remotion/runtime/story-visual";
import { generateSceneCoverageFromProjectFiles } from "../scene-package/generate";
import {
  readJsonFile,
  writeOrCheckSceneArtifact,
} from "../scene-package/project-files";
import { runProductionMediaProcess } from "./adapters/process-runner";
import { readProductionRunStore } from "./adapters/run-store";
import type { PostSceneProductionDependencies } from "./post-scene";
import {
  ensureProductionPreviewScaffold,
  renderProductionPreviewProjectScaffold,
} from "./project-scaffold";
import {
  inspectProductionPreviewMedia,
  writeOrCheckProductionPreviewEvidence,
  writeOrCheckProductionPreviewMechanicalCheck,
} from "./preview-evidence";
import { resolveCurrentSceneAssignments } from "./scene-freeze";

const SelectedResourcesFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    selectedResources: z
      .array(
        z
          .object({
            selected: SelectedResourceRefSchema,
            descriptor: ResourceDescriptorSchema,
          })
          .strict(),
      )
      .readonly(),
  })
  .strict();

const checksumFile = async (path: string) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256")
      .update(Uint8Array.from(await readFile(path)))
      .digest("hex")}`,
  );

const checksumText = (value: string) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(value).digest("hex")}`,
  );

const assertProcessSucceeded = (
  result: Awaited<ReturnType<ProcessRunner>>,
  label: string,
) => {
  if (result.status !== 0) {
    throw new Error(`${label} failed with a non-zero status.`);
  }
};

const loadPreviewSources = async (rootDir: string, storyId: string) => {
  const projectRoot = join(rootDir, "src/projects", storyId);
  const [timing, render, sealedNarration, autoCheck] = await Promise.all([
    readJsonFile(
      join(projectRoot, "generated/semantic-timing.generated.json"),
    ).then(SemanticTimingSchema.parse),
    readJsonFile(join(projectRoot, "render.json")).then(RenderSpecSchema.parse),
    readJsonFile(
      join(projectRoot, "generated/sealed-narration.generated.json"),
    ).then(SealedNarrationManifestSchema.parse),
    readJsonFile(
      join(projectRoot, "generated/narrative-auto-check.generated.json"),
    ).then(NarrativeAutoCheckReportSchema.parse),
  ]);
  if (
    timing.storyId !== storyId ||
    sealedNarration.storyId !== storyId ||
    autoCheck.storyId !== storyId
  ) {
    throw new Error("Production preview Narrative identities are stale.");
  }
  return { projectRoot, timing, render, sealedNarration, autoCheck } as const;
};

const preparePreview = async ({
  rootDir,
  runId,
  storyId,
  requirementsFingerprint,
  mode,
}: Parameters<PostSceneProductionDependencies["preparePreview"]>[0]) => {
  const resolved = await resolveCurrentSceneAssignments({ rootDir, runId });
  if (
    resolved.inputs.current.requirements.requirementsFingerprint !==
      requirementsFingerprint ||
    resolved.inputs.story.storyId !== storyId
  ) {
    throw new Error("Production Preview requirements are stale.");
  }
  const coverage = SceneCoverageMapSchema.parse(
    await generateSceneCoverageFromProjectFiles({
      rootDir,
      projectId: storyId,
      mode,
    }),
  );
  if (
    coverage.entries.length !== resolved.assignments.length ||
    coverage.entries.some(({ status }) => status !== "ready")
  ) {
    throw new Error("Production Preview requires all-ready Scene coverage.");
  }
  const packages = await Promise.all(
    resolved.assignments.map((assignment) =>
      readJsonFile(
        join(
          rootDir,
          `src/projects/${storyId}/scenes/${assignment.meaningId}/generated/scene-package.generated.json`,
        ),
      ).then(ScenePackageSchema.parse),
    ),
  );
  const registry = await generateRendererRegistryFromProjectFiles({
    rootDir,
    projectId: storyId,
    mode,
  });
  if (registry === null) {
    throw new Error("Production Preview requires a RendererRegistry.");
  }
  const sources = await loadPreviewSources(rootDir, storyId);
  const transitions = sources.timing.storyBeats.slice(1).map((beat, index) => ({
    fromMeaningId: sources.timing.storyBeats[index]?.meaningId,
    toMeaningId: beat.meaningId,
    kind: "hard-cut" as const,
    durationInFrames: 0,
    boundaryFrame: beat.startFrame,
  }));
  const visualProjection = buildStoryVisualProjection({
    storyId,
    leadInFrames: sources.timing.leadInFrames,
    tailFrames: sources.timing.tailFrames,
    durationInFrames: sources.timing.durationInFrames,
    storyBeatTimings: sources.timing.storyBeats,
    coverage,
    packages,
    registryFingerprint: registry.registryFingerprint,
    transitions,
  });
  const sceneSoundProjections = [];
  for (const assignment of resolved.assignments) {
    const sceneRoot = join(
      rootDir,
      "src/projects",
      storyId,
      "scenes",
      assignment.meaningId,
    );
    const [sound, anchors, resources] = await Promise.all([
      readJsonFile(join(sceneRoot, "sound-plan.json")).then(
        SceneSoundPlanSchema.parse,
      ),
      readJsonFile(join(sceneRoot, "sync-anchors.json")).then(
        SceneSyncAnchorSetSchema.parse,
      ),
      readJsonFile(join(sceneRoot, "selected-resources.json")).then(
        SelectedResourcesFileSchema.parse,
      ),
    ]);
    const scenePackage = packages.find(
      ({ meaningId }) => meaningId === assignment.meaningId,
    );
    if (scenePackage === undefined) {
      throw new Error("Production Preview ScenePackage order is stale.");
    }
    sceneSoundProjections.push(
      resolveSceneSound({
        scenePackage,
        soundPlan: sound,
        syncAnchors: anchors,
        resources: resources.selectedResources.filter(
          ({ selected }) =>
            selected.role === "scene-ambience" || selected.role === "scene-sfx",
        ),
      }),
    );
  }
  const soundProjection = buildSoundDesignProjection({
    storyId,
    coverage,
    storyBeatTimings: sources.timing.storyBeats,
    sceneSoundProjections,
  });
  const sceneLocalSoundPresent = sceneSoundProjections.some(
    ({ contributions }) => contributions.length > 0,
  );
  if (
    sceneLocalSoundPresent &&
    resolved.inputs.current.requirements.enhancementSelection
      .sceneLocalSound === "none"
  ) {
    throw new Error("Scene-local sound violates ProductionRequirementsFreeze.");
  }
  await ensureProductionPreviewScaffold({
    rootDir,
    storyId,
    meaningIds: resolved.assignments.map(({ meaningId }) => meaningId),
    sceneLocalSoundPresent,
    mode,
  });
  const compositionSource = renderProductionPreviewProjectScaffold({
    storyId,
    sceneLocalSoundPresent,
  });
  const assembly = buildProductionPreviewAssembly({
    storyId,
    compositionId: sources.render.compositionId,
    requirementsFingerprint,
    narrativeAutoCheckFingerprint: sources.autoCheck.reportFingerprint,
    sealedNarrationFingerprint:
      sources.sealedNarration.sealedNarrationFingerprint,
    semanticTimingFingerprint: sources.timing.fingerprint,
    captionCuesFingerprint: createFingerprint({
      namespace: "production-preview-caption-cues",
      version: 1,
      value: sources.timing.captionCues,
    }),
    sceneCoverageFingerprint: coverage.coverageFingerprint,
    scenePackages: packages.map(({ meaningId, packageFingerprint }) => ({
      meaningId,
      packageFingerprint,
    })),
    rendererRegistryFingerprint: registry.registryFingerprint,
    storyVisualProjectionFingerprint: visualProjection.projectionFingerprint,
    sceneLocalSound: sceneLocalSoundPresent
      ? {
          selection: "present",
          soundDesignProjectionFingerprint:
            soundProjection.soundDesignProjectionFingerprint,
        }
      : { selection: "none", reason: "no-scene-local-audio" },
    compositionSourceChecksum: checksumText(compositionSource),
    remotionVersion: "4.0.489",
    enhancements: {
      narrativeCore: "required",
      storyVisualTrack: "present",
      globalSoundPlan: "absent",
      bgm: "absent",
      crossSceneAmbience: "absent",
      ducking: "absent",
      globalVisualLayers: "absent",
    },
    layerOrder: ["story-visual", "narrative-core", "scene-local-sound"],
    mixOrder: ["narration", "scene-local-sound"],
    reviewPolicy: "mechanical-only",
  });
  await writeOrCheckSceneArtifact({
    destination: join(
      sources.projectRoot,
      "generated/production-preview-assembly.generated.json",
    ),
    value: assembly,
    mode,
  });
  return assembly;
};

export const createDefaultPostSceneProductionDependencies = ({
  runProcess = runProductionMediaProcess,
}: {
  readonly runProcess?: ProcessRunner;
} = {}): PostSceneProductionDependencies => {
  const dependencies: PostSceneProductionDependencies = {
    assertCurrentFreeze: async ({
      rootDir,
      runId,
      storyId,
      requirementsFingerprint,
    }) => {
      const [resolved, loaded] = await Promise.all([
        resolveCurrentSceneAssignments({ rootDir, runId }),
        readProductionRunStore({ rootDir, runId }),
      ]);
      if (
        resolved.inputs.story.storyId !== storyId ||
        resolved.inputs.current.requirements.requirementsFingerprint !==
          requirementsFingerprint ||
        loaded.state.acceptedSceneResults.length !== resolved.assignments.length
      ) {
        throw new Error("Accepted Scene freeze is stale.");
      }
      const accepted = new Map(
        loaded.state.acceptedSceneResults.map((result) => [
          result.meaningId,
          result.resultFingerprint,
        ]),
      );
      for (const assignment of resolved.assignments) {
        const result = SceneProductionResultSchema.parse(
          await readJsonFile(
            join(
              rootDir,
              `.producer-runs/${runId}/scene-results/${assignment.meaningId}.json`,
            ),
          ),
        );
        if (
          result.status !== "success" ||
          result.assignmentFingerprint !== assignment.assignmentFingerprint ||
          accepted.get(assignment.meaningId) !== result.resultFingerprint
        ) {
          throw new Error("Accepted Scene result is stale.");
        }
      }
    },
    preparePreview,
    projectRegistry: async ({ rootDir, storyId, mode }) => {
      await generateProjectRegistry({ rootDir, mode });
      const entry = await resolveCurrentM3Entry(rootDir, storyId);
      return {
        compositionId: entry.descriptor.id,
        registryChecksum: await resolveM3GeneratedRegistryChecksum({
          rootDir,
          storyId,
          entry,
        }),
      };
    },
    listCompositions: async ({ rootDir, compositionId }) => {
      const result = await runProcess(
        join(rootDir, "node_modules/.bin/remotion"),
        ["compositions", "src/index.ts", "--log=error"],
      );
      assertProcessSucceeded(result, "Remotion compositions");
      if (!result.stdout.includes(compositionId)) {
        throw new Error("Production Composition is not listed by Remotion.");
      }
    },
    renderPreview: async ({ rootDir, runId, storyId, compositionId }) => {
      const outputDirectory = join(
        rootDir,
        "out",
        storyId,
        "production",
        runId,
      );
      await mkdir(outputDirectory, { recursive: true });
      const relativePath = `out/${storyId}/production/${runId}/preview.mp4`;
      const result = await runProcess(
        join(rootDir, "node_modules/.bin/remotion"),
        [
          "render",
          "src/index.ts",
          compositionId,
          relativePath,
          "--codec=h264",
          "--audio-codec=aac",
          "--overwrite",
          "--log=error",
        ],
      );
      assertProcessSucceeded(result, "Production preview render");
      return {
        relativePath,
        checksum: await checksumFile(join(rootDir, relativePath)),
      };
    },
    generateReviewMedia: async ({
      rootDir,
      runId,
      storyId,
      compositionId,
      fullPreview,
    }) => {
      const { timing } = await loadPreviewSources(rootDir, storyId);
      const frames = [
        0,
        Math.floor(timing.durationInFrames / 2),
        timing.durationInFrames - 1,
      ].filter((frame, index, values) => values.indexOf(frame) === index);
      const representativeStills = [];
      for (const frame of frames) {
        const relativePath = `out/${storyId}/production/${runId}/still-${frame}.png`;
        const result = await runProcess(
          join(rootDir, "node_modules/.bin/remotion"),
          [
            "still",
            "src/index.ts",
            compositionId,
            relativePath,
            `--frame=${frame}`,
            "--image-format=png",
            "--overwrite",
            "--log=error",
          ],
        );
        assertProcessSucceeded(result, "Production representative still");
        representativeStills.push({
          relativePath,
          checksum: await checksumFile(join(rootDir, relativePath)),
          frame,
        });
      }
      const contactSheetPath = `out/${storyId}/production/${runId}/contact-sheet.png`;
      const selectedFrames = frames
        .map((frame) => `eq(n\\,${frame})`)
        .join("+");
      const contact = await runProcess("ffmpeg", [
        "-v",
        "error",
        "-i",
        join(rootDir, fullPreview.relativePath),
        "-vf",
        `select='${selectedFrames}',scale=640:-1,tile=${frames.length}x1`,
        "-frames:v",
        "1",
        "-y",
        join(rootDir, contactSheetPath),
      ]);
      assertProcessSucceeded(contact, "Production contact sheet");
      return {
        representativeStills,
        contactSheet: {
          relativePath: contactSheetPath,
          checksum: await checksumFile(join(rootDir, contactSheetPath)),
        },
      };
    },
    previewEvidence: async ({
      rootDir,
      storyId,
      requirementsFingerprint,
      mode,
      assembly,
      fullPreview,
      reviewMedia,
    }) => {
      const sources = await loadPreviewSources(rootDir, storyId);
      const inspected = await inspectProductionPreviewMedia({
        rootDir,
        relativePath: fullPreview.relativePath,
        expected: {
          width: sources.render.width,
          height: sources.render.height,
          fps: sources.render.fps,
          frameCount: sources.timing.durationInFrames,
        },
        runProcess,
      });
      if (inspected.checksum !== fullPreview.checksum) {
        throw new Error("Production preview checksum drifted.");
      }
      for (const media of [
        ...reviewMedia.representativeStills,
        reviewMedia.contactSheet,
      ]) {
        if (
          (await checksumFile(join(rootDir, media.relativePath))) !==
          media.checksum
        ) {
          throw new Error("Production review media checksum drifted.");
        }
      }
      const evidence = buildProductionPreviewEvidence({
        storyId,
        compositionId: assembly.compositionId,
        requirementsFingerprint,
        previewAssemblyFingerprint: assembly.assemblyFingerprint,
        sceneCoverageFingerprint: assembly.sceneCoverageFingerprint,
        rendererRegistryFingerprint: assembly.rendererRegistryFingerprint,
        storyVisualProjectionFingerprint:
          assembly.storyVisualProjectionFingerprint,
        media: {
          fullPreview,
          representativeStills: reviewMedia.representativeStills,
          contactSheet: reviewMedia.contactSheet,
        },
        technical: {
          expected: {
            width: sources.render.width,
            height: sources.render.height,
            fps: sources.render.fps,
            frameCount: sources.timing.durationInFrames,
            audio: "narration-plus-optional-scene-local",
          },
          actual: inspected.actual,
        },
        currentChecks: {
          coverage: "current-all-ready",
          rendererRegistry: "current",
          projections: "current",
          assembly: "current",
          mediaIdentity: "current",
        },
        absentEnhancements: {
          globalSoundPlan: true,
          bgm: true,
          crossSceneAmbience: true,
          ducking: true,
          globalVisualLayers: true,
        },
        aggregateStatus: "mechanically-ready",
        handoff: "awaiting explicit user preview decision",
      });
      return writeOrCheckProductionPreviewEvidence({
        rootDir,
        evidence,
        mode,
      });
    },
    mechanicalCheck: async ({
      rootDir,
      storyId,
      requirementsFingerprint,
      mode,
      assembly,
      evidence,
    }) => {
      const check = buildProductionPreviewMechanicalCheck({
        storyId,
        requirementsFingerprint,
        previewAssemblyFingerprint: assembly.assemblyFingerprint,
        evidenceFingerprint: evidence.evidenceFingerprint,
        checks: {
          contracts: "pass",
          sceneCoverage: "pass",
          rendererRegistry: "pass",
          projections: "pass",
          composition: "pass",
          media: "pass",
          completeDecode: "pass",
          enhancementAbsence: "pass",
        },
        aggregateStatus: "mechanically-ready",
        handoff: "awaiting explicit user preview decision",
      });
      return writeOrCheckProductionPreviewMechanicalCheck({
        rootDir,
        check,
        mode,
      });
    },
    checkCurrentPreview: async (request) => {
      await dependencies.assertCurrentFreeze(request);
      const assembly = ProductionPreviewAssemblySchema.parse(
        await dependencies.preparePreview({ ...request, mode: "check" }),
      );
      const registry = await dependencies.projectRegistry({
        ...request,
        mode: "check",
      });
      if (
        registry.compositionId !== assembly.compositionId ||
        assembly.requirementsFingerprint !== request.requirementsFingerprint
      ) {
        throw new Error("Current production preview registry is stale.");
      }
      const evidence = ProductionPreviewEvidenceSchema.parse(
        await readJsonFile(
          join(
            request.rootDir,
            `src/projects/${request.storyId}/generated/production-preview-evidence.generated.json`,
          ),
        ),
      );
      await dependencies.previewEvidence({
        ...request,
        mode: "check",
        assembly,
        fullPreview: evidence.media.fullPreview,
        reviewMedia: {
          representativeStills: evidence.media.representativeStills,
          contactSheet: evidence.media.contactSheet,
        },
      });
      const check = ProductionPreviewMechanicalCheckSchema.parse(
        await readJsonFile(
          join(
            request.rootDir,
            `src/projects/${request.storyId}/generated/production-preview-mechanical-check.generated.json`,
          ),
        ),
      );
      await dependencies.mechanicalCheck({
        ...request,
        mode: "check",
        assembly,
        evidence,
      });
      return { assembly, evidence, check };
    },
  };
  return dependencies;
};

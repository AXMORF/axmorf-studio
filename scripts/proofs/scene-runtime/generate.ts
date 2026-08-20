import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { format } from "prettier";

import { SCENE_RUNTIME_PROOF_IDENTITY } from "../../../proofs/scene-runtime/identity";

import {
  LocalizationManifestSchema,
  VisualStyleSpecSchema,
  buildReferenceFidelityEvidence,
  buildSceneCoverageMap,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneTaskInputV6,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  computeLocalizationFingerprint,
  computeVisualStyleFingerprint,
  createFingerprint,
  resolveSceneReadabilityPolicy,
  type ExternalReferenceSnapshot,
  type LocalizationManifest,
  type ResourceCatalog,
  type ResourceCatalogEntry,
  type Sha256Digest,
} from "../../../src/contracts";
import {
  buildDependencyClosure,
  readExactDependencyAllowlist,
} from "../../external-references/dependency-closure";
import { generateReferenceFidelityReceipt } from "../../external-references/fidelity";
import {
  checksumExternalBytes,
  readExternalRegularFile,
} from "../../external-references/project-files";
import { loadExternalReferenceSnapshot } from "../../external-references/snapshot";
import { RENDERER_REGISTRY_GENERATOR_ID } from "../../renderer-registry/domain";
import { writeOrCheckRendererRegistry } from "../../renderer-registry/project-files";
import { buildScenePackage } from "../../scene-package/domain";
import {
  writeOrCheckSceneArtifact,
  type SceneArtifactMode,
} from "../../scene-package/project-files";
import { generateSceneRuntimeProofAssets } from "./generate-assets";
import { buildResourceCatalog } from "../../catalog/domain";
import { loadCoreCatalogAuthorityDescriptors } from "../../catalog/project-files";

const STORY_ID = SCENE_RUNTIME_PROOF_IDENTITY.storyId;
const MEANING_ID = SCENE_RUNTIME_PROOF_IDENTITY.meaningId;
const CARD_ID = "draw-svg-trace";
const PROOF_ROOT = "proofs/scene-runtime";
const PROOF_FIXTURE_ROOT = `${PROOF_ROOT}/fixtures`;
const PROOF_EVIDENCE_ROOT = `${PROOF_ROOT}/evidence`;
const SCENE_ROOT = `${PROOF_FIXTURE_ROOT}/scenes/${MEANING_ID}`;
const FIXTURE_REVISION = "d4915443232e89527fdc9d7e79f132ba411fc440";
const EXTERNAL_REFERENCE_FIXTURE_ROOT = `tests/fixtures/external-references/video-shotcraft/${FIXTURE_REVISION}`;
const LOCALIZATION_ROOT = `${SCENE_ROOT}/shots/video-shotcraft/${CARD_ID}`;

const writeOrCheckBytes = async ({
  destination,
  bytes,
  mode,
}: {
  readonly destination: string;
  readonly bytes: Uint8Array;
  readonly mode: SceneArtifactMode;
}): Promise<void> => {
  try {
    const current = await readFile(destination);
    if (
      current.length === bytes.length &&
      current.every((value, index) => value === bytes[index])
    )
      return;
    if (mode === "check")
      throw new Error("Scene runtime proof localized bytes are stale.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (mode === "check")
      throw new Error("Scene runtime proof localized bytes are missing.");
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(Uint8Array.from(bytes));
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};

const getEntry = (
  catalog: ResourceCatalog,
  id: string,
): ResourceCatalogEntry => {
  const entry = catalog.entries.find(
    (candidate) => candidate.descriptor.id === id,
  );
  if (entry === undefined)
    throw new Error(`Scene runtime proof Catalog entry is missing: ${id}.`);
  return entry;
};

const buildProofLocalization = async ({
  rootDir,
  snapshot,
  mode,
}: {
  readonly rootDir: string;
  readonly snapshot: ExternalReferenceSnapshot;
  readonly mode: SceneArtifactMode;
}): Promise<LocalizationManifest> => {
  const fixtureRoot = join(rootDir, EXTERNAL_REFERENCE_FIXTURE_ROOT);
  const closure = await buildDependencyClosure({
    snapshotRoot: fixtureRoot,
    entryPath: snapshot.index.cards[0].demoSourcePath,
    allowlist: await readExactDependencyAllowlist(rootDir),
  });
  const sourceInputs = await Promise.all(
    closure.files.map(async (file) => ({
      file,
      bytes: await readExternalRegularFile(fixtureRoot, file.sourcePath),
    })),
  );
  const licenseBytes = await readExternalRegularFile(fixtureRoot, "LICENSE");
  const license = snapshot.files.find((file) => file.role === "source-license");
  if (
    license === undefined ||
    checksumExternalBytes(licenseBytes) !== license.checksum ||
    sourceInputs.some(
      ({ file, bytes }) => checksumExternalBytes(bytes) !== file.checksum,
    ) ||
    snapshot.sourceLicense.attributionText === null
  ) {
    throw new Error("Scene runtime proof localization inputs are stale.");
  }
  const files = [
    ...sourceInputs.map(({ file, bytes }) => ({
      kind: "source" as const,
      sourcePath: file.sourcePath,
      sourceChecksum: file.checksum,
      destinationPath: `upstream/${file.sourcePath}`,
      localizedChecksum: checksumExternalBytes(bytes),
      dependencyReason: file.dependencyReason,
    })),
    {
      kind: "license" as const,
      sourcePath: "LICENSE",
      sourceChecksum: license.checksum,
      destinationPath: "LICENSE",
      localizedChecksum: checksumExternalBytes(licenseBytes),
      dependencyReason: "license" as const,
    },
  ].sort((left, right) =>
    left.destinationPath.localeCompare(right.destinationPath),
  );
  const input = {
    schemaVersion: 1 as const,
    projectId: STORY_ID,
    meaningId: MEANING_ID,
    cardId: CARD_ID,
    snapshotFingerprint: snapshot.snapshotFingerprint,
    closureFingerprint: closure.closureFingerprint,
    packageLockChecksum: closure.packageLockChecksum,
    targetRoot: LOCALIZATION_ROOT,
    licenseId: snapshot.sourceLicense.id,
    attributionText: snapshot.sourceLicense.attributionText,
    files,
  };
  const localization = LocalizationManifestSchema.parse({
    ...input,
    localizationFingerprint: computeLocalizationFingerprint(input),
  });
  await Promise.all([
    ...sourceInputs.map(({ file, bytes }) =>
      writeOrCheckBytes({
        destination: join(
          rootDir,
          LOCALIZATION_ROOT,
          `upstream/${file.sourcePath}`,
        ),
        bytes: Uint8Array.from(Array.from(bytes)),
        mode,
      }),
    ),
    writeOrCheckBytes({
      destination: join(rootDir, LOCALIZATION_ROOT, "LICENSE"),
      bytes: Uint8Array.from(Array.from(licenseBytes)),
      mode,
    }),
  ]);
  await writeOrCheckSceneArtifact({
    destination: join(
      rootDir,
      LOCALIZATION_ROOT,
      "localization-manifest.generated.json",
    ),
    value: localization,
    mode,
  });
  return localization;
};

const buildRendererGraph = async (rootDir: string) => {
  const rendererPath = `${SCENE_ROOT}/Renderer.tsx`;
  const shotPath = `${SCENE_ROOT}/shots/DrawSvgTraceShot.tsx`;
  const [rendererBytes, shotBytes] = await Promise.all([
    readFile(join(rootDir, rendererPath)),
    readFile(join(rootDir, shotPath)),
  ]);
  const files = [
    {
      sourcePath: rendererPath,
      checksum: checksumExternalBytes(rendererBytes),
    },
    { sourcePath: shotPath, checksum: checksumExternalBytes(shotBytes) },
  ].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  return {
    rendererPath,
    shotPath,
    rendererSource: rendererBytes.toString("utf8"),
    shotSource: shotBytes.toString("utf8"),
    files,
    sourceGraphFingerprint: createFingerprint({
      namespace: "renderer-source-graph",
      version: 1,
      value: { rendererPath, files },
    }),
  };
};

const checksumFile = async (
  rootDir: string,
  path: string,
): Promise<Sha256Digest> =>
  checksumExternalBytes(await readFile(join(rootDir, path)));

export const generateSceneRuntimeProof = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: SceneArtifactMode;
}) => {
  await generateSceneRuntimeProofAssets({ rootDir, mode });
  const catalog = buildResourceCatalog(
    await loadCoreCatalogAuthorityDescriptors(rootDir),
  );
  const fixtureRoot = join(rootDir, EXTERNAL_REFERENCE_FIXTURE_ROOT);
  const snapshot = await loadExternalReferenceSnapshot(fixtureRoot);
  const localization = await buildProofLocalization({
    rootDir,
    snapshot,
    mode,
  });
  const shape = getEntry(catalog, SCENE_RUNTIME_PROOF_IDENTITY.assetIds.shape);
  const pulse = getEntry(catalog, SCENE_RUNTIME_PROOF_IDENTITY.assetIds.pulse);
  const style = getEntry(catalog, "style.editorial-tech");
  if (
    shape.descriptor.kind !== "asset" ||
    pulse.descriptor.kind !== "asset" ||
    style.descriptor.kind !== "style-profile"
  ) {
    throw new Error("Scene runtime proof Catalog descriptor kinds are stale.");
  }
  const visualStyle = VisualStyleSpecSchema.parse({
    schemaVersion: 1,
    storyId: STORY_ID,
    styleProfileId: style.descriptor.styleProfileId,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    artDirection: {
      medium: "Crisp vector systems diagram",
      palette: "Deep navy with cyan and white proof accents",
      lighting: "Flat high-contrast technical illumination",
      texture: "Clean SVG edges without simulated material noise",
      compositionGrammar: "One centered geometric proof card",
      motionLanguage: "Frame-driven trace close flash handoff and settle",
      typography: "Bold compact sans-serif technical labels",
    },
    continuityRules: ["Keep the proof shape centered for the complete Beat"],
    forbiddenTreatments: ["No camera cut or automatic layout variation"],
  });
  const visualStyleFingerprint = computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: style.descriptorFingerprint,
  });
  const task = buildSceneTaskInputV6({
    storyId: STORY_ID,
    meaningId: MEANING_ID,
    storyBeat: {
      kind: "narrated-scene",
      meaningId: MEANING_ID,
      narrativePurpose:
        "Prove one deterministic visual and local sound Scene slot.",
      ttsChunks: [
        {
          chunkId: SCENE_RUNTIME_PROOF_IDENTITY.captionChunkId,
          ttsText: "This synthetic scene proves the Scene runtime foundation.",
        },
      ],
      explicitPauses: [],
    },
    sourceReferences: [],
    timingBeat: {
      kind: "narrated-scene",
      meaningId: MEANING_ID,
      startFrame: 0,
      endFrame: SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
    },
    storyFingerprint: createFingerprint({
      namespace: "scene-runtime-proof-story",
      version: 1,
      value: { meaningId: MEANING_ID },
    }),
    renderFingerprint: createFingerprint({
      namespace: "scene-runtime-proof-render",
      version: 1,
      value: {
        fps: SCENE_RUNTIME_PROOF_IDENTITY.fps,
        width: SCENE_RUNTIME_PROOF_IDENTITY.width,
        height: SCENE_RUNTIME_PROOF_IDENTITY.height,
        durationInFrames: SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
      },
    }),
    visualStyleFingerprint,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    allowedSnapshots: [
      {
        sourceId: snapshot.sourceId,
        snapshotFingerprint: snapshot.snapshotFingerprint,
        allowedCardIds: [CARD_ID],
      },
    ],
    allowedResourceIds: [shape.descriptor.id, pulse.descriptor.id],
    continuity: {
      previousMeaningId: null,
      previousSummary: null,
      nextMeaningId: null,
      nextSummary: null,
      continuityBrief:
        "Standalone synthetic proof with no adjacent formal Story Scene.",
    },
    allowedDirectories: {
      sceneRoot: `src/projects/${STORY_ID}/scenes/${MEANING_ID}`,
      publicAssetRoot: `public/assets/library/${STORY_ID}/${MEANING_ID}`,
    },
    readabilityPolicy: resolveSceneReadabilityPolicy({
      width: SCENE_RUNTIME_PROOF_IDENTITY.width,
      height: SCENE_RUNTIME_PROOF_IDENTITY.height,
    }),
    sceneCompositionBoundaryVersion: "scene-composition-boundary-v1",
  });
  const shapeSelected = {
    schemaVersion: 1 as const,
    resourceId: shape.descriptor.id,
    kind: "asset" as const,
    role: "scene-visual" as const,
    descriptorFingerprint: shape.descriptorFingerprint,
    catalogFingerprint: catalog.catalogFingerprint,
  };
  const pulseSelected = {
    schemaVersion: 1 as const,
    resourceId: pulse.descriptor.id,
    kind: "asset" as const,
    role: "sound-effect" as const,
    descriptorFingerprint: pulse.descriptorFingerprint,
    catalogFingerprint: catalog.catalogFingerprint,
  };
  const visual = buildSceneVisualPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: MEANING_ID,
    semanticObjective: "Make the fixed Scene runtime window visibly testable.",
    subject: "One project-authored geometric proof shape.",
    primaryAction: "A moving pen traces closes and reveals the shape.",
    causalLink: "The closed trace triggers the visual and local sound handoff.",
    primaryComposition: "Centered proof shape with one technical header.",
    styleRealization: ["Cyan vector trace", "Deep navy technical field"],
    continuity: `Enter and leave within the same fixed ${SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames}-frame Beat.`,
    orderedShotIds: ["draw-svg-trace-shot"],
    visualResourceIds: [shape.descriptor.id],
    recipeDecision: "exact-demo-localized",
    fallbackIntent:
      "Fail closed instead of approximating a stale exact recipe.",
  });
  const shots = buildShotPlanSet({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: MEANING_ID,
    sceneDurationInFrames: SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
    shots: [
      {
        shotId: "draw-svg-trace-shot",
        order: 0,
        primaryRange: {
          startFrame: 0,
          endFrame: SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
        },
        purpose:
          "Prove exact localized trace motion in one fixed Scene renderer.",
        action: "Trace for 40 frames then flash reveal and settle.",
        visualResourceIds: [shape.descriptor.id],
        syncAnchorIds: ["outline-closes"],
      },
    ],
  });
  const anchors = buildSceneSyncAnchors({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: MEANING_ID,
    sceneDurationInFrames: SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
    anchors: [
      {
        eventId: "outline-closes",
        sceneLocalFrame: 48,
        purpose: "Bind the close flash to one Scene-local pulse.",
      },
    ],
  });
  const sound = buildSceneSoundPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: MEANING_ID,
    sceneDurationInFrames: SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
    contributions: [
      {
        contributionId: "close-pulse",
        resource: pulseSelected,
        timing: { kind: "anchor", eventId: "outline-closes", offsetFrames: 0 },
        durationInFrames: 6,
        volume: 0.55,
      },
    ],
  });
  const card = snapshot.index.cards[0];
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: task.taskInputFingerprint,
    selections: [
      {
        mode: "exact-demo-localized",
        sourceId: snapshot.sourceId,
        snapshotFingerprint: snapshot.snapshotFingerprint,
        cardId: card.cardId,
        styleKey: card.styleKey,
        cardFingerprint: card.cardFingerprint,
        styleFingerprint: card.styleFingerprint,
        cardDocumentChecksum: card.cardDocumentChecksum,
        demoSourceChecksum: card.demoSourceChecksum,
        previewChecksum: card.previewChecksum,
        closureFingerprint: localization.closureFingerprint,
        localizationFingerprint: localization.localizationFingerprint,
        adaptationMode: "adapted",
        selectionReason:
          "Use the exact trace close handoff as the Scene runtime fixture.",
        requiredTraits: [
          "40-frame outline trace",
          "closed-outline flash handoff",
          "pen motion across trace",
        ],
      },
    ],
  });
  const evidenceRoot = `${PROOF_EVIDENCE_ROOT}/fidelity`;
  const evidencePaths = {
    sourcePreview: `${EXTERNAL_REFERENCE_FIXTURE_ROOT}/gallery/media/draw-svg-trace.mp4`,
    adaptationPreview: `${evidenceRoot}/adaptation-preview.mp4`,
    sourceEarly: `${evidenceRoot}/source-frame-28.png`,
    sourceLate: `${evidenceRoot}/source-frame-98.png`,
    adaptationEarly: `${evidenceRoot}/adaptation-frame-24.png`,
    adaptationLate: `${evidenceRoot}/adaptation-frame-84.png`,
  } as const;
  const checksums = Object.fromEntries(
    await Promise.all(
      Object.entries(evidencePaths).map(async ([key, path]) => [
        key,
        await checksumFile(rootDir, path),
      ]),
    ),
  ) as Record<keyof typeof evidencePaths, Sha256Digest>;
  if (checksums.sourcePreview !== card.previewChecksum) {
    throw new Error(
      "Scene runtime proof source preview does not match the frozen card.",
    );
  }
  const evidence = buildReferenceFidelityEvidence({
    selectionFingerprint: selection.selectionFingerprint,
    items: [
      {
        selectionIndex: 0,
        normalizedFps: SCENE_RUNTIME_PROOF_IDENTITY.fps,
        sourceDurationInFrames: 140,
        adaptationDurationInFrames:
          SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
        sourcePreview: {
          artifactPath: evidencePaths.sourcePreview,
          checksum: checksums.sourcePreview,
        },
        adaptationPreview: {
          artifactPath: evidencePaths.adaptationPreview,
          checksum: checksums.adaptationPreview,
        },
        phasePairs: [
          {
            normalizedPhase: 0.2,
            sourceFrame: 28,
            adaptationFrame: 24,
            sourceEvidence: {
              artifactPath: evidencePaths.sourceEarly,
              checksum: checksums.sourceEarly,
            },
            adaptationEvidence: {
              artifactPath: evidencePaths.adaptationEarly,
              checksum: checksums.adaptationEarly,
            },
          },
          {
            normalizedPhase: 0.7,
            sourceFrame: 98,
            adaptationFrame: 84,
            sourceEvidence: {
              artifactPath: evidencePaths.sourceLate,
              checksum: checksums.sourceLate,
            },
            adaptationEvidence: {
              artifactPath: evidencePaths.adaptationLate,
              checksum: checksums.adaptationLate,
            },
          },
        ],
      },
    ],
  });
  const graph = await buildRendererGraph(rootDir);
  const fidelityReceipt = await generateReferenceFidelityReceipt({
    repositoryRoot: rootDir,
    snapshot,
    localization,
    selection,
    evidence,
    rendererPath: graph.rendererPath,
    rendererSource: graph.rendererSource,
    adaptedShotPath: graph.shotPath,
    adaptedShotSource: graph.shotSource,
  });
  const rendererId = `${STORY_ID}-${MEANING_ID}`;
  const selectedResources = [
    { selected: pulseSelected, descriptor: pulse.descriptor },
    { selected: shapeSelected, descriptor: shape.descriptor },
  ];
  const scenePackage = buildScenePackage({
    task,
    visual,
    shots,
    anchors,
    sound,
    selection,
    fidelityReceipt,
    selectedResources,
    rendererBinding: {
      rendererId,
      rendererSourceFingerprint: graph.sourceGraphFingerprint,
    },
    current: {
      timingBeat: task.timingBeat,
      semanticTimingFingerprint: createFingerprint({
        namespace: "scene-runtime-proof-semantic-timing",
        version: 1,
        value: {
          meaningId: MEANING_ID,
          startFrame: 0,
          endFrame: SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
        },
      }),
      visualStyleFingerprint: task.visualStyleFingerprint,
      resourceCatalogFingerprint: task.resourceCatalogFingerprint,
      snapshotFingerprints: [snapshot.snapshotFingerprint],
      rendererSourceFingerprint: graph.sourceGraphFingerprint,
      visualRuntimeVersion: "story-visual-runtime-v2",
      sceneAudioRuntimeVersion: "scene-audio-runtime-v2",
    },
  });
  const coverage = buildSceneCoverageMap({
    storyId: STORY_ID,
    storyBeatOrder: [MEANING_ID],
    packages: [scenePackage],
    fallbacks: [],
    stalePackages: [],
  });
  const registryEntries = [
    {
      meaningId: MEANING_ID,
      rendererId,
      rendererPath: graph.rendererPath,
      sourceGraphFingerprint: graph.sourceGraphFingerprint,
    },
  ];
  const rendererRegistryFingerprint = createFingerprint({
    namespace: "renderer-registry",
    version: 1,
    value: {
      generatorId: RENDERER_REGISTRY_GENERATOR_ID,
      projectId: STORY_ID,
      entries: registryEntries,
    },
  });
  const registrySource = await format(
    `// Generated by ${RENDERER_REGISTRY_GENERATOR_ID}. Do not edit.
import Renderer from "./scenes/${MEANING_ID}/Renderer";
import type { SceneRendererRegistry } from "../../../src/remotion/runtime/story-visual/types";

export const rendererRegistryFingerprint = ${JSON.stringify(rendererRegistryFingerprint)};
export const rendererSourceGraphFingerprints = {
  ${JSON.stringify(rendererId)}: ${JSON.stringify(graph.sourceGraphFingerprint)},
} as const;
export const rendererRegistry = {
  ${JSON.stringify(rendererId)}: Renderer,
} as const satisfies SceneRendererRegistry;
`,
    { parser: "typescript" },
  );
  const generated = `${SCENE_ROOT}/generated`;
  const artifacts: readonly [string, unknown][] = [
    [
      `${PROOF_FIXTURE_ROOT}/generated/external-reference-snapshot.generated.json`,
      snapshot,
    ],
    [`${PROOF_FIXTURE_ROOT}/visual-style.generated.json`, visualStyle],
    [`${SCENE_ROOT}/task-input.generated.json`, task],
    [`${SCENE_ROOT}/visual-plan.json`, visual],
    [`${SCENE_ROOT}/shot-plan.json`, shots],
    [`${SCENE_ROOT}/sync-anchors.json`, anchors],
    [`${SCENE_ROOT}/sound-plan.json`, sound],
    [
      `${SCENE_ROOT}/selected-resources.json`,
      { schemaVersion: 1, selectedResources },
    ],
    [`${SCENE_ROOT}/shot-recipe-selection.json`, selection],
    [`${generated}/localization-manifest.generated.json`, localization],
    [`${generated}/reference-fidelity-evidence.generated.json`, evidence],
    [`${generated}/reference-fidelity.generated.json`, fidelityReceipt],
    [`${generated}/scene-package.generated.json`, scenePackage],
    [`${PROOF_FIXTURE_ROOT}/generated/scene-coverage.generated.json`, coverage],
    [
      `${PROOF_FIXTURE_ROOT}/generated/renderer-source-graph.generated.json`,
      {
        schemaVersion: 1,
        rendererPath: graph.rendererPath,
        files: graph.files,
        sourceGraphFingerprint: graph.sourceGraphFingerprint,
      },
    ],
  ];
  for (const [path, value] of artifacts) {
    try {
      await writeOrCheckSceneArtifact({
        destination: join(rootDir, path),
        value,
        mode,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Generated Scene artifact bytes are stale."
      ) {
        throw new Error(`Scene runtime proof artifact is stale: ${path}.`);
      }
      throw error;
    }
  }
  await writeOrCheckRendererRegistry({
    destination: join(
      rootDir,
      `${PROOF_FIXTURE_ROOT}/renderer-registry.generated.ts`,
    ),
    source: registrySource,
    mode,
  });
  return {
    scenePackageFingerprint: scenePackage.packageFingerprint,
    coverageFingerprint: coverage.coverageFingerprint,
    rendererRegistryFingerprint,
    fidelityReceiptFingerprint: fidelityReceipt.receiptFingerprint,
  };
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const command = process.argv[2];
  if (
    process.argv.length !== 3 ||
    (command !== "write" && command !== "check")
  ) {
    throw new Error("Expected exactly write or check.");
  }
  generateSceneRuntimeProof({ rootDir: process.cwd(), mode: command })
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Scene runtime proof generation failed."}\n`,
      );
      process.exitCode = 1;
    });
}

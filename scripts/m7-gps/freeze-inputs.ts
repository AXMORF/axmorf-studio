import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  RenderSpecSchema,
  ResourceCatalogSchema,
  SemanticTimingSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
  buildSceneTaskInput,
  computeRenderSpecFingerprint,
  computeStoryFingerprint,
  computeVisualStyleFingerprint,
  type ResourceCatalog,
  type SceneTaskInput,
  type VisualStyleSpec,
} from "../../src/contracts";
import {
  writeOrCheckSceneArtifact,
  type SceneArtifactMode,
} from "../scene-package/project-files";
import { GPS_M7_AUDIO_CUES } from "./generate-local-audio";

export const GPS_M7_MEANING_IDS = [
  "position-is-time",
  "two-relativistic-effects",
  "net-drift",
  "error-accumulation",
  "practical-conclusion",
] as const;

const STORY_ID = "gps-relativity";
const STYLE_PROFILE_ID = "editorial-tech";

const ALLOWED_CAPABILITIES = {
  "position-is-time": ["capability.motion", "capability.primitives"],
  "two-relativistic-effects": ["capability.motion", "capability.primitives"],
  "net-drift": [
    "capability.chart",
    "capability.motion",
    "capability.primitives",
  ],
  "error-accumulation": ["capability.motion", "capability.primitives"],
  "practical-conclusion": ["capability.motion", "capability.primitives"],
} as const;

const readRegularJson = async (rootDir: string, repositoryPath: string) => {
  const path = join(rootDir, repositoryPath);
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("M7 GPS frozen input authority must be a regular file.");
  }
  return JSON.parse(await readFile(path, "utf8"));
};

const getCatalogEntry = (catalog: ResourceCatalog, resourceId: string) => {
  const entry = catalog.entries.find(
    ({ descriptor }) => descriptor.id === resourceId,
  );
  if (entry === undefined) {
    throw new Error(`M7 GPS Catalog resource is missing: ${resourceId}.`);
  }
  if (
    entry.descriptor.status !== "approved" ||
    entry.descriptor.allowedUse !== "runtime-approved"
  ) {
    throw new Error(`M7 GPS Catalog resource is not approved: ${resourceId}.`);
  }
  return entry;
};

const createVisualStyle = (
  catalog: ResourceCatalog,
): {
  readonly visualStyle: VisualStyleSpec;
  readonly visualStyleFingerprint: ReturnType<
    typeof computeVisualStyleFingerprint
  >;
} => {
  const styleEntry = getCatalogEntry(catalog, `style.${STYLE_PROFILE_ID}`);
  if (
    styleEntry.descriptor.kind !== "style-profile" ||
    styleEntry.descriptor.styleProfileId !== STYLE_PROFILE_ID
  ) {
    throw new Error("M7 GPS style profile identity is stale.");
  }
  const visualStyle = VisualStyleSpecSchema.parse({
    schemaVersion: 1,
    storyId: STORY_ID,
    styleProfileId: STYLE_PROFILE_ID,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    artDirection: {
      medium:
        "Crisp editorial systems diagrams built from project-local vector geometry and restrained technical type.",
      palette:
        "Deep space navy, orbital cyan, receiver blue, warm amber for negative clock drift, and mint for positive correction.",
      lighting:
        "Flat luminous signal geometry with a single cool orbital glow and no decorative cinematic flares.",
      texture:
        "Clean matte fields, precise vector edges, sparse dot-grid measurement marks, and no simulated paper or film grain.",
      compositionGrammar:
        "One continuous Earth-satellite-receiver coordinate field; causal quantities enter around the shared focal object and remain clear of caption-safe space.",
      motionLanguage:
        "Frame-driven signal propagation, clock phase drift, range expansion, and decisive lock states with readable holds.",
      typography:
        "Bold geometric sans-serif numerals with compact Chinese technical labels; numerical hierarchy outranks decoration.",
    },
    continuityRules: [
      "Keep Earth below the satellites and preserve the left-to-right signal propagation direction across all five Scenes.",
      "Keep satellite clocks cyan; show negative time drift in amber and positive time drift in mint with consistent arrow directions.",
      "Carry the same receiver identity from the ranging geometry through the shared timing network into the final phone blue dot.",
      "Reserve the lower caption-safe region and keep critical equations, distances, and clock values above it.",
      "Use a stable numeric hierarchy: daily microseconds, per-microsecond distance, accumulated range error, then corrected position.",
      "End every Scene on a readable state that the next Scene can inherit without moving any StoryBeat boundary.",
    ],
    forbiddenTreatments: [
      "No automatic layout, keyword-selected cards, random camera moves, or generic dashboard grids.",
      "No unmotivated HUD chrome, decorative data rain, excessive glow, or brand-like interface furniture.",
      "No CSS animation, CSS transition, Tailwind animation utility, runtime network request, or directory scan.",
      "No historical Scene, prior Composition, old still, contact sheet, or production layout imitation.",
      "No subtitle-shaped text blocks inside Scene renderers and no visual split based on TTSChunk or CaptionCue boundaries.",
    ],
  });
  return {
    visualStyle,
    visualStyleFingerprint: computeVisualStyleFingerprint({
      visualStyle,
      resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
    }),
  };
};

export const buildGpsM7FrozenInputs = async (
  rootDir: string,
): Promise<{
  readonly visualStyle: VisualStyleSpec;
  readonly visualStyleFingerprint: ReturnType<
    typeof computeVisualStyleFingerprint
  >;
  readonly tasks: readonly SceneTaskInput[];
}> => {
  const [story, render, timing, catalog] = await Promise.all([
    readRegularJson(rootDir, "src/projects/gps-relativity/story.json").then(
      StorySpecSchema.parse,
    ),
    readRegularJson(rootDir, "src/projects/gps-relativity/render.json").then(
      RenderSpecSchema.parse,
    ),
    readRegularJson(
      rootDir,
      "src/projects/gps-relativity/generated/semantic-timing.generated.json",
    ).then(SemanticTimingSchema.parse),
    readRegularJson(
      rootDir,
      "src/remotion/catalog/resource-catalog.generated.json",
    ).then(ResourceCatalogSchema.parse),
  ]);
  if (
    story.storyId !== STORY_ID ||
    timing.storyId !== STORY_ID ||
    render.compositionId !== "GpsRelativity" ||
    story.beats.length !== GPS_M7_MEANING_IDS.length ||
    timing.storyBeats.length !== GPS_M7_MEANING_IDS.length
  ) {
    throw new Error(
      "M7 GPS Story, RenderSpec, or SemanticTiming identity is stale.",
    );
  }
  const { visualStyle, visualStyleFingerprint } = createVisualStyle(catalog);
  const storyFingerprint = computeStoryFingerprint(story);
  const renderFingerprint = computeRenderSpecFingerprint(render);
  const tasks = GPS_M7_MEANING_IDS.map((meaningId, index) => {
    const storyBeat = story.beats[index];
    const timingBeat = timing.storyBeats[index];
    const audio = GPS_M7_AUDIO_CUES[index];
    if (
      storyBeat?.meaningId !== meaningId ||
      timingBeat?.meaningId !== meaningId ||
      audio?.meaningId !== meaningId
    ) {
      throw new Error("M7 GPS StoryBeat order is stale.");
    }
    const audioEntry = getCatalogEntry(catalog, audio.resourceId);
    if (
      audioEntry.descriptor.kind !== "asset" ||
      audioEntry.descriptor.assetKind !== "audio" ||
      audioEntry.descriptor.mediaRole !== "scene-sfx" ||
      audioEntry.descriptor.localPath !== audio.localPath ||
      audioEntry.descriptor.license.verificationStatus !== "verified" ||
      audioEntry.descriptor.license.sourceEvidenceFingerprint !==
        audioEntry.descriptor.checksum
    ) {
      throw new Error(`M7 GPS audio Catalog identity is stale: ${meaningId}.`);
    }
    const capabilityIds = ALLOWED_CAPABILITIES[meaningId];
    for (const capabilityId of capabilityIds) {
      const entry = getCatalogEntry(catalog, capabilityId);
      if (entry.descriptor.kind !== "capability") {
        throw new Error(
          `M7 GPS capability identity is stale: ${capabilityId}.`,
        );
      }
    }
    const previousBeat = story.beats[index - 1] ?? null;
    const nextBeat = story.beats[index + 1] ?? null;
    return buildSceneTaskInput({
      storyId: STORY_ID,
      meaningId,
      storyBeat,
      timingBeat,
      storyFingerprint,
      semanticTimingFingerprint: timing.fingerprint,
      renderFingerprint,
      visualStyleFingerprint,
      resourceCatalogFingerprint: catalog.catalogFingerprint,
      allowedSnapshots: [],
      allowedResourceIds: [...capabilityIds, audio.resourceId],
      continuity: {
        previousMeaningId: previousBeat?.meaningId ?? null,
        previousSummary: previousBeat?.narrativePurpose ?? null,
        nextMeaningId: nextBeat?.meaningId ?? null,
        nextSummary: nextBeat?.narrativePurpose ?? null,
        continuityBrief:
          index === 0
            ? "Establish the shared Earth-satellite-receiver coordinate field, signal direction, and clock pulse that every later Scene inherits."
            : index === GPS_M7_MEANING_IDS.length - 1
              ? "Inherit the corrected shared timing network and settle it into the same receiver identity as a phone blue-dot lock before this Beat ends."
              : "Preserve the shared Earth-satellite-receiver identities, sign colors, signal direction, numerical hierarchy, and a readable handoff to both adjacent meanings.",
      },
      allowedDirectories: {
        sceneRoot: `src/projects/${STORY_ID}/scenes/${meaningId}`,
        publicAssetRoot: `public/projects/${STORY_ID}/scenes/${meaningId}`,
      },
    });
  });
  return { visualStyle, visualStyleFingerprint, tasks };
};

export const freezeGpsM7Inputs = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: SceneArtifactMode;
}): Promise<void> => {
  const frozen = await buildGpsM7FrozenInputs(rootDir);
  const outputs = [
    {
      destination: join(
        rootDir,
        "src/projects/gps-relativity/visual-style.json",
      ),
      value: frozen.visualStyle,
    },
    ...frozen.tasks.map((task) => ({
      destination: join(
        rootDir,
        `src/projects/gps-relativity/scenes/${task.meaningId}/task-input.generated.json`,
      ),
      value: task,
    })),
  ];
  for (const output of outputs) {
    await writeOrCheckSceneArtifact({ ...output, mode });
  }
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
  freezeGpsM7Inputs({ rootDir: process.cwd(), mode: command }).catch(
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "M7 GPS input freeze failed."}\n`,
      );
      process.exitCode = 1;
    },
  );
}

import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import { StoryIdSchema } from "../../src/contracts";
import { writeProductionFileAtomic } from "./adapters/run-store";

export const PRODUCTION_PROJECT_SCAFFOLD_MARKER =
  "@generated-by production-project-scaffold-v1" as const;

const componentNameFor = (storyId: string) =>
  `${storyId
    .split("-")
    .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join("")}Composition`;

export const renderProductionProjectScaffold = (rawStoryId: string) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const componentName = componentNameFor(storyId);
  return `// ${PRODUCTION_PROJECT_SCAFFOLD_MARKER}
import type {FC} from "react";
import {staticFile} from "remotion";

import {
  parseNarrativeProjectSource,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  StoryCompositionPropsSchema,
  validateM1ArtifactBundle,
  type StoryCompositionProps,
} from "../../contracts";
import {CompositionAssembly} from "../../remotion/runtime/composition-assembly";
import {
  NarrativeCore,
  type NarrativeCoreProps,
} from "../../remotion/runtime/narrative-core";
import briefJson from "./brief.json";
import sealedNarrationJson from "./generated/sealed-narration.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import narrationJson from "./narration.json";
import renderJson from "./render.json";
import storyJson from "./story.json";

const projectSource = parseNarrativeProjectSource({
  brief: briefJson,
  story: storyJson,
  narration: narrationJson,
  render: renderJson,
});
const sealedNarration =
  SealedNarrationManifestSchema.parse(sealedNarrationJson);
const semanticTiming = SemanticTimingSchema.parse(semanticTimingJson);
const artifactBundle = validateM1ArtifactBundle({
  projectSource,
  sealedNarration,
  semanticTiming,
});

const expectedStoryId = ${JSON.stringify(storyId)};
const storyId = artifactBundle.projectSource.story.storyId;
const render = artifactBundle.projectSource.render;
const timing = artifactBundle.semanticTiming;
if (storyId !== expectedStoryId) {
  throw new Error("Production Composition Story ID is stale.");
}
if (render.fps !== timing.fps) {
  throw new Error("Production Composition render and timing fps differ.");
}

const completeAudioLocalPath =
  artifactBundle.sealedNarration.completeAudio.localPath;
const expectedAudioPrefix = \`public/projects/\${storyId}/narration/\`;
if (!completeAudioLocalPath.startsWith(expectedAudioPrefix)) {
  throw new Error("Complete narration must stay under the Story narration path.");
}
const completeNarrationSrc = staticFile(
  completeAudioLocalPath.slice("public/".length),
);

export const productionNarrativeCompositionMetadata = {
  id: render.compositionId,
  fps: render.fps,
  width: render.width,
  height: render.height,
  durationInFrames: timing.durationInFrames,
  defaultProps: {projectId: storyId},
} as const;

export const createProductionNarrativeCoreProps = (
  input: unknown,
): NarrativeCoreProps => {
  const props = StoryCompositionPropsSchema.parse(input);
  if (props.projectId !== storyId) {
    throw new Error("Production Composition only accepts its own projectId.");
  }
  return {
    src: completeNarrationSrc,
    leadInFrames: render.leadInFrames,
    captionCues: timing.captionCues,
    safeAreaPx: render.captionSafeAreaPx,
  };
};

const ${componentName}: FC<StoryCompositionProps> = (props) => (
  <CompositionAssembly
    narrativeCore={
      <NarrativeCore {...createProductionNarrativeCoreProps(props)} />
    }
  />
);

export default ${componentName};
`;
};

export const ensureProductionProjectScaffold = async ({
  rootDir,
  storyId: rawStoryId,
  mode,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly mode: "write" | "check";
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const destination = join(rootDir, "src/projects", storyId, "Composition.tsx");
  const expected = renderProductionProjectScaffold(storyId);
  let actual: string | null = null;
  try {
    const entry = await lstat(destination);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error("Production Composition must be a regular file.");
    }
    actual = await readFile(destination, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (actual === expected) {
    return { destination, written: false } as const;
  }
  if (actual !== null) {
    if (actual.includes(PRODUCTION_PROJECT_SCAFFOLD_MARKER)) {
      throw new Error(
        "Generated production Composition scaffold has byte drift.",
      );
    }
    throw new Error(
      "Refusing to overwrite a non-template hand-written Composition.",
    );
  }
  if (mode === "check") {
    throw new Error("Production Composition scaffold is missing.");
  }
  const result = await writeProductionFileAtomic({
    destination,
    bytes: expected,
    mode: "create",
  });
  return { destination, written: result.written } as const;
};

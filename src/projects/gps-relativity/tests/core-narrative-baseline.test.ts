import assert from "node:assert/strict";
import test from "node:test";

import briefJson from "../brief.json";
import narrationJson from "../narration.json";
import renderJson from "../render.json";
import sealedNarrationJson from "../generated/sealed-narration.generated.json";
import semanticTimingJson from "../generated/semantic-timing.generated.json";
import storyJson from "../story.json";
import {
  computeGeneratedRegistryEntryChecksum,
  computeM3EvidenceFingerprint,
  computeNarrativeBaselineFingerprint,
  computeProjectRegistryEntryFingerprint,
  createProjectRegistrationDescriptor,
  generateSemanticTiming,
  M3NarrativeBaselineEvidenceReceiptSchema,
  M3NarrativeBaselineEvidenceReceiptInputSchema,
  NARRATIVE_CORE_VERSION,
  parseNarrativeProjectSource,
  PROJECT_REGISTRY_GENERATOR_ID,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  Sha256DigestSchema,
  validateM1ArtifactBundle,
  type M3NarrativeBaselineEvidenceReceiptInput,
  type ProjectRegistrationDescriptor,
} from "../../../contracts";

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
const descriptor = createProjectRegistrationDescriptor({
  projectSource,
  semanticTiming,
  compositionModulePath: "./gps-relativity/Composition",
});
const digest = (character: string) =>
  Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);

const getEntryIdentity = (
  currentDescriptor: ProjectRegistrationDescriptor = descriptor,
) => {
  const generatedEntryChecksum =
    computeGeneratedRegistryEntryChecksum(currentDescriptor);
  const projectRegistryEntryFingerprint =
    computeProjectRegistryEntryFingerprint({
      descriptor: currentDescriptor,
      semanticTimingFingerprint: semanticTiming.fingerprint,
      generatedEntryChecksum,
      generatorId: PROJECT_REGISTRY_GENERATOR_ID,
    });
  return { generatedEntryChecksum, projectRegistryEntryFingerprint };
};

const makeEvidenceInput = (): M3NarrativeBaselineEvidenceReceiptInput => {
  const { projectRegistryEntryFingerprint } = getEntryIdentity();
  const narrativeBaselineFingerprint = computeNarrativeBaselineFingerprint({
    artifactBundle,
    projectRegistryEntryFingerprint,
    narrativeCoreVersion: NARRATIVE_CORE_VERSION,
  });
  return {
    schemaVersion: 1,
    storyId: descriptor.storyId,
    compositionId: descriptor.id,
    sealedNarrationFingerprint:
      artifactBundle.sealedNarration.sealedNarrationFingerprint,
    semanticTimingFingerprint: artifactBundle.semanticTiming.fingerprint,
    generatedRegistryChecksum: digest("a"),
    projectRegistryEntryFingerprint,
    narrativeBaselineFingerprint,
    artifacts: {
      transparentStill: {
        localPath: "out/gps-relativity/m3-transparent-frame-0.png",
        checksum: digest("b"),
        frame: 0,
        alphaMin: 0,
        alphaMax: 0,
      },
      captionStill: {
        localPath: "out/gps-relativity/m3-caption-frame-15.png",
        checksum: digest("c"),
        frame: 15,
        alphaMin: 0,
        alphaMax: 255,
        topLeftAlphaMax: 0,
      },
      render: {
        localPath: "out/gps-relativity/m3-narrative-baseline.mp4",
        checksum: digest("d"),
        fps: 30,
        durationInFrames: 1731,
        videoStreamCount: 1,
        audioStreamCount: 1,
      },
    },
  };
};

test("the real M2 bundle produces stable downstream M3 fingerprints", () => {
  const first = getEntryIdentity();
  const second = getEntryIdentity();
  assert.deepEqual(first, second);
  assert.equal(
    computeNarrativeBaselineFingerprint({
      artifactBundle,
      projectRegistryEntryFingerprint: first.projectRegistryEntryFingerprint,
      narrativeCoreVersion: NARRATIVE_CORE_VERSION,
    }),
    computeNarrativeBaselineFingerprint({
      artifactBundle,
      projectRegistryEntryFingerprint: second.projectRegistryEntryFingerprint,
      narrativeCoreVersion: NARRATIVE_CORE_VERSION,
    }),
  );
  assert.equal(
    artifactBundle.sealedNarration.sealedNarrationFingerprint,
    "sha256:0c0efcdc347a07e9af7e05c3f3ef660a10d976b8b055fc3bc9e22eb389b28ba5",
  );
  assert.equal(
    artifactBundle.semanticTiming.fingerprint,
    "sha256:891dcd97796eaa8143cb7f65663906c1e893f125ffd921472122ce4dca7c2a7c",
  );
});

test("registry identity changes do not rewrite M2 authority", () => {
  const renamedEntry = {
    ...descriptor,
    id: "GpsRelativityRenamed" as ProjectRegistrationDescriptor["id"],
  };
  assert.notEqual(
    getEntryIdentity().projectRegistryEntryFingerprint,
    getEntryIdentity(renamedEntry).projectRegistryEntryFingerprint,
  );
  assert.equal(
    artifactBundle.sealedNarration.sealedNarrationFingerprint,
    sealedNarration.sealedNarrationFingerprint,
  );
  assert.equal(
    artifactBundle.semanticTiming.fingerprint,
    semanticTiming.fingerprint,
  );
});

test("NarrativeCore version and each documented upstream layer invalidate downstream", () => {
  const { projectRegistryEntryFingerprint } = getEntryIdentity();
  const fingerprint = (
    bundle = artifactBundle,
    entry = projectRegistryEntryFingerprint,
    version = NARRATIVE_CORE_VERSION,
  ) =>
    computeNarrativeBaselineFingerprint({
      artifactBundle: bundle,
      projectRegistryEntryFingerprint: entry,
      narrativeCoreVersion: version,
    });
  const changedRender = {
    ...projectSource.render,
    captionSafeAreaPx: {
      ...projectSource.render.captionSafeAreaPx,
      bottom: 121,
    },
  };
  const renderBundle = validateM1ArtifactBundle({
    ...artifactBundle,
    projectSource: { ...projectSource, render: changedRender },
  });
  const timingRender = { ...projectSource.render, leadInFrames: 16 };
  const changedTiming = generateSemanticTiming({
    story: projectSource.story,
    narration: projectSource.narration,
    render: timingRender,
    sealedNarration,
  });
  const timingBundle = validateM1ArtifactBundle({
    projectSource: { ...projectSource, render: timingRender },
    sealedNarration,
    semanticTiming: changedTiming,
  });

  assert.notEqual(
    fingerprint(),
    fingerprint(
      artifactBundle,
      projectRegistryEntryFingerprint,
      "narrative-core-v3" as typeof NARRATIVE_CORE_VERSION,
    ),
  );
  assert.notEqual(fingerprint(), fingerprint(renderBundle));
  assert.notEqual(fingerprint(), fingerprint(timingBundle));
  assert.notEqual(fingerprint(), fingerprint(artifactBundle, digest("e")));
});

test("evidence receipt fingerprint excludes only itself and rejects edits", () => {
  const input = makeEvidenceInput();
  const receipt = {
    ...input,
    evidenceFingerprint: computeM3EvidenceFingerprint(input),
  };
  assert.doesNotThrow(() =>
    M3NarrativeBaselineEvidenceReceiptSchema.parse(receipt),
  );
  assert.throws(() =>
    M3NarrativeBaselineEvidenceReceiptSchema.parse({
      ...receipt,
      artifacts: {
        ...receipt.artifacts,
        render: {
          ...receipt.artifacts.render,
          checksum: digest("f"),
        },
      },
    }),
  );
});

test("M3 evidence contract accepts a dynamic vertical duration and caption frame", () => {
  const input = makeEvidenceInput();
  const vertical = M3NarrativeBaselineEvidenceReceiptInputSchema.parse({
    ...input,
    storyId: "product-comic-vertical",
    compositionId: "ProductComicVertical",
    artifacts: {
      transparentStill: {
        ...input.artifacts.transparentStill,
        localPath: "out/product-comic-vertical/m3-transparent-frame-0.png",
      },
      captionStill: {
        ...input.artifacts.captionStill,
        localPath: "out/product-comic-vertical/m3-caption-frame-27.png",
        frame: 27,
      },
      render: {
        ...input.artifacts.render,
        localPath: "out/product-comic-vertical/m3-narrative-baseline.mp4",
        durationInFrames: 4500,
      },
    },
  });
  const receipt = {
    ...vertical,
    evidenceFingerprint: computeM3EvidenceFingerprint(vertical),
  };
  assert.doesNotThrow(() =>
    M3NarrativeBaselineEvidenceReceiptSchema.parse(receipt),
  );
  assert.throws(() =>
    M3NarrativeBaselineEvidenceReceiptSchema.parse({
      ...receipt,
      artifacts: {
        ...receipt.artifacts,
        captionStill: { ...receipt.artifacts.captionStill, frame: 4500 },
      },
    }),
  );
});

test("registration and evidence contracts fail closed", () => {
  assert.throws(() =>
    createProjectRegistrationDescriptor({
      projectSource,
      semanticTiming: { ...semanticTiming, durationInFrames: 1732 },
      compositionModulePath: "./gps-relativity/Composition",
    }),
  );
  assert.throws(() =>
    computeGeneratedRegistryEntryChecksum({
      ...descriptor,
      compositionModulePath: "./gps-relativity/${entry}",
    } as unknown as ProjectRegistrationDescriptor),
  );
  assert.throws(() =>
    computeGeneratedRegistryEntryChecksum({
      ...descriptor,
      defaultProps: { projectId: "other-story" },
    } as ProjectRegistrationDescriptor),
  );

  const input = makeEvidenceInput();
  const invalidInputs = [
    { ...input, unknown: true },
    {
      ...input,
      artifacts: {
        ...input.artifacts,
        transparentStill: {
          ...input.artifacts.transparentStill,
          frame: -1,
        },
      },
    },
    {
      ...input,
      artifacts: {
        ...input.artifacts,
        captionStill: {
          ...input.artifacts.captionStill,
          localPath: "../private/caption.png",
        },
      },
    },
    {
      ...input,
      artifacts: {
        ...input.artifacts,
        captionStill: {
          ...input.artifacts.captionStill,
          alphaMax: 0,
        },
      },
    },
    {
      ...input,
      artifacts: {
        ...input.artifacts,
        captionStill: {
          ...input.artifacts.captionStill,
          topLeftAlphaMax: 1,
        },
      },
    },
  ];
  for (const invalid of invalidInputs) {
    assert.throws(() =>
      M3NarrativeBaselineEvidenceReceiptSchema.parse({
        ...invalid,
        evidenceFingerprint: computeM3EvidenceFingerprint(
          invalid as M3NarrativeBaselineEvidenceReceiptInput,
        ),
      }),
    );
  }

  assert.throws(() =>
    computeNarrativeBaselineFingerprint({
      artifactBundle: {
        ...artifactBundle,
        semanticTiming: { ...semanticTiming, durationInFrames: 1732 },
      },
      projectRegistryEntryFingerprint:
        getEntryIdentity().projectRegistryEntryFingerprint,
      narrativeCoreVersion: NARRATIVE_CORE_VERSION,
    }),
  );
});

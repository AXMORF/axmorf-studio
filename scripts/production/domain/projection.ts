import {
  createProductionRunState,
  ProductionFingerprintRefSchema,
  ProductionRunManifestSchema,
  ProductionStageEventSchema,
  type ProductionFingerprintRef,
  type ProductionOutputArtifact,
  type ProductionRunManifest,
  type ProductionRunState,
  type ProductionStageEvent,
} from "../../../src/contracts";
import { transitionProductionRunState } from "./transitions";

const sortedFingerprintRefs = (
  values: Iterable<ProductionFingerprintRef>,
): readonly ProductionFingerprintRef[] =>
  [...values].sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId),
  );

const sortedOutputArtifacts = (
  values: Iterable<ProductionOutputArtifact>,
): readonly ProductionOutputArtifact[] =>
  [...values].sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId),
  );

export const createInitialProductionRunState = (
  rawRun: ProductionRunManifest,
): ProductionRunState => {
  const run = ProductionRunManifestSchema.parse(rawRun);
  return createProductionRunState({
    schemaVersion: run.schemaVersion,
    runId: run.runId,
    storyId: run.storyId,
    runFingerprint: run.runFingerprint,
    state: "initialized",
    lastSequence: 0,
    lastEventFingerprint: null,
    inputFingerprints: [
      {
        artifactId: "requirements",
        fingerprint: run.requirementsFingerprint,
      },
    ],
    outputArtifacts: [],
    acceptedSceneResults: [],
    acceptedGlobalVisualResult: null,
    failure: null,
  });
};

const addFingerprintRef = (
  references: Map<string, ProductionFingerprintRef>,
  reference: ProductionFingerprintRef,
) => {
  const existing = references.get(reference.artifactId);
  if (
    existing !== undefined &&
    existing.fingerprint !== reference.fingerprint
  ) {
    throw new Error(
      `Production input fingerprint conflicts for ${reference.artifactId}.`,
    );
  }
  references.set(reference.artifactId, reference);
};

const addOutputArtifact = (
  artifacts: Map<string, ProductionOutputArtifact>,
  artifact: ProductionOutputArtifact,
) => {
  const existing = artifacts.get(artifact.artifactId);
  if (
    existing !== undefined &&
    (existing.fingerprint !== artifact.fingerprint ||
      existing.repositoryPath !== artifact.repositoryPath)
  ) {
    throw new Error(
      `Production output artifact conflicts for ${artifact.artifactId}.`,
    );
  }
  artifacts.set(artifact.artifactId, artifact);
};

const parseCurrentInputFingerprints = (rawCurrent: unknown) => {
  if (rawCurrent === undefined) return null;
  const parsed = ProductionFingerprintRefSchema.array().parse(rawCurrent);
  const current = new Map<string, ProductionFingerprintRef>();
  for (const reference of parsed) {
    if (current.has(reference.artifactId)) {
      throw new Error(
        "Current production input fingerprints contain duplicates.",
      );
    }
    current.set(reference.artifactId, reference);
  }
  return current;
};

const assertCurrentInput = (
  current: ReadonlyMap<string, ProductionFingerprintRef> | null,
  reference: ProductionFingerprintRef,
) => {
  if (current === null) return;
  if (
    current.get(reference.artifactId)?.fingerprint !== reference.fingerprint
  ) {
    throw new Error(
      `Current input fingerprint is stale for ${reference.artifactId}.`,
    );
  }
};

export const projectProductionRunState = ({
  run: rawRun,
  events: rawEvents,
  currentInputFingerprints,
}: {
  readonly run: ProductionRunManifest;
  readonly events: readonly ProductionStageEvent[];
  readonly currentInputFingerprints?: unknown;
}): ProductionRunState => {
  const run = ProductionRunManifestSchema.parse(rawRun);
  const events = rawEvents.map((event) =>
    ProductionStageEventSchema.parse(event),
  );
  const current = parseCurrentInputFingerprints(currentInputFingerprints);
  let state = createInitialProductionRunState(run);
  const inputs = new Map(
    state.inputFingerprints.map((reference) => [
      reference.artifactId,
      reference,
    ]),
  );
  const outputs = new Map<string, ProductionOutputArtifact>();
  const accepted = new Map<
    string,
    {
      readonly meaningId: ProductionStageEvent extends never ? never : string;
      readonly resultFingerprint: string;
    }
  >();
  let acceptedGlobalVisualResult: null | Readonly<{
    resultFingerprint: string;
  }> = null;
  assertCurrentInput(current, state.inputFingerprints[0]);

  for (const event of events) {
    if (event.schemaVersion !== run.schemaVersion) {
      throw new Error("Production event version does not match its run.");
    }
    if (event.runId !== run.runId || event.storyId !== run.storyId) {
      throw new Error("Production event does not belong to this run.");
    }
    if (event.sequence !== state.lastSequence + 1) {
      throw new Error("Production event sequence must be strictly contiguous.");
    }
    if (event.previousStateFingerprint !== state.stateFingerprint) {
      throw new Error("Production event previous state fingerprint is stale.");
    }
    for (const reference of event.inputFingerprints) {
      assertCurrentInput(current, reference);
      addFingerprintRef(inputs, reference);
    }
    if ("outputArtifacts" in event) {
      for (const artifact of event.outputArtifacts) {
        addOutputArtifact(outputs, artifact);
      }
    }
    if (event.type === "scene-result-accepted") {
      if (accepted.has(event.meaningId)) {
        throw new Error(
          `Scene result ${event.meaningId} was accepted more than once.`,
        );
      }
      accepted.set(event.meaningId, {
        meaningId: event.meaningId,
        resultFingerprint: event.sceneResultFingerprint,
      });
    }
    if (event.type === "global-visual-result-accepted") {
      if (acceptedGlobalVisualResult !== null) {
        throw new Error("GlobalVisual result was accepted more than once.");
      }
      acceptedGlobalVisualResult = {
        resultFingerprint: event.globalVisualResultFingerprint,
      };
    }
    if (
      event.type === "stage-succeeded" &&
      event.stageId === "scenes" &&
      (accepted.size === 0 || acceptedGlobalVisualResult === null)
    ) {
      throw new Error(
        "The scenes stage requires accepted Scene and GlobalVisual results.",
      );
    }
    const nextState = transitionProductionRunState({
      state: state.state,
      event,
    });
    state = createProductionRunState({
      schemaVersion: run.schemaVersion,
      runId: run.runId,
      storyId: run.storyId,
      runFingerprint: run.runFingerprint,
      state: nextState,
      lastSequence: event.sequence,
      lastEventFingerprint: event.eventFingerprint,
      inputFingerprints: sortedFingerprintRefs(inputs.values()),
      outputArtifacts: sortedOutputArtifacts(outputs.values()),
      acceptedSceneResults: [...accepted.values()],
      acceptedGlobalVisualResult,
      failure: event.type === "stage-failed" ? event.error : null,
    });
  }
  return state;
};

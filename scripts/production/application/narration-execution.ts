import {
  NarrationExecutionSnapshotSchema,
  serializeCanonicalJson,
  type NarrationExecutionSnapshot,
} from "../../../src/contracts";

export const assertNarrationExecutionCurrent = ({
  frozen: rawFrozen,
  current: rawCurrent,
}: {
  readonly frozen: unknown;
  readonly current: unknown;
}): NarrationExecutionSnapshot => {
  const frozen = NarrationExecutionSnapshotSchema.parse(rawFrozen);
  const current = NarrationExecutionSnapshotSchema.parse(rawCurrent);
  if (serializeCanonicalJson(frozen) !== serializeCanonicalJson(current)) {
    throw new Error(
      "Narration execution configuration drifted after preflight; create a fresh Run.",
    );
  }
  return frozen;
};

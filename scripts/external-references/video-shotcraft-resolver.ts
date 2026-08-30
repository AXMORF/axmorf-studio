import {
  ExternalReferenceSnapshotSchema,
  type ExternalReferenceCard,
  type ExternalReferenceSnapshot,
} from "@axmorf/studio/contracts";

export type ResolvedVideoShotcraftReference = ExternalReferenceCard & {
  readonly sourceId: ExternalReferenceSnapshot["sourceId"];
  readonly repository: ExternalReferenceSnapshot["repository"];
  readonly revision: ExternalReferenceSnapshot["revision"];
  readonly snapshotFingerprint: ExternalReferenceSnapshot["snapshotFingerprint"];
};

export const resolveVideoShotcraftReference = (
  rawSnapshot: unknown,
  selection: { readonly cardId: string; readonly styleKey: string },
): ResolvedVideoShotcraftReference => {
  const snapshot = ExternalReferenceSnapshotSchema.parse(rawSnapshot);
  if (
    snapshot.sourceLicense.verificationStatus !== "verified" ||
    snapshot.previewMediaLicense.verificationStatus !== "verified"
  ) {
    throw new Error(
      "Exact reference source and preview licenses must be verified.",
    );
  }
  const matches = snapshot.index.cards.filter(
    (card) =>
      card.cardId === selection.cardId && card.styleKey === selection.styleKey,
  );
  if (matches.length !== 1 || !matches[0].exactDemoDeclared) {
    throw new Error(
      "Exact Shotcraft card/style/demo identity is missing or ambiguous.",
    );
  }
  return {
    ...matches[0],
    sourceId: snapshot.sourceId,
    repository: snapshot.repository,
    revision: snapshot.revision,
    snapshotFingerprint: snapshot.snapshotFingerprint,
  };
};

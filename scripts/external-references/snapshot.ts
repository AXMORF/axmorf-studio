import { readFile } from "node:fs/promises";

import {
  ExternalReferenceSnapshotSchema,
  serializeCanonicalJson,
  type ExternalReferenceSnapshot,
} from "@axmorf/studio/contracts";
import {
  appendBytesAtomically,
  checksumExternalBytes,
  readExternalRegularFile,
} from "./project-files";

export const loadExternalReferenceSnapshot = async (
  fixtureRoot: string,
): Promise<ExternalReferenceSnapshot> => {
  const raw = JSON.parse(
    await readFile(`${fixtureRoot}/fixture-manifest.json`, "utf8"),
  );
  const snapshot = ExternalReferenceSnapshotSchema.parse(raw);
  for (const file of snapshot.files) {
    const bytes = await readExternalRegularFile(fixtureRoot, file.fixturePath);
    if (checksumExternalBytes(bytes) !== file.checksum) {
      throw new Error(
        `External reference file checksum is stale: ${file.fixturePath}.`,
      );
    }
  }
  const byPath = new Map(
    snapshot.files.map((file) => [file.fixturePath, file.checksum]),
  );
  for (const card of snapshot.index.cards) {
    if (
      byPath.get(card.cardDocumentPath) !== card.cardDocumentChecksum ||
      byPath.get(card.demoSourcePath) !== card.demoSourceChecksum ||
      byPath.get(card.previewPath) !== card.previewChecksum
    ) {
      throw new Error(
        "External reference canonical card file identity is stale.",
      );
    }
  }
  return snapshot;
};

export const renderExternalReferenceSnapshot = (rawSnapshot: unknown): string =>
  `${serializeCanonicalJson(ExternalReferenceSnapshotSchema.parse(rawSnapshot))}\n`;

export const appendExternalReferenceSnapshot = async (
  recordsRoot: string,
  rawSnapshot: unknown,
): Promise<string> => {
  const snapshot = ExternalReferenceSnapshotSchema.parse(rawSnapshot);
  const relativePath = `${snapshot.sourceId}/${snapshot.revision}/snapshot.json`;
  return appendBytesAtomically(
    recordsRoot,
    relativePath,
    Buffer.from(renderExternalReferenceSnapshot(snapshot), "utf8"),
  );
};

import { createHash } from "node:crypto";

import {
  computeCoverSourceGraphFingerprint,
  Sha256DigestSchema,
} from "../../../src/contracts";
import type { ProductionLocations } from "../domain/production-locations";
import {
  validateDeliveryCoverSource,
  type CoverCompositionDeclaration,
  type DeliveryCoverSourceRole,
} from "../domain/cover-source";
import { readCoverRegularFile } from "./cover-files";

const checksum = (bytes: Uint8Array) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  );

const FIXED_FILES = [
  { fileName: "Cover4x3.tsx", role: "cover-4x3" },
  { fileName: "Cover3x4.tsx", role: "cover-3x4" },
  { fileName: "Root.tsx", role: "root" },
  { fileName: "index.ts", role: "index" },
] as const satisfies readonly Readonly<{
  fileName: string;
  role: DeliveryCoverSourceRole;
}>[];

export const collectDeliveryCoverSourceGraph = async ({
  locations,
  storyId,
  compositionId,
}: {
  readonly locations: Pick<ProductionLocations, "projectSourceRoot">;
  readonly storyId: string;
  readonly compositionId: string;
}) => {
  const sourceRoot = `src/projects/${storyId}/delivery/cover`;
  const physicalSourceRoot = `${storyId}/delivery/cover`;
  let compositions: readonly CoverCompositionDeclaration[] = [];
  const files: Array<{
    relativePath: string;
    checksum: ReturnType<typeof checksum>;
  }> = [];
  for (const { fileName, role } of FIXED_FILES) {
    const relativePath = `${sourceRoot}/${fileName}`;
    const { bytes } = await readCoverRegularFile({
      rootDir: locations.projectSourceRoot,
      relativePath: `${physicalSourceRoot}/${fileName}`,
    });
    const validated = validateDeliveryCoverSource({
      sourcePath: relativePath,
      source: new TextDecoder().decode(bytes),
      role,
      compositionId,
    });
    if (role === "root") compositions = validated.compositions;
    files.push({ relativePath, checksum: checksum(bytes) });
  }
  const sourceFiles = files;
  return {
    files: sourceFiles,
    compositions,
    sourceGraphFingerprint: computeCoverSourceGraphFingerprint({
      storyId,
      sourceFiles,
    }),
  } as const;
};

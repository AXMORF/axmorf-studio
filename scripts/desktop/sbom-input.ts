import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { RuntimePackManifestSchema } from "../../desktop/contracts/runtime-pack";

export const createDesktopSbomInput = async (runtimePackRoot: string) => {
  const manifest = RuntimePackManifestSchema.parse(
    JSON.parse(await readFile(join(resolve(runtimePackRoot), "runtime-pack.json"), "utf8")),
  );
  return {
    schemaVersion: 1,
    product: "AXMORF Studio",
    runtimePackId: manifest.runtimePackId,
    platform: manifest.platform,
    architecture: manifest.architecture,
    packages: manifest.remotionPackages,
    files: manifest.files.map(({ path, sizeBytes, sha256, executable }) => ({ path, sizeBytes, sha256, executable })),
  } as const;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2];
  if (root === undefined) throw new Error("Runtime Pack root is required.");
  createDesktopSbomInput(root).then((value) => process.stdout.write(`${JSON.stringify(value)}\n`));
}

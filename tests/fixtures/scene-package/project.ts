import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildSceneCoverageMap,
  buildSceneFallbackDeclaration,
} from "../../../src/contracts";
import {
  generateSceneCoverage,
  generateScenePackage,
} from "../../../scripts/scene-package/generate";
import { checksumExternalBytes } from "../../../scripts/external-references/project-files";
import { createScenePackageInput } from "../scene/package-input";

export const createIsolatedScenePackageProject = async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-package-project-"));
  const packagePath = join(rootDir, "scene-package.generated.json");
  const coveragePath = join(rootDir, "scene-coverage.generated.json");
  const narrativePath = join(rootDir, "narrative-auto-check.generated.json");
  const sealedWavPath = join(rootDir, "sealed-complete.wav");
  const timingPath = join(rootDir, "semantic-timing.generated.json");
  const registryPath = join(rootDir, "renderer-registry.generated.ts");
  const input = createScenePackageInput();
  const scenePackage = await generateScenePackage({
    mode: "write",
    destination: packagePath,
    input,
  });
  const fallback = buildSceneFallbackDeclaration({
    taskInputFingerprint: `sha256:${"b".repeat(64)}`,
    meaningId: "meaning-two",
    reason: "Explicit fallback for the second synthetic Beat.",
  });
  const coverageInput = {
    storyId: "synthetic-proof",
    storyBeatOrder: ["meaning-one", "meaning-two"],
    packages: [scenePackage],
    fallbacks: [fallback],
    stalePackages: [],
  } as const;
  const coverage = buildSceneCoverageMap(coverageInput);
  await generateSceneCoverage({
    mode: "write",
    destination: coveragePath,
    input: coverageInput,
  });
  await Promise.all([
    writeFile(narrativePath, "narrative-pass\n", "utf8"),
    writeFile(sealedWavPath, Uint8Array.from([82, 73, 70, 70, 0, 1, 2, 3])),
    writeFile(timingPath, "semantic-timing-current\n", "utf8"),
    writeFile(registryPath, "export const registry = 'current';\n", "utf8"),
  ]);
  const protectedPaths = [
    packagePath,
    narrativePath,
    sealedWavPath,
    timingPath,
  ];
  const protectedState = new Map<
    string,
    { readonly checksum: string; readonly mtimeMs: number }
  >();
  for (const path of protectedPaths) {
    protectedState.set(path, {
      checksum: checksumExternalBytes(await readFile(path)),
      mtimeMs: (await stat(path)).mtimeMs,
    });
  }
  return {
    rootDir,
    input,
    scenePackage,
    coverage,
    coverageInput,
    packagePath,
    coveragePath,
    narrativePath,
    sealedWavPath,
    timingPath,
    registryPath,
    protectedState,
  };
};

export const assertScenePackageProtectedStateUnchanged = async (
  fixture: Awaited<ReturnType<typeof createIsolatedScenePackageProject>>,
) => {
  for (const [path, before] of fixture.protectedState) {
    const bytes = await readFile(path);
    if (
      checksumExternalBytes(bytes) !== before.checksum ||
      (await stat(path)).mtimeMs !== before.mtimeMs
    ) {
      throw new Error(`Protected synthetic evidence changed: ${path}.`);
    }
  }
};

export const disposeIsolatedScenePackageProject = async (
  fixture: Awaited<ReturnType<typeof createIsolatedScenePackageProject>>,
) => rm(fixture.rootDir, { recursive: true, force: true });

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import {
  Sha256DigestSchema,
  createFingerprint,
} from "@axmorf/studio/contracts";
import {
  parseRuntimePolicyManifest,
  selectRuntimePolicyFiles,
  type RuntimePolicyManifest,
  type RuntimePolicyScope,
} from "../../../packages/studio/src/runtime/policy-manifest";

export const checksumBytes = (bytes: Uint8Array) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  );

export const readRegularBytes = async (path: string, label: string) => {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error(`${label} must be a regular file.`);
  return Uint8Array.from(await readFile(path));
};

export const readRegularJson = async (path: string, label: string) => {
  const bytes = await readRegularBytes(path, label);
  try {
    return {
      raw: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      bytes,
      checksum: checksumBytes(bytes),
    };
  } catch (error) {
    throw new Error(`${label} contains malformed JSON.`, { cause: error });
  }
};

const collectTree = async (
  rootDir: string,
  directory: string,
): Promise<
  readonly { path: string; checksum: string; sizeBytes: number }[]
> => {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const files: Array<{ path: string; checksum: string; sizeBytes: number }> =
    [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory()))
      throw new Error("Runtime policy source contains an unsafe entry.");
    if (entry.isDirectory()) files.push(...(await collectTree(rootDir, path)));
    else {
      const bytes = await readRegularBytes(path, "Runtime policy source");
      files.push({
        path: relative(rootDir, path).split(sep).join("/"),
        checksum: checksumBytes(bytes),
        sizeBytes: bytes.byteLength,
      });
    }
  }
  return files;
};

export const snapshotPolicyRoots = async ({
  rootDir,
  runtimePolicyManifest,
}: {
  readonly rootDir: string;
  readonly runtimePolicyManifest?: RuntimePolicyManifest;
}) => {
  if (runtimePolicyManifest !== undefined) {
    const manifest = parseRuntimePolicyManifest(runtimePolicyManifest);
    return createFingerprint({
      namespace: "project-production-runtime-policy",
      version: 2,
      value: manifest,
    });
  }
  const files = (
    await Promise.all(
      ["src/contracts", "src/remotion"].map((path) =>
        collectTree(rootDir, join(rootDir, path)),
      ),
    )
  )
    .flat()
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const path of [
    "package.json",
    "package-lock.json",
    "remotion.config.ts",
  ]) {
    const bytes = await readRegularBytes(join(rootDir, path), path);
    files.push({
      path,
      checksum: checksumBytes(bytes),
      sizeBytes: bytes.byteLength,
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return createFingerprint({
    namespace: "project-production-runtime-policy",
    version: 1,
    value: files,
  });
};

const resolveWorkspaceConfigurationPaths = async (rootDir: string) => {
  const remotionConfigCandidates = [
    "remotion.config.mjs",
    "remotion.config.ts",
  ] as const;
  const existingRemotionConfigs: string[] = [];
  for (const path of remotionConfigCandidates) {
    try {
      await lstat(join(rootDir, path));
      existingRemotionConfigs.push(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (existingRemotionConfigs.length !== 1) {
    throw new Error(
      "Workspace must contain exactly one supported Remotion config file.",
    );
  }
  return [
    "package.json",
    "package-lock.json",
    existingRemotionConfigs[0]!,
  ];
};

export const snapshotWorkspaceConfiguration = async ({
  rootDir,
  paths,
}: {
  readonly rootDir: string;
  readonly paths?: readonly string[];
}) =>
  snapshotExplicitPolicyPaths({
    rootDir,
    paths: paths ?? (await resolveWorkspaceConfigurationPaths(rootDir)),
    namespace: "project-production-workspace-configuration",
  });

export const snapshotExplicitPolicyPaths = async ({
  rootDir,
  paths,
  namespace,
}: {
  readonly rootDir: string;
  readonly paths: readonly string[];
  readonly namespace: string;
}) => {
  const normalized = [...paths].sort();
  if (
    normalized.length === 0 ||
    new Set(normalized).size !== normalized.length ||
    normalized.some(
      (path) =>
        isAbsolute(path) ||
        path.includes("\\") ||
        path
          .split("/")
          .some((part) => part === "" || part === "." || part === ".."),
    )
  ) {
    throw new Error(
      "Task policy paths must be sorted, unique, and repository-relative.",
    );
  }
  const files: Array<{ path: string; checksum: string; sizeBytes: number }> =
    [];
  for (const path of normalized) {
    const absolute = join(rootDir, path);
    const metadata = await lstat(absolute);
    if (
      metadata.isSymbolicLink() ||
      (!metadata.isFile() && !metadata.isDirectory())
    ) {
      throw new Error("Task policy source contains an unsafe entry.");
    }
    if (metadata.isDirectory())
      files.push(...(await collectTree(rootDir, absolute)));
    else {
      const bytes = await readRegularBytes(absolute, "Task policy source");
      files.push({
        path,
        checksum: checksumBytes(bytes),
        sizeBytes: bytes.byteLength,
      });
    }
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return createFingerprint({ namespace, version: 1, value: files });
};

const TASK_POLICY_PATHS = {
  scene: [
    "scripts/project-production/application/readability-source-validator.ts",
    "scripts/project-production/application/scene-task-check.ts",
    "scripts/project-production/application/task-check.ts",
    "scripts/project-production/application/typescript-compile.ts",
    "scripts/scene-package/domain.ts",
    "scripts/scene-package/generate.ts",
    "src/contracts/authoring-requirements.ts",
    "src/contracts/reference-fidelity.ts",
    "src/contracts/scene-package.ts",
    "src/contracts/scene-plan.ts",
    "src/contracts/scene-readability.ts",
    "src/contracts/scene-task.ts",
    "src/contracts/shot-recipe.ts",
    "src/remotion/capabilities",
    "src/remotion/runtime/readability",
  ],
  globalVisual: [
    "scripts/external-references/project-files.ts",
    "scripts/external-references/source-guard.ts",
    "scripts/project-production/application/global-visual-task-check.ts",
    "scripts/project-production/application/global-visual-validator.ts",
    "scripts/project-production/application/task-check.ts",
    "scripts/project-production/application/typescript-compile.ts",
    "src/contracts/global-visual.ts",
    "src/contracts/scene-task.ts",
    "src/remotion/capabilities",
    "src/remotion/runtime/global-visual",
  ],
  composition: [
    "scripts/narration/mastering.ts",
    "scripts/project-production/application/global-visual-validator.ts",
    "scripts/project-production/application/prepare-delivery.ts",
    "scripts/project-production/application/project-composition-compiler.ts",
    "scripts/project-production/application/project-scaffold.ts",
    "scripts/project-production/application/typescript-compile.ts",
    "scripts/registry/domain.ts",
    "scripts/registry/generate.ts",
    "scripts/registry/project-files.ts",
    "scripts/renderer-registry/domain.ts",
    "scripts/renderer-registry/generate.ts",
    "scripts/renderer-registry/project-files.ts",
    "scripts/scene-package/domain.ts",
    "scripts/scene-package/generate.ts",
    "scripts/scene-package/project-files.ts",
    "src/remotion/runtime/composition-assembly",
    "src/remotion/runtime/global-visual",
    "src/remotion/runtime/narrative-core",
    "src/remotion/runtime/scene-sound",
    "src/remotion/runtime/sound-design",
    "src/remotion/runtime/story-visual",
  ],
  delivery: [
    "remotion.config.ts",
    "scripts/project-production/adapters/delivery-filesystem.ts",
    "scripts/project-production/adapters/media.ts",
    "scripts/project-production/adapters/remotion-preflight.ts",
    "scripts/project-production/application/build-delivery.ts",
    "scripts/shared/media-process.ts",
    "scripts/shared/process.ts",
    "scripts/shared/remotion-command.ts",
    "src/contracts/delivery-build.ts",
    "src/contracts/delivery-publishing.ts",
  ],
} as const satisfies Readonly<Record<string, readonly string[]>>;

export const snapshotTaskPolicyFingerprints = async ({
  rootDir,
  runtimePolicyManifest,
}: {
  readonly rootDir: string;
  readonly runtimePolicyManifest?: RuntimePolicyManifest;
}) => {
  if (runtimePolicyManifest !== undefined) {
    const manifest = parseRuntimePolicyManifest(runtimePolicyManifest);
    const fingerprintFor = (scope: RuntimePolicyScope, namespace: string) =>
      createFingerprint({
        namespace,
        version: 2,
        value: {
          policyVersion: manifest.policyVersion,
          packageName: manifest.packageName,
          packageVersion: manifest.packageVersion,
          publicExports: manifest.publicExports,
          files: selectRuntimePolicyFiles(manifest, scope),
        },
      });
    return {
      scene: fingerprintFor("scene", "project-production-scene-policy"),
      globalVisual: fingerprintFor(
        "global-visual",
        "project-production-global-visual-policy",
      ),
      composition: fingerprintFor(
        "composition",
        "project-production-composition-policy",
      ),
      delivery: fingerprintFor(
        "delivery",
        "project-production-delivery-policy",
      ),
    } as const;
  }
  const [scene, globalVisual, composition, delivery] = await Promise.all([
    snapshotExplicitPolicyPaths({
      rootDir,
      paths: TASK_POLICY_PATHS.scene,
      namespace: "project-production-scene-policy",
    }),
    snapshotExplicitPolicyPaths({
      rootDir,
      paths: TASK_POLICY_PATHS.globalVisual,
      namespace: "project-production-global-visual-policy",
    }),
    snapshotExplicitPolicyPaths({
      rootDir,
      paths: TASK_POLICY_PATHS.composition,
      namespace: "project-production-composition-policy",
    }),
    snapshotExplicitPolicyPaths({
      rootDir,
      paths: TASK_POLICY_PATHS.delivery,
      namespace: "project-production-delivery-policy",
    }),
  ]);
  return { scene, globalVisual, composition, delivery } as const;
};

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { ProducerAssetManifestSchema } from "../dist/contracts.js";
import { buildDefaultSceneTemplateAudioProjection } from "./shared-workspace-resources.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distributionRoot = join(packageRoot, "dist");
const assetsRoot = join(distributionRoot, "assets");
const sceneTemplateSourceRoot = join(
  packageRoot,
  "src/remotion/capabilities/scene-templates",
);
const sceneTemplateTargetRoot = join(assetsRoot, "scene-templates");
const workspaceSeedSourceManifest = join(
  packageRoot,
  "src/remotion/catalog/assets.manifest.json",
);
const workspaceSeedStaticRoot = join(
  packageRoot,
  "src/runtime/workspace-seed/files",
);
const workspaceSeedTargetRoot = join(assetsRoot, "workspace-seed");

const checksum = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const toLogicalPath = (root, path) => relative(root, path).split(sep).join("/");

const readRegular = async (path, label) => {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symbolic file.`);
  }
  return readFile(path);
};

const copyTree = async (sourceRoot, source, target) => {
  const metadata = await lstat(source);
  if (metadata.isSymbolicLink()) {
    throw new Error("Runtime Scene template source cannot contain symlinks.");
  }
  if (metadata.isFile()) {
    const bytes = await readFile(source);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return [
      {
        logicalPath: `assets/scene-templates/${toLogicalPath(sourceRoot, source)}`,
        checksum: checksum(bytes),
        sizeBytes: bytes.byteLength,
        scopes: ["composition", "scene"],
      },
    ];
  }
  if (!metadata.isDirectory()) {
    throw new Error("Runtime Scene template source contains a special file.");
  }
  const files = [];
  const entries = (await readdir(source, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    files.push(
      ...(await copyTree(
        sourceRoot,
        join(source, entry.name),
        join(target, entry.name),
      )),
    );
  }
  return files;
};

const writeWorkspaceSeedFile = async ({ relativePath, bytes, scopes }) => {
  const target = join(workspaceSeedTargetRoot, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return {
    logicalPath: `assets/workspace-seed/${relativePath}`,
    checksum: checksum(bytes),
    sizeBytes: bytes.byteLength,
    scopes,
  };
};

const collectWorkspaceSeedFiles = async (source = workspaceSeedStaticRoot) => {
  const metadata = await lstat(source);
  if (metadata.isSymbolicLink()) {
    throw new Error("Static Workspace seed cannot contain symlinks.");
  }
  if (metadata.isFile()) {
    return [
      {
        relativePath: toLogicalPath(workspaceSeedStaticRoot, source),
        bytes: await readFile(source),
      },
    ];
  }
  if (!metadata.isDirectory()) {
    throw new Error("Static Workspace seed contains a special file.");
  }
  const entries = (await readdir(source, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  const files = [];
  for (const entry of entries) {
    files.push(...(await collectWorkspaceSeedFiles(join(source, entry.name))));
  }
  return files;
};

await rm(assetsRoot, { recursive: true, force: true });
await mkdir(sceneTemplateTargetRoot, { recursive: true });

const templateFiles = await copyTree(
  sceneTemplateSourceRoot,
  join(sceneTemplateSourceRoot, "axmorf"),
  join(sceneTemplateTargetRoot, "axmorf"),
);
const workspaceSeedManifestBytes = await readRegular(
  workspaceSeedSourceManifest,
  "Shared Workspace asset manifest",
);
const workspaceSeedManifest = ProducerAssetManifestSchema.parse(
  JSON.parse(workspaceSeedManifestBytes.toString("utf8")),
);
const sharedResourceFiles = await collectWorkspaceSeedFiles();
if (
  sharedResourceFiles.length !== workspaceSeedManifest.assets.length ||
  new Set(workspaceSeedManifest.assets.map(({ localPath }) => localPath))
    .size !== workspaceSeedManifest.assets.length ||
  workspaceSeedManifest.assets.some(
    (descriptor) =>
      descriptor.allowedUse !== "runtime-approved" ||
      !descriptor.localPath.startsWith("public/assets/axmorf-shared/"),
  ) ||
  workspaceSeedManifest.assets.some((descriptor) => {
    const resource = sharedResourceFiles.find(
      ({ relativePath }) => relativePath === descriptor.localPath,
    );
    return (
      resource === undefined ||
      descriptor.checksum !== checksum(resource.bytes) ||
      descriptor.media?.sizeBytes !== resource.bytes.byteLength
    );
  }) ||
  sharedResourceFiles.some(
    ({ relativePath }) =>
      !workspaceSeedManifest.assets.some(
        ({ localPath }) => localPath === relativePath,
      ),
  ) ||
  new Set(sharedResourceFiles.map(({ relativePath }) => relativePath)).size !==
    sharedResourceFiles.length
) {
  throw new Error(
    "Shared Workspace resource files are stale against the manifest.",
  );
}
const workspaceSeedFiles = await Promise.all([
  writeWorkspaceSeedFile({
    relativePath: "src/remotion/catalog/assets.manifest.json",
    bytes: workspaceSeedManifestBytes,
    scopes: ["composition", "scene"],
  }),
  writeWorkspaceSeedFile({
    relativePath: "src/remotion/catalog/scene-template-audio.defaults.json",
    bytes: Buffer.from(
      `${JSON.stringify(
        buildDefaultSceneTemplateAudioProjection(workspaceSeedManifest),
        null,
        2,
      )}\n`,
    ),
    scopes: ["composition", "scene"],
  }),
  ...sharedResourceFiles.map((file) =>
    writeWorkspaceSeedFile({
      ...file,
      scopes: ["composition", "delivery", "scene"],
    }),
  ),
]);
const distributionFiles = await Promise.all(
  [
    {
      logicalPath: "dist/contracts.js",
      scopes: ["composition", "delivery", "global-visual", "scene"],
    },
    {
      logicalPath: "dist/remotion.js",
      scopes: ["composition", "delivery", "global-visual", "scene"],
    },
    {
      logicalPath: "dist/remotion-preflight.js",
      scopes: ["delivery"],
    },
    {
      logicalPath: "dist/cli/main.js",
      scopes: ["composition", "delivery", "global-visual", "scene"],
    },
  ].map(async (file) => {
    const bytes = await readRegular(
      join(packageRoot, file.logicalPath),
      file.logicalPath,
    );
    return {
      ...file,
      checksum: checksum(bytes),
      sizeBytes: bytes.byteLength,
    };
  }),
);
const packageManifest = JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8"),
);
const files = [
  ...distributionFiles,
  ...templateFiles,
  ...workspaceSeedFiles,
].sort((left, right) => left.logicalPath.localeCompare(right.logicalPath));
const manifest = {
  schemaVersion: 1,
  policyVersion: "npm-runtime-policy-v1",
  packageName: "@axmorf/studio",
  packageVersion: packageManifest.version,
  publicExports: ["./contracts", "./remotion"],
  files,
};
await mkdir(join(assetsRoot, "policy"), { recursive: true });
await writeFile(
  join(assetsRoot, "policy/runtime-policy.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

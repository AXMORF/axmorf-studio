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

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distributionRoot = join(packageRoot, "dist");
const assetsRoot = join(distributionRoot, "assets");
const sceneTemplateSourceRoot = join(
  packageRoot,
  "src/remotion/capabilities/scene-templates",
);
const sceneTemplateTargetRoot = join(assetsRoot, "scene-templates");

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

await rm(assetsRoot, { recursive: true, force: true });
await mkdir(sceneTemplateTargetRoot, { recursive: true });

const templateFiles = await copyTree(
  sceneTemplateSourceRoot,
  join(sceneTemplateSourceRoot, "axmorf"),
  join(sceneTemplateTargetRoot, "axmorf"),
);
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
const files = [...distributionFiles, ...templateFiles].sort((left, right) =>
  left.logicalPath.localeCompare(right.logicalPath),
);
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

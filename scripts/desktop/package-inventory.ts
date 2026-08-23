import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, type Stats } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { listPackage, statFile } from "@electron/asar";
import { DesktopCompatibilityManifestSchema, RuntimePackManifestSchema, assertDesktopRuntimeCompatibility } from "../../desktop/contracts/runtime-pack";
import { DESKTOP_ELECTRON_LOCALES } from "./electron-locales";
import { DESKTOP_WORKSPACE_INTEGRATION_RESOURCE_FILES } from "./workspace-integration-package";

export const DESKTOP_PACKAGE_ALLOWED_ROOTS = Object.freeze([
  ".vite/build",
  ".vite/renderer",
  "package.json",
  "desktop/resources/brand/axmorf-studio-icon.icns",
  "desktop/resources/brand/axmorf-studio-icon.png",
  "desktop/resources/brand/axmorf-studio-icon.svg",
]);

const DESKTOP_BUILD_EXACT_FILES = Object.freeze([
  ".vite/build/engine.js",
  ".vite/build/main.js",
  ".vite/build/preload.js",
  ".vite/renderer/main_window/index.html",
]);

const DESKTOP_PACKAGE_STATIC_FILES = Object.freeze([
  ...DESKTOP_BUILD_EXACT_FILES,
  "package.json",
  "desktop/resources/brand/axmorf-studio-icon.icns",
  "desktop/resources/brand/axmorf-studio-icon.png",
  "desktop/resources/brand/axmorf-studio-icon.svg",
]);

const DESKTOP_ENGINE_DYNAMIC_FILE_PATTERNS = Object.freeze([
  /^\.vite\/build\/audio-decode-[A-Za-z0-9_-]+\.js$/u,
  /^\.vite\/build\/audio-utils-[A-Za-z0-9_-]+\.js$/u,
  /^\.vite\/build\/custom-coder-[A-Za-z0-9_-]+\.js$/u,
  /^\.vite\/build\/mediabunny-mp3-encoder-[A-Za-z0-9_-]+\.js$/u,
  /^\.vite\/build\/pcm-concat-[A-Za-z0-9_-]+\.js$/u,
  /^\.vite\/build\/volume-adjust-[A-Za-z0-9_-]+\.js$/u,
]);

const DESKTOP_NATIVE_GATE_ENGINE_DYNAMIC_FILE_PATTERNS = Object.freeze([
  /^\.vite\/build\/typescript-[A-Za-z0-9_-]+\.js$/u,
]);

const DESKTOP_RENDERER_DYNAMIC_FILE_PATTERNS = Object.freeze([
  /^\.vite\/renderer\/main_window\/assets\/index-[A-Za-z0-9_-]+\.css$/u,
  /^\.vite\/renderer\/main_window\/assets\/index-[A-Za-z0-9_-]+\.js$/u,
]);

const desktopBuildDynamicFilePatterns = (nativeGateBuild: boolean) => [
  ...DESKTOP_ENGINE_DYNAMIC_FILE_PATTERNS,
  ...(nativeGateBuild
    ? DESKTOP_NATIVE_GATE_ENGINE_DYNAMIC_FILE_PATTERNS
    : []),
  ...DESKTOP_RENDERER_DYNAMIC_FILE_PATTERNS,
];

const DESKTOP_PACKAGE_ALLOWED_DIRECTORIES = new Set([
  ".vite",
  ".vite/build",
  ".vite/renderer",
  ".vite/renderer/main_window",
  ".vite/renderer/main_window/assets",
  "desktop",
  "desktop/resources",
  "desktop/resources/brand",
]);

const DESKTOP_RESOURCES_REQUIRED_TOP_LEVEL = Object.freeze([
  "app.asar",
  "compatibility.json",
  "electron.icns",
  ...DESKTOP_ELECTRON_LOCALES,
  "runtime-pack",
  "workspace-integration",
]);

const DESKTOP_RESOURCES_OPTIONAL_TOP_LEVEL = Object.freeze([
  "app.asar.unpacked",
]);

export const assertDesktopResourcesTopLevel = (
  rawEntries: readonly string[],
) => {
  const entries = [...rawEntries].sort();
  if (new Set(entries).size !== entries.length) {
    throw new Error("desktop-resources-top-level-duplicate");
  }
  for (const required of DESKTOP_RESOURCES_REQUIRED_TOP_LEVEL) {
    if (!entries.includes(required)) {
      throw new Error(`desktop-resources-top-level-missing:${required}`);
    }
  }
  const allowed = new Set([
    ...DESKTOP_RESOURCES_REQUIRED_TOP_LEVEL,
    ...DESKTOP_RESOURCES_OPTIONAL_TOP_LEVEL,
  ]);
  const unknown = entries.find((entry) => !allowed.has(entry));
  if (unknown !== undefined) {
    throw new Error(`desktop-resources-top-level-forbidden:${unknown}`);
  }
};

const toPosixPath = (path: string) => path.split(sep).join("/");

const DESKTOP_ENGINE_FORBIDDEN_AUTHORITY_MARKERS = Object.freeze([
  "repositoryRoot",
  'kind:"repository"',
  "kind:`repository`",
  "createRepositoryProjectStorageLocations",
  "createProjectStorageLocations",
  "Repository Project storage",
  "Local reference asset manifest",
  "private/reference-assets/assets.manifest.json",
  "node_modules/.bin/remotion",
  "npm run project:",
  "repositoryMode",
]);

export const assertDesktopEngineAuthorityBoundary = (enginePath: string) => {
  const source = readFileSync(enginePath, "utf8");
  const marker = DESKTOP_ENGINE_FORBIDDEN_AUTHORITY_MARKERS.find((value) =>
    source.includes(value),
  );
  if (marker !== undefined) {
    throw new Error(`desktop-engine-repository-authority:${marker}`);
  }
};

export const isDesktopPackagePathAllowed = (
  repositoryPath: string,
  nativeGateBuild = process.env.AXMORF_PHASE_B_NATIVE_GATE_BUILD === "1",
) => {
  const normalized = toPosixPath(repositoryPath).replace(/^\/+|\/+$/gu, "");
  if (normalized === "") return true;
  if (normalized === ".." || normalized.startsWith("../")) return false;
  return (
    DESKTOP_PACKAGE_ALLOWED_DIRECTORIES.has(normalized) ||
    DESKTOP_PACKAGE_STATIC_FILES.includes(
      normalized as (typeof DESKTOP_PACKAGE_STATIC_FILES)[number],
    ) ||
    desktopBuildDynamicFilePatterns(nativeGateBuild).some((pattern) =>
      pattern.test(normalized),
    )
  );
};

const assertRegularFile = (path: string, stat: Stats) => {
  if (!stat.isFile()) {
    throw new Error(`desktop-package-inventory-invalid-file:${path}`);
  }
};

const assertRealDirectory = (path: string, label: string) => {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`desktop-package-inventory-invalid-${label}:${path}`);
  }
};

const collectRegularFiles = (root: string) => {
  assertRealDirectory(root, "build-output-root");
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink()) {
        throw new Error(`desktop-build-inventory-symlink:${path}`);
      }
      if (metadata.isDirectory()) walk(path);
      else {
        assertRegularFile(path, metadata);
        files.push(toPosixPath(relative(root, path)));
      }
    }
  };
  walk(root);
  return files.sort();
};

const assertExactPatternInventory = ({
  files,
  exact,
  patterns,
  label,
}: {
  readonly files: readonly string[];
  readonly exact: readonly string[];
  readonly patterns: readonly RegExp[];
  readonly label: string;
}) => {
  const known = new Set(exact);
  for (const pattern of patterns) {
    const matches = files.filter((path) => pattern.test(path));
    if (matches.length !== 1) {
      throw new Error(`${label}-pattern-drift:${pattern.source}`);
    }
    known.add(matches[0]!);
  }
  if (
    exact.some((path) => !files.includes(path)) ||
    files.some((path) => !known.has(path)) ||
    files.length !== known.size
  ) {
    throw new Error(`${label}-exact-file-drift`);
  }
};

export type DesktopBuildInventory = Readonly<{
  mainFiles: number;
  rspFiles: 1;
  rendererFiles: 3;
}>;

export const verifyDesktopBuildInventory = (
  checkoutRoot = process.cwd(),
  nativeGateBuild = process.env.AXMORF_PHASE_B_NATIVE_GATE_BUILD === "1",
): DesktopBuildInventory => {
  const viteRoot = resolve(checkoutRoot, ".vite");
  const mainFiles = collectRegularFiles(join(viteRoot, "build"));
  const rspFiles = collectRegularFiles(join(viteRoot, "rsp"));
  const rendererFiles = collectRegularFiles(
    join(viteRoot, "renderer/main_window"),
  );
  assertExactPatternInventory({
    files: mainFiles,
    exact: ["engine.js", "main.js", "preload.js"],
    patterns: [
      ...DESKTOP_ENGINE_DYNAMIC_FILE_PATTERNS,
      ...(nativeGateBuild
        ? DESKTOP_NATIVE_GATE_ENGINE_DYNAMIC_FILE_PATTERNS
        : []),
    ].map(
      (pattern) => new RegExp(pattern.source.replace("^\\.vite\\/build\\/", "^"), "u"),
    ),
    label: "desktop-main-build-inventory",
  });
  assertExactPatternInventory({
    files: rspFiles,
    exact: ["rsp-sea.cjs"],
    patterns: [],
    label: "desktop-rsp-build-inventory",
  });
  assertExactPatternInventory({
    files: rendererFiles,
    exact: ["index.html"],
    patterns: DESKTOP_RENDERER_DYNAMIC_FILE_PATTERNS.map(
      (pattern) =>
        new RegExp(
          pattern.source.replace(
            "^\\.vite\\/renderer\\/main_window\\/",
            "^",
          ),
          "u",
        ),
    ),
    label: "desktop-renderer-build-inventory",
  });
  assertDesktopEngineAuthorityBoundary(join(viteRoot, "build/engine.js"));
  return {
    mainFiles: mainFiles.length,
    rspFiles: 1,
    rendererFiles: 3,
  };
};

export const assertPackagedApplicationInventory = (
  files: readonly string[],
  nativeGateBuild = process.env.AXMORF_PHASE_B_NATIVE_GATE_BUILD === "1",
) => {
  assertExactPatternInventory({
    files,
    exact: DESKTOP_PACKAGE_STATIC_FILES,
    patterns: desktopBuildDynamicFilePatterns(nativeGateBuild),
    label: "desktop-asar-inventory",
  });
};

const readBoundedStrictJson = (
  path: string,
  maximumBytes: number,
  label: string,
) => {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`desktop-package-inventory-invalid-${label}:${path}`);
  }
  if (metadata.size === 0 || metadata.size > maximumBytes) {
    throw new Error(`desktop-package-inventory-invalid-${label}-size:${path}`);
  }
  const bytes = readFileSync(path);
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new Error(`desktop-package-inventory-invalid-${label}-json:${path}`);
  }
};

const assertRealParentChain = (root: string, relativePath: string) => {
  let current = root;
  for (const parent of relativePath.split("/").slice(0, -1)) {
    current = join(current, parent);
    const metadata = lstatSync(current);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(
        `desktop-workspace-integration-unsafe-parent:${relativePath}`,
      );
    }
  }
};

const inspectUnpackedTree = (root: string, current = root): number => {
  let files = 0;
  for (const name of readdirSync(current)) {
    const path = join(current, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`desktop-package-inventory-symlink:${path}`);
    }
    const archivePath = toPosixPath(relative(root, path));
    if (!isDesktopPackagePathAllowed(archivePath)) {
      throw new Error(`desktop-package-inventory-forbidden:${archivePath}`);
    }
    if (stat.isDirectory()) files += inspectUnpackedTree(root, path);
    else {
      assertRegularFile(path, stat);
      files += 1;
    }
  }
  return files;
};

export type DesktopPackageInventory = Readonly<{
  appPath: string;
  asarEntries: number;
  unpackedFiles: number;
  asarSha256: string;
  runtimePackId: string;
  runtimePackFiles: number;
  workspaceIntegrationFiles: number;
  workspaceIntegrationSha256: string;
}>;

export const inspectPackagedWorkspaceIntegration = ({
  resourcesPath,
  sourceRoot = join(
    process.cwd(),
    "desktop/resources/workspace-integration",
  ),
}: {
  readonly resourcesPath: string;
  readonly sourceRoot?: string;
}) => {
  const packagedRoot = join(resourcesPath, "workspace-integration");
  for (const [label, root] of [
    ["source", sourceRoot],
    ["packaged", packagedRoot],
  ] as const) {
    const metadata = lstatSync(root);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(
        `desktop-workspace-integration-invalid-${label}-root:${root}`,
      );
    }
  }
  const actual = new Map<string, Stats>();
  const walk = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink()) {
        throw new Error(`desktop-workspace-integration-symlink:${path}`);
      }
      if (metadata.isDirectory()) walk(path);
      else {
        assertRegularFile(path, metadata);
        actual.set(toPosixPath(relative(packagedRoot, path)), metadata);
      }
    }
  };
  walk(packagedRoot);
  const expected = [...DESKTOP_WORKSPACE_INTEGRATION_RESOURCE_FILES].sort();
  if (
    actual.size !== expected.length ||
    expected.some((path) => !actual.has(path))
  ) {
    throw new Error("desktop-workspace-integration-inventory-drift");
  }
  const identities = expected.map((relativePath) => {
    const source = join(sourceRoot, relativePath);
    const packaged = join(packagedRoot, relativePath);
    const sourceMetadata = lstatSync(source);
    const packagedMetadata = actual.get(relativePath)!;
    assertRealParentChain(sourceRoot, relativePath);
    if (sourceMetadata.isSymbolicLink()) {
      throw new Error(
        `desktop-workspace-integration-source-symlink:${relativePath}`,
      );
    }
    assertRegularFile(source, sourceMetadata);
    const sourceBytes = readFileSync(source);
    const packagedBytes = readFileSync(packaged);
    const expectedChecksum = createHash("sha256")
      .update(sourceBytes)
      .digest("hex");
    const actualChecksum = createHash("sha256")
      .update(packagedBytes)
      .digest("hex");
    if (
      sourceMetadata.size !== packagedMetadata.size ||
      expectedChecksum !== actualChecksum
    ) {
      throw new Error(
        `desktop-workspace-integration-file-drift:${relativePath}`,
      );
    }
    return {
      path: relativePath,
      sizeBytes: sourceMetadata.size,
      sha256: expectedChecksum,
    };
  });
  return {
    workspaceIntegrationFiles: identities.length,
    workspaceIntegrationSha256: createHash("sha256")
      .update(JSON.stringify(identities))
      .digest("hex"),
  } as const;
};

const inspectPackagedRuntime = (resourcesPath: string) => {
  const root = join(resourcesPath, "runtime-pack");
  assertRealDirectory(root, "runtime-pack-root");
  const manifest = RuntimePackManifestSchema.parse(
    readBoundedStrictJson(
      join(root, "runtime-pack.json"),
      8 * 1024 * 1024,
      "runtime-pack-manifest",
    ),
  );
  const actual = new Map<string, Stats>();
  const walk = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`desktop-runtime-pack-symlink:${path}`);
      if (stat.isDirectory()) walk(path);
      else {
        assertRegularFile(path, stat);
        const logical = relative(root, path).split(sep).join("/");
        if (logical !== "runtime-pack.json") actual.set(logical, stat);
      }
    }
  };
  walk(root);
  if (actual.size !== manifest.files.length) throw new Error("desktop-runtime-pack-inventory-drift");
  for (const file of manifest.files) {
    const stat = actual.get(file.path);
    const path = join(root, file.path);
    if (stat === undefined || stat.size !== file.sizeBytes || createHash("sha256").update(readFileSync(path)).digest("hex") !== file.sha256 || (((stat.mode & 0o111) !== 0) !== file.executable)) {
      throw new Error(`desktop-runtime-pack-file-drift:${file.path}`);
    }
  }
  return { runtimePackId: manifest.runtimePackId, runtimePackFiles: manifest.files.length };
};

export const verifyDesktopPackageInventory = (
  appPath: string,
): DesktopPackageInventory => {
  const resourcesPath = join(appPath, "Contents", "Resources");
  assertRealDirectory(resourcesPath, "resources-root");
  const resourceEntries = readdirSync(resourcesPath, { withFileTypes: true });
  assertDesktopResourcesTopLevel(resourceEntries.map(({ name }) => name));
  for (const entry of resourceEntries) {
    if (entry.isSymbolicLink()) {
      throw new Error(`desktop-resources-top-level-symlink:${entry.name}`);
    }
    const expectsDirectory =
      entry.name === "runtime-pack" ||
      entry.name === "workspace-integration" ||
      DESKTOP_ELECTRON_LOCALES.includes(entry.name as never) ||
      entry.name === "app.asar.unpacked";
    if (
      (expectsDirectory && !entry.isDirectory()) ||
      (!expectsDirectory && !entry.isFile())
    ) {
      throw new Error(`desktop-resources-top-level-type:${entry.name}`);
    }
  }
  const runtime = inspectPackagedRuntime(resourcesPath);
  const integration = inspectPackagedWorkspaceIntegration({ resourcesPath });
  const runtimeManifest = RuntimePackManifestSchema.parse(
    readBoundedStrictJson(
      join(resourcesPath, "runtime-pack/runtime-pack.json"),
      8 * 1024 * 1024,
      "runtime-pack-manifest",
    ),
  );
  assertDesktopRuntimeCompatibility({
    runtimePack: runtimeManifest,
    compatibility: DesktopCompatibilityManifestSchema.parse(
      readBoundedStrictJson(
        join(resourcesPath, "compatibility.json"),
        64 * 1024,
        "compatibility-manifest",
      ),
    ),
  });
  const asarPath = join(resourcesPath, "app.asar");
  assertRegularFile(asarPath, lstatSync(asarPath));

  const entries = listPackage(asarPath, { isPack: false });
  const asarFiles: string[] = [];
  for (const entry of entries) {
    const archivePath = toPosixPath(entry).replace(/^\/+|\/+$/gu, "");
    if (!isDesktopPackagePathAllowed(archivePath)) {
      throw new Error(`desktop-package-inventory-forbidden:${archivePath}`);
    }
    const metadata = statFile(asarPath, archivePath, false);
    if ("link" in metadata) {
      throw new Error(`desktop-package-inventory-symlink:${archivePath}`);
    }
    if (!("files" in metadata)) asarFiles.push(archivePath);
  }
  assertPackagedApplicationInventory(asarFiles.sort());

  const unpackedPath = `${asarPath}.unpacked`;
  let unpackedFiles = 0;
  try {
    const stat = lstatSync(unpackedPath);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(
        `desktop-package-inventory-invalid-unpacked:${unpackedPath}`,
      );
    }
    unpackedFiles = inspectUnpackedTree(unpackedPath);
  } catch (error: unknown) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  return {
    appPath,
    asarEntries: entries.length,
    unpackedFiles,
    asarSha256: createHash("sha256")
      .update(readFileSync(asarPath))
      .digest("hex"),
    ...runtime,
    ...integration,
  };
};

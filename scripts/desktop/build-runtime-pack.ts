import { spawn } from "node:child_process";
import { chmod, copyFile, lstat, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";

import { ensureBrowser } from "@remotion/renderer";

import { buildRuntimePack, probeRuntimeExecutable } from "../../desktop/adapters/runtime-pack-filesystem";
import {
  DESKTOP_REQUIRED_REMOTION_PACKAGES,
  DESKTOP_UNSUPPORTED_REMOTION_PACKAGES,
  buildDesktopCompatibilityManifest,
} from "../../desktop/contracts/runtime-pack";
import {
  RUNTIME_POLICY_ROOT_PATHS,
  TASK_POLICY_PATHS,
} from "../project-production/adapters/project-input-snapshot";

const run = (command: string, args: readonly string[]) => new Promise<void>((resolvePromise, reject) => {
  const child = spawn(command, [...args], { cwd: process.cwd(), stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`${command} failed (${signal ?? code}).`)));
});

type AdditionalFile = Readonly<{
  source: string;
  relativePath: string;
  executable: boolean;
}>;
const collectFiles = async (
  root: string,
  prefix: string,
  current = root,
  omitNestedNodeModules = false,
): Promise<AdditionalFile[]> => {
  const output: Array<{ source: string; relativePath: string; executable: boolean }> = [];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const source = join(current, entry.name);
    if (
      omitNestedNodeModules &&
      entry.name === "node_modules" &&
      entry.isDirectory() &&
      current === root
    ) {
      continue;
    }
    if (entry.isSymbolicLink()) throw new Error("Browser bundle cannot contain symlinks.");
    if (entry.isDirectory()) output.push(...(await collectFiles(root, prefix, source, omitNestedNodeModules)));
    else if (entry.isFile()) output.push({ source, relativePath: `${prefix}/${relative(root, source)}`, executable: ((await lstat(source)).mode & 0o111) !== 0 });
    else throw new Error("Browser bundle cannot contain special files.");
  }
  return output;
};

export const listDesktopRuntimeSourcePaths = () => {
  const paths = [
    ...new Set([
      ...RUNTIME_POLICY_ROOT_PATHS,
      ...Object.values(TASK_POLICY_PATHS).flat(),
    ]),
  ].sort();
  return paths.filter(
    (path, index) =>
      index === 0 ||
      !paths.slice(0, index).some((parent) => path.startsWith(`${parent}/`)),
  );
};

const collectRuntimeSourceFiles = async () => {
  const files: AdditionalFile[] = [];
  for (const relativePath of listDesktopRuntimeSourcePaths()) {
    const source = join(process.cwd(), relativePath);
    const metadata = await lstat(source);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Runtime source cannot be symbolic: ${relativePath}.`);
    }
    if (metadata.isDirectory()) {
      files.push(...(await collectFiles(source, `source/${relativePath}`)));
    } else if (metadata.isFile()) {
      files.push({source, relativePath: `source/${relativePath}`, executable: false});
    } else {
      throw new Error(`Runtime source cannot be special: ${relativePath}.`);
    }
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
};

export const DESKTOP_RENDER_SOURCE_PACKAGES = Object.freeze([
  "@react-three/fiber",
  "@remotion/bundler",
  "@remotion/effects",
  "@remotion/gif",
  "@remotion/layout-utils",
  "@remotion/lottie",
  "@remotion/media",
  "@remotion/motion-blur",
  "@remotion/renderer",
  "@remotion/three",
  "@remotion/transitions",
  "ogl",
  "react",
  "react-dom",
  "remotion",
  "three",
  "zod",
] as const);

export const DESKTOP_FORBIDDEN_RUNTIME_PACKAGES =
  DESKTOP_UNSUPPORTED_REMOTION_PACKAGES;

export const DESKTOP_COMPOSITOR_RUNTIME_FILES = Object.freeze([
  "libavcodec.dylib",
  "libavdevice.dylib",
  "libavfilter.dylib",
  "libavformat.dylib",
  "libavutil.dylib",
  "libswresample.dylib",
  "libswscale.dylib",
  "remotion",
] as const);

const forbiddenRuntimePackages = new Set<string>(
  DESKTOP_FORBIDDEN_RUNTIME_PACKAGES,
);

type RuntimePackageLock = Readonly<{
  packages: Readonly<
    Record<
      string,
      Readonly<{
        version?: string;
        dependencies?: Readonly<Record<string, string>>;
        optionalDependencies?: Readonly<Record<string, string>>;
        peerDependencies?: Readonly<Record<string, string>>;
        peerDependenciesMeta?: Readonly<
          Record<string, Readonly<{ optional?: boolean }>>
        >;
        os?: readonly string[];
        cpu?: readonly string[];
        libc?: readonly string[];
      }>
    >
  >;
}>;

type RuntimeTarget = Readonly<{
  platform: string;
  architecture: string;
  libc?: string;
}>;

const packageLocationCandidates = (
  packageLocation: string,
  dependency: string,
) => {
  const locations: string[] = [];
  let current = packageLocation;
  while (current !== "." && current !== "/") {
    locations.push(
      current.endsWith("node_modules")
        ? `${current}/${dependency}`
        : `${current}/node_modules/${dependency}`,
    );
    const parent = dirname(current).split("\\").join("/");
    if (parent === current) break;
    current = parent;
  }
  locations.push(`node_modules/${dependency}`);
  return [...new Set(locations)];
};

const targetMatches = (
  values: readonly string[] | undefined,
  target: string,
) => {
  if (values === undefined) return true;
  if (values.includes(`!${target}`)) return false;
  const positive = values.filter((value) => !value.startsWith("!"));
  return positive.length === 0 || positive.includes(target);
};

const packageMatchesTarget = (
  record: Readonly<{
    os?: readonly string[];
    cpu?: readonly string[];
    libc?: readonly string[];
  }>,
  target: RuntimeTarget,
) =>
  targetMatches(record.os, target.platform) &&
  targetMatches(record.cpu, target.architecture) &&
  (record.libc === undefined ||
    (target.libc !== undefined && targetMatches(record.libc, target.libc)));

const resolveDependencyLocation = (
  lock: RuntimePackageLock,
  packageLocation: string,
  dependency: string,
) =>
  packageLocationCandidates(packageLocation, dependency).find(
    (candidate) => lock.packages[candidate] !== undefined,
  );

export const resolveDesktopRuntimeModuleLocations = (
  lock: RuntimePackageLock,
  roots: readonly string[] = DESKTOP_RENDER_SOURCE_PACKAGES,
  target: RuntimeTarget = {
    platform: "darwin",
    architecture: "arm64",
  },
) => {
  const selected = new Set<string>();
  const queue: string[] = roots.map((name) => `node_modules/${name}`);
  while (queue.length > 0) {
    const location = queue.shift()!;
    if (selected.has(location)) continue;
    const record = lock.packages[location];
    if (record === undefined) {
      throw new Error(`Production dependency is missing: ${location}.`);
    }
    const nameMatch = /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+$/u.exec(
      location,
    );
    const name = nameMatch?.[0]
      ?.replace(/^.*node_modules\//u, "")
      .replace(/^(@[^/]+\/[^/]+).*$/u, "$1");
    if (name === undefined) {
      throw new Error(`Runtime package location is invalid: ${location}.`);
    }
    if (forbiddenRuntimePackages.has(name)) {
      throw new Error(
        `Runtime source dependency reaches forbidden tooling: ${name}.`,
      );
    }
    if (!packageMatchesTarget(record, target)) {
      throw new Error(`Required Runtime package is target-incompatible: ${name}.`);
    }
    selected.add(location);
    const requiredDependencies = new Set([
      ...Object.keys(record.dependencies ?? {}),
      ...Object.keys(record.peerDependencies ?? {}).filter(
        (dependency) =>
          record.peerDependenciesMeta?.[dependency]?.optional !== true,
      ),
    ]);
    for (const dependency of [...requiredDependencies].sort()) {
      const resolved = resolveDependencyLocation(lock, location, dependency);
      if (resolved === undefined) {
        throw new Error(
          `Production dependency is missing: ${location} -> ${dependency}.`,
        );
      }
      if (!packageMatchesTarget(lock.packages[resolved]!, target)) {
        throw new Error(
          `Required Runtime dependency is target-incompatible: ${location} -> ${dependency}.`,
        );
      }
      queue.push(resolved);
    }
    for (const dependency of Object.keys(
      record.optionalDependencies ?? {},
    ).sort()) {
      const resolved = resolveDependencyLocation(lock, location, dependency);
      if (
        resolved !== undefined &&
        packageMatchesTarget(lock.packages[resolved]!, target)
      ) {
        queue.push(resolved);
      }
    }
  }
  return [...selected].sort();
};

const moduleNameFromLocation = (location: string) => {
  const nested = location.split("/node_modules/").at(-1)!;
  const parts = nested.replace(/^node_modules\//u, "").split("/");
  return parts[0]!.startsWith("@")
    ? `${parts[0]}/${parts[1]}`
    : parts[0]!;
};

export const resolveDesktopRuntimeModuleNames = (
  lock: RuntimePackageLock,
  roots: readonly string[] = DESKTOP_RENDER_SOURCE_PACKAGES,
  target?: RuntimeTarget,
) =>
  [
    ...new Set(
      resolveDesktopRuntimeModuleLocations(lock, roots, target).map(
        moduleNameFromLocation,
      ),
    ),
  ].sort();

export const collectDesktopProductionModuleClosure = async ({
  platform = process.platform,
  architecture = process.arch,
  libc,
}: Partial<RuntimeTarget> = {}) => {
  const lock = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile("package-lock.json", "utf8"))) as {
    packages: Record<string, { version?: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }>; os?: string[]; cpu?: string[]; libc?: string[] }>;
  };
  const target = { platform, architecture, libc };
  const moduleLocations = resolveDesktopRuntimeModuleLocations(
    lock,
    DESKTOP_RENDER_SOURCE_PACKAGES,
    target,
  );
  const files: Array<{ source: string; relativePath: string; executable: boolean }> = [];
  for (const location of moduleLocations) {
    const moduleRoot = join(process.cwd(), location);
    const metadata = await lstat(moduleRoot).catch(() => null);
    if (metadata === null) {
      throw new Error(`Runtime module is not installed: ${location}.`);
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`Runtime module is unsafe: ${location}.`);
    files.push(...(await collectFiles(moduleRoot, location, moduleRoot, true)));
  }
  const remotionPackages = moduleLocations
    .filter((location) => /^node_modules\/(?:remotion|@remotion\/[^/]+)$/u.test(location))
    .map((location) => {
      const name = moduleNameFromLocation(location);
      const version = lock.packages[location]?.version;
      if (version === undefined) {
        throw new Error(`Runtime package version is missing: ${name}.`);
      }
      return { name, version };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const required of DESKTOP_REQUIRED_REMOTION_PACKAGES) {
    if (!remotionPackages.some(({ name }) => name === required)) {
      throw new Error(`Runtime package closure is missing ${required}.`);
    }
  }
  return {
    files,
    remotionPackages,
    moduleLocations,
    moduleNames: [...new Set(moduleLocations.map(moduleNameFromLocation))].sort(),
  } as const;
};

const buildRspSea = async (temporary: string) => {
  await run(join(process.cwd(), "node_modules/.bin/vite"), ["build", "--config", "vite.desktop.rsp.config.ts"]);
  const bundle = join(process.cwd(), ".vite/rsp/rsp-sea.cjs");
  const blob = join(temporary, "rsp.blob");
  const config = join(temporary, "sea-config.json");
  const output = join(temporary, "rsp");
  await writeFile(config, `${JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: true })}\n`);
  await run(process.execPath, ["--experimental-sea-config", config]);
  await copyFile(process.execPath, output); await chmod(output, 0o755);
  await run("codesign", ["--remove-signature", output]);
  await run(join(process.cwd(), "node_modules/.bin/postject"), [output, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2", "--macho-segment-name", "NODE_SEA"]);
  return output;
};

export const buildDesktopRuntimePack = async ({ outputRoot = join(process.cwd(), "desktop/runtime-pack") } = {}) => {
  if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("desktop-runtime-pack-native-host-required");
  const temporary = await mkdtemp(join(tmpdir(), "rsp-runtime-build-"));
  try {
    const browser = await ensureBrowser({ chromeMode: "headless-shell", logLevel: "error" });
    if (browser.type === "no-browser" || browser.type === "version-mismatch") throw new Error("Runtime browser is unavailable or incompatible.");
    const browserExecutable = browser.path;
    const browserRoot = dirname(browserExecutable);
    const require = createRequire(import.meta.url);
    const compositorRoot = dirname(require.resolve("@remotion/compositor-darwin-arm64/package.json"));
    const ffmpeg = join(compositorRoot, "ffmpeg"); const ffprobe = join(compositorRoot, "ffprobe");
    const [browserVersion, ffmpegVersion, ffprobeVersion, nodeVersion] = await Promise.all([
      probeRuntimeExecutable({ executable: browserExecutable }),
      probeRuntimeExecutable({ executable: ffmpeg, args: ["-version"], dynamicLibraryDirectory: compositorRoot }),
      probeRuntimeExecutable({ executable: ffprobe, args: ["-version"], dynamicLibraryDirectory: compositorRoot }),
      probeRuntimeExecutable({ executable: process.execPath }),
    ]);
    const rsp = await buildRspSea(temporary);
    const browserFiles = await collectFiles(browserRoot, "browser");
    const browserExecutableRelative = `browser/${relative(browserRoot, browserExecutable)}`;
    const moduleClosure = await collectDesktopProductionModuleClosure({
      platform: "darwin",
      architecture: "arm64",
    });
    const sourceFiles = [
      ...(await collectRuntimeSourceFiles()),
      ...(await collectFiles(join(process.cwd(), "desktop/resources/workspace-integration/assets"), "shared-assets")),
      ...moduleClosure.files,
    ];
    const compositorFiles = await Promise.all(
      DESKTOP_COMPOSITOR_RUNTIME_FILES.map(async (name) => {
        const source = join(compositorRoot, name);
        const metadata = await lstat(source);
        if (!metadata.isFile() || metadata.isSymbolicLink()) {
          throw new Error(`Runtime compositor file is unsafe: ${name}.`);
        }
        return {
          source,
          relativePath: `bin/${name}`,
          executable: (metadata.mode & 0o111) !== 0,
        };
      }),
    );
    const additionalFiles = [
      ...browserFiles.filter(({ relativePath }) => relativePath !== browserExecutableRelative),
      ...compositorFiles,
      ...sourceFiles,
    ]
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const manifest = await buildRuntimePack({
      outputRoot: resolve(outputRoot), architecture: "arm64", remotionPackages: moduleClosure.remotionPackages,
      binaries: {
        rendererBrowser: { source: browserExecutable, relativePath: browserExecutableRelative, version: browserVersion },
        ffmpeg: { source: ffmpeg, relativePath: "bin/ffmpeg", version: ffmpegVersion },
        ffprobe: { source: ffprobe, relativePath: "bin/ffprobe", version: ffprobeVersion },
        node: { source: process.execPath, relativePath: "bin/node", version: nodeVersion },
        rspClient: { source: rsp, relativePath: "bin/rsp", version: "rsp-local-v2" },
      }, additionalFiles,
    });
    const rootPackage = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile("package.json", "utf8"))) as { version: string };
    const compatibility = buildDesktopCompatibilityManifest({ appVersion: rootPackage.version, runtimePack: manifest });
    await writeFile(join(dirname(resolve(outputRoot)), "compatibility.json"), `${JSON.stringify(compatibility, null, 2)}\n`, { mode: 0o644 });
    return manifest;
  } finally { await rm(temporary, { recursive: true, force: true }); }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  buildDesktopRuntimePack().then((manifest) => process.stdout.write(`${JSON.stringify(manifest)}\n`)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1;
  });
}

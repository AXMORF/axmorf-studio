import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import {
  DesktopCompatibilityManifestSchema,
  RuntimePackManifestSchema,
  buildRuntimePackManifest,
  type RuntimePackManifest,
} from "../contracts/runtime-pack";
import type { DesktopDarwinArchitecture } from "../configuration/darwin-target";

export const RUNTIME_PACK_MANIFEST = "runtime-pack.json" as const;
export const DESKTOP_COMPATIBILITY_MANIFEST = "compatibility.json" as const;
const MAX_RUNTIME_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_COMPATIBILITY_MANIFEST_BYTES = 64 * 1024;

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

const compareCanonicalText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const contained = (root: string, path: string) => {
  const value = relative(root, path);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`));
};

const inspectRealDirectory = async (path: string, label: string) => {
  const resolved = resolve(path);
  const metadata = await lstat(resolved);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} is not a real directory.`);
  }
  return {
    canonical: await realpath(resolved),
    resolved,
  } as const;
};

const readBoundedRegularJson = async ({
  path,
  label,
  maximumBytes,
}: {
  readonly path: string;
  readonly label: string;
  readonly maximumBytes: number;
}) => {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error(`${label} is not a regular file.`);
  }
  if (before.size === 0 || before.size > maximumBytes) {
    throw new Error(`${label} has an invalid size.`);
  }
  const bytes = await readFile(path);
  const after = await lstat(path);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    bytes.byteLength !== before.size
  ) {
    throw new Error(`${label} changed during verification.`);
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new Error(`${label} is not strict UTF-8 JSON.`);
  }
};

const walk = async (root: string, current = root): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink())
      throw new Error("Runtime Pack cannot contain symlinks.");
    if (entry.isDirectory()) files.push(...(await walk(root, path)));
    else if (entry.isFile())
      files.push(relative(root, path).split(sep).join("/"));
    else throw new Error("Runtime Pack cannot contain special files.");
  }
  return files;
};

export const verifyRuntimePack = async ({
  runtimePackRoot,
  expectedResourcesRoot,
  expectedArchitecture = process.arch,
  expectedPlatform = process.platform,
}: {
  readonly runtimePackRoot: string;
  readonly expectedResourcesRoot?: string;
  readonly expectedArchitecture?: string;
  readonly expectedPlatform?: string;
}): Promise<RuntimePackManifest> => {
  const inspectedRoot = await inspectRealDirectory(
    runtimePackRoot,
    "Runtime Pack root",
  );
  const root = inspectedRoot.canonical;
  if (inspectedRoot.resolved !== root) {
    throw new Error("Runtime Pack root must be canonical.");
  }
  if (expectedResourcesRoot !== undefined) {
    const resources = await inspectRealDirectory(
      expectedResourcesRoot,
      "App Resources root",
    );
    if (resources.resolved !== resources.canonical) {
      throw new Error("App Resources root must be canonical.");
    }
    const expectedRoot = join(resources.canonical, "runtime-pack");
    if (root !== expectedRoot || !contained(resources.canonical, root)) {
      throw new Error(
        "Runtime Pack root is outside the expected App Resources.",
      );
    }
  }
  const manifestPath = join(root, RUNTIME_PACK_MANIFEST);
  const manifest = RuntimePackManifestSchema.parse(
    await readBoundedRegularJson({
      path: manifestPath,
      label: "Runtime Pack manifest",
      maximumBytes: MAX_RUNTIME_MANIFEST_BYTES,
    }),
  );
  if (
    manifest.platform !== expectedPlatform ||
    manifest.architecture !== expectedArchitecture
  ) {
    throw new Error("Runtime Pack platform or architecture is incompatible.");
  }
  const actual = (await walk(root))
    .filter((path) => path !== RUNTIME_PACK_MANIFEST)
    .sort();
  const expected = manifest.files.map(({ path }) => path);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Runtime Pack exact file inventory drifted.");
  }
  for (const file of manifest.files) {
    const path = resolve(root, file.path);
    if (!contained(root, path))
      throw new Error("Runtime Pack path escaped its root.");
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink())
      throw new Error("Runtime Pack file is unsafe.");
    const bytes = await readFile(path);
    const after = await lstat(path);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size
    ) {
      throw new Error("Runtime Pack file changed during verification.");
    }
    if (bytes.byteLength !== file.sizeBytes || sha256(bytes) !== file.sha256) {
      throw new Error(`Runtime Pack checksum drifted: ${file.path}.`);
    }
    if (file.executable !== ((before.mode & 0o111) !== 0)) {
      throw new Error(`Runtime Pack executable mode drifted: ${file.path}.`);
    }
  }
  for (const identity of manifest.remotionPackages) {
    const packagePath = join(
      root,
      "node_modules",
      identity.name,
      "package.json",
    );
    const packageJson = await readBoundedRegularJson({
      path: packagePath,
      label: `Runtime package ${identity.name}`,
      maximumBytes: 1024 * 1024,
    });
    if (
      packageJson === null ||
      typeof packageJson !== "object" ||
      Array.isArray(packageJson) ||
      (packageJson as { name?: unknown }).name !== identity.name ||
      (packageJson as { version?: unknown }).version !== identity.version
    ) {
      throw new Error(`Runtime package identity drifted: ${identity.name}.`);
    }
  }
  return manifest;
};

export type RuntimePackBuildInput = Readonly<{
  outputRoot: string;
  architecture: DesktopDarwinArchitecture;
  remotionPackages: readonly Readonly<{ name: string; version: string }>[];
  binaries: Readonly<{
    rendererBrowser: { source: string; relativePath: string; version: string };
    ffmpeg: { source: string; relativePath: string; version: string };
    ffprobe: { source: string; relativePath: string; version: string };
    node: { source: string; relativePath: string; version: string };
    rspClient: { source: string; relativePath: string; version: string };
  }>;
  additionalFiles?: readonly Readonly<{
    source: string;
    relativePath: string;
    executable?: boolean;
  }>[];
}>;

export const buildRuntimePack = async (input: RuntimePackBuildInput) => {
  const target = resolve(input.outputRoot);
  if (dirname(target) === target)
    throw new Error("Filesystem root cannot be a Runtime Pack target.");
  const staging = `${target}.staging-${process.pid}`;
  const backup = `${target}.previous-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await rm(backup, { recursive: true, force: true });
  await mkdir(staging, { recursive: true, mode: 0o700 });
  const bindings = Object.entries(input.binaries).sort(([left], [right]) =>
    compareCanonicalText(left, right),
  );
  const sources = [
    ...bindings.map(([name, value]) => ({ name, ...value, executable: true })),
    ...(input.additionalFiles ?? []).map((value) => ({
      name: null,
      version: null,
      executable: value.executable ?? false,
      ...value,
    })),
  ];
  const identities = new Map<
    string,
    { relativePath: string; version: string; sha256: string }
  >();
  const files: Array<{
    path: string;
    sizeBytes: number;
    sha256: string;
    executable: boolean;
  }> = [];
  try {
    for (const source of sources.sort((left, right) =>
      compareCanonicalText(left.relativePath, right.relativePath),
    )) {
      if (files.some(({ path }) => path === source.relativePath))
        throw new Error("Runtime Pack contains duplicate paths.");
      const bytes = await readFile(source.source);
      const destination = resolve(staging, source.relativePath);
      if (!contained(staging, destination))
        throw new Error("Runtime Pack source path escaped.");
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes, {
        flag: "wx",
        mode: source.executable ? 0o755 : 0o644,
      });
      await chmod(destination, source.executable ? 0o755 : 0o644);
      const checksum = sha256(bytes);
      files.push({
        path: source.relativePath,
        sizeBytes: bytes.byteLength,
        sha256: checksum,
        executable: source.executable,
      });
      if (source.name !== null && source.version !== null)
        identities.set(source.name, {
          relativePath: source.relativePath,
          version: source.version,
          sha256: checksum,
        });
    }
    const manifest = buildRuntimePackManifest({
      platform: "darwin",
      architecture: input.architecture,
      remotionPackages: [...input.remotionPackages].sort((left, right) =>
        compareCanonicalText(left.name, right.name),
      ),
      rendererBrowser: identities.get("rendererBrowser"),
      ffmpeg: identities.get("ffmpeg"),
      ffprobe: identities.get("ffprobe"),
      node: identities.get("node"),
      rspClient: identities.get("rspClient"),
      files,
    });
    await writeFile(
      join(staging, RUNTIME_PACK_MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx", mode: 0o644 },
    );
    let replaced = false;
    try {
      await rename(target, backup);
      replaced = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(staging, target);
      const verified = await verifyRuntimePack({
        runtimePackRoot: target,
        expectedArchitecture: input.architecture,
        expectedPlatform: "darwin",
      });
      if (replaced) await rm(backup, { recursive: true, force: true });
      return verified;
    } catch (error) {
      await rm(target, { recursive: true, force: true });
      if (replaced) await rename(backup, target);
      throw error;
    }
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
};

export const locateEmbeddedRuntimePack = (appResourcesRoot: string) =>
  join(resolve(appResourcesRoot), "runtime-pack");

export const probeRuntimeExecutable = ({
  executable,
  args = ["--version"],
  dynamicLibraryDirectory,
  timeoutMs = 10_000,
}: {
  readonly executable: string;
  readonly args?: readonly string[];
  readonly dynamicLibraryDirectory?: string;
  readonly timeoutMs?: number;
}) =>
  new Promise<string>((resolvePromise, reject) => {
    const child = spawn(resolve(executable), [...args], {
      env:
        dynamicLibraryDirectory === undefined
          ? {}
          : { DYLD_LIBRARY_PATH: resolve(dynamicLibraryDirectory) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > 64 * 1024) child.kill("SIGKILL");
      else chunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > 64 * 1024) child.kill("SIGKILL");
      else chunks.push(Buffer.from(chunk));
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8").trim();
      if (code !== 0 || output === "" || size > 64 * 1024) {
        const status = signal === null ? `exit ${code}` : `signal ${signal}`;
        const detail = output.split(/\r?\n/u)[0]?.slice(0, 160) || "no output";
        reject(
          new Error(
            `Runtime executable identity probe failed for ${basename(executable)} (${status}; ${detail}).`,
          ),
        );
      } else resolvePromise(output.split(/\r?\n/u)[0]!.slice(0, 160));
    });
  });

export const readDesktopCompatibilityManifest = async (
  appResourcesRoot: string,
) => {
  const resources = await inspectRealDirectory(
    appResourcesRoot,
    "App Resources root",
  );
  if (resources.resolved !== resources.canonical) {
    throw new Error("App Resources root must be canonical.");
  }
  return DesktopCompatibilityManifestSchema.parse(
    await readBoundedRegularJson({
      path: join(resources.canonical, DESKTOP_COMPATIBILITY_MANIFEST),
      label: "Desktop compatibility manifest",
      maximumBytes: MAX_COMPATIBILITY_MANIFEST_BYTES,
    }),
  );
};

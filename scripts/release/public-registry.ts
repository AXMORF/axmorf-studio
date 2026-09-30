import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { resolveNpmCliPath } from "../../packages/create-axmorf-studio/src/index.js";
import { directoryFiles, packageContent, sha256 } from "./package-content";

const Hash = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const Integrity = z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/u);
const Version = z.string().regex(/^\d+\.\d+\.\d+$/u);
const RegistryPackage = z
  .object({
    name: z.enum(["@axmorf/studio", "create-axmorf-studio"]),
    version: Version,
    tarball: z.url(),
    integrity: Integrity,
  })
  .strict();
export const PublicCreationSchema = z
  .object({
    method: z.literal("npm-create-public-registry"),
    registry: z.literal("https://registry.npmjs.org"),
    command: z.tuple([
      z.literal("npm"),
      z.literal("create"),
      z.literal("--yes"),
      z.literal("axmorf-studio@latest"),
      z.string().min(1),
      z.literal("--"),
      z.literal("--yes"),
    ]),
    packages: z
      .object({ runtime: RegistryPackage, creator: RegistryPackage })
      .strict(),
    runtimeTarballChecksum: Hash,
    creatorTarballChecksum: Hash,
    installLogChecksum: Hash,
    workspaceLockChecksum: Hash,
    creatorLockChecksum: Hash,
  })
  .strict();
export type PublicCreation = z.infer<typeof PublicCreationSchema>;
export type RegistryPackage = z.infer<typeof RegistryPackage>;
export type PublicArtifacts = {
  runtimeTarball: string;
  creatorTarball: string;
  creatorLock: string;
};

export function publicMetadata(
  value: unknown,
  name: RegistryPackage["name"],
  version: string,
): RegistryPackage {
  const raw = z
    .object({
      name: z.string(),
      version: Version,
      dist: z.object({ tarball: z.url(), integrity: Integrity }).passthrough(),
    })
    .passthrough()
    .parse(value);
  assert.equal(raw.name, name, "Public registry returned another package");
  assert.equal(
    raw.version,
    version,
    "Public latest differs from the expected release",
  );
  const shortName = name.slice(name.lastIndexOf("/") + 1);
  assert.equal(
    raw.dist.tarball,
    `https://registry.npmjs.org/${name}/-/${shortName}-${version}.tgz`,
    "Package tarball must come from the public npm registry",
  );
  return {
    name,
    version,
    tarball: raw.dist.tarball,
    integrity: raw.dist.integrity,
  };
}

export function assertPublicIntegrity(bytes: Buffer, expected: string) {
  Integrity.parse(expected);
  assert.equal(
    `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    expected,
    "Downloaded package differs from public registry dist integrity",
  );
}

export function assertPublicLock(value: unknown, metadata: RegistryPackage) {
  const lock = z
    .object({
      lockfileVersion: z.number().min(2),
      packages: z.record(z.string(), z.unknown()),
    })
    .passthrough()
    .parse(value);
  const installed = z
    .object({
      version: Version,
      resolved: z.string(),
      integrity: Integrity,
      link: z.literal(false).optional(),
    })
    .passthrough()
    .parse(lock.packages[`node_modules/${metadata.name}`]);
  assert.equal(
    installed.version,
    metadata.version,
    "Installed public package version differs",
  );
  assert.equal(
    installed.resolved,
    metadata.tarball,
    "Installed package was not resolved from the public registry",
  );
  assert.equal(
    installed.integrity,
    metadata.integrity,
    "Installed package lock integrity differs",
  );
}

export async function verifyPublicArtifacts(
  creation: PublicCreation,
  artifacts: PublicArtifacts,
  workspace: string,
) {
  for (const role of ["runtime", "creator"] as const) {
    const bytes = await readFile(artifacts[`${role}Tarball`]);
    assertPublicIntegrity(bytes, creation.packages[role].integrity);
    assert.equal(sha256(bytes), creation[`${role}TarballChecksum`]);
  }
  for (const [path, metadata, checksum] of [
    [
      join(workspace, "package-lock.json"),
      creation.packages.runtime,
      creation.workspaceLockChecksum,
    ],
    [
      artifacts.creatorLock,
      creation.packages.creator,
      creation.creatorLockChecksum,
    ],
  ] as const) {
    const bytes = await readFile(path);
    assert.equal(
      sha256(bytes),
      checksum,
      "Public installation lock changed after snapshot",
    );
    assertPublicLock(JSON.parse(bytes.toString("utf8")), metadata);
  }
}

type NpmRunner = (
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; logPath: string },
) => Promise<string>;
const realNpm: NpmRunner = async (args, { cwd, env, logPath }) => {
  const npmCli = await resolveNpmCliPath({
    npmExecPath: process.env.npm_execpath,
    execPath: process.execPath,
    platform: process.platform,
  });
  appendFileSync(
    logPath,
    `${JSON.stringify({ command: ["npm", ...args], cwd })}\n`,
  );
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 1_200_000,
  });
  if (result.stdout) appendFileSync(logPath, result.stdout);
  if (result.stderr) appendFileSync(logPath, result.stderr);
  assert.ok(
    !result.error && result.status === 0 && result.signal === null,
    "Public npm command failed; inspect the retained installation log",
  );
  return result.stdout;
};

// Only this release controller invokes npm; the Agent receives an ordinary fresh
// Workspace and one business prompt. The injectable runner is used by offline tests.
export async function installPublic(
  workspace: string,
  outputPath: string,
  expectedVersion: string,
  runNpm: NpmRunner = realNpm,
) {
  Version.parse(expectedVersion);
  const evidenceRoot = await mkdtemp(
    join(dirname(outputPath), ".public-install-"),
  );
  const cache = join(evidenceRoot, "npm-cache");
  const tarballs = join(evidenceRoot, "tarballs");
  await mkdir(tarballs);
  const userconfig = join(evidenceRoot, "user.npmrc");
  const globalconfig = join(evidenceRoot, "global.npmrc");
  await writeFile(userconfig, "", { flag: "wx" });
  await writeFile(globalconfig, "", { flag: "wx" });
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^npm_config_/iu.test(key) &&
        !["NPM_TOKEN", "NODE_AUTH_TOKEN"].includes(key),
    ),
  );
  Object.assign(env, {
    NPM_CONFIG_CACHE: cache,
    NPM_CONFIG_REGISTRY: "https://registry.npmjs.org",
    NPM_CONFIG_USERCONFIG: userconfig,
    NPM_CONFIG_GLOBALCONFIG: globalconfig,
    NPM_CONFIG_PREFER_ONLINE: "true",
  });
  const installLogPath = `${outputPath}.install.log`;
  await writeFile(installLogPath, "", { flag: "wx" });
  const run = (args: string[]) =>
    runNpm(args, { cwd: dirname(workspace), env, logPath: installLogPath });
  const metadata = async (name: RegistryPackage["name"]) =>
    publicMetadata(
      JSON.parse(
        await run([
          "view",
          `${name}@latest`,
          "name",
          "version",
          "dist",
          "--json",
        ]),
      ),
      name,
      expectedVersion,
    );
  const registry = {
    runtime: await metadata("@axmorf/studio"),
    creator: await metadata("create-axmorf-studio"),
  };
  const pack = async (entry: RegistryPackage) => {
    const result = z
      .array(z.object({ filename: z.string() }).passthrough())
      .length(1)
      .parse(
        JSON.parse(
          await run([
            "pack",
            `${entry.name}@${entry.version}`,
            "--ignore-scripts",
            "--json",
            "--pack-destination",
            tarballs,
          ]),
        ),
      );
    const filename = result[0]!.filename;
    assert.equal(basename(filename), filename, "Invalid public npm pack path");
    const path = join(tarballs, filename);
    assertPublicIntegrity(await readFile(path), entry.integrity);
    const content = await packageContent(path);
    assert.equal(content.name, entry.name);
    assert.equal(content.version, entry.version);
    return { path, content };
  };
  const runtime = await pack(registry.runtime);
  const creator = await pack(registry.creator);
  const args = [
    "create",
    "--yes",
    "axmorf-studio@latest",
    basename(workspace),
    "--",
    "--yes",
  ];
  await run(args);
  assert.deepEqual(
    await metadata("@axmorf/studio"),
    registry.runtime,
    "Public latest changed during installation",
  );
  assert.deepEqual(
    await metadata("create-axmorf-studio"),
    registry.creator,
    "Public latest changed during installation",
  );
  const npxRoots = await readdir(join(cache, "_npx"));
  assert.equal(
    npxRoots.length,
    1,
    "Fresh public npm create must resolve exactly one creator installation",
  );
  const npxRoot = join(cache, "_npx", npxRoots[0]!);
  assert.deepEqual(
    await directoryFiles(join(npxRoot, "node_modules/create-axmorf-studio")),
    creator.content.files,
    "Executed creator differs from the downloaded public package",
  );
  assert.deepEqual(
    await directoryFiles(join(workspace, "node_modules/@axmorf/studio")),
    runtime.content.files,
    "Installed runtime differs from the downloaded public package",
  );
  const artifacts = {
    runtimeTarball: runtime.path,
    creatorTarball: creator.path,
    creatorLock: join(npxRoot, "package-lock.json"),
  };
  const creation = PublicCreationSchema.parse({
    method: "npm-create-public-registry",
    registry: "https://registry.npmjs.org",
    command: ["npm", ...args],
    packages: registry,
    runtimeTarballChecksum: sha256(await readFile(runtime.path)),
    creatorTarballChecksum: sha256(await readFile(creator.path)),
    installLogChecksum: sha256(await readFile(installLogPath)),
    workspaceLockChecksum: sha256(
      await readFile(join(workspace, "package-lock.json")),
    ),
    creatorLockChecksum: sha256(await readFile(artifacts.creatorLock)),
  });
  await verifyPublicArtifacts(creation, artifacts, workspace);
  return {
    packages: { runtime: runtime.content, creator: creator.content },
    creation,
    artifacts,
    installLogPath,
  };
}
